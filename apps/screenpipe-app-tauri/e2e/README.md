# E2E Tests

Cross-platform E2E for Screenpipe using [tauri-plugin-webdriver](https://crates.io/crates/tauri-plugin-webdriver). macOS, Windows, Linux.

## Run

From `apps/screenpipe-app-tauri`:

**1. Build**

```bash
bun tauri build --no-sign --debug --verbose --no-bundle -- --features e2e
```

- `--no-sign` — skip code signing (dev)
- `--debug` — debug build, faster than release
- `--verbose` — show build output
- `--no-bundle` — binary only, no installer
- `-- --features e2e` — enable WebDriver plugin

**2. Run tests**

```bash
bun run test:e2e
```

**Or combined (build + test):**

```bash
./e2e/run.sh
```

Uses `.e2e/` as isolated data dir; real data is never touched.

## Video recording

macOS / Linux:

```bash
RECORD_VIDEO=1 bun run test:e2e
```

Windows PowerShell:

```powershell
$env:RECORD_VIDEO="1"; bun run test:e2e
```

Windows cmd:

```cmd
set RECORD_VIDEO=1 && bun run test:e2e
```

Saves to `e2e/videos/`.
