---
name: screenpipe-retranscribe
description: Re-transcribe audio recordings with a different engine, custom vocabulary, or prompt. Use when the user wants to improve transcription quality, fix bad transcriptions, or re-process audio from a specific time range.
---

# Screenpipe Retranscribe

Re-transcribe existing audio recordings stored in Screenpipe. Useful when transcriptions are poor quality, the wrong language was used, or the user wants to try a different STT engine.

The API runs at `http://localhost:3030`.

## Shell: pick the right one for the OS

- **macOS/Linux** → `bash`, `curl`, `date -u -v-1H +%Y-%m-%dT%H:%M:%SZ`
- **Windows** → `powershell`, `curl.exe` (not the alias), `(Get-Date).ToUniversalTime().AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")`

All examples below use bash. On Windows, adapt accordingly.

## Retranscribe API

```bash
curl -X POST http://localhost:3030/audio/retranscribe \
  -H "Content-Type: application/json" \
  -d '{
    "start": "2024-01-15T10:00:00Z",
    "end": "2024-01-15T11:00:00Z"
  }'
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | ISO 8601 or relative | **Yes** | Start of time range to retranscribe. Accepts ISO 8601 or relative (`1h ago`, `2d ago`). |
| `end` | ISO 8601 or relative | **Yes** | End of time range to retranscribe. Accepts ISO 8601 or relative (`now`, `30m ago`). |
| `engine` | string | No | STT engine override (see engines below) |
| `vocabulary` | array | No | Custom vocabulary entries for word bias |
| `prompt` | string | No | Custom prompt to guide Whisper transcription (becomes initial_prompt) |

### Supported Engines

| Engine | Value | Notes |
|--------|-------|-------|
| Whisper Large V3 Turbo | `whisper-large-v3-turbo` | Default, runs locally |
| Whisper Large V3 | `whisper-large-v3` | Higher quality, slower |
| Deepgram | `deepgram` | Cloud API, requires API key |
| Qwen3 ASR | `qwen3-asr` | Alternative local engine |

If `engine` is omitted, the currently configured engine is used.

### Vocabulary Format

Custom vocabulary biases transcription toward specific words or replaces misheard words:

```json
{
  "vocabulary": [
    {"word": "Screenpipe"},
    {"word": "Kubernetes", "replacement": null},
    {"word": "K8s", "replacement": "Kubernetes"}
  ]
}
```

### Response Format

```json
{
  "chunks_processed": 3,
  "transcriptions": [
    {
      "audio_chunk_id": 456,
      "old_text": "previous bad transcription",
      "new_text": "corrected transcription text"
    }
  ]
}
```

## CRITICAL RULES

1. **Always ask the user for a time range** — both `start` and `end` are required.
2. **Keep time ranges short** — retranscription processes every audio chunk in the range. Start with 1 hour max. Large ranges (e.g. a full day) will take a long time.
3. **"last meeting"** = search audio first to find the meeting time range, then retranscribe that range.
4. **Show before/after** — always show the user the old vs new transcription so they can verify improvement.
5. **Suggest vocabulary** — if the user mentions specific names, terms, or jargon that were transcribed wrong, add them as vocabulary entries.

## Example Workflows

### Fix bad transcription from last hour

```bash
curl -X POST http://localhost:3030/audio/retranscribe \
  -H "Content-Type: application/json" \
  -d "{
    \"start\": \"$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)\",
    \"end\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }"
```

### Retranscribe with custom vocabulary

```bash
curl -X POST http://localhost:3030/audio/retranscribe \
  -H "Content-Type: application/json" \
  -d "{
    \"start\": \"2024-01-15T14:00:00Z\",
    \"end\": \"2024-01-15T15:00:00Z\",
    \"vocabulary\": [
      {\"word\": \"Screenpipe\"},
      {\"word\": \"PostHog\"},
      {\"word\": \"Supabase\"}
    ]
  }"
```

### Retranscribe with a different engine

```bash
curl -X POST http://localhost:3030/audio/retranscribe \
  -H "Content-Type: application/json" \
  -d "{
    \"start\": \"2024-01-15T09:00:00Z\",
    \"end\": \"2024-01-15T10:00:00Z\",
    \"engine\": \"whisper-large-v3\"
  }"
```

### Retranscribe with a guiding prompt

Use a prompt to tell Whisper what the audio is about — this improves accuracy for domain-specific content:

```bash
curl -X POST http://localhost:3030/audio/retranscribe \
  -H "Content-Type: application/json" \
  -d "{
    \"start\": \"2024-01-15T14:00:00Z\",
    \"end\": \"2024-01-15T15:00:00Z\",
    \"prompt\": \"Discussion about Kubernetes deployment, CI/CD pipelines, and Docker containers\"
  }"
```

### Find a meeting, then retranscribe it

Combine with the search skill to find the right time range first:

```bash
# 1. Search for audio from the meeting
curl "http://localhost:3030/search?content_type=audio&limit=5&start_time=$(date -u -v-8H +%Y-%m-%dT%H:%M:%SZ)"

# 2. Note the timestamps of the first and last audio chunks
# 3. Retranscribe that exact range
curl -X POST http://localhost:3030/audio/retranscribe \
  -H "Content-Type: application/json" \
  -d '{
    "start": "2024-01-15T14:00:00Z",
    "end": "2024-01-15T14:45:00Z",
    "vocabulary": [{"word": "ProjectName"}]
  }'
```

## Tips

- Retranscription replaces the existing transcription in the database. The old text is returned in `old_text` for comparison.
- Each audio chunk is ~30 seconds. A 1-hour range processes ~120 chunks.
- If the user says transcription quality is bad, suggest adding vocabulary entries for names and technical terms.
- Whisper's `prompt` parameter works best with short context about the topic, not full instructions.
- If no chunks are found in the range, `chunks_processed` will be 0 — the user may need to adjust the time range.
