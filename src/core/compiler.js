// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Ενιαίο σημείο εισόδου: κείμενο → AST + έλεγχος + διαγνωστικά, για την επιλεγμένη γλώσσα.
import { tokenize } from './lexer.js';
import { parseGlossa } from './parser-glossa.js';
import { parsePseudo } from './parser-pseudo.js';
import { analyzeGlossa } from './analyzer-glossa.js';
import { analyzePseudo } from './analyzer-pseudo.js';
import { getDialect, detectDialect } from './dialects.js';
import { GlossaError, localize } from './errors.js';

const PIPELINES = {
  glossa: { parse: parseGlossa, analyze: analyzeGlossa },
  pseudo: { parse: parsePseudo, analyze: analyzePseudo },
};

/**
 * @param {string} source
 * @param {'glossa'|'pseudo'} dialectId
 * @returns {{ ok: boolean, dialect: string, detected: string|null, program: object|null,
 *             analysis: object|null, errors: GlossaError[], warnings: GlossaError[] }}
 */
export function compile(source, dialectId = 'glossa') {
  const dialect = getDialect(dialectId);
  const pipeline = PIPELINES[dialect.id];
  const base = { dialect: dialect.id, detected: detectDialect(source) };
  let warnings = [];
  try {
    const lexed = tokenize(source, dialect.id);
    warnings = lexed.warnings;
    const program = pipeline.parse(lexed.tokens);
    const analysis = pipeline.analyze(program);
    warnings = warnings.concat(program.warnings || [], analysis.warnings);
    const errors = [...analysis.errors].sort((a, b) => a.line - b.line || a.col - b.col);
    const loc = (list) => list.map((e) => localize(e, dialect.id));
    return { ...base, ok: errors.length === 0, program, analysis, errors: loc(errors), warnings: loc(warnings) };
  } catch (err) {
    if (err instanceof GlossaError) {
      return { ...base, ok: false, program: null, analysis: null, errors: [localize(err, dialect.id)], warnings: warnings.map((w) => localize(w, dialect.id)) };
    }
    throw err;
  }
}
