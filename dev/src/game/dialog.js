// NPC conversation: Ultima-style keyword talk with simple conditions and actions.

export const ACTIONS = {
  none: 'No action',
  give_item: 'Give item to party',
  take_item: 'Take item from party',
  give_gold: 'Give gold',
  give_xp: 'Grant experience to the party',
  take_gold: 'Take gold (payment)',
  set_flag: 'Set story flag',
  clear_flag: 'Clear story flag',
  heal: 'Heal the party',
  join: 'Join the party',
  teleport: 'Teleport party',
  fight: 'Attack the party',
  start_quest: 'Start a quest',
  advance_quest: 'Complete the current step of a quest',
  complete_quest: 'Complete a quest',
  victory: 'Win the game!',
};

export const CONDITIONS = {
  none: 'Always',
  flag: 'Story flag is set',
  noflag: 'Story flag is NOT set',
  item: 'Party has item',
  gold: 'Party has gold ≥',
  level: 'Party level ≥',
  quest: 'Quest is under way',
  questdone: 'Quest is finished',
  noquest: 'Quest not yet begun',
};

const norm = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');

export function keywordMatches(input, key) {
  const a = norm(input), b = norm(key);
  if (!a || !b) return false;
  if (a === b) return true;
  // Ultima-style: the first four letters are enough
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true;
  if (a.length >= 3 && b.startsWith(a)) return true;
  return false;
}

export function checkCond(cond, ctx) {
  if (!cond || !cond.type || cond.type === 'none') return true;
  const { state } = ctx;
  switch (cond.type) {
    case 'flag': return !!state.party.flags[cond.value];
    case 'noflag': return !state.party.flags[cond.value];
    case 'item': return (state.party.inventory[cond.value] || 0) > 0 || state.party.members.some((m) => Object.values(m.equip || {}).includes(cond.value));
    case 'gold': return state.party.gold >= (parseInt(cond.value, 10) || 0);
    case 'level': return ctx.partyLevel >= (parseInt(cond.value, 10) || 0);
    case 'quest': return state.quests?.[cond.value]?.status === 'active';
    case 'questdone': return state.quests?.[cond.value]?.status === 'done';
    case 'noquest': return !state.quests?.[cond.value];
    default: return true;
  }
}

// Built-in replies by role. Returns {text, action?} or null
function roleReply(npc, word, ctx) {
  const role = npc.role;
  const k = (w) => keywordMatches(word, w);
  if (npc.shop && (k('BUY') || k('SELL') || k('TRADE') || k('WARES') || k('FOOD'))) return { text: 'Let us see what thou needest.', action: { type: 'shop' } };
  // (the window opens, but the person still answers)
  if (role === 'inn' && (k('ROOM') || k('REST') || k('INN') || k('SLEEP') || k('BED'))) return { text: 'A room? Aye, warm beds and a hot supper. Here is what it costs for all of ye.', action: { type: 'inn' } };
  if (role === 'healer' && (k('HEAL') || k('CURE') || k('RAISE') || k('HELP'))) return { text: 'Let me see thy hurts. Here is what I can do, and what it costs.', action: { type: 'healer' } };
  if (role === 'tavern' && (k('RUMOURS') || k('RUMORS') || k('NEWS') || k('ALE'))) {
    const r = ctx.rumour();
    return { text: r || 'Quiet times, friend. Quiet times.' };
  }
  if (role === 'lord' && (k('HEAL'))) return { text: 'Rest, and be whole.', action: { type: 'heal' } };
  if (npc.recruit && (k('JOIN') || k('COMPANY') || k('FOLLOW'))) return { text: npc.recruit.joinText || 'I will gladly join thee!', action: { type: 'join' } };
  return null;
}

export function respond(npc, input, ctx) {
  const word = norm(input);
  if (!word) return { text: '' };
  if (keywordMatches(word, 'BYE') || keywordMatches(word, 'FAREWELL') || word === 'EXIT' || word === 'QUIT') return { text: npc.bye || 'Farewell!', end: true };
  for (const kw of npc.keywords || []) {
    const keys = String(kw.key || '').split(/[,|]/).map((s) => s.trim()).filter(Boolean);
    if (!keys.some((key) => keywordMatches(word, key))) continue;
    const doneFlag = `_said_${npc.id}_${keys[0]}`;
    const once = kw.once && ctx.state.party.flags[doneFlag];
    if (!once && checkCond(kw.cond, ctx)) {
      const res = { text: kw.text || '', action: kw.action && kw.action.type !== 'none' ? kw.action : null };
      if (kw.once) res.setFlag = doneFlag;
      return res;
    }
    if (once && kw.afterText) return { text: kw.afterText };
    return { text: kw.elseText || kw.afterText || 'I have nothing more to say of that.' };
  }
  if (keywordMatches(word, 'NAME')) return { text: `I am ${npc.name || 'no one of importance'}.` };
  if (keywordMatches(word, 'JOB') || keywordMatches(word, 'WORK')) return { text: npc.job || 'I have no particular trade.' };
  if (keywordMatches(word, 'LOOK')) return { text: `Thou seest ${npc.desc || 'a stranger'}.` };
  const rr = roleReply(npc, word, ctx);
  if (rr) return rr;
  return { text: npc.unknown || 'I cannot help thee with that.' };
}

// Words in a response that are worth asking about (keywords this NPC knows)
export function knownKeywords(npc) {
  const words = ['NAME', 'JOB'];
  for (const kw of npc.keywords || []) {
    const first = String(kw.key || '').split(/[,|]/)[0].trim();
    if (first) words.push(first.toUpperCase());
  }
  if (npc.shop) words.push('BUY');
  if (npc.role === 'inn') words.push('ROOM');
  if (npc.role === 'healer') words.push('HEAL');
  if (npc.role === 'tavern') words.push('RUMOURS');
  if (npc.recruit) words.push('JOIN');
  return words;
}

// Highlight keyword mentions in a reply. Returns array of {text, key?}
export function markKeywords(text, npc) {
  const keys = knownKeywords(npc).filter((k) => k !== 'NAME' && k !== 'JOB');
  if (!keys.length || !text) return [{ text }];
  const parts = [];
  const re = new RegExp('\\b(' + keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], key: m[0].toUpperCase() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function fillText(text, ctx) {
  return String(text || '')
    .replace(/\{leader\}/g, ctx.leaderName || 'traveller')
    .replace(/\{gold\}/g, String(ctx.state.party.gold));
}
