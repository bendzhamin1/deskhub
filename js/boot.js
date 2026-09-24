/*
 * boot.js — выполняется синхронно в <head>, до первой отрисовки.
 *
 * Основной код (newtab.js) — ES-модуль: он грузится отложенно и читает
 * chrome.storage асинхронно, поэтому без этого файла тёмная тема и языки с письмом
 * справа налево на долю секунды показывались бы светлой страницей
 * с неверным направлением текста. Здесь из localStorage берётся то, что
 * newtab.js запомнил в прошлый раз, и сразу ставится на <html>.
 * Инлайн-скрипты в расширениях MV3 запрещены CSP, поэтому отдельный файл.
 */
(function () {
  var boot = {};
  try { boot = JSON.parse(localStorage.getItem("deskhub:boot")) || {}; } catch (e) { /* нет кэша — первый запуск */ }
  var theme = boot.theme || "system"; // новые пользователи стартуют с темой системы
  if (theme === "system") {
    theme = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  var html = document.documentElement;
  html.setAttribute("data-theme", theme);
  if (boot.lang) html.lang = boot.lang;
  if (boot.dir) html.dir = boot.dir;
  if (boot.title) document.title = boot.title;
})();
