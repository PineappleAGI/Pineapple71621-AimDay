# AimDay

A **Chrome extension** for people whose heads are full and whose days need one clear move. Dump your messy thoughts and AimDay sorts them into a mindmap of what you want, what to do, and what's in the way — then highlights the single next step.

> Dump the noise. See what you want. Take the next step.

**No account. No API key. No server.** Your thoughts are parsed on your machine and stay there.

https://github.com/user-attachments/assets/7edf9a1b-1da4-4d85-bba6-985ce9dc4b90

---

## Get It From GitHub

You only do this once.

### Step 1 — Make sure you have Chrome

AimDay is a Manifest V3 extension. Use Google Chrome, or another Chromium browser that supports unpacked extensions (Edge, Brave, Arc).

**Nothing else to install.** No `npm install`, no build step, no backend. The extension is plain HTML, CSS, and JavaScript.

### Step 2 — Download the extension folder

1. Open <https://github.com/PineappleAGI/Pineapple71621-AimDay>
2. Click the green **Code** button → **Download ZIP** (or clone with git)
3. Unzip it somewhere you'll remember (e.g. your Desktop or `~/Documents/`)

That folder is the extension. It must contain `manifest.json` at the top level.

### Step 3 — Load it into Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the folder you just unzipped — the one **containing `manifest.json`**, not its parent

AimDay appears in your extensions list with its icon.

**Pin it (recommended):** click the puzzle-piece icon in Chrome's toolbar → pin AimDay so it's always one click away.

---

## Use It

### First: open the side panel

Click the **AimDay** icon in the Chrome toolbar — the **side panel** opens beside whatever you're doing. It shows today's current focus and a quick capture box, so you can add a thought without leaving the page.

Press **⌘/Ctrl+Enter** to add a thought, or tap **Open map** for the full dashboard.

### Capture — get it out of your head

Type freeform in the side panel, or hit **Full dump** for the big dashboard textarea. Messy is fine — worries, goals, half-thoughts, one idea per line.

Times work too: write `call with boss at 10AM` or `be in office 8:30AM` and AimDay reads the clock time straight out of the line.

Prefer talking? Tap the **microphone** and speak your dump. Voice runs on Chrome's **on-device** recognition only — if your machine can't do it locally, AimDay tells you and records nothing rather than sending audio to a speech server. The first use may download a one-time language pack.

### Map — see what you actually said

Submit your dump and AimDay splits it into lines, sorts each one, and lays them out as a mindmap around your central focus.

| Type | What it means |
|---|---|
| **Want** | An outcome you're after |
| **Do** | A concrete action |
| **Blocker** | Something in the way |
| **Theme** | A grouping the dump implied |
| **Note** | Context worth keeping |
| **Someday/Maybe** | Parked — off today's list, still on the map |

Got a line in the wrong bucket? The **Review types** strip fixes any classification in one dropdown, and the map updates as you go.

### Prioritize — Urgent × Important

Select any node and set its **Urgent / Important** square. AimDay names the quadrant the way MoSCoW does:

- **Must** — urgent and important
- **Should** — important, not urgent
- **Could** — urgent, not important
- **Won't** — neither

Your **current focus** is picked from those scores, and the rail explains *why* that node won. Disagree? Hit **Pin as next**.

AimDay also holds an **Ivy Lee cap of six** active Wants and Dos. Go past it and the rail says so, nudging you to park the rest in **Someday/Maybe** instead of pretending you'll do eleven things.

### Focus — only what must happen

**Focus** hides everything except your **Must** tasks, so a crowded map collapses to the handful that actually matter today. Press **F** or use the header button.

### Time block — give the day a shape

Nodes with a time appear on the **Time block** rail in order, with everything else listed underneath as **Unscheduled**. Drag within the track to move a task, or set a clock time in the node editor.

### Shape the map

- **Drag a box onto a branch** to make it a subbranch
- **Drag a box onto the center** to open it as a new branch
- **Drag the canvas** to pan, **scroll** to zoom, **Full** for full screen
- **Select a node** to rename it, change its type, set a context (`@desk`, `@calls`, `@errand`), mark it **Routine**, **Stack after** another task, attach an **Identity** ("reliable teammate"), park it, or delete it

The chips above the map filter by context, and you can rename them — tap **Edit buttons** to make them match your life instead of the defaults.

Keyboard: **D** mark done · **F** focus Must · **N** jump to current focus · **E** edit your dump · **+** / **−** / **0** zoom.

### Finish — mark done, mark rewards

**Mark done** advances you to the next clearest move. **Reward** logs that you actually gave yourself something for it, which the week review counts.

### Week review — systems over goals

Open **Week review** for the rollup: how many Wants became Dos, which Blockers keep recurring, moves completed, and rewards marked — plus plain-language insights about what keeps stalling your days.

### Share — get the map out

**Share** downloads the current map as an **image** or a **PDF**, rendered locally from the canvas. Nothing is uploaded.

### Morning nudge

AimDay can send one notification around 8am asking what today's next step is; clicking it opens capture. It can also open the dashboard when Chrome starts. Both are toggles at the bottom of the dashboard, and the startup one is off by default.

---

## What's In The Extension

| Piece | What it does |
|---|---|
| **Side panel** | Today's focus plus quick capture, beside whatever you're reading |
| **Dashboard** | Full dump, mindmap canvas, focus rail, time block, and settings |
| **Parser** | Splits your dump into lines and sorts them into Wants, Dos, Blockers, and more |
| **Priority** | Urgent × Important scoring, MoSCoW naming, and a six-task Ivy Lee cap |
| **Mindmap** | Pan, zoom, full screen, drag-to-rebranch, and per-node editing |
| **Time block** | Clock times read from your dump, laid out as a day |
| **Week review** | Wants that became Dos, recurring Blockers, moves done, rewards marked |
| **Share** | Download the map as an image or PDF, rendered on your machine |
| **Voice capture** | On-device dictation into the dump field |
| **Morning nudge** | Optional ~8am notification, and optional open-on-startup |

---

## Your Data

Everything lives in `chrome.storage.local` on your machine, keyed by date. AimDay has no server, makes no network requests, and sends nothing anywhere — the classification, layout, and exports all run locally. Voice capture is restricted to Chrome's on-device engine and refuses to record if that isn't available.

Each day is kept until you clear it or remove the extension.

---

## License

MIT — see [LICENSE](LICENSE).

---

## The Pineapple Project Team

Made by:

- **Henry Zou** — [@HenryZou on LinkedIn](https://www.linkedin.com/in/cunhanzou/)
- **Jenny Zheng** — [@JennyZheng on LinkedIn](https://www.linkedin.com/in/jenzheny/)

> Packaging weekend creations into serialized Pineapples🍍 Delivering with thought berries from a collective of blossoming builders.
