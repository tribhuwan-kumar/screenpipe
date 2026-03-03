---
name: screenpipe-elements
description: Query structured UI elements (accessibility tree nodes and OCR text blocks) captured from the user's screen. Use when the user asks about specific buttons, text fields, UI components, links, or needs precise structural information about what was on screen.
---

# Screenpipe Elements

Query structured UI elements captured from the user's screen. Screenpipe stores every accessibility tree node and OCR text block as an individual element with role, text, bounds, and hierarchy information.

The API runs at `http://localhost:3030`.

## Shell: pick the right one for the OS

- **macOS/Linux** → `bash`, `curl`, `date -u -v-1H +%Y-%m-%dT%H:%M:%SZ`
- **Windows** → `powershell`, `curl.exe` (not the alias), `(Get-Date).ToUniversalTime().AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")`

All examples below use bash. On Windows, adapt accordingly.

## Endpoints

### 1. Search Elements — `GET /elements`

Lightweight FTS search across all elements. Returns ~100-500 bytes per element (vs 5-20KB per OCR item from `/search`).

```bash
curl "http://localhost:3030/elements?q=QUERY&start_time=ISO8601&end_time=ISO8601&limit=20"
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | No | Full-text search query across element text |
| `frame_id` | integer | No | Filter to elements from a specific frame |
| `source` | string | No | `accessibility` or `ocr` |
| `role` | string | No | Filter by element role (e.g. `AXButton`, `AXStaticText`, `AXLink`, `line`) |
| `start_time` | ISO 8601 or relative | **Recommended** | Start of time range. Accepts ISO 8601 or relative (`16h ago`, `2d ago`, `now`). |
| `end_time` | ISO 8601 or relative | No | End of time range. Accepts ISO 8601 or relative (`now`, `1h ago`). |
| `app_name` | string | No | Filter by app name |
| `limit` | integer | No | Max results. Default: 50 |
| `offset` | integer | No | Pagination offset. Default: 0 |

#### Response

```json
{
  "data": [
    {
      "id": 12345,
      "frame_id": 6789,
      "source": "accessibility",
      "role": "AXButton",
      "text": "Submit",
      "parent_id": 12340,
      "depth": 3,
      "bounds": {"left": 0.5, "top": 0.8, "width": 0.1, "height": 0.05},
      "confidence": null,
      "sort_order": 15
    }
  ],
  "pagination": {"limit": 50, "offset": 0, "total": 142}
}
```

### 2. Frame Elements — `GET /frames/{frame_id}/elements`

Get the full element tree for a single frame. Returns all elements (accessibility nodes + OCR blocks) for that screenshot.

```bash
curl "http://localhost:3030/frames/6789/elements"
curl "http://localhost:3030/frames/6789/elements?source=accessibility"
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | No | Filter: `accessibility` or `ocr` |

#### Response

Same shape as `/elements` but returns all elements for the frame (no pagination needed).

### 3. Frame Context — `GET /frames/{frame_id}/context`

Get accessibility text, parsed tree nodes, and extracted URLs for a frame. Falls back to OCR for legacy frames.

```bash
curl "http://localhost:3030/frames/6789/context"
```

#### Response

```json
{
  "frame_id": 6789,
  "text": "Full accessibility text...",
  "nodes": [
    {"role": "AXStaticText", "text": "Hello world", "depth": 2, "bounds": {"left": 0.1, "top": 0.2, "width": 0.3, "height": 0.04}}
  ],
  "urls": ["https://github.com/mediar-ai/screenpipe"],
  "text_source": "accessibility"
}
```

## Element Sources and Roles

### Sources

| Source | Description |
|--------|-------------|
| `accessibility` | macOS accessibility tree nodes — structured, hierarchical, includes roles and bounds |
| `ocr` | OCR text blocks — flat text with bounding boxes, used as fallback |

### Common Accessibility Roles

| Role | Description |
|------|-------------|
| `AXStaticText` | Static text label |
| `AXButton` | Button element |
| `AXLink` | Hyperlink |
| `AXTextField` | Text input field |
| `AXTextArea` | Multi-line text area |
| `AXMenuItem` | Menu item |
| `AXCheckBox` | Checkbox |
| `AXImage` | Image element |
| `AXGroup` | Container/group |
| `AXWebArea` | Web content area |
| `line` | OCR text line |
| `paragraph` | OCR text paragraph |

## When to Use Which Endpoint

| Question | Endpoint |
|----------|----------|
| "What buttons were visible?" | `GET /elements?role=AXButton&start_time=...` |
| "Find where I saw text X" | `GET /elements?q=X&start_time=...` |
| "What was the full UI layout of that screen?" | `GET /frames/{frame_id}/elements` |
| "What links/URLs were on that page?" | `GET /frames/{frame_id}/context` |
| "What text was showing in app X?" | `GET /elements?source=accessibility&app_name=X&start_time=...` |

## CRITICAL RULES

1. **ALWAYS include `start_time`** — the elements table can have millions of rows. Queries without time bounds will be slow.
2. **Prefer `/elements` over `/search` for targeted lookups** — elements are ~10x lighter (100-500 bytes each vs 5-20KB for OCR items).
3. **Use `source=accessibility` for structured queries** — accessibility data has proper roles, hierarchy, and bounds. OCR is flat text.
4. **Use `/frames/{id}/context` for URL extraction** — it parses link nodes and regex-scans for URLs automatically.
5. **Start with short time ranges** — last 1-2 hours. Expand only if needed.

## Example Workflows

### Find a specific button the user clicked

```bash
# Step 1: Search for the button
curl "http://localhost:3030/elements?q=Submit&role=AXButton&start_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)&limit=5"

# Step 2: Get full context for that frame
curl "http://localhost:3030/frames/6789/context"
```

### Find all URLs the user visited

```bash
# Step 1: Get frames from Chrome
curl "http://localhost:3030/elements?role=AXLink&app_name=Google%20Chrome&start_time=$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)&limit=20"

# Step 2: For a specific frame, get all URLs
curl "http://localhost:3030/frames/6789/context"
```

### Get text content from a specific app

```bash
# Accessibility text from VS Code in the last hour
curl "http://localhost:3030/elements?source=accessibility&app_name=Code&role=AXStaticText&start_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)&limit=20"
```
