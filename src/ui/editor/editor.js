// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Επεξεργαστής κώδικα: textarea με επικαλυπτόμενο χρωματισμό, αριθμούς γραμμών,
// σημεία διακοπής, σημάνσεις εκτέλεσης/σφαλμάτων και αυτόματη συμπλήρωση.
import { h, escapeHtml } from '../dom.js';
import { highlight } from './highlighter.js';
import { AutocompletePopup, buildSuggestions } from './autocomplete.js';
import { firstWord, indentAfter, indentOf, isCloser, INDENT } from './formatter.js';

const WORD_BEFORE = /[A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF]+$/;
const WORD_CHAR = /^[A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF]$/;

export class Editor {
  /**
   * @param {HTMLElement} host
   * @param {{ onChange?: (text) => void, onBreakpointsChange?: (Set) => void }} hooks
   */
  constructor(host, hooks = {}) {
    this.hooks = hooks;
    this.breakpoints = new Set();
    this.diagnostics = [];
    this.exec = { next: null, last: null };
    this.symbols = [];
    this.dialect = 'glossa';
    this.acPrefix = '';
    this.build(host);
    this.measure();
    this.render();
  }

  // ---------- Κατασκευή ----------
  build(host) {
    this.gutterInner = h('div', { class: 'gutter-inner' });
    this.gutter = h('div', { class: 'gutter', 'aria-hidden': 'true' }, this.gutterInner);
    this.code = h('code');
    this.pre = h('pre', { class: 'layer layer-code', 'aria-hidden': 'true' }, this.code);
    this.marks = h('div', { class: 'layer layer-marks', 'aria-hidden': 'true' });
    this.ta = h('textarea', {
      class: 'code-input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
      autocorrect: 'off', wrap: 'off', 'aria-label': 'Κώδικας ΓΛΩΣΣΑΣ', 'aria-multiline': 'true',
    });
    this.area = h('div', { class: 'code-area' }, [this.marks, this.pre, this.ta]);
    this.root = h('div', { class: 'editor' }, [this.gutter, this.area]);
    host.append(this.root);
    this.popup = new AutocompletePopup((item) => this.applyCompletion(item), this.root);

    this.ta.addEventListener('input', (e) => this.onInput(e));
    this.ta.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.ta.addEventListener('scroll', () => this.syncScroll());
    this.ta.addEventListener('click', () => this.popup.hide());
    this.gutter.addEventListener('click', (e) => this.onGutterClick(e));
    if ('ResizeObserver' in window) new ResizeObserver(() => this.measure()).observe(this.area);
    // Οι διαστάσεις χαρακτήρα αλλάζουν όταν φορτωθεί η γραμματοσειρά.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.measure());
  }

  measure() {
    const probe = h('span', { class: 'probe' }, 'ΜΜΜΜΜΜΜΜΜΜ');
    this.pre.append(probe);
    this.charWidth = probe.getBoundingClientRect().width / 10 || 8.4;
    probe.remove();
    const cs = getComputedStyle(this.ta);
    this.lineHeight = parseFloat(cs.lineHeight) || 22;
    this.padTop = parseFloat(cs.paddingTop) || 0;
    this.padLeft = parseFloat(cs.paddingLeft) || 0;
    this.renderMarks();
  }

  // ---------- Δημόσιο API ----------
  get value() { return this.ta.value; }

  set value(text) {
    this.ta.value = text;
    this.ta.setSelectionRange(0, 0);
    this.ta.scrollTop = 0;
    this.render();
  }

  focus() { this.ta.focus(); }

  setSymbols(symbols) { this.symbols = symbols; }

  /** Η γλώσσα του κώδικα: χρωματισμός, συμπλήρωση. */
  setDialect(dialectId, label) {
    this.dialect = dialectId;
    this.ta.setAttribute('aria-label', `Κώδικας: ${label}`);
    this.popup.hide();
    this.render();
  }

