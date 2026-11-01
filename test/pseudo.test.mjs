// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Ψευδογλώσσα και διαφορές από τη ΓΛΩΣΣΑ, σύμφωνα με τη θεωρία των βιβλίων.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProgram, program as H } from './helpers.mjs';
import { detectDialect } from '../src/core/dialects.js';

const A = (body, name = 'Τεστ') => `Αλγόριθμος ${name}\n${body}\nΤέλος ${name}`;
const run = (body, inputs = []) => runProgram(A(body), inputs, 'pseudo');

test('αναγνώριση γλώσσας από την πρώτη λέξη', () => {
  assert.equal(detectDialect('! σχόλιο\nΑλγόριθμος Χ'), 'pseudo');
  assert.equal(detectDialect('ΠΡΟΓΡΑΜΜΑ Χ'), 'glossa');
  assert.equal(detectDialect('x ← 1'), null);
});

test('δεκαδικό κόμμα χωρίς κενό, διαχωριστικό με κενό', () => {
  assert.deepEqual(run('Εμφάνισε 2,5 * 2, 1,25').output, ['5 1,25']);
  assert.equal(run('x ← 3.5').errors[0], 'L_DECIMAL_SEPARATOR');
});

test('εισαγωγικά ανά γλώσσα', () => {
  assert.equal(run("Εμφάνισε 'α'").errors[0], 'L_WRONG_QUOTES');
  assert.equal(runProgram(H('ΓΡΑΨΕ "α"')).errors[0], 'L_WRONG_QUOTES');
  assert.deepEqual(runProgram(H('ΓΡΑΨΕ ‘α’')).output, ['α']);
});

test('ελεύθερη διατύπωση και ορθογραφικά λάθη εντολών', () => {
  assert.equal(run('Εκτέλεσε τον υπολογισμό').errors[0], 'P_FREE_TEXT');
  const typo = run('Εμφανισ 1');
  assert.equal(typo.errors[0], 'S_UNKNOWN_STATEMENT');
  assert.equal(typo.firstError.params.suggestion, 'Εμφάνισε');
});

test('η συνθήκη περιέχει σύγκριση', () => {
  assert.equal(run('β ← Αληθής\nΑν β τότε Εμφάνισε 1').errors[0], 'P_CONDITION_NO_RELATION');
  assert.deepEqual(run('β ← Αληθής\nΑν β = Αληθής τότε Εμφάνισε 1').output, ['1']);
});

test('Αν σε μία γραμμή, μόνο του και σε αλυσίδα', () => {
  assert.deepEqual(run('a ← -2\nΑν a < 0 τότε a ← a * (-1)\nΕμφάνισε a').output, ['2']);
  const chain = 'Αν a = 1 τότε Εμφάνισε "Α"\nαλλιώς_αν a = 2 τότε Εμφάνισε "Β"\nαλλιώς Εμφάνισε "?"\nΤέλος_αν';
  assert.deepEqual(run(`a ← 2\n${chain}`).output, ['Β']);
  assert.equal(run('a ← 1\nΑν a > 0 τότε Για i από 1 μέχρι 2\nΤέλος_επανάληψης').errors[0], 'P_INLINE_BLOCK');
});

test('επανάληψη μέχρις ότου με τις γραφές της Β΄ και της Γ΄', () => {
  assert.deepEqual(run('i ← 0\nΕπανάλαβε\n  i ← i + 1\nΜέχρις_ότου i ≥ 3\nΕμφάνισε i').output, ['3']);
  assert.deepEqual(run('i ← 0\nΑρχή_επανάληψης\n  i ← i + 2\nΜέχρις_ότου i ≥ 3\nΕμφάνισε i').output, ['4']);
});

test('div και mod μόνο με θετικούς ακέραιους', () => {
  assert.deepEqual(run('Εμφάνισε 17 div 5, 17 mod 5, 6 / 3 div 1').output, ['3 2 2']);
  assert.equal(run('x ← -4 mod 3\nΕμφάνισε x').runtime.code, 'R_DIVMOD_POSITIVE');
});

test('βήμα 0 στο Για: ατέρμων βρόχος ή καμία επανάληψη', () => {
  assert.equal(run('Για i από 1 μέχρι 3 με_βήμα 0\n  x ← i\nΤέλος_επανάληψης\nΕμφάνισε x').runtime.code, 'R_INFINITE_LOOP');
  assert.deepEqual(run('Για i από 5 μέχρι 3 με_βήμα 0\n  Εμφάνισε i\nΤέλος_επανάληψης\nΕμφάνισε "τέλος"').output, ['τέλος']);
});

test('λογάριθμοι: ΛΟΓ δεκαδικός, ΛΝ φυσικός', () => {
  assert.deepEqual(run('Εμφάνισε ΛΟΓ(1000), ΛΝ(1)').output, ['3 0']);
});

