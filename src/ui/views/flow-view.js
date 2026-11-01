// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Απεικόνιση ροής: ενεργοί βρόχοι (με πρόοδο) και στοίβα κλήσεων υποπρογραμμάτων.
import { h } from '../dom.js';
import { formatNumber } from '../../core/values.js';

const FRAME_TITLE = { program: 'Κύριο πρόγραμμα', function: 'Συνάρτηση', procedure: 'Διαδικασία', algorithm: 'Αλγόριθμος' };
const MAX_TICKS = 24;

export class FlowView {
  /** @param {{ onGoto?: (line:number) => void }} hooks */
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;
    this.dialect = 'glossa';
    this.renderEmpty();
  }

  setDialect(dialectId) {
    this.dialect = dialectId;
  }

  get words() {
    return this.dialect === 'pseudo' ? { T: 'Αληθής', F: 'Ψευδής' } : { T: 'ΑΛΗΘΗΣ', F: 'ΨΕΥΔΗΣ' };
  }

  renderEmpty() {
    this.host.replaceChildren(h('p', { class: 'empty' }, 'Εδώ θα φαίνονται οι βρόχοι που εκτελούνται τη στιγμή αυτή (πόσες επαναλήψεις έγιναν, τι τιμή έχει ο μετρητής, τι έδωσε η συνθήκη) και ποια υποπρογράμματα έχουν κληθεί.'));
  }

  render(loops, frames) {
    if (!frames.length) { this.renderEmpty(); return; }
    const loopSection = h('section', { class: 'flow-block' }, [
      h('h3', {}, 'Ενεργοί βρόχοι'),
      loops.length
        ? h('ol', { class: 'loops' }, loops.map((loop, i) => this.renderLoop(loop, i)))
        : h('p', { class: 'empty small' }, 'Αυτή τη στιγμή δεν εκτελείται κανένας βρόχος.'),
    ]);
    const stack = h('section', { class: 'flow-block' }, [
      h('h3', {}, 'Στοίβα κλήσεων'),
      h('ol', { class: 'stack' }, [...frames].reverse().map((f, i) => h('li', { class: i === 0 ? 'is-active' : '' }, [
        h('span', { class: 'stack-kind' }, FRAME_TITLE[f.kind]),
        h('strong', {}, f.name),
        f.callLine ? this.lineLink(f.callLine, 'κλήση από γρ.') : null,
      ]))),
    ]);
    this.host.replaceChildren(loopSection, stack);
  }

  lineLink(line, prefix = 'γρ.') {
    return h('button', { class: 'line-link', type: 'button', onclick: () => this.hooks.onGoto && this.hooks.onGoto(line) }, `${prefix} ${line}`);
  }

  renderLoop(loop, depth) {
    const body = loop.kind === 'for' ? this.renderFor(loop) : this.renderConditional(loop);
    return h('li', { class: `loop loop-${loop.kind}`, style: `--depth:${depth}` }, [
      h('div', { class: 'loop-head' }, [
        h('span', { class: 'loop-kind' }, loop.keyword),
        this.lineLink(loop.line),
        h('span', { class: 'loop-count' }, `${loop.iteration} ${loop.iteration === 1 ? 'επανάληψη' : 'επαναλήψεις'}`),
      ]),
      body,
    ]);
  }

  renderFor(loop) {
    const summary = h('p', { class: 'loop-desc' }, [
      h('code', {}, loop.variable), ` από ${loop.from} μέχρι ${loop.to}`, loop.step !== '1' ? ` με βήμα ${loop.step}` : '',
      h('span', { class: 'loop-now' }, [' τώρα: ', h('code', {}, `${loop.variable} = ${loop.current ?? '?'}`)]),
    ]);
    if (loop.total === 0) return h('div', {}, [summary, h('p', { class: 'empty small' }, 'Το διάστημα είναι κενό: το σώμα δεν θα εκτελεστεί.')]);
    if (!Number.isFinite(loop.total)) {
      return h('div', {}, [summary, h('p', { class: 'small muted' }, `Το βήμα είναι 0: ο μετρητής δεν αλλάζει, άρα ο βρόχος δεν τελειώνει. Επανάληψη ${loop.iteration}.`)]);
    }
    if (loop.total <= MAX_TICKS) {
      const ticks = [];
      const pos = loop.currentValue === null ? -1 : Math.round((loop.currentValue - loop.fromValue) / loop.stepValue);
      for (let k = 0; k < loop.total; k++) {
        const value = loop.fromValue + k * loop.stepValue;
        const done = k < pos;
        const current = k === pos;
        ticks.push(h('li', { class: `tick${done ? ' is-done' : ''}${current ? ' is-current' : ''}` }, formatNumber(value, this.dialect)));
      }
      return h('div', {}, [summary, h('ol', { class: 'ticks', 'aria-label': 'Τιμές του μετρητή' }, ticks)]);
    }
    const pct = Math.min(100, Math.round(((loop.iteration) / loop.total) * 100));
    return h('div', {}, [
      summary,
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: `width:${pct}%` })),
      h('p', { class: 'small muted' }, `Επανάληψη ${loop.iteration} από ${loop.total}`),
    ]);
  }

  renderConditional(loop) {
    const { T, F } = this.words;
    const stopsWhen = loop.kind === 'while' ? `σταματά όταν η συνθήκη γίνει ${F}` : `σταματά όταν η συνθήκη γίνει ${T}`;
    const last = loop.lastCond === null || loop.lastCond === undefined
      ? h('span', { class: 'chip' }, 'δεν ελέγχθηκε ακόμη')
      : h('span', { class: `chip ${loop.lastCond ? 'chip-true' : 'chip-false'}` }, loop.lastCond ? T : F);
    return h('div', {}, [
      h('p', { class: 'loop-desc' }, [h('code', {}, loop.condition)]),
      h('p', { class: 'loop-desc' }, ['Τελευταίος έλεγχος: ', last]),
      loop.chain ? h('p', { class: 'chain small' }, loop.chain.join('  →  ')) : null,
      h('p', { class: 'small muted' }, `Ο βρόχος ${stopsWhen}.`),
    ]);
  }
}
