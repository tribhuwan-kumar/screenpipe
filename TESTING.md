# screenpipe regression testing checklist

> **purpose**: prevent regressions. every PR touching window management, activation policy, tray, dock, monitors, or audio MUST be tested against the relevant sections below before merge.

## critical edge cases (sorted by regression frequency)

### 1. window overlay & fullscreen spaces (macOS)

these break CONSTANTLY. any change to `window_api.rs`, `main.rs` shortcuts, activation policy, or NSPanel code must test ALL of these.

commits that broke this area: `0752ea59`, `d89c5f14`, `4a64fd1a`, `fa591d6e`, `8706ae73`, `6d44af13`, `b6ff1bf7`, `09a18070`

- [ ] **overlay shortcut on fullscreen space** — press shortcut while a fullscreen app (e.g., Chrome fullscreen) is active. overlay MUST appear on top.
- [ ] **chat shortcut on fullscreen space** — press chat shortcut while on a fullscreen space. chat panel MUST appear on top. Fixed: panel pre-created at startup, show uses order_front→activate order.
- [ ] **chat shortcut on normal desktop** — chat appears, receives keyboard focus, can type immediately.
- [ ] **overlay toggle on/off** — press shortcut twice. first shows, second hides. no "ghost" window left behind.
- [ ] **chat toggle on/off** — press chat shortcut twice. first shows, second closes.
- [ ] **overlay does NOT follow space swipe** — show overlay, then three-finger swipe to another space. overlay should NOT follow you (no blink-and-disappear). was broken by `MoveToActiveSpace` staying set.
- [ ] **no blink on show** — overlay appears instantly, no flash of white/transparent then reappear. was broken multiple times (`3097872b`, `8706ae73`, `09a18070`).
- [ ] **no blink on hide** — overlay disappears instantly. no momentary reappear after hiding.
- [ ] **overlay on second monitor** — with 2 monitors, show overlay. it appears on the monitor where the mouse cursor is.
- [ ] **window mode vs fullscreen mode** — switch overlay mode in settings. shortcut still works in both modes. no crash.
- [ ] **switch modes while overlay is visible** — change from fullscreen to window mode in settings while overlay is showing. should not crash (`b4eb2ab4`).
- [ ] **keyboard focus in overlay** — show overlay, start typing. text input works immediately without clicking (`d74d0665`, `5a50aaad`).
- [ ] **keyboard focus in chat** — show chat, start typing. text input works immediately.
- [ ] **escape closes overlay** — press Escape while overlay is visible. it hides.
- [ ] **no space jump on show** — showing the overlay should NOT cause a space transition animation (`6d44af13`, `d74d0665`).
- [ ] **no space jump on hide** — hiding the overlay should NOT switch you to a different space.
- [ ] **screen recording visibility setting** — toggle "show in screen recording" in settings. overlay should appear/disappear from screen recordings accordingly (`206107ba`).
- [ ] **search panel focus** — open search, keyboard focus is in search input immediately (`2315a39c`, `1f2681e3`).
- [ ] **ghost clicks after hide** — hide overlay via `order_out`. clicking where overlay was should NOT trigger overlay buttons (`32e1a962`).
- [ ] **pinch-to-zoom works** — pinch gesture on trackpad zooms timeline without needing to click first (`d99444a7`, `523a629e`).
- [ ] **shortcut reminder on all Spaces** — switch between 3+ Spaces (including fullscreen apps). reminder pill stays visible on every Space simultaneously.
- [ ] **shortcut reminder on fullscreen app** — fullscreen Chrome/Safari, reminder shows at top center. not just leftmost Space.
- [ ] **shortcut reminder doesn't steal focus** — showing reminder never takes keyboard focus from active app.
- [ ] **chat on non-primary Space** — switch to Space 3 (normal desktop), press chat shortcut. chat appears on Space 3, not Space 1. no Space transition animation.
- [ ] **chat re-show on fullscreen Space** — show chat on fullscreen Space, hide it, show again. must reappear on same fullscreen Space.
- [ ] **space monitor only hides main overlay** — swipe Spaces. main overlay hides. chat window and shortcut reminder are unaffected.
- [ ] **space monitor doesn't race with show** — show overlay via shortcut. the `activateIgnoringOtherApps` call must not trigger space monitor's hide callback.
- [ ] **Chat streaming UX** — Verify that chat streaming uses a state-aware grid dissolve loader for a smooth user experience.

### 2. dock icon & tray icon (macOS)

