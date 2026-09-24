/*
 * storage.js — слой данных рабочего стола.
 *
 * Здесь сосредоточено ВСЁ, что касается хранения и формы данных.
 * Остальной код (рендер, drag&drop) работает только через функции отсюда
 * и НЕ обращается к chrome.storage напрямую — так структуру данных можно
 * менять в одном месте.
 *
 * Где хранимся: chrome.storage.sync — встроенное хранилище Chrome, которое
 * автоматически синхронизируется между устройствами через Google-аккаунт.
 * Ограничения держим в уме: ~100KB суммарно, ~8KB на один ключ. Для текстовых
 * ссылок/названий этого с запасом. Картинки-обложки сюда класть нельзя —
 * под них в будущем понадобится chrome.storage.local или backend.
 *
 * fallback: если расширение открыть как обычный файл (не через chrome://),
 * chrome.storage может быть недоступен — тогда подменяем его на localStorage,
 * чтобы дизайн можно было смотреть в обычном превью.
 */

// v3: рабочий стол стартует ПУСТЫМ (демо-папок больше нет). Бамп ключа также
// сбрасывает старые демо-данные, сохранённые под desktop:v2.
const STORAGE_KEY = "desktop:v3";

/*
 * ФОРМА ДАННЫХ (схема). Соответствует дизайну "Стартовая страница":
 * рабочий стол — это сетка КАРТОЧЕК, каждая карточка либо прямая ссылка
 * ("app"), либо папка ("folder") со ссылками внутри.
 *
 * State {
 *   version: number,
 *   settings: {
 *     theme: "light" | "dark" | "system",   // system — как в настройках ОС/Chrome
 *     language: "auto" | "en" | "ru" | …,   // auto — язык интерфейса Chrome (см. i18n.js)
 *     cardSize: "compact" | "medium" | "large",
 *     glow: string,            // цвет свечения / акцент
 *     glowIntensity: number,   // 0..200 (%)
 *     folderOpacity: number    // 0..100 (%) — насыщенность фона папки
 *   },
 *   cards: Card[]
 * }
 *
 * Card (app)    { id, type:"app",    title, url, bg, tc, text, favicon }
 * Card (folder) { id, type:"folder", title, items: Link[] }
 * Link          { id, title, url, bg, tc, text, favicon }
 *
 * bg  — цвет плитки, tc — цвет текста на плитке, text — инициалы (1-2 буквы).
 * Эти поля заложены сразу под кастомизацию внешнего вида.
 */

const DEFAULT_STATE = {
  version: 2,
  settings: {
    theme: "system",
    language: "auto",
    cardSize: "medium",
    glow: "#7c5cff",
    glowIntensity: 100,
    folderOpacity: 45,
    showClock: false
  },
  cards: [] // изначально пусто — пользователь сам наполняет рабочий стол
};

/* ---------- доступ к chrome.storage с запасным localStorage ----------
 *
 * ВАЖНО про лимиты sync: у chrome.storage.sync жёсткое ограничение ~8 КБ НА ОДИН
 * КЛЮЧ (QUOTA_BYTES_PER_ITEM) и ~100 КБ суммарно. Раньше всё состояние лежало в
 * одном ключе — и как только закладок набиралось ~30–40, состояние переваливало
 * за 8 КБ, set() тихо падал, и НОВЫЕ карточки переставали сохраняться (тот самый
 * «лимит, после которого ничего не создаётся»).
 *
 * Решение: режем сериализованное состояние на ЧАНКИ по нескольким ключам
 * (d3:0, d3:1, …) + мета-ключ d3:meta с числом чанков. Так потолок поднимается
 * до суммарных ~100 КБ (это сотни закладок — реального предела не достичь), и при
 * этом всё продолжает автоматически синхронизироваться между устройствами через
 * аккаунт Chrome. Отдельная авторизация НЕ нужна — sync привязан к Google-аккаунту,
 * в котором пользователь уже вошёл в браузере. */

const hasChromeSync =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;
const hasChromeLocal =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

const CHUNK_PREFIX = "d3:";              // ключи чанков: d3:0, d3:1, ...
const META_KEY = CHUNK_PREFIX + "meta";  // { n: <число чанков>, v: <версия формата> }
const CHUNK_SIZE = 6000;                 // символов на чанк — с запасом под лимит 8 КБ/ключ
const LOCAL_BACKUP_KEY = "desktop:backup"; // аварийная копия в local, если sync переполнен

