// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// ΠΑΡΑΓΕΤΑΙ ΑΥΤΟΜΑΤΑ από το tools/brand/make_brand.py. Μην το αλλάζεις με το χέρι.
// Το εικονίδιο της εφαρμογής (σήμα στην μπάρα τίτλου, «Σχετικά», favicon).

export const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs><linearGradient id="gll" gradientUnits="userSpaceOnUse" x1="70.0" y1="108.0" x2="112.0" y2="70.0"><stop offset="0" stop-color="#48AA6C"/><stop offset=".5" stop-color="#A0CB45"/><stop offset="1" stop-color="#27A8C9"/></linearGradient><clipPath id="glclip"><rect width="128" height="128" rx="28"/></clipPath><mask id="glm" maskUnits="userSpaceOnUse" x="-8.0" y="-14.0" width="200.0" height="200.0"><rect x="-8.0" y="-14.0" width="200.0" height="200.0" fill="#fff"/><rect x="86.0" y="77.5" width="31.0" height="17.0" rx="8.5" fill="none" stroke="#000" stroke-width="11.90" transform="rotate(-45 92.0 86.0)"/></mask></defs><rect width="128" height="128" rx="28" fill="#293E84"/><path d="M27.31659375 98.0Q27.31659375 92.80079272460938 27.31659375 87.8927156982422Q27.31659375 82.984638671875 27.31659375 76.77947900390625V54.37505322265625Q27.31659375 47.89873388671875 27.31659375 42.821787109375Q27.31659375 37.74484033203125 27.31659375 32.403999999999996H72.7404482421875V48.84063330078125Q67.97702807617188 48.84063330078125 62.5756611328125 48.84063330078125Q57.17429418945312 48.84063330078125 49.846980468750004 48.84063330078125H38.470459472656245L46.321983398437496 35.45696923828125Q46.321983398437496 40.7978095703125 46.321983398437496 45.87475634765625Q46.321983398437496 50.951703125 46.321983398437496 57.4280224609375V76.77947900390625Q46.321983398437496 82.984638671875 46.321983398437496 87.8927156982422Q46.321983398437496 92.80079272460938 46.321983398437496 98.0Z" fill="#FFFFFF"/><rect x="67.0" y="77.5" width="31.0" height="17.0" rx="8.5" fill="none" stroke="url(#gll)" stroke-width="7.00" transform="rotate(-45 92.0 86.0)" mask="url(#glm)"/><rect x="86.0" y="77.5" width="31.0" height="17.0" rx="8.5" fill="none" stroke="url(#gll)" stroke-width="7.00" transform="rotate(-45 92.0 86.0)"/><rect y="116" width="128" height="12" fill="#F09127" clip-path="url(#glclip)"/></svg>';

/**
 * Το εικονίδιο με μοναδικά id (gradient, clipPath), ώστε να μπορεί να υπάρχει
 * περισσότερες από μία φορές στην ίδια σελίδα.
 * @param {string} uid πρόθεμα για τα id
 */
export function iconSvg(uid) {
  return ICON_SVG.replaceAll('id="gl', `id="${uid}`).replaceAll('url(#gl', `url(#${uid}`);
}
