// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Συνδέει τα επιμέρους τμήματα: επεξεργαστή, ελεγκτή εκτέλεσης και προβολές.
// Κάθε τμήμα γνωρίζει μόνο το δικό του κομμάτι· η εφαρμογή μεταφέρει τα δεδομένα.
import { $, $$, h, debounce } from './dom.js';
import { icon } from './icons.js';
import { Editor } from './editor/editor.js';
import { formatSource } from './editor/formatter.js';
import { Runner } from './runner.js';
import { Tabs } from './tabs.js';
import { storage } from './storage.js';
import { workspace } from './workspace-store.js';
import { DialectSwitch } from './dialect-switch.js';
import { SymbolBar } from './symbol-bar.js';
import { initTheme } from './theme.js';
import { MemoryView } from './views/memory-view.js';
import { FlowView } from './views/flow-view.js';
import { TraceView } from './views/trace-view.js';
import { ExplainView } from './views/explain-view.js';
import { OutputView } from './views/output-view.js';
import { MessagesView } from './views/messages-view.js';
import { ReferenceView } from './views/reference-view.js';
import { compile } from '../core/compiler.js';
import { TYPE_LABEL, normalize } from '../core/tokens.js';
import { examplesFor } from '../examples.js';
import { getDialect, detectDialect } from '../core/dialects.js';
import { BRAND } from '../brand.js';
import { AboutDialog } from './views/about-dialog.js';
import { openTextFile, saveTextFile, safeFileName } from './file-io.js';
import { iconSvg } from './brand-mark.js';

const SPEEDS = [1500, 1000, 700, 500, 350, 250, 160, 100, 60, 30];
// Σύνδεσμοι που ανοίγουν απευθείας σε μία γλώσσα, π.χ. …/glossa-lab/#psevdoglossa
const HASH_TO_DIALECT = { glossa: 'glossa', psevdoglossa: 'pseudo' };
const DIALECT_TO_HASH = { glossa: 'glossa', pseudo: 'psevdoglossa' };

export class App {
  constructor() {
    this.root = $('#app');
    this.diagnostics = { errors: [], warnings: [] };
    this.runtimeError = null;
    this.status = 'idle';
    this.dialect = HASH_TO_DIALECT[location.hash.slice(1)] || workspace.dialect();
    this.initIcons();
    this.initViews();
    this.initEditor();
    this.initRunner();
    this.initToolbar();
    this.initMobileNav();
    this.initShortcuts();
    this.applyDialect();
    this.updateButtons();
  }

  // ---------- Αρχικοποίηση ----------
  initIcons() {
    $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
    $('#brand-mark').innerHTML = iconSvg('top');
    initTheme($('#btn-theme'), { sun: icon('sun'), moon: icon('moon') });
  }

  initViews() {
    const goto = (line, col = 1, length = 0) => this.gotoLine(line, col, length);
    this.explain = new ExplainView($('#explain'), { onGoto: goto });
    this.memory = new MemoryView($('#memory'));
    this.flow = new FlowView($('#flow'), { onGoto: goto });
    this.trace = new TraceView($('#trace'), { onGoto: goto });
    this.output = new OutputView($('#output'));
    this.messages = new MessagesView($('#messages'), { onGoto: goto });
    this.guide = new ReferenceView($('#guide'), {
      onInsert: (template) => { this.editor.insertSnippet(template); this.setView('code'); },
      onAbout: () => this.about.open(),
      credit: `${BRAND.productName} ${BRAND.version}, © ${BRAND.year} ${BRAND.author.name}, άδεια ${BRAND.license}.`,
    });
    this.ioTabs = new Tabs($('[data-tabs="io"]'));
    this.runTabs = new Tabs($('[data-tabs="run"]'));
    $('#diag-chip').addEventListener('click', () => { this.ioTabs.select('messages'); this.setView('io'); });
  }

  initEditor() {
    this.editor = new Editor($('#editor-host'), {
      onChange: (text) => this.onCodeChange(text),
      onBreakpointsChange: (set) => this.runner && this.runner.setBreakpoints(set),
    });
    const inputs = $('#inputs');
    inputs.addEventListener('input', () => this.updateInputsTab());
    inputs.addEventListener('input', debounce(() => workspace.setInputs(this.dialect, inputs.value), 400));

    this.symbolBar = new SymbolBar($('#symbol-bar'), {
      insert: (text) => this.editor.insert(text),
      indent: () => this.editor.indentSelection(false),
      suggest: () => { this.editor.focus(); this.editor.updateCompletion(true); },
    });
    this.dialectSwitch = new DialectSwitch($('#dialect-switch'), (id) => this.switchDialect(id));
    window.addEventListener('hashchange', () => {
      const id = HASH_TO_DIALECT[location.hash.slice(1)];
      if (id && id !== this.dialect) this.switchDialect(id);
    });
  }

