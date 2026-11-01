// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Αυτόματη στοίχιση (εσοχές) με βάση τη δομή των εντολών, για ΓΛΩΣΣΑ και ψευδογλώσσα.
// Οι λέξεις των δύο γλωσσών δεν συγκρούονται, οπότε οι κανόνες είναι κοινοί.
import { normalize } from '../../core/tokens.js';

const UNIT_START = new Set(['ΠΡΟΓΡΑΜΜΑ', 'ΣΥΝΑΡΤΗΣΗ', 'ΔΙΑΔΙΚΑΣΙΑ', 'ΑΛΓΟΡΙΘΜΟΣ']);
const UNIT_END = new Set(['ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ', 'ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ', 'ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ', 'ΤΕΛΟΣ']);
const SECTIONS = new Set(['ΣΤΑΘΕΡΕΣ', 'ΜΕΤΑΒΛΗΤΕΣ', 'ΑΡΧΗ']);
// Ξεκινούν μπλοκ. Το ΑΝ μόνο όταν η γραμμή τελειώνει με ΤΟΤΕ (όχι το «Αν … τότε εντολή»).
const OPENERS = new Set(['ΟΣΟ', 'ΓΙΑ', 'ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ', 'ΕΠΑΝΑΛΑΒΕ', 'ΕΠΙΛΕΞΕ']);
const CLOSERS = new Set(['ΤΕΛΟΣ_ΑΝ', 'ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', 'ΜΕΧΡΙΣ_ΟΤΟΥ', 'ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ']);
const MIDDLES = new Set(['ΑΛΛΙΩΣ', 'ΑΛΛΙΩΣ_ΑΝ']);
const WORD = /[A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF]+/g;

export const INDENT = '  ';

export function firstWord(line) {
  const m = line.trim().match(/^[A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF]+/);
  return m ? normalize(m[0]) : '';
}

function lastWord(line) {
  const code = line.split('!')[0];
  const words = code.match(WORD);
  return words ? normalize(words[words.length - 1]) : '';
}

/** Ανοίγει μπλοκ η γραμμή; (το ΑΝ/ΑΛΛΙΩΣ_ΑΝ μόνο όταν τελειώνει με ΤΟΤΕ) */
function opensBlock(word, line) {
  if (word === 'ΑΝ') return lastWord(line) === 'ΤΟΤΕ';
  return OPENERS.has(word);
}

/** Υπολογίζει το επίπεδο εσοχής κάθε γραμμής. */
export function computeLevels(lines) {
  const levels = [];
  const stack = [];
  let level = 0;
  let inlineIf = null; // επίπεδο ενός «Αν … τότε εντολή» που μπορεί να συνεχίζεται με αλλιώς_αν/αλλιώς
  for (const line of lines) {
    const w = firstWord(line);
    if (!line.trim()) { levels.push(0); continue; }
    if (UNIT_START.has(w) || UNIT_END.has(w) || SECTIONS.has(w)) {
      stack.length = 0;
      inlineIf = null;
      levels.push(0);
      level = UNIT_END.has(w) ? 0 : 1;
      continue;
    }
    if (MIDDLES.has(w) && inlineIf !== null && !(stack.length && stack[stack.length - 1].word === 'ΑΝ')) {
      stack.push({ word: 'ΑΝ', level: inlineIf });
    }
    if (w !== 'ΑΝ' || opensBlock(w, line)) inlineIf = null;
    if (CLOSERS.has(w)) {
      const top = stack.pop();
      level = top ? top.level : Math.max(0, level - 1);
      levels.push(level);
      continue;
    }
    if (MIDDLES.has(w)) {
      const top = stack[stack.length - 1];
      const base = top ? top.level : Math.max(0, level - 1);
      levels.push(base);
      level = base + 1;
      continue;
    }
    if (w === 'ΠΕΡΙΠΤΩΣΗ') {
      const top = stack[stack.length - 1];
      const base = top && top.word === 'ΕΠΙΛΕΞΕ' ? top.level + 1 : Math.max(0, level - 1);
      levels.push(base);
      level = base + 1;
      continue;
    }
    levels.push(level);
    if (opensBlock(w, line)) {
      stack.push({ word: w, level });
      level += 1;
    } else if (w === 'ΑΝ') {
      inlineIf = level;
    }
  }
  return levels;
}

export function formatSource(source) {
  const lines = source.split('\n');
  const levels = computeLevels(lines);
  return lines.map((l, i) => (l.trim() ? INDENT.repeat(levels[i]) + l.trim() : '')).join('\n');
}

/** Εσοχή για νέα γραμμή μετά από την τρέχουσα. */
export function indentAfter(lines, index) {
  const levels = computeLevels([...lines.slice(0, index + 1), 'x']);
  return INDENT.repeat(levels[levels.length - 1]);
}

/** Η σωστή εσοχή της γραμμής index. */
export function indentOf(lines, index) {
  const levels = computeLevels(lines.slice(0, index + 1));
  return INDENT.repeat(levels[index]);
}

export function isCloser(word) {
  return CLOSERS.has(word) || MIDDLES.has(word) || word === 'ΠΕΡΙΠΤΩΣΗ' || UNIT_END.has(word) || SECTIONS.has(word);
}
