// A simple crop box over the preview image: drag to move, drag a corner to
// resize. Works with mouse, touch and pen (pointer events) and arrow keys.

const MIN = 0.08; // smallest crop, as a fraction of the image

export function startCrop(figure, img) {
  const layer = document.createElement('div');
  layer.className = 'crop-layer';
  const box = document.createElement('div');
  box.className = 'crop-box';
  box.tabIndex = 0;
  box.setAttribute('role', 'slider');
  box.setAttribute('aria-label', 'Crop area. Use arrow keys to move, Shift plus arrow keys to resize.');
  for (const h of ['nw', 'ne', 'sw', 'se']) {
    const el = document.createElement('span');
    el.className = 'crop-handle';
    el.dataset.h = h;
    box.appendChild(el);
  }
  layer.appendChild(box);
  figure.appendChild(layer);

  let r = { x: 0.06, y: 0.04, w: 0.88, h: 0.92 }; // fractions of the displayed image

  const place = () => {
    const f = figure.getBoundingClientRect();
    const i = img.getBoundingClientRect();
    Object.assign(layer.style, { left: `${i.left - f.left}px`, top: `${i.top - f.top}px`, width: `${i.width}px`, height: `${i.height}px` });
    Object.assign(box.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  let drag = null;
  const onDown = (e) => {
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
    drag = { mode: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, start: { ...r } };
  };
  const onMove = (e) => {
    if (!drag) return;
    const i = img.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / i.width;
    const dy = (e.clientY - drag.y) / i.height;
    const s = drag.start;
    let { x, y, w, h } = s;
    if (drag.mode === 'move') {
      x = clamp(s.x + dx, 0, 1 - s.w);
      y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      if (drag.mode.includes('w')) { x = clamp(s.x + dx, 0, s.x + s.w - MIN); w = s.w + (s.x - x); }
      if (drag.mode.includes('e')) { w = clamp(s.w + dx, MIN, 1 - s.x); }
      if (drag.mode.includes('n')) { y = clamp(s.y + dy, 0, s.y + s.h - MIN); h = s.h + (s.y - y); }
      if (drag.mode.includes('s')) { h = clamp(s.h + dy, MIN, 1 - s.y); }
    }
    r = { x, y, w, h };
    place();
  };
  const onUp = () => { drag = null; };
  const onKey = (e) => {
    const step = 0.02;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.shiftKey) {
      r.w = clamp(r.w + k[0], MIN, 1 - r.x);
      r.h = clamp(r.h + k[1], MIN, 1 - r.y);
    } else {
      r.x = clamp(r.x + k[0], 0, 1 - r.w);
      r.y = clamp(r.y + k[1], 0, 1 - r.h);
    }
    place();
  };

  box.addEventListener('pointerdown', onDown);
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);
  box.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  place();
  box.focus({ preventScroll: true });

  return {
    // Crop rectangle as fractions of the image.
    value: () => ({ ...r }),
    stop() {
      window.removeEventListener('resize', place);
      layer.remove();
    }
  };
}
