// Browser storage for projects (designed games) and save games.
import { serializeGame, deserializeGame } from '../data/schema.js';

const P = 'rpgcs.';

function get(key) {
  try { return localStorage.getItem(P + key); } catch { return null; }
}
function set(key, val) {
  localStorage.setItem(P + key, val);
}
function del(key) {
  try { localStorage.removeItem(P + key); } catch { /* ignore */ }
}

export function listProjects() {
  try {
    const idx = JSON.parse(get('index') || '[]');
    return idx.sort((a, b) => (b.modified || 0) - (a.modified || 0));
  } catch { return []; }
}

function writeIndex(list) { set('index', JSON.stringify(list)); }

export function saveProject(game) {
  const text = serializeGame(game);
  try {
    set('proj.' + game.id, text);
  } catch (e) {
    throw new Error('Browser storage is full. Export your game to a file, or delete old projects. (' + e.message + ')');
  }
  const list = listProjects().filter((p) => p.id !== game.id);
  list.push({ id: game.id, title: game.meta.title, modified: Date.now(), size: text.length });
  writeIndex(list);
  set('last', game.id);
  return text.length;
}

export function loadProject(id) {
  const text = get('proj.' + id);
  if (!text) return null;
  return deserializeGame(text);
}

export function deleteProject(id) {
  del('proj.' + id);
  del('save.' + id);
  writeIndex(listProjects().filter((p) => p.id !== id));
}

export function lastProjectId() { return get('last'); }

export function saveState(gameId, state) {
  try {
    set('save.' + gameId, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function loadState(gameId) {
  try {
    const t = get('save.' + gameId);
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

export function deleteState(gameId) { del('save.' + gameId); }

export function getPref(key, def) {
  try {
    const v = get('pref.' + key);
    return v == null ? def : JSON.parse(v);
  } catch { return def; }
}

export function setPref(key, val) {
  try { set('pref.' + key, JSON.stringify(val)); } catch { /* ignore */ }
}
