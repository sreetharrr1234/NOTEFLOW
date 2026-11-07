/* ==========================================================================
   NoteFlow — utils.js
   Shared helpers: DOM, dates, text, downloads, toasts, and dialogs.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = {};

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const isApple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  const modKey = isApple ? '⌘' : 'Ctrl';

  /* ------------------------------- General -------------------------------- */

  Utils.$ = $;
  Utils.$$ = $$;
  Utils.isApple = isApple;
  Utils.modKey = modKey;

  /**
   * Generate a collision-resistant id without external dependencies.
   */
  Utils.uid = function uid(prefix) {
    const cleanPrefix = String(prefix || 'id').replace(/[^a-z0-9_-]/gi, '');
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${cleanPrefix}_${window.crypto.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 10);
    return `${cleanPrefix}_${Date.now().toString(36)}${random}`;
  };

  Utils.escapeHTML = function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  };

  Utils.escapeRegExp = function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  Utils.icon = function icon(name, className) {
    const safeName = String(name || '').replace(/[^a-z0-9-]/gi, '');
    const extraClass = className ? ` ${className}` : '';
    return `<svg class="icon${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-${safeName}"></use></svg>`;
  };

  Utils.pluralize = function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
  };

  Utils.debounce = function debounce(callback, wait) {
    let timer = null;
    let lastArgs = null;

    function debounced(...args) {
      lastArgs = args;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        callback(...lastArgs);
      }, wait);
    }

    debounced.flush = function flush() {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
      callback(...lastArgs);
    };

    debounced.cancel = function cancel() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    debounced.isPending = () => timer !== null;
    return debounced;
  };

  /* --------------------------------- Dates -------------------------------- */

  const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const shortDateYearFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const dayYearFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  function toValidDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  Utils.formatFullDate = function formatFullDate(value) {
    const date = toValidDate(value);
    return date ? fullDateFormatter.format(date) : '—';
  };

  Utils.formatRelativeTime = function formatRelativeTime(value) {
    const date = toValidDate(value);
    if (!date) return 'Unknown date';

    const now = Date.now();
    const difference = Math.max(0, now - date.getTime());
    const minutes = Math.floor(difference / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;

    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    return (sameYear ? shortDateFormatter : shortDateYearFormatter).format(date);
  };

  Utils.formatDayLabel = function formatDayLabel(value) {
    const date = toValidDate(value) || new Date();
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return (sameYear ? dayFormatter : dayYearFormatter).format(date);
  };

  Utils.greetingForHour = function greetingForHour(hour) {
    const safeHour = Number.isFinite(hour) ? hour : new Date().getHours();
    if (safeHour < 5) return 'Good evening.';
    if (safeHour < 12) return 'Good morning.';
    if (safeHour < 18) return 'Good afternoon.';
    return 'Good evening.';
  };

  /* --------------------------------- Text --------------------------------- */

  Utils.wordCount = function wordCount(text) {
    const clean = String(text || '').trim();
    return clean ? clean.split(/\s+/).length : 0;
  };

  Utils.charCount = function charCount(text) {
    return Array.from(String(text || '')).length;
  };

  Utils.slugify = function slugify(value) {
    const slug = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return slug || 'untitled-note';
  };

  Utils.formatBytes = function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  Utils.todayFileStamp = function todayFileStamp() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  };

  /* -------------------------------- Download ------------------------------ */

  /**
   * Trigger a client-side file download. Returns false if the browser blocks it.
   */
  Utils.downloadFile = function downloadFile(filename, content, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch (error) {
      console.error('NoteFlow could not start the download.', error);
      return false;
    }
  };

  /* --------------------------------- Toasts ------------------------------- */

  const TOAST_ICONS = {
    success: 'check',
    error: 'alert-triangle',
    warning: 'alert-triangle',
    info: 'info',
  };

  Utils.toast = function toast(message, type, duration) {
    const container = $('#toastContainer');
    if (!container || !message) return;

    const tone = TOAST_ICONS[type] ? type : 'success';
    const visibleToasts = $$('.toast', container);
    if (visibleToasts.length >= 3) {
      visibleToasts[0].remove();
    }

    const totalDuration = duration || (tone === 'error' ? 5200 : 3600);
    const element = document.createElement('div');
    element.className = `toast toast--${tone}`;
    element.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    element.style.setProperty('--toast-duration', `${totalDuration}ms`);
    element.innerHTML = `
      <span class="toast__icon">${Utils.icon(TOAST_ICONS[tone])}</span>
      <p class="toast__message">${Utils.escapeHTML(message)}</p>
      <button class="toast__close" type="button" aria-label="Dismiss notification">${Utils.icon('x')}</button>
      <span class="toast__timer" aria-hidden="true"></span>
    `;

    let dismissed = false;
    let timeoutId = null;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      window.clearTimeout(timeoutId);
      element.classList.add('toast--out');
      window.setTimeout(() => element.remove(), 190);
    }

    element.querySelector('.toast__close').addEventListener('click', dismiss);
    timeoutId = window.setTimeout(dismiss, totalDuration);
    container.appendChild(element);
  };

  /* ------------------------------- Confirm -------------------------------- */

  let confirmState = null;
  let confirmInitialized = false;

  function initializeConfirm() {
    if (confirmInitialized) return;
    const dialog = $('#confirmDialog');
    if (!dialog) return;

    const acceptButton = $('#confirmAccept');
    const cancelButton = $('#confirmCancel');

    acceptButton.addEventListener('click', () => resolveConfirm(true));
    cancelButton.addEventListener('click', () => resolveConfirm(false));
    dialog.addEventListener('close', () => {
      if (confirmState) {
        const pending = confirmState;
        confirmState = null;
        pending.resolve(false);
      }
    });

    confirmInitialized = true;
  }

  function resolveConfirm(result) {
    if (!confirmState) return;
    const pending = confirmState;
    confirmState = null;
    const dialog = $('#confirmDialog');
    if (dialog && dialog.open) dialog.close();
    pending.resolve(result);
  }

  /**
   * Promise-based confirmation dialog.
   * @param {{title?: string, message?: string, confirmLabel?: string, cancelLabel?: string,
   *          tone?: 'danger'|'info', icon?: string}} options
   * @returns {Promise<boolean>}
   */
  Utils.confirmAction = function confirmAction(options) {
    initializeConfirm();
    const dialog = $('#confirmDialog');
    if (!dialog) return Promise.resolve(window.confirm((options && options.message) || 'Are you sure?'));

    const settings = Object.assign(
      {
        title: 'Are you sure?',
        message: '',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        tone: 'danger',
        icon: 'alert-triangle',
      },
      options || {}
    );

    // Only one confirmation can be pending at a time.
    if (confirmState) resolveConfirm(false);

    $('#confirmTitle').textContent = settings.title;
    $('#confirmMessage').textContent = settings.message;

    const iconUse = $('#confirmIcon use');
    if (iconUse) iconUse.setAttribute('href', `#icon-${settings.icon}`);

    dialog.dataset.tone = settings.tone === 'info' ? 'info' : 'danger';

    const acceptButton = $('#confirmAccept');
    acceptButton.textContent = settings.confirmLabel;
    acceptButton.className = settings.tone === 'info' ? 'btn btn--primary' : 'btn btn--danger';

    $('#confirmCancel').textContent = settings.cancelLabel;

    return new Promise((resolve) => {
      confirmState = { resolve };
      if (!dialog.open) dialog.showModal();
      // Focus the safe option by default for destructive actions.
      window.setTimeout(() => $('#confirmCancel').focus(), 0);
    });
  };

  /* --------------------------------- Dialog ------------------------------- */

  Utils.openDialog = function openDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    try {
      if (!dialog.open) dialog.showModal();
      return true;
    } catch (error) {
      console.error('NoteFlow could not open the dialog.', error);
      return false;
    }
  };

  Utils.closeDialog = function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  };

  NoteFlow.Utils = Utils;
})((window.NoteFlow = window.NoteFlow || {}));
