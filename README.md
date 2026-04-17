# Video Comment Sentiment Analyzer

A Chrome extension for YouTube that:
- Collects comments from the current video page
- Classifies each comment into `POSITIVE`, `NEUTRAL`, `NEGATIVE`, `TOXIC`, or `SPAM` using Gemini
- Shows a cool dashboard with donut + bar visualizations and sample comments

## Setup

1. Ensure root `.env` contains:
   - `GEMINI_API_KEY=your_key`
2. Generate local extension config:
   - `python setup_config.py`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select `video-comment-sentiment-extension`

## Usage

1. Open a YouTube watch page (`youtube.com/watch?...`)
2. Open extension popup
3. Click **Analyze Current YouTube Video** (first 50 comments)

## Notes

- `config.js` is generated locally and contains your API key.
- Keep `config.js` private.
- If comments are not loaded yet, scroll down the page and analyze again.
