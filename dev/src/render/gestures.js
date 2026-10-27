// Touch gestures for the 3D view: two fingers pan and pinch-zoom.
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
