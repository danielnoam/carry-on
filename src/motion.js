// Waypage: motion (DESIGN.md §4). Springs, sampled into CSS linear()
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

  // Opacity never rides the spring (0.30.8). A spring's curve is most of
  // the way there in its first fifth, so a fade on it was over in a few
  // frames and read as a cut. Fades run on their own clock with a plain
  // ease, beside the movement, as iOS and Material time theirs.
  const FADE_IN = "cubic-bezier(0.2, 0, 0.2, 1)";
  const FADE_OUT = "cubic-bezier(0.4, 0, 1, 1)";

  // frames move (transform only, on the spring); fade is [from, to, ms,
  // delay]; under reduced motion only the 120 ms fade runs.
  function run(el, frames, kind, fade) {
    if (!el || !el.animate) return Promise.resolve();
    const done = [];
    if (reduced()) {
      if (fade) done.push(el.animate([{ opacity: fade[0] }, { opacity: fade[1] }], { duration: 120, easing: "linear", fill: "both" }));
    } else {
      if (frames) done.push(el.animate(frames, { ...timing(kind), fill: "both" }));
      if (fade) done.push(el.animate([{ opacity: fade[0] }, { opacity: fade[1] }],
        { duration: fade[2], delay: fade[3] || 0, easing: fade[1] > fade[0] ? FADE_IN : FADE_OUT, fill: "both" }));
    }
    return Promise.all(done.map((a) => a.finished)).then(() => done.forEach((a) => a.cancel()), () => {});
  }
  const shift = () => Math.round(Math.min(72, innerWidth * 0.18)) + "px";

  // A screen pushed over the library (Settings, Downloads) and popped off:
  // a short slide from the right as it fades in, Material's shared axis.
  function pushIn(el) {
    return run(el, [{ transform: "translateX(" + shift() + ")" }, { transform: "none" }], "sheet", [0, 1, 220]);
  }
  function popOut(el) {
    return run(el, [{ transform: "none" }, { transform: "translateX(" + shift() + ")" }], "control", [1, 0, 180]);
  }
  // A sheet from the bottom edge (the reader's Aa).
  function rise(el) {
    return run(el, [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], "sheet", reduced() ? [0, 1] : null);
  }
  function sink(el) {
    return run(el, [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], "sheet", reduced() ? [1, 0] : null);
  }
  // The sidebar, from the left edge (0.28.0); closing goes on from where
  // a drag left it (0.30.5), and a short drag springs back.
  function slideIn(el) {
    return run(el, [{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], "sheet", reduced() ? [0, 1] : null);
  }
  function slideOut(el, from = 0) {
    return run(el, [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(-100%)" }], from ? "control" : "sheet", reduced() ? [1, 0] : null);
  }
  function slideBack(el, from) {
    return run(el, [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(0)" }], "control", null);
  }
  // The reader turning to the next page (0.30.3): the page read lifts away
  // and stays hidden until the next one comes up from the bottom.
  function pageOut(el) {
    return run(el, [{ transform: "none" }, { transform: "translateY(-6%)" }], "control", [1, 0, 160])
      .then(() => { el.style.opacity = "0"; });
  }
  function pageIn(el) {
    el.style.opacity = "";
    return run(el, [{ transform: "translateY(28%)" }, { transform: "none" }], "sheet", [0, 1, 240]);
  }
  // A clip or collection opened from its card (0.30.3, back in 0.30.8):
  // the screen grows out of the card to fill the window, fading in as it
  // grows, and shrinks back into the card on Back, fading as it lands.
  // Transform and opacity only, so the GPU runs it (0.30.4).
  function zoomFrom(r) {
    const w = innerWidth, h = innerHeight;
    if (!r || !r.width || !w) return null;
    const s = Math.max(0.3, r.width / w);
    const x = r.left + r.width / 2 - (w * s) / 2, y = r.top + r.height / 2 - (h * s) / 2;
    return "translate(" + x + "px, " + y + "px) scale(" + s + ")";
  }
  function zoomIn(el, r) {
    const small = zoomFrom(r);
    if (!small) return pushIn(el);
    el.style.transformOrigin = "0 0";
    return run(el, [{ transform: small }, { transform: "none" }], "sheet", [0, 1, 240])
      .then(() => { el.style.transformOrigin = ""; });
  }
  function zoomOut(el, r) {
    const small = zoomFrom(r);
    if (!small) return popOut(el);
    el.style.transformOrigin = "0 0";
    return run(el, [{ transform: "none" }, { transform: small }], "sheet", [1, 0, 220, 120])
      .then(() => { el.style.transformOrigin = ""; });
  }
  // Something arriving in a list or a bar: a card, the update bar, a toast.
  function arrive(el, from = 12) {
    return run(el, [{ transform: "translateY(" + from + "px) scale(0.98)" }, { transform: "none" }], "sheet", [0, 1, 200]);
  }
  function leave(el) {
    return run(el, [{ transform: "none" }, { transform: "scale(0.96)" }], "control", [1, 0, 160]);
  }
  // Collections or Clips opening alone, and back (0.30.8): the library
  // fades through, Material's fade through. What was there fades out at
  // once, the new part is drawn while nothing shows, then fades in as it
  // grows from just under full size.
  function through(el, change) {
    if (!el || !el.animate) { change(); return Promise.resolve(); }
    return run(el, null, "control", [1, 0, reduced() ? 60 : 90]).then(() => {
      el.style.opacity = "0";
      change();
      el.style.opacity = "";
      return run(el, [{ transform: "scale(0.96)" }, { transform: "none" }], "sheet", [0, 1, 210]);
    });
  }

  // The spring as CSS custom properties, for transitions styles.css owns
  // (button presses, the progress bar, the theme cross-fade).
  const root = document.documentElement.style;
  root.setProperty("--spring-sheet", hasLinear ? SPRINGS.sheet.curve : FALLBACK);
  root.setProperty("--spring-sheet-ms", SPRINGS.sheet.ms + "ms");
  root.setProperty("--spring-control", hasLinear ? SPRINGS.control.curve : FALLBACK);
  root.setProperty("--spring-control-ms", SPRINGS.control.ms + "ms");
  root.setProperty("--fade-in", FADE_IN);

  window.Waypage = window.Waypage || {};
  window.Waypage.motion = { timing, pushIn, popOut, rise, sink, slideIn, slideOut, slideBack, pageOut, pageIn, zoomIn, zoomOut, arrive, leave, through, reduced, FADE_IN };
})();