commits that broke this area: `0752ea59`, `7562ec62`, `2a2bd9b5`, `f2f7f770`, `5cb100ea`

- [ ] **dock icon visible on launch** — app icon appears in dock immediately on startup.
- [ ] **tray icon visible on launch** — tray icon appears in menu bar on startup.
- [ ] **dock icon persists after overlay show/hide** — show and hide overlay 5 times. dock icon must remain visible every time. was broken by Accessory mode switches.
- [ ] **tray icon persists after overlay show/hide** — same test. tray icon must remain visible.
- [ ] **dock right-click menu works** — right-click dock icon. "Show screenpipe", "Settings", "Check for updates" all work (`d794176a`).
- [ ] **tray menu items don't fire twice** — click any tray menu item. action happens once, not twice (`9e151265`).
- [ ] **tray health indicator** — tray icon shows green (healthy) or yellow/red (issues) based on recording status.
- [ ] **tray on notched MacBook** — on 14"/16" MacBook Pro, tray icon is visible (not hidden behind notch). if hidden, user can Cmd+drag to reposition.
- [ ] **activation policy never changes** — after ANY user interaction, dock icon should remain visible. no Accessory mode switches. verify with: `ps aux | grep screenpipe`.
- [ ] **no autosave_name crash** — removed in `2a2bd9b5`. objc2→objc pointer cast was causing `panic_cannot_unwind`.
- [ ] **no recreate_tray** — recreating tray pushes icon LEFT (behind notch). must only create once (`f2f7f770`).

### 3. monitor plug/unplug

commits: `28e5c247`

- [ ] **unplug external monitor while recording** — recording continues on remaining monitor(s). no crash. log shows "Monitor X disconnected".
- [ ] **plug in external monitor while recording** — new monitor is detected within 5 seconds. recording starts on it. log shows "Monitor X reconnected".
- [ ] **unplug and replug same monitor** — recording resumes. same monitor ID reused. no duplicate recording tasks.
- [ ] **unplug all external monitors (laptop only)** — built-in display continues recording. no crash.
- [ ] **plug monitor with different resolution** — recording starts at correct resolution. OCR works on new monitor.
- [ ] **"use all monitors" setting** — with this ON, all monitors auto-detected. no manual configuration needed.
- [ ] **specific monitor IDs setting** — with specific IDs configured, only those monitors are recorded. unplugging a non-configured monitor has no effect.
- [ ] **resolution change (e.g., clamshell mode)** — closing MacBook lid with external monitor. recording continues on external.
- [ ] **queue stats after unplug** — check logs. no queue stats for disconnected monitor after disconnect.

### 4. audio device handling

- [ ] **default audio device** — with "follow system default", recording uses whatever macOS says is default.
- [ ] **plug in USB headset** — if set to follow defaults and macOS switches to headset, recording follows.
- [ ] **unplug USB headset** — recording falls back to built-in mic/speakers. no crash. no 30s timeout errors.
- [ ] **bluetooth device connect/disconnect** — AirPods connect mid-recording. audio continues without gap.
- [ ] **no audio device available** — unplug all audio. app continues (vision still works). log shows warning, not crash.
- [ ] **audio stream timeout recovery** — if audio stream times out (30s no data), it should reconnect automatically.
- [ ] **multiple audio devices simultaneously** — input (mic) + output (speakers) both recording. both show in device list.
- [ ] **disable audio setting** — toggling "disable audio" stops all audio recording. re-enabling restarts it.
- [ ] **Metal GPU for whisper** — transcription uses GPU acceleration on macOS (`f882caef`). verify with Activity Monitor GPU tab.
- [ ] **Batch transcription mode** — Verify that batch transcription mode works correctly with both cloud and Deepgram engines.

#### Audio device recovery (monitor unplug / device switch)

commits: device_monitor.rs atomic swap, tiered backoff, empty device list guard

