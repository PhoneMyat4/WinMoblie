import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, translate } from '../locales/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
  isBurmese: boolean;
  formatNumber: (num: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'mobile_pos_system_language';

export const LanguageProvider: React.FC<{
  children: React.ReactNode;
  initialLanguage?: Language;
  onLanguageChange?: (lang: Language) => void;
}> = ({ children, initialLanguage, onLanguageChange }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (initialLanguage) return initialLanguage;
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'my' || saved === 'en') return saved;
    } catch {
      // ignore localStorage errors
    }
    // Default to Burmese as requested
    return 'my';
  });

  // Keep state synced if initialLanguage prop changes from server/settings
  useEffect(() => {
    if (initialLanguage && (initialLanguage === 'my' || initialLanguage === 'en')) {
      setLanguageState(initialLanguage);
    }
  }, [initialLanguage]);

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
      // Also update html lang attribute
      document.documentElement.lang = newLang;
    } catch {
      // ignore
    }
    if (onLanguageChange) {
      onLanguageChange(newLang);
    }
  }, [onLanguageChange]);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'my' ? 'en' : 'my');
  }, [language, setLanguage]);

  const t = useCallback((key: string, fallback?: string) => {
    return translate(key, language, fallback);
  }, [language]);

  const formatNumber = useCallback((num: number) => {
    return (num || 0).toLocaleString(language === 'my' ? 'my-MM' : 'en-US');
  }, [language]);

  const value = {
    language,
    setLanguage,
    toggleLanguage,
    t,
    isBurmese: language === 'my',
    formatNumber,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      language: 'my',
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, fallback?: string) => translate(key, 'my', fallback),
      isBurmese: true,
      formatNumber: (n: number) => (n || 0).toLocaleString('en-US'),
    };
  }
  return context;
};
