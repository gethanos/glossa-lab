// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
//
// Διερμηνευτής βασισμένος σε generators, κοινός για ΓΛΩΣΣΑ και ψευδογλώσσα.
// Κάθε εντολή «παγώνει» (yield) πριν εκτελεστεί, ώστε το περιβάλλον να μπορεί να
// εκτελεί βηματικά, να σταματά σε σημεία διακοπής και να ζητά είσοδο από τον χρήστη.
//
// Συμβάντα που επιστρέφει ο generator:
//   { type: 'step', line, depth }    πριν από κάθε εντολή
//   { type: 'input', request }       ζητά κείμενο μέσω next(text)
//
// Οι μονάδες (πρόγραμμα/υποπρογράμματα ή αλγόριθμοι) και οι κλήσεις υλοποιούνται στις
// υποκλάσεις GlossaInterpreter και PseudoInterpreter.
import { GlossaError } from './errors.js';
import { builtinsFor } from './builtins.js';
import {
  int, real, str, bool, numeric, number, format, formatNumber, assignable, coerce, typeLabel, isNumericType,
} from './values.js';
import { render, evaluationChain } from './explain.js';
import { binary, compare, expectType, where } from './operations.js';
import { FixedArray, DynamicArray } from './arrays.js';

const DEFAULTS = { maxSteps: 1_000_000, maxDepth: 200, maxTrace: 3000 };

export class Interpreter {
  /**
   * @param {object} program AST
   * @param {object} analysis αποτέλεσμα του ελέγχου
   * @param {object} dialect ορισμός γλώσσας (dialects.js)
   * @param {object} options { inputs: string[], onOutput(text), onQueuedInput(name, text), maxSteps, maxDepth }
   */
  constructor(program, analysis, dialect, options = {}) {
    this.program = program;
    this.analysis = analysis;
    this.dialect = dialect;
    this.builtins = builtinsFor(dialect.id);
    this.options = { ...DEFAULTS, ...options };
    this.inputs = [...(options.inputs || [])];
    this.onOutput = options.onOutput || (() => {});
    this.onQueuedInput = options.onQueuedInput || (() => {});

    this.frames = [];
    this.loops = [];
    this.output = [];
    this.trace = [];
    this.traceTruncated = false;
    this.records = [];
    this.lastAction = null;
    this.lastChanges = [];
    this.lastReads = [];
    this.steps = 0;
    this.budgetStart = 0;
    this.nextFrameId = 1;
    this.nextLoopId = 1;
    this.logicalDepth = 0;
    this.currentStmt = null;
    this.finished = false;
  }

  // ---------- Βοηθητικά γλώσσας ----------
  /** Λέξη-κλειδί όπως γράφεται στη γλώσσα (ΑΝ ή Αν, ΑΛΗΘΗΣ ή Αληθής). */
  w(keyword) { return this.dialect.display(keyword); }
  fmt(value, quote = false) { return format(value, { quote, dialect: this.dialect.id }); }
  num(n) { return formatNumber(n, this.dialect.id); }
  show(expr) { return render(expr, null, undefined, this.dialect.id); }
  chain(expr, memo) { return evaluationChain(expr, memo, this.dialect.id); }
  get T() { return this.w('ΑΛΗΘΗΣ'); }
  get F() { return this.w('ΨΕΥΔΗΣ'); }

  /** Μηδενίζει το όριο βημάτων (μετά από παύση του χρήστη). */
  resetBudget() { this.budgetStart = this.steps; }

  get currentFrame() { return this.frames[this.frames.length - 1]; }

  /** Υλοποιείται από τις υποκλάσεις. */
  // eslint-disable-next-line require-yield
  *run() { throw new Error('run() δεν έχει υλοποιηθεί'); }

  *block(stmts) {
    for (const s of stmts) yield* this.statement(s);
  }

  pause(line) {
    this.steps++;
    if (this.steps - this.budgetStart > this.options.maxSteps) this.infiniteLoop(line);
    this.currentLine = line;
    return { type: 'step', line, depth: this.frames.length };
  }

