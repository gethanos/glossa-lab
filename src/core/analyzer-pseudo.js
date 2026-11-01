// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
//
// Έλεγχος ψευδογλώσσας πριν την εκτέλεση. Η ψευδογλώσσα δεν έχει δηλώσεις, οπότε:
//   - οι μεταβλητές προκύπτουν από τη χρήση τους (το είδος της τιμής ορίζεται κατά την εκτέλεση),
//   - ένα όνομα είναι πίνακας αν χρησιμοποιείται με αγκύλες, με σταθερό αριθμό δεικτών,
//   - τα ορθογραφικά λάθη στα ονόματα εντοπίζονται με προειδοποιήσεις
//     (μεταβλητή που διαβάζεται χωρίς να πάρει τιμή ή παίρνει τιμή χωρίς να χρησιμοποιηθεί).
// Επιστρέφει την ίδια μορφή με τον έλεγχο της ΓΛΩΣΣΑΣ, ώστε ο διερμηνευτής να είναι κοινός.
import { GlossaError, warning } from './errors.js';
import { closest } from './suggest.js';
import { builtinsFor } from './builtins.js';
import { COMPARISON } from './parser.js';

const BUILTINS = builtinsFor('pseudo');

export function analyzePseudo(file) {
  return new PseudoAnalyzer(file).run();
}

class PseudoAnalyzer {
  constructor(file) {
    this.file = file;
    this.errors = [];
    this.warnings = [];
    this.reportedWarnings = new Set();
    this.units = new Map();
    this.subs = new Map();
  }

  run() {
    for (const alg of this.file.algorithms) {
      if (this.subs.has(alg.norm)) {
        this.error('M_REDECLARED', alg, { name: alg.name, firstLine: this.subs.get(alg.norm).line });
      } else {
        this.subs.set(alg.norm, alg);
      }
    }
    for (const alg of this.file.algorithms) this.analyzeAlgorithm(alg);
    return { errors: this.errors, warnings: this.warnings, units: this.units, subs: this.subs, main: this.file.main };
  }

  error(code, node, params) {
    if (this.errors.length > 40) return;
    const where = { line: node.line, col: node.col || 1, length: node.length || (node.name ? node.name.length : 1) };
    if (this.errors.some((e) => e.code === code && e.line === where.line && e.col === where.col)) return;
    this.errors.push(new GlossaError(code, where, params));
  }

  // ---------- Αλγόριθμος ----------
  analyzeAlgorithm(alg) {
    const scope = new Map();
    const ctx = { alg, scope, counters: [], wholeArrayRefs: [], stringValues: new Map() };
    this.units.set(alg, { scope });

    for (const p of alg.inputs) Object.assign(this.symbol(ctx, p), { isInput: true, written: true });
    for (const p of alg.outputs) Object.assign(this.symbol(ctx, p), { isOutput: true });

    this.block(alg.body, ctx);

    // Ολόκληρος πίνακας χωρίς αγκύλες επιτρέπεται μόνο ως όρισμα κλήσης ή στα Δεδομένα/Αποτελέσματα.
    for (const ref of ctx.wholeArrayRefs) {
      const sym = scope.get(ref.norm);
      if (sym && sym.dims) this.error('M_ARRAY_NO_INDEX', ref, { name: ref.name, dims: sym.dims });
    }
    this.usageWarnings(ctx);
  }

  symbol(ctx, node) {
    let sym = ctx.scope.get(node.norm);
    if (!sym) {
      sym = {
        name: node.name, norm: node.norm, kind: 'var', type: null, dynamic: true, dims: null,
        line: node.line, col: node.col, isInput: false, isOutput: false,
        read: false, written: false, firstRead: null, firstWrite: null, dimsLine: null,
      };
      ctx.scope.set(node.norm, sym);
    }
    return sym;
  }

  /**
   * Καταγράφει το «σχήμα» μιας αναφοράς: απλή μεταβλητή ή πίνακας με n δείκτες.
   * Η χρήση ονόματος πίνακα χωρίς αγκύλες ελέγχεται στο τέλος, όταν είναι γνωστές όλες οι χρήσεις.
   */
  shape(ctx, node, allowWholeArray) {
    const sym = this.symbol(ctx, node);
    if (node.type === 'Index') {
      node.indices.forEach((i) => this.expr(i, ctx));
      const n = node.indices.length;
      if (sym.dims && sym.dims !== n) {
        this.error('P_ARRAY_USAGE', node, { name: node.name, reason: 'dims', first: sym.dims, firstLine: sym.dimsLine, got: n });
      } else if (!sym.dims) {
        sym.dims = n;
        sym.dimsLine = node.line;
      }
    } else if (!allowWholeArray) {
      ctx.wholeArrayRefs.push(node);
    }
    return sym;
  }

  write(ctx, node, allowWholeArray = false) {
    const sym = this.shape(ctx, node, allowWholeArray);
    if (!sym.firstWrite) sym.firstWrite = { line: node.line, col: node.col, length: node.name.length };
    sym.written = true;
    const counter = ctx.counters.find((c) => c.norm === node.norm);
    if (counter && node.type === 'Var') {
      this.warnings.push(warning('W_FOR_COUNTER_CHANGED', { line: node.line, col: node.col, length: node.name.length }, { name: node.name, loopLine: counter.line }));
    }
    return sym;
  }

