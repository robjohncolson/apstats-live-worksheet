/* palette.js — applies a song palette app-wide as CSS custom properties with a short colour tween.
 * Palette.apply(palette, {el, ms}) ; palette = {bg, fg, accent, accent2, hud} as #rrggbb
 * Sets --park-bg, --park-fg, --park-accent, --park-accent2, --park-hud on el (default <html>).
 */
(function (root) {
'use strict';
var KEYS = ['bg', 'fg', 'accent', 'accent2', 'hud'], raf = null;
function hex(h) { h = (h || '#000000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function css(c) { return '#' + c.map(function (x) { return ('0' + Math.round(x).toString(16)).slice(-2); }).join(''); }
function read(el, k) { var v = getComputedStyle(el).getPropertyValue('--park-' + k).trim(); return /^#[0-9a-f]{3,6}$/i.test(v) ? hex(v) : null; }
function apply(pal, opt) {
  opt = opt || {}; var el = opt.el || document.documentElement, ms = opt.ms != null ? opt.ms : 400;
  if (!pal) return;
  var from = {}, to = {};
  KEYS.forEach(function (k) { if (pal[k]) { to[k] = hex(pal[k]); from[k] = read(el, k) || to[k]; } });
  if (raf) cancelAnimationFrame(raf);
  var t0 = null, hasRaf = typeof requestAnimationFrame === 'function';
  function step(ts) {
    if (t0 === null) t0 = ts;
    var a = ms > 0 ? Math.min(1, (ts - t0) / ms) : 1, e = a * a * (3 - 2 * a);
    Object.keys(to).forEach(function (k) { el.style.setProperty('--park-' + k, css(from[k].map(function (x, i) { return x + (to[k][i] - x) * e; }))); });
    if (a < 1 && hasRaf) raf = requestAnimationFrame(step); else raf = null;
  }
  if (hasRaf && ms > 0) raf = requestAnimationFrame(step); else step(0);
}
var api = { apply: apply, KEYS: KEYS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Palette = api;
})(typeof window !== 'undefined' ? window : this);
