// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
//
// Απεικόνιση μονοδιάστατου πίνακα ως στοίβα ή ουρά, όπως στη θεωρία (ΑΕΠΠ 3.4, 3.5):
//   Στοίβα: πίνακας και μια μεταβλητή (συνήθως top) που δείχνει το στοιχείο που
//           μπήκε τελευταίο, την κορυφή. Ώθηση: top + 1 και αποθήκευση· απώθηση:
//           εξαγωγή του στοιχείου της κορυφής και top - 1.
//   Ουρά:   πίνακας και δύο δείκτες, front (εμπρός) και rear (πίσω). Εισαγωγή: rear + 1
//           και αποθήκευση· εξαγωγή: το στοιχείο του front και front + 1.
// Οι θέσεις έξω από τη δομή εμφανίζονται αχνές: η απώθηση/εξαγωγή δεν σβήνει την τιμή
// από τον πίνακα, απλώς ο δείκτης παύει να τη «βλέπει».
import { h } from '../dom.js';
import { normalize } from '../../core/tokens.js';
import { cellKey } from '../../core/interpreter.js';

export const MODES = Object.freeze([
  { id: 'array', label: 'Πίνακας' },
  { id: 'stack', label: 'Στοίβα' },
  { id: 'queue', label: 'Ουρά' },
]);

/** Οι δείκτες κάθε δομής και τα ονόματα με τα οποία αναγνωρίζονται αυτόματα. */
export const POINTERS = Object.freeze({
  stack: [{ role: 'top', label: 'top (κορυφή)', names: ['TOP', 'ΚΟΡΥΦΗ'] }],
  queue: [
    { role: 'front', label: 'front (εμπρός)', names: ['FRONT', 'ΕΜΠΡΟΣ'] },
    { role: 'rear', label: 'rear (πίσω)', names: ['REAR', 'ΠΙΣΩ'] },
  ],
});

/** Απλές αριθμητικές μεταβλητές του πλαισίου: υποψήφιοι δείκτες. */
export function pointerCandidates(frame) {
  return [...frame.vars.values()].filter((c) => !c.array && (c.dynamic || c.type === 'int'));
}

/**
 * Αυτόματη αναγνώριση: όταν το πλαίσιο έχει έναν μόνο μονοδιάστατο πίνακα και
 * μεταβλητές με τα ονόματα της θεωρίας (top ή front/rear).
 * @returns {{ mode: string, pointers: object }}
 */
export function suggestStructure(frame, arrayCell) {
  const arrays = [...frame.vars.values()].filter((c) => c.array && c.array.rank === 1);
  if (arrayCell.array.rank !== 1 || arrays.length !== 1) return { mode: 'array', pointers: {} };
  const byName = new Map(pointerCandidates(frame).map((c) => [normalize(c.name), c.norm]));
  const find = (spec) => spec.names.map((n) => byName.get(n)).find(Boolean) || null;
  for (const mode of ['queue', 'stack']) {
    const pointers = Object.fromEntries(POINTERS[mode].map((p) => [p.role, find(p)]));
    if (Object.values(pointers).every(Boolean)) return { mode, pointers };
  }
  return { mode: 'array', pointers: {} };
}

/** Η αριθμητική τιμή ενός δείκτη, ή null αν δεν έχει (ακέραια) τιμή. */
function pointerValue(frame, norm) {
  const cell = norm ? frame.vars.get(norm) : null;
  const v = cell && cell.value;
  return v && v.t === 'int' ? v.v : null;
}

/**
 * Οι θέσεις που εμφανίζονται και αν το μέγεθος του πίνακα είναι γνωστό.
 * ΓΛΩΣΣΑ: το μέγεθος της δήλωσης. Ψευδογλώσσα: ο πίνακας δεν έχει δηλωμένο μέγεθος, οπότε
 * εμφανίζονται οι θέσεις έως τη μεγαλύτερη που χρησιμοποιήθηκε ή δείχνει κάποιος δείκτης,
 * και το όριο (υπερχείλιση, «γεμάτη») δεν μπορεί να κριθεί από την απεικόνιση.
 */
function capacity(cell, pointerValues) {
  const used = cell.array.extent()[0];
  if (!cell.dynamic) return { size: used, known: true };
  const size = Math.max(used, ...pointerValues.filter((n) => Number.isInteger(n)), 1);
  return { size, known: false };
}

// Όπως και στον απλό πίνακα, εμφανίζονται το πολύ τόσες θέσεις, ώστε ένας μεγάλος πίνακας
// να μην «παγώνει» τη σελίδα σε κάθε βήμα.
const MAX_SLOTS = 400;

/**
 * Ποιες θέσεις εμφανίζονται: όλες, αν χωρούν· αλλιώς ένα «παράθυρο» MAX_SLOTS θέσεων που
 * περιέχει τους δείκτες (αν απέχουν περισσότερο, προηγείται ο πρώτος: top ή front).
 * @param {number} size πλήθος θέσεων
 * @param {(number|null)[]} pointerValues τιμές δεικτών, με σειρά προτεραιότητας
 */