  read(ctx, node, allowWholeArray = false) {
    const sym = this.shape(ctx, node, allowWholeArray);
    if (!sym.firstRead) sym.firstRead = { line: node.line, col: node.col, length: node.name.length };
    sym.read = true;
    return sym;
  }

  usageWarnings(ctx) {
    const names = [...ctx.scope.values()].map((s) => s.name);
    const similar = (sym) => closest(sym.name, names.filter((n) => n !== sym.name));
    for (const sym of ctx.scope.values()) {
      if (!sym.written && (sym.read || sym.isOutput)) {
        const at = sym.firstRead || { line: sym.line, col: sym.col, length: sym.name.length };
        this.warnings.push(warning('W_NEVER_ASSIGNED', at, { name: sym.name, suggestion: similar(sym), isOutput: !sym.read }));
      } else if (sym.written && !sym.read && !sym.isOutput && !sym.isInput) {
        this.warnings.push(warning('W_ASSIGNED_UNUSED', sym.firstWrite, { name: sym.name, suggestion: similar(sym) }));
      }
    }
  }

  // ---------- Εντολές ----------
  block(stmts, ctx) {
    for (const s of stmts) this.statement(s, ctx);
  }

  statement(s, ctx) {
    switch (s.type) {
      case 'Assign':
        this.expr(s.expr, ctx);
        this.write(ctx, s.target);
        if (s.target.type === 'Var') {
          const value = staticString(s.expr, ctx);
          if (value === null) ctx.stringValues.delete(s.target.norm);
          else ctx.stringValues.set(s.target.norm, value);
        }
        break;
      case 'Read':
        s.targets.forEach((t) => {
          this.write(ctx, t);
          if (t.type === 'Var') ctx.stringValues.delete(t.norm);
        });
        break;
      case 'Write':
        s.items.forEach((e) => this.expr(e, ctx));
        break;
      case 'If':
        this.analyzeIf(s, ctx);
        break;
      case 'Select':
        this.expr(s.expr, ctx);
        this.analyzeSelect(s, ctx);
        this.warnOnce('P_OUT_OF_CURRICULUM', { line: s.line, col: 1, length: 8 }, {});
        break;
      case 'While':
        this.condition(s.cond, ctx);
        this.analyzeLoop(s.body, ctx);
        break;
      case 'Repeat':
        this.analyzeLoop(s.body, ctx);
        this.condition(s.cond, ctx);
        break;
      case 'For':
        [s.from, s.to, s.step].forEach((e) => e && this.expr(e, ctx));
        if (s.counter.type === 'Index') {
          this.error('M_FOR_COUNTER_TYPE', s.counter, { name: s.counter.name, reason: 'Ως μετρητής χρησιμοποιείται απλή μεταβλητή, όχι στοιχείο πίνακα.' });
        }
        this.write(ctx, s.counter);
        this.read(ctx, s.counter);
        if (s.counter.type === 'Var') ctx.stringValues.delete(s.counter.norm);
        ctx.counters.push({ norm: s.counter.norm, line: s.line });
        this.analyzeLoop(s.body, ctx);
        ctx.counters.pop();
        break;
      case 'Call':
        this.call(s, ctx);
        break;
      default:
        break;
    }
  }

  analyzeIf(s, ctx) {
    const before = ctx.stringValues;
    const paths = [];
    for (const branch of s.branches) {
      ctx.stringValues = new Map(before);
      this.condition(branch.cond, ctx);
      this.block(branch.body, ctx);
      paths.push(ctx.stringValues);
    }
    if (s.elseBody) {
      ctx.stringValues = new Map(before);
      this.block(s.elseBody, ctx);
      paths.push(ctx.stringValues);
    } else {
      paths.push(before);
    }
    ctx.stringValues = commonStringValues(paths);
  }

  analyzeSelect(s, ctx) {
    const before = ctx.stringValues;
    const paths = [];
    for (const c of s.cases) {
      ctx.stringValues = new Map(before);
      c.tests.forEach((t) => (t.kind === 'range' ? [t.lo, t.hi] : [t.expr]).forEach((e) => this.expr(e, ctx)));
      this.block(c.body, ctx);
      paths.push(ctx.stringValues);
    }
    if (s.defaultBody) {
      ctx.stringValues = new Map(before);
      this.block(s.defaultBody, ctx);
      paths.push(ctx.stringValues);
    } else {
      paths.push(before);
    }
    ctx.stringValues = commonStringValues(paths);
  }

  analyzeLoop(body, ctx) {
    const before = ctx.stringValues;
    ctx.stringValues = new Map(before);
    this.block(body, ctx);
    ctx.stringValues = commonStringValues([before, ctx.stringValues]);
  }

