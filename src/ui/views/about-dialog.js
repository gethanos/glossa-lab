// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Παράθυρο «Σχετικά»: δημιουργός, έκδοση, άδεια χρήσης, σύνδεσμοι.
import { h } from '../dom.js';
import { BRAND } from '../../brand.js';
import { iconSvg } from '../brand-mark.js';

export class AboutDialog {
  constructor() {
    this.el = this.build();
    document.body.append(this.el);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
  }

  build() {
    const a = BRAND.author;
    const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
    return h('dialog', { class: 'about', 'aria-labelledby': 'about-title' }, [
      h('div', { class: 'about-inner' }, [
        h('header', { class: 'about-head' }, [
          h('span', { class: 'brand-mark', 'aria-hidden': 'true', html: iconSvg('about') }),
          h('div', {}, [
            h('h2', { id: 'about-title' }, [`${BRAND.title} `, h('span', { class: 'brand-lab' }, 'Lab'), `: ${BRAND.tagline}`]),
            h('p', { class: 'muted small' }, `${BRAND.productName}, έκδοση ${BRAND.version}`),
          ]),
        ]),
        h('p', {}, BRAND.description),
        h('section', { class: 'about-section' }, [
          h('h3', {}, 'Δημιουργός'),
          h('p', { class: 'about-name' }, a.name),
          h('ul', {}, [
            ...a.roles.map((r) => h('li', {}, r)),
            h('li', {}, a.organization),
            h('li', {}, ['Email: ', link(`mailto:${a.email}`, a.email)]),
            h('li', {}, ['Ιστότοπος: ', link(a.website, a.website.replace(/^https?:\/\//, ''))]),
          ]),
        ]),
        h('section', { class: 'about-section' }, [
          h('h3', {}, 'Άδεια χρήσης'),
          h('p', {}, [
            `© ${BRAND.year} ${a.name}. Διανέμεται με την άδεια ${BRAND.license}: επιτρέπεται ελεύθερα η χρήση, η τροποποίηση και η αναδιανομή, με την προϋπόθεση ότι διατηρείται η σημείωση πνευματικών δικαιωμάτων και το κείμενο της άδειας.`,
          ]),
          h('p', {}, ['Πηγαίος κώδικας: ', link(BRAND.repository, BRAND.repository.replace(/^https?:\/\//, ''))]),
          h('p', {}, ['Περισσότερες εφαρμογές: ', link(BRAND.appsUrl, BRAND.appsUrl.replace(/^https?:\/\//, ''))]),
        ]),
        h('div', { class: 'about-actions' }, [
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => this.close() }, 'Κλείσιμο'),
        ]),
      ]),
    ]);
  }

  open() {
    if (typeof this.el.showModal === 'function') this.el.showModal();
    else this.el.setAttribute('open', '');
  }

  close() {
    if (typeof this.el.close === 'function') this.el.close();
    else this.el.removeAttribute('open');
  }
}
