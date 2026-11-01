// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Μηνύματα: αναλυτικές κάρτες σφαλμάτων και προειδοποιήσεων.
import { h } from '../dom.js';
import { describe } from '../../core/errors.js';
import { highlight, highlightLine } from '../editor/highlighter.js';
import { icon } from '../icons.js';

export class MessagesView {
  /** @param {{ onGoto?: (line, col, length) => void }} hooks */
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;
    this.render([], [], '');
  }

  /**
   * @param {GlossaError[]} errors
   * @param {GlossaError[]} warnings
   * @param {string} source για την απόσπαση κώδικα με τη σήμανση
   */
  render(errors, warnings, source) {
    const lines = source.split('\n');
    if (!errors.length && !warnings.length) {
      this.host.replaceChildren(h('div', { class: 'all-clear' }, [
        h('span', { class: 'all-clear-icon', html: icon('check') }),
        h('p', {}, 'Δεν βρέθηκαν λάθη. Τα συντακτικά λάθη και οι προειδοποιήσεις εμφανίζονται εδώ ενώ γράφεις, και τα λάθη εκτέλεσης όταν τρέχεις το πρόγραμμα.'),
      ]));
      return;
    }
    const cards = [...errors, ...warnings].map((err, i) => this.card(err, lines, i === 0));
    this.host.replaceChildren(...cards);
  }

  card(err, lines, open) {
    const dialect = (err.params && err.params.dialect) || 'glossa';
    const d = describe(err, dialect);
    const isWarning = err.severity === 'warning';
    const src = lines[err.line - 1] ?? '';
    const caretCol = Math.max(1, Math.min(err.col, src.length + 1));
    const caretLen = Math.max(1, Math.min(err.length || 1, Math.max(1, src.length - caretCol + 1)));
    const snippet = err.line ? h('div', { class: 'snippet' }, [
      h('span', { class: 'snippet-ln' }, String(err.line)),
      h('pre', {}, [
        h('code', { html: highlightLine(src, dialect) || '&nbsp;' }),
        h('span', { class: 'snippet-caret', 'aria-hidden': 'true' }, `${' '.repeat(caretCol - 1)}${'^'.repeat(caretLen)}`),
      ]),
    ]) : null;

    const sections = [
      section('Τι σημαίνει', h('p', {}, d.explain)),
      d.fix ? section('Πώς το διορθώνεις', h('p', {}, d.fix)) : null,
      d.example ? section('Παράδειγμα σωστού κώδικα', h('pre', { class: 'example' }, h('code', { html: highlight(d.example, dialect) }))) : null,
    ];

    return h('details', { class: `msg ${isWarning ? 'is-warning' : 'is-error'}`, open: open || undefined }, [
      h('summary', {}, [
        h('span', { class: 'msg-icon', html: icon(isWarning ? 'info' : 'alert') }),
        h('span', { class: 'msg-text' }, [
          h('span', { class: 'msg-phase' }, d.phaseLabel),
          h('span', { class: 'msg-title' }, d.title),
        ]),
        err.line ? h('button', {
          type: 'button', class: 'line-link',
          onclick: (e) => { e.preventDefault(); if (this.hooks.onGoto) this.hooks.onGoto(err.line, err.col, err.length); },
        }, `γρ. ${err.line}`) : null,
      ]),
      h('div', { class: 'msg-body' }, [snippet, ...sections]),
    ]);
  }
}

function section(title, body) {
  return h('div', { class: 'msg-section' }, [h('h4', {}, title), body]);
}

