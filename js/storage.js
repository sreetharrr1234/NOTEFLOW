/* ==========================================================================
   NoteFlow — storage.js
   A safe LocalStorage wrapper with an in-memory fallback.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const KEYS = Object.freeze({
    notes: 'noteflow.notes.v1',
    categories: 'noteflow.categories.v1',
    settings: 'noteflow.settings.v1',
    meta: 'noteflow.meta.v1',
    gamification: 'noteflow.gamification.v1',
  });

  const memory = Object.create(null);
  let available = detectStorage();
  let lastError = null;
  let lastWriteOk = true;

  function detectStorage() {
    try {
      const testKey = '__noteflow_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn('NoteFlow: LocalStorage is unavailable. Using session-only storage.', error);
      return false;
    }
  }

  function reportError(message, error) {
    lastError = message;
    lastWriteOk = false;
    console.warn(`NoteFlow storage: ${message}`, error || '');
    try {
      window.dispatchEvent(
        new CustomEvent('noteflow:storage-error', {
          detail: { message },
        })
      );
    } catch (dispatchError) {
      // CustomEvent is widely supported; never let reporting break the app.
    }
  }

  function readRaw(key) {
    if (available) {
      try {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
          memory[key] = value;
          return value;
        }
      } catch (error) {
        available = false;
        reportError('Your browser blocked access to local storage.', error);
      }
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  function readJSON(key, fallback) {
    const raw = readRaw(key);
    if (raw === null) return fallback;

    try {
      return JSON.parse(raw);
    } catch (error) {
      reportError('Some saved data could not be read and was skipped.', error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    let raw;
    try {
      raw = JSON.stringify(value);
    } catch (error) {
      reportError('This data could not be prepared for saving.', error);
      return false;
    }

    // Keep a session copy even if persistence fails.
    memory[key] = raw;
    lastWriteOk = true;
    lastError = null;

    if (!available) {
      reportError('Local storage is unavailable. Changes will only last this session.');
      return false;
    }

    try {
      window.localStorage.setItem(key, raw);
      return true;
    } catch (error) {
      const isQuotaError =
        error &&
        (error.name === 'QuotaExceededError' ||
          error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          error.code === 22);
      if (isQuotaError) {
        reportError('Local storage is full. Export a backup, then remove some notes.', error);
      } else if (error && error.name === 'SecurityError') {
        available = false;
        reportError('Your browser blocked local storage. Changes will only last this session.', error);
      } else {
        reportError('Your changes could not be saved to local storage.', error);
      }
      return false;
    }
  }

  function removeKey(key) {
    delete memory[key];
    if (!available) return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      reportError('Saved data could not be removed from local storage.', error);
      return false;
    }
  }

  const Storage = {
    KEYS,

    loadNotes() {
      return readJSON(KEYS.notes, null);
    },

    saveNotes(notes) {
      return writeJSON(KEYS.notes, notes);
    },

    loadCategories() {
      return readJSON(KEYS.categories, null);
    },

    saveCategories(categories) {
      return writeJSON(KEYS.categories, categories);
    },

    loadSettings() {
      const saved = readJSON(KEYS.settings, {});
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    },

    saveSettings(settings) {
      return writeJSON(KEYS.settings, settings);
    },

    loadMeta() {
      const saved = readJSON(KEYS.meta, {});
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    },

    saveMeta(meta) {
      return writeJSON(KEYS.meta, meta);
    },

    loadGamification() {
      const saved = readJSON(KEYS.gamification, null);
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
    },

    saveGamification(data) {
      return writeJSON(KEYS.gamification, data);
    },

    removeKey,

    /**
     * Approximate UTF-8 size of everything NoteFlow stores.
     */
    getUsage() {
      let raw = '';
      Object.keys(KEYS).forEach((name) => {
        const key = KEYS[name];
        if (available) {
          try {
            const value = window.localStorage.getItem(key);
            if (value !== null) {
              raw += value;
              return;
            }
          } catch (error) {
            // Fall through to the in-memory copy.
          }
        }
        if (memory[key]) raw += memory[key];
      });

      let bytes = 0;
      try {
        bytes = new Blob([raw]).size;
      } catch (error) {
        bytes = raw.length * 2;
      }

      return {
        bytes,
        formatted: NoteFlow.Utils ? NoteFlow.Utils.formatBytes(bytes) : `${bytes} B`,
        available,
      };
    },

    isAvailable() {
      return available;
    },

    getStatus() {
      return {
        available,
        lastError,
        lastWriteOk,
      };
    },
  };

  NoteFlow.Storage = Storage;
})((window.NoteFlow = window.NoteFlow || {}));
