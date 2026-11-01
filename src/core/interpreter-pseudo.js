// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Εκτέλεση αλγορίθμων σε ψευδογλώσσα.
//   - Ο πρώτος αλγόριθμος είναι ο κύριος. Τα Δεδομένα του ζητούνται πριν ξεκινήσει
//     και τα Αποτελέσματά του εμφανίζονται όταν τελειώσει.
//   - Κάλεσε Όνομα(ορίσματα): τα πρώτα ορίσματα δίνουν τιμές στα Δεδομένα του αλγορίθμου,
//     τα επόμενα παίρνουν, όταν τελειώσει, τις τιμές των Αποτελεσμάτων του.
//   - Οι μεταβλητές δεν έχουν δηλωμένο τύπο: το είδος τους ορίζεται από την τιμή.
import { GlossaError } from './errors.js';
import { Interpreter, change } from './interpreter.js';
import { parseDynamicInput, parseListInput } from './input-parse.js';
import { where } from './operations.js';

export class PseudoInterpreter extends Interpreter {
  *run() {
    const main = this.program.main;
    const frame = this.pushFrame(main, null, 'algorithm');
    this.begin(main.line);
    this.act(main.line, 'start', `Έναρξη εκτέλεσης του αλγορίθμου ${main.name}. Οι μεταβλητές δεν έχουν ακόμη τιμή (?)· το είδος τους (αριθμητική, αλφαριθμητική, λογική) ορίζεται από την τιμή που θα πάρουν.`);
    if (main.inputs.length) {
      yield this.pause(main.inputsLine);
      yield* this.readData(main, frame);
    }
    yield* this.block(main.body);
    if (main.outputs.length) {
      yield this.pause(main.outputsLine);
      this.begin(main.outputsLine);
      const results = this.collectResults(main, frame);
      results.forEach((r) => this.emit(`${r.name} = ${r.text}`));
      this.act(main.outputsLine, 'write', `Εμφανίζονται τα Αποτελέσματα: ${results.map((r) => `${r.name} = ${r.text}`).join(', ')}.`);
    }
    yield this.pause(main.endLine);
    this.begin(main.endLine);
    this.act(main.endLine, 'end', 'Ο αλγόριθμος τελείωσε κανονικά.');
    this.finished = true;
  }

  // ---------- Είσοδος ----------
  *requestValue(ref, node) {
    const parsed = yield* this.ask(ref, node, parseDynamicInput, { kind: 'value', typeLabel: 'αριθμός, κείμενο ή λογική τιμή' });
    return parsed.value;
  }

  /** Τιμές για τα Δεδομένα του κύριου αλγορίθμου. */
  *readData(alg, frame) {
    this.begin(alg.inputsLine);
    const parts = [];
    for (const p of alg.inputs) {
      const cell = frame.vars.get(p.norm);
      const ref = { cell, indices: null, key: null, display: cell.name };
      if (cell.array) {
        const rank = cell.array.rank;
        const sample = rank === 1 ? '8, 12, 5' : '1 2 3; 4 5 6';
        const parsed = yield* this.ask(ref, p, (t) => parseListInput(t, rank), {
          kind: 'list', rank, typeLabel: rank === 1 ? 'πίνακας' : 'πίνακας 2Δ', placeholder: sample, source: 'Δεδομένα',
        });
        parsed.rows.forEach((row, i) => row.forEach((value, j) => {
          const indices = rank === 1 ? [j + 1] : [i + 1, j + 1];
          cell.array.set(indices, value);
          this.rec.changes.push(change(frame, cell, cell.array.keyOf(indices), value, `${cell.name}[${indices.join(', ')}]`));
        }));
        parts.push(`${cell.name} = ${this.arrayText(cell.array)}`);
      } else {
        const parsed = yield* this.ask(ref, p, parseDynamicInput, { kind: 'value', typeLabel: 'Δεδομένα', source: 'Δεδομένα' });
        this.store(ref, parsed.value, p);
        parts.push(`${cell.name} = ${this.fmt(parsed.value, true)}`);
      }
    }
    this.act(alg.inputsLine, 'read', `Τα Δεδομένα πήραν τιμές: ${parts.join(', ')}.`);
  }

