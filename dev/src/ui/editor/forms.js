// A small declarative form builder used by the editor's inspectors.
// Field spec: { key: 'a.b', label, type, options, hint, show(obj), min, max, step, placeholder }
// types: text, textarea, number, dice, check, select, color, multicheck, statmods, itemlist, list, ids, info
import { h, hex, unhex } from '../dom.js';
import { STATS } from '../../data/defaults.js';

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  if (value === undefined) delete o[keys[keys.length - 1]];
  else o[keys[keys.length - 1]] = value;
}

const optList = (options) => (typeof options === 'function' ? options() : options || []).map((o) => (Array.isArray(o) ? o : typeof o === 'object' ? [o.id, o.name ?? o.label ?? o.id] : [o, o]));

export function buildForm(obj, fields, onChange, opts = {}) {
  const root = h('div.form');
  const rerender = () => {
    const fresh = buildForm(obj, fields, onChange, opts);
    root.replaceWith(fresh);
  };
  const changed = (key, structural) => {
    onChange && onChange(key);
    if (structural) rerender();
  };
  for (const f of fields) {
    if (f.show && !f.show(obj)) continue;
    if (f.type === 'section') { root.appendChild(h('div.form-section', f.label)); continue; }
    if (f.type === 'info') { root.appendChild(h('p.hint', typeof f.label === 'function' ? f.label(obj) : f.label)); continue; }
    const el = fieldInput(obj, f, changed);
    if (f.type === 'check') root.appendChild(h('label.field.check', el, h('span.field-label', f.label), f.hint ? h('span.field-hint', f.hint) : null));
    else {
      // complex widgets must not live inside a <label> (clicks would be forwarded to the first input)
      const tag = ['list', 'multicheck', 'itemlist', 'ids', 'statmods', 'color'].includes(f.type) ? 'div' : 'label';
      root.appendChild(h(tag + '.field' + (f.wide ? '.wide' : ''), h('span.field-label', f.label), el, f.hint ? h('span.field-hint', f.hint) : null));
    }
  }
  return root;
}

