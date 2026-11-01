// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Κοινοί ορισμοί λεκτικών μονάδων. Ό,τι διαφέρει ανά γλώσσα βρίσκεται στο dialects.js.
// Το module δεν εξαρτάται από κανένα άλλο.

export const TokenType = Object.freeze({
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENT: 'IDENT',
  KEYWORD: 'KEYWORD',
  OP: 'OP',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
});

/** Κανονικοποίηση: κεφαλαία, χωρίς τόνους/διαλυτικά. */
export function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

/** Λέξεις-κλειδιά δήλωσης τμήματος μεταβλητών → εσωτερικός τύπος. */
export const DECL_TYPES = Object.freeze({
  'ΑΚΕΡΑΙΕΣ': 'int', 'ΠΡΑΓΜΑΤΙΚΕΣ': 'real', 'ΧΑΡΑΚΤΗΡΕΣ': 'str', 'ΛΟΓΙΚΕΣ': 'bool',
});

/** Τύποι επιστροφής συνάρτησης → εσωτερικός τύπος. */
export const RETURN_TYPES = Object.freeze({
  'ΑΚΕΡΑΙΑ': 'int', 'ΠΡΑΓΜΑΤΙΚΗ': 'real', 'ΧΑΡΑΚΤΗΡΑΣ': 'str', 'ΛΟΓΙΚΗ': 'bool',
});

/** Ελληνικά ονόματα εσωτερικών τύπων, για μηνύματα. */
export const TYPE_LABEL = Object.freeze({
  int: 'ΑΚΕΡΑΙΑ', real: 'ΠΡΑΓΜΑΤΙΚΗ', str: 'ΧΑΡΑΚΤΗΡΑΣ', bool: 'ΛΟΓΙΚΗ',
});

/** Χαρακτήρες που επιτρέπονται σε αναγνωριστικά. */
export const IDENT_START = /[A-Za-z\u0370-\u03FF\u1F00-\u1FFF]/;
export const IDENT_PART = /[A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF]/;

export function makeToken(type, value, line, col, extra = {}) {
  return { type, value, line, col, ...extra };
}
