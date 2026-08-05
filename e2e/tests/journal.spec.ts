import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE OPERATOR JOURNAL. The chat forgets — 80 messages per room when it
// persists — so RUN-JOURNAL-1 gave approvals, commits, runs and armings an
// append-only slice of their own. These specs prove the two claims the arc
// was cut for: a resolved gate leaves a row the operator can find AFTER a
// reload, and clearing is explicit, confirmed, and total.
//
// Same staging discipline as gate.spec.ts: the pending card is seeded as the
// exact persisted shape the store writes, then the REAL reducers do the rest.
// ─────────────────────────────────────────────────────────────────────────────

const PROPOSED_NAME = "journal probe";

const seedWithPendingCard = () =>
  persistedState({
    channels: {
      crashkit: {
        participants: ["critic"],
        queue: [],
        messages: [
          { id: "seed-1", from: "user", text: "we need a room for the eval runner" },
          {
            id: "seed-2",
            from: "critic",
            text: "",
            action: { tool: "create_project", input: { name: PROPOSED_NAME }, status: "pending" },
          },
        ],
      },
    },
  });

test.describe("the operator journal", () => {
  test("an approval writes a row that SURVIVES a reload — the chat window can't erase it", async ({
    context,
    page,
  }) => {
    await isolate(context, seedWithPendingCard());
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: /^Approve create_project/ }).click();
    await expect(page.getByText(/operator approved/)).toBeVisible();

    // The row exists now…
    await page.getByTestId("journal-button").click();
    const panel = page.getByTestId("journal-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("journal-row")).toHaveCount(1);
    await expect(panel.getByTestId("journal-row")).toContainText("approved");
    await expect(panel.getByTestId("journal-row")).toContainText(`create_project(${PROPOSED_NAME})`);
    await page.getByTestId("journal-close").click();

    // …and still exists after the tab dies and comes back.
    await page.reload();
    await page.getByTestId("journal-button").click();
    await expect(page.getByTestId("journal-row")).toHaveCount(1);
    await expect(page.getByTestId("journal-row")).toContainText("approved");
  });

  test("a dismissal is a row too — refusals are part of the record", async ({ context, page }) => {
    await isolate(context, seedWithPendingCard());
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: /^Dismiss create_project/ }).click();
    await expect(page.getByText("dismissed by operator")).toBeVisible();

    await page.getByTestId("journal-button").click();
    await expect(page.getByTestId("journal-row")).toHaveCount(1);
    await expect(page.getByTestId("journal-row")).toContainText("dismissed");
  });

  test("clear asks first, then deletes for real — and export is disabled once empty", async ({
    context,
    page,
  }) => {
    await isolate(context, seedWithPendingCard());
    await gotoHub(page, "/#/p/crashkit/work");
    await page.getByRole("button", { name: /^Approve create_project/ }).click();

    await page.getByTestId("journal-button").click();
    await expect(page.getByTestId("journal-row")).toHaveCount(1);

    // First click arms; the destructive wording is the confirm.
    await page.getByTestId("journal-clear").click();
    await expect(page.getByTestId("journal-row")).toHaveCount(1); // nothing deleted yet
    await page.getByTestId("journal-clear-confirm").click();
    await expect(page.getByTestId("journal-row")).toHaveCount(0);
    await expect(page.getByText(/Nothing yet/)).toBeVisible();
    await expect(page.getByTestId("journal-export")).toBeDisabled();

    // Deleted means deleted: a reload brings nothing back.
    await page.reload();
    await page.getByTestId("journal-button").click();
    await expect(page.getByTestId("journal-row")).toHaveCount(0);
  });
});