  arrayText(array) {
    const ext = array.extent();
    if (array.rank === 1) {
      const items = [];
      for (let i = 1; i <= ext[0]; i++) items.push(this.fmt(array.get([i]), true));
      return `[${items.join(', ')}]`;
    }
    const rows = [];
    for (let i = 1; i <= ext[0]; i++) {
      const row = [];
      for (let j = 1; j <= ext[1]; j++) row.push(this.fmt(array.get([i, j]), true));
      rows.push(row.join(' '));
    }
    return `[${rows.join('; ')}]`;
  }

  /** Οι τιμές των Αποτελεσμάτων ενός αλγορίθμου· κάθε αποτέλεσμα πρέπει να έχει πάρει τιμή. */
  collectResults(alg, frame) {
    return alg.outputs.map((p) => {
      const cell = frame.vars.get(p.norm);
      const missing = cell.array ? cell.array.entries().length === 0 : !cell.value;
      if (missing) {
        throw new GlossaError('R_RESULT_UNSET', { line: alg.outputsLine, col: p.col, length: p.length }, { name: alg.name, output: cell.name });
      }
      return {
        name: cell.name,
        array: cell.array ? cell.array.clone() : null,
        value: cell.array ? null : cell.value,
        text: cell.array ? this.arrayText(cell.array) : this.fmt(cell.value, true),
      };
    });
  }

  // ---------- Κάλεσε ----------
  *callStatement(s, frame) {
    this.begin(s.line);
    const alg = this.analysis.subs.get(s.norm);
    const memo = new Map();
    const inputArgs = [];
    for (let i = 0; i < alg.inputs.length; i++) {
      const node = s.args[i];
      const source = node.type === 'Var' ? frame.vars.get(node.norm) : null;
      if (source && source.array) inputArgs.push({ array: source.array.clone() });
      else inputArgs.push({ value: yield* this.eval(node, frame, memo) });
    }
    const outputRefs = [];
    for (let i = 0; i < alg.outputs.length; i++) {
      outputRefs.push(yield* this.reference(s.args[alg.inputs.length + i], frame, memo));
    }

    const callee = this.pushFrame(alg, s.line, 'algorithm');
    const described = alg.inputs.map((p, i) => {
      const cell = callee.vars.get(p.norm);
      const arg = inputArgs[i];
      if (Boolean(cell.array) !== Boolean(arg.array)) {
        throw new GlossaError('M_ARG_KIND', where(s.args[i]), { name: alg.name, param: p.name, expectArray: Boolean(cell.array) });
      }
      if (arg.array) {
        cell.array = arg.array;
        return `${p.name} ← πίνακας`;
      }
      this.store({ cell, indices: null, key: null, display: cell.name }, arg.value, s.args[i]);
      return `${p.name} ← ${this.fmt(arg.value, true)}`;
    });
    const withText = described.length ? ` με ${described.join(', ')}` : '';
    this.act(s.line, 'call', `${this.w('ΚΑΛΕΣΕ')} ${alg.name}${withText}. Η εκτέλεση μεταφέρεται στον αλγόριθμο ${alg.name}.`);

    yield* this.block(alg.body);
    const returnLine = alg.outputsLine || alg.endLine;
    yield this.pause(returnLine);
    this.begin(returnLine);
    const results = this.collectResults(alg, callee);
    this.popFrame();
    const back = results.map((r, i) => {
      const ref = outputRefs[i];
      if (r.array) {
        ref.cell.array = r.array;
        for (const { indices, key, value } of r.array.entries()) {
          this.rec.changes.push(change(frame, ref.cell, key, value, `${ref.cell.name}[${indices.join(', ')}]`));
        }
        return `${ref.display} ← ${r.text}`;
      }
      this.store(ref, r.value, s.args[alg.inputs.length + i]);
      return `${ref.display} ← ${r.text}`;
    });
    const ret = back.length ? ` Τα Αποτελέσματα επιστρέφουν: ${back.join(', ')}.` : '';
    this.act(returnLine, 'return', `Τέλος του αλγορίθμου ${alg.name}.${ret} Η εκτέλεση συνεχίζει μετά τη γραμμή ${s.line}.`);
  }
}
