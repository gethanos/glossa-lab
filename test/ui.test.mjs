// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Έλεγχος της διεπαφής πάνω στο τελικό αρχείο dist/index.html (με jsdom).
// Απαιτεί να έχει προηγηθεί build (το «npm test» το κάνει αυτόματα).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let w; let d; let dom;
const pageErrors = [];
const $ = (s) => d.querySelector(s);
const $$ = (s) => [...d.querySelectorAll(s)];
const click = (s) => $(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const status = () => $('.status').textContent;

async function loadExample(id) {
  const sel = $('#examples');
  sel.value = id;
  sel.dispatchEvent(new w.Event('change'));
  await sleep(20);
}

async function answer(text) {
  const input = $('.prompt-input');
  assert.ok(input, 'αναμενόταν προτροπή για ΔΙΑΒΑΣΕ');
  input.value = text;
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(40);
}

before(async () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  dom = new JSDOM(html, {
    url: 'https://vle.cited.gr/apps/glossa-lab/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addEventListener() {} });
      win.URL.createObjectURL = () => 'blob:test';
      win.URL.revokeObjectURL = () => {};
      win.addEventListener('error', (e) => pageErrors.push(e.message));
      win.console.error = (...a) => pageErrors.push(a.join(' '));
    },
  });
  w = dom.window;
  d = w.document;
  await sleep(50);
});

after(() => {
  assert.deepEqual(pageErrors, [], 'σφάλματα JavaScript στη σελίδα');
  dom.window.close();
});

test('φορτώνει χωρίς λάθη και με όλα τα παραδείγματα', () => {
  assert.equal($('#diag-chip').textContent, 'Χωρίς λάθη');
  assert.ok($$('#examples option').length > 10);
});

test('η φόρτωση παραδείγματος αδειάζει τα «Δεδομένα εισόδου»', async () => {
  $('#inputs').value = '1\n2';
  await loadExample('grades');
  assert.equal($('#inputs').value, '');
  assert.equal($('#inputs-badge').hidden, true);
});

test('το ΔΙΑΒΑΣΕ ζητά τιμή όταν δεν υπάρχουν δεδομένα εισόδου', async () => {
  await loadExample('grades');
  click('#btn-run');
  await sleep(50);
  assert.match($('.prompt-label').textContent, /ΔΙΑΒΑΣΕ\s*β/);
  await answer('abc');
  assert.match($('.prompt-error').textContent, /δεν είναι ΠΡΑΓΜΑΤΙΚΗ/);
  await answer('17.5');
  assert.equal(status(), 'Ολοκληρώθηκε');
  assert.ok($$('.out-line').some((l) => l.textContent === 'Πολύ καλά'));
});

test('τιμές από τα «Δεδομένα εισόδου» σημειώνονται στην έξοδο', async () => {
  await loadExample('sum');
  $('#inputs').value = '5';
  click('#btn-run');
  await sleep(80);
  assert.equal(status(), 'Ολοκληρώθηκε');
  assert.ok($('.echo-source'), 'λείπει η σημείωση προέλευσης');
  assert.ok($$('.out-line').some((l) => l.textContent === 'Άθροισμα: 15'));
});

test('βηματική εκτέλεση: εξήγηση, μνήμη, βρόχοι, πίνακας τιμών', async () => {
  await loadExample('sum');
  $('#inputs').value = '5';
  for (let i = 0; i < 6; i++) { click('#btn-step'); await sleep(10); }
  assert.equal(status(), 'Σε παύση');
  assert.match($('.last-action p').textContent, /μετρητής/);
  const vars = Object.fromEntries($$('.var').map((v) => [v.querySelector('.var-name').textContent, v.querySelector('.var-box').textContent]));
  assert.deepEqual(vars, { i: '2', Ν: '5', Σ: '1' });
  assert.equal($$('.loop').length, 1);
  assert.equal($$('.trace tbody tr').length, 6);
  assert.equal($('.ln.is-next').dataset.line, '8');
  click('#btn-stop');
  await sleep(10);
});

test('σφάλμα εκτέλεσης με αναλυτική εξήγηση', async () => {
  await loadExample('bugs');
  click('#btn-run');
  await sleep(80);
  assert.equal(status(), 'Σφάλμα');
  assert.equal($('.msg-title').textContent, 'Η «Σ» δεν έχει τιμή');
  assert.ok($$('.msg-section h4').map((x) => x.textContent).includes('Πώς το διορθώνεις'));
});

