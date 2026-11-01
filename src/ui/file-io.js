// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Άνοιγμα και αποθήκευση αρχείων κειμένου στον υπολογιστή του χρήστη.
// Δεν εξαρτάται από άλλα τμήματα της εφαρμογής.

// Ο χαρακτήρας αντικατάστασης που βάζει ο αποκωδικοποιητής σε άκυρα bytes UTF-8.
const REPLACEMENT_CHAR = '\uFFFD';

const DEFAULT_TYPES = [{ description: 'Πρόγραμμα ΓΛΩΣΣΑΣ', accept: { 'text/plain': ['.glo', '.txt'] } }];

/**
 * Ζητά από τον χρήστη ένα αρχείο κειμένου.
 * Αναγνωρίζει UTF-8 και, για παλαιότερα αρχεία, την ελληνική κωδικοσελίδα Windows-1253.
 * @param {string} accept επεκτάσεις, π.χ. '.glo,.txt'
 * @returns {Promise<{ name: string, text: string } | null>} null αν ο χρήστης ακύρωσε
 */
export function openTextFile(accept = '.glo,.gls,.txt,text/plain') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      resolve(file ? { name: file.name, text: decode(await file.arrayBuffer()) } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function decode(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes(REPLACEMENT_CHAR)) return utf8;
  try {
    return new TextDecoder('windows-1253').decode(buffer);
  } catch {
    return utf8;
  }
}

/**
 * Αποθηκεύει κείμενο σε αρχείο.
 * Όπου υποστηρίζεται (Chrome, Edge σε υπολογιστή) ανοίγει παράθυρο «Αποθήκευση ως»,
 * αλλιώς κατεβάζει το αρχείο στον φάκελο λήψεων.
 * @param {string} fileName προτεινόμενο όνομα
 * @param {string} text
 * @returns {Promise<'saved' | 'downloaded' | 'cancelled'>}
 */
export async function saveTextFile(fileName, text, types = DEFAULT_TYPES) {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: fileName, types });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return 'saved';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Π.χ. μέσα σε iframe άλλου domain: συνεχίζουμε με απλή λήψη.
    }
  }
  download(fileName, text);
  return 'downloaded';
}

function download(fileName, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ασφαλές όνομα αρχείου (χωρίς χαρακτήρες που απαγορεύουν τα λειτουργικά συστήματα). */
export function safeFileName(name, extension) {
  const base = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim() || 'programma';
  return `${base}${extension}`;
}
