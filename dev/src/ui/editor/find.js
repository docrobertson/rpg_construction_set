// Find anything (Ctrl+K): a person, a place, a quest, a chapter, a monster
// band, a sign, an item — type a few letters and go straight to it.
import { h, modal, clear } from '../dom.js';
import { FEATURE_KINDS } from '../../data/terrain.js';
import { placesOf } from '../../world/places.js';
import { chapterList } from '../../game/story.js';

const ROLE_NAMES = {
  villager: 'townsfolk', guard: 'guard', lord: 'lord', sage: 'sage', weapons: 'weaponsmith', armor: 'armourer', provisions: 'provisioner',
  reagents: 'herbalist', bowyer: 'bowyer', inn: 'innkeeper', tavern: 'barkeep', healer: 'healer', merchant: 'merchant', shipwright: 'shipwright',
};

// Everything worth finding: { icon, name, sub, go }
function index(game) {
  const out = [];
  const kindOf = new Map(placesOf(game).map((p) => [p.map.id, p.kind]));
  const monsterName = (id) => game.monsters.find((m) => m.id === id)?.name || 'monsters';
  for (const m of game.maps) {
    const kind = kindOf.get(m.id);
    out.push({ icon: m.type === 'world' ? '🗺' : m.type === 'dungeon' ? '🕳' : m.type === 'castle' ? '🏰' : '🏘', name: m.name,
      sub: m.type === 'world' ? 'world map' : FEATURE_KINDS[kind]?.label?.toLowerCase() || m.type,
      go: m.type === 'world' ? { tab: 'land', map: m.id } : { tab: 'places', place: m.id } });
    for (const e of m.entities) {
      const at = { tab: 'map', map: m.id, entity: e.id };
      if (e.type === 'npc') out.push({ icon: '🧙', name: e.name || 'someone', sub: `${ROLE_NAMES[e.role] || e.role || 'person'} · ${m.name}`, go: at });
      else if (e.type === 'monster') out.push({ icon: '👹', name: monsterName(e.monster), sub: `${e.boss ? 'boss · ' : ''}${m.name}`, go: at });
      else if (e.type === 'event') out.push({ icon: '✨', name: e.name || 'point of interest', sub: m.name, go: at });
      else if (e.type === 'sign') out.push({ icon: '🪧', name: String(e.text || 'sign').slice(0, 60), sub: `sign · ${m.name}`, go: at });
      else if (e.type === 'chest' && (e.items || []).length) out.push({ icon: '🧰', name: e.items.map((it) => game.items.find((x) => x.id === it.id)?.name || it.id).join(', '), sub: `chest · ${m.name}`, go: at });
      else if (e.type === 'treasure') out.push({ icon: '⛏', name: e.name || 'buried treasure', sub: m.name, go: at });
      else if (e.type === 'portal' && e.style !== 'site') out.push({ icon: e.style === 'waygate' ? '🌀' : '🚪', name: e.label || 'passage', sub: m.name, go: at });
    }
  }
  for (const c of chapterList(game)) out.push({ icon: '📖', name: c.name || 'chapter', sub: 'chapter', go: { tab: 'story', chapter: c.id } });
  for (const q of game.quests || []) out.push({ icon: '📜', name: q.name || q.id, sub: q.main ? 'main quest' : 'quest', go: { tab: 'story', quest: q.id } });
  for (const [cat, list, icon] of [['items', game.items, '🎒'], ['monsters', game.monsters, '🐉'], ['classes', game.classes, '🛡'], ['races', game.races, '🧝'], ['spells', game.spells, '🔮']]) {
    for (const x of list || []) out.push({ icon, name: x.name || x.id, sub: cat.replace(/s$/, ''), go: { tab: 'data', cat, id: x.id } });
  }
  return out;
}

export function findAnything(ed) {
  const all = index(ed.game);
  const input = h('input.find-input', { type: 'text', placeholder: 'A name, a place, a quest…' });
  const list = h('div.find-list');
  let hits = [], at = 0;
  const go = (hit) => { m.close(); ed.goTo(hit.go); };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    hits = !q ? all.filter((x) => x.go.tab === 'places' || x.go.tab === 'story').slice(0, 40)
      : all.map((x) => {
        const n = x.name.toLowerCase(), s = x.sub.toLowerCase();
        const score = n.startsWith(q) ? 0 : n.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : s.includes(q) ? 3 : -1;
        return { x, score };
      }).filter((r) => r.score >= 0).sort((a, b) => a.score - b.score || a.x.name.localeCompare(b.x.name)).slice(0, 60).map((r) => r.x);
    at = Math.min(at, Math.max(0, hits.length - 1));
    clear(list);
    if (!hits.length) list.appendChild(h('p.hint', 'Nothing by that name.'));
    hits.forEach((x, i) => {
      const b = h('button.find-hit' + (i === at ? '.on' : ''), { onclick: () => go(x) }, h('span.fi', x.icon), h('span.fn', x.name), h('span.fs', x.sub));
      list.appendChild(b);
    });
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { at = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { at = Math.min(hits.length - 1, at + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { at = Math.max(0, at - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[at]) { go(hits[at]); e.preventDefault(); }
  });
  const m = modal(h('div.find', input, list), { title: 'Find', cls: 'find-modal' });
  draw();
  setTimeout(() => input.focus(), 30);
}
