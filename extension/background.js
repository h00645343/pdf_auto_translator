const DEFAULT_SETTINGS = {
  autoTranslatePdf: true,
  sourceLanguage: "en",
  targetLanguage: "zh-CN"
};

async function ensureDefaultSettings() {
  const current = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const nextValues = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (current[key] === undefined) {
      nextValues[key] = value;
    }
  }

  if (Object.keys(nextValues).length > 0) {
    await chrome.storage.sync.set(nextValues);
  }
}

function isLikelyPdfUrl(url) {
  if (!url) {
    return false;
  }
  if (url.startsWith(chrome.runtime.getURL(""))) {
    return false;
  }
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
    return false;
  }

  return /\.pdf($|[?#])/i.test(url);
}

function buildViewerUrl(pdfUrl) {
  const base = chrome.runtime.getURL("viewer.html");
  return `${base}?file=${encodeURIComponent(pdfUrl)}`;
}

async function maybeRedirectPdfTab(tabId, url) {
  if (!isLikelyPdfUrl(url)) {
    return;
  }

  const { autoTranslatePdf = true } = await chrome.storage.sync.get("autoTranslatePdf");
  if (!autoTranslatePdf) {
    return;
  }

  const viewerUrl = buildViewerUrl(url);
  await chrome.tabs.update(tabId, { url: viewerUrl });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.error("Failed to initialize settings on install:", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaultSettings().catch((error) => {
    console.error("Failed to initialize settings on startup:", error);
  });
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }

  maybeRedirectPdfTab(details.tabId, details.url).catch((error) => {
    console.warn("PDF redirection skipped:", error);
  });
});