  infiniteLoop(line) {
    const loop = [...this.loops].sort((a, b) => b.iteration - a.iteration)[0];
    throw new GlossaError('R_INFINITE_LOOP', { line: loop ? loop.line : line, col: 1 }, {
      limit: this.options.maxSteps, loopLine: loop ? loop.line : line, iterations: loop ? loop.iteration : 0,
      stepZero: Boolean(loop && loop.kind === 'for' && loop.stepValue === 0),
    });
  }

  // ---------- Καταγραφή ενεργειών ----------
  begin(line) {
    const rec = { line, changes: [], reads: [], output: null, cond: null };
    this.records.push(rec);
    return rec;
  }

  get rec() { return this.records[this.records.length - 1]; }

  /**
   * Ολοκληρώνει την τρέχουσα ενέργεια: ορίζει την επεξήγηση και γράφει στον πίνακα τιμών.
   * @param {string} kind είδος (assign, read, write, cond, loop, call, ...)
   * @param {string} text περιγραφή σε φυσική γλώσσα
   * @param {string[]|string[][]} [chain] αλυσίδα υπολογισμού
   */
  act(line, kind, text, chain = null) {
    const rec = this.records.pop() || { changes: [], reads: [] };
    const frame = this.currentFrame;
    this.lastAction = { line, kind, text, chain, frame: frame ? frame.name : '' };
    this.lastChanges = rec.changes;
    this.lastReads = rec.reads;
    if (this.trace.length >= this.options.maxTrace) { this.traceTruncated = true; return; }
    this.trace.push({
      step: this.trace.length + 1, line, kind, text, frameId: frame ? frame.id : 0,
      frameName: frame ? frame.name : '',
      changes: rec.changes.map((c) => ({ ...c, value: this.fmt(c.value, true) })),
      cond: rec.cond, output: rec.output,
    });
  }

  /** Γράφει μια γραμμή στην έξοδο. */
  emit(line) {
    this.output.push(line);
    if (this.rec) this.rec.output = this.rec.output ? `${this.rec.output} / ${line}` : line;
    this.onOutput(line);
  }

  // ---------- Πλαίσια (κλήσεις) ----------
  /**
   * Δημιουργεί το πλαίσιο ενός προγράμματος, υποπρογράμματος ή αλγορίθμου:
   * ένα «κουτί» για κάθε σύμβολο του ελέγχου.
   */
  pushFrame(unit, callLine, kind) {
    if (this.frames.length >= this.options.maxDepth) {
      throw new GlossaError('R_STACK_OVERFLOW', { line: callLine || unit.line, col: 1 }, { depth: this.frames.length });
    }
    const { scope } = this.analysis.units.get(unit);
    const vars = new Map();
    for (const sym of scope.values()) vars.set(sym.norm, this.createCell(sym));
    const frame = { id: this.nextFrameId++, name: unit.name, kind, unit, vars, callLine };
    this.frames.push(frame);
    return frame;
  }

  createCell(sym) {
    let array = null;
    if (Array.isArray(sym.dims)) array = new FixedArray(sym.dims);
    else if (sym.dims) array = new DynamicArray(sym.dims);
    return {
      name: sym.name, norm: sym.norm, kind: sym.kind, type: sym.type, dynamic: Boolean(sym.dynamic),
      dims: sym.dims, isParam: Boolean(sym.isParam), isInput: Boolean(sym.isInput), isOutput: Boolean(sym.isOutput),
      value: sym.kind === 'const' ? sym.value : null,
      array,
    };
  }

  popFrame() {
    const frame = this.frames.pop();
    this.loops = this.loops.filter((l) => l.frameId !== frame.id);
    return frame;
  }

