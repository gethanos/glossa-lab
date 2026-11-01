// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Αποθήκευση στον browser: ξεχωριστό πρόχειρο κώδικα και «Δεδομένα εισόδου» για κάθε γλώσσα,
// και η γλώσσα που χρησιμοποιήθηκε τελευταία.
import { storage } from './storage.js';
import { DEFAULT_DIALECT, DIALECTS } from '../core/dialects.js';

// Εκδόσεις πριν τη δεύτερη γλώσσα κρατούσαν ένα μόνο πρόχειρο (ΓΛΩΣΣΑ).
function migrate() {
  const legacy = storage.get('code');
  if (typeof legacy === 'string' && storage.get('code:glossa') === null) {
    storage.set('code:glossa', legacy);
    storage.set('inputs:glossa', storage.get('inputs', '') || '');
  }
}
migrate();

export const workspace = {
  dialect() {
    const saved = storage.get('dialect');
    return DIALECTS[saved] ? saved : DEFAULT_DIALECT;
  },
  setDialect(id) { storage.set('dialect', id); },
  draft(id) {
    const code = storage.get(`code:${id}`);
    return typeof code === 'string' ? code : null;
  },
  setDraft(id, code) { storage.set(`code:${id}`, code); },
  inputs(id) { return storage.get(`inputs:${id}`, '') || ''; },
  setInputs(id, text) { storage.set(`inputs:${id}`, text); },
};
