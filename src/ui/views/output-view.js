// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Οθόνη εξόδου: ό,τι εμφανίζει το ΓΡΑΨΕ και η προτροπή για το ΔΙΑΒΑΣΕ.
import { h } from '../dom.js';
import { icon } from '../icons.js';

export class OutputView {
  constructor(host) {
    this.host = host;
    this.lines = h('div', { class: 'out-lines', role: 'log', 'aria-live': 'polite' });
    this.host.replaceChildren(this.lines);
    this.clear();
  }

  clear() {
    this.lines.replaceChildren(h('p', { class: 'empty' }, 'Η έξοδος του προγράμματος (εντολή ΓΡΑΨΕ) εμφανίζεται εδώ.'));
    this.hasOutput = false;
    this.removePrompt();
  }

  start() {
    this.lines.replaceChildren();
    this.hasOutput = false;
  }

  write(text) {
    if (!this.hasOutput) { this.lines.replaceChildren(); this.hasOutput = true; }
    this.lines.append(h('div', { class: 'out-line' }, text || '\u00a0'));
    this.scroll();
  }

  /** Γραμμή συστήματος (π.χ. «Τέλος εκτέλεσης»). */
  note(text, kind = 'info') {
    if (!this.hasOutput) { this.lines.replaceChildren(); this.hasOutput = true; }
    this.lines.append(h('div', { class: `out-note is-${kind}` }, text));
    this.scroll();
  }

  /** Τιμή που διάβασε το ΔΙΑΒΑΣΕ από τα «Δεδομένα εισόδου» (όχι από πληκτρολόγηση). */
  echoQueued(name, text) {
    if (!this.hasOutput) { this.lines.replaceChildren(); this.hasOutput = true; }
    this.lines.append(h('div', { class: 'out-line is-echo' }, [
      h('span', { class: 'echo-name' }, `${name} ← `), text,
      h('span', { class: 'echo-source' }, 'από τα Δεδομένα εισόδου'),
    ]));
    this.scroll();
  }

  /**
   * Εμφανίζει πεδίο εισόδου για το ΔΙΑΒΑΣΕ/Διάβασε ή για τα Δεδομένα ενός αλγορίθμου.
   * @param {object} request { name, type?, typeLabel, kind: 'value'|'list', source?, placeholder?, error? }
   * @param {(text: string) => void} onSubmit
   * @param {'glossa'|'pseudo'} dialect
   */
  prompt(request, onSubmit, dialect = 'glossa') {
    this.removePrompt();
    const numericMode = request.type === 'int' ? 'numeric' : request.type === 'real' ? 'decimal' : 'text';
    const input = h('input', {
      type: 'text', class: 'prompt-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      inputmode: numericMode, placeholder: request.placeholder || null,
      'aria-label': `Τιμή για ${request.name}`,
    });
    const submit = () => {
      const text = input.value;
      this.removePrompt();
      this.lines.append(h('div', { class: 'out-line is-echo' }, [h('span', { class: 'echo-name' }, `${request.name} ← `), text]));
      onSubmit(text);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const verb = request.source || (dialect === 'pseudo' ? 'Διάβασε' : 'ΔΙΑΒΑΣΕ');
    const hint = request.kind === 'list'
      ? `Γράψε τις τιμές του πίνακα με τη σειρά, χωρισμένες με κενό ή με «κόμμα και κενό»${request.rank === 2 ? ', και τις γραμμές με «;»' : ''}. Το δεκαδικό γράφεται με κόμμα χωρίς κενό, π.χ. 12,5.`
      : null;
    this.promptEl = h('div', { class: 'prompt' }, [
      h('label', { class: 'prompt-label' }, [
        h('span', {}, [`${verb} `, h('strong', {}, request.name)]),
        request.typeLabel ? h('span', { class: 'var-type' }, request.typeLabel) : null,
      ]),
      hint ? h('p', { class: 'prompt-hint' }, hint) : null,
      h('div', { class: 'prompt-row' }, [
        input,
        h('button', { type: 'button', class: 'btn btn-primary', onclick: submit, html: `${icon('enter')}<span>Καταχώριση</span>` }),
      ]),
      request.error ? h('p', { class: 'prompt-error', role: 'alert' }, request.error) : null,
    ]);
    this.host.append(this.promptEl);
    if (!this.hasOutput) { this.lines.replaceChildren(); this.hasOutput = true; }
    setTimeout(() => input.focus({ preventScroll: false }), 30);
  }

  removePrompt() {
    if (this.promptEl) { this.promptEl.remove(); this.promptEl = null; }
  }

  scroll() {
    this.host.scrollTop = this.host.scrollHeight;
  }
}
