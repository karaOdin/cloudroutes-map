import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

declare global {
  interface Window {
    language?: string;
    // env?: any;
  }
}

const SUPPORTED = ['en', 'fr', 'ar'];

const supported = (value: string | null | undefined) => {
  const code = value?.toLowerCase().split('-')[0];

  return code && SUPPORTED.includes(code) ? code : null;
};

/**
 * Which language to open in.
 *
 * Inside the app the host decides. On the web there is no host, so before
 * anything was saved every visitor got English — in a country whose riders
 * read Arabic and French first. A link can now say `?lang=ar`, and otherwise
 * the browser's own languages are asked before falling back to English.
 */
const getInitialLanguage = () => {
  if (typeof window === 'undefined') return 'en';

  const fromHost = supported(window.language);

  if (fromHost) return fromHost;

  const fromLink = supported(new URLSearchParams(window.location.search).get('lang'));

  if (fromLink) return fromLink;

  try {
    const saved = supported(localStorage.getItem('language'));

    if (saved) return saved;
  } catch {
    /* Storage blocked: fall through to the browser's languages. */
  }

  for (const language of navigator.languages ?? [navigator.language]) {
    const found = supported(language);

    if (found) return found;
  }

  return 'en';
};

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'ar', name: 'العربية' },
] as const;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Handle language changes
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('language', lng);
  } catch {
    /* Storage blocked: the choice lasts for this visit only. */
  }
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

// Set initial direction
document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = i18n.language;

// Listen for language changes from React Native
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LANGUAGE_CHANGE') {
      const newLanguage = event.data.language;
      if (newLanguage && ['en', 'fr', 'ar'].includes(newLanguage)) {
        i18n.changeLanguage(newLanguage);
      }
    }
  });
}

export default i18n;