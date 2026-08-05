import { describe, it, expect, beforeEach } from "vitest";
import { appendJournal, clearJournal, journalJSON, readJournal, JOURNAL_KEY } from "./journal";

// The ledger's whole claim is that it does not lie and does not lose rows
// short of the cap. These tests pin the storage contract, not the panel.

const gateRow = (n: number) =>
  ({
    kind: "gate",
    project: "crashkit",
    agent: "critic",
    tool: "create_project",
    detail: `probe-${n}`,
    outcome: "proposed",
  }) as const;

describe("the operator journal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty and appends in order", () => {
    expect(readJournal()).toEqual([]);
    appendJournal(gateRow(1));
    appendJournal(gateRow(2));
    const rows = readJournal();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.kind === "gate" ? r.detail : "?"))).toEqual(["probe-1", "probe-2"]);
  });

  it("stamps every row with a time", () => {
    appendJournal(gateRow(1));
    const [row] = readJournal();
    expect(new Date(row.at).getTime()).not.toBeNaN();
  });

  it("holds the newest 500 rows and drops from the FRONT — append-only, not append-forever", () => {
    for (let i = 0; i < 505; i++) appendJournal(gateRow(i));
    const rows = readJournal();
    expect(rows).toHaveLength(500);
    expect(rows[0].kind === "gate" && rows[0].detail).toBe("probe-5"); // 0..4 aged out
    const last = rows[rows.length - 1];
    expect(last.kind === "gate" && last.detail).toBe("probe-504");
  });

  it("every append re-reads storage first, so rows written by ANOTHER writer survive", () => {
    appendJournal(gateRow(1));
    // Another tab appends behind this module's back — straight into storage.
    const foreign = [...readJournal(), { at: new Date().toISOString(), kind: "arm", on: true }];
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(foreign));
    appendJournal(gateRow(2));
    const kinds = readJournal().map((r) => r.kind);
    expect(kinds).toEqual(["gate", "arm", "gate"]); // nothing clobbered
  });

  it("clear removes the slot entirely", () => {
    appendJournal(gateRow(1));
    clearJournal();
    expect(readJournal()).toEqual([]);
    expect(localStorage.getItem(JOURNAL_KEY)).toBeNull();
  });

  it("corrupted storage reads as empty rather than throwing", () => {
    localStorage.setItem(JOURNAL_KEY, "{not json");
    expect(readJournal()).toEqual([]);
    localStorage.setItem(JOURNAL_KEY, '"a string, not an array"');
    expect(readJournal()).toEqual([]);
  });

  it("the export is exactly the stored rows, pretty-printed", () => {
    appendJournal(gateRow(1));
    expect(JSON.parse(journalJSON())).toEqual(readJournal());
  });
});
