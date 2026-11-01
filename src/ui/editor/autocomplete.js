// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Αυτόματη συμπλήρωση: υπολογισμός προτάσεων και αναδυόμενη λίστα.
import { normalize } from '../../core/tokens.js';
import { languageHelp } from './snippets.js';
import { h, escapeHtml } from '../dom.js';

const KIND_LABEL = {
  snippet: 'δομή', keyword: 'λέξη', var: 'μεταβλητή', array: 'πίνακας', const: 'σταθερά',
  func: 'συνάρτηση', proc: 'διαδικασία', builtin: 'ενσωμ.', name: 'όνομα',
};

/**
 * @param {string} prefix η λέξη πριν τον κέρσορα
 * @param {{name:string, kind:string, detail?:string}[]} symbols ονόματα από τον κώδικα
 * @param {boolean} atStatementStart αν η λέξη είναι η πρώτη της γραμμής
 * @param {'glossa'|'pseudo'} dialectId
 */
export function buildSuggestions(prefix, symbols, atStatementStart, dialectId = 'glossa') {
  const help = languageHelp(dialectId);
  const p = normalize(prefix);
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = `${item.kind}:${item.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };
  const score = (word) => {
    const n = normalize(word);
    if (n === p) return 0;
    if (n.startsWith(p)) return 1;
    if (p.length >= 2 && n.includes(p)) return 2;
    return -1;
  };

  for (const s of help.snippets) {
    if (s.keyword === '<-' || s.keyword === '←') continue;
    const sc = score(s.keyword);
    if (sc >= 0 && (atStatementStart || sc < 2)) add({ kind: 'snippet', label: s.label, detail: s.description, insert: s.template, rank: sc, multiline: s.template.includes('\n') });
  }
  for (const [word, detail] of help.keywords) {
    const sc = score(word);
    if (sc >= 0) add({ kind: 'keyword', label: word, detail, insert: word, rank: sc + 0.2 });
  }
  for (const sym of symbols) {
    const sc = score(sym.name);
    if (sc >= 0 && normalize(sym.name) !== p) add({ kind: sym.kind, label: sym.name, detail: sym.detail || '', insert: sym.insert || sym.name, rank: sc + 0.1 });
  }
  for (const b of help.builtins) {
    const sc = score(b.name);
    if (sc >= 0 && !atStatementStart) add({ kind: 'builtin', label: `${b.name}( )`, detail: `${b.detail}, π.χ. ${b.example}`, insert: `${b.name}(\${x})`, rank: sc + 0.3 });
  }
  items.sort((a, b) => a.rank - b.rank || a.label.length - b.label.length);
  return items.slice(0, 9);
}

const MARGIN = 8;       // απόσταση από τις άκρες της ορατής περιοχής
const GAP = 4;          // απόσταση από τη γραμμή του κέρσορα
const MAX_HEIGHT = 320;
const MIN_COMFORT = 160; // κάτω από αυτό το ύψος προτιμάται η θέση πάνω από τον κέρσορα

/**
 * Αναδυόμενη λίστα προτάσεων.
 *
 * Τοποθετείται στο <body> με position: fixed, ώστε να μην κόβεται από στοιχεία με
 * overflow: hidden, και υπολογίζει τη θέση της μέσα στην ορατή περιοχή (visualViewport),
 * που στο κινητό μικραίνει όταν ανοίγει το πληκτρολόγιο. Επιλέγει μόνη της αν θα εμφανιστεί
 * κάτω ή πάνω από τον κέρσορα και περιορίζει το ύψος της στον διαθέσιμο χώρο, οπότε
 * όλες οι προτάσεις είναι προσβάσιμες με κύλιση μέσα στη λίστα.
 */
export class AutocompletePopup {
  /**
   * @param {(item) => void} onAccept
   * @param {HTMLElement} owner στοιχείο του οποίου τα πατήματα δεν κλείνουν τη λίστα (ο επεξεργαστής)
   */
  constructor(onAccept, owner) {
    this.onAccept = onAccept;
    this.owner = owner;
    this.items = [];
    this.index = 0;
    this.anchor = null;
    this.el = h('div', { class: 'ac-popup', role: 'listbox', 'aria-label': 'Προτάσεις συμπλήρωσης', hidden: true });
    // Το πάτημα σε πρόταση δεν πρέπει να παίρνει την εστίαση από τον κώδικα (αλλιώς στο
    // κινητό κλείνει το πληκτρολόγιο). Το πάτημα στη μπάρα κύλισης (στόχος η ίδια η λίστα)
    // αφήνεται ελεύθερο, ώστε να λειτουργεί το σύρσιμο.
    this.el.addEventListener('mousedown', (e) => { if (e.target !== this.el) e.preventDefault(); });
    this.el.addEventListener('click', (e) => this.onClick(e));
    document.body.append(this.el);

    this.reposition = this.reposition.bind(this);
    this.onPageScroll = this.onPageScroll.bind(this);
    this.onOutside = this.onOutside.bind(this);
  }

  get isOpen() { return !this.el.hidden; }

  /**
   * @param {object[]} items
   * @param {string} prefix
   * @param {() => {left:number, top:number, bottom:number}} anchor θέση του κέρσορα στην οθόνη
   */
  show(items, prefix, anchor) {
    if (!items.length) { this.hide(); return; }
    this.items = items;
    this.index = 0;
    this.anchor = anchor;
    this.el.replaceChildren(...items.map((item, i) => this.renderItem(item, i, prefix)));
    if (!this.isOpen) this.listen(true);
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.reposition();
    this.highlight();
  }

  hide() {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.items = [];
    this.anchor = null;
    this.listen(false);
  }

  /** Υπολογίζει θέση και μέγεθος μέσα στην ορατή περιοχή. */
  reposition() {
    if (!this.isOpen || !this.anchor) return;
    const caret = this.anchor();
    const vv = window.visualViewport;
    const view = {
      left: vv ? vv.offsetLeft : 0,
      top: vv ? vv.offsetTop : 0,
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight,
    };
    const viewBottom = view.top + view.height;
    if (caret.bottom < view.top || caret.top > viewBottom) { this.hide(); return; }

    const width = Math.min(360, view.width - MARGIN * 2);
    const left = Math.min(Math.max(caret.left, view.left + MARGIN), view.left + view.width - width - MARGIN);

    // Το scrollHeight δίνει το πλήρες ύψος του περιεχομένου ακόμη κι όταν η λίστα έχει
    // περιορισμένο ύψος, οπότε δεν χρειάζεται να αλλάξει το maxHeight για τη μέτρηση
    // (μια τέτοια αλλαγή θα μηδένιζε την κύλιση της λίστας).
    const borders = this.el.offsetHeight - this.el.clientHeight;
    const natural = Math.min(this.el.scrollHeight + borders, MAX_HEIGHT);
    const below = viewBottom - caret.bottom - GAP - MARGIN;
    const above = caret.top - view.top - GAP - MARGIN;
    const placeBelow = below >= Math.min(natural, MIN_COMFORT) || below >= above;
    const space = Math.max(0, placeBelow ? below : above);
    const height = Math.min(natural, space);

    Object.assign(this.el.style, {
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${height}px`,
      top: placeBelow ? `${caret.bottom + GAP}px` : `${caret.top - GAP - height}px`,
    });
    this.el.dataset.placement = placeBelow ? 'below' : 'above';
  }

  renderItem(item, i, prefix) {
    const n = prefix.length;
    const labelHtml = normalize(item.label).startsWith(normalize(prefix))
      ? `<b>${escapeHtml(item.label.slice(0, n))}</b>${escapeHtml(item.label.slice(n))}`
      : escapeHtml(item.label);
    return h('div', { class: `ac-item kind-${item.kind}`, role: 'option', 'data-index': String(i) }, [
      h('span', { class: 'ac-kind' }, KIND_LABEL[item.kind] || item.kind),
      h('span', { class: 'ac-label', html: labelHtml }),
      item.detail ? h('span', { class: 'ac-detail' }, item.detail) : null,
    ]);
  }

  onClick(e) {
    const row = e.target.closest('.ac-item');
    if (!row) return;
    this.index = Number(row.dataset.index);
    this.accept();
  }

  /** Σημειώνει την επιλεγμένη πρόταση και τη φέρνει σε θέα κυλώντας μόνο τη λίστα. */
  highlight() {
    const rows = this.el.children;
    for (let i = 0; i < rows.length; i++) rows[i].setAttribute('aria-selected', String(i === this.index));
    const row = rows[this.index];
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < this.el.scrollTop) this.el.scrollTop = top;
    else if (bottom > this.el.scrollTop + this.el.clientHeight) this.el.scrollTop = bottom - this.el.clientHeight;
  }

  move(delta) {
    if (!this.items.length) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.highlight();
  }

  accept() {
    const item = this.items[this.index];
    this.hide();
    if (item) this.onAccept(item);
  }

  // ---------- Συμβάντα σελίδας όσο η λίστα είναι ανοιχτή ----------
  listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('resize', this.reposition);
    window[method]('scroll', this.onPageScroll, true);
    if (window.visualViewport) {
      window.visualViewport[method]('resize', this.reposition);
      window.visualViewport[method]('scroll', this.reposition);
    }
    document[method]('pointerdown', this.onOutside, true);
  }

  /** Κύλιση στη σελίδα ή στον κώδικα: η λίστα ακολουθεί τον κέρσορα. Η κύλιση της ίδιας της λίστας αγνοείται. */
  onPageScroll(e) {
    if (e.target === this.el) return;
    this.reposition();
  }

  onOutside(e) {
    if (this.el.contains(e.target) || (this.owner && this.owner.contains(e.target))) return;
    this.hide();
  }
}
