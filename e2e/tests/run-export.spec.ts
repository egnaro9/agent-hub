import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { gotoHub, isolate, persistedState } from "./helpers";
import { stubAnthropic } from "./anthropic-stub";

// ─────────────────────────────────────────────────────────────────────────────
// RUN-EXPORT-1 — a finished run is a gradable file. These specs drive real
// runs against the scripted wire, download the artifact through the real
// browser download path, and assert the three properties the arc was cut for:
// the file matches the run (task, quoted, EXACT spend, node records), hand
// provenance names real messages, and the config block records the pin that
// was actually on the wire — proven against the stub's recorded max_tokens,
// not taken from the app's word.
//
// The pipeline artifact is saved to e2e/run-artifacts/ on purpose: it is the
// input tools/grade_export.py is verified against (the schema's reference
// consumer), so the chain app → file → gradecore is exercised end to end.
// ─────────────────────────────────────────────────────────────────────────────

const ROOM = ["strat", "forge", "critic"];
const trioRoom = () =>
  persistedState({ channels: { crashkit: { participants: ROOM, queue: [], messages: [] } } });

const ARTIFACTS = "e2e/run-artifacts";

test.describe("the run export", () => {
  test("a hand-off run downloads with hand provenance and the pinned config the wire saw", async ({
    context,
    page,
  }) => {
    await isolate(context, trioRoom(), { liveBrain: true });
    // The study pin, set the way a study would set it — no UI exists on purpose.
    await context.addInitScript(() =>
      localStorage.setItem("agent-hub:gen-config", JSON.stringify({ maxTokens: 512 }))
    );
    const stub = await stubAnthropic(context, [
      { text: "LINK-1: extracted the two claims from the task." },
      { text: "LINK-2: turned them into a checkable list." },
      { text: "LINK-3: verified — one claim is unbacked." },
    ]);

    await gotoHub(page, "/#/p/crashkit/work");
    await page.getByRole("button", { name: "pipeline", exact: true }).click();
    await page.getByLabel("Topology task").fill("trace the claims");
    await page.getByRole("button", { name: "Launch topology" }).click();
    await expect(page.getByText("LINK-3: verified — one claim is unbacked.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/shape done · quoted 3\+ · spent 3 model calls/)).toBeVisible();

    // The pin was ON THE WIRE for every request — the stub recorded it.
    expect(stub.requests.length).toBe(3);
    for (const r of stub.requests) expect(r.maxTokens).toBe(512);

    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-run").click()]);
    const file = `${ARTIFACTS}/run-export-pipeline.json`;
    await download.saveAs(file);
    const run = JSON.parse(fs.readFileSync(file, "utf8"));

    expect(run.version).toBe(1);
    expect(run.project).toBe("crashkit");
    expect(run.task).toBe("trace the claims");
    expect(run.config).toEqual({ maxTokens: 512, routeByRole: true });
    expect(run.quoted).toBe(3);
    expect(run.spent).toBe(3);
    expect(new Date(run.startedAt).getTime()).toBeLessThanOrEqual(new Date(run.endedAt).getTime());

    // Three hand-off links, each handed a message that EXISTS in the file —
    // link 1 gets the task line, later links get their predecessor's artifact.
    expect(run.nodes).toHaveLength(3);
    const ids = new Set(run.messages.map((m: { id: string }) => m.id));
    const taskMsg = run.messages[0];
    expect(taskMsg.from).toBe("user");
    expect(taskMsg.text).toBe("trace the claims");
    for (const n of run.nodes) {
      expect(n.phase).toBe("handoff");
      expect(n.handedFrom).not.toBeNull();
      expect(ids.has(n.handedFrom)).toBe(true);
      const artifact = run.messages.find(
        (m: { node?: { id: string }; text: string }) => m.node?.id === n.nodeId && m.text.trim().length > 0
      );
      expect(artifact, `node ${n.nodeId} left no artifact in the export`).toBeTruthy();
    }
    expect(run.nodes[0].handedFrom).toBe(taskMsg.id);
  });

  test("a sequence run exports too, and its config block differs from the pinned run's", async ({
    context,
    page,
  }) => {
    await isolate(context, trioRoom(), { liveBrain: true });
    // No pin: the defaults — and therefore a config block that DIFFERS from
    // the 512 artifact above, which is the exit criterion's comparison.
    const stub = await stubAnthropic(context, [
      { text: "First in order." },
      { text: "Second, having read the first." },
      { text: "Third, having read both." },
    ]);

    await gotoHub(page, "/#/p/crashkit/work");
    await page.getByLabel("Topology task").fill("speak in turn");
    await page.getByRole("button", { name: "Launch topology" }).click();
    await expect(page.getByText("Third, having read both.")).toBeVisible({ timeout: 30_000 });

    for (const r of stub.requests) expect(r.maxTokens).toBe(1024);

    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-run").click()]);
    const file = `${ARTIFACTS}/run-export-sequence.json`;
    await download.saveAs(file);
    const run = JSON.parse(fs.readFileSync(file, "utf8"));

    expect(run.shape.id).toBe("loop");
    expect(run.config).toEqual({ maxTokens: 1024, routeByRole: true });
    expect(run.spent).toBe(3);
    // A sequence node reads the room's window, not a single hand.
    for (const n of run.nodes) {
      expect(n.phase).toBe("sequence");
      expect(n.handedFrom).toBeNull();
    }
  });
});
