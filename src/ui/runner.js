// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Ελεγκτής εκτέλεσης: οδηγεί τον generator του διερμηνευτή σύμφωνα με την επιλογή
// του χρήστη (εκτέλεση, βήμα, βήμα πάνω από κλήση, έξοδος, αυτόματη) και ενημερώνει
// το περιβάλλον μέσω συμβάντων. Δεν γνωρίζει τίποτα για το DOM.
import { compile } from '../core/compiler.js';
import { createInterpreter } from '../core/runtime.js';
import { GlossaError, localize } from '../core/errors.js';

const CHUNK = 4000; // βήματα ανά «φέτα» χρόνου κατά τη γρήγορη εκτέλεση

/**
 * Συμβάντα (μέσω emit):
 *   compileFailed { result }   started { interp }   paused { line }   input { request }
 *   output { text }            queuedInput { name, text }            progress { steps }
 *   done {}                    error { error }
 *   stopped {}
 */
export class Runner {
  constructor(emit) {
    this.emit = emit;
    this.state = 'idle';
    this.breakpoints = new Set();
    this.delay = 500;
    this.interp = null;
    this.gen = null;
    this.timer = null;
    this.mode = null;
  }

  get isActive() { return this.state !== 'idle' && this.state !== 'done' && this.state !== 'error'; }

  setBreakpoints(set) { this.breakpoints = set; }

  setDelay(ms) { this.delay = ms; }

  /**
   * Μεταγλώττιση και προετοιμασία. Επιστρέφει false αν υπάρχουν λάθη.
   * @param {string} source
   * @param {string[]} inputs «Δεδομένα εισόδου»
   * @param {'glossa'|'pseudo'} dialect
   */
  prepare(source, inputs, dialect) {
    this.stop(true);
    this.dialect = dialect;
    const result = compile(source, dialect);
    if (!result.ok) {
      this.state = 'error';
      this.emit('compileFailed', { result });
      return false;
    }
    this.source = source;
    this.interp = createInterpreter(result, {
      inputs,
      onOutput: (text) => this.emit('output', { text }),
      onQueuedInput: (name, text) => this.emit('queuedInput', { name, text }),
    });
    this.gen = this.interp.run();
    this.pendingInput = undefined;
    this.lastLine = null;
    this.state = 'paused';
    this.emit('started', { interp: this.interp, result });
    return true;
  }

  // ---------- Εντολές χρήστη ----------
  run() { this.go('run'); }
  step() { this.go('step'); }
  stepOver() { this.go('over'); }
  stepOut() { this.go('out'); }
  animate() { this.go('animate'); }

  pause() {
    if (this.state !== 'running') return;
    clearTimeout(this.timer);
    this.toPaused();
  }

  stop(silent = false) {
    clearTimeout(this.timer);
    const wasActive = this.isActive;
    this.gen = null;
    this.state = 'idle';
    if (wasActive && !silent) this.emit('stopped', {});
  }

  provideInput(text) {
    if (this.state !== 'input') return;
    this.pendingInput = text;
    this.state = 'running';
    this.continue();
  }

  // ---------- Εσωτερικά ----------
  go(mode) {
    if (!this.gen || this.state === 'input') return;
    clearTimeout(this.timer);
    this.mode = mode;
    this.depthAtStart = this.currentDepth || 1;
    this.interp.resetBudget();
    this.state = 'running';
    this.firstEvent = true;
    this.continue();
  }

  continue() {
    switch (this.mode) {
      case 'run': this.runChunk(); break;
      case 'animate': this.advanceUntilPause(() => true, true); break;
      case 'over': this.advanceUntilPause((ev) => ev.depth <= this.depthAtStart); break;
      case 'out': this.advanceUntilPause((ev) => ev.depth < this.depthAtStart); break;
      default: this.advanceUntilPause(() => true); break;
    }
  }

  /** Ένα βήμα του generator. Επιστρέφει το συμβάν ή null όταν τελείωσε/σφάλμα. */
  advance() {
    let r;
    try {
      const value = this.pendingInput;
      this.pendingInput = undefined;
      r = this.gen.next(value);
    } catch (err) {
      this.fail(err);
      return null;
    }
    if (r.done) {
      this.state = 'done';
      this.emit('done', {});
      return null;
    }
    return r.value;
  }

  handleInput(ev) {
    this.state = 'input';
    this.emit('input', { request: ev.request });
  }

  runChunk() {
    for (let i = 0; i < CHUNK; i++) {
      const ev = this.advance();
      if (!ev) return;
      if (ev.type === 'input') { this.handleInput(ev); return; }
      this.currentDepth = ev.depth;
      this.lastLine = ev.line;
      if (this.breakpoints.has(ev.line) && !this.firstEvent) { this.toPaused(); return; }
      this.firstEvent = false;
    }
    this.emit('progress', { steps: this.interp.steps });
    this.timer = setTimeout(() => this.runChunk(), 0);
  }

  /**
   * Προχωρά μέχρι το επόμενο συμβάν βήματος που ικανοποιεί το κριτήριο.
   * Στην αυτόματη εκτέλεση συνεχίζει με καθυστέρηση μετά από κάθε παύση.
   */
  advanceUntilPause(accept, repeat = false) {
    for (let guard = 0; guard < 1_000_000; guard++) {
      const ev = this.advance();
      if (!ev) return;
      if (ev.type === 'input') { this.handleInput(ev); return; }
      this.currentDepth = ev.depth;
      this.lastLine = ev.line;
      const hitBreakpoint = this.breakpoints.has(ev.line) && repeat;
      if (accept(ev) || this.breakpoints.has(ev.line)) {
        if (repeat && !hitBreakpoint) {
          this.emit('paused', { line: ev.line, transient: true });
          this.timer = setTimeout(() => this.advanceUntilPause(accept, true), this.delay);
          return;
        }
        this.toPaused();
        return;
      }
    }
    this.toPaused();
  }

  toPaused() {
    this.state = 'paused';
    this.interp.resetBudget();
    this.emit('paused', { line: this.lastLine });
  }

  fail(err) {
    this.state = 'error';
    if (err instanceof GlossaError) {
      if (!err.line && this.lastLine) err.line = this.lastLine;
      localize(err, this.dialect);
      this.emit('error', { error: err });
    } else {
      // Απρόβλεπτο σφάλμα του ίδιου του διερμηνευτή: εμφανίζεται ως έχει.
      console.error(err);
      this.emit('error', { error: Object.assign(new GlossaError('R_STOPPED', { line: this.lastLine || 0 }), { message: String(err) }), internal: true });
    }
  }
}
