const DEFAULT_SETTINGS = {
  autoTranslatePdf: true,
  sourceLanguage: "en",
  targetLanguage: "zh-CN"
};

const LANG_LABELS = {
  auto: "自动检测",
  en: "英语",
  zh: "中文",
  "zh-CN": "中文(简体)",
  "zh-TW": "中文(繁体)",
  ja: "日语",
  ko: "韩语",
  fr: "法语",
  de: "德语",
  es: "西班牙语",
  ru: "俄语"
};

const autoToggle = document.getElementById("auto-toggle");
const langInfo = document.getElementById("lang-info");
const messageEl = document.getElementById("message");
const translateCurrentBtn = document.getElementById("translate-current");
const openOptionsBtn = document.getElementById("open-options");

function getLanguageLabel(code) {
  return LANG_LABELS[code] || code;
}

function setMessage(message, isError = false) {
  messageEl.textContent = message;
  messageEl.style.color = isError ? "#c02222" : "#3c4e6b";
}

function isLikelyPdfUrl(url) {
  return /\.pdf($|[?#])/i.test(url || "");
}

function buildViewerUrl(pdfUrl) {
  const base = chrome.runtime.getURL("viewer.html");
  return `${base}?file=${encodeURIComponent(pdfUrl)}`;
}

async function refreshUi() {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const resolved = { ...DEFAULT_SETTINGS, ...settings };

  autoToggle.checked = resolved.autoTranslatePdf;
  langInfo.textContent = `默认翻译: ${getLanguageLabel(resolved.sourceLanguage)} -> ${getLanguageLabel(resolved.targetLanguage)}`;
}

autoToggle.addEventListener("change", async () => {
  await chrome.storage.sync.set({ autoTranslatePdf: autoToggle.checked });
  setMessage(autoToggle.checked ? "已开启自动翻译" : "已关闭自动翻译");
});

translateCurrentBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) {
    setMessage("无法读取当前标签页", true);
    return;
  }

  if (!isLikelyPdfUrl(tab.url)) {
    setMessage("当前标签页不是 PDF 链接", true);
    return;
  }

  await chrome.tabs.update(tab.id, { url: buildViewerUrl(tab.url) });
  window.close();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshUi().catch((error) => {
  setMessage(`读取设置失败: ${error.message}`, true);
});
