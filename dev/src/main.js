// Realms Construction Set — app shell: title screen, play mode, construction set.
import { View } from './render/view.js';
import { h, clear, modal, toast, confirmDialog, closeAllModals, initTooltips } from './ui/dom.js';
import { iconSvg } from './ui/icons.js';
import { loadFonts } from './ui/fonts.js';
import { terrain } from './data/terrain.js';
import { PlayUI } from './ui/play.js';
import { showHowTo } from './ui/help.js';
import { partyCreation, quickParty } from './ui/partyCreate.js';
import { PlaySession, newPlayState } from './game/session.js';
import { newGame, deserializeGame, serializeGame, cloneGame, getMap } from './data/schema.js';
import { listProjects, loadProject, saveProject, deleteProject, loadState, deleteState, getPref, setPref } from './core/storage.js';
import { pickFile, downloadText, slugify, uid } from './core/util.js';
import { buildSampleGame, SAMPLE_ID } from './data/sample.js';
import { Editor } from './ui/editor/editor.js';
import { sfx } from './core/sound.js';
import { playMusic, stopMusic } from './core/music.js';

class App {
  constructor() {
    this.view = new View(document.getElementById('viewport'));
    this.ui = document.getElementById('ui');
    this.fadeEl = document.getElementById('fade');
    this.session = null;
    this.playUI = null;
    this.editor = null;
    this.embedded = readEmbedded();
    this._sample = null;
    window.__app = this;
    loadFonts();
    initTooltips();
    this.showTitle();
  }

  get sample() {
    if (!this._sample) this._sample = buildSampleGame();
    return this._sample;
  }

  // 'full' (title, party creation), 'play' (framed map with docked panels) or 'editor'
  setLayout(name) {
    const root = document.getElementById('app');
    if (root.dataset.layout === name) return;
    root.dataset.layout = name;
    this.view.resize();
  }

  fade(on, ms = 350) {
    const el = this.fadeEl;
    el.style.transitionDuration = ms + 'ms';
    el.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  }

  clearScreen() {
    closeAllModals();
    if (this.titleEl) { this.titleEl.remove(); this.titleEl = null; }
    this.view.onTick = null;
    this.view.clearEntities();
    this.view.clearFx();
  }

  // ------------------------------------------------------------ title
  showTitle() {
    this.stopSession();
    this.clearScreen();
    this.setLayout('full');
    if (this.editor) { this.editor.destroy(); this.editor = null; }
    const g = this.embedded || this.sample;
    // a slow flyover of the world behind the title
    const world = g.maps.find((m) => m.type === 'world') || g.maps[0];
    this.view.setMap(world);
    this.view.setVisibilityEnabled(false);
    this.view.setPitch(44);
    this.view.setZoom(19, true);
    const s = g.settings.start;
    let t = 0;
    const cx = s.x, cy = s.y;
    this.view.focus(cx, cy, true);
    this.view.onTick = (dt) => {
      t += dt * 0.05;
      this.view.focus(cx + Math.sin(t) * 14, cy + Math.cos(t * 0.8) * 9);
    };
    playMusic('title');
    // the featured adventure: the embedded game in a shared file, else the sample
    const feat = g;
    const featSaved = loadState(feat.id);
    const ico = (name) => h('span.tb-ico', { html: iconSvg(name) });
    const tbtn = (cls, icon, label, sub, onclick, title) => h('button.tbtn' + cls, { onclick: () => { sfx('click'); onclick(); }, title },
      ico(icon), h('span.tb-text', h('span.tb-label', label), sub ? h('small.tb-sub', sub) : null));
    const el = h('div.title-screen',
      h('div.title-vignette'),
      h('div.title-frame'),
      h('div.title-card',
        h('div.logo',
          h('span.l0', { html: iconSvg('castle') }),
          h('span.l1', 'Realms'),
          h('span.l2', 'Construction Set'),
          h('span.logo-rule')),
        h('p.tagline', 'Gather a company of heroes, roam a living world and fight tactical battles — or forge your own realm and share it with friends.'),
        h('div.title-menu',
          this.continueButton(),
          tbtn('.primary.cta', 'play', `Play ${feat.meta.title}`,
            featSaved ? 'Start over, or carry on from your save' : this.embedded ? (feat.meta.author ? `An adventure by ${feat.meta.author}` : 'Begin the adventure') : 'The ready-made adventure — start here',
            () => (featSaved ? this.adventureMenu(feat) : this.playGame(feat, {}))),
          h('div.title-row',
            tbtn('', 'book', 'Play an Adventure', 'Choose any realm', () => this.pickAdventure(), 'Choose any adventure saved in this browser'),
            tbtn('', 'anvil', 'Construction Set', 'Build your own', () => this.pickProject(), 'Paint lands, found towns, write quests')),
          h('div.title-row.small',
            tbtn('', 'upload', 'Load a game file', null, () => this.importFile('play'), 'Play a .json game file a friend sent you'),
            tbtn('', 'quill', 'About', null, () => this.about())),
        ),
      ),
      h('div.title-foot', h('span', { html: iconSvg('sparkle') }), ' Runs entirely in your browser · Saves to browser storage · Share games as files'),
    );
    this.ui.appendChild(el);
    this.titleEl = el;
  }

