// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Σημασιολογικός έλεγχος πριν την εκτέλεση: δηλώσεις, τύποι, κλήσεις.
// Παράγει τους πίνακες συμβόλων που χρησιμοποιεί ο διερμηνευτής.
import { TYPE_LABEL } from './tokens.js';
import { DIALECTS } from './dialects.js';
import { GlossaError, warning } from './errors.js';
import { closest } from './suggest.js';
import { builtinsFor } from './builtins.js';
import { int, real, str, bool, isNumericType } from './values.js';
import { MAX_FIXED_ARRAY_ELEMENTS } from './arrays.js';

const BUILTINS = builtinsFor('glossa');
const BUILTIN_NAMES = new Set(Object.keys(BUILTINS));
const KEYWORDS = DIALECTS.glossa.keywords;
const ARITH = new Set(['+', '-', '*', '/', '^']);
const COMPARE = new Set(['=', '<>', '<', '>', '<=', '>=']);
const label = (t) => TYPE_LABEL[t] || '?';

/**
 * @returns {{ errors: GlossaError[], warnings: GlossaError[], units: Map, subs: Map }}
 * units: κόμβος (Program/Function/Procedure) → { scope: Map<norm, Symbol> }
 */
export function analyzeGlossa(program) {
  return new Analyzer(program).run();
}

class Analyzer {
  constructor(program) {
    this.program = program;
    this.errors = [];
    this.warnings = [];
    this.units = new Map();
    this.subs = new Map();
  }

  run() {
    for (const sub of this.program.subs) {
      if (this.subs.has(sub.norm)) {
        this.error('M_REDECLARED', sub, { name: sub.name, firstLine: this.subs.get(sub.norm).line });
      } else if (BUILTIN_NAMES.has(sub.norm)) {
        this.error('M_RESERVED_NAME', sub, { name: sub.name, reason: 'είναι όνομα ενσωματωμένης συνάρτησης' });
      } else {
        this.subs.set(sub.norm, sub);
      }
    }
    this.analyzeUnit(this.program);
    for (const sub of this.subs.values()) this.analyzeUnit(sub);
    return { errors: this.errors, warnings: this.warnings, units: this.units, subs: this.subs };
  }

  error(code, node, params) {
    if (this.errors.length > 40) return;
    const where = { line: node.line, col: node.col, length: node.length || (node.name ? node.name.length : 1) };
    if (this.errors.some((e) => e.code === code && e.line === where.line && e.col === where.col)) return;
    this.errors.push(new GlossaError(code, where, params));
  }

  // ---------- Δηλώσεις ----------
  analyzeUnit(unit) {
    const scope = new Map();
    const ctx = {
      unit, scope,
      isFunction: unit.type === 'Function',
      counters: [],
      reported: new Set(),
      resultAssigned: false,
    };
    this.units.set(unit, { scope });

    if (ctx.isFunction) {
      scope.set(unit.norm, symbol({ name: unit.name, norm: unit.norm, kind: 'result', type: unit.returnType, line: unit.line }));
    }

    for (const c of unit.consts) {
      if (!this.checkName(c, scope, ctx)) continue;
      const value = this.evalConst(c.expr, scope);
      if (!value) { this.error('S_BAD_CONSTANT', c, { name: c.name }); continue; }
      scope.set(c.norm, symbol({ name: c.name, norm: c.norm, kind: 'const', type: value.t, value, line: c.line }));
    }

    for (const v of unit.vars) {
      if (!this.checkName(v, scope, ctx)) continue;
      let sizes = null;
      if (v.dims) {
        sizes = v.dims.map((d) => {
          const val = this.evalConst(d, scope);
          if (!val || val.t !== 'int' || val.v < 1) {
            this.error('S_ARRAY_SIZE', { line: v.line, col: v.col, length: v.length }, { got: val ? String(val.v) : '' });
            return 1;
          }
          return val.v;
        });
      }
      const total = sizes ? sizes.reduce((a, b) => a * b, 1) : 1;
      if (!Number.isSafeInteger(total) || total > MAX_FIXED_ARRAY_ELEMENTS) {
        this.error('M_ARRAY_TOO_LARGE', v, { name: v.name, max: MAX_FIXED_ARRAY_ELEMENTS });
        sizes = sizes.map(() => 1);
      }
      scope.set(v.norm, symbol({ name: v.name, norm: v.norm, kind: 'var', type: v.type, dims: sizes, line: v.line, col: v.col }));
    }

    if (unit.params) {
      const seenParams = new Map();
      for (const p of unit.params) {
        const first = seenParams.get(p.norm);
        if (first) {
          this.error('M_REDECLARED', p, { name: p.name, firstLine: first.line });
          continue;
        }
        seenParams.set(p.norm, p);
        const sym = scope.get(p.norm);
        if (!sym || sym.kind !== 'var') {
          this.error('M_PARAM_UNDECLARED', p, { name: p.name, sub: unit.name });
        } else {
          sym.isParam = true;
          sym.written = true;
        }
      }
    }

    this.block(unit.body, ctx);

    if (ctx.isFunction && !ctx.resultAssigned) {
      this.error('M_FUNCTION_NO_RESULT', { line: unit.line, col: unit.col, length: unit.name.length }, { name: unit.name });
    } else if (ctx.isFunction && !assignsOnEveryPath(unit.body, unit.norm)) {
      this.warnings.push(warning('W_FUNCTION_RESULT_PATH', { line: unit.line, col: unit.col, length: unit.name.length }, { name: unit.name }));
    }
    this.usageWarnings(scope);
  }

