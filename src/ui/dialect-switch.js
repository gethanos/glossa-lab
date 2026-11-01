// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Διακόπτης γλώσσας: ΓΛΩΣΣΑ | Ψευδογλώσσα.
import { h } from './dom.js';
import { DIALECTS } from '../core/dialects.js';

export class DialectSwitch {
  /**
   * @param {HTMLElement} host
   * @param {(id: string) => void} onChange
   */
  constructor(host, onChange) {
    this.onChange = onChange;
    this.buttons = Object.values(DIALECTS).map((d) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { dialect: d.id },
      onclick: () => this.onChange(d.id),
    }, [h('span', { class: 'label-long' }, d.label), h('span', { class: 'label-short', 'aria-hidden': 'true' }, d.id === 'pseudo' ? 'Ψευδο' : 'ΓΛΩΣΣΑ')]));
    this.el = h('div', { class: 'dialect-switch', role: 'radiogroup', 'aria-label': 'Γλώσσα' }, this.buttons);
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    host.append(this.el);
  }

  set(id) {
    for (const b of this.buttons) {
      const on = b.dataset.dialect === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  onKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = this.buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = this.buttons[(i + 1) % this.buttons.length];
    this.onChange(next.dataset.dialect);
    next.focus();
  }
}
