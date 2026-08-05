# Run export schema (v1)

A completed topology run downloads as one JSON file — the seam between this
console and any grading tool. The design constraint that shaped it: **the
export records only what the room already showed the operator.** The
transcript slice is the same one on screen; the node records and config pin
are facts about how that transcript was produced. Nothing in the file is
knowledge the operator didn't have.

Produced by `runTopology`'s `finally` in `src/state/hub.ts`; types in
`src/state/runExport.ts` (keep this document and that file in lockstep).
Downloaded from the `⇣ export last run` chip in the topology strip. In-memory
only — a reload forgets the artifact (the journal keeps the run's numbers).

```jsonc
{
  "version": 1,
  "exportedAt": "2026-08-04T23:41:02.113Z",   // when the record was assembled
  "project": "crashkit",                       // room / repo id
  "shape": { "id": "read-then-answer", "label": "read then answer" },
  "task": "is the parity claim in the README backed by a run?",

  // The run's pinned conditions. maxTokens/temperature come from the
  // gen-config pin (localStorage `agent-hub:gen-config`, defaults
  // max_tokens 1024 + provider-default temperature); routeByRole says
  // whether per-role model routing was on. Every artifact names its own
  // conditions so two runs are comparable — or visibly not.
  "config": { "maxTokens": 1024, "routeByRole": true },

  "quoted": 3,        // the launcher's floor ("N+"), one call per speaking node
  "spent": 4,         // EXACT measured model calls (counted per request at the socket)
  "startedAt": "2026-08-04T23:40:41.520Z",
  "endedAt": "2026-08-04T23:41:02.113Z",

  // One record per node turn, in execution order.
  "nodes": [
    {
      "phase": "solo",            // decompose | fanout | sequence | handoff | solo | synthesize
      "nodeId": "mgr",            // id inside the topology
      "role": "manager",
      "agentId": "strat",
      "model": "claude-sonnet-4-6", // what this node's requests were actually routed to
      "handedFrom": null           // handoff links only: the ONE message id this link was shown
    }
  ],

  // The room's transcript from the operator's task line through the closing
  // spend line — exactly what was on screen. Node-stamped messages carry
  // `node: {topology, phase, id, role}`; gate cards and free-tool trace rows
  // carry `action`; an errored turn keeps its "⚠ …" text. To grade a link,
  // join nodes[i] to the message whose `node.id` matches its nodeId.
  "messages": [
    { "id": "m1", "from": "user", "text": "…the task…" },
    { "id": "m2", "from": "strat", "text": "…", "node": { "topology": "custom", "phase": "solo", "id": "mgr", "role": "manager" } }
  ]
}
```

## Grading it

`tools/grade_export.py` is the reference consumer: ~20 lines of Python using
[gradecore](https://github.com/egnaro9/gradecore), grading every link of a run
without touching the app. Hand provenance (`handedFrom`) is what lets a
handoff run be graded per-station: link *n*'s input is the message named by
its `handedFrom`, its output is its own node-stamped message.

## Guarantees and non-guarantees

- `spent` is exact — counted per request where the calls are issued
  (TOOL-TRACE-1), never estimated from the plan.
- Message ids are stable within the file; `handedFrom` always names a message
  in `messages` (or the task line) unless the hand was an explicit
  empty-handoff note, which is itself in `messages`.
- **No determinism claim.** The API offers no seeding; repeats plus paired
  stats are the determinism story, not this file.
- The transcript can contain operator messages typed mid-run — the room is
  live, and the export does not pretend otherwise.
