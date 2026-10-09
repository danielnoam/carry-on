// Waypage: motion (DESIGN.md §4, reworked in 1.11.0). Springs, sampled
// into CSS linear() curves since there's no animation library. On touch:
// stiffness 400, damping 32 for screens, sheets and cards; 600 and 40 for
// small controls. On a desktop (1024 px and up, a mouse or trackpad) the
// same shapes run critically damped, quicker and without overshoot.
// Nothing fades: what comes grows out of what was tapped or in from an
// edge, and leaves the same way. Under prefers-reduced-motion every one
// becomes a 120 ms fade. Nothing animates the text of a page being read,
// and nothing waits on an animation to accept input.
(function () {
  // A spring from rest at 0 to 1, sampled every frame into linear().
  function sample(k, c) {
    let x = 0, v = 0, t = 0;
    const pts = [0];
    while (t < 2) {
      for (let i = 0; i < 4; i++) { const a = -k * (x - 1) - c * v; v += a / 240; x += v / 240; }
      t += 1 / 60;
      pts.push(+x.toFixed(4));
      if (Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02) break;
    }
    pts[pts.length - 1] = 1;
    return { ms: Math.round(t * 1000), curve: "linear(" + pts.join(", ") + ")", pts };
  }
  const TOUCH = { sheet: sample(400, 32), control: sample(600, 40) };
  const DESK = { sheet: sample(700, 2 * Math.sqrt(700)), control: sample(1000, 2 * Math.sqrt(1000)) };
  // Older WebViews without linear(): the nearest cubic-bezier, no overshoot.
  const FALLBACK = "cubic-bezier(0.2, 0.9, 0.3, 1)";
  const hasLinear = !!(window.CSS && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 1)"));
  const hasClip = !!(window.CSS && CSS.supports && CSS.supports("clip-path", "inset(1px round 2px)"));
  const mq = (q) => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });
  const reducedQ = mq("(prefers-reduced-motion: reduce)");
  const deskQ = mq("(min-width: 1024px) and (pointer: fine)");
  const reduced = () => !!reducedQ.matches;
  const desk = () => !!deskQ.matches;

  function timing(kind) {
    if (reduced()) return { duration: 120, easing: "linear" };
    const s = (desk() ? DESK : TOUCH)[kind] || (desk() ? DESK : TOUCH).sheet;
    return { duration: s.ms, easing: hasLinear ? s.curve : FALLBACK };
  }

  // How many animations are running, so work that can wait (a library
  // redraw as a page lands) waits for them (1.2.0).
  let moving = 0;
  const busy = () => moving > 0;
  // frames move on the spring; under reduced motion only a 120 ms fade
  // runs, in when `show` is true, out when false, none when null.
  function run(els, kind, show, end) {
    const list = els.filter((x) => x && x[0] && x[0].animate);
    if (!list.length) return Promise.resolve();
    const done = [];
    if (reduced()) {
      if (show != null) done.push(list[0][0].animate([{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], { duration: 120, easing: "linear", fill: "both" }));
    } else list.forEach(([el, frames]) => done.push(el.animate(frames, { ...timing(kind), fill: "both" })));
    moving++;
    return Promise.all(done.map((a) => a.finished)).then(() => { if (end) end(); done.forEach((a) => a.cancel()); }, () => {}).finally(() => { moving--; });
  }
  const one = (el, frames, kind, show) => run([[el, frames]], kind, show);
  const back = (f) => f.slice().reverse();
  const box = (el) => el.getBoundingClientRect();

  // A screen pushed over another (Settings, Downloads, a feed post): in
  // from the right edge. On touch the screen under it drifts a quarter
  // to the left, as on iOS; on a desktop it stays put.
  const DRIFT = "translateX(-25%)";
  function push(el, under) {
    const f = [{ transform: "translateX(100%)" }, { transform: "none" }];
    return run([[el, f], !desk() && under && [under, [{ transform: "none" }, { transform: DRIFT }]]], "sheet", true);
  }
  function pop(el, under, from = 0) {
    const f = [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(100%)" }];
    return run([[el, f], !desk() && under && [under, [{ transform: DRIFT }, { transform: "none" }]]], "sheet", false);
  }

  // A clip or collection opened from its card, or the reader from a
  // Continue button (1.11.0): the panel tapped grows until it fills the
  // screen, and Back shrinks it into the panel again. Since 1.11.1 it
  // moves only transforms, so it runs on the GPU and stays smooth while
  // the page is laid out: the screen sits in a host (wrapped at start-up,
  // before it holds a page) that is scaled to the panel's box and clips
  // it, while the screen is scaled back the other way, so its text keeps
  // its size. A copy of the panel rides its corner and blends away as it
  // grows, and back in as it lands, so the panel turns into the screen.
  function host(el) {
    if (el.parentElement && el.parentElement.classList.contains("grow-host")) return;
    const h = document.createElement("div");
    h.className = "grow-host";
    el.before(h);
    h.appendChild(el);
  }
  const growing = new WeakMap();
  function faceOf(panel, r, T) {
    const f = panel.cloneNode(true);
    f.removeAttribute("id");
    f.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    f.setAttribute("aria-hidden", "true");
    f.inert = true;
    f.classList.add("grow-face");
    Object.assign(f.style, { left: T.left + "px", top: T.top + "px", width: r.width + "px", height: r.height + "px" });
    return f;
  }
  function grows(el, r, rad, open, panel, end) {
    const h = el.parentElement;
    if (!r || !r.width || !h || !h.classList.contains("grow-host")) return (open ? push(el) : pop(el)).then(() => { if (end) end(); });
    if (reduced()) return run([[el, []]], "sheet", open, end);
    const was = growing.get(el);
    if (was) { was.anims.forEach((a) => a.cancel()); if (was.face) was.face.remove(); }
    const T = box(el), W = innerWidth, H = innerHeight;
    const A = open ? r : T, B = open ? T : r, ra = open ? rad : 0, rb = open ? 0 : rad;
    const spring = (desk() ? DESK : TOUCH).sheet, n = spring.pts.length - 1;
    const outer = [], inner = [], round = [];
    spring.pts.forEach((p, i) => {
      const offset = i / n, mix = (k) => A[k] + (B[k] - A[k]) * p;
      const sx = Math.max(mix("width") / W, 0.001), sy = Math.max(mix("height") / H, 0.001), rv = Math.max(0, ra + (rb - ra) * p);
      outer.push({ offset, transform: "translate(" + mix("left") + "px, " + mix("top") + "px) scale(" + sx + ", " + sy + ")" });
      inner.push({ offset, transform: "scale(" + 1 / sx + ", " + 1 / sy + ") translate(" + -T.left + "px, " + -T.top + "px)" });
      round.push({ offset, borderRadius: rv / sx + "px / " + rv / sy + "px" });
    });
    Object.assign(h.style, { zIndex: getComputedStyle(el).zIndex, width: W + "px", height: H + "px" });
    el.style.transformOrigin = -T.left + "px " + -T.top + "px";
    h.classList.add("growing");
    const t = { duration: spring.ms, easing: "linear", fill: "both" };
    const anims = [h.animate(outer, t), h.animate(round, t), el.animate(inner, t)];
    let face = null;
    if (panel && panel.isConnected) {
      face = faceOf(panel, r, T);
      face.style.transformOrigin = el.style.transformOrigin;
      face.style.zIndex = (parseInt(h.style.zIndex, 10) || 0) + 1;
      h.appendChild(face);
      anims.push(face.animate(inner, t), face.animate(open ? [{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], t));
    }
    const me = { anims, face };
    growing.set(el, me);
    moving++;
    return Promise.all(anims.map((a) => a.finished)).then(() => {
      if (end) end();
      anims.forEach((a) => a.cancel());
      if (face) face.remove();
      h.classList.remove("growing");
      h.style.zIndex = h.style.width = h.style.height = "";
      el.style.transformOrigin = "";
    }, () => {}).finally(() => { moving--; if (growing.get(el) === me) growing.delete(el); });
  }
  const grow = (el, r, rad = 16, panel) => grows(el, r, rad, true, panel);
  const shrink = (el, r, rad = 16, panel, end) => grows(el, r, rad, false, panel, end);

  // A sheet from the bottom edge (the reader's Aa, the phone's menus);
  // closing goes on from where a drag left it.
  function rise(el) {
    return one(el, [{ transform: "translateY(100%)" }, { transform: "none" }], "sheet", true);
  }
  function sink(el, from = 0) {
    return one(el, [{ transform: "translateY(" + from + "px)" }, { transform: "translateY(100%)" }], "sheet", false);
  }
  function settle(el, from) {
    return one(el, [{ transform: "translateY(" + from + "px)" }, { transform: "none" }], "control", null);
  }
  // The dimming behind a sheet, the sidebar or a dialog: it darkens with
  // the thing it's under, on the same spring, from where a drag left it.
  function dim(el, show, from) {
    if (!el) return Promise.resolve();
    const left = el.style.opacity;
    el.style.opacity = "";
    const a = from != null ? from : left !== "" ? parseFloat(left) : show ? 0 : 1;
    return one(el, [{ opacity: a }, { opacity: show ? 1 : 0 }], "sheet", show);
  }

  // The sidebar, from the left edge (0.28.0); closing goes on from where
  // a drag left it (0.30.5), and a short drag springs back. On touch the
  // library under it drifts right a little (1.11.0).
  const sideDrift = (side) => "translateX(" + Math.round(side.offsetWidth * 0.2) + "px)";
  function slideIn(el, under) {
    return run([[el, [{ transform: "translateX(-100%)" }, { transform: "none" }]], under && [under, [{ transform: "none" }, { transform: sideDrift(el) }]]], "sheet", true);
  }
  function slideOut(el, from = 0, under) {
    const k = el.offsetWidth ? 1 + from / el.offsetWidth : 1;
    return run([[el, [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(-100%)" }]],
      under && [under, [{ transform: "translateX(" + Math.round(el.offsetWidth * 0.2 * k) + "px)" }, { transform: "none" }]]], from ? "control" : "sheet", false);
  }
  function slideBack(el, from, under) {
    const k = el.offsetWidth ? 1 + from / el.offsetWidth : 1;
    return run([[el, [{ transform: "translateX(" + from + "px)" }, { transform: "none" }]],
      under && [under, [{ transform: "translateX(" + Math.round(el.offsetWidth * 0.2 * k) + "px)" }, { transform: sideDrift(el) }]]], "control", null);
  }

  // A menu or popover grows out of the button that opened it, from that
  // button's corner, and shrinks back into it (1.11.0).
  function popFrames(el, anchor) {
    const P = box(el), B = anchor;
    if (!B || !B.width || !P.width || !hasClip) return [{ transform: "scale(0.6)", transformOrigin: "50% 0" }, { transform: "none", transformOrigin: "50% 0" }];
    const w = Math.min(B.width, P.width), h = Math.min(B.height, P.height);
    const left = Math.max(0, Math.min(P.width - w, B.left - P.left));
    const below = B.top < P.top + P.height / 2;
    const top = below ? 0 : P.height - h;
    const dy = below ? B.top - P.top : B.bottom - P.bottom;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return [
      { clipPath: "inset(" + top + "px " + (P.width - left - w) + "px " + (P.height - top - h) + "px " + left + "px round " + Math.min(r, h / 2) + "px)", transform: "translateY(" + dy + "px)" },
      { clipPath: "inset(0px 0px 0px 0px round " + r + "px)", transform: "none" },
    ];
  }
  const popFrom = (el, anchor) => one(el, popFrames(el, anchor), "control", true);
  const popInto = (el, anchor) => one(el, back(popFrames(el, anchor)), "control", false);

  // Bars and toasts come in past the screen's edge they sit nearest and
  // leave the same way.
  function past(el, edge) {
    const r = box(el);
    if (edge === "top") return "translateY(" + -Math.ceil(r.bottom + 8) + "px)";
    if (edge === "left") return "translateX(" + -Math.ceil(r.right + 8) + "px)";
    if (edge === "right") return "translateX(" + Math.ceil(innerWidth - r.left + 8) + "px)";
    return "translateY(" + Math.ceil(innerHeight - r.top + 8) + "px)";
  }
  const edgeIn = (el, edge = "bottom") => one(el, [{ transform: past(el, edge) }, { transform: "none" }], "sheet", true);
  const edgeOut = (el, edge = "bottom") => one(el, [{ transform: "none" }, { transform: past(el, edge) }], "sheet", false);

  // Something new in a list grows from nothing where it lands; something
  // removed shrinks to nothing (1.11.0). Its neighbours slide (flip).
  const appear = (el) => one(el, [{ transform: "scale(0)" }, { transform: "none" }], "sheet", true);
  const vanish = (el) => one(el, [{ transform: "none" }, { transform: "scale(0)" }], "control", false);

  // Where things are now, then each one that moved slides from there to
  // where it is after a change: the library's sections as Collections or
  // Clips opens on its own, cards making room or closing a gap.
  function measure(els) {
    const m = new Map();
    for (const el of els) { const r = box(el); if (r.width || r.height) m.set(el, r); }
    return m;
  }
  function flip(before, enter) {
    const runs = [];
    for (const [el, r] of before) {
      if (!el.isConnected) continue;
      const a = box(el), dx = r.left - a.left, dy = r.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      if ((a.bottom < 0 && r.bottom < 0) || (a.top > innerHeight && r.top > innerHeight)) continue;
      runs.push([el, [{ transform: "translate(" + dx + "px, " + dy + "px)" }, { transform: "none" }]]);
    }
    for (const [el, frames] of enter || []) runs.push([el, frames]);
    return run(runs, "sheet", null);
  }
  // What leaves in a flip: a copy of it, fixed where it was, goes past
  // the top or bottom edge (or the left one) and is removed.
  function ghostOut(el, r, edge, layer) {
    const g = el.cloneNode(true);
    g.removeAttribute("id");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", margin: "0", pointerEvents: "none", zIndex: "1", boxSizing: "border-box" });
    (layer || document.body).appendChild(g);
    const to = edge === "top" ? "translateY(" + -Math.ceil(r.bottom + 8) + "px)" : edge === "left" ? "translateX(" + -Math.ceil(r.right + 8) + "px)" : "translateY(" + Math.ceil(innerHeight - r.top + 8) + "px)";
    return one(g, [{ transform: "none" }, { transform: to }], "sheet", false).finally(() => g.remove());
  }
  function fromPast(r, edge) {
    if (edge === "top") return "translateY(" + -Math.ceil(r.bottom + 8) + "px)";
    if (edge === "left") return "translateX(" + -Math.ceil(r.right + 8) + "px)";
    return "translateY(" + Math.ceil(innerHeight - r.top + 8) + "px)";
  }

  // The reader going on to the next page of a collection (0.30.3): in
  // Pages it turns sideways (1.11.0), the page read leaving past the left
  // edge and the next coming in from the right; scrolling, it goes on
  // down (1.11.1), the next coming up from the bottom.
  const along = (side, d) => (side ? "translateX(" : "translateY(") + d + "%)";
  function pageOut(el, side = true) {
    return one(el, [{ transform: "none" }, { transform: along(side, -100) }], "control", false)
      .then(() => { el.style.visibility = "hidden"; });
  }
  function pageIn(el, side = true) {
    el.style.visibility = "";
    return one(el, [{ transform: along(side, 100) }, { transform: "none" }], "sheet", true);
  }

  // The spring as CSS custom properties, for transitions styles.css owns
  // (button presses, the progress bar, switches); they follow the tier.
  function paintVars() {
    const set = desk() ? DESK : TOUCH, root = document.documentElement.style;
    root.setProperty("--spring-sheet", hasLinear ? set.sheet.curve : FALLBACK);
    root.setProperty("--spring-sheet-ms", set.sheet.ms + "ms");
    root.setProperty("--spring-control", hasLinear ? set.control.curve : FALLBACK);
    root.setProperty("--spring-control-ms", set.control.ms + "ms");
  }
  paintVars();
  deskQ.addEventListener("change", paintVars);

  window.Waypage = window.Waypage || {};
  window.Waypage.motion = {
    busy, timing, reduced, desk, host, push, pop, grow, shrink, rise, sink, settle, dim, slideIn, slideOut, slideBack,
    popFrom, popInto, edgeIn, edgeOut, appear, vanish, measure, flip, ghostOut, fromPast, pageOut, pageIn, sideDrift,
  };
})();