function splitChunks(str) {
  const out = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) out.push(str.slice(i, i + CHUNK_SIZE));
  return out;
}

async function rawGet() {
  if (hasChromeSync) {
    // 1) новый чанковый формат
    const meta = (await chrome.storage.sync.get(META_KEY))[META_KEY];
    if (meta && Number.isInteger(meta.n)) {
      const keys = Array.from({ length: meta.n }, (_, i) => CHUNK_PREFIX + i);
      const parts = keys.length ? await chrome.storage.sync.get(keys) : {};
      let s = "";
      for (let i = 0; i < meta.n; i++) s += parts[CHUNK_PREFIX + i] || "";
      try { return JSON.parse(s); } catch { /* повреждено — пробуем запасные пути */ }
    }
    // 2) миграция со старого одно-ключевого формата (desktop:v3)
    const old = (await chrome.storage.sync.get(STORAGE_KEY))[STORAGE_KEY];
    if (old) return old;
    // 3) аварийная локальная копия (если sync когда-то был переполнен)
    if (hasChromeLocal) {
      const b = (await chrome.storage.local.get(LOCAL_BACKUP_KEY))[LOCAL_BACKUP_KEY];
      if (b) { try { return JSON.parse(b); } catch { /* ignore */ } }
    }
    return undefined;
  }
  const s = localStorage.getItem(STORAGE_KEY);
  return s ? JSON.parse(s) : undefined;
}

let knownChunks = null; // сколько чанков лежит в sync (чтобы не сканировать хранилище на каждом сохранении)

