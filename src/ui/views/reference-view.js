// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Οδηγός γλώσσας: δομές με παραδείγματα που εισάγονται στον κώδικα με ένα κλικ.
import { h } from '../dom.js';
import { languageHelp } from '../editor/snippets.js';
import { highlight } from '../editor/highlighter.js';
import { icon } from '../icons.js';

// Τελεστές και σημειώσεις ανά γλώσσα, όπως στη θεωρία των βιβλίων.
const LANGUAGE_NOTES = {
  glossa: {
    operators: [
      ['+  -  *  /', 'πρόσθεση, αφαίρεση, πολλαπλασιασμός, διαίρεση (η / δίνει πάντα ΠΡΑΓΜΑΤΙΚΗ)'],
      ['DIV  MOD', 'ακέραιο πηλίκο και υπόλοιπο, μόνο για ακέραιους: 17 DIV 5 = 3, 17 MOD 5 = 2'],
      ['^', 'δύναμη: 2 ^ 3 = 8'],
      ['=  <>  <  >  <=  >=', 'συγκρίσεις, δίνουν ΑΛΗΘΗΣ ή ΨΕΥΔΗΣ'],
      ['ΚΑΙ  Η  ΟΧΙ', 'λογικοί τελεστές για σύνθετες συνθήκες'],
      ['<-', 'εκχώρηση τιμής σε μεταβλητή'],
    ],
    precedence: 'Σειρά προτεραιότητας: ^, πρόσημο, * / DIV MOD, + -, συγκρίσεις, ΟΧΙ, ΚΑΙ, Η. Οι παρενθέσεις αλλάζουν τη σειρά.',
    notes: 'Το κείμενο γράφεται σε απλά εισαγωγικά (\'…\') και οι πραγματικοί αριθμοί με τελεία (3.14). Στην εκχώρηση η μεταβλητή και η έκφραση είναι του ιδίου τύπου. Σχόλια γράφονται μετά από θαυμαστικό (!). Μια μεγάλη εντολή συνεχίζει στην επόμενη γραμμή αν αυτή ξεκινά με &. Κεφαλαία και τόνοι δεν παίζουν ρόλο στα ονόματα.',
  },
  pseudo: {
    operators: [
      ['+  –  *  /', 'πρόσθεση, αφαίρεση, πολλαπλασιασμός, διαίρεση'],
      ['div  mod', 'ακέραιο πηλίκο και υπόλοιπο, μόνο για θετικούς ακέραιους: 17 div 5 = 3, 17 mod 5 = 2'],
      ['^', 'δύναμη: 2 ^ 3 = 8'],
      ['=  ≠  <  ≤  >  ≥', 'συγκρίσεις (γράφονται και <>, <=, >=), δίνουν Αληθής ή Ψευδής'],
      ['και  ή  όχι', 'λογικοί τελεστές για σύνθετες συνθήκες'],
      ['←', 'εκχώρηση τιμής σε μεταβλητή (γράφεται και <-)'],
    ],
    precedence: 'Σειρά προτεραιότητας: ^, πρόσημο, * / div mod, + –, συγκρίσεις, όχι, και, ή. Οι παρενθέσεις αλλάζουν τη σειρά.',
    notes: 'Οι μεταβλητές δεν δηλώνονται: το είδος τους (αριθμητική, αλφαριθμητική, λογική) ορίζεται από την τιμή. Το κείμενο γράφεται σε διπλά εισαγωγικά ("…"). Το δεκαδικό σημείο είναι το κόμμα (2,5): για να ξεχωρίζει από το κόμμα που χωρίζει τιμές, γράφεται χωρίς κενά, ενώ μετά το κόμμα που χωρίζει τιμές αφήνουμε κενό (Εμφάνισε α, 2,5). Κάθε συνθήκη περιέχει τουλάχιστον μία σύγκριση. Σχόλια γράφονται μετά από θαυμαστικό (!).',
  },
};

const SHORTCUTS = [
  ['F5', 'Εκτέλεση ή συνέχεια'], ['F10', 'Βήμα (μπαίνει και σε υποπρογράμματα)'],
  ['Shift + F10', 'Βήμα πάνω από κλήση'], ['F6', 'Αυτόματη βηματική εκτέλεση'], ['Esc', 'Διακοπή'],
  ['Ctrl + S / Ctrl + O', 'Αποθήκευση / άνοιγμα αρχείου'],
  ['Ctrl + Space', 'Προτάσεις συμπλήρωσης'], ['Tab / Shift + Tab', 'Εσοχή / αφαίρεση εσοχής'],
];

export class ReferenceView {
  /** @param {{ onInsert: (template: string) => void, onAbout?: () => void, credit?: string }} hooks */
  constructor(host, hooks) {
    this.host = host;
    this.hooks = hooks;
    this.dialect = 'glossa';
    this.render();
  }

  setDialect(dialectId) {
    this.dialect = dialectId;
    this.render();
  }

  render() {
    const help = languageHelp(this.dialect);
    const notes = LANGUAGE_NOTES[this.dialect];
    const groups = new Map();
    for (const s of help.snippets) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    }
    const sections = [...groups].map(([title, items]) => h('section', { class: 'ref-group' }, [
      h('h3', {}, title),
      ...items.map((s) => this.entry(s)),
    ]));
    sections.push(h('section', { class: 'ref-group' }, [
      h('h3', {}, 'Τελεστές'),
      h('dl', { class: 'ref-dl' }, notes.operators.flatMap(([op, desc]) => [h('dt', {}, h('code', {}, op)), h('dd', {}, desc)])),
      h('p', { class: 'small muted' }, notes.precedence),
    ]));
    sections.push(h('section', { class: 'ref-group' }, [
      h('h3', {}, 'Ενσωματωμένες συναρτήσεις'),
      h('dl', { class: 'ref-dl' }, help.builtins.flatMap((b) => [h('dt', {}, h('code', {}, `${b.name}(x)`)), h('dd', {}, `${b.detail}, π.χ. ${b.example}`)])),
    ]));
    sections.push(h('section', { class: 'ref-group' }, [
      h('h3', {}, 'Συντομεύσεις πληκτρολογίου'),
      h('dl', { class: 'ref-dl' }, SHORTCUTS.flatMap(([k, d]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, d)])),
      h('p', { class: 'small muted' }, notes.notes),
    ]));
    if (this.hooks.credit) {
      sections.push(h('footer', { class: 'ref-credit small muted' }, [
        this.hooks.credit, ' ',
        h('button', { type: 'button', class: 'line-link', onclick: () => this.hooks.onAbout && this.hooks.onAbout() }, 'Σχετικά'),
      ]));
    }
    this.host.replaceChildren(...sections);
  }

  entry(s) {
    const code = s.template.replace(/\$\{([^}]*)\}/g, '$1');
    return h('article', { class: 'ref-entry' }, [
      h('div', { class: 'ref-head' }, [
        h('h4', {}, s.label),
        h('button', {
          type: 'button', class: 'btn btn-ghost btn-small', title: 'Εισαγωγή στον κώδικα, στη θέση του κέρσορα',
          onclick: () => this.hooks.onInsert(s.template), html: `${icon('plus')}<span>Εισαγωγή</span>`,
        }),
      ]),
      h('p', {}, s.description),
      h('pre', { class: 'example' }, h('code', { html: highlight(code, this.dialect) })),
    ]);
  }
}