test('Δεδομένα (και πίνακας) και Αποτελέσματα του κύριου αλγορίθμου', () => {
  const src = 'Δεδομένα // Β, ν //\nμ ← Β[1]\nΓια i από 2 μέχρι ν\n  Αν Β[i] > μ τότε μ ← Β[i]\nΤέλος_επανάληψης\nΑποτελέσματα // μ //';
  assert.deepEqual(run(src, ['4 9,5 2', '3']).output, ['μ = 9,5']);
});

test('Κάλεσε: αντιστοίχιση σε Δεδομένα και Αποτελέσματα', () => {
  const sub = '\nΑλγόριθμος Διπλάσιο\nΔεδομένα // x //\ny ← 2 * x\nΑποτελέσματα // y //\nΤέλος Διπλάσιο';
  const ok = runProgram(`${A('Κάλεσε Διπλάσιο(21, z)\nΕμφάνισε z')}${sub}`, [], 'pseudo');
  assert.deepEqual(ok.output, ['42']);
  assert.equal(runProgram(`${A('Κάλεσε Διπλάσιο(21)\nΕμφάνισε 1')}${sub}`, [], 'pseudo').errors[0], 'P_CALL_ARGS');
  assert.equal(runProgram(`${A('Κάλεσε Διπλάσιο(21, 3 + 1)')}${sub}`, [], 'pseudo').errors[0], 'P_OUTPUT_ARG');
  assert.equal(runProgram(`${A('z ← Διπλάσιο(21)\nΕμφάνισε z')}${sub}`, [], 'pseudo').errors[0], 'P_ALGORITHM_IN_EXPRESSION');
  assert.equal(run('Κάλεσε Άγνωστος(1)').errors[0], 'P_UNKNOWN_ALGORITHM');
});

test('αλφαριθμητική σύγκριση: μόνο τα κεφαλαία ελληνικά δεν προειδοποιούνται', () => {
  const valid = run(`Αν "ΑΒΓ" < "ΑΒΔ" τότε
  Εμφάνισε "ναι"
αλλιώς
  Εμφάνισε "όχι"
Τέλος_αν`);
  assert.deepEqual(valid.output, ['ναι']);
  assert.ok(!valid.warnings.includes('W_PSEUDO_STRING_ALPHABET'));
});

test('αλφαριθμητική σύγκριση: δέχεται ακριβώς τα 24 κεφαλαία ελληνικά γράμματα', () => {
  const alphabet = String.fromCodePoint(
    ...Array.from({ length: 17 }, (_, i) => 0x0391 + i),
    ...Array.from({ length: 7 }, (_, i) => 0x03a3 + i),
  );
  const valid = run(`Αν "${alphabet}" = "${alphabet}" τότε
  Εμφάνισε "ναι"
αλλιώς
  Εμφάνισε "όχι"
Τέλος_αν`);
  assert.deepEqual(valid.output, ['ναι']);
  assert.ok(!valid.warnings.includes('W_PSEUDO_STRING_ALPHABET'));
});

test('αλφαριθμητική σύγκριση: U+03A2, Ϊ και Ϋ είναι εκτός του αλφαβήτου', () => {
  for (const ch of ['\u03a2', 'Ϊ', 'Ϋ']) {
    const r = run(`Αν "${ch}" = "${ch}" τότε
  Εμφάνισε "ναι"
αλλιώς
  Εμφάνισε "όχι"
Τέλος_αν`);
    assert.ok(r.warnings.includes('W_PSEUDO_STRING_ALPHABET'), `U+${ch.codePointAt(0).toString(16)}`);
    assert.deepEqual(r.output, ['ναι']);
  }
});

test('αλφαριθμητική σύγκριση: πεζά, τονισμένα και λατινικά δίνουν warning χωρίς αλλαγή εκτέλεσης', () => {
  for (const [left, right] of [['ΑβΓ', 'ΑΒΓ'], ['ΆΒΓ', 'ΑΒΓ'], ['ABC', 'ABC']]) {
    const r = run(`Αν "${left}" = "${right}" τότε
  Εμφάνισε "ναι"
αλλιώς
  Εμφάνισε "όχι"
Τέλος_αν`);
    assert.ok(r.warnings.includes('W_PSEUDO_STRING_ALPHABET'), `${left}/${right}`);
    assert.equal(r.warnings.filter((code) => code === 'W_PSEUDO_STRING_ALPHABET').length, 1);
    assert.equal(r.errors.length, 0);
    assert.equal(r.runtime, null);
    assert.deepEqual(r.output, [left === right ? 'ναι' : 'όχι']);
  }
});

test('πεζά, τονισμένα και λατινικά κείμενα μπορούν να ανατεθούν χωρίς warning', () => {
  const r = run(`s ← "αβγ"
t ← "Άλφα"
u ← "abc"
Εμφάνισε s, t, u`);
  assert.deepEqual(r.output, ['αβγ Άλφα abc']);
  assert.ok(!r.warnings.includes('W_PSEUDO_STRING_ALPHABET'));
});

