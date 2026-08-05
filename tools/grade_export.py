#!/usr/bin/env python3
"""Grade every link of a hub run export with gradecore — no app required.

Usage:  python3 tools/grade_export.py run-<shape>-<stamp>.json
The reference consumer for docs/RUN_EXPORT_SCHEMA.md: joins each node record
to its node-stamped message and applies a real-artifact predicate (non-empty,
not an error line, not a bare restatement of the task).
"""
import json, sys

from gradecore.graders import bool_grader
from gradecore.verdict import GradeInput

run = json.load(open(sys.argv[1]))
by_node = {m["node"]["id"]: m for m in run["messages"] if m.get("node") and m["text"].strip()}
task = run["task"].strip().lower()

real_artifact = bool_grader(
    lambda t: bool(t.strip()) and not t.strip().startswith("⚠") and t.strip().lower() != task,
    "hub.link.real_artifact",
    fail_severity="high",
)

failures = 0
for n in run["nodes"]:
    msg = by_node.get(n["nodeId"])
    v = real_artifact(GradeInput(text=msg["text"] if msg else ""))
    failures += 0 if v.passed else 1
    print(f"{'PASS' if v.passed else 'FAIL'}  {n['phase']:>10} {n['nodeId']:>4} ({n['agentId']}, {n['model']})"
          + (f"  handed:{n['handedFrom']}" if n["handedFrom"] else ""))

print(f"\n{len(run['nodes']) - failures}/{len(run['nodes'])} links passed · quoted {run['quoted']}+ · spent {run['spent']} ({run['config']})")
sys.exit(1 if failures else 0)
