// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Οι πράξεις κατά την εκτέλεση. Οι διαφορές των γλωσσών έρχονται από τον ορισμό της γλώσσας:
//   unifiedNumbers  (ψευδογλώσσα) ένας αριθμητικός τύπος· π.χ. 6 / 3 είναι ο αριθμός 2
//   divModPositive  (ψευδογλώσσα) οι τελεσταίοι των div και mod πρέπει να είναι θετικοί ακέραιοι
import { GlossaError } from './errors.js';
import {
  int, real, bool, numeric, number, format, typeLabel, isNumericType,
} from './values.js';
import { render } from './explain.js';

export function where(node) {
  return { line: node.line, col: node.col || 1, length: node.length || (node.name ? node.name.length : 1) };
}

export function expectType(ok, op, values, rule, node, dialect) {
  if (ok) return;
  throw new GlossaError('R_OPERAND_TYPE', where(node), {
    op, got: values.map((v) => typeLabel(v.t, dialect.id)).join(' και '), rule,
    values: values.map((v) => format(v, { quote: true, dialect: dialect.id })).join(', '),
  });
}

const GREEK_LETTER = /[\u0370-\u03ff\u1f00-\u1fff]/;

/**
 * Κλειδί σύγκρισης ελληνικών κειμένων (ΓΛΩΣΣΑ): χωρίς πεζά/κεφαλαία, τόνους και διαλυτικά,
 * με το τελικό ς ίδιο με το σ. Οι υπόλοιποι χαρακτήρες μένουν αμετάβλητοι. Οι τιμές των
 * μεταβλητών δεν αλλάζουν· το κλειδί χρησιμοποιείται μόνο στη σύγκριση.
 */
export function greekKey(text) {
  let out = '';
  for (const ch of text) {
    if (!GREEK_LETTER.test(ch)) { out += ch; continue; }
    out += ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
  }
  return out;
}

export function compare(op, a, b, node, dialect) {
  const numericPair = isNumericType(a.t) && isNumericType(b.t);
  expectType(numericPair || a.t === b.t, op, [a, b], 'Μια σύγκριση γίνεται ανάμεσα σε τιμές του ίδιου είδους.', node, dialect);
  let x = a.v;
  let y = b.v;
  if (dialect.id === 'glossa' && a.t === 'str' && b.t === 'str') {
    x = greekKey(x);
    y = greekKey(y);
  }
  switch (op) {
    case '=': return bool(x === y);
    case '<>': return bool(x !== y);
    case '<': return bool(x < y);
    case '>': return bool(x > y);
    case '<=': return bool(x <= y);
    case '>=': return bool(x >= y);
    default: return bool(false);
  }
}

/**
 * Υπολογίζει μια δυαδική πράξη.
 * @param {object} e κόμβος Binary
 * @param {object} a αριστερή τιμή
 * @param {object} b δεξιά τιμή
 * @param {object} dialect ορισμός γλώσσας
 */
export function binary(e, a, b, dialect) {
  const op = e.op;
  const shown = dialect.display(op);
  const bothInt = a.t === 'int' && b.t === 'int';
  const num = (v) => (dialect.unifiedNumbers ? number(v) : numeric(v, bothInt));
  const arithmetic = isNumericType(a.t) && isNumericType(b.t);
  const arithRule = 'Οι αριθμητικοί τελεστές εφαρμόζονται μόνο σε αριθμούς.';
  switch (op) {
    case '+': expectType(arithmetic, op, [a, b], arithRule, e, dialect); return num(a.v + b.v);
    case '-': expectType(arithmetic, op, [a, b], arithRule, e, dialect); return num(a.v - b.v);
    case '*': expectType(arithmetic, op, [a, b], arithRule, e, dialect); return num(a.v * b.v);
    case '/':
      expectType(arithmetic, op, [a, b], arithRule, e, dialect);
      if (b.v === 0) throw new GlossaError('R_DIVISION_BY_ZERO', where(e), { op: '/', expr: render(e, null, undefined, dialect.id) });
      return dialect.unifiedNumbers ? number(a.v / b.v) : real(a.v / b.v);
    case 'DIV':
    case 'MOD': {
      expectType(bothInt, shown, [a, b], `Οι ${dialect.display('DIV')} και ${dialect.display('MOD')} εφαρμόζονται μόνο σε ακέραιους.`, e, dialect);
      if (dialect.divModPositive && (a.v <= 0 || b.v <= 0)) {
        throw new GlossaError('R_DIVMOD_POSITIVE', where(e), {
          op: shown, expr: render(e, null, undefined, dialect.id), values: `${format(a, { dialect: dialect.id })} και ${format(b, { dialect: dialect.id })}`,
        });
      }
      if (b.v === 0) throw new GlossaError('R_DIVISION_BY_ZERO', where(e), { op: shown, expr: render(e, null, undefined, dialect.id) });
      return int(op === 'DIV' ? Math.trunc(a.v / b.v) : a.v % b.v);
    }
    case '^': {
      expectType(arithmetic, op, [a, b], arithRule, e, dialect);
      if ((a.v === 0 && b.v < 0) || (a.v < 0 && !Number.isInteger(b.v))) {
        throw new GlossaError('R_POWER', where(e), { expr: `${format(a, { dialect: dialect.id })} ^ ${format(b, { dialect: dialect.id })}` });
      }
      return dialect.unifiedNumbers ? number(a.v ** b.v) : numeric(a.v ** b.v, bothInt && b.v >= 0);
    }
    case 'ΚΑΙ':
    case 'Η':
      expectType(a.t === 'bool' && b.t === 'bool', shown, [a, b], `Ο τελεστής ${shown} συνδέει λογικές τιμές.`, e, dialect);
      return bool(op === 'ΚΑΙ' ? a.v && b.v : a.v || b.v);
    default:
      return compare(op, a, b, e, dialect);
  }
}
