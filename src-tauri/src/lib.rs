// PlayMarkets — Tauri backend. (live quotes via Yahoo Finance; day/week/month)
// Each market is stored as one plain Markdown file on disk with a small
// YAML-style frontmatter block for its metadata, followed by the notes body.
//
//   ---
//   name: Crude Oil
//   symbol: CL
//   category: Energy
//   price: 78.42
//   change: 1.23
//   ---
//   Supply draw reported by EIA this week ...

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Default)]
struct Market {
    id: String,
    name: String,
    symbol: String,
    #[serde(default)]
    quote: String, // Yahoo Finance ticker for live prices (e.g. CL=F); falls back to `symbol`
    category: String,
    #[serde(default)]
    target: String, // optional alert threshold; flagged when live price rises above it
    #[serde(default)]
    price: String,
    #[serde(rename = "changeDay", default)]
    change_day: String,
    #[serde(rename = "changeWeek", default)]
    change_week: String,
    #[serde(rename = "changeMonth", default)]
    change_month: String,
    body: String,
    #[serde(rename = "modifiedMs", default)]
    modified_ms: Option<u64>,
}

/// Returns the folder where market `.md` files live, creating it if needed.
/// Defaults to `<Documents>/Market Notes`, falling back to the app data dir.
fn markets_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("Market Notes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Turns a display name into a safe filename stem, e.g. "Crude Oil" -> "crude-oil".
fn slugify(name: &str) -> String {
    let mut s = String::new();
    let mut prev_dash = false;
    for c in name.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            s.push(c);
            prev_dash = false;
        } else if !s.is_empty() && !prev_dash {
            s.push('-');
            prev_dash = true;
        }
    }
    while s.ends_with('-') {
        s.pop();
    }
    if s.is_empty() {
        s.push_str("market");
    }
    s
}

/// Keeps an incoming id safe to use as a filename (defends against traversal).
fn sanitize_id(id: &str) -> String {
    let s: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if s.is_empty() {
        "market".to_string()
    } else {
        s
    }
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let dur = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(dur.as_millis() as u64)
}

fn write_market(dir: &Path, m: &Market) -> Result<(), String> {
    let clean = |v: &str| v.replace(['\r', '\n'], " ");
    let content = format!(
        "---\nname: {}\nsymbol: {}\nquote: {}\ncategory: {}\ntarget: {}\nprice: {}\nchangeDay: {}\nchangeWeek: {}\nchangeMonth: {}\n---\n{}",
        clean(&m.name),
        clean(&m.symbol),
        clean(&m.quote),
        clean(&m.category),
        clean(&m.target),
        clean(&m.price),
        clean(&m.change_day),
        clean(&m.change_week),
        clean(&m.change_month),
        m.body
    );
    let path = dir.join(format!("{}.md", sanitize_id(&m.id)));
    fs::write(&path, content).map_err(|e| e.to_string())
}

fn parse_market(path: &Path) -> Option<Market> {
    let id = path.file_stem()?.to_string_lossy().to_string();
    let raw = fs::read_to_string(path).ok()?.replace("\r\n", "\n");

    let mut m = Market {
        id: id.clone(),
        name: id, // fallback if frontmatter lacks a name
        ..Default::default()
    };

    if let Some(rest) = raw.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let front = &rest[..end];
            let after = &rest[end + 4..]; // skip the closing "\n---"
            m.body = after.strip_prefix('\n').unwrap_or(after).to_string();
            for line in front.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let val = v.trim().to_string();
                    match k.trim() {
                        "name" => m.name = val,
                        "symbol" => m.symbol = val,
                        "quote" => m.quote = val,
                        "category" => m.category = val,
                        "target" => m.target = val,
                        "price" => m.price = val,
                        "changeDay" | "change" => m.change_day = val, // "change" = legacy key
                        "changeWeek" => m.change_week = val,
                        "changeMonth" => m.change_month = val,
                        _ => {}
                    }
                }
            }
        } else {
            m.body = raw;
        }
    } else {
        m.body = raw;
    }

    m.modified_ms = mtime_ms(path);
    Some(m)
}

#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(markets_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn list_markets(app: tauri::AppHandle) -> Result<Vec<Market>, String> {
    let dir = markets_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Some(m) = parse_market(&path) {
                out.push(m);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
fn create_market(
    app: tauri::AppHandle,
    name: String,
    symbol: String,
    category: String,
) -> Result<Market, String> {
    let dir = markets_dir(&app)?;
    let base = slugify(&name);
    let mut id = base.clone();
    let mut n = 2;
    while dir.join(format!("{}.md", id)).exists() {
        id = format!("{}-{}", base, n);
        n += 1;
    }
    let m = Market {
        id,
        name: name.trim().to_string(),
        symbol: symbol.trim().to_string(),
        category: category.trim().to_string(),
        ..Default::default()
    };
    write_market(&dir, &m)?;
    let path = dir.join(format!("{}.md", m.id));
    Ok(parse_market(&path).unwrap_or(m))
}

#[tauri::command]
fn save_market(app: tauri::AppHandle, market: Market) -> Result<Market, String> {
    let dir = markets_dir(&app)?;
    write_market(&dir, &market)?;
    let path = dir.join(format!("{}.md", sanitize_id(&market.id)));
    Ok(parse_market(&path).unwrap_or(market))
}

#[tauri::command]
fn delete_market(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = markets_dir(&app)?;
    let path = dir.join(format!("{}.md", sanitize_id(&id)));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn reveal_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = markets_dir(&app)?;
    let path = dir.into_os_string();

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("explorer");
        c.arg(&path);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&path);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&path);
        c
    };

    // explorer.exe frequently exits non-zero even on success, so we only care
    // that the process could be spawned at all.
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

