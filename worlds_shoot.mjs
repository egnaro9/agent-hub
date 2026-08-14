import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("shots", { recursive: true });
const ids = ["model-drift","gradecore","crashkit","rag-eval-lab","eval-history","mcp-tools","harness-builder","prompt-regress","pi-gates","agentic-dev-harness","match3-engine","tapdodge-engine","agent-graph","llm-gateway","eval-dashboard","pi-eval","cast-pipeline","evals-differential-oracle","evalmut","reference-fleet","agent-certlab","vac-protocol","vac-gate"];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
for (const id of ids) {
  await p.goto(`http://localhost:5173/#/p/${id}`);
  await p.waitForTimeout(900);
  // park the pointer off-centre so the deepened tilt/parallax is engaged in the still
  await p.mouse.move(1100, 250);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `shots/deep-${id}.png` });
}
await b.close();
console.log("shot", ids.length);
