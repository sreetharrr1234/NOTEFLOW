/* ==========================================================================
   NoteFlow — gamification.js
   Daily quests, XP, ranks, streaks, and completion history.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = NoteFlow.Utils;
  const Storage = NoteFlow.Storage;

  const RANK_LEVELS = Object.freeze([
    { rank: 'E', name: 'Beginner', minXp: 0 },
    { rank: 'D', name: 'Apprentice', minXp: 100 },
    { rank: 'C', name: 'Hunter', minXp: 250 },
    { rank: 'B', name: 'Elite', minXp: 500 },
    { rank: 'A', name: 'Master', minXp: 900 },
    { rank: 'S', name: 'Shadow Monarch', minXp: 1500 },
  ]);

  const XP = Object.freeze({
    CREATE_NOTE: 10,
    COMPLETE_QUEST: 20,
    ORGANISE_FOLDER: 15,
    ALL_QUESTS_BONUS: 50,
  });

  const DEFAULT_QUESTS = Object.freeze([
    { title: 'Capture one focused note', xp: 20 },
    { title: 'Organise one folder', xp: 15 },
    { title: 'Review your pinned notes', xp: 10 },
  ]);

  let data = null;
  let initialized = false;

  function todayKey(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDays(date, amount) {
    const d = new Date(date);
    d.setDate(d.getDate() + amount);
    return d;
  }

  function blankData() {
    return {
      version: 1,
      xpTotal: 0,
      xpToday: 0,
      lastQuestDate: null,
      streak: 0,
      bestStreak: 0,
      lastCompletedDate: null,
      quests: [],
      history: [],
      rewarded: {
        notes: {},
        folders: {},
        dailyBonuses: {},
      },
    };
  }

  function makeQuest(title, xp, source) {
    return {
      id: Utils.uid('quest'),
      title: String(title || '').trim().slice(0, 80),
      xp: Math.max(1, Math.min(100, Number(xp) || XP.COMPLETE_QUEST)),
      done: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      source: source || 'custom',
    };
  }

  function sanitizeQuests(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.reduce((result, item) => {
      if (!item || typeof item !== 'object') return result;
      let id = String(item.id || '').trim();
      if (!id || seen.has(id)) id = Utils.uid('quest');
      seen.add(id);
      const title = String(item.title || '').trim().slice(0, 80);
      if (!title) return result;
      result.push({
        id,
        title,
        xp: Math.max(1, Math.min(100, Number(item.xp) || XP.COMPLETE_QUEST)),
        done: Boolean(item.done),
        completedAt: item.completedAt || null,
        createdAt: item.createdAt || new Date().toISOString(),
        source: item.source === 'daily' ? 'daily' : 'custom',
      });
      return result;
    }, []);
  }

  function sanitizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item === 'object' && String(item.title || '').trim())
      .map((item) => ({
        id: String(item.id || Utils.uid('history')),
        title: String(item.title).trim().slice(0, 80),
        xp: Math.max(0, Math.min(100, Number(item.xp) || 0)),
        date: String(item.date || todayKey(item.completedAt || Date.now())).slice(0, 10),
        completedAt: item.completedAt || new Date().toISOString(),
      }))
      .slice(-300);
  }

  function sanitize(raw) {
    const next = blankData();
    if (!raw || typeof raw !== 'object') return next;

    next.xpTotal = Math.max(0, Math.floor(Number(raw.xpTotal) || 0));
    next.xpToday = Math.max(0, Math.floor(Number(raw.xpToday) || 0));
    next.lastQuestDate = typeof raw.lastQuestDate === 'string' ? raw.lastQuestDate.slice(0, 10) : null;
    next.streak = Math.max(0, Math.floor(Number(raw.streak) || 0));
    next.bestStreak = Math.max(next.streak, Math.floor(Number(raw.bestStreak) || 0));
    next.lastCompletedDate = typeof raw.lastCompletedDate === 'string' ? raw.lastCompletedDate.slice(0, 10) : null;
    next.quests = sanitizeQuests(raw.quests);
    next.history = sanitizeHistory(raw.history);

    const rewarded = raw.rewarded && typeof raw.rewarded === 'object' ? raw.rewarded : {};
    next.rewarded.notes = rewarded.notes && typeof rewarded.notes === 'object' ? rewarded.notes : {};
    next.rewarded.folders = rewarded.folders && typeof rewarded.folders === 'object' ? rewarded.folders : {};
    next.rewarded.dailyBonuses = rewarded.dailyBonuses && typeof rewarded.dailyBonuses === 'object' ? rewarded.dailyBonuses : {};
    return next;
  }

  function persist() {
    return Storage.saveGamification(data);
  }

  function ensureDailyQuests() {
    const today = todayKey();
    if (data.lastQuestDate === today) return false;

    const previous = data.lastQuestDate;
    const completedYesterday = previous === todayKey(addDays(new Date(), -1)) &&
      Array.isArray(data.quests) &&
      data.quests.length > 0 &&
      data.quests.every((quest) => quest.done);

    if (!completedYesterday && previous && data.lastCompletedDate !== previous) {
      // A missed day quietly breaks the streak; lifetime XP is never reset.
      if (previous !== todayKey(addDays(new Date(), -1))) {
        data.streak = 0;
      }
    }

    data.lastQuestDate = today;
    data.xpToday = 0;
    data.quests = DEFAULT_QUESTS.map((quest) => makeQuest(quest.title, quest.xp, 'daily'));
    persist();
    return true;
  }

  function init() {
    if (initialized) return data;
    data = sanitize(Storage.loadGamification());
    if (!data.lastQuestDate) {
      data.lastQuestDate = todayKey();
      data.quests = DEFAULT_QUESTS.map((quest) => makeQuest(quest.title, quest.xp, 'daily'));
      persist();
    } else {
      ensureDailyQuests();
    }
    initialized = true;
    return data;
  }

  function getLevel() {
    const xp = data ? data.xpTotal : 0;
    let current = RANK_LEVELS[0];
    let next = null;
    for (let i = 0; i < RANK_LEVELS.length; i += 1) {
      if (xp >= RANK_LEVELS[i].minXp) {
        current = RANK_LEVELS[i];
        next = RANK_LEVELS[i + 1] || null;
      }
    }
    const level = Math.floor(xp / 100) + 1;
    const into = xp - current.minXp;
    const span = next ? next.minXp - current.minXp : 0;
    return {
      level,
      rank: current.rank,
      rankName: current.name,
      xp,
      intoRank: into,
      xpToNextRank: next ? Math.max(0, next.minXp - xp) : 0,
      progress: next && span > 0 ? Math.min(1, into / span) : 1,
      nextRank: next ? next.rank : null,
    };
  }

  function summary() {
    init();
    const done = data.quests.filter((quest) => quest.done).length;
    return {
      ...getLevel(),
      xpToday: data.xpToday,
      streak: data.streak,
      bestStreak: data.bestStreak,
      questsDone: done,
      questsTotal: data.quests.length,
      historyCount: data.history.length,
    };
  }

  async function award(kind, key, xp, label) {
    init();
    const today = todayKey();
    const rewardKey = String(key || kind);
    const mapName = kind === 'note' ? 'notes' : kind === 'folder' ? 'folders' : 'dailyBonuses';
    if (data.rewarded[mapName] && data.rewarded[mapName][rewardKey]) return false;

    const amount = Math.max(1, Math.floor(Number(xp) || 0));
    data.xpTotal += amount;
    data.xpToday += amount;
    if (!data.rewarded[mapName]) data.rewarded[mapName] = {};
    data.rewarded[mapName][rewardKey] = { xp: amount, date: today, at: new Date().toISOString() };
    persist();
    if (label && typeof window !== 'undefined' && NoteFlow.Utils) {
      NoteFlow.Utils.toast(`+${amount} XP — ${label}`, 'success');
    }
    return true;
  }

  function addQuest(title, xp) {
    const clean = String(title || '').trim();
    if (!clean) return { ok: false, error: 'Give your quest a name first.' };
    if (data.quests.length >= 12) return { ok: false, error: 'You can have up to 12 active quests.' };
    const quest = makeQuest(clean, xp || XP.COMPLETE_QUEST, 'custom');
    data.quests.push(quest);
    persist();
    return { ok: true, quest };
  }

  async function completeQuest(id) {
    init();
    const quest = data.quests.find((item) => item.id === id);
    if (!quest || quest.done) return false;
    quest.done = true;
    quest.completedAt = new Date().toISOString();
    data.history.push({
      id: quest.id,
      title: quest.title,
      xp: quest.xp,
      date: todayKey(),
      completedAt: quest.completedAt,
    });
    persist();
    const before = data.xpTotal;
    await award('quest', quest.id, quest.xp, 'Quest complete');
    if (data.xpTotal === before) data.xpTotal += quest.xp, data.xpToday += quest.xp, persist();
    await checkDailyBonus();
    return true;
  }

  async function checkDailyBonus() {
    if (!data.quests.length || !data.quests.every((quest) => quest.done)) return false;
    const today = todayKey();
    if (data.rewarded.dailyBonuses[today]) return false;

    data.rewarded.dailyBonuses[today] = { xp: XP.ALL_QUESTS_BONUS, date: today, at: new Date().toISOString() };
    data.xpTotal += XP.ALL_QUESTS_BONUS;
    data.xpToday += XP.ALL_QUESTS_BONUS;

    const yesterday = todayKey(addDays(new Date(), -1));
    if (data.lastCompletedDate === yesterday) {
      data.streak += 1;
    } else if (data.lastCompletedDate !== today) {
      data.streak = 1;
    }
    data.lastCompletedDate = today;
    data.bestStreak = Math.max(data.bestStreak, data.streak);
    persist();
    if (NoteFlow.Utils) NoteFlow.Utils.toast(`+${XP.ALL_QUESTS_BONUS} XP — Daily quest complete`, 'success');
    return true;
  }

  function removeQuest(id) {
    const index = data.quests.findIndex((quest) => quest.id === id);
    if (index === -1) return false;
    data.quests.splice(index, 1);
    persist();
    return true;
  }

  function getState() {
    init();
    return {
      ...summary(),
      quests: data.quests.slice(),
      history: data.history.slice().reverse(),
    };
  }

  NoteFlow.Gamification = {
    RANKS: RANK_LEVELS,
    XP,
    init,
    getState,
    summary,
    level: getLevel,
    award,
    awardForNote: (noteId) => award('note', noteId, XP.CREATE_NOTE, 'Note created'),
    awardForFolder: (folderId) => award('folder', folderId, XP.ORGANISE_FOLDER, 'Folder organised'),
    addQuest,
    completeQuest,
    removeQuest,
    todayKey,
  };
})(window.NoteFlow = window.NoteFlow || {});
