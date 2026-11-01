// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Λεκτικός αναλυτής: μετατρέπει τον πηγαίο κώδικα σε λεκτικές μονάδες.
// Οι διαφορές ανάμεσα σε ΓΛΩΣΣΑ και ψευδογλώσσα (λέξεις-κλειδιά, εισαγωγικά,
// δεκαδικό σημείο, σύμβολα) έρχονται από τον ορισμό της γλώσσας (dialects.js).
import {
  TokenType, IDENT_START, IDENT_PART, normalize, makeToken,
} from './tokens.js';
import { getDialect } from './dialects.js';
import { GlossaError, warning } from './errors.js';

const TWO_CHAR_OPS = new Set(['<-', '<=', '>=', '<>', '..']);
const ONE_CHAR_OPS = new Set(['=', '<', '>', '+', '-', '*', '/', '^', '(', ')', '[', ']', ',', ':']);
const ALL_QUOTES = new Set(["'", '"', '‘', '’', '“', '”']);
const DIGIT = /[0-9]/;
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const LATIN = /[A-Za-z]/;
// «ΜΕ ΒΗΜΑ» με κενό (όπως στο πλαίσιο «Σύνταξη» του ΓΙΑ) είναι η ίδια λέξη-κλειδί με το «ΜΕ_ΒΗΜΑ».
const STEP_WORDS = /^\s+(ΒΗΜΑ)(?![A-Za-z0-9_\u0370-\u03FF\u1F00-\u1FFF])/;

/**
 * @param {string} source
 * @param {string} dialectId 'glossa' | 'pseudo'
 * @returns {{ tokens: object[], warnings: GlossaError[] }}
 */
export function tokenize(source, dialectId = 'glossa') {
  return new Lexer(getDialect(dialectId)).run(source);
}

class Lexer {
  constructor(dialect) {
    this.dialect = dialect;
    this.tokens = [];
    this.warnings = [];
  }

  run(source) {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((raw, index) => {
      let text = raw;
      const lineNo = index + 1;
      const last = this.tokens[this.tokens.length - 1];
      // Συνέχεια εντολής: η γραμμή ξεκινά με &, άρα ενώνεται με την προηγούμενη.
      if (text.trimStart()[0] === '&' && last && last.type === TokenType.NEWLINE) {
        this.tokens.pop();
        text = text.replace('&', ' ');
      }
      this.scanLine(text, lineNo);
      this.tokens.push(makeToken(TokenType.NEWLINE, '\n', lineNo, text.length + 1));
    });
    this.tokens.push(makeToken(TokenType.EOF, '', lines.length, 1));
    return { tokens: this.tokens, warnings: this.warnings };
  }

