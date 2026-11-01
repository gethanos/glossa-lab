// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Συντακτικός αναλυτής (recursive descent), κοινός για ΓΛΩΣΣΑ και ψευδογλώσσα:
// εντολές και εκφράσεις. Οι «μονάδες» (πρόγραμμα, υποπρογράμματα, αλγόριθμοι)
// ορίζονται στα parser-glossa.js και parser-pseudo.js, που επεκτείνουν αυτή την κλάση.
// Οι διαφορές των δύο γλωσσών στις εντολές περιγράφονται στο dialects.js.
import { TokenType, normalize } from './tokens.js';
import { GlossaError } from './errors.js';
import { closest } from './suggest.js';

export const COMPARISON = new Set(['=', '<>', '<', '>', '<=', '>=']);

// Απλές εντολές: επιτρέπονται και μετά το «τότε» στην ίδια γραμμή (μόνο στην ψευδογλώσσα).
const SIMPLE_STATEMENTS = new Set(['Assign', 'Read', 'Write', 'Call']);

export function describeToken(t, dialect) {
  switch (t.type) {
    case TokenType.NEWLINE: return 'τέλος γραμμής';
    case TokenType.EOF: return 'τέλος του κώδικα';
    case TokenType.STRING: return dialect && dialect.id === 'pseudo' ? `«"${t.value}"»` : `«'${t.value}'»`;
    case TokenType.NUMBER: return `«${t.text}»`;
    case TokenType.KEYWORD: return `«${dialect ? dialect.display(t.value) : t.value}»`;
    default: return `«${t.value}»`;
  }
}

export class Parser {
  /**
   * @param {object[]} tokens
   * @param {object} dialect ορισμός γλώσσας από το dialects.js
   */
  constructor(tokens, dialect) {
    this.tokens = tokens;
    this.dialect = dialect;
    this.pos = 0;
  }

