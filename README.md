# Realms Construction Set

A tool for making (and playing!) RPGs in the style of the early Ultima games — in 3D, right in your browser.

**Just open `index.html`.** Everything — the 3D engine, the game, the construction set and a sample adventure — is in that one file. No install, no server, works offline.

## What's inside

### Play
- **A lit 3D diorama**: a perspective camera at about 52° (adjustable), real shadows, painted terrain, layered forests, sculpted mountains and animated water. Walls, trees and roofs fade away around the company so it is never hidden. Unexplored land is blank parchment.
- **Heroic stylised characters**: Humans, Dwarves and Elves as Warrior, Ranger, Wizard, Cleric, Burglar, Paladin, Minstrel and Runesmith, each readable at a glance by silhouette and colour, with painted faces. Roll a random company or shape each hero's look.
- **The company is always on the map as a group**, the leader in front. A portrait card per hero; click one for their sheet. Rest heroes at an inn to rotate the company (up to six), and call them back later; some people offer to join once you have helped them.
- **Towns you walk through**: buildings with roofs that lift as you enter, shop signs, furnished rooms. Click a person to talk, or a building to visit its keeper. "!" and "?" mark people with tasks. Towns are entered and left on the side you come and go.
- **Quests and a journal**, with a tracker that always says where to go next. Points of interest to find: shrines, wells, campfires, lore stones, a fighting pit, a fortune-teller, a fairy ring, a lighthouse. **Treasure maps** with clues lead to buried hoards.
- **Travel that matters**: roads are quick, sand and swamp slow (elves ease the woods, dwarves the hills); a clock shows how long things take; food, day and night. Monsters guard their ground and give up the chase. Buy a ship at the Gullhaven shipyard to reach islands and a smugglers' cove.
- **Tactical battles**: initiative order with a portrait strip, an action bar that says why an action is unavailable, hit chances and damage previews, class skills with cooldowns (more unlock as heroes level), flanking, cover and conditions, monsters with distinct behaviour and bosses with a second phase. A victory screen with experience and loot; each level offers a choice of three talents, and attributes grow by themselves.
- **Five schools of magic**, each with its own look and resource: *Sorcery* (a wizard's spellbook; copy spell scrolls into it), *Prayer* (Faith), *Elven Song* (Voice), *Rune-craft* (reagents) and *Herb-lore* (rangers' remedies, from herbs gathered on the road). Reagents say who in the company can use them.
- **Sample adventure — *Shadow over Eldmark***: recover the stolen Rune-Key and break the Shadow Lord in Dol Garoth, with side quests, hidden places and treasure along the way.

### Construct
The Construction Set walks you through building a realm in six steps. None of them waits on another — jump between them whenever you like — and the number on each step counts what the checklist still finds there.

1. **Campaign** — the title, opening story and how the game is won; the road through the steps with where each stands; the world at a glance. **✦ Quick Start** lays down a core campaign in one go: a world of the size and shape you choose (one great land, many islands, two lands, a coast), its towns, villages, castles, dungeons and special places joined by roads, and chapters of a story from a premise. It can also add to a realm already under way.
2. **Land** — broad strokes on the world map: paint regions of forest, hills, mountains, desert, swamp or snow in smooth strokes of any size; raise land or sink it into the sea; drag out rivers, roads (auto-bridging) and ridges; found places, let it **find spots** suited to each kind (harbours on the coast, dwarf holds by the mountains, the dark fortress far away), and **join them with roads**. Resize the world or generate it afresh in a chosen shape.
3. **Places** — design each town, castle and dungeon from a plan: the key buildings and how many of each (“an inn, an armourer and two homes”), townsfolk, guards, walls and gates; a dungeon's rooms, monsters, boss, hoard and curiosities. **Rebuild** lays it out afresh beside the form — the people you have written keep their words and move into the new buildings, and anyone left without one is reported. Places made before plans get one guessed from what is there.
4. **Story** — chapters, each with a goal, the quests that reach it and the people it needs. Quests are laid out step by step — who to see and where, what to find, which key opens which gate — with a warning wherever a player would be stuck. Story beats (a fetch, a slaying, a key and its gate, a companion who must come along) write the quests, people and items for you to adjust. In play, chapters open one after another with a banner, and the journal groups quests by chapter.
5. **Details** — tile by tile: brush, scatter, line, rectangle, flood fill and picker across ~70 tile types; buildings and rooms; people (with a conversation editor: keywords, conditions, actions, story flags), monsters, chests, signs, ships, waygates, passages and points of interest.
6. **Test** — the **checklist** looks the whole realm over: places no one can reach, keys nothing gives, foes never placed, quests nobody offers, towns without a healer, people who still say nothing of their own. **Go** jumps to each one; **Ignore** keeps what you mean to leave. **Playtest** from the beginning, from any chapter (the earlier ones counted as done) or from wherever you were looking; in play the 🛠 **Tools** jump anywhere, hand out gold, items and levels, and **Edit here** brings you back to that very square. The step also shows what your playtests have seen: places visited, quests finished, chapters reached.

Beside the steps: **World Data** (races, classes, items, spells, monsters and the magic systems) and **Rules** (party size, food, line of sight, encounters, day and night, loot, magic schools, starting kit). **Ctrl+K** finds anything — a person, a place, a quest — and takes you there. Undo/redo covers everything from a brush stroke to a whole Quick Start, and the realm saves itself to browser storage as you work.

### Share
- **File → Export game file (.json)** to back up or send a game; **Import** to load one.
- **File → Export playable web page (.html)** produces a single file with your game baked in — friends just open it and play.

## Controls

| Exploring | | Battle | |
|---|---|---|---|
| Arrows / WASD / click | Move (click people and buildings to visit) | Arrows / click | Move, bump to strike |
| T | Talk | F | Attack / shoot a target |
| L | Look | Click a red foe | Attack it |
| J | Journal | 1, 2 / Q | Class skills / special |
| E | Do what is nearby | G | Guard |
| C | Cast | C | Cast |
| U | Use item | U | Use item |
| I | Pack & equipment | Space | End the hero's turn |
| H | Hole up (camp) | Walk off the edge | Flee |
| M | Map | Tab / Enter | Next target / confirm |
| Ctrl/⌘+S | Save | Esc | Menu |

Click a hero in the Company panel to pop out their sheet and change their gear; the first hero leads the company.

On a trackpad, pinch to zoom and slide two fingers to look around (in play, a little way from the company). In the construction set: two-finger slide, right-drag or WASD to pan, pinch or mouse wheel to zoom, Ctrl+Z / Ctrl+Y to undo/redo, Ctrl+K to find anything. Press **?** in the editor for help with the step you are on.

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
    game/              rules, exploration session, combat, quests, events, magic, travel, treasure, dialogue
    ui/                play HUD, battle HUD, journal, spellbook, party creation, editor
  tests/               Playwright scripts that drive the built page and take screenshots
```

The tests need Playwright with Chromium; screenshots land in `dev/tests/out/`.

Saved games and projects live in your browser's local storage, so export anything you want to keep.
