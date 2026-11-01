// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Τα παραδείγματα της εφαρμογής εκτελούνται με γνωστή είσοδο και δίνουν γνωστή έξοδο.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examplesFor } from '../src/examples.js';
import { runProgram } from './helpers.mjs';

const GLOSSA = {
  hello: { inputs: ['3', '4'], output: ['Δώσε μήκος και πλάτος', 'Εμβαδόν: 12'] },
  sum: { inputs: ['5'], output: ['Άθροισμα: 15'] },
  grades: { inputs: ['17.5'], output: ['Δώσε βαθμό (0-20)', 'Πολύ καλά'] },
  digits: { inputs: ['4825'], output: ['Δώσε θετικό ακέραιο', 'Ψηφία: 4 Άθροισμα ψηφίων: 19'] },
  validate: {
    inputs: ['0', '150', '30'],
    output: ['Δώσε ηλικία (1-120)', 'Δώσε ηλικία (1-120)', 'Δώσε ηλικία (1-120)', 'Έγκυρη ηλικία: 30'],
  },
  max: {
    inputs: ['7', '3', '12', '5', '9'],
    output: ['Δώσε αριθμό 1', 'Δώσε αριθμό 2', 'Δώσε αριθμό 3', 'Δώσε αριθμό 4', 'Δώσε αριθμό 5', 'Μέγιστο: 12 στη θέση 3'],
  },
  bubble: { inputs: [], output: ['3', '7', '11', '19', '25', '42'] },
  matrix: { inputs: [], output: ['Γραμμή 1 : 10', 'Γραμμή 2 : 20', 'Γραμμή 3 : 30'] },
  menu: { inputs: ['8', '*', '5'], output: ['40'] },
  subs: { inputs: [], output: ['Μέγιστο: 9', 'Μετά την αντιμετάθεση: 9 4'] },
  bugs: { inputs: [], output: [], runtime: 'R_UNINITIALIZED', line: 12 },
};

const PSEUDO = {
  'p-sum': { inputs: ['5'], output: ['Άθροισμα: 15'] },
  'p-average': { inputs: ['8, 12, 4', '3'], output: ['μο = 8'] },
  'p-grade': { inputs: ['17,5'], output: ['Πολύ καλά'] },
  'p-euclid': { inputs: ['48', '18'], output: ['Μ.Κ.Δ.: 6'] },
  'p-select': { inputs: ['6'], output: ['Σαββατοκύριακο'] },
  'p-validate': {
    inputs: ['0', '150', '30'],
    output: ['Δώσε ηλικία (1-120)', 'Δώσε ηλικία (1-120)', 'Δώσε ηλικία (1-120)', 'Έγκυρη ηλικία: 30'],
  },
  'p-sort': { inputs: [], output: ['3', '7', '19', '25', '42'] },
  'p-call': { inputs: ['4', '9'], output: ['Μέγιστος: 9'] },
  'p-factorial': { inputs: ['5'], output: ['5 ! = 120'] },
  'p-bugs': { inputs: [], output: [], runtime: 'R_UNINITIALIZED', line: 8 },
};

for (const [dialect, cases] of [['glossa', GLOSSA], ['pseudo', PSEUDO]]) {
  const examples = examplesFor(dialect);

  test(`${dialect}: κάθε παράδειγμα έχει έλεγχο`, () => {
    assert.deepEqual(examples.map((e) => e.id).sort(), Object.keys(cases).sort());
  });

  for (const ex of examples) {
    test(`${dialect}: ${ex.title}`, () => {
      const expected = cases[ex.id];
      const r = runProgram(ex.code, expected.inputs, dialect);
      assert.deepEqual(r.errors, [], 'δεν πρέπει να υπάρχουν λάθη μεταγλώττισης');
      assert.deepEqual(r.warnings, [], 'δεν πρέπει να υπάρχουν προειδοποιήσεις');
      assert.deepEqual(r.output, expected.output);
      if (expected.runtime) {
        assert.equal(r.runtime?.code, expected.runtime);
        assert.equal(r.runtime.line, expected.line);
      } else {
        assert.equal(r.runtime, null, r.runtime?.message);
        assert.equal(r.interp.finished, true);
      }
    });
  }
}
