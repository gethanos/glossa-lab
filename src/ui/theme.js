// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Φωτεινό/σκοτεινό θέμα. Χωρίς επιλογή ακολουθείται η ρύθμιση του συστήματος.
import { storage } from './storage.js';

export function initTheme(button, icons) {
  const root = document.documentElement;
  const apply = (theme) => {
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    button.innerHTML = dark ? icons.sun : icons.moon;
    button.setAttribute('aria-label', dark ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα');
    button.title = button.getAttribute('aria-label');
  };
  apply(storage.get('theme'));
  button.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    storage.set('theme', next);
    apply(next);
  });
}
