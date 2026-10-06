/* AIH analytics — dependency-free, cookieless, first-party.
 *
 * Design rules:
 *  - No cookies, no fingerprinting, no PII. Form field VALUES are never read or sent
 *    (only the fact that a form was started / submitted).
 *  - Honours Do Not Track and Global Privacy Control: when set, nothing leaves the browser.
 *  - Every event is buffered locally (localStorage) first, so nothing is silently lost,
 *    then flushed to the configured collector when one exists.
 *
 * Configure per page:
 *   <script defer src="analytics.js"
 *           data-endpoint=""        e.g. https://your-collector.example/collect
 *           data-goatcounter=""     e.g. aih  -> https://aih.goatcounter.com/count
 *           data-debug></script>
 * Or set window.AIH_ANALYTICS = {endpoint, goatcounter, debug} before the script.
 *
 * Console / API:
 *   AIH.analytics.track('name', {k:'v'})
 *   AIH.analytics.funnel()      -> {view, cta, start, submit, rates}
 *   AIH.analytics.summary()     -> counts by event
 *   AIH.analytics.events()      -> raw buffered records
 *   AIH.analytics.csv()         -> CSV string
 *   AIH.analytics.flush() / reset()
 * Append ?aih-analytics=1 to any page for the live debug panel.
 */