test('είσοδος και έξοδος από υποπρόγραμμα', async () => {
  await loadExample('subs');
  for (let i = 0; i < 5; i++) { click('#btn-step'); await sleep(10); }
  assert.match($('.frame-head h3').textContent, /Συνάρτηση Μέγιστο/);
  click('#btn-out');
  await sleep(20);
  assert.equal($$('.frame').length, 1);
  click('#btn-stop');
});

test('σήμα εφαρμογής και favicon, χωρίς διπλά id', () => {
  assert.ok($('#brand-mark svg'), 'λείπει το σήμα στην μπάρα τίτλου');
  assert.match($('link[rel="icon"]').href, /^data:image\/svg\+xml,/);
  const ids = $$('[id]').map((e) => e.id);
  assert.equal(ids.length, new Set(ids).size, 'υπάρχουν διπλά id στη σελίδα');
  assert.equal($('.brand-site').getAttribute('href'), 'https://vle.cited.gr/apps');
});

test('παράθυρο «Σχετικά» με τα στοιχεία δημιουργού και άδειας', () => {
  click('#btn-about');
  const dlg = $('dialog.about');
  assert.ok(dlg.hasAttribute('open'));
  assert.match(dlg.textContent, /Αθανάσιος-Αντώνιος Γεωργαλάς/);
  assert.match(dlg.textContent, /MIT/);
  assert.ok(dlg.querySelector('a[href="mailto:info@cited.gr"]'));
  assert.ok(dlg.querySelector('a[href="https://github.com/gethanos/glossa-lab"]'));
  assert.ok(dlg.querySelector('.brand-mark svg'));
});

async function typeInEditor(text) {
  const ta = $('.code-input');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new w.InputEvent('input', { inputType: 'insertText', data: text.slice(-1), bubbles: true }));
  await sleep(10);
}

test('αυτόματη συμπλήρωση: η λίστα ζει στο body και διαχειρίζεται την επιλογή', async () => {
  await loadExample('sum');
  await typeInEditor('\nΓΙ');
  const popup = $('body > .ac-popup');
  assert.ok(popup && !popup.hidden, 'η λίστα δεν άνοιξε');
  const rows = [...popup.querySelectorAll('.ac-item')];
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].getAttribute('aria-selected'), 'true');
  $('.code-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(rows[1].getAttribute('aria-selected'), 'true');
  $('.code-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(popup.hidden, true);
});

test('αποθήκευση: χρησιμοποιεί το όνομα του προγράμματος', async () => {
  await loadExample('sum');
  let downloaded = null;
  const orig = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function click() { downloaded = this.download; };
  click('#btn-save');
  await sleep(20);
  w.HTMLAnchorElement.prototype.click = orig;
  assert.equal(downloaded, 'Άθροισμα.glo');
});

test('καθαρισμός: αδειάζει τον κώδικα και επαναφέρει τις προβολές', async () => {
  await loadExample('sum');
  $('#inputs').value = '5';
  click('#btn-run');
  await sleep(60);
  click('#btn-clear');
  await sleep(20);
  assert.equal($('.code-input').value, '');
  assert.equal($('#output .empty') !== null, true);
  assert.equal($('#memory .empty') !== null, true);
  assert.equal($('.status').textContent, 'Έτοιμο');
});

test('SEO: ετικέτες head, δομημένα δεδομένα, noscript', () => {
  assert.match(d.title, /ΓΛΩΣΣΑ Lab/);
  assert.ok(d.title.length <= 60, 'ο τίτλος ξεπερνά τους 60 χαρακτήρες');
  const desc = $('meta[name="description"]').content;
  assert.ok(desc.length >= 70 && desc.length <= 160, `περιγραφή ${desc.length} χαρακτήρων`);
  assert.equal($('link[rel="canonical"]').href, 'https://vle.cited.gr/apps/glossa-lab/');
  assert.equal($('meta[property="og:image"]').content, 'https://vle.cited.gr/apps/glossa-lab/social-preview.png');
  const ld = JSON.parse($('script[type="application/ld+json"]').textContent);
  assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.author.name, 'Αθανάσιος-Αντώνιος Γεωργαλάς');
  assert.ok(d.querySelector('noscript'));
  assert.equal($$('h1').length, 1);
});

