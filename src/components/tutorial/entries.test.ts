import { describe, it, expect } from "vitest";
import { SECTIONS } from "./entries";
import { BUDGET_CHOICES, MAX_STAGES, MAX_AGENTS_PER_STAGE } from "../../agents/topology";

// This file's own header promises every line was checked against the code it
// names — and this repo has been bitten by claim rot before. These tie the
// NUMBERS in the copy to the constants they describe, so changing a cap or a
// budget choice fails here instead of quietly turning the manual into fiction.

const all = SECTIONS.flatMap((s) => s.entries);
const prose = all.map((e) => `${e.title} ${e.what} ${e.how} ${e.gotcha ?? ""}`).join(" ");

describe("the manual describes the app it ships with", () => {
  it("lists exactly the ceiling choices the selector offers", () => {
    const ceiling = all.find((e) => e.title.includes("ceiling"));
    expect(ceiling, "the ceiling has an entry").toBeTruthy();
    for (const n of BUDGET_CHOICES.filter((n) => n > 0)) {
      expect(ceiling!.how).toContain(String(n));
    }
    expect(ceiling!.how).toContain("none"); // the 0 choice, in words
  });

  it("quotes the real composer caps", () => {
    expect(prose).toContain(`${MAX_STAGES} steps`);
    expect(prose).toContain(`${MAX_AGENTS_PER_STAGE} agents each`);
  });

  it("still says the price is a floor, since the ceiling is what bounds it", () => {
    expect(prose).toMatch(/FLOOR|floor, not a limit/);
  });
});
