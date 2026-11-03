// The Story step: chapters, the quests in them, the people they need, and the
// keys and gates between them, laid out so the designer can see the shape of
// the adventure and what is missing.
//
// [shell] A first version (the quest list and form); the Story stream replaces it.
import { QuestEditor } from './quests.js';

export class StoryEditor {
  constructor(ed, left, main) {
    this.ed = ed; this.left = left; this.main = main;
    this.quests = new QuestEditor(ed, left, main);
  }

  // open a quest in its form
  selectQuest(q) { this.quests.select(q); }

  // open a chapter (by id)
  selectChapter(id) { void id; this.render(); }

  render() { this.quests.render(); }
}
