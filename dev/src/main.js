// Realms Construction Set — app shell: title screen, play mode, construction set.
import { View } from './render/view.js';
import { h, clear, modal, toast, confirmDialog, closeAllModals } from './ui/dom.js';
import { PlayUI } from './ui/play.js';
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
    const el = h('div.title-screen',
      h('div.title-card',
        h('div.logo', h('span.l1', 'Realms'), h('span.l2', 'Construction Set')),
        h('p.tagline', 'Forge your own legend in the style of the classic tile-based role-playing games — then share it with your friends.'),
        this.embedded ? h('div.embedded-title', h('b', this.embedded.meta.title), this.embedded.meta.author ? h('span', ' by ' + this.embedded.meta.author) : null) : null,
        h('div.title-menu',
          this.continueButton(),
          h('button.primary.big', { onclick: () => { sfx('click'); this.embedded ? this.adventureMenu(this.embedded) : this.pickAdventure(); } }, '▶  Play an Adventure'),
          h('button.big', { onclick: () => { sfx('click'); this.pickProject(); } }, '⚒  Construction Set'),
          h('button', { onclick: () => this.importFile('play') }, '⤓  Load a game file to play'),
          h('button', { onclick: () => this.about() }, 'About'),
        ),
      ),
      h('div.title-foot', 'Runs entirely in your browser · Saves to browser storage · Share games as files'),
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
    return h('button.big', { onclick: () => { sfx('click'); this.playGame(game, { state: saved }); } },
      '⟳  Continue', h('small.cont-sub', ` ${game.meta.title} — ${saved.party.members[0]?.name || ''}'s company`));
  }

  about() {
    modal(h('div.help',
      h('p', 'Realms Construction Set lets you build and play top-down fantasy role-playing adventures in the spirit of the early Ultima games: a party of up to six heroes, a sprawling overworld, towns full of folk to question, dark dungeons and tactical battles.'),
      h('p', 'Use the Construction Set to paint continents, raise mountains, found towns and castles, people them with characters who answer to keywords, and tune the races, classes, items, spells, magic systems and monsters.'),
      h('p', 'Everything lives in your browser. Export your game to a .json file to back it up or share it, or export a single self-contained .html file your friends can simply open and play.'),
    ), { title: 'About', cls: 'wide' });
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
    const m = modal(body, { title: 'Choose an Adventure', cls: 'wide' });
    for (const a of this.allAdventures()) {
      const title = a.game ? a.game.meta.title : a.title;
      const desc = a.game ? a.game.meta.description : `Your creation · last edited ${new Date(a.modified).toLocaleDateString()}`;
      body.appendChild(h('div.adv-row',
        h('div.adv-info', h('b', title), h('p', desc || '')),
        h('button.primary', {
          onclick: () => {
            const g = a.game || loadProject(a.id);
            if (!g) { toast('Could not load that game.', 'bad'); return; }
            m.close();
            this.adventureMenu(g);
          },
        }, 'Play')));
    }
    body.appendChild(h('p.hint', 'Adventures you build in the Construction Set appear here too.'));
  }

  adventureMenu(game) {
    const saved = loadState(game.id);
    const body = h('div',
      h('p', game.meta.description || ''),
      saved ? h('p.hint', `Saved game: ${saved.party.members.map((x) => x.name).join(', ')} — turn ${saved.turn}`) : null,
    );
    modal(body, {
      title: game.meta.title,
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
    modal(body, { title: game.meta.title, cls: 'wide intro-modal', closeOnBack: false, buttons: [{ label: 'Begin', primary: true }], onClose: next });
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
    await session.enterMap(state.pos.map, state.pos.x, state.pos.y, { quiet: true });
    if (this.session !== session) return; // quit (or reloaded) while the map was fading in
    session.log(`Welcome to ${game.meta.title}. Press ? for help.`, 'place');
    session.log(`You stand in ${session.map.name}.`);
    if (!opts.noSave && !opts.state) session.autosave();
  }

  continueGame() {
    const game = this.playing;
    const saved = loadState(game.id);
    this.stopSession();
    if (saved) this.playGame(game, { ...this.playOpts, state: saved });
  }

  stopSession() {
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
    const m = modal(body, { title: 'Construction Set', cls: 'wide' });
    const row = (title, desc, ...btns) => h('div.adv-row', h('div.adv-info', h('b', title), desc ? h('p', desc) : null), ...btns);
    body.append(
      h('div.sub', 'Start something new'),
      row('New realm', 'A freshly generated continent, ready for towns and dungeons.',
        h('button.primary', { onclick: () => { m.close(); this.newProject(false); } }, 'Create')),
      row('Empty realm', 'A lonely island in an endless sea. Build everything yourself.',
        h('button', { onclick: () => { m.close(); this.newProject(true); } }, 'Create')),
      row('Remix the sample adventure', `“${this.sample.meta.title}” — see how it was made, then change anything.`,
        h('button', { onclick: () => { m.close(); const g = cloneGame(this.sample); g.id = uid('game'); g.meta.title += ' (remix)'; this.openEditor(g); } }, 'Open copy')),
      row('Open a game file', 'Import a .json game shared by a friend.',
        h('button', { onclick: () => { m.close(); this.importFile('edit'); } }, 'Import…')),
    );
    const projects = listProjects();
    if (projects.length) body.appendChild(h('div.sub', 'Your realms (saved in this browser)'));
    for (const p of projects) {
      body.appendChild(row(p.title, `Last edited ${new Date(p.modified).toLocaleString()} · ${(p.size / 1024).toFixed(0)} KB`,
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
