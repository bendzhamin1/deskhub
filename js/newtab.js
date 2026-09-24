/*
 * newtab.js — логика страницы новой вкладки.
 *
 * Отвечает за:
 *  - применение темы/размера/свечения (CSS-переменные)  → applyVars()
 *  - отрисовку сетки карточек из данных storage.js       → renderGrid()
 *  - открытие папки во всплывающей панели                → openFolder()
 *  - окно настроек (тема, размер, прозрачность, свечение)→ openSettings()
 *  - поиск/переход по адресу                             → search form
 *  - добавление/удаление карточек и ссылок
 *  - drag&drop: перестановка карточек и ссылок в папке
 *
 * Весь доступ к данным идёт через Storage.* (см. storage.js).
 */

import { Storage } from "./storage.js";
import { t, setLanguage, translateDocument, isRtl, locale, detectLanguage, LANGUAGES } from "./i18n.js";

const root = document.getElementById("root");
const grid = document.getElementById("grid");
const overlay = document.getElementById("overlay");
const bgEl = document.querySelector(".ntp-bg");

let state = null;       // текущее состояние (кэш в памяти, источник правды — storage)
let wallpaper = null;   // data:URL пользовательских обоев (или null — стандартный фон)

/* Режим «для слабых машин»: отключает дорогие эффекты (живое размытие фона,
 * большие тени, hover-анимации). Порог намеренно консервативный — только реально
 * слабое железо, чтобы на нормальных ПК качество не падало. На границах помогает
 * и системная настройка «уменьшить движение». */
(function detectPerf() {
  const mem = navigator.deviceMemory;            // ГБ ОЗУ (если доступно)
  const cores = navigator.hardwareConcurrency;   // число потоков CPU
  const weak = (mem && mem <= 2) || (cores && cores <= 2);
  if (weak) document.documentElement.classList.add("perf-lite");
})();

/* ---------- тема / размеры / свечение ---------- */

const SIZES = {
  compact: { c: "138px", h: "88px",  g: "14px", r: "18px", fr: "16px" },
  medium:  { c: "172px", h: "108px", g: "18px", r: "22px", fr: "18px" },
  large:   { c: "208px", h: "128px", g: "22px", r: "26px", fr: "22px" }
};

/* Тема «Как в системе» — медиазапрос prefers-color-scheme. Chrome отвечает на
 * него по своей настройке «Режим» (chrome://settings/appearance), которая по
 * умолчанию повторяет тему ОС. Слушаем изменения — страница перекрашивается
 * сразу, когда macOS/Windows переключается на тёмную тему (в т.ч. по расписанию). */
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
darkQuery.addEventListener("change", () => { if (state && state.settings.theme === "system") applyVars(); });

/** Фактическая тема: "light" | "dark" (для "system" — по системе). */
function resolvedTheme() {
  const th = state.settings.theme;
  if (th === "system") return darkQuery.matches ? "dark" : "light";
  return th === "dark" ? "dark" : "light";
}

/* Запомнить для js/boot.js то, что нужно до первой отрисовки следующей вкладки. */
function saveBootCache() {
  try {
    localStorage.setItem("deskhub:boot", JSON.stringify({
      theme: state.settings.theme,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.title
    }));
  } catch { /* localStorage недоступен — просто будет короткая вспышка */ }
}

function applyVars() {
  const st = state.settings;
  const theme = resolvedTheme();
  const light = theme === "light";
  document.documentElement.setAttribute("data-theme", theme);

  const s = SIZES[st.cardSize] || SIZES.medium;
  root.style.setProperty("--card-size", s.c);
  root.style.setProperty("--card-h", s.h);
  root.style.setProperty("--gap", s.g);
  root.style.setProperty("--radius", s.r);
  root.style.setProperty("--folder-radius", s.fr);

  // свечение — две радиальные подсветки (тёплая + акцентная)
  const gi = (st.glowIntensity || 0) / 100;
  const aWarm = (light ? 12 : 22) * gi;
  const aGlow = (light ? 22 : 34) * gi;
  root.style.setProperty(
    "--glow",
    `radial-gradient(42% 32% at 50% 72%, color-mix(in srgb, #ff9a4d ${aWarm}%, transparent), transparent 62%), ` +
      `radial-gradient(70% 52% at 50% 82%, color-mix(in srgb, ${st.glow} ${aGlow}%, transparent), transparent 74%)`
  );

  const op = (st.folderOpacity || 0) / 100;
  const t = light
    ? {
        page: "linear-gradient(180deg,#ffffff 0%,#f7f7f9 55%,#eef0f3 100%)",
        bg: "#ffffff", text: "#1a1a1f", dim: "#6a6a72",
        searchBg: "#ffffff", searchText: "#1a1a1a", searchPh: "#9a9aa0", searchBorder: "1px solid rgba(0,0,0,.07)",
        empty: "#e7e7ec", panel: "rgba(0,0,0,.04)", panelBorder: "rgba(0,0,0,.08)",
        modal: "#ffffff", track: "rgba(0,0,0,.12)",
        folderCard: `rgba(0,0,0,${(0.015 + op * 0.075).toFixed(3)})`,
        folderBorder: `rgba(0,0,0,${(0.04 + op * 0.07).toFixed(3)})`
      }
    : {
        page: "linear-gradient(180deg,#1b1b1f 0%,#131316 45%,#0b0b0d 100%)",
        bg: "#0b0b0d", text: "#f2f2f3", dim: "#9a9aa2",
        searchBg: "#ffffff", searchText: "#1a1a1a", searchPh: "#8a8a90", searchBorder: "none",
        empty: "#34343a", panel: "rgba(255,255,255,.05)", panelBorder: "rgba(255,255,255,.09)",
        modal: "#1c1c20", track: "rgba(255,255,255,.14)",
        folderCard: `rgba(255,255,255,${(0.04 + op * 0.16).toFixed(3)})`,
        folderBorder: `rgba(255,255,255,${(0.06 + op * 0.12).toFixed(3)})`
      };

  root.style.background = t.bg;
  const set = (k, v) => root.style.setProperty(k, v);
  set("--page-bg", t.page);
  set("--text", t.text);
  set("--text-dim", t.dim);
  set("--search-bg", t.searchBg);
  set("--search-text", t.searchText);
  set("--search-ph", t.searchPh);
  set("--search-border", t.searchBorder);
  set("--empty", t.empty);
  set("--panel", t.panel);
  set("--panel-border", t.panelBorder);
  set("--modal-bg", t.modal);
  set("--track", t.track);
  set("--thumb", st.glow);
  set("--accent", st.glow);
  set("--folder-card", t.folderCard);
  set("--folder-border", t.folderBorder);

  applyWallpaper();
  saveBootCache();
}

/* Свои обои поверх стандартного градиента. Сверху кладём лёгкую вуаль под тему,
 * чтобы текст подсказок/подписей оставался читаемым на любой картинке. */
let wallpaperKey = null; // что сейчас применено (чтобы не пересобирать огромную CSS-строку зря)
function applyWallpaper() {
  // applyVars дёргает нас на каждое изменение настроек; сам фон зависит только
  // от картинки и темы — если они не менялись, не трогаем стиль (обои-data:URL
  // это мегабайтная строка, её переустановка не бесплатна)
  const theme = resolvedTheme();
  const key = wallpaper ? theme + "|" + wallpaper.length : "none";
  if (key === wallpaperKey) return;
  wallpaperKey = key;
  if (wallpaper) {
    const veil = theme === "light"
      ? "linear-gradient(rgba(255,255,255,.28),rgba(255,255,255,.28))"
      : "linear-gradient(rgba(0,0,0,.42),rgba(0,0,0,.42))";
    bgEl.style.backgroundImage = `${veil}, url("${wallpaper}")`;
    bgEl.style.backgroundSize = "cover";
    bgEl.style.backgroundPosition = "center";
  } else {
    bgEl.style.backgroundImage = "";
    bgEl.style.backgroundSize = "";
    bgEl.style.backgroundPosition = "";
  }
}