  setDiagnostics(list) {
    this.diagnostics = list;
    this.renderGutter();
    this.renderMarks();
  }

  setExecution({ next = null, last = null } = {}) {
    this.exec = { next, last };
    this.renderGutter();
    this.renderMarks();
    if (next) this.revealLine(next);
  }

  revealLine(line) {
    const top = (line - 1) * this.lineHeight;
    const view = this.ta.clientHeight - this.padTop * 2;
    if (top < this.ta.scrollTop + this.lineHeight || top > this.ta.scrollTop + view - this.lineHeight * 2) {
      this.ta.scrollTop = Math.max(0, top - view / 3);
    }
  }

  /** Τοποθετεί τον κέρσορα στη γραμμή/στήλη και επιλέγει το εύρος. */
  selectAt(line, col = 1, length = 0) {
    const lines = this.ta.value.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) offset += lines[i].length + 1;
    const start = offset + Math.max(0, col - 1);
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(start, start + length);
    this.revealLine(line);
  }

  /** Εισάγει κείμενο στη θέση του κέρσορα, διατηρώντας το ιστορικό αναίρεσης. */
  insert(text) {
    this.ta.focus({ preventScroll: true });
    let ok = false;
    const command = text === '' ? ['delete', false] : ['insertText', false, text];
    try { ok = document.execCommand(...command); } catch { ok = false; }
    if (!ok) {
      this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, 'end');
      this.ta.dispatchEvent(new Event('input'));
    }
  }

  /**
   * Αντικαθιστά όλο τον κώδικα, ώστε η αλλαγή να αναιρείται με Ctrl+Z.
   * @param {string} text
   * @param {{ keepCaret?: boolean }} options keepCaret: ο κέρσορας μένει στην ίδια θέση
   */
  replaceAll(text, { keepCaret = false } = {}) {
    const ta = this.ta;
    const caret = ta.selectionStart;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(0, ta.value.length);
    if (ta.value !== '' || text !== '') this.insert(text);
    const pos = keepCaret ? Math.min(caret, text.length) : 0;
    ta.setSelectionRange(pos, pos);
    if (!keepCaret) ta.scrollTop = 0;
    this.syncScroll();
  }

  /** Θέση του κέρσορα (αρχή της λέξης που συμπληρώνεται) στην οθόνη. */
  caretAnchor(column) {
    const ta = this.ta;
    const lineIdx = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
    const box = this.area.getBoundingClientRect();
    const top = box.top + this.padTop + lineIdx * this.lineHeight - ta.scrollTop;
    return {
      left: box.left + this.padLeft + column * this.charWidth - ta.scrollLeft,
      top,
      bottom: top + this.lineHeight,
    };
  }

  /** Εισάγει πρότυπο κώδικα σε νέα γραμμή, με σωστή εσοχή. */
  insertSnippet(template) {
    const ta = this.ta;
    const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    const lineEnd = ta.value.indexOf('\n', ta.selectionStart);
    const lineText = ta.value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (lineText.trim()) {
      ta.setSelectionRange(lineEnd === -1 ? ta.value.length : lineEnd, lineEnd === -1 ? ta.value.length : lineEnd);
      const lines = ta.value.split('\n');
      const idx = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
      this.insert(`\n${indentAfter(lines, idx)}`);
    }
    this.acPrefix = '';
    this.applyCompletion({ insert: template });
  }

  // ---------- Απόδοση ----------
  render() {
    this.code.innerHTML = `${highlight(this.ta.value, this.dialect)}\n `;
    this.renderGutter();
    this.renderMarks();
    this.syncScroll();
  }

  renderGutter() {
    const count = this.ta.value.split('\n').length;
    const errorLines = new Map();
    for (const d of this.diagnostics) {
      const cur = errorLines.get(d.line);
      if (!cur || (cur.severity === 'warning' && d.severity === 'error')) errorLines.set(d.line, d);
    }
    const rows = [];
    for (let i = 1; i <= count; i++) {
      const d = errorLines.get(i);
      const cls = ['ln'];
      if (this.breakpoints.has(i)) cls.push('has-bp');
      if (d) cls.push(d.severity === 'warning' ? 'has-warning' : 'has-error');
      if (this.exec.next === i) cls.push('is-next');
      else if (this.exec.last === i) cls.push('is-last');
      rows.push(`<div class="${cls.join(' ')}" data-line="${i}"${d ? ` title="${escapeHtml(d.title)}"` : ''}>${i}</div>`);
    }
    this.gutterInner.innerHTML = rows.join('');
    this.root.style.setProperty('--gutter-chars', String(Math.max(2, String(count).length)));
  }

  renderMarks() {
    if (!this.lineHeight) return;
    const lh = this.lineHeight;
    const cw = this.charWidth;
    const lines = this.ta.value.split('\n');
    const parts = [];
    const band = (line, cls) => parts.push(`<div class="band ${cls}" style="top:${this.padTop + (line - 1) * lh}px;height:${lh}px"></div>`);
    if (this.exec.last && this.exec.last !== this.exec.next) band(this.exec.last, 'band-last');
    if (this.exec.next) band(this.exec.next, 'band-next');
    const labelled = new Set();
    for (const d of this.diagnostics) {
      if (d.line < 1 || d.line > lines.length) continue;
      const cls = d.severity === 'warning' ? 'squiggle-warning' : 'squiggle-error';
      const text = lines[d.line - 1] || '';
      const col = Math.min(Math.max(1, d.col), text.length + 1);
      const len = Math.max(1, Math.min(d.length || 1, text.length - col + 1 || 1));
      parts.push(`<div class="squiggle ${cls}" style="top:${this.padTop + d.line * lh - 4}px;left:${this.padLeft + (col - 1) * cw}px;width:${len * cw}px"></div>`);
      if (!labelled.has(d.line)) {
        labelled.add(d.line);
        const left = this.padLeft + (text.replace(/\s+$/, '').length + 3) * cw;
        parts.push(`<div class="inline-msg ${d.severity === 'warning' ? 'is-warning' : 'is-error'}" style="top:${this.padTop + (d.line - 1) * lh}px;left:${left}px;height:${lh}px">${escapeHtml(d.title)}</div>`);
      }
    }
    this.marks.innerHTML = parts.join('');
  }

  syncScroll() {
    const x = this.ta.scrollLeft;
    const y = this.ta.scrollTop;
    const t = `translate(${-x}px, ${-y}px)`;
    this.pre.style.transform = t;
    this.marks.style.transform = t;
    this.gutterInner.style.transform = `translateY(${-y}px)`;
  }

  // ---------- Συμβάντα ----------
  onInput(e) {
    this.render();
    if (this.hooks.onChange) this.hooks.onChange(this.ta.value);
    const typedWord = e.inputType === 'insertText' && e.data && WORD_CHAR.test(e.data.slice(-1));
    const deleting = e.inputType && e.inputType.startsWith('delete');
    if (typedWord || (deleting && this.popup.isOpen)) this.updateCompletion(false);
    else this.popup.hide();
  }

  onKeyDown(e) {
    if (this.popup.isOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.popup.move(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.popup.move(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.popup.accept(); return; }
      if (e.key === 'Escape') { e.preventDefault(); this.popup.hide(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') { e.preventDefault(); this.updateCompletion(true); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) { e.preventDefault(); this.indentSelection(e.shiftKey); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.newLine(); }
  }

  onGutterClick(e) {
    const row = e.target.closest('[data-line]');
    if (!row) return;
    const line = Number(row.dataset.line);
    if (this.breakpoints.has(line)) this.breakpoints.delete(line);
    else this.breakpoints.add(line);
    this.renderGutter();
    if (this.hooks.onBreakpointsChange) this.hooks.onBreakpointsChange(this.breakpoints);
  }

  /** Enter: διορθώνει την εσοχή της τρέχουσας γραμμής αν κλείνει δομή και στοιχίζει τη νέα. */
  newLine() {
    const ta = this.ta;
    const caret = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', caret - 1) + 1;
    let lines = ta.value.split('\n');
    const idx = ta.value.slice(0, caret).split('\n').length - 1;
    const current = lines[idx];
    if (isCloser(firstWord(current))) {
      const want = indentOf(lines, idx);
      const have = current.match(/^\s*/)[0];
      if (want !== have && caret >= lineStart + have.length) {
        const sel = [ta.selectionStart, ta.selectionEnd];
        ta.setSelectionRange(lineStart, lineStart + have.length);
        this.insert(want);
        const shift = want.length - have.length;
        ta.setSelectionRange(sel[0] + shift, sel[1] + shift);
        lines = ta.value.split('\n');
      }
    }
    const before = ta.value.slice(lineStart, ta.selectionStart);
    const indent = before.trim() ? indentAfter(lines, idx) : before.match(/^\s*/)[0];
    this.insert(`\n${indent}`);
  }

  indentSelection(outdent) {
    const ta = this.ta;
    const { selectionStart: s, selectionEnd: e } = ta;
    if (!outdent && s === e) { this.insert(INDENT); return; }
    const start = ta.value.lastIndexOf('\n', s - 1) + 1;
    const endIdx = ta.value.indexOf('\n', e - (e > s && ta.value[e - 1] === '\n' ? 1 : 0));
    const end = endIdx === -1 ? ta.value.length : endIdx;
    const block = ta.value.slice(start, end);
    const changed = block.split('\n').map((l) => (outdent ? l.replace(/^ {1,2}/, '') : INDENT + l)).join('\n');
    ta.setSelectionRange(start, end);
    this.insert(changed);
    ta.setSelectionRange(start, start + changed.length);
  }

  // ---------- Αυτόματη συμπλήρωση ----------
  updateCompletion(forced) {
    const ta = this.ta;
    const caret = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', caret - 1) + 1;
    const before = ta.value.slice(lineStart, caret);
    if (before.includes('!') || (before.split("'").length - 1) % 2 === 1) { this.popup.hide(); return; }
    const m = before.match(WORD_BEFORE);
    const prefix = m ? m[0] : '';
    if (!prefix && !forced) { this.popup.hide(); return; }
    if (/^[0-9]/.test(prefix)) { this.popup.hide(); return; }
    this.acPrefix = prefix;
    const atStart = before.slice(0, before.length - prefix.length).trim() === '';
    const items = buildSuggestions(prefix, this.symbols, atStart, this.dialect);
    if (!items.length || (items.length === 1 && items[0].insert === prefix)) { this.popup.hide(); return; }
    const column = before.length - prefix.length;
    this.popup.show(items, prefix, () => this.caretAnchor(column));
  }

  applyCompletion(item) {
    const ta = this.ta;
    const end = ta.selectionStart;
    const start = end - this.acPrefix.length;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const indent = ta.value.slice(lineStart, start).match(/^\s*/)[0];
    let text = item.insert.split('\n').map((l, i) => (i ? indent + l : l)).join('\n');
    const m = /\$\{([^}]*)\}/.exec(text);
    let selStart = null;
    let selLen = 0;
    if (m) {
      selStart = m.index;
      selLen = m[1].length;
      text = text.slice(0, m.index) + m[1] + text.slice(m.index + m[0].length);
    }
    text = text.replace(/\$\{([^}]*)\}/g, '$1');
    ta.setSelectionRange(start, end);
    this.insert(text);
    if (selStart !== null) ta.setSelectionRange(start + selStart, start + selStart + selLen);
    this.popup.hide();
  }
}
