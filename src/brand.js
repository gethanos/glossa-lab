// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
// Ταυτότητα της εφαρμογής. Όλα τα στοιχεία δημιουργού, έκδοσης και συνδέσμων ζουν μόνο εδώ.

/* global __APP_VERSION__ */
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const BRAND = Object.freeze({
  productName: 'GlossaLab',
  title: 'ΓΛΩΣΣΑ',
  tagline: 'εργαστήριο προγραμματισμού',
  description: 'Εκπαιδευτικός διερμηνευτής της ΓΛΩΣΣΑΣ και της ψευδογλώσσας για το μάθημα της Πληροφορικής του Γενικού Λυκείου, με βηματική εκτέλεση, απεικόνιση της μνήμης και αναλυτική εξήγηση κάθε λάθους.',
  version,
  year: 2026,
  license: 'MIT',
  repository: 'https://github.com/gethanos/glossa-lab',
  liveUrl: 'https://vle.cited.gr/apps/glossa-lab/',
  appsUrl: 'https://vle.cited.gr/apps',
  // Στοιχεία για μηχανές αναζήτησης και κοινοποιήσεις (χρησιμοποιούνται στο build).
  seo: Object.freeze({
    title: 'ΓΛΩΣΣΑ Lab: διερμηνευτής ΓΛΩΣΣΑΣ και ψευδογλώσσας | CITEd.gr',
    description: 'Δωρεάν διερμηνευτής ΓΛΩΣΣΑΣ και ψευδογλώσσας για την Πληροφορική Λυκείου: βηματική εκτέλεση, απεικόνιση μνήμης, πίνακας τιμών και εξήγηση λαθών.',
    shareTitle: 'ΓΛΩΣΣΑ Lab: εργαστήριο προγραμματισμού',
    image: 'social-preview.png',
    imageAlt: 'ΓΛΩΣΣΑ Lab: εργαστήριο προγραμματισμού, με βηματική εκτέλεση, απεικόνιση μνήμης και εξήγηση κάθε λάθους',
    locale: 'el_GR',
    themeColor: { light: '#293E84', dark: '#0A1124' },
    audience: 'Μαθητές και εκπαιδευτικοί Πληροφορικής Γενικού Λυκείου',
  }),
  publisher: Object.freeze({ name: 'CITEd.gr Virtual Learning Environment', url: 'https://vle.cited.gr' }),
  author: Object.freeze({
    name: 'Αθανάσιος-Αντώνιος Γεωργαλάς',
    roles: ['Καθηγητής Πληροφορικής, M.Sc., M.A.'],
    organization: 'CITEd.gr Virtual Learning Environment',
    email: 'info@cited.gr',
    website: 'https://vle.cited.gr',
    github: 'https://github.com/gethanos',
  }),
});
