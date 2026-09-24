/*
 * i18n.js — перевод интерфейса.
 *
 * Строки лежат в стандартном формате Chrome: _locales/<код>/messages.json.
 * Chrome сам читает эти файлы для manifest.json (__MSG_extDescription__), но
 * chrome.i18n.getMessage всегда отвечает на языке браузера и переключить его
 * из расширения нельзя. Поэтому для страницы файлы грузятся здесь, через fetch:
 * так работает и автоопределение, и ручной выбор языка в настройках, и превью
 * на localhost (там chrome.i18n нет вовсе).
 *
 * Автоопределение повторяет выбор самого Chrome: в каждом messages.json есть
 * служебная строка localeCode с кодом своей папки, и chrome.i18n.getMessage
 * возвращает её из той локали, которую Chrome выбрал для расширения. Так язык
 * страницы всегда совпадает с языком описания расширения в браузере.
 */

/* Порядок — как в списке выбора языка. name — самоназвание языка.
 * Португальский — две локали: Chrome не откатывает pt_PT к pt_BR (только к
 * базовому "pt", которого у Chrome нет), без pt_PT Португалия получила бы английский. */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "pt_BR", name: "Português (Brasil)" },
  { code: "pt_PT", name: "Português (Portugal)" },
  { code: "ru", name: "Русский" }
];

const DEFAULT_LANG = "en"; // совпадает с default_locale в manifest.json
// Языки с письмом справа налево. Сейчас таких в LANGUAGES нет, но вёрстка и
// drag & drop под RTL готовы: достаточно добавить локаль в _locales и LANGUAGES.
const RTL = new Set(["ar", "fa", "he", "ur"]);
const SUPPORTED = new Set(LANGUAGES.map((l) => l.code));

let messages = {};  // строки выбранного языка
let fallback = {};  // английские строки — на случай ключа, которого нет в переводе
let current = DEFAULT_LANG;

/* "pt-BR" → "pt_BR", "es-419" → "es", "pt" → null. Как и Chrome, при
 * отсутствии точной локали откатываемся только к базовому языку без региона. */
function matchTag(tag) {
  if (!tag) return null;
  const norm = String(tag).replace("-", "_");
  if (SUPPORTED.has(norm)) return norm;
  const base = norm.split("_")[0].toLowerCase();
  return SUPPORTED.has(base) ? base : null;
}

/** Язык, который выбрал бы Chrome по настройкам браузера. */
export function detectLanguage() {
  if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
    const c = chrome.i18n.getMessage("localeCode");
    if (SUPPORTED.has(c)) return c;
  }
  const tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const m = matchTag(tag);
    if (m) return m;
  }
  return DEFAULT_LANG;
}

async function fetchMessages(code) {
  try {
    const r = await fetch(`_locales/${code}/messages.json`);
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

/**
 * Загрузить язык. setting — значение settings.language: "auto" или код.
 * Неизвестный код (например, из настроек более новой версии) = "auto".
 */
export async function setLanguage(setting) {
  const code = SUPPORTED.has(setting) ? setting : detectLanguage();
  const [msgs, fb] = await Promise.all([
    fetchMessages(code),
    code === DEFAULT_LANG || Object.keys(fallback).length ? null : fetchMessages(DEFAULT_LANG)
  ]);
  if (fb) fallback = fb;
  messages = msgs;
  if (code === DEFAULT_LANG) fallback = msgs;
  current = code;
  document.documentElement.lang = code.replace("_", "-");
  document.documentElement.dir = isRtl() ? "rtl" : "ltr";
  return code;
}

export function currentLanguage() { return current; }
export function isRtl() { return RTL.has(current); }
/** BCP 47-тег для Intl / toLocaleString: "pt_BR" → "pt-BR". */
export function locale() { return current.replace("_", "-"); }

/**
 * Строка по ключу. Подстановки — в формате Chrome: в message именованные
 * $NAME$, в placeholders.name.content позиционные $1..$9 (аргументы t).
 */
export function t(key, ...subs) {
  const entry = messages[key] || fallback[key];
  if (!entry) return key;
  const ph = entry.placeholders || {};
  return entry.message
    .replace(/\$([A-Za-z0-9_@]+)\$/g, (m, name) => {
      const p = ph[name.toLowerCase()];
      return p ? p.content : m;
    })
    .replace(/\$\$|\$([1-9])/g, (m, n) => (n ? String(subs[n - 1] ?? "") : "$"));
}

/* Статичная разметка newtab.html: текст (data-i18n) и атрибуты
 * (data-i18n-placeholder, data-i18n-aria-label, data-i18n-title). */
export function translateDocument(rootNode = document) {
  rootNode.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  for (const attr of ["placeholder", "aria-label", "title"]) {
    const data = "i18n" + attr.replace(/(^|-)([a-z])/g, (m, d, c) => c.toUpperCase());
    rootNode.querySelectorAll(`[data-i18n-${attr}]`).forEach((n) => n.setAttribute(attr, t(n.dataset[data])));
  }
}
