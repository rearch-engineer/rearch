import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Vite eagerly imports all translation JSONs at build time
const enFiles = import.meta.glob('./components/**/en.json', { eager: true });
const esFiles = import.meta.glob('./components/**/es.json', { eager: true });
const frFiles = import.meta.glob('./components/**/fr.json', { eager: true });
const nlFiles = import.meta.glob('./components/**/nl.json', { eager: true });

const enPages = import.meta.glob('./pages/**/en.json', { eager: true });
const esPages = import.meta.glob('./pages/**/es.json', { eager: true });
const frPages = import.meta.glob('./pages/**/fr.json', { eager: true });
const nlPages = import.meta.glob('./pages/**/nl.json', { eager: true });

// App-level translations (src/en.json, src/es.json, src/fr.json, src/nl.json)
import appEn from './en.json';
import appEs from './es.json';
import appFr from './fr.json';
import appNl from './nl.json';

function buildNamespaces(files) {
  const ns = {};
  for (const [path, mod] of Object.entries(files)) {
    const parts = path.split('/');
    const namespace = parts[parts.length - 2];
    ns[namespace] = mod.default;
  }
  return ns;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { ...buildNamespaces(enFiles), ...buildNamespaces(enPages), App: appEn },
    es: { ...buildNamespaces(esFiles), ...buildNamespaces(esPages), App: appEs },
    fr: { ...buildNamespaces(frFiles), ...buildNamespaces(frPages), App: appFr },
    nl: { ...buildNamespaces(nlFiles), ...buildNamespaces(nlPages), App: appNl },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