/* ---------- утилиты DOM ---------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

const phoneSVG = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"></path></svg>';
const plusSVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="var(--text-dim)" stroke-width="2" stroke-linecap="round"></path></svg>';

/* Заполнить элемент-иконку: реальный логотип картинкой ИЛИ текст на цвете.
   imgPct — насколько логотип заполняет плитку; svgFallback — спец-иконка
   (например телефон), если у ссылки нет ни логотипа, ни текста. */
let iconData = {}; // url логотипа -> data:URL миниатюры (кэш из storage.local)

function paintIcon(node, link, imgPct, svgFallback) {
  if (link.logo) {
    // фон плитки — брендовый цвет логотипа (если удалось достать), иначе белый
    node.style.background = link.iconColor || "#fff";
    node.style.color = "";
    // строим через DOM, а не innerHTML: URL логотипа может задать пользователь,
    // и строковая подстановка позволила бы инъекцию разметки через кавычку
    node.textContent = "";
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.style.cssText = `width:${imgPct}%;height:${imgPct}%;object-fit:contain`;
    img.src = iconData[link.logo] || link.logo; // из кэша — мгновенно и офлайн
    node.appendChild(img);
  } else {
    node.style.background = link.bg;
    node.style.color = link.tc || "#fff";
    if (svgFallback && !link.text) node.innerHTML = svgFallback; // константный SVG — безопасно
    else node.textContent = link.text || "";
  }
}

/* ---------- подтягивание реальных иконок сайтов ----------
 * Логика как в Яндекс.Браузере:
 *   1) пробуем бренд-логотип (Clearbit) — если есть, кладём картинку;
 *   2) иначе берём цвет из favicon сайта и пишем имя сайта на этом цвете;
 *   3) иначе остаётся детерминированный цвет + имя сайта.
 * Картинки грузятся как <img> (хостовых разрешений не требуют). Цвет из favicon
 * достаём через canvas — это работает, только если сервер favicon отдаёт CORS;
 * если нет — тихо откатываемся на базовый цвет. */

const iconCache = new Map(); // domain -> Promise<{logo?, color?}>
const ICON_VERSION = 5;      // бамп → все иконки переразбираются новой логикой

/* Загрузка картинки с ОБЯЗАТЕЛЬНЫМ таймаутом: если сервис (например icon.horse)
 * висит, промис всё равно разрешится в null, и мы не застрянем. */
function loadImage(src, crossOrigin, timeout = 6000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    setTimeout(() => finish(null), timeout);
    img.src = src;
  });
}

/* Цвет ФОНА логотипа = цвет краёв иконки. У большинства favicon логотип лежит
 * на своей подложке (VK — синяя, YouTube — красная, Figma — чёрная), и именно
 * её мы хотим видеть на плитке. Берём пиксели по периметру иконки и выбираем
 * самый частый непрозрачный цвет. Если края прозрачные (лого без подложки) —
 * возвращаем null. Нужен CORS-доступ к картинке (его даёт icon.horse). */
function edgeColor(img) {
  try {
    const n = 32;
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const total = n * n;
    const buckets = {};
    let best = null;
    for (let p = 0; p < total; p++) {
      const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 200) continue; // прозрачные/полупрозрачные пиксели за подложку не считаем
      const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4); // группируем близкие оттенки
      const bk = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0 });
      bk.r += r; bk.g += g; bk.b += b; bk.n++;
      if (!best || bk.n > best.n) best = bk;
    }
    // Принимаем цвет, только если ОДИН цвет заполняет существенную долю всей иконки —
    // значит у неё есть сплошная подложка (YouTube → красный, VK → синий, Figma →
    // чёрный). Если это глиф на прозрачном/белом (Gmail, GitHub), ни один цвет не
    // доминирует → null, и плитка остаётся нейтральной, а не красится наугад.
    // Ключевой момент: считаем по ВСЕЙ площади, а не по периметру — у значков со
    // скруглёнными углами периметр прозрачный и раньше давал ложный результат.
    if (!best || best.n / total < 0.45) return null;
    const hex = (x) => Math.round(x / best.n).toString(16).padStart(2, "0");
    return "#" + hex(best.r) + hex(best.g) + hex(best.b);
  } catch {
    return null; // canvas запачкан (нет CORS) — цвет недоступен
  }
}

/* Иконка сайта:
 *  - ПОКАЗЫВАЕМ логотип с сервиса Google (он быстрый и надёжный; при sz=128
 *    отдаёт крупный значок известным сайтам и «глобус» 16px ноунеймам — порог
 *    >=32 их разделяет);
 *  - ЦВЕТ фона берём с icon.horse (единственный, кто отдаёт CORS, чтобы прочитать
 *    краевой цвет = фон логотипа). icon.horse бывает медленным/недоступным —
 *    поэтому через таймаут и как НЕОБЯЗАТЕЛЬНОЕ: нет цвета → просто белый фон,
 *    но логотип всё равно покажется (раньше зависание icon.horse ломало показ). */
/* Значок берём с icon.horse: он отдаёт CORS, поэтому ТОТ ЖЕ значок, что мы
 * показываем, можно прочитать через canvas и взять из него цвет подложки. За счёт
 * единого источника цвет плитки всегда совпадает с нарисованным значком (раньше
 * показывали favicon Google, а цвет брали из icon.horse — рассинхрон и был причиной
 * «неправильного» фона). DuckDuckGo проверяли — он НЕ отдаёт CORS, для чтения цвета
 * бесполезен. Если icon.horse не ответил (бывает для отдельных .ru) — показываем
 * favicon Google на нейтральной плитке (пиксели читать нельзя, но логотип виден). */
/* PNG-миниатюра логотипа для кэша (128px, вписываем с сохранением пропорций).
 * Работает только для CORS-читаемых картинок (icon.horse); иначе null. */