function fieldInput(obj, f, changed) {
  const val = getPath(obj, f.key);
  const set = (v, structural) => { setPath(obj, f.key, v); changed(f.key, structural || f.rerender); };
  switch (f.type) {
    case 'textarea': {
      const el = h('textarea', { rows: f.rows || 3, placeholder: f.placeholder || '' });
      el.value = val ?? '';
      el.addEventListener('input', () => set(el.value));
      return el;
    }
    case 'number': {
      const el = h('input', { type: 'number', value: val ?? '', step: f.step ?? 1, min: f.min, max: f.max, placeholder: f.placeholder });
      el.addEventListener('input', () => { const v = parseFloat(el.value); set(isNaN(v) ? (f.nullable ? undefined : 0) : v); });
      return el;
    }
    case 'check': {
      const el = h('input', { type: 'checkbox' });
      el.checked = !!val;
      el.addEventListener('change', () => set(el.checked, true));
      return el;
    }
    case 'select': {
      const el = h('select');
      if (f.empty !== undefined) el.appendChild(h('option', { value: '' }, f.empty));
      for (const [v, label] of optList(f.options)) el.appendChild(h('option', { value: String(v) }, label));
      const opts0 = optList(f.options);
      el.value = val == null ? (f.empty !== undefined ? '' : String(opts0[0]?.[0] ?? '')) : String(val);
      el.addEventListener('change', () => {
        let v = el.value;
        if (v === '' && f.empty !== undefined) v = f.nullable ? null : '';
        else if (f.number) v = parseFloat(v);
        set(v, true);
      });
      return el;
    }
    case 'color': {
      const el = h('input', { type: 'color', value: hex(val ?? f.default ?? 0x888888) });
      const wrap = h('span.color-wrap', el);
      if (f.nullable) {
        const clr = h('button.small', { title: 'None', onclick: (e) => { e.preventDefault(); set(null, true); } }, '∅');
        wrap.appendChild(clr);
        if (val == null) el.classList.add('unset');
      }
      el.addEventListener('input', () => { el.classList.remove('unset'); set(unhex(el.value)); });
      return wrap;
    }
    case 'multicheck': {
      const arr = Array.isArray(val) ? val : [];
      const wrap = h('div.multicheck');
      for (const [v, label] of optList(f.options)) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = arr.includes(v);
        cb.addEventListener('change', () => {
          const cur = new Set(Array.isArray(getPath(obj, f.key)) ? getPath(obj, f.key) : []);
          if (cb.checked) cur.add(v); else cur.delete(v);
          set([...cur]);
        });
        wrap.appendChild(h('label.mc', cb, h('span', label)));
      }
      return wrap;
    }
    case 'statmods': {
      const o = val || {};
      const wrap = h('div.statmods');
      for (const s of STATS) {
        const el = h('input', { type: 'number', value: o[s] ?? 0, step: 1, min: -5, max: 5 });
        el.addEventListener('input', () => {
          const cur = { ...(getPath(obj, f.key) || {}) };
          cur[s] = parseInt(el.value, 10) || 0;
          set(cur);
        });
        wrap.appendChild(h('label', h('span', s.toUpperCase()), el));
      }
      return wrap;
    }
    case 'itemlist': {
      // [{id, n}]
      const arr = Array.isArray(val) ? val : [];
      const wrap = h('div.itemlist');
      const opts = optList(f.options);
      arr.forEach((row, i) => {
        const sel = h('select');
        for (const [v, label] of opts) sel.appendChild(h('option', { value: v }, label));
        sel.value = row.id;
        sel.addEventListener('change', () => { row.id = sel.value; set(arr); });
        const n = h('input', { type: 'number', value: row.n ?? 1, min: 1, step: 1 });
        n.addEventListener('input', () => { row.n = Math.max(1, parseInt(n.value, 10) || 1); set(arr); });
        wrap.appendChild(h('div.il-row', sel, n, h('button.small', { onclick: (e) => { e.preventDefault(); arr.splice(i, 1); set(arr, true); } }, '×')));
      });
      wrap.appendChild(h('button.small', { onclick: (e) => { e.preventDefault(); arr.push({ id: opts[0]?.[0], n: 1 }); set(arr, true); } }, '+ Add'));
      return wrap;
    }
    case 'ids': {
      // ordered list of ids via selects
      const arr = Array.isArray(val) ? val : [];
      const wrap = h('div.itemlist');
      const opts = optList(f.options);
      arr.forEach((id, i) => {
        const sel = h('select');
        for (const [v, label] of opts) sel.appendChild(h('option', { value: v }, label));
        sel.value = id;
        sel.addEventListener('change', () => { arr[i] = sel.value; set(arr); });
        wrap.appendChild(h('div.il-row', sel, h('button.small', { onclick: (e) => { e.preventDefault(); arr.splice(i, 1); set(arr, true); } }, '×')));
      });
      wrap.appendChild(h('button.small', { onclick: (e) => { e.preventDefault(); arr.push(opts[0]?.[0]); set(arr, true); } }, '+ Add'));
      return wrap;
    }
    case 'list': {
      // array of sub-objects with sub-fields
      const arr = Array.isArray(val) ? val : [];
      if (!Array.isArray(val)) setPath(obj, f.key, arr);
      const wrap = h('div.sublist');
      arr.forEach((row, i) => {
        const label = h('span', f.rowLabel ? f.rowLabel(row, i) : `#${i + 1}`);
        const sub = buildForm(row, f.fields, () => { if (f.rowLabel) label.textContent = f.rowLabel(row, i); changed(f.key); }, {});
        wrap.appendChild(h('div.sl-row',
          h('div.sl-head', label,
            h('span.sl-btns',
              i > 0 ? h('button.small', { title: 'Move up', onclick: (e) => { e.preventDefault(); arr.splice(i - 1, 0, arr.splice(i, 1)[0]); set(arr, true); } }, '↑') : null,
              h('button.small', { title: 'Remove', onclick: (e) => { e.preventDefault(); arr.splice(i, 1); set(arr, true); } }, '×'))),
          sub));
      });
      wrap.appendChild(h('button.small', { onclick: (e) => { e.preventDefault(); arr.push(f.newRow ? f.newRow() : {}); set(arr, true); } }, f.addLabel || '+ Add'));
      return wrap;
    }
    case 'dice':
    case 'text':
    default: {
      const el = h('input', { type: 'text', value: val ?? '', placeholder: f.placeholder || '' });
      el.addEventListener('input', () => {
        if (f.type === 'dice') el.classList.toggle('bad', !/^\s*(\d*d\d+([+-]\d+)?|\d+)\s*$/i.test(el.value));
        set(el.value);
      });
      return el;
    }
  }
}
