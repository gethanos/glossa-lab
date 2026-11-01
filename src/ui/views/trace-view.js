// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Πίνακας τιμών: μία γραμμή ανά εκτελεσμένη εντολή, μία στήλη ανά μεταβλητή.
// Όπως στο τετράδιο: σε κάθε γραμμή γράφονται μόνο οι τιμές που άλλαξαν.
import { h } from '../dom.js';

export class TraceView {
  /** @param {{ onGoto?: (line:number) => void }} hooks */
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;
    this.dialect = 'glossa';
    this.reset();
  }

  setDialect(dialectId) {
    this.dialect = dialectId;
  }

  reset() {
    this.columns = new Map();
    this.rendered = 0;
    this.tbody = null;
    this.host.replaceChildren(h('p', { class: 'empty' }, 'Ο πίνακας τιμών γεμίζει καθώς εκτελείται το πρόγραμμα: κάθε γραμμή είναι μία εντολή και κάθε στήλη μία μεταβλητή. Σε κάθε γραμμή φαίνονται μόνο οι τιμές που άλλαξαν, όπως όταν τον συμπληρώνεις στο τετράδιο.'));
  }

  render(trace, truncated = false) {
    if (!trace.length) { this.reset(); return; }
    let newColumns = false;
    for (const row of trace.slice(this.rendered)) {
      for (const c of row.changes) {
        if (!this.columns.has(c.column)) {
          this.columns.set(c.column, { name: c.name, frameName: c.frameName, frameKind: c.frameKind, isArray: c.isArray });
          newColumns = true;
        }
      }
    }
    if (newColumns || trace.length < this.rendered || !this.tbody) this.build(trace);
    else this.append(trace, this.rendered);
    this.rendered = trace.length;
    this.markCurrent();
    if (truncated && !this.host.querySelector('.trace-note')) {
      this.host.append(h('p', { class: 'trace-note small muted' }, 'Ο πίνακας σταμάτησε να καταγράφει μετά από 3000 βήματα.'));
    }
  }

  build(trace) {
    const head = h('tr', {}, [
      h('th', { scope: 'col', class: 'c-step' }, '#'),
      h('th', { scope: 'col', class: 'c-line' }, 'Γρ.'),
      ...[...this.columns.values()].map((c) => h('th', { scope: 'col' }, [
        c.name,
        c.frameKind !== 'program' ? h('small', {}, c.frameName) : null,
      ])),
      h('th', { scope: 'col', class: 'c-cond' }, 'Συνθήκη'),
      h('th', { scope: 'col', class: 'c-out' }, 'Έξοδος'),
    ]);
    this.tbody = h('tbody');
    const table = h('table', { class: 'trace' }, [h('thead', {}, head), this.tbody]);
    this.scroller = h('div', { class: 'trace-scroll' }, table);
    this.host.replaceChildren(this.scroller);
    this.append(trace, 0);
  }

  append(trace, from) {
    const cols = [...this.columns.keys()];
    const frag = document.createDocumentFragment();
    for (const row of trace.slice(from)) {
      const byColumn = new Map();
      for (const c of row.changes) {
        const text = c.isArray ? `${c.display.slice(c.name.length)}=${c.value}` : c.value;
        byColumn.set(c.column, byColumn.has(c.column) ? `${byColumn.get(c.column)}, ${text}` : text);
      }
      const tr = h('tr', { title: row.text, onclick: () => this.hooks.onGoto && this.hooks.onGoto(row.line) }, [
        h('td', { class: 'c-step' }, String(row.step)),
        h('td', { class: 'c-line' }, String(row.line)),
        ...cols.map((k) => h('td', { class: byColumn.has(k) ? 'has-value' : '' }, byColumn.get(k) || '')),
        h('td', { class: `c-cond${row.cond ? (row.cond.endsWith('Α') ? ' is-true' : ' is-false') : ''}` }, row.cond ? condLabel(row.cond, this.dialect) : ''),
        h('td', { class: 'c-out' }, row.output ?? ''),
      ]);
      frag.append(tr);
    }
    this.tbody.append(frag);
  }

  markCurrent() {
    if (!this.tbody) return;
    const prev = this.tbody.querySelector('.is-current');
    if (prev) prev.classList.remove('is-current');
    const last = this.tbody.lastElementChild;
    if (last) {
      last.classList.add('is-current');
      const s = this.scroller;
      if (s.scrollHeight - s.scrollTop - s.clientHeight < 160 || this.rendered < 3) s.scrollTop = s.scrollHeight;
    }
  }
}

function condLabel(cond, dialect) {
  const [T, F] = dialect === 'pseudo' ? ['Αληθής', 'Ψευδής'] : ['ΑΛΗΘΗΣ', 'ΨΕΥΔΗΣ'];
  const value = cond.endsWith('Α') ? T : F;
  return `${cond.slice(0, cond.lastIndexOf(':'))} → ${value}`;
}