  checkName(decl, scope, ctx) {
    const existing = scope.get(decl.norm);
    if (existing) {
      const reason = existing.kind === 'result' ? 'είναι το όνομα της συνάρτησης' : null;
      if (reason) this.error('M_RESERVED_NAME', decl, { name: decl.name, reason });
      else this.error('M_REDECLARED', decl, { name: decl.name, firstLine: existing.line });
      return false;
    }
    let reason = null;
    if (decl.norm === this.program.norm) reason = 'είναι το όνομα του προγράμματος';
    else if (BUILTIN_NAMES.has(decl.norm)) reason = 'είναι όνομα ενσωματωμένης συνάρτησης';
    else if (this.subs.has(decl.norm)) reason = 'είναι όνομα υποπρογράμματος';
    // Το σύμβολο καταχωρείται παρ' όλα αυτά, ώστε να μην προκύψουν αλυσιδωτά σφάλματα.
    if (reason) this.error('M_RESERVED_NAME', decl, { name: decl.name, reason });
    return true;
  }

  evalConst(expr, scope) {
    switch (expr.type) {
      case 'Num': return expr.isInt ? int(expr.value) : real(expr.value);
      case 'Str': return str(expr.value);
      case 'Bool': return bool(expr.value);
      case 'Group': return this.evalConst(expr.expr, scope);
      case 'Var': {
        const s = scope.get(expr.norm);
        return s && s.kind === 'const' ? s.value : null;
      }
      case 'Unary': {
        const v = this.evalConst(expr.operand, scope);
        if (!v || !isNumericType(v.t) || expr.op === 'ΟΧΙ') return null;
        return { t: v.t, v: expr.op === '-' ? -v.v : v.v };
      }
      case 'Binary': {
        const a = this.evalConst(expr.left, scope);
        const b = this.evalConst(expr.right, scope);
        if (!a || !b || !isNumericType(a.t) || !isNumericType(b.t)) return null;
        const both = a.t === 'int' && b.t === 'int';
        switch (expr.op) {
          case '+': return both ? int(a.v + b.v) : real(a.v + b.v);
          case '-': return both ? int(a.v - b.v) : real(a.v - b.v);
          case '*': return both ? int(a.v * b.v) : real(a.v * b.v);
          case '/': return b.v === 0 ? null : real(a.v / b.v);
          case 'DIV': return both && b.v !== 0 ? int(Math.trunc(a.v / b.v)) : null;
          case 'MOD': return both && b.v !== 0 ? int(a.v % b.v) : null;
          default: return null;
        }
      }
      default: return null;
    }
  }

  usageWarnings(scope) {
    for (const s of scope.values()) {
      if (s.kind !== 'var') continue;
      if (!s.read && !s.written) {
        this.warnings.push(warning('W_UNUSED', { line: s.line, col: s.col, length: s.name.length }, { name: s.name }));
      } else if (s.read && !s.written && s.firstRead) {
        this.warnings.push(warning('W_NEVER_ASSIGNED', s.firstRead, { name: s.name }));
      }
    }
  }

  // ---------- Εντολές ----------
  block(stmts, ctx) {
    for (const s of stmts) this.statement(s, ctx);
  }

