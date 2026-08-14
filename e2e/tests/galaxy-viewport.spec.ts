import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isolate } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// THE GALAXY UNDER OTHER DISPLAYS — and under NO display at all.
//
// Field report: on Chrome at devicePixelRatio 2 with the page zoomed to 67%,
// "the galaxy renders collapsed — every planet/label projects to essentially
// one screen point". The measured signature (labels bunched at the host's
// top-left, style.left never set, none of the loop's data attributes present)
// is the fingerprint of a tab whose rAF loop NEVER RAN: a hub that loads in a
// background tab parks the frame loop, and until the fix nothing else ever
// positioned the labels. DPR and zoom were bystanders.
//
// So this file pins both walls:
//   1. the display matrix (dpr × page zoom) keeps a spread galaxy — browser
//      zoom folds into deviceScaleFactor, which is exactly how Chrome
//      implements page zoom (dpr' = dpr · zoom, css viewport grows to match);
//   2. a galaxy that mounts while document.hidden — the real reproduction —
//      still lays out every label, because the mount now paints once
//      unconditionally instead of waiting for a frame that may never come.
// ─────────────────────────────────────────────────────────────────────────────

// The reported viewport: 769×875 css px (a ~515pt window at 67% zoom).
const VIEW = { width: 769, height: 875 };
// A collapsed galaxy measures 0×0; a healthy one at this viewport ~449×309.
const MIN_SPREAD = { x: 240, y: 160 };

interface LabelField {
  n: number;
  unstyled: number;
  spreadX: number;
  spreadY: number;
}

/** Label-centre bounding box + how many labels never received a position. */
async function labelField(page: Page): Promise<LabelField> {
  return page.evaluate(() => {
    const labs = [...document.querySelectorAll<HTMLElement>(".gal-lab")];
    const xs: number[] = [], ys: number[] = [];
    let unstyled = 0;
    labs.forEach((el) => {
      if (!el.style.left || !el.style.top) unstyled++;
      const r = el.getBoundingClientRect();
      xs.push(r.x + r.width / 2);
      ys.push(r.y + r.height / 2);
    });
    return {
      n: labs.length,
      unstyled,
      spreadX: labs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      spreadY: labs.length ? Math.max(...ys) - Math.min(...ys) : 0,
    };
  });
}

async function openGalaxy(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/");
  await expect(page.locator(".gal-lab")).toHaveCount(23, { timeout: 20_000 });
  return page;
}

const expectSpread = (f: LabelField) => {
  expect(f.n).toBe(23);
  expect(f.unstyled).toBe(0);
  expect(f.spreadX).toBeGreaterThan(MIN_SPREAD.x);
  expect(f.spreadY).toBeGreaterThan(MIN_SPREAD.y);
};

// ---- the display matrix -----------------------------------------------------

for (const dpr of [1, 2]) {
  for (const zoom of [1, 0.67]) {
    test(`labels spread at dpr ${dpr}, page zoom ${Math.round(zoom * 100)}%`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: VIEW,
        deviceScaleFactor: dpr * zoom,
      });
      await isolate(ctx);
      const page = await openGalaxy(ctx);
      // settled = the fit landed; the camera publishes it for itself
      await expect(page.getByTestId("galaxy")).toHaveAttribute("data-zoom-settled", "true", { timeout: 15_000 });
      expectSpread(await labelField(page));
      await ctx.close();
    });
  }
}

// ---- the real reproduction: mounted in a hidden tab -------------------------

test("a galaxy that mounts in a background tab still lays out its labels", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  await isolate(ctx);
  // What a background tab looks like to the page, stubbed before the app
  // boots: document.hidden true, so the frame loop parks from birth and the
  // ONLY thing that can position a label is the mount-time paint.
  await ctx.addInitScript(() => {
    Object.defineProperty(Document.prototype, "hidden", { get: () => true, configurable: true });
    Object.defineProperty(Document.prototype, "visibilityState", { get: () => "hidden", configurable: true });
  });
  const page = await openGalaxy(ctx);
  // No settle attribute to wait for — the loop is parked, which is the point.
  // The mount paint is synchronous with label creation, so the field is
  // already final; poll only to absorb React's second StrictMode mount.
  await expect.poll(async () => (await labelField(page)).unstyled, { timeout: 5_000 }).toBe(0);
  expectSpread(await labelField(page));
  await ctx.close();
});
