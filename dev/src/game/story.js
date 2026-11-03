// The story outline: chapters that group the quests of a realm.
//
//   game.story = { chapters: [{ id, name, summary, notes, cast: [{ npc, note }],
//                               ends: { type: 'quests' | 'stage' | 'flag', quest, stage, flag } }] }
//   quest.chapter = chapter id (quests without one belong to no chapter and
//                   are open at any time)
//
// [shell] Interfaces fixed by the editor shell; the Story stream fills them in
// (chapter gating of quests, chapter banners in play, the journal).

export function chapterList(game) { return game.story?.chapters || []; }

export function chapterById(game, id) { return chapterList(game).find((c) => c.id === id) || null; }

// The chapter a quest belongs to, or null
export function chapterOfQuest(game, q) { return q?.chapter ? chapterById(game, q.chapter) : null; }

// The quests of a chapter, in the order they appear in game.quests
export function questsOfChapter(game, ch) { return (game.quests || []).filter((q) => q.chapter === ch.id); }
