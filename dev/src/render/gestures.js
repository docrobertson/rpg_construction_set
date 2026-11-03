// Touch gestures for the 3D view (two fingers pan and pinch-zoom), and the
// wheel and trackpad (attachWheel, below).
export function attachGestures(view, el, { pan = true } = {}) {
  const pts = new Map();
  let last = null;
  const centroid = () => {
    const a = [...pts.values()];
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
  };
  const down = (e) => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) last = centroid();
  };
  const move = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size !== 2 || !last) return;
    const c = centroid();
    if (last.d > 0 && c.d > 0) view.setZoom(view.rig.tdist * (last.d / c.d));
    if (pan) {
      const k = view.unitsPerPixel();
      const s = Math.sin((view.rig.pitch * Math.PI) / 180);
      view.panBy(-(c.x - last.x) * k, -(c.y - last.y) * k / s);
    }
    last = c;
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) last = null; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return {
    get active() { return pts.size >= 2; },
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    },
  };
}

// A wheel event from a trackpad's two-finger scroll (rather than a mouse
// wheel's notch). Browsers do not say which, so: sideways movement is a
// trackpad; in Chrome and Safari a mouse notch has a wheelDeltaY that is a
// multiple of 120 while a trackpad's is -3 × deltaY; and a mouse scrolls by
// lines or in large steps, a trackpad by a few pixels at a time.
export function isTrackpadScroll(e) {
  if (e.ctrlKey || e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  const w = e.wheelDeltaY;
  if (w && Math.abs(w) >= 120 && w % 120 === 0) return false; // a mouse notch
  if (w && Math.abs(w + 3 * e.deltaY) < 1.5) return true;
  return Math.abs(e.deltaY) < 50 || !Number.isInteger(e.deltaY);
}

// Wheels and trackpads for the 3D view. A mouse wheel zooms. On a trackpad,
// two fingers slide the map and a pinch zooms: Chrome, Firefox and Edge send
// a pinch as a wheel event with ctrlKey set; Safari sends gesture events of
// its own. A stream of wheel events keeps the meaning its first one had, so
// a fast swipe never turns into a zoom halfway.
//   opt.enabled(): handle events at all (default yes)
//   opt.pan: false, or a function saying whether sliding is allowed now
//   opt.onPan(): after each slide (to keep the view within bounds)
export function attachWheel(view, el, opt = {}) {
  let mode = null, lastT = 0, pinch = null;
  const canPan = () => (typeof opt.pan === 'function' ? opt.pan() : opt.pan !== false);
  const on = () => !opt.enabled || opt.enabled();
  const wheel = (e) => {
    if (!on()) return;
    e.preventDefault();
    if (pinch) return; // (Safari's gesture events are already zooming)
    const now = performance.now();
    if (now - lastT > 220) mode = null;
    lastT = now;
    if (e.ctrlKey) { mode = null; view.wheelZoom(e); return; }
    if (!mode) mode = canPan() && isTrackpadScroll(e) ? 'pan' : 'zoom';
    if (mode === 'pan') {
      const k = view.unitsPerPixel(), f = e.deltaMode === 1 ? 33 : 1;
      const s = Math.sin((view.rig.pitch * Math.PI) / 180);
      view.panBy(e.deltaX * f * k, (e.deltaY * f * k) / s);
      opt.onPan?.();
    } else view.wheelZoom(e);
  };
  const gStart = (e) => { if (!on()) return; e.preventDefault(); pinch = { dist: view.rig.tdist }; };
  const gChange = (e) => { if (!pinch) return; e.preventDefault(); view.setZoom(pinch.dist / Math.max(0.2, e.scale || 1)); };
  const gEnd = (e) => { if (!pinch) return; e.preventDefault(); pinch = null; };
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('gesturestart', gStart);
  el.addEventListener('gesturechange', gChange);
  el.addEventListener('gestureend', gEnd);
  return {
    destroy() {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', gStart);
      el.removeEventListener('gesturechange', gChange);
      el.removeEventListener('gestureend', gEnd);
    },
  };
}