  // ---------- Εντολές ----------
  *statement(s) {
    yield this.pause(s.line);
    this.currentStmt = s;
    const frame = this.currentFrame;
    switch (s.type) {
      case 'Assign': return yield* this.assign(s, frame);
      case 'Read': return yield* this.read(s, frame);
      case 'Write': return yield* this.write(s, frame);
      case 'If': return yield* this.ifStmt(s, frame);
      case 'Select': return yield* this.select(s, frame);
      case 'While': return yield* this.whileLoop(s, frame);
      case 'Repeat': return yield* this.repeatLoop(s, frame);
      case 'For': return yield* this.forLoop(s, frame);
      case 'Call': return yield* this.callStatement(s, frame);
      default: return undefined;
    }
  }

  *assign(s, frame) {
    this.begin(s.line);
    const memo = new Map();
    const value = yield* this.eval(s.expr, frame, memo);
    this.currentStmt = s;
    const ref = yield* this.reference(s.target, frame, memo);
    this.store(ref, value, s.target);
    const chain = this.chain(s.expr, memo);
    const shown = this.fmt(this.peekRef(ref), true);
    const text = chain.length > 1
      ? `Υπολογίζεται η έκφραση και η τιμή ${shown} αποθηκεύεται στη ${ref.display}.`
      : `Η ${ref.display} παίρνει την τιμή ${shown}.`;
    this.act(s.line, 'assign', text, chain.length > 1 ? [`${ref.display} ←`, ...chain] : null);
  }

  *read(s, frame) {
    this.begin(s.line);
    const parts = [];
    for (const target of s.targets) {
      const memo = new Map();
      const ref = yield* this.reference(target, frame, memo);
      const value = yield* this.requestValue(ref, target);
      this.store(ref, value, target, { lenient: true });
      parts.push(`${ref.display} = ${this.fmt(this.peekRef(ref), true)}`);
    }
    this.act(s.line, 'read', `Διαβάστηκε από την είσοδο: ${parts.join(', ')}.`);
  }

  /**
   * Ζητά μια τιμή: πρώτα από τα «Δεδομένα εισόδου», αλλιώς από τον χρήστη.
   * @param {object} ref η μεταβλητή που θα πάρει την τιμή
   * @param {object} node κόμβος για τη θέση του λάθους
   * @param {(text: string) => object} parse μετατροπή κειμένου σε τιμή
   * @param {object} request πρόσθετα στοιχεία για την προτροπή (π.χ. kind: 'list')
   */
  *ask(ref, node, parse, request = {}) {
    if (this.inputs.length) {
      const text = this.inputs.shift();
      const parsed = parse(text);
      if (parsed.ok) {
        this.onQueuedInput(ref.display, text);
        return parsed;
      }
      throw new GlossaError('R_INPUT_TYPE', where(node), {
        text, name: ref.display, typeLabel: request.typeLabel || '', hint: `${parsed.hint} Η τιμή προήλθε από τα «Δεδομένα εισόδου».`,
      });
    }
    let error = null;
    for (;;) {
      const text = yield { type: 'input', request: { name: ref.display, error, line: node.line, ...request } };
      const parsed = parse(String(text ?? ''));
      if (parsed.ok) return parsed;
      error = request.type
        ? `Η τιμή «${text}» δεν είναι ${request.typeLabel}. ${parsed.hint}`
        : `Η τιμή «${text}» δεν είναι αποδεκτή. ${parsed.hint}`;
    }
  }

  *write(s, frame) {
    this.begin(s.line);
    const pieces = [];
    const chains = [];
    for (const item of s.items) {
      const memo = new Map();
      const v = yield* this.eval(item, frame, memo);
      pieces.push(this.fmt(v));
      if (item.type !== 'Str' && item.type !== 'Num') chains.push(this.chain(item, memo));
    }
    const line = pieces.join(' ');
    this.emit(line);
    const text = s.items.length ? `Εμφανίζεται στην οθόνη: ${line || '(κενή γραμμή)'}` : 'Εμφανίζεται μια κενή γραμμή.';
    this.act(s.line, 'write', text, chains.length ? chains : null);
  }