  statement(s, ctx) {
    switch (s.type) {
      case 'Assign': {
        const targetType = this.target(s.target, ctx, 'assign');
        const valueType = this.expr(s.expr, ctx);
        if (targetType && valueType && !compatible(targetType, valueType)) {
          const toInt = targetType === 'int' && valueType === 'real';
          const toReal = targetType === 'real' && valueType === 'int';
          this.error('M_TYPE_ASSIGN', s.target, {
            target: s.target.name, targetType: label(targetType), valueType: label(valueType),
            extra: toInt ? 'Μια ακέραια μεταβλητή δεν μπορεί να κρατήσει πραγματική τιμή. Θυμήσου ότι η διαίρεση με / δίνει πάντα πραγματικό αποτέλεσμα.'
              : toReal ? 'Σύμφωνα με τη θεωρία, σε μια εντολή εκχώρησης η μεταβλητή και η έκφραση πρέπει να είναι του ιδίου τύπου, άρα ούτε ακέραια τιμή εκχωρείται σε πραγματική μεταβλητή.' : undefined,
            fixText: toInt ? 'Χρησιμοποίησε DIV για ακέραιο πηλίκο ή Α_Μ() για το ακέραιο μέρος, ή δήλωσε τη μεταβλητή ως ΠΡΑΓΜΑΤΙΚΗ.'
              : toReal ? 'Γράψε τη σταθερά ως πραγματικό (π.χ. 5.0 αντί για 5), ή δήλωσε τη μεταβλητή ως ΑΚΕΡΑΙΑ αν κρατά μόνο ακέραιους.' : undefined,
          });
        }
        break;
      }
      case 'Read':
        if (ctx.isFunction) this.warnings.push(warning('W_FUNCTION_IO', { line: s.line, col: 1 }, { name: ctx.unit.name, stmt: 'ΔΙΑΒΑΣΕ' }));
        for (const t of s.targets) this.target(t, ctx, 'read');
        break;
      case 'Write':
        if (ctx.isFunction) this.warnings.push(warning('W_FUNCTION_IO', { line: s.line, col: 1 }, { name: ctx.unit.name, stmt: 'ΓΡΑΨΕ' }));
        for (const e of s.items) this.expr(e, ctx);
        break;
      case 'If':
        for (const b of s.branches) {
          this.condition(b.cond, ctx, b === s.branches[0] ? 'ΑΝ' : 'ΑΛΛΙΩΣ_ΑΝ');
          this.block(b.body, ctx);
        }
        if (s.elseBody) this.block(s.elseBody, ctx);
        break;
      case 'Select': {
        const t = this.expr(s.expr, ctx);
        for (const c of s.cases) {
          for (const test of c.tests) {
            const parts = test.kind === 'range' ? [test.lo, test.hi] : [test.expr];
            for (const p of parts) {
              const pt = this.expr(p, ctx);
              if (t && pt && !comparable(t, pt)) {
                this.error('M_OPERAND_TYPE', p, {
                  op: 'ΠΕΡΙΠΤΩΣΗ', got: `${label(t)} και ${label(pt)}`,
                  rule: 'Οι τιμές κάθε ΠΕΡΙΠΤΩΣΗΣ συγκρίνονται με την έκφραση του ΕΠΙΛΕΞΕ, άρα πρέπει να είναι συμβατού τύπου.',
                  detail: `η έκφραση του ΕΠΙΛΕΞΕ είναι ${label(t)} ενώ η περίπτωση είναι ${label(pt)}`,
                });
              }
            }
          }
          this.block(c.body, ctx);
        }
        if (s.defaultBody) this.block(s.defaultBody, ctx);
        break;
      }
      case 'While':
        this.condition(s.cond, ctx, 'ΟΣΟ');
        this.block(s.body, ctx);
        break;
      case 'Repeat':
        this.block(s.body, ctx);
        this.condition(s.cond, ctx, 'ΜΕΧΡΙΣ_ΟΤΟΥ');
        break;
      case 'For':
        this.forLoop(s, ctx);
        break;
      case 'Call':
        this.call(s, ctx, false);
        break;
      default:
        break;
    }
  }

