# PlayMarkets

A small desktop app for tracking markets and keeping research notes on each one.
Markets live in the left sidebar (grouped by category); each one gets its own
notes pane for past findings and current events. Notes autosave as you type, and
prices update live from Yahoo Finance.

Built with [Tauri](https://tauri.app) (native desktop) + vanilla HTML/CSS/JS.

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
target: 60
price: 68.78
changeDay: 0.13
changeWeek: -0.65
changeMonth: -28.37
---
Supply draw reported by EIA this week ...
```

The only fields you edit are `name`, `symbol`, `quote`, `category`, and
`target` (via the Add/Edit dialog). The `price` and `changeDay/Week/Month`
fields are **filled in automatically** from live data — see below.

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

## Target-price alerts

Give a market an optional **Target price** in the Add/Edit dialog. When its live
price rises **above** that value:

- a **green pulsing dot** appears beside the row in the sidebar, and
- a **desktop notification** fires — on launch, then **every 4 hours** while any
  market remains above its target (one notification summarising all of them).

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
