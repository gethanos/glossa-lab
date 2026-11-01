// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Μπάρα συμβόλων κάτω από τον κώδικα (χρήσιμη ιδιαίτερα στο κινητό), ανά γλώσσα.
import { h } from './dom.js';

// [ετικέτα, κείμενο που εισάγεται]
const SYMBOLS = {
  glossa: [['←', '<- '], ['[', '['], [']', ']'], ['(', '('], [')', ')'], ["'", "'"], [',', ', '], [':', ':'],
    ['=', '='], ['<>', '<>'], ['<', '<'], ['>', '>'], ['<=', '<='], ['>=', '>='], ['+', '+'], ['-', '-'],
    ['*', '*'], ['/', '/'], ['^', '^'], ['!', '! ']],
  pseudo: [['←', '← '], ['≤', '≤'], ['≥', '≥'], ['≠', '≠'], ['"', '"'], ['[', '['], [']', ']'], ['(', '('],
    [')', ')'], [',', ', '], ['//', '// '], ['=', '='], ['<', '<'], ['>', '>'], ['+', '+'], ['-', '-'],
    ['*', '*'], ['/', '/'], ['^', '^'], ['!', '! ']],
};

export class SymbolBar {
  /**
   * @param {HTMLElement} host
   * @param {{ insert: (text) => void, indent: () => void, suggest: () => void }} actions
   */
  constructor(host, actions) {
    this.host = host;
    this.actions = actions;
    // Τα κουμπιά δεν παίρνουν την εστίαση, ώστε ο κέρσορας να μένει στον κώδικα.
    host.addEventListener('mousedown', (e) => e.preventDefault());
  }

  render(dialectId) {
    const buttons = (SYMBOLS[dialectId] || SYMBOLS.glossa).map(([label, text]) => h('button', {
      type: 'button', class: 'sym', 'aria-label': `Εισαγωγή ${label}`, onclick: () => this.actions.insert(text),
    }, label));
    buttons.push(h('button', { type: 'button', class: 'sym sym-wide', onclick: () => this.actions.indent() }, 'Εσοχή'));
    buttons.push(h('button', { type: 'button', class: 'sym sym-wide', onclick: () => this.actions.suggest() }, 'Λέξεις'));
    this.host.replaceChildren(...buttons);
  }
}