  forLoop(s, ctx) {
    const c = s.counter;
    const sym = ctx.scope.get(c.norm);
    let counterType = null;
    if (c.type === 'Index') {
      this.error('M_FOR_COUNTER_TYPE', c, { name: c.name, reason: 'Ως μετρητής χρησιμοποιείται απλή μεταβλητή, όχι στοιχείο πίνακα.' });
    } else if (!sym) {
      this.undeclared(c, ctx);
    } else if (sym.kind === 'const') {
      this.error('M_ASSIGN_CONSTANT', c, { name: c.name });
    } else if (sym.dims) {
      this.error('M_FOR_COUNTER_TYPE', c, { name: c.name, reason: 'Το όνομα αυτό είναι πίνακας.' });
    } else if (!isNumericType(sym.type)) {
      this.error('M_FOR_COUNTER_TYPE', c, { name: c.name, reason: `Η μεταβλητή είναι τύπου ${label(sym.type)}.` });
    } else if (ctx.counters.some((k) => k.norm === c.norm)) {
      const outer = ctx.counters.find((k) => k.norm === c.norm);
      this.error('M_FOR_COUNTER', c, { name: c.name, loopLine: outer.line });
    } else {
      counterType = sym.type;
      sym.written = true;
      sym.read = true;
    }
    for (const [part, name] of [[s.from, 'ΑΠΟ'], [s.to, 'ΜΕΧΡΙ'], [s.step, 'ΜΕ_ΒΗΜΑ']]) {
      if (!part) continue;
      const t = this.expr(part, ctx);
      if (t && !isNumericType(t)) {
        this.error('M_OPERAND_TYPE', part, {
          op: name, got: label(t),
          rule: 'Οι τιμές ΑΠΟ, ΜΕΧΡΙ και ΜΕ_ΒΗΜΑ του ΓΙΑ πρέπει να είναι αριθμοί.',
          detail: `δόθηκε τιμή τύπου ${label(t)}`,
        });
      } else if (t === 'real' && counterType === 'int' && name !== 'ΜΕΧΡΙ') {
        this.error('M_TYPE_ASSIGN', part, {
          target: c.name, targetType: label('int'), valueType: label('real'),
          extra: `Ο μετρητής ${c.name} είναι ακέραιος, οπότε η τιμή ${name} πρέπει επίσης να είναι ακέραια, αλλιώς ο μετρητής θα έπαιρνε δεκαδικές τιμές.`,
          fixText: 'Δήλωσε τον μετρητή ΠΡΑΓΜΑΤΙΚΗ ή χρησιμοποίησε ακέραιο βήμα.',
        });
      }
    }
    ctx.counters.push({ norm: c.norm, line: s.line });
    this.block(s.body, ctx);
    ctx.counters.pop();
  }

  condition(expr, ctx, stmt) {
    const t = this.expr(expr, ctx);
    if (t && t !== 'bool') this.error('M_CONDITION_TYPE', expr, { stmt, got: label(t) });
  }

  /** Έλεγχος στόχου εκχώρησης / ΔΙΑΒΑΣΕ. Επιστρέφει τον τύπο. */
  target(node, ctx, mode) {
    const sym = ctx.scope.get(node.norm);
    if (!sym) { this.undeclared(node, ctx); return null; }
    if (node.type === 'Index') node.indices.forEach((i) => this.index(i, ctx));
    if (sym.kind === 'const') { this.error('M_ASSIGN_CONSTANT', node, { name: node.name }); return null; }
    if (sym.kind === 'result') {
      if (mode === 'read') {
        this.error('M_READ_TARGET', node, {
          name: node.name, reason: 'Το όνομα της συνάρτησης δεν διαβάζεται με ΔΙΑΒΑΣΕ· παίρνει τιμή μόνο με εκχώρηση.',
          fixText: `Διάβασε σε τοπική μεταβλητή και γράψε ${node.name} <- μεταβλητή.`,
        });
      }
      ctx.resultAssigned = true;
      return sym.type;
    }
    const counter = ctx.counters.find((c) => c.norm === node.norm);
    if (counter && node.type === 'Var') {
      this.warnings.push(warning('W_FOR_COUNTER_CHANGED', { line: node.line, col: node.col, length: node.name.length }, { name: node.name, loopLine: counter.line }));
    }
    if (!this.checkShape(node, sym)) return null;
    sym.written = true;
    return sym.type;
  }

