// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Ενσωματωμένες συναρτήσεις. Οι δύο γλώσσες έχουν σχεδόν τις ίδιες· διαφέρει ο ΛΟΓ:
// στη ΓΛΩΣΣΑ είναι ο φυσικός λογάριθμος, στην ψευδογλώσσα ο δεκαδικός (με ΛΝ τον φυσικό).
// Για νέα συνάρτηση αρκεί μια εγγραφή στο FUNCTIONS και στους πίνακες των γλωσσών.
import { int, real, formatNumber } from './values.js';
import { GlossaError } from './errors.js';

const RAD = Math.PI / 180;

function domain(name, value, reason, fixText) {
  return new GlossaError('R_MATH_DOMAIN', {}, { name, value: formatNumber(value), reason, fixText });
}

const FUNCTIONS = {
  'Α_Μ': {
    display: 'Α_Μ', meaning: 'επιστρέφει το ακέραιο μέρος ενός αριθμού (αποκόπτει τα δεκαδικά)',
    returns: () => 'int',
    call: (x) => int(Math.trunc(x)),
  },
  'Α_Τ': {
    display: 'Α_Τ', meaning: 'επιστρέφει την απόλυτη τιμή ενός αριθμού',
    returns: (argType) => argType,
    call: (x, argType) => (argType === 'int' ? int(Math.abs(x)) : real(Math.abs(x))),
  },
  'Τ_Ρ': {
    display: 'Τ_Ρ', meaning: 'επιστρέφει την τετραγωνική ρίζα ενός μη αρνητικού αριθμού',
    returns: () => 'real',
    call: (x) => {
      if (x < 0) throw domain('Τ_Ρ', x, 'Η τετραγωνική ρίζα αρνητικού αριθμού δεν ορίζεται στους πραγματικούς αριθμούς.', 'Έλεγξε με ΑΝ ότι η τιμή είναι >= 0 πριν υπολογίσεις τη ρίζα (π.χ. στη διακρίνουσα).');
      return real(Math.sqrt(x));
    },
  },
  'ΗΜ': {
    display: 'ΗΜ', meaning: 'επιστρέφει το ημίτονο μιας γωνίας σε μοίρες',
    returns: () => 'real',
    call: (x) => real(cleanTrig(Math.sin(x * RAD))),
  },
  'ΣΥΝ': {
    display: 'ΣΥΝ', meaning: 'επιστρέφει το συνημίτονο μιας γωνίας σε μοίρες',
    returns: () => 'real',
    call: (x) => real(cleanTrig(Math.cos(x * RAD))),
  },
  'ΕΦ': {
    display: 'ΕΦ', meaning: 'επιστρέφει την εφαπτομένη μιας γωνίας σε μοίρες',
    returns: () => 'real',
    call: (x) => {
      if (Math.abs(((x % 180) + 180) % 180 - 90) < 1e-12) {
        throw domain('ΕΦ', x, 'Η εφαπτομένη δεν ορίζεται για γωνίες 90° + κ·180°, γιατί εκεί το συνημίτονο είναι μηδέν.', 'Απόφυγε αυτές τις γωνίες ή έλεγξέ τες με ΑΝ.');
      }
      return real(cleanTrig(Math.tan(x * RAD)));
    },
  },
  LN: {
    display: 'ΛΟΓ', meaning: 'επιστρέφει τον φυσικό λογάριθμο ενός θετικού αριθμού',
    returns: () => 'real',
    call: (x) => {
      if (x <= 0) throw domain('ΛΟΓ', x, 'Ο λογάριθμος ορίζεται μόνο για θετικούς αριθμούς.', 'Έλεγξε με ΑΝ ότι η τιμή είναι > 0.');
      return real(Math.log(x));
    },
  },
  LOG10: {
    display: 'ΛΟΓ', meaning: 'επιστρέφει τον δεκαδικό λογάριθμο ενός θετικού αριθμού',
    returns: () => 'real',
    call: (x) => {
      if (x <= 0) throw domain('ΛΟΓ', x, 'Ο λογάριθμος ορίζεται μόνο για θετικούς αριθμούς.', 'Έλεγξε με ΑΝ ότι η τιμή είναι > 0.');
      return real(Math.log10(x));
    },
  },
  'Ε': {
    display: 'Ε', meaning: 'επιστρέφει τη δύναμη e^x',
    returns: () => 'real',
    call: (x) => real(Math.exp(x)),
  },
};

function cleanTrig(v) {
  return Math.abs(v) < 1e-12 ? 0 : v;
}

const pick = (map) => Object.freeze(Object.fromEntries(Object.entries(map).map(([name, key]) => [name, { ...FUNCTIONS[key], display: name }])));

const TABLES = {
  glossa: pick({ 'Α_Μ': 'Α_Μ', 'Α_Τ': 'Α_Τ', 'Τ_Ρ': 'Τ_Ρ', 'ΗΜ': 'ΗΜ', 'ΣΥΝ': 'ΣΥΝ', 'ΕΦ': 'ΕΦ', 'ΛΟΓ': 'LN', 'Ε': 'Ε' }),
  pseudo: pick({ 'Α_Μ': 'Α_Μ', 'Α_Τ': 'Α_Τ', 'Τ_Ρ': 'Τ_Ρ', 'ΗΜ': 'ΗΜ', 'ΣΥΝ': 'ΣΥΝ', 'ΕΦ': 'ΕΦ', 'ΛΟΓ': 'LOG10', 'ΛΝ': 'LN', 'Ε': 'Ε' }),
};

/** Οι ενσωματωμένες συναρτήσεις μιας γλώσσας: όνομα (κανονικοποιημένο) → ορισμός. */
export function builtinsFor(dialectId) {
  return TABLES[dialectId] || TABLES.glossa;
}