  continueButton() {
    const id = getPref('lastPlayed', null);
    if (!id) return null;
    const saved = loadState(id);
    if (!saved) return null;
    const game = this.embedded?.id === id ? this.embedded : id === SAMPLE_ID ? this.sample : loadProject(id);
    if (!game) return null;
    const lead = saved.party.members.find((m) => m.status !== 'dead') || saved.party.members[0];
    // the company's level is its best hero's (a fallen leader may lag behind)
    const lv = Math.max(...saved.party.members.map((m) => m.level || 1));
    return h('button.tbtn.cont', { onclick: () => { sfx('click'); this.playGame(game, { state: saved }); } },
      h('span.tb-ico', { html: iconSvg('end') }),
      h('span.tb-text', h('span.tb-label', 'Continue'),
        h('small.tb-sub.cont-sub', `${game.meta.title} — ${lead?.name || ''}'s company${lead ? `, level ${lv}` : ''}`)));
  }

  about() {
    modal(h('div.help.about',
      h('p', 'Realms Construction Set lets you build and play top-down fantasy role-playing adventures in the spirit of the early Ultima games: a party of up to six heroes, a sprawling overworld, towns full of folk to question, dark dungeons and tactical battles.'),
      h('p', 'Use the Construction Set to paint continents, raise mountains, found towns and castles, people them with characters who answer to keywords, and tune the races, classes, items, spells, magic systems and monsters.'),
      h('p', 'Everything lives in your browser. Export your game to a .json file to back it up or share it, or export a single self-contained .html file your friends can simply open and play.'),
      h('p.hint', 'Display type: Cinzel and Alegreya, under the SIL Open Font License.'),
    ), { title: 'About', icon: 'quill', cls: 'wide' });
  }

