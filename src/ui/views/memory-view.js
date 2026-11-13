// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Απεικόνιση μνήμης: κάθε μεταβλητή ως «κουτί», κάθε πίνακας ως σειρά ή πλέγμα κουτιών.
// Στη ΓΛΩΣΣΑ φαίνεται ο δηλωμένος τύπος· στην ψευδογλώσσα το είδος της τιμής που κρατά.
// Ένας μονοδιάστατος πίνακας μπορεί να εμφανιστεί και ως στοίβα ή ουρά (data-structures.js):
// αυτόματα, όταν υπάρχουν δείκτες με τα ονόματα της θεωρίας (top, front/rear), ή με επιλογή
// του χρήστη από την κεφαλίδα του πίνακα.
import { h } from '../dom.js';
import { format, typeLabel } from '../../core/values.js';
import { cellKey } from '../../core/interpreter.js';
import {
  MODES, POINTERS, pointerCandidates, suggestStructure, renderStack, renderQueue,
} from './data-structures.js';

const FRAME_TITLE = {
  program: 'Κύριο πρόγραμμα', function: 'Συνάρτηση', procedure: 'Διαδικασία', algorithm: 'Αλγόριθμος',
};
const MAX_CELLS = 400;

export class MemoryView {
  constructor(host) {
    this.host = host;
    this.dialect = 'glossa';
    // Επιλογές του χρήστη για την απεικόνιση πινάκων: «υποπρόγραμμα|πίνακας» → { mode, pointers }
    this.structures = new Map();
    this.last = null;
    this.renderEmpty();
  }

  setDialect(dialectId) {
    this.dialect = dialectId;
    this.structures.clear();
  }

  renderEmpty() {
    const text = this.dialect === 'pseudo'
      ? 'Οι μεταβλητές θα εμφανιστούν εδώ μόλις ξεκινήσει η εκτέλεση. Κάθε μεταβλητή είναι ένα κουτί στη μνήμη· στην ψευδογλώσσα δεν δηλώνεται, και το είδος της (αριθμητική, αλφαριθμητική, λογική) ορίζεται από την τιμή που παίρνει.'
      : 'Οι μεταβλητές θα εμφανιστούν εδώ μόλις ξεκινήσει η εκτέλεση. Κάθε μεταβλητή είναι ένα κουτί στη μνήμη που κρατά μία τιμή του τύπου που δηλώθηκε.';
    this.host.replaceChildren(h('p', { class: 'empty' }, text));
  }

  fmt(value) { return format(value, { quote: true, dialect: this.dialect }); }

  /** Η ετικέτα τύπου: δηλωμένος τύπος (ΓΛΩΣΣΑ) ή είδος της τρέχουσας τιμής (ψευδογλώσσα). */
  label(cell, value) {
    if (!cell.dynamic) return typeLabel(cell.type);
    return value ? typeLabel(value.t, 'pseudo') : 'χωρίς τιμή';
  }

  /**
   * @param {object[]} frames ενεργά πλαίσια (κύριο πρόγραμμα/αλγόριθμος + κλήσεις)
   * @param {object[]} changes αλλαγές του τελευταίου βήματος
   * @param {string[]} reads κλειδιά κελιών που διαβάστηκαν στο τελευταίο βήμα
   */
  render(frames, changes = [], reads = []) {
    this.last = { frames, changes, reads };
    if (!frames.length) { this.renderEmpty(); return; }
    const changed = new Set(changes.map((c) => c.key));
    const read = new Set(reads);
    const sections = [...frames].reverse().map((frame, i) => this.renderFrame(frame, changed, read, i === 0));
    this.host.replaceChildren(...sections);
  }

  /** Νέα απεικόνιση με τα ίδια δεδομένα (μετά από αλλαγή επιλογής από τον χρήστη). */
  rerender() {
    if (this.last) this.render(this.last.frames, this.last.changes, this.last.reads);
  }

  renderFrame(frame, changed, read, isActive) {
    const scalars = [];
    const arrays = [];
    for (const cell of frame.vars.values()) {
      if (cell.array) arrays.push(this.renderArray(frame, cell, changed, read));
      else scalars.push(this.renderScalar(frame, cell, changed, read));
    }
    const title = `${FRAME_TITLE[frame.kind] || ''} ${frame.name}`.trim();
    const sub = frame.callLine ? `κλήθηκε από τη γραμμή ${frame.callLine}` : null;
    return h('section', { class: `frame frame-${frame.kind}${isActive ? ' is-active' : ''}` }, [
      h('header', { class: 'frame-head' }, [h('h3', {}, title), sub ? h('span', { class: 'frame-sub' }, sub) : null]),
      scalars.length ? h('div', { class: 'var-grid' }, scalars) : null,
      arrays,
      !scalars.length && !arrays.length ? h('p', { class: 'empty small' }, 'Χωρίς μεταβλητές.') : null,
    ]);
  }

