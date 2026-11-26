
// ==== Interactive English Reading Studio - bundled single-file build ====

const Modules = {};


// ---- config.js ----
Modules.Config = (function() {
'use strict';
const AppConfig = Object.freeze({
  providers: {
    dictionary: {
      id: "dictionaryapi",
      baseUrl: "https://api.dictionaryapi.dev/api/v2/entries/en",
      timeoutMs: 8000,
    },
    translation: {
      id: "mymemory",
      baseUrl: "https://api.mymemory.translated.net/get",
      sourceLanguage: "en",
      targetLanguage: "es",
      timeoutMs: 9000,
      contactEmail: "",
    },
    grammar: {
      id: "languagetool",
      baseUrl: "https://api.languagetool.org/v2/check",
      language: "en-US",
      timeoutMs: 9000,
    },
    speech: {
      id: "browser-speech-synthesis",
      language: "en-US",
    },
  },
});

return { AppConfig };
})();


// ---- languageServiceProviders.js ----
Modules.LanguageServiceProviders = (function() {
'use strict';
const { AppConfig } = Modules.Config;

const CONTENT_WORD_STOPLIST = new Set([
  "about", "after", "again", "also", "because", "before", "between", "could",
  "every", "from", "have", "into", "over", "should", "that", "their", "there",
  "these", "this", "through", "under", "until", "when", "where", "which",
  "while", "with", "would", "your", "the", "and", "for", "are", "was", "were",
  "you", "they", "she", "him", "her", "his", "its", "not", "but", "can",
]);

class DictionaryProvider {
  constructor(config = AppConfig.providers.dictionary) {
    this.config = config;
    this.name = "Dictionary Provider";
  }

  async lookupWord(word) {
    const url = `${this.config.baseUrl}/${encodeURIComponent(word.toLowerCase())}`;
    const response = await fetchWithTimeout(url, { timeoutMs: this.config.timeoutMs });
    if (!response.ok) throw new Error("Dictionary result was not found.");

    const entries = await response.json();
    const entry = entries[0];
    if (!entry) throw new Error("Dictionary result was empty.");

    const meaning = entry.meanings?.[0];
    const definition = meaning?.definitions?.[0];
    const audio = getBestAudio(entry.phonetics || []);

    return {
      word: entry.word || word,
      ipa: getBestPhonetic(entry),
      audioUrl: audio,
      partOfSpeech: meaning?.partOfSpeech || "Not available",
      definition: definition?.definition || "Definition not available.",
      example: definition?.example || `No provider example was returned for "${word}".`,
      synonyms: collectMeaningValues(entry.meanings, "synonyms"),
      antonyms: collectMeaningValues(entry.meanings, "antonyms"),
      source: this.name,
    };
  }
}

class TranslationProvider {
  constructor(config = AppConfig.providers.translation) {
    this.config = config;
    this.name = "Translation Provider";
  }

  async translate(text, targetLanguage = this.config.targetLanguage) {
    if(new TextEncoder().encode(text).length>480)throw new Error("Selecciona un fragmento más corto para traducir (hasta 480 bytes).");
    const params = new URLSearchParams({
      q: text,
      langpair: `${this.config.sourceLanguage}|${targetLanguage}`,
    });
    if (this.config.contactEmail) params.set("de", this.config.contactEmail);

    const response = await fetchWithTimeout(`${this.config.baseUrl}?${params}`, {
      timeoutMs: this.config.timeoutMs,
    });
    if (!response.ok) throw new Error("Translation provider did not respond.");

    const data = await response.json();
    if(data.responseStatus && Number(data.responseStatus)!==200) throw new Error(data.responseDetails || "Traducción no disponible temporalmente.");
    const translatedText = data.responseData?.translatedText;
    if (!translatedText) throw new Error("Translation provider returned no translation.");

    return {
      translatedText,
      match: data.responseData?.match,
      source: this.name,
    };
  }
}

class GrammarProvider {
  constructor(config = AppConfig.providers.grammar) {
    this.config = config;
    this.name = "Grammar Provider";
  }

  async analyze(text) {
    const body = new URLSearchParams({
      text,
      language: this.config.language,
    });

    const response = await fetchWithTimeout(this.config.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      timeoutMs: this.config.timeoutMs,
    });
    if (!response.ok) throw new Error("Grammar provider did not respond.");

    const data = await response.json();
    const matches = data.matches || [];

    return {
      explanation: matches.length
        ? matches.slice(0, 4).map((match) => match.message).join(" ")
        : "No major grammar issues were detected by the current provider.",
      issues: matches.map((match) => ({
        message: match.message,
        shortMessage: match.shortMessage,
        category: match.rule?.category?.name,
        replacements: match.replacements?.slice(0, 3).map((item) => item.value) || [],
      })),
      source: this.name,
    };
  }
}

class VocabularyProvider {
  analyze(text) {
    const words = (text.match(/[a-zA-Z]+(?:[-'][a-zA-Z]+)?/g) || [])
      .map((word) => word.toLowerCase())
      .filter((word) => word.length > 4 && !CONTENT_WORD_STOPLIST.has(word));

    const unique = [...new Set(words)];
    return {
      importantVocabulary: unique.slice(0, 8),
      source: "Local Vocabulary Detector",
    };
  }
}

class SpeechProvider {
  constructor(config = AppConfig.providers.speech) {
    this.config = config;
    this.name = "Pronunciation Provider";
  }

  createBrowserSpeech(text) {
    return {
      type: "speech-synthesis",
      text,
      language: this.config.language,
      source: this.name,
    };
  }
}

function estimateCefrLevel(word) {
  return "Sin clasificación verificada";
}

function normalizeAudioUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function getBestPhonetic(entry) {
  return entry.phonetic || entry.phonetics?.find((item) => item.text)?.text || "Not available";
}

function getBestAudio(phonetics) {
  const audio = phonetics.find((item) => item.audio)?.audio || "";
  return normalizeAudioUrl(audio);
}

function collectMeaningValues(meanings = [], key) {
  return [...new Set(meanings.flatMap((meaning) => meaning[key] || []))].slice(0, 10);
}

return { DictionaryProvider, TranslationProvider, GrammarProvider, VocabularyProvider, SpeechProvider, estimateCefrLevel, normalizeAudioUrl };
})();


// ---- providerManager.js ----
Modules.ProviderManager = (function() {
'use strict';
const { DictionaryProvider, estimateCefrLevel, GrammarProvider, SpeechProvider, TranslationProvider, VocabularyProvider } = Modules.LanguageServiceProviders;

const ProviderStatus = Object.freeze({
  OFFLINE: "offline",
  FUTURE_AVAILABLE: "future-provider-available",
  ERROR: "error",
  READY: "ready",
});

class ProviderManager {
  constructor(providers = {}) {
    this.providers = {
      dictionary: providers.dictionary || new DictionaryProvider(),
      translation: providers.translation || new TranslationProvider(),
      grammar: providers.grammar || new GrammarProvider(),
      vocabulary: providers.vocabulary || new VocabularyProvider(),
      speech: providers.speech || new SpeechProvider(),
    };
  }

  getRequiredProviders(selectionType) {
    const map = {
      "single-word": ["dictionary", "translation", "speech"],
      "multi-word-expression": ["translation", "vocabulary", "speech"],
      "phrasal-verb": ["translation", "dictionary", "vocabulary", "speech"],
      idiom: ["translation", "vocabulary", "speech"],
      "complete-sentence": ["translation", "grammar", "vocabulary", "speech"],
      paragraph: ["translation", "grammar", "vocabulary", "speech"],
    };
    return map[selectionType] || ["translation", "speech"];
  }

  async resolve(selection) {
    if (selection.type === "single-word") return this.resolveWord(selection);
    if (selection.type === "complete-sentence") return this.resolveSentence(selection);
    if (selection.type === "paragraph") return this.resolveParagraph(selection);
    return this.resolveExpression(selection);
  }

  async resolveWord(selection) {
    const settled = await Promise.allSettled([
      this.providers.dictionary.lookupWord(selection.text),
      this.providers.translation.translate(selection.text),
    ]);
    const [dictionary, translation] = settled;

    const dictionaryData = getSettledValue(dictionary);
    const translationData = getSettledValue(translation);

    return this.createProviderResult(selection, {
      dictionary: dictionaryData,
      translation: translationData,
      speech: dictionaryData?.audioUrl
        ? { type: "audio-url", url: dictionaryData.audioUrl, text: selection.text }
        : this.providers.speech.createBrowserSpeech(selection.text),
      cefrLevel: estimateCefrLevel(selection.text),
    }, {
      dictionary,
      translation,
      speech: { status: "fulfilled" },
    });
  }

  async resolveSentence(selection) {
    const settled = await Promise.allSettled([
      this.providers.translation.translate(selection.text),
      this.providers.grammar.analyze(selection.text),
    ]);
    const [translation, grammar] = settled;

    return this.createProviderResult(selection, {
      translation: getSettledValue(translation),
      grammar: getSettledValue(grammar),
      vocabulary: this.providers.vocabulary.analyze(selection.text),
      speech: this.providers.speech.createBrowserSpeech(selection.text),
    }, {
      translation,
      grammar,
      vocabulary: { status: "fulfilled" },
      speech: { status: "fulfilled" },
    });
  }

  async resolveParagraph(selection) {
    const settled = await Promise.allSettled([
      this.providers.translation.translate(selection.text),
      this.providers.grammar.analyze(selection.text),
    ]);
    const [translation, grammar] = settled;

    return this.createProviderResult(selection, {
      translation: getSettledValue(translation),
      grammar: getSettledValue(grammar),
      vocabulary: this.providers.vocabulary.analyze(selection.text),
      speech: this.providers.speech.createBrowserSpeech(selection.text),
    }, {
      translation,
      grammar,
      vocabulary: { status: "fulfilled" },
      speech: { status: "fulfilled" },
    });
  }

  async resolveExpression(selection) {
    const settled = await Promise.allSettled([
      this.providers.translation.translate(selection.text),
    ]);
    const [translation] = settled;

    return this.createProviderResult(selection, {
      translation: getSettledValue(translation),
      vocabulary: this.providers.vocabulary.analyze(selection.text),
      speech: this.providers.speech.createBrowserSpeech(selection.text),
    }, {
      translation,
      vocabulary: { status: "fulfilled" },
      speech: { status: "fulfilled" },
    });
  }

  createProviderResult(selection, data, settledByProvider) {
    const settledResults = Object.values(settledByProvider);
    const failed = settledResults.filter((result) => result.status === "rejected");
    const providerStates = this.getRequiredProviders(selection.type).map((id) => ({
      id,
      name: getProviderName(id),
      status: settledByProvider[id]?.status === "rejected" ? ProviderStatus.OFFLINE : ProviderStatus.READY,
    }));

    return {
      status: failed.length === settledResults.length ? ProviderStatus.OFFLINE : ProviderStatus.READY,
      providerStates,
      data,
      errors: failed.map((result) => result.reason?.message || "Provider unavailable"),
      resolvedAt: Date.now(),
    };
  }
}

function getSettledValue(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function getProviderName(id) {
  const names = {
    dictionary: "Dictionary Provider",
    translation: "Translation Provider",
    grammar: "Grammar Provider",
    vocabulary: "Vocabulary Detector",
    speech: "Pronunciation Provider",
  };
  return names[id] || "Language Provider";
}

return { ProviderStatus, ProviderManager };
})();


// ---- selectionEngine.js ----
Modules.SelectionEngine = (function() {
'use strict';
const PHRASAL_VERB_PARTICLES = new Set([
  "about", "across", "after", "along", "around", "away", "back", "by",
  "down", "for", "forward", "in", "into", "off", "on", "out", "over",
  "through", "to", "up", "with",
]);

const COMMON_IDIOM_HINTS = [
  "piece of cake",
  "break the ice",
  "under the weather",
  "hit the books",
  "once in a blue moon",
  "the ball is in your court",
  "cost an arm and a leg",
  "let the cat out of the bag",
  "on the same page",
  "better late than never",
];

const COMMON_PHRASAL_VERB_BASES = new Set([
  "ask", "break", "bring", "call", "carry", "check", "come", "cut",
  "find", "get", "give", "go", "hold", "keep", "look", "make", "pick",
  "put", "run", "set", "take", "turn", "work",
]);

const SelectionTypes = Object.freeze({
  SINGLE_WORD: "single-word",
  MULTI_WORD_EXPRESSION: "multi-word-expression",
  PHRASAL_VERB: "phrasal-verb",
  IDIOM: "idiom",
  COMPLETE_SENTENCE: "complete-sentence",
  PARAGRAPH: "paragraph",
});

function analyzeSelection(selectionInput) {
  const text = normalizeSelectionText(selectionInput?.text || "");
  if (!text) {
    return createEmptySelection();
  }

  const words = getWords(text);
  const sentenceCount = countSentences(text);
  const blockText = normalizeSelectionText(selectionInput?.blockText || "");
  const type = classifySelection({ text, words, sentenceCount, blockText });

  return {
    id: createSelectionId(),
    text,
    normalizedText: text.toLowerCase(),
    type,
    label: getSelectionLabel(type),
    confidence: getConfidence(type, words, sentenceCount, text, blockText),
    metrics: {
      characterCount: text.length,
      wordCount: words.length,
      sentenceCount,
    },
    context: {
      chapterIndex: selectionInput?.chapterIndex ?? 0,
      chapterTitle: selectionInput?.chapterTitle || "",
      blockText,
      surroundingText: normalizeSelectionText(selectionInput?.surroundingText || blockText),
    },
    createdAt: Date.now(),
  };
}

function classifySelection({ text, words, sentenceCount, blockText }) {
  if (isParagraph(text, blockText, sentenceCount)) return SelectionTypes.PARAGRAPH;
  if (isCompleteSentence(text, sentenceCount)) return SelectionTypes.COMPLETE_SENTENCE;
  if (isSingleWord(text, words)) return SelectionTypes.SINGLE_WORD;
  if (isKnownIdiom(text)) return SelectionTypes.IDIOM;
  if (isLikelyPhrasalVerb(words)) return SelectionTypes.PHRASAL_VERB;
  return SelectionTypes.MULTI_WORD_EXPRESSION;
}

function isSingleWord(text, words) {
  return words.length === 1 && /^[a-zA-Z][a-zA-Z'-]*$/.test(text);
}

function isCompleteSentence(text, sentenceCount) {
  return sentenceCount === 1 && /[.!?]["')\]]?$/.test(text) && getWords(text).length >= 4;
}

function isParagraph(text, blockText, sentenceCount) {
  const wordCount = getWords(text).length;
  if (text === blockText && wordCount >= 18) return true;
  return sentenceCount > 1 && wordCount >= 28;
}

function isKnownIdiom(text) {
  const value = text.toLowerCase();
  return COMMON_IDIOM_HINTS.some((idiom) => value.includes(idiom));
}

function isLikelyPhrasalVerb(words) {
  if (words.length < 2 || words.length > 4) return false;
  const [base, second, third] = words.map((word) => word.toLowerCase());
  const hasParticle = PHRASAL_VERB_PARTICLES.has(second) || PHRASAL_VERB_PARTICLES.has(third);
  return hasParticle && (COMMON_PHRASAL_VERB_BASES.has(base) || /^[a-z]+$/.test(base));
}

function countSentences(text) {
  const matches = text.match(/[^.!?]+[.!?]+["')\]]?/g);
  if (matches?.length) return matches.length;
  return text.length > 0 ? 1 : 0;
}

function getWords(text) {
  return text.match(/[a-zA-Z]+(?:[-'][a-zA-Z]+)?/g) || [];
}

function getSelectionLabel(type) {
  const labels = {
    [SelectionTypes.SINGLE_WORD]: "Single Word",
    [SelectionTypes.MULTI_WORD_EXPRESSION]: "Multi-word Expression",
    [SelectionTypes.PHRASAL_VERB]: "Phrasal Verb",
    [SelectionTypes.IDIOM]: "Idiom",
    [SelectionTypes.COMPLETE_SENTENCE]: "Complete Sentence",
    [SelectionTypes.PARAGRAPH]: "Paragraph",
  };
  return labels[type] || "Selection";
}

function getConfidence(type, words, sentenceCount, text, blockText) {
  if (type === SelectionTypes.SINGLE_WORD) return 0.98;
  if (type === SelectionTypes.PARAGRAPH && text === blockText) return 0.92;
  if (type === SelectionTypes.COMPLETE_SENTENCE && sentenceCount === 1) return 0.9;
  if (type === SelectionTypes.PHRASAL_VERB) return 0.72;
  if (type === SelectionTypes.IDIOM) return 0.7;
  if (words.length > 1) return 0.78;
  return 0.55;
}

function createEmptySelection() {
  return {
    id: createSelectionId(),
    text: "",
    normalizedText: "",
    type: SelectionTypes.MULTI_WORD_EXPRESSION,
    label: "Empty Selection",
    confidence: 0,
    metrics: { characterCount: 0, wordCount: 0, sentenceCount: 0 },
    context: {},
    createdAt: Date.now(),
  };
}

function normalizeSelectionText(text) {
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSelectionId() {
  return `selection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

return { SelectionTypes, analyzeSelection };
})();


// ---- languageEngine.js ----
Modules.LanguageEngine = (function() {
'use strict';
const { ProviderManager, ProviderStatus } = Modules.ProviderManager;
const { analyzeSelection, SelectionTypes } = Modules.SelectionEngine;

class LanguageEngine {
  constructor({ providerManager = new ProviderManager() } = {}) {
    this.providerManager = providerManager;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
  }

  async analyze(selectionInput) {
    this.init();
    const selection = analyzeSelection(selectionInput);
    const route = this.getRouteForSelection(selection);
    const providerResult = await this.providerManager.resolve(selection);

    return {
      selection,
      route,
      providerResult,
      viewModel: createResultViewModel(selection, route, providerResult),
    };
  }

  getRouteForSelection(selection) {
    const providerIds = this.providerManager.getRequiredProviders(selection.type);
    return {
      selectionType: selection.type,
      preferredProvider: providerIds[0] || "translation",
      providerIds,
    };
  }
}

function createLanguageEngine(options) {
  return new LanguageEngine(options);
}

function createResultViewModel(selection, route, providerResult) {
  const base = {
    id: selection.id,
    type: selection.type,
    typeLabel: selection.label,
    text: selection.text,
    confidence: selection.confidence,
    metrics: selection.metrics,
    route,
    providerStatus: providerResult.status,
    providerStates: providerResult.providerStates,
    state: getApplicationState(selection, providerResult),
    providerErrors: providerResult.errors || [],
    data: providerResult.data || {},
  };

  if (selection.type === SelectionTypes.SINGLE_WORD) return createWordView(base);
  if (selection.type === SelectionTypes.COMPLETE_SENTENCE) return createSentenceView(base);
  if (selection.type === SelectionTypes.PARAGRAPH) return createParagraphView(base);
  return createExpressionView(base);
}

function createWordView(base) {
  const dictionary = base.data.dictionary || {};
  const translation = base.data.translation || {};

  return {
    ...base,
    view: "word",
    title: dictionary.word || base.text,
    fields: {
      word: dictionary.word || base.text,
      ipa: dictionary.ipa || "Not available",
      partOfSpeech: dictionary.partOfSpeech || "Not available",
      spanishTranslation: translation.translatedText || getUnavailableText("translation"),
      definition: dictionary.definition || getUnavailableText("definition"),
      example: dictionary.example || getUnavailableText("example"),
      cefrLevel: base.data.cefrLevel || "Not available",
    },
    audio: base.data.speech,
    moreInformation: {
      synonyms: dictionary.synonyms || [],
      antonyms: dictionary.antonyms || [],
    },
    actions: ["Play Audio", "Save Word", "Favorite", "Create Flashcard", "Copy", "Share", "More Information"],
  };
}

function createExpressionView(base) {
  const translation = base.data.translation || {};
  const vocabulary = base.data.vocabulary || {};

  return {
    ...base,
    view: "expression",
    title: base.typeLabel,
    fields: {
      originalText: base.text,
      spanishTranslation: translation.translatedText || getUnavailableText("translation"),
      importantVocabulary: formatVocabulary(vocabulary.importantVocabulary),
      usage: "Traducción automática: comprueba el sentido de la expresión en el contexto del libro.",
    },
    audio: base.data.speech,
    moreInformation: {},
    actions: ["Play Audio", "Copy", "Save", "More Information"],
  };
}

function createSentenceView(base) {
  const translation = base.data.translation || {};
  const grammar = base.data.grammar || {};
  const vocabulary = base.data.vocabulary || {};

  return {
    ...base,
    view: "sentence",
    title: "Sentence Analysis",
    fields: {
      originalSentence: base.text,
      spanishTranslation: translation.translatedText || getUnavailableText("translation"),
      grammarExplanation: grammar.explanation || getUnavailableText("grammar"),
      importantVocabulary: formatVocabulary(vocabulary.importantVocabulary),
    },
    audio: base.data.speech,
    grammarIssues: grammar.issues || [],
    moreInformation: {},
    actions: ["Play Audio", "Copy", "Save", "Add Note"],
  };
}

function createParagraphView(base) {
  const translation = base.data.translation || {};
  const grammar = base.data.grammar || {};
  const vocabulary = base.data.vocabulary || {};

  return {
    ...base,
    view: "paragraph",
    title: "Paragraph Analysis",
    fields: {
      originalText: base.text,
      translation: translation.translatedText || getUnavailableText("translation"),
      readingAudio: "Browser speech synthesis is available for replay.",
      grammarSummary: grammar.explanation || getUnavailableText("grammar"),
      importantVocabulary: formatVocabulary(vocabulary.importantVocabulary),
      
    },
    audio: base.data.speech,
    grammarIssues: grammar.issues || [],
    moreInformation: {},
    actions: ["Play Audio", "Copy", "Save", "Add Note"],
  };
}

function getApplicationState(selection, providerResult) {
  if (!selection.text) return "empty";
  if (providerResult.status === ProviderStatus.OFFLINE) return "offline";
  if (providerResult.status === ProviderStatus.ERROR) return "error";
  if (selection.type === SelectionTypes.SINGLE_WORD && !providerResult.data?.dictionary) return "unknown";
  return "ready";
}

function getUnavailableText(label) {
  return `${label[0].toUpperCase()}${label.slice(1)} provider unavailable.`;
}

function formatVocabulary(words = []) {
  return words.length ? words.join(", ") : "No high-priority vocabulary detected.";
}

return { LanguageEngine, createLanguageEngine };
})();


// ---- resultPanel.js ----
Modules.ResultPanel = (function() {
'use strict';
const MORE_INFORMATION_SECTIONS = ["Synonyms", "Antonyms"];

class ResultPanel {
  constructor(root) {
    this.root = root;
    this.overlay = root.querySelector("[data-result-overlay]");
    this.closeButton = root.querySelector("[data-result-close]");
    this.resizeHandle = root.querySelector("[data-result-resize]");
    this.content = root.querySelector("[data-result-content]");
    this.title = root.querySelector("[data-result-title]");
    this.kicker = root.querySelector("[data-result-kicker]");
    this.state = root.querySelector("[data-result-state]");
    this.currentResult = null;
    this.isResizing = false;
    this.currentAudio = null;
  }

  init({ onClose, onHighlight } = {}) {
    this.onClose = onClose;
    this.onHighlight = onHighlight;
    this.closeButton.addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", () => this.close());
    this.content.addEventListener("click", (event) => this.handleAction(event));
    this.resizeHandle.addEventListener("pointerdown", (event) => this.startResize(event));
    document.addEventListener("pointermove", (event) => this.resize(event));
    document.addEventListener("pointerup", () => this.stopResize());
  }

  openLoading(selectionText) {
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    this.kicker.textContent = "Language Intelligence Engine";
    this.title.textContent = "Analyzing selection";
    this.state.textContent = selectionText || "Selection";
    this.content.innerHTML = `<div class="panel-state loading-state"><span></span><p>Preparing language result...</p></div>`;
  }

  openResult(result) {
    this.currentResult = result;
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    this.kicker.textContent = result.typeLabel;
    this.title.textContent = result.title;
    this.state.textContent = getStateLabel(result.state);
    this.content.innerHTML = this.renderResult(result);
  }

  openError(message) {
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    this.kicker.textContent = "Language Intelligence Engine";
    this.title.textContent = "Something went wrong";
    this.state.textContent = "Error State";
    this.content.innerHTML = `<div class="panel-state error-state"><p>${escapeHtml(message)}</p></div>`;
  }

  close() {
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.currentResult = null;
    this.onClose?.();
  }

  isOpen() {
    return this.root.classList.contains("is-open");
  }

  renderResult(result) {
    return `
      <section class="result-selected-text">
        <p class="result-label">Selected text</p>
        <blockquote>${escapeHtml(result.text)}</blockquote>
        <div class="result-meta">
          <span>${escapeHtml(result.typeLabel)}</span>
          <span>${Math.round(result.confidence * 100)}% confidence</span>
          <span>${result.metrics.wordCount} words</span>
        </div>
      </section>
      ${this.renderProviderState(result)}
      ${this.renderPrimaryView(result)}
      ${this.renderActions(result)}
      ${this.renderMoreInformation()}
    `;
  }

  renderProviderState(result) {
    const providers = result.providerStates.map((provider) => `
      <li>
        <span>${escapeHtml(provider.name)}</span>
        <strong>${getProviderStatusLabel(provider.status)}</strong>
      </li>
    `).join("");
    const errors = result.providerErrors?.length
      ? `<div class="provider-errors">${result.providerErrors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}</div>`
      : "";

    return `
      <section class="provider-state-card">
        <div>
          <p class="result-label">Provider status</p>
          <h4>${escapeHtml(getStateLabel(result.state))}</h4>
          <p>${escapeHtml(getStateMessage(result))}</p>
        </div>
        <ul>${providers}</ul>
        ${errors}
      </section>
    `;
  }

  renderPrimaryView(result) {
    const rows = Object.entries(result.fields)
      .map(([label, value]) => `
        <div class="result-field">
          <span>${escapeHtml(formatLabel(label))}</span>
          <p>${escapeHtml(value)}</p>
        </div>
      `)
      .join("");

    return `<section class="result-fields">${rows}</section>`;
  }

  renderActions(result) {
    const buttons = result.actions.map((action) => `
      <button class="result-action" data-result-action="${escapeHtml(action)}">${escapeHtml(action)}</button>
    `).join("");

    return `
      <section class="result-actions">
        ${buttons}
        <button class="result-action accent" data-result-action="Highlight Selection">Highlight Selection</button>
      </section>
    `;
  }

  renderMoreInformation() {
    const active = this.currentResult?.moreInformation || {};
    return `
      <section class="more-info">
        <p class="result-label">More information</p>
        ${MORE_INFORMATION_SECTIONS.map((section) => `
          <details>
            <summary>${escapeHtml(section)}</summary>
            <p>${escapeHtml(getMoreInfoContent(section, active))}</p>
          </details>
        `).join("")}
      </section>
    `;
  }

  async handleAction(event) {
    const actionButton = event.target.closest("[data-result-action]");
    if (!actionButton || !this.currentResult) return;

    const action = actionButton.dataset.resultAction;
    if (action === "Play Audio") {
      this.playAudio(actionButton);
      return;
    }
    try {
      if (action === "Copy") { await navigator.clipboard.writeText(this.currentResult.text); }
      else if (action === "Highlight Selection") { this.onHighlight?.(this.currentResult.text); return; }
      else if (action === "More Information") { this.content.querySelectorAll(".more-info details").forEach(d=>d.open=true); return; }
      else if (action === "Share") { if(navigator.share) await navigator.share({text:this.currentResult.text,title:"ReadFlow"}); else {await navigator.clipboard.writeText(this.currentResult.text); Modules.Notebook.notify("Texto copiado para compartir.");} }
      else { await Modules.Notebook.save(this.currentResult,action); }
      actionButton.textContent = "✓ Listo";
      window.setTimeout(() => { actionButton.textContent = action; }, 1400);
    } catch(error) { if(error.name!=="AbortError") Modules.Notebook.notify("No se completó: "+error.message); }
  }

  playAudio(button) {
    const audio = this.currentResult?.audio;
    if (!audio) {
      button.textContent = "No audio";
      window.setTimeout(() => { button.textContent = "Play Audio"; }, 1200);
      return;
    }

    button.textContent = "Loading audio";
    if (audio.type === "audio-url" && audio.url) {
      this.currentAudio?.pause?.();
      this.currentAudio = new Audio(audio.url);
      this.currentAudio.addEventListener("canplaythrough", () => {
        button.textContent = "Replay Audio";
      }, { once: true });
      this.currentAudio.addEventListener("error", () => {
        button.textContent = "Audio unavailable";
        window.setTimeout(() => { button.textContent = "Play Audio"; }, 1400);
      }, { once: true });
      this.currentAudio.play().catch(() => {
        button.textContent = "Click to replay";
      });
      return;
    }

    if (audio.type === "speech-synthesis" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(audio.text);
      utterance.lang = audio.language || "en-US";
      utterance.onstart = () => { button.textContent = "Playing"; };
      utterance.onend = () => { button.textContent = "Replay Audio"; };
      utterance.onerror = () => { button.textContent = "Audio unavailable"; };
      window.speechSynthesis.speak(utterance);
      return;
    }

    button.textContent = "Audio unavailable";
  }

  startResize(event) {
    this.isResizing = true;
    this.resizeHandle.setPointerCapture?.(event.pointerId);
  }

  resize(event) {
    if (!this.isResizing) return;
    const width = Math.min(620, Math.max(340, window.innerWidth - event.clientX));
    this.root.style.setProperty("--result-panel-width", `${width}px`);
  }

  stopResize() {
    this.isResizing = false;
  }
}

function getStateLabel(state) {
  const labels = {
    loading: "Loading State",
    empty: "Empty State",
    error: "Error State",
    offline: "Provider Offline State",
    unknown: "Unknown Word State",
    ready: "Provider Results Ready",
    "future-provider-available": "Future Provider Available",
  };
  return labels[state] || "Provider Results Ready";
}

function getStateMessage(result) {
  if (result.state === "ready") return "Live language services returned data for this selection.";
  if (result.state === "unknown") return "The dictionary provider could not find this word, but other services may still be available.";
  if (result.state === "offline") return "The configured provider is unavailable right now. You can keep reading.";
  if (result.state === "error") return "A provider returned an unexpected error.";
  return "This language surface is prepared for future providers.";
}

function getProviderStatusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "offline") return "Offline";
  if (status === "error") return "Error";
  return "Prepared";
}

function getMoreInfoContent(section, active) {
  const key = section.toLowerCase().replace(/[^a-z]+(.)/g, (_, letter) => letter.toUpperCase());
  const value = active[key];
  if (Array.isArray(value) && value.length) return value.join(", ");
  if (typeof value === "string" && value) return value;
  return "El diccionario no devolvió información para esta sección.";
}

function formatLabel(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

return { ResultPanel };
})();


// ---- uiController.js ----
Modules.UIController = (function() {
'use strict';
const { createLanguageEngine } = Modules.LanguageEngine;
const { ResultPanel } = Modules.ResultPanel;

class UIController {
  constructor({
    readerPage,
    resultPanelRoot,
    getReaderContext,
    onHighlightRequest,
    languageEngine = createLanguageEngine(),
  }) {
    this.readerPage = readerPage;
    this.resultPanel = new ResultPanel(resultPanelRoot);
    this.getReaderContext = getReaderContext;
    this.onHighlightRequest = onHighlightRequest;
    this.languageEngine = languageEngine;
    this.lastSelectionSignature = "";
  }

  init() {
    this.languageEngine.init();
    this.resultPanel.init({
      onClose: () => this.clearSelectionSignature(),
      onHighlight: (text) => this.onHighlightRequest?.(text),
    });
    this.readerPage.addEventListener("mouseup", (event) => {if(!matchMedia('(pointer: coarse)').matches)this.handleSelection(event);});
    this.readerPage.addEventListener("touchend",()=>setTimeout(()=>Modules.Notebook.offerSelection(this),350),{passive:true});
    document.addEventListener("selectionchange",()=>{if(matchMedia('(pointer: coarse)').matches){clearTimeout(this.touchTimer);this.touchTimer=setTimeout(()=>Modules.Notebook.offerSelection(this),400);}});
    this.readerPage.addEventListener("keyup", (event) => this.handleSelection(event));
    this.readerPage.addEventListener("click", (event) => this.handleWordClick(event));
    document.addEventListener("keydown", (event) => this.handleGlobalKeys(event));
    document.addEventListener("click", (event) => this.closeOnOutsideClick(event));
  }

  async handleWordClick(event) {
    if (event.detail !== 1 || event.target.closest("button, input, textarea, select, mark, .saved-highlight")) return;
    const selection = window.getSelection();
    if (selection?.toString().trim()) return;

    const wordInfo = getWordAtPoint(event.clientX, event.clientY);
    if (!wordInfo?.word) return;
    event.stopPropagation();
    await this.openAnalysis(wordInfo.word, {
      blockText: wordInfo.blockText,
      surroundingText: this.readerPage.textContent || "",
      event,
    });
  }

  async handleSelection(event) {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim();
    if (!text || text.length < 2 || !this.readerPage.contains(selection.anchorNode)) return;
    event.stopPropagation();

    const signature = `${text}:${selection.anchorOffset}:${selection.focusOffset}`;
    if (signature === this.lastSelectionSignature && this.resultPanel.isOpen()) return;
    this.lastSelectionSignature = signature;

    const block = this.getSelectionBlock(selection.anchorNode);
    await this.openAnalysis(text, {
      blockText: block?.textContent || "",
      surroundingText: this.readerPage.textContent || "",
      event,
    });
  }

  async openAnalysis(text, context = {}) {
    const signature = `${text}:${context.blockText}`;
    const readerContext = this.getReaderContext?.() || {};
    if (signature === this.lastSelectionSignature && this.resultPanel.isOpen()) return;
    this.lastSelectionSignature = signature;
    const requestId = this.analysisRequest = (this.analysisRequest || 0) + 1;
    this.resultPanel.openLoading(text);

    try {
      const result = await this.languageEngine.analyze({
        text,
        blockText: context.blockText,
        surroundingText: context.surroundingText,
        chapterIndex: readerContext.chapterIndex,
        chapterTitle: readerContext.chapterTitle,
      });
      if(requestId !== this.analysisRequest) return;
      let viewModel=result.viewModel;
      if(!viewModel.data.translation && !viewModel.data.dictionary){const cached=await Modules.Notebook.cached(text);if(cached){viewModel=cached;Modules.Notebook.notify("Mostrando una consulta guardada; no se pudo consultar en línea.");}}
      if(requestId !== this.analysisRequest) return;
      this.resultPanel.openResult(viewModel);
      Modules.Notebook.remember(viewModel).catch(()=>Modules.Notebook.notify("No se pudo guardar el historial."));
    } catch (error) {
      this.resultPanel.openError(error.message || "Language analysis could not be prepared.");
    }

    context.event?.stopPropagation();
  }

  closePanel() {
    this.resultPanel.close();
  }

  clearSelectionSignature() {
    this.lastSelectionSignature = "";
  }

  getSelectionBlock(node) {
    let current = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (current && current !== this.readerPage) {
      if (["P", "LI", "BLOCKQUOTE"].includes(current.tagName)) return current;
      current = current.parentElement;
    }
    return null;
  }

  handleGlobalKeys(event) {
    if (event.key === "Escape" && this.resultPanel.isOpen()) {
      this.resultPanel.close();
    }
  }

  closeOnOutsideClick(event) {
    if (!this.resultPanel.isOpen()) return;
    if (event.target.closest(".language-result-panel")) return;
    this.resultPanel.close();
  }
}

function createUIController(options) {
  return new UIController(options);
}

function getWordAtPoint(x, y) {
  const range = getPointRange(x, y);
  const node = range?.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent || "";
  const offset = range.startOffset;
  let start = offset;
  let end = offset;
  while (start > 0 && /[a-zA-Z'-]/.test(text[start - 1])) start -= 1;
  while (end < text.length && /[a-zA-Z'-]/.test(text[end])) end += 1;
  const word = text.slice(start, end).replace(/^'+|'+$/g, "");
  const block = findBlockElement(node);

  return /^[a-zA-Z][a-zA-Z'-]*$/.test(word)
    ? { word, blockText: block?.textContent || "" }
    : null;
}

function getPointRange(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const position = document.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

function findBlockElement(node) {
  let current = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (current && !["P", "LI", "BLOCKQUOTE"].includes(current.tagName)) {
    current = current.parentElement;
  }
  return current;
}

return { UIController, createUIController };
})();


// ---- reader.js ----
Modules.Reader = (function() {
'use strict';
const WORDS_PER_MINUTE = 180;

function createTxtBook(fileName, text) {
  const cleanText = normalizeText(text);
  const paragraphs = splitParagraphs(cleanText);
  const title = stripExtension(fileName);
  const chapters = chunkParagraphs(paragraphs, title);

  return {
    title,
    author: "",
    type: "txt",
    chapters,
    toc: chapters.map((chapter, index) => ({ label: chapter.title, index })),
    wordCount: countWords(cleanText),
  };
}

async function createEpubBook(fileName, arrayBuffer) {
  const zip = await readZipEntries(arrayBuffer);
  const containerXml = await zipText(zip, "META-INF/container.xml");
  if (!containerXml) throw new Error("This EPUB is missing its container file.");

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const rootFilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!rootFilePath) throw new Error("This EPUB does not contain a readable package file.");

  const rootDir = rootFilePath.includes("/") ? rootFilePath.slice(0, rootFilePath.lastIndexOf("/") + 1) : "";
  const packageXml = await zipText(zip, rootFilePath);
  const packageDoc = parser.parseFromString(packageXml, "application/xml");

  const metadataTitle = textFrom(packageDoc, "metadata title") || stripExtension(fileName);
  const metadataCreator = textFrom(packageDoc, "metadata creator");
  const manifest = new Map();

  packageDoc.querySelectorAll("manifest item").forEach((item) => {
    manifest.set(item.getAttribute("id"), {
      href: item.getAttribute("href"),
      mediaType: item.getAttribute("media-type"),
      properties: item.getAttribute("properties") || "",
    });
  });

  const spineIds = [...packageDoc.querySelectorAll("spine itemref")]
    .map((item) => item.getAttribute("idref"))
    .filter(Boolean);

  const navItem = [...manifest.values()].find((item) => item.properties.includes("nav"));
  const tocLabels = navItem ? await readEpubToc(zip, resolvePath(rootDir, navItem.href), parser) : [];
  const chapters = [];

  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item || !/html|xhtml/i.test(item.mediaType || item.href)) continue;

    const chapterPath = resolvePath(rootDir, item.href);
    const html = await zipText(zip, chapterPath);
    if (!html) continue;

    const chapter = parseHtmlChapter(html, parser, tocLabels[chapters.length] || `Chapter ${chapters.length + 1}`);
    if (chapter.content.trim()) chapters.push(chapter);
  }

  if (!chapters.length) throw new Error("No readable chapters were found in this EPUB.");

  const plainText = chapters.map((chapter) => chapter.content).join(" ");
  return {
    title: metadataTitle,
    author: metadataCreator,
    type: "epub",
    chapters,
    toc: chapters.map((chapter, index) => ({ label: chapter.title, index })),
    wordCount: countWords(plainText),
  };
}

function getEstimatedMinutes(wordCount) {
  return Math.max(1, Math.ceil((wordCount || 0) / WORDS_PER_MINUTE));
}

function countWords(text) {
  return (text.match(/\b[\w']+\b/g) || []).length;
}

function formatChapterContent(content, query = "", highlights = []) {
  const paragraphs = splitParagraphs(content);
  const escapedQuery = escapeRegExp(query.trim());
  const pattern = escapedQuery ? new RegExp(`(${escapedQuery})`, "gi") : null;
  const chapterHighlights = [...highlights].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0));

  return paragraphs.map((paragraph, index) => {
    let safe = escapeHtml(paragraph);
    chapterHighlights.forEach((highlight) => {
      if (!highlight.text) return;
      const escapedText = escapeHtml(highlight.text.trim());
      if (!escapedText) return;
      const highlightPattern = new RegExp(escapeRegExp(escapedText), "i");
      safe = safe.replace(
        highlightPattern,
        `<span class="saved-highlight ${highlight.color || "yellow"}" data-highlight-id="${highlight.id}">$&</span>`
      );
    });
    const highlighted = pattern ? safe.replace(pattern, "<mark>$1</mark>") : safe;
    return `<p data-paragraph-index="${index}">${highlighted}</p>`;
  }).join("");
}

function findSearchMatches(book, query) {
  const value = query.trim().toLowerCase();
  if (!value) return [];

  const matches = [];
  book.chapters.forEach((chapter, chapterIndex) => {
    const lower = chapter.content.toLowerCase();
    let index = lower.indexOf(value);
    while (index !== -1) {
      matches.push({ chapterIndex, index });
      index = lower.indexOf(value, index + value.length);
    }
  });

  return matches;
}

function parseHtmlChapter(html, parser, fallbackTitle) {
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, svg, nav, audio, video").forEach((node) => node.remove());

  const title = cleanInlineText(doc.querySelector("h1,h2,h3,title")?.textContent) || fallbackTitle;
  const contentNodes = [...doc.body.querySelectorAll("h1,h2,h3,h4,p,li,blockquote")];
  const content = contentNodes
    .map((node) => cleanInlineText(node.textContent))
    .filter((text) => text.length > 0 && text !== title)
    .join("\n\n");

  return { title, content };
}

async function readEpubToc(zip, navPath, parser) {
  const navHtml = await zipText(zip, navPath);
  if (!navHtml) return [];

  const doc = parser.parseFromString(navHtml, "text/html");
  return [...doc.querySelectorAll("nav a, nav li")]
    .map((node) => cleanInlineText(node.textContent))
    .filter(Boolean);
}

function chunkParagraphs(paragraphs, title) {
  if (!paragraphs.length) {
    return [{ title: "Chapter 1", content: "This text file is empty." }];
  }

  const headingIndexes = paragraphs
    .map((paragraph, index) => (/^(chapter|part|section)\s+[\divxlc]+/i.test(paragraph) ? index : -1))
    .filter((index) => index >= 0);

  if (headingIndexes.length > 1) {
    return headingIndexes.map((start, chapterNumber) => {
      const end = headingIndexes[chapterNumber + 1] ?? paragraphs.length;
      const heading = paragraphs[start];
      return {
        title: heading,
        content: paragraphs.slice(start + 1, end).join("\n\n") || heading,
      };
    });
  }

  const chunkSize = 22;
  const chunks = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    chunks.push({
      title: chunks.length === 0 ? title : `Section ${chunks.length + 1}`,
      content: paragraphs.slice(i, i + chunkSize).join("\n\n"),
    });
  }
  return chunks;
}

function splitParagraphs(text) {
  return normalizeText(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function normalizeText(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled Book";
}

function textFrom(doc, selector) {
  return cleanInlineText(doc.querySelector(selector)?.textContent || "");
}

function cleanInlineText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function resolvePath(base, href) {
  const stack = base.split("/").filter(Boolean);
  const parts = href.split("/").filter(Boolean);
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

async function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder();
  const entries = new Map();
  const eocdOffset = findEndOfCentralDirectory(view);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));

    entries.set(normalizeZipPath(name), {
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    async get(path) {
      const entry = entries.get(normalizeZipPath(path));
      if (!entry) return null;
      return inflateEntry(view, bytes, entry);
    },
  };
}

function findEndOfCentralDirectory(view) {
  const minOffset = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("This EPUB file is not a valid ZIP archive.");
}

async function inflateEntry(view, bytes, entry) {
  const localOffset = entry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== 0x04034b50) return null;

  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return compressed;
  if (entry.method !== 8) {
    throw new Error("This EPUB uses a ZIP compression method this browser cannot read.");
  }
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress EPUB files. Try a current version of Chrome, Edge, or Safari.");
  }

  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
  if (entry.uncompressedSize && decompressed.length !== entry.uncompressedSize) {
    return decompressed.slice(0, entry.uncompressedSize);
  }
  return decompressed;
}

async function zipText(zip, path) {
  const bytes = await zip.get(path);
  return bytes ? new TextDecoder("utf-8").decode(bytes) : "";
}

function normalizeZipPath(path) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").split("#")[0];
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

return { createTxtBook, createEpubBook, getEstimatedMinutes, countWords, formatChapterContent, findSearchMatches };
})();


// ---- storage.js ----
Modules.Storage = (function() {
'use strict';
const DB_NAME = "interactive-english-reading-studio";
const DB_VERSION = 1;
const BOOK_STORE = "books";
const SETTINGS_STORE = "settings";

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

async function transaction(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = action(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getBooks() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readonly");
    const request = tx.objectStore(BOOK_STORE).getAll();
    request.onsuccess = () => {
      const books = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(books);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getBook(id) {
  const db = await openDatabase();
  const tx = db.transaction(BOOK_STORE, "readonly");
  return promisifyRequest(tx.objectStore(BOOK_STORE).get(id));
}

async function saveBook(book) {
  const now = Date.now();
  const normalized = {
    ...book,
    updatedAt: now,
    createdAt: book.createdAt || now,
  };

  await transaction(BOOK_STORE, "readwrite", (store) => store.put(normalized));
  return normalized;
}

async function updateBookProgress(id, progress) {
  const book = await getBook(id);
  if (!book) return null;

  const updated = {
    ...book,
    progress: {
      chapterIndex: progress.chapterIndex,
      scrollRatio: Math.max(0, Math.min(1, progress.scrollRatio || 0)),
      updatedAt: Date.now(),
    },
    updatedAt: Date.now(),
  };

  await transaction(BOOK_STORE, "readwrite", (store) => store.put(updated));
  return updated;
}

async function deleteBook(id) {
  await transaction(BOOK_STORE, "readwrite", (store) => store.delete(id));
}

async function getSetting(key, fallback) {
  const db = await openDatabase();
  const tx = db.transaction(SETTINGS_STORE, "readonly");
  const record = await promisifyRequest(tx.objectStore(SETTINGS_STORE).get(key));
  return record ? record.value : fallback;
}

async function saveSetting(key, value) {
  await transaction(SETTINGS_STORE, "readwrite", (store) => store.put({ key, value }));
  return value;
}

function makeBookId(fileName) {
  const random = crypto.getRandomValues(new Uint32Array(2)).join("-");
  return `${Date.now()}-${random}-${fileName}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

async function exportAll() {
 const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction([BOOK_STORE,SETTINGS_STORE],"readonly");const books=tx.objectStore(BOOK_STORE).getAll();const settings=tx.objectStore(SETTINGS_STORE).getAll();tx.oncomplete=()=>resolve({app:"ReadFlow",schemaVersion:1,exportedAt:new Date().toISOString(),books:books.result,settings:settings.result});tx.onerror=tx.onabort=()=>reject(tx.error);});
}
async function importAll(payload) {
 const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction([BOOK_STORE,SETTINGS_STORE],"readwrite");for(const book of payload.books)tx.objectStore(BOOK_STORE).put(book);for(const setting of payload.settings)tx.objectStore(SETTINGS_STORE).put(setting);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});
}
return { getBooks, getBook, saveBook, updateBookProgress, deleteBook, getSetting, saveSetting, makeBookId, exportAll, importAll };
})();


// ---- app.js (entry point) ----
(function() {
'use strict';
const { deleteBook, getBook, getBooks, getSetting, makeBookId, saveBook, saveSetting, updateBookProgress } = Modules.Storage;

const { createEpubBook, createTxtBook, findSearchMatches, formatChapterContent, getEstimatedMinutes } = Modules.Reader;

const { createUIController } = Modules.UIController;

const DEFAULT_READER_SETTINGS = {
  readerTheme: "light",
  fontSize: 19,
  fontFamily: "Georgia",
  fontWeight: 400,
  lineSpacing: 1.75,
  paragraphSpacing: 1.2,
  pageWidth: 760,
  margin: 48,
};

const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "rose"];

const SAMPLE_TEXT = `Chapter 1

The Art of Attentive Reading

Reading in a new language is not a race. It is a conversation between your attention and the page. Some sentences will feel open and friendly. Others will ask you to pause, return, and notice how meaning is built.

When you read with care, unfamiliar words become landmarks instead of obstacles. You begin to see grammar in motion, not as a rule in a notebook, but as a living pattern inside a real sentence.

Chapter 2

A Quiet Practice

The best reading space gives you control without demanding attention. You can change the size of the text, widen the page, or slow the rhythm of each line until the book feels comfortable.

Over time, this kind of steady practice creates confidence. A chapter that once felt difficult becomes a place you can revisit with more understanding, more vocabulary, and more patience.`;

const state = {
  books: [],
  currentBook: null,
  currentChapterIndex: 0,
  readerSettings: { ...DEFAULT_READER_SETTINGS },
  searchQuery: "",
  selectedText: "",
  selectedColor: "yellow",
  renderKey: "",
  hideReaderPanel: false,
  session: createSession(),
};

const elements = {
  sidebar: document.querySelector("#sidebar"),
  topbar: document.querySelector("#topbar"),
  menuToggle: document.querySelector("#menuToggle"),
  pageTitle: document.querySelector("#pageTitle"),
  bookImport: document.querySelector("#bookImport"),
  importButton: document.querySelector("#importButton"),
  heroImportButton: document.querySelector("#heroImportButton"),
  sampleBookButton: document.querySelector("#sampleBookButton"),
  bookGrid: document.querySelector("#bookGrid"),
  libraryCount: document.querySelector("#libraryCount"),
  emptyState: document.querySelector("#emptyState"),
  readerLayout: document.querySelector("#readerLayout"),
  readerNavButton: document.querySelector("#readerNavButton"),
  readerBookTitle: document.querySelector("#readerBookTitle"),
  readerBookAuthor: document.querySelector("#readerBookAuthor"),
  progressText: document.querySelector("#progressText"),
  progressFill: document.querySelector("#progressFill"),
  readingTimeText: document.querySelector("#readingTimeText"),
  readerThemeControl: document.querySelector("#readerThemeControl"),
  fontSizeControl: document.querySelector("#fontSizeControl"),
  fontFamilyControl: document.querySelector("#fontFamilyControl"),
  fontWeightControl: document.querySelector("#fontWeightControl"),
  lineSpacingControl: document.querySelector("#lineSpacingControl"),
  paragraphSpacingControl: document.querySelector("#paragraphSpacingControl"),
  pageWidthControl: document.querySelector("#pageWidthControl"),
  marginControl: document.querySelector("#marginControl"),
  sessionChapter: document.querySelector("#sessionChapter"),
  sessionPages: document.querySelector("#sessionPages"),
  sessionTime: document.querySelector("#sessionTime"),
  sessionWords: document.querySelector("#sessionWords"),
  sessionCompletion: document.querySelector("#sessionCompletion"),
  sessionWpm: document.querySelector("#sessionWpm"),
  tocList: document.querySelector("#tocList"),
  chapterCount: document.querySelector("#chapterCount"),
  bookmarkList: document.querySelector("#bookmarkList"),
  addBookmarkButton: document.querySelector("#addBookmarkButton"),
  highlightCount: document.querySelector("#highlightCount"),
  highlightList: document.querySelector("#highlightList"),
  backToLibraryButton: document.querySelector("#backToLibraryButton"),
  hideReaderPanelButton: document.querySelector("#hideReaderPanelButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  prevChapterButton: document.querySelector("#prevChapterButton"),
  nextChapterButton: document.querySelector("#nextChapterButton"),
  bookSearchInput: document.querySelector("#bookSearchInput"),
  searchResultText: document.querySelector("#searchResultText"),
  readerPage: document.querySelector("#readerPage"),
  chapterLabel: document.querySelector("#chapterLabel"),
  chapterTitle: document.querySelector("#chapterTitle"),
  chapterContent: document.querySelector("#chapterContent"),
  selectionPopover: document.querySelector("#selectionPopover"),
  highlightNoteInput: document.querySelector("#highlightNoteInput"),
  saveHighlightButton: document.querySelector("#saveHighlightButton"),
  languageResultPanel: document.querySelector("#languageResultPanel"),
  toast: document.querySelector("#toast"),
};

let languageUI;

let suspendProgressWrites=false;
window.ReadFlowApp={suspendWrites:()=>{suspendProgressWrites=true;},flush:()=>saveCurrentProgress(),context:()=>({bookId:state.currentBook?.id||"",bookTitle:state.currentBook?.title||"",chapterIndex:state.currentChapterIndex}),reload:async()=>{await loadPreferences();await refreshLibrary();await restoreLastReadingSession();}};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveCurrentProgress().catch(()=>{});});
window.addEventListener("pagehide",()=>saveCurrentProgress().catch(()=>{}));
document.addEventListener("DOMContentLoaded",()=>init().catch(error=>{showToast("No se pudo abrir el almacenamiento: "+error.message);Modules.Notebook.notify("No se pudo iniciar. Permite el almacenamiento del navegador y vuelve a abrir la app.");}));

async function init() {
  await loadPreferences();
  initializeLanguageIntelligence();
  bindEvents();
  await refreshLibrary();
  await restoreLastReadingSession();
  window.setInterval(updateSessionUI, 10000);
}

function initializeLanguageIntelligence() {
  languageUI = createUIController({
    readerPage: elements.readerPage,
    resultPanelRoot: elements.languageResultPanel,
    getReaderContext: () => ({
      chapterIndex: state.currentChapterIndex,
      chapterTitle: state.currentBook?.chapters[state.currentChapterIndex]?.title || "",
    }),
    onHighlightRequest: (text) => saveHighlightFromLanguagePanel(text),
  });
  languageUI.init();
}

async function loadPreferences() {
  const theme = await getSetting("theme", "light");
  state.readerSettings = {
    ...DEFAULT_READER_SETTINGS,
    ...(await getSetting("readerSettings", DEFAULT_READER_SETTINGS)),
  };
  applyTheme(theme);
  applyReaderSettings();
}

function bindEvents() {
  elements.importButton.addEventListener("click", () => elements.bookImport.click());
  elements.heroImportButton.addEventListener("click", () => elements.bookImport.click());
  elements.bookImport.addEventListener("change", handleFilesSelected);
  elements.sampleBookButton.addEventListener("click", loadSampleBook);
  elements.menuToggle.addEventListener("click", () => elements.sidebar.classList.toggle("is-open"));
  elements.backToLibraryButton.addEventListener("click", () => showView("libraryView"));
  elements.prevChapterButton.addEventListener("click", () => moveChapter(-1));
  elements.nextChapterButton.addEventListener("click", () => moveChapter(1));
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  elements.hideReaderPanelButton.addEventListener("click", toggleReaderPanel);
  elements.addBookmarkButton.addEventListener("click", addBookmark);
  elements.saveHighlightButton.addEventListener("click", saveSelectedHighlight);
  elements.readerPage.addEventListener("scroll", handleReaderScroll, { passive: true });
  elements.bookSearchInput.addEventListener("input", debounce(handleSearch, 180));
  document.addEventListener("keydown", handleKeyboardShortcuts);
  document.addEventListener("click", hideSelectionPopoverWhenOutside);
  document.addEventListener("fullscreenchange", updateFullscreenLabel);

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeChoice);
      saveSetting("theme", button.dataset.themeChoice);
    });
  });

  document.querySelectorAll("[data-highlight-color]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedColor = button.dataset.highlightColor;
      document.querySelectorAll("[data-highlight-color]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
    });
  });

  const settingControls = [
    ["readerTheme", elements.readerThemeControl],
    ["fontSize", elements.fontSizeControl],
    ["fontFamily", elements.fontFamilyControl],
    ["fontWeight", elements.fontWeightControl],
    ["lineSpacing", elements.lineSpacingControl],
    ["paragraphSpacing", elements.paragraphSpacingControl],
    ["pageWidth", elements.pageWidthControl],
    ["margin", elements.marginControl],
  ];

  settingControls.forEach(([key, control]) => {
    control.addEventListener("input", () => {
      state.readerSettings[key] = control.type === "range" ? Number(control.value) : control.value;
      applyReaderSettings();
      saveSetting("readerSettings", state.readerSettings);
    });
  });
}

async function refreshLibrary() {
  state.books = await getBooks();
  renderLibrary();
}

function renderLibrary() {
  elements.libraryCount.textContent = `${state.books.length} ${state.books.length === 1 ? "book" : "books"}`;
  elements.emptyState.hidden = state.books.length > 0;
  elements.bookGrid.innerHTML = "";

  state.books.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";
    const progress = getBookProgressPercent(book);
    card.innerHTML = `
      <div class="book-cover ${book.type === "epub" ? "epub" : "txt"}">
        <span>${escapeHtml(book.type.toUpperCase())}</span>
      </div>
      <div class="book-card-body">
        <p class="book-type">${escapeHtml(book.type)} - ${book.chapters.length} chapter${book.chapters.length === 1 ? "" : "s"}</p>
        <h4>${escapeHtml(book.title)}</h4>
        <p>${escapeHtml(book.author || "Local book")}</p>
        <div class="mini-progress">
          <span style="width:${progress}%"></span>
        </div>
        <div class="book-actions">
          <button class="primary-button small" data-action="open">Open</button>
          <button class="danger-button" data-action="delete">Delete</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="open"]').addEventListener("click", () => openBook(book.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => removeBook(book.id));
    elements.bookGrid.appendChild(card);
  });
}

async function handleFilesSelected(event) {
  const files = [...event.target.files];
  if (!files.length) return;

  for (const file of files) {
    try {
      const parsed = await parseFile(file);
      await saveBook(normalizeBookRecord({
        id: makeBookId(file.name),
        fileName: file.name,
        progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
        ...parsed,
      }));
      showToast(`${parsed.title} imported`);
    } catch (error) {
      showToast(error.message || `Could not import ${file.name}`);
    }
  }

  event.target.value = "";
  await refreshLibrary();
}

async function parseFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "txt" || file.type === "text/plain") {
    return createTxtBook(file.name, await file.text());
  }
  if (extension === "epub" || file.type === "application/epub+zip") {
    return createEpubBook(file.name, await file.arrayBuffer());
  }
  throw new Error("Only EPUB and TXT files are supported in Version 1.0.");
}

async function loadSampleBook() {
  const parsed = createTxtBook("Attentive Reading Sample.txt", SAMPLE_TEXT);
  const saved = await saveBook(normalizeBookRecord({
    id: makeBookId("sample-book"),
    fileName: "Attentive Reading Sample.txt",
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
    ...parsed,
  }));
  await refreshLibrary();
  await openBook(saved.id);
}

async function openBook(id) {
  if(state.currentBook)await saveCurrentProgress();
  const book = normalizeBookRecord(await getBook(id));
  if (!book) return;

  state.currentBook = book;
  state.currentChapterIndex = clamp(book.progress?.chapterIndex || 0, 0, book.chapters.length - 1);
  state.searchQuery = "";
  state.renderKey = "";
  state.session = createSession(getOverallProgressRatio());
  elements.bookSearchInput.value = "";
  elements.readerNavButton.disabled = false;
  saveSetting("lastOpenBookId", book.id);
  showView("readerView");
  renderReader({ forceContent: true });

  requestAnimationFrame(() => {
    const maxScroll = elements.readerPage.scrollHeight - elements.readerPage.clientHeight;
    elements.readerPage.scrollTop = Math.max(0, maxScroll * (book.progress?.scrollRatio || 0));
    updateProgressUI();
    updateSessionUI();
  });
}

async function restoreLastReadingSession() {
  const lastOpenBookId = await getSetting("lastOpenBookId", "");
  if (!lastOpenBookId || !state.books.some((book) => book.id === lastOpenBookId)) return;
  await openBook(lastOpenBookId);
}

function renderReader(options = {}) {
  const book = state.currentBook;
  if (!book) return;

  const chapter = book.chapters[state.currentChapterIndex];
  elements.readerBookTitle.textContent = book.title;
  elements.readerBookAuthor.textContent = book.author || "Imported local book";
  elements.chapterLabel.textContent = `Chapter ${state.currentChapterIndex + 1} of ${book.chapters.length}`;
  elements.chapterTitle.textContent = chapter.title;
  elements.chapterCount.textContent = `${book.chapters.length}`;
  elements.readingTimeText.textContent = `Estimated time: ${getEstimatedMinutes(book.wordCount)} min`;
  elements.prevChapterButton.disabled = state.currentChapterIndex === 0;
  elements.nextChapterButton.disabled = state.currentChapterIndex >= book.chapters.length - 1;

  const highlights = getChapterHighlights();
  const nextKey = `${book.id}:${state.currentChapterIndex}:${state.searchQuery}:${highlights.map((item) => `${item.id}:${item.updatedAt}`).join("|")}`;
  if (options.forceContent || nextKey !== state.renderKey) {
    elements.chapterContent.innerHTML = formatChapterContent(chapter.content, state.searchQuery, highlights);
    state.renderKey = nextKey;
  }

  renderToc();
  renderBookmarks();
  renderHighlights();
  updateProgressUI();
  updateSessionUI();
}

function renderToc() {
  elements.tocList.innerHTML = "";
  state.currentBook.toc.forEach((item) => {
    const button = document.createElement("button");
    button.className = item.index === state.currentChapterIndex ? "toc-item is-active" : "toc-item";
    button.textContent = item.label || `Chapter ${item.index + 1}`;
    button.addEventListener("click", () => jumpToChapter(item.index, 0));
    elements.tocList.appendChild(button);
  });
}

function renderBookmarks() {
  const bookmarks = state.currentBook.bookmarks || [];
  elements.bookmarkList.innerHTML = bookmarks.length ? "" : `<p class="empty-mini">No bookmarks yet.</p>`;

  bookmarks.forEach((bookmark) => {
    const item = document.createElement("div");
    item.className = "bookmark-item";
    item.innerHTML = `
      <button class="bookmark-jump">${escapeHtml(bookmark.name)}</button>
      <div class="row-actions">
        <button class="tiny-button" data-action="rename">Rename</button>
        <button class="tiny-button danger" data-action="delete">Delete</button>
      </div>
    `;
    item.querySelector(".bookmark-jump").addEventListener("click", () => jumpToChapter(bookmark.chapterIndex, bookmark.scrollRatio));
    item.querySelector('[data-action="rename"]').addEventListener("click", () => renameBookmark(bookmark.id));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBookmark(bookmark.id));
    elements.bookmarkList.appendChild(item);
  });
}

function renderHighlights() {
  const highlights = state.currentBook.highlights || [];
  elements.highlightCount.textContent = `${highlights.length}`;
  elements.highlightList.innerHTML = highlights.length ? "" : `<p class="empty-mini">Select text to save a highlight.</p>`;

  highlights.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach((highlight) => {
    const item = document.createElement("div");
    item.className = "highlight-item";
    item.innerHTML = `
      <button class="highlight-jump">
        <span class="highlight-swatch ${escapeHtml(highlight.color)}"></span>
        <span>${escapeHtml(truncate(highlight.text, 92))}</span>
      </button>
      <textarea data-note>${escapeHtml(highlight.note || "")}</textarea>
      <div class="row-actions">
        <button class="tiny-button" data-action="save-note">Save note</button>
        <button class="tiny-button danger" data-action="delete">Delete</button>
      </div>
    `;
    const noteInput = item.querySelector("[data-note]");
    const saveNote = () => updateHighlightNote(highlight.id, noteInput.value, false);
    item.querySelector(".highlight-jump").addEventListener("click", () => jumpToHighlight(highlight));
    item.querySelector('[data-action="save-note"]').addEventListener("click", () => updateHighlightNote(highlight.id, noteInput.value, true));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteHighlight(highlight.id));
    noteInput.addEventListener("input", debounce(saveNote, 450));
    elements.highlightList.appendChild(item);
  });
}

function moveChapter(direction) {
  if (!state.currentBook) return;
  const nextIndex = state.currentChapterIndex + direction;
  if (nextIndex < 0 || nextIndex >= state.currentBook.chapters.length) return;
  jumpToChapter(nextIndex, 0);
}

function jumpToChapter(index, scrollRatio = 0) {
  state.currentChapterIndex = clamp(index, 0, state.currentBook.chapters.length - 1);
  elements.readerPage.classList.add("is-turning");
  elements.readerPage.scrollTop = 0;
  renderReader({ forceContent: true });

  requestAnimationFrame(() => {
    const maxScroll = elements.readerPage.scrollHeight - elements.readerPage.clientHeight;
    elements.readerPage.scrollTo({ top: maxScroll * scrollRatio, behavior: "smooth" });
    elements.readerPage.classList.remove("is-turning");
    saveCurrentProgress();
  });
}

function jumpToHighlight(highlight) {
  jumpToChapter(highlight.chapterIndex, 0);
  window.setTimeout(() => {
    const node = elements.chapterContent.querySelector(`[data-highlight-id="${CSS.escape(highlight.id)}"]`);
    if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 180);
}

function handleReaderScroll() {
  saveCurrentProgressSoon();
  updateProgressUI();
  updateSessionUI();
  autoHideHeader();
}

const saveCurrentProgressSoon = debounce(()=>saveCurrentProgress().catch(()=>showToast("No se pudo guardar el progreso. Exporta un respaldo.")), 300);

let progressWrites=Promise.resolve();
async function saveCurrentProgress() {
  if (suspendProgressWrites || !state.currentBook) return;

  const maxScroll = elements.readerPage.scrollHeight - elements.readerPage.clientHeight;
  const scrollRatio = maxScroll > 0 ? elements.readerPage.scrollTop / maxScroll : 0;
  const progress = {
    chapterIndex: state.currentChapterIndex,
    scrollRatio,
    updatedAt: Date.now(),
  };

  state.currentBook.progress = progress;
  const bookId=state.currentBook.id;
  progressWrites=progressWrites.catch(()=>{}).then(()=>updateBookProgress(bookId,progress));
  await progressWrites;
  updateProgressUI();
}

function updateProgressUI() {
  const progress = getCurrentProgressPercent();
  elements.progressText.textContent = `${progress}%`;
  elements.progressFill.style.width = `${progress}%`;
}

function handleSearch() {
  if (!state.currentBook) return;
  state.searchQuery = elements.bookSearchInput.value;
  const matches = findSearchMatches(state.currentBook, state.searchQuery);
  elements.searchResultText.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"}`;
  renderReader({ forceContent: true });

  if (state.searchQuery.trim()) {
    const firstMark = elements.chapterContent.querySelector("mark");
    if (firstMark) firstMark.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function handleTextSelection(event) {
  if (!state.currentBook) return;
  const selection = window.getSelection();
  const selectedText = selection?.toString().replace(/\s+/g, " ").trim();
  if (!selectedText || selectedText.length < 2 || !elements.readerPage.contains(selection.anchorNode)) {
    return;
  }

  state.selectedText = selectedText.slice(0, 600);
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  elements.selectionPopover.hidden = false;
  elements.selectionPopover.style.left = `${clamp(rect.left, 12, window.innerWidth - 310)}px`;
  elements.selectionPopover.style.top = `${clamp(rect.bottom + 10, 12, window.innerHeight - 210)}px`;
  elements.highlightNoteInput.value = "";
  document.querySelector(`[data-highlight-color="${state.selectedColor}"]`)?.classList.add("is-active");
  event.stopPropagation();
}

async function saveSelectedHighlight() {
  if (!state.currentBook || !state.selectedText) return;

  const chapter = state.currentBook.chapters[state.currentChapterIndex];
  const scrollRatio = getScrollRatio();
  const highlight = {
    id: makeLocalId("highlight"),
    chapterIndex: state.currentChapterIndex,
    chapterTitle: chapter.title,
    text: state.selectedText,
    color: HIGHLIGHT_COLORS.includes(state.selectedColor) ? state.selectedColor : "yellow",
    note: elements.highlightNoteInput.value.trim(),
    scrollRatio,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.currentBook.highlights.push(highlight);
  window.getSelection()?.removeAllRanges();
  hideSelectionPopover();
  await persistCurrentBook("Highlight saved");
  renderReader({ forceContent: true });
}

async function saveHighlightFromLanguagePanel(text) {
  if (!state.currentBook || !text) return;

  const chapter = state.currentBook.chapters[state.currentChapterIndex];
  const highlight = {
    id: makeLocalId("highlight"),
    chapterIndex: state.currentChapterIndex,
    chapterTitle: chapter.title,
    text: text.slice(0, 600),
    color: HIGHLIGHT_COLORS.includes(state.selectedColor) ? state.selectedColor : "yellow",
    note: "",
    scrollRatio: getScrollRatio(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.currentBook.highlights.push(highlight);
  window.getSelection()?.removeAllRanges();
  await persistCurrentBook("Highlight saved");
  renderReader({ forceContent: true });
}

async function updateHighlightNote(id, note, showConfirmation = true) {
  const highlight = state.currentBook.highlights.find((item) => item.id === id);
  if (!highlight) return;
  highlight.note = note.trim();
  highlight.updatedAt = Date.now();
  await persistCurrentBook(showConfirmation ? "Note saved" : "");
  if (showConfirmation) renderHighlights();
}

async function deleteHighlight(id) {
  state.currentBook.highlights = state.currentBook.highlights.filter((item) => item.id !== id);
  await persistCurrentBook("Highlight removed");
  renderReader({ forceContent: true });
}

async function addBookmark() {
  if (!state.currentBook) return;
  const chapter = state.currentBook.chapters[state.currentChapterIndex];
  state.currentBook.bookmarks.push({
    id: makeLocalId("bookmark"),
    name: `${chapter.title} - ${Math.max(1, Math.round(getScrollRatio() * 100))}%`,
    chapterIndex: state.currentChapterIndex,
    scrollRatio: getScrollRatio(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await persistCurrentBook("Bookmark added");
  renderBookmarks();
}

async function renameBookmark(id) {
  const bookmark = state.currentBook.bookmarks.find((item) => item.id === id);
  if (!bookmark) return;
  const name = window.prompt("Bookmark name", bookmark.name);
  if (!name || !name.trim()) return;
  bookmark.name = name.trim();
  bookmark.updatedAt = Date.now();
  await persistCurrentBook("Bookmark renamed");
  renderBookmarks();
}

async function deleteBookmark(id) {
  state.currentBook.bookmarks = state.currentBook.bookmarks.filter((item) => item.id !== id);
  await persistCurrentBook("Bookmark deleted");
  renderBookmarks();
}

async function persistCurrentBook(message) {
  await progressWrites.catch(()=>{});
  state.currentBook.updatedAt = Date.now();
  state.currentBook = normalizeBookRecord(await saveBook(state.currentBook));
  if (message) showToast(message);
}

async function removeBook(id) {
  await deleteBook(id);
  if (state.currentBook?.id === id) {
    state.currentBook = null;
    elements.readerNavButton.disabled = true;
    showView("libraryView");
  }
  await refreshLibrary();
  showToast("Book removed");
}

function updateSessionUI() {
  if (!state.currentBook) return;

  const elapsedMs = Math.max(0, Date.now() - state.session.startedAt);
  const elapsedMinutes = elapsedMs / 60000;
  const currentRatio = getOverallProgressRatio();
  const progressDelta = Math.max(0, currentRatio - state.session.startProgressRatio);
  const wordsRead = Math.round((state.currentBook.wordCount || 0) * progressDelta);
  const totalPages = getEstimatedPages();
  const pagesRead = Math.max(0, Math.floor(totalPages * progressDelta));
  const wpm = elapsedMinutes > 0.15 ? Math.round(wordsRead / elapsedMinutes) : 0;
  const effectiveWpm = wpm > 20 ? wpm : 180;
  const remainingWords = Math.max(0, (state.currentBook.wordCount || 0) * (1 - currentRatio));
  const completionMinutes = Math.ceil(remainingWords / effectiveWpm);

  elements.sessionChapter.textContent = `${state.currentChapterIndex + 1}/${state.currentBook.chapters.length}`;
  elements.sessionPages.textContent = `${pagesRead}`;
  elements.sessionTime.textContent = formatDuration(elapsedMs);
  elements.sessionWords.textContent = `${wordsRead}`;
  elements.sessionWpm.textContent = `${wpm} WPM`;
  elements.sessionCompletion.textContent = completionMinutes <= 1 ? "<1m" : `${completionMinutes}m`;
}

function getCurrentProgressPercent() {
  if (!state.currentBook) return 0;
  return Math.min(100, Math.round(getOverallProgressRatio() * 100));
}

function getOverallProgressRatio() {
  if (!state.currentBook) return 0;
  const total = state.currentBook.chapters.length || 1;
  return clamp((state.currentChapterIndex + getScrollRatio()) / total, 0, 1);
}

function getScrollRatio() {
  const maxScroll = elements.readerPage.scrollHeight - elements.readerPage.clientHeight;
  return maxScroll > 0 ? clamp(elements.readerPage.scrollTop / maxScroll, 0, 1) : 0;
}

function getBookProgressPercent(book) {
  const total = book.chapters.length || 1;
  return Math.min(100, Math.round((((book.progress?.chapterIndex || 0) + (book.progress?.scrollRatio || 0)) / total) * 100));
}

function getEstimatedPages() {
  const words = state.currentBook?.wordCount || 0;
  return Math.max(1, Math.ceil(words / 280));
}

function getChapterHighlights() {
  return (state.currentBook.highlights || []).filter((highlight) => highlight.chapterIndex === state.currentChapterIndex);
}

function toggleReaderPanel() {
  state.hideReaderPanel = !state.hideReaderPanel;
  elements.readerLayout.classList.toggle("is-panel-hidden", state.hideReaderPanel);
  elements.hideReaderPanelButton.textContent = state.hideReaderPanel ? "Panel" : "Focus";
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
  updateFullscreenLabel();
}

function updateFullscreenLabel() {
  elements.fullscreenButton.textContent = document.fullscreenElement ? "Exit full" : "Fullscreen";
}

function autoHideHeader() {
  if (!state.currentBook) return;
  const currentTop = elements.readerPage.scrollTop;
  const goingDown = currentTop > (autoHideHeader.lastTop || 0);
  elements.topbar.classList.toggle("is-hidden", goingDown && currentTop > 80);
  autoHideHeader.lastTop = currentTop;
}

function handleKeyboardShortcuts(event) {
  const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    elements.bookSearchInput.focus();
    elements.bookSearchInput.select();
    return;
  }
  if (event.key === "Escape") {
    hideSelectionPopover();
    return;
  }
  if (isTyping || !state.currentBook) return;

  if (event.key === "F" || event.key === "f") {
    event.preventDefault();
    toggleFullscreen();
  } else if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    changeFontSize(1);
  } else if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    changeFontSize(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveChapter(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveChapter(-1);
  }
}

function changeFontSize(delta) {
  state.readerSettings.fontSize = clamp(Number(state.readerSettings.fontSize) + delta, 15, 32);
  applyReaderSettings();
  saveSetting("readerSettings", state.readerSettings);
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-visible", view.id === viewId));
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === viewId);
  });
  elements.pageTitle.textContent = viewId === "readerView" ? "Reader" : "Premium Reading Experience";
  elements.sidebar.classList.remove("is-open");
  document.body.classList.toggle("is-reading", viewId === "readerView");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeChoice === theme);
  });
}

function applyReaderSettings() {
  const settings = { ...DEFAULT_READER_SETTINGS, ...state.readerSettings };
  elements.readerThemeControl.value = settings.readerTheme;
  elements.fontSizeControl.value = settings.fontSize;
  elements.fontFamilyControl.value = settings.fontFamily;
  elements.fontWeightControl.value = settings.fontWeight;
  elements.lineSpacingControl.value = settings.lineSpacing;
  elements.paragraphSpacingControl.value = settings.paragraphSpacing;
  elements.pageWidthControl.value = settings.pageWidth;
  elements.marginControl.value = settings.margin;
  elements.readerPage.dataset.readerTheme = settings.readerTheme;
  elements.readerPage.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
  elements.readerPage.style.setProperty("--reader-font-family", `"${settings.fontFamily}", Georgia, serif`);
  elements.readerPage.style.setProperty("--reader-font-weight", settings.fontWeight);
  elements.readerPage.style.setProperty("--reader-line-height", settings.lineSpacing);
  elements.readerPage.style.setProperty("--reader-paragraph-spacing", `${settings.paragraphSpacing}em`);
  elements.readerPage.style.setProperty("--reader-width", `${settings.pageWidth}px`);
  elements.readerPage.style.setProperty("--reader-margin", `${settings.margin}px`);
}

function hideSelectionPopoverWhenOutside(event) {
  if (elements.selectionPopover.hidden || elements.selectionPopover.contains(event.target)) return;
  hideSelectionPopover();
}

function hideSelectionPopover() {
  elements.selectionPopover.hidden = true;
  state.selectedText = "";
}

function normalizeBookRecord(book) {
  if (!book) return null;
  return {
    ...book,
    bookmarks: Array.isArray(book.bookmarks) ? book.bookmarks : [],
    highlights: Array.isArray(book.highlights) ? book.highlights : [],
    progress: book.progress || { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
  };
}

function createSession(startProgressRatio = 0) {
  return {
    startedAt: Date.now(),
    startProgressRatio,
  };
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function debounce(callback, wait) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), wait);
  };
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function makeLocalId(prefix) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function truncate(value, length) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

})();