  scanLine(text, line) {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      const col = i + 1;
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (ch === '!') break; // σχόλιο έως το τέλος της γραμμής
      if (ch === '&' && text.slice(i + 1).trim() === '') break; // συνέχεια στο τέλος
      if (DIGIT.test(ch)) { i = this.scanNumber(text, i, line); continue; }
      if (IDENT_START.test(ch)) { i = this.scanWord(text, i, line); continue; }
      if (ALL_QUOTES.has(ch)) { i = this.scanString(text, i, line); continue; }
      i = this.scanSymbol(text, i, line, col);
    }
  }

  scanWord(text, start, line) {
    let j = start;
    while (j < text.length && IDENT_PART.test(text[j])) j++;
    let raw = text.slice(start, j);
    let norm = normalize(raw);
    if (norm === 'ΜΕ') {
      const m = normalize(text.slice(j)).match(STEP_WORDS);
      if (m) {
        j += m[0].length;
        raw = text.slice(start, j);
        norm = 'ΜΕ_ΒΗΜΑ';
      }
    }
    const length = j - start;
    if (this.dialect.keywords.has(norm)) {
      this.tokens.push(makeToken(TokenType.KEYWORD, norm, line, start + 1, { text: raw, length }));
    } else {
      if (GREEK.test(raw) && LATIN.test(raw)) {
        this.warnings.push(warning('W_MIXED_SCRIPT', { line, col: start + 1, length }, { name: raw }));
      }
      this.tokens.push(makeToken(TokenType.IDENT, raw, line, start + 1, { norm, length }));
    }
    return j;
  }

  scanNumber(text, start, line) {
    const decimal = this.dialect.decimal === 'comma' ? ',' : '.';
    const other = decimal === ',' ? '.' : null;
    let j = start;
    while (j < text.length && DIGIT.test(text[j])) j++;
    let isInt = true;
    // Ψηφίο, διαχωριστικό, ψηφίο χωρίς κενό: δεκαδικός αριθμός. Το «..» είναι περιοχή τιμών.
    if (text[j] === decimal && text[j + 1] !== '.') {
      if (DIGIT.test(text[j + 1] || '')) {
        j++;
        while (j < text.length && DIGIT.test(text[j])) j++;
        isInt = false;
      } else if (decimal === '.') {
        throw new GlossaError('L_BAD_NUMBER', { line, col: start + 1, length: j - start + 1 }, { text: text.slice(start, j + 1) });
      }
    } else if (other && text[j] === other && DIGIT.test(text[j + 1] || '')) {
      let k = j + 1;
      while (k < text.length && DIGIT.test(text[k])) k++;
      throw new GlossaError('L_DECIMAL_SEPARATOR', { line, col: start + 1, length: k - start }, {
        text: text.slice(start, k), fixed: text.slice(start, k).replace(other, decimal),
      });
    }
    const raw = text.slice(start, j);
    const value = Number(raw.replace(',', '.'));
    this.tokens.push(makeToken(TokenType.NUMBER, value, line, start + 1, { isInt, text: raw, length: raw.length }));
    return j;
  }

  scanString(text, start, line) {
    const open = text[start];
    const close = this.dialect.quotes[open];
    if (!close) {
      throw new GlossaError('L_WRONG_QUOTES', { line, col: start + 1, length: 1 }, {
        quote: open, expected: this.dialect.quoteName, sample: this.dialect.quoteSample, language: this.dialect.label,
      });
    }
    let j = start + 1;
    while (j < text.length && text[j] !== close && text[j] !== open) j++;
    if (j >= text.length) {
      throw new GlossaError('L_UNTERMINATED_STRING', { line, col: start + 1, length: text.length - start }, { sample: this.dialect.quoteSample });
    }
    this.tokens.push(makeToken(TokenType.STRING, text.slice(start + 1, j), line, start + 1, { length: j - start + 1 }));
    return j + 1;
  }

  scanSymbol(text, i, line, col) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (two === ':=') throw new GlossaError('L_PASCAL_ASSIGN', { line, col, length: 2 });
    if (two === '==') throw new GlossaError('L_DOUBLE_EQUALS', { line, col, length: 2 });
    if (TWO_CHAR_OPS.has(two)) {
      this.tokens.push(makeToken(TokenType.OP, two, line, col, { length: 2 }));
      return i + 2;
    }
    if (this.dialect.symbolAliases[ch]) {
      this.tokens.push(makeToken(TokenType.OP, this.dialect.symbolAliases[ch], line, col, { length: 1 }));
      return i + 1;
    }
    if (this.dialect.foreignSymbols[ch]) {
      throw new GlossaError('L_FOREIGN_SYMBOL', { line, col, length: 1 }, {
        char: ch, replacement: this.dialect.foreignSymbols[ch], language: this.dialect.label,
      });
    }
    if (ONE_CHAR_OPS.has(ch)) {
      this.tokens.push(makeToken(TokenType.OP, ch, line, col, { length: 1 }));
      return i + 1;
    }
    throw new GlossaError('L_BAD_CHAR', { line, col, length: 1 }, { char: ch });
  }
}
