import { expect, test, type Page } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { stubAnthropic } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// THE DM DRAWER'S SWALLOWED FOLLOW-UP.
//
// The channel path had it and was fixed; the drawer (click an agent in the left
// sidebar → solo conversation) carried the same defect unfixed. The composer
// stays enabled while an agent streams — deliberately, interjecting is the
// point — so an operator message sent mid-stream reached streamDm, hit a bare
//
//     if (liveStreams.has(streamKey)) return;
//
// and was DROPPED. Not rejected, not queued: the user's bubble was already in
// the transcript, so on screen it looked sent. It was simply never answered.
//
// The fix serializes instead of dropping: streamDm takes a takeTurn(streamKey)
// ticket, so a second message waits for the in-flight turn and then runs
// against the updated transcript — released in a finally so a thrown stream
// can't wedge the queue.
//
// This spec drives the real producer (sendUser → streamDm → streamReply → the
// SDK) and stubs only the wire, holding response A open so message B is
// provably sent mid-stream rather than after it. Restore the early return and
// B goes unanswered: one request instead of two, and the transcript ends on the
// operator's own words.
// ─────────────────────────────────────────────────────────────────────────────

const AGENT = "Critic";
const MSG_A = "which of these three worlds is the weakest?";
const MSG_B = "actually — answer for the eval dashboard instead";
const REPLY_A = "The oracle world is the weakest; its claim rests on one runtime.";
const REPLY_B = "The dashboard is fine — its schema check is the only real gate.";

/** Blinking caret the drawer paints on a message still being written. */
const dmCursor = (page: Page) => page.getByRole("log").locator("span.breathe");

/** Every message bubble row in the drawer transcript, in document order. */
const dmRows = (page: Page) => page.getByRole("log").locator("> div");

const dmComposer = (page: Page) => page.getByPlaceholder(new RegExp(`^Message ${AGENT}\\b`));

async function dmSay(page: Page, text: string) {
  const input = dmComposer(page);
  await input.click();
  await input.fill(text);
  await input.press("Enter");
}

test.describe("the DM drawer", () => {
  test("a message sent mid-stream is answered too, not swallowed", async ({ context, page }) => {
    await isolate(context, persistedState({}), { liveBrain: true });
    const stub = await stubAnthropic(context, [{ text: REPLY_A }, { text: REPLY_B }]);

    await gotoHub(page, "/");

    // Open the DM the way an operator does: click the agent in the sidebar.
    // The row's accessible name is glyph + name + status line, so anchor on a
    // word boundary rather than the string start.
    const agentRow = page.locator("aside").getByRole("button", { name: new RegExp(`\\b${AGENT}\\b`) });
    await expect(agentRow).toHaveCount(1);
    await agentRow.click();
    await expect(page.getByRole("dialog", { name: `Conversation with ${AGENT}` })).toBeVisible();

    // openChat seeds one canned opening line. Let it drain first, so the queue
    // timer can't land a message in the middle of the assertions below.
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    const rowsBefore = await dmRows(page).count();

    // A, held open at the wire so the in-flight window is a fact, not a race.
    stub.hold();
    await dmSay(page, MSG_A);
    await expect.poll(() => stub.requests.length).toBe(1);

    // Guards the guard: if the drawer ever stops streaming here — or starts
    // disabling the composer while it does — this test would send B into an
    // idle agent and pass without ever exercising the swallow. Fail instead.
    await expect(dmCursor(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send — an agent is writing" })).toBeVisible();
    await expect(dmComposer(page)).toBeEnabled();
    await expect(page.getByText(REPLY_A)).toHaveCount(0);

    // B, sent while A is provably still streaming.
    await dmSay(page, MSG_B);
    await expect(page.getByText(MSG_B)).toBeVisible();

    // Serialized, not concurrent: B must not have gone out while A is open.
    await page.waitForTimeout(300);
    expect(stub.requests, "B raced A instead of queueing behind it").toHaveLength(1);

    stub.release();

    // BOTH answered. A lands…
    await expect(page.getByText(REPLY_A)).toBeVisible();
    // …and then B does, as the last thing in the transcript.
    await expect(page.getByText(REPLY_B)).toBeVisible();
    await expect(dmCursor(page)).toHaveCount(0);
    await expect(dmRows(page).last()).toContainText(REPLY_B);

    // Order on screen, explicitly: open-line, A, reply A, B, reply B.
    const rows = dmRows(page);
    await expect(rows).toHaveCount(rowsBefore + 4);
    await expect(rows.nth(rowsBefore)).toContainText(MSG_A);
    await expect(rows.nth(rowsBefore + 1)).toContainText(REPLY_A);
    await expect(rows.nth(rowsBefore + 2)).toContainText(MSG_B);
    await expect(rows.nth(rowsBefore + 3)).toContainText(REPLY_B);

    // And at the protocol boundary: a SECOND round trip really happened, and it
    // carried B. A dropped message can produce neither.
    expect(stub.requests).toHaveLength(2);
    expect(stub.overflow).toBe(0);
    expect(JSON.stringify(stub.requests[1].messages)).toContain(MSG_B);
    // The follow-up ran against the UPDATED transcript, not a stale snapshot —
    // it can see the reply it is following up on.
    expect(JSON.stringify(stub.requests[1].messages)).toContain(REPLY_A);
    expect(stub.requests[1].system).toContain(`You are ${AGENT}`);
  });
});
