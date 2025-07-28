export interface Translation {
  [key: string]: string | Translation;
}

export interface TranslationCollection {
  [locale: string]: Translation;
}

// Supported languages
export const SUPPORTED_LANGUAGES = {
  pl: 'Polski',
  en: 'English'
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

// Default language
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

// Import translations
import { pl } from './translations/pl';
import { en } from './translations/en';

// Translations collection
export const translations: TranslationCollection = {
  pl,
  en
};

// Get nested translation value
export function getTranslation(obj: Translation, path: string): string {
  const keys = path.split('.');
  let result: any = obj;
  
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return path; // Return key if translation not found
    }
  }
  
  return typeof result === 'string' ? result : path;
}

// Translation hook - will be enhanced later with context
export function useTranslation(language: SupportedLanguage = DEFAULT_LANGUAGE) {
  const t = (key: string, params?: Record<string, string | number>): string => {
    let translation = getTranslation(translations[language] || translations[DEFAULT_LANGUAGE], key);
    
    // Replace parameters if provided
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        translation = translation.replace(`{{${paramKey}}}`, String(paramValue));
      });
    }
    
    return translation;
  };
  
  return { t, language };
}
