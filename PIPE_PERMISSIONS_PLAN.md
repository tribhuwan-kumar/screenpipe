# Pipe Data Permissions — Implementation Plan

## What Pi Is

Pi is a coding agent (like Claude Code) built on [badlogic/pi-mono](https://github.com/badlogic/pi-mono). Screenpipe spawns Pi as a subprocess to run pipes. Pi has:

- **4 built-in tools**: `read`, `write`, `edit`, `bash`
- **Skills**: Markdown files (`.pi/skills/`) that teach Pi to use bash+curl to call APIs
- **Extensions**: TypeScript modules (`.pi/extensions/`) that can register tools, intercept tool calls, modify tool results, inject system prompt context, and more
- **Lifecycle events**: `tool_call` (can block), `tool_result` (can modify), `before_agent_start` (can inject system prompt), `tool_execution_start/end`, etc.

Screenpipe already ships one extension: `web-search.ts` — registers a `web_search` tool. Skills like `screenpipe-search` and `screenpipe-analytics` teach Pi to use `bash` + `curl` against `localhost:3030`.

## How Pipes Access Data Today

All data access goes through Pi's **`bash` tool** running `curl` against the local screenpipe HTTP API. The LLM learns the API from skills (SKILL.md files). There's no auth on the local API — any `curl` call works.

**Data access vectors (all via bash+curl):**

| Endpoint | What it exposes | Taught by skill |
|----------|----------------|-----------------|
| `GET /search` | OCR, audio, input, accessibility | screenpipe-search |
| `POST /raw_sql` | Arbitrary SELECT on all tables | screenpipe-analytics |
| `GET /frames/{id}` | Raw screenshots | screenpipe-media |
| `GET /activity-summary` | App usage stats | screenpipe-search |
| `GET /elements` | UI accessibility tree | screenpipe-elements |
| `GET /speakers/*` | Speaker data | screenpipe-search |
| `GET /keywords-search` | Keyword search | screenpipe-search |

## Design: Pi Extension + Server Middleware (Defense in Depth)

Two enforcement layers:

1. **Pi extension** (`screenpipe-permissions.ts`) — intercepts `tool_call` events on `bash`, parses curl commands, blocks/rewrites forbidden requests. Also injects permission rules into the system prompt so the LLM self-regulates.

2. **Server middleware** (axum layer) — validates a per-pipe token on every HTTP request, enforces the same rules server-side. Safety net in case the LLM bypasses the extension (e.g., constructs a request the parser doesn't catch).

The extension is the **primary** enforcement. The middleware is the **backstop**.

---

## 1. Frontmatter Schema

Same fields as the [issue](https://github.com/screenpipe/screenpipe/issues/2322), plus a few additions:

```yaml
---
schedule: every 1h
enabled: true
model: claude-haiku-4-5
# Data permissions
allow-apps:
  - "Slack"
  - "VS Code"
deny-apps:
  - "1Password"
  - "Signal"
allow-windows:
  - "*meeting*"
deny-windows:
  - "*incognito*"
  - "*bank*"
allow-content-types:
  - "ocr"
  - "audio"
deny-content-types:
  - "input"
time-range: "09:00-17:00"
days: "Mon,Tue,Wed,Thu,Fri"
allow-raw-sql: false        # default false — raw_sql bypasses all filters
allow-frames: true          # default true — screenshot access
---
```

**PipeConfig changes** in `crates/screenpipe-core/src/pipes/mod.rs`:

```rust
pub struct PipeConfig {
    // ... existing fields ...
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow_apps: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny_apps: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow_windows: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny_windows: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow_content_types: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny_content_types: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_range: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub days: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub allow_raw_sql: bool,
    #[serde(default = "default_true", skip_serializing_if = "is_true")]
    pub allow_frames: bool,
}
```

**Rules:**
- deny always wins over allow
- empty allow = allow all
- no permission fields = allow everything (backwards compatible)

---

## 2. Pi Extension: `screenpipe-permissions.ts`

**New file:** `crates/screenpipe-core/assets/extensions/screenpipe-permissions.ts`

This is the core of the implementation. It uses Pi's extension API to:

### 2.1 Read permissions from env

Screenpipe passes the resolved permissions as a JSON env var:

```typescript
const PERMS = JSON.parse(process.env.SCREENPIPE_PIPE_PERMISSIONS || "{}");
```

Env var set by `PiExecutor` before spawning. Contains:
```json
{
  "allow_apps": ["slack", "vs code"],
  "deny_apps": ["1password", "signal"],
  "allow_windows": ["*meeting*"],
  "deny_windows": ["*incognito*", "*bank*"],
  "allow_content_types": ["ocr", "audio"],
  "deny_content_types": ["input"],
  "time_range": "09:00-17:00",
  "days": ["Mon","Tue","Wed","Thu","Fri"],
  "allow_raw_sql": false,
  "allow_frames": true,
  "pipe_token": "sp_pipe_abc123"
}
```

### 2.2 Inject system prompt rules

Use `before_agent_start` to append permission context to the system prompt:

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  if (!hasPermissions()) return;

  const rules = buildPermissionRulesText(PERMS);
  return {
    systemPrompt: event.systemPrompt + `\n\n## Data Access Permissions\n${rules}\n`
  };
});
```

This makes the LLM aware of restrictions (e.g., "You MUST NOT query data from 1Password or Signal. You can only access OCR and audio content types."). The LLM will self-regulate in most cases — the `tool_call` interception is the hard enforcement.

### 2.3 Intercept `bash` tool calls

Use `tool_call` event to inspect every bash command before execution:

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (!isToolCallEventType("bash", event)) return;

  const cmd = event.input.command;
  const violation = checkBashCommand(cmd, PERMS);

  if (violation) {
    return {
      block: true,
      reason: `Permission denied: ${violation}`
    };
  }
});
```

### 2.4 `checkBashCommand()` — Parse and validate

This function parses the bash command to detect screenpipe API calls:

```typescript
function checkBashCommand(cmd: string, perms: Permissions): string | null {
  // Detect curl/wget/fetch calls to localhost:PORT
  const apiCallMatch = cmd.match(
    /curl\s.*localhost[:\d]*\/|wget\s.*localhost[:\d]*\/|fetch\s*\(\s*['"]http:\/\/localhost/
  );
  if (!apiCallMatch) return null; // not an API call, allow

  // Parse the URL and parameters
  const url = extractUrlFromCurl(cmd);
  if (!url) return null;

  const endpoint = new URL(url).pathname;
  const params = new URL(url).searchParams;

  // --- Endpoint-level checks ---

  // Block raw_sql if not allowed
  if (endpoint === "/raw_sql" && !perms.allow_raw_sql) {
    return "raw SQL access is not permitted for this pipe";
  }

  // Block frames if not allowed
  if (endpoint.startsWith("/frames") && !perms.allow_frames) {
    return "screenshot/frame access is not permitted for this pipe";
  }

  // Block mutation endpoints always
  if (isMutationEndpoint(endpoint)) {
    return "data mutation is not permitted for pipes";
  }

  // --- Parameter-level checks (for /search, /activity-summary, etc.) ---

  // Check app_name param
  const appName = params.get("app_name");
  if (appName && !isAppAllowed(appName, perms)) {
    return `access to app "${appName}" is denied`;
  }

  // Check content_type param
  const contentType = params.get("content_type");
  if (contentType && contentType !== "all" && !isContentTypeAllowed(contentType, perms)) {
    return `content type "${contentType}" is denied`;
  }

  // For POST requests, also parse the JSON body from -d flag
  const body = extractJsonBody(cmd);
  if (body) {
    // Check raw_sql query for table references (best effort)
    if (endpoint === "/raw_sql" && perms.allow_raw_sql) {
      // raw_sql is allowed, but we can warn about denied content types
      // (can't reliably enforce — this is why allow_raw_sql is opt-in)
    }
  }

  return null; // allowed
}
```

### 2.5 Inject auth header into allowed requests

Use `tool_result` or rewrite the command in `tool_call` to append the pipe token header:

```typescript
// In tool_call handler, if allowed, rewrite curl to include auth:
if (isCurlToScreenpipe(cmd) && PERMS.pipe_token) {
  const rewritten = injectAuthHeader(cmd, PERMS.pipe_token);
  // Return modified input
  event.input.command = rewritten;
}
```

This ensures the server-side middleware can identify which pipe is making the request.

### 2.6 Helper functions

```typescript
function isAppAllowed(app: string, perms: Permissions): boolean {
  const lower = app.toLowerCase();
  if (perms.deny_apps.some(d => d.toLowerCase() === lower)) return false;
  if (perms.allow_apps.length === 0) return true;
  return perms.allow_apps.some(a => a.toLowerCase() === lower);
}

function isContentTypeAllowed(ct: string, perms: Permissions): boolean {
  if (perms.deny_content_types.includes(ct)) return false;
  if (perms.allow_content_types.length === 0) return true;
  return perms.allow_content_types.includes(ct);
}

function globMatch(pattern: string, text: string): boolean {
  // Convert glob to regex: * → .*, ? → .
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + "$",
    "i"
  );
  return regex.test(text);
}

function isMutationEndpoint(path: string): boolean {
  const blocked = ["/data/delete-range", "/audio/retranscribe",
                   "/speakers/merge", "/speakers/reassign"];
  return blocked.some(b => path.startsWith(b));
}
```

---

## 3. Server-Side Middleware (Backstop)

**Why needed even with the extension:**
- The LLM could construct a curl command the extension parser doesn't catch (encoded URLs, variable expansion, heredocs, piped commands, etc.)
- The LLM could use `wget`, `python -c "import requests..."`, `node -e "fetch(...)"`, or other tools
- Defense in depth — the extension is best-effort parsing, the server is authoritative

### 3.1 Token Registry

Add to `AppState` in `crates/screenpipe-server/src/server.rs`:

```rust
pub pipe_permissions: Arc<DashMap<String, Arc<PipePermissions>>>,
```

### 3.2 `PipePermissions` struct

**New file:** `crates/screenpipe-core/src/pipes/permissions.rs`

```rust
pub struct PipePermissions {
    pub pipe_name: String,
    pub allow_apps: Vec<String>,        // lowercased
    pub deny_apps: Vec<String>,         // lowercased
    pub allow_windows: Vec<String>,     // glob patterns
    pub deny_windows: Vec<String>,      // glob patterns
    pub allow_content_types: HashSet<String>,
    pub deny_content_types: HashSet<String>,
    pub time_range: Option<(NaiveTime, NaiveTime)>,
    pub days: Option<HashSet<Weekday>>,
    pub allow_raw_sql: bool,
    pub allow_frames: bool,
    pub expires_at: DateTime<Utc>,
}
```

Methods: `from_config()`, `is_app_allowed()`, `is_window_allowed()`, `is_content_type_allowed()`, `is_time_allowed()`, `check_item_allowed()`.

### 3.3 Middleware

**New file:** `crates/screenpipe-server/src/pipe_permissions_middleware.rs`

```rust
async fn pipe_permissions_layer(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Response {
    // Extract Bearer sp_pipe_* token
    if let Some(token) = extract_pipe_token(&req) {
        match state.pipe_permissions.get(&token) {
            Some(perms) if perms.expires_at > Utc::now() => {
                req.extensions_mut().insert(perms.value().clone());
            }
            _ => return (StatusCode::UNAUTHORIZED, "invalid/expired pipe token").into_response(),
        }
    }
    // No token = user/app request, no restrictions
    next.run(req).await
}
```

### 3.4 Per-Endpoint Enforcement

Each handler extracts `Option<Arc<PipePermissions>>` from request extensions:

| Endpoint | Enforcement |
|----------|------------|
| `GET /search` | Pre-filter: clamp content_type, app_name. Post-filter: remove results from denied apps/windows/times |
| `POST /raw_sql` | Gate: 403 if `allow_raw_sql == false` |
| `GET /frames/*` | Gate: 403 if `allow_frames == false`. Post-check: frame's app/window against permissions |
| `GET /activity-summary` | Post-filter: remove denied apps from summary |
| `GET /elements` | Post-filter: remove denied apps/windows |
| `GET /speakers/*` | Gate: 403 if audio is in deny_content_types |
| `POST /data/delete-range` | Blanket 403 for any pipe token |
| `POST /audio/retranscribe` | Blanket 403 for any pipe token |
| WebSocket endpoints | Filter events in real-time or block connection |

**Post-filtering is critical** — even if a pipe requests `/search?content_type=all`, the server strips results from denied apps/windows/content types before returning.

---

## 4. Token Flow

### 4.1 Generation (PipeManager)

In `start_pipe_background()` (`crates/screenpipe-core/src/pipes/mod.rs`):

1. Parse `PipePermissions::from_config(&config)`
2. Generate token: `format!("sp_pipe_{}", nanoid::nanoid!(32))`
3. Register `(token, perms)` in the shared `pipe_permissions` DashMap
4. Serialize perms + token to JSON for the env var
5. Pass to executor

### 4.2 Injection (PiExecutor)

In `crates/screenpipe-core/src/agents/pi.rs`, `spawn_pi_streaming()`:

```rust
cmd.env("SCREENPIPE_PIPE_PERMISSIONS", &permissions_json);
```

The extension reads this env var at load time.

### 4.3 Cleanup

When pipe execution finishes (in `finish_execution` flow), remove the token from the DashMap.

---

## 5. Extension Installation

In `crates/screenpipe-core/src/agents/pi.rs`, alongside `ensure_screenpipe_skill()` and `ensure_web_search_extension()`:

```rust
pub fn ensure_permissions_extension(
    project_dir: &Path,
    config: &PipeConfig,
) -> Result<()> {
    let ext_dir = project_dir.join(".pi").join("extensions");
    let ext_path = ext_dir.join("screenpipe-permissions.ts");

    let has_any_permissions = !config.allow_apps.is_empty()
        || !config.deny_apps.is_empty()
        || !config.allow_windows.is_empty()
        || !config.deny_windows.is_empty()
        || !config.allow_content_types.is_empty()
        || !config.deny_content_types.is_empty()
        || config.time_range.is_some()
        || config.days.is_some()
        || !config.allow_raw_sql  // default false = has restriction
        || !config.allow_frames;   // default true, false = has restriction

    if has_any_permissions {
        std::fs::create_dir_all(&ext_dir)?;
        std::fs::write(&ext_path, include_str!("../../assets/extensions/screenpipe-permissions.ts"))?;
    } else if ext_path.exists() {
        // No permissions configured, remove extension
        std::fs::remove_file(&ext_path)?;
    }

    Ok(())
}
```

### 5.1 Conditional Skill Installation

Also gate skill installation based on permissions:

- `allow_raw_sql == false` → **don't install** `screenpipe-analytics` skill (teaches `/raw_sql`)
- `allow_frames == false` → **don't install** `screenpipe-media` skill
- `deny_content_types` contains "audio" → **don't install** `screenpipe-retranscribe` skill
- `deny_content_types` contains "accessibility" → **don't install** `screenpipe-elements` skill

This way the LLM doesn't even know these endpoints exist.

---

## 6. Edge Cases

### 6.1 LLM bypasses curl parsing

**Problem:** LLM writes `python3 -c "import urllib.request; ..."` or `node -e "fetch(...)"` or uses bash variable expansion to construct URLs.

**Mitigations:**
1. Extension intercepts ALL bash commands and checks for any localhost:PORT pattern, not just curl
2. Server middleware is the hard backstop — without the auth token header, the server still allows the request (backwards compat), but WITH the token, permissions are enforced
3. The extension rewrites curl commands to include the token. Non-curl approaches won't have the token, so:
   - **Option A (strict):** Server rejects requests without a valid token when `pipe_permissions` map is non-empty (i.e., at least one pipe is running with permissions). Too aggressive — breaks the app itself.
   - **Option B (recommended):** The extension blocks any bash command that hits localhost:PORT and isn't a recognized curl pattern. This is a whitelist approach: only `curl` commands to the screenpipe API are allowed, and they must be parseable.

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (!isToolCallEventType("bash", event)) return;
  const cmd = event.input.command;

  // If it hits screenpipe API but isn't a curl we can parse → block
  if (hitsScreenpipeApi(cmd) && !isParsableCurl(cmd)) {
    return {
      block: true,
      reason: "Use curl to access the Screenpipe API. Other HTTP clients are not supported with data permissions."
    };
  }

  // ... rest of permission checks ...
});
```

### 6.2 Pipe modifies its own pipe.md

Permissions are read at execution start, serialized into the env var. Mid-run changes don't affect the current run's permissions. Next run picks up the new config.

### 6.3 Time range crossing midnight

`time_range: "22:00-06:00"` → `start > end` means wrap around midnight:

```typescript
function isTimeInRange(time: string, range: string): boolean {
  const [start, end] = range.split("-").map(parseTime);
  const t = parseTime(time);
  if (start <= end) return t >= start && t <= end;
  return t >= start || t <= end; // wraps midnight
}
```

### 6.4 Timezone for time_range/days

Evaluated in user's local timezone (same as prompt header). The permissions JSON includes the timezone offset at generation time.

### 6.5 `content_type=all` with partial deny

If LLM requests `content_type=all` but `deny_content_types: ["input"]`:
- Extension: allow the request (can't filter curl response)
- Server middleware: post-filter response to remove `input` type results

### 6.6 Backwards compatibility

- No permission fields in frontmatter → no extension installed, no token generated, no restrictions
- Old pipes unaffected
- Server without middleware (older version) + extension → extension still blocks at Pi level

### 6.7 CLI pipe runs

`screenpipe pipe run` doesn't go through the server. No token generated, no middleware. Extension still works if `SCREENPIPE_PIPE_PERMISSIONS` env var is set. For v1: CLI runs are unfiltered (power-user feature).

### 6.8 Synced pipes

Permission fields are in the frontmatter, which syncs via `pipes/sync.rs`. Permissions travel with the pipe across devices.

### 6.9 Raw SQL with denied tables

`allow_raw_sql: true` is a binary gate. If allowed, the pipe has full read access via SQL. We can't reliably parse arbitrary SQL to enforce per-table restrictions. Document this clearly: `allow_raw_sql` overrides app/window/content filters for SQL queries.

### 6.10 Extension not loaded / Pi version mismatch

If Pi doesn't support extensions or the extension fails to load:
- Server middleware is the backstop
- But only if the pipe token is injected via curl (which the extension does)
- Without the extension, curl commands won't have the token → server treats as user request → no filtering

**Mitigation:** If permissions are configured, PiExecutor injects the auth header instruction into the prompt header directly (same as it injects the API URL). So even without the extension, the LLM will include the header, and the server will enforce.

### 6.11 Multiple pipes running simultaneously

Each pipe gets its own unique token. The DashMap supports concurrent access. No interference between pipes.

### 6.12 Data exfiltration of allowed data

Out of scope. A pipe with OCR access could pipe allowed data to an external server via curl. This is a network sandboxing problem, not a data permissions problem. Permissions reduce the blast radius.

---

## 7. Implementation Order

### Phase 1: Config + Permissions Core
1. Add permission fields to `PipeConfig` with serde defaults — `pipes/mod.rs`
2. Create `PipePermissions` struct with evaluation logic — `pipes/permissions.rs`
3. Unit tests: deny-wins-over-allow, empty=all, glob matching, midnight wrap, days

### Phase 2: Pi Extension
4. Write `screenpipe-permissions.ts` — `assets/extensions/`
   - Read env var, parse permissions
   - `before_agent_start`: inject permission rules into system prompt
   - `tool_call` on `bash`: parse curl commands, block forbidden requests, inject auth header
   - Block non-curl API access patterns
5. Add `ensure_permissions_extension()` to `pi.rs`
6. Gate skill installation by permissions in `ensure_screenpipe_skill()`
7. Manual testing: install a pipe with deny_apps, verify blocked

### Phase 3: Server Middleware (Backstop)
8. Add `pipe_permissions` DashMap to `AppState` — `server.rs`
9. Token generation in `start_pipe_background()` — `pipes/mod.rs`
10. `SCREENPIPE_PIPE_PERMISSIONS` env var injection — `pi.rs`
11. Middleware implementation — `pipe_permissions_middleware.rs`
12. Per-endpoint enforcement: search post-filter, raw_sql gate, frames gate, mutation blanket deny
13. Integration tests

### Phase 4: Polish
14. Update skill SKILL.md files with auth header examples
15. Inject auth header instruction into prompt header
16. UI: show permission fields in pipe editor
17. Token cleanup on pipe execution finish

---

## 8. File Change Summary

| File | Change |
|------|--------|
| `crates/screenpipe-core/src/pipes/mod.rs` | Add permission fields to `PipeConfig`, token generation, env var serialization |
| `crates/screenpipe-core/src/pipes/permissions.rs` | **NEW** — `PipePermissions` struct + evaluation logic |
| `crates/screenpipe-core/assets/extensions/screenpipe-permissions.ts` | **NEW** — Pi extension (primary enforcement) |
| `crates/screenpipe-core/src/agents/pi.rs` | `ensure_permissions_extension()`, conditional skill install, env var injection |
| `crates/screenpipe-server/src/server.rs` | Add `pipe_permissions` to `AppState`, wire middleware |
| `crates/screenpipe-server/src/pipe_permissions_middleware.rs` | **NEW** — axum middleware (backstop) |
| `crates/screenpipe-server/src/routes/search.rs` | Post-filter by permissions |
| `crates/screenpipe-server/src/routes/content.rs` | Raw SQL gate |
| `crates/screenpipe-core/assets/skills/*.md` | Auth header in examples |
| `Cargo.toml` (screenpipe-core) | Add `globset` dependency |
| `Cargo.toml` (screenpipe-server) | Add `dashmap` if needed |

---

## 9. Testing Strategy

### Unit Tests
- `PipePermissions::from_config()` with all field combinations
- deny-wins-over-allow for apps, windows, content types
- glob matching edge cases (empty, unicode, `*` alone)
- time range: normal, midnight wrap, exact boundaries
- days: single, all, empty

### Extension Tests
- Mock bash tool call with curl to denied app → blocked
- curl to allowed app → passes
- curl to `/raw_sql` with `allow_raw_sql: false` → blocked
- Non-curl API access (python, wget) → blocked
- curl to non-screenpipe URL → passes (not our business)

### Integration Tests
- Pipe with deny_apps runs, search results don't contain denied app
- Pipe with `allow_raw_sql: false` → 403 on `/raw_sql`
- Pipe with no permissions → full access (backwards compat)
- Request without pipe token → full access
- Expired token → 401

### Manual E2E
- Install pipe with `deny-apps: ["1Password"]`, run it, verify no 1Password data in output
- Install pipe with `allow-content-types: ["audio"]`, verify no OCR in results