function visibleRange(size, pointerValues) {
  if (size <= MAX_SLOTS) return { from: 1, to: size, truncated: false };
  const inside = pointerValues.filter((n) => Number.isInteger(n) && n >= 1 && n <= size);
  let from = 1;
  if (inside.length) {
    const lo = Math.min(...inside);
    const hi = Math.max(...inside);
    from = hi - lo + 1 <= MAX_SLOTS
      ? lo - Math.floor((MAX_SLOTS - (hi - lo + 1)) / 2)
      : inside[0] - Math.floor(MAX_SLOTS / 2);
  }
  from = Math.max(1, Math.min(from, size - MAX_SLOTS + 1));
  return { from, to: from + MAX_SLOTS - 1, truncated: true };
}

function rangeNote(range, size) {
  return range.truncated
    ? h('p', { class: 'muted small' }, `Εμφανίζονται οι θέσεις ${range.from} έως ${range.to} από ${size}.`)
    : null;
}

const UNKNOWN_SIZE_NOTE = 'Ο πίνακας δεν έχει δηλωμένο μέγεθος: το όριο της δομής το ελέγχει ο ίδιος ο αλγόριθμος (π.χ. με μια μεταβλητή για τη χωρητικότητα).';

/**
 * @param {object} ctx { frame, cell, pointers, changed:Set, read:Set, fmt(value) }
 */
export function renderStack(ctx) {
  const { frame, cell, pointers, changed, read, fmt } = ctx;
  const top = pointerValue(frame, pointers.top);
  const topName = pointers.top ? frame.vars.get(pointers.top).name : 'top';
  const cap = capacity(cell, [top]);
  const range = visibleRange(cap.size, [top]);
  const topChanged = pointers.top && changed.has(cellKey(frame, frame.vars.get(pointers.top), null));
  const slots = [];
  for (let i = range.to; i >= range.from; i--) {
    const inside = top !== null && i <= top;
    const v = cell.array.get([i]);
    const key = cellKey(frame, cell, cell.array.keyOf([i]));
    const cls = ['slot', inside ? 'is-inside' : 'is-outside'];
    if (i === top) cls.push('is-pointer');
    if (changed.has(key)) cls.push('is-changed');
    if (read.has(key)) cls.push('is-read');
    slots.push(h('li', { class: cls.join(' '), title: slotTitle(cell, i, v, inside, fmt, 'στη στοίβα') }, [
      h('span', { class: 'slot-index' }, String(i)),
      h('span', { class: 'slot-value' }, v ? fmt(v) : ''),
      i === top ? h('span', { class: `pointer${topChanged ? ' is-changed' : ''}` }, `← ${topName} = ${top}`) : null,
    ]));
  }
  // Η βάση της στοίβας (κάτω από τη θέση 1) φαίνεται μόνο όταν φαίνεται και η θέση 1.
  const base = range.from === 1
    ? h('li', { class: 'slot-base' }, top === 0
      ? h('span', { class: `pointer${topChanged ? ' is-changed' : ''}` }, `← ${topName} = 0 (άδεια)`)
      : '')
    : null;
  return h('div', { class: 'structure structure-stack' }, [
    h('ol', { class: 'stack', 'aria-label': `Στοίβα ${cell.name}` }, [...slots, base]),
    h('div', { class: 'structure-info' }, [rangeNote(range, cap.size), ...stackStatus(top, cap, topName)]),
  ]);
}

function stackStatus(top, cap, topName) {
  if (top === null) return [h('p', {}, `Ο δείκτης ${topName} δεν έχει ακόμη τιμή.`)];
  const out = [];
  const outside = top < 0 || (cap.known && top > cap.size);
  const count = Math.max(0, cap.known ? Math.min(top, cap.size) : top);
  out.push(h('p', {}, cap.known
    ? [h('strong', {}, String(count)), ` από ${cap.size} θέσεις στη στοίβα.`]
    : [h('strong', {}, String(count)), ` ${count === 1 ? 'στοιχείο' : 'στοιχεία'} στη στοίβα.`]));
  if (outside) out.push(h('p', { class: 'chip chip-false' }, `Ο ${topName} = ${top} είναι εκτός των θέσεων του πίνακα.`));
  else if (top === 0) out.push(h('p', { class: 'chip' }, 'Άδεια: μια απώθηση τώρα θα ήταν υποχείλιση.'));
  else if (cap.known && top === cap.size) out.push(h('p', { class: 'chip' }, 'Γεμάτη: μια ώθηση τώρα θα ήταν υπερχείλιση.'));
  if (!cap.known) out.push(h('p', { class: 'muted small' }, UNKNOWN_SIZE_NOTE));
  out.push(h('p', { class: 'muted small' }, `Ώθηση: ${topName} ← ${topName} + 1 και αποθήκευση στη θέση ${topName}. Απώθηση: εξαγωγή από τη θέση ${topName} και ${topName} ← ${topName} - 1.`));
  return out;
}

