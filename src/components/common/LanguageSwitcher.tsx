import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Languages } from 'lucide-react';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'pill' | 'select' | 'compact' | 'sidebar';
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ 
  className = '', 
  variant = 'pill' 
}) => {
  const { language, setLanguage } = useLanguage();

  if (variant === 'select') {
    return (
      <div className={`relative inline-flex items-center ${className}`}>
        <Languages className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'my' | 'en')}
          className="appearance-none pl-8 pr-7 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          title="စနစ်သုံး ဘာသာစကား ရွေးချယ်ပါ / Select System Language"
        >
          <option value="my">🇲🇲 မြန်မာဘာသာ (Burmese)</option>
          <option value="en">🇬🇧 English</option>
        </select>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className={`flex items-center justify-between p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs ${className}`}>
        <div className="flex items-center gap-2 text-slate-300">
          <Languages className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="font-semibold text-[11px] truncate">ဘာသာစကား</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5 border border-slate-700">
          <button
            type="button"
            onClick={() => setLanguage('my')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
              language === 'my'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="မြန်မာဘာသာ"
          >
            🇲🇲 MM
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
              language === 'en'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="English"
          >
            🇬🇧 EN
          </button>
        </div>
      </div>
    );
  }

  // Default 'pill' variant
  return (
    <div 
      className={`inline-flex items-center rounded-xl bg-slate-100 border border-slate-200 p-0.5 shadow-2xs ${className}`}
      id="system-language-toggle"
      role="group"
      aria-label="Language Selector"
    >
      <button
        type="button"
        id="btn-lang-burmese"
        onClick={() => setLanguage('my')}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
          language === 'my'
            ? 'bg-white text-indigo-900 shadow-xs border border-indigo-100 ring-1 ring-indigo-500/20'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
        }`}
        title="မြန်မာဘာသာသို့ ပြောင်းမည် (Switch to Burmese)"
      >
        <span className="text-[13px] leading-none">🇲🇲</span>
        <span className="text-[11px]">မြန်မာ</span>
      </button>

      <button
        type="button"
        id="btn-lang-english"
        onClick={() => setLanguage('en')}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
          language === 'en'
            ? 'bg-white text-indigo-900 shadow-xs border border-indigo-100 ring-1 ring-indigo-500/20'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
        }`}
        title="Switch to English (အင်္ဂလိပ်ဘာသာ)"
      >
        <span className="text-[13px] leading-none">🇬🇧</span>
        <span className="text-[11px]">EN</span>
      </button>
    </div>
  );
};
