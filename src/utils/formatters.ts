import { DeviceCondition, ProductCategory, PaymentMethod, ExpenseCategory, ExpenseCategoryItem, StaffRole } from '../types';

export function formatCurrency(amount: number, symbol: string = 'Ks'): string {
  if (isNaN(amount) || amount === null || amount === undefined) return `0 ${symbol}`;
  const formattedNumber = Math.round(amount).toLocaleString('en-US');
  // For Myanmar Kyats, commonly shown as "1,250,000 Ks" or "Ks 1,250,000"
  if (symbol.toLowerCase().includes('ks') || symbol.toLowerCase().includes('mmk')) {
    return `${formattedNumber} ${symbol}`;
  }
  return `${symbol}${formattedNumber}`;
}

export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatImei(imei: string): string {
  if (!imei) return '';
  const clean = imei.replace(/\D/g, '');
  if (clean.length === 15) {
    return `${clean.slice(0, 2)} ${clean.slice(2, 8)} ${clean.slice(8, 14)} ${clean.slice(14)}`;
  }
  return imei;
}

export function formatDualImei(imei1: string, imei2?: string): string {
  if (!imei1) return '';
  if (!imei2) return `IMEI: ${formatImei(imei1)}`;
  return `IMEI 1: ${formatImei(imei1)} | IMEI 2: ${formatImei(imei2)}`;
}

export function getCategoryLabel(category: ProductCategory | string): string {
  switch (category) {
    case 'brand_new_phones':
    case 'new_phones':
      return 'Brand new phones';
    case 'pre_owned_phones':
    case 'used_phones':
      return 'Pre-owned Phones';
    case 'accessories_gadgets':
    case 'accessories':
    case 'gadgets':
      return 'Accessories & Gadgets';
    case 'cookware':
      return 'Cookware';
    case 'sim_cards':
    case 'sim_topup':
      return 'Sim Cards';
    case 'spare_parts':
      return 'Spare Parts & LCD Screens';
    default:
      return category;
  }
}

