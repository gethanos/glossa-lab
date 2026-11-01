// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Βοηθητικές συναρτήσεις για τους ελέγχους του πυρήνα.
import { compile } from '../src/core/compiler.js';
import { createInterpreter } from '../src/core/runtime.js';

/**
 * Μεταγλωττίζει και εκτελεί ένα πρόγραμμα.
 * Κάθε test δηλώνει ρητά τις τιμές εισόδου που χρειάζεται. Αν το πρόγραμμα ζητήσει
 * περισσότερες, ο έλεγχος αποτυγχάνει, ώστε να μη «μαντεύονται» τιμές.
 *
 * @param {string} source
 * @param {string[]} inputs τιμές για τα ΔΙΑΒΑΣΕ, με τη σειρά
 * @param {'glossa'|'pseudo'} dialect
 * @returns {{ errors: string[], warnings: string[], output: string[], runtime: object|null, interp: Interpreter|null }}
 */
export function runProgram(source, inputs = [], dialect = 'glossa') {
  const result = compile(source, dialect);
  const warnings = result.warnings.map((w) => w.code);
  if (!result.ok) {
    return { errors: result.errors.map((e) => e.code), firstError: result.errors[0], warnings, output: [], runtime: null, interp: null };
  }
  const output = [];
  const interp = createInterpreter(result, { onOutput: (line) => output.push(line) });
  const queue = [...inputs];
  const gen = interp.run();
  let runtime = null;
  try {
    let step = gen.next();
    while (!step.done) {
      if (step.value.type === 'input') {
        if (!queue.length) throw new Error(`Το πρόγραμμα ζήτησε επιπλέον είσοδο για ${step.value.request.name}`);
        step = gen.next(queue.shift());
      } else {
        step = gen.next();
      }
    }
  } catch (err) {
    if (!err.code) throw err;
    runtime = err;
  }
  return { errors: [], warnings, output, runtime, interp };
}

/** Τυλίγει εντολές σε πλήρες πρόγραμμα με τυπικές δηλώσεις. */
export function program(body, declarations = 'ΑΚΕΡΑΙΕΣ: x, y, i\n  ΠΡΑΓΜΑΤΙΚΕΣ: r\n  ΧΑΡΑΚΤΗΡΕΣ: s\n  ΛΟΓΙΚΕΣ: b') {
  return `ΠΡΟΓΡΑΜΜΑ Τεστ\nΜΕΤΑΒΛΗΤΕΣ\n  ${declarations}\nΑΡΧΗ\n${body}\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ`;
}