/**
 * @param {object} ctx { frame, cell, pointers, changed:Set, read:Set, fmt(value) }
 */
export function renderQueue(ctx) {
  const { frame, cell, pointers, changed, read, fmt } = ctx;
  const front = pointerValue(frame, pointers.front);
  const rear = pointerValue(frame, pointers.rear);
  const frontName = pointers.front ? frame.vars.get(pointers.front).name : 'front';
  const rearName = pointers.rear ? frame.vars.get(pointers.rear).name : 'rear';
  const cap = capacity(cell, [front, rear]);
  const range = visibleRange(cap.size, [front, rear]);
  const first = front === null ? null : Math.max(front, 1);
  const changedPointer = (norm) => norm && changed.has(cellKey(frame, frame.vars.get(norm), null));
  const cells = [];
  for (let i = range.from; i <= range.to; i++) {
    const inside = first !== null && rear !== null && i >= first && i <= rear;
    const v = cell.array.get([i]);
    const key = cellKey(frame, cell, cell.array.keyOf([i]));
    const cls = ['slot', inside ? 'is-inside' : 'is-outside'];
    if (i === front || i === rear) cls.push('is-pointer');
    if (changed.has(key)) cls.push('is-changed');
    if (read.has(key)) cls.push('is-read');
    const marks = [];
    if (i === front) marks.push(h('span', { class: `pointer pointer-front${changedPointer(pointers.front) ? ' is-changed' : ''}` }, `${frontName} ↓`));
    if (i === rear) marks.push(h('span', { class: `pointer pointer-rear${changedPointer(pointers.rear) ? ' is-changed' : ''}` }, `${rearName} ↓`));
    cells.push(h('li', { class: cls.join(' '), title: slotTitle(cell, i, v, inside, fmt, 'στην ουρά') }, [
      h('span', { class: 'slot-marks' }, marks),
      h('span', { class: 'slot-value' }, v ? fmt(v) : ''),
      h('span', { class: 'slot-index' }, String(i)),
    ]));
  }
  return h('div', { class: 'structure structure-queue' }, [
    h('div', { class: 'queue-scroll' }, h('ol', { class: 'queue', 'aria-label': `Ουρά ${cell.name}` }, cells)),
    h('div', { class: 'structure-info' }, [rangeNote(range, cap.size), ...queueStatus(front, rear, cap, frontName, rearName)]),
  ]);
}

/**
 * Κατάσταση της ουράς. Άδεια ουρά: front = 0 και rear = 0 (οι αρχικές τιμές του βιβλίου,
 * στις οποίες επιστρέφουν και οι δύο δείκτες όταν εξαχθεί το τελευταίο στοιχείο).
 */
function queueStatus(front, rear, cap, frontName, rearName) {
  if (front === null || rear === null) {
    return [h('p', {}, `Οι δείκτες ${frontName} και ${rearName} πρέπει να έχουν τιμή για να φανεί η ουρά.`)];
  }
  const count = Math.max(0, rear - Math.max(front, 1) + 1);
  const out = [h('p', {}, [h('strong', {}, String(count)), ` ${count === 1 ? 'στοιχείο' : 'στοιχεία'} στην ουρά (${frontName} = ${front}, ${rearName} = ${rear}).`])];
  const outside = front < 0 || rear < 0 || (cap.known && (front > cap.size || rear > cap.size));
  if (outside) out.push(h('p', { class: 'chip chip-false' }, 'Ένας δείκτης είναι εκτός των θέσεων του πίνακα.'));
  else if (count === 0) out.push(h('p', { class: 'chip' }, 'Άδεια: δεν υπάρχει στοιχείο για εξαγωγή.'));
  if (!outside && cap.known && rear === cap.size) out.push(h('p', { class: 'chip' }, `Γεμάτη: ο ${rearName} είναι στην τελευταία θέση, δεν υπάρχει χώρος για νέα εισαγωγή.`));
  if (!cap.known) out.push(h('p', { class: 'muted small' }, UNKNOWN_SIZE_NOTE));
  out.push(h('p', { class: 'muted small' }, `Εισαγωγή: ${rearName} ← ${rearName} + 1 και αποθήκευση στη θέση ${rearName}. Εξαγωγή: το στοιχείο της θέσης ${frontName} και ${frontName} ← ${frontName} + 1. Όταν εξαχθεί το τελευταίο στοιχείο, οι δείκτες γίνονται ξανά 0.`));
  return out;
}

function slotTitle(cell, i, v, inside, fmt, where) {
  const value = v ? fmt(v) : 'χωρίς τιμή';
  return inside
    ? `${cell.name}[${i}] = ${value}`
    : `${cell.name}[${i}] = ${value} (δεν βρίσκεται ${where})`;
}
