import { GEMINI_API_KEY, GEMINI_MODEL } from "./config.js";

const MODEL = GEMINI_MODEL || "gemini-2.5-flash";
const MODEL_FALLBACKS = [MODEL, "gemini-2.5-flash", "gemini-2.0-flash-lite"].filter(
  (value, idx, arr) => value && arr.indexOf(value) === idx
);
const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE", "TOXIC", "SPAM"];
const POSITIVE_WORDS = ["good", "great", "love", "best", "awesome", "nice", "amazing", "thanks"];
const NEGATIVE_WORDS = ["bad", "worst", "hate", "boring", "terrible", "waste", "awful", "dislike"];
const TOXIC_WORDS = ["idiot", "stupid", "trash", "dumb", "moron", "loser", "shut up"];
const SPAM_WORDS = ["subscribe", "giveaway", "follow me", "check my channel", "http", "www", "promo"];

function safeParseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Gemini response was not valid JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractRetryDelayMs(errorBodyText) {
  const secondsMatch = errorBodyText.match(/retry in\s+([\d.]+)s/i);
  if (secondsMatch) {
    return Math.max(1000, Math.ceil(Number(secondsMatch[1]) * 1000));
  }
  const jsonDelayMatch = errorBodyText.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (jsonDelayMatch) {
    return Math.max(1000, Number(jsonDelayMatch[1]) * 1000);
  }
  return 1500;
}

function buildLocalFallback(comments, reason = "Gemini quota exceeded, used local fallback.") {
  const counts = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0, TOXIC: 0, SPAM: 0 };

  for (const raw of comments) {
    const text = String(raw || "").toLowerCase();
    if (SPAM_WORDS.some((w) => text.includes(w))) {
      counts.SPAM += 1;
      continue;
    }
    if (TOXIC_WORDS.some((w) => text.includes(w))) {
      counts.TOXIC += 1;
      continue;
    }
    const pos = POSITIVE_WORDS.filter((w) => text.includes(w)).length;
    const neg = NEGATIVE_WORDS.filter((w) => text.includes(w)).length;
    if (pos > neg && pos > 0) {
      counts.POSITIVE += 1;
    } else if (neg > pos && neg > 0) {
      counts.NEGATIVE += 1;
    } else {
      counts.NEUTRAL += 1;
    }
  }

  const total = comments.length || 1;
  const positivityScore = Math.round(
    ((counts.POSITIVE - counts.NEGATIVE - counts.TOXIC) / total) * 100
  );
  const overallMood =
    positivityScore > 20 ? "Mostly Positive" :
    positivityScore < -20 ? "Mostly Negative" :
    "Mixed";

  return {
    counts,
    overallMood,
    insights: [reason, "Results are approximate until Gemini quota resets."]
  };
}

async function summarizeSentiment(comments) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing in config.js. Run setup_config.py.");
  }

  const inputRows = comments
    .map((text, i) => `${i + 1}. ${text.replace(/\n/g, " ").slice(0, 200)}`)
    .join("\n");

  const prompt = `
You are a strict YouTube audience sentiment summarizer.
Allowed labels: POSITIVE, NEUTRAL, NEGATIVE, TOXIC, SPAM.
Estimate aggregate counts directly from comments.

Return ONLY this JSON:
{
  "counts": {
    "POSITIVE": number,
    "NEUTRAL": number,
    "NEGATIVE": number,
    "TOXIC": number,
    "SPAM": number
  },
  "overallMood": string,
  "insights": string[]
}

Rules:
- counts must sum exactly to comment count
- max 3 insights, each under 10 words
- no markdown and no extra text

Comments:
${inputRows}
`.trim();

  let lastError = "Unknown Gemini API error";
  let parsed;

  for (const modelName of MODEL_FALLBACKS) {
    // Retry each model briefly to handle short lived 429 limits.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const body = await response.text();
        lastError = `Gemini API error on ${modelName}: ${response.status} ${body}`;
        if (response.status === 404 || response.status === 400) {
          break;
        }
        if (response.status === 429 && attempt === 0) {
          await sleep(extractRetryDelayMs(body));
          continue;
        }
        // Keep trying other models when quota/rate limited.
        if (response.status === 429) {
          break;
        }
        throw new Error(lastError);
      }

      const json = await response.json();
      const raw =
        json?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("\n") || "";
      parsed = safeParseJson(raw);
      break;
    }
    if (parsed) {
      break;
    }
  }

  if (!parsed) {
    if (lastError.includes("429")) {
      return buildLocalFallback(comments);
    }
    throw new Error(lastError);
  }

  const counts = {};
  for (const label of SENTIMENTS) {
    counts[label] = Math.max(0, Number(parsed?.counts?.[label] || 0));
  }
  const insights = Array.isArray(parsed?.insights)
    ? parsed.insights.map((item) => String(item).slice(0, 80)).slice(0, 3)
    : [];
  const overallMood = String(parsed?.overallMood || "Mixed").slice(0, 40);
  return { counts, insights, overallMood };
}

async function analyzeComments(comments) {
  const list = comments.slice(0, 50);
  if (!list.length) {
    return {
      totalAnalyzed: 0,
      counts: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0, TOXIC: 0, SPAM: 0 },
      positivityScore: 0,
      overallMood: "No data",
      insights: []
    };
  }

  const summary = await summarizeSentiment(list);
  const counts = { ...summary.counts };
  let totalCount = Object.values(counts).reduce((acc, n) => acc + n, 0);

  if (totalCount !== list.length) {
    counts.NEUTRAL += list.length - totalCount;
    if (counts.NEUTRAL < 0) {
      counts.NEUTRAL = 0;
    }
    totalCount = Object.values(counts).reduce((acc, n) => acc + n, 0);
    if (totalCount !== list.length) {
      counts.POSITIVE = 0;
      counts.NEUTRAL = list.length;
      counts.NEGATIVE = 0;
      counts.TOXIC = 0;
      counts.SPAM = 0;
    }
  }

  const total = list.length;
  const positivityScore = Math.round(
    ((counts.POSITIVE - counts.NEGATIVE - counts.TOXIC) / total) * 100
  );

  return {
    totalAnalyzed: total,
    counts,
    positivityScore,
    overallMood: summary.overallMood,
    insights: summary.insights
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ANALYZE_COMMENTS") {
    analyzeComments(Array.isArray(message.comments) ? message.comments : [])
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
