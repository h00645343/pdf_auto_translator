import { LANGUAGE_OPTIONS } from "./languages.js";

const DEFAULT_SETTINGS = {
  autoTranslatePdf: true,
  sourceLanguage: "en",
  targetLanguage: "zh-CN"
};

const sourceLanguageSelect = document.getElementById("source-language");
const targetLanguageSelect = document.getElementById("target-language");
const autoTranslatePdfInput = document.getElementById("auto-translate-pdf");
const saveBtn = document.getElementById("save-btn");
const statusEl = document.getElementById("status");

function renderLanguageOptions(selectEl, allowAuto) {
  const options = allowAuto
    ? LANGUAGE_OPTIONS
    : LANGUAGE_OPTIONS.filter((item) => item.code !== "auto");

  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = `${item.label} (${item.code})`;
    selectEl.appendChild(option);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#cc1f1f" : "#26406b";
}

async function loadSettings() {
  renderLanguageOptions(sourceLanguageSelect, true);
  renderLanguageOptions(targetLanguageSelect, false);

  const settings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const resolved = { ...DEFAULT_SETTINGS, ...settings };

  sourceLanguageSelect.value = resolved.sourceLanguage;
  targetLanguageSelect.value = resolved.targetLanguage;
  autoTranslatePdfInput.checked = resolved.autoTranslatePdf;
}

saveBtn.addEventListener("click", async () => {
  if (sourceLanguageSelect.value === targetLanguageSelect.value) {
    setStatus("源语言与目标语言不能相同。", true);
    return;
  }

  await chrome.storage.sync.set({
    sourceLanguage: sourceLanguageSelect.value,
    targetLanguage: targetLanguageSelect.value,
    autoTranslatePdf: autoTranslatePdfInput.checked
  });

  setStatus("设置已保存。");
});

loadSettings().catch((error) => {
  setStatus(`加载设置失败: ${error.message}`, true);
});
