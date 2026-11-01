// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Συντακτικός αναλυτής ψευδογλώσσας: ένας ή περισσότεροι αλγόριθμοι
//   Αλγόριθμος όνομα
//   Δεδομένα // α, β //        (προαιρετικό, δεύτερη γραμμή)
//   ...εντολές...
//   Αποτελέσματα // γ //       (προαιρετικό, προτελευταία γραμμή)
//   Τέλος όνομα
// Ο πρώτος αλγόριθμος είναι ο κύριος· οι υπόλοιποι εκτελούνται με Κάλεσε.
import { TokenType } from './tokens.js';
import { GlossaError, warning } from './errors.js';
import { Parser } from './parser.js';
import { DIALECTS } from './dialects.js';
import { distance } from './suggest.js';
import { normalize } from './tokens.js';

/** Λεκτικές μονάδες → AST (κόμβος AlgorithmFile). */
export function parsePseudo(tokens) {
  return new PseudoParser(tokens, DIALECTS.pseudo).parseFile();
}

class PseudoParser extends Parser {
  constructor(tokens, dialect) {
    super(tokens, dialect);
    this.warnings = [];
  }

  parseFile() {
    this.skipNewlines();
    if (!this.isKw('ΑΛΓΟΡΙΘΜΟΣ')) throw new GlossaError('S_MISSING_PROGRAM', this.where(this.peek()));
    const algorithms = [];
    for (;;) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === TokenType.EOF) break;
      if (!this.isKw('ΑΛΓΟΡΙΘΜΟΣ', t)) throw new GlossaError('S_CODE_AFTER_END', this.where(t));
      algorithms.push(this.parseAlgorithm());
    }
    return { type: 'AlgorithmFile', algorithms, main: algorithms[0], warnings: this.warnings };
  }

  parseAlgorithm() {
    const head = this.next();
    const nameTok = this.expectIdent('το όνομα του αλγορίθμου');
    this.endOfStatement();
    this.skipNewlines();
    const inputsLine = this.isKw('ΔΕΔΟΜΕΝΑ') ? this.peek().line : null;
    const inputs = inputsLine ? this.parseNameList() : [];
    const body = this.parseBlock(['ΑΠΟΤΕΛΕΣΜΑΤΑ', 'ΤΕΛΟΣ'], this.blockInfo(head, 'ΑΛΓΟΡΙΘΜΟΣ', 'ΤΕΛΟΣ'));
    let outputs = [];
    const outputsLine = this.isKw('ΑΠΟΤΕΛΕΣΜΑΤΑ') ? this.peek().line : null;
    if (outputsLine) {
      outputs = this.parseNameList();
      this.skipNewlines();
      if (!this.isKw('ΤΕΛΟΣ')) {
        this.fail(`«${this.k('ΤΕΛΟΣ')} ${nameTok.value}»`, this.peek(), {
          context: 'μετά τα Αποτελέσματα',
          fixText: 'Η γραμμή Αποτελέσματα είναι η προτελευταία του αλγορίθμου: μετά από αυτήν ακολουθεί μόνο το Τέλος. Μετάφερε τις εντολές πριν από τα Αποτελέσματα.',
        });
      }
    }
    const endTok = this.next(); // ΤΕΛΟΣ
    const endName = this.expectIdent('το όνομα του αλγορίθμου μετά το Τέλος');
    if (endName.norm !== nameTok.norm) {
      this.warnings.push(warning('W_END_NAME', this.where(endName), { found: endName.value, name: nameTok.value }));
    }
    this.endOfStatement();
    return {
      type: 'Algorithm', name: nameTok.value, norm: nameTok.norm, line: head.line,
      col: nameTok.col, length: nameTok.length, inputs, outputs, inputsLine, outputsLine, body, endLine: endTok.line,
    };
  }

  /** Δεδομένα // α, β // ή Αποτελέσματα // γ // */
  parseNameList() {
    const head = this.next();
    const section = this.k(head.value);
    const bad = (t) => new GlossaError('P_PARAM_LIST', this.where(t), { section });
    const slashes = () => {
      const a = this.peek();
      const b = this.peek(1);
      if (!this.isOp('/', a) || !this.isOp('/', b) || b.col !== a.col + 1) throw bad(a);
      this.pos += 2;
    };
    slashes();
    const names = [];
    if (!this.isOp('/')) {
      do {
        const t = this.peek();
        if (t.type !== TokenType.IDENT) throw bad(t);
        this.next();
        names.push({ name: t.value, norm: t.norm, line: t.line, col: t.col, length: t.length });
      } while (this.isOp(',') && this.next());
    }
    slashes();
    this.endOfStatement();
    return names;
  }

  callWithoutKeyword(t) {
    throw new GlossaError('S_PROC_WITHOUT_CALL', this.where(t), { name: t.value });
  }

  /** Λέξη που δεν είναι εντολή: πιθανό ορθογραφικό λάθος ή ελεύθερη διατύπωση. */
  unknownStatement(t, after) {
    const suggestion = this.suggestKeyword(t, after);
    // Μικρό ορθογραφικό λάθος σε εντολή → πρόταση διόρθωσης. Αλλιώς πρόκειται για ελεύθερη διατύπωση.
    if (suggestion && distance(t.norm, normalize(suggestion)) <= 1) {
      throw new GlossaError('S_UNKNOWN_STATEMENT', this.where(t), { word: t.value, suggestion });
    }
    throw new GlossaError('P_FREE_TEXT', this.where(t), { word: t.value, suggestion });
  }
}
