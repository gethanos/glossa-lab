// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Τυπικά λάθη μαθητών: κάθε περίπτωση πρέπει να δίνει τον σωστό κωδικό λάθους.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe as describeError } from '../src/core/errors.js';
import { runProgram, program as H } from './helpers.mjs';
import { compile } from '../src/core/compiler.js';
import { createInterpreter } from '../src/core/runtime.js';

const SUB_GLOBAL = 'ΠΡΟΓΡΑΜΜΑ Τ\nΜΕΤΑΒΛΗΤΕΣ\n ΑΚΕΡΑΙΕΣ: x\nΑΡΧΗ\n x <- 1\n ΚΑΛΕΣΕ Π\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ\nΔΙΑΔΙΚΑΣΙΑ Π\nΑΡΧΗ\n ΓΡΑΨΕ x\nΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ';
const FUNC_NO_RESULT = 'ΠΡΟΓΡΑΜΜΑ Τ\nΜΕΤΑΒΛΗΤΕΣ\n ΑΚΕΡΑΙΕΣ: x\nΑΡΧΗ\n x <- Φ(2)\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ\nΣΥΝΑΡΤΗΣΗ Φ(α): ΑΚΕΡΑΙΑ\nΜΕΤΑΒΛΗΤΕΣ\n ΑΚΕΡΑΙΕΣ: α\nΑΡΧΗ\n ΑΝ α > 5 ΤΟΤΕ\n  Φ <- 1\n ΤΕΛΟΣ_ΑΝ\nΤΕΛΟΣ_ΣΥΝΑΡΤΗΣΗΣ';

// [όνομα, κώδικας, αναμενόμενος κωδικός, είσοδος]
const COMPILE_ERRORS = [
  ['εκχώρηση με =', H('x = 5'), 'S_ASSIGN_WITH_EQUALS'],
  ['εκχώρηση με :=', H('x := 5'), 'L_PASCAL_ASSIGN'],
  ['σύγκριση με ==', H('ΑΝ x == 1 ΤΟΤΕ\nΤΕΛΟΣ_ΑΝ'), 'L_DOUBLE_EQUALS'],
  ['λείπει το ΤΟΤΕ', H('ΑΝ x > 1\n  y <- 1\nΤΕΛΟΣ_ΑΝ'), 'S_EXPECTED'],
  ['ΑΝ χωρίς ΤΕΛΟΣ_ΑΝ', H('x <- 1\nΑΝ x > 1 ΤΟΤΕ\n  y <- 1'), 'S_WRONG_END'],
  ['λάθος κλείσιμο ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ', H('ΑΡΧΗ_ΕΠΑΝΑΛΗΨΗΣ\n  x <- 1\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'), 'S_WRONG_END'],
  ['ορθογραφικό λάθος εντολής', H('ΓΡΑΠΣΕ x'), 'S_UNKNOWN_STATEMENT'],
  ['ΤΕΛΟΣ ΑΝ με κενό', H('x <- 1\nΑΝ x > 1 ΤΟΤΕ\n x <- 2\nΤΕΛΟΣ ΑΝ'), 'S_UNKNOWN_STATEMENT'],
  ['ΑΛΛΙΩΣ ΑΝ με κενό', H('x <- 1\nΑΝ x > 1 ΤΟΤΕ\n x <- 2\nΑΛΛΙΩΣ ΑΝ x < 0 ΤΟΤΕ\n x <- 3\nΤΕΛΟΣ_ΑΝ'), 'S_EXPECTED'],
  ['ελλιπής σύγκριση μετά το ΚΑΙ', H('x <- 1\nΑΝ x > 0 ΚΑΙ < 10 ΤΟΤΕ\nΤΕΛΟΣ_ΑΝ'), 'S_EXPECTED'],
  ['ΓΙΑ με βέλος', H('ΓΙΑ i <- 1 ΜΕΧΡΙ 3\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'), 'S_EXPECTED'],
  ['ανοιχτά εισαγωγικά', H("ΓΡΑΨΕ 'abc"), 'L_UNTERMINATED_STRING'],
  ['διαδικασία χωρίς ΚΑΛΕΣΕ', H('Κάτι(x)'), 'S_PROC_WITHOUT_CALL'],
  ['χωρίς ΠΡΟΓΡΑΜΜΑ', 'x <- 1', 'S_MISSING_PROGRAM'],
  ['χωρίς ΜΕΤΑΒΛΗΤΕΣ', 'ΠΡΟΓΡΑΜΜΑ α\nΑΚΕΡΑΙΕΣ: x\nΑΡΧΗ\nx <- 1\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ', 'S_EXPECTED'],
  ['αδήλωτη μεταβλητή', H('χ <- 1'), 'M_UNDECLARED'],
  ['πραγματική τιμή σε ακέραια', H('x <- 10 / 2'), 'M_TYPE_ASSIGN'],
  ['κείμενο + κείμενο', H("s <- 'a' + 'b'"), 'M_OPERAND_TYPE'],
  ['DIV σε πραγματικό', H('r <- 2.5\nx <- r DIV 2'), 'M_OPERAND_TYPE'],
  ['μη λογική συνθήκη', H('x <- 1\nΑΝ x ΤΟΤΕ\nΤΕΛΟΣ_ΑΝ'), 'M_CONDITION_TYPE'],
  ['ίδιος μετρητής σε εμφωλευμένα ΓΙΑ', H('ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 5\n  ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 3\n  ΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'), 'M_FOR_COUNTER'],
  ['πίνακας χωρίς δείκτη', H('ΓΡΑΨΕ Α', 'ΑΚΕΡΑΙΕΣ: Α[3]'), 'M_ARRAY_NO_INDEX'],
  ['δείκτης σε παρενθέσεις', H('x <- Α(2)', 'ΑΚΕΡΑΙΕΣ: Α[3], x'), 'S_EXPECTED'],
  ['όνομα ίδιο με το πρόγραμμα', H('x <- 1', 'ΑΚΕΡΑΙΕΣ: x, Τεστ'), 'M_RESERVED_NAME'],
  ['μεταβλητή του κυρίου μέσα σε διαδικασία', SUB_GLOBAL, 'M_UNDECLARED'],
];

