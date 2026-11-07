/* ==========================================================================
   NoteFlow — editor.js
   The note editor, autosave lifecycle, and TXT export.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = NoteFlow.Utils;
  const Notes = NoteFlow.Notes;
  const Storage = NoteFlow.Storage;

  const SAVE_DELAY = 550;
  const STATUS_RESET_DELAY = 1900;

  let initialized = false;
  let currentId = null;
  let isNewNote = false;
  let pinned = false;
  let favorite = false;
  let dirty = false;
  let closing = false;
  let statusResetTimer = null;
  let callbacks = {};
  let debouncedSave = null;

  const els = {};

  /* --------------------------------- Init ---------------------------------- */

  function init(options) {
    if (initialized) return;

    callbacks = options || {};
    els.dialog = Utils.$('#editorDialog');
    els.title = Utils.$('#editorTitle');
    els.content = Utils.$('#editorContent');
    els.category = Utils.$('#editorCategory');
    els.dates = Utils.$('#editorDates');
    els.wordCounter = Utils.$('#wordCounter');
    els.charCounter = Utils.$('#charCounter');
    els.saveStatus = Utils.$('#saveStatus');
    els.saveStatusText = Utils.$('#saveStatusText');
    els.pinButton = Utils.$('[data-editor="pin"]');
    els.favoriteButton = Utils.$('[data-editor="favorite"]');

    if (!els.dialog) {
      console.error('NoteFlow: editor elements are missing.');
      return;
    }

    debouncedSave = Utils.debounce(() => saveNow('auto'), SAVE_DELAY);

    els.dialog.addEventListener('click', handleEditorClick);
    els.dialog.addEventListener('cancel', handleCancel);
    els.dialog.addEventListener('close', handleClosed);
    els.dialog.addEventListener('keydown', handleDialogKeydown);

    els.title.addEventListener('input', handleInput);
    els.content.addEventListener('input', handleInput);
    els.category.addEventListener('change', handleCategoryChange);

    els.title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        els.content.focus();
        const length = els.content.value.length;
        els.content.setSelectionRange(length, length);
      }
    });

    window.addEventListener('beforeunload', flushForUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && currentId && dirty) {
        debouncedSave.cancel();
        saveNow('hidden');
      }
    });

    // Keep shortcut labels platform-aware.
    const saveKbd = Utils.$('#editorSaveKbd');
    if (saveKbd) saveKbd.textContent = `${Utils.modKey} S`;

    initialized = true;
  }

  /* --------------------------------- Open ---------------------------------- */

  function open(noteId) {
    if (!els.dialog) return;
    if (els.dialog.open) return;

    let note = noteId ? Notes.get(noteId) : null;

    if (noteId && !note) {
      Utils.toast('That note could not be found.', 'error');
      return;
    }

    if (!note) {
      const defaultCategory =
        typeof callbacks.getDefaultCategory === 'function' ? callbacks.getDefaultCategory() : null;
      note = Notes.create({ categoryId: defaultCategory });
      isNewNote = true;
    } else {
      isNewNote = false;
    }

    currentId = note.id;
    pinned = Boolean(note.pinned);
    favorite = Boolean(note.favorite);
    dirty = false;
    closing = false;

    populateCategories(note.categoryId);
    els.title.value = note.title;
    els.content.value = note.content;

    updateToggleButtons();
    updateCounters();
    updateDates(note);
    resetStatusForOpen();

    if (isNewNote && typeof callbacks.onChange === 'function') {
      callbacks.onChange(note);
    }

    Utils.openDialog(els.dialog);

    window.setTimeout(() => {
      if (!els.dialog.open) return;
      if (!note.title) {
        els.title.focus();
      } else if (!note.content) {
        els.content.focus();
        els.content.setSelectionRange(0, 0);
      } else {
        els.content.focus({ preventScroll: true });
        els.content.setSelectionRange(0, 0);
        els.content.scrollTop = 0;
      }
    }, 30);
  }

  function populateCategories(selectedId) {
    els.category.replaceChildren();

    const uncategorized = document.createElement('option');
    uncategorized.value = '';
    uncategorized.textContent = 'Uncategorized';
    els.category.appendChild(uncategorized);

    Notes.getCategories().forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      els.category.appendChild(option);
    });

    const hasSelection = Notes.getCategories().some((category) => category.id === selectedId);
    els.category.value = hasSelection ? selectedId : '';
  }

  /* -------------------------------- Editing -------------------------------- */

  function handleInput() {
    dirty = true;
    updateCounters();
    setStatus('saving', 'Saving…');
    debouncedSave();
  }

  function handleCategoryChange() {
    dirty = true;
    setStatus('saving', 'Saving…');
    debouncedSave.cancel();
    saveNow('category');
  }

  function handleEditorClick(event) {
    const button = event.target.closest('[data-editor]');
    if (!button) return;

    const action = button.dataset.editor;

    if (action === 'close' || action === 'done') {
      requestClose();
    } else if (action === 'pin') {
      togglePin();
    } else if (action === 'favorite') {
      toggleFavorite();
    } else if (action === 'export') {
      exportCurrentNote();
    } else if (action === 'archive') {
      archiveCurrentNote();
    } else if (action === 'delete') {
      requestDelete();
    }
  }

  function togglePin() {
    pinned = !pinned;
    dirty = true;
    updateToggleButtons();
    debouncedSave.cancel();
    saveNow('pin');
  }

  function toggleFavorite() {
    favorite = !favorite;
    dirty = true;
    updateToggleButtons();
    debouncedSave.cancel();
    saveNow('favorite');
  }

  function updateToggleButtons() {
    if (!els.pinButton || !els.favoriteButton) return;

    els.pinButton.setAttribute('aria-pressed', String(pinned));
    els.pinButton.title = pinned ? 'Unpin note' : 'Pin note';
    els.pinButton.setAttribute('aria-label', pinned ? 'Unpin note' : 'Pin note');

    els.favoriteButton.setAttribute('aria-pressed', String(favorite));
    els.favoriteButton.title = favorite ? 'Remove from favorites' : 'Add to favorites';
    els.favoriteButton.setAttribute(
      'aria-label',
      favorite ? 'Remove from favorites' : 'Add to favorites'
    );
  }

  function updateCounters() {
    const words = Utils.wordCount(els.content.value);
    const characters = Utils.charCount(els.content.value);
    els.wordCounter.textContent = Utils.pluralize(words, 'word');
    els.charCounter.textContent = Utils.pluralize(characters, 'character');
  }

  function updateDates(note) {
    if (!note) {
      els.dates.textContent = '';
      return;
    }
    els.dates.textContent = `Created ${Utils.formatFullDate(note.createdAt)} · Updated ${Utils.formatFullDate(
      note.updatedAt
    )}`;
  }

  function setStatus(state, text) {
    if (!els.saveStatus || !els.saveStatusText) return;
    els.saveStatus.dataset.state = state;
    els.saveStatusText.textContent = text;
  }

  function resetStatusForOpen() {
    if (statusResetTimer) {
      window.clearTimeout(statusResetTimer);
      statusResetTimer = null;
    }

    if (!Storage.isAvailable()) {
      setStatus('error', 'Session-only mode');
    } else {
      setStatus('saved', 'All changes saved');
    }
  }

  function flashSaved() {
    setStatus('saved', 'Saved just now');
    if (statusResetTimer) window.clearTimeout(statusResetTimer);
    statusResetTimer = window.setTimeout(() => {
      statusResetTimer = null;
      if (currentId && !dirty && els.saveStatus.dataset.state === 'saved') {
        setStatus('saved', 'All changes saved');
      }
    }, STATUS_RESET_DELAY);
  }

  /* -------------------------------- Saving --------------------------------- */

  function saveNow(source) {
    if (!currentId) return null;

    debouncedSave.cancel();
    if (statusResetTimer) {
      window.clearTimeout(statusResetTimer);
      statusResetTimer = null;
    }

    if (!dirty && source !== 'manual') {
      if (Storage.isAvailable()) setStatus('saved', 'All changes saved');
      return Notes.get(currentId);
    }

    const note = Notes.update(currentId, {
      title: els.title.value,
      content: els.content.value,
      categoryId: els.category.value || null,
      pinned,
      favorite,
    });

    if (!note) {
      setStatus('error', 'Note could not be found');
      return null;
    }

    dirty = false;
    updateDates(note);

    const saved = Storage.getStatus().lastWriteOk;
    if (saved) {
      flashSaved();
    } else if (!Storage.isAvailable()) {
      setStatus('error', 'Session-only mode');
    } else {
      setStatus('error', 'Could not save');
    }

    if (typeof callbacks.onChange === 'function') callbacks.onChange(note);
    return note;
  }

  /* -------------------------------- Closing -------------------------------- */

  function isEmptyNote() {
    return !els.title.value.trim() && !els.content.value.trim();
  }

  function requestClose() {
    if (!els.dialog.open || closing) return;
    closing = true;

    debouncedSave.cancel();

    if (isNewNote && isEmptyNote()) {
      if (currentId) Notes.remove(currentId);
      currentId = null;
      isNewNote = false;
      dirty = false;
      if (typeof callbacks.onChange === 'function') callbacks.onChange(null);
      Utils.toast('Empty note discarded.', 'info');
      els.dialog.close();
      return;
    }

    if (dirty) saveNow('close');

    els.dialog.close();
  }

  function handleCancel(event) {
    event.preventDefault();
    requestClose();
  }

  function handleClosed() {
    debouncedSave.cancel();

    if (statusResetTimer) {
      window.clearTimeout(statusResetTimer);
      statusResetTimer = null;
    }

    const hadNote = Boolean(currentId);
    currentId = null;
    isNewNote = false;
    dirty = false;
    closing = false;

    if (hadNote && typeof callbacks.onClose === 'function') callbacks.onClose();
  }

  function flushForUnload() {
    if (!els.dialog || !els.dialog.open) return;

    debouncedSave.cancel();

    if (isNewNote && isEmptyNote()) {
      if (currentId) Notes.remove(currentId);
      return;
    }

    if (currentId && dirty) saveNow('unload');
  }

  /* --------------------------------- Delete -------------------------------- */

  async function requestDelete() {
    if (!currentId || closing) return;

    const note = Notes.get(currentId);
    if (!note) {
      requestClose();
      return;
    }

    const title = Notes.displayTitle(note);
    const confirmed = await Utils.confirmAction({
      title: 'Move to Recently Deleted?',
      message: `“${title}” will be moved to Recently Deleted. You can restore it before permanent deletion.`,
      confirmLabel: 'Move to trash',
      tone: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    debouncedSave.cancel();
    Notes.moveToTrash(currentId);
    currentId = null;
    isNewNote = false;
    dirty = false;
    closing = true;

    if (typeof callbacks.onChange === 'function') callbacks.onChange(null);
    Utils.toast('Note moved to Recently Deleted.', 'success');
    els.dialog.close();
  }

  function archiveCurrentNote() {
    if (!currentId || closing) return;
    if (dirty) saveNow('manual');
    const note = Notes.get(currentId);
    if (!note || note.deletedAt) return;
    Notes.archiveNote(currentId);
    currentId = null;
    isNewNote = false;
    dirty = false;
    closing = true;
    if (typeof callbacks.onChange === 'function') callbacks.onChange(null);
    Utils.toast('Note moved to the Shadow Archive.', 'success');
    els.dialog.close();
  }

  /* --------------------------------- Export -------------------------------- */

  async function shareOrDownloadNote(note) {
    const filename = `${Utils.slugify(Notes.displayTitle(note))}-${Utils.todayFileStamp()}.txt`;
    const text = Notes.toPlainText(note);
    const NativeAndroid = NoteFlow.NativeAndroid;

    if (NativeAndroid && NativeAndroid.isNative) {
      const ok = await NativeAndroid.shareFile(filename, text, Notes.displayTitle(note));
      Utils.toast(
        ok ? 'Share sheet opened.' : 'Sharing could not start. Please try again.',
        ok ? 'success' : 'error'
      );
      return ok;
    }

    const result = Notes.downloadNote(note);
    if (result.ok) {
      Utils.toast('Note exported as a TXT file.', 'success');
    } else {
      Utils.toast('The download could not start. Please try again.', 'error');
    }
    return result.ok;
  }

  function exportCurrentNote() {
    if (!currentId) return false;
    if (dirty) saveNow('manual');

    const note = Notes.get(currentId);
    if (!note) {
      Utils.toast('This note could not be exported.', 'error');
      return false;
    }

    return shareOrDownloadNote(note);
  }

  /**
   * Used by note-card actions as well as the editor.
   */
  function exportNote(noteId) {
    const note = Notes.get(noteId);
    if (!note) {
      Utils.toast('That note could not be exported.', 'error');
      return false;
    }

    if (currentId === noteId && dirty) saveNow('manual');

    return shareOrDownloadNote(note);
  }

  /* ------------------------------- Shortcuts ------------------------------- */

  function handleDialogKeydown(event) {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      dirty = true;
      saveNow('manual');
    }
  }

  NoteFlow.Editor = {
    init,
    open,
    exportNote,
    isOpen: () => Boolean(els.dialog && els.dialog.open),
    currentNoteId: () => currentId,
  };
})((window.NoteFlow = window.NoteFlow || {}));
