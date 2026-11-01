// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Μετατροπή του κειμένου που πληκτρολογεί ο χρήστης σε τιμή.
import { normalize } from './tokens.js';
import { int, real, str, bool, number } from './values.js';

const NUMBER = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

function parseBoolean(text) {
  const n = normalize(text.trim());
  if (n === 'ΑΛΗΘΗΣ') return bool(true);
  if (n === 'ΨΕΥΔΗΣ') return bool(false);
  return null;
}

function unquote(text) {
  const m = text.match(/^(['"“‘])(.*)(['"”’])$/);
  return m ? m[2] : text;
}

/**
 * ΓΛΩΣΣΑ: η τιμή πρέπει να ταιριάζει στον δηλωμένο τύπο της μεταβλητής.
 * @returns {{ ok: true, value } | { ok: false, hint: string }}
 */
export function parseTypedInput(text, type) {
  const t = text.trim();
  switch (type) {
    case 'int':
      if (/^[+-]?\d+$/.test(t)) return { ok: true, value: int(parseInt(t, 10)) };
      if (/^[+-]?\d*[.,]\d+$/.test(t)) return { ok: false, hint: 'Μια ΑΚΕΡΑΙΑ μεταβλητή δεν δέχεται δεκαδικά ψηφία.' };
      return { ok: false, hint: 'Γράψε έναν ακέραιο αριθμό, π.χ. 12 ή -3.' };
    case 'real':
      if (NUMBER.test(t)) return { ok: true, value: real(parseFloat(t.replace(',', '.'))) };
      return { ok: false, hint: 'Γράψε έναν αριθμό, π.χ. 3.5 ή 12.' };
    case 'bool': {
      const b = parseBoolean(t);
      return b ? { ok: true, value: b } : { ok: false, hint: 'Οι λογικές τιμές γράφονται ΑΛΗΘΗΣ ή ΨΕΥΔΗΣ.' };
    }
    default:
      return { ok: true, value: str(unquote(t)) };
  }
}

/**
 * Ψευδογλώσσα: το είδος της τιμής προκύπτει από αυτό που γράφτηκε.
 * Αριθμός (με κόμμα ή τελεία για το δεκαδικό), Αληθής/Ψευδής, αλλιώς κείμενο.
 */
export function parseDynamicInput(text) {
  const t = text.trim();
  if (NUMBER.test(t)) return { ok: true, value: number(parseFloat(t.replace(',', '.'))) };
  const b = parseBoolean(t);
  if (b) return { ok: true, value: b };
  if (!t) return { ok: false, hint: 'Γράψε μια τιμή.' };
  return { ok: true, value: str(unquote(t)) };
}

/**
 * Τιμές πίνακα: οι θέσεις χωρίζονται με κενό ή με «κόμμα και κενό» (π.χ. 8, 12,5, 3),
 * οι γραμμές ενός δισδιάστατου πίνακα με «;».
 * @returns {{ ok: true, rows: object[][] } | { ok: false, hint: string }}
 */
export function parseListInput(text, rank) {
  const rows = text.trim().split(/\s*;\s*/).filter(Boolean).map((row) => row.split(/,\s+|\s+/).filter(Boolean));
  if (!rows.length) return { ok: false, hint: 'Γράψε τις τιμές του πίνακα, π.χ. 8, 12, 5.' };
  if (rank === 1 && rows.length > 1) return { ok: false, hint: 'Ο πίνακας είναι μονοδιάστατος: χώρισε τις τιμές με κενό ή κόμμα, όχι με «;».' };
  const parsed = rows.map((row) => row.map((cell) => parseDynamicInput(cell).value));
  return { ok: true, rows: parsed };
}
