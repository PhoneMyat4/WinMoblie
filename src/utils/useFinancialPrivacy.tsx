import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { StorageService } from './storage';
import { formatCurrency } from './formatters';

export function useFinancialPrivacy() {
  const [hideDigits, setHideDigitsState] = useState<boolean>(() => {
    try {
      return StorageService.getHideFinancialDigits();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handlePrivacyChange = (e: any) => {
      if (e?.detail && typeof e.detail.hide === 'boolean') {
        setHideDigitsState(e.detail.hide);
      } else {
        setHideDigitsState(StorageService.getHideFinancialDigits());
      }
    };

    window.addEventListener('pos_financial_privacy_change', handlePrivacyChange);
    return () => {
      window.removeEventListener('pos_financial_privacy_change', handlePrivacyChange);
    };
  }, []);

  const toggleHideDigits = () => {
    const next = !hideDigits;
    StorageService.setHideFinancialDigits(next);
    setHideDigitsState(next);
  };

  const formatAmount = (amount: number, symbol: string = 'Ks'): string => {
    if (hideDigits) {
      if (symbol.toLowerCase().includes('ks') || symbol.toLowerCase().includes('mmk')) {
        return `•••••• ${symbol}`;
      }
      return `${symbol} ••••••`;
    }
    return formatCurrency(amount, symbol);
  };

  return {
    hideDigits,
    toggleHideDigits,
    formatAmount,
  };
}

interface PrivacyToggleButtonProps {
  hideDigits: boolean;
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'dark' | 'light' | 'outline';
  showLabel?: boolean;
}

export const PrivacyToggleButton: React.FC<PrivacyToggleButtonProps> = ({
  hideDigits,
  onToggle,
  className = '',
  size = 'md',
  variant = 'light',
  showLabel = true,
}) => {
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs sm:text-sm';
  
  let variantClasses = 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200';
  if (variant === 'dark') {
    variantClasses = hideDigits 
      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-xs'
      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow-xs';
  } else if (variant === 'outline') {
    variantClasses = hideDigits
      ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs';
  } else {
    // light
    variantClasses = hideDigits
      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold'
      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200';
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-xl font-bold transition-all cursor-pointer select-none ${sizeClasses} ${variantClasses} ${className}`}
      title={hideDigits ? 'Financial numbers are hidden. Click to reveal amounts.' : 'Hide financial numbers and profit digits on screen (Privacy Mode).'}
      aria-label={hideDigits ? 'Show financial digits' : 'Hide financial digits'}
    >
      {hideDigits ? (
        <>
          <Eye className="w-4 h-4 text-amber-500 shrink-0" />
          {showLabel && (
            <span className="flex items-center gap-1">
              <span>Show Amounts</span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-200/60 text-[10px] font-mono font-black text-amber-950">
                ••••••
              </span>
            </span>
          )}
        </>
      ) : (
        <>
          <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
          {showLabel && <span>Hide Amounts</span>}
        </>
      )}
    </button>
  );
};