  // a tiny painted map of an adventure's world, for the picker
  worldThumb(game) {
    const map = game.maps.find((m) => m.type === 'world') || game.maps[0];
    const c = h('canvas.adv-thumb', { width: map?.w || 1, height: map?.h || 1 });
    if (!map) return c;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(map.w, map.h);
    for (let i = 0; i < map.w * map.h; i++) {
      const col = terrain(map.tiles[i]).top;
      img.data[i * 4] = (col >> 16) & 255; img.data[i * 4 + 1] = (col >> 8) & 255; img.data[i * 4 + 2] = col & 255; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  allAdventures() {
    const list = [];
    if (this.embedded) list.push({ game: this.embedded, builtin: true });
    list.push({ game: this.sample, builtin: true });
    for (const p of listProjects()) {
      if (p.id === SAMPLE_ID || (this.embedded && p.id === this.embedded.id)) continue;
      list.push({ id: p.id, title: p.title, modified: p.modified });
    }
    return list;
  }

  pickAdventure() {
    const body = h('div.adv-list');
    const m = modal(body, { title: 'Choose an Adventure', icon: 'book', sub: 'Every adventure in this browser — the ready-made one, and the realms you build', cls: 'wide adv-modal' });
    for (const a of this.allAdventures()) {
      const g = a.game;
      const title = g ? g.meta.title : a.title;
      const desc = g ? g.meta.description : `Your own creation · last edited ${new Date(a.modified).toLocaleDateString()}`;
      const saved = loadState(g ? g.id : a.id);
      const meta = g ? [
        `${g.maps.length} map${g.maps.length === 1 ? '' : 's'}`,
        g.quests?.length ? `${g.quests.length} quest${g.quests.length === 1 ? '' : 's'}` : null,
        g.meta.author ? `by ${g.meta.author}` : null,
      ].filter(Boolean) : [];
      body.appendChild(h('div.adv-row' + (a.builtin ? '.featured' : ''),
        h('div.adv-pic', g ? this.worldThumb(g) : h('span.adv-crest', { html: iconSvg('castle') })),
        h('div.adv-info',
          h('b', title),
          h('p', desc || ''),
          h('div.adv-meta',
            a.builtin ? h('span.adv-tag.gold', g === this.embedded ? 'Shared with you' : 'Ready to play') : h('span.adv-tag', 'Your realm'),
            ...meta.map((x) => h('span.adv-tag', x)),
            saved ? h('span.adv-tag.saved', { html: iconSvg('save') }, ` Saved: ${saved.party.members[0]?.name || 'a company'}`) : null)),
        h('button.primary', {
          onclick: () => {
            const gg = a.game || loadProject(a.id);
            if (!gg) { toast('Could not load that game.', 'bad'); return; }
            m.close();
            this.adventureMenu(gg);
          },
        }, 'Play')));
    }
    body.appendChild(h('p.hint', 'Adventures you build in the Construction Set appear here too. Friends can send you a game file: use “Load a game file” on the title screen.'));
  }

  adventureMenu(game) {
    const saved = loadState(game.id);
    const lead = saved?.party.members[0];
    const body = h('div.adv-menu',
      h('div.adv-banner', this.worldThumb(game)),
      h('p.adv-desc', game.meta.description || ''),
      saved ? h('div.adv-save',
        h('span.as-ico', { html: iconSvg('save') }),
        h('div', h('b', 'Saved game'), h('span', `${saved.party.members.map((x) => x.name).join(', ')}${lead ? ` · level ${lead.level}` : ''} · turn ${saved.turn}`)))
        : h('p.hint', 'You will gather a company of heroes, then set out. Your progress saves itself as you go.'),
    );
    modal(body, {
      title: game.meta.title,
      icon: 'castle',
      cls: 'adv-menu-modal',
      buttons: [
        { label: 'Cancel' },
        saved ? { label: 'Continue', primary: true, onClick: () => this.playGame(game, { state: saved }) } : null,
        {
          label: 'New Game', primary: !saved, onClick: async () => {
            if (saved && !(await confirmDialog('Starting anew will overwrite your saved game for this adventure.'))) return;
            this.playGame(game, {});
          },
        },
      ].filter(Boolean),
    });
  }

  // ------------------------------------------------------------ play
  async playGame(game, opts = {}) {
    this.clearScreen();
    if (this.editor) this.editor.hide();
    this.playOpts = opts;
    this.playing = game;
    if (!opts.noSave) setPref('lastPlayed', game.id);
    this.view.setPitch(game.settings.pitch || 52);
    playMusic('title');
    if (opts.state) return this.startSession(game, opts.state, opts);
    if (opts.quick) {
      const state = newPlayState(game, quickParty(game));
      if (opts.start) state.pos = { ...opts.start };
      return this.startSession(game, state, opts);
    }
    this.setLayout('full');
    partyCreation(this, game, {
      onBack: () => { if (opts.fromEditor) this.endPlay(true); else this.showTitle(); },
      onDone: (members) => {
        const state = newPlayState(game, members);
        if (opts.start) state.pos = { ...opts.start };
        this.showIntro(game, () => this.startSession(game, state, opts));
      },
    });
  }

  showIntro(game, next) {
    const text = (game.meta.intro || '').trim();
    if (!text) return next();
    const body = h('div.intro', ...text.split(/\n+/).map((p) => h('p', p)));
    modal(body, { title: game.meta.title, cls: 'wide intro-modal', closeOnBack: false, closeX: false, buttons: [{ label: 'Begin', primary: true }], onClose: next });
  }

  async startSession(game, state, opts) {
    const session = new PlaySession(this, game, state, opts);
    this.session = session;
    this.playUI = new PlayUI(this, session);
    const p = state.pos;
    if (!getMap(game, p.map)) {
      const s = game.settings.start;
      state.pos = { ...s };
    }
    // greet first, so the opening quest is announced after the welcome
    session.log(`Welcome to ${game.meta.title}. Press ? for help.`, 'place');
    session.log(`You stand in ${getMap(game, state.pos.map)?.name || 'the wilds'}.`);
    await session.enterMap(state.pos.map, state.pos.x, state.pos.y, { quiet: true });
    if (this.session !== session) return; // quit (or reloaded) while the map was fading in
    if (!opts.noSave && !opts.state) session.autosave();
    // newcomers get a short how-to-play card over the map (once)
    if (!opts.quick && !opts.fromEditor) showHowTo(this.playUI);
  }

  continueGame() {
    const game = this.playing;
    const saved = loadState(game.id);
    this.stopSession();
    if (saved) this.playGame(game, { ...this.playOpts, state: saved });
  }

  stopSession() {
    this.session?.battle?.abort();
    if (this.playUI) { this.playUI.destroy(); this.playUI = null; }
    this.session = null;
  }

  endPlay(toEditor) {
    if (this.session && !this.session.opts.noSave && this.session.mode === 'explore') this.session.autosave();
    this.stopSession();
    this.clearScreen();
    if (toEditor && this.editor) { stopMusic(); this.editor.show(); }
    else this.showTitle();
  }

  // ------------------------------------------------------------ construction set
  pickProject() {
    const body = h('div.adv-list');
    const m = modal(body, { title: 'Construction Set', icon: 'anvil', sub: 'Build a realm of your own: lands, towns, people, quests and monsters', cls: 'wide adv-modal' });
    const row = (icon, title, desc, ...btns) => h('div.adv-row.compact', h('div.adv-pic.small', h('span.adv-crest', { html: iconSvg(icon) })), h('div.adv-info', h('b', title), desc ? h('p', desc) : null), ...btns);
    body.append(
      h('div.sub', 'Start something new'),
      row('map', 'New realm', 'A freshly generated continent, ready for towns and dungeons.',
        h('button.primary', { onclick: () => { m.close(); this.newProject(false); } }, 'Create')),
      row('compass', 'Empty realm', 'A lonely island in an endless sea. Build everything yourself.',
        h('button', { onclick: () => { m.close(); this.newProject(true); } }, 'Create')),
      row('quill', 'Remix the sample adventure', `“${this.sample.meta.title}” — see how it was made, then change anything.`,
        h('button', { onclick: () => { m.close(); const g = cloneGame(this.sample); g.id = uid('game'); g.meta.title += ' (remix)'; this.openEditor(g); } }, 'Open copy')),
      row('upload', 'Open a game file', 'Import a .json game shared by a friend.',
        h('button', { onclick: () => { m.close(); this.importFile('edit'); } }, 'Import…')),
    );
    const projects = listProjects();
    if (projects.length) body.appendChild(h('div.sub', 'Your realms (saved in this browser)'));
    for (const p of projects) {
      body.appendChild(row('castle', p.title, `Last edited ${new Date(p.modified).toLocaleString()} · ${(p.size / 1024).toFixed(0)} KB`,
        h('button.primary', { onclick: () => { const g = loadProject(p.id); if (!g) return toast('Could not load.', 'bad'); m.close(); this.openEditor(g); } }, 'Edit'),
        h('button.danger', {
          onclick: async () => {
            if (!(await confirmDialog(`Delete “${p.title}” from this browser? Export it first if you want to keep it.`))) return;
            deleteProject(p.id);
            m.close();
            this.pickProject();
          },
        }, 'Delete')));
    }
  }

  newProject(blank) {
    const g = newGame({ blank });
    this.openEditor(g);
  }

  openEditor(game) {
    stopMusic();
    this.stopSession();
    this.clearScreen();
    if (this.editor) this.editor.destroy();
    this.editor = new Editor(this, game);
  }

  async importFile(mode) {
    const f = await pickFile('.json,.rpg,application/json');
    if (!f) return;
    let game;
    try {
      game = deserializeGame(f.text);
    } catch (e) {
      toast('Could not read that file: ' + e.message, 'bad');
      return;
    }
    if (mode === 'play') {
      try { saveProject(game); } catch { /* storage full: still playable */ }
      this.adventureMenu(game);
    } else {
      this.openEditor(game);
      toast(`Imported “${game.meta.title}”.`);
    }
  }

  // Export a self-contained HTML file that boots straight into this game
  exportStandalone(game) {
    const css = document.getElementById('app-style')?.textContent || '';
    const js = document.getElementById('app-bundle')?.textContent || '';
    if (!js) { toast('Standalone export is only available from the built index.html.', 'bad'); return; }
    const data = serializeGame(game).replace(/</g, '\\u003c');
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(game.meta.title)}</title>
<style id="app-style">${css}</style>
</head>
<body>
<div id="app"><div id="viewport"></div><div id="ui"></div><div id="fade"></div></div>
<script id="embedded-game" type="application/json">${data}<\/script>
<script id="app-bundle">${js.replace(/<\/script/gi, '<\\/script')}<\/script>
</body>
</html>`;
    downloadText(slugify(game.meta.title) + '.html', html, 'text/html');
  }
}

function escapeAttr(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function readEmbedded() {
  const el = document.getElementById('embedded-game');
  if (!el) return null;
  try { return deserializeGame(el.textContent); } catch (e) { console.error(e); return null; }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => new App());
else new App();
