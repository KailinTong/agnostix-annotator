<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# DENM Annotator

A browser-based tool for reviewing and correcting DENM (Decentralised Environmental Notification Message) annotations on traffic videos. Load a dataset JSON, upload the matching videos, and edit spatiotemporal bounding boxes and DENM metadata — all with auto-save to localStorage.


</div>

---

## Workflow

### 1. Load a dataset JSON

Drag-and-drop (or click to browse) a JSON file in the format described below. The app parses each entry's assistant conversation and populates the annotation editor.

### 2. Upload video files

Drag-and-drop one or more video files onto the **Video Files** drop zone. The app matches each video to a dataset entry by filename — the filename must match the `video` field in the JSON (exact match or basename match for path strings).

> **Codec note:** Use **H.264 / AAC** MP4 files. H.265/HEVC is not supported in all browsers. If a video fails to load, a red error badge will appear explaining why (e.g. "Unsupported format or codec").

You can upload all your video files at once by dragging a folder. Any previously uploaded videos are remembered within the same browser session (blob URLs are not persisted across page reloads, so re-upload after a refresh).

### 3. Start the workspace

Click **Start Annotating**. The left panel lists all dataset entries. Click any entry to open it.

### 4. Review and edit annotations

For each entry you can:

| Field | Description |
|---|---|
| **Traffic Situation** | Toggle whether a real hazard is visible (`situation = 0 or 1`) |
| **Message Type** | Auto-set to `DENM` when situation = 1, else `none` |
| **Cause Code** | Primary DENM cause (e.g. `2 — accident`) |
| **Sub Cause Code** | Refinement of the cause (e.g. `7 — unsecured accident`) |
| **Description** | Free-text description of the scene |
| **Bounding box** | Two spatiotemporal keyframes (START and END) drawn over the video |

**Bounding box editor:**
- Drag a corner or edge handle to resize the box.
- Drag the box body to move it.
- Click-drag on empty video area to redraw the box from scratch.
- Use the **Keyframe Editor** toolbar at the bottom to switch between the START and END keyframes and fine-tune coordinates numerically.
- Click **Sync Time** to set the keyframe's time value to the current video playhead position.
- Use the play/pause button and scrubber to navigate the video.

### 5. Export

Click **Export** (top-right) to download the annotated dataset as a JSON file. The exported file contains the same structure as the input, with updated `conversations[assistant].value` fields and `type` metadata.

---

## JSON Format

The canonical dataset file is **`DENM_TUMTraffic_VideoQA_all.json`**. Each entry has this structure:

```json
{
  "id": "99002_001",
  "video": "2021_04_08_11_31_accident_a9_s50_far_segment_001.mp4",
  "original_video": "2021_04_08_11_31_accident_a9_s50_far.mp4",
  "segment_index": 1,
  "conversations": [
    {
      "from": "human",
      "value": "<image>\nAnalyze the road scene..."
    },
    {
      "from": "assistant",
      "value": "{\"situation\":1,\"message_type\":\"DENM\",\"cause_code\":2,\"sub_cause_code\":7,\"cause_text\":\"accident\",\"sub_cause_text\":\"unsecured accident\",\"box_2d\":[[0.04,151,41,326,261],[1.0,151,41,326,261]],\"description\":\"A truck overturned on the road.\"}"
    }
  ]
}
```

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Entry identifier. Two formats exist — see below. |
| `video` | `string` | Filename of the video clip to load. When `segment_index` is `null` this equals `original_video`. |
| `original_video` | `string` | Filename of the full, unsegmented source video. |
| `segment_index` | `integer \| null` | Which segment this entry covers. `null` means the entry covers the entire original video — `video` and `original_video` are the same file. |
| `conversations` | `array` | Two-turn conversation: `human` prompt and `assistant` annotation. The `assistant.value` may be an empty string `""` for entries that have not yet been annotated. |

### ID formats

**Segmented** — one source video split into multiple clips, each with its own entry:

```
id format:  "{base_id}_{segment_index}"

original_video:  2021_04_08_11_31_accident_a9_s50_far.mp4
  → id "99002_000"  video: ...segment_000.mp4   segment_index: 0
  → id "99002_001"  video: ...segment_001.mp4   segment_index: 1
  → id "99002_002"  video: ...segment_002.mp4   segment_index: 2
```

**Unsegmented** — one entry per source video, `segment_index` is `null`, `video == original_video`:

```json
{
  "id": "00000",
  "video": "20220518_acci-bg1.mp4",
  "original_video": "20220518_acci-bg1.mp4",
  "segment_index": null,
  "conversations": [
    { "from": "human",     "value": "<image>\nAnalyze this traffic video..." },
    { "from": "assistant", "value": "" }
  ]
}
```


### Annotation schema (`assistant.value`)

The `assistant.value` field is a JSON string:

| Key | Type | Description |
|---|---|---|
| `situation` | `0` or `1` | Whether a traffic hazard is present |
| `message_type` | `"DENM"` or `"none"` | Must match `situation` |
| `cause_code` | `integer \| null` | DENM cause code |
| `sub_cause_code` | `integer \| null` | DENM sub-cause code |
| `cause_text` | `string \| null` | Human-readable cause label |
| `sub_cause_text` | `string \| null` | Human-readable sub-cause label |
| `box_2d` | `[[t,ymin,xmin,ymax,xmax], [...]]` | Two keyframe boxes, or `[]` if `situation=0` |
| `description` | `string` | Free-text scene description |

**Box coordinates:** `t` is normalized time (0–1 over video duration); `ymin/xmin/ymax/xmax` are integers 0–1000 with `(0,0)` at top-left.

An example dataset and video are provided in the [`example/`](./example/) directory.

---

## Run Locally

**Prerequisites:** Node.js 20+ (the dev server uses Vite 6 which requires Node ≥ 18)

If your system Node is older, install [nvm](https://github.com/nvm-sh/nvm) first:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Reload shell, then install and use Node 20
source ~/.bashrc          # or ~/.zshrc / ~/.profile depending on your shell
nvm install 20
nvm use 20
```

Then install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser. The dev server hot-reloads on file changes.

```bash
# Type-check without building
npm run lint

# Build for production
npm run build
```