// ---------- Live quotes (Yahoo Finance) ----------
// Uses Yahoo's public (unofficial) chart endpoint. No API key required, but it
// needs a browser-like User-Agent and can change/throttle without notice.

#[derive(Deserialize)]
struct QuoteReq {
    id: String,
    symbol: String,
}

#[derive(Serialize)]
struct Quote {
    id: String,
    price: Option<f64>,
    #[serde(rename = "changeDay")]
    change_day: Option<f64>,
    #[serde(rename = "changeWeek")]
    change_week: Option<f64>,
    #[serde(rename = "changeMonth")]
    change_month: Option<f64>,
    error: Option<String>,
}

struct QuoteData {
    price: f64,
    day: Option<f64>,
    week: Option<f64>,
    month: Option<f64>,
}

const YAHOO_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
    (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn pct_change(current: f64, reference: f64) -> Option<f64> {
    if reference != 0.0 {
        Some(round2((current - reference) / reference * 100.0))
    } else {
        None
    }
}

/// Reference close ~`days` calendar days before `last_ts`. `points` must be
/// ascending by timestamp; returns the last close at or before the target
/// (robust to weekends/holidays), falling back to the earliest available.
fn close_days_back(points: &[(i64, f64)], last_ts: i64, days: i64) -> Option<f64> {
    let target = last_ts - days * 86_400;
    let mut best = None;
    for &(ts, close) in points {
        if ts <= target {
            best = Some(close);
        }
    }
    best.or_else(|| points.first().map(|&(_, c)| c))
}

async fn fetch_one(client: &reqwest::Client, req: QuoteReq) -> Quote {
    let sym = req.symbol.trim();
    if sym.is_empty() {
        return Quote {
            id: req.id,
            price: None,
            change_day: None,
            change_week: None,
            change_month: None,
            error: Some("no symbol".into()),
        };
    }
    let enc = sym.replace('^', "%5E");
    // 3 months of daily candles gives us enough history for day/week/month.
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=3mo",
        enc
    );
    match do_fetch(client, &url).await {
        Ok(d) => Quote {
            id: req.id,
            price: Some(d.price),
            change_day: d.day,
            change_week: d.week,
            change_month: d.month,
            error: None,
        },
        Err(e) => Quote {
            id: req.id,
            price: None,
            change_day: None,
            change_week: None,
            change_month: None,
            error: Some(e),
        },
    }
}

async fn do_fetch(client: &reqwest::Client, url: &str) -> Result<QuoteData, String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let result = &v["chart"]["result"][0];
    let meta = &result["meta"];

    let price = meta["regularMarketPrice"]
        .as_f64()
        .ok_or_else(|| "no price in response".to_string())?;

    // Build ascending (timestamp, close) points from the daily series.
    let mut points: Vec<(i64, f64)> = Vec::new();
    if let (Some(ts), Some(closes)) = (
        result["timestamp"].as_array(),
        result["indicators"]["quote"][0]["close"].as_array(),
    ) {
        for (t, c) in ts.iter().zip(closes.iter()) {
            if let (Some(t), Some(c)) = (t.as_i64(), c.as_f64()) {
                points.push((t, c));
            }
        }
    }

    // Compute every horizon from the daily history vs the live price.
    // NOTE: meta.chartPreviousClose is relative to the START of the requested
    // range (~3 months ago), so it must NOT be used for the daily change.
    let (day, week, month) = match points.last() {
        Some(&(last_ts, _)) => (
            close_days_back(&points, last_ts, 1).and_then(|r| pct_change(price, r)),
            close_days_back(&points, last_ts, 7).and_then(|r| pct_change(price, r)),
            close_days_back(&points, last_ts, 30).and_then(|r| pct_change(price, r)),
        ),
        None => (None, None, None),
    };

    Ok(QuoteData {
        price: round2(price),
        day,
        week,
        month,
    })
}

#[tauri::command]
async fn fetch_quotes(requests: Vec<QuoteReq>) -> Result<Vec<Quote>, String> {
    let client = reqwest::Client::builder()
        .user_agent(YAHOO_UA)
        .build()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(requests.len());
    for req in requests {
        out.push(fetch_one(&client, req).await);
    }
    Ok(out)
}

// ---------- Login gate ----------
// Note: these credentials live in the binary, so this is a light access gate,
// not strong security. Anyone with the files could recover them.
const LOGIN_USERNAME: &str = "Varol";
const LOGIN_PASSWORD: &str = "ResearchAndPlay";

// Auth lives in the running process, so it survives webview reloads but resets
// when the app is actually re-launched (a fresh process starts at `false`).
struct AuthState(Mutex<bool>);

#[tauri::command]
fn login(state: tauri::State<AuthState>, username: String, password: String) -> bool {
    let ok = username == LOGIN_USERNAME && password == LOGIN_PASSWORD;
    if ok {
        *state.0.lock().unwrap() = true;
    }
    ok
}

#[tauri::command]
fn is_authenticated(state: tauri::State<AuthState>) -> bool {
    *state.0.lock().unwrap()
}

// ---------- Desktop notifications ----------

#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AuthState(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            list_markets,
            create_market,
            save_market,
            delete_market,
            reveal_data_dir,
            fetch_quotes,
            notify,
            login,
            is_authenticated
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
