// A small set of inline SVG glyphs for battle actions, abilities and
// conditions. Drawn on a 24×24 grid in currentColor so CSS can tint them;
// chunky shapes that still read at 14 px.
const S = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const F = (d) => `<path d="${d}"/>`;

const ICONS = {
  sword: F('M20.6 2.4l1 1-10.5 11.3-2.4-2.4z') + F('M5.2 12.6l1.5-1.5 6.2 6.2-1.5 1.5-1.8-1.8-3.1 3.1a1.5 1.5 0 01-2.1-2.1l3.1-3.1z'),
  bow: S('M6 3.5c7.5 1.5 13 7 14.5 14.5', 2.4) + S('M6 3.5L20.5 18', 1) + S('M4 20l11.5-11.5', 1.8) + F('M17.6 6.4l-4.3.5 3.8 3.8z') + S('M4 20l-1-2.5M4 20l2.5 1', 1.4),
  shield: F('M12 2.2l8.2 3v6.2c0 5.2-3.6 9.1-8.2 10.9-4.6-1.8-8.2-5.7-8.2-10.9V5.2z'),
  bash: F('M10 4.5l6.5 2.4v4.9c0 4.1-2.8 7.2-6.5 8.6-3.7-1.4-6.5-4.5-6.5-8.6V6.9z') + S('M19 5l2.5-1.5M19.5 10H22M19 15l2.5 1.5', 2),
  shout: F('M10.6 3.5h2.8l-.5 10.5h-1.8z') + '<circle cx="12" cy="18" r="1.9"/>' + S('M5.5 6.5a8 8 0 000 11M18.5 6.5a8 8 0 010 11', 2.2),
  whirl: S('M12 4a8 8 0 017.8 6.3M20 12a8 8 0 01-6.3 7.8M12 20a8 8 0 01-7.8-6.3M4 12a8 8 0 016.3-7.8', 2.6) + '<circle cx="12" cy="12" r="2.2"/>',
  aim: S('M12 3v4M12 17v4M3 12h4M17 12h4', 2.2) + '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.8"/>',
  pin: S('M18 3L8 13', 2.2) + F('M19.5 1.5l-.2 4.6-4.4-4.4z') + S('M3 20h18', 2.4) + S('M8 13l-2 5M8 13l3 4', 1.6),
  volley: S('M3 13L13 3M7 17L17 7M11 21L21 11', 2) + F('M14.5 1.5l-.3 3.8-3.5-3.5zM18.5 5.5l-.3 3.8-3.5-3.5zM22.5 9.5l-.3 3.8-3.5-3.5z'),
  fire: F('M12.5 2c.6 3.8 6.5 6.2 6.5 12.2A7 7 0 015 14.3c0-3.1 1.8-5.2 3.1-7 .2 2.9 1.4 4.3 2.6 4.3-.2-3.6.4-6.9 1.8-9.6z'),
  frost: S('M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6', 2) + S('M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5M4.5 10.5l3.4-.9-.9-3.4M19.5 13.5l-3.4.9.9 3.4M4.5 13.5l3.4.9-.9 3.4M19.5 10.5l-3.4-.9.9-3.4', 1.6),
  blink: S('M12 3a9 9 0 019 9M21 12a9 9 0 01-9 9M3 12a9 9 0 019-9', 2) + F('M12 7l1.4 3.6L17 12l-3.6 1.4L12 17l-1.4-3.6L7 12l3.6-1.4z'),
  heart: F('M12 21l-1.5-1.3C5 15 2 12.2 2 8.5 2 5.5 4.5 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.5 3 22 5.5 22 8.5c0 3.7-3 6.5-8.5 11.2z'),
  sun: '<circle cx="12" cy="12" r="4.6"/>' + S('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1', 2.2),
  cross: F('M10 2.5h4v6h6v4h-6v9h-4v-9H4v-4h6z'),
  poison: F('M12 2.5s6.5 7.4 6.5 12a6.5 6.5 0 01-13 0c0-4.6 6.5-12 6.5-12z') + '<circle cx="9.6" cy="14.5" r="1.3" fill="#0006"/><circle cx="13.6" cy="17" r="1" fill="#0006"/>',
  smoke: F('M6.8 19a4.3 4.3 0 01-.4-8.6 5.6 5.6 0 0110.8-1.3A4.9 4.9 0 1117.5 19z') + S('M8 6.5c.8-1.4 2.3-2.3 4-2.3', 1.6),
  dagger: F('M12 1.8l2 3v9.7h-4V4.8z') + F('M7 14.5h10v2H7z') + F('M11 16.5h2v4.2l-1 1.5-1-1.5z'),
  hands: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2"/>' + F('M10.5 6.3h3v4.2h4.2v3h-4.2v4.2h-3v-4.2H6.3v-3h4.2z'),
  banner: S('M5 2.5V22', 2.4) + F('M6 3.5h13l-3 4.2 3 4.2H6z'),
  note: F('M9 18.2a3 3 0 11-2-2.8V4.2l12-2.3v12.3a3 3 0 11-2-2.8V5.4l-8 1.5z'),
  star: F('M12 2.2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.1l-6.1 3.5 1.5-6.8-5.2-4.6 6.9-.7z'),
  sparkle: F('M12 1.5l1.9 6.1 6.1 1.9-6.1 1.9-1.9 6.1-1.9-6.1L4 9.5l6.1-1.9z') + F('M18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z') + F('M5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'),
  hammer: F('M4 3.5h10v6H4z') + F('M14 5h3.5v3H14z') + F('M7.5 9.5h3v12h-3z'),
  rune: S('M12 2.5l7 9.5-7 9.5-7-9.5z', 2) + S('M12 7v10M9 10.5l3 2 3-2', 1.8),
  quake: S('M2 16h4l2-4 3 7 3-10 3 7 2-2h3', 2.2) + S('M5 6l1.5 2M12 3v2.5M19 6l-1.5 2', 1.8),
  claw: S('M6 3c2 5 2 11-1 17M12 2c2 6 2 13-1 20M18 3c2 5 2 11-1 17', 2.2),
  eye: F('M12 5C6.5 5 3 9.5 2 12c1 2.5 4.5 7 10 7s9-4.5 10-7c-1-2.5-4.5-7-10-7z') + '<circle cx="12" cy="12" r="3.6" fill="#000a"/>',
  skull: F('M12 2.5c-5 0-8.2 3.4-8.2 7.9 0 2.6 1.2 4.4 3 5.5v3.4h2.4v-2h1.6v2h2.4v-2h1.6v2h2.4v-3.4c1.8-1.1 3-2.9 3-5.5 0-4.5-3.2-7.9-8.2-7.9z') + '<circle cx="8.9" cy="11" r="2" fill="#000a"/><circle cx="15.1" cy="11" r="2" fill="#000a"/>',
  boot: F('M7 2.5h6.5v9l5.8 3.6c1.1.7 1.7 1.8 1.7 3V21H4.5v-3.4L7 15z'),
  hourglass: F('M5.5 2h13v2.5c0 3-2.6 5.3-4.6 7.5 2 2.2 4.6 4.5 4.6 7.5V22h-13v-2.5c0-3 2.6-5.3 4.6-7.5-2-2.2-4.6-4.5-4.6-7.5z') + '<path d="M8.5 19.5h7c-.5-1.8-2.2-3.1-3.5-4.3-1.3 1.2-3 2.5-3.5 4.3z" fill="#0007"/>',
  potion: F('M9.5 2h5v2h-1v4.3c3.3 1 5.5 3.8 5.5 7.2a7 7 0 01-14 0c0-3.4 2.2-6.2 5.5-7.2V4h-1z') + '<path d="M6.3 15h11.4a5.7 5.7 0 01-11.4 0z" fill="#0005"/>',
  wand: S('M4 20L15 9', 2.8) + F('M17.5 1.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3L13 6l3.3-1.2z'),
  stun: F('M5 5l.9 2.4 2.4.9-2.4.9L5 11.6l-.9-2.4-2.4-.9 2.4-.9zM12 2l.9 2.4 2.4.9-2.4.9L12 8.6l-.9-2.4-2.4-.9 2.4-.9zM19 5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z') + S('M4 16c3 4 13 4 16 0', 2),
  sleep: S('M4 5h6l-6 7h6M13 11h5l-5 6h5M18.5 3h3l-3 3.5h3', 2),
  fear: S('M12 6.5v7', 3) + '<circle cx="12" cy="17.5" r="1.8"/><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>',
  down: F('M9.5 3h5v9h4.5L12 21l-7-9h4.5z'),
  flee: S('M14 4.5a1.5 1.5 0 100-.1M9 21l3-6 3 2v4M12 15l-1-5 4-1 2 3 3 1M11 10l-4 2-1 3', 2),
  end: S('M12 3a9 9 0 109 9', 2.4) + F('M21.5 3.5v6h-6z') + S('M12 7v5l3 2', 2.2),
  move: F('M12 2l4 4.5h-2.8V11H17V8.2l4.5 3.8L17 15.8V13h-3.8v4.5H16L12 22l-4-4.5h2.8V13H7v2.8L2.5 12 7 8.2V11h3.8V6.5H8z'),
  warn: F('M12 2.5l10.5 18.5h-21z') + '<path d="M11 9h2l-.3 6h-1.4z" fill="#000c"/><circle cx="12" cy="17.6" r="1.2" fill="#000c"/>',
};

export const ICON_NAMES = Object.keys(ICONS);

export function iconSvg(name, cls = '') {
  const body = ICONS[name] || ICONS.star;
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

// A span holding the glyph (h() from dom.js accepts it as a child)
export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = 'ico-wrap' + (cls ? ' ' + cls : '');
  s.innerHTML = iconSvg(name);
  return s;
}
