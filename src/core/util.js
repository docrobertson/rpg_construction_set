// Assorted helpers.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

let uidCounter = 0;
let detIds = false;
let detCount = 0;
export function uid(prefix = 'e') {
  if (detIds) return prefix + '_' + (++detCount).toString(36);
  uidCounter = (uidCounter + 1) % 1e6;
  return prefix + '_' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1e6).toString(36) + uidCounter.toString(36);
}

// Run fn with predictable ids (used for built-in content so save games stay valid)
export function deterministicIds(fn) {
  const prev = [detIds, detCount];
  detIds = true;
  detCount = 0;
  try { return fn(); } finally { [detIds, detCount] = prev; }
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'item';
}

export function uniqueId(base, existing) {
  let id = slugify(base);
  const set = existing instanceof Set ? existing : new Set(existing);
  if (!set.has(id)) return id;
  let i = 2;
  while (set.has(id + '_' + i)) i++;
  return id + '_' + i;
}

export function deepClone(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

export function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Run-length encode a Uint8Array as base64 of (count,value) pairs
export function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  return bytesToBase64(new Uint8Array(out));
}

export function rleDecode(b64, length) {
  const pairs = base64ToBytes(b64);
  const out = new Uint8Array(length);
  let p = 0;
  for (let i = 0; i + 1 < pairs.length && p < length; i += 2) {
    const n = pairs[i], v = pairs[i + 1];
    out.fill(v, p, Math.min(length, p + n));
    p += n;
  }
  return out;
}

export function debounce(fn, ms) {
  let t = null;
  const f = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  f.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  return f;
}

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, text: String(reader.result) });
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    };
    input.click();
  });
}

export const DIRS = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
};
export const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DIR8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

export function dirName(dx, dy) {
  if (dy < 0) return 'North';
  if (dy > 0) return 'South';
  if (dx > 0) return 'East';
  if (dx < 0) return 'West';
  return '';
}

export function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function plural(n, word) { return n === 1 ? `${n} ${word}` : `${n} ${word}s`; }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
