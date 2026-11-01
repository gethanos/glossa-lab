// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
//
// Αποθήκευση πινάκων. Δύο υλοποιήσεις με κοινή διεπαφή:
//   FixedArray    ΓΛΩΣΣΑ: το μέγεθος ορίζεται στη δήλωση (Α[10], Β[3, 4]).
//   DynamicArray  ψευδογλώσσα: χωρίς δήλωση· ο πίνακας «μεγαλώνει» με τις θέσεις που παίρνουν τιμή.
// Οι θέσεις αριθμούνται από το 1. Το κλειδί (key) μιας θέσης χρησιμοποιείται για
// την επισήμανση αλλαγών στις προβολές.

export class FixedArray {
  /** @param {number[]} dims μέγεθος κάθε διάστασης */
  constructor(dims) {
    this.dims = dims;
    this.items = new Array(dims.reduce((a, b) => a * b, 1)).fill(null);
  }

  get rank() { return this.dims.length; }

  /** Μέγεθος για εμφάνιση: όλες οι θέσεις της δήλωσης. */
  extent() { return this.dims; }

  /** Είναι η θέση μέσα στα όρια της διάστασης d; */
  inRange(d, index) { return index >= 1 && index <= this.dims[d]; }

  keyOf(indices) {
    let flat = 0;
    for (let d = 0; d < indices.length; d++) flat = flat * this.dims[d] + (indices[d] - 1);
    return flat;
  }

  get(indices) { return this.items[this.keyOf(indices)]; }

  set(indices, value) { this.items[this.keyOf(indices)] = value; }

  clone() {
    const copy = new FixedArray(this.dims);
    copy.items = [...this.items];
    return copy;
  }

  /** Θέσεις με τιμή: [{ indices, key, value }]. */
  entries() {
    const out = [];
    this.items.forEach((value, key) => {
      if (!value) return;
      const indices = [];
      let rest = key;
      for (let d = this.dims.length - 1; d >= 0; d--) {
        indices.unshift((rest % this.dims[d]) + 1);
        rest = Math.floor(rest / this.dims[d]);
      }
      out.push({ indices, key, value });
    });
    return out;
  }
}

export class DynamicArray {
  /** @param {number} rank αριθμός διαστάσεων (δεικτών) */
  constructor(rank) {
    this.map = new Map();
    this.max = new Array(rank).fill(0);
  }

  get rank() { return this.max.length; }

  /** Μέγεθος για εμφάνιση: έως τη μεγαλύτερη θέση που πήρε τιμή σε κάθε διάσταση. */
  extent() { return this.max; }

  inRange(d, index) { return Number.isInteger(index) && index >= 1; }

  keyOf(indices) { return indices.join(','); }

  get(indices) { return this.map.get(this.keyOf(indices)) || null; }

  set(indices, value) {
    this.map.set(this.keyOf(indices), value);
    indices.forEach((v, d) => { if (v > this.max[d]) this.max[d] = v; });
  }

  clone() {
    const copy = new DynamicArray(this.rank);
    for (const { indices, value } of this.entries()) copy.set(indices, value);
    return copy;
  }

  entries() {
    return [...this.map].map(([key, value]) => ({ indices: key.split(',').map(Number), key, value }));
  }
}