  initRunner() {
    this.runner = new Runner((type, payload) => this.onRunnerEvent(type, payload));
    this.runner.setBreakpoints(this.editor.breakpoints);
    const speed = $('#speed');
    speed.value = storage.get('speed', 5);
    const apply = () => { this.runner.setDelay(SPEEDS[Number(speed.value) - 1]); storage.set('speed', Number(speed.value)); };
    speed.addEventListener('input', apply);
    apply();

    $('#btn-run').addEventListener('click', () => this.cmdRun());
    $('#btn-step').addEventListener('click', () => this.cmdStep('step'));
    $('#btn-over').addEventListener('click', () => this.cmdStep('over'));
    $('#btn-out').addEventListener('click', () => this.cmdStep('out'));
    $('#btn-animate').addEventListener('click', () => this.cmdAnimate());
    $('#btn-stop').addEventListener('click', () => this.cmdStop());
  }

  initToolbar() {
    const select = $('#examples');
    select.addEventListener('change', () => {
      const ex = examplesFor(this.dialect).find((e) => e.id === select.value);
      select.value = '';
      if (ex) this.loadDocument(ex.code, `Φορτώθηκε: ${ex.title}.`);
    });

    this.about = new AboutDialog();
    $('#btn-about').addEventListener('click', () => this.about.open());

    $('#btn-open').addEventListener('click', () => this.cmdOpen());
    $('#btn-save').addEventListener('click', () => this.cmdSave());
    $('#btn-copy').addEventListener('click', () => this.copyCode());
    $('#btn-format').addEventListener('click', () => this.cmdFormat());
    $('#btn-clear').addEventListener('click', () => this.cmdClear());
    $('#btn-maximize').addEventListener('click', () => this.toggleMaximize());
    $('#dialect-hint-action').addEventListener('click', () => this.moveToDetectedDialect());
  }

  initMobileNav() {
    $$('.mobile-nav [data-view]').forEach((btn) => btn.addEventListener('click', () => this.setView(btn.dataset.view)));
  }