const RUNTIME_ERRORS = [
  ['ατέρμων βρόχος', H('i <- 1\nΟΣΟ i < 5 ΕΠΑΝΑΛΑΒΕ\n  x <- i\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ'), 'R_INFINITE_LOOP'],
  ['διαίρεση με μηδέν', H('x <- 0\ny <- 5 DIV x'), 'R_DIVISION_BY_ZERO'],
  ['δείκτης εκτός ορίων', H('ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 4\n  Α[i] <- i\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', 'ΑΚΕΡΑΙΕΣ: Α[3], i'), 'R_INDEX_RANGE'],
  ['ρίζα αρνητικού', H('r <- Τ_Ρ(-4)'), 'R_MATH_DOMAIN'],
  ['μεταβλητή χωρίς τιμή', H('ΓΡΑΨΕ y\ny <- 1', 'ΑΚΕΡΑΙΕΣ: y'), 'R_UNINITIALIZED'],
  ['συνάρτηση χωρίς αποτέλεσμα', FUNC_NO_RESULT, 'R_FUNCTION_NO_RESULT'],
];

for (const [name, source, code] of COMPILE_ERRORS) {
  test(`λάθος μεταγλώττισης: ${name}`, () => {
    const r = runProgram(source);
    assert.equal(r.errors[0], code);
    const text = describeError(r.firstError);
    assert.ok(text.title && text.explain, 'κάθε λάθος έχει τίτλο και εξήγηση');
  });
}

for (const [name, source, code] of RUNTIME_ERRORS) {
  test(`λάθος εκτέλεσης: ${name}`, () => {
    const r = runProgram(source);
    assert.deepEqual(r.errors, []);
    assert.equal(r.runtime?.code, code);
    assert.ok(describeError(r.runtime).fix !== undefined);
  });
}

test('προτάσεις «μήπως εννοούσες»', () => {
  assert.equal(runProgram(H('x <- 1\nΑΝ x > 1 ΤΟΤΕ\nΤΕΛΟΣ ΑΝ')).firstError.params.suggestion, 'ΤΕΛΟΣ_ΑΝ');
  assert.equal(runProgram(H('χ <- 1')).firstError.params.suggestion, 'x');
});

