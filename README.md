# AimDay

A **Chrome extension** for people whose heads are full and whose days need one clear move. Dump your messy thoughts and AimDay sorts them into a mindmap of what you want, what to do, and what's in the way — then highlights the single next step.

> Dump the noise. See what you want. Take the next step.

**No account. No API key. No internet required.** Everything runs on your own machine.

---

## Get It From GitHub

You only do this once.

### Step 1 — Make sure you have Chrome

AimDay is a Manifest V3 extension. Use Google Chrome, or another Chromium browser that supports unpacked extensions (Edge, Brave, Arc).

**Nothing else to install.** No `npm install`, no build step, no backend. The extension is plain HTML, CSS, and JavaScript.

### Step 2 — Download the extension folder

1. Open <https://github.com/KingHenryZ/AimDay>
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

Click the **AimDay** icon in the Chrome toolbar — the **side panel** opens beside whatever you're doing. It shows today's next step and a quick capture box, so you can add a thought without leaving the page.

Tap **Open map** for the full dashboard whenever you want the whole picture.

### Capture — get it out of your head

Type freeform in the side panel, or hit **Full dump** for the big dashboard textarea. Messy is fine — worries, goals, half-thoughts, one idea per line.

Press **⌘/Ctrl+Enter** to add a thought from the side panel without reaching for the mouse.

### Map — see what you actually said

Submit your dump and AimDay splits it into lines, sorts each one into a **want**, a **do**, a **blocker**, or a **note**, and lays them out as a mindmap around your central focus. The clearest next step is highlighted.

Got a line in the wrong bucket? The **Review types** strip lets you fix any classification in one dropdown — the map updates as you go.

### Next step — one honest move

The rail on the left names your current focus and why it was picked. **Mark done** advances you to the next clearest move. **Focus** dims everything except the path from your center to that step, so the rest of the noise gets out of the way.

Prefer a different move? Click any action on the map to promote it, or select a node and hit **Pin as next**.

### Rearrange — make the map yours

- **Drag a box** onto a want, theme, or note to re-link it under a new parent
- **Drag the canvas** to pan, scroll to zoom
- **Select a node** to rename it, change its type, or move it with the parent dropdown

Keyboard: **D** mark done · **F** focus path · **N** jump to next step · **E** edit your dump · **+** / **−** / **0** zoom.

### Morning nudge

AimDay can send one notification around 8am asking what today's next step is; clicking it opens capture. It can also open the dashboard when Chrome starts. Both are toggles at the bottom of the dashboard, and the startup one is off by default.

---

## What's In The Extension

| Piece | What it does |
|---|---|
| **Side panel** | Today's next step plus quick capture, beside whatever you're reading |
| **Dashboard** | Full thought dump, mindmap canvas, focus rail, and settings |
| **Parser** | Splits your dump into lines and sorts them into wants, dos, blockers, and notes |
| **Mindmap** | Pan, zoom, drag-to-relink, rename, retype, and pin your own next step |
| **Focus mode** | Dims everything except the path from your center to the next step |
| **Morning nudge** | Optional ~8am notification, and optional open-on-startup |

---

## License

MIT — see [LICENSE](LICENSE).

---

## The Pineapple Project Team

Made by:

- **Henry Zou** — [@HenryZou on LinkedIn](https://www.linkedin.com/in/cunhanzou/)
- **Jenny Zheng** — [@JennyZheng on LinkedIn](https://www.linkedin.com/in/jenzheny/)

> In the coming era of AGI, building solutions becomes a collective process akin to a pineapple, where technical and non-technical contributors fuse like individual berries into a unified, organic whole. This partnership mirrors the 8 & 13 dual spirals of the Fibonacci sequence, intertwining creative human intent with AI-driven structural analysis to assemble a perfect, high-resolution context for building at the speed of thought.
