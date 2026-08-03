import { expect, test, type Page } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { stubAnthropic } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// THE ROOM'S SWALLOWED FOLLOW-UP — the original BLOCKER, finally pinned.
//
// sendToChannel's live branch fans out to streamAgent, which used to open with
//
//     if (liveStreams.has(streamKey)) return;
//
// so a message the operator sent while an agent was still writing was appended
// to the transcript and then answered by nobody. It looked sent. It wasn't.
//
// The fix serializes per agent (takeTurn), and the DM drawer got the same fix.
// A mutation run then found the embarrassing part: the DM fix was covered by a
// test and THIS one — the path the defect was actually reported on — was not.
// Restoring the early return in streamAgent left the whole suite green.
//
// So: same shape as dm.spec.ts, aimed at a project room. Response A is held
// open at the wire, B is sent while A is provably mid-flight, and both must be
// answered in order. Put the swallow back and B's reply never exists.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT = "crashkit";
const AGENT = "Critic";
const MSG_A = "@Critic what would you check first here?";
const MSG_B = "@Critic actually — check the fail cards instead";
const REPLY_A = "The battery's happy path is covered; the tired-user path is not.";
const REPLY_B = "Fail cards it is: every one shows prompt, expected and actual.";

const roomLog = (page: Page) => page.getByRole("log");
const roomCursor = (page: Page) => roomLog(page).locator("span.breathe");
const composer = (page: Page) => page.getByPlaceholder(new RegExp(`^Message #${PROJECT}\\b`));

async function say(page: Page, text: string) {
  const input = composer(page);
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

test.describe("a project room", () => {
  test("answers a message sent mid-stream instead of swallowing it", async ({ context, page }) => {
    await isolate(context, persistedState({}), { liveBrain: true });
    const stub = await stubAnthropic(context, [{ text: REPLY_A }, { text: REPLY_B }]);

    // Seed the room with Critic present so the mention routes to exactly one
    // responder — a second responder would make the request count ambiguous.
    await gotoHub(page, `/#/p/${PROJECT}/work`);
    await expect(composer(page)).toBeVisible();

    stub.hold();
    await say(page, MSG_A);
    await expect.poll(() => stub.requests.length, { timeout: 15_000 }).toBe(1);

    // Guards the guard: if the room stops streaming here, or starts disabling
    // the composer, B would land on an idle agent and this test would pass
    // without exercising the defect at all.
    await expect(roomCursor(page)).toBeVisible();
    await expect(composer(page)).toBeEnabled();
    await expect(page.getByText(REPLY_A)).toHaveCount(0);

    await say(page, MSG_B);
    await expect(page.getByText(MSG_B)).toBeVisible();

    // Serialized, not concurrent.
    await page.waitForTimeout(300);
    expect(stub.requests, "B raced A instead of queueing behind it").toHaveLength(1);

    stub.release();

    await expect(page.getByText(REPLY_A)).toBeVisible();
    await expect(page.getByText(REPLY_B)).toBeVisible();
    await expect(roomCursor(page)).toHaveCount(0);

    // The protocol boundary: a second round trip happened, it carried B, and it
    // saw the reply it follows up on. A dropped message produces none of that.
    expect(stub.requests).toHaveLength(2);
    expect(stub.overflow).toBe(0);
    expect(JSON.stringify(stub.requests[1].messages)).toContain("check the fail cards");
    expect(JSON.stringify(stub.requests[1].messages)).toContain(REPLY_A);
  });
});