  *condition(expr, frame, line) {
    this.begin(line);
    const memo = new Map();
    this.logicalDepth = 0;
    const v = yield* this.eval(expr, frame, memo);
    if (v.t !== 'bool') {
      throw new GlossaError('R_CONDITION_TYPE', where(expr), { value: this.fmt(v, true) });
    }
    this.rec.cond = `${this.show(expr)}: ${v.v ? 'Α' : 'Ψ'}`;
    return { value: v.v, chain: this.chain(expr, memo) };
  }

  *ifStmt(s, frame) {
    const IF = this.w('ΑΝ');
    const ELSEIF = this.w('ΑΛΛΙΩΣ_ΑΝ');
    const ELSE = this.w('ΑΛΛΙΩΣ');
    for (let i = 0; i < s.branches.length; i++) {
      const b = s.branches[i];
      if (i > 0 && b.line !== s.branches[i - 1].line) { yield this.pause(b.line); this.currentStmt = s; }
      const { value, chain } = yield* this.condition(b.cond, frame, b.line);
      const word = i === 0 ? IF : ELSEIF;
      if (value) {
        this.act(b.line, 'cond', `Η συνθήκη του ${word} είναι ${this.T}, άρα εκτελούνται οι εντολές του.`, chain);
        yield* this.block(b.body);
        return;
      }
      const end = s.endLine ? `μετά το ${this.w('ΤΕΛΟΣ_ΑΝ')}` : `μετά το ${IF}`;
      const next = i + 1 < s.branches.length ? `Ελέγχεται το επόμενο ${ELSEIF}.`
        : s.elseBody ? `Θα εκτελεστεί το ${ELSE}.` : `Δεν υπάρχει ${ELSE}, οπότε η εκτέλεση συνεχίζει ${end}.`;
      this.act(b.line, 'cond', `Η συνθήκη του ${word} είναι ${this.F}. ${next}`, chain);
    }
    if (s.elseBody) {
      yield this.pause(s.elseLine);
      this.begin(s.elseLine);
      this.act(s.elseLine, 'cond', `Καμία συνθήκη δεν ήταν αληθής, άρα εκτελούνται οι εντολές του ${ELSE}.`);
      yield* this.block(s.elseBody);
    }
  }

  *select(s, frame) {
    this.begin(s.line);
    const memo = new Map();
    const subject = yield* this.eval(s.expr, frame, memo);
    const shown = this.fmt(subject, true);
    this.act(s.line, 'cond', `Υπολογίζεται η τιμή του ${this.w('ΕΠΙΛΕΞΕ')}: ${this.show(s.expr)} = ${shown}. Ελέγχονται οι περιπτώσεις με τη σειρά.`);
    for (const c of s.cases) {
      yield this.pause(c.line);
      this.begin(c.line);
      let matched = false;
      for (const test of c.tests) {
        if (yield* this.caseMatches(test, subject, frame)) { matched = true; break; }
      }
      this.rec.cond = `${this.w('ΠΕΡΙΠΤΩΣΗ')}: ${matched ? 'Α' : 'Ψ'}`;
      if (matched) {
        this.act(c.line, 'cond', `Η τιμή ${shown} ταιριάζει σε αυτή την περίπτωση, άρα εκτελούνται οι εντολές της.`);
        yield* this.block(c.body);
        return;
      }
      this.act(c.line, 'cond', `Η τιμή ${shown} δεν ταιριάζει σε αυτή την περίπτωση.`);
    }
    if (s.defaultBody) {
      yield this.pause(s.defaultLine);
      this.begin(s.defaultLine);
      this.act(s.defaultLine, 'cond', `Καμία περίπτωση δεν ταίριαξε, άρα εκτελείται η ${this.w('ΠΕΡΙΠΤΩΣΗ')} ${this.w('ΑΛΛΙΩΣ')}.`);
      yield* this.block(s.defaultBody);
    }
  }