  /** Έλεγχος ότι πίνακας/απλή μεταβλητή χρησιμοποιείται σωστά. */
  checkShape(node, sym, allowWholeArray = false) {
    if (node.type === 'Index') {
      if (!sym.dims) { this.error('M_NOT_ARRAY', node, { name: node.name }); return false; }
      if (sym.dims.length !== node.indices.length) {
        this.error('M_WRONG_DIMENSIONS', node, { name: node.name, expected: sym.dims.length, got: node.indices.length });
        return false;
      }
      return true;
    }
    if (sym.dims && !allowWholeArray) {
      this.error('M_ARRAY_NO_INDEX', node, { name: node.name, dims: sym.dims.length });
      return false;
    }
    return true;
  }

  index(expr, ctx) {
    const t = this.expr(expr, ctx);
    if (t && t !== 'int') {
      this.error('M_OPERAND_TYPE', expr, {
        op: '[ ]', got: label(t),
        rule: 'Ο δείκτης ενός πίνακα πρέπει να είναι ακέραιος.',
        detail: `ο δείκτης είναι τύπου ${label(t)}`,
        fixText: 'Χρησιμοποίησε ακέραια μεταβλητή, DIV ή Α_Μ() για τον δείκτη.',
      });
    }
  }

  undeclared(node, ctx) {
    if (ctx.reported.has(node.norm)) return;
    ctx.reported.add(node.norm);
    const names = [...ctx.scope.values()].filter((s) => s.kind !== 'result').map((s) => s.name);
    let where;
    if (ctx.unit.type !== 'Program') {
      const inMain = this.units.get(this.program)?.scope.has(node.norm);
      if (inMain) where = `κάθε υποπρόγραμμα έχει τις δικές του μεταβλητές και δεν «βλέπει» τις μεταβλητές του κύριου προγράμματος· οι τιμές περνούν μόνο μέσω παραμέτρων`;
    }
    const kw = closest(node.name, KEYWORDS);
    this.error('M_UNDECLARED', node, { name: node.name, suggestion: closest(node.name, names) || kw, where });
  }

  // ---------- Εκφράσεις: επιστρέφουν τύπο ή null ----------
  expr(e, ctx, allowWholeArray = false) {
    switch (e.type) {
      case 'Num': return e.isInt ? 'int' : 'real';
      case 'Str': return 'str';
      case 'Bool': return 'bool';
      case 'Group': return this.expr(e.expr, ctx);
      case 'Var':
      case 'Index': return this.reference(e, ctx, allowWholeArray);
      case 'FnCall': return this.call(e, ctx, true);
      case 'Unary': {
        const t = this.expr(e.operand, ctx);
        if (!t) return e.op === 'ΟΧΙ' ? 'bool' : null;
        if (e.op === 'ΟΧΙ') {
          if (t !== 'bool') this.operandError(e, 'ΟΧΙ', [t], 'Ο τελεστής ΟΧΙ εφαρμόζεται μόνο σε λογικές τιμές (ΑΛΗΘΗΣ/ΨΕΥΔΗΣ).');
          return 'bool';
        }
        if (!isNumericType(t)) { this.operandError(e, e.op, [t], 'Το πρόσημο εφαρμόζεται μόνο σε αριθμούς.'); return null; }
        return t;
      }
      case 'Binary': return this.binary(e, ctx);
      default: return null;
    }
  }

  reference(e, ctx, allowWholeArray) {
    const sym = ctx.scope.get(e.norm);
    if (!sym) {
      if (this.subs.has(e.norm) || BUILTIN_NAMES.has(e.norm)) {
        const sub = this.subs.get(e.norm);
        this.error('M_ARG_COUNT', e, { name: e.name, expected: sub ? sub.params.length : 1, got: 0, params: sub ? sub.params.map((p) => p.name).join(', ') : 'x' });
      } else {
        this.undeclared(e, ctx);
      }
      return null;
    }
    if (e.type === 'Index') e.indices.forEach((i) => this.index(i, ctx));
    if (sym.kind === 'result') { this.error('M_RESULT_READ', e, { name: e.name }); return sym.type; }
    if (!this.checkShape(e, sym, allowWholeArray)) return null;
    if (!sym.read) sym.firstRead = { line: e.line, col: e.col, length: e.name.length };
    sym.read = true;
    return sym.type;
  }

