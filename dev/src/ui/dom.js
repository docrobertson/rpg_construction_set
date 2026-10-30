// Tiny DOM helpers: element builder, modals, toasts, tooltips, prompts.
import { iconSvg } from './icons.js';

export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && k !== 'type') {
        try { el[k] = v; } catch { el.setAttribute(k, v); }
      } else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

let modalStack = [];

// opts: title, icon (an icons.js name shown before the title), sub (a line
// under the title), cls, buttons, onClose, closeOnBack, closeOnEsc, dim
export function modal(content, opts = {}) {
  const back = h('div.modal-back' + (opts.dim === false ? '.nodim' : ''));
  const box = h('div.modal' + (opts.cls ? '.' + opts.cls : ''));
  if (opts.title) {
    const closable = opts.closeOnEsc !== false && opts.closeX !== false;
    box.appendChild(h('div.modal-title',
      opts.icon ? h('span.mt-ico', { html: iconSvg(opts.icon) }) : null,
      h('span.mt-text', opts.title, opts.sub ? h('small.mt-sub', opts.sub) : null),
      closable ? h('button.modal-x', { title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => close(), html: iconSvg('close') }) : null));
  }
  const body = h('div.modal-body');
  box.appendChild(body);
  if (typeof content === 'function') content(body, () => close());
  else if (content) body.appendChild(content);
  if (opts.buttons) {
    const bar = h('div.modal-buttons');
    for (const b of opts.buttons) {
      bar.appendChild(h('button' + (b.primary ? '.primary' : ''), {
        onclick: () => { const r = b.onClick ? b.onClick() : undefined; if (r !== false) close(); },
      }, b.label));
    }
    box.appendChild(bar);
  }
  back.appendChild(box);
  document.getElementById('ui').appendChild(back);
  const entry = { back, box, body, onClose: opts.onClose, closeOnEsc: opts.closeOnEsc !== false };
  modalStack.push(entry);
  if (opts.closeOnBack !== false) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  function close() {
    if (!back.isConnected) return;
    back.remove();
    modalStack = modalStack.filter((m) => m !== entry);
    entry.onClose && entry.onClose();
  }
  entry.close = close;
  return entry;
}

export function topModal() { return modalStack[modalStack.length - 1]; }
export function anyModal() { return modalStack.length > 0; }
export function closeTopModal() {
  const m = topModal();
  if (m && m.closeOnEsc) { m.close(); return true; }
  return false;
}
export function closeAllModals() { for (const m of [...modalStack]) m.close(); }

export function toast(msg, kind = '') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts' });
    document.getElementById('ui').appendChild(host);
  }
  const t = h('div.toast' + (kind ? '.' + kind : ''), h('span.toast-ico', { html: iconSvg(kind === 'bad' || kind === 'warn' ? 'warn' : 'sparkle') }), h('span', msg));
  host.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3200);
}

// ---------------------------------------------------------------- tooltips
// Every `title` in the interface becomes a styled tooltip: on first hover the
// attribute moves to data-tip (so the browser's own plain tooltip stays away)
// and a framed card appears beside the element after a short pause. Touch
// screens keep their long-press behaviour; nothing shows for them.
let tipEl = null, tipFor = null, tipTimer = 0;

export function initTooltips() {
  if (tipEl) return;
  tipEl = h('div.ui-tip', { role: 'tooltip' });
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  const hide = () => { clearTimeout(tipTimer); tipFor = null; tipEl.hidden = true; };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest?.('[title], [data-tip]');
    if (t === tipFor) return;
    hide();
    if (!t || t.tagName === 'svg' || t.closest('svg')) return;
    if (t.hasAttribute('title')) {
      const v = t.getAttribute('title');
      t.removeAttribute('title');
      if (v) {
        t.dataset.tip = v;
        if (!t.hasAttribute('aria-label') && !t.textContent.trim()) t.setAttribute('aria-label', v);
      }
    }
    const text = t.dataset.tip;
    if (!text) return;
    tipFor = t;
    tipTimer = setTimeout(() => showTip(t, text), 350);
  });
  document.addEventListener('pointerout', (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('wheel', hide, { passive: true, capture: true });
  window.addEventListener('blur', hide);
}

function showTip(t, text) {
  if (!t.isConnected || tipFor !== t) return;
  tipEl.textContent = text;
  tipEl.hidden = false;
  const r = t.getBoundingClientRect();
  const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(6, Math.min(innerWidth - w - 6, x));
  let y = r.bottom + 8;
  if (y + ht > innerHeight - 6) y = r.top - ht - 8;
  tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(6, y))}px)`;
}

export function confirmDialog(text, title = 'Are you sure?') {
  return new Promise((resolve) => {
    let answered = false;
    modal(h('p', text), {
      title,
      buttons: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: 'OK', primary: true, onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

export function promptDialog(text, value = '', title = '') {
  return new Promise((resolve) => {
    let answered = false;
    const input = h('input', { type: 'text', value });
    const m = modal(h('div', h('p', text), input), {
      title,
      buttons: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(null); } },
        { label: 'OK', primary: true, onClick: () => { answered = true; resolve(input.value); } },
      ],
      onClose: () => { if (!answered) resolve(null); },
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { answered = true; resolve(input.value); m.close(); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

export function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
export function unhex(s) { return parseInt(String(s).replace('#', ''), 16) || 0; }

// Simple form field helpers bound to an object property
export function field(label, input, hint) {
  return h('label.field', h('span.field-label', label), input, hint ? h('span.field-hint', hint) : null);
}

export function textInput(obj, key, onChange, opts = {}) {
  const el = h(opts.multiline ? 'textarea' : 'input', { type: 'text', value: obj[key] ?? '', placeholder: opts.placeholder || '', rows: opts.rows || 3 });
  if (opts.multiline) el.value = obj[key] ?? '';
  el.addEventListener('input', () => { obj[key] = el.value; onChange && onChange(key, el.value); });
  return el;
}

export function numInput(obj, key, onChange, opts = {}) {
  const el = h('input', { type: 'number', value: obj[key] ?? 0, step: opts.step ?? 1, min: opts.min, max: opts.max });
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (!isNaN(v)) { obj[key] = v; onChange && onChange(key, v); }
  });
  return el;
}

export function selectInput(obj, key, options, onChange, opts = {}) {
  const el = h('select');
  for (const o of options) {
    const [val, label] = Array.isArray(o) ? o : typeof o === 'object' ? [o.id, o.name] : [o, o];
    el.appendChild(h('option', { value: val ?? '' }, label));
  }
  el.value = obj[key] ?? (opts.empty ?? '');
  el.addEventListener('change', () => {
    let v = el.value;
    if (opts.number) v = parseFloat(v);
    if (v === '' && opts.nullable) v = null;
    obj[key] = v;
    onChange && onChange(key, v);
  });
  return el;
}

export function checkInput(obj, key, onChange) {
  const el = h('input', { type: 'checkbox' });
  el.checked = !!obj[key];
  el.addEventListener('change', () => { obj[key] = el.checked; onChange && onChange(key, el.checked); });
  return el;
}

export function colorInput(obj, key, onChange) {
  const el = h('input', { type: 'color', value: hex(obj[key] ?? 0x888888) });
  el.addEventListener('input', () => { obj[key] = unhex(el.value); onChange && onChange(key, obj[key]); });
  return el;
}