export function getConditionLabel(condition: DeviceCondition): { label: string; badgeClass: string } {
  switch (condition) {
    case 'brand_new':
      return { label: 'Brand New (Sealed)', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'used_grade_a_plus':
      return { label: 'Used: Like New (99%)', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'used_grade_a':
      return { label: 'Used: Excellent (95%)', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'used_grade_b':
      return { label: 'Used: Good (90%)', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'used_grade_c':
      return { label: 'Used: Fair (85%)', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' };
    default:
      return { label: condition, badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

export function getPaymentMethodInfo(method: PaymentMethod): {
  label: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  badgeBg: string;
  badgeText: string;
  iconName: string;
} {
  switch (method) {
    case 'kpay':
      return {
        label: 'KBZPay (KPay)',
        shortLabel: 'KPay',
        colorClass: 'text-blue-600',
        bgClass: 'bg-blue-50 hover:bg-blue-100',
        borderClass: 'border-blue-500',
        badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
        badgeText: 'text-blue-700',
        iconName: 'Smartphone',
      };
    case 'wave':
      return {
        label: 'WavePay (Wave Money)',
        shortLabel: 'Wave',
        colorClass: 'text-yellow-600',
        bgClass: 'bg-yellow-50 hover:bg-yellow-100',
        borderClass: 'border-yellow-500',
        badgeBg: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        badgeText: 'text-yellow-700',
        iconName: 'Zap',
      };
    case 'yoma':
      return {
        label: 'Yoma Bank / Next',
        shortLabel: 'Yoma',
        colorClass: 'text-rose-600',
        bgClass: 'bg-rose-50 hover:bg-rose-100',
        borderClass: 'border-rose-500',
        badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
        badgeText: 'text-rose-700',
        iconName: 'Building',
      };
    case 'kbz':
      return {
        label: 'KBZ Bank (iBanking/Mobile)',
        shortLabel: 'KBZ Bank',
        colorClass: 'text-indigo-600',
        bgClass: 'bg-indigo-50 hover:bg-indigo-100',
        borderClass: 'border-indigo-500',
        badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        badgeText: 'text-indigo-700',
        iconName: 'Landmark',
      };
    case 'aya':
      return {
        label: 'AYA Pay / AYA Bank',
        shortLabel: 'AYA Pay',
        colorClass: 'text-red-600',
        bgClass: 'bg-red-50 hover:bg-red-100',
        borderClass: 'border-red-500',
        badgeBg: 'bg-red-100 text-red-800 border-red-200',
        badgeText: 'text-red-700',
        iconName: 'CreditCard',
      };
    case 'cb':
      return {
        label: 'CB Pay / CB Bank',
        shortLabel: 'CB Pay',
        colorClass: 'text-orange-600',
        bgClass: 'bg-orange-50 hover:bg-orange-100',
        borderClass: 'border-orange-500',
        badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
        badgeText: 'text-orange-700',
        iconName: 'CreditCard',
      };
    case 'split':
      return {
        label: 'Split Multi-Payment',
        shortLabel: 'Split',
        colorClass: 'text-purple-600',
        bgClass: 'bg-purple-50 hover:bg-purple-100',
        borderClass: 'border-purple-500',
        badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
        badgeText: 'text-purple-700',
        iconName: 'Split',
      };
    case 'credit':
      return {
        label: 'Credit Sale (အကြွေးအရောင်း)',
        shortLabel: 'Credit',
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-50 hover:bg-amber-100',
        borderClass: 'border-amber-500',
        badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
        badgeText: 'text-amber-700',
        iconName: 'HandCoins',
      };
    case 'cash':
    default:
      return {
        label: 'Cash (MMK)',
        shortLabel: 'Cash',
        colorClass: 'text-emerald-600',
        bgClass: 'bg-emerald-50 hover:bg-emerald-100',
        borderClass: 'border-emerald-500',
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        badgeText: 'text-emerald-700',
        iconName: 'DollarSign',
      };
  }
}

/**
 * Returns a human-friendly string describing payments, especially split payments.
 * For example: "Cash 60,000 Ks + KPay 60,000 Ks" or "Cash 60000 + Kpay 60000".
 */
export function formatSalePaymentBreakdown(
  sale: {
    paymentMethod: PaymentMethod;
    paymentDetails?: {
      cashAmount?: number;
      kpayAmount?: number;
      waveAmount?: number;
      yomaAmount?: number;
      kbzAmount?: number;
      ayaAmount?: number;
      cbAmount?: number;
      splitMethod?: string;
      digitalMethod?: string;
      digitalAmount?: number;
      [key: string]: any;
    };
    amountPaid?: number;
  },
  currencySymbol: string = 'Ks',
  compact: boolean = false
): string {
  if (sale.paymentMethod === 'split') {
    const details = sale.paymentDetails || {};
    const parts: string[] = [];

    // Cash amount
    if (typeof details.cashAmount === 'number' && details.cashAmount > 0) {
      parts.push(`Cash ${formatCurrency(details.cashAmount, currencySymbol)}`);
    }

    // Specific Digital Channels
    const channels: { key: string; label: string }[] = [
      { key: 'kpayAmount', label: 'KPay' },
      { key: 'waveAmount', label: 'WavePay' },
      { key: 'kbzAmount', label: 'KBZ Bank' },
      { key: 'ayaAmount', label: 'AYA Pay' },
      { key: 'cbAmount', label: 'CB Pay' },
      { key: 'yomaAmount', label: 'Yoma Bank' },
    ];

    let foundDigital = false;
    for (const ch of channels) {
      if (typeof details[ch.key] === 'number' && details[ch.key] > 0) {
        parts.push(`${ch.label} ${formatCurrency(details[ch.key], currencySymbol)}`);
        foundDigital = true;
      }
    }

    // Fallback if generic digitalAmount was used
    if (!foundDigital && typeof details.digitalAmount === 'number' && details.digitalAmount > 0) {
      const channelName = details.splitMethod || details.digitalMethod || 'digital';
      const label =
        channelName === 'kpay' ? 'KPay' :
        channelName === 'wave' ? 'WavePay' :
        channelName === 'kbz' ? 'KBZ Bank' :
        channelName === 'aya' ? 'AYA Pay' :
        channelName === 'cb' ? 'CB Pay' :
        channelName === 'yoma' ? 'Yoma Bank' : channelName.toUpperCase();
      parts.push(`${label} ${formatCurrency(details.digitalAmount, currencySymbol)}`);
    }

    if (parts.length > 0) {
      return parts.join(' + ');
    }
    return compact ? 'Split' : 'Split Payment (Cash + Digital)';
  }

  return getPaymentMethodInfo(sale.paymentMethod).label;
}

export function getBadgeClassForColor(color: string = 'slate'): string {
  switch (color.toLowerCase()) {
    case 'rose':
    case 'red':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'amber':
    case 'yellow':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'cyan':
    case 'sky':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'purple':
    case 'violet':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'orange':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'emerald':
    case 'green':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'indigo':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'teal':
      return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'pink':
    case 'fuchsia':
      return 'bg-pink-50 text-pink-700 border-pink-200';
    case 'slate':
    case 'gray':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function getExpenseCategoryInfo(
  category: ExpenseCategory,
  customCategories?: ExpenseCategoryItem[]
): { label: string; icon: string; badgeClass: string; color: string } {
  // 1. Check custom categories list if provided
  if (customCategories && customCategories.length > 0) {
    const matched = customCategories.find(
      c => c.id === category || c.name.toLowerCase() === category.toLowerCase()
    );
    if (matched) {
      const color = matched.badgeColor || 'slate';
      return {
        label: matched.name,
        icon: matched.icon || 'Tag',
        badgeClass: getBadgeClassForColor(color),
        color,
      };
    }
  }

  // 2. Built-in defaults
  switch (category) {
    case 'shop_rent':
      return { label: 'Shop Rent', icon: 'Store', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200', color: 'rose' };
    case 'utilities_electricity':
      return { label: 'Electricity / Generator / Water', icon: 'Zap', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200', color: 'amber' };
    case 'staff_salary':
      return { label: 'Staff Salary & Commission', icon: 'Users', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200', color: 'blue' };
    case 'wifi_internet':
      return { label: 'WiFi & Telecom Topup', icon: 'Wifi', badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200', color: 'cyan' };
    case 'marketing_ads':
      return { label: 'Facebook Ads & Marketing', icon: 'Megaphone', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200', color: 'purple' };
    case 'store_maintenance':
      return { label: 'Shop Renovation & Maintenance', icon: 'Wrench', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200', color: 'orange' };
    case 'food_refreshment':
      return { label: 'Staff Meals & Snacks', icon: 'Coffee', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', color: 'emerald' };
    case 'supplies_packaging':
      return { label: 'Packaging, Bags & Receipt Rolls', icon: 'Package', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200', color: 'indigo' };
    case 'transport_delivery':
      return { label: 'Transport & Stock Delivery (Gate)', icon: 'Truck', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200', color: 'teal' };
    case 'taxes_fees':
      return { label: 'City Fees & Licenses', icon: 'FileText', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', color: 'slate' };
    case 'other_general':
      return { label: 'General / Miscellaneous', icon: 'Tag', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: 'slate' };
    default: {
      const formatted = category
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      return { label: formatted, icon: 'Tag', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: 'slate' };
    }
  }
}

export function getRoleBadgeClass(role: StaffRole): string {
  switch (role) {
    case 'Owner':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'Manager':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Inventory_Staff':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Cashier':
    default:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }
}
