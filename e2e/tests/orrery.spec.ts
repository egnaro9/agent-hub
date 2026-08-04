import { expect, test, type Page } from "@playwright/test";
import { gotoHub, isolate, settleFlow } from "./helpers";

// THE HIT-TEST GATE for the 2.5D orrery. React Flow computes its pan/zoom in
// untransformed screen space, so a perspective-tilted stage is exactly where
// clicks could start landing beside their targets. These tests click cards at
// their VISUAL positions (page.mouse at the projected bounding box — no
// element-magic click()) at BOTH yaw extremes and demand the real effect: the
// stage opens, the panel opens. If this file goes red, the fix is to lower
// YAW_MAX_DEG in orrery.ts, not to soften the assertions.

const stage = (page: Page) => page.locator("[data-orrery-stage]");
const yawOf = (page: Page) =>
  stage(page).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--hub-yaw").trim());
const strip = (page: Page) => page.getByRole("slider", { name: "Spin the field" });

/** Drag the HUD spin strip horizontally — the one input that drives yaw. */
async function dragStrip(page: Page, dx: number) {
  const box = await strip(page).boundingBox();
  if (!box) throw new Error("spin strip has no box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy, { steps: 6 });
  await page.mouse.up();
}

/** Click at the projected centre of an element — its visual position on glass. */
async function clickVisual(page: Page, selector: ReturnType<Page["locator"]>) {
  const box = await selector.boundingBox();
  if (!box) throw new Error("target has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * The alignment sweep: for every node whose projected centre is on visible
 * canvas (inside the stage window, clear of the sidebar and the top bar),
 * elementFromPoint at that centre must resolve INTO that node. Returns the
 * ids that don't — the empty array is the pass.
 */
function misalignedNodes(page: Page) {
  return page.evaluate(() => {
    const win = document.querySelector("[data-orrery-stage]")?.parentElement;
    if (!win) return ["no stage window"];
    const w = win.getBoundingClientRect();
    const bad: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(".react-flow__node")) {
      const r = node.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      // A centre off the visible window is CLIPPED, not misaligned — the same
      // thing a plain pan does to an edge card — so it is out of scope here.
      if (cx < w.left + 4 || cx > w.right - 4 || cy < w.top + 4 || cy > w.bottom - 4) continue;
      const hit = document.elementFromPoint(cx, cy);
      // Occlusion by the app's own chrome (HUD cluster, minimap radar) is a
      // stacking fact, not a projection error — flat mode has it too.
      if (hit && (hit.closest("[data-hub-overlay]") || hit.closest(".react-flow__minimap"))) continue;
      if (!hit || !node.contains(hit)) bad.push(node.getAttribute("data-id") ?? "?");
    }
    return bad;
  });
}

/**
 * The clipping check the alignment sweep deliberately leaves out (a clipped
 * centre is skipped there as "a pan does that too"): every card's bounding
 * box fully on visible glass. Only meaningful right after a FIT — that is
 * the one moment the app promises the whole constellation is in the window.
 * Returns the offenders with their corners; the empty array is the pass.
 */
function offGlassNodes(page: Page) {
  return page.evaluate(() => {
    const win = document.querySelector("[data-orrery-stage]")?.parentElement;
    if (!win) return ["no stage window"];
    const w = win.getBoundingClientRect();
    const bad: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(".react-flow__node")) {
      const r = node.getBoundingClientRect();
      // 1px of slack for sub-pixel raster rounding, nothing more.
      if (r.left < w.left - 1 || r.right > w.right + 1 || r.top < w.top - 1 || r.bottom > w.bottom + 1)
        bad.push(`${node.getAttribute("data-id")}@${Math.round(r.left)},${Math.round(r.top)}`);
    }
    return bad;
  });
}

/**
 * Wait for BOTH the nodes and the camera to stop moving. settleFlow alone is
 * wrong after an arrange: the 650ms tween moves nodes without touching the
 * viewport transform, so the transform reads "stable" mid-tween — and the
 * fitView that ends the arrange hasn't even started yet. Samples 400ms apart
 * so two equal reads mean genuinely still, not one slow frame.
 */
async function settleArrange(page: Page) {
  let prev = "";
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() =>
          JSON.stringify([
            (document.querySelector(".react-flow__viewport") as HTMLElement | null)?.style.transform,
            ...[...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((n) => n.style.transform),
          ])
        );
        const stable = now.length > 0 && now === prev;
        prev = now;
        return stable;
      },
      { timeout: 10_000, intervals: [400, 400, 400, 400] }
    )
    .toBe(true);
}