  binary(e, ctx) {
    const a = this.expr(e.left, ctx);
    const b = this.expr(e.right, ctx);
    const op = e.op;
    if (ARITH.has(op)) {
      if (a && b && (!isNumericType(a) || !isNumericType(b))) {
        const strPlus = op === '+' && (a === 'str' || b === 'str');
        this.operandError(e, op, [a, b], 'Οι αριθμητικοί τελεστές (+ - * / ^) εφαρμόζονται μόνο σε αριθμούς.', strPlus ? {
          fixText: 'Η ΓΛΩΣΣΑ δεν ενώνει κείμενα με +. Για να εμφανίσεις μαζί κείμενο και τιμές, χώρισέ τα με κόμμα στο ΓΡΑΨΕ.',
          exampleText: "ΓΡΑΨΕ 'Όνομα:', όνομα",
        } : {});
        return null;
      }
      if (!a || !b) return op === '/' ? 'real' : null;
      if (op === '/') return 'real';
      if (op === '^' && a === 'int' && b === 'int') return powerType(e.right);
      return a === 'int' && b === 'int' ? 'int' : 'real';
    }
    if (op === 'DIV' || op === 'MOD') {
      if (a && b && (a !== 'int' || b !== 'int')) {
        this.operandError(e, op, [a, b], `Οι τελεστές DIV και MOD εφαρμόζονται μόνο σε ακέραιους αριθμούς (DIV: ακέραιο πηλίκο, MOD: υπόλοιπο).`, {
          fixText: 'Αν η τιμή είναι πραγματική, πάρε πρώτα το ακέραιο μέρος της με Α_Μ().',
        });
      }
      return 'int';
    }
    if (COMPARE.has(op)) {
      if (a && b && !comparable(a, b)) {
        this.operandError(e, op, [a, b], 'Μια σύγκριση γίνεται ανάμεσα σε τιμές συμβατού τύπου: αριθμό με αριθμό, κείμενο με κείμενο, λογική με λογική.');
      } else if (a === 'bool' && b === 'bool' && op !== '=' && op !== '<>') {
        this.operandError(e, op, [a, b], 'Οι λογικές τιμές συγκρίνονται μόνο με = και <>.');
      }
      return 'bool';
    }
    if (op === 'ΚΑΙ' || op === 'Η') {
      if ((a && a !== 'bool') || (b && b !== 'bool')) {
        this.operandError(e, op, [a, b], `Ο λογικός τελεστής ${op} συνδέει δύο συνθήκες (λογικές τιμές).`, {
          fixText: 'Κάθε μέλος πρέπει να είναι πλήρης σύγκριση. Π.χ. αντί για «x > 0 ΚΑΙ < 10» γράψε «x > 0 ΚΑΙ x < 10».',
          exampleText: 'ΑΝ x > 0 ΚΑΙ x < 10 ΤΟΤΕ',
        });
      }
      return 'bool';
    }
    return null;
  }

  operandError(node, op, types, rule, extra = {}) {
    const known = types.filter(Boolean).map(label);
    this.error('M_OPERAND_TYPE', node, {
      op, got: known.join(' και ') || '?', rule,
      detail: `οι τιμές είναι τύπου ${known.join(' και ')}`,
      ...extra,
    });
  }

