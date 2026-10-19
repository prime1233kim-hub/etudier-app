// Groups a hex colour into a broad family for archive filtering.

export const FAMILIES = ['black', 'white & ivory', 'grey', 'brown & beige', 'red', 'orange', 'yellow & gold', 'green', 'blue', 'purple', 'pink'];

export function family(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  if (l < 0.13) return 'black';
  if (l > 0.86 && s < 0.5) return 'white & ivory';
  if (s < 0.14) return l > 0.78 ? 'white & ivory' : 'grey';
  if (h < 15 || h >= 345) return l > 0.7 ? 'pink' : 'red';
  if (h < 45) return (s < 0.55 || l < 0.4) ? 'brown & beige' : 'orange';
  if (h < 70) return (s < 0.3 && l > 0.6) ? 'brown & beige' : 'yellow & gold';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}
