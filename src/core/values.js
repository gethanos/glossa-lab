// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Τιμές με τύπο: { t: 'int' | 'real' | 'str' | 'bool', v }.
// Στην ψευδογλώσσα δεν υπάρχει διάκριση ακέραιου/πραγματικού: ο τύπος 'int' σημαίνει
// απλώς «αριθμός χωρίς δεκαδικά» και χρησιμεύει για τα div, mod και τους δείκτες.
import { TYPE_LABEL } from './tokens.js';

export const int = (v) => ({ t: 'int', v });
export const real = (v) => ({ t: 'real', v });
export const str = (v) => ({ t: 'str', v });
export const bool = (v) => ({ t: 'bool', v });

export const isNumericType = (t) => t === 'int' || t === 'real';

/** Αριθμητικό αποτέλεσμα: ακέραιο αν και τα δύο μέρη είναι ακέραια. */
export function numeric(v, bothInt) {
  return bothInt && Number.isInteger(v) ? int(v) : real(v);
}

/** Αριθμός χωρίς διάκριση τύπου (ψευδογλώσσα): ακέραιος όταν δεν έχει δεκαδικά. */
export function number(v) {
  return Number.isInteger(v) ? int(v) : real(v);
}

const DYNAMIC_LABEL = { int: 'ΑΡΙΘΜΗΤΙΚΗ', real: 'ΑΡΙΘΜΗΤΙΚΗ', str: 'ΑΛΦΑΡΙΘΜΗΤΙΚΗ', bool: 'ΛΟΓΙΚΗ' };

/**
 * Το όνομα ενός τύπου για εμφάνιση.
 * @param {string} t
 * @param {'glossa'|'pseudo'} dialect στην ψευδογλώσσα: αριθμητική, αλφαριθμητική, λογική
 */
export function typeLabel(t, dialect = 'glossa') {
  if (dialect === 'pseudo') return DYNAMIC_LABEL[t] || t;
  return TYPE_LABEL[t] || t;
}

/**
 * Μορφοποίηση αριθμού χωρίς θόρυβο κινητής υποδιαστολής.
 * @param {number} n
 * @param {'glossa'|'pseudo'} dialect στην ψευδογλώσσα το δεκαδικό σημείο είναι το κόμμα
 */
export function formatNumber(n, dialect = 'glossa') {
  if (!Number.isFinite(n)) return String(n);
  const text = Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(12)));
  return dialect === 'pseudo' ? text.replace('.', ',') : text;
}

/**
 * @param {{t:string,v:any}} value
 * @param {{ quote?: boolean, dialect?: 'glossa'|'pseudo' }} opts quote: εισαγωγικά γύρω από κείμενο
 */
export function format(value, opts = {}) {
  if (!value) return '?';
  const pseudo = opts.dialect === 'pseudo';
  switch (value.t) {
    case 'int':
    case 'real': return formatNumber(value.v, opts.dialect);
    case 'bool':
      if (pseudo) return value.v ? 'Αληθής' : 'Ψευδής';
      return value.v ? 'ΑΛΗΘΗΣ' : 'ΨΕΥΔΗΣ';
    case 'str': {
      if (!opts.quote) return value.v;
      return pseudo ? `"${value.v}"` : `'${value.v}'`;
    }
    default: return String(value.v);
  }
}

/** Μπορεί τιμή τύπου from να αποθηκευτεί σε μεταβλητή τύπου to; */
export function assignable(to, from, { strict = true } = {}) {
  if (to === from) return true;
  return !strict && to === 'real' && from === 'int';
}

/** Μετατροπή ακέραιου σε πραγματικό (μόνο όπου επιτρέπεται: ΓΙΑ, ΔΙΑΒΑΣΕ). */
export function coerce(to, value) {
  if (to === 'real' && value.t === 'int') return real(value.v);
  return value;
}
