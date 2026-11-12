// The play helpers for tests/adventure2.mjs: walking by real steps (round
// puzzles and people), bumping levers and braziers, stepping on runes and
// plates, pushing boulders. Installed in the page as window.__L.
export const installPlayHelpers = (page) => page.evaluate(() => {
  const S = () => window.__app.session;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { terrain } = window.__travel;
  const L = {};
  window.__L = L;
  L.S = S;
  L.sleep = sleep;
  L.idle = async () => { for (let i = 0; i < 800; i++) { const s = S(); if (!(s.busy || s.transitioning || s.battle)) break; await sleep(25); } };
  // close whatever window is open: its ×, its button, a conversation's BYE, or Escape
  L.closeOne = () => {
    const back = document.querySelector('.modal-back');
    if (!back) return false;
    const b = back.querySelector('.modal-x, .modal-buttons button') || [...back.querySelectorAll('button')].find((x) => /^\s*bye\s*$/i.test(x.textContent));
    if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  };
  L.close = async () => { for (let i = 0; i < 10 && L.closeOne(); i++) await sleep(150); const s = S(); if (s.mode === 'dialog') s.mode = 'explore'; };
  L.map = (name) => S().game.maps.find((m) => m.name === name);
  // (the dungeon's own monsters are left out of these walks: the battles are fought in node)
  L.clear = (name, ids = null) => { const m = L.map(name), ms = S().mapState(m.id); for (const e of m.entities) if (e.type === 'monster' && (!ids || ids.includes(e.monster)) && !ms.removed.includes(e.id)) ms.removed.push(e.id); };
  L.enter = async (name, at) => {
    const s = S(), m = L.map(name);
    if (m.type !== 'world') L.clear(name);
    s.peaceful = true; // (no wanderers turn up in these walks)
    await s.enterMap(m.id, at?.x ?? m.entry.x, at?.y ?? m.entry.y);
    await L.idle(); await L.close(); await sleep(200); await L.close();
  };
  L.ent = (id) => S().map.entities.find((e) => e.id === id);
  L.npc = (id) => L.ent(id);
  L.flag = (f) => !!S().party.flags[f];
  // a foe beaten, as a battle's end has it (the fights themselves are the simulation's)
  L.kill = (id) => { S().onMonsterKilled(id); window.__quests.checkQuests(S()); };
  L.talk = (id) => window.__quests.onTalk(S(), L.ent(id));
  L.say = (id, word) => S().say(L.ent(id), word);
  L.join = async (id) => { const n = L.ent(id); const r = S().say(n, 'JOIN'); if (r.action?.type !== 'join') return r.text; const err = S().recruit(n); await L.idle(); return err || 'joined'; };
  L.member = (id) => S().party.members.find((m) => m.fromNpc === id);
  L.choose = (id, label) => { const e = L.ent(id); const c = e.choices.find((x) => x.label.startsWith(label)); return window.__events.resolveChoice(S(), e, c); };
  L.stage = () => (S().state.quests.q_main.status === 'done' ? 'done' : S().state.quests.q_main.stage);
  L.pos = () => ({ ...S().state.pos });
  // (pictures by mid-morning light)
  L.day = () => { const s = S(); s.state.turn = Math.floor((s.state.turn || 0) / 300) * 300 + 375; s.applyDaylight?.(); };
  // can the walker stand there? (not on another puzzle's square unless it is the goal)
  L.passable = (x, y, goal) => {
    const s = S(), map = s.map;
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = terrain(map.tiles[y * map.w + x]);
    if (!t.walk || t.locked) return false;
    const here = map.entities.filter((e) => e.x === x && e.y === y);
    const isGoal = goal && goal.x === x && goal.y === y;
    for (const e of here) {
      if (['npc', 'monster', 'sign', 'event', 'portal'].includes(e.type) && !isGoal) return false;
      if (window.__puzzles.puzzleSolid(e)) return false;
      if ((e.type === 'rune' || e.type === 'plate' || e.type === 'chest' || e.type === 'treasure') && !isGoal) return false;
    }
    if (s.dv && s.dv.selected()) { const h = s.dv.heroAt(x, y); if (h && h !== s.dv.actor()) return false; }
    return true;
  };
  // a shortest way by steps, to (tx, ty) or (adj) to a square beside it
  L.path = (tx, ty, adj = false) => {
    const s = S(), map = s.map, p = s.state.pos;
    const goal = { x: tx, y: ty };
    const done = (x, y) => (adj ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : x === tx && y === ty);
    if (done(p.x, p.y)) return [];
    const prev = new Map([[`${p.x},${p.y}`, null]]);
    const q = [[p.x, p.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (prev.has(k) || !L.passable(nx, ny, adj ? null : goal)) continue;
        prev.set(k, [x, y, dx, dy]);
        if (done(nx, ny)) {
          const steps = [];
          for (let c = k; prev.get(c); ) { const [px, py, ddx, ddy] = prev.get(c); steps.unshift([ddx, ddy]); c = `${px},${py}`; }
          return steps;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  };
  L.walk = async (tx, ty, adj = false) => {
    for (let guard = 0; guard < 4; guard++) {
      const steps = L.path(tx, ty, adj);
      if (!steps) return false;
      if (!steps.length) return true;
      for (const [dx, dy] of steps) {
        const before = L.pos();
        await L.go(dx, dy);
        const now = L.pos();
        if (now.x === before.x && now.y === before.y) break; // (something was in the way: look again)
      }
    }
    return adj ? Math.abs(L.pos().x - tx) + Math.abs(L.pos().y - ty) === 1 : L.pos().x === tx && L.pos().y === ty;
  };
  // (a toast, a tip or a level-up card left open would swallow the step)
  L.ready = async () => { if (document.querySelector('.modal-back')) await L.close(); const s = S(); if (s.mode === 'dialog') s.mode = 'explore'; await L.idle(); };
  L.go = async (dx, dy) => { await L.ready(); await S().move(dx, dy); await L.idle(); };
  // walk up to it and walk into it: pull a lever, light a brazier, push a boulder, ask a riddle
  L.bump = async (id) => {
    const e = L.ent(id);
    if (!(await L.walk(e.x, e.y, true))) return false;
    const p = L.pos();
    await L.go(e.x - p.x, e.y - p.y);
    return true;
  };
  L.stepOn = async (id) => { const e = L.ent(id); return L.walk(e.x, e.y); };
  // push a boulder to (tx, ty): along a row, then a column
  L.push = async (id, tx, ty) => {
    const b = L.ent(id);
    for (let guard = 0; guard < 30 && (b.x !== tx || b.y !== ty); guard++) {
      const dx = Math.sign(tx - b.x), dy = dx ? 0 : Math.sign(ty - b.y);
      if (!(await L.walk(b.x - dx, b.y - dy))) return false;
      await L.go(dx, dy);
    }
    return b.x === tx && b.y === ty;
  };
  L.alone = (i) => { const dv = S().dv; dv.select(i == null ? null : dv.alive()[i], true); };
  // send alone the first hero (but `skip`) who has a way to (x, y); returns them
  L.aloneTo = (x, y, skip = []) => {
    const dv = S().dv;
    for (const m of dv.alive()) {
      if (skip.includes(m)) continue;
      dv.select(m, true);
      if (L.path(x, y)) return m;
    }
    return null;
  };
});

