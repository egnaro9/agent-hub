// Canned personas for the mock brains — synchronous and transcript-blind by
// design. A real LLM backend replaces these at the STORE boundary with an async
// adapter (pending/streaming states included); this file only defines the
// text-in/text-out contract.

export interface Persona {
  musings: string[];
  open: (topic: string) => string;
  mid: (topic: string) => string[];
  ack: (userText: string) => string;
  reply: (userText: string, topic?: string) => string;
}

const clip = (s: string, n = 46) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

export const PERSONAS: Record<string, Persona> = {
  strat: {
    musings: ["mapping the arc backlog", "re-reading yesterday's verdicts", "sequencing the next arc"],
    open: (t) => `Framing it: ${t} is the highest-leverage node on the board right now. I want one arc, tightly scoped.`,
    mid: (t) => [
      `Scope check — we touch ${t} only where the oracle can see the change.`,
      `Sequencing: land the seam first, the polish second. Reverse it and we ship blind.`,
      `I'll write the arc card with one measurable exit criterion.`,
    ],
    ack: (u) => `Noted — "${clip(u)}" changes the framing. Re-scoping.`,
    reply: (u) => `Good input. I'd fold "${clip(u)}" into the arc as a constraint, not a task — constraints survive contact with the build.`,
  },
  forge: {
    musings: ["warming the build cache", "sketching the diff", "rerunning the failing case"],
    open: (t) => `I can have a working seam in ${t} today. Small diff, real tests, no flags.`,
    mid: (t) => [
      `Implementation note: ${t} already has the hook I need — I extend, not rewrite.`,
      `Two files touched, one test added. The diff reads in under a minute.`,
      `Done means green locally AND on the differential check, not just compiling.`,
    ],
    ack: (u) => `Heard — "${clip(u)}". Adjusting the diff before I go further.`,
    reply: (u) => `On it. "${clip(u)}" is a one-file change if I do it now, a three-file change if we wait. I'd do it now.`,
  },
  critic: {
    musings: ["auditing yesterday's claims", "replaying the failure cast", "reading the diff cold"],
    open: (t) => `Before anyone celebrates: has ${t} been read by someone who didn't write it? That would be me.`,
    mid: (t) => [
      `Finding: the happy path in ${t} is tested. The path a tired user takes is not.`,
      `I tried to refute the core claim and couldn't — but the margin is thinner than the README implies.`,
      `CONFIRMED on two counts, PLAUSIBLE on one. Fix the confirmed ones before merge.`,
    ],
    ack: (u) => `"${clip(u)}" — that's a claim. I'll verify it before it goes anywhere.`,
    reply: (u) => `Skeptical by default: "${clip(u)}" sounds right, which is exactly when we check. Give me the evidence path.`,
  },
  oracle: {
    musings: ["re-running the frozen suite", "checking the noise floor", "diffing two runs"],
    open: (t) => `Numbers first: ${t}'s last run is green, but green on how many discordant cases? I'll pull the comparison.`,
    mid: (t) => [
      `Measured: the change moves the metric, and the move clears the noise floor. That's rare — flagging it.`,
      `The suite can't decide between these two shapes. Saying so IS the result.`,
      `Verdict posted to eval-history, tagged with the commit that produced it.`,
    ],
    ack: (u) => `Logging "${clip(u)}" as a hypothesis. It gets a number or it stays a hunch.`,
    reply: (u) => `I can measure that. "${clip(u)}" becomes a probe with a fixed predicate — no model grading itself.`,
  },
  ops: {
    musings: ["auditing the gate log", "rotating the approval file", "checking what's armed"],
    open: (t) => `Gate status: nothing in ${t} ships without an operator approval. That includes everything you're about to propose.`,
    mid: (t) => [
      `Reminder: reliability earns launch-automation. It never earns gate-removal.`,
      `The irreversible step in ${t} is the push. Everything before it is reversible — move fast there.`,
      `Approval armed for one commit. It spends itself on use.`,
    ],
    ack: (u) => `"${clip(u)}" — noted. If it touches a gate, it waits for the operator.`,
    reply: (u) => `From the gate's side: "${clip(u)}" is fine to build, gated to ship. Build away.`,
  },
  probe: {
    musings: ["watching the daily cron", "diffing today's run against yesterday's", "checking flip counts"],
    open: (t) => `Daily read on ${t}: run is green. One task flipped on one model — inside the instrument's resolution, not a finding.`,
    mid: (t) => [
      `If the same task flips on five providers at once, suspect the harness — that rule has paid for itself.`,
      `The frozen suite is the whole point of ${t}: a score change means the model moved, not the test.`,
      `I'll open the issue myself if anything regresses. The post about it stays a human decision.`,
    ],
    ack: (u) => `"${clip(u)}" — checking it against the run history.`,
    reply: (u) => `Against the data: "${clip(u)}" would show up as a flip pattern. Today's run doesn't have one.`,
  },
  porter: {
    musings: ["replaying the two-runtime trace", "checking browser clock clamps", "diffing checkpoint hashes"],
    open: (t) => `Parity status for ${t}: javac and TeaVM agree on every checkpoint of the scripted run.`,
    mid: (t) => [
      `Reminder from the 69-difference day: a same-runtime test cannot see a between-runtime lie.`,
      `Anything touching ${t}'s rules gets the cross-compile diff before it merges. No exceptions.`,
      `The golden file stays useful only because the diff between runtimes backs it up.`,
    ],
    ack: (u) => `"${clip(u)}" — running it through the parity check.`,
    reply: (u) => `Two-runtime view: "${clip(u)}" is safe if both builds still agree from one seed. I'll verify.`,
  },
};

// Unknown agent ids (e.g. from a future live roster) degrade to a neutral
// persona instead of crashing the store actions.
const DEFAULT_PERSONA: Persona = {
  musings: ["syncing"],
  open: (t) => `Joining ${t}. Catching up on the thread.`,
  mid: (t) => [`Following along on ${t}.`],
  ack: (u) => `Noted: "${clip(u)}".`,
  reply: (u) => `On "${clip(u)}" — I'll take a look.`,
};
export const personaFor = (id: string): Persona => PERSONAS[id] ?? DEFAULT_PERSONA;

export const ERRORS = [
  "429 from provider — backing off",
  "gate refused the push",
  "trace diff timed out — retrying",
  "stale extension — reload needed",
];

let seq = 0;
export const nextId = () => `m${++seq}-${Date.now().toString(36)}`;

export function buildRoundtable(participants: string[], topicName: string) {
  const lines: { from: string; text: string }[] = [];
  participants.forEach((p) => lines.push({ from: p, text: personaFor(p).open(topicName) }));
  for (let round = 0; round < 2; round++) {
    participants.forEach((p) => {
      const pool = personaFor(p).mid(topicName);
      lines.push({ from: p, text: pool[round % pool.length] });
    });
  }
  return lines;
}
