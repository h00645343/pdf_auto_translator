import * as pdfjsLib from "./lib/pdf.mjs";
import { LANGUAGE_OPTIONS } from "./languages.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.mjs");
const CMAP_URL = chrome.runtime.getURL("lib/cmaps/");
const STANDARD_FONT_DATA_URL = chrome.runtime.getURL("lib/standard_fonts/");

const DEFAULT_SETTINGS = {
  sourceLanguage: "en",
  targetLanguage: "zh-CN"
};

const MAX_TRANSLATE_CHUNK_LENGTH = 1400;

const sourceLanguageSelect = document.getElementById("source-language");
const targetLanguageSelect = document.getElementById("target-language");
const statusTextEl = document.getElementById("status-text");
const progressEl = document.getElementById("progress");
const pagesEl = document.getElementById("pages");
const pageTemplate = document.getElementById("page-template");
const sourceLink = document.getElementById("source-link");
const retranslateBtn = document.getElementById("retranslate-btn");

const state = {
  pdfUrl: "",
  sourceLanguage: DEFAULT_SETTINGS.sourceLanguage,
  targetLanguage: DEFAULT_SETTINGS.targetLanguage,
  pageTexts: [],
  translatedTexts: [],
  activeRunId: 0,
  isTranslating: false
};

function setStatus(text, progressValue = null) {
  statusTextEl.textContent = text;
  if (typeof progressValue === "number") {
    progressEl.value = Math.min(100, Math.max(0, progressValue));
  }
}

function renderLanguageOptions() {
  sourceLanguageSelect.innerHTML = "";
  targetLanguageSelect.innerHTML = "";

  for (const item of LANGUAGE_OPTIONS) {
    const sourceOption = document.createElement("option");
    sourceOption.value = item.code;
    sourceOption.textContent = `${item.label} (${item.code})`;
    sourceLanguageSelect.appendChild(sourceOption);

    if (item.code === "auto") {
      continue;
    }

    const targetOption = document.createElement("option");
    targetOption.value = item.code;
    targetOption.textContent = `${item.label} (${item.code})`;
    targetLanguageSelect.appendChild(targetOption);
  }
}

function readLanguagesFromUi() {
  state.sourceLanguage = sourceLanguageSelect.value;
  state.targetLanguage = targetLanguageSelect.value;
}

function splitTextIntoChunks(text, maxLength = MAX_TRANSLATE_CHUNK_LENGTH) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  const fragments = text.split(/(?<=[。！？.!?\n])/);
  let current = "";

  for (const fragment of fragments) {
    if (!fragment) {
      continue;
    }

    if ((current + fragment).length <= maxLength) {
      current += fragment;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (fragment.length <= maxLength) {
      current = fragment;
      continue;
    }

    for (let index = 0; index < fragment.length; index += maxLength) {
      chunks.push(fragment.slice(index, index + maxLength));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function translateChunk(text, sourceLanguage, targetLanguage) {
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client", "gtx");
  endpoint.searchParams.set("sl", sourceLanguage);
  endpoint.searchParams.set("tl", targetLanguage);
  endpoint.searchParams.set("dt", "t");
  endpoint.searchParams.set("q", text);

  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("无法解析翻译结果");
  }

  return payload[0].map((item) => item[0]).join("");
}

async function translateLongText(text, sourceLanguage, targetLanguage) {
  if (!text.trim()) {
    return "";
  }

  const chunks = splitTextIntoChunks(text);
  const translated = [];

  for (const chunk of chunks) {
    translated.push(await translateChunk(chunk, sourceLanguage, targetLanguage));
  }

  return translated.join("");
}

function createPageCard(pageNumber, sourceText) {
  const card = pageTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.page = String(pageNumber);
  card.querySelector("h2").textContent = `第 ${pageNumber} 页`;
  card.querySelector(".source-text").textContent = sourceText;
  card.querySelector(".translated-text").textContent = "翻译中...";
  return card;
}

function setTranslatedText(pageNumber, translatedText) {
  const card = pagesEl.querySelector(`.page-card[data-page="${pageNumber}"]`);
  if (!card) {
    return;
  }

  card.querySelector(".translated-text").textContent = translatedText;
}

function markAllPagesAsTranslating() {
  const translatedNodes = pagesEl.querySelectorAll(".translated-text");
  for (const node of translatedNodes) {
    node.textContent = "翻译中...";
  }
}

function setRetranslateUiBusy(isBusy) {
  state.isTranslating = isBusy;
  retranslateBtn.disabled = isBusy;
  retranslateBtn.textContent = isBusy ? "翻译中..." : "重新翻译";
}

async function extractPdfPageTexts(pdfUrl) {
  setStatus("正在加载 PDF...", 5);

  const loadingTask = pdfjsLib.getDocument({
    url: pdfUrl,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    disableStream: false,
    disableAutoFetch: false
  });
  const pdf = await loadingTask.promise;

  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`正在提取文本: ${pageNumber}/${pdf.numPages}`, 5 + (pageNumber / pdf.numPages) * 40);
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    pageTexts.push(pageText || "[本页没有可提取文本]");
  }

  return pageTexts;
}