test('δείκτης εκτός ορίων μέσα σε ΚΑΙ: σημείωση για τον πλήρη υπολογισμό', () => {
  const src = H('ΓΙΑ i ΑΠΟ 1 ΜΕΧΡΙ 3\n  Α[i] <- i\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ\ni <- 1\nΟΣΟ i <= 3 ΚΑΙ Α[i] > 0 ΕΠΑΝΑΛΑΒΕ\n  i <- i + 1\nΤΕΛΟΣ_ΕΠΑΝΑΛΗΨΗΣ', 'ΑΚΕΡΑΙΕΣ: Α[3], i');
  const r = runProgram(src);
  assert.equal(r.runtime.code, 'R_INDEX_RANGE');
  assert.equal(r.runtime.params.inLogical, true);
});

test('λάθος τύπου στη διαδραστική είσοδο: η τιμή ζητείται ξανά', () => {
  const r = runProgram(H('ΔΙΑΒΑΣΕ x\nΓΡΑΨΕ x'), ['3.5', '4']);
  assert.equal(r.runtime, null);
  assert.deepEqual(r.output, ['4']);
});

test('λάθος τύπου στα «Δεδομένα εισόδου»: σφάλμα εκτέλεσης', () => {
  const c = compile(H('ΔΙΑΒΑΣΕ x'));
  const it = createInterpreter(c, { inputs: ['3.5'] });
  assert.throws(() => [...it.run()], (err) => err.code === 'R_INPUT_TYPE');
});

test('προειδοποιήσεις', () => {
  assert.ok(runProgram(H('x <- 1\nΓΡΑΨΕ x', 'ΑΚΕΡΑΙΕΣ: x, y')).warnings.includes('W_UNUSED'));
  assert.ok(runProgram(H('x <- 1\nΓΡΑΨΕ x', 'ΑΚΕΡΑΙΕΣ: x, Aα')).warnings.includes('W_MIXED_SCRIPT'));
});

test('τελεστές και ενσωματωμένες συναρτήσεις', () => {
  const r = runProgram(H('x <- 2 ^ 10\nr <- 2 ^ -1\nΓΡΑΨΕ x, r, -2^2, 7 MOD 3, 17 DIV 5, Α_Μ(7.9), Α_Τ(-3), ΗΜ(30)'));
  assert.deepEqual(r.output, ['1024 0.5 -4 1 3 7 3 0.5']);
  const b = runProgram(H("b <- ΟΧΙ (1 > 2) ΚΑΙ 'αβ' < 'αγ'\nΓΡΑΨΕ b"));
  assert.deepEqual(b.output, ['ΑΛΗΘΗΣ']);
});

test('ΕΠΙΛΕΞΕ με περιοχές και συγκρίσεις', () => {
  const src = (v) => H(`x <- ${v}\nΕΠΙΛΕΞΕ x\n ΠΕΡΙΠΤΩΣΗ < 0\n  ΓΡΑΨΕ 'αρν'\n ΠΕΡΙΠΤΩΣΗ 1..5, 9\n  ΓΡΑΨΕ 'α'\n ΠΕΡΙΠΤΩΣΗ ΑΛΛΙΩΣ\n  ΓΡΑΨΕ 'άλλο'\nΤΕΛΟΣ_ΕΠΙΛΟΓΩΝ`);
  assert.deepEqual(runProgram(src('-3')).output, ['αρν']);
  assert.deepEqual(runProgram(src('9')).output, ['α']);
  assert.deepEqual(runProgram(src('7')).output, ['άλλο']);
});

test('συνέχεια γραμμής με &', () => {
  assert.deepEqual(runProgram(H("ΓΡΑΨΕ 'a',\n& 'b'")).output, ['a b']);
});

const PROC_INC = 'ΔΙΑΔΙΚΑΣΙΑ Αύξησε(x)\nΜΕΤΑΒΛΗΤΕΣ\n  ΑΚΕΡΑΙΕΣ: x\nΑΡΧΗ\n  x <- x + 1\nΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ';

test('σταθερά ως πραγματική παράμετρος διαδικασίας απορρίπτεται', () => {
  const src = `ΠΡΟΓΡΑΜΜΑ Π\nΣΤΑΘΕΡΕΣ\n  k = 5\nΑΡΧΗ\n  ΚΑΛΕΣΕ Αύξησε(k)\n  ΓΡΑΨΕ k\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ\n${PROC_INC}`;
  assert.equal(runProgram(src).errors[0], 'M_ASSIGN_CONSTANT');
});

