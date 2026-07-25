# Mariet

Part market tracker, part strategy game. On the surface it's a desktop app for
following markets and keeping research notes on each one — markets live in the
left sidebar (grouped by category), each gets its own notes pane, notes autosave
as you type, and prices update live from Yahoo Finance. Underneath, it's a game
of anticipation: read the global picture, predict how prices will react to the
next supply shock, and find out how well you called it.

Built with [Tauri](https://tauri.app) (native desktop) + vanilla HTML/CSS/JS.

## The game: anticipating supply crises

Commodity and equity markets don't move at random — they react to **supply**. A
frost in Brazil, an OPEC cut, a blocked shipping lane, a mine strike, a chip
shortage: each is a different kind of supply crisis, and each pushes prices in a
direction you can learn to read. Mariet turns that into a game you play
against the real world:

- **Form a thesis.** Watch a market and note in its pane *why* you think it will
  move — "corn short after the drought," "crude tight into winter."
- **Make the call.** Predict the direction and rough size of the reaction.
- **Let the market answer.** Live prices and day/week/month moves show whether
  reality agreed. **Momentum alerts** flag the markets that are actually breaking
  out, so you find out fast whether your read was right.
- **Learn the patterns.** Over time you build intuition for how each type of
  crisis — energy, grains, metals, tech supply chains — ripples across markets.

It rewards curiosity and pattern-recognition, not luck. The better you get at
anticipating *why* supply tightens or loosens, the better you score against the
tape. Everything below is the machinery that keeps that game honest — live data,
your notes, and the alerts that tell you when a market is on the move.

## Where your notes are stored

Each market is a plain Markdown file in:

```
Documents\Market Notes\
```

For example `crude-oil.md`:

```markdown
---
name: Crude Oil
symbol: CL
quote: CL=F
category: Energy
price: 68.78
changeDay: 0.13
changeWeek: -0.65
changeMonth: -28.37
---
Supply draw reported by EIA this week ...
```

The only fields you edit are `name`, `symbol`, `quote`, and `category` (via the
Add/Edit dialog). The `price` and `changeDay/Week/Month` fields are **filled in
automatically** from live data — see below.

These are just text files — open, edit, back up, or version-control them with any tool.
Use **Open notes folder** in the sidebar to jump straight there.

## Live prices (Yahoo Finance)

Each market's price and day/week/month % change are fetched from Yahoo Finance's
public chart endpoint. Refresh happens:

- **on launch**,
- **every 30 minutes** automatically, and
- **on demand** via the **↻ Refresh prices** button in the sidebar.

The **Yahoo symbol** (`quote`) is the ticker used for the lookup — e.g. `CL=F`
(crude), `GC=F` (gold), `AAPL` (a stock). It can differ from the display
`symbol`; if left blank, the display symbol is used.

Caveats: it's an **unofficial** endpoint (no API key, but it can change or
throttle without notice), needs an internet connection, and some quotes are
slightly delayed. Note that Yahoo quotes **grain futures in cents** (e.g. corn
`ZC=F` comes back as ~440 = $4.40/bushel); the % changes are correct regardless.

## Momentum alerts (fast risers)

This is the scoreboard for your calls. A market is "rising fast" when its live
price is up **≥ 3% in a single trading day**, or **≥ 6% over the last 3 trading
days**. When that happens:

- a **green dot** appears at the far right of the row in the sidebar, and
- a **desktop notification** fires the moment a market *newly* crosses either
  threshold (one notification summarising all the fast risers). It's deduped per
  day, so a market sitting above the line won't nag you — but it re-arms once it
  drops back below and can alert again.

So when a supply crisis you anticipated finally hits the tape, Mariet is
what tells you your read was right — often before it makes the headlines.

> **Windows note:** desktop toasts are most reliable from an **installed build**
> (`npm run tauri build`). In `tauri dev` they may be suppressed by Windows
> depending on Focus Assist / notification settings. The green sidebar marker
> always works regardless.

## First-time setup (one time only)

Node.js is already installed. Tauri also needs the Rust toolchain and Microsoft's
C++ build tools. Both are one-time installs:

1. **Microsoft C++ Build Tools** (Rust's linker on Windows)
   Download from <https://visualstudio.microsoft.com/visual-cpp-build-tools/>,
   run the installer, and tick **"Desktop development with C++"**.
   *(This is the big one — a few GB and needs admin rights.)*

2. **Rust** — run in PowerShell:
   ```powershell
   winget install --id Rustlang.Rustup -e
   ```
   or download `rustup-init.exe` from <https://rustup.rs>. Then close and reopen
   your terminal so `cargo` is on the PATH. Verify with `cargo --version`.

3. Install the JS dependencies (already done, but if you ever clone this fresh):
   ```powershell
   npm install
   ```

## Running the app

```powershell
npm run tauri dev
```

The first run compiles the Rust backend and can take several minutes; later runs
are fast. A native window opens with live-reload on frontend changes.

## Building an installer

```powershell
npm run tauri build
```

Produces a Windows installer under `src-tauri\target\release\bundle\`.

## Project layout

```
src/                 Frontend (what you see)
  index.html         Layout
  styles.css         Dark theme
  main.js            App logic + calls into Rust
src-tauri/
  src/lib.rs         Rust commands: read/write the .md files
  tauri.conf.json    Window + app config
```