- [ ] **unplug monitor during active Zoom call** — output audio recovers within 15 seconds. Verify: `grep "DEVICE_RECOVERY.*output.*restored" ~/.screenpipe/screenpipe-app.*.log`. Verify: `curl localhost:3030/search?content_type=audio&limit=5` shows output device transcriptions resume.
- [ ] **unplug and replug monitor within 5 seconds** — no audio gap. both input and output continue. Verify: no "stopping" log for input device.
- [ ] **unplug monitor, wait 2 minutes, replug** — output recovers both times. Verify: two `DEVICE_RECOVERY` log entries.
- [ ] **switch audio output (AirPods → speakers) during call** — output audio continues with <5s gap. Old device kept running until new one starts (atomic swap).
- [ ] **health endpoint during output recovery** — `curl localhost:3030/health` shows `device_status_details` with output device present within 15 seconds of recovery.
- [ ] **SCK transient failure doesn't cascade** — if ScreenCaptureKit returns empty device list, running devices are NOT disconnected. Verify: `grep "device list returned empty" ~/.screenpipe/screenpipe-app.*.log` shows warning but no disconnections.
- [ ] **DB gap query after device switch** — run: `sqlite3 ~/.screenpipe/db.sqlite "SELECT t1.timestamp as gap_start, t2.timestamp as gap_end, (julianday(t2.timestamp) - julianday(t1.timestamp)) * 86400 as gap_seconds FROM audio_transcriptions t1 JOIN audio_transcriptions t2 ON t2.id = (SELECT MIN(id) FROM audio_transcriptions WHERE id > t1.id AND is_input_device = 0) WHERE t1.is_input_device = 0 AND (julianday(t2.timestamp) - julianday(t1.timestamp)) * 86400 > 60 ORDER BY t1.timestamp;"` — should return no rows if output was continuously captured.

### 5. frame comparison & OCR pipeline

commits: `6dd5d98e`, `831ad258`

- [ ] **static screen = low CPU** — leave a static image on screen for 60s. CPU should drop below 5% (release build). hash early exit should kick in.
- [ ] **active screen = OCR runs** — actively browse/type. OCR results appear in search within 5 seconds of screen change.
- [ ] **identical frames skipped** — check logs for hash match frequency on idle monitors. should be >80% skip rate.
- [ ] **ultrawide monitor (3440x1440+)** — OCR works correctly. no distortion in change detection. text at edges is captured.
- [ ] **4K monitor** — OCR works. frame comparison doesn't timeout or spike CPU.
- [ ] **high refresh rate (120Hz+)** — app respects its own FPS setting (0.5 default), not the display refresh rate.
- [ ] **very fast content changes** — scroll quickly through a document. OCR captures content, no crashes from buffer overflows.
- [ ] **corrupt pixel buffer** — sck-rs handles corrupt ScreenCaptureKit buffers gracefully (no SIGABRT). fixed in `831ad258`.
- [ ] **window capture only on changed frames** — window enumeration (CGWindowList) should NOT run on skipped frames. verify by checking CPU on idle multi-monitor setup.

### 6. permissions (macOS)

commits: `d9d43d31`, `620c89a5`

- [ ] **fresh install — all prompts appear** — screen recording, microphone, accessibility prompts all show on first launch.
- [ ] **denied permission → opens System Settings** — if user previously denied mic permission, clicking "grant" opens System Settings > Privacy directly (`620c89a5`).
- [ ] **permission revoked while running** — go to System Settings, revoke screen recording. app shows red permission banner within 10 seconds.
- [ ] **permission banner is visible** — solid red `bg-destructive` banner at top of main window when any permission missing. not subtle (`9c0ba5d1`).
- [ ] **permission recovery page** — navigating to /permission-recovery shows clear instructions.
- [ ] **startup permission gate** — on first launch, permissions are requested before recording starts (`d9d43d31`).
- [ ] **faster permission polling** — permission status checked every 5-10 seconds, not 30 (`d9d43d31`).

### 7. Apple Intelligence (macOS 26+)

commits: `d4abc619`, `4f4a8282`, `31f37407`, `2223af9a`, `b34a4abd`, `303958f9`

- [ ] **macOS 26: API works** — `POST /ai/chat/completions` returns valid response using on-device Foundation Model.
- [ ] **macOS < 26: no crash** — app launches normally. FoundationModels.framework is weak-linked (`31f37407`). feature gracefully disabled.
- [ ] **Intel Mac: no crash** — Apple Intelligence not available, but app doesn't crash at DYLD load time.
- [ ] **JSON mode** — request with `response_format: { type: "json_object" }` returns valid JSON, no prose preamble (`2223af9a`).
- [ ] **JSON fallback extraction** — if model prepends prose before JSON, the `{...}` is extracted correctly (`b34a4abd`).
- [ ] **streaming (SSE)** — request with `stream: true` returns Server-Sent Events with incremental tokens (`4f4a8282`).
- [ ] **tool calling** — request with `tools` array gets tool definitions injected into prompt, model responds with tool calls (`4f4a8282`).
- [ ] **daily summary** — generates valid JSON summary from audio transcripts. no "JSON Parse error: Unexpected identifier 'Here'" (`303958f9`, `2223af9a`).
- [ ] **daily summary audio-only** — summary uses only audio data (no vision), single AI call (`303958f9`).

