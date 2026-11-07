/* ==========================================================================
   NoteFlow — search.js
   Case- and accent-insensitive search with safe result highlighting.
   ========================================================================== */
(function (NoteFlow) {
  'use strict';

  const Utils = NoteFlow.Utils;

  function normalize(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function queryTokens(query) {
    const clean = normalize(query);
    return clean ? clean.split(' ').filter(Boolean) : [];
  }

  function rawTokens(query) {
    return String(query == null ? '' : query)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  /**
   * A note matches when every search token appears in its title or content.
   */
  function noteMatches(note, query) {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return true;

    const haystack = normalize(`${note.title || ''}\n${note.content || ''}`);
    return tokens.every((token) => haystack.includes(token));
  }

  function filter(notes, query) {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return notes.slice();
    return notes.filter((note) => noteMatches(note, query));
  }

  /**
   * Escape text and wrap matching words in <mark> elements.
   * Escaping happens per text segment so search terms can never inject markup.
   */
  function highlight(value, query) {
    const source = String(value == null ? '' : value);
    const tokens = rawTokens(query);

    if (tokens.length === 0) return Utils.escapeHTML(source);

    const pattern = Array.from(new Set(tokens))
      .sort((a, b) => b.length - a.length)
      .map((token) => Utils.escapeRegExp(token))
      .join('|');

    if (!pattern) return Utils.escapeHTML(source);

    let regex;
    try {
      regex = new RegExp(pattern, 'gi');
    } catch (error) {
      return Utils.escapeHTML(source);
    }

    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(source)) !== null) {
      result += Utils.escapeHTML(source.slice(lastIndex, match.index));
      result += `<mark>${Utils.escapeHTML(match[0])}</mark>`;
      lastIndex = match.index + match[0].length;

      if (match[0].length === 0) regex.lastIndex += 1;
    }

    result += Utils.escapeHTML(source.slice(lastIndex));
    return result;
  }

  /**
   * Build a compact, highlighted preview around the first match.
   */
  function buildSnippet(content, query, maxLength) {
    const limit = maxLength || 175;
    const clean = String(content == null ? '' : content).replace(/\s+/g, ' ').trim();
    if (!clean) return '';

    const lower = clean.toLowerCase();
    let matchIndex = -1;

    const tokens = rawTokens(query);
    tokens.some((token) => {
      const index = lower.indexOf(token.toLowerCase());
      if (index !== -1 && (matchIndex === -1 || index < matchIndex)) matchIndex = index;
      return index !== -1;
    });

    let start = 0;
    let end = Math.min(clean.length, limit);

    if (matchIndex !== -1) {
      start = Math.max(0, matchIndex - 55);
      end = Math.min(clean.length, start + limit);

      if (start > 0) {
        const nextSpace = clean.indexOf(' ', start);
        if (nextSpace !== -1 && nextSpace < start + 18) start = nextSpace + 1;
      }
      if (end < clean.length) {
        const previousSpace = clean.lastIndexOf(' ', end);
        if (previousSpace > start + limit * 0.6) end = previousSpace;
      }
    }

    let snippet = clean.slice(start, end);
    if (start > 0) snippet = `…${snippet}`;
    if (end < clean.length) snippet = `${snippet}…`;

    return highlight(snippet, query);
  }

  NoteFlow.Search = {
    normalize,
    queryTokens,
    noteMatches,
    filter,
    highlight,
    buildSnippet,
  };
})((window.NoteFlow = window.NoteFlow || {}));
