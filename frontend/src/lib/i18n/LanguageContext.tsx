'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SupportedLanguage, DEFAULT_LANGUAGE, useTranslation as useTranslationCore } from '@/lib/i18n';
import { userApi } from '@/lib/api-client';
import { toast } from 'sonner';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en'); // Start with 'en' as default
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslationCore(language);

  // Load user's preferred language on mount
  useEffect(() => {
    const loadUserLanguage = () => {
      try {
        // First, try to get language from user data in localStorage
        const userData = localStorage.getItem('user_data');
        console.log('Loading user language, user_data:', userData);
        
        if (userData) {
          const parsed = JSON.parse(userData);
          console.log('Parsed user data:', parsed);
          
          if (parsed.preferred_language && ['pl', 'en'].includes(parsed.preferred_language)) {
            console.log('Setting language from user data:', parsed.preferred_language);
            setLanguageState(parsed.preferred_language as SupportedLanguage);
            setIsLoading(false);
            return;
          }
        }

        // Fallback to browser language or explicitly set English
        const browserLang = navigator.language.toLowerCase();
        console.log('Browser language:', browserLang);
        
        // Always default to English for now to test
        setLanguageState('en');
        console.log('Set default language to English');
      } catch (error) {
        console.error('Error loading user language:', error);
        setLanguageState(DEFAULT_LANGUAGE);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserLanguage();

    // No need for user-data-updated listener since we handle updates in setLanguage directly
  }, []);

  const setLanguage = async (newLanguage: SupportedLanguage) => {
    try {
      setIsLoading(true);
      
      // Update language in backend first
      await userApi.updateLanguage(newLanguage);
      
      // Update localStorage
      const userData = localStorage.getItem('user_data');
      if (userData) {
        const parsed = JSON.parse(userData);
        parsed.preferred_language = newLanguage;
        localStorage.setItem('user_data', JSON.stringify(parsed));
        localStorage.setItem('user_data_timestamp', Date.now().toString());
      }
      
      // Update local state (this will trigger re-render of all components using this context)
      setLanguageState(newLanguage);
      
      // Show success message in the new language
      const messages = {
        pl: 'Język interfejsu został zmieniony',
        en: 'Interface language has been changed'
      };
      
      // Use setTimeout to ensure the state has updated before showing toast
      setTimeout(() => {
        toast.success(messages[newLanguage], {
          duration: 2000,
          position: "top-center",
        });
      }, 100);
      
    } catch (error) {
      console.error('Error updating language:', error);
      
      // Show error message in current language
      const errorMessages = {
        pl: 'Wystąpił błąd podczas zmiany języka',
        en: 'An error occurred while changing language'
      };
      
      toast.error(errorMessages[language], {
        duration: 5000,
        position: "top-center",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    t,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Hook for easy access to translation function only
export function useTranslation() {
  const { t, language } = useLanguage();
  return { t, language };
}