### 8. app lifecycle & updates

commits: `94531265`, `d794176a`, `9070639c`, `0378cab1`, `4a3313d3`

- [ ] **clean quit via tray** — right-click tray → Quit. all processes terminate. no orphaned ffmpeg/bun processes.
- [ ] **clean quit via dock** — right-click dock → Quit. same as above.
- [ ] **clean quit via Cmd+Q** — same verification.
- [ ] **force quit recovery** — force quit app. relaunch. database is intact. recording resumes.
- [ ] **sleep/wake** — close laptop lid, wait 10s, open. recording resumes within 5s. no crash (`9070639c`).
- [ ] **restart app** — quit and relaunch. all settings preserved. recording starts automatically.
- [ ] **auto-update** — when update available, UpdateBanner shows in main window. clicking it downloads and installs.
- [ ] **update without tray** — user can update via dock menu "Check for updates" or Apple menu "Check for Updates..." (`d794176a`, `94531265`).
- [ ] **update banner in main window** — when update available, banner appears at top of main window.
- [ ] **source build update dialog** — source builds show "source build detected" dialog with link to pre-built version.
- [ ] **port conflict on restart** — if old process is holding port 3030, new process kills it and starts cleanly (`0378cab1`, `4a3313d3`, `8c435a10`).
- [ ] **no orphaned processes** — after quit, `ps aux | grep screenpipe` shows nothing. `lsof -i :3030` shows nothing.
- [ ] **rollback** — user can rollback to previous version via tray menu (`c7fbc3ea`).
- [ ] **Zombie CPU drain prevention** — Verify that `lsof` calls have a 5-second timeout, preventing zombie CPU drain, especially on quit. Check logs for `lsof` timeouts if applicable.
- [ ] **Tokio shutdown stability** — Verify that the `tokio` shutdown process is stable and doesn't panic in the tree walker, especially during application exit or process restarts.

### 9. database & storage

commits: `eea0c865`, `cc09de61`

- [ ] **slow DB insert warning** — check logs. "Slow DB batch insert" warnings should be <1s in normal operation. >3s indicates contention.
- [ ] **concurrent DB access** — UI queries + recording inserts happening simultaneously. no "database is locked" errors.
- [ ] **store race condition** — rapidly toggle settings while recording is active. no crash (`eea0c865`).
- [ ] **event listener race condition** — Tauri event listener setup during rapid window creation. no crash (`cc09de61`).
- [ ] **UTF-8 boundary panic** — search with special characters, non-ASCII text in OCR results. no panic on string slicing (`eea0c865`).
- [ ] **low disk space** — with <1GB free, app should warn user. no crash from failed writes.
- [ ] **large database (>10GB)** — search still returns results within 2 seconds. app doesn't freeze on startup.
- [ ] **Audio chunk timestamps** — `start_time` and `end_time` are correctly set for reconciled and retranscribed audio chunks in the database.

### 10. AI presets & settings

commits: `8a5f51dd`, `0b0d8090`

- [ ] **Ollama not running** — creating an Ollama preset shows free-text input fields (not stuck loading). user can type model name manually (`8a5f51dd`).
- [ ] **custom provider preset** — user can add a custom API endpoint. model name is free-text input with optional autocomplete.
- [ ] **settings survive restart** — change any setting, quit, relaunch. setting is preserved.
- [ ] **overlay mode switch** — change from fullscreen to window mode. setting saves. next shortcut press uses new mode.
- [ ] **FPS setting** — change capture FPS. recording interval changes accordingly.
- [ ] **language/OCR engine setting** — change OCR language. new language used on next capture cycle.
- [ ] **video quality setting** — low/balanced/high/max. affects FFmpeg encoding params (`21bddd0f`).
- [ ] **Settings UI sentence case** — All settings UI elements (billing, pipes, team) should use consistent sentence case.

### 11. onboarding

commits: `87abb00d`, `9464fdc9`, `0f9e43aa`, `7ea15f32`

