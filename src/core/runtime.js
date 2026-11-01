// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Δημιουργεί τον κατάλληλο διερμηνευτή για το αποτέλεσμα της μεταγλώττισης.
import { getDialect } from './dialects.js';
import { GlossaInterpreter } from './interpreter-glossa.js';
import { PseudoInterpreter } from './interpreter-pseudo.js';

const INTERPRETERS = { glossa: GlossaInterpreter, pseudo: PseudoInterpreter };

/**
 * @param {object} compiled αποτέλεσμα του compile() (χωρίς λάθη)
 * @param {object} options { inputs, onOutput, onQueuedInput, maxSteps, maxDepth }
 */
export function createInterpreter(compiled, options = {}) {
  const dialect = getDialect(compiled.dialect);
  const Impl = INTERPRETERS[dialect.id];
  return new Impl(compiled.program, compiled.analysis, dialect, options);
}
