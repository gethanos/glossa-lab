// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Σημείο εκκίνησης της εφαρμογής.
import { App } from './ui/app.js';

function boot() {
  window.glossaApp = new App();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
