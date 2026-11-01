// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Προτάσεις «μήπως εννοούσες» με απόσταση Levenshtein.
import { normalize } from './tokens.js';

export function distance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Βρίσκει την πιο κοντινή λέξη από τις υποψήφιες.
 * @param {string} word
 * @param {Iterable<string>} candidates
 */
export function closest(word, candidates) {
  const w = normalize(word);
  const limit = w.length <= 3 ? 1 : w.length <= 6 ? 2 : 3;
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = distance(w, normalize(c));
    if (d < bestD && d <= limit && d > 0) { best = c; bestD = d; }
  }
  return best;
}
