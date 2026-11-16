/*!
 * Booking widget: embeds the online booking form on any website.
 *
 *   <div data-booking-widget></div>
 *   <script src="https://YOUR-BOOKING-DOMAIN/embed.js" async></script>
 *
 * Optional prefill attributes on the div: data-postal, data-service, data-bedrooms,
 * data-bathrooms, data-frequency (ONE_TIME, WEEKLY, BIWEEKLY, EVERY_4_WEEKS).
 *
 * The div receives a "booking-widget:complete" event ({ detail: { bookingNumber } }) when a
 * booking is made, e.g. for analytics:
 *   el.addEventListener("booking-widget:complete", (e) => gtag("event", "booking", e.detail));
 *
 * For pages that add the div later (single-page apps), call window.BookingWidget.init().
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll('script[src*="/embed.js"]');
      return all[all.length - 1];
    })();
  if (!script) return;
  var ORIGIN = new URL(script.src, location.href).origin;
  var PREFILL = ["postal", "service", "bedrooms", "bathrooms", "frequency"];
  var frames = [];

  function mount(el) {
    if (el.getAttribute("data-booking-widget-ready")) return;
    el.setAttribute("data-booking-widget-ready", "1");

    var params = [];
    for (var i = 0; i < PREFILL.length; i++) {
      var v = el.getAttribute("data-" + PREFILL[i]);
      if (v) params.push(PREFILL[i] + "=" + encodeURIComponent(v));
    }
    var iframe = document.createElement("iframe");
    iframe.src = ORIGIN + "/embed/book" + (params.length ? "?" + params.join("&") : "");
    iframe.title = "Book a cleaning";
    iframe.setAttribute("loading", "lazy");
    // Lets card wallets (Apple Pay / Google Pay) work inside the frame.
    iframe.setAttribute("allow", "payment");
    iframe.style.cssText =
      "display:block;width:100%;min-height:600px;border:0;background:transparent;color-scheme:normal";
    el.appendChild(iframe);
    frames.push({ el: el, iframe: iframe });
  }

  function init() {
    var els = document.querySelectorAll("[data-booking-widget]");
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data.type !== "string") return;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (e.source !== f.iframe.contentWindow) continue;
      if (e.data.type === "booking-widget:resize" && typeof e.data.height === "number") {
        f.iframe.style.height = Math.max(200, Math.ceil(e.data.height)) + "px";
        f.iframe.style.minHeight = "0";
      } else if (e.data.type === "booking-widget:step") {
        if (f.el.getBoundingClientRect().top < 0 && f.el.scrollIntoView)
          f.el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (e.data.type === "booking-widget:complete") {
        var detail = { bookingNumber: String(e.data.bookingNumber || "") };
        var ev;
        try {
          ev = new CustomEvent("booking-widget:complete", { detail: detail, bubbles: true });
          // ES5 has no optional catch binding, so `err` stays.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          ev = document.createEvent("CustomEvent");
          ev.initCustomEvent("booking-widget:complete", true, false, detail);
        }
        f.el.dispatchEvent(ev);
        if (f.el.scrollIntoView) f.el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  window.BookingWidget = { init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
