import { expect, test, type Page } from "@playwright/test";
import { composer, gotoHub, isolate, sidebarProject } from "./helpers";

// THE PHONE REGRESSION NET. Below sm (<640px) the hub swaps layout mechanisms:
// the static rail becomes a slide-in drawer behind a hamburger, and the
// command strip's chip cluster collapses into one ⋯ menu. Both swaps are JS
// (useMediaQuery), not CSS hiding — two mounted Sidebars would mean two
// #hub-search ids — so the failure mode this file guards is structural: the
// wrong component tree for the viewport, or the phone tree leaking into
// desktop. Assertions are therefore about EXISTENCE (drawer unmounted, not
// display:none) wherever the implementation promises unmounting.
//
// iPhone 13 (390x844) is the measured device the collaborator will actually
// hold; 360x800 is the narrow-Android floor. Desktop 1280x800 pins the other
// side of the breakpoint: the drawer world must not exist there at all.

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 360, height: 800 };
const DESKTOP = { width: 1280, height: 800 };

const hamburger = (page: Page) => page.getByRole("button", { name: "Open navigation" });
const moreButton = (page: Page) => page.getByRole("button", { name: "More controls" });
// The Sidebar is the only <aside> in the app. On phone it exists ONLY while
// the drawer is open — App unmounts it entirely when closed — so element
// count doubles as the open/closed assertion.
const drawerAside = (page: Page) => page.locator("aside");
// The scrim is a real element (not a backdrop-filter), full-viewport, under
// the drawer. aria-hidden + inset-0 distinguishes it from the drawer itself
// (inset-y-0) and from any panel.
const scrim = (page: Page) => page.locator("div[aria-hidden].fixed.inset-0");
// The ⋯ menu popover. Scoped by its own classes because the desktop chips it
// replaces ("⚙ roster" etc.) are still in the DOM below sm (max-sm:hidden),
// so a bare role+name query would match two nodes and flake on strictness.
const moreMenu = (page: Page) => page.locator("div.panel-solid.w-60");

/**
 * gotoHub() asserts the <aside> rail is visible — on phone the rail is a
 * closed drawer, so that helper would hang. The phone equivalent waits on the
 * one piece of chrome every viewport shares: the constellation breadcrumb.
 */
async function gotoPhone(page: Page, hash = "/") {
  await page.goto(hash);
  await expect(page.getByRole("button", { name: "constellation" })).toBeVisible({ timeout: 20_000 });
}

/**
 * Horizontal page overflow, measured the way the browser scrolls: document
 * and body scrollWidth against the viewport. > 0 means the page itself can
 * pan sideways — the exact bug class the phone layout must never reintroduce
 * (inner scrollers like TopologyBar are allowed; the PAGE is not).
 */
function pageOverflowX(page: Page) {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
}

/** The three screens the collaborator will actually see, overflow-checked at one width. */
async function assertNoOverflowLadder(page: Page) {
  // constellation
  await gotoPhone(page);
  expect(await pageOverflowX(page)).toEqual({ doc: 0, body: 0 });

  // project world (pi-gates — the world screenshotted in the build pass)
  await gotoPhone(page, "/#/p/pi-gates");
  await expect(page.getByRole("button", { name: "overview" })).toBeVisible();
  expect(await pageOverflowX(page)).toEqual({ doc: 0, body: 0 });

  // work tab — the composer names the room, so it doubles as the mode assertion
  await gotoPhone(page, "/#/p/pi-gates/work");
  await expect(composer(page, "pi-gates")).toBeVisible();
  expect(await pageOverflowX(page)).toEqual({ doc: 0, body: 0 });
}

