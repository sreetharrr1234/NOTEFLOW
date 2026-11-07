/* ==========================================================================
   NoteFlow — filters.js
   Single source of truth for views, categories, search, and sorting.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Search = NoteFlow.Search;

  const SORT_OPTIONS = Object.freeze([
    { value: 'updated-desc', label: 'Last updated' },
    { value: 'created-desc', label: 'Newest first' },
    { value: 'created-asc', label: 'Oldest first' },
    { value: 'title-asc', label: 'Title A–Z' },
    { value: 'title-desc', label: 'Title Z–A' },
  ]);

  const VIEWS = Object.freeze(['all', 'favorites', 'pinned', 'archive', 'trash']);
  const SORTS = new Set(SORT_OPTIONS.map((option) => option.value));

  const state = {
    view: 'all',
    categoryId: 'all',
    query: '',
    sort: 'updated-desc',
    viewMode: 'grid',
  };

  function init(options) {
    const config = options || {};
    if (SORTS.has(config.sort)) state.sort = config.sort;
    if (config.viewMode === 'grid' || config.viewMode === 'list') {
      state.viewMode = config.viewMode;
    }
  }

  function getState() {
    return { ...state };
  }

  function setState(patch) {
    const changes = patch || {};

    if (VIEWS.includes(changes.view)) state.view = changes.view;
    if (changes.categoryId === 'all' || typeof changes.categoryId === 'string') {
      state.categoryId = changes.categoryId;
    }
    if (typeof changes.query === 'string') state.query = changes.query;
    if (SORTS.has(changes.sort)) state.sort = changes.sort;
    if (changes.viewMode === 'grid' || changes.viewMode === 'list') {
      state.viewMode = changes.viewMode;
    }

    return getState();
  }

  function reset() {
    state.view = 'all';
    state.categoryId = 'all';
    state.query = '';
  }

  function isFiltered() {
    return state.view !== 'all' || state.categoryId !== 'all' || state.query.trim() !== '';
  }

  function sortNotes(notes) {
    const sorted = notes.slice();
    const titleOf = (note) => (String(note.title || '').trim() || 'Untitled note');

    sorted.sort((a, b) => {
      // Pinned notes always come first, regardless of the selected sort.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      let comparison = 0;

      switch (state.sort) {
        case 'created-desc':
          comparison = new Date(b.createdAt) - new Date(a.createdAt);
          break;
        case 'created-asc':
          comparison = new Date(a.createdAt) - new Date(b.createdAt);
          break;
        case 'title-asc':
          comparison = titleOf(a).localeCompare(titleOf(b), undefined, {
            sensitivity: 'base',
            numeric: true,
          });
          break;
        case 'title-desc':
          comparison = titleOf(b).localeCompare(titleOf(a), undefined, {
            sensitivity: 'base',
            numeric: true,
          });
          break;
        case 'updated-desc':
        default:
          comparison = new Date(b.updatedAt) - new Date(a.updatedAt);
          break;
      }

      if (comparison === 0) {
        comparison = new Date(b.updatedAt) - new Date(a.updatedAt);
      }

      return comparison;
    });

    return sorted;
  }

  /**
   * Apply the active view, category, search query, and sort order.
   */
  function apply(notes) {
    let result = notes;

    if (state.view === 'archive') {
      result = result.filter((note) => note.archivedAt && !note.deletedAt);
    } else if (state.view === 'trash') {
      result = result.filter((note) => note.deletedAt);
    } else {
      result = result.filter((note) => !note.archivedAt && !note.deletedAt);
      if (state.view === 'favorites') {
        result = result.filter((note) => note.favorite);
      } else if (state.view === 'pinned') {
        result = result.filter((note) => note.pinned);
      }
    }

    if (state.categoryId !== 'all') {
      result = result.filter((note) => note.categoryId === state.categoryId);
    }

    result = Search.filter(result, state.query);
    return sortNotes(result);
  }

  NoteFlow.Filters = {
    SORT_OPTIONS,
    VIEWS,
    init,
    getState,
    setState,
    reset,
    isFiltered,
    isValidSort: (value) => SORTS.has(value),
    sortNotes,
    apply,
  };
})((window.NoteFlow = window.NoteFlow || {}));