  *caseMatches(test, subject, frame) {
    const memo = new Map();
    if (test.kind === 'range') {
      const lo = yield* this.eval(test.lo, frame, memo);
      const hi = yield* this.eval(test.hi, frame, memo);
      return compare('>=', subject, lo, test.lo, this.dialect).v && compare('<=', subject, hi, test.hi, this.dialect).v;
    }
    const v = yield* this.eval(test.expr, frame, memo);
    return compare(test.kind === 'cmp' ? test.op : '=', subject, v, test.expr, this.dialect).v;
  }

  pushLoop(fields) {
    const loop = { id: this.nextLoopId++, frameId: this.currentFrame.id, iteration: 0, ...fields };
    this.loops.push(loop);
    return loop;
  }

  removeLoop(loop) {
    this.loops = this.loops.filter((l) => l !== loop);
  }

  *whileLoop(s, frame) {
    const WHILE = this.w('ΟΣΟ');
    const loop = this.pushLoop({ kind: 'while', keyword: WHILE, line: s.line, endLine: s.endLine, condition: this.show(s.cond), lastCond: null });
    for (let first = true; ; first = false) {
      if (!first) { yield this.pause(s.line); this.currentStmt = s; }
      const { value, chain } = yield* this.condition(s.cond, frame, s.line);
      loop.lastCond = value;
      loop.chain = chain;
      if (!value) {
        this.removeLoop(loop);
        const times = loop.iteration === 0 ? 'Το σώμα δεν εκτελέστηκε καμία φορά.' : `Το σώμα εκτελέστηκε ${loop.iteration} φορές.`;
        this.act(s.line, 'loop', `Η συνθήκη του ${WHILE} είναι ${this.F}, άρα ο βρόχος τελειώνει. ${times}`, chain);
        return;
      }
      loop.iteration++;
      this.act(s.line, 'loop', `Η συνθήκη του ${WHILE} είναι ${this.T}: ξεκινά η ${loop.iteration}η επανάληψη.`, chain);
      yield* this.block(s.body);
    }
  }

  *repeatLoop(s, frame) {
    const UNTIL = this.w('ΜΕΧΡΙΣ_ΟΤΟΥ');
    const opener = s.keyword || this.w('ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ');
    const loop = this.pushLoop({ kind: 'repeat', keyword: `${opener} … ${UNTIL}`, line: s.line, endLine: s.endLine, condition: this.show(s.cond), lastCond: null });
    this.begin(s.line);
    this.act(s.line, 'loop', `Ξεκινά ο βρόχος ${opener} … ${UNTIL}. Το σώμα εκτελείται πρώτα και η συνθήκη ελέγχεται στο τέλος, άρα θα εκτελεστεί τουλάχιστον μία φορά.`);
    for (;;) {
      loop.iteration++;
      yield* this.block(s.body);
      yield this.pause(s.endLine);
      this.currentStmt = s;
      const { value, chain } = yield* this.condition(s.cond, frame, s.endLine);
      loop.lastCond = value;
      loop.chain = chain;
      if (value) {
        this.removeLoop(loop);
        this.act(s.endLine, 'loop', `Η συνθήκη του ${UNTIL} είναι ${this.T}, άρα ο βρόχος τελειώνει μετά από ${loop.iteration} επαναλήψεις.`, chain);
        return;
      }
      this.act(s.endLine, 'loop', `Η συνθήκη του ${UNTIL} είναι ${this.F}, άρα το σώμα επαναλαμβάνεται (${loop.iteration + 1}η επανάληψη).`, chain);
    }
  }

