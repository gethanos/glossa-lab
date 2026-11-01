// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Απόδοση εκφράσεων ως κείμενο και «αλυσίδα» υπολογισμού για επεξήγηση:
//   Σ + Α[i]  →  10 + 4  →  14
// Οι εκφράσεις γράφονται όπως στη γλώσσα του χρήστη (π.χ. ΚΑΙ/και, <=/≤).
import { format } from './values.js';
import { getDialect } from './dialects.js';

const LOGICAL = new Set(['ΚΑΙ', 'Η']);
const PSEUDO_SYMBOLS = { '<=': '≤', '>=': '≥', '<>': '≠' };

function opText(op, dialect) {
  if (dialect.id === 'pseudo' && PSEUDO_SYMBOLS[op]) return PSEUDO_SYMBOLS[op];
  return dialect.keywords.has(op) ? dialect.display(op) : op;
}

/**
 * @param {object} e κόμβος έκφρασης
 * @param {Map|null} memo κόμβος → τιμή (από την εκτέλεση)
 * @param {(node) => boolean} replace ποιοι κόμβοι αντικαθίστανται με την τιμή τους
 * @param {string} dialectId
 */
export function render(e, memo = null, replace = () => false, dialectId = 'glossa') {
  const dialect = getDialect(dialectId);
  const fmt = (v) => format(v, { quote: true, dialect: dialect.id });
  const r = (x) => render(x, memo, replace, dialect.id);
  if (memo && memo.has(e) && replace(e)) return fmt(memo.get(e));
  switch (e.type) {
    case 'Num': return e.text;
    case 'Str': return fmt({ t: 'str', v: e.value });
    case 'Bool': return fmt({ t: 'bool', v: e.value });
    case 'Var': return e.name;
    case 'Index': return `${e.name}[${e.indices.map(r).join(', ')}]`;
    case 'FnCall': return `${e.name}(${e.args.map(r).join(', ')})`;
    case 'Group': return `(${r(e.expr)})`;
    case 'Unary': return e.op === 'ΟΧΙ' ? `${opText('ΟΧΙ', dialect)} ${r(e.operand)}` : `${e.op}${r(e.operand)}`;
    case 'Binary': return `${r(e.left)} ${opText(e.op, dialect)} ${r(e.right)}`;
    default: return '?';
  }
}

const isLeafRef = (n) => n.type === 'Var' || n.type === 'Index' || n.type === 'FnCall';

/** Αντικαθιστά κάθε μη λογικό υποδέντρο με την τιμή του. */
const isNonLogical = (n) => !(n.type === 'Binary' && LOGICAL.has(n.op))
  && !(n.type === 'Unary' && n.op === 'ΟΧΙ')
  && n.type !== 'Group';

/**
 * Παράγει τη σειρά βημάτων υπολογισμού μιας έκφρασης.
 * @returns {string[]} π.χ. ['Σ + i', '10 + 3', '13']
 */
export function evaluationChain(expr, memo, dialectId = 'glossa') {
  const steps = [render(expr, null, undefined, dialectId)];
  steps.push(render(expr, memo, isLeafRef, dialectId));
  if (containsLogical(expr)) steps.push(render(expr, memo, isNonLogical, dialectId));
  steps.push(format(memo.get(expr), { quote: true, dialect: dialectId }));
  return steps.filter((s, i) => i === 0 || s !== steps[i - 1]);
}

function containsLogical(e) {
  if (e.type === 'Group') return containsLogical(e.expr);
  if (e.type === 'Binary') return LOGICAL.has(e.op);
  if (e.type === 'Unary') return e.op === 'ΟΧΙ';
  return false;
}