async function rawSet(state) {
  if (hasChromeSync) {
    const str = JSON.stringify(state);
    const parts = splitChunks(str);
    const write = { [META_KEY]: { n: parts.length, v: 3 } };
    parts.forEach((p, i) => { write[CHUNK_PREFIX + i] = p; });
    try {
      await chrome.storage.sync.set(write);
      // Подчистить хвосты (лишние старые чанки + одно-ключевой формат) — но только
      // когда чанков стало МЕНЬШЕ или это первое сохранение за сессию: полный
      // get(null) читает всё хранилище, гонять его на каждом сохранении незачем.
      if (knownChunks === null || parts.length < knownChunks) {
        const all = await chrome.storage.sync.get(null);
        const stale = Object.keys(all).filter(
          (k) => (k.startsWith(CHUNK_PREFIX) && k !== META_KEY && !(k in write)) || k === STORAGE_KEY
        );
        if (stale.length) await chrome.storage.sync.remove(stale);
      }
      knownChunks = parts.length;
      // успешный синк — аварийная копия больше не нужна
      if (hasChromeLocal) chrome.storage.local.remove(LOCAL_BACKUP_KEY);
    } catch (e) {
      // sync переполнен (>100 КБ) — данные НЕ теряем: кладём в local, чтобы на этом
      // устройстве всё осталось. Синк догонит, когда объём снова уместится.
      if (hasChromeLocal) await chrome.storage.local.set({ [LOCAL_BACKUP_KEY]: str });
      console.warn("sync storage full, saved locally:", e && e.message);
    }
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Уникальный id. crypto.randomUUID есть во всех актуальных Chrome. */
function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || "id-" + Math.random().toString(36).slice(2);
}

/* ---------- история поисковых запросов ----------
 * Лежит отдельно (chrome.storage.local), т.к. может разрастись и не должна
 * занимать лимит sync. Это аналог истории поисковой строки браузера: вводишь
 * запрос — он попадает в подсказки в следующий раз. */

const HISTORY_KEY = "desktop:history";
const HISTORY_LIMIT = 300;

async function loadHistory() {
  if (hasChromeLocal) {
    const r = await chrome.storage.local.get(HISTORY_KEY);
    return r[HISTORY_KEY] || [];
  }
  const s = localStorage.getItem(HISTORY_KEY);
  return s ? JSON.parse(s) : [];
}

async function addQuery(q) {
  q = (q || "").trim();
  if (!q) return;
  let h = await loadHistory();
  h = h.filter((x) => x.toLowerCase() !== q.toLowerCase());
  h.unshift(q);
  h = h.slice(0, HISTORY_LIMIT);
  if (hasChromeLocal) await chrome.storage.local.set({ [HISTORY_KEY]: h });
  else localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  return h;
}

async function removeQuery(q) {
  let h = await loadHistory();
  h = h.filter((x) => x.toLowerCase() !== (q || "").toLowerCase());
  if (hasChromeLocal) await chrome.storage.local.set({ [HISTORY_KEY]: h });
  else localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  return h;
}

/* ---------- свои обои (фоновая картинка) ----------
 * Картинку (data:URL, обычно сотни КБ — пережата в newtab.js) храним в
 * chrome.storage.local, а НЕ в sync: лимит sync ~8KB на ключ, изображение туда
 * не влезет и не должно гонять трафик синхронизации. local-квота заметно больше.
 * fallback — localStorage, как и для остального. */

const WALLPAPER_KEY = "desktop:wallpaper";

async function loadWallpaper() {
  if (hasChromeLocal) {
    const r = await chrome.storage.local.get(WALLPAPER_KEY);
    return r[WALLPAPER_KEY] || null;
  }
  return localStorage.getItem(WALLPAPER_KEY) || null;
}

async function saveWallpaper(dataUrl) {
  if (hasChromeLocal) await chrome.storage.local.set({ [WALLPAPER_KEY]: dataUrl });
  else localStorage.setItem(WALLPAPER_KEY, dataUrl);
}

async function clearWallpaper() {
  if (hasChromeLocal) await chrome.storage.local.remove(WALLPAPER_KEY);
  else localStorage.removeItem(WALLPAPER_KEY);
}

/* ---------- кэш логотипов (data URL) ----------
 * url логотипа -> PNG-миниатюра data:URL. Живёт в chrome.storage.local: иконки
 * рисуются мгновенно при каждом открытии вкладки и работают офлайн, вместо того
 * чтобы каждый раз тянуться с сети (icon.horse бывает медленным/недоступным). */

const ICON_DATA_KEY = "desktop:icons";

async function loadIconData() {
  if (hasChromeLocal) {
    const r = await chrome.storage.local.get(ICON_DATA_KEY);
    return r[ICON_DATA_KEY] || {};
  }
  try { return JSON.parse(localStorage.getItem(ICON_DATA_KEY)) || {}; } catch { return {}; }
}

async function saveIconData(map) {
  if (hasChromeLocal) await chrome.storage.local.set({ [ICON_DATA_KEY]: map });
  else try { localStorage.setItem(ICON_DATA_KEY, JSON.stringify(map)); } catch { /* переполнен — не критично */ }
}

/* ---------- экспорт / импорт конфигурации ----------
 * Чтобы пользователь мог отправить другу файл и получить ТЕ ЖЕ папки, закладки
 * и оформление. Это просто JSON: настройки + карточки (+ обои, если есть).
 * `app`/`version` — метки, чтобы при импорте отличить наш файл от чужого. */

const CONFIG_MAGIC = "yandex-desktop-config";
const CONFIG_VERSION = 1;

/** Собрать объект конфигурации из состояния (+ обои передаются отдельно).
 * Язык в файл не кладём: это настройка человека, а не набора закладок — друг
 * из другой страны не должен получить интерфейс на чужом языке. */
function buildConfig(state, wallpaper) {
  const { language, ...settings } = state.settings;
  return {
    app: CONFIG_MAGIC,
    version: CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    cards: state.cards,
    wallpaper: wallpaper || null
  };
}

/**
 * Применить импортированный конфиг: ЗАМЕНЯЕТ текущие настройки и карточки.
 * Возвращает { state, wallpaper } или бросает ошибку с code:"not-config", если
 * файл не наш/битый (текст ошибки для человека подбирает интерфейс — он знает язык).
 * Обои (если есть в файле) сохраняются в local через saveWallpaper.
 * Язык интерфейса остаётся текущим, даже если в файле (старого формата) он есть.
 */
async function applyConfig(data) {
  if (!data || data.app !== CONFIG_MAGIC || !Array.isArray(data.cards)) {
    throw Object.assign(new Error("not a DeskHub config"), { code: "not-config" });
  }
  const { language } = (await loadState()).settings;
  const state = {
    ...structuredClone(DEFAULT_STATE),
    version: DEFAULT_STATE.version,
    settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}), language },
    cards: data.cards
  };
  await rawSet(state);
  if (typeof data.wallpaper === "string" && data.wallpaper.startsWith("data:")) {
    await saveWallpaper(data.wallpaper);
  } else {
    await clearWallpaper();
  }
  return { state, wallpaper: data.wallpaper || null };
}

/* ---------- автогенерация внешнего вида плитки из ссылки ---------- */

