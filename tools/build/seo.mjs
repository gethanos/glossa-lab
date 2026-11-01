// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
//
// Στοιχεία για μηχανές αναζήτησης, κοινοποιήσεις και εγκατάσταση ως εφαρμογή.
// Όλα παράγονται από το src/brand.js, ώστε να υπάρχει μία μόνο πηγή.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Οι ετικέτες του <head>.
 * @param {object} brand το BRAND του src/brand.js
 * @param {string} faviconSvg το εικονίδιο σε SVG (ενσωματώνεται ως data URI)
 */
export function renderHead(brand, faviconSvg) {
  const { seo, liveUrl, author, publisher } = brand;
  const image = new URL(seo.image, liveUrl).href;
  const tags = [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    `<meta name="author" content="${esc(author.name)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<link rel="canonical" href="${esc(liveUrl)}">`,
    `<meta name="application-name" content="${esc(brand.productName)}">`,
    `<meta name="apple-mobile-web-app-title" content="${esc(`${brand.title} Lab`)}">`,
    `<meta name="color-scheme" content="light dark">`,
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${seo.themeColor.light}">`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${seo.themeColor.dark}">`,
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(faviconSvg)}">`,
    `<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">`,
    `<link rel="apple-touch-icon" href="apple-touch-icon.png">`,
    `<link rel="manifest" href="site.webmanifest">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${seo.locale}">`,
    `<meta property="og:site_name" content="${esc(publisher.name)}">`,
    `<meta property="og:title" content="${esc(seo.shareTitle)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    `<meta property="og:url" content="${esc(liveUrl)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1280">`,
    `<meta property="og:image:height" content="640">`,
    `<meta property="og:image:alt" content="${esc(seo.imageAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(seo.shareTitle)}">`,
    `<meta name="twitter:description" content="${esc(seo.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="twitter:image:alt" content="${esc(seo.imageAlt)}">`,
    `<script type="application/ld+json">${jsonLd(brand).replace(/</g, '\\u003c')}</script>`,
  ];
  return tags.map((t) => `  ${t}`).join('\n');
}

/** Δομημένα δεδομένα schema.org (WebApplication). */
export function jsonLd(brand) {
  const { seo, liveUrl, author, publisher } = brand;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `${brand.title} Lab`,
    alternateName: brand.productName,
    description: seo.description,
    url: liveUrl,
    image: new URL(seo.image, liveUrl).href,
    inLanguage: 'el',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    softwareVersion: brand.version,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    audience: { '@type': 'EducationalAudience', educationalRole: ['student', 'teacher'], audienceType: seo.audience },
    educationalLevel: 'Γενικό Λύκειο',
    teaches: ['Προγραμματισμός', 'Αλγόριθμοι', 'ΓΛΩΣΣΑ', 'Ψευδογλώσσα'],
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: brand.repository,
    author: {
      '@type': 'Person',
      name: author.name,
      jobTitle: author.roles.join(', '),
      email: `mailto:${author.email}`,
      url: author.website,
      sameAs: [author.github],
    },
    publisher: { '@type': 'Organization', name: publisher.name, url: publisher.url },
  });
}

/** Περιεχόμενο για χρήστες και μηχανές αναζήτησης που δεν εκτελούν JavaScript. */
export function renderNoscript(brand) {
  const a = brand.author;
  return `<noscript>
    <section class="noscript">
      <h2>${esc(`${brand.title} Lab: ${brand.tagline}`)}</h2>
      <p>${esc(brand.description)}</p>
      <ul>
        <li>Βηματική εκτέλεση με σημεία διακοπής και εξήγηση κάθε βήματος.</li>
        <li>Απεικόνιση μεταβλητών, πινάκων, βρόχων και κλήσεων υποπρογραμμάτων.</li>
        <li>Πίνακας τιμών όπως συμπληρώνεται στο τετράδιο.</li>
        <li>Αναλυτική εξήγηση των λαθών, με οδηγία διόρθωσης και παράδειγμα.</li>
      </ul>
      <p><strong>Η εφαρμογή χρειάζεται JavaScript.</strong> Ενεργοποίησέ τη στον browser για να τη χρησιμοποιήσεις.</p>
      <p>Δημιουργός: ${esc(a.name)}, ${esc(a.roles.join(', '))}, <a href="${esc(brand.appsUrl)}">${esc(brand.publisher.name)}</a>.
      Πηγαίος κώδικας: <a href="${esc(brand.repository)}">${esc(brand.repository.replace(/^https?:\/\//, ''))}</a> (άδεια ${esc(brand.license)}).</p>
    </section>
  </noscript>`;
}

/** Web App Manifest: εγκατάσταση στην αρχική οθόνη κινητού ή ως εφαρμογή υπολογιστή. */
export function renderManifest(brand) {
  return JSON.stringify({
    name: `${brand.title} Lab: ${brand.tagline}`,
    short_name: `${brand.title} Lab`,
    description: brand.seo.description,
    lang: 'el',
    dir: 'ltr',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: brand.seo.themeColor.light,
    categories: ['education', 'developer'],
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2);
}