test('warning αλφαβήτου εμφανίζεται στη σύγκριση μεταβλητών με γνωστές τιμές', () => {
  const r = run(`s ← "abc"
Αν s = "ABC" τότε
  Εμφάνισε "ναι"
αλλιώς
  Εμφάνισε "όχι"
Τέλος_αν`);
  assert.ok(r.warnings.includes('W_PSEUDO_STRING_ALPHABET'));
  assert.deepEqual(r.output, ['όχι']);
});

test('warning αλφαβήτου δεν μπορεί να κρίνει τιμή μεταβλητής που διαβάζεται δυναμικά', () => {
  const r = run(`Διάβασε s
Αν s = "ΑΒΓ" τότε
  Εμφάνισε "ναι"
αλλιώς
  Εμφάνισε "όχι"
Τέλος_αν`, ['abc']);
  assert.ok(!r.warnings.includes('W_PSEUDO_STRING_ALPHABET'));
  assert.deepEqual(r.output, ['όχι']);
});

test('Επίλεξε παραμένει διαθέσιμο και προειδοποιεί για την ύλη της Β΄ Λυκείου', () => {
  const r = run(`Διάβασε χ
Επίλεξε χ
  Περίπτωση 1
    Εμφάνισε "ένα"
  Περίπτωση 2
    Εμφάνισε "δύο"
  Περίπτωση αλλιώς
    Εμφάνισε "άλλο"
Τέλος_επιλογών`, ['2']);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.includes('P_OUT_OF_CURRICULUM'));
  assert.deepEqual(r.output, ['δύο']);
});

test('αποτέλεσμα που δεν πήρε τιμή', () => {
  const sub = '\nΑλγόριθμος Θετικό\nΔεδομένα // x //\nΑν x > 0 τότε y ← x\nΑποτελέσματα // y //\nΤέλος Θετικό';
  assert.equal(runProgram(`${A('Κάλεσε Θετικό(-1, z)\nΕμφάνισε z')}${sub}`, [], 'pseudo').runtime.code, 'R_RESULT_UNSET');
});

test('πίνακες χωρίς δήλωση: ασυνεπής χρήση', () => {
  assert.equal(run('Α[1] ← 1\nΑ[1, 2] ← 2').errors[0], 'P_ARRAY_USAGE');
  assert.equal(run('Α[1] ← 1\nΕμφάνισε Α').errors[0], 'M_ARRAY_NO_INDEX');
  assert.equal(run('Α[0] ← 1').runtime.code, 'R_INDEX_POSITIVE');
});

test('προειδοποιήσεις για πιθανά ορθογραφικά λάθη σε ονόματα', () => {
  const r = run('σύνολο ← 0\nσύνολο ← σύνολο + 1\nΕμφάνισε συνλο');
  assert.ok(r.warnings.includes('W_NEVER_ASSIGNED'));
  assert.ok(runProgram('Αλγόριθμος Α\nx ← 1\nΕμφάνισε x\nΤέλος Β', [], 'pseudo').warnings.includes('W_END_NAME'));
});

test('ΓΛΩΣΣΑ: ΜΕ ΒΗΜΑ με κενό, όπως στη σύνταξη του βιβλίου', () => {
  assert.deepEqual(runProgram(H('ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 5 ΜΕ ΒΗΜΑ 2\n  ΓΡΑΨΕ i\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ')).output, ['1', '3', '5']);
});

test('ΓΛΩΣΣΑ: σύμβολα της ψευδογλώσσας δεν γίνονται δεκτά', () => {
  assert.equal(runProgram(H('ΑΝ x ≤ 1 ΤΟΤΕ\nΤΕΛΟΣ_ΑΝ')).errors[0], 'L_FOREIGN_SYMBOL');
});

test('ΓΛΩΣΣΑ: εκχώρηση μόνο ίδιου τύπου, ΔΙΑΒΑΣΕ και ΓΙΑ δέχονται ακέραιο σε πραγματική', () => {
  assert.equal(runProgram(H('r <- 5')).errors[0], 'M_TYPE_ASSIGN');
  assert.deepEqual(runProgram(H('r <- 5.0\nΓΡΑΨΕ r')).output, ['5']);
  assert.deepEqual(runProgram(H('ΔΙΑΒΑΣΕ r\nΓΡΑΨΕ r'), ['4']).output, ['4']);
  assert.deepEqual(runProgram(H('ΓΙΑ r ΑΠΟ 1 ΜΕΧΡΙ 2 ΜΕ_ΒΗΜΑ 0.5\n  ΓΡΑΨΕ r\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', 'ΠΡΑΓΜΑΤΙΚΕΣ: r')).output, ['1', '1.5', '2']);
});

test('ΓΛΩΣΣΑ: αλλαγή μετρητή μέσα στο ΓΙΑ είναι προειδοποίηση', () => {
  const r = runProgram(H('ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 5\n  i <- i + 1\n  ΓΡΑΨΕ i\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.includes('W_FOR_COUNTER_CHANGED'));
});

test('μηνύματα στη γλώσσα του κώδικα', () => {
  assert.match(run('x ← 3.5').firstError.message, /ψευδογλώσσα/);
  assert.match(runProgram(H('x := 1')).firstError.message, /ΓΛΩΣΣΑ/);
});
