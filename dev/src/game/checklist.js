// The designer's checklist: what in a realm still needs work, found by looking
// the whole game over. Each finding:
//   { id, area, level: 'error' | 'warn' | 'todo' | 'ok', text, go }
// area: one of AREAS (the editor's steps). go says where to fix it:
//   { tab, map?, x?, y?, entity?, quest?, chapter? }
// error: the game cannot be played through as it is; warn: a player is likely
// to be stuck or puzzled; todo: unfinished, but playable; ok: a thing done.
//
// [shell] Interfaces fixed by the editor shell; the Checklist stream fills it in.
export const AREAS = [
  ['campaign', 'Campaign'], ['land', 'Land'], ['places', 'Places'], ['story', 'Story'], ['map', 'Details'], ['test', 'Test'],
];

export function analyzeCampaign(game, opt = {}) {
  void opt;
  const out = [];
  if (!game.meta.title || game.meta.title === 'Untitled Realm') out.push({ id: 'title', area: 'campaign', level: 'todo', text: 'Give your realm a title.', go: { tab: 'campaign' } });
  return out;
}