  // ---------- Βοηθητικά ----------
  /** Η λέξη-κλειδί όπως γράφεται στη γλώσσα (π.χ. ΤΟΤΕ ή τότε). */
  k(norm) { return this.dialect.display(norm); }
  peek(offset = 0) { return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]; }
  next() { return this.tokens[this.pos++]; }
  isKw(word, t = this.peek()) { return t.type === TokenType.KEYWORD && t.value === word; }
  isOp(op, t = this.peek()) { return t.type === TokenType.OP && t.value === op; }
  atLineEnd(t = this.peek()) { return t.type === TokenType.NEWLINE || t.type === TokenType.EOF; }
  where(t) { return { line: t.line, col: t.col, length: t.length || 1 }; }
  describe(t) { return describeToken(t, this.dialect); }
  get assignSymbol() { return this.dialect.id === 'pseudo' ? '←' : '<-'; }

  skipNewlines() {
    while (this.peek().type === TokenType.NEWLINE) this.pos++;
  }

  fail(expected, t, extra = {}) {
    throw new GlossaError('S_EXPECTED', this.where(t), { expected, found: this.describe(t), ...extra });
  }

  expectKw(word, context, extra = {}) {
    const t = this.peek();
    if (this.isKw(word, t)) return this.next();
    const suggestion = t.type === TokenType.IDENT && closest(t.value, [word]) ? this.k(word) : undefined;
    this.fail(`«${this.k(word)}»`, t, { context, suggestion, ...extra });
  }

  expectOp(op, context, extra = {}) {
    const t = this.peek();
    if (this.isOp(op, t)) return this.next();
    this.fail(`«${op}»`, t, { context, ...extra });
  }

  expectIdent(context) {
    const t = this.peek();
    if (t.type === TokenType.IDENT) return this.next();
    const extra = t.type === TokenType.KEYWORD
      ? { fixText: `Το ${this.k(t.value)} είναι δεσμευμένη λέξη και δεν μπορεί να χρησιμοποιηθεί ως όνομα.` }
      : {};
    this.fail('όνομα', t, { context, ...extra });
  }

  endOfStatement() {
    const t = this.peek();
    if (t.type === TokenType.NEWLINE) { this.pos++; return; }
    if (t.type === TokenType.EOF) return;
    throw new GlossaError('S_TRAILING_TOKENS', this.where(t), { found: this.describe(t) });
  }

  /** Πληροφορίες για τα μηνύματα «δεν κλείνει»: η λέξη που άνοιξε και αυτή που κλείνει. */
  blockInfo(openTok, opener, closer) {
    return { openTok, opener: this.k(opener), closer: this.k(closer) };
  }

  // ---------- Μπλοκ εντολών ----------
  parseBlock(stopWords, info) {
    const stops = new Set(stopWords);
    const body = [];
    for (;;) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === TokenType.EOF) {
        throw new GlossaError('S_UNCLOSED_BLOCK', this.where(info.openTok), {
          opener: info.opener, openLine: info.openTok.line, closer: info.closer, found: 'τέλος του κώδικα',
        });
      }
      if (t.type === TokenType.KEYWORD && stops.has(t.value)) return body;
      if (t.type === TokenType.KEYWORD && this.dialect.blockEnders.has(t.value)) {
        throw new GlossaError('S_WRONG_END', this.where(t), {
          found: this.k(t.value), opener: info.opener, openLine: info.openTok.line, closer: info.closer,
        });
      }
      body.push(this.parseStatement());
    }
  }

  parseStatement() {
    const t = this.peek();
    if (t.type === TokenType.KEYWORD) {
      const kw = t.value;
      if (this.dialect.writeKeywords.has(kw)) return this.parseWrite();
      if (this.dialect.repeatStart.has(kw)) return this.parseRepeat();
      switch (kw) {
        case 'ΔΙΑΒΑΣΕ': return this.parseRead();
        case 'ΑΝ': return this.parseIf();
        case 'ΕΠΙΛΕΞΕ': return this.parseSelect();
        case 'ΟΣΟ': return this.parseWhile();
        case 'ΓΙΑ': return this.parseFor();
        case 'ΚΑΛΕΣΕ': return this.parseCall();
        default:
          throw new GlossaError('S_UNKNOWN_STATEMENT', this.where(t), { word: t.text || t.value });
      }
    }
    if (t.type === TokenType.IDENT) return this.parseIdentStatement();
    throw new GlossaError('S_UNKNOWN_STATEMENT', this.where(t), { word: t.text ?? String(t.value) });
  }

  /** Γραμμή που ξεκινά με όνομα: εκχώρηση, ή λέξη που δεν αναγνωρίζεται. */
  parseIdentStatement() {
    const t = this.peek();
    const after = this.peek(1);
    if (this.isOp('(', after)) return this.callWithoutKeyword(t);
    const looksLikeTarget = this.isOp('<-', after) || this.isOp('[', after) || this.isOp('=', after);
    if (!looksLikeTarget) this.unknownStatement(t, after);
    const target = this.parseLValue();
    const op = this.peek();
    if (this.isOp('=', op)) {
      throw new GlossaError('S_ASSIGN_WITH_EQUALS', this.where(op), { name: t.value, text: `${t.value} =` });
    }
    if (!this.isOp('<-', op)) {
      this.fail(`«${this.assignSymbol}»`, op, {
        context: `για να δοθεί τιμή στο ${t.value}`, fixText: `Γράψε ${t.value} ${this.assignSymbol} τιμή.`,
      });
    }
    this.next();
    const expr = this.parseExpression();
    this.endOfStatement();
    return { type: 'Assign', target, expr, line: t.line };
  }

  /** Κλήση χωρίς τη λέξη ΚΑΛΕΣΕ (π.χ. «Ταξινόμηση(Α)» σε δική του γραμμή). */
  callWithoutKeyword(t) {
    throw new GlossaError('S_PROC_WITHOUT_CALL', this.where(t), { name: t.value });
  }

  /** Η πρώτη λέξη της γραμμής δεν είναι εντολή ούτε εκχώρηση. */
  unknownStatement(t, after) {
    throw new GlossaError('S_UNKNOWN_STATEMENT', this.where(t), { word: t.value, suggestion: this.suggestKeyword(t, after) });
  }

  suggestKeyword(t, after) {
    // «ΤΕΛΟΣ ΑΝ» → «ΤΕΛΟΣ_ΑΝ», «ΑΡΧΗ ΕΠΑΝΑΛΗΨΗΣ» → «ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ»
    if (after && (after.type === TokenType.IDENT || after.type === TokenType.KEYWORD)) {
      const joined = `${t.norm}_${normalize(String(after.text || after.value))}`;
      if (this.dialect.keywords.has(joined)) return this.k(joined);
    }
    const best = closest(t.value, this.dialect.keywords);
    return best ? this.k(best) : undefined;
  }

  parseLValue() {
    const id = this.expectIdent('όνομα μεταβλητής');
    const base = { name: id.value, norm: id.norm, line: id.line, col: id.col, length: id.length };
    if (!this.isOp('[')) return { type: 'Var', ...base };
    this.next();
    const indices = [this.parseExpression()];
    while (this.isOp(',')) { this.next(); indices.push(this.parseExpression()); }
    this.expectOp(']', 'για να κλείσει ο δείκτης του πίνακα');
    return { type: 'Index', ...base, indices };
  }

  parseWrite() {
    const t = this.next();
    const items = [];
    if (!this.atLineEnd()) {
      do { items.push(this.parseExpression()); } while (this.isOp(',') && this.next());
    }
    this.endOfStatement();
    return { type: 'Write', keyword: this.k(t.value), items, line: t.line };
  }

  parseRead() {
    const t = this.next();
    const targets = [];
    do { targets.push(this.parseLValue()); } while (this.isOp(',') && this.next());
    this.endOfStatement();
    return { type: 'Read', targets, line: t.line };
  }

  /**
   * Σώμα ενός σκέλους του ΑΝ. Στην ψευδογλώσσα, αν μετά το «τότε»/«αλλιώς» ακολουθεί
   * εντολή στην ίδια γραμμή, το σκέλος είναι αυτή η μία απλή εντολή.
   * @returns {{ body: object[], inline: boolean }}
   */
  parseBranch(stops, info) {
    if (this.dialect.inlineIf && !this.atLineEnd()) {
      const start = this.peek();
      const stmt = this.parseStatement();
      if (!SIMPLE_STATEMENTS.has(stmt.type)) throw new GlossaError('P_INLINE_BLOCK', this.where(start));
      return { body: [stmt], inline: true };
    }
    this.endOfStatement();
    return { body: this.parseBlock(stops, info), inline: false };
  }

  parseIf() {
    const head = this.next();
    const info = this.blockInfo(head, 'ΑΝ', 'ΤΕΛΟΣ_ΑΝ');
    const stops = ['ΑΛΛΙΩΣ_ΑΝ', 'ΑΛΛΙΩΣ', 'ΤΕΛΟΣ_ΑΝ'];
    const cond = this.parseExpression();
    this.expectKw('ΤΟΤΕ', `μετά τη συνθήκη του ${this.k('ΑΝ')}`, { exampleText: `${this.k('ΑΝ')} x > 0 ${this.k('ΤΟΤΕ')}` });
    const first = this.parseBranch(stops, info);
    const branches = [{ cond, body: first.body, line: head.line }];
    let elseBody = null;
    let elseLine = null;
    let allInline = first.inline;
    for (;;) {
      const save = this.pos;
      this.skipNewlines();
      // Αν όλα τα σκέλη ήταν σε μία γραμμή, το Αν συνεχίζεται μόνο αν η επόμενη γραμμή
      // ξεκινά με σκέλος ή κλείσιμο· αλλιώς έχει ολοκληρωθεί χωρίς Τέλος_αν.
      if (allInline && !stops.some((w) => this.isKw(w))) {
        this.pos = save;
        return { type: 'If', branches, elseBody, elseLine, line: head.line, endLine: null };
      }
      const t = this.peek();
      if (this.isKw('ΑΛΛΙΩΣ_ΑΝ', t)) {
        if (elseBody) throw new GlossaError('S_DUPLICATE_ELSE', this.where(t), { word: this.k('ΑΛΛΙΩΣ_ΑΝ') });
        this.next();
        const c = this.parseExpression();
        this.expectKw('ΤΟΤΕ', `μετά τη συνθήκη του ${this.k('ΑΛΛΙΩΣ_ΑΝ')}`);
        const branch = this.parseBranch(stops, info);
        allInline = allInline && branch.inline;
        branches.push({ cond: c, body: branch.body, line: t.line });
      } else if (this.isKw('ΑΛΛΙΩΣ', t)) {
        if (elseBody) throw new GlossaError('S_DUPLICATE_ELSE', this.where(t), { word: this.k('ΑΛΛΙΩΣ') });
        this.next();
        if (this.isKw('ΑΝ')) {
          this.fail('τέλος γραμμής', this.peek(), {
            suggestion: this.k('ΑΛΛΙΩΣ_ΑΝ'), context: `μετά το ${this.k('ΑΛΛΙΩΣ')}`,
            fixText: `Το «αλλιώς αν» γράφεται ως μία λέξη με κάτω παύλα: ${this.k('ΑΛΛΙΩΣ_ΑΝ')}.`,
          });
        }
        const branch = this.parseBranch(stops, info);
        allInline = allInline && branch.inline;
        elseLine = t.line;
        elseBody = branch.body;
      } else if (this.isKw('ΤΕΛΟΣ_ΑΝ', t)) {
        this.next();
        this.endOfStatement();
        return { type: 'If', branches, elseBody, elseLine, line: head.line, endLine: t.line };
      } else {
        throw new GlossaError('S_UNCLOSED_BLOCK', this.where(head), {
          opener: info.opener, openLine: head.line, closer: info.closer, found: this.describe(t),
        });
      }
    }
  }

  parseSelect() {
    const head = this.next();
    const info = this.blockInfo(head, 'ΕΠΙΛΕΞΕ', 'ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ');
    const stops = ['ΠΕΡΙΠΤΩΣΗ', 'ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ'];
    const expr = this.parseExpression();
    this.endOfStatement();
    this.skipNewlines();
    if (!this.isKw('ΠΕΡΙΠΤΩΣΗ')) this.fail(`«${this.k('ΠΕΡΙΠΤΩΣΗ')}»`, this.peek(), { context: `μετά το ${this.k('ΕΠΙΛΕΞΕ')}` });
    const cases = [];
    let defaultBody = null;
    let defaultLine = null;
    for (;;) {
      const t = this.peek();
      if (this.isKw('ΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ', t)) {
        this.next();
        this.endOfStatement();
        return { type: 'Select', expr, cases, defaultBody, defaultLine, line: head.line, endLine: t.line };
      }
      this.next(); // ΠΕΡΙΠΤΩΣΗ
      const caseWord = this.k('ΠΕΡΙΠΤΩΣΗ');
      if (this.isKw('ΑΛΛΙΩΣ')) {
        if (defaultBody) throw new GlossaError('S_DUPLICATE_ELSE', this.where(t), { word: `${caseWord} ${this.k('ΑΛΛΙΩΣ')}` });
        this.next();
        this.endOfStatement();
        defaultLine = t.line;
        defaultBody = this.parseBlock(stops, info);
        continue;
      }
      if (defaultBody) throw new GlossaError('S_DUPLICATE_ELSE', this.where(t), { word: caseWord });
      const tests = [];
      do { tests.push(this.parseCaseTest()); } while (this.isOp(',') && this.next());
      this.endOfStatement();
      cases.push({ tests, body: this.parseBlock(stops, info), line: t.line });
    }
  }

  parseCaseTest() {
    const t = this.peek();
    if (t.type === TokenType.OP && COMPARISON.has(t.value)) {
      this.next();
      return { kind: 'cmp', op: t.value, expr: this.parseAdditive() };
    }
    const lo = this.parseAdditive();
    if (this.isOp('..')) {
      this.next();
      return { kind: 'range', lo, hi: this.parseAdditive() };
    }
    return { kind: 'value', expr: lo };
  }

  parseWhile() {
    const head = this.next();
    const cond = this.parseExpression();
    this.expectKw('ΕΠΑΝΑΛΑΒΕ', `μετά τη συνθήκη του ${this.k('ΟΣΟ')}`, {
      exampleText: `${this.k('ΟΣΟ')} i ${this.dialect.id === 'pseudo' ? '≤' : '<='} 10 ${this.k('ΕΠΑΝΑΛΑΒΕ')}`,
    });
    this.endOfStatement();
    const body = this.parseBlock(['ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'], this.blockInfo(head, 'ΟΣΟ', 'ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'));
    const endTok = this.next();
    this.endOfStatement();
    return { type: 'While', cond, body, line: head.line, endLine: endTok.line };
  }

  parseRepeat() {
    const head = this.next();
    this.endOfStatement();
    const info = { openTok: head, opener: head.text || this.k(head.value), closer: this.k('ΜΕΧΡΙΣ_ΟΤΟΥ') };
    const body = this.parseBlock(['ΜΕΧΡΙΣ_ΟΤΟΥ'], info);
    const untilTok = this.next();
    const cond = this.parseExpression();
    this.endOfStatement();
    return { type: 'Repeat', keyword: info.opener, body, cond, line: head.line, endLine: untilTok.line };
  }

  parseFor() {
    const head = this.next();
    const counter = this.parseLValue();
    const t = this.peek();
    const forWord = this.k('ΓΙΑ');
    const sample = `${forWord} i ${this.k('ΑΠΟ')} 1 ${this.k('ΜΕΧΡΙ')} 10`;
    if (!this.isKw('ΑΠΟ', t)) {
      const assignLike = this.isOp('<-', t) || this.isOp('=', t);
      this.fail(`«${this.k('ΑΠΟ')}»`, t, {
        context: `μετά τον μετρητή του ${forWord}`,
        fixText: assignLike ? `Στο ${forWord} η αρχική τιμή δίνεται με τη λέξη ${this.k('ΑΠΟ')}, όχι με βέλος ή ίσον.` : undefined,
        exampleText: sample,
      });
    }
    this.next();
    const from = this.parseExpression();
    this.expectKw('ΜΕΧΡΙ', `για την τελική τιμή του ${forWord}`, { exampleText: sample });
    const to = this.parseExpression();
    let step = null;
    if (this.isKw('ΜΕ_ΒΗΜΑ')) { this.next(); step = this.parseExpression(); }
    this.endOfStatement();
    const body = this.parseBlock(['ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'], this.blockInfo(head, 'ΓΙΑ', 'ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'));
    const endTok = this.next();
    this.endOfStatement();
    return { type: 'For', counter, from, to, step, body, line: head.line, endLine: endTok.line };
  }

  parseCall() {
    const head = this.next();
    const id = this.expectIdent(this.dialect.id === 'pseudo' ? 'το όνομα του αλγορίθμου' : 'το όνομα της διαδικασίας');
    const args = this.isOp('(') ? this.parseArgs() : [];
    this.endOfStatement();
    return { type: 'Call', name: id.value, norm: id.norm, args, line: head.line, col: id.col, length: id.length };
  }

  parseArgs() {
    this.next(); // (
    const args = [];
    if (!this.isOp(')')) {
      do { args.push(this.parseExpression()); } while (this.isOp(',') && this.next());
    }
    this.expectOp(')', 'για να κλείσει η λίστα παραμέτρων');
    return args;
  }

  // ---------- Εκφράσεις ----------
  // Προτεραιότητα (χαμηλή → υψηλή): Η, ΚΑΙ, ΟΧΙ, σύγκριση, + -, * / DIV MOD, πρόσημο, ^
  parseExpression() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.isKw('Η')) {
      const op = this.next();
      left = bin('Η', left, this.parseAnd(), op);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.isKw('ΚΑΙ')) {
      const op = this.next();
      left = bin('ΚΑΙ', left, this.parseNot(), op);
    }
    return left;
  }

  parseNot() {
    if (this.isKw('ΟΧΙ')) {
      const op = this.next();
      return { type: 'Unary', op: 'ΟΧΙ', operand: this.parseNot(), line: op.line, col: op.col };
    }
    return this.parseComparison();
  }

  parseComparison() {
    const left = this.parseAdditive();
    const t = this.peek();
    if (t.type === TokenType.OP && COMPARISON.has(t.value)) {
      this.next();
      return bin(t.value, left, this.parseAdditive(), t);
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (this.isOp('+', t) || this.isOp('-', t)) {
        this.next();
        left = bin(t.value, left, this.parseMultiplicative(), t);
      } else return left;
    }
  }

  parseMultiplicative() {
    let left = this.parseSign();
    for (;;) {
      const t = this.peek();
      if (this.isOp('*', t) || this.isOp('/', t) || this.isKw('DIV', t) || this.isKw('MOD', t)) {
        this.next();
        left = bin(t.value, left, this.parseSign(), t);
      } else return left;
    }
  }

  parseSign() {
    const t = this.peek();
    if (this.isOp('-', t) || this.isOp('+', t)) {
      this.next();
      return { type: 'Unary', op: t.value, operand: this.parseSign(), line: t.line, col: t.col };
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();
    if (this.isOp('^')) {
      const t = this.next();
      return bin('^', base, this.parseSign(), t);
    }
    return base;
  }

  parsePrimary() {
    const t = this.peek();
    switch (t.type) {
      case TokenType.NUMBER:
        this.next();
        return { type: 'Num', value: t.value, isInt: t.isInt, text: t.text, line: t.line, col: t.col };
      case TokenType.STRING:
        this.next();
        return { type: 'Str', value: t.value, line: t.line, col: t.col };
      case TokenType.KEYWORD:
        if (t.value === 'ΑΛΗΘΗΣ' || t.value === 'ΨΕΥΔΗΣ') {
          this.next();
          return { type: 'Bool', value: t.value === 'ΑΛΗΘΗΣ', line: t.line, col: t.col };
        }
        break;
      case TokenType.OP:
        if (t.value === '(') {
          this.next();
          const inner = this.parseExpression();
          this.expectOp(')', 'για να κλείσει η παρένθεση');
          return { type: 'Group', expr: inner, line: t.line, col: t.col };
        }
        break;
      case TokenType.IDENT: {
        if (this.isOp('(', this.peek(1))) {
          this.next();
          const args = this.parseArgs();
          return { type: 'FnCall', name: t.value, norm: t.norm, args, line: t.line, col: t.col, length: t.length };
        }
        return this.parseLValue();
      }
      default:
        break;
    }
    const prev = this.tokens[this.pos - 1];
    if (t.type === TokenType.OP && COMPARISON.has(t.value) && prev && (this.isKw('ΚΑΙ', prev) || this.isKw('Η', prev))) {
      this.fail('έκφραση', t, {
        context: `μετά το ${this.k(prev.value)}`,
        fixText: `Κάθε μέλος του ${this.k(prev.value)} πρέπει να είναι πλήρης σύγκριση. Ο υπολογιστής δεν «θυμάται» τη μεταβλητή της προηγούμενης σύγκρισης.`,
        exampleText: `${this.k('ΑΝ')} x > 0 ${this.k('ΚΑΙ')} x < 10 ${this.k('ΤΟΤΕ')}`,
      });
    }
    throw new GlossaError('S_EXPRESSION_EXPECTED', this.where(t), { found: this.describe(t) });
  }
}

function bin(op, left, right, tok) {
  return { type: 'Binary', op, left, right, line: tok.line, col: tok.col };
}