test.describe("orrery", () => {
  test.beforeEach(async ({ context }) => {
    await isolate(context);
  });

  test("clicks land true at max yaw: a project opens, an agent's buttons work", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await expect(stage(page)).toHaveAttribute("data-orrery-stage", "3d");

    // The minimap radar is chrome and must sit ON the glass in 3d mode. Pinned
    // inside the tilted stage it inherited the stage's 12% under-hang and sank
    // below the fold (caught by screenshot, regressed silently otherwise).
    const radar = await page.locator(".react-flow__minimap").boundingBox();
    if (!radar) throw new Error("minimap missing");
    const vp = page.viewportSize()!;
    expect(radar.y).toBeGreaterThan(0);
    expect(radar.y + radar.height).toBeLessThanOrEqual(vp.height);
    expect(radar.x).toBeGreaterThan(0);

    // Push the dial past the cap — it must clamp, and the clamp is max yaw.
    await dragStrip(page, 400);
    await expect.poll(() => yawOf(page)).toBe("16deg");

    // Every node on the board: its projected centre must hit-test back into
    // its own DOM subtree. This is the desync detector — if React Flow's
    // rendering and the browser's hit-testing ever disagree under the
    // transform, some node fails this sweep long before a human notices.
    expect(await misalignedNodes(page)).toEqual([]);

    // A project card in the FAR field (top of the tilt, where the projection
    // displaces the most), clicked at its projected position.
    await clickVisual(page, page.getByRole("button", { name: "Open model-drift" }));
    await expect(page).toHaveURL(/#\/p\/model-drift/);

    // Back to the constellation, swing the field the other way.
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/#\/p\//);
    await settleFlow(page);
    await dragStrip(page, -800);
    await expect.poll(() => yawOf(page)).toBe("-16deg");
    expect(await misalignedNodes(page)).toEqual([]);

    // An agent's small buttons — the tightest targets on the board.
    const strat = page.locator(".react-flow__node", { hasText: "Strat" });
    await clickVisual(page, strat.getByRole("button", { name: "chat" }));
    await expect(page.getByRole("dialog", { name: /Conversation with Strat/ }).or(page.getByLabel(/Conversation with Strat/))).toBeVisible();
    await page.keyboard.press("Escape");

    await clickVisual(page, strat.getByTitle("Add to roundtable"));
    await expect(page.getByText("roundtable")).toBeVisible();
  });

  test("a drag at max yaw lands under the hand, and the sway returns after drop", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await dragStrip(page, 400);
    await expect.poll(() => yawOf(page)).toBe("16deg");

    // React Flow's drag math lives in untransformed screen space, so under a
    // 16° yaw a 200px drag lands ~50px off CROSS-track (sin 16° · 200, plus
    // the pullback shortening — see YAW_MAX_DEG in orrery.ts). The shipped
    // answer is that drags run on a FLAT field: yaw eases to 0 on grab and
    // glides back on release. This test holds the app to the EFFECT, not the
    // mechanism: the card's travel must match the hand's travel, and the
    // sway must come back afterwards.
    const card = page.locator('.react-flow__node[data-id="model-drift"]');
    const grabBox = await card.boundingBox();
    if (!grabBox) throw new Error("model-drift card has no box");
    const gx = grabBox.x + grabBox.width / 2;
    const gy = grabBox.y + grabBox.height / 2;

    // Carry it 200px toward the middle of the window, wherever the card
    // starts — a fixed direction could shove it into the HUD cluster or off
    // the glass, and then the miss would be clipping, not skew.
    const win = await stage(page).evaluate((el) => {
      const r = el.parentElement!.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    const len = Math.hypot(win.cx - gx, win.cy - gy) || 1;
    const dx = Math.round(((win.cx - gx) / len) * 200);
    const dy = Math.round(((win.cy - gy) / len) * 200);

    await page.mouse.move(gx, gy);
    await page.mouse.down();
    // Arm the drag (it starts on movement), then give the field its ~120ms
    // beat to steady under the hand BEFORE taking the reference point — the
    // steadying itself shifts the card on glass, and that shift is the
    // feature, not drag error.
    await page.mouse.move(gx + 4, gy + 4, { steps: 2 });
    await page.waitForTimeout(250);
    const from = await card.boundingBox();
    if (!from) throw new Error("card vanished at drag start");

    await page.mouse.move(gx + 4 + dx, gy + 4 + dy, { steps: 12 });
    await page.waitForTimeout(120);
    const to = await card.boundingBox();
    if (!to) throw new Error("card vanished mid-drag");

    // Within a few px on BOTH axes. Not zero: the 10° tilt and its 1400px
    // perspective stay up during a drag — only the yaw flattens — so a card
    // off the neutral depth tracks the hand at its depth's magnification
    // (measured ~9px over this 200px path at 1400×900). The pre-fix yaw
    // skew is a different animal: ~50px sideways plus a ~12% shortening.
    expect(Math.abs(to.x - from.x - dx)).toBeLessThanOrEqual(14);
    expect(Math.abs(to.y - from.y - dy)).toBeLessThanOrEqual(14);

    await page.mouse.up();
    // The flatten is a loan, not a reset: the pre-drag pose comes back.
    await expect.poll(() => yawOf(page)).toBe("16deg");
  });

  test("arrange in 3d lands every card on glass", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await dragStrip(page, 400);
    await expect.poll(() => yawOf(page)).toBe("16deg");

    // The fit that ends an arrange must aim at the visible WINDOW, not the
    // oversized stage React Flow actually fills — fitting the stage is what
    // hung the agent column 66px off-glass (see stageFitPadding, orrery.ts).
    await page.getByRole("button", { name: "Arrange: agents center, projects fanned" }).click();
    await settleArrange(page);
    expect(await offGlassNodes(page)).toEqual([]);

    // And again at rest: the ±16° pullback shrinks the whole field by 12%,
    // which can HIDE an over-fit that the resting pose exposes.
    await strip(page).dblclick();
    await expect.poll(() => yawOf(page)).toBe("0deg");
    expect(await offGlassNodes(page)).toEqual([]);
  });

  test("minutes lost to a hidden tab move the field one frame, not to the cap", async ({ page }) => {
    // Faked timers, so the test can do exactly what a backgrounded tab does:
    // stop rAF, let the clock run on, then hand the drift loop ONE frame
    // carrying the whole absence in its dt. fastForward fires each pending
    // callback at most once — the browser's own tab-return behaviour.
    await page.clock.install();
    await gotoHub(page);
    await settleFlow(page);

    // Same eligibility recipe as the drift spec: pointer parked off-field.
    await page.mouse.move(20, 450);
    await expect.poll(() => yawOf(page), { timeout: 15_000 }).not.toBe("0deg");
    const before = parseFloat(await yawOf(page));

    // Ten minutes of absence — 50° of drift if the loop billed unwitnessed
    // time, which would slam the field to the 16° cap on the first frame back.
    await page.clock.fastForward("10:00");
    await page.waitForTimeout(300); // a couple of real frames back on-screen
    const after = parseFloat(await yawOf(page));

    // One vouched-for frame is ≤100ms ⇒ ≤(5°/min)·100ms ≈ 0.01°; the resumed
    // ambient drift adds a hair more while we read. The cap is 16° away.
    expect(Math.abs(after - before)).toBeLessThan(1);
    expect(Math.abs(after)).toBeLessThan(2);
  });

  test("flat toggle drops the whole effect and restores it", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await expect(stage(page)).toHaveAttribute("data-orrery-stage", "3d");

    await page.getByRole("button", { name: "Flatten to the classic view" }).click();
    await expect(stage(page)).toHaveAttribute("data-orrery-stage", "flat");
    // Today's exact rendering: no transform at all, not a zeroed one.
    expect(await stage(page).evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    // Cards drop their counter-rotation wrapper transform too.
    expect(
      await page
        .locator(".react-flow__node", { hasText: "Strat" })
        .evaluate((el) => getComputedStyle(el.firstElementChild as Element).transform)
    ).toBe("none");
    // The spin dial sleeps while flat.
    await expect(strip(page)).toHaveAttribute("aria-disabled", "true");

    // And the choice survives a reload.
    await page.reload();
    await settleFlow(page);
    await expect(stage(page)).toHaveAttribute("data-orrery-stage", "flat");

    await page.getByRole("button", { name: "Raise the 3D orrery" }).click();
    await expect(stage(page)).toHaveAttribute("data-orrery-stage", "3d");
    expect(await stage(page).evaluate((el) => getComputedStyle(el).transform)).not.toBe("none");
  });

  test("lock freezes the spin: the strip goes dead and yaw holds", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    await dragStrip(page, 100);
    const held = await yawOf(page);
    expect(held).not.toBe("0deg");

    await page.getByRole("button", { name: /lock the view/i }).click();
    await expect(strip(page)).toHaveAttribute("aria-disabled", "true");
    await dragStrip(page, 200);
    expect(await yawOf(page)).toBe(held);

    await page.getByRole("button", { name: /unlock the view/i }).click();
    await expect(strip(page)).toHaveAttribute("aria-disabled", "false");
  });

  test("idle drift moves the field and hovering pauses it", async ({ page }) => {
    await gotoHub(page);
    await settleFlow(page);
    expect(await yawOf(page)).toBe("0deg");

    // Park the pointer off the canvas (over the sidebar) and go idle.
    await page.mouse.move(20, 450);
    await expect.poll(() => yawOf(page), { timeout: 15_000 }).not.toBe("0deg");

    // Hovering the field pauses the drift on the spot.
    await page.mouse.move(700, 450);
    await page.waitForTimeout(300);
    const paused = await yawOf(page);
    await page.waitForTimeout(600);
    expect(await yawOf(page)).toBe(paused);
  });
});

test.describe("orrery · reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no idle drift, but the hand-driven dial still works", async ({ page, context }) => {
    await isolate(context);
    await gotoHub(page);
    await settleFlow(page);

    await page.mouse.move(20, 450);
    await page.waitForTimeout(5500); // past DRIFT_IDLE_MS + a full second of would-be drift
    expect(await yawOf(page)).toBe("0deg");

    // Direct manipulation is not an animation — the strip stays live.
    await dragStrip(page, 100);
    expect(await yawOf(page)).not.toBe("0deg");
  });
});