- [ ] **fresh install flow** — onboarding appears, permissions requested, user completes setup.
- [ ] **auto-advance after engine starts** — status screen advances automatically after 15-20 seconds once engine is running (`87abb00d`, `9464fdc9`).
- [ ] **skip onboarding** — user can skip and get to main app. settings use defaults.
- [ ] **shortcut gate** — onboarding teaches the shortcut. user must press it to proceed (`0f9e43aa`).
- [ ] **onboarding window size** — window is correctly sized, no overflow (`7ea15f32`).
- [ ] **onboarding doesn't re-show** — after completing onboarding, restart app. main window shows, not onboarding.

### 12. timeline & search

commits: `f1255eac`, `25cbdc6b`, `2529367d`, `d9821624`

- [ ] **arrow key navigation** — left/right arrow keys navigate timeline frames (`f1255eac`).
- [ ] **search results sorted by time** — search results appear in chronological order (`25cbdc6b`).
- [ ] **no frame clearing during navigation** — navigating timeline doesn't cause frames to disappear and reload (`2529367d`).
- [ ] **URL detection in frames** — URLs visible in screenshots are extracted and shown as clickable pills (`50ef52d1`, `aa992146`).
- [ ] **app context popover** — clicking app icon in timeline shows context (time, windows, urls, audio) (`be3ecffb`).
- [ ] **daily summary in timeline** — Apple Intelligence summary shows in timeline, compact when no summary (`d9821624`).
- [ ] **window-focused refresh** — opening app via shortcut/tray refreshes timeline data immediately (`0b057046`).
- [ ] **frame deep link navigation** — `screenpipe://frame/N` or `screenpipe://frames/N` opens main window and jumps to frame N. works from cold start; invalid IDs show clear error.
- [ ] **Keyword search accessibility** — Keyword search should find content within accessibility-only frames and utilize `frames_fts` for comprehensive accessibility text searching.
- [ ] **Keyword search logic** — Verify that keyword search SQL correctly uses `OR` instead of `UNION` within `IN()`.
- [ ] **Search prompt accuracy** — Verify that search prompts are improved to prevent false negatives from over-filtering.

### 13. sync & cloud

commits: `2f6b2af5`, `ea7f1f61`, `5cb100ea`

- [ ] **auto-remember sync password** — user doesn't have to re-enter password each time (`5cb100ea`).
- [ ] **auto-download from other devices** — after upload cycle, download new data from paired devices (`2f6b2af5`).
- [ ] **auto-init doesn't loop** — sync initialization happens once, doesn't repeat endlessly (`ea7f1f61`).
- [ ] **Cloud archive docs** — Verify that the cloud archive documentation page exists and is accessible via a link from settings.

### 14. Windows-specific

commits: `eea0c865`, `fe9060db`, `c99c3967`, `aeaa446b`, `5a219688`, `caae1ebc`, `67caf1d1`

- [ ] **COM thread conflict** — audio and vision threads don't conflict on COM initialization (`eea0c865`).
- [ ] **high-DPI display (150%, 200%)** — OCR captures at correct resolution.
- [ ] **multiple monitors** — all detected and recorded.
- [ ] **Windows Defender** — app not blocked by default security.
- [ ] **Windows default mode** — On Windows, the app should default to window mode on first launch.
- [ ] **Windows taskbar icon** — The app should display a taskbar icon on Windows.
- [ ] **Windows audio transcription accuracy** — On Windows, verify improved audio transcription accuracy due to native Silero VAD frame size and lower speech threshold.
- [ ] **Windows multi-line pipe prompts** — Multi-line pipe prompts should be preserved on Windows.

#### Windows text extraction matrix (accessibility vs OCR)

The event-driven pipeline (`paired_capture.rs`) decides per-frame whether to use accessibility tree text or OCR. Terminal apps force OCR because their accessibility tree only returns window chrome.

commits: `5a219688` (wire up Windows OCR), `caae1ebc` (prefer OCR for terminals), `67caf1d1` (no chrome fallback)

**App categories and expected behavior:**

| App category | Examples | `app_prefers_ocr` | Text source | Expected text |
|---|---|---|---|---|
| Browser | Chrome, Edge, Firefox | false | Accessibility | Full page content + chrome |
| Code editor | VS Code, Fleet | false | Accessibility | Editor content, tabs, sidebar |
| Terminal (listed) | WezTerm, Windows Terminal, Alacritty | true | Windows OCR | Terminal buffer content via screenshot |
| Terminal (unlisted) | cmd.exe, powershell.exe | false | Accessibility | Whatever UIA exposes (may be limited) |
| System UI | Explorer, taskbar, Settings | false | Accessibility | UI labels, text fields |
| Games / low-a11y apps | Games, Electron w/o a11y | false | Windows OCR (fallback) | OCR from screenshot |
| Lock screen | LockApp.exe | false | Accessibility | Time, date, battery |

