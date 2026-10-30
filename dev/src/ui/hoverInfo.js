// The little card that follows the pointer over the map: what is there, what
// it is, and what a click will do — plus a cursor to match.
import { h, clear } from './dom.js';
import { markerGlyph } from '../render/markers.js';

// 32×32 cursors, drawn with a dark edge so they read on grass and stone
const svgCursor = (body, x = 4, y = 4, fallback = 'pointer') =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`)}") ${x} ${y}, ${fallback}`;

export const CURSORS = {
  walk: 'pointer',
  talk: svgCursor("<path d='M4 5h22a3 3 0 013 3v11a3 3 0 01-3 3H14l-6 6v-6H4a3 3 0 01-3-3V8a3 3 0 013-3z' fill='#fff6dc' stroke='#241608' stroke-width='2' stroke-linejoin='round'/><circle cx='9' cy='13.5' r='1.8' fill='#241608'/><circle cx='15' cy='13.5' r='1.8' fill='#241608'/><circle cx='21' cy='13.5' r='1.8' fill='#241608'/>", 3, 3),
  attack: svgCursor("<path d='M3 3l3 0 14 14-3 3L3 6z' fill='#e8eef8' stroke='#241608' stroke-width='1.6' stroke-linejoin='round'/><path d='M15 23l8-8 2 2-2.2 2.2 5 5-2.8 2.8-5-5L17 25z' fill='#c8402c' stroke='#241608' stroke-width='1.6' stroke-linejoin='round'/>", 3, 3, 'crosshair'),
  enter: svgCursor("<path d='M6 3h17v26H6z' fill='#8a5a2c' stroke='#241608' stroke-width='2' stroke-linejoin='round'/><path d='M9 6h11v20H9z' fill='#d8a85c' stroke='#241608' stroke-width='1.4'/><circle cx='17.5' cy='16.5' r='1.6' fill='#241608'/>", 4, 3),
  use: svgCursor("<path d='M11 15V5.5a2.2 2.2 0 014.4 0V13l.1-2.3a2.2 2.2 0 014.4.2V14a2.2 2.2 0 014.3.3v3.4c0 6-3.3 10.3-9.4 10.3-4.3 0-6.5-2.5-8.8-6.4l-2.4-4.1a2.1 2.1 0 013.6-2.2z' fill='#fff6dc' stroke='#241608' stroke-width='1.8' stroke-linejoin='round'/>", 12, 3),
  look: 'help',
  none: 'not-allowed',
};

export class HoverInfo {
  constructor(parent) {
    this.el = h('div.hover-tip');
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.sig = '';
  }

  // info: { title, sub, act, badge (marker kind), tone: 'talk'|'attack'|'enter'|'use'|'walk'|'none' }
  show(info, x, y) {
    if (!info) { this.hide(); return; }
    const sig = [info.title, info.sub, info.act, info.badge, info.tone, info.note].join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      clear(this.el);
      this.el.className = 'hover-tip tone-' + (info.tone || 'walk');
      this.el.append(...[
        h('div.ht-title', info.badge ? h('span.ht-badge.' + info.badge, { html: markerGlyph(info.badge) }) : null, h('span', info.title || '')),
        info.sub ? h('div.ht-sub', info.sub) : null,
        info.note ? h('div.ht-note', info.note) : null,
        info.act ? h('div.ht-act', info.act) : null,
      ].filter(Boolean));
    }
    this.el.hidden = false;
    // beside the pointer, kept inside the window
    const W = window.innerWidth, H = window.innerHeight;
    const w = this.el.offsetWidth || 200, hh = this.el.offsetHeight || 60;
    let px = x + 18, py = y + 20;
    if (px + w > W - 8) px = x - w - 14;
    if (py + hh > H - 8) py = y - hh - 12;
    this.el.style.transform = `translate(${Math.max(4, px)}px, ${Math.max(4, py)}px)`;
  }

  hide() { this.el.hidden = true; }

  destroy() { this.el.remove(); }
}
