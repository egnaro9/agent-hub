// What the hub actually does, written from the code rather than from the plan.
//
// This repo has been bitten by claim rot — docs that described intent and were
// read as behaviour. So every line here was checked against the file it names,
// and anything that is inert without an API key says so out loud: that is the
// single most common confusion in this app.
//
// Entries are data, not JSX, so the copy can be read straight through and
// audited against source without stepping over markup.

export interface Entry {
  /** The control, in the words printed on it. */
  title: string;
  /** What it does. Present tense, no promises. */
  what: string;
  /** The exact interaction — where to click, what to type. */
  how: string;
  /** The thing that surprises people. Omitted when nothing surprises. */
  gotcha?: string;
  /** True when this does nothing at all until the brain chip reads `live`. */
  needsKey?: boolean;
}

export interface Section {
  id: string;
  label: string;
  /** One line under the section nav, setting up what follows. */
  blurb: string;
  entries: Entry[];
}

export const SECTIONS: Section[] = [
  {
    id: "around",
    label: "getting around",
    blurb: "The constellation, the lock, the two project modes, and the URL.",
    entries: [
      {
        title: "the constellation",
        what: "One canvas holding every project card and every agent card. It is the default view.",
        how: "Drag empty space to pan. Trackpad scroll or pinch to zoom. Double-click zooms in. Drag a card to move it. The cluster at bottom right is − / + / ⤢ fit-all.",
        gotcha:
          "It never unmounts. Entering a project hides it, so your camera and any card you moved are exactly where you left them when you come back — and card positions survive a reload.",
      },
      {
        title: "🔓 lock",
        what:
          "Turns off scroll-zoom, pinch-zoom, double-click-zoom and card dragging on the main pane. The chip turns amber and reads 🔒 locked.",
        how: "Click it in the bottom-right cluster. Click again to unlock.",
        gotcha:
          "It does not freeze the map. Drag-to-pan stays live, the − / + / ⤢ buttons keep working, and the minimap is still pan-and-zoom — the lock covers the main pane only.",
      },
      {
        title: "entering and leaving a project",
        what: "A project card opens that project's stage. The breadcrumb walks back.",
        how:
          "Click a card, or Tab to it and press Enter or Space. To leave: press Escape, or click `constellation` at the top left.",
        gotcha:
          "Escape pressed inside a text field blurs the field instead of navigating, so leaving from the room composer takes two presses.",
      },
      {
        title: "overview / work",
        what:
          "Every project has two modes. Overview renders a hand-built 2.5D scene for that project. Work gives you a task list, a file list, the topology bar and the room.",
        how: "The segmented control next to the project name in the top bar. Or click `enter the workroom ▸` inside any overview scene.",
        gotcha:
          "The mode is global — it follows you between projects — except that entering a project always resets you to overview. In work mode both side panels read the REAL repo: files show the repo root, and tasks show open GitHub issues where the repo has them, falling back to recent commits where it does not — the header names which is on screen. A project you minted in the hub says `no repo` instead of pretending.",
      },
      {
        title: "the scenes",
        what:
          "All 18 seeded projects have their own overview scene, built from that project's real story. The numbers in them are hard-coded published results.",
        how: "Nothing to click. Move the pointer for parallax.",
        gotcha:
          "Everything in a scene is decoration except the one `enter the workroom ▸` button. Scenes compose at a fixed width and scale as a single image, so a wider window makes the same composition bigger — it never reflows.",
      },
      {
        title: "deep links",
        what: "`#/p/<id>` opens a project in overview. `#/p/<id>/work` lands in work mode. Navigating writes the hash back, so refresh and browser Back both work.",
        how: "Type the hash in the address bar, or just navigate and watch it update.",
        gotcha:
          "`/work` is the only mode suffix the URL matcher accepts. `#/p/crashkit/overview` matches nothing and silently leaves you where you were, as does an unknown project id.",
      },
      {
        title: "search and pins",
        what: "The sidebar field filters projects and agents by name, live. The ☆ on a project row floats it into a PINNED section at the top.",
        how: "Type in `search projects & agents…`; Escape inside the field clears it. Hover a project row and click the ☆.",
        gotcha:
          "The top-bar `search /` button focuses that field, but there is no slash hotkey — the only global key handler in the app is Escape. Pins are stored under their own key, so clearing the app's saved state leaves them behind.",
      },
    ],
  },
  {
    id: "rooms",
    label: "rooms & agents",
    blurb: "One transcript per project, who is in it, and what they answer.",
    entries: [
      {
        title: "the room",
        what: "Each project has one channel. Work mode shows it as a pane; overview docks the same channel as a drawer.",
        how: "In overview, click the vertical `# <project>` tab on the right edge. It becomes `close room`.",
        gotcha:
          "Both surfaces render the same room for the same project, so the transcript is shared. The timer that drains queued canned lines lives inside that component — sit in overview with the drawer shut and a queued conversation is paused, not lost.",
      },
      {
        title: "sending a message",
        what: "The composer posts to the project channel and the agents in it answer.",
        how: "Type in `Message #<project>…` and press Enter, or click send.",
        gotcha:
          "The composer stays enabled while an agent is writing. Interrupting is deliberate: the send button relabels to `writing…` but never disables, and a second message queues behind the in-flight turn instead of being dropped.",
      },
      {
        title: "@mentions",
        what: "`@Forge do X` answers from Forge alone and pulls him into the room. `@team` polls everyone present. With no mention, the first three participants answer.",
        how: "Type `@<AgentName>` anywhere in the message. Case-insensitive.",
        gotcha:
          "It matches the display name, not the agent id, and only agents in scope for this project. Mentioning an out-of-scope agent matches nothing and quietly falls through to the default. An empty room is not a dead end — the first agent joins and answers.",
      },
      {
        title: "summoning",
        what: "Brings an agent into the room and assigns them to the project, which draws a work edge on the constellation.",
        how:
          "Three ways: `+ summon agent` in the top bar, a dashed-outline avatar in the room header, or an @mention.",
        gotcha:
          "`+ summon agent` is disabled while you are on the constellation, and also once every in-scope agent is already on the project.",
      },
      {
        title: "releasing",
        what: "Takes an agent out of the room and off the project, and drops any lines of theirs still queued.",
        how:
          "Hover their avatar in the room header and click the rose ×. Or, in overview, click their avatar under `crew`.",
        gotcha:
          "Those two are opposite conventions on purpose and by accident: in the room header the avatar is not the target, so a misclick cannot empty the room; in the overview hero the avatar itself is the release button.",
      },
      {
        title: "agent scope",
        what: "Five agents are global. Probe lives in model-drift and Porter lives in tapdodge-engine.",
        how: "Nothing to set — scope is fixed in the seed data. Scoped agents carry a `scoped` chip in the sidebar.",
        gotcha:
          "The sidebar only lists an agent whose scope matches where you are, so Probe and Porter are invisible in the sidebar (and unfindable by search) while you are on the constellation, even though their cards are right there on the canvas. A scoped agent is already in their home room the first time you open it.",
      },
      {
        title: "DMs",
        what: "A one-on-one drawer with a single agent, scoped to that agent's assigned project if they have one.",
        how: "Click an agent row in the sidebar, or `chat` on an agent card. Escape closes it.",
        gotcha:
          "Agents have no tools in a DM — the tool loop only runs on the room path. Opening a DM from the constellation also flies the camera to that agent.",
      },
      {
        title: "the roundtable tray",
        what: "Stage two or more agents from the canvas and drop them into a room together.",
        how: "Click `+` on two or more agent cards, then `convene in the room ▸` in the tray that rises from the bottom. Clicking an avatar in the tray removes it.",
        gotcha:
          "The room it convenes in belongs to the first staged agent who already HAS an assignment — not the first one you staged — and if none of them has one, a random project. It also puts you in work mode, not overview.",
      },
      {
        title: "two commands that need no key",
        what: "`new project: <name>` mints a real node in the constellation immediately. In #harness-builder, `run the sweep` replays a recorded sweep, refusal and all.",
        how: "Type either into any room composer.",
        gotcha:
          "Both run before the live-brain path, so `run the sweep` never reaches a model even with a key connected. Names are slugified, and a collision with an existing project or agent id is refused. Note the asymmetry with the gate: you typing `new project:` creates it outright, while an agent asking for the same thing only gets a proposal card.",
      },
      {
        title: "the mic",
        what: "Dictation in the room composer and the DM composer, using the browser's own speech recognition. Interim words stream into the field.",
        how: "Click ● next to send; it turns rose while listening. Click again to stop, then press Enter as usual — nothing sends itself.",
        gotcha:
          "Where the browser has no speech recognition the button is not rendered at all, which reads as a missing feature rather than an unsupported one. Dictation only replaces what dictation added, so anything you typed first survives. There is no mic on the topology field.",
      },
      {
        title: "the ambient status lines",
        what: "A simulation ticks every few seconds, moving idle agents through musings and occasionally flipping a working agent to an error.",
        how: "Passive. It shows up under each agent and in the top-bar `N active · M error` readout.",
        gotcha:
          "Those errors are canned strings — `429 from provider — backing off` and friends. They fire with a live key connected and nothing actually failing, and the counter cannot tell them apart from a real API failure.",
      },
    ],
  },
  {
    id: "brain",
    label: "brains & keys",
    blurb: "Nothing below this line does anything until the top-bar chip reads `brain: live`.",
    entries: [
      {
        title: "◈ brain",
        what:
          "The bring-your-own-key connection. Connected, the chip flips from `brain: mock` to `brain: live` and every room and DM switches from canned personas to real streamed model calls, billed to your key.",
        how: "Top bar → `◈ brain: mock` → paste an `sk-ant-…` key → pick a model → `save`. `disconnect` clears it.",
        gotcha:
          "The key is stored in this browser only. Pick the model here too: the short name rides on the chip.",
      },
      {
        title: "the one that catches everyone",
        what:
          "Storing an Anthropic key anywhere other than this menu will not flip the chip until you reload or save it here.",
        how: "If the chip still says `mock` after you have stored a key somewhere else, reload the page or save it here.",
        gotcha:
          "Two consequences. Pasting your Anthropic key into ◇ keys writes the same storage slot, but the chip stays `mock` until you reload. And a setup with only a non-Anthropic vendor configured leaves the whole app in mock mode — rooms answer with canned personas and shapes refuse to run — even though ⚙ roster shows a green ✓ next to that vendor.",
        needsKey: true,
      },
      {
        title: "route by role",
        what:
          "Judgment agents (Critic, Oracle) get the model you chose; the mid roles drop to sonnet and the chatty ones to haiku. It never routes up past your choice.",
        how: "The `route by role` checkbox in the brain menu. On by default.",
        gotcha:
          "The tier table is keyed by agent id, so an agent it does not know defaults to the mid tier. A per-agent override in ⚙ roster bypasses routing entirely.",
        needsKey: true,
      },
      {
        title: "◇ keys",
        what:
          "One API key per vendor, ten vendors, each going straight to that vendor. A stored key is never rendered back; a `✓ key` chip marks the ones you have configured.",
        how: "Top bar → `◇ keys` → paste into a vendor's field (it commits on blur or on `test`). `forget` removes it. Base-URL fields appear for the OpenAI-shaped vendors — that is how a local model is wired.",
        gotcha:
          "The field is emptied once the value is stored, so the secret stops living in a DOM node. Base-URL edits are written on every keystroke, so a half-typed URL is briefly the stored value.",
      },
      {
        title: "test",
        what:
          "One cheap authenticated request per vendor, reporting five distinguishable verdicts: reachable, key rejected, blocked by the browser, server error, or no route.",
        how: "◇ keys → `test` on a vendor row.",
        gotcha:
          "A CORS rejection and a dead network look identical to a browser, so a failure is re-probed without headers to tell them apart. OpenAI direct is flagged before you paste anything: api.openai.com sends no CORS headers on the endpoint this app calls, so no key can fix it from a web page.",
      },
      {
        title: "⚙ roster",
        what: "One row per agent: a vendor and a model id that override both the role tier and the global model.",
        how:
          "Top bar → `⚙ roster` → pick a vendor on the left and a model on the right. `custom…` turns the model into free text. `↺` clears one row, `reset all` clears every row.",
        gotcha:
          "An override deliberately beats the never-route-up rule. Picking a vendor you have no key for is allowed, and surfaces later as `⚠ live brain error` in the transcript when that agent tries to speak. And an override does nothing at all while the brain chip says `mock`, which today means you need an Anthropic key regardless of which vendor you picked.",
        needsKey: true,
      },
    ],
  },
  {
    id: "act",
    label: "acting & the gate",
    blurb: "What an agent may do on its own, and what only you may do. Live brain required throughout.",
    entries: [
      {
        title: "three tiers, on purpose",
        what:
          "Agents hold four tools, five once commits are armed. Free ones run silently, reversible ones run with a notice, and anything that creates state becomes a card only you can approve.",
        how: "Nothing to click. Ask an agent in a room to do one of these things.",
        gotcha:
          "Tools exist on the room path only — an agent in a DM has none. The tool loop is capped at four turns per reply.",
        needsKey: true,
      },
      {
        title: "tier 1 · free",
        what:
          "`read_recent_commits` pulls the project's latest commits. `read_repo_file` reads a file from the project's repo.",
        how: "Ask for it in a room.",
        gotcha:
          "File reads are pinned to the project's own repo and re-checked after the URL is parsed, because stripping `..` from a string is not enough — the parser decodes escapes afterwards. Fetched content comes back fenced as untrusted, with instructions not to follow anything inside it.",
        needsKey: true,
      },
      {
        title: "tier 2 · reversible",
        what: "`summon_agent` brings another agent into the room and onto the project. It executes immediately, with a notice.",
        how: "Ask an agent to bring someone in.",
        gotcha: "You can undo it the same way you would undo your own summon — release them from the room header.",
        needsKey: true,
      },
      {
        title: "tier 3 · gated",
        what:
          "`create_project` does not execute. It renders an amber card in the transcript with approve and dismiss buttons, and nothing happens until you click.",
        how: "Read the card, then `approve ▸` or `dismiss`.",
        gotcha:
          "The model is told, in the tool result, that the call was NOT executed and that it must never claim otherwise. After you resolve a card, focus is handed to the composer — the buttons disappear and focus would otherwise fall on nothing.",
        needsKey: true,
      },
      {
        title: "danger zone · commits",
        what:
          "Arming adds a fifth tool, `propose_commit`. Its card is a real diff: the file's current contents are fetched first, and you see the change, the commit message, and the agent's stated reason.",
        how:
          "Brain menu → `danger zone · commits · off` → expand → paste a `github_pat_…` token → `arm commit proposals`. `disarm` clears it.",
        gotcha:
          "There is no separate armed flag — the token's presence is the arming, so `disarm` deletes the credential and re-arming means pasting it again. Use a fine-grained token limited to one repo, contents-write only, short expiry.",
        needsKey: true,
      },
      {
        title: "what a commit can and cannot be",
        what:
          "Enforced in code, not in a prompt: a new branch and never main, inside this room's own repo, one text file, path sanitised, size-capped, binary refused. The branch is named for you.",
        how: "Approve the diff card. Ops posts the branch name and a GitHub link. Merging stays in GitHub.",
        gotcha:
          "The repo owner is hard-coded, so a project you minted yourself has no repo behind it and its commits are refused. And the card flips to approved before the API call returns — that stops a double-click double-committing, but it means a failed commit still leaves a card reading approved, with the failure showing up only as a later `⚠ commit refused` line from Ops.",
        needsKey: true,
      },
      {
        title: "the signals feed",
        what:
          "Opening a project fetches its three most recent real commits and hands them to the agents. This needs no key.",
        how: "Open any project and watch the room: an agent posts a `Pulled the live feed…` line, and those commits are in its system prompt from then on.",
        gotcha:
          "Everything here is unauthenticated — 60 requests an hour for this whole browser, and blind to private repos even with a write token armed. Opening a work tab spends up to three (commits, files, issues); results are cached for the session, and when the budget runs out the cards say so instead of pretending the repo is empty. `read_recent_commits` spends from the same budget, while `read_repo_file` does use your token.",
      },
    ],
  },
  {
    id: "shapes",
    label: "harness shapes",
    blurb: "Running one task through a multi-agent structure, and paying for it knowingly.",
    entries: [
      {
        title: "running a shape",
        what: "Sends one task through the room's agents in a chosen structure. Every node takes the same path an ordinary room turn takes — same transcript, same tools, same gate.",
        how: "Work mode only. Pick a shape chip, type a task in the topology field, press Enter or `run ▸`.",
        gotcha:
          "The task field survives the launch on purpose: running the same task through two shapes and comparing is the point, and clearing it would tax exactly that.",
        needsKey: true,
      },
      {
        title: "the four presets",
        what:
          "loop — everyone speaks in turn, each seeing the whole conversation. fan-out — a manager splits the task, workers answer in parallel, the manager merges. panel — independent answers from each agent, then a judge picks and says why. pipeline — an assembly line: each agent sees ONLY the output of the one before it, never the conversation.",
        how: "The chips at the left of the topology bar. `loop` is the default.",
        gotcha:
          "`loop` and `pipeline` are the same agents in the same order for the same price — the ONLY difference is what each one is shown, which makes running a task on both a controlled experiment in what context is worth. A pipeline is also where telephone-game drift becomes visible, since a loop's full transcript hides it. You still see every link in the room; only the agents are narrowed. And fan-out is offered, never assumed: it is the one thing the room's @team poll structurally cannot do, because that poll is sequential — but this hub's own recorded sweep found more scaffolding scoring worse, so the cheap shape stays the default.",
        needsKey: true,
      },
      {
        title: "composing your own shape",
        what:
          "`+ new shape` opens a composer: name it, then stack stages. Each stage is SINGLE (one agent), FAN-OUT (all at once, none seeing another's answer), IN-ORDER (each seeing the whole conversation) or HAND-OFF (each seeing only the one before it), with a role and agents drawn from whoever is in this room. Saved shapes join the chip strip and run the same path as the presets.",
        how: "In a WORK tab, `+ new shape`. Add stages, reorder with ↑/↓, and watch the price move as you build. `edit` and `delete` appear beside a selected saved shape.",
        gotcha:
          "Multi-round is the point — SINGLE manager → FAN-OUT workers → SINGLE judge → FAN-OUT again → judge — and a stage that speaks a second time is badged `round 2` and told so. Caps: 8 stages, 6 agents each. Reusing an existing name REPLACES that shape, which the composer now warns about rather than doing silently. Saved shapes live in this browser only.",
        needsKey: true,
      },
      {
        title: "the price, before you pay it",
        what: "An amber chip beside the launch button quotes the FLOOR of what the selected shape will spend with the room's current roster — one model call per speaking node.",
        how: "Read the `N+ model calls` chip. It moves as you switch shapes, edit a shape, or the room's population changes. When the run finishes it reports what it actually spent.",
        gotcha:
          "The `+` is honest, not decorative: agents keep their tools inside a shape, and a node that reads the repo takes another turn — up to four per node. So a fan-out of four quotes 5+ and can spend more; the closing line tells you which. A shape the room cannot fill reads `nothing to run` instead of a price, and the launch button stays dark.",
        needsKey: true,
      },
      {
        title: "while it runs",
        what: "A line under the composer reports progress — which phase, which shape, how many workers. Only one shape may run hub-wide at a time.",
        how: "Watch the line. Other rooms will say a shape is already running elsewhere.",
        gotcha:
          "A shape shares the room's lock with @team, so it never interleaves with a roundtable already speaking. Fan-out phases are the only concurrent ones: they go out together and no worker sees another's answer.",
        needsKey: true,
      },
      {
        title: "with no key",
        what:
          "A shape refuses to run and says so in the transcript rather than faking it with canned lines. The bar also carries an amber `needs a live brain` hint.",
        how: "Click `run ▸` without a key and read the ⚠ line Ops posts.",
        gotcha:
          "`run ▸` is not disabled by the missing key — unlike `+ summon agent`, which is. An EMPTY room is different again: the price reads `0 model calls` and `run ▸` simply stays disabled, with no message explaining why.",
      },
    ],
  },
];