**Terminal detection list** (`app_prefers_ocr` matches, case-insensitive):
`wezterm`, `iterm`, `terminal`, `alacritty`, `kitty`, `hyper`, `warp`, `ghostty`

Note: `"terminal"` matches `WindowsTerminal.exe` but NOT `cmd.exe` or `powershell.exe`.

**Test checklist:**

- [ ] **WezTerm OCR capture** — open WezTerm, type commands. search for terminal content within 30s. should return OCR text, NOT "System Minimize Restore Close" chrome.
- [ ] **Windows Terminal OCR** — same test with Windows Terminal.
- [ ] **Chrome accessibility** — open Chrome, browse a page. search returns page content from accessibility tree.
- [ ] **VS Code accessibility** — open VS Code with a file. search returns code content.
- [ ] **Game/no-a11y OCR fallback** — open an app with poor accessibility. OCR should run and extract text from screenshot.
- [ ] **OCR engine name** — query DB: OCR entries should have engine `WindowsNative` (not `AppleNative`).
- [ ] **Failed OCR = no noise** — if OCR fails for a terminal, the frame should have NULL text, not chrome like "System Minimize Restore Close".
- [ ] **Non-terminal chrome-only** — rare case where a normal app returns only chrome from accessibility. stored as-is (acceptable, no OCR fallback triggered).
- [ ] **Empty accessibility + empty OCR** — app with no tree text and OCR failure. frame stored with NULL text. no crash.
- [ ] **ocr_text table populated** — `SELECT COUNT(*) FROM ocr_text` should be non-zero after a few minutes of use on Windows.

#### Windows text extraction — untested / unknown apps

These apps are common on Windows but have **never been tested** with the event-driven pipeline. We don't know if their accessibility tree returns useful text or just chrome. Each needs manual verification: open the app, use it for a few minutes, then `curl "http://localhost:3030/search?app_name=<name>&limit=3"` and check if the text is meaningful.

**Status legend:** `?` = untested, `OK` = verified good, `CHROME` = only returns chrome, `EMPTY` = no text, `OCR-NEEDED` = should be added to `app_prefers_ocr`

| App | Status | a11y text quality | Notes |
|---|---|---|---|
| **Browsers** | | | |
| Chrome | OK | good (full page content) | 2778ch avg, rich a11y tree |
| Edge | ? | probably good | same Chromium UIA as Chrome |
| Firefox | ? | unknown | different a11y engine than Chromium |
| Brave / Vivaldi / Arc | ? | probably good | Chromium-based, needs verification |
| **Code editors** | | | |
| VS Code | ? | unknown | Electron, should have good UIA |
| JetBrains (IntelliJ, etc) | ? | unknown | Java Swing/AWT, UIA quality varies |
| Sublime Text | ? | unknown | custom UI, may need OCR fallback |
| Cursor | ? | unknown | Electron fork of VS Code |
| Zed | ? | unknown | custom GPU renderer, a11y unknown |
| **Terminals** | | | |
| WezTerm | CHROME | chrome only ("System Minimize...") | `app_prefers_ocr` = true, OCR works |
| Windows Terminal | ? | unknown | matches `"terminal"` in `app_prefers_ocr` |
| cmd.exe | ? | unknown | NOT matched by `app_prefers_ocr` |
| powershell.exe | ? | unknown | NOT matched by `app_prefers_ocr` |
| Git Bash (mintty) | ? | unknown | NOT matched by `app_prefers_ocr` |
| **Communication** | | | |
| Discord | ? | unknown | Electron, old OCR data exists |
| Slack | ? | unknown | Electron |
| Teams | ? | unknown | Electron/WebView2 |
| Zoom | ? | unknown | custom UI |
| Telegram | ? | unknown | Qt-based |
| WhatsApp | ? | unknown | Electron |
| **Productivity** | | | |
| Notion | ? | unknown | Electron |
| Obsidian | ? | unknown | Electron |
| Word / Excel / PowerPoint | ? | unknown | native Win32, historically good UIA |
| Outlook | ? | unknown | mixed native/web |
| OneNote | ? | unknown | UWP, should have good UIA |
| **Media / Creative** | | | |
| Figma | ? | unknown | Electron + canvas, likely poor a11y on canvas |
| Spotify | ? | unknown | Electron/CEF |
| VLC | ? | unknown | Qt-based |
| Adobe apps (Photoshop, etc) | ? | unknown | custom UI, historically poor a11y |
| **System / Utilities** | | | |
| Explorer | OK | good | file names, paths, status bar |
| Settings | ? | unknown | UWP, should be good |
| Task Manager | ? | unknown | UWP on Win11 |
| Notepad | ? | unknown | should have excellent UIA |
| **Games / GPU-rendered** | | | |
| Any game | ? | likely empty | GPU-rendered, no UIA tree. should fall to OCR |
| Electron w/ disabled a11y | ? | likely empty | some Electron apps disable a11y |

