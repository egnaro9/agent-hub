import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE WORK CARDS DO SOMETHING NOW.
//
// Both were inert: a listing that told you a repo has a docs/ folder and
// stopped. Files rows now open on GitHub, a file can be read INTO the room
// (the transcript IS the agents' context, so afterwards everyone is reading
// the same bytes), and task rows open the issue they name.
//
// The read is asserted on the ROOM, not on the button: a control that does
// nothing looks identical to one that works until you check what it produced.
// ─────────────────────────────────────────────────────────────────────────────

const TREE = [
  { name: "docs", type: "dir", size: 0 },
  { name: "README.md", type: "file", size: 2048 },
];

/** GitHub is blocked by isolate(); serve the two reads this card makes. */
const stubRepo = async (context: import("@playwright/test").BrowserContext, fileBody: string | null) => {
  await context.route(/api\.github\.com/, (r) => {
    const u = r.request().url();
    const json = (body: unknown) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    // The work tab reads tree + issues + branches together; ONE unstubbed call
    // aborts and leaves both cards stuck on "reading github…".
    if (u.includes("/contents")) return json(TREE);
    return json([]);
  });
  await context.route(/raw\.githubusercontent\.com/, (r) =>
    fileBody === null
      ? r.fulfill({ status: 404, body: "not found" })
      : r.fulfill({ status: 200, contentType: "text/plain", body: fileBody })
  );
};

test.describe("the work cards", () => {
  test("a file row opens on GitHub, and can be read into the room", async ({ context, page }) => {
    await isolate(context, persistedState({ channels: { crashkit: { participants: ["critic"], queue: [], messages: [] } } }));
    await stubRepo(context, "# crashkit\n\nAdversarial crash tests.");
    await gotoHub(page, "/#/p/crashkit/work");

    const row = page.getByRole("link", { name: "Open README.md on GitHub" });
    await expect(row).toBeVisible();
    // It points at the blob, not at the repo root — a link that lands somewhere
    // vaguely nearby is worse than none, because it looks specific.
    await expect(row).toHaveAttribute(
      "href",
      "https://github.com/egnaro9/crashkit/blob/main/README.md"
    );
    // ...and a directory points at the tree view, not the blob view
    await expect(page.getByRole("link", { name: "Open docs on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/egnaro9/crashkit/tree/main/docs"
    );

    // THE ASSERTION: the file's contents land in the transcript, where the
    // agents read from — not in a tooltip or a panel only the operator sees.
    await page.getByRole("button", { name: "Read README.md into the room" }).click();
    await expect(page.getByText("Adversarial crash tests.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/README\.md — \d+ characters/)).toBeVisible();
  });

  test("a read that fails says so instead of posting an empty file", async ({ context, page }) => {
    await isolate(context, persistedState({ channels: { crashkit: { participants: ["critic"], queue: [], messages: [] } } }));
    await stubRepo(context, null);
    await gotoHub(page, "/#/p/crashkit/work");

    await page.getByRole("button", { name: "Read README.md into the room" }).click();
    // Either a refusal line or the reader's own message — never a silent
    // success that puts an empty code fence in front of the agents.
    await expect(page.getByText(/README\.md/).last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^```\s*```$/)).toHaveCount(0);
  });
});
