const COLORS = {
  POSITIVE: "#37e39f",
  NEUTRAL: "#9aa6c7",
  NEGATIVE: "#ff6b84",
  TOXIC: "#ff8a3d",
  SPAM: "#b786ff"
};

const LABELS = ["POSITIVE", "NEUTRAL", "NEGATIVE", "TOXIC", "SPAM"];
const FIXED_COMMENT_LIMIT = 50;

const analyzeBtn = document.getElementById("analyzeBtn");
const loadingCard = document.getElementById("loadingCard");
const loadingText = document.getElementById("loadingText");
const errorCard = document.getElementById("errorCard");
const errorText = document.getElementById("errorText");
const dashboard = document.getElementById("dashboard");
const videoTitle = document.getElementById("videoTitle");
const videoMeta = document.getElementById("videoMeta");
const overallMoodEl = document.getElementById("overallMood");
const positivityScoreEl = document.getElementById("positivityScore");
const totalAnalyzedEl = document.getElementById("totalAnalyzed");
const barChart = document.getElementById("barChart");
const insightsEl = document.getElementById("insights");

function showError(message) {
  loadingCard.hidden = true;
  dashboard.hidden = true;
  errorCard.hidden = false;
  errorText.textContent = message;
}

function setLoading(text) {
  errorCard.hidden = true;
  dashboard.hidden = true;
  loadingCard.hidden = false;
  loadingText.textContent = text;
}

function buildBars(counts) {
  const total = Object.values(counts).reduce((acc, n) => acc + n, 0) || 1;
  barChart.innerHTML = "";
  for (const label of LABELS) {
    const value = counts[label] || 0;
    const pct = Math.round((value / total) * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${label}</span>
      <div class="bar"><span style="width:${pct}%;background:${COLORS[label]}"></span></div>
      <span>${pct}%</span>
    `;
    barChart.appendChild(row);
  }
}

function renderInsights(insights) {
  insightsEl.innerHTML = "";
  const top = insights.slice(0, 3);
  for (const item of top) {
    const li = document.createElement("li");
    li.textContent = item;
    insightsEl.appendChild(li);
  }
  if (!top.length) {
    const li = document.createElement("li");
    li.textContent = "No major insight from this batch.";
    insightsEl.appendChild(li);
  }
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0];
}

async function run() {
  analyzeBtn.disabled = true;
  try {
    const tab = await getCurrentTab();
    if (!tab?.id || !tab.url || !tab.url.includes("youtube.com/watch")) {
      throw new Error("Open a YouTube video page first.");
    }
    setLoading("Collecting comments from this video...");
    const collected = await chrome.tabs.sendMessage(tab.id, {
      type: "COLLECT_YOUTUBE_COMMENTS",
      maxCount: FIXED_COMMENT_LIMIT
    });
    if (!collected?.ok) {
      throw new Error(collected?.error || "Could not collect comments.");
    }

    const { comments, meta } = collected.payload;
    if (!comments?.length) {
      throw new Error("No comments found. Scroll down comments and try again.");
    }

    setLoading(`Analyzing ${comments.length} comments with Gemini...`);
    const analyzed = await chrome.runtime.sendMessage({
      type: "ANALYZE_COMMENTS",
      comments
    });
    if (!analyzed?.ok) {
      throw new Error(analyzed?.error || "Gemini analysis failed.");
    }

    const result = analyzed.result;
    loadingCard.hidden = true;
    errorCard.hidden = true;
    dashboard.hidden = false;

    videoTitle.textContent = meta?.title || "YouTube Video";
    videoMeta.textContent = `${meta?.channel || "Unknown channel"} · ${meta?.url || ""}`;
    overallMoodEl.textContent = result.overallMood;
    positivityScoreEl.textContent = `${result.positivityScore}`;
    totalAnalyzedEl.textContent = `${result.totalAnalyzed}`;

    buildBars(result.counts || {});
    renderInsights(result.insights || []);
  } catch (err) {
    showError(String(err));
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener("click", run);