**Priority to test (most common user apps):**
1. VS Code — most developers will have this open
2. Discord / Slack — always running in background
3. Windows Terminal / cmd.exe / powershell.exe — verify terminal detection
4. Edge / Firefox — browser is primary use
5. Notion / Obsidian — knowledge workers
6. Office apps — enterprise users

**How to verify an app:**
```bash
# 1. Open the app, use it for 2 minutes
# 2. Check what was captured:
curl "http://localhost:3030/search?app_name=<exe_name>&limit=3&content_type=all"
# 3. If text is only chrome (System/Minimize/Close), it may need adding to app_prefers_ocr
# 4. If text is empty and screenshots exist, OCR fallback should kick in
# 5. Update this table with findings
```

**Apps that may need adding to `app_prefers_ocr` list:**
- If cmd.exe / powershell.exe return chrome-only text, add `"cmd"` and `"powershell"` to the list
- If mintty (Git Bash) returns chrome-only, add `"mintty"`
- Any app where the accessibility tree consistently returns only window chrome but screenshots contain readable text

### 15. CI / release

commits: `8f334c0a`, `fda40d2c`

- [ ] **macOS 26 runner** — release builds on self-hosted macOS 26 runner with Apple Intelligence (`fda40d2c`).
- [ ] **updater artifacts** — release includes `.tar.gz` + `.sig` for macOS, `.nsis.zip` + `.sig` for Windows.
- [ ] **prod config used** — CI copies `tauri.prod.conf.json` to `tauri.conf.json` before building. identifier is `screenpi.pe` not `screenpi.pe.dev`.
- [ ] **draft then publish** — `workflow_dispatch` creates draft. manual publish or `release-app-publish` commit publishes.

### 16. MCP / Claude integration

commits: `8c8c445c`

- [ ] **Claude connect button works** — Settings → Connections → "Connect Claude" downloads `.mcpb` file and opens it in Claude Desktop. was broken because GitHub releases API pagination didn't reach `mcp-v*` releases buried behind 30+ app releases (`8c8c445c`).
- [ ] **MCP release discovery with many app releases** — `getLatestMcpRelease()` paginates up to 5 pages (250 releases) to find `mcp-v*` tagged releases. verify it works even when >30 app releases exist since last MCP release.
- [ ] **Claude Desktop not installed** — clicking connect shows a useful error, not a silent failure.
- [ ] **MCP version display** — Settings shows the available MCP version and whether it's already installed.
- [ ] **macOS Claude install flow** — downloads `.mcpb`, opens Claude Desktop, waits 1.5s, then opens the `.mcpb` file to trigger Claude's install modal.
- [ ] **Windows Claude install flow** — same flow using `cmd /c start` instead of `open -a`.
- [ ] **download error logging** — if download fails, console shows actual error message (not `{}`).

### 17. AI Agents / Pipes

commits: `fa887407`, `815f52e6`, `60840155`, `e66c5ff8`, `c905ffbf`, `01147096`, `5908d7f4`, `46422869`, `4f43da70`, `71a1a537`, `6abaaa36`

