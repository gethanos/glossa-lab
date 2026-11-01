// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Εκτέλεση προγράμματος ΓΛΩΣΣΑΣ: κύριο πρόγραμμα, διαδικασίες (ΚΑΛΕΣΕ) και συναρτήσεις.
// Οι παράμετροι αντιγράφονται κατά την κλήση· στις διαδικασίες οι νέες τιμές
// επιστρέφουν στον καλούντα όταν τελειώσει η διαδικασία.
import { GlossaError } from './errors.js';
import { assignable, typeLabel } from './values.js';
import { Interpreter, change, sameValue } from './interpreter.js';
import { parseTypedInput } from './input-parse.js';

const FRAME_KIND = { Program: 'program', Function: 'function', Procedure: 'procedure' };

export class GlossaInterpreter extends Interpreter {
  *run() {
    const p = this.program;
    this.pushFrame(p, null, 'program');
    this.begin(p.beginLine);
    this.act(p.beginLine, 'start', 'Έναρξη εκτέλεσης. Οι μεταβλητές έχουν δεσμευτεί στη μνήμη, αλλά δεν έχουν ακόμη τιμή (?).');
    yield* this.block(p.body);
    yield this.pause(p.endLine);
    this.begin(p.endLine);
    this.act(p.endLine, 'end', 'Το πρόγραμμα τελείωσε κανονικά.');
    this.finished = true;
  }

  *requestValue(ref, node) {
    const type = ref.cell.type;
    const parsed = yield* this.ask(ref, node, (text) => parseTypedInput(text, type), { kind: 'value', type, typeLabel: typeLabel(type) });
    return parsed.value;
  }

  enterUnit(sub, callLine) {
    return this.pushFrame(sub, callLine, FRAME_KIND[sub.type]);
  }

  *callStatement(s, frame) {
    this.begin(s.line);
    const sub = this.analysis.subs.get(s.norm);
    const args = yield* this.evalArgs(sub, s.args, frame);
    const callee = this.enter(sub, args, s.line);
    this.act(s.line, 'call', `Κλήση της διαδικασίας ${sub.name}${this.describeArgs(sub, args)}. Η εκτέλεση μεταφέρεται στη διαδικασία.`);
    yield* this.block(sub.body);
    yield this.pause(sub.endLine);
    this.begin(sub.endLine);
    this.popFrame();
    const back = this.copyBack(sub, args, callee, s.args, frame);
    const ret = back.length ? ` Οι παράμετροι επιστρέφουν τις νέες τιμές τους: ${back.join(', ')}.` : '';
    this.act(sub.endLine, 'return', `Τέλος της διαδικασίας ${sub.name}. Η εκτέλεση επιστρέφει στη γραμμή ${s.line}.${ret}`);
  }

  *callFunction(node, frame, memo) {
    const sub = this.analysis.subs.get(node.norm);
    const args = yield* this.evalArgs(sub, node.args, frame, memo);
    const savedStmt = this.currentStmt;
    yield this.pause(sub.line);
    this.begin(sub.line);
    const callee = this.enter(sub, args, node.line);
    this.act(sub.line, 'call', `Κλήση της συνάρτησης ${sub.name}${this.describeArgs(sub, args)} από τη γραμμή ${node.line}.`);
    yield* this.block(sub.body);
    yield this.pause(sub.endLine);
    this.begin(sub.endLine);
    const result = callee.vars.get(sub.norm).value;
    if (!result) throw new GlossaError('R_FUNCTION_NO_RESULT', { line: sub.endLine, col: 1 }, { name: sub.name });
    this.popFrame();
    this.act(sub.endLine, 'return', `Η συνάρτηση ${sub.name} επιστρέφει την τιμή ${this.fmt(result, true)} στη γραμμή ${node.line}.`);
    this.currentStmt = savedStmt;
    return result;
  }

  /** Υπολογίζει τις πραγματικές παραμέτρους. Οι πίνακες περνούν ως αντίγραφο. */
  *evalArgs(sub, argNodes, frame, memo = new Map()) {
    const subScope = this.analysis.units.get(sub).scope;
    const isProcedure = sub.type === 'Procedure';
    const args = [];
    for (let i = 0; i < argNodes.length; i++) {
      const node = argNodes[i];
      const param = subScope.get(sub.params[i].norm);
      if (param.dims) {
        const cell = frame.vars.get(node.norm);
        args.push({ array: cell.array.clone(), ref: isProcedure ? { cell, indices: null, key: null, display: cell.name } : null });
      } else if (isProcedure && (node.type === 'Var' || node.type === 'Index')) {
        const ref = yield* this.reference(node, frame, memo);
        args.push({ value: this.peekRef(ref), ref });
      } else {
        args.push({ value: yield* this.eval(node, frame, memo), ref: null });
      }
    }
    return args;
  }

  /** Νέο πλαίσιο με τις τυπικές παραμέτρους. Η θεωρία απαιτεί ίδιο τύπο τυπικής και πραγματικής. */
  enter(sub, args, callLine) {
    const callee = this.enterUnit(sub, callLine);
    sub.params.forEach((p, i) => {
      const cell = callee.vars.get(p.norm);
      const a = args[i];
      if (a.array) {
        cell.array = a.array;
        return;
      }
      if (!a.value) return;
      if (!assignable(cell.type, a.value.t)) {
        throw new GlossaError('R_TYPE_ASSIGN', { line: callLine, col: 1 }, {
          name: cell.name, targetType: typeLabel(cell.type), valueType: typeLabel(a.value.t), value: this.fmt(a.value, true),
        });
      }
      cell.value = a.value;
      this.rec.changes.push(change(callee, cell, null, cell.value, cell.name));
    });
    return callee;
  }

  /** Οι παράμετροι διαδικασίας επιστρέφουν τις τιμές τους στον καλούντα. */
  copyBack(sub, args, callee, argNodes, callerFrame) {
    const back = [];
    sub.params.forEach((p, i) => {
      const a = args[i];
      if (!a.ref) return;
      const local = callee.vars.get(p.norm);
      if (local.array) {
        const target = a.ref.cell;
        const changed = local.array.entries().filter(({ indices, value }) => !sameValue(value, target.array.get(indices)));
        changed.forEach(({ indices, value }) => {
          target.array.set(indices, value);
          this.rec.changes.push(change(callerFrame, target, target.array.keyOf(indices), value, `${target.name}[${indices.join(', ')}]`));
        });
        if (changed.length) back.push(`${target.name} (${changed.length} θέσεις)`);
      } else if (local.value && !sameValue(local.value, this.peekRef(a.ref))) {
        this.store(a.ref, local.value, argNodes[i]);
        back.push(`${a.ref.display} = ${this.fmt(this.peekRef(a.ref), true)}`);
      }
    });
    return back;
  }

  describeArgs(sub, args) {
    if (!sub.params.length) return '';
    const parts = sub.params.map((p, i) => {
      const a = args[i];
      if (a.array) return `${p.name} ← πίνακας ${a.ref ? a.ref.display : ''}`.trim();
      return `${p.name} ← ${a.value ? this.fmt(a.value, true) : '?'}`;
    });
    return ` με ${parts.join(', ')}`;
  }
}