  /** Κλήση συνάρτησης (σε έκφραση) ή διαδικασίας (με ΚΑΛΕΣΕ). */
  call(node, ctx, inExpression) {
    const builtin = BUILTINS[node.norm];
    if (builtin) {
      if (!inExpression) { this.error('M_CALL_KIND', node, { name: node.name, isFunction: true }); return null; }
      const t = node.args.length === 1 ? this.expr(node.args[0], ctx) : null;
      if (node.args.length !== 1 || (t && !isNumericType(t))) {
        node.args.slice(1).forEach((a) => this.expr(a, ctx));
        this.error('M_BUILTIN_ARGS', node, { name: builtin.display, meaning: builtin.meaning });
        return builtin.returns('real');
      }
      return builtin.returns(t || 'real');
    }
    const sub = this.subs.get(node.norm);
    if (!sub) {
      node.args.forEach((a) => this.expr(a, ctx, true));
      const local = ctx.scope.get(node.norm);
      if (local && inExpression) {
        this.error('S_EXPECTED', node, {
          expected: '«[»', found: '«(»',
          context: `για στοιχείο του πίνακα ${node.name}`,
          fixText: 'Στη ΓΛΩΣΣΑ οι δείκτες πινάκων γράφονται σε αγκύλες [ ], όχι σε παρενθέσεις.',
          exampleText: `${node.name}[i]`,
        });
        return local.type;
      }
      this.error('M_UNKNOWN_SUBPROGRAM', node, { name: node.name, suggestion: closest(node.name, [...this.subs.values()].map((s) => s.name)) });
      return null;
    }
    const isFunction = sub.type === 'Function';
    if (inExpression !== isFunction) this.error('M_CALL_KIND', node, { name: node.name, isFunction });
    if (sub.params.length !== node.args.length) {
      node.args.forEach((a) => this.expr(a, ctx, true));
      this.error('M_ARG_COUNT', node, {
        name: sub.name, expected: sub.params.length, got: node.args.length, params: sub.params.map((p) => p.name).join(', '),
      });
      return isFunction ? sub.returnType : null;
    }
    const subScope = this.declaredScope(sub);
    node.args.forEach((arg, i) => {
      const param = subScope.get(sub.params[i].norm);
      const argSym = (arg.type === 'Var' || arg.type === 'Index') ? ctx.scope.get(arg.norm) : null;
      const argIsArray = Boolean(argSym && argSym.dims && arg.type === 'Var');
      const t = this.expr(arg, ctx, true);
      if (!isFunction && argSym && argSym.kind === 'const') {
        this.error('M_ASSIGN_CONSTANT', arg, { name: arg.name });
      }
      if (!param) return;
      if (Boolean(param.dims) !== argIsArray) {
        this.error('M_ARG_KIND', arg, { name: sub.name, param: param.name, expectArray: Boolean(param.dims) });
        return;
      }
      if (t && !compatible(param.type, t)) {
        this.error('M_ARG_TYPE', arg, { name: sub.name, param: param.name, expected: label(param.type), got: label(t) });
      }
      // Οι παράμετροι διαδικασίας επιστρέφουν τιμή στον καλούντα.
      if (!isFunction && argSym && argSym.kind === 'var') argSym.written = true;
    });
    return isFunction ? sub.returnType : null;
  }

  /** Τύποι των δηλώσεων ενός υποπρογράμματος (χωρίς πλήρη ανάλυση). */
  declaredScope(sub) {
    const map = new Map();
    for (const v of sub.vars) map.set(v.norm, { name: v.name, type: v.type, dims: v.dims });
    return map;
  }
}

/** Παίρνει η συνάρτηση τιμή σε κάθε διαδρομή; Τα ΟΣΟ και ΓΙΑ μπορεί να μην εκτελεστούν. */
function assignsOnEveryPath(stmts, functionNorm) {
  for (const stmt of stmts) {
    if (stmt.type === 'Assign' && stmt.target.norm === functionNorm) return true;
    if (stmt.type === 'If' && stmt.elseBody
      && stmt.branches.every((b) => assignsOnEveryPath(b.body, functionNorm))
      && assignsOnEveryPath(stmt.elseBody, functionNorm)) return true;
    if (stmt.type === 'Select' && stmt.defaultBody
      && stmt.cases.every((c) => assignsOnEveryPath(c.body, functionNorm))
      && assignsOnEveryPath(stmt.defaultBody, functionNorm)) return true;
    if (stmt.type === 'Repeat' && assignsOnEveryPath(stmt.body, functionNorm)) return true;
  }
  return false;
}

function symbol(fields) {
  return { dims: null, isParam: false, read: false, written: false, ...fields };
}

/** Η θεωρία (εκχώρηση, παράμετροι): η τιμή πρέπει να είναι του ιδίου τύπου με τη μεταβλητή. */
function compatible(to, from) {
  return to === from;
}

/**
 * Ακέραιος εις ακέραιο: ακέραιο αποτέλεσμα για μη αρνητικό εκθέτη, πραγματικό για αρνητικό.
 * Αν ο εκθέτης δεν είναι σταθερά, ο τύπος κρίνεται κατά την εκτέλεση.
 */
function powerType(exponent) {
  let e = exponent;
  while (e.type === 'Group') e = e.expr;
  if (e.type === 'Num') return 'int';
  if (e.type === 'Unary' && e.op === '-' && e.operand.type === 'Num') return e.operand.value === 0 ? 'int' : 'real';
  return null;
}

function comparable(a, b) {
  return a === b || (isNumericType(a) && isNumericType(b));
}