async function translateAllPages(runId) {
  if (state.sourceLanguage === state.targetLanguage) {
    throw new Error("源语言与目标语言不能相同");
  }
  if (!state.pageTexts.length) {
    throw new Error("没有可翻译的页面内容");
  }

  state.translatedTexts = [];

  for (let i = 0; i < state.pageTexts.length; i += 1) {
    if (runId !== state.activeRunId) {
      return;
    }

    const pageNumber = i + 1;
    const pageText = state.pageTexts[i];
    setStatus(`正在翻译: ${pageNumber}/${state.pageTexts.length}`, 45 + (pageNumber / state.pageTexts.length) * 55);

    try {
      const translatedText = await translateLongText(pageText, state.sourceLanguage, state.targetLanguage);
      if (runId !== state.activeRunId) {
        return;
      }

      state.translatedTexts[i] = translatedText || "[空白翻译结果]";
      setTranslatedText(pageNumber, state.translatedTexts[i]);
    } catch (error) {
      if (runId !== state.activeRunId) {
        return;
      }

      const fallbackText = `[翻译失败] ${error.message}`;
      state.translatedTexts[i] = fallbackText;
      setTranslatedText(pageNumber, fallbackText);
    }
  }
}

function getPdfUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("file") || "";
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const resolved = { ...DEFAULT_SETTINGS, ...settings };

  state.sourceLanguage = resolved.sourceLanguage;
  state.targetLanguage = resolved.targetLanguage;
  sourceLanguageSelect.value = resolved.sourceLanguage;
  targetLanguageSelect.value = resolved.targetLanguage;
}

async function persistLanguageSettings() {
  await chrome.storage.sync.set({
    sourceLanguage: state.sourceLanguage,
    targetLanguage: state.targetLanguage
  });
}

async function startTranslation(isRetranslate = false) {
  if (state.isTranslating) {
    return;
  }

  readLanguagesFromUi();
  await persistLanguageSettings();

  const runId = state.activeRunId + 1;
  state.activeRunId = runId;

  markAllPagesAsTranslating();
  setRetranslateUiBusy(true);
  setStatus(isRetranslate ? "正在重新翻译..." : "正在开始翻译...", 45);

  try {
    await translateAllPages(runId);
    if (runId === state.activeRunId) {
      setStatus("翻译完成", 100);
    }
  } catch (error) {
    if (runId === state.activeRunId) {
      setStatus(`${isRetranslate ? "重新翻译" : "翻译"}失败: ${error.message}`, progressEl.value);
    }
  } finally {
    if (runId === state.activeRunId) {
      setRetranslateUiBusy(false);
    }
  }
}

async function initialize() {
  renderLanguageOptions();
  await loadSettings();

  const pdfUrl = getPdfUrlFromQuery();
  if (!pdfUrl) {
    setStatus("缺少 PDF 地址参数 file。", 0);
    return;
  }

  state.pdfUrl = pdfUrl;
  sourceLink.href = pdfUrl;

  state.pageTexts = await extractPdfPageTexts(pdfUrl);
  pagesEl.innerHTML = "";
  state.pageTexts.forEach((pageText, index) => {
    pagesEl.appendChild(createPageCard(index + 1, pageText));
  });

  await startTranslation(false);
}

sourceLanguageSelect.addEventListener("change", async () => {
  readLanguagesFromUi();
  await persistLanguageSettings();
});

targetLanguageSelect.addEventListener("change", async () => {
  readLanguagesFromUi();
  await persistLanguageSettings();
});

retranslateBtn.addEventListener("click", async () => {
  await startTranslation(true);
});

initialize().catch((error) => {
  console.error(error);
  setStatus(`加载失败: ${error.message}`, 0);
  setRetranslateUiBusy(false);
});
