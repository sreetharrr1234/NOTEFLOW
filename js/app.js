/* ==========================================================================
   NoteFlow — app.js
   The application controller: rendering, events, theme, dialogs, settings.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = NoteFlow.Utils;
  const Notes = NoteFlow.Notes;
  const Storage = NoteFlow.Storage;
  const Search = NoteFlow.Search;
  const Filters = NoteFlow.Filters;
  const Editor = NoteFlow.Editor;
  const Gamification = NoteFlow.Gamification;
  const Stats = NoteFlow.Stats;
  const NativeAndroid = NoteFlow.NativeAndroid;

  const VIEW_LABELS = Object.freeze({
    all: 'All notes',
    favorites: 'Favorites',
    pinned: 'Pinned',
    archive: 'Shadow Archive',
    trash: 'Recently Deleted',
  });

  const THEME_MODES = Object.freeze(['light', 'dark', 'system']);
  const CS_SCHEME = '(prefers-color-scheme: dark)';
  const MOBILE_QUERY = '(max-width: 900px)';

  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const darkQuery = window.matchMedia(CS_SCHEME);

  const els = {};

  let initialized = false;
  let settings = {
    theme: 'system',
    sort: 'updated-desc',
    viewMode: 'grid',
  };
  let selectedColor = NoteFlow.Notes.CATEGORY_COLORS[0];
  let editingCategoryId = null;
  let currentPage = 'home';
  let themeTimer = null;
  let storageToast = { message: '', at: 0 };
  let debouncedSearch = null;

  /* --------------------------------- Setup --------------------------------- */

  function cacheElements() {
    els.app = Utils.$('#app');
    els.sidebar = Utils.$('#sidebar');
    els.sidebarBackdrop = Utils.$('#sidebarBackdrop');
    els.menuButton = Utils.$('#menuButton');
    els.searchInput = Utils.$('#searchInput');
    els.clearSearch = Utils.$('#clearSearch');
    els.sortSelect = Utils.$('#sortSelect');
    els.categoryFilters = Utils.$('#categoryFilters');
    els.categoryNav = Utils.$('#categoryNav');
    els.notesContainer = Utils.$('#notesContainer');
    els.resultsHead = Utils.$('#resultsHead');
    els.notesCountLabel = Utils.$('#notesCountLabel');
    els.syncLabel = Utils.$('#syncLabel');
    els.currentViewLabel = Utils.$('#currentViewLabel');
    els.greeting = Utils.$('#greeting');
    els.todayLabel = Utils.$('#todayLabel');
    els.themeToggle = Utils.$('#themeToggle');
    els.themeToggleIcon = Utils.$('#themeToggleIcon');
    els.themeColorMeta = Utils.$('#themeColorMeta');
    els.editorDialog = Utils.$('#editorDialog');
    els.categoriesDialog = Utils.$('#categoriesDialog');
    els.categoriesTitle = Utils.$('#categoriesTitle');
    els.settingsDialog = Utils.$('#settingsDialog');
    els.categoryForm = Utils.$('#categoryForm');
    els.categoryName = Utils.$('#categoryName');
    els.categoryError = Utils.$('#categoryError');
    els.addCategoryBtn = Utils.$('#addCategoryBtn');
    els.colorOptions = Utils.$('#colorOptions');
    els.categoryManageList = Utils.$('#categoryManageList');
    els.themeOptions = Utils.$('#themeOptions');
    els.settingsSort = Utils.$('#settingsSort');
    els.storageUsageText = Utils.$('#storageUsageText');
    els.exportBackupBtn = Utils.$('#exportBackupBtn');
    els.importBackupBtn = Utils.$('#importBackupBtn');
    els.importFile = Utils.$('#importFile');
    els.clearNotesBtn = Utils.$('#clearNotesBtn');
    els.sidebarMeta = Utils.$('.sidebar__meta');
    els.toastContainer = Utils.$('#toastContainer');
    els.homePage = Utils.$('#homePage');
    els.questsPage = Utils.$('#questsPage');
    els.statsPage = Utils.$('#statsPage');
    els.homeRank = Utils.$('#homeRank');
    els.homeLevel = Utils.$('#homeLevel');
    els.homeXpBar = Utils.$('#homeXpBar');
    els.homeXpText = Utils.$('#homeXpText');
    els.homeStreak = Utils.$('#homeStreak');
    els.homeQuestPreview = Utils.$('#homeQuestPreview');
    els.homeProductivity = Utils.$('#homeProductivity');
    els.homeFolderShortcuts = Utils.$('#homeFolderShortcuts');
    els.homePinnedNotes = Utils.$('#homePinnedNotes');
    els.homeRecentNotes = Utils.$('#homeRecentNotes');
    els.questSummary = Utils.$('#questSummary');
    els.questForm = Utils.$('#questForm');
    els.questTitle = Utils.$('#questTitle');
    els.questXp = Utils.$('#questXp');
    els.questError = Utils.$('#questError');
    els.questList = Utils.$('#questList');
    els.questHistory = Utils.$('#questHistory');
    els.statsContent = Utils.$('#statsContent');
    els.questsNavCount = Utils.$('#questsNavCount');
  }

  function loadSettings() {
    const stored = Storage.loadSettings();

    return {
      theme: THEME_MODES.includes(stored.theme) ? stored.theme : 'system',
      sort: Filters.isValidSort(stored.sort) ? stored.sort : 'updated-desc',
      viewMode: stored.viewMode === 'list' ? 'list' : 'grid',
    };
  }

  function persistSettings() {
    Storage.saveSettings(settings);
    updateStorageStatus();
  }

  /* --------------------------------- Init ---------------------------------- */

  function init() {
    if (initialized) return;

    cacheElements();

    if (!els.notesContainer || !els.searchInput) {
      console.error('NoteFlow: required elements are missing from the page.');
      return;
    }

    settings = loadSettings();

    const initResult = Notes.init();

    if (Gamification) Gamification.init();

    Filters.init({
      sort: settings.sort,
      viewMode: settings.viewMode,
    });

    Editor.init({
      onChange: handleEditorChange,
      onClose: handleEditorClose,
      getDefaultCategory: getDefaultCategory,
    });

    selectedColor = pickNextColor();
    debouncedSearch = Utils.debounce((value) => {
      Filters.setState({ query: value });
      render();
    }, 150);

    applyTheme(settings.theme, false, false);
    updateStaticLabels();
    bindEvents();
    applyPageVisibility();
    render();
    initNativeAndroid();

    if (!Storage.isAvailable()) {
      notifyStorageError('Local storage is unavailable. Notes will only last this session.');
    } else if (!Storage.getStatus().lastWriteOk) {
      notifyStorageError(Storage.getStatus().lastError || 'Changes could not be saved.');
    }

    if (initResult && initResult.firstRun) {
      window.setTimeout(() => {
        Utils.toast('Welcome to NoteFlow. Sample notes are ready — make this space yours.', 'info', 5200);
      }, 700);
    }

    initialized = true;
  }

  /* ------------------------------- Events ---------------------------------- */

  function bindEvents() {
    els.searchInput.addEventListener('input', handleSearchInput);
    els.searchInput.addEventListener('keydown', handleSearchKeydown);
    els.clearSearch.addEventListener('click', clearSearch);
    els.sortSelect.addEventListener('change', handleSortChange);

    els.menuButton.addEventListener('click', openSidebar);
    els.sidebarBackdrop.addEventListener('click', closeSidebar);

    els.categoryForm.addEventListener('submit', handleCategorySubmit);
    els.categoryName.addEventListener('input', clearCategoryError);
    els.colorOptions.addEventListener('click', handleColorClick);
    els.categoryManageList.addEventListener('click', handleCategoryManageClick);
    els.categoryManageList.addEventListener('keydown', handleCategoryManageKeydown);

    els.settingsSort.addEventListener('change', handleDefaultSortChange);
    if (els.questForm) els.questForm.addEventListener('submit', handleQuestSubmit);
    if (els.questTitle) els.questTitle.addEventListener('input', clearQuestError);
    els.exportBackupBtn.addEventListener('click', exportBackup);
    els.importBackupBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', handleImportFile);
    els.clearNotesBtn.addEventListener('click', deleteAllNotes);

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleGlobalKeydown);

    window.addEventListener('noteflow:storage-error', handleStorageError);
    window.addEventListener('resize', Utils.debounce(closeSidebarOnDesktop, 140));

    if (typeof darkQuery.addEventListener === 'function') {
      darkQuery.addEventListener('change', handleSystemThemeChange);
    } else if (typeof darkQuery.addListener === 'function') {
      darkQuery.addListener(handleSystemThemeChange);
    }
  }

  /* ------------------------------ Native shell ----------------------------- */

  function initNativeAndroid() {
    if (!NativeAndroid || !NativeAndroid.isNative) return;
    NativeAndroid.initBackButton(handleAndroidBack);
    NativeAndroid.setStatusBarTheme(document.documentElement.dataset.theme === 'dark');
  }

  async function handleAndroidBack() {
    const openDialogs = Utils.$$('dialog[open]');
    if (openDialogs.length) {
      const dialog = openDialogs[openDialogs.length - 1];
      if (dialog && typeof dialog.close === 'function') {
        dialog.close();
        return true;
      }
    }

    if (els.app && els.app.classList.contains('sidebar-open')) {
      closeSidebar();
      return true;
    }

    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
      if (active === els.searchInput && active.value) {
        clearSearch();
        active.blur();
        return true;
      }
      active.blur();
      return true;
    }

    if (currentPage !== 'home') {
      setPage('home');
      return true;
    }

    if (els.searchInput && els.searchInput.value.trim()) {
      clearSearch();
      els.searchInput.blur();
      return true;
    }

    return false;
  }

  function applyPageVisibility() {
    const page = currentPage;
    const showNotes = page === 'notes' || page === 'archive';
    if (els.homePage) els.homePage.hidden = page !== 'home';
    if (els.questsPage) els.questsPage.hidden = page !== 'quests';
    if (els.statsPage) els.statsPage.hidden = page !== 'stats';
    Utils.$$('.toolbar, .category-bar, .results').forEach((section) => {
      section.hidden = !showNotes;
    });

    Utils.$$('[data-page]').forEach((button) => {
      const active = button.dataset.page === page;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const labels = {
      home: 'Home',
      notes: 'My Notes',
      quests: 'Daily Quests',
      archive: 'Shadow Archive',
      stats: 'Statistics',
    };
    if (els.currentViewLabel) {
      if (showNotes) {
        const state = Filters.getState();
        const category = state.categoryId !== 'all' ? Notes.getCategory(state.categoryId) : null;
        els.currentViewLabel.textContent = state.query.trim()
          ? 'Search'
          : category
            ? category.name
            : VIEW_LABELS[state.view] || 'All notes';
      } else {
        els.currentViewLabel.textContent = labels[page] || 'Home';
      }
    }
  }

  function setPage(page) {
    if (!['home', 'notes', 'quests', 'archive', 'stats'].includes(page)) return;
    currentPage = page;

    if (page === 'archive') {
      Filters.setState({ view: 'archive', categoryId: 'all' });
    } else if (page === 'notes') {
      const state = Filters.getState();
      if (['archive', 'trash'].includes(state.view)) {
        Filters.setState({ view: 'all', categoryId: 'all' });
      }
    }

    applyPageVisibility();
    render();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------- Rendering ------------------------------- */

  function render() {
    const state = Filters.getState();
    const allNotes = Notes.all();
    const counts = Notes.counts();
    const results = Filters.apply(allNotes);
    const filtered = Filters.isFiltered();

    renderNavigation(state, counts);
    renderSortAndView(state);
    renderCategoryFilters(state, counts);
    renderResultsHead(state, results);
    renderNotes(results, state);
    renderHomePage();
    renderQuestsPage();
    renderStatsPage();
    updateMeta(allNotes.length, results.length, filtered);

    els.clearSearch.hidden = els.searchInput.value.trim() === '';
    updateStorageStatus();
  }

  function renderNavigation(state, counts) {
    const categoryActive = state.categoryId !== 'all';

    Utils.$$('.nav-item[data-view], .mobile-nav__item[data-view]').forEach((button) => {
      const isActive = !categoryActive && button.dataset.view === state.view;
      button.classList.toggle('is-active', isActive);
      if (isActive) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    setCount('[data-count="all"]', counts.all);
    setCount('[data-count="favorites"]', counts.favorites);
    setCount('[data-count="pinned"]', counts.pinned);
    setCount('[data-count="archive"]', counts.archive);
    setCount('[data-count="trash"]', counts.trash);
    if (els.questsNavCount && Gamification) {
      els.questsNavCount.textContent = String(Gamification.getState().questsTotal);
    }

    renderCategoryNav(state, counts);
  }

  function renderCategoryNav(state, counts) {
    if (!els.categoryNav) return;

    const categories = Notes.getCategories();

    if (categories.length === 0) {
      els.categoryNav.innerHTML =
        '<p class="category-nav__empty">No categories yet. Use the + button to create your first one.</p>';
      return;
    }

    els.categoryNav.innerHTML = categories
      .map((category) => {
        const active = state.categoryId === category.id;
        const count = counts.byCategory[category.id] || 0;
        const name = Utils.escapeHTML(category.name);

        return `
          <button class="category-item${active ? ' is-active' : ''}" type="button"
            data-category-id="${Utils.escapeHTML(category.id)}"
            aria-label="Filter by ${name}"
            ${active ? 'aria-current="true"' : ''}>
            <span class="category-dot" style="--cat-color: ${Utils.escapeHTML(category.color)}"></span>
            <span class="category-item__name">${name}</span>
            <span class="category-item__count">${count}</span>
          </button>`;
      })
      .join('');
  }

  function renderCategoryFilters(state, counts) {
    if (!els.categoryFilters) return;

    const categories = Notes.getCategories();
    const allActive = state.categoryId === 'all';

    const chips = [
      `<button class="chip${allActive ? ' is-active' : ''}" type="button" data-category-id="all" aria-pressed="${allActive}">
        All notes <span class="chip__count">${counts.all}</span>
      </button>`,
    ];

    categories.forEach((category) => {
      const active = state.categoryId === category.id;
      const count = counts.byCategory[category.id] || 0;
      const name = Utils.escapeHTML(category.name);

      chips.push(`
        <button class="chip${active ? ' is-active' : ''}" type="button"
          data-category-id="${Utils.escapeHTML(category.id)}"
          aria-pressed="${active}">
          <span class="category-dot" style="--cat-color: ${Utils.escapeHTML(category.color)}"></span>
          ${name} <span class="chip__count">${count}</span>
        </button>`);
    });

    chips.push(`
      <button class="chip chip--manage" type="button" data-action="open-categories">
        ${Utils.icon('plus')} Manage
      </button>`);

    els.categoryFilters.innerHTML = chips.join('');
  }

  function renderSortAndView(state) {
    if (els.sortSelect && els.sortSelect.value !== state.sort) {
      els.sortSelect.value = state.sort;
    }

    if (els.settingsSort && els.settingsSort.value !== state.sort) {
      els.settingsSort.value = state.sort;
    }

    Utils.$$('[data-view-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.viewMode === state.viewMode));
    });
  }

  function resultsTitle(state) {
    const query = state.query.trim();
    const category = state.categoryId !== 'all' ? Notes.getCategory(state.categoryId) : null;

    if (query) {
      return category ? `“${query}” in ${category.name}` : `Results for “${query}”`;
    }

    if (category) return category.name;
    return VIEW_LABELS[state.view] || 'All notes';
  }

  function renderResultsHead(state, results) {
    if (!els.resultsHead) return;

    const sortLabel =
      (Filters.SORT_OPTIONS.find((option) => option.value === state.sort) || {}).label ||
      'Last updated';
    const title = Utils.escapeHTML(resultsTitle(state));
    const hint =
      state.query.trim() || state.categoryId !== 'all' || state.view !== 'all'
        ? `Pinned first · Sort: ${sortLabel}`
        : `Sort: ${sortLabel}`;

    els.resultsHead.innerHTML = `
      <div class="results__head-left">
        <h2 class="results__title">${title}</h2>
        <span class="results__count" aria-label="${Utils.pluralize(results.length, 'note')}">${results.length}</span>
      </div>
      <div class="results__actions">
        <span class="results__hint">${Utils.escapeHTML(hint)}</span>
      </div>`;
  }

  function renderNotes(results, state) {
    if (!els.notesContainer) return;

    if (results.length === 0) {
      els.notesContainer.innerHTML = emptyStateHTML(state);
      return;
    }

    const pinned = results.filter((note) => note.pinned);
    const regular = results.filter((note) => !note.pinned);
    const sections = [];

    if (pinned.length > 0) {
      sections.push(notesSectionHTML('Pinned', 'pin', pinned, state));
    }

    if (regular.length > 0) {
      sections.push(notesSectionHTML('Notes', 'notes', regular, state));
    }

    els.notesContainer.innerHTML = sections.join('');
  }

  function notesSectionHTML(label, iconName, notes, state) {
    const listClass = state.viewMode === 'list' ? ' notes-grid--list' : '';

    return `
      <section class="note-section" aria-label="${Utils.escapeHTML(label)} notes">
        <div class="note-section__head">
          <h2 class="note-section__title">${Utils.icon(iconName)} ${Utils.escapeHTML(label)}</h2>
          <span class="note-section__count">${notes.length}</span>
          <span class="note-section__line" aria-hidden="true"></span>
        </div>
        <div class="notes-grid${listClass}">
          ${notes.map((note) => noteCardHTML(note, state)).join('')}
        </div>
      </section>`;
  }

  function miniNoteHTML(note) {
    const title = Utils.escapeHTML(Notes.displayTitle(note));
    const category = note.categoryId ? Notes.getCategory(note.categoryId) : null;
    return `
      <button class="mini-note" type="button" data-open-note="${Utils.escapeHTML(note.id)}">
        <span class="mini-note__title">${title}</span>
        <span class="mini-note__meta">${category ? Utils.escapeHTML(category.name) : 'Uncategorized'} · ${Utils.escapeHTML(Utils.formatRelativeTime(note.updatedAt))}</span>
      </button>`;
  }

  function renderHomePage() {
    if (!els.homePage || !Gamification) return;
    const summary = Gamification.getState();
    const activeNotes = Notes.all().filter((note) => !note.archivedAt && !note.deletedAt);
    const pinned = Notes.all().filter((note) => note.pinned && !note.archivedAt && !note.deletedAt).slice(0, 3);
    const recent = activeNotes.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 4);
    const productivity = Stats ? Stats.compute().dailyProductivity : null;

    if (els.homeRank) els.homeRank.textContent = `${summary.rank} Rank`;
    if (els.homeLevel) els.homeLevel.textContent = `Level ${summary.level}`;
    if (els.homeXpBar) els.homeXpBar.style.width = `${Math.round(summary.progress * 100)}%`;
    if (els.homeXpText) {
      els.homeXpText.textContent = summary.nextRank
        ? `${summary.xp} XP · ${summary.xpToNextRank} XP to ${summary.nextRank} Rank`
        : `${summary.xp} XP · Maximum rank reached`;
    }
    if (els.homeStreak) {
      els.homeStreak.textContent = summary.streak > 0
        ? `${summary.streak}-day streak · Best ${summary.bestStreak}`
        : 'Complete today\'s quest to begin a streak';
    }

    if (els.homeQuestPreview) {
      const next = summary.quests.find((quest) => !quest.done);
      els.homeQuestPreview.innerHTML = next
        ? `
          <div class="quest-item">
            <div class="quest-item__body">
              <span class="quest-item__title">${Utils.escapeHTML(next.title)}</span>
              <span class="quest-item__xp">+${next.xp} XP</span>
            </div>
            <button class="quest-complete-btn" type="button" data-complete-quest="${Utils.escapeHTML(next.id)}">Complete</button>
          </div>`
        : `<div class="empty-inline">All daily quests are complete. The archive salutes you.</div>`;
    }

    if (els.homeProductivity && productivity) {
      els.homeProductivity.innerHTML = `
        <div class="stat-tile"><strong>${productivity.notesTouched}</strong><span>Notes touched today</span></div>
        <div class="stat-tile"><strong>${productivity.wordsWritten}</strong><span>Words written today</span></div>
        <div class="stat-tile"><strong>${productivity.questsDoneToday}</strong><span>Quests done today</span></div>
        <div class="stat-tile"><strong>${productivity.xpToday}</strong><span>XP earned today</span></div>`;
    }

    if (els.homeFolderShortcuts) {
      const categories = Notes.getCategories();
      els.homeFolderShortcuts.innerHTML = categories.length
        ? categories.map((category) => `
            <button class="folder-shortcut" type="button" data-category-id="${Utils.escapeHTML(category.id)}">
              <span class="category-dot" style="--cat-color: ${Utils.escapeHTML(category.color)}"></span>
              <span>${Utils.escapeHTML(category.name)}</span>
            </button>`).join('')
        : '<div class="empty-inline">No folders yet. Create one from Manage.</div>';
    }

    if (els.homePinnedNotes) {
      els.homePinnedNotes.innerHTML = pinned.length
        ? `<div class="mini-note-list">${pinned.map(miniNoteHTML).join('')}</div>`
        : '<div class="empty-inline">No pinned notes yet. Pin the notes that deserve an army.</div>';
    }

    if (els.homeRecentNotes) {
      els.homeRecentNotes.innerHTML = recent.length
        ? `<div class="mini-note-list">${recent.map(miniNoteHTML).join('')}</div>`
        : '<div class="empty-inline">No recent notes. Create your first note to begin the ascent.</div>';
    }
  }

  function renderQuestsPage() {
    if (!els.questsPage || !Gamification) return;
    const state = Gamification.getState();

    if (els.questSummary) {
      els.questSummary.innerHTML = `
        <strong>${state.questsDone}/${state.questsTotal}</strong>
        <span>quests complete</span>
        <span>${state.xp} total XP · ${state.streak}-day streak</span>`;
    }

    if (els.questList) {
      els.questList.innerHTML = state.quests.length
        ? state.quests.map((quest) => `
            <div class="quest-item${quest.done ? ' is-done' : ''}" data-quest-id="${Utils.escapeHTML(quest.id)}">
              <div class="quest-item__body">
                <span class="quest-item__title">${Utils.escapeHTML(quest.title)}</span>
                <span class="quest-item__xp">+${quest.xp} XP${quest.done ? ' · Complete' : ''}</span>
              </div>
              <button class="quest-complete-btn" type="button" data-complete-quest="${Utils.escapeHTML(quest.id)}" ${quest.done ? 'disabled' : ''}>
                ${quest.done ? 'Done' : 'Complete'}
              </button>
              <button class="icon-btn icon-btn--xs quest-delete-btn" type="button" data-delete-quest="${Utils.escapeHTML(quest.id)}" aria-label="Remove quest ${Utils.escapeHTML(quest.title)}">
                ${Utils.icon('trash')}
              </button>
            </div>`).join('')
        : '<div class="empty-inline">No quests for today. Add one to begin earning XP.</div>';
    }

    if (els.questHistory) {
      els.questHistory.innerHTML = state.history.length
        ? state.history.slice(0, 20).map((item) => `
            <div class="quest-history-item">
              <span><strong>${Utils.escapeHTML(item.title)}</strong><br>${Utils.escapeHTML(item.date)}</span>
              <span>+${item.xp} XP</span>
            </div>`).join('')
        : '<div class="empty-inline">Completed quests will gather here as history.</div>';
    }
  }

  function renderStatsPage() {
    if (!els.statsPage || !els.statsContent || !Stats) return;
    const stats = Stats.compute();
    const hasData = stats.totalNotes > 0 || stats.totalWords > 0 || stats.totalXp > 0 || stats.completedQuests > 0;

    if (!hasData) {
      els.statsContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art" aria-hidden="true">${Utils.icon('clock')}</div>
          <h2 class="empty-state__title">No shadows to measure yet.</h2>
          <p class="empty-state__text">Create a note or complete a daily quest and your Monarch Statistics will begin here.</p>
          <div class="empty-state__actions">
            <button class="btn btn--primary" type="button" data-action="create-note">${Utils.icon('plus')} Create a note</button>
          </div>
        </div>`;
      return;
    }

    const tiles = [
      ['Total notes', stats.totalNotes],
      ['Total words written', stats.totalWords],
      ['Total folders', stats.totalFolders],
      ['Pinned notes', stats.pinnedNotes],
      ['Archived notes', stats.archivedNotes],
      ['Completed quests', stats.completedQuests],
      ['Total XP', stats.totalXp],
      ['Current level', stats.currentLevel],
      ['Current rank', stats.currentRank],
      ['Daily productivity', `${stats.dailyProductivity.notesTouched} notes · ${stats.dailyProductivity.wordsWritten} words`],
      ['Streak', `${stats.streak} days`],
      ['Recently deleted', stats.trashedNotes],
    ];

    els.statsContent.innerHTML = `
      <div class="stats-grid">
        ${tiles.map(([label, value]) => `
          <div class="stat-tile"><strong>${Utils.escapeHTML(String(value))}</strong><span>${Utils.escapeHTML(label)}</span></div>
        `).join('')}
      </div>
      <section class="activity-chart" aria-label="Weekly activity chart">
        ${stats.weeklyActivity.map((day) => `
          <div class="activity-bar">
            <em>${day.count}</em>
            <div class="activity-bar__track"><span class="activity-bar__fill" style="height: ${day.height}%"></span></div>
            <span>${Utils.escapeHTML(day.label)}</span>
          </div>`).join('')}
      </section>
      <p class="section-help">Activity counts notes created or updated on each day. All statistics are calculated from stored notes, folders, quests, and XP.</p>`;
  }

  function noteCardHTML(note, state) {
    const title = Notes.displayTitle(note);
    const safeTitle = Utils.escapeHTML(title);
    const id = Utils.escapeHTML(note.id);
    const query = state.query;
    const category = note.categoryId ? Notes.getCategory(note.categoryId) : null;
    const hasContent = String(note.content || '').trim() !== '';
    const preview = hasContent
      ? Search.buildSnippet(note.content, query)
      : 'No additional text yet.';
    const created = Utils.formatFullDate(note.createdAt);
    const updated = Utils.formatFullDate(note.updatedAt);
    const wasEdited =
      Math.abs(new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime()) > 60000;
    const dateLabel = wasEdited
      ? `Updated ${Utils.formatRelativeTime(note.updatedAt)}`
      : `Created ${Utils.formatRelativeTime(note.createdAt)}`;
    const words = Utils.wordCount(note.content);

    const categoryChip = category
      ? `<span class="note-chip" title="Category: ${Utils.escapeHTML(category.name)}">
          <span class="category-dot" style="--cat-color: ${Utils.escapeHTML(category.color)}"></span>
          <span>${Utils.escapeHTML(category.name)}</span>
        </span>`
      : '';

    const lifecycleActions =
      state.view === 'trash'
        ? `
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="restore-note" data-note-id="${id}" title="Restore note"
              aria-label="Restore ${safeTitle}">
              ${Utils.icon('check')}
            </button>
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="permanent-delete" data-note-id="${id}" title="Delete forever"
              aria-label="Permanently delete ${safeTitle}">
              ${Utils.icon('trash')}
            </button>`
        : state.view === 'archive'
          ? `
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="restore-note" data-note-id="${id}" title="Restore from archive"
              aria-label="Restore ${safeTitle} from the archive">
              ${Utils.icon('check')}
            </button>
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="delete" data-note-id="${id}" title="Move to Recently Deleted"
              aria-label="Move ${safeTitle} to Recently Deleted">
              ${Utils.icon('trash')}
            </button>`
          : `
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="archive-note" data-note-id="${id}" title="Archive note"
              aria-label="Archive ${safeTitle}">
              ${Utils.icon('folder')}
            </button>
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="delete" data-note-id="${id}" title="Move to Recently Deleted"
              aria-label="Move ${safeTitle} to Recently Deleted">
              ${Utils.icon('trash')}
            </button>`;

    return `
      <article class="note-card" data-note-id="${id}" tabindex="0"
        aria-label="Open note: ${safeTitle}"
        data-note-title="${safeTitle}">
        <div class="note-card__top">
          ${categoryChip}
          <div class="note-card__actions">
            <button class="icon-btn icon-btn--xs card-action${note.pinned ? ' is-active' : ''}"
              type="button" data-action="toggle-pin" data-note-id="${id}"
              aria-pressed="${note.pinned}"
              title="${note.pinned ? 'Unpin note' : 'Pin note'}"
              aria-label="${note.pinned ? 'Unpin' : 'Pin'} ${safeTitle}">
              ${Utils.icon('pin')}
            </button>
            <button class="icon-btn icon-btn--xs card-action${note.favorite ? ' is-active' : ''}"
              type="button" data-action="toggle-favorite" data-note-id="${id}"
              aria-pressed="${note.favorite}"
              title="${note.favorite ? 'Remove from favorites' : 'Add to favorites'}"
              aria-label="${note.favorite ? 'Remove' : 'Add'} ${safeTitle} ${note.favorite ? 'from' : 'to'} favorites">
              ${Utils.icon('star')}
            </button>
            <button class="icon-btn icon-btn--xs card-action" type="button"
              data-action="export" data-note-id="${id}" title="Export as TXT"
              aria-label="Export ${safeTitle} as a text file">
              ${Utils.icon('download')}
            </button>
            ${lifecycleActions}
          </div>
        </div>
        <h3 class="note-card__title${title === 'Untitled note' && !String(note.title).trim() ? ' is-untitled' : ''}">
          ${Search.highlight(title, query)}
        </h3>
        <p class="note-card__preview${hasContent ? '' : ' is-empty'}">${
          hasContent ? preview : 'No additional text yet.'
        }</p>
        <footer class="note-card__footer">
          <span class="note-card__date" title="Created ${Utils.escapeHTML(created)} · Updated ${Utils.escapeHTML(
      updated
    )}">${Utils.escapeHTML(dateLabel)}</span>
          <span class="note-card__words">${Utils.pluralize(words, 'word')}</span>
        </footer>
      </article>`;
  }

  function emptyStateHTML(state) {
    const total = Notes.all().length;
    const query = state.query.trim();
    const category = state.categoryId !== 'all' ? Notes.getCategory(state.categoryId) : null;

    const actions = [];
    const addPrimary = (label) => {
      actions.push(
        `<button class="btn btn--primary" type="button" data-action="create-note">${Utils.icon(
          'plus'
        )} ${Utils.escapeHTML(label)}</button>`
      );
    };
    const addSecondary = (label, action) => {
      actions.push(
        `<button class="btn btn--ghost" type="button" data-action="${action}">${Utils.escapeHTML(
          label
        )}</button>`
      );
    };

    let iconName = 'notes';
    let title = 'Your first note is waiting.';
    let text = 'A quiet place for everything worth remembering. Notes are saved automatically on this device.';

    if (total === 0 && !query && !category) {
      iconName = 'sparkles';
      addPrimary('Create your first note');
      addSecondary('Manage categories', 'open-categories');
    } else if (query) {
      iconName = 'search';
      title = `Nothing found for “${query}”`;
      text = 'Try a different word, or clear your search to see everything again.';
      addSecondary('Clear search', 'reset-filters');
      addPrimary('New note');
    } else if (state.view === 'favorites') {
      iconName = 'star';
      title = 'No favorites yet.';
      text = 'Star the notes you want close at hand. They will gather here, ready when you need them.';
      addSecondary('Browse all notes', 'reset-filters');
      addPrimary('New note');
    } else if (state.view === 'pinned') {
      iconName = 'pin';
      title = 'Nothing pinned yet.';
      text = 'Pin the notes you want within reach. Pinned notes stay at the top of your workspace.';
      addSecondary('Browse all notes', 'reset-filters');
      addPrimary('New note');
    } else if (state.view === 'archive') {
      iconName = 'folder';
      title = 'The Shadow Archive is quiet.';
      text = 'Archive finished notes here to keep your active workspace focused. You can restore them at any time.';
      addSecondary('Browse all notes', 'reset-filters');
    } else if (state.view === 'trash') {
      iconName = 'trash';
      title = 'Recently Deleted is empty.';
      text = 'Deleted notes rest here before permanent removal. Nothing is gone forever until you choose it.';
      addSecondary('Browse all notes', 'reset-filters');
    } else if (category) {
      iconName = 'folder';
      title = `No notes in ${category.name} yet.`;
      text = 'Start something here, or move an existing note into this category from the editor.';
      addPrimary('New note');
      addSecondary('Show all notes', 'reset-filters');
    } else {
      addPrimary('New note');
      addSecondary('Show all notes', 'reset-filters');
    }

    return `
      <div class="empty-state">
        <div class="empty-state__art" aria-hidden="true">${Utils.icon(iconName)}</div>
        <h2 class="empty-state__title">${Utils.escapeHTML(title)}</h2>
        <p class="empty-state__text">${Utils.escapeHTML(text)}</p>
        <div class="empty-state__actions">${actions.join('')}</div>
      </div>`;
  }

  function updateMeta(total, filtered, isFiltered) {
    if (els.notesCountLabel) {
      els.notesCountLabel.textContent = isFiltered
        ? `${filtered} of ${Utils.pluralize(total, 'note')}`
        : Utils.pluralize(total, 'note');
    }

    if (els.currentViewLabel) {
      const state = Filters.getState();
      const category = state.categoryId !== 'all' ? Notes.getCategory(state.categoryId) : null;
      els.currentViewLabel.textContent = state.query.trim()
        ? 'Search'
        : category
          ? category.name
          : VIEW_LABELS[state.view] || 'All notes';
    }
  }

  function updateStaticLabels() {
    if (els.todayLabel) els.todayLabel.textContent = Utils.formatDayLabel(new Date());
    if (els.greeting) els.greeting.textContent = Utils.greetingForHour();

    const shortcuts = {
      new: `${Utils.modKey} N`,
      search: `${Utils.modKey} K`,
      save: `${Utils.modKey} S`,
    };

    const ids = {
      '#newNoteKbd': shortcuts.new,
      '#searchKbd': shortcuts.search,
      '#footerSearchKbd': shortcuts.search,
      '#footerNewKbd': shortcuts.new,
      '#editorSaveKbd': shortcuts.save,
    };

    Object.keys(ids).forEach((selector) => {
      const element = Utils.$(selector);
      if (element) element.textContent = ids[selector];
    });

    Utils.$$('[data-shortcut]').forEach((element) => {
      const label = shortcuts[element.dataset.shortcut];
      if (label) element.textContent = label;
    });
  }

  function setCount(selector, value) {
    Utils.$$(selector).forEach((element) => {
      element.textContent = String(value);
    });
  }

  /* -------------------------------- Storage -------------------------------- */

  function updateStorageStatus() {
    if (!initialized && !els.syncLabel) return;

    const status = Storage.getStatus();
    const usage = Storage.getUsage();
    const noteCount = Notes.all().length;
    const categoryCount = Notes.getCategories().length;

    if (els.syncLabel) {
      let label = 'Auto-saved locally';
      if (!status.available) {
        label = 'Session-only storage';
      } else if (!status.lastWriteOk) {
        label = 'Storage issue — check settings';
      }
      els.syncLabel.textContent = label;
      els.syncLabel.classList.toggle('is-warning', !status.available || !status.lastWriteOk);
      if (status.lastError) els.syncLabel.title = status.lastError;
      else els.syncLabel.removeAttribute('title');
    }

    if (els.sidebarMeta) {
      const label = els.sidebarMeta.querySelector('span');
      els.sidebarMeta.classList.toggle('is-warning', !status.available);
      if (label) {
        label.textContent = status.available ? 'Stored on this device' : 'Session-only storage';
      }
      if (status.lastError) els.sidebarMeta.title = status.lastError;
      else els.sidebarMeta.removeAttribute('title');
    }

    if (els.storageUsageText) {
      els.storageUsageText.textContent = status.available
        ? `${usage.formatted} used · ${Utils.pluralize(noteCount, 'note')} · ${Utils.pluralize(
            categoryCount,
            'category',
            'categories'
          )}`
        : 'Local storage is blocked · session-only mode';
    }
  }

  function notifyStorageError(message) {
    if (!message) return;

    const now = Date.now();
    if (storageToast.message === message && now - storageToast.at < 6000) return;

    storageToast = { message, at: now };
    Utils.toast(message, 'error', 6000);
    updateStorageStatus();
  }

  function handleStorageError(event) {
    const message =
      (event && event.detail && event.detail.message) || 'Your changes could not be saved.';
    notifyStorageError(message);
  }

  /* --------------------------------- Theme --------------------------------- */

  function applyTheme(mode, animate, persist) {
    const nextMode = THEME_MODES.includes(mode) ? mode : 'system';

    if (persist !== false) {
      settings.theme = nextMode;
      Storage.saveSettings(settings);
    }

    const isDark =
      nextMode === 'dark' || (nextMode === 'system' && darkQuery.matches);
    const root = document.documentElement;

    if (animate) {
      root.classList.add('theme-changing');
      window.clearTimeout(themeTimer);
      themeTimer = window.setTimeout(() => {
        root.classList.remove('theme-changing');
        themeTimer = null;
      }, 260);
    }

    root.dataset.theme = isDark ? 'dark' : 'light';
    root.style.colorScheme = isDark ? 'dark' : 'light';

    if (els.themeColorMeta) {
      els.themeColorMeta.setAttribute('content', isDark ? '#08070d' : '#f4f2fb');
    }

    if (els.themeToggle) {
      els.themeToggle.setAttribute('aria-pressed', String(isDark));
      els.themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    if (els.themeToggleIcon) {
      els.themeToggleIcon.innerHTML = Utils.icon(isDark ? 'sun' : 'moon');
    }

    syncThemeOptions(nextMode);

    if (NativeAndroid) NativeAndroid.setStatusBarTheme(isDark);

    if (persist !== false) updateStorageStatus();
  }

  function syncThemeOptions(mode) {
    Utils.$$('[data-theme-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.themeMode === mode));
    });
  }

  function toggleTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    applyTheme(isDark ? 'light' : 'dark', true);
  }

  function handleSystemThemeChange() {
    if (settings.theme === 'system') applyTheme('system', true, false);
  }

  /* ------------------------------- Sidebar --------------------------------- */

  function openSidebar() {
    if (!els.app) return;
    els.app.classList.add('sidebar-open');
    if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = false;
    if (els.menuButton) els.menuButton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (!els.app) return;
    els.app.classList.remove('sidebar-open');
    if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = true;
    if (els.menuButton) els.menuButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function closeSidebarOnDesktop() {
    if (!mobileQuery.matches) closeSidebar();
  }

  /* -------------------------------- Filters -------------------------------- */

  function handleSearchInput() {
    const value = els.searchInput.value;
    els.clearSearch.hidden = value.trim() === '';
    debouncedSearch(value);
  }

  function handleSearchKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      debouncedSearch.flush();
      els.searchInput.blur();
    } else if (event.key === 'Escape' && els.searchInput.value) {
      event.preventDefault();
      clearSearch();
    }
  }

  function clearSearch() {
    els.searchInput.value = '';
    els.clearSearch.hidden = true;
    debouncedSearch.cancel();
    Filters.setState({ query: '' });
    render();
    els.searchInput.focus();
  }

  function handleSortChange() {
    const value = els.sortSelect.value;
    if (!Filters.isValidSort(value)) return;

    Filters.setState({ sort: value });
    settings.sort = value;
    persistSettings();
    render();
  }

  function selectView(view) {
    if (!Filters.VIEWS.includes(view)) return;
    currentPage = view === 'archive' || view === 'trash' ? 'archive' : 'notes';
    Filters.setState({ view, categoryId: 'all' });
    render();
    closeSidebar();
  }

  function selectCategory(categoryId) {
    currentPage = 'notes';
    if (categoryId !== 'all' && !Notes.getCategory(categoryId)) {
      Filters.setState({ categoryId: 'all' });
    } else {
      Filters.setState({ view: 'all', categoryId });
    }
    render();
    closeSidebar();
  }

  function setViewMode(mode) {
    if (mode !== 'grid' && mode !== 'list') return;

    Filters.setState({ viewMode: mode });
    settings.viewMode = mode;
    persistSettings();
    render();
  }

  function resetFilters() {
    Filters.reset();
    els.searchInput.value = '';
    els.clearSearch.hidden = true;
    debouncedSearch.cancel();
    render();
    closeSidebar();
  }

  function goHome() {
    setPage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* -------------------------------- Notes ---------------------------------- */

  function getDefaultCategory() {
    const state = Filters.getState();
    return state.categoryId !== 'all' && Notes.getCategory(state.categoryId)
      ? state.categoryId
      : null;
  }

  function openNewNote() {
    closeSidebar();
    Editor.open(null);
  }

  function openNote(noteId) {
    if (!noteId) return;
    if (!Notes.get(noteId)) {
      Utils.toast('That note could not be found.', 'error');
      render();
      return;
    }
    Editor.open(noteId);
  }

  function togglePin(noteId) {
    const note = Notes.get(noteId);
    if (!note) return;

    const pinned = !note.pinned;
    Notes.update(noteId, { pinned });
    render();
    Utils.toast(pinned ? 'Note pinned to the top.' : 'Note unpinned.', pinned ? 'success' : 'info');
  }

  function toggleFavorite(noteId) {
    const note = Notes.get(noteId);
    if (!note) return;

    const favorite = !note.favorite;
    Notes.update(noteId, { favorite });
    render();
    Utils.toast(
      favorite ? 'Added to favorites.' : 'Removed from favorites.',
      favorite ? 'success' : 'info'
    );
  }

  function exportNote(noteId) {
    Editor.exportNote(noteId);
  }

  async function deleteNote(noteId) {
    const note = Notes.get(noteId);
    if (!note || note.deletedAt) return;

    const confirmed = await Utils.confirmAction({
      title: 'Move to Recently Deleted?',
      message: `“${Notes.displayTitle(note)}” will be moved to Recently Deleted. You can restore it before permanent deletion.`,
      confirmLabel: 'Move to trash',
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    Notes.moveToTrash(noteId);
    render();
    Utils.toast('Note moved to Recently Deleted.', 'success');
  }

  async function archiveNote(noteId) {
    const note = Notes.get(noteId);
    if (!note || note.deletedAt) return;
    Notes.archiveNote(noteId);
    render();
    Utils.toast('Note moved to the Shadow Archive.', 'success');
  }

  async function restoreNote(noteId) {
    const note = Notes.get(noteId);
    if (!note) return;
    if (note.deletedAt) {
      Notes.restoreFromTrash(noteId);
      Utils.toast('Note restored from Recently Deleted.', 'success');
    } else if (note.archivedAt) {
      Notes.restoreArchivedNote(noteId);
      Utils.toast('Note restored to your notes.', 'success');
    }
    render();
  }

  async function permanentDelete(noteId) {
    const note = Notes.get(noteId);
    if (!note || !note.deletedAt) return;

    const confirmed = await Utils.confirmAction({
      title: 'Delete forever?',
      message: `“${Notes.displayTitle(note)}” will be permanently removed from this device. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    Notes.remove(noteId);
    render();
    Utils.toast('Note permanently deleted.', 'success');
  }

  async function handleEditorChange(note) {
    if (note && Gamification) {
      await Gamification.awardForNote(note.id);
    }
    render();
  }

  function handleEditorClose() {
    render();
  }

  /* ------------------------------- Categories ------------------------------ */

  function pickNextColor() {
    const used = new Set(Notes.getCategories().map((category) => category.color));
    return (
      Notes.CATEGORY_COLORS.find((color) => !used.has(color)) ||
      Notes.CATEGORY_COLORS[Notes.getCategories().length % Notes.CATEGORY_COLORS.length] ||
      Notes.CATEGORY_COLORS[0]
    );
  }

  function openCategoriesDialog() {
    if (!els.categoriesDialog) return;

    closeSidebar();
    editingCategoryId = null;
    selectedColor = pickNextColor();
    els.categoryName.value = '';
    clearCategoryError();
    renderColorOptions();
    renderCategoryManage();
    Utils.openDialog(els.categoriesDialog);

    window.setTimeout(() => {
      if (els.categoriesDialog.open) els.categoryName.focus();
    }, 40);
  }

  function renderColorOptions() {
    if (!els.colorOptions) return;

    els.colorOptions.innerHTML = Notes.CATEGORY_COLORS.map(
      (color) => `
        <button class="color-swatch" type="button" data-color="${Utils.escapeHTML(color)}"
          style="--swatch: ${Utils.escapeHTML(color)}"
          aria-pressed="${color === selectedColor}"
          aria-label="Choose colour ${Utils.escapeHTML(color)}"
          title="${Utils.escapeHTML(color)}"></button>`
    ).join('');
  }

  function handleColorClick(event) {
    const swatch = event.target.closest('.color-swatch');
    if (!swatch) return;

    selectedColor = swatch.dataset.color;
    renderColorOptions();
  }

  function renderCategoryManage() {
    if (!els.categoryManageList) return;

    const categories = Notes.getCategories();
    const counts = Notes.counts();

    if (categories.length === 0) {
      els.categoryManageList.innerHTML =
        '<p class="category-manage__empty">No categories yet. Add one above to start organizing your notes.</p>';
      return;
    }

    els.categoryManageList.innerHTML = categories
      .map((category) => {
        const name = Utils.escapeHTML(category.name);
        const color = Utils.escapeHTML(category.color);
        const count = counts.byCategory[category.id] || 0;
        const isEditing = category.id === editingCategoryId;

        if (isEditing) {
          return `
            <div class="category-row" data-category-row="${Utils.escapeHTML(category.id)}">
              <span class="category-dot" style="--cat-color: ${color}"></span>
              <div class="category-row__rename">
                <input class="text-input" type="text" maxlength="24"
                  data-rename-input="${Utils.escapeHTML(category.id)}"
                  value="${name}" aria-label="New name for ${name}" />
                <button class="btn btn--primary btn--sm" type="button"
                  data-category-save="${Utils.escapeHTML(category.id)}">Save</button>
                <button class="btn btn--ghost btn--sm" type="button"
                  data-category-cancel>Cancel</button>
              </div>
            </div>`;
        }

        return `
          <div class="category-row" data-category-row="${Utils.escapeHTML(category.id)}">
            <span class="category-dot" style="--cat-color: ${color}"></span>
            <span class="category-row__name">${name}</span>
            <span class="category-row__count">${Utils.pluralize(count, 'note')}</span>
            <div class="category-row__actions">
              <button class="icon-btn icon-btn--xs" type="button"
                data-category-edit="${Utils.escapeHTML(category.id)}"
                title="Rename category" aria-label="Rename ${name}">
                ${Utils.icon('edit')}
              </button>
              <button class="icon-btn icon-btn--xs icon-btn--danger" type="button"
                data-category-delete="${Utils.escapeHTML(category.id)}"
                title="Delete category" aria-label="Delete ${name}">
                ${Utils.icon('trash')}
              </button>
            </div>
          </div>`;
      })
      .join('');

    if (editingCategoryId) {
      window.setTimeout(() => {
        const input = els.categoryManageList.querySelector('[data-rename-input]');
        if (input) {
          input.focus();
          input.select();
        }
      }, 20);
    }
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();

    const result = Notes.addCategory(els.categoryName.value, selectedColor);

    if (!result.ok) {
      showCategoryError(result.error);
      els.categoryName.focus();
      return;
    }

    if (Gamification) await Gamification.awardForFolder(result.category.id);
    els.categoryName.value = '';
    selectedColor = pickNextColor();
    clearCategoryError();
    renderColorOptions();
    renderCategoryManage();
    render();
    Utils.toast('Category added.', 'success');
    els.categoryName.focus();
  }

  function showCategoryError(message) {
    if (!els.categoryError) return;
    els.categoryError.textContent = message;
    els.categoryError.hidden = false;
    els.categoryName.setAttribute('aria-invalid', 'true');
  }

  function clearCategoryError() {
    if (!els.categoryError) return;
    els.categoryError.hidden = true;
    els.categoryError.textContent = '';
    els.categoryName.removeAttribute('aria-invalid');
  }

  function handleCategoryManageClick(event) {
    const editButton = event.target.closest('[data-category-edit]');
    if (editButton) {
      editingCategoryId = editButton.dataset.categoryEdit;
      renderCategoryManage();
      return;
    }

    const cancelButton = event.target.closest('[data-category-cancel]');
    if (cancelButton) {
      editingCategoryId = null;
      renderCategoryManage();
      return;
    }

    const saveButton = event.target.closest('[data-category-save]');
    if (saveButton) {
      saveCategoryRename(saveButton.dataset.categorySave);
      return;
    }

    const deleteButton = event.target.closest('[data-category-delete]');
    if (deleteButton) {
      deleteCategory(deleteButton.dataset.categoryDelete);
    }
  }

  function handleCategoryManageKeydown(event) {
    const input = event.target.closest('[data-rename-input]');
    if (!input) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      saveCategoryRename(input.dataset.renameInput);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      editingCategoryId = null;
      renderCategoryManage();
    }
  }

  async function saveCategoryRename(categoryId) {
    const input = els.categoryManageList.querySelector(
      `[data-rename-input="${categoryId}"]`
    );
    const value = input ? input.value : '';
    const result = Notes.renameCategory(categoryId, value);

    if (!result.ok) {
      Utils.toast(result.error, 'error');
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }

    if (Gamification) await Gamification.awardForFolder(categoryId);
    editingCategoryId = null;
    renderCategoryManage();
    render();
    Utils.toast('Category renamed.', 'success');
  }

  async function deleteCategory(categoryId) {
    const category = Notes.getCategory(categoryId);
    if (!category) return;

    const count = Notes.counts().byCategory[categoryId] || 0;
    const confirmed = await Utils.confirmAction({
      title: 'Delete this category?',
      message:
        count > 0
          ? `“${category.name}” will be removed. ${Utils.pluralize(
              count,
              'note'
            )} will become uncategorized, but no note content is lost.`
          : `“${category.name}” will be removed. You can add it again at any time.`,
      confirmLabel: 'Delete category',
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    const result = Notes.deleteCategory(categoryId);
    if (!result.ok) {
      Utils.toast('That category could not be deleted.', 'error');
      return;
    }

    if (Filters.getState().categoryId === categoryId) {
      Filters.setState({ categoryId: 'all' });
    }
    if (editingCategoryId === categoryId) editingCategoryId = null;
    if (selectedColor === category.color) selectedColor = pickNextColor();

    renderColorOptions();
    renderCategoryManage();
    render();
    Utils.toast(
      result.affected > 0
        ? `Category deleted. ${Utils.pluralize(result.affected, 'note')} moved to Uncategorized.`
        : 'Category deleted.',
      'success'
    );
  }

  function clearQuestError() {
    if (!els.questError) return;
    els.questError.hidden = true;
    els.questError.textContent = '';
    if (els.questTitle) els.questTitle.removeAttribute('aria-invalid');
  }

  function showQuestError(message) {
    if (!els.questError) return;
    els.questError.textContent = message;
    els.questError.hidden = false;
    if (els.questTitle) els.questTitle.setAttribute('aria-invalid', 'true');
  }

  async function handleQuestSubmit(event) {
    event.preventDefault();
    if (!Gamification) return;
    const result = Gamification.addQuest(els.questTitle.value, els.questXp ? els.questXp.value : 20);
    if (!result.ok) {
      showQuestError(result.error);
      els.questTitle.focus();
      return;
    }
    els.questTitle.value = '';
    clearQuestError();
    render();
    Utils.toast('Quest added.', 'success');
    els.questTitle.focus();
  }

  async function completeQuest(questId) {
    if (!Gamification) return;
    const didComplete = await Gamification.completeQuest(questId);
    if (didComplete && NativeAndroid) NativeAndroid.haptic('success');
    render();
  }

  function removeQuest(questId) {
    if (!Gamification) return;
    Gamification.removeQuest(questId);
    render();
    Utils.toast('Quest removed.', 'info');
  }

  /* -------------------------------- Settings ------------------------------- */

  function openSettingsDialog() {
    if (!els.settingsDialog) return;

    closeSidebar();
    if (els.settingsSort) els.settingsSort.value = settings.sort;
    syncThemeOptions(settings.theme);
    updateStorageStatus();
    Utils.openDialog(els.settingsDialog);
  }

  function handleDefaultSortChange() {
    const value = els.settingsSort.value;
    if (!Filters.isValidSort(value)) return;

    Filters.setState({ sort: value });
    settings.sort = value;
    persistSettings();
    render();
  }

  async function exportBackup() {
    const backup = Notes.createBackup();
    const filename = `noteflow-backup-${Utils.todayFileStamp()}.json`;
    const text = JSON.stringify(backup, null, 2);

    if (NativeAndroid && NativeAndroid.isNative) {
      const ok = await NativeAndroid.shareFile(filename, text, 'NoteFlow backup');
      Utils.toast(
        ok ? 'Share sheet opened.' : 'Sharing could not start. Please try again.',
        ok ? 'success' : 'error'
      );
      return;
    }

    const ok = Utils.downloadFile(filename, text, 'application/json;charset=utf-8');

    if (ok) {
      Utils.toast('Backup exported as a JSON file.', 'success');
    } else {
      Utils.toast('The backup download could not start. Please try again.', 'error');
    }
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
      reader.readAsText(file);
    });
  }

  async function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const text = await readFileText(file);
      let payload;

      try {
        payload = JSON.parse(text);
      } catch (error) {
        Utils.toast('That file is not valid JSON. Choose a NoteFlow backup file.', 'error');
        return;
      }

      const result = Notes.validateBackup(payload);
      if (!result.ok) {
        Utils.toast(result.error, 'error');
        return;
      }

      const confirmed = await Utils.confirmAction({
        title: 'Restore this backup?',
        message: `This will replace your current notes and categories with ${Utils.pluralize(
          result.noteCount,
          'note'
        )} and ${Utils.pluralize(result.categoryCount, 'category', 'categories')}.`,
        confirmLabel: 'Restore backup',
        tone: 'info',
        icon: 'upload',
      });

      if (!confirmed) return;

      const restored = Notes.restoreBackup(result.data);
      Filters.reset();
      els.searchInput.value = '';
      els.clearSearch.hidden = true;
      Filters.setState({ sort: settings.sort, viewMode: settings.viewMode });
      render();

      Utils.toast(
        `Backup restored — ${Utils.pluralize(restored.noteCount, 'note')} and ${Utils.pluralize(
          restored.categoryCount,
          'category',
          'categories'
        )}.`,
        'success',
        5000
      );
    } catch (error) {
      console.error('NoteFlow could not import the backup.', error);
      Utils.toast('That backup could not be read. Please try another file.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  async function deleteAllNotes() {
    const total = Notes.counts().all + Notes.counts().archive;

    if (total === 0) {
      Utils.toast('There are no notes to move.', 'info');
      return;
    }

    const confirmed = await Utils.confirmAction({
      title: 'Move all notes to trash?',
      message: `All ${Utils.pluralize(total, 'note')} will be moved to Recently Deleted. Categories stay. You can restore them from the Shadow Archive.`,
      confirmLabel: 'Move all to trash',
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    Notes.clearAll();
    Filters.reset();
    els.searchInput.value = '';
    els.clearSearch.hidden = true;
    render();
    Utils.toast('All notes moved to Recently Deleted.', 'success');
  }

  /* ------------------------------- Delegation ------------------------------ */

  function handleDocumentClick(event) {
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) {
      const dialog = closeButton.closest('dialog');
      if (dialog && dialog.open) dialog.close();
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const handled = handleAction(actionButton.dataset.action, actionButton);
      if (handled) {
        event.preventDefault();
        return;
      }
    }

    const themeButton = event.target.closest('[data-theme-mode]');
    if (themeButton) {
      applyTheme(themeButton.dataset.themeMode, true);
      return;
    }

    const viewModeButton = event.target.closest('[data-view-mode]');
    if (viewModeButton) {
      setViewMode(viewModeButton.dataset.viewMode);
      return;
    }

    const pageButton = event.target.closest('[data-page]');
    if (pageButton && pageButton.dataset.page) {
      setPage(pageButton.dataset.page);
      return;
    }

    const openNoteButton = event.target.closest('[data-open-note]');
    if (openNoteButton && openNoteButton.dataset.openNote) {
      openNote(openNoteButton.dataset.openNote);
      return;
    }

    const completeQuestButton = event.target.closest('[data-complete-quest]');
    if (completeQuestButton && completeQuestButton.dataset.completeQuest) {
      completeQuest(completeQuestButton.dataset.completeQuest);
      return;
    }

    const deleteQuestButton = event.target.closest('[data-delete-quest]');
    if (deleteQuestButton && deleteQuestButton.dataset.deleteQuest) {
      removeQuest(deleteQuestButton.dataset.deleteQuest);
      return;
    }

    const viewButton = event.target.closest('[data-view]');
    if (viewButton && viewButton.dataset.view) {
      selectView(viewButton.dataset.view);
      return;
    }

    const categoryButton = event.target.closest('[data-category-id]');
    if (categoryButton) {
      selectCategory(categoryButton.dataset.categoryId);
      return;
    }

    const card = event.target.closest('.note-card');
    if (card) {
      if (event.target.closest('button, a, input, select, textarea')) return;
      if (document.querySelector('dialog[open]')) return;
      openNote(card.dataset.noteId);
    }
  }

  function handleAction(action, button) {
    if (NativeAndroid && ['create-note', 'toggle-pin', 'toggle-favorite', 'toggle-theme', 'export'].includes(action)) {
      NativeAndroid.haptic('light');
    }

    switch (action) {
      case 'create-note':
        openNewNote();
        return true;
      case 'home':
        goHome();
        return true;
      case 'reset-filters':
        resetFilters();
        return true;
      case 'open-categories':
        openCategoriesDialog();
        return true;
      case 'open-settings':
        openSettingsDialog();
        return true;
      case 'toggle-theme':
        toggleTheme();
        return true;
      case 'close-sidebar':
        closeSidebar();
        return true;
      case 'toggle-pin':
        togglePin(button.dataset.noteId);
        return true;
      case 'toggle-favorite':
        toggleFavorite(button.dataset.noteId);
        return true;
      case 'export':
        exportNote(button.dataset.noteId);
        return true;
      case 'delete':
        deleteNote(button.dataset.noteId);
        return true;
      case 'archive-note':
        archiveNote(button.dataset.noteId);
        return true;
      case 'restore-note':
        restoreNote(button.dataset.noteId);
        return true;
      case 'permanent-delete':
        permanentDelete(button.dataset.noteId);
        return true;
      default:
        return false;
    }
  }

  function handleCardKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const card = event.target.closest('.note-card');
    if (!card || event.target.closest('button')) return;

    event.preventDefault();
    openNote(card.dataset.noteId);
  }

  function handleGlobalKeydown(event) {
    if (event.defaultPrevented) return;

    const dialogOpen = document.querySelector('dialog[open]');
    if (dialogOpen) return;

    const modifier = event.metaKey || event.ctrlKey;
    const key = String(event.key || '').toLowerCase();

    if (modifier && !event.altKey && !event.shiftKey) {
      if (key === 'k') {
        event.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        openNewNote();
        return;
      }
    }

    if (event.key === 'Escape') {
      if (els.app.classList.contains('sidebar-open')) {
        closeSidebar();
        return;
      }
      if (document.activeElement === els.searchInput && els.searchInput.value) {
        clearSearch();
      }
    }
  }

  /* -------------------------------- Boot ----------------------------------- */

  document.addEventListener('keydown', handleCardKeydown);
  init();

  NoteFlow.App = {
    render,
    resetFilters,
    openNewNote,
    handleAndroidBack,
  };
})((window.NoteFlow = window.NoteFlow || {}));