  /** Η θεωρία της ψευδογλώσσας: μια συνθήκη περιέχει τουλάχιστον έναν τελεστή σύγκρισης. */
  condition(expr, ctx) {
    this.expr(expr, ctx);
    if (!hasComparison(expr)) {
      const name = expr.type === 'Var' ? expr.name : (expr.type === 'Unary' && expr.operand.type === 'Var' ? expr.operand.name : null);
      const sample = name ? `${name} = ${expr.type === 'Unary' ? 'Ψευδής' : 'Αληθής'}` : undefined;
      this.error('P_CONDITION_NO_RELATION', expr, { sample });
    }
  }

  /** Κάλεσε Όνομα(ορίσματα): πρώτα τα Δεδομένα και μετά τα Αποτελέσματα του αλγορίθμου. */
  call(s, ctx) {
    const target = this.subs.get(s.norm);
    if (!target) {
      s.args.forEach((a) => this.expr(a, ctx, true));
      this.error('P_UNKNOWN_ALGORITHM', s, { name: s.name, suggestion: closest(s.name, [...this.subs.values()].map((a) => a.name)) });
      return;
    }
    const expected = target.inputs.length + target.outputs.length;
    if (s.args.length !== expected) {
      s.args.forEach((a) => this.expr(a, ctx, true));
      const names = [...target.inputs, ...target.outputs].map((p) => p.name).join(', ');
      this.error('P_CALL_ARGS', s, {
        name: target.name, expected, got: s.args.length,
        inputs: target.inputs.map((p) => p.name).join(', '), outputs: target.outputs.map((p) => p.name).join(', '),
        sample: `${target.name}(${names})`,
      });
      return;
    }
    s.args.forEach((arg, i) => {
      if (i < target.inputs.length) {
        this.expr(arg, ctx, true);
        return;
      }
      const output = target.outputs[i - target.inputs.length];
      if (arg.type !== 'Var' && arg.type !== 'Index') {
        this.expr(arg, ctx, true);
        this.error('P_OUTPUT_ARG', arg, { name: target.name, output: output.name });
        return;
      }
      this.write(ctx, arg, true);
      if (arg.type === 'Var') ctx.stringValues.delete(arg.norm);
    });
  }

  // ---------- Εκφράσεις ----------
  expr(e, ctx, allowWholeArray = false) {
    switch (e.type) {
      case 'Var':
      case 'Index':
        this.read(ctx, e, allowWholeArray);
        break;
      case 'Group':
        this.expr(e.expr, ctx);
        break;
      case 'Unary':
        this.expr(e.operand, ctx);
        break;
      case 'Binary':
        if (COMPARISON.has(e.op)) this.checkStringAlphabet(e, ctx);
        this.expr(e.left, ctx);
        this.expr(e.right, ctx);
        break;
      case 'FnCall':
        this.functionCall(e, ctx);
        break;
      default:
        break;
    }
  }

  checkStringAlphabet(e, ctx) {
    const values = [staticString(e.left, ctx), staticString(e.right, ctx)].filter((v) => v !== null);
    if (values.some((value) => [...value].some((ch) => !isUpperGreekLetter(ch)))) {
      this.warnOnce('W_PSEUDO_STRING_ALPHABET', e, {});
    }
  }

  warnOnce(code, where, params) {
    const key = `${code}:${where.line}:${where.col || 1}`;
    if (this.reportedWarnings.has(key)) return;
    this.reportedWarnings.add(key);
    this.warnings.push(warning(code, where, params));
  }

  functionCall(e, ctx) {
    e.args.forEach((a) => this.expr(a, ctx));
    const builtin = BUILTINS[e.norm];
    if (builtin) {
      if (e.args.length !== 1) this.error('M_BUILTIN_ARGS', e, { name: builtin.display, meaning: builtin.meaning });
      return;
    }
    if (this.subs.has(e.norm)) {
      this.error('P_ALGORITHM_IN_EXPRESSION', e, { name: e.name });
      return;
    }
    this.error('P_UNKNOWN_FUNCTION', e, {
      name: e.name,
      available: Object.values(BUILTINS).map((b) => b.display).join(', '),
      suggestion: closest(e.name, Object.keys(BUILTINS)),
      isVariable: ctx.scope.has(e.norm),
    });
  }
}

function staticString(expr, ctx) {
  if (expr.type === 'Str') return expr.value;
  if (expr.type === 'Group') return staticString(expr.expr, ctx);
  if (expr.type === 'Var') return ctx.stringValues.get(expr.norm) ?? null;
  return null;
}

function isUpperGreekLetter(ch) {
  return /^[\u0391-\u03A1\u03A3-\u03A9]$/u.test(ch);
}

function commonStringValues(paths) {
  if (!paths.length) return new Map();
  const common = new Map();
  for (const [name, value] of paths[0]) {
    if (paths.every((path) => path.get(name) === value)) common.set(name, value);
  }
  return common;
}

function hasComparison(e) {
  switch (e.type) {
    case 'Binary': return COMPARISON.has(e.op) || hasComparison(e.left) || hasComparison(e.right);
    case 'Unary': return hasComparison(e.operand);
    case 'Group': return hasComparison(e.expr);
    default: return false;
  }
}