const PALETTE = ["#7c5cff", "#2962FF", "#1DB954", "#FF5AAA", "#FF8A4D", "#3FB6FF", "#E4405F", "#F5C518"];

/** Достаём «человеческое» имя домена: https://www.github.com/x -> github.com */
function domainOf(url) {
  try {
    return new URL(url.includes("://") ? url : "https://" + url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Второй уровень домена как «имя сайта»: ozon.ru -> "ozon", mgmrnd.com -> "mgmrnd". */
function sldOf(url) {
  const d = domainOf(url);
  const parts = d.split(".").filter(Boolean);
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[0] || d).toLowerCase();
}

/** Детерминированный цвет из строки, чтобы плитка одного сайта была стабильной. */
function colorFrom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Контрастный цвет текста (чёрный/белый) для фона плитки. */
function textColorFor(bg) {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

/**
 * Собрать объект-ссылку из минимума (title, url), дозаполнив внешний вид.
 * Реальный логотип/цвет favicon подтягивается асинхронно позже (см. resolveIcon
 * в newtab.js); здесь сразу кладём осмысленный текст (имя сайта) и базовый цвет,
 * чтобы плитка не была пустой, пока иконка грузится.
 */
function makeLink({ title, url, bg, tc, text, favicon = null, logo = null }) {
  const dom = domainOf(url);
  const finalText = text || sldOf(url);
  const finalBg = bg || colorFrom(dom);
  return {
    id: uid(),
    title: title || dom,
    url: url.includes("://") ? url : "https://" + url,
    bg: finalBg,
    tc: tc || textColorFor(finalBg),
    text: finalText,
    favicon,
    logo,                 // ссылка на картинку логотипа (если найден)
    iconResolved: false   // была ли уже попытка подтянуть реальную иконку
  };
}

/* ---------- загрузка/сохранение состояния ---------- */

async function loadState() {
  const state = await rawGet();
  if (!state) return structuredClone(DEFAULT_STATE);
  // Подстраховка на случай частичных данных:
  return {
    ...structuredClone(DEFAULT_STATE),
    ...state,
    settings: { ...DEFAULT_STATE.settings, ...(state.settings || {}) },
    cards: state.cards || []
  };
}

async function saveState(state) {
  await rawSet(state);
  return state;
}

/* ---------- настройки ---------- */

async function updateSettings(patch) {
  const state = await loadState();
  state.settings = { ...state.settings, ...patch };
  return saveState(state);
}

/* ---------- карточки верхнего уровня ---------- */

async function addFolder({ title = "Новая папка" } = {}) {
  const state = await loadState();
  state.cards.push({ id: uid(), type: "folder", title, items: [] });
  return saveState(state);
}

async function addAppCard({ title, url }) {
  const state = await loadState();
  const link = makeLink({ title, url });
  state.cards.push({ ...link, type: "app" });
  return saveState(state);
}

async function renameCard(cardId, title) {
  const state = await loadState();
  const card = state.cards.find((c) => c.id === cardId);
  if (card) card.title = title;
  return saveState(state);
}

/** Точечно обновить поля карточки верхнего уровня (редактирование внешнего вида). */
async function updateCard(cardId, patch) {
  const state = await loadState();
  const card = state.cards.find((c) => c.id === cardId);
  if (card) Object.assign(card, patch);
  return saveState(state);
}

/** Точечно обновить поля ссылки внутри папки. */
async function updateLink(folderId, linkId, patch) {
  const state = await loadState();
  const folder = state.cards.find((c) => c.id === folderId && c.type === "folder");
  if (!folder) return state;
  const link = folder.items.find((l) => l.id === linkId);
  if (link) Object.assign(link, patch);
  return saveState(state);
}

async function deleteCard(cardId) {
  const state = await loadState();
  state.cards = state.cards.filter((c) => c.id !== cardId);
  return saveState(state);
}

/** Переставить карточку верхнего уровня (drag&drop сетки). */
async function moveCard(cardId, toIndex) {
  const state = await loadState();
  const idx = state.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return state;
  const [card] = state.cards.splice(idx, 1);
  state.cards.splice(Math.max(0, Math.min(toIndex, state.cards.length)), 0, card);
  return saveState(state);
}

/* ---------- ссылки внутри папок ---------- */

async function addLink(folderId, { title, url }) {
  const state = await loadState();
  const folder = state.cards.find((c) => c.id === folderId && c.type === "folder");
  if (!folder) return state;
  folder.items.push(makeLink({ title, url }));
  return saveState(state);
}

async function deleteLink(folderId, linkId) {
  const state = await loadState();
  const folder = state.cards.find((c) => c.id === folderId && c.type === "folder");
  if (!folder) return state;
  folder.items = folder.items.filter((l) => l.id !== linkId);
  return saveState(state);
}

/**
 * Перетащить карточку-ссылку верхнего уровня внутрь папки.
 * Карточка "app" убирается из сетки и становится ссылкой внутри папки.
 */
async function fileCardIntoFolder(cardId, folderId) {
  const state = await loadState();
  const folder = state.cards.find((c) => c.id === folderId && c.type === "folder");
  const card = state.cards.find((c) => c.id === cardId);
  if (!folder || !card || card.id === folder.id) return state;
  state.cards = state.cards.filter((c) => c.id !== cardId);
  folder.items.push({
    id: card.id,
    title: card.title,
    url: card.url,
    bg: card.bg,
    tc: card.tc,
    text: card.text,
    favicon: card.favicon || null
  });
  return saveState(state);
}

/** Вынести ссылку из папки на рабочий стол (отдельной карточкой-приложением). */
async function ejectLinkToDesktop(folderId, linkId) {
  const state = await loadState();
  const folder = state.cards.find((c) => c.id === folderId && c.type === "folder");
  if (!folder) return state;
  const idx = folder.items.findIndex((l) => l.id === linkId);
  if (idx === -1) return state;
  const [link] = folder.items.splice(idx, 1);
  state.cards.push({ ...link, type: "app" });
  return saveState(state);
}

/**
 * Переместить ссылку между папками / внутри папки — основа drag&drop.
 * toIndex === null => в конец.
 */
async function moveLink(fromFolderId, linkId, toFolderId, toIndex = null) {
  const state = await loadState();
  const from = state.cards.find((c) => c.id === fromFolderId && c.type === "folder");
  const to = state.cards.find((c) => c.id === toFolderId && c.type === "folder");
  if (!from || !to) return state;
  const idx = from.items.findIndex((l) => l.id === linkId);
  if (idx === -1) return state;
  const [link] = from.items.splice(idx, 1);
  const at = toIndex === null ? to.items.length : toIndex;
  to.items.splice(at, 0, link);
  return saveState(state);
}

/** Переставить ссылки внутри папки по готовому порядку id (для DnD-сортировки).
 * DOM уже показывает нужный порядок — просто фиксируем его в хранилище. */
async function reorderLinks(folderId, orderedIds) {
  const state = await loadState();
  const folder = state.cards.find((c) => c.id === folderId && c.type === "folder");
  if (!folder) return state;
  const byId = new Map(folder.items.map((l) => [l.id, l]));
  const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  // подстраховка: если какая-то ссылка не попала в список — дописываем в конец
  folder.items.forEach((l) => { if (!orderedIds.includes(l.id)) next.push(l); });
  folder.items = next;
  return saveState(state);
}

/** Подписка на внешние изменения (правки, прилетевшие с другого устройства).
 * Данные теперь размазаны по чанкам, поэтому ловим ЛЮБОЙ наш ключ и пересобираем
 * всё состояние целиком. Дебаунс — потому что многочанковая запись поднимает
 * несколько событий onChanged подряд, а перечитать нужно один раз после них. */
function onStateChanged(callback) {
  if (!hasChromeSync || !chrome.storage.onChanged) return;
  let timer = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const ours = Object.keys(changes).some(
      (k) => k === META_KEY || k.startsWith(CHUNK_PREFIX) || k === STORAGE_KEY
    );
    if (!ours) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const s = await rawGet();
      if (s) callback(s);
    }, 200);
  });
}

export const Storage = {
  DEFAULT_STATE,
  loadState,
  saveState,
  updateSettings,
  addFolder,
  addAppCard,
  renameCard,
  updateCard,
  updateLink,
  deleteCard,
  moveCard,
  addLink,
  deleteLink,
  fileCardIntoFolder,
  ejectLinkToDesktop,
  moveLink,
  reorderLinks,
  makeLink,
  loadHistory,
  addQuery,
  removeQuery,
  onStateChanged,
  loadWallpaper,
  saveWallpaper,
  clearWallpaper,
  loadIconData,
  saveIconData,
  buildConfig,
  applyConfig
};
