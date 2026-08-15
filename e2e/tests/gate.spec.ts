import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState, say, sidebarProject } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE GATE. An agent may PROPOSE an irreversible act; only the operator may
// execute it. The card is the whole product claim, so it gets the most tests.
//
// A pending card is normally minted by the live tool loop (streamAgent →
// GATED_TOOLS), which needs an Anthropic key. Rather than depend on a paid,
// non-deterministic network call, each spec stages the exact persisted shape
// the store itself writes and then drives the REAL UI and the REAL store
// reducers (approveAction / dismissAction) from there.
// ─────────────────────────────────────────────────────────────────────────────

const PROPOSED_ID = "gate-probe-alpha";
const PROPOSED_NAME = "gate probe alpha";

const seedWithPendingCard = () =>
  persistedState({
    channels: {
      crashkit: {
        participants: ["critic"],
        queue: [],
        messages: [
          { id: "seed-1", from: "user", text: "we need a room for the eval runner" },
          { id: "seed-2", from: "critic", text: "(proposed an action — see the card below)" },
          {
            id: "seed-3",
            from: "critic",
            text: "",
            action: { tool: "create_project", input: { name: PROPOSED_NAME }, status: "pending" },
          },
        ],
      },
    },
  });

test.describe("the approval gate", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context, seedWithPendingCard());
  });

  test("renders a gated proposal card and creates nothing before the operator clicks", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");

    // The innermost div holding both the gate wording and the approve button:
    // one card, not four unrelated bits of text scattered down the log.
    const card = page
      .locator("div")
      .filter({ hasText: "gated · operator approval required · agents cannot self-approve" })
      .filter({ has: page.getByRole("button", { name: /^Approve create_project/ }) })
      .last();

    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/border-amber-300/); // the amber gate card
    await expect(card).toContainText("proposes");
    await expect(card).toContainText(`create_project(${PROPOSED_NAME})`);
    await expect(card).toContainText("gated · operator approval required · agents cannot self-approve");
    await expect(card.getByRole("button", { name: /^Approve create_project/ })).toContainText("approve ▸");
    await expect(card.getByRole("button", { name: /^Dismiss create_project/ })).toContainText("dismiss");

    // The invariant: proposing is not doing. Nothing exists yet, anywhere.
    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(0);
    await expect(page.locator(`[data-planet="${PROPOSED_ID}"]`)).toHaveCount(0);
    await expect(page.getByText(/operator approved/)).toHaveCount(0);
  });

  test("dismiss marks the card and still creates nothing", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: /^Dismiss create_project/ }).click();

    await expect(page.getByText("dismissed by operator")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve create_project/ })).toHaveCount(0);
    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(0);
    await expect(page.locator(`[data-planet="${PROPOSED_ID}"]`)).toHaveCount(0);
    await expect(page.getByText(/operator approved/)).toHaveCount(0);
  });

  test("approve creates the project in the sidebar and on the canvas, and Ops announces it", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");

    await expect(sidebarProject(page, PROPOSED_ID)).toHaveCount(0);
    await page.getByRole("button", { name: /^Approve create_project/ }).click();

    await expect(page.getByText("✓ approved by operator")).toBeVisible();
    await expect(page.getByText(`✓ operator approved — ${PROPOSED_ID} is on the board.`)).toBeVisible();
    await expect(sidebarProject(page, PROPOSED_ID)).toBeVisible();

    // …and on the galaxy, which is a separate code path (React Flow's
    // node list is seeded once and only appended to).
    await page.getByRole("button", { name: "constellation" }).click();
    await expect(page.locator(`[data-planet="${PROPOSED_ID}"]`)).toHaveCount(1);
  });

  test("an approved card stays approved across a reload", async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await page.getByRole("button", { name: /^Approve create_project/ }).click();
    await expect(page.getByText("✓ approved by operator")).toBeVisible();

    await page.reload();

    await expect(page.getByText("✓ approved by operator")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve create_project/ })).toHaveCount(0);
    await expect(sidebarProject(page, PROPOSED_ID)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The operator's own command path — deliberately ungated, and worth pinning.
//
// `new project: <name>` typed into the composer creates the project outright.
// That is NOT a gate bypass: the gate exists so an AGENT cannot take an
// irreversible action alone, and src/state/hub.ts::sendToChannel has exactly
// one caller — ChatRoom's composer, i.e. the operator's own hands. Typing the
// command IS the approval. An agent's route to the same action is
// create_project, which is in GATED_TOOLS and can only render a card.
//
// This test pins that boundary: the command works, and it does so WITHOUT
// borrowing the gate's furniture (no card, no approve button), so the two
// paths can never be confused for one another.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("the operator command path is direct, not gated", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test('"new project:" is the operator acting directly — creates without a card', async ({ page }) => {
    await gotoHub(page, "/#/p/crashkit/work");
    await expect(sidebarProject(page, "bypass-probe")).toHaveCount(0);

    await say(page, "crashkit", "new project: bypass probe");

    // Created outright…
    await expect(sidebarProject(page, "bypass-probe")).toBeVisible();
    // …with none of the gate's furniture anywhere on screen.
    await expect(page.getByRole("button", { name: /^Approve /})).toHaveCount(0);
    await expect(
      page.getByText("gated · operator approval required · agents cannot self-approve")
    ).toHaveCount(0);
  });
});