function iconToDataURL(img, size = 128) {
  try {
    const cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    const ctx = cv.getContext("2d");
    const k = Math.min(size / img.naturalWidth, size / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return cv.toDataURL("image/png");
  } catch {
    return null; // canvas запачкан (нет CORS)
  }
}

/* Отложенное сохранение кэша иконок: при первом заполнении резолвятся десятки
 * иконок подряд — пишем в storage один раз после паузы, а не на каждую. */
let iconSaveTimer = null;
function persistIconData() {
  clearTimeout(iconSaveTimer);
  iconSaveTimer = setTimeout(() => {
    // страховка от бесконечного роста: кэш переполнился — начинаем заново,
    // актуальные иконки восстановятся при следующих резолвах
    if (Object.keys(iconData).length > 400) iconData = {};
    Storage.saveIconData(iconData);
  }, 800);
}

function resolveDomainIcon(domain) {
  if (iconCache.has(domain)) return iconCache.get(domain);
  const horse = `https://icon.horse/icon/${domain}`;
  const google = `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
  const p = (async () => {
    const h = await loadImage(horse, true, 5000); // CORS — чтобы прочитать пиксели
    if (h && h.naturalWidth >= 16) {
      const data = iconToDataURL(h);
      if (data) { iconData[horse] = data; persistIconData(); } // офлайн-кэш логотипа
      return { logo: horse, color: edgeColor(h) }; // color === null → нейтральная плитка
    }
    const g = await loadImage(google, false, 4500); // запасной показ без чтения цвета
    if (g && g.naturalWidth >= 32) return { logo: google, color: null };
    return {}; // совсем ноунейм → текст + детерминированный цвет
  })();
  iconCache.set(domain, p);
  return p;
}

/* Перерисовка по requestAnimationFrame, чтобы при подтягивании многих иконок
 * не дёргать полный ререндер сетки на каждую — коалесцируем в один кадр. */
let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; renderGrid(); });
}

/* Параллельная обработка с ограничением одновременных задач (бережно к слабым
 * машинам и к сервисам иконок): не больше `limit` запросов разом. */
async function pool(items, limit, fn) {
  const q = items.slice();
  const workers = Array.from({ length: Math.min(limit, q.length) }, async () => {
    while (q.length) await fn(q.shift());
  });
  await Promise.all(workers);
}

const RETRY_MS = 3 * 24 * 60 * 60 * 1000; // ноунейм без иконки перепроверяем раз в 3 дня

/** Все ссылки состояния одним списком (карточки + содержимое папок). */
function collectLinks(st) {
  const out = [];
  st.cards.forEach((c) => {
    if (c.type === "app") out.push(c);
    else if (c.type === "folder") c.items.forEach((it) => out.push(it));
  });
  return out;
}

/** Подтянуть иконки тем ссылкам, у кого их ещё нет (параллельно, без зависаний). */
let resolving = false;
async function ensureIcons() {
  if (resolving) return;
  resolving = true;
  try {
    const now = Date.now();
    const todo = collectLinks(state).filter((l) =>
      !l.manual && // вручную настроенные иконки авто-резолвер не трогает
      l.iconV !== ICON_VERSION && !(l.iconTried && now - l.iconTried < RETRY_MS)
    );
    if (!todo.length) return;

    // Результаты копим ПАТЧАМИ по id, а не сохраняем весь снапшот state в конце:
    // резолв идёт секундами, и если в это время пользователь добавил/удалил
    // закладку, сохранение старого снапшота затёрло бы его правку (была реальная
    // гонка с потерей данных).
    const patches = new Map(); // linkId -> { logo, iconColor, iconV } | { iconTried }
    await pool(todo, 5, async (link) => {
      const r = await resolveDomainIcon(domain(link.url));
      const patch = r.logo
        ? { logo: r.logo, iconColor: r.color || null, iconV: ICON_VERSION }
        : { iconTried: now }; // ноунейм — не дёргать сеть каждую загрузку
      patches.set(link.id, patch);
      Object.assign(link, patch); // мгновенно в текущую отрисовку
      if (r.logo) scheduleRender();
    });

    // Фиксируем: перечитываем СВЕЖЕЕ состояние и вносим только иконочные поля.
    const applyPatches = (st) => {
      let dirty = false;
      collectLinks(st).forEach((l) => {
        const p = patches.get(l.id);
        if (p && !l.manual) { Object.assign(l, p); dirty = true; }
      });
      return dirty;
    };
    applyPatches(state); // объект state мог смениться, пока шёл резолв (refresh/sync)
    scheduleRender();
    const fresh = await Storage.loadState();
    if (applyPatches(fresh)) await Storage.saveState(fresh);
  } finally {
    resolving = false;
  }
}

/* ---------- рендер сетки ---------- */

function renderGrid() {
  grid.innerHTML = "";

  state.cards.forEach((card, index) => {
    grid.appendChild(renderCell(card, index));
  });

  // всегда ровно одна плитка-«плюс» для добавления (новая появится после того,
  // как в эту что-то добавят)
  grid.appendChild(renderEmptyCell());
}

function renderCell(card, index) {
  const cell = el("div", { class: "ntp-cell" });

  let inner;
  if (card.type === "app") {
    inner = el("div", { class: "ntp-app" });
    paintIcon(inner, card, 62, card.icon === "phone" ? phoneSVG : null);
  } else {
    // папка: превью 2x2 из первых 4 ссылок
    inner = el("div", { class: "ntp-folder" });
    // свой цвет папки с регулируемой прозрачностью (перекрывает --folder-card)
    if (card.color) inner.style.background = hexToRgba(card.color, (card.colorAlpha ?? 50) / 100);
    card.items.slice(0, 4).forEach((it) => {
      const tile = el("div", { class: "ntp-folder-tile" });
      paintIcon(tile, it, 72, null);
      inner.appendChild(tile);
    });
  }

  const cardEl = el("div", {
    class: "ntp-card",
    "data-kind": card.type,
    draggable: "true",
    title: card.title || ""
  }, [inner]);

  cardEl.addEventListener("click", (e) => {
    if (card.type === "folder") openFolder(card, cardEl);
    else if (e.ctrlKey || e.metaKey) window.open(card.url, "_blank"); // как у обычных ссылок
    else openUrl(card.url);
  });
  // средняя кнопка мыши — открыть в новой вкладке (стандарт спид-дайлов)
  cardEl.addEventListener("auxclick", (e) => {
    if (e.button === 1 && card.type === "app") { e.preventDefault(); window.open(card.url, "_blank"); }
  });

  // правый клик — редактирование (внешний вид, название, удаление).
  // Раньше тут был confirm() на удаление, но нативный confirm на странице новой
  // вкладки заблокирован — поэтому теперь полноценная модалка.
  cardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openEditModal(card);
  });

  setupCardDrag(cardEl, cell, card, index);

  const label = el("div", { class: "ntp-card-label", dir: "auto" }, card.type === "folder" ? card.title : (card.title || ""));
  cell.appendChild(cardEl);
  cell.appendChild(label);
  return cell;
}

function renderEmptyCell() {
  const cell = el("div", { class: "ntp-cell" });
  const card = el("div", { class: "ntp-card", "data-kind": "empty" });
  const inner = el("div", { class: "ntp-empty" });
  inner.innerHTML = plusSVG;
  card.appendChild(inner);
  card.addEventListener("click", () => openAddModal(null));
  cell.appendChild(card);
  cell.appendChild(el("div", { class: "ntp-card-label" }, ""));
  return cell;
}

/* ---------- drag&drop карточек верхнего уровня ---------- */

let dragCardId = null;

/* Курсор во второй половине ячейки по ходу чтения? В RTL (арабский) сетка
 * идёт справа налево, и «после» — это левее середины. */
function isAfter(e, node) {
  const r = node.getBoundingClientRect();
  const rightHalf = e.clientX > r.left + r.width / 2;
  return isRtl() ? !rightHalf : rightHalf;
}

function setupCardDrag(cardEl, cell, card, index) {
  const cardId = card.id;

  cardEl.addEventListener("dragstart", (e) => {
    dragCardId = cardId;
    cardEl.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  cardEl.addEventListener("dragend", () => {
    dragCardId = null;
    cardEl.classList.remove("dragging");
    document.querySelectorAll(".ntp-cell").forEach((c) => c.classList.remove("drop-before", "drop-after", "drop-into"));
  });

  // можно ли «вложить» перетаскиваемую карточку в эту папку
  function isFolderDrop(e) {
    if (card.type !== "folder" || dragCardId === cardId) return false;
    const dragged = state.cards.find((c) => c.id === dragCardId);
    if (!dragged || dragged.type !== "app") return false; // вкладываем только ссылки
    const r = cardEl.getBoundingClientRect();
    return e.clientX > r.left + r.width * 0.25 && e.clientX < r.right - r.width * 0.25; // центр карточки
  }

  cell.addEventListener("dragover", (e) => {
    if (!dragCardId) return;
    e.preventDefault();
    if (isFolderDrop(e)) {
      cell.classList.add("drop-into");
      cell.classList.remove("drop-before", "drop-after");
      return;
    }
    cell.classList.remove("drop-into");
    const after = isAfter(e, cell);
    cell.classList.toggle("drop-after", after);
    cell.classList.toggle("drop-before", !after);
  });
  cell.addEventListener("dragleave", () => cell.classList.remove("drop-before", "drop-after", "drop-into"));
  cell.addEventListener("drop", async (e) => {
    if (!dragCardId) return;
    e.preventDefault();
    // вложить ссылку в папку
    if (isFolderDrop(e)) {
      refresh(await Storage.fileCardIntoFolder(dragCardId, cardId));
      return;
    }
    // иначе — перестановка в сетке
    const after = isAfter(e, cell);
    let target = index + (after ? 1 : 0);
    const from = state.cards.findIndex((c) => c.id === dragCardId);
    if (from < target) target -= 1; // компенсация удаления исходного элемента
    refresh(await Storage.moveCard(dragCardId, target));
  });
}

/* ---------- открытие папки ---------- */

function openFolder(folder, cardEl) {
  const rect = cardEl.getBoundingClientRect();
  const scrim = el("div", { class: "ntp-scrim ntp-scrim--folder" });
  scrim.addEventListener("click", closeOverlay);

  const panel = el("div", { class: "ntp-folder-panel" });
  // тот же свой цвет, что и у закрытой папки (с той же прозрачностью)
  if (folder.color) panel.style.background = hexToRgba(folder.color, (folder.colorAlpha ?? 50) / 100);
  panel.addEventListener("click", (e) => e.stopPropagation());

  // вынос ссылки из папки: если бросить плитку ВНЕ панели — ссылка уходит
  // на рабочий стол отдельной карточкой.
  const outsidePanel = (e) => {
    const r = panel.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  scrim.addEventListener("dragover", (e) => { if (dragLinkId && outsidePanel(e)) e.preventDefault(); });
  scrim.addEventListener("drop", async (e) => {
    if (!dragLinkId || !outsidePanel(e)) return;
    e.preventDefault();
    const linkId = dragLinkId;
    dragLinkId = null;
    const s = await Storage.ejectLinkToDesktop(folder.id, linkId);
    closeOverlay();
    refresh(s);
  });

  // шапка — только название и крестик (иконку папки убрали)
  const head = el("div", { class: "ntp-folder-head" }, [
    el("div", { class: "ntp-folder-title", dir: "auto" }, folder.title),
    closeBtn()
  ]);

  // плитки
  const items = el("div", { class: "ntp-folder-items" });
  folder.items.forEach((it, i) => items.appendChild(renderTile(folder, it, i)));
  // плитка "добавить"
  const addTile = el("div", { class: "ntp-mtile ntp-mtile-add", onClick: () => openAddModal(folder.id) }, [
    el("div", { class: "ntp-mtile-ico" }, "+"),
    el("div", { class: "ntp-mtile-name" }, t("add"))
  ]);
  items.appendChild(addTile);
  setupFolderSort(items, folder); // живая DnD-сортировка плиток внутри папки

  panel.appendChild(head);
  panel.appendChild(items);

  scrim.appendChild(panel);
  showOverlay(scrim);

  // ширина панели = ширине поисковой строки (та же переменная), по центру.
  // высоту узнаём по факту и прижимаем к окну.
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  const panelW = panel.offsetWidth; // задаётся через CSS-переменную --content-width
  const left = Math.max(14, (vw - panelW) / 2);
  let top = rect.top - 20;
  const panelH = panel.offsetHeight;
  if (top + panelH > vh - 14) top = vh - 14 - panelH;
  top = Math.max(14, top);
  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

function renderTile(folder, link, index) {
  const ico = el("div", { class: "ntp-mtile-ico" });
  paintIcon(ico, link, 60, null);
  const del = el("button", { class: "ntp-del", title: t("delete"), "aria-label": t("delete") }, "×");
  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    refresh(await Storage.deleteLink(folder.id, link.id));
    closeOverlay();
    const fresh = state.cards.find((c) => c.id === folder.id);
    if (fresh && fresh.items.length) {
      const cardEl = [...grid.querySelectorAll(".ntp-card")][state.cards.indexOf(fresh)];
      if (cardEl) openFolder(fresh, cardEl);
    }
  });
  ico.appendChild(del);

  const tile = el("div", { class: "ntp-mtile", draggable: "true", "data-link-id": link.id }, [
    ico,
    el("div", { class: "ntp-mtile-name", dir: "auto" }, link.title)
  ]);
  tile.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey) window.open(link.url, "_blank");
    else openUrl(link.url);
  });
  tile.addEventListener("auxclick", (e) => { // средняя кнопка — в новую вкладку
    if (e.button === 1) { e.preventDefault(); window.open(link.url, "_blank"); }
  });
  tile.addEventListener("contextmenu", (e) => { // правый клик — редактирование ссылки
    e.preventDefault(); e.stopPropagation();
    openEditLinkModal(folder, link);
  });
  // dragstart/dragend помечают перетаскиваемую плитку; сама сортировка живёт на
  // контейнере (setupFolderSort) — так плитки плавно разъезжаются под курсором.
  tile.addEventListener("dragstart", (e) => {
    dragLinkId = link.id;
    tile.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  });
  tile.addEventListener("dragend", () => {
    tile.classList.remove("dragging");
    dragLinkId = null;
  });
  return tile;
}

/* drag&drop ссылок внутри открытой папки. Живая сортировка с FLIP-анимацией:
 * во время dragover переставляем DOM-узел плитки и плавно анимируем сдвиг
 * остальных, а порядок фиксируем в хранилище по факту (без закрытия панели). */
let dragLinkId = null;

/* FLIP: запоминаем позиции плиток «до», применяем перестановку, затем анимируем
 * их из старых позиций в новые. На слабых машинах анимацию пропускаем. */
function flipMove(container, mutate) {
  const lite = document.documentElement.classList.contains("perf-lite");
  const tiles = [...container.querySelectorAll(".ntp-mtile")];
  const before = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
  mutate();
  if (lite) return;
  for (const t of tiles) {
    const f = before.get(t); if (!f) continue;
    const l = t.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (!dx && !dy) continue;
    t.style.transition = "none";
    t.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      t.style.transition = "transform .2s ease";
      t.style.transform = "";
    });
  }
}

/* Найти узел, ПЕРЕД которым вставить перетаскиваемую плитку, по позиции курсора.
 * Берём плитку с ближайшим к курсору центром; если курсор левее/выше центра —
 * вставляем перед ней, иначе — после (в RTL — правее/выше). Работает и для
 * многорядной сетки. */
function tileInsertRef(container, x, y) {
  const tiles = [...container.querySelectorAll(".ntp-mtile:not(.dragging):not(.ntp-mtile-add)")];
  let best = null, bestD = Infinity, before = true;
  for (const t of tiles) {
    const r = t.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) {
      bestD = d; best = t;
      // в том же ряду «раньше» — левее центра (в RTL — правее)
      before = y < cy - r.height / 2 || (Math.abs(y - cy) <= r.height / 2 && (isRtl() ? x > cx : x < cx));
    }
  }
  if (!best) return null;
  return before ? best : best.nextSibling;
}

function setupFolderSort(container, folder) {
  container.addEventListener("dragover", (e) => {
    if (!dragLinkId) return;
    e.preventDefault();
    const dragged = container.querySelector(`.ntp-mtile[data-link-id="${dragLinkId}"]`);
    if (!dragged) return;
    const addTile = container.querySelector(".ntp-mtile-add");
    let ref = tileInsertRef(container, e.clientX, e.clientY) || addTile;
    if (ref === dragged || ref === dragged.nextSibling) return; // уже на месте
    flipMove(container, () => container.insertBefore(dragged, ref));
  });
  container.addEventListener("drop", async (e) => {
    if (!dragLinkId) return;
    e.preventDefault();
    dragLinkId = null;
    const ids = [...container.querySelectorAll(".ntp-mtile:not(.ntp-mtile-add)")].map((t) => t.dataset.linkId);
    state = await Storage.reorderLinks(folder.id, ids); // DOM уже верный — просто фиксируем
    renderGrid(); // обновить превью папки в сетке под новый порядок
  });
}

/* ---------- добавление ---------- */

/* Модалка добавления. folderId === null → добавляем на рабочий стол
 * (сайт или папку); folderId задан → добавляем ссылку внутрь этой папки.
 * Используем нормальную форму, а НЕ window.prompt — он заблокирован на странице
 * новой вкладки Chrome (поэтому раньше «ничего не происходило»). */
function openAddModal(folderId) {
  const intoFolder = !!folderId;
  let mode = "site"; // site | folder

  const scrim = el("div", { class: "ntp-scrim ntp-scrim--settings", onClick: closeOverlay });
  const modal = el("div", { class: "ntp-settings-modal", onClick: (e) => e.stopPropagation() });

  modal.appendChild(el("div", { class: "ntp-settings-head" }, [
    el("div", { class: "ntp-settings-title" }, intoFolder ? t("newBookmark") : t("add")),
    closeBtn()
  ]));

  const urlInput = el("input", { class: "ntp-input", placeholder: t("siteUrlExample"), dir: "ltr" });
  const nameInput = el("input", { class: "ntp-input", placeholder: t("nameOptional"), dir: "auto" });
  const folderNameInput = el("input", { class: "ntp-input", placeholder: t("folderName"), dir: "auto" });
  const siteForm = el("div", {}, [urlInput, nameInput]);
  const folderForm = el("div", { style: "display:none" }, [folderNameInput]);

  // выбор «Сайт / Папка» — только на рабочем столе
  if (!intoFolder) {
    const group = el("div", { class: "ntp-seg-group" });
    const btns = {};
    [["site", t("kindSite")], ["folder", t("kindFolder")]].forEach(([val, label]) => {
      const b = el("button", { class: "ntp-seg" + (val === "site" ? " active" : "") }, label);
      b.addEventListener("click", () => {
        mode = val;
        Object.values(btns).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        siteForm.style.display = val === "site" ? "" : "none";
        folderForm.style.display = val === "folder" ? "" : "none";
        (val === "site" ? urlInput : folderNameInput).focus();
      });
      btns[val] = b;
      group.appendChild(b);
    });
    modal.appendChild(el("div", { class: "ntp-label" }, t("whatToAdd")));
    modal.appendChild(group);
  }

  modal.appendChild(siteForm);
  modal.appendChild(folderForm);

  const submit = el("button", { class: "ntp-btn-primary" }, t("add"));
  const doSubmit = async () => {
    if (!intoFolder && mode === "folder") {
      const name = folderNameInput.value.trim();
      if (!name) { folderNameInput.focus(); return; }
      refresh(await Storage.addFolder({ title: name }));
      closeOverlay();
      return;
    }
    const url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }
    const title = nameInput.value.trim();
    if (intoFolder) {
      const s = await Storage.addLink(folderId, { title, url });
      refresh(s);
      closeOverlay();
      const fresh = s.cards.find((c) => c.id === folderId);
      const cardEl = [...grid.querySelectorAll(".ntp-card")][s.cards.indexOf(fresh)];
      if (cardEl && fresh) openFolder(fresh, cardEl);
    } else {
      refresh(await Storage.addAppCard({ title, url }));
      closeOverlay();
    }
  };
  submit.addEventListener("click", doSubmit);
  [urlInput, nameInput, folderNameInput].forEach((i) =>
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSubmit(); } })
  );
  modal.appendChild(submit);

  scrim.appendChild(modal);
  showOverlay(scrim);
  setTimeout(() => urlInput.focus(), 40);
}

/* ---------- редактирование карточек/ссылок (кастомизация) ---------- */

function toHex6(c) {
  c = (c || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) { const m = c.slice(1); return "#" + [...m].map((x) => x + x).join(""); }
  return "#7c5cff";
}
function normUrl(u) { u = (u || "").trim(); return u.includes("://") ? u : "https://" + u; }
function sldOf(url) {
  try {
    const h = new URL(normUrl(url)).hostname.replace(/^www\./, "");
    const p = h.split(".").filter(Boolean);
    return (p.length >= 2 ? p[p.length - 2] : p[0] || h).toLowerCase();
  } catch { return ""; }
}
function contrastText(bg) {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1a1a1a" : "#ffffff";
}
function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* Универсальный редактор внешнего вида для закладки (карточки или ссылки в папке):
 * название, адрес, свой URL логотипа, свой цвет фона + живой предпросмотр.
 * Ручные значения помечаются manual=true и авто-резолвер их больше не трогает. */
function openAppearanceEditor(opts) {
  const { titleText, entry, onSave, onReset, onDelete } = opts;
  const scrim = el("div", { class: "ntp-scrim ntp-scrim--settings", onClick: closeOverlay });
  const modal = el("div", { class: "ntp-settings-modal", onClick: (e) => e.stopPropagation() });

  modal.appendChild(el("div", { class: "ntp-settings-head" }, [
    el("div", { class: "ntp-settings-title" }, titleText),
    closeBtn()
  ]));

  const titleInput = el("input", { class: "ntp-input", placeholder: t("name"), value: entry.title || "", dir: "auto" });
  const urlInput = el("input", { class: "ntp-input", placeholder: t("siteUrl"), value: entry.url || "", dir: "ltr" });
  const logoInput = el("input", { class: "ntp-input", placeholder: t("logoUrlPlaceholder"), value: (entry.manual && entry.logo) ? entry.logo : "", dir: "ltr" });
  const colorInput = el("input", { class: "ntp-color", type: "color", value: toHex6(entry.iconColor || entry.bg) });
  const colorChk = el("input", { type: "checkbox" });
  colorChk.checked = !!(entry.manual && entry.iconColor);

  const preview = el("div", { class: "ntp-app ntp-edit-preview" });
  function repaint() {
    const logoV = logoInput.value.trim();
    const useColor = colorChk.checked;
    const colorV = colorInput.value;
    const logo = logoV || entry.logo || null; // меняем только цвет — логотип сохраняем
    paintIcon(preview, {
      logo,
      iconColor: useColor ? colorV : (logo ? (logoV ? null : entry.iconColor) : null),
      bg: useColor ? colorV : (entry.bg || "#7c5cff"),
      tc: useColor ? contrastText(colorV) : (entry.tc || "#fff"),
      text: (entry.text || sldOf(urlInput.value) || (titleInput.value[0] || "")).slice(0, 2)
    }, 62, null);
  }
  [titleInput, urlInput, logoInput].forEach((i) => i.addEventListener("input", repaint));
  colorInput.addEventListener("input", () => { colorChk.checked = true; repaint(); });
  colorChk.addEventListener("change", repaint);

  modal.appendChild(el("div", { class: "ntp-edit-previewwrap" }, [preview]));
  modal.appendChild(el("div", { class: "ntp-label" }, t("name")));
  modal.appendChild(titleInput);
  modal.appendChild(el("div", { class: "ntp-label" }, t("address")));
  modal.appendChild(urlInput);
  modal.appendChild(el("div", { class: "ntp-label" }, t("logoUrl")));
  modal.appendChild(logoInput);
  modal.appendChild(el("div", { class: "ntp-label" }, t("tileBackground")));
  modal.appendChild(el("div", { class: "ntp-color-row" }, [
    el("label", { class: "ntp-color-label" }, [colorChk, document.createTextNode(t("customBgColor"))]),
    colorInput
  ]));

  modal.appendChild(el("div", { class: "ntp-btn-row" }, [
    el("button", { class: "ntp-btn-ghost", onClick: () => onReset() }, t("resetToAuto")),
    el("button", {
      class: "ntp-btn-ghost danger-text",
      onClick: async () => { if (await confirmModal(t("confirmDeleteItem", entry.title), t("delete"), true)) onDelete(); else openAppearanceEditor(opts); }
    }, t("delete"))
  ]));

  const save = el("button", { class: "ntp-btn-primary" }, t("save"));
  save.addEventListener("click", () => {
    const logoV = logoInput.value.trim();
    const useColor = colorChk.checked;
    const colorV = colorInput.value;
    const patch = { title: titleInput.value.trim() || entry.title, url: normUrl(urlInput.value || entry.url) };
    if (logoV || useColor) {
      patch.manual = true;
      patch.iconV = ICON_VERSION;
      patch.logo = logoV || entry.logo || null; // только цвет сменили — логотип оставляем
      if (useColor) { patch.iconColor = colorV; patch.bg = colorV; patch.tc = contrastText(colorV); }
      else { patch.iconColor = logoV ? null : (entry.iconColor || null); }
      if (!patch.logo) patch.text = (sldOf(patch.url) || patch.title[0] || "").slice(0, 2);
    } else {
      // ничего своего не задано → вернуть к автоопределению
      patch.manual = false; patch.logo = null; patch.iconColor = null; patch.iconV = 0; patch.iconTried = 0;
    }
    onSave(patch);
  });
  modal.appendChild(save);

  scrim.appendChild(modal);
  showOverlay(scrim);
  repaint();
}

/* Папка: название + удаление (плитка папки — превью из вложенных закладок). */
function openFolderEditor(folder) {
  const scrim = el("div", { class: "ntp-scrim ntp-scrim--settings", onClick: closeOverlay });
  const modal = el("div", { class: "ntp-settings-modal", onClick: (e) => e.stopPropagation() });
  modal.appendChild(el("div", { class: "ntp-settings-head" }, [
    el("div", { class: "ntp-settings-title" }, t("editFolder")),
    closeBtn()
  ]));
  const titleInput = el("input", { class: "ntp-input", placeholder: t("folderName"), value: folder.title || "", dir: "auto" });
  modal.appendChild(el("div", { class: "ntp-label" }, t("name")));
  modal.appendChild(titleInput);

  // цвет папки: чекбокс «свой цвет» + палитра + ползунок прозрачности этого цвета.
  const colorChk = el("input", { type: "checkbox" });
  colorChk.checked = !!folder.color;
  const colorInput = el("input", { class: "ntp-color", type: "color", value: toHex6(folder.color || "#7c5cff") });
  const alphaWrap = el("div", { style: folder.color ? "" : "display:none" });
  const alphaVal = el("div", { class: "ntp-val" }, (folder.colorAlpha ?? 50) + "%");
  const alphaSlider = el("input", { class: "ntp-range", type: "range", min: 0, max: 100, value: (folder.colorAlpha ?? 50) });
  alphaSlider.addEventListener("input", () => { alphaVal.textContent = alphaSlider.value + "%"; colorChk.checked = true; alphaWrap.style.display = ""; });
  alphaWrap.appendChild(el("div", { class: "ntp-row" }, [el("div", { class: "ntp-label", style: "margin-bottom:0" }, t("colorOpacity")), alphaVal]));
  alphaWrap.appendChild(alphaSlider);
  // выбор цвета включает «свой цвет» и показывает ползунок
  colorInput.addEventListener("input", () => { colorChk.checked = true; alphaWrap.style.display = ""; });
  colorChk.addEventListener("change", () => { alphaWrap.style.display = colorChk.checked ? "" : "none"; });
  modal.appendChild(el("div", { class: "ntp-label" }, t("folderColor")));
  modal.appendChild(el("div", { class: "ntp-color-row" }, [
    el("label", { class: "ntp-color-label" }, [colorChk, document.createTextNode(t("customFolderColor"))]),
    colorInput
  ]));
  modal.appendChild(alphaWrap);

  modal.appendChild(el("div", { class: "ntp-btn-row" }, [
    // сброс цвета к дефолту (общий фон папок из настроек)
    el("button", {
      class: "ntp-btn-ghost",
      onClick: async () => { closeOverlay(); refresh(await Storage.updateCard(folder.id, { color: null, colorAlpha: null })); }
    }, t("resetColor")),
    el("button", {
      class: "ntp-btn-ghost danger-text",
      onClick: async () => { if (await confirmModal(t("confirmDeleteFolder", folder.title), t("delete"), true)) { closeOverlay(); refresh(await Storage.deleteCard(folder.id)); } else openFolderEditor(folder); }
    }, t("deleteFolder"))
  ]));
  const save = el("button", { class: "ntp-btn-primary" }, t("save"));
  save.addEventListener("click", async () => {
    closeOverlay();
    refresh(await Storage.updateCard(folder.id, {
      title: titleInput.value.trim() || folder.title,
      color: colorChk.checked ? colorInput.value : null,
      colorAlpha: colorChk.checked ? +alphaSlider.value : null
    }));
  });
  modal.appendChild(save);
  scrim.appendChild(modal);
  showOverlay(scrim);
  setTimeout(() => titleInput.focus(), 40);
}

function openEditModal(card) {
  if (card.type === "folder") return openFolderEditor(card);
  openAppearanceEditor({
    titleText: t("editBookmark"),
    entry: card,
    onSave: async (patch) => { closeOverlay(); refresh(await Storage.updateCard(card.id, patch)); },
    onReset: async () => { closeOverlay(); refresh(await Storage.updateCard(card.id, { manual: false, logo: null, iconColor: null, iconV: 0, iconTried: 0 })); },
    onDelete: async () => { closeOverlay(); refresh(await Storage.deleteCard(card.id)); }
  });
}

/* Перерисовать сетку и снова открыть папку (после правок внутри неё). */
function reopenFolder(folderId) {
  applyVars(); renderGrid(); ensureIcons();
  const fresh = state.cards.find((c) => c.id === folderId);
  if (!fresh || fresh.type !== "folder") return;
  const cardEl = [...grid.querySelectorAll(".ntp-card")][state.cards.indexOf(fresh)];
  if (cardEl) openFolder(fresh, cardEl);
}

function openEditLinkModal(folder, link) {
  openAppearanceEditor({
    titleText: t("editBookmark"),
    entry: link,
    onSave: async (patch) => { state = await Storage.updateLink(folder.id, link.id, patch); reopenFolder(folder.id); },
    onReset: async () => { state = await Storage.updateLink(folder.id, link.id, { manual: false, logo: null, iconColor: null, iconV: 0, iconTried: 0 }); reopenFolder(folder.id); },
    onDelete: async () => { state = await Storage.deleteLink(folder.id, link.id); reopenFolder(folder.id); }
  });
}

/* ---------- настройки ---------- */

function openSettings() {
  const st = state.settings;
  const scrim = el("div", { class: "ntp-scrim ntp-scrim--settings", onClick: closeOverlay });
  const modal = el("div", { class: "ntp-settings-modal", onClick: (e) => e.stopPropagation() });

  modal.appendChild(
    el("div", { class: "ntp-settings-head" }, [
      el("div", { class: "ntp-settings-title" }, t("settings")),
      closeBtn()
    ])
  );

  const change = async (patch) => { state = await Storage.updateSettings(patch); applyVars(); applyClock(); renderGrid(); reopenSettings(); };
  // при перестройке модалки сохраняем позицию прокрутки — иначе после каждого
  // ползунка/переключателя окно прыгало бы к началу
  function reopenSettings() {
    const cur = overlay.querySelector(".ntp-settings-modal");
    const scrollPos = cur ? cur.scrollTop : 0;
    closeOverlay();
    openSettings();
    const next = overlay.querySelector(".ntp-settings-modal");
    if (next) next.scrollTop = scrollPos;
  }

  // часы и дата
  modal.appendChild(toggleRow(t("showClock"), !!st.showClock, () => change({ showClock: !st.showClock })));

  // язык: «Автоматически (English)» + самоназвания языков
  modal.appendChild(el("div", { class: "ntp-label" }, t("language")));
  const autoName = (LANGUAGES.find((l) => l.code === detectLanguage()) || LANGUAGES[0]).name;
  const langSelect = el("select", { class: "ntp-select" }, [
    el("option", { value: "auto" }, t("languageAuto", autoName)),
    ...LANGUAGES.map((l) => el("option", { value: l.code, lang: l.code.replace("_", "-"), dir: "auto" }, l.name))
  ]);
  langSelect.value = LANGUAGES.some((l) => l.code === st.language) ? st.language : "auto";
  langSelect.addEventListener("change", async () => {
    state = await Storage.updateSettings({ language: langSelect.value });
    await applyLanguage();
    renderGrid();
    reopenSettings();
  });
  modal.appendChild(langSelect);

  // тема
  modal.appendChild(el("div", { class: "ntp-label" }, t("theme")));
  modal.appendChild(segGroup([["light", t("themeLight")], ["dark", t("themeDark")], ["system", t("themeSystem")]], st.theme, (v) => change({ theme: v })));

  // размер
  modal.appendChild(el("div", { class: "ntp-label" }, t("cardSize")));
  modal.appendChild(segGroup([["compact", t("sizeCompact")], ["medium", t("sizeMedium")], ["large", t("sizeLarge")]], st.cardSize, (v) => change({ cardSize: v })));

  // прозрачность папок
  modal.appendChild(rowLabel(t("folderOpacity"), st.folderOpacity + "%"));
  modal.appendChild(range(0, 100, st.folderOpacity, (v) => change({ folderOpacity: v })));

  // сила свечения
  modal.appendChild(rowLabel(t("glowIntensity"), st.glowIntensity + "%"));
  modal.appendChild(range(0, 200, st.glowIntensity, (v) => change({ glowIntensity: v })));

  // цвет свечения
  modal.appendChild(el("div", { class: "ntp-label", style: "margin-bottom:11px" }, t("glowColor")));
  const swatches = el("div", { class: "ntp-glow-group" });
  ["#ff5aaa", "#7c5cff", "#3fb6ff", "#ff8a4d", "#1fd6a6"].forEach((c) => {
    const sw = el("div", {
      class: "ntp-glow-swatch" + (st.glow === c ? " active" : ""),
      style: `background:${c};box-shadow:0 2px 8px ${c}66`,
      onClick: () => change({ glow: c })
    });
    swatches.appendChild(sw);
  });
  modal.appendChild(swatches);

  // обои рабочего стола
  modal.appendChild(el("div", { class: "ntp-label" }, t("wallpaper")));
  const wpRow = el("div", { class: "ntp-btn-row" });
  wpRow.appendChild(el("button", {
    class: "ntp-btn-ghost",
    onClick: () => pickWallpaper(() => reopenSettings())
  }, wallpaper ? t("wallpaperReplace") : t("wallpaperUpload")));
  if (wallpaper) {
    wpRow.appendChild(el("button", {
      class: "ntp-btn-ghost",
      onClick: async () => { await Storage.clearWallpaper(); wallpaper = null; applyWallpaper(); reopenSettings(); }
    }, t("wallpaperRemove")));
  }
  modal.appendChild(wpRow);

  // экспорт / импорт конфигурации (поделиться набором папок и закладок)
  modal.appendChild(el("div", { class: "ntp-label" }, t("foldersAndBookmarks")));
  const cfgRow = el("div", { class: "ntp-btn-row" });
  cfgRow.appendChild(el("button", { class: "ntp-btn-ghost", onClick: exportConfig }, t("exportToFile")));
  cfgRow.appendChild(el("button", { class: "ntp-btn-ghost", onClick: importConfig }, t("importFromFile")));
  modal.appendChild(cfgRow);
  modal.appendChild(el("div", { class: "ntp-hint" }, t("exportHint")));

  scrim.appendChild(modal);
  showOverlay(scrim);
}

/* ---------- обои: выбор файла, сжатие, сохранение ---------- */

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/* Пережимаем картинку до разумного размера (по ширине) и в JPEG — иначе фото
 * с телефона на несколько МБ будет зря занимать хранилище и тормозить отрисовку. */
async function compressImage(file, maxW = 2560, quality = 0.82) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl, false, 8000);
  if (!img || !img.naturalWidth) return dataUrl;
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  try { return cv.toDataURL("image/jpeg", quality); }
  catch { return dataUrl; }
}

function pickWallpaper(after) {
  const inp = el("input", { type: "file", accept: "image/*", style: "display:none" });
  document.body.appendChild(inp);
  inp.addEventListener("change", async () => {
    const file = inp.files && inp.files[0];
    inp.remove();
    if (!file) { if (after) after(); return; }
    const dataUrl = await compressImage(file);
    await Storage.saveWallpaper(dataUrl);
    wallpaper = dataUrl;
    applyWallpaper();
    if (after) after();
  });
  inp.click();
}

/* ---------- экспорт / импорт конфигурации ---------- */

function downloadFile(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportConfig() {
  const data = Storage.buildConfig(state, wallpaper);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`deskhub-${stamp}.cfg`, JSON.stringify(data, null, 2));
}

function importConfig() {
  const inp = el("input", { type: "file", accept: ".cfg,.json,application/json", style: "display:none" });
  document.body.appendChild(inp);
  inp.addEventListener("change", async () => {
    const file = inp.files && inp.files[0];
    inp.remove();
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { return infoModal(t("importUnreadable")); }
    // confirm() на странице новой вкладки заблокирован → своя модалка-подтверждение
    const ok = await confirmModal(t("importConfirm"), t("importAction"), true);
    if (!ok) { openSettings(); return; }
    try {
      const r = await Storage.applyConfig(data);
      wallpaper = r.wallpaper;
      refresh(r.state); // applyVars → applyWallpaper подхватит и обои
    } catch (e) {
      infoModal(e && e.code === "not-config" ? t("importNotConfig") : t("importFailed"));
    }
  });
  inp.click();
}

/* Подтверждение/инфо своими модалками (нативные confirm/alert на NTP не работают) */
function confirmModal(message, okText = t("yes"), danger = false) {
  return new Promise((resolve) => {
    const done = (v) => { closeOverlay(); resolve(v); };
    const scrim = el("div", { class: "ntp-scrim ntp-scrim--settings", onClick: () => done(false) });
    const modal = el("div", { class: "ntp-settings-modal", onClick: (e) => e.stopPropagation() }, [
      el("div", { class: "ntp-confirm-text" }, message),
      el("div", { class: "ntp-confirm-row" }, [
        el("button", { class: "ntp-btn-ghost", onClick: () => done(false) }, t("cancel")),
        el("button", { class: "ntp-btn-primary" + (danger ? " danger" : ""), style: "margin-top:0;width:auto;padding:13px 22px", onClick: () => done(true) }, okText)
      ])
    ]);
    scrim.appendChild(modal);
    showOverlay(scrim);
  });
}

function infoModal(message) {
  const scrim = el("div", { class: "ntp-scrim ntp-scrim--settings", onClick: closeOverlay });
  const modal = el("div", { class: "ntp-settings-modal", onClick: (e) => e.stopPropagation() }, [
    el("div", { class: "ntp-confirm-text" }, message),
    el("button", { class: "ntp-btn-primary", onClick: closeOverlay }, t("gotIt"))
  ]);
  scrim.appendChild(modal);
  showOverlay(scrim);
}

function segGroup(options, current, onPick) {
  const group = el("div", { class: "ntp-seg-group" });
  options.forEach(([val, label]) => {
    group.appendChild(el("button", { class: "ntp-seg" + (current === val ? " active" : ""), onClick: () => onPick(val) }, label));
  });
  return group;
}

function toggleRow(label, on, onToggle) {
  const sw = el("button", { class: "ntp-switch" + (on ? " on" : ""), onClick: onToggle, "aria-pressed": on ? "true" : "false" });
  return el("div", { class: "ntp-toggle-row" }, [el("div", { class: "ntp-toggle-label" }, label), sw]);
}

function rowLabel(label, value) {
  return el("div", { class: "ntp-row" }, [el("div", { class: "ntp-label", style: "margin-bottom:0" }, label), el("div", { class: "ntp-val" }, value)]);
}
function range(min, max, value, onChange) {
  const input = el("input", { class: "ntp-range", type: "range", min, max, value });
  input.addEventListener("change", (e) => onChange(+e.target.value));
  return input;
}

/* ---------- overlay helpers ---------- */

function showOverlay(node) { overlay.innerHTML = ""; overlay.appendChild(node); }
function closeBtn() {
  return el("button", { class: "ntp-icbtn ntp-x", onClick: closeOverlay, title: t("close"), "aria-label": t("close") }, "×");
}
function closeOverlay() { overlay.innerHTML = ""; }

/* ---------- поиск / переход ---------- */

function looksLikeUrl(q) {
  if (/\s/.test(q)) return false;
  return /^[a-z]+:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+([\/?#].*)?$/i.test(q);
}
function openUrl(url) { window.location.href = url; }

let queryHistory = []; // история поисковых запросов (кэш; источник — storage)

function recordQuery(q) {
  q = q.trim();
  if (!q) return;
  Storage.addQuery(q); // в постоянное хранилище
  queryHistory = [q, ...queryHistory.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 300);
}

/** Поиск запроса в поисковой системе, выбранной пользователем в самом Chrome.
 * chrome.search.query отправляет запрос в систему по умолчанию из настроек
 * браузера — своей мы не навязываем. Вне расширения (превью в обычной вкладке)
 * chrome.search недоступен, поэтому там открываем Google напрямую. */
function runSearch(q) {
  q = q.trim();
  if (!q) return;
  recordQuery(q);
  if (typeof chrome !== "undefined" && chrome.search && chrome.search.query) {
    chrome.search.query({ text: q, disposition: "CURRENT_TAB" });
  } else {
    openUrl("https://www.google.com/search?q=" + encodeURIComponent(q));
  }
}

/** Переход по тому, что ввели: адрес → сайт, иначе → поиск. */
function go(q) {
  q = q.trim();
  if (!q) return;
  if (looksLikeUrl(q)) openUrl(q.includes("://") ? q : "https://" + q);
  else runSearch(q);
}

const searchInput = document.getElementById("searchInput");
const suggestBox = document.getElementById("suggest");
let suggItems = [];   // текущие подсказки [{kind, label, sub, url, ico}]
let suggActive = -1;  // индекс выделенной подсказки (-1 = ничего)

/* подсказки из собственных закладок (мгновенно, без сети) */
function localSuggestions(q) {
  const ql = q.toLowerCase();
  const out = [];
  const push = (link) => {
    if (out.length >= 4) return;
    const hay = (link.title + " " + link.url).toLowerCase();
    if (hay.includes(ql)) out.push({
      kind: "link", label: link.title, sub: domain(link.url),
      url: link.url, color: link.bg, text: link.text, favicon: link.favicon
    });
  };
  state.cards.forEach((c) => {
    if (c.type === "app") push(c);
    else c.items.forEach(push);
  });
  return out;
}
function domain(url) {
  try { return new URL(url.includes("://") ? url : "https://" + url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

/* подсказки из истории запросов (как в обычной поисковой строке) */
function historySuggestions(q) {
  const ql = q.toLowerCase();
  return queryHistory
    .filter((h) => h.toLowerCase().includes(ql) && h.toLowerCase() !== ql)
    .slice(0, 3)
    .map((h) => ({ kind: "history", label: h }));
}

/* Подсказки строятся только из собственных данных пользователя: введённого
 * запроса, истории поиска и своих закладок. Внешние поисковые сервисы не
 * опрашиваются — расширение остаётся страницей новой вкладки и не обращается к
 * сторонним поисковикам за подсказками. */
function updateSuggestions() {
  const q = searchInput.value.trim();
  if (!q) return hideSuggest();
  renderSuggest([{ kind: "search", label: q }, ...historySuggestions(q), ...localSuggestions(q)]);
}

const searchSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const linkSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 18.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const historySVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.05 11a9 9 0 1 1 .5 4M3 16v-5H8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Иконка строки подсказки. innerHTML — только для НАШИХ константных SVG;
 * всё, что приходит извне (favicon URL, цвет), ставится через DOM-свойства. */
function suggestIconEl(it) {
  const span = el("span", { class: "ntp-suggest-ico" });
  if (it.kind === "link") {
    if (it.favicon) {
      const img = document.createElement("img");
      img.src = it.favicon;
      span.appendChild(img);
    } else {
      span.style.color = it.color || "";
      span.innerHTML = linkSVG;
    }
  } else {
    span.innerHTML = it.kind === "history" ? historySVG : searchSVG;
  }
  return span;
}

function renderSuggest(items) {
  suggItems = items;
  suggActive = -1;
  suggestBox.innerHTML = "";
  items.forEach((it, i) => {
    // Текст подсказки — ТОЛЬКО текстовым узлом (через el), не innerHTML: label
    // приходит из названий закладок, истории и сетевых подсказок — строковая
    // сборка позволяла бы инъекцию разметки в страницу расширения.
    const row = el("div", { class: "ntp-suggest-item", "data-i": i }, [
      suggestIconEl(it),
      el("span", { class: "ntp-suggest-text", dir: "auto" }, it.label),
      it.sub ? el("span", { class: "ntp-suggest-sub", dir: "ltr" }, it.sub) : null
    ]);
    // у элементов истории — крестик «удалить из истории»
    if (it.kind === "history") {
      const del = el("button", { class: "ntp-suggest-del", title: t("removeFromHistory"), "aria-label": t("removeFromHistory") }, "×");
      del.addEventListener("mousedown", async (e) => {
        e.preventDefault(); e.stopPropagation();
        queryHistory = await Storage.removeQuery(it.label);
        updateSuggestions();
      });
      row.appendChild(del);
    }
    row.addEventListener("mousedown", (e) => { e.preventDefault(); chooseSuggestion(i); });
    suggestBox.appendChild(row);
  });
  suggestBox.hidden = items.length === 0;
}

function hideSuggest() { suggestBox.hidden = true; suggItems = []; suggActive = -1; }

function setActive(i) {
  suggActive = i;
  [...suggestBox.children].forEach((c, idx) => c.classList.toggle("active", idx === i));
}

function chooseSuggestion(i) {
  const it = suggItems[i];
  if (!it) return;
  hideSuggest();
  if (it.kind === "link") openUrl(it.url);
  else go(it.label);
}

searchInput.addEventListener("input", updateSuggestions);
searchInput.addEventListener("focus", () => { if (searchInput.value.trim()) updateSuggestions(); });
searchInput.addEventListener("blur", () => setTimeout(hideSuggest, 120));
searchInput.addEventListener("keydown", (e) => {
  if (suggestBox.hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(suggActive + 1, suggItems.length - 1)); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(suggActive - 1, -1)); }
  else if (e.key === "Enter" && suggActive >= 0) { e.preventDefault(); chooseSuggestion(suggActive); }
  else if (e.key === "Escape") { hideSuggest(); }
});

document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (suggActive >= 0) return chooseSuggestion(suggActive);
  hideSuggest();
  go(searchInput.value);
});

document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlay(); });

/* ---------- часы и дата ---------- */

const clockEl = document.getElementById("clock");
const clockTime = document.getElementById("clockTime");
const clockDate = document.getElementById("clockDate");
let clockTimer = null;

function tickClock() {
  const now = new Date();
  clockTime.textContent = now.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  clockDate.textContent = now.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
}
/* Тикаем не каждую секунду, а раз в минуту и ровно на границе минуты —
 * мы показываем только ЧЧ:ММ, поэтому будить таймер 60 раз в минуту незачем. */
function clockLoop() {
  tickClock();
  const now = new Date();
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 30;
  clockTimer = setTimeout(clockLoop, ms);
}
function applyClock() {
  const on = !!state.settings.showClock;
  clockEl.hidden = !on;
  if (clockTimer) { clearTimeout(clockTimer); clockTimer = null; }
  if (on) clockLoop();
}

/* ---------- инициализация ---------- */

/* Язык из настроек (или автоопределение) → строки, lang/dir у <html>, статичная
 * разметка. Часы перерисовываются сразу — у них формат даты зависит от языка. */
let appliedLanguage = null;
async function applyLanguage() {
  const setting = state.settings.language || "auto";
  if (setting === appliedLanguage) return;
  appliedLanguage = setting;
  await setLanguage(setting);
  translateDocument();
  applyClock();
  saveBootCache();
}

function refresh(newState) {
  if (newState) state = newState;
  applyVars();
  applyClock();
  renderGrid();
  ensureIcons(); // подтянуть иконки у новых ссылок (async, не блокирует)
}

async function init() {
  // всё стартовое читаем параллельно — быстрее первая отрисовка
  const [st, hist, wp, icons] = await Promise.all([
    Storage.loadState(),
    Storage.loadHistory(),
    Storage.loadWallpaper(),
    Storage.loadIconData()
  ]);
  state = st;
  queryHistory = hist;
  wallpaper = wp;
  iconData = icons;
  await applyLanguage();
  applyVars();
  applyClock();
  renderGrid();
  ensureIcons();
  searchInput.focus(); // курсор сразу в поиске — можно печатать без клика
  // изменения с другого устройства (chrome.storage.sync); язык тоже синхронизируется
  Storage.onStateChanged(async (s) => {
    if (!s) return;
    state = { ...state, ...s, settings: { ...state.settings, ...(s.settings || {}) } };
    await applyLanguage();
    applyVars(); applyClock(); renderGrid(); ensureIcons();
  });
}

init();
