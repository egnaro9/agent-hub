import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { stubAnthropic } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// THE CEILING HAS TO STOP THINGS.
//
// The price chip quotes a FLOOR ("5+"): a node that calls a tool answers the
// result in another request, so a shape can outrun its own quote. Nothing
// bounded that — one click could issue as many requests as the shape's caps
// allowed (eight stages of six agents), against the operator's own key.
//
// A displayed limit is not a limit. Both tests assert on the WIRE, because
// counting requests is the only evidence that separates "the ceiling stopped
// it" from "the UI mentions a ceiling".
// ─────────────────────────────────────────────────────────────────────────────

const ROOM = ["strat", "forge", "critic", "oracle"];
const TASK = "cut the release: what has to be true before we tag it?";
const MERGED = "Merged: land the files, cut the claim.";

const quadRoom = (extra: Record<string, unknown> = {}) =>
  persistedState({
    channels: { crashkit: { participants: ROOM, queue: [], messages: [] } },
    ...extra,
  });

// Enough script for the whole fan-out (decompose + 3 workers + synthesize), so
// running out of script is never what ends a run.
const SCRIPT = [
  { text: "Splitting it three ways." },
  { text: "ALPHA: the diff is two files." },
  { text: "BETA: the parity claim is unbacked." },
  { text: "GAMMA: the noise floor is three points." },
  { text: MERGED },
];

test.describe("the model-call ceiling", () => {
  test("leaves a run that fits inside it completely alone", async ({ context, page }) => {
    await isolate(context, quadRoom({ callBudget: 40 }), { liveBrain: true });
    const stub = await stubAnthropic(context, SCRIPT);
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: "fan-out" }).click();
    await expect(page.getByText("5+ model calls")).toBeVisible();
    await page.getByLabel("Topology task").fill(TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    await expect(page.getByText(MERGED)).toBeVisible({ timeout: 15_000 });
    expect(stub.requests).toHaveLength(5);
    await expect(page.getByText(/Stopped at the .* ceiling/)).toHaveCount(0);
  });

  test("a ceiling the shape cannot fit inside ends it — fewer requests reach the wire", async ({
    context,
    page,
  }) => {
    await isolate(context, quadRoom({ callBudget: 2 }), { liveBrain: true });
    const stub = await stubAnthropic(context, SCRIPT);
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: "fan-out" }).click();
    // the shape still quotes its full floor — the ceiling bounds it, it does
    // not rewrite what the shape costs
    await expect(page.getByText("5+ model calls")).toBeVisible();
    await page.getByLabel("Topology task").fill(TASK);
    await page.getByRole("button", { name: "Launch topology" }).click();

    // It says what happened, in the room, naming the ceiling — a run that just
    // stopped would be indistinguishable from one that broke.
    await expect(page.getByText(/Stopped at the 2-call ceiling/)).toBeVisible({ timeout: 15_000 });

    // THE EVIDENCE: the shape quotes five and the wire carries fewer. A ceiling
    // that only printed a warning would show five here.
    expect(stub.requests.length).toBeLessThan(5);
    // ...and the fan-out never landed, because it was never sent
    await expect(page.getByText(MERGED)).toHaveCount(0);

    // A stopped run still reports its cost, and the runner is free again.
    await expect(page.getByText(/model call/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch topology" })).toBeEnabled();
  });

  test("the ceiling is the operator's, and it persists", async ({ context, page }) => {
    await isolate(context, quadRoom(), { liveBrain: true });
    await gotoHub(page, "/#/p/crashkit/work");

    const ceiling = page.getByLabel("Model-call ceiling");
    await expect(ceiling).toHaveValue("40"); // a default, not an absence
    await ceiling.selectOption("10");
    await page.reload();
    await expect(page.getByLabel("Model-call ceiling")).toHaveValue("10");

    // "none" is a real choice — an operator who means it can turn it off
    await page.getByLabel("Model-call ceiling").selectOption("0");
    await page.reload();
    await expect(page.getByLabel("Model-call ceiling")).toHaveValue("0");
  });
});
