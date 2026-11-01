// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Καρτέλες: <div class="tabs" data-tabs="όνομα"> με κουμπιά data-tab και πάνελ data-panel.
import { $$ } from './dom.js';

export class Tabs {
  /**
   * @param {HTMLElement} tablist
   * @param {(name: string) => void} [onChange]
   */
  constructor(tablist, onChange) {
    this.tablist = tablist;
    this.onChange = onChange;
    this.buttons = $$('[role="tab"]', tablist);
    this.panels = $$('[role="tabpanel"]', tablist.nextElementSibling);
    this.buttons.forEach((btn) => {
      const name = btn.dataset.tab;
      const panel = this.panels.find((p) => p.dataset.panel === name);
      const id = `tab-${tablist.dataset.tabs}-${name}`;
      btn.id = id;
      if (panel) {
        if (!panel.id) panel.id = `panel-${tablist.dataset.tabs}-${name}`;
        btn.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', id);
      }
      btn.addEventListener('click', () => this.select(name));
    });
    tablist.addEventListener('keydown', (e) => this.onKey(e));
    this.current = this.buttons.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.tab;
  }

  select(name) {
    this.buttons.forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    this.panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    this.current = name;
    if (this.onChange) this.onChange(name);
  }

  onKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = this.buttons.findIndex((b) => b.dataset.tab === this.current);
    const next = this.buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + this.buttons.length) % this.buttons.length];
    this.select(next.dataset.tab);
    next.focus();
  }
}