  tags(cell) {
    const tags = [];
    if (cell.kind === 'const') tags.push('σταθερά');
    if (cell.kind === 'result') tags.push('τιμή επιστροφής');
    if (cell.isParam) tags.push('παράμετρος');
    if (cell.isInput) tags.push('δεδομένο');
    if (cell.isOutput) tags.push('αποτέλεσμα');
    return tags;
  }

  renderScalar(frame, cell, changed, read) {
    const key = cellKey(frame, cell, null);
    const value = cell.value;
    const typeClass = cell.dynamic ? (value ? value.t : 'none') : cell.type;
    const cls = ['var', `t-${typeClass}`];
    if (changed.has(key)) cls.push('is-changed');
    if (read.has(key)) cls.push('is-read');
    if (!value) cls.push('is-empty');
    const tags = this.tags(cell);
    return h('div', {
      class: cls.join(' '),
      title: value ? `${cell.name} = ${this.fmt(value)}` : `${cell.name}: δεν έχει πάρει ακόμη τιμή`,
    }, [
      h('div', { class: 'var-head' }, [
        h('span', { class: 'var-name' }, cell.name),
        h('span', { class: 'var-type' }, this.label(cell, value)),
      ]),
      h('div', { class: 'var-box' }, value ? this.fmt(value) : '?'),
      tags.length ? h('div', { class: 'var-tags' }, tags.join(', ')) : null,
    ]);
  }

  /**
   * Πώς εμφανίζεται ένας πίνακας: επιλογή του χρήστη, αλλιώς αυτόματη αναγνώριση.
   * Η επιλογή του χρήστη μένει και σε νέες εκτελέσεις, ενώ ο κώδικας μπορεί να έχει αλλάξει
   * στο μεταξύ. Γι' αυτό κάθε αποθηκευμένος δείκτης ελέγχεται στο τρέχον πλαίσιο: αν η
   * μεταβλητή δεν υπάρχει πια ή δεν είναι απλή αριθμητική μεταβλητή, ο δείκτης αφαιρείται.
   */
  structureOf(frame, cell) {
    const chosen = this.structures.get(structureKey(frame, cell));
    if (!chosen) return suggestStructure(frame, cell);
    const valid = new Set(pointerCandidates(frame).map((c) => c.norm));
    const pointers = Object.fromEntries(Object.entries(chosen.pointers)
      .map(([role, norm]) => [role, norm && valid.has(norm) ? norm : null]));
    return { mode: chosen.mode, pointers };
  }

  setStructure(frame, cell, structure) {
    this.structures.set(structureKey(frame, cell), structure);
    this.rerender();
  }

  renderArray(frame, cell, changed, read) {
    const array = cell.array;
    const extent = array.extent();
    const dynamic = cell.dynamic;
    const structure = array.rank === 1 ? this.structureOf(frame, cell) : { mode: 'array', pointers: {} };
    const sizeText = dynamic ? `θέσεις 1..${extent.join(' × ')}` : extent.join(', ');
    const typeText = dynamic ? 'πίνακας' : `πίνακας, ${typeLabel(cell.type)}`;
    const tags = this.tags(cell);
    const head = h('div', { class: 'var-head' }, [
      h('span', { class: 'var-name' }, dynamic ? cell.name : `${cell.name}[${sizeText}]`),
      h('span', { class: 'var-type' }, typeText),
    ]);
    const ctx = { frame, cell, pointers: structure.pointers, changed, read, fmt: (v) => this.fmt(v) };
    let body;
    if (structure.mode === 'stack') body = renderStack(ctx);
    else if (structure.mode === 'queue') body = renderQueue(ctx);
    else body = this.renderTable(frame, cell, changed, read);
    return h('div', { class: `var var-array t-array mode-${structure.mode}` }, [
      head,
      array.rank === 1 ? this.renderStructureControls(frame, cell, structure) : null,
      body,
      tags.length ? h('div', { class: 'var-tags' }, tags.join(', ')) : null,
    ]);
  }

