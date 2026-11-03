// Story building blocks for designers: beats (a fetch, a slaying, a key and
// its gate, a companion who must come along...) that write real quests,
// people and items into a realm, and premises that sketch a whole adventure
// of chapters from them.
//
// [shell] Interfaces fixed by the editor shell; the Story stream fills them in.

// Premises the Quick Start offers: { id: { label, desc, needs } } where needs
// lists the kinds of place (FEATURE_KINDS keys) the story wants to exist;
// the Quick Start ticks them for the designer.
export const PREMISES = {
  darklord: { label: 'The Dark Lord', desc: 'A tyrant in a fortress; a key to his gate; allies to win.', needs: ['fortress'] },
  blank: { label: 'No story yet', desc: 'Just the land and its places: write the story yourself.', needs: [] },
};

// Sketch a story onto a realm that already has its places: chapters with
// their quests, the people who give them and the items they need.
// opt: { premise, chapters: n, seed }. Returns { chapters: [], quests: [], notes: [] }
export function generateStory(game, opt = {}) {
  void game; void opt;
  return { chapters: [], quests: [], notes: [] };
}
