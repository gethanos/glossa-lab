// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Συντακτικός αναλυτής ΓΛΩΣΣΑΣ: πρόγραμμα, δηλώσεις, συναρτήσεις και διαδικασίες.
// Οι εντολές και οι εκφράσεις προέρχονται από τον κοινό Parser.
import { TokenType, DECL_TYPES, RETURN_TYPES } from './tokens.js';
import { GlossaError } from './errors.js';
import { Parser } from './parser.js';
import { DIALECTS } from './dialects.js';

/** Λεκτικές μονάδες → AST προγράμματος ΓΛΩΣΣΑΣ (κόμβος Program). */
export function parseGlossa(tokens) {
  return new GlossaParser(tokens, DIALECTS.glossa).parseUnit();
}

class GlossaParser extends Parser {
  parseUnit() {
    this.skipNewlines();
    const start = this.peek();
    if (!this.isKw('ΠΡΟΓΡΑΜΜΑ', start)) {
      throw new GlossaError('S_MISSING_PROGRAM', this.where(start));
    }
    this.next();
    const nameTok = this.expectIdent('το όνομα του προγράμματος');
    this.endOfStatement();
    const decls = this.parseDeclarations();
    const beginTok = this.expectKw('ΑΡΧΗ', 'πριν από τις εντολές του προγράμματος', {
      fixText: 'Μετά τις δηλώσεις γράψε ΑΡΧΗ σε δική της γραμμή και μετά τις εντολές.',
    });
    this.endOfStatement();
    const body = this.parseBlock(['ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ'], { opener: 'ΠΡΟΓΡΑΜΜΑ', openTok: start, closer: 'ΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ' });
    const endTok = this.next();
    this.endOfStatement();

    const subs = [];
    for (;;) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === TokenType.EOF) break;
      if (this.isKw('ΣΥΝΑΡΤΗΣΗ', t) || this.isKw('ΔΙΑΔΙΚΑΣΙΑ', t)) { subs.push(this.parseSubprogram()); continue; }
      throw new GlossaError('S_CODE_AFTER_END', this.where(t));
    }

    return {
      type: 'Program', name: nameTok.value, norm: nameTok.norm, line: start.line,
      ...decls, beginLine: beginTok.line, body, endLine: endTok.line, subs,
    };
  }

  parseSubprogram() {
    const head = this.next();
    const isFunc = head.value === 'ΣΥΝΑΡΤΗΣΗ';
    const endWord = isFunc ? 'ΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ' : 'ΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ';
    const nameTok = this.expectIdent(`το όνομα της ${isFunc ? 'συνάρτησης' : 'διαδικασίας'}`);
    const params = [];
    if (this.isOp('(')) {
      this.next();
      if (!this.isOp(')')) {
        do {
          const p = this.expectIdent('όνομα παραμέτρου');
          params.push({ name: p.value, norm: p.norm, line: p.line, col: p.col, length: p.length });
        } while (this.isOp(',') && this.next());
      }
      this.expectOp(')', 'για να κλείσει η λίστα παραμέτρων');
    }
    let returnType = null;
    if (isFunc) {
      this.expectOp(':', 'πριν από τον τύπο της συνάρτησης', {
        fixText: 'Μια συνάρτηση δηλώνει τον τύπο της τιμής που επιστρέφει, π.χ. «ΣΥΝΑΡΤΗΣΗ Μέγιστο(α, β): ΑΚΕΡΑΙΑ».',
      });
      const t = this.peek();
      if (t.type !== TokenType.KEYWORD || !RETURN_TYPES[t.value]) {
        this.fail('τύπος συνάρτησης (ΑΚΕΡΑΙΑ, ΠΡΑΓΜΑΤΙΚΗ, ΧΑΡΑΚΤΗΡΑΣ ή ΛΟΓΙΚΗ)', t, {
          fixText: 'Ο τύπος συνάρτησης γράφεται στον ενικό: ΑΚΕΡΑΙΑ, ΠΡΑΓΜΑΤΙΚΗ, ΧΑΡΑΚΤΗΡΑΣ, ΛΟΓΙΚΗ.',
        });
      }
      returnType = RETURN_TYPES[this.next().value];
    }
    this.endOfStatement();
    const decls = this.parseDeclarations();
    const beginTok = this.expectKw('ΑΡΧΗ', `πριν από τις εντολές του ${nameTok.value}`);
    this.endOfStatement();
    const body = this.parseBlock([endWord], { opener: head.value, openTok: head, closer: endWord });
    const endTok = this.next();
    this.endOfStatement();
    return {
      type: isFunc ? 'Function' : 'Procedure', name: nameTok.value, norm: nameTok.norm,
      line: head.line, col: nameTok.col, params, returnType, ...decls,
      beginLine: beginTok.line, body, endLine: endTok.line,
    };
  }

  parseDeclarations() {
    const consts = [];
    const vars = [];
    for (;;) {
      this.skipNewlines();
      const t = this.peek();
      if (this.isKw('ΣΤΑΘΕΡΕΣ', t)) {
        this.next();
        this.endOfStatement();
        this.skipNewlines();
        while (this.peek().type === TokenType.IDENT) {
          consts.push(this.parseConstant());
          this.skipNewlines();
        }
      } else if (this.isKw('ΜΕΤΑΒΛΗΤΕΣ', t)) {
        this.next();
        this.endOfStatement();
        this.skipNewlines();
        while (this.peek().type === TokenType.KEYWORD && DECL_TYPES[this.peek().value]) {
          vars.push(...this.parseVarLine());
          this.skipNewlines();
        }
        const after = this.peek();
        if (after.type === TokenType.IDENT && this.isOp(':', this.peek(1))) {
          throw new GlossaError('S_BAD_DECLARATION', this.where(after), { found: this.describe(after) });
        }
      } else if (t.type === TokenType.KEYWORD && DECL_TYPES[t.value]) {
        this.fail('«ΜΕΤΑΒΛΗΤΕΣ»', t, {
          context: 'πριν από τις δηλώσεις τύπων',
          fixText: 'Οι δηλώσεις τύπων γράφονται μέσα στο τμήμα ΜΕΤΑΒΛΗΤΕΣ. Πρόσθεσε τη λέξη ΜΕΤΑΒΛΗΤΕΣ σε δική της γραμμή.',
        });
      } else {
        return { consts, vars };
      }
    }
  }

  parseConstant() {
    const nameTok = this.next();
    const eq = this.peek();
    if (!this.isOp('=', eq)) {
      throw new GlossaError('S_BAD_CONSTANT', this.where(eq), { name: nameTok.value });
    }
    this.next();
    const expr = this.parseExpression();
    this.endOfStatement();
    return { name: nameTok.value, norm: nameTok.norm, expr, line: nameTok.line, col: nameTok.col, length: nameTok.length };
  }

  parseVarLine() {
    const typeTok = this.next();
    const type = DECL_TYPES[typeTok.value];
    this.expectOp(':', `μετά το ${typeTok.value}`, {
      fixText: `Γράψε ${typeTok.value}: και μετά τα ονόματα.`, exampleText: `${typeTok.value}: α, β`,
    });
    const out = [];
    do {
      const id = this.expectIdent('όνομα μεταβλητής');
      let dims = null;
      if (this.isOp('[')) {
        this.next();
        dims = [this.parseExpression()];
        while (this.isOp(',')) { this.next(); dims.push(this.parseExpression()); }
        this.expectOp(']', 'για να κλείσει η διάσταση του πίνακα');
      }
      out.push({ name: id.value, norm: id.norm, type, dims, line: id.line, col: id.col, length: id.length });
    } while (this.isOp(',') && this.next());
    this.endOfStatement();
    return out;
  }

}