- [ ] **Pi process stability** — After app launch, `ps aux | grep pi` should show a single, stable `pi` process that doesn't restart or get killed.
- [ ] **Pi readiness handshake** — First chat interaction with Pi should be fast (<2s for readiness).
- [ ] **Pi auto-recovery** — If the `pi` process is manually killed, it should restart automatically within a few seconds and be ready for chat.
- [ ] **Pipe output accuracy** — When executing a pipe, the user's prompt should be accurately reflected in the output.
- [ ] **Silent LLM errors** — LLM errors during pipe execution should be displayed to the user, not silently suppressed.
- [ ] **Fast first chat with Pi** — The first interaction with Pi after app launch should be responsive, with no noticeable delay (aim for <2s).
- [ ] **Activity Summary tool** — MCP can access activity summaries via the `activity-summary` tool, and the `activity-summary` endpoint works correctly.
- [ ] **Search Elements tool** — MCP can search elements using the `search-elements` tool.
- [ ] **Frame Context tool** — MCP can access frame context via the `frame-context` tool.
- [ ] **Progressive disclosure for AI data** — AI data querying should progressively disclose information.
- [ ] **Screenpipe Analytics skill** — The `screenpipe-analytics` skill can be used by the Pi agent to perform raw SQL usage analytics.
- [ ] **Screenpipe Retranscribe skill** — The `screenpipe-retranscribe` skill can be used by the Pi agent for retranscription.
- [ ] **AI preset save stability** — Saving AI presets should not cause crashes, especially when dealing with pipe session conflicts.
- [ ] **Pipe token handling** — Ensure that Pi configuration for pipes uses the actual token value, not the environment variable name.
- [ ] **Pipe user_token passthrough** — Verify that the `user_token` is correctly passed to Pi pre-configuration so pipes use the screenpipe provider.
- [ ] **Default AI model ID** — Verify that the default AI model ID does not contain outdated date suffixes.
- [ ] **Move provider/model flags** — `--provider` and `--model` flags should be correctly moved before `-p prompt` in `pi spawn` commands.

### 18. Admin / Team features

commits: `58460e02`

- [ ] **Admin team-shared filters** — Admins should be able to remove individual team-shared filters.

### 19. Logging

commits: `fc830b43`

- [ ] **Reduced log noise** — Verify a significant reduction in log noise (~54%).
- [ ] **PII scrubbing** — Ensure that PII (Personally Identifiable Information) is scrubbed from logs.

## how to run

### before every release
1. run sections 1-4 completely (90% of regressions)
2. spot-check sections 5-10
3. if Apple Intelligence code changed, run section 7

### before merging window/tray/dock changes
run section 1 and 2 completely. these are the most fragile.

### before merging vision/OCR changes
run section 3, 5, and 14 (Windows text extraction matrix) completely.

### before merging audio changes
run section 4 completely.

### before merging AI/Apple Intelligence changes
run section 7 and 10.

## known limitations (not bugs)

- tray icon on notched MacBooks can end up behind the notch if menu bar is crowded. Cmd+drag to reposition. dock menu is the fallback.
- macOS only shows permission prompts once (NotDetermined → Denied is permanent). must use System Settings to re-grant.
- debug builds use ~3-5x more CPU than release builds for vision pipeline.
- first frame after app launch always triggers OCR (intentional — no previous frame to compare against).
- chat panel is pre-created hidden at startup so it exists before user presses the shortcut. Creation no longer activates/shows — only the show_existing path does (matching main overlay pattern).
- shortcut reminder should use `CanJoinAllSpaces` (visible on all Spaces simultaneously). chat and main overlay should use `MoveToActiveSpace` (moved to current Space on show, then flag removed to pin).

## log locations

```
macOS:   ~/.screenpipe/screenpipe-app.YYYY-MM-DD.log
Windows: %USERPROFILE%\.screenpipe\screenpipe-app.YYYY-MM-DD.log
Linux:   ~/.screenpipe/screenpipe-app.YYYY-MM-DD.log
```

### what to grep for

```bash
# crashes/errors
grep -E "panic|SIGABRT|ERROR|error" ~/.screenpipe/screenpipe-app.*.log

# monitor events
grep -E "Monitor.*disconnect|Monitor.*reconnect|Starting vision" ~/.screenpipe/screenpipe-app.*.log

# frame skip rate (debug level only)
grep "Hash match" ~/.screenpipe/screenpipe-app.*.log

# queue health
grep "Queue stats" ~/.screenpipe/screenpipe-app.*.log

# DB contention
grep "Slow DB" ~/.screenpipe/screenpipe-app.*.log

# audio issues
grep -E "audio.*timeout|audio.*error|device.*disconnect" ~/.screenpipe/screenpipe-app.*.log

# window/overlay issues
grep -E "show_existing|panel.*level|Accessory|activation_policy" ~/.screenpipe/screenpipe-app.*.log

# Apple Intelligence
grep -E "FoundationModels|apple.intelligence|fm_generate" ~/.screenpipe/screenpipe-app.*.log
```

### 12. mainland china / great firewall

- [ ] **full app functionality behind GFW** — download, onboarding, AI chat, cloud features, and update checks must all work (or degrade gracefully) on networks subject to the Great Firewall.
