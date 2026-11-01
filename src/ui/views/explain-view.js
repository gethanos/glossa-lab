// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// «Τι συμβαίνει τώρα»: η επόμενη εντολή και η εξήγηση της εντολής που μόλις εκτελέστηκε.
import { h } from '../dom.js';
import { highlightLine } from '../editor/highlighter.js';

const STATUS = {
  idle: ['Έτοιμο', 'is-idle'],
  running: ['Εκτελείται', 'is-running'],
  paused: ['Σε παύση', 'is-paused'],
  input: ['Περιμένει είσοδο', 'is-input'],
  done: ['Ολοκληρώθηκε', 'is-done'],
  error: ['Σφάλμα', 'is-error'],
};

export class ExplainView {
  /** @param {{ onGoto?: (line:number) => void }} hooks */
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;
    this.dialect = 'glossa';
    this.renderIdle();
  }

  setDialect(dialectId) {
    this.dialect = dialectId;
  }

  renderIdle() {
    this.host.replaceChildren(
      this.statusRow('idle', 0),
      h('p', { class: 'explain-intro' }, [
        'Πάτησε ', h('strong', {}, 'Βήμα'), ` για να εκτελέσεις ${this.dialect === 'pseudo' ? 'τον αλγόριθμο' : 'το πρόγραμμα'} μία εντολή τη φορά και να δεις τι αλλάζει στη μνήμη, ή `,
        h('strong', {}, 'Εκτέλεση'), ' για να τρέξει ολόκληρο. Πάτησε στον αριθμό μιας γραμμής για να βάλεις σημείο διακοπής.',
      ]),
    );
  }

  statusRow(status, steps, frameName) {
    const [label, cls] = STATUS[status] || STATUS.idle;
    return h('div', { class: 'explain-status' }, [
      h('span', { class: `status ${cls}` }, label),
      steps ? h('span', { class: 'muted small' }, `${steps.toLocaleString('el-GR')} βήματα`) : null,
      frameName ? h('span', { class: 'muted small' }, `μέσα σε: ${frameName}`) : null,
    ]);
  }

  /**
   * @param {object} p
   * @param {string} p.status
   * @param {number} p.steps
   * @param {object|null} p.action τελευταία ενέργεια του διερμηνευτή
   * @param {number|null} p.nextLine
   * @param {string} p.nextSource
   * @param {string} p.frameName
   */
  render({ status, steps, action, nextLine, nextSource, frameName }) {
    const parts = [this.statusRow(status, steps, frameName)];
    if (nextLine && status !== 'done' && status !== 'error') {
      parts.push(h('div', { class: 'next-line' }, [
        h('span', { class: 'next-label' }, 'Επόμενη εντολή'),
        h('button', { class: 'line-link', type: 'button', onclick: () => this.hooks.onGoto && this.hooks.onGoto(nextLine) }, `γρ. ${nextLine}`),
        h('code', { class: 'next-code', html: highlightLine(nextSource.trim(), this.dialect) }),
      ]));
    }
    if (action) {
      parts.push(h('div', { class: `last-action kind-${action.kind}` }, [
        h('span', { class: 'next-label' }, status === 'done' ? 'Τελευταία ενέργεια' : `Μόλις εκτελέστηκε, γρ. ${action.line}`),
        h('p', {}, action.text),
        action.chain ? this.renderChain(action.chain, this.dialect) : null,
      ]));
    }
    this.host.replaceChildren(...parts);
  }

  /** chain: πίνακας βημάτων ή πίνακας από πίνακες (μία σειρά ανά τιμή του ΓΡΑΨΕ). */
  renderChain(chain, dialect) {
    const rows = Array.isArray(chain[0]) ? chain : [chain];
    return h('div', { class: 'chains' }, rows.map((r) => h('div', { class: 'chain-row' }, chainRow(r, dialect))));
  }
}

function chainRow(steps, dialect) {
  const out = [];
  steps.forEach((s, i) => {
    if (i && !steps[i - 1].endsWith('←')) out.push(h('span', { class: 'chain-arrow', 'aria-hidden': 'true' }, '→'));
    const last = i === steps.length - 1;
    out.push(h('code', { class: `chain-step${last ? ' is-result' : ''}`, html: highlightLine(s, dialect) }));
  });
  return out;
}