test.describe("phone (390x844)", () => {
  test.use({ viewport: PHONE });

  test("sidebar is a drawer: hidden by default, hamburger opens it, project tap navigates AND closes it", async ({
    page,
    context,
  }) => {
    await isolate(context);
    await gotoPhone(page);

    // Closed drawer = no <aside> at all. An aside that is merely invisible
    // would mean the JS swap regressed to CSS hiding (duplicate #hub-search).
    await expect(drawerAside(page)).toHaveCount(0);

    await expect(hamburger(page)).toBeVisible();
    await hamburger(page).click();
    await expect(drawerAside(page)).toBeVisible();

    // Picking a destination must do BOTH things: open the stage and dismiss
    // the drawer. A drawer left floating over the new stage is the bug.
    // exact: role-name matching is substring, and the tutorial button's
    // accessible name ("How this hub works") also contains "work".
    await sidebarProject(page, "pi-gates").click();
    await expect(page.getByRole("button", { name: "work", exact: true })).toBeVisible(); // mode tabs = project stage is up
    await expect(drawerAside(page)).toHaveCount(0);
  });

  test("tapping the scrim closes the drawer", async ({ page, context }) => {
    await isolate(context);
    await gotoPhone(page);

    await hamburger(page).click();
    await expect(drawerAside(page)).toBeVisible();
    await expect(scrim(page)).toBeVisible();

    // The drawer (252px) covers the scrim's left edge, so aim the tap well
    // clear of it — element-relative, like a thumb on the exposed canvas.
    await scrim(page).click({ position: { x: 350, y: 420 } });
    await expect(drawerAside(page)).toHaveCount(0);
    await expect(scrim(page)).toHaveCount(0);
  });

  test("⋯ menu opens with summon/roster/keys/brain entries and Escape closes it", async ({
    page,
    context,
  }) => {
    await isolate(context);
    await gotoPhone(page);

    await expect(moreButton(page)).toBeVisible();
    await moreButton(page).click();
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");

    // Every collapsed chip must resurface as a row. Summon renders disabled
    // on the constellation (no project selected) — present is the contract.
    const menu = moreMenu(page);
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "+ summon agent" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "⚙ roster" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "◇ keys" })).toBeVisible();
    await expect(menu.getByRole("button", { name: /◈ brain:/ })).toBeVisible();

    // Same popover discipline as the desktop chips: Escape dismisses.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("no horizontal page overflow on constellation / world / work", async ({ page, context }) => {
    await isolate(context);
    await assertNoOverflowLadder(page);
  });

  test("work view: tasks card header renders whole, not clipped mid-word", async ({
    page,
    context,
  }) => {
    await isolate(context);
    await gotoPhone(page, "/#/p/pi-gates/work");
    await expect(composer(page, "pi-gates")).toBeVisible();

    // The header is `label · source` in one div. With api.github.com aborted
    // (see isolate) the card settles on a complete phrase — assert the FULL
    // vocabulary so the test pins layout, not the network stub, and exclude
    // the transient "reading github…" state by waiting it out.
    const header = page
      .locator("div.uppercase")
      .filter({ hasText: /^tasks · / });
    await expect(header).toHaveText(
      /^tasks · (unavailable|no repo|rate limit|nothing to show|open issues · github|recent commits · github)$/
    );

    // textContent survives a CSS clip, so the truncation check must be
    // geometric: text wider than its box means overflow:hidden was eating
    // the tail mid-word. ±1 tolerates integer rounding of scrollWidth.
    const clipped = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(clipped).toBeLessThanOrEqual(1);

    // And the card itself must sit inside the viewport — a header that fits
    // a card hanging off-screen would still read as truncated on the phone.
    const box = await header.boundingBox();
    if (!box) throw new Error("tasks header has no box");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  });
});

test.describe("narrow phone (360x800)", () => {
  test.use({ viewport: NARROW });

  test("no horizontal page overflow on constellation / world / work", async ({ page, context }) => {
    await isolate(context);
    await assertNoOverflowLadder(page);
  });
});

test.describe("desktop (1280x800)", () => {
  test.use({ viewport: DESKTOP });

  test("phone chrome does not exist; the static rail is untouched", async ({ page, context }) => {
    await isolate(context);
    await gotoHub(page); // asserts the <aside> rail is visible — the desktop invariant itself

    // The hamburger, drawer and scrim are conditional on isPhone, so on
    // desktop they must be ABSENT from the DOM, not hidden.
    await expect(hamburger(page)).toHaveCount(0);
    await expect(scrim(page)).toHaveCount(0);

    // The ⋯ wrapper is CSS-parked (sm:hidden) rather than unmounted — its
    // refs anchor the shared popovers — so here the assertion is invisibility.
    await expect(moreButton(page)).toBeHidden();

    // And the chips the menu replaces are back on the strip as chips.
    await expect(page.getByRole("button", { name: "+ summon agent" })).toBeVisible();
    await expect(page.getByRole("button", { name: "⚙ roster" })).toBeVisible();
    await expect(page.getByRole("button", { name: "◇ keys" })).toBeVisible();
  });
});
