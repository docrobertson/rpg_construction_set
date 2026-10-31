// A small set of inline SVG glyphs for battle actions, abilities and
// conditions. Drawn on a 24×24 grid in currentColor so CSS can tint them;
// chunky shapes that still read at 14 px.
const S = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const F = (d) => `<path d="${d}"/>`;

const ICONS = {
  sign: F('M11 2h2v20h-2z') + F('M4 5h13l3 2.5-3 2.5H4z') + F('M20 12H7l-3 2.5L7 17h13z'),
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
  // ---- interface: status bar, menus, commands
  coin: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#0006" stroke-width="1.4"/><path d="M12 7.6l1.3 3.1 3.1 1.3-3.1 1.3L12 16.4l-1.3-3.1L7.6 12l3.1-1.3z" fill="#0007"/>',
  food: F('M14.6 2.6a6.6 6.6 0 00-5.8 9.7l-3.3 3.3a2.3 2.3 0 10-1.9 2.8 2.3 2.3 0 102.8-1.9l3.3-3.3a6.6 6.6 0 104.9-10.6z') + '<path d="M12 6.5a3.4 3.4 0 013.4-1.6" fill="none" stroke="#fff6" stroke-width="1.6" stroke-linecap="round"/>',
  torch: F('M10 11.5h4l-1.1 10.5h-1.8z') + F('M9.2 9.5h5.6l-.6 2.4H9.8z') + F('M12 1.2c.6 2.6 4.1 3.7 4.1 6.6A4.1 4.1 0 017.9 8c0-1.6.9-2.6 1.6-3.6.1 1.5.8 2.2 1.4 2.2-.1-1.9.2-3.6 1.1-5.4z'),
  moon: F('M14.2 2.4a9.6 9.6 0 107.4 14.1A7.8 7.8 0 0114.2 2.4z'),
  place: F('M12 1.8a7.2 7.2 0 00-7.2 7.2c0 5.4 7.2 13.2 7.2 13.2s7.2-7.8 7.2-13.2A7.2 7.2 0 0012 1.8z') + '<circle cx="12" cy="9" r="2.7" fill="#0008"/>',
  map: F('M2.5 5.6l6-2.6 7 2.6 6-2.6v15.8l-6 2.6-7-2.6-6 2.6z') + '<path d="M8.5 3v15.8M15.5 5.6v15.8" stroke="#0007" stroke-width="1.4" fill="none"/>',
  pack: F('M8 7V5.2a4 4 0 018 0V7h2.4l1.9 14.5H3.7L5.6 7z') + '<path d="M10 7V5.2a2 2 0 014 0V7z" fill="#0009"/><path d="M8.5 12.5h7" stroke="#0007" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  book: F('M4 3.5h11.8a2.7 2.7 0 012.7 2.7V21H7a3 3 0 01-3-3z') + '<path d="M6.8 17.7h11.7M8 7.5h7M8 10.5h5" stroke="#0008" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  scroll: F('M7.2 3h11.6a2.6 2.6 0 010 5.2h-1.2v10.3A2.5 2.5 0 0115.1 21H5.2a2.6 2.6 0 010-5.2h1.1V5.6A2.6 2.6 0 017.2 3z') + '<path d="M9.3 8.5h5.4M9.3 11.5h5.4M9.3 14.5h3.6" stroke="#0008" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  talk: F('M4.2 3.8h15.6A2.2 2.2 0 0122 6v9a2.2 2.2 0 01-2.2 2.2h-7.6l-5.3 4.3v-4.3H4.2A2.2 2.2 0 012 15V6a2.2 2.2 0 012.2-2.2z') + '<circle cx="7.6" cy="10.5" r="1.4" fill="#0009"/><circle cx="12" cy="10.5" r="1.4" fill="#0009"/><circle cx="16.4" cy="10.5" r="1.4" fill="#0009"/>',
  tent: F('M12 2.8l10.2 18.4H1.8z') + '<path d="M12 10.5l-3.6 10.7h7.2z" fill="#0009"/>',
  help: '<circle cx="12" cy="12" r="10.2"/><path d="M8.9 9.1a3.1 3.1 0 115.4 2.1c-1 1-2.3 1.5-2.3 3.3" fill="none" stroke="#000b" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.8" r="1.4" fill="#000b"/>',
  menu: S('M4 6.5h16M4 12h16M4 17.5h16', 2.6),
  crown: F('M2.8 7.2l4.7 4.1L12 4l4.5 7.3 4.7-4.1-2 12H4.8z') + '<path d="M5 20.5h14" stroke="currentColor" stroke-width="2" fill="none"/>',
  gear: '<circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="3.6" stroke-dasharray="3 2.95"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.4" fill="#0009"/>',
  play: F('M7 3.8l13.2 8.2L7 20.2z'),
  anvil: F('M2.5 6.5h14c0 2.6 2 4.1 5 4.1v1.7c-2.1 0-3.6.8-4.6 2.1l1.6 2.4v2.2H5.8v-2.2l2.1-2.5C6.3 12.6 4.4 11 2.5 10.6z'),
  upload: F('M12 2.8l6.3 6.7h-4.1v5.8H9.8V9.5H5.7z') + F('M3.5 16.5h3v2.2h11v-2.2h3v5h-17z'),
  dice: '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4"/><g fill="#000a"><circle cx="7.7" cy="7.7" r="1.7"/><circle cx="16.3" cy="7.7" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="7.7" cy="16.3" r="1.7"/><circle cx="16.3" cy="16.3" r="1.7"/></g>',
  plus: S('M12 4.5v15M4.5 12h15', 3),
  close: S('M6 6l12 12M18 6L6 18', 2.8),
  check: S('M4.5 12.5l5 5 10-11', 3),
  chevron: S('M9 4.5l7.5 7.5L9 19.5', 2.8),
  back: S('M15 4.5L7.5 12l7.5 7.5', 2.8),
  drop: F('M12 2.2s7 7.7 7 12.4a7 7 0 01-14 0c0-4.7 7-12.4 7-12.4z') + '<path d="M9 15a3 3 0 002.6 3" fill="none" stroke="#fff7" stroke-width="1.6" stroke-linecap="round"/>',
  up: F('M12 2.5l8.5 9.2h-5.2V21H8.7v-9.3H3.5z'),
  shop: F('M3 3.5h18l1.2 5.3a3 3 0 01-5.1 1.6 3 3 0 01-5.1.1 3 3 0 01-5.1-.1A3 3 0 011.8 8.8z') + F('M4.3 12.4h15.4V21H4.3z') + '<path d="M9.5 21v-5h5v5z" fill="#0009"/>',
  bed: F('M2 5.5h2.6v7.3H22V19h-2.6v-2.6H4.6V19H2z') + F('M5.6 9.2h4.2v3.3H5.6z') + F('M10.8 8.5h7.9a3.1 3.1 0 013.1 3.1v1.1h-11z'),
  castle: F('M2.5 21.5V10h3V7.5h2.2V10h2V5h1.8V2.5h1V5h1.8v5h2V7.5h2.2V10h3v11.5h-7.2v-4.3a2 2 0 00-4.1 0v4.3z'),
  quill: F('M21 2.5C13.5 3 8.4 7.7 7 15l-3.3 6.2 1.3.7 3.2-5.7C15.5 15.6 19.7 9.7 21 2.5z') + '<path d="M9.5 13.5c2.5-3 5.5-6 9-8.5" fill="none" stroke="#0007" stroke-width="1.3"/>',
  door: F('M5 2.5h10.5V21.5H5z') + '<circle cx="12.6" cy="12.3" r="1.3" fill="#000a"/>' + S('M17.5 12h5M20 9.5l2.5 2.5-2.5 2.5', 1.9),
  save: F('M3.5 3h13.3l3.7 3.7V21h-17z') + '<path d="M7 3h8.5v5.6H7zM7 13.3h10V21H7z" fill="#0008"/>',
  sound: F('M2.5 9h4.2l5.3-4.6v15.2L6.7 15H2.5z') + S('M15.5 8.5a5 5 0 010 7M18.6 5.4a9.2 9.2 0 010 13.2', 2),
  camera: F('M2.5 7h4.3l2-2.6h6.4l2 2.6h4.3v13.2h-19z') + '<circle cx="12" cy="13.3" r="4.1" fill="#0008"/>',
  party: '<circle cx="8.6" cy="7.4" r="3.6"/><circle cx="16.4" cy="8.4" r="3"/>' + F('M1.8 20.5c0-4.6 3-7.1 6.8-7.1s6.8 2.5 6.8 7.1z') + F('M15.8 13.4c3.6 0 6.4 2.1 6.4 7.1h-5.3c0-2.9-.4-5.1-1.1-7.1z'),
  compass: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/>' + F('M12 3.8l2.6 8.2H9.4z') + '<path d="M12 20.2L9.4 12h5.2z" fill="currentColor" opacity=".45"/>',
  gem: F('M7 3h10l4.6 6.1L12 21.6 2.4 9.1z') + '<path d="M2.6 9.1h18.8M9 3.2L7.5 9.1 12 21M15 3.2l1.5 5.9L12 21" stroke="#0006" stroke-width="1.2" fill="none" stroke-linejoin="round"/>',
  // ---- peoples and callings
  tower: F('M5 2.5h3v2.4h2.6V2.5h2.8v2.4H16V2.5h3v6.3l-2 2V21.5H7V10.8l-2-2z') + '<path d="M10 21.5v-4.2a2 2 0 014 0v4.2zM11 11.5h2v2.6h-2z" fill="#0009"/>',
  mountain: F('M1.2 20.5L8.6 7.6l3.5 5.3 3-4.6 7.7 12.2z') + '<path d="M8.6 7.6l2.1 3.2-1.2-.6-1 1.3-1-1.3-1.1.6z" fill="#fff8"/>',
  leaf: F('M20.4 3.2C9.4 3.2 4 9 4 15.4c0 1.6.4 3 1.1 4.2l-1.7 2 1.4 1 1.6-1.9a8.4 8.4 0 004.6 1.5c6.6 0 9.9-8.5 9.4-19z') + '<path d="M6.2 20.2C9.3 14.8 12.4 10.8 17.2 7" stroke="#0007" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  wizhat: F('M14 1.8c-3.7 3-5.7 8-6.6 13.4h10.4c-.7-3.8-1.6-7.6-1.1-10.9z') + F('M2.2 16.6c3.3-1.8 16.3-1.8 19.6 0-3.3 2.8-16.3 2.8-19.6 0z') + '<path d="M12.4 9.6l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.3.7.3-1.4-1-1 1.4-.2z" fill="#000a"/>',
  paladin: F('M12 2.2l8.2 3v6.2c0 5.2-3.6 9.1-8.2 10.9-4.6-1.8-8.2-5.7-8.2-10.9V5.2z') + '<path d="M10.7 6h2.6v4.1h3.8v2.6h-3.8v6h-2.6v-6H6.9v-2.6h3.8z" fill="#000a"/>',
  // ---- gear and goods
  axe: F('M10.9 2h2.2v20h-2.2z') + F('M13.1 3.2c4.3-.6 7.6 1.4 8.2 5.6.4 2.7-.5 4.9-2.1 6.4-1.3-2.3-3.4-3.6-6.1-3.6z') + F('M10.9 3.2c-4.3-.6-7.6 1.4-8.2 5.6-.4 2.7.5 4.9 2.1 6.4 1.3-2.3 3.4-3.6 6.1-3.6z'),
  mace: F('M10.8 11h2.4v11h-2.4z') + F('M12 1.6l1.9 2 2.8.1.1 2.8 2 1.9-2 1.9-.1 2.8-2.8.1-1.9 2-1.9-2-2.8-.1-.1-2.8-2-1.9 2-1.9.1-2.8 2.8-.1z') + '<circle cx="12" cy="8.4" r="2" fill="#0007"/>',
  staff: S('M6 21.5L16.5 6', 2.6) + '<circle cx="17.6" cy="4.6" r="3.2"/><circle cx="17.6" cy="4.6" r="1.3" fill="#fff9"/>',
  spear: S('M3.5 20.5L16.5 7.5', 2.2) + F('M21.3 2.7l-1.6 7.4-5.8-5.8z'),
  crossbow: S('M2.8 8.5c4-3.6 14.4-3.6 18.4 0', 2.4) + S('M12 5.6v15.8', 2.8) + S('M2.8 8.5l9.2 4.4 9.2-4.4', 1),
  sling: S('M4.5 3.5c0 6.5 3.3 9.6 7.5 9.6s7.5-3.1 7.5-9.6', 1.8) + '<circle cx="12" cy="15.6" r="4"/>',
  robe: F('M8 2.5h8l1.6 3.1 3.1 2.4-2.1 3.1-1.6-1V21.5H7V10.1l-1.6 1-2.1-3.1 3.1-2.4z') + '<path d="M12 6v15.5" stroke="#0007" stroke-width="1.4" fill="none"/>',
  armor: F('M4.6 4l3.8-1.4L12 5.3l3.6-2.7L19.4 4l.6 5.1-1.8 2V18.6L12 21.6l-6.2-3V11.1L4 9.1z') + '<path d="M12 5.3v16.3M7.6 12.5c2.6.8 6.2.8 8.8 0" stroke="#0007" stroke-width="1.4" fill="none"/>',
  key: '<circle cx="7.4" cy="12" r="5.2"/><circle cx="7.4" cy="12" r="2" fill="#000a"/>' + F('M11.8 10.4H22.3v3.2h-2v3h-3.2v-3h-5.3z'),
  herb: S('M12 22V10.5', 2) + F('M12 11.5C7.8 11.5 4.6 8.8 4.6 4c4.2 0 7.4 2.7 7.4 7.5z') + F('M12 14c3.7 0 7.4-2.1 7.4-6.9-4.2 0-7.4 2.6-7.4 6.9z'),
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

// ---- what to draw for things in the game

const CLASS_ICONS = { warrior: 'sword', ranger: 'bow', wizard: 'wizhat', cleric: 'sun', burglar: 'dagger', paladin: 'paladin', minstrel: 'note', runesmith: 'rune' };
const RACE_ICONS = { human: 'tower', dwarf: 'mountain', elf: 'leaf' };

export function classIcon(cls) { return CLASS_ICONS[cls?.id] || 'star'; }
export function raceIcon(race) { return RACE_ICONS[race?.id] || RACE_ICONS[race?.look?.race] || 'party'; }

const WEAPON_ICONS = { blade: 'sword', greatblade: 'sword', axe: 'axe', blunt: 'mace', staff: 'staff', dagger: 'dagger', spear: 'spear', bow: 'bow', crossbow: 'crossbow', sling: 'sling' };
const EFFECT_ICONS = { heal: 'potion', cure: 'potion', mp: 'potion', revive: 'heart', light: 'torch', food: 'food', reveal: 'scroll', recall: 'scroll' };
const EFFECT_TONES = { heal: 'heal', revive: 'heal', mp: 'mana', cure: 'cure', light: 'fire', food: 'food' };

// [icon name, tone] for an item; the tone is a CSS class suffix that tints it
export function itemIcon(it) {
  if (!it) return ['star', 'plain'];
  switch (it.type) {
    case 'weapon': return [WEAPON_ICONS[it.wkind] || ((it.range || 1) > 1 ? 'bow' : 'sword'), 'steel'];
    case 'armor': return it.weight === 'cloth' ? ['robe', 'cloth'] : ['armor', it.weight === 'leather' ? 'leather' : 'steel'];
    case 'shield': return ['shield', 'steel'];
    case 'consumable': return [EFFECT_ICONS[it.effect] || 'potion', EFFECT_TONES[it.effect] || 'paper'];
    case 'reagent': return ['herb', 'herb'];
    case 'key': return ['key', 'goldish'];
    case 'quest': return ['gem', 'quest'];
    default: return ['star', 'plain'];
  }
}

// a framed icon tile for an item (pack rows, shop cards)
export function itemTile(it, cls = '') {
  const [name, tone] = itemIcon(it);
  const s = document.createElement('span');
  s.className = `item-ico tone-${tone}${cls ? ' ' + cls : ''}`;
  s.innerHTML = iconSvg(name);
  return s;
}
