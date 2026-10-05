// Carry-on: motion (DESIGN.md §4). Springs, sampled into CSS linear()
// curves since there's no animation library: stiffness 400, damping 32 for
// screens, sheets and cards; 600 and 40 for small controls. Under
// prefers-reduced-motion every one of them becomes a 120 ms fade. Nothing
// here ever animates the text of a page being read, and nothing waits on an
// animation to accept input.
(function () {
  const SPRINGS = {
    sheet: { ms: 520, curve: "linear(0, 0.081, 0.246, 0.429, 0.596, 0.733, 0.837, 0.91, 0.958, 0.987, 1.003, 1.011, 1.013, 1.012, 1.01, 1.008, 1.006, 1.004, 1.002, 1.001, 1.001, 1, 1, 1, 1)" },
    control: { ms: 443, curve: "linear(0, 0.087, 0.259, 0.446, 0.614, 0.747, 0.846, 0.92, 0.962, 0.987, 1.001, 1.007, 1.009, 1.009, 1.007, 1.006, 1.004, 1.003, 1.002, 1.001, 1, 1, 1, 1, 1)" },
  };
  // Older WebViews without linear(): the nearest cubic-bezier, no overshoot.
  const FALLBACK = "cubic-bezier(0.2, 0.9, 0.3, 1)";
  const hasLinear = !!(window.CSS && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 1)"));
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  function timing(kind) {
    if (reduced()) return { duration: 120, easing: "linear" };
    const s = SPRINGS[kind] || SPRINGS.sheet;
    return { duration: s.ms, easing: hasLinear ? s.curve : FALLBACK };
  }

  function run(el, frames, kind, fadeFrames) {
    if (!el || !el.animate) return Promise.resolve();
    const t = timing(kind);
    const a = el.animate(reduced() ? fadeFrames : frames, { ...t, fill: "both" });
    return a.finished.then(() => a.cancel(), () => {});
  }

  // A screen pushed over the library (Settings, Downloads) and popped off
  // (0.30.5): a short slide from the right with a fade, Material's shared
  // axis, in the same family as the zoom from a card. The screen is opaque
  // before it has moved far, so the library never shows through for long.
  function pushIn(el) {
    return run(el, [{ opacity: 0, transform: "translateX(18%)" }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: "none" }], "sheet",
      [{ opacity: 0 }, { opacity: 1 }]);
  }
  function popOut(el) {
    return run(el, [{ opacity: 1, transform: "none" }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: "translateX(18%)" }], "control",
      [{ opacity: 1 }, { opacity: 0 }]);
  }
  // A sheet from the bottom edge (the reader's Aa).
  function rise(el) {
    return run(el, [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], "sheet",
      [{ opacity: 0 }, { opacity: 1 }]);
  }
  function sink(el) {
    return run(el, [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], "sheet",
      [{ opacity: 1 }, { opacity: 0 }]);
  }
  // The sidebar, from the left edge (0.28.0); closing goes on from where
  // a drag left it (0.30.5), and a short drag springs back.
  function slideIn(el) {
    return run(el, [{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], "sheet",
      [{ opacity: 0 }, { opacity: 1 }]);
  }
  function slideOut(el, from = 0) {
    return run(el, [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(-100%)" }], from ? "control" : "sheet",
      [{ opacity: 1 }, { opacity: 0 }]);
  }
  function slideBack(el, from) {
    return run(el, [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(0)" }], "control", []);
  }
  // The reader turning to the next page (0.30.3): the page read lifts away
  // and stays hidden until the next one comes up from the bottom.
  function pageOut(el) {
    return run(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6%)" }], "control",
      [{ opacity: 1 }, { opacity: 0 }]).then(() => { el.style.opacity = "0"; });
  }
  function pageIn(el) {
    el.style.opacity = "";
    return run(el, [{ opacity: 0, transform: "translateY(28%)" }, { opacity: 1, transform: "none" }], "sheet",
      [{ opacity: 0 }, { opacity: 1 }]);
  }
  // A page or collection opened from its card in the library (0.30.5):
  // the screen scales up from the card's centre as it fades in, as apps
  // open what was tapped, and settles back into it on Back. Only transform
  // and opacity, so the GPU runs it (0.30.4).
  const origin = (el, r) => { el.style.transformOrigin = (r.left + r.width / 2) + "px " + (r.top + r.height / 2) + "px"; };
  const clear = (el) => () => { el.style.transformOrigin = ""; };
  function zoomIn(el, r) {
    if (!r || !r.width) return pushIn(el);
    origin(el, r);
    return run(el, [{ opacity: 0, transform: "scale(0.86)" }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: "none" }], "sheet",
      [{ opacity: 0 }, { opacity: 1 }]).then(clear(el));
  }
  function zoomOut(el, r) {
    if (!r || !r.width) return popOut(el);
    origin(el, r);
    return run(el, [{ opacity: 1, transform: "none" }, { opacity: 1, offset: 0.2 }, { opacity: 0, transform: "scale(0.9)" }], "control",
      [{ opacity: 1 }, { opacity: 0 }]).then(clear(el));
  }
  // Something arriving in a list or a bar: a card, the update bar, a toast.
  function arrive(el, from = 12) {
    return run(el, [{ opacity: 0, transform: "translateY(" + from + "px) scale(0.98)" }, { opacity: 1, transform: "none" }], "sheet",
      [{ opacity: 0 }, { opacity: 1 }]);
  }
  function leave(el) {
    return run(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], "control",
      [{ opacity: 1 }, { opacity: 0 }]);
  }

  // The spring as CSS custom properties, for transitions styles.css owns
  // (button presses, the progress bar, the theme cross-fade).
  const root = document.documentElement.style;
  root.setProperty("--spring-sheet", hasLinear ? SPRINGS.sheet.curve : FALLBACK);
  root.setProperty("--spring-sheet-ms", SPRINGS.sheet.ms + "ms");
  root.setProperty("--spring-control", hasLinear ? SPRINGS.control.curve : FALLBACK);
  root.setProperty("--spring-control-ms", SPRINGS.control.ms + "ms");

  window.CarryOn = window.CarryOn || {};
  window.CarryOn.motion = { timing, pushIn, popOut, rise, sink, slideIn, slideOut, slideBack, pageOut, pageIn, zoomIn, zoomOut, arrive, leave, reduced };
})();
