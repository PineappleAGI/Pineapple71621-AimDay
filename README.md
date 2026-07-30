# AimDay (Project71621)

A downloadable **Chrome extension** for people whose heads are full and whose days need one clear move. You dump messy thoughts; AimDay clusters wants, actions, and blockers into a **mindmap** — and highlights the next step so you know where to start.

> Dump the noise. See what you want. Take the next step.

**No account. No API key. No internet required.** Everything runs on-device in Chrome.

This is a sibling project to [ToneDesk](https://github.com/KingHenryZ/ToneDesk) and [Skill71717 Pineapple Research Materials](https://github.com/KingHenryZ/Skill71717-Dossier): same “download → set up once → use” idea, different job (daily clarity instead of business writing or research dossiers).

---

## Get It From GitHub

You only do this once.

### Step 1 — Make sure you have Chrome

AimDay is a Chrome extension (Manifest V3). Use Google Chrome (or another Chromium browser that supports unpacked extensions).

**No other tools to install.** No `npm install`, no build step, no backend. The extension is plain HTML/CSS/JS.

### Step 2 — Get the extension folder

**If you already have this repo locally** (e.g. `~/Project71621` or a clone of `AimDay`), skip the ZIP steps and use that folder.

**Otherwise, from GitHub:**

1. Open <https://github.com/KingHenryZ/AimDay>
2. Click the green **Code** button → **Download ZIP** (or clone with git)
3. Unzip / clone it somewhere you'll remember

That folder is the extension. It must contain `manifest.json` at the top level.

### Step 3 — Load it into Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select **this folder** (the one with `manifest.json` — not a parent directory)

AimDay should appear in your extensions list with its icon.

**Pin it (recommended):** click the puzzle-piece icon in Chrome’s toolbar → pin AimDay so it’s always one click away.

---

## Use It

### First: open the map once

1. After installing (or after any update): click **Reload** on the extension card
2. Click the **AimDay** icon in the Chrome toolbar
3. You’ll see today’s **next step** (if you have one) and a quick-capture box
4. Click **Open map** for the full dump + mindmap dashboard

### Then: run a real morning dump

1. Paste or type messy thoughts — freeform, bullets, worries, goals
2. Submit to **Map** — AimDay splits lines, classifies goals / actions / blockers, and lays out a tree
3. The clearest **next step** is highlighted
4. Click any action on the map to set it as your next step
5. **Mark done** to advance to the next clearest move

### Quick capture (toolbar popup)

- Type one thought and press **Cmd+Enter** / **Ctrl+Enter** (or click add) to append it to today and refresh the map
- Empty add opens the full dashboard focused on capture
- Progress shows as `done/total moves · today`

### Tips that help classification

- One idea per line works best
- Phrases like “I want…”, “need to…”, “waiting on…” help AimDay sort goals vs actions vs blockers
- Words like “today”, “first”, “asap” bias which node becomes the next step

---

## What's In The Extension

| Piece | What you'll find |
|---|---|
| **Popup** | Today’s next step, progress, quick thought capture |
| **Dashboard** | Thought dump → mindmap canvas (pan/zoom), next-step focus, mark done |
| **Parser** | Splits dump into lines; classifies goal / action / blocker; picks next step |
| **Layout** | Positions the tree for the visual map |
| **Morning open** | Optional: open the dashboard on Chrome startup / ~8am alarm |

---

## How It Works

```text
Dump thoughts (popup or dashboard)
  → split into atomic lines
  → classify: goal / action / blocker
  → build mindmap + pick next step
  → save day under chrome.storage.local (keyed by date)
  → show map + highlighted next move
```

```text
popup (quick capture + next step)
  ↕ shared storage / parse
dashboard (full dump + mindmap UI)
  ↕
background (startup open + morning alarm)
```

- **No model required** — classification and layout are local heuristics over your text
- **Per-day storage** — each calendar day has its own thoughts + map
- **Optional startup** — toggle “open on startup” in the dashboard

---

## Privacy & Limits

- Everything runs **locally**. No account, no login, no analytics backend.
- Thoughts and maps live in `chrome.storage.local` on your machine, keyed by date.
- Nothing is sent to a server.
- AimDay is a clarity aid, not a project manager — review the suggested next step before you commit your day to it.

---

## Project layout

```
aimday/                    # this folder (manifest.json at the root)
  manifest.json
  background/              # startup + morning open
  dashboard/               # thought dump + mindmap
  popup/                   # quick capture + next-step reminder
  shared/                  # parse, layout, storage, util
  fonts/
  icons/
```

---

## Updating after you change code

1. Go to `chrome://extensions`
2. Click **Reload** on AimDay
3. Re-open the popup or dashboard tab

---

## The Pineapple Project Team

Made by:

- **Henry Zou** — [@HenryZou on LinkedIn](https://www.linkedin.com/in/cunhanzou/)
- **Jenny Zheng** — [@JennyZheng on LinkedIn](https://www.linkedin.com/in/jenzheny/)

> AimDay helps people turn mental clutter into one visible map — and one honest next step — so the day can start before the noise wins.
