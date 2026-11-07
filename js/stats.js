/* ==========================================================================
   NoteFlow — stats.js
   Real statistics computed from stored notes, folders, quests, and XP.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = NoteFlow.Utils;
  const Notes = NoteFlow.Notes;
  const Gamification = NoteFlow.Gamification;

  function dayKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDays(date, amount) {
    const d = new Date(date);
    d.setDate(d.getDate() + amount);
    return d;
  }

  function buildWeeklyActivity(notes) {
    const days = [];
    const counts = new Map();
    for (let i = 6; i >= 0; i -= 1) {
      const date = addDays(new Date(), -i);
      const key = dayKey(date);
      days.push({
        key,
        label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
        count: 0,
      });
      counts.set(key, 0);
    }

    notes.forEach((note) => {
      const key = dayKey(note.updatedAt);
      if (key && counts.has(key)) counts.set(key, counts.get(key) + 1);
    });

    days.forEach((day) => {
      day.count = counts.get(day.key) || 0;
    });
    const max = Math.max(1, ...days.map((day) => day.count));
    days.forEach((day) => {
      day.height = Math.round((day.count / max) * 100);
    });
    return days;
  }

  function compute() {
    const allNotes = Notes.all();
    const active = allNotes.filter((note) => !note.deletedAt && !note.archivedAt);
    const archived = allNotes.filter((note) => note.archivedAt && !note.deletedAt);
    const trashed = allNotes.filter((note) => note.deletedAt);
    const today = dayKey(new Date());
    const notesToday = active.filter((note) => dayKey(note.createdAt) === today || dayKey(note.updatedAt) === today);
    const wordsToday = notesToday.reduce((sum, note) => sum + Utils.wordCount(note.content), 0);
    const totalWords = active.reduce((sum, note) => sum + Utils.wordCount(note.content), 0);
    const gamification = Gamification ? Gamification.getState() : null;

    return {
      totalNotes: active.length,
      totalWords,
      totalFolders: Notes.getCategories().length,
      pinnedNotes: active.filter((note) => note.pinned).length,
      archivedNotes: archived.length,
      trashedNotes: trashed.length,
      completedQuests: gamification ? gamification.historyCount : 0,
      totalXp: gamification ? gamification.xp : 0,
      currentLevel: gamification ? gamification.level : 1,
      currentRank: gamification ? `${gamification.rank} Rank` : 'E Rank',
      rankName: gamification ? gamification.rankName : 'Beginner',
      streak: gamification ? gamification.streak : 0,
      dailyProductivity: {
        notesTouched: notesToday.length,
        wordsWritten: wordsToday,
        questsDoneToday: gamification ? gamification.questsDone : 0,
        xpToday: gamification ? gamification.xpToday : 0,
      },
      weeklyActivity: buildWeeklyActivity(active),
    };
  }

  NoteFlow.Stats = { compute };
})(window.NoteFlow = window.NoteFlow || {});
