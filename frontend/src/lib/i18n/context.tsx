'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SupportedLanguage, DEFAULT_LANGUAGE, useTranslation as useI18nTranslation } from './index';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: SupportedLanguage;
}

export function LanguageProvider({ children, initialLanguage }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<SupportedLanguage>(initialLanguage || DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(true);
  
  const { t } = useI18nTranslation(language);

  // Load language from localStorage on mount
  useEffect(() => {
    setIsLoading(true);
    
    // First try to get language from props (server-side data)
    if (initialLanguage) {
      setLanguageState(initialLanguage);
      setIsLoading(false);
      return;
    }
    
    // Then try localStorage
    try {
      const storedLanguage = localStorage.getItem('preferred_language') as SupportedLanguage;
      if (storedLanguage && ['pl', 'en'].includes(storedLanguage)) {
        setLanguageState(storedLanguage);
      }
    } catch (error) {
      console.warn('Failed to load language from localStorage:', error);
    }
    
    setIsLoading(false);
  }, [initialLanguage]);

  // Function to change language and persist to localStorage and API
  const setLanguage = async (newLanguage: SupportedLanguage) => {
    setLanguageState(newLanguage);
    
    // Save to localStorage
    try {
      localStorage.setItem('preferred_language', newLanguage);
    } catch (error) {
      console.warn('Failed to save language to localStorage:', error);
    }
    
    // Update user preference via API
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://amucontainers.orion.zfns.eu.org'}/api/v1/users/me/language`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            preferred_language: newLanguage
          })
        });
        
        if (!response.ok) {
          console.warn('Failed to update language preference on server');
        }
      }
    } catch (error) {
      console.warn('Failed to update language preference via API:', error);
    }
  };

  const contextValue: LanguageContextType = {
    language,
    setLanguage,
    t,
    isLoading
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

// Hook to use language context
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Alternative hook for just translation function (for backward compatibility)
export function useTranslation() {
  const { t, language } = useLanguage();
  return { t, language };
}
