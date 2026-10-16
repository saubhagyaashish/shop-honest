# Demo video

Silent screen recording of the live app for the Google Cloud AI Builder Cup 2026 (Retail & Commerce). Captions are burned into the frame.

| File | Notes |
|---|---|
| [`shop-honest-demo.mp4`](shop-honest-demo.mp4) | Final H.264 export · 1280×720 · **~1:55** (under the 3-minute submission limit) · ~6 MB |

## Shot list

1. Home — product pitch
2. Store A **Scan it** — replay of a real Gemini audit; watch the journey, then **Skip to report**
3. Report — findings, bill ₹1,499 → ₹1,894, fake “you save” claim
4. **Fix it** → **Apply all** — projected trust score / extras
5. Accuracy + honesty captions
6. End card — live URL · Team Zero Context

## Re-record

From `web/`:

```sh
# optional: FFMPEG=/path/to/ffmpeg
npm run demo:record
```

Uses Playwright against `https://shop-honest-ai.web.app` (override with `DEMO_URL`). Raw WebM lands in `docs/demo/raw/` (gitignored); the script encodes the MP4 when ffmpeg is available.

## Cup submission

The form wants a **public** YouTube, Vimeo, or Google Drive link. Upload `shop-honest-demo.mp4`, set sharing to anyone with the link, and paste that URL into the submission form. Keep this file in the repo so judges can also watch from GitHub.
