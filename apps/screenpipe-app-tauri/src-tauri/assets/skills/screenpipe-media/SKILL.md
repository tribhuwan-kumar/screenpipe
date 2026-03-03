---
name: screenpipe-media
description: Export videos, extract audio, and edit media clips from the user's Screenpipe recordings. Use when the user asks to export, download, clip, or create videos/audio from their screen recordings.
---

# Screenpipe Media Export & Editing

Export screen recordings as videos, extract audio, and perform media editing using the local Screenpipe API and ffmpeg.

The API runs at `http://localhost:3030`.

## Shell: pick the right one for the OS

- **macOS/Linux** → `bash`, `curl`, `date -u -v-5M +%Y-%m-%dT%H:%M:%SZ`
- **Windows** → `powershell`, `curl.exe` (not the alias), `(Get-Date).ToUniversalTime().AddMinutes(-5).ToString("yyyy-MM-ddTHH:mm:ssZ")`

All examples below use bash. On Windows, adapt: use `powershell`, replace `curl` with `curl.exe`, replace `$(date …)` with the PowerShell equivalent, replace `~` with `$env:USERPROFILE`, replace `mkdir -p` with `New-Item -ItemType Directory -Force -Path`.

## Video Export API

### POST /frames/export

Export a video from a time range or specific frame IDs.

```bash
curl -X POST http://localhost:3030/frames/export \
  -H "Content-Type: application/json" \
  -d '{
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T10:30:00Z",
    "fps": 1.0
  }'
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start_time` | ISO 8601 or relative | No* | Start of time range. Accepts ISO 8601 or relative (`16h ago`, `30m ago`, `now`). |
| `end_time` | ISO 8601 or relative | No* | End of time range. Accepts ISO 8601 or relative (`now`, `1h ago`). |
| `frame_ids` | array of integers | No* | Specific frame IDs to export |
| `fps` | float | No | Frames per second (default: 1.0) |

*Provide either `start_time` + `end_time` OR `frame_ids`.

### Response

```json
{
  "file_path": "/Users/name/.screenpipe/exports/screenpipe_export_20240115_103000.mp4",
  "frame_count": 120,
  "duration_secs": 120.0,
  "file_size_bytes": 5242880
}
```

### CRITICAL RULES

1. **Start with short time ranges** (5-15 minutes). Long exports take time and may hit the 10,000 frame limit.
2. **Use low fps** for long recordings: 0.5 fps for 30+ minutes, 0.2 fps for hours.
3. **Maximum 10,000 frames** per export. If exceeded, narrow the time range or lower fps.
4. All exports are saved to `~/.screenpipe/exports/`.

### FPS Guidelines

| Time Range | Recommended FPS | Approx Frames |
|-----------|----------------|---------------|
| 5 minutes | 1.0 | ~300 |
| 15 minutes | 1.0 | ~900 |
| 30 minutes | 0.5 | ~900 |
| 1 hour | 0.2 | ~720 |
| 2+ hours | 0.1 | ~720 |

### Example Exports

```bash
# Last 5 minutes
curl -X POST http://localhost:3030/frames/export \
  -H "Content-Type: application/json" \
  -d "{\"start_time\": \"$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ)\", \"end_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"fps\": 1.0}"

# Last 30 minutes at lower fps
curl -X POST http://localhost:3030/frames/export \
  -H "Content-Type: application/json" \
  -d "{\"start_time\": \"$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ)\", \"end_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"fps\": 0.5}"

# Specific frame IDs from search results
curl -X POST http://localhost:3030/frames/export \
  -H "Content-Type: application/json" \
  -d '{"frame_ids": [12345, 12346, 12347, 12348], "fps": 1.0}'
```

## Showing Exported Videos

After exporting, show the file path in an inline code block so it renders as a playable video in the chat:

```
`/Users/name/.screenpipe/exports/screenpipe_export_20240115_103000.mp4`
```