test('manifest και συνοδευτικά αρχεία', () => {
  const manifest = JSON.parse(readFileSync(new URL('../dist/site.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.short_name, 'ΓΛΩΣΣΑ Lab');
  for (const icon of manifest.icons) {
    assert.ok(readFileSync(new URL(`../dist/${icon.src}`, import.meta.url)).length > 0, icon.src);
  }
});

async function selectDialect(id) {
  $(`.dialect-switch [data-dialect="${id}"]`).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(20);
}

test('διακόπτης γλώσσας: ξεχωριστό πρόχειρο, παραδείγματα και σύνδεσμος', async () => {
  await selectDialect('glossa');
  await loadExample('sum');
  const glossaCode = $('.code-input').value;
  await selectDialect('pseudo');
  assert.equal($('.dialect-switch [data-dialect="pseudo"]').getAttribute('aria-checked'), 'true');
  assert.match($('.code-input').value, /^Αλγόριθμος/);
  assert.equal(w.location.hash, '#psevdoglossa');
  assert.ok($$('#examples option').some((o) => o.value === 'p-factorial'));
  assert.ok($$('.ref-entry h4').some((x) => x.textContent.includes('Κάλεσε')));
  await selectDialect('glossa');
  assert.equal($('.code-input').value, glossaCode, 'το πρόχειρο της ΓΛΩΣΣΑΣ διατηρήθηκε');
});

test('ειδοποίηση όταν ο κώδικας είναι στην άλλη γλώσσα και μεταφορά του', async () => {
  await selectDialect('glossa');
  await loadExample('sum');
  const ta = $('.code-input');
  ta.value = 'Αλγόριθμος Χ\nΕμφάνισε 1\nΤέλος Χ';
  ta.dispatchEvent(new w.InputEvent('input', { bubbles: true }));
  await sleep(600);
  assert.equal($('#dialect-hint').hidden, false);
  $('#dialect-hint-action').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(20);
  assert.equal($('.dialect-switch [data-dialect="pseudo"]').getAttribute('aria-checked'), 'true');
  assert.match($('.code-input').value, /Εμφάνισε 1/);
  assert.equal($('#dialect-hint').hidden, true);
});

test('ψευδογλώσσα: τα Δεδομένα ζητούνται πριν την εκτέλεση και τα Αποτελέσματα εμφανίζονται', async () => {
  await selectDialect('pseudo');
  await loadExample('p-average');
  click('#btn-run');
  await sleep(40);
  assert.match($('.prompt-label').textContent, /Δεδομένα\s*Α/);
  assert.ok($('.prompt-hint'), 'οδηγία για τιμές πίνακα');
  await answer('8, 12, 4');
  assert.match($('.prompt-label').textContent, /Δεδομένα\s*ν/);
  await answer('3');
  await sleep(40);
  assert.equal(status(), 'Ολοκληρώθηκε');
  assert.ok($$('.out-line').some((l) => l.textContent === 'μο = 8'));
  assert.ok($$('.var-name').some((n) => n.textContent === 'Α'), 'ο πίνακας εμφανίζεται στη μνήμη');
  assert.ok($$('.var-type').some((n) => n.textContent === 'ΑΡΙΘΜΗΤΙΚΗ'));
});

test('ψευδογλώσσα: βηματική εκτέλεση με Κάλεσε και στοίβα κλήσεων', async () => {
  await selectDialect('pseudo');
  await loadExample('p-factorial');
  $('#inputs').value = '3';
  for (let i = 0; i < 6; i++) { click('#btn-step'); await sleep(10); }
  assert.ok($$('.frame-head h3').some((x) => /Αλγόριθμος Παραγοντικό/.test(x.textContent)));
  assert.match($('.last-action p').textContent, /Κάλεσε Παραγοντικό|συνθήκη/);
  click('#btn-stop');
  await sleep(10);
  await selectDialect('glossa');
});

test('μεγιστοποίηση του πάνελ κώδικα', async () => {
  click('#btn-maximize');
  assert.equal($('#app').dataset.maximized, 'true');
  assert.equal($('#btn-maximize').getAttribute('aria-pressed'), 'true');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal($('#app').dataset.maximized, 'false');
});

test('αυτόματη συμπλήρωση: η κύλιση της λίστας δεν επαναφέρει το ύψος της', async () => {
  await selectDialect('glossa');
  await loadExample('sum');
  await typeInEditor('\nΤ');
  const popup = $('body > .ac-popup');
  assert.ok(popup && !popup.hidden);
  popup.style.maxHeight = '120px';
  popup.dispatchEvent(new w.Event('scroll'));
  assert.equal(popup.style.maxHeight, '120px', 'η κύλιση της λίστας δεν πρέπει να την ξαναϋπολογίζει');
  $('.code-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