  *forLoop(s, frame) {
    const FOR = this.w('ΓΙΑ');
    this.begin(s.line);
    const memo = new Map();
    const from = yield* this.eval(s.from, frame, memo);
    const to = yield* this.eval(s.to, frame, memo);
    const step = s.step ? yield* this.eval(s.step, frame, memo) : int(1);
    for (const [v, node] of [[from, s.from], [to, s.to], [step, s.step || s.from]]) {
      expectType(isNumericType(v.t), FOR, [v], `Οι τιμές ${this.w('ΑΠΟ')}, ${this.w('ΜΕΧΡΙ')} και ${this.w('ΜΕ_ΒΗΜΑ')} πρέπει να είναι αριθμοί.`, node, this.dialect);
    }
    // ΓΛΩΣΣΑ: βήμα 0 είναι λάθος. Ψευδογλώσσα: ο βρόχος είτε δεν εκτελείται είτε γίνεται ατέρμων.
    if (step.v === 0 && this.dialect.stepZero === 'error') throw new GlossaError('R_FOR_STEP_ZERO', where(s.step || s.from));
    this.currentStmt = s;
    const ref = yield* this.reference(s.counter, frame, memo);
    const name = ref.display;
    const up = step.v >= 0;
    const sign = up ? this.cmpText('<=') : this.cmpText('>=');
    const total = step.v === 0 ? (from.v <= to.v ? Infinity : 0) : Math.max(0, Math.floor((to.v - from.v) / step.v + 1e-9) + 1);
    const loop = this.pushLoop({
      kind: 'for', keyword: FOR, line: s.line, endLine: s.endLine, variable: name,
      from: this.fmt(from), to: this.fmt(to), step: this.fmt(step), total, current: null,
      fromValue: from.v, toValue: to.v, stepValue: step.v, currentValue: null,
    });
    this.store(ref, from, s.counter, { lenient: true });
    let current = this.peekRef(ref);
    let ok = up ? current.v <= to.v : current.v >= to.v;
    loop.current = this.fmt(current);
    loop.currentValue = current.v;
    this.rec.cond = `${name} ${sign} ${this.fmt(to)}: ${ok ? 'Α' : 'Ψ'}`;
    const totalText = Number.isFinite(total) ? `συνολικά ${total}` : 'το βήμα είναι 0, άρα ο μετρητής δεν θα αλλάζει';
    this.act(s.line, 'loop',
      `Ο μετρητής ${name} παίρνει την αρχική τιμή ${this.fmt(from)}. Έλεγχος ${this.fmt(current)} ${sign} ${this.fmt(to)}: ${ok ? `${this.T}, ξεκινά η 1η επανάληψη (${totalText}).` : `${this.F}, το σώμα δεν εκτελείται καμία φορά.`}`);
    while (ok) {
      loop.iteration++;
      yield* this.block(s.body);
      yield this.pause(s.line);
      this.currentStmt = s;
      this.begin(s.line);
      const before = this.peekRef(ref);
      const sum = before.v + step.v;
      const next = this.dialect.unifiedNumbers ? number(sum) : numeric(sum, before.t === 'int' && step.t === 'int');
      this.store(ref, next, s.counter, { lenient: true });
      current = this.peekRef(ref);
      ok = up ? current.v <= to.v : current.v >= to.v;
      loop.current = this.fmt(current);
      loop.currentValue = current.v;
      this.rec.cond = `${name} ${sign} ${this.fmt(to)}: ${ok ? 'Α' : 'Ψ'}`;
      this.act(s.line, 'loop',
        `Ο μετρητής αλλάζει κατά το βήμα: ${name} ← ${this.fmt(before)} ${step.v < 0 ? '-' : '+'} ${this.num(Math.abs(step.v))} = ${this.fmt(current)}. Έλεγχος ${this.fmt(current)} ${sign} ${this.fmt(to)}: ${ok ? `${this.T}, ${loop.iteration + 1}η επανάληψη.` : `${this.F}, ο βρόχος τελειώνει μετά από ${loop.iteration} επαναλήψεις.`}`);
    }
    this.removeLoop(loop);
  }

  cmpText(op) {
    const symbols = { '<=': '≤', '>=': '≥', '<>': '≠' };
    return this.dialect.id === 'pseudo' ? (symbols[op] || op) : op;
  }

  /** Τιμή για το ΔΙΑΒΑΣΕ/Διάβασε: υλοποιείται από τις υποκλάσεις (με ή χωρίς δηλωμένο τύπο). */
  // eslint-disable-next-line require-yield
  *requestValue() { throw new Error('requestValue() δεν έχει υλοποιηθεί'); }

