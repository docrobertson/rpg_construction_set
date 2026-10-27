# Realms Construction Set

A tool for making (and playing!) RPGs in the style of the early Ultima games — in 3D, right in your browser.

**Just open `index.html`.** Everything — the 3D engine, the game, the construction set and a sample adventure — is in that one file. No install, no server, works offline.

## What's inside

### Play
- **A fixed, high-angle 3D "game board" view** (about 70°; adjustable), framed by docked panels: the company and a character sheet on the right, a scrolling log, commands and minimap below. Smooth rolling terrain, depth-shaded water and rounded, Warcraft-flavoured figures, leaned toward the camera so people read clearly from above.
- **Party of up to six** — Men, Dwarves and Elves; Warrior, Ranger, Wizard, Cleric, Burglar, Paladin, Minstrel and Runesmith. Point-buy attributes with a live 3D preview.
- **A character sheet for every hero**: attributes, armour and to-hit, and four equipment slots — hand weapon, **ranged weapon** (bows, crossbows, slings), armour and shield — changed with a click. Each level brings an attribute point to spend.
- **Three scales of map**: the broad overworld, zoomed-in settlements and dungeons, and close-up tactical battles.
- **Ultima III/IV-style mechanics**: turn-based movement, line of sight and fog of war, food, swamps that poison, dark dungeons that need torches, ships, waygates, locked doors and keys, chests and traps.
- **Keyword conversations** (`NAME`, `JOB`, and whatever people mention — highlighted words are clickable). Shops, inns, healers, rumours, and companions who will `JOIN` you.
- **Tactical combat**: each hero acts in turn, then the monsters. Melee by bumping, arrows in flight, area spells, sleep, fear, buffs, poison, fleeing off the field.
- **A special move per class, once per battle**: Whirlwind, Volley, Blink, Prayer of Mending, Shadow Strike, Rally, Dazzling Air, Earthshaker.
- **Loot**: fallen foes sometimes leave potions, weapons or armour, scaled to how tough they were.
- **Day and night** outdoors: evenings draw in, night cuts your sight and brings out more monsters.
- **Four magic systems**, each switchable on or off per game:
  - *Sorcery* (Intellect, mana) — missiles, fireballs, lightning
  - *Prayer* (Wisdom, mana) — healing, blessing, turning the undead
  - *Rune-craft* (reagents instead of mana) — dwarven runes fuelled by moonpetal, ember salt, wyrmroot…
  - *Elven Song* (Wisdom, mana) — songs that sway the whole battlefield
- **Sample adventure — *Shadow over Eldmark***: recover the stolen Rune-Key and break the Shadow Lord in Dol Garoth.

### Construct
- **Chunky placement**: click (or drag) to drop islands, lakes, forests, deep woods, hills, mountain ranges, swamps, deserts, snowfields and blighted lands. Drag out roads (auto-bridging), rivers, ridges, walls and fences.
- **Found sites**: towns, castles, villages, dungeons, towers, dark fortresses, elven halls and dwarf holds — each generated with its own map, shops and people, ready to customise.
- **Paint tools**: brush, scatter, line, rectangle, flood fill and picker, across ~70 tile types.
- **Buildings and rooms** for towns and dungeons, furnished with their keepers.
- **People, monsters, chests, signs, ships, waygates, passages** — with inspectors for everything, including a conversation editor (conditions, actions, story flags).
- **World Data editors** for races, classes, items, spells, monsters and the magic systems themselves.
- **Settings**: story text, rules (party size, food, line of sight, encounter rate, day and night, loot), victory condition, starting kit and position.
- **Undo/redo, autosave** to browser storage, and **▶ Playtest** from the start or from wherever you're looking.

### Share
- **File → Export game file (.json)** to back up or send a game; **Import** to load one.
- **File → Export playable web page (.html)** produces a single file with your game baked in — friends just open it and play.

## Controls

| Exploring | | Battle | |
|---|---|---|---|
| Arrows / WASD / click | Move | Arrows | Move, bump to strike |
| T | Talk | F | Attack / shoot a target |
| L | Look | Q | Class special (once per battle) |
| C | Cast | C | Cast |
| U | Use item | U | Use item |
| I | Pack & equipment | Space | Wait |
| H | Hole up (camp) | Walk off the edge | Flee |
| M | Map | Tab / Enter | Next target / confirm |
| Ctrl/⌘+S | Save | Esc | Menu |

Click a hero in the Company panel to see their sheet and change their gear.

In the construction set: right-drag or WASD to pan, mouse wheel (or pinch) to zoom, Ctrl+Z / Ctrl+Y to undo/redo. Press **?** in the editor for a quick-start guide.

## Developing

Players only need `index.html`. Everything else lives in `dev/`: the source code as ES modules, which is bundled (with three.js) into that single `index.html` one level up:

```sh
cd dev
npm install
npm run build        # minified ../index.html
npm run dev          # unminified, rebuilds on change
npm test             # Playwright scripts that play the built page
```

```
dev/
  build.mjs            bundles src/ into ../index.html
  src/
    main.js            app shell: title screen, play, construction set, export
    core/              rng & dice, noise, storage, sound, music, utilities
    data/              terrain types, default rules content, game schema, sample adventure
    world/             map helpers and generators (stamps, settlements, dungeons, arenas)
    render/            three.js view, chunked terrain, decorations, procedural models
    game/              rules, exploration session, combat, dialogue, line of sight, pathfinding
    ui/                play HUD, party creation, editor (tools, inspectors, data, settings)
  tests/               Playwright scripts that drive the built page and take screenshots
```

The tests need Playwright with Chromium; screenshots land in `dev/tests/out/`.

Saved games and projects live in your browser's local storage, so export anything you want to keep.