(function () {
  "use strict";

  var KEY = "aih:analytics:v1";
  var MAX = 400;               // ring buffer size
  var script = document.currentScript;
  if (!script) {
    var all = document.getElementsByTagName("script");
    script = all[all.length - 1];
  }

  function pick() {            // merge without letting undefined clobber
    var out = { endpoint: "", goatcounter: "", debug: false };
    var src = [window.AIH_ANALYTICS || {}, (script && script.dataset) || {}];
    for (var i = 0; i < src.length; i++) {
      for (var k in src[i]) {
        if (!Object.prototype.hasOwnProperty.call(src[i], k)) continue;
        var v = src[i][k];
        if (v === undefined || v === null || v === "") continue;
        out[k] = (k === "debug") ? (v === "" || v === true || v === "true" || v === "1") : v;
      }
    }
    return out;
  }
  var CFG = pick();
  var DNT = navigator.doNotTrack === "1" || window.doNotTrack === "1" ||
            navigator.globalPrivacyControl === true;
  if (DNT) { CFG.endpoint = ""; CFG.goatcounter = ""; }

  function rnd(n) {
    var s = "", a = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var SID = (function () {
    try {
      var v = sessionStorage.getItem("aih:sid");
      if (!v) { v = "s_" + rnd(10); sessionStorage.setItem("aih:sid", v); }
      return v;
    } catch (e) { return "s_" + rnd(10); }
  })();

  var buf = [];
  try { buf = JSON.parse(store(KEY) || "[]") || []; } catch (e) { buf = []; }

  function persist() { store(KEY, JSON.stringify(buf.slice(-MAX))); }
  function refHost() { try { return document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) { return ""; } }
  function vpClass() {
    var w = window.innerWidth || 0;
    return w < 620 ? "phone" : w < 1000 ? "tablet" : "desktop";
  }

  function track(name, props) {
    var rec = {
      ev: String(name),
      ts: Date.now(),
      sid: SID,
      path: location.pathname,
      ref: refHost(),
      vp: vpClass(),
      props: props || {}
    };
    buf.push(rec);
    if (buf.length > MAX) buf = buf.slice(-MAX);
    persist();
    if (CFG.debug) renderPanel();
    return rec;
  }

  var once = {};
  function trackOnce(name, props) {
    if (once[name]) return null;
    once[name] = 1;
    return track(name, props);
  }

  /* ---------- transport ---------- */
  var sending = false;
  function flush() {
    if (!CFG.endpoint || sending || !buf.length) return false;
    sending = true;
    var payload = JSON.stringify({ site: "aih", sent: new Date().toISOString(), records: buf.slice(-60) });
    var ok = false;
    try {
      if (navigator.sendBeacon) {
        ok = navigator.sendBeacon(CFG.endpoint, new Blob([payload], { type: "application/json" }));
      }
      if (!ok && window.fetch) {
        fetch(CFG.endpoint, { method: "POST", body: payload, keepalive: true, mode: "cors",
          headers: { "Content-Type": "application/json" } });
        ok = true;
      }
    } catch (e) { ok = false; } finally { sending = false; }
    return ok;
  }

  function goat(path, title) {
    if (!CFG.goatcounter) return;
    var body = "p=" + encodeURIComponent(path) + "&t=" + encodeURIComponent(title || "");
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("https://" + CFG.goatcounter + ".goatcounter.com/count", new Blob([body], { type: "text/plain" }));
      } else {
        fetch("https://" + CFG.goatcounter + ".goatcounter.com/count", { method: "POST", body: body, keepalive: true, mode: "no-cors" });
      }
    } catch (e) { /* collector optional */ }
  }

  /* ---------- automatic events ---------- */
  function pageview() {
    track("pageview", { title: document.title, vp: vpClass() });
    goat(location.pathname + (location.hash || ""), document.title);
    flush();
  }

  function scrollDepth() {
    var marks = [25, 50, 75, 100], sent = {}, queued = false;
    function check() {
      queued = false;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h <= 0 ? 100 : Math.round((window.pageYOffset / h) * 100);
      if (window.pageYOffset >= h && h > 0) pct = 100;   // at the bottom = 100% even if rounded down
      for (var i = 0; i < marks.length; i++) {
        if (pct >= marks[i] && !sent[marks[i]]) { sent[marks[i]] = 1; track("scroll_" + marks[i], { pct: pct }); }
      }
    }
    // setTimeout throttle (not rAF): rAF does not fire in background tabs or some
    // headless/flattened contexts, which would silently drop every depth event.
    function onScroll() {
      if (queued) return; queued = true;
      setTimeout(check, 80);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    setTimeout(check, 400);   // capture the opening position (short pages read 100%)
  }

  function ctaLabel(el) {
    var explicit = el.getAttribute && el.getAttribute("data-aih-cta");
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return (explicit || text || "unlabelled").slice(0, 60);
  }

  function clicks() {
    document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest && e.target.closest("a,button,[data-aih-cta]");
      if (!el) return;
      var isCta = el.matches(".btn, .btn.primary, [data-aih-cta], nav a");
      var href = el.getAttribute && el.getAttribute("href") || "";
      // location.host is empty on file:// so host matching alone would call every
      // absolute URL "internal"; only treat a link as same-site when the host matches.
      var sameHost = !!location.host && href.indexOf(location.host) !== -1;
      var external = /^https?:\/\//i.test(href) && !sameHost;
      if (external) { track("outbound", { host: href.split("/")[2] || "", label: ctaLabel(el) }); return; }
      if (isCta) {
        track("cta_click", { label: ctaLabel(el), to: href || "(js)", where: el.className.indexOf("primary") > -1 ? "primary" : "secondary" });
        goat(location.pathname + "?cta=" + encodeURIComponent(ctaLabel(el)), document.title);
      }
    }, true);
  }

  function isVisible(el) {
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && el.offsetParent !== null;
  }

  function form() {
    var f = document.getElementById("leadForm");
    if (!f) return;
    f.addEventListener("focusin", function () { trackOnce("form_start", { form: "lead" }); }, true);
    f.addEventListener("submit", function () {
      // No field VALUE is ever read — only the fact that a submission was attempted.
      track("form_submit_attempt", { form: "lead", fields: f.querySelectorAll("input,textarea").length });
      // Conversion is recorded when the provider confirms (see observer below);
      // this is the honest fallback if confirmation never becomes observable.
      setTimeout(function () {
        trackOnce("form_submit", { form: "lead", result: "unconfirmed" });
      }, 3000);
    });
    // Formspree toggles [data-fs-success] when the request actually succeeds.
    var target = document.querySelector("[data-fs-success]");
    if (!target) return;
    var was = isVisible(target);
    function confirm() {
      if (once.form_submit) return;
      once.form_submit = 1;
      track("form_submit", { form: "lead", result: "confirmed" });
      goat(location.pathname + "?conversion=lead", document.title);
    }
    var mo = new MutationObserver(function () {
      var now = isVisible(target);
      if (now && !was) { was = true; confirm(); }
      else { was = now; }
    });
    mo.observe(target, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    if (target.parentNode) mo.observe(target.parentNode, { childList: true, subtree: true });
  }

  function timeOnPage() {
    var t0 = Date.now();
    function bye() {
      if (once.__bye) return;
      once.__bye = 1;
      var s = Math.round((Date.now() - t0) / 1000);
      track("time_on_page", { seconds: s, bucket: s < 10 ? "0-10" : s < 30 ? "10-30" : s < 60 ? "30-60" : s < 180 ? "1-3m" : "3m+" });
      flush();
    }
    window.addEventListener("pagehide", bye);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") bye(); });
  }

  /* ---------- reporting ---------- */
  function events() { return buf.slice(); }
  function summary(obj) {
    var src = obj || buf, out = {};
    for (var i = 0; i < src.length; i++) out[src[i].ev] = (out[src[i].ev] || 0) + 1;
    return out;
  }
  var FUNNEL = [
    { key: "view", ev: "pageview" },
    { key: "cta", ev: "cta_click" },
    { key: "start", ev: "form_start" },
    { key: "submit", ev: "form_submit" }
  ];
  function funnel(obj) {
    var s = summary(obj), f = { view: s.pageview || 0, cta: s.cta_click || 0, start: s.form_start || 0, submit: s.form_submit || 0 };
    f.rates = {
      view_to_cta: f.view ? +(f.cta / f.view * 100).toFixed(1) : 0,
      cta_to_start: f.cta ? +(f.start / f.cta * 100).toFixed(1) : 0,
      start_to_submit: f.start ? +(f.submit / f.start * 100).toFixed(1) : 0,
      view_to_submit: f.view ? +(f.submit / f.view * 100).toFixed(1) : 0
    };
    return f;
  }
  function csv() {
    var rows = [["event", "timestamp_iso", "session", "path", "referrer", "viewport", "props"]];
    for (var i = 0; i < buf.length; i++) {
      var r = buf[i];
      rows.push([r.ev, new Date(r.ts).toISOString(), r.sid, r.path, r.ref, r.vp, JSON.stringify(r.props)]);
    }
    return rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
  }
  function reset() { buf = []; persist(); if (CFG.debug) renderPanel(); }

  /* ---------- debug panel (?aih-analytics=1) ---------- */
  // Panel content is rendered with innerHTML but every interpolated value is passed
  // through esc(): the only dynamic parts are event names/JSON props derived from
  // page-owned strings (button labels), never remote or user-supplied input.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function debugOn() {
    return CFG.debug || /(^|[?&])aih-analytics=1(&|$)/.test(location.search);
  }
  var panel;
  function renderPanel() {
    if (!debugOn()) return;
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "aih-analytics-panel";
      panel.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9999;max-width:360px;max-height:46vh;overflow:auto;" +
        "background:rgba(10,14,20,.94);border:1px solid rgba(240,166,60,.45);border-radius:8px;padding:12px 14px;" +
        "font:12px/1.5 'IBM Plex Mono',ui-monospace,monospace;color:#eef2f7;backdrop-filter:blur(12px)";
      (document.body || document.documentElement).appendChild(panel);
    }
    var f = funnel(), s = summary();
    var h = '<div style="color:#f0a63c;letter-spacing:.1em;text-transform:uppercase;font-size:11px">AIH analytics · local</div>' +
      '<div style="margin:6px 0">funnel ' + f.view + '→' + f.cta + '→' + f.start + '→' + f.submit +
      ' <span style="color:#3ecf8e">(' + f.rates.view_to_submit + '% view→lead)</span></div>' +
      '<div style="color:#9aa7ba">' + esc(Object.keys(s).sort().map(function (k) { return k + " " + s[k]; }).join(" · ")) + '</div>';
    var last = buf.slice(-8).reverse();
    h += '<div style="margin-top:8px;border-top:1px solid #232c3b;padding-top:6px">';
    for (var i = 0; i < last.length; i++) {
      h += '<div><span style="color:#5b8def">' + esc(last[i].ev) + '</span> <span style="color:#9aa7ba">' +
           esc(JSON.stringify(last[i].props).slice(0, 70)) + '</span></div>';
    }
    h += '</div><div style="margin-top:8px;color:#9aa7ba">collector: ' +
      (CFG.endpoint ? esc(CFG.endpoint) : "<span style='color:#ff6b7a'>none (local only)</span>") + '</div>';
    panel.innerHTML = h;
  }

  /* ---------- boot ---------- */
  window.AIH = window.AIH || {};
  window.AIH.analytics = {
    track: track, funnel: funnel, summary: summary, events: events, csv: csv,
    flush: flush, reset: reset, config: CFG, session: SID, dnt: DNT
  };

  function boot() {
    pageview();
    scrollDepth();
    clicks();
    form();
    timeOnPage();
    if (debugOn()) renderPanel();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();