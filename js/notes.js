/* ==========================================================================
   NoteFlow — notes.js
   The note and category data layer, including validation and backups.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = NoteFlow.Utils;
  const Storage = NoteFlow.Storage;
  const HOUR = 60 * 60 * 1000;

  const CATEGORY_COLORS = Object.freeze([
    '#3d7a68',
    '#4c6fb4',
    '#b07c39',
    '#8861a5',
    '#b25d5d',
    '#4f7d9d',
    '#8b7945',
    '#6d6ca8',
  ]);

  const DEFAULT_CATEGORIES = Object.freeze([
    { id: 'cat-personal', name: 'Personal', color: '#3d7a68' },
    { id: 'cat-work', name: 'Work', color: '#4c6fb4' },
    { id: 'cat-ideas', name: 'Ideas', color: '#b07c39' },
    { id: 'cat-learning', name: 'Learning', color: '#8861a5' },
  ]);

  let notes = [];
  let categories = [];
  let meta = {};
  let firstRun = false;

  /* ----------------------------- Validation -------------------------------- */

  function cleanId(value, prefix) {
    const id = String(value == null ? '' : value);
    return /^[a-zA-Z0-9_-]{1,90}$/.test(id) ? id : Utils.uid(prefix);
  }

  function normalizeDate(value, fallback) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function isValidColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  function normalizeColor(value, index) {
    return isValidColor(value)
      ? String(value).toLowerCase()
      : CATEGORY_COLORS[index % CATEGORY_COLORS.length];
  }

  function normalizeCategoryName(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
  }

  function sanitizeCategories(raw) {
    if (!Array.isArray(raw)) return [];

    const seenIds = new Set();
    return raw.reduce((result, item, index) => {
      if (!item || typeof item !== 'object') return result;

      const name = normalizeCategoryName(item.name);
      if (!name) return result;

      let id = cleanId(item.id, 'cat');
      if (seenIds.has(id)) id = Utils.uid('cat');
      seenIds.add(id);

      result.push({
        id,
        name,
        color: normalizeColor(item.color, index),
      });
      return result;
    }, []);
  }

  function sanitizeNotes(raw, categoryList) {
    if (!Array.isArray(raw)) return [];

    const categoryIds = new Set(categoryList.map((category) => category.id));
    const seenIds = new Set();
    const now = new Date().toISOString();

    return raw.reduce((result, item) => {
      if (!item || typeof item !== 'object') return result;

      let id = cleanId(item.id, 'note');
      if (seenIds.has(id)) id = Utils.uid('note');
      seenIds.add(id);

      const createdAt = normalizeDate(item.createdAt, now);
      const updatedAt = normalizeDate(item.updatedAt, createdAt);
      const rawCategory = item.categoryId == null ? null : String(item.categoryId);

      result.push({
        id,
        title: String(item.title == null ? '' : item.title).slice(0, 120),
        content: String(item.content == null ? '' : item.content),
        categoryId: rawCategory && categoryIds.has(rawCategory) ? rawCategory : null,
        pinned: Boolean(item.pinned),
        favorite: Boolean(item.favorite),
        archivedAt: item.archivedAt ? normalizeDate(item.archivedAt, null) : null,
        deletedAt: item.deletedAt ? normalizeDate(item.deletedAt, null) : null,
        createdAt,
        updatedAt,
      });
      return result;
    }, []);
  }

  /* -------------------------------- Seeding -------------------------------- */

  function isoAgo(milliseconds) {
    return new Date(Date.now() - milliseconds).toISOString();
  }

  function categoryIdIfExists(id) {
    return categories.some((category) => category.id === id) ? id : null;
  }

  function seedNotes() {
    notes = [
      {
        id: Utils.uid('note'),
        title: 'Welcome to NoteFlow',
        content: [
          'Welcome to your calm corner for ideas.',
          '',
          'NoteFlow is a local-first notes app. Everything you write is saved automatically in this browser — no account, no cloud, no noise.',
          '',
          'A few things to try:',
          '• Press Ctrl/Cmd + K to search everything.',
          '• Pin the notes you want within reach.',
          '• Star favorites to keep them close.',
          '• Export any note as a clean .txt file.',
          '',
          'This note is pinned, so it will always greet you first. Edit it, or delete it and make this space your own.',
        ].join('\n'),
        categoryId: categoryIdIfExists('cat-personal'),
        pinned: true,
        favorite: true,
        createdAt: isoAgo(46 * HOUR),
        updatedAt: isoAgo(0.6 * HOUR),
      },
      {
        id: Utils.uid('note'),
        title: 'The launch checklist',
        content: [
          'A short list for the final stretch.',
          '',
          '— Tighten the landing page headline',
          '— Record a 40-second product walkthrough',
          '— Proofread the onboarding emails',
          '— Invite five people to the beta',
          '— Block Friday afternoon for a proper retrospective',
          '',
          'The goal is not a perfect launch. It is a clear one.',
        ].join('\n'),
        categoryId: categoryIdIfExists('cat-work'),
        pinned: true,
        favorite: true,
        createdAt: isoAgo(30 * HOUR),
        updatedAt: isoAgo(3 * HOUR),
      },
      {
        id: Utils.uid('note'),
        title: 'Small ideas, big momentum',
        content: [
          'A running list of small experiments worth trying:',
          '',
          '1. A ten-minute walk before opening email.',
          '2. One page of notes after every customer call.',
          '3. Ship the smallest useful version on Thursday.',
          '4. Keep a “later” list so today stays focused.',
          '5. Ask: what would make this feel effortless?',
          '',
          'Momentum is usually built from tiny, repeatable choices.',
        ].join('\n'),
        categoryId: categoryIdIfExists('cat-ideas'),
        pinned: false,
        favorite: false,
        createdAt: isoAgo(72 * HOUR),
        updatedAt: isoAgo(27 * HOUR),
      },
      {
        id: Utils.uid('note'),
        title: 'Reading list for slow mornings',
        content: [
          'Books for quiet coffees and unhurried weekends.',
          '',
          '• Four Thousand Weeks — Oliver Burkeman',
          '• The Creative Act — Rick Rubin',
          '• The Art of Noticing — Rob Walker',
          '• A Field Guide to Getting Lost — Rebecca Solnit',
          '',
          'Currently reading: The Creative Act. A good reminder that attention is the real material.',
        ].join('\n'),
        categoryId: categoryIdIfExists('cat-learning'),
        pinned: false,
        favorite: false,
        createdAt: isoAgo(6 * 24 * HOUR),
        updatedAt: isoAgo(2 * 24 * HOUR),
      },
    ];
  }

  /* ------------------------------ Persistence ------------------------------ */

  function persistNotes() {
    return Storage.saveNotes(notes);
  }

  function persistCategories() {
    return Storage.saveCategories(categories);
  }

  /* --------------------------------- Init ---------------------------------- */

  function init() {
    const storedCategories = Storage.loadCategories();
    const storedNotes = Storage.loadNotes();
    meta = Storage.loadMeta();

    categories =
      storedCategories === null
        ? DEFAULT_CATEGORIES.map((category) => ({ ...category }))
        : sanitizeCategories(storedCategories);

    notes = sanitizeNotes(Array.isArray(storedNotes) ? storedNotes : [], categories);

    const shouldSeed = meta.initialized !== true && notes.length === 0;
    firstRun = shouldSeed;

    if (shouldSeed) {
      if (categories.length === 0) {
        categories = DEFAULT_CATEGORIES.map((category) => ({ ...category }));
      }
      seedNotes();
      meta.initialized = true;
      persistCategories();
      persistNotes();
      Storage.saveMeta(meta);
    } else {
      if (storedCategories === null) persistCategories();
      if (meta.initialized !== true) {
        meta.initialized = true;
        Storage.saveMeta(meta);
      }
      // If stored notes were sanitized, make sure the clean version is persisted
      // on the next mutation. No write is forced here to avoid unnecessary churn.
    }

    return { firstRun };
  }

  /* --------------------------------- Notes --------------------------------- */

  function all() {
    return notes.slice();
  }

  function get(id) {
    return notes.find((note) => note.id === id) || null;
  }

  function create(partial) {
    const now = new Date().toISOString();
    const input = partial || {};
    const requestedCategory = input.categoryId == null ? null : String(input.categoryId);

    const note = {
      id: Utils.uid('note'),
      title: String(input.title == null ? '' : input.title).slice(0, 120),
      content: String(input.content == null ? '' : input.content),
      categoryId:
        requestedCategory && categories.some((category) => category.id === requestedCategory)
          ? requestedCategory
          : null,
      pinned: Boolean(input.pinned),
      favorite: Boolean(input.favorite),
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    notes.unshift(note);
    persistNotes();
    return note;
  }

  function update(id, patch) {
    const note = get(id);
    if (!note) return null;

    const changes = patch || {};

    if (Object.prototype.hasOwnProperty.call(changes, 'title')) {
      note.title = String(changes.title == null ? '' : changes.title).slice(0, 120);
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'content')) {
      note.content = String(changes.content == null ? '' : changes.content);
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'categoryId')) {
      const categoryId = changes.categoryId == null ? null : String(changes.categoryId);
      note.categoryId =
        categoryId && categories.some((category) => category.id === categoryId) ? categoryId : null;
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'pinned')) {
      note.pinned = Boolean(changes.pinned);
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'favorite')) {
      note.favorite = Boolean(changes.favorite);
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'archivedAt')) {
      note.archivedAt = changes.archivedAt ? normalizeDate(changes.archivedAt, new Date().toISOString()) : null;
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'deletedAt')) {
      note.deletedAt = changes.deletedAt ? normalizeDate(changes.deletedAt, new Date().toISOString()) : null;
    }

    note.updatedAt = new Date().toISOString();
    persistNotes();
    return note;
  }

  function remove(id) {
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) return false;
    notes.splice(index, 1);
    persistNotes();
    return true;
  }

  function moveToTrash(id) {
    const note = get(id);
    if (!note || note.deletedAt) return false;
    note.deletedAt = new Date().toISOString();
    note.updatedAt = note.deletedAt;
    persistNotes();
    return true;
  }

  function restoreFromTrash(id) {
    const note = get(id);
    if (!note || !note.deletedAt) return false;
    note.deletedAt = null;
    note.updatedAt = new Date().toISOString();
    persistNotes();
    return true;
  }

  function archiveNote(id) {
    const note = get(id);
    if (!note || note.archivedAt || note.deletedAt) return false;
    note.archivedAt = new Date().toISOString();
    note.updatedAt = note.archivedAt;
    persistNotes();
    return true;
  }

  function restoreArchivedNote(id) {
    const note = get(id);
    if (!note || !note.archivedAt || note.deletedAt) return false;
    note.archivedAt = null;
    note.updatedAt = new Date().toISOString();
    persistNotes();
    return true;
  }

  function clearAll() {
    let affected = 0;
    notes.forEach((note) => {
      if (!note.deletedAt) {
        note.deletedAt = new Date().toISOString();
        note.updatedAt = note.deletedAt;
        affected += 1;
      }
    });
    persistNotes();
    return affected;
  }

  function counts() {
    const result = {
      all: 0,
      favorites: 0,
      pinned: 0,
      archive: 0,
      trash: 0,
      byCategory: Object.create(null),
    };

    notes.forEach((note) => {
      if (note.deletedAt) {
        result.trash += 1;
        return;
      }
      if (note.archivedAt) {
        result.archive += 1;
        return;
      }

      result.all += 1;
      if (note.favorite) result.favorites += 1;
      if (note.pinned) result.pinned += 1;
      if (note.categoryId) {
        result.byCategory[note.categoryId] = (result.byCategory[note.categoryId] || 0) + 1;
      }
    });

    return result;
  }

  /* ------------------------------- Categories ------------------------------ */

  function getCategories() {
    return categories.slice();
  }

  function getCategory(id) {
    return categories.find((category) => category.id === id) || null;
  }

  function getCategoryName(id) {
    const category = getCategory(id);
    return category ? category.name : 'Uncategorized';
  }

  function nextCategoryColor() {
    const used = new Set(categories.map((category) => category.color));
    return CATEGORY_COLORS.find((color) => !used.has(color)) || CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length];
  }

  function addCategory(name, color) {
    const cleanName = normalizeCategoryName(name);

    if (!cleanName) return { ok: false, error: 'Give your category a name first.' };
    if (String(name || '').trim().length > 24) {
      return { ok: false, error: 'Category names can be up to 24 characters.' };
    }
    if (categories.length >= 12) {
      return { ok: false, error: 'You can have up to 12 categories.' };
    }
    if (categories.some((category) => category.name.toLowerCase() === cleanName.toLowerCase())) {
      return { ok: false, error: 'A category with that name already exists.' };
    }

    const category = {
      id: Utils.uid('cat'),
      name: cleanName,
      color: isValidColor(color) ? String(color).toLowerCase() : nextCategoryColor(),
    };

    categories.push(category);
    persistCategories();
    return { ok: true, category };
  }

  function renameCategory(id, name) {
    const category = getCategory(id);
    if (!category) return { ok: false, error: 'That category could not be found.' };

    const cleanName = normalizeCategoryName(name);
    if (!cleanName) return { ok: false, error: 'Give your category a name first.' };
    if (String(name || '').trim().length > 24) {
      return { ok: false, error: 'Category names can be up to 24 characters.' };
    }
    if (
      categories.some(
        (item) =>
          item.id !== id && item.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      return { ok: false, error: 'A category with that name already exists.' };
    }

    category.name = cleanName;
    persistCategories();
    return { ok: true, category };
  }

  function deleteCategory(id) {
    const index = categories.findIndex((category) => category.id === id);
    if (index === -1) return { ok: false, affected: 0 };

    const affectedNotes = notes.filter((note) => note.categoryId === id);
    affectedNotes.forEach((note) => {
      note.categoryId = null;
    });

    categories.splice(index, 1);
    persistCategories();
    if (affectedNotes.length > 0) persistNotes();

    return { ok: true, affected: affectedNotes.length };
  }

  /* --------------------------------- Backup -------------------------------- */

  function createBackup() {
    return {
      app: 'NoteFlow',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: notes.map((note) => ({ ...note })),
      categories: categories.map((category) => ({ ...category })),
    };
  }

  function validateBackup(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'This file does not look like a NoteFlow backup.' };
    }
    if (!Array.isArray(payload.notes)) {
      return { ok: false, error: 'The backup is missing its notes list.' };
    }
    if (payload.notes.length > 0 && !Array.isArray(payload.categories)) {
      return { ok: false, error: 'The backup is missing its categories list.' };
    }

    const cleanCategories = sanitizeCategories(payload.categories || []);
    const cleanNotes = sanitizeNotes(payload.notes, cleanCategories);

    if (payload.notes.length > 0 && cleanNotes.length === 0) {
      return { ok: false, error: 'No valid notes were found in this backup.' };
    }
    if (payload.categories && payload.categories.length > 0 && cleanCategories.length === 0) {
      return { ok: false, error: 'No valid categories were found in this backup.' };
    }

    return {
      ok: true,
      data: {
        notes: cleanNotes,
        categories: cleanCategories,
      },
      noteCount: cleanNotes.length,
      categoryCount: cleanCategories.length,
    };
  }

  function restoreBackup(data) {
    const cleanCategories = sanitizeCategories((data && data.categories) || []);
    const cleanNotes = sanitizeNotes((data && data.notes) || [], cleanCategories);

    categories = cleanCategories;
    notes = cleanNotes;
    meta.initialized = true;

    persistCategories();
    persistNotes();
    Storage.saveMeta(meta);

    return {
      noteCount: notes.length,
      categoryCount: categories.length,
    };
  }

  /* -------------------------------- Export --------------------------------- */

  function displayTitle(note) {
    if (!note) return 'Untitled note';
    const title = String(note.title || '').trim();
    return title || 'Untitled note';
  }

  function toPlainText(note) {
    if (!note) return '';

    const title = displayTitle(note);
    const underlineLength = Math.min(Math.max(title.length, 1), 60);
    const categoryName = getCategoryName(note.categoryId);
    const flags = [];
    if (note.pinned) flags.push('Pinned');
    if (note.favorite) flags.push('Favorite');

    return [
      title,
      '='.repeat(underlineLength),
      '',
      `Category: ${categoryName}`,
      `Created: ${Utils.formatFullDate(note.createdAt)}`,
      `Last updated: ${Utils.formatFullDate(note.updatedAt)}`,
      `Status: ${flags.length ? flags.join(' · ') : 'Standard note'}`,
      '',
      '-'.repeat(54),
      '',
      note.content || '',
      '',
    ].join('\n');
  }

  function downloadNote(note) {
    if (!note) return { ok: false, filename: '' };

    const filename = `${Utils.slugify(displayTitle(note))}-${Utils.todayFileStamp()}.txt`;
    const ok = Utils.downloadFile(filename, toPlainText(note), 'text/plain;charset=utf-8');
    return { ok, filename };
  }

  NoteFlow.Notes = {
    CATEGORY_COLORS,
    DEFAULT_CATEGORIES,
    init,
    all,
    get,
    create,
    update,
    remove,
    moveToTrash,
    restoreFromTrash,
    archiveNote,
    restoreArchivedNote,
    clearAll,
    counts,
    getCategories,
    getCategory,
    getCategoryName,
    addCategory,
    renameCategory,
    deleteCategory,
    createBackup,
    validateBackup,
    restoreBackup,
    displayTitle,
    toPlainText,
    downloadNote,
  };
})((window.NoteFlow = window.NoteFlow || {}));