test('διπλό όνομα τυπικής παραμέτρου απορρίπτεται', () => {
  const src = 'ΠΡΟΓΡΑΜΜΑ Π\nΜΕΤΑΒΛΗΤΕΣ\n  ΑΚΕΡΑΙΕΣ: x, y\nΑΡΧΗ\n  x <- 1\n  y <- 2\n  ΚΑΛΕΣΕ Δ(x, y)\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ\nΔΙΑΔΙΚΑΣΙΑ Δ(a, a)\nΜΕΤΑΒΛΗΤΕΣ\n  ΑΚΕΡΑΙΕΣ: a\nΑΡΧΗ\n  a <- a + 1\nΤΕΛΟΣ_ΔΙΑΔΙΚΑΣΙΑΣ';
  assert.equal(runProgram(src).errors[0], 'M_REDECLARED');
});

test('στοιχείο πίνακα ως παράμετρος διαδικασίας: χωρίς W_NEVER_ASSIGNED', () => {
  const src = `ΠΡΟΓΡΑΜΜΑ Π\nΜΕΤΑΒΛΗΤΕΣ\n  ΑΚΕΡΑΙΕΣ: A[3]\nΑΡΧΗ\n  ΚΑΛΕΣΕ Αύξησε(A[1])\n  ΓΡΑΨΕ A[1]\nΤΕΛΟΣ_ΠΡΟΓΡΑΜΜΑΤΟΣ\n${PROC_INC}`;
  assert.ok(!runProgram(src).warnings.includes('W_NEVER_ASSIGNED'));
});

test('πίνακας υπερβολικού μεγέθους: σφάλμα μεταγλώττισης, όχι εξαίρεση JavaScript', () => {
  const r = runProgram(H('x <- 1', 'ΑΚΕΡΑΙΕΣ: x, Α[65536, 65536]'));
  assert.equal(r.errors[0], 'M_ARRAY_TOO_LARGE');
});

test('συνάρτηση με τιμή μόνο σε ορισμένες διαδρομές: προειδοποίηση', () => {
  assert.ok(runProgram(FUNC_NO_RESULT).warnings.includes('W_FUNCTION_RESULT_PATH'));
});

test('ΓΛΩΣΣΑ: αλφαβητική σύγκριση ελληνικών (χωρίς πεζά/κεφαλαία, τόνους, ς=σ)', () => {
  const cmp = (expr) => runProgram(H(`b <- ${expr}\nΓΡΑΨΕ b`)).output[0];
  assert.equal(cmp("'β' < 'έ'"), 'ΑΛΗΘΗΣ');
  assert.equal(cmp("'Άλφα' = 'αλφα'"), 'ΑΛΗΘΗΣ');
  assert.equal(cmp("'ΜΕΤΑΣ' = 'μετας'"), 'ΑΛΗΘΗΣ');
  assert.equal(cmp("'μέτρος' = 'μετροσ'"), 'ΑΛΗΘΗΣ');
  assert.equal(cmp("'ω' > 'ψ'"), 'ΑΛΗΘΗΣ');
  assert.equal(cmp("'αβ' < 'αγ'"), 'ΑΛΗΘΗΣ');
  assert.equal(cmp("'a' = 'A'"), 'ΨΕΥΔΗΣ');
  assert.equal(cmp("'é' = 'e'"), 'ΨΕΥΔΗΣ');
});

test('ΓΛΩΣΣΑ: η σύγκριση δεν αλλάζει την αποθηκευμένη τιμή', () => {
  const r = runProgram(H("s <- 'Άλφα'\nb <- s = 'ΑΛΦΑ'\nΓΡΑΨΕ s, b", 'ΧΑΡΑΚΤΗΡΕΣ: s\n  ΛΟΓΙΚΕΣ: b'));
  assert.deepEqual(r.output, ['Άλφα ΑΛΗΘΗΣ']);
});

test('ψευδογλώσσα: η σύγκριση κειμένων παραμένει αυστηρή', () => {
  const r = runProgram('Αλγόριθμος Τ\nΑν "Α" = "α" τότε\n  Εμφάνισε 1\nαλλιώς\n  Εμφάνισε 0\nΤέλος_αν\nΤέλος Τ', [], 'pseudo');
  assert.deepEqual(r.output, ['0']);
});
