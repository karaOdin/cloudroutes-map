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

const getInitialLanguage = () => {
  // First check if language is injected from React Native
  if (typeof window !== 'undefined' && window.language) {
    return window.language;
  }
  // Fallback to localStorage
  return localStorage.getItem('language') || 'en';
};

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
  localStorage.setItem('language', lng);
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