  /** Κλήση με ΚΑΛΕΣΕ/Κάλεσε: υλοποιείται από τις υποκλάσεις. */
  // eslint-disable-next-line require-yield
  *callStatement() { throw new Error('callStatement() δεν έχει υλοποιηθεί'); }

  /** Κλήση συνάρτησης χρήστη μέσα σε έκφραση: υλοποιείται όπου υπάρχει. */
  // eslint-disable-next-line require-yield
  *callFunction(node) { throw new GlossaError('P_ALGORITHM_IN_EXPRESSION', where(node), { name: node.name }); }

  // ---------- Μεταβλητές ----------
  /** Εντοπίζει μεταβλητή ή στοιχείο πίνακα. Επιστρέφει { cell, indices, key, display }. */
  *reference(node, frame, memo) {
    const cell = frame.vars.get(node.norm);
    if (node.type === 'Var') return { cell, indices: null, key: null, display: cell.name };
    if (!cell.array) cell.array = new DynamicArray(node.indices.length);
    const indices = [];
    for (let d = 0; d < node.indices.length; d++) {
      const v = yield* this.eval(node.indices[d], frame, memo);
      if (v.t !== 'int') {
        throw new GlossaError('R_INDEX_NOT_INTEGER', where(node.indices[d]), { name: cell.name, got: this.fmt(v, true) });
      }
      if (!cell.array.inRange(d, v.v)) this.indexError(cell, d, v.v, node);
      indices.push(v.v);
    }
    return { cell, indices, key: cell.array.keyOf(indices), display: `${cell.name}[${indices.join(', ')}]` };
  }

  indexError(cell, d, index, node) {
    if (cell.array instanceof DynamicArray) {
      throw new GlossaError('R_INDEX_POSITIVE', where(node), { name: cell.name, index });
    }
    throw new GlossaError('R_INDEX_RANGE', where(node), {
      name: cell.name, index, size: cell.array.dims[d], dim: d + 1,
      inLogical: this.logicalDepth > 0 || hasLogical(this.currentStmt),
    });
  }

  peekRef(ref) {
    return ref.indices ? ref.cell.array.get(ref.indices) : ref.cell.value;
  }

  /**
   * Αποθηκεύει τιμή σε μεταβλητή ή στοιχείο πίνακα.
   * Στη ΓΛΩΣΣΑ η εκχώρηση απαιτεί τον ίδιο τύπο (θεωρία)· το ΔΙΑΒΑΣΕ και ο μετρητής του ΓΙΑ
   * δέχονται ακέραιο σε πραγματική μεταβλητή (lenient).
   */
  store(ref, value, node, { lenient = false } = {}) {
    const cell = ref.cell;
    if (cell.kind === 'const') {
      throw new GlossaError('R_ASSIGN_CONSTANT', where(node), { name: cell.name });
    }
    let v = value;
    if (!cell.dynamic) {
      if (!assignable(cell.type, value.t, { strict: !lenient })) {
        throw new GlossaError('R_TYPE_ASSIGN', where(node), {
          name: ref.display, targetType: typeLabel(cell.type), valueType: typeLabel(value.t), value: this.fmt(value, true),
        });
      }
      v = coerce(cell.type, value);
    }
    if (ref.indices) cell.array.set(ref.indices, v);
    else cell.value = v;
    this.rec.changes.push(change(this.frameOf(cell), cell, ref.key, v, ref.display));
  }