Do NOT use markdown links or multi-line code blocks for videos.

## Audio Export

Screenpipe stores audio as MP4 files. To extract audio from recordings:

### Step 1: Find audio files via search

```bash
curl "http://localhost:3030/search?content_type=audio&limit=10&start_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)"
```

Each audio result has a `file_path` pointing to the audio MP4 file.

### Step 2: Convert or extract audio with ffmpeg

```bash
# Convert audio MP4 to MP3
ffmpeg -y -i /path/to/audio.mp4 -q:a 2 ~/.screenpipe/exports/output.mp3

# Extract audio from a time range within a file
ffmpeg -y -i /path/to/audio.mp4 -ss 00:01:00 -to 00:05:00 -q:a 2 ~/.screenpipe/exports/clip.mp3

# Concatenate multiple audio files
printf "file '%s'\n" /path/to/audio1.mp4 /path/to/audio2.mp4 > /tmp/audiolist.txt
ffmpeg -y -f concat -safe 0 -i /tmp/audiolist.txt -c copy ~/.screenpipe/exports/combined.mp4
```

## Video Editing with ffmpeg

After exporting a video, use ffmpeg for editing:

```bash
# Trim a video (start at 10s, duration 30s)
ffmpeg -y -i ~/.screenpipe/exports/input.mp4 -ss 00:00:10 -t 00:00:30 -c copy ~/.screenpipe/exports/trimmed.mp4

# Speed up 2x
ffmpeg -y -i ~/.screenpipe/exports/input.mp4 -filter:v "setpts=0.5*PTS" -an ~/.screenpipe/exports/fast.mp4

# Create a GIF (first 10 seconds, 10fps, 640px wide)
ffmpeg -y -i ~/.screenpipe/exports/input.mp4 -t 10 -vf "fps=10,scale=640:-1" ~/.screenpipe/exports/output.gif

# Extract audio from video
ffmpeg -y -i ~/.screenpipe/exports/input.mp4 -vn -q:a 2 ~/.screenpipe/exports/audio.mp3

# Merge video and audio
ffmpeg -y -i ~/.screenpipe/exports/video.mp4 -i ~/.screenpipe/exports/audio.mp3 -c:v copy -c:a aac ~/.screenpipe/exports/merged.mp4

# Add subtitles (SRT file)
ffmpeg -y -i ~/.screenpipe/exports/input.mp4 -vf subtitles=subs.srt ~/.screenpipe/exports/subtitled.mp4
```

## Rules

1. **Always use `-y` flag** with ffmpeg to overwrite without prompting.
2. **Always save to `~/.screenpipe/exports/`** — create the directory first with `mkdir -p ~/.screenpipe/exports/`.
3. **Start with short time ranges** when the user says "recent" or "last few minutes".
4. **Show the output file path** in an inline code block after every export so the user can view/play it.
5. **Combine search + export** for targeted clips: search to find the right time range, then export that range.

## Workflow Examples

### "Export a video of the last 5 minutes"
1. Call POST /frames/export with start_time = 5 min ago, end_time = now, fps = 1.0
2. Show the returned file_path as inline code

### "Extract audio from my last meeting"
1. Search for audio content: `curl "http://localhost:3030/search?content_type=audio&limit=20&start_time=..."`
2. Identify the meeting's audio files from results
3. Use ffmpeg to concat/convert the audio files
4. Show the output path as inline code

### "Make a timelapse of my work today"
1. Call POST /frames/export with start_time = midnight, end_time = now, fps = 0.1
2. Optionally speed up with ffmpeg: `ffmpeg -y -i input.mp4 -filter:v "setpts=0.25*PTS" -an output.mp4`
3. Show the final file path

### "Create a GIF of what I was just doing"
1. Export last 30 seconds at 2 fps
2. Convert to GIF: `ffmpeg -y -i input.mp4 -vf "fps=10,scale=640:-1" output.gif`
3. Show the GIF path
