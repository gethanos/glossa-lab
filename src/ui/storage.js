// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Ασφαλής πρόσβαση στο localStorage (μπορεί να μην είναι διαθέσιμο).
const PREFIX = 'glossa-lab:';

export const storage = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* χωρίς αποθήκευση */ }
  },
};