  /** Επιλογή απεικόνισης (Πίνακας / Στοίβα / Ουρά) και των μεταβλητών-δεικτών. */
  renderStructureControls(frame, cell, structure) {
    const candidates = pointerCandidates(frame);
    const modeButtons = MODES.map((m) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(structure.mode === m.id),
      onclick: () => this.setStructure(frame, cell, this.withMode(frame, cell, structure, m.id)),
    }, m.label));
    const pointerSelects = (POINTERS[structure.mode] || []).map((spec) => {
      const select = h('select', {
        'aria-label': `Δείκτης ${spec.label}`,
        onchange: (e) => this.setStructure(frame, cell, {
          mode: structure.mode, pointers: { ...structure.pointers, [spec.role]: e.target.value || null },
        }),
      }, [
        h('option', { value: '' }, '(καμία)'),
        ...candidates.map((c) => h('option', { value: c.norm, selected: structure.pointers[spec.role] === c.norm }, c.name)),
      ]);
      return h('label', { class: 'pointer-select' }, [h('span', {}, spec.label), select]);
    });
    return h('div', { class: 'structure-controls' }, [
      h('div', { class: 'view-switch', role: 'radiogroup', 'aria-label': `Απεικόνιση του ${cell.name}` }, modeButtons),
      pointerSelects,
    ]);
  }

  /** Αλλαγή τρόπου απεικόνισης: οι δείκτες προτείνονται από τα ονόματα της θεωρίας, αν υπάρχουν. */
  withMode(frame, cell, current, mode) {
    if (mode === current.mode) return current;
    const suggested = suggestStructure(frame, cell);
    if (suggested.mode === mode) return suggested;
    const pointers = Object.fromEntries((POINTERS[mode] || []).map((p) => {
      const found = pointerCandidates(frame).find((c) => p.names.some((n) => n === c.norm));
      return [p.role, found ? found.norm : null];
    }));
    return { mode, pointers };
  }

  /** Ο πίνακας ως σειρά (1Δ) ή πλέγμα (2Δ) κουτιών. */
  renderTable(frame, cell, changed, read) {
    const array = cell.array;
    const extent = array.extent();
    const cellEl = (indices) => {
      const key = cellKey(frame, cell, array.keyOf(indices));
      const v = array.get(indices);
      const cls = ['cell'];
      if (changed.has(key)) cls.push('is-changed');
      if (read.has(key)) cls.push('is-read');
      if (!v) cls.push('is-empty');
      return h('td', { class: cls.join(' '), title: `${cell.name}[${indices.join(', ')}] = ${v ? this.fmt(v) : '?'}` }, v ? this.fmt(v) : '?');
    };
    if (extent.every((n) => n === 0)) return h('p', { class: 'empty small' }, 'Καμία θέση δεν έχει πάρει ακόμη τιμή.');
    let table;
    if (array.rank === 1) {
      const n = Math.min(extent[0], MAX_CELLS);
      const values = [];
      const indices = [];
      for (let i = 1; i <= n; i++) {
        values.push(cellEl([i]));
        indices.push(h('th', { scope: 'col' }, String(i)));
      }
      table = h('table', { class: 'arr arr-1d' }, [h('tbody', {}, [h('tr', {}, values), h('tr', { class: 'idx' }, indices)])]);
    } else {
      const [rows, cols] = extent;
      const maxRows = Math.min(rows, Math.floor(MAX_CELLS / Math.max(1, cols)) || 1);
      const header = h('tr', {}, [h('th', { class: 'corner' }, ''), ...Array.from({ length: cols }, (_, j) => h('th', { scope: 'col' }, String(j + 1)))]);
      const body = [];
      for (let i = 1; i <= maxRows; i++) {
        const tds = [];
        for (let j = 1; j <= cols; j++) tds.push(cellEl([i, j]));
        body.push(h('tr', {}, [h('th', { scope: 'row' }, String(i)), ...tds]));
      }
      table = h('table', { class: 'arr arr-2d' }, [h('thead', {}, header), h('tbody', {}, body)]);
    }
    const truncated = extent.reduce((a, b) => a * b, 1) > MAX_CELLS;
    return h('div', {}, [
      h('div', { class: 'arr-scroll' }, table),
      truncated ? h('p', { class: 'empty small' }, `Εμφανίζονται οι πρώτες ${MAX_CELLS} θέσεις.`) : null,
    ]);
  }
}

/** Οι επιλογές απεικόνισης κρατιούνται ανά υποπρόγραμμα/αλγόριθμο και πίνακα. */
function structureKey(frame, cell) {
  return `${frame.unit.name}|${cell.norm}`;
}
