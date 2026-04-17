const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getVideoMeta() {
  const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
  const channelEl = document.querySelector("#channel-name a");
  return {
    title: (titleEl?.textContent || "").trim(),
    channel: (channelEl?.textContent || "").trim(),
    url: location.href
  };
}

function readCommentTexts() {
  const nodes = Array.from(document.querySelectorAll("#content-text"));
  const comments = [];
  for (const node of nodes) {
    const text = (node.textContent || "").trim().replace(/\s+/g, " ");
    if (text.length >= 2 && text.length <= 500) {
      comments.push(text);
    }
  }
  return Array.from(new Set(comments));
}

async function collectComments(maxCount = 50) {
  const seen = new Set();
  const maxScrollRounds = 8;

  for (let i = 0; i < maxScrollRounds; i += 1) {
    const comments = readCommentTexts();
    for (const c of comments) {
      seen.add(c);
      if (seen.size >= maxCount) {
        return Array.from(seen).slice(0, maxCount);
      }
    }
    if (i >= 2 && seen.size >= Math.min(20, maxCount)) {
      break;
    }
    window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
    await sleep(450);
  }
  return Array.from(seen).slice(0, maxCount);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COLLECT_YOUTUBE_COMMENTS") {
    const maxCount = Number(message?.maxCount || 50);
    collectComments(maxCount)
      .then((comments) => {
        sendResponse({
          ok: true,
          payload: {
            meta: getVideoMeta(),
            comments
          }
        });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