  initShortcuts() {
    // [πλήκτρο, Ctrl/Cmd, Shift, ενέργεια]
    const shortcuts = [
      ['F5', false, false, () => this.cmdRun()],
      ['F6', false, false, () => this.cmdAnimate()],
      ['F10', false, false, () => this.cmdStep('step')],
      ['F10', false, true, () => this.cmdStep('over')],
      ['s', true, false, () => this.cmdSave()],
      ['o', true, false, () => this.cmdOpen()],
    ];
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const hit = shortcuts.find(([k, c, sh]) => k === key && c === ctrl && sh === e.shiftKey);
      if (hit) { e.preventDefault(); hit[3](); return; }
      if (e.key !== 'Escape') return;
      if (this.runner.isActive && this.runner.state !== 'input') this.cmdStop();
      else if (this.root.dataset.maximized === 'true') this.toggleMaximize(false);
    });
  }

  // ---------- Γλώσσα ----------
  /** Εφαρμόζει την τρέχουσα γλώσσα σε όλη τη διεπαφή και φορτώνει το πρόχειρό της. */
  applyDialect() {
    const dialect = getDialect(this.dialect);
    this.root.dataset.dialect = dialect.id;
    this.dialectSwitch.set(dialect.id);
    this.editor.setDialect(dialect.id, dialect.label);
    for (const view of [this.memory, this.flow, this.trace, this.explain, this.guide]) view.setDialect(dialect.id);
    this.symbolBar.render(dialect.id);

    const select = $('#examples');
    select.replaceChildren(h('option', { value: '' }, 'Παραδείγματα…'),
      ...examplesFor(dialect.id).map((ex) => h('option', { value: ex.id }, `${ex.title}: ${ex.topic}`)));

    const draft = workspace.draft(dialect.id);
    this.editor.value = draft !== null && draft.trim() ? draft : examplesFor(dialect.id)[0].code;
    $('#inputs').value = workspace.inputs(dialect.id);
    this.updateInputsTab();
    this.editor.breakpoints.clear();
    this.resetRunViews();

    workspace.setDialect(dialect.id);
    if (location.hash && location.hash !== `#${DIALECT_TO_HASH[dialect.id]}`) this.updateHash();
  }

  /** Ο σύνδεσμος της σελίδας δείχνει τη γλώσσα, ώστε να μπορεί να μοιραστεί. */
  updateHash() {
    try {
      history.replaceState(null, '', `#${DIALECT_TO_HASH[this.dialect]}`);
    } catch {
      // π.χ. σε περιβάλλον χωρίς ιστορικό: η γλώσσα έχει ήδη αποθηκευτεί τοπικά
    }
  }

  switchDialect(id) {
    if (id === this.dialect) return;
    this.cmdStop(true);
    workspace.setDraft(this.dialect, this.editor.value);
    this.dialect = id;
    this.applyDialect();
    this.updateHash();
    this.toast(`Γλώσσα: ${getDialect(id).label}. Κάθε γλώσσα έχει το δικό της πρόχειρο.`);
  }

  /** Ο κώδικας ανήκει στην άλλη γλώσσα: μεταφέρεται στο πρόχειρό της. */
  moveToDetectedDialect() {
    const target = detectDialect(this.editor.value);
    if (!target || target === this.dialect) return;
    workspace.setDraft(target, this.editor.value);
    workspace.setDraft(this.dialect, '');
    this.dialect = target;
    this.applyDialect();
    this.updateHash();
    this.toast(`Ο κώδικας μεταφέρθηκε στη γλώσσα: ${getDialect(target).label}.`);
  }

  showDialectHint(detected) {
    const hint = $('#dialect-hint');
    const mismatch = detected && detected !== this.dialect;
    hint.hidden = !mismatch;
    if (!mismatch) return;
    const label = getDialect(detected).label;
    $('#dialect-hint-text').textContent = `Ο κώδικας ξεκινά με «${detected === 'pseudo' ? 'Αλγόριθμος' : 'ΠΡΟΓΡΑΜΜΑ'}», άρα είναι γραμμένος σε ${label}, ενώ έχει επιλεγεί ${getDialect(this.dialect).label}.`;
    $('#dialect-hint-action').textContent = `Μεταφορά στη γλώσσα ${label}`;
  }

  /** Μεγιστοποίηση του πάνελ κώδικα (κρύβει τα υπόλοιπα πάνελ). */
  toggleMaximize(force) {
    const on = force ?? this.root.dataset.maximized !== 'true';
    this.root.dataset.maximized = String(on);
    const btn = $('#btn-maximize');
    btn.innerHTML = icon(on ? 'minimize' : 'maximize');
    const label = on ? 'Επαναφορά (Esc)' : 'Μεγιστοποίηση κώδικα';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(on));
    if (on) this.setView('code');
    this.editor.measure();
  }

  // ---------- Αρχεία και έγγραφο ----------
  /** Φορτώνει νέο κώδικα: σταματά την εκτέλεση, καθαρίζει τις προβολές, κρατά δυνατή την αναίρεση. */
  loadDocument(text, message) {
    this.cmdStop(true);
    this.editor.replaceAll(text);
    $('#inputs').value = '';
    workspace.setInputs(this.dialect, '');
    this.updateInputsTab();
    this.resetRunViews();
    this.setView('code');
    this.toast(`${message} Με Ctrl+Z (Αναίρεση) επιστρέφει ο προηγούμενος κώδικας.`);
  }

  async cmdOpen() {
    const file = await openTextFile('.glo,.gls,.alg,.txt,text/plain');
    if (!file) return;
    const detected = detectDialect(file.text);
    if (detected && detected !== this.dialect) this.switchDialect(detected);
    this.loadDocument(file.text, `Άνοιξε το αρχείο ${file.name}.`);
  }

  async cmdSave() {
    const name = safeFileName(programName(this.editor.value), this.dialect === 'pseudo' ? '.alg' : '.glo');
    const result = await saveTextFile(name, this.editor.value);
    if (result === 'saved') this.toast(`Αποθηκεύτηκε: ${name}`);
    else if (result === 'downloaded') this.toast(`Το αρχείο ${name} αποθηκεύτηκε στις «Λήψεις».`);
  }

  cmdFormat() {
    const formatted = formatSource(this.editor.value);
    if (formatted !== this.editor.value) this.editor.replaceAll(formatted, { keepCaret: true });
    this.toast('Ο κώδικας στοιχίστηκε.');
  }

  cmdClear() {
    if (!this.editor.value.trim()) return;
    this.loadDocument('', 'Ο κώδικας καθαρίστηκε.');
  }

  /** Επαναφέρει τις προβολές εκτέλεσης στην αρχική τους κατάσταση. */
  resetRunViews() {
    this.runtimeError = null;
    this.setStatus('idle');
    this.editor.setExecution({});
    this.explain.renderIdle();
    this.memory.renderEmpty();
    this.flow.renderEmpty();
    this.trace.reset();
    this.output.clear();
    this.analyzeNow();
  }

  // ---------- Κώδικας ----------
  onCodeChange(text) {
    if (this.runner.isActive || this.status === 'done' || this.status === 'error') {
      const wasActive = this.runner.isActive;
      this.runner.stop(true);
      this.setStatus('idle');
      this.editor.setExecution({});
      this.output.removePrompt();
      if (wasActive) this.output.note('Η εκτέλεση διακόπηκε επειδή άλλαξε ο κώδικας.', 'warn');
    }
    this.runtimeError = null;
    this.saveCode(text);
    this.analyzeSoon();
  }

  saveCode = debounce((text) => workspace.setDraft(this.dialect, text), 500);

  analyzeSoon = debounce(() => this.analyzeNow(), 450);

  analyzeNow() {
    const result = compile(this.editor.value, this.dialect);
    this.diagnostics = { errors: result.errors, warnings: result.warnings };
    if (result.analysis) this.editor.setSymbols(symbolsOf(result));
    this.showDiagnostics();
    this.showDialectHint(result.detected);
  }

  showDiagnostics() {
    const errors = this.runtimeError ? [this.runtimeError, ...this.diagnostics.errors] : this.diagnostics.errors;
    const { warnings } = this.diagnostics;
    this.editor.setDiagnostics([...errors, ...warnings].map((e) => ({
      line: e.line, col: e.col, length: e.length, severity: e.severity, title: e.message,
    })));
    this.messages.render(errors, warnings, this.editor.value);
    const chip = $('#diag-chip');
    const parts = [];
    if (errors.length) parts.push(`${errors.length} ${errors.length === 1 ? 'λάθος' : 'λάθη'}`);
    if (warnings.length) parts.push(`${warnings.length} ${warnings.length === 1 ? 'προειδοποίηση' : 'προειδοποιήσεις'}`);
    chip.textContent = parts.length ? parts.join(', ') : 'Χωρίς λάθη';
    chip.className = `diag-chip ${errors.length ? 'is-error' : warnings.length ? 'is-warning' : 'is-ok'}`;
    for (const badge of [$('#msg-badge'), $('#nav-badge')]) {
      badge.hidden = !errors.length;
      badge.textContent = String(errors.length);
    }
  }

  /** Δείχνει στην καρτέλα πόσες τιμές περιμένουν στα «Δεδομένα εισόδου». */
  updateInputsTab() {
    const count = $('#inputs').value.split('\n').filter((s) => s.trim()).length;
    const badge = $('#inputs-badge');
    badge.hidden = count === 0;
    badge.textContent = String(count);
    badge.title = `${count} ${count === 1 ? 'τιμή θα διαβαστεί' : 'τιμές θα διαβαστούν'} χωρίς να ζητηθούν`;
  }

  gotoLine(line, col = 1, length = 0) {
    this.setView('code');
    this.editor.selectAt(line, col, length);
  }

  async copyCode() {
    const text = this.editor.value;
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Ο κώδικας αντιγράφηκε.');
    } catch {
      const ta = this.editor.ta;
      ta.focus();
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      this.toast(ok ? 'Ο κώδικας αντιγράφηκε.' : 'Επιλέχθηκε όλος ο κώδικας: πάτησε Ctrl+C για αντιγραφή.');
    }
  }

  // ---------- Εντολές εκτέλεσης ----------
  start() {
    this.runtimeError = null;
    this.output.start();
    this.trace.reset();
    const inputs = $('#inputs').value.split('\n').map((s) => s.trim()).filter((s) => s.length);
    return this.runner.prepare(this.editor.value, inputs, this.dialect);
  }

  cmdRun() {
    const r = this.runner;
    if (r.state === 'running' && r.mode === 'run') { r.pause(); return; }
    if (r.state === 'input') return;
    if (!r.isActive && !this.start()) return;
    this.setStatus('running');
    r.run();
  }

  cmdStep(kind) {
    const r = this.runner;
    if (r.state === 'input' || (r.state === 'running' && r.mode !== 'animate')) return;
    if (r.state === 'running') r.pause();
    if (!r.isActive) {
      if (kind !== 'step' || !this.start()) return;
      this.setView('run');
    }
    this.setStatus('running');
    if (kind === 'over') r.stepOver();
    else if (kind === 'out') r.stepOut();
    else r.step();
  }

  cmdAnimate() {
    const r = this.runner;
    if (r.state === 'running' && r.mode === 'animate') { r.pause(); return; }
    if (r.state === 'input' || r.state === 'running') return;
    if (!r.isActive) {
      if (!this.start()) return;
      this.setView('run');
    }
    this.setStatus('running');
    r.animate();
  }

  cmdStop(silent = false) {
    if (!this.runner.isActive) return;
    this.runner.stop(silent);
  }

  // ---------- Συμβάντα εκτέλεσης ----------
  onRunnerEvent(type, p) {
    switch (type) {
      case 'compileFailed':
        this.diagnostics = { errors: p.result.errors, warnings: p.result.warnings };
        this.showDiagnostics();
        this.setStatus('idle');
        this.output.note('Το πρόγραμμα δεν εκτελέστηκε επειδή υπάρχουν λάθη. Δες την καρτέλα «Μηνύματα».', 'error');
        this.ioTabs.select('messages');
        this.setView('io');
        break;
      case 'started':
        this.diagnostics.warnings = p.result.warnings;
        this.showDiagnostics();
        break;
      case 'output':
        this.output.write(p.text);
        break;
      case 'queuedInput':
        this.output.echoQueued(p.name, p.text);
        break;
      case 'progress':
        this.explain.render({ status: 'running', steps: p.steps, action: null, nextLine: null, nextSource: '', frameName: '' });
        break;
      case 'paused':
        if (!p.transient) this.setStatus('paused');
        this.snapshot(p.transient ? 'running' : 'paused', p.line);
        break;
      case 'input':
        this.setStatus('input');
        this.snapshot('input', this.runner.lastLine);
        this.toggleMaximize(false);
        this.ioTabs.select('output');
        if (window.matchMedia('(max-width: 860px)').matches) this.setView('io');
        this.output.prompt(p.request, (text) => {
          this.setStatus('running');
          this.runner.provideInput(text);
        }, this.dialect);
        break;
      case 'done':
        this.setStatus('done');
        this.snapshot('done', null);
        this.output.note('Τέλος εκτέλεσης.', 'ok');
        break;
      case 'error':
        this.setStatus('error');
        this.runtimeError = p.error;
        this.snapshot('error', null);
        this.showDiagnostics();
        this.output.removePrompt();
        this.output.note(`Η εκτέλεση σταμάτησε στη γραμμή ${p.error.line}: ${p.error.message}`, 'error');
        this.ioTabs.select('messages');
        this.setView('io');
        break;
      case 'stopped':
        this.setStatus('idle');
        this.output.removePrompt();
        this.output.note('Η εκτέλεση διακόπηκε.', 'warn');
        this.snapshot('idle', null);
        break;
      default:
        break;
    }
  }

  snapshot(status, nextLine) {
    const it = this.runner.interp;
    if (!it) return;
    const lines = this.editor.value.split('\n');
    const frame = it.currentFrame;
    this.memory.render(it.frames, it.lastChanges, it.lastReads);
    this.flow.render(it.loops, it.frames);
    this.trace.render(it.trace, it.traceTruncated);
    this.explain.render({
      status, steps: it.steps, action: it.lastAction, nextLine,
      nextSource: nextLine ? lines[nextLine - 1] || '' : '',
      frameName: frame && frame.kind !== 'program' ? frame.name : '',
    });
    const showNext = status === 'paused' || status === 'running' || status === 'input';
    this.editor.setExecution({
      next: showNext ? nextLine : null,
      last: it.lastAction && status !== 'idle' ? it.lastAction.line : null,
    });
  }

  // ---------- Κατάσταση διεπαφής ----------
  setStatus(status) {
    this.status = status;
    this.root.dataset.status = status;
    this.updateButtons();
  }

  updateButtons() {
    const r = this.runner;
    const s = r.state;
    const active = r.isActive;
    const running = s === 'running';
    const set = (id, { disabled, label, iconName }) => {
      const btn = $(id);
      btn.disabled = Boolean(disabled);
      if (label) {
        btn.innerHTML = `${icon(iconName)}<span>${label}</span>`;
      }
    };
    const runMode = running && r.mode === 'run';
    const animMode = running && r.mode === 'animate';
    set('#btn-run', {
      disabled: s === 'input' || animMode,
      label: runMode ? 'Παύση' : active ? 'Συνέχεια' : 'Εκτέλεση',
      iconName: runMode ? 'pause' : 'play',
    });
    set('#btn-step', { disabled: s === 'input' || runMode });
    set('#btn-over', { disabled: !active || s === 'input' || running });
    set('#btn-out', { disabled: !active || s === 'input' || running || (r.currentDepth || 1) <= 1 });
    set('#btn-animate', {
      disabled: s === 'input' || runMode,
      label: animMode ? 'Παύση' : 'Αυτόματα',
      iconName: animMode ? 'pause' : 'animate',
    });
    set('#btn-stop', { disabled: !active });
  }

  setView(view) {
    this.root.dataset.view = view;
    $$('.mobile-nav [data-view]').forEach((b) => {
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
}

/** Ονόματα από τον κώδικα για την αυτόματη συμπλήρωση. */
function symbolsOf(result) {
  return result.dialect === 'pseudo' ? pseudoSymbols(result) : glossaSymbols(result.program);
}

function glossaSymbols(program) {
  const out = [];
  for (const u of [program, ...program.subs]) {
    for (const c of u.consts) out.push({ name: c.name, kind: 'const', detail: 'σταθερά' });
    for (const v of u.vars) {
      out.push({
        name: v.name,
        kind: v.dims ? 'array' : 'var',
        detail: `${TYPE_LABEL[v.type]}${v.dims ? `, πίνακας ${v.dims.length}Δ` : ''}${u === program ? '' : `, στο ${u.name}`}`,
        insert: v.dims ? `${v.name}[\${${v.dims.length === 2 ? 'i, j' : 'i'}}]` : v.name,
      });
    }
  }
  for (const s of program.subs) {
    const params = s.params.map((p) => p.name).join(', ');
    out.push({
      name: s.name,
      kind: s.type === 'Function' ? 'func' : 'proc',
      detail: s.type === 'Function' ? `συνάρτηση (${params}): ${TYPE_LABEL[s.returnType]}` : `διαδικασία (${params})`,
      insert: `${s.name}(\${${params || ''}})`,
    });
  }
  return out;
}

function pseudoSymbols(result) {
  const out = [];
  const seen = new Set();
  for (const [alg, { scope }] of result.analysis.units) {
    for (const sym of scope.values()) {
      if (seen.has(sym.norm)) continue;
      seen.add(sym.norm);
      out.push({
        name: sym.name,
        kind: sym.dims ? 'array' : 'var',
        detail: `${sym.dims ? `πίνακας ${sym.dims}Δ` : 'μεταβλητή'}${alg === result.program.main ? '' : `, στο ${alg.name}`}`,
        insert: sym.dims ? `${sym.name}[\${${sym.dims === 2 ? 'i, j' : 'i'}}]` : sym.name,
      });
    }
  }
  for (const alg of result.program.algorithms.slice(1)) {
    const params = [...alg.inputs, ...alg.outputs].map((p) => p.name).join(', ');
    out.push({ name: alg.name, kind: 'proc', detail: `αλγόριθμος (${params})`, insert: `${alg.name}(\${${params}})` });
  }
  return out;
}

/** Το όνομα του προγράμματος ή αλγορίθμου (πρώτη γραμμή), για το όνομα του αρχείου. */
function programName(source) {
  const first = source.split('\n').find((l) => l.trim() && !l.trim().startsWith('!')) || '';
  const m = first.trim().match(/^(\S+)\s+(\S+)/);
  const word = m ? normalize(m[1]) : '';
  return word === 'ΠΡΟΓΡΑΜΜΑ' || word === 'ΑΛΓΟΡΙΘΜΟΣ' ? m[2] : 'programma';
}
