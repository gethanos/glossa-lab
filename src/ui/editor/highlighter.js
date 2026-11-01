// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Χρωματισμός σύνταξης ανά γραμμή (ανεκτικός σε λάθη, δεν πετά εξαιρέσεις).
import { DECL_TYPES, RETURN_TYPES, normalize } from '../../core/tokens.js';
import { getDialect } from '../../core/dialects.js';
import { builtinsFor } from '../../core/builtins.js';
import { escapeHtml } from '../dom.js';

const WORD = /[A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF]/;
const LITERALS = new Set(['ΑΛΗΘΗΣ', 'ΨΕΥΔΗΣ']);
const OPERATORS = new Set(['ΚΑΙ', 'Η', 'ΟΧΙ', 'DIV', 'MOD']);
const QUOTE_PAIRS = { "'": "'", '"': '"', '‘': '’', '“': '”' };

function classify(word, dialect, builtins) {
  const n = normalize(word);
  if (LITERALS.has(n)) return 'tk-bool';
  if (OPERATORS.has(n)) return 'tk-opword';
  if (dialect.staticTypes && (DECL_TYPES[n] || RETURN_TYPES[n])) return 'tk-type';
  if (dialect.keywords.has(n)) return 'tk-kw';
  if (builtins[n]) return 'tk-builtin';
  return 'tk-id';
}

const span = (cls, text) => `<span class="${cls}">${escapeHtml(text)}</span>`;

/**
 * @param {string} text μία γραμμή κώδικα
 * @param {'glossa'|'pseudo'} dialectId
 */
export function highlightLine(text, dialectId = 'glossa') {
  const dialect = getDialect(dialectId);
  const builtins = builtinsFor(dialect.id);
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '!') { out += span('tk-comment', text.slice(i)); break; }
    if (QUOTE_PAIRS[ch]) {
      const close = QUOTE_PAIRS[ch];
      let j = i + 1;
      while (j < text.length && text[j] !== close && text[j] !== ch) j++;
      out += span('tk-str', text.slice(i, Math.min(j + 1, text.length)));
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j]) && !(text[j] === '.' && text[j + 1] === '.')) j++;
      out += span('tk-num', text.slice(i, j));
      i = j;
      continue;
    }
    if (WORD.test(ch)) {
      let j = i;
      while (j < text.length && WORD.test(text[j])) j++;
      const word = text.slice(i, j);
      out += span(classify(word, dialect, builtins), word);
      i = j;
      continue;
    }
    if (text.startsWith('<-', i) || ch === '←') {
      const len = ch === '←' ? 1 : 2;
      out += span('tk-assign', text.slice(i, i + len));
      i += len;
      continue;
    }
    if (/[=<>+\-*/^(),:[\]&.≤≥≠]/.test(ch)) { out += span('tk-op', ch); i++; continue; }
    out += escapeHtml(ch);
    i++;
  }
  return out;
}

export function highlight(source, dialectId = 'glossa') {
  return source.split('\n').map((line) => highlightLine(line, dialectId)).join('\n');
}