  frameOf(cell) {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].vars.get(cell.norm) === cell) return this.frames[i];
    }
    return this.currentFrame;
  }

  // ---------- Εκφράσεις ----------
  *eval(e, frame, memo) {
    const v = yield* this.evalNode(e, frame, memo);
    memo.set(e, v);
    return v;
  }

  literalNumber(e) {
    if (this.dialect.unifiedNumbers) return number(e.value);
    return e.isInt ? int(e.value) : real(e.value);
  }

  *evalNode(e, frame, memo) {
    switch (e.type) {
      case 'Num': return this.literalNumber(e);
      case 'Str': return str(e.value);
      case 'Bool': return bool(e.value);
      case 'Group': return yield* this.eval(e.expr, frame, memo);
      case 'Var':
      case 'Index': return yield* this.variable(e, frame, memo);
      case 'FnCall': {
        const builtin = this.builtins[e.norm];
        if (!builtin) return yield* this.callFunction(e, frame, memo);
        const arg = yield* this.eval(e.args[0], frame, memo);
        expectType(isNumericType(arg.t), builtin.display, [arg], `Η ${builtin.display} εφαρμόζεται σε αριθμούς.`, e, this.dialect);
        try {
          const result = builtin.call(arg.v, arg.t);
          return this.dialect.unifiedNumbers ? number(result.v) : result;
        } catch (err) {
          if (err instanceof GlossaError) {
            throw new GlossaError(err.code, where(e), { ...err.params, name: builtin.display });
          }
          throw err;
        }
      }
      case 'Unary': {
        if (e.op === 'ΟΧΙ') {
          this.logicalDepth++;
          const v = yield* this.eval(e.operand, frame, memo);
          this.logicalDepth--;
          const NOT = this.w('ΟΧΙ');
          expectType(v.t === 'bool', NOT, [v], `Ο τελεστής ${NOT} εφαρμόζεται μόνο σε λογικές τιμές.`, e, this.dialect);
          return bool(!v.v);
        }
        const v = yield* this.eval(e.operand, frame, memo);
        expectType(isNumericType(v.t), e.op, [v], 'Το πρόσημο εφαρμόζεται μόνο σε αριθμούς.', e, this.dialect);
        return e.op === '-' ? { t: v.t, v: -v.v } : v;
      }
      case 'Binary': {
        const logical = e.op === 'ΚΑΙ' || e.op === 'Η';
        if (logical) this.logicalDepth++;
        const a = yield* this.eval(e.left, frame, memo);
        const b = yield* this.eval(e.right, frame, memo);
        if (logical) this.logicalDepth--;
        return binary(e, a, b, this.dialect);
      }
      default:
        return int(0);
    }
  }

  *variable(e, frame, memo) {
    const ref = yield* this.reference(e, frame, memo);
    const v = this.peekRef(ref);
    if (!v) {
      const s = this.currentStmt;
      const accumulator = s && s.type === 'Assign' && s.target.norm === e.norm && e.type === 'Var';
      throw new GlossaError('R_UNINITIALIZED', where(e), { name: ref.display, isArray: e.type === 'Index', accumulator });
    }
    this.rec.reads.push(cellKey(this.frameOf(ref.cell), ref.cell, ref.key));
    return v;
  }
}

// ---------- Βοηθητικές συναρτήσεις ----------
function hasLogical(stmt) {
  if (!stmt) return false;
  const cond = stmt.cond || (stmt.branches && stmt.branches.map((b) => b.cond));
  const list = Array.isArray(cond) ? cond : cond ? [cond] : [];
  const walk = (n) => n && ((n.type === 'Binary' && (n.op === 'ΚΑΙ' || n.op === 'Η')) || (n.type === 'Group' && walk(n.expr)));
  return list.some(walk);
}

/** Μοναδικό κλειδί κουτιού μνήμης: πλαίσιο, μεταβλητή και (για πίνακες) θέση. */
export function cellKey(frame, cell, key) {
  return key === null || key === undefined ? `${frame.id}:${cell.norm}` : `${frame.id}:${cell.norm}:${key}`;
}

/** Εγγραφή αλλαγής για τον πίνακα τιμών και την επισήμανση στη μνήμη. */
export function change(frame, cell, key, value, display) {
  return {
    key: cellKey(frame, cell, key),
    column: `${frame.id}:${cell.norm}`,
    frameName: frame.name,
    frameKind: frame.kind,
    name: cell.name,
    isArray: key !== null && key !== undefined,
    display,
    value,
  };
}

export function sameValue(a, b) {
  return a && b && a.t === b.t && a.v === b.v;
}

export { where };
