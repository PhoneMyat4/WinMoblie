import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Receipt, 
  Users, 
  Award, 
  Calendar, 
  Clock, 
  Percent, 
  Target, 
  ArrowUpRight, 
  ArrowDownRight, 
  CreditCard, 
  Search, 
  Download, 
  FileText, 
  Eye, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  ChevronRight, 
  ChevronDown,
  ChevronLeft,
  Check,
  Tag, 
  Layers, 
  RotateCcw, 
  ShieldCheck, 
  Filter,
  BarChart3,
  PieChart as PieIcon,
  Sliders,
  TrendingDown,
  ShoppingBag,
  CheckSquare,
  Square,
  Edit3,
  X,
  Smartphone,
  Headphones,
  Utensils,
  AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell, 
  PieChart, 
  Pie, 
  Legend,
  CartesianGrid
} from 'recharts';
import { Sale, Product, ShopSettings, PaymentMethod } from '../../types';
import { formatCurrency, formatDateTime, formatDate, getCategoryLabel, getPaymentMethodInfo } from '../../utils/formatters';
import { canonicalCategory } from '../../data/categoryTaxonomy';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';

interface SaleKpiReportProps {
  sales: Sale[];
  rawSales?: Sale[];
  products: Product[];
  allProducts?: Product[];
  settings: ShopSettings;
  timeframeLabel: string;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  onViewInvoice?: (sale: Sale) => void;
}

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#64748b'];

export type CategoryTargetType = 'sales' | 'profit_margin' | 'profit_amount';

export const DEFAULT_CATEGORY_TARGET_TYPES: Record<string, CategoryTargetType> = {
  brand_new_phones: 'sales',
  pre_owned_phones: 'sales',
  accessories_gadgets: 'profit_margin',
  cookware: 'profit_margin',
  sim_cards: 'sales',
};

export const DEFAULT_CATEGORY_TARGETS: Record<string, number> = {
  brand_new_phones: 10000000,
  pre_owned_phones: 4000000,
  accessories_gadgets: 3000000,
  cookware: 2000000,
  sim_cards: 1000000,
};

export const DEFAULT_CATEGORY_MARGIN_TARGETS: Record<string, number> = {
  brand_new_phones: 8, // 8% profit margin
  pre_owned_phones: 20, // 20% profit margin
  accessories_gadgets: 45, // 45% profit margin
  cookware: 35,
  sim_cards: 25,
};

export const DEFAULT_CATEGORY_PROFIT_TARGETS: Record<string, number> = {
  brand_new_phones: 800000,
  pre_owned_phones: 800000,
  accessories_gadgets: 1350000,
  cookware: 700000,
  sim_cards: 250000,
};

const getCategoryIcon = (categoryKey: string) => {
  const cat = categoryKey.toLowerCase();
  if (cat.includes('phone') || cat.includes('mobile')) return Smartphone;
  if (cat.includes('access') || cat.includes('gadget') || cat.includes('audio') || cat.includes('headphone')) return Headphones;
  if (cat.includes('cook') || cat.includes('kitchen')) return Utensils;
  if (cat.includes('sim')) return CreditCard;
  return Tag;
};

export const SaleKpiReport: React.FC<SaleKpiReportProps> = ({
  sales,
  rawSales,
  products,
  allProducts,
  settings,
  timeframeLabel,
  selectedCategory = 'all',
  onSelectCategory,
  onViewInvoice,
}) => {
  const [activeKpiTab, setActiveKpiTab] = useState<'overview' | 'trends' | 'categories' | 'hourly_traffic' | 'staff_leaderboard' | 'payment_mix'>('overview');
  const [isKpiDropdownOpen, setIsKpiDropdownOpen] = useState<boolean>(false);
  const kpiDropdownRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cashierFilter, setCashierFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');
  const [salesTarget, setSalesTarget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('monthly_sales_target_amount');
      if (saved) return Number(saved) || 20000000;
    } catch {}
    return 20000000; // Default 20,000,000 Ks
  });
  const [isEditingTarget, setIsEditingTarget] = useState<boolean>(false);
  const [tempTarget, setTempTarget] = useState<string>(String(salesTarget));

  // Category Target Basis: 'sales' (Total Sales Amount) | 'profit_margin' (Profit Margin %) | 'profit_amount' (Gross Profit Amount)
  const [categoryTargetTypes, setCategoryTargetTypes] = useState<Record<string, CategoryTargetType>>(() => {
    try {
      const saved = localStorage.getItem('category_target_types');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...DEFAULT_CATEGORY_TARGET_TYPES, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_CATEGORY_TARGET_TYPES;
  });

  // Category-specific targets state: Total Sales Amount
  const [categorySalesTargets, setCategorySalesTargets] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('category_sales_targets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...DEFAULT_CATEGORY_TARGETS, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_CATEGORY_TARGETS;
  });

  // Category-specific targets state: Profit Margin %
  const [categoryMarginTargets, setCategoryMarginTargets] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('category_margin_targets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...DEFAULT_CATEGORY_MARGIN_TARGETS, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_CATEGORY_MARGIN_TARGETS;
  });

  // Category-specific targets state: Gross Profit Amount
  const [categoryProfitTargets, setCategoryProfitTargets] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('category_profit_targets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...DEFAULT_CATEGORY_PROFIT_TARGETS, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_CATEGORY_PROFIT_TARGETS;
  });

  // Checkable categories filter set
  const [checkedCategories, setCheckedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('kpi_checked_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return new Set(parsed.map(k => canonicalCategory(k)));
        }
      }
    } catch {}
    return new Set(['brand_new_phones', 'pre_owned_phones', 'accessories_gadgets', 'cookware', 'sim_cards']);
  });

  // Target view mode: 'categories' (Checkable Category Targets) vs 'overall' (Store-wide Target)
  const [targetViewMode, setTargetViewMode] = useState<'categories' | 'overall'>('categories');

  // Inline editing state for individual category target
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [tempCategoryTarget, setTempCategoryTarget] = useState<string>('');

  // Category Target Manager modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [draftCategoryTargetTypes, setDraftCategoryTargetTypes] = useState<Record<string, CategoryTargetType>>({});
  const [draftCategorySalesTargets, setDraftCategorySalesTargets] = useState<Record<string, number>>({});
  const [draftCategoryMarginTargets, setDraftCategoryMarginTargets] = useState<Record<string, number>>({});
  const [draftCategoryProfitTargets, setDraftCategoryProfitTargets] = useState<Record<string, number>>({});

  // Category filter for checkable display
  const [categoryStatusQuickFilter, setCategoryStatusQuickFilter] = useState<'all' | 'behind' | 'achieved'>('all');
  const [categoryBasisQuickFilter, setCategoryBasisQuickFilter] = useState<'all' | 'sales' | 'profit_margin' | 'profit_amount'>('all');

  // Save store sales target
  const handleSaveTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(tempTarget);
    if (val > 0) {
      setSalesTarget(val);
      try {
        localStorage.setItem('monthly_sales_target_amount', String(val));
      } catch {}
    }
    setIsEditingTarget(false);
  };

  // Change target type for a category
  const handleSetCategoryTargetType = (catKey: string, type: CategoryTargetType) => {
    setCategoryTargetTypes(prev => {
      const next = { ...prev, [catKey]: type };
      try {
        localStorage.setItem('category_target_types', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Save individual category target amount
  const handleSaveCategoryTarget = (catKey: string, amount: number, type: CategoryTargetType) => {
    if (amount >= 0) {
      if (type === 'sales') {
        setCategorySalesTargets(prev => {
          const next = { ...prev, [catKey]: amount };
          try { localStorage.setItem('category_sales_targets', JSON.stringify(next)); } catch {}
          return next;
        });
      } else if (type === 'profit_margin') {
        setCategoryMarginTargets(prev => {
          const next = { ...prev, [catKey]: amount };
          try { localStorage.setItem('category_margin_targets', JSON.stringify(next)); } catch {}
          return next;
        });
      } else {
        setCategoryProfitTargets(prev => {
          const next = { ...prev, [catKey]: amount };
          try { localStorage.setItem('category_profit_targets', JSON.stringify(next)); } catch {}
          return next;
        });
      }
    }
    setEditingCategoryKey(null);
  };

  const handleOpenCategoryModal = () => {
    setDraftCategoryTargetTypes({ ...categoryTargetTypes });
    setDraftCategorySalesTargets({ ...categorySalesTargets });
    setDraftCategoryMarginTargets({ ...categoryMarginTargets });
    setDraftCategoryProfitTargets({ ...categoryProfitTargets });
    setIsCategoryModalOpen(true);
  };

  const handleSaveAllCategoryTargets = () => {
    setCategoryTargetTypes(draftCategoryTargetTypes);
    setCategorySalesTargets(draftCategorySalesTargets);
    setCategoryMarginTargets(draftCategoryMarginTargets);
    setCategoryProfitTargets(draftCategoryProfitTargets);
    try {
      localStorage.setItem('category_target_types', JSON.stringify(draftCategoryTargetTypes));
      localStorage.setItem('category_sales_targets', JSON.stringify(draftCategorySalesTargets));
      localStorage.setItem('category_margin_targets', JSON.stringify(draftCategoryMarginTargets));
      localStorage.setItem('category_profit_targets', JSON.stringify(draftCategoryProfitTargets));
    } catch {}
    setIsCategoryModalOpen(false);
  };

  const handleSetAllDraftTypes = (type: CategoryTargetType) => {
    const updated: Record<string, CategoryTargetType> = {};
    Object.keys(draftCategorySalesTargets).forEach(k => {
      updated[k] = type;
    });
    setDraftCategoryTargetTypes(prev => ({ ...prev, ...updated }));
  };

  const handleDistributeStoreTarget = () => {
    const keys = Object.keys(draftCategorySalesTargets);
    if (keys.length === 0) return;
    const perCat = Math.round(salesTarget / keys.length);
    const updated: Record<string, number> = {};
    keys.forEach(k => {
      updated[k] = perCat;
    });
    setDraftCategorySalesTargets(updated);
  };

  const handleResetDefaultCategoryTargets = () => {
    setDraftCategoryTargetTypes({ ...DEFAULT_CATEGORY_TARGET_TYPES });
    setDraftCategorySalesTargets({ ...DEFAULT_CATEGORY_TARGETS });
    setDraftCategoryMarginTargets({ ...DEFAULT_CATEGORY_MARGIN_TARGETS });
    setDraftCategoryProfitTargets({ ...DEFAULT_CATEGORY_PROFIT_TARGETS });
  };

  const toggleCategoryCheck = (catKey: string) => {
    setCheckedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) {
        next.delete(catKey);
      } else {
        next.add(catKey);
      }
      try {
        localStorage.setItem('kpi_checked_categories', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleCheckAllCategories = (allCats: string[]) => {
    const next = new Set(allCats);
    setCheckedCategories(next);
    try {
      localStorage.setItem('kpi_checked_categories', JSON.stringify(Array.from(next)));
    } catch {}
  };

  const handleUncheckAllCategories = () => {
    const next = new Set<string>();
    setCheckedCategories(next);
    try {
      localStorage.setItem('kpi_checked_categories', JSON.stringify([]));
    } catch {}
  };

  // Extract unique cashiers
  const cashierList = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => {
      if (s.soldBy) set.add(s.soldBy);
    });
    return Array.from(set).sort();
  }, [sales]);

  // Core KPI Calculations
  const kpis = useMemo(() => {
    let grossSales = 0;
    let totalDiscounts = 0;
    let refundedSales = 0;
    let completedInvoices = 0;
    let refundedInvoices = 0;
    let totalCostOfGoods = 0;
    let totalUnitsSold = 0;
    let totalBalanceDue = 0;
    let totalTax = 0;

    // Staff Performance Map
    const staffMap: Record<string, {
      name: string;
      revenue: number;
      invoices: number;
      units: number;
      cogs: number;
      profit: number;
      discounts: number;
    }> = {};

    // Payment method distribution
    const paymentMap: Record<string, { method: string; count: number; total: number }> = {};

    // Category distribution
    const categoryMap: Record<string, { category: string; revenue: number; units: number; cogs: number }> = {};

    // Daily Sales Timeline aggregation
    const dailyMap: Record<string, { date: string; displayDate: string; revenue: number; profit: number; cogs: number; invoices: number; units: number }> = {};

    // Hourly Heatmap distribution (0 to 23)
    const hourlyMap: Record<number, { hour: number; hourLabel: string; revenue: number; count: number }> = {};
    for (let h = 8; h <= 22; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      hourlyMap[h] = {
        hour: h,
        hourLabel: `${displayH} ${ampm}`,
        revenue: 0,
        count: 0
      };
    }

    // Day of Week map (0 = Sun, 1 = Mon ... 6 = Sat)
    const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dowMap: Record<number, { day: string; revenue: number; invoices: number }> = {};
    dowNames.forEach((d, idx) => {
      dowMap[idx] = { day: d, revenue: 0, invoices: 0 };
    });

    // Ticket Size Brackets
    const ticketBrackets = {
      under50k: { label: '< 50,000 Ks', count: 0, revenue: 0 },
      under200k: { label: '50k - 200k Ks', count: 0, revenue: 0 },
      under500k: { label: '200k - 500k Ks', count: 0, revenue: 0 },
      under1m: { label: '500k - 1,000,000 Ks', count: 0, revenue: 0 },
      over1m: { label: '1,000,000+ Ks', count: 0, revenue: 0 },
    };

    sales.forEach(sale => {
      const isCompleted = sale.status === 'completed';
      const isRefunded = sale.status === 'refunded';

      if (isCompleted) {
        completedInvoices++;
        grossSales += sale.grandTotal;
        totalDiscounts += sale.discountTotal || 0;
        totalBalanceDue += sale.balanceDue || 0;
        totalTax += sale.taxTotal || 0;

        // COGS & Units
        let saleCogs = 0;
        sale.items.forEach(item => {
          const qty = item.quantity || 1;
          totalUnitsSold += qty;
          const unitCost = item.costPrice || 0;
          const lineCost = unitCost * qty;
          saleCogs += lineCost;

          // Category map
          const cat = canonicalCategory(item.category || 'accessories_gadgets');
          if (!categoryMap[cat]) {
            categoryMap[cat] = { category: cat, revenue: 0, units: 0, cogs: 0 };
          }
          categoryMap[cat].revenue += item.finalPrice || (item.unitPrice * qty);
          categoryMap[cat].units += qty;
          categoryMap[cat].cogs += lineCost;
        });

        totalCostOfGoods += saleCogs;
        const saleProfit = sale.grandTotal - saleCogs;

        // Staff stats
        const staff = sale.soldBy || 'Admin';
        if (!staffMap[staff]) {
          staffMap[staff] = {
            name: staff,
            revenue: 0,
            invoices: 0,
            units: 0,
            cogs: 0,
            profit: 0,
            discounts: 0,
          };
        }
        staffMap[staff].revenue += sale.grandTotal;
        staffMap[staff].invoices += 1;
        staffMap[staff].units += sale.items.reduce((s, i) => s + i.quantity, 0);
        staffMap[staff].cogs += saleCogs;
        staffMap[staff].profit += saleProfit;
        staffMap[staff].discounts += sale.discountTotal || 0;

        // Payment mix
        const payMethod = sale.paymentMethod || 'cash';
        if (!paymentMap[payMethod]) {
          paymentMap[payMethod] = { method: payMethod, count: 0, total: 0 };
        }
        paymentMap[payMethod].count += 1;
        paymentMap[payMethod].total += sale.grandTotal;

        // Date breakdown
        const dateKey = sale.date.slice(0, 10);
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: dateKey,
            displayDate: formatDate(sale.date),
            revenue: 0,
            profit: 0,
            cogs: 0,
            invoices: 0,
            units: 0,
          };
        }
        dailyMap[dateKey].revenue += sale.grandTotal;
        dailyMap[dateKey].profit += saleProfit;
        dailyMap[dateKey].cogs += saleCogs;
        dailyMap[dateKey].invoices += 1;
        dailyMap[dateKey].units += sale.items.reduce((s, i) => s + i.quantity, 0);

        // Hourly heat
        const saleDateObj = new Date(sale.date);
        const saleHour = saleDateObj.getHours();
        if (hourlyMap[saleHour]) {
          hourlyMap[saleHour].revenue += sale.grandTotal;
          hourlyMap[saleHour].count += 1;
        }

        // Day of week
        const dow = saleDateObj.getDay();
        if (dowMap[dow]) {
          dowMap[dow].revenue += sale.grandTotal;
          dowMap[dow].invoices += 1;
        }

        // Ticket bracket
        if (sale.grandTotal < 50000) {
          ticketBrackets.under50k.count++;
          ticketBrackets.under50k.revenue += sale.grandTotal;
        } else if (sale.grandTotal < 200000) {
          ticketBrackets.under200k.count++;
          ticketBrackets.under200k.revenue += sale.grandTotal;
        } else if (sale.grandTotal < 500000) {
          ticketBrackets.under500k.count++;
          ticketBrackets.under500k.revenue += sale.grandTotal;
        } else if (sale.grandTotal < 1000000) {
          ticketBrackets.under1m.count++;
          ticketBrackets.under1m.revenue += sale.grandTotal;
        } else {
          ticketBrackets.over1m.count++;
          ticketBrackets.over1m.revenue += sale.grandTotal;
        }

      } else if (isRefunded) {
        refundedInvoices++;
        refundedSales += sale.grandTotal;
      }
    });

    const netSales = grossSales; // Net revenue from completed transactions
    const grossProfit = Math.max(0, netSales - totalCostOfGoods);
    const grossMarginPercent = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
    const markupPercent = totalCostOfGoods > 0 ? (grossProfit / totalCostOfGoods) * 100 : 0;
    const aov = completedInvoices > 0 ? netSales / completedInvoices : 0;
    const avgUnitsPerTransaction = completedInvoices > 0 ? totalUnitsSold / completedInvoices : 0;
    const avgPricePerUnit = totalUnitsSold > 0 ? netSales / totalUnitsSold : 0;
    const discountRatePercent = (netSales + totalDiscounts) > 0 ? (totalDiscounts / (netSales + totalDiscounts)) * 100 : 0;
    const totalTransactions = completedInvoices + refundedInvoices;
    const refundRatePercent = totalTransactions > 0 ? (refundedInvoices / totalTransactions) * 100 : 0;

    // Daily trend array sorted by date
    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Staff Leaderboard array sorted by revenue
    const staffLeaderboard = Object.values(staffMap).map(st => ({
      ...st,
      marginPercent: st.revenue > 0 ? (st.profit / st.revenue) * 100 : 0,
      aov: st.invoices > 0 ? st.revenue / st.invoices : 0,
      revenueShare: netSales > 0 ? (st.revenue / netSales) * 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    // Payment Breakdown array sorted by volume
    const paymentBreakdown = Object.values(paymentMap).map(p => ({
      ...p,
      sharePercent: netSales > 0 ? (p.total / netSales) * 100 : 0,
    })).sort((a, b) => b.total - a.total);

    // Category Breakdown array sorted by revenue
    const categoryBreakdown = Object.values(categoryMap).map(c => {
      const profit = Math.max(0, c.revenue - c.cogs);
      return {
        ...c,
        profit,
        marginPercent: c.revenue > 0 ? (profit / c.revenue) * 100 : 0,
        sharePercent: netSales > 0 ? (c.revenue / netSales) * 100 : 0,
        avgPricePerUnit: c.units > 0 ? c.revenue / c.units : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Hourly Heatmap array
    const hourlyTraffic = Object.values(hourlyMap).sort((a, b) => a.hour - b.hour);

    // Day of Week array
    const dowTraffic = Object.values(dowMap);

    // Target Achievement %
    const targetAchievementPct = salesTarget > 0 ? Math.min(200, (netSales / salesTarget) * 100) : 0;
    const remainingToTarget = Math.max(0, salesTarget - netSales);

    return {
      grossSales,
      netSales,
      totalCostOfGoods,
      grossProfit,
      grossMarginPercent,
      markupPercent,
      completedInvoices,
      refundedInvoices,
      refundedSales,
      totalTransactions,
      refundRatePercent,
      totalDiscounts,
      discountRatePercent,
      totalBalanceDue,
      totalUnitsSold,
      aov,
      avgUnitsPerTransaction,
      avgPricePerUnit,
      dailyTrend,
      staffLeaderboard,
      paymentBreakdown,
      categoryBreakdown,
      hourlyTraffic,
      dowTraffic,
      ticketBrackets: Object.values(ticketBrackets),
      targetAchievementPct,
      remainingToTarget,
    };
  }, [sales, salesTarget]);

  // Complete category performance list with targets, checkable status, and metrics
  const categoryKpiPerformance = useMemo(() => {
    const actualsMap = new Map<string, { revenue: number; profit: number; units: number; cogs: number; sharePercent: number; marginPercent: number }>();
    
    kpis.categoryBreakdown.forEach(c => {
      actualsMap.set(c.category, {
        revenue: c.revenue,
        profit: c.profit,
        units: c.units,
        cogs: c.cogs,
        sharePercent: c.sharePercent,
        marginPercent: c.marginPercent,
      });
    });

    const allCategoryKeys = new Set<string>([
      'brand_new_phones',
      'pre_owned_phones',
      'accessories_gadgets',
      'cookware',
      'sim_cards',
      ...Array.from(actualsMap.keys()).map(k => canonicalCategory(k)),
    ]);

    return Array.from(allCategoryKeys).map(catKey => {
      const actual = actualsMap.get(catKey) || {
        revenue: 0,
        profit: 0,
        units: 0,
        cogs: 0,
        sharePercent: 0,
        marginPercent: 0,
      };

      const targetType: CategoryTargetType = categoryTargetTypes[catKey] ?? DEFAULT_CATEGORY_TARGET_TYPES[catKey] ?? 'sales';
      const salesTargetVal = categorySalesTargets[catKey] ?? DEFAULT_CATEGORY_TARGETS[catKey] ?? 2000000;
      const marginTargetVal = categoryMarginTargets[catKey] ?? DEFAULT_CATEGORY_MARGIN_TARGETS[catKey] ?? 25;
      const profitTargetVal = categoryProfitTargets[catKey] ?? DEFAULT_CATEGORY_PROFIT_TARGETS[catKey] ?? 800000;

      let targetVal = salesTargetVal;
      let actualVal = actual.revenue;
      let unit = settings.currencySymbol;
      let targetFormatted = '';
      let actualFormatted = '';
      let gapFormatted = '';
      let isBehind = false;
      let achievementPct = 0;

      if (targetType === 'sales') {
        targetVal = salesTargetVal;
        actualVal = actual.revenue;
        unit = settings.currencySymbol;
        achievementPct = targetVal > 0 ? (actualVal / targetVal) * 100 : 0;
        targetFormatted = formatCurrency(targetVal, settings.currencySymbol);
        actualFormatted = formatCurrency(actualVal, settings.currencySymbol);
        const rem = Math.max(0, targetVal - actualVal);
        const sur = Math.max(0, actualVal - targetVal);
        gapFormatted = rem > 0 ? `Need ${formatCurrency(rem, settings.currencySymbol)}` : `Surplus: +${formatCurrency(sur, settings.currencySymbol)}`;
        isBehind = actualVal < targetVal;
      } else if (targetType === 'profit_margin') {
        targetVal = marginTargetVal;
        actualVal = actual.marginPercent;
        unit = '%';
        achievementPct = targetVal > 0 ? (actualVal / targetVal) * 100 : 0;
        targetFormatted = `${targetVal.toFixed(1)}% margin`;
        actualFormatted = `${actualVal.toFixed(1)}% margin`;
        const diff = actualVal - targetVal;
        gapFormatted = diff < 0 ? `Gap: ${diff.toFixed(1)}% margin` : `Surplus: +${diff.toFixed(1)}% margin`;
        isBehind = diff < 0;
      } else {
        // profit_amount
        targetVal = profitTargetVal;
        actualVal = actual.profit;
        unit = settings.currencySymbol;
        achievementPct = targetVal > 0 ? (actualVal / targetVal) * 100 : 0;
        targetFormatted = formatCurrency(targetVal, settings.currencySymbol);
        actualFormatted = formatCurrency(actualVal, settings.currencySymbol);
        const rem = Math.max(0, targetVal - actualVal);
        const sur = Math.max(0, actualVal - targetVal);
        gapFormatted = rem > 0 ? `Need ${formatCurrency(rem, settings.currencySymbol)}` : `Surplus: +${formatCurrency(sur, settings.currencySymbol)}`;
        isBehind = actualVal < targetVal;
      }

      const isChecked = checkedCategories.has(catKey);

      let status: 'achieved' | 'on_track' | 'behind' = 'behind';
      if (achievementPct >= 100) {
        status = 'achieved';
      } else if (achievementPct >= 70) {
        status = 'on_track';
      }

      return {
        category: catKey,
        label: getCategoryLabel(catKey),
        targetType,
        target: targetVal,
        salesTarget: salesTargetVal,
        marginTarget: marginTargetVal,
        profitTarget: profitTargetVal,
        actual: actualVal,
        unit,
        targetFormatted,
        actualFormatted,
        gapFormatted,
        isBehind,
        revenue: actual.revenue,
        profit: actual.profit,
        units: actual.units,
        cogs: actual.cogs,
        sharePercent: actual.sharePercent,
        marginPercent: actual.marginPercent,
        achievementPct,
        status,
        isChecked,
      };
    }).sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.target - a.target;
    });
  }, [kpis.categoryBreakdown, categoryTargetTypes, categorySalesTargets, categoryMarginTargets, categoryProfitTargets, checkedCategories, settings.currencySymbol]);

  // Aggregated KPI & Target summary for checked categories
  const checkedCategoriesSummary = useMemo(() => {
    const checkedItems = categoryKpiPerformance.filter(c => c.isChecked);
    const totalCheckedRevenue = checkedItems.reduce((sum, c) => sum + c.revenue, 0);
    const totalCheckedProfit = checkedItems.reduce((sum, c) => sum + c.profit, 0);
    const totalCheckedUnits = checkedItems.reduce((sum, c) => sum + c.units, 0);
    const overallMarginPercent = totalCheckedRevenue > 0 ? (totalCheckedProfit / totalCheckedRevenue) * 100 : 0;

    const salesItems = checkedItems.filter(c => c.targetType === 'sales');
    const marginItems = checkedItems.filter(c => c.targetType === 'profit_margin');
    const profitItems = checkedItems.filter(c => c.targetType === 'profit_amount');

    const totalSalesTarget = salesItems.reduce((sum, c) => sum + c.target, 0);
    const totalSalesActual = salesItems.reduce((sum, c) => sum + c.revenue, 0);
    const salesPacing = totalSalesTarget > 0 ? (totalSalesActual / totalSalesTarget) * 100 : 0;

    const avgAchievementPct = checkedItems.length > 0 
      ? checkedItems.reduce((sum, c) => sum + c.achievementPct, 0) / checkedItems.length 
      : 0;

    const achievedCount = checkedItems.filter(c => c.status === 'achieved').length;
    const onTrackCount = checkedItems.filter(c => c.status === 'on_track').length;
    const behindCount = checkedItems.filter(c => c.status === 'behind').length;

    return {
      count: checkedItems.length,
      totalRevenue: totalCheckedRevenue,
      totalProfit: totalCheckedProfit,
      totalUnits: totalCheckedUnits,
      overallMarginPercent,
      salesCount: salesItems.length,
      marginCount: marginItems.length,
      profitCount: profitItems.length,
      totalSalesTarget,
      totalSalesActual,
      salesPacing,
      avgAchievementPct,
      achievedCount,
      onTrackCount,
      behindCount,
    };
  }, [categoryKpiPerformance]);

  // Analytics sub-views configuration
  const kpiTabOptions = useMemo(() => [
    {
      id: 'overview' as const,
      label: 'Revenue & Profit Trends',
      icon: TrendingUp,
      badge: undefined,
    },
    {
      id: 'categories' as const,
      label: 'Category KPIs & Margins',
      icon: Tag,
      badge: `${kpis.categoryBreakdown.length} Categories`,
    },
    {
      id: 'hourly_traffic' as const,
      label: 'Peak Hours & Traffic Heatmap',
      icon: Clock,
      badge: 'Heatmap',
    },
    {
      id: 'staff_leaderboard' as const,
      label: 'Staff Sales Leaderboard',
      icon: Award,
      badge: `${kpis.staffLeaderboard.length} Cashiers`,
    },
    {
      id: 'payment_mix' as const,
      label: 'Payment Channel Mix',
      icon: CreditCard,
      badge: `${kpis.paymentBreakdown.length} Methods`,
    },
  ], [kpis.categoryBreakdown.length, kpis.staffLeaderboard.length, kpis.paymentBreakdown.length]);

  const activeKpiOption = useMemo(() => {
    return kpiTabOptions.find(opt => opt.id === activeKpiTab) || kpiTabOptions[0];
  }, [kpiTabOptions, activeKpiTab]);

  const activeKpiIndex = useMemo(() => {
    return kpiTabOptions.findIndex(opt => opt.id === activeKpiTab);
  }, [kpiTabOptions, activeKpiTab]);

  const handlePrevKpiTab = () => {
    const prev = activeKpiIndex > 0 ? activeKpiIndex - 1 : kpiTabOptions.length - 1;
    setActiveKpiTab(kpiTabOptions[prev].id);
  };

  const handleNextKpiTab = () => {
    const next = activeKpiIndex < kpiTabOptions.length - 1 ? activeKpiIndex + 1 : 0;
    setActiveKpiTab(kpiTabOptions[next].id);
  };

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (kpiDropdownRef.current && !kpiDropdownRef.current.contains(e.target as Node)) {
        setIsKpiDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsKpiDropdownOpen(false);
      }
    };
    if (isKpiDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isKpiDropdownOpen]);

  // Filtered Sales for Drilldown Table
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (cashierFilter !== 'all' && s.soldBy !== cashierFilter) return false;
      if (paymentFilter !== 'all' && s.paymentMethod !== paymentFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesInvoice = s.invoiceNumber.toLowerCase().includes(q);
        const matchesCust = s.customerName ? s.customerName.toLowerCase().includes(q) : false;
        const matchesCashier = s.soldBy.toLowerCase().includes(q);
        const matchesItem = s.items.some(i => i.name.toLowerCase().includes(q));
        if (!matchesInvoice && !matchesCust && !matchesCashier && !matchesItem) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, statusFilter, cashierFilter, paymentFilter, searchQuery]);

  // Export handlers
  const handleExportPdf = () => {
    const headers = ['Staff / Cashier', 'Completed Invoices', 'Units Sold', 'Total Revenue', 'Gross Profit', 'Margin %', 'Revenue Share %'];
    const rows = kpis.staffLeaderboard.map(st => [
      st.name,
      String(st.invoices),
      String(st.units),
      formatCurrency(st.revenue, settings.currencySymbol),
      formatCurrency(st.profit, settings.currencySymbol),
      `${st.marginPercent.toFixed(1)}%`,
      `${st.revenueShare.toFixed(1)}%`
    ]);

    exportReportToPdf({
      title: 'Sales Performance & Executive KPI Report',
      subtitle: `Timeframe: ${timeframeLabel} | Net Sales: ${formatCurrency(kpis.netSales, settings.currencySymbol)} | Gross Profit: ${formatCurrency(kpis.grossProfit, settings.currencySymbol)} (${kpis.grossMarginPercent.toFixed(1)}%)`,
      filename: `sales_kpi_report_${timeframeLabel.replace(/\s+/g, '_')}`,
      headers,
      rows,
      settings,
      orientation: 'landscape',
    });
  };

  const handleExportCsv = () => {
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Report Timeframe', timeframeLabel],
      ['Gross Sales Revenue', kpis.grossSales],
      ['Total Cost of Goods (COGS)', kpis.totalCostOfGoods],
      ['Gross Profit', kpis.grossProfit],
      ['Gross Profit Margin %', `${kpis.grossMarginPercent.toFixed(2)}%`],
      ['Total Completed Invoices', kpis.completedInvoices],
      ['Average Order Value (AOV)', kpis.aov],
      ['Total Units Sold', kpis.totalUnitsSold],
      ['Average Units Per Basket', kpis.avgUnitsPerTransaction.toFixed(2)],
      ['Discounts Granted', kpis.totalDiscounts],
      ['Discount Rate %', `${kpis.discountRatePercent.toFixed(2)}%`],
      ['Refunded Invoices', kpis.refundedInvoices],
      ['Refunded Amount', kpis.refundedSales],
      ['Refund Rate %', `${kpis.refundRatePercent.toFixed(2)}%`],
      ['Store-Wide Sales Target', salesTarget],
      ['Store Target Achievement %', `${kpis.targetAchievementPct.toFixed(1)}%`]
    ];

    categoryKpiPerformance.forEach(cat => {
      rows.push([`Category Target [${cat.label}]`, cat.target]);
      rows.push([`Category Net Sales [${cat.label}]`, cat.revenue]);
      rows.push([`Category Target Achievement % [${cat.label}]`, `${cat.achievementPct.toFixed(1)}%`]);
      rows.push([`Category Target Status [${cat.label}]`, cat.status]);
      rows.push([`Category Checked in KPI Analysis [${cat.label}]`, cat.isChecked ? 'YES' : 'NO']);
    });

    exportToCsv(`sales_kpi_summary_${timeframeLabel.replace(/\s+/g, '_')}`, headers, rows);
  };

  return (
    <div id="sale-kpi-report-container" className="space-y-6">
      
      {/* Header Bar with Target Tracker & Action Buttons */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">
                    Sales Performance & KPI Analytics
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                    <Target className="w-3 h-3 text-indigo-600" />
                    Per-Category Targets Active
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Comprehensive sales metrics, checkable category target pacing, cashier leaderboards, and peak shopping hours for <span className="font-bold text-slate-700">{timeframeLabel}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleOpenCategoryModal}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Category Targets ({categoryKpiPerformance.length})</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* View Switcher: Checkable Category Targets vs Store-Wide Total Target */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTargetViewMode('categories')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                targetViewMode === 'categories'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-indigo-600" />
              <span>Category Target Analytics</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-indigo-100 text-indigo-700 font-black">
                {checkedCategories.size}/{categoryKpiPerformance.length} Checked
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTargetViewMode('overall')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                targetViewMode === 'overall'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              <span>Store-Wide Target</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-slate-200 text-slate-700 font-bold">
                {kpis.targetAchievementPct.toFixed(0)}%
              </span>
            </button>
          </div>

          {targetViewMode === 'categories' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium hidden sm:inline">Selection:</span>
              <button
                type="button"
                onClick={() => handleCheckAllCategories(categoryKpiPerformance.map(c => c.category))}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                <CheckSquare className="w-3 h-3 text-indigo-600" />
                <span>Select All</span>
              </button>
              <button
                type="button"
                onClick={handleUncheckAllCategories}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3" />
                <span>Clear All</span>
              </button>
            </div>
          )}
        </div>

        {/* 1. CHECKABLE CATEGORY TARGETS VIEW */}
        {targetViewMode === 'categories' ? (
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border border-indigo-900/60 space-y-4">
            
            {/* Top Bar for Category Target Tracker */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-indigo-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-indigo-200">Category-Level Quota & KPI Analysis</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-400/20 text-indigo-200 border border-indigo-300/20">
                      Checkable & Multi-Metric Target
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-300/80">
                    Target each category based on <strong>Total Sales Amount</strong>, <strong>Profit Margin %</strong>, or <strong>Gross Profit</strong>. Check or uncheck categories to calculate aggregate performance.
                  </p>
                </div>
              </div>

              {/* Quick Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Metric Basis Quick Filter */}
                <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-indigo-900/60">
                  <span className="text-[9px] uppercase font-bold text-indigo-300 px-1.5">Basis:</span>
                  <button
                    type="button"
                    onClick={() => setCategoryBasisQuickFilter('all')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      categoryBasisQuickFilter === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-indigo-300 hover:text-white'
                    }`}
                  >
                    All ({categoryKpiPerformance.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryBasisQuickFilter('sales')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      categoryBasisQuickFilter === 'sales'
                        ? 'bg-indigo-600 text-white'
                        : 'text-indigo-300 hover:text-white'
                    }`}
                    title="Categories targeted on Total Sales Amount"
                  >
                    Sales ({categoryKpiPerformance.filter(c => c.targetType === 'sales').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryBasisQuickFilter('profit_margin')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      categoryBasisQuickFilter === 'profit_margin'
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-300 hover:text-white'
                    }`}
                    title="Categories targeted on Profit Margin %"
                  >
                    Margin % ({categoryKpiPerformance.filter(c => c.targetType === 'profit_margin').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryBasisQuickFilter('profit_amount')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      categoryBasisQuickFilter === 'profit_amount'
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-300 hover:text-white'
                    }`}
                    title="Categories targeted on Gross Profit Amount"
                  >
                    Profit ({categoryKpiPerformance.filter(c => c.targetType === 'profit_amount').length})
                  </button>
                </div>

                {/* Status Quick Filter */}
                <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-indigo-900/60">
                  <span className="text-[9px] uppercase font-bold text-indigo-300 px-1.5">Status:</span>
                  <button
                    type="button"
                    onClick={() => setCategoryStatusQuickFilter('all')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      categoryStatusQuickFilter === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-indigo-300 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryStatusQuickFilter('behind')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      categoryStatusQuickFilter === 'behind'
                        ? 'bg-rose-600 text-white'
                        : 'text-rose-300 hover:text-white'
                    }`}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Behind ({categoryKpiPerformance.filter(c => c.status === 'behind').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryStatusQuickFilter('achieved')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      categoryStatusQuickFilter === 'achieved'
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-300 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Achieved ({categoryKpiPerformance.filter(c => c.status === 'achieved').length})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Aggregated KPI Metrics for Checked Categories */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-indigo-800/40">
              
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-300">Checked Sales Revenue</span>
                <div className="text-lg font-black text-white mt-0.5">
                  {formatCurrency(checkedCategoriesSummary.totalRevenue, settings.currencySymbol)}
                </div>
                <span className="text-[10px] text-indigo-300/80">
                  {checkedCategoriesSummary.count} of {categoryKpiPerformance.length} categories checked ({checkedCategoriesSummary.totalUnits.toLocaleString()} units)
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-300">Checked Gross Profit</span>
                <div className="text-lg font-black text-emerald-300 mt-0.5">
                  {formatCurrency(checkedCategoriesSummary.totalProfit, settings.currencySymbol)}
                </div>
                <span className="text-[10px] text-emerald-400 font-bold">
                  {checkedCategoriesSummary.overallMarginPercent.toFixed(1)}% blended margin
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-indigo-300">Avg Target Achievement</span>
                  <span className={`text-xs font-black ${
                    checkedCategoriesSummary.avgAchievementPct >= 100
                      ? 'text-emerald-400'
                      : checkedCategoriesSummary.avgAchievementPct >= 70
                      ? 'text-indigo-300'
                      : 'text-amber-400'
                  }`}>
                    {checkedCategoriesSummary.avgAchievementPct.toFixed(1)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-2 mt-1.5 overflow-hidden border border-indigo-700/30">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      checkedCategoriesSummary.avgAchievementPct >= 100
                        ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                        : checkedCategoriesSummary.avgAchievementPct >= 70
                        ? 'bg-gradient-to-r from-indigo-500 to-blue-400'
                        : 'bg-gradient-to-r from-amber-500 to-rose-400'
                    }`}
                    style={{ width: `${Math.min(100, checkedCategoriesSummary.avgAchievementPct)}%` }}
                  />
                </div>
                <span className="text-[10px] text-indigo-300/80 mt-1 block">
                  Average achievement across checked categories
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-300">Target Basis & Health</span>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {checkedCategoriesSummary.salesCount} Sales
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {checkedCategoriesSummary.marginCount} Margin %
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {checkedCategoriesSummary.profitCount} Profit
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-emerald-400">
                    {checkedCategoriesSummary.achievedCount} Achieved
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-[10px] font-bold text-blue-300">
                    {checkedCategoriesSummary.onTrackCount} On Track
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-[10px] font-bold text-rose-400">
                    {checkedCategoriesSummary.behindCount} Behind
                  </span>
                </div>
              </div>

            </div>

            {/* Checkable & Settable Category Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3 pt-1">
              {categoryKpiPerformance
                .filter(cat => {
                  if (categoryStatusQuickFilter === 'behind' && cat.status !== 'behind') return false;
                  if (categoryStatusQuickFilter === 'achieved' && cat.status !== 'achieved') return false;
                  if (categoryBasisQuickFilter !== 'all' && cat.targetType !== categoryBasisQuickFilter) return false;
                  return true;
                })
                .map(cat => {
                  const CategoryIcon = getCategoryIcon(cat.category);
                  const isEditingThis = editingCategoryKey === cat.category;

                  return (
                    <div
                      key={cat.category}
                      className={`p-3.5 rounded-xl border transition-all relative flex flex-col justify-between ${
                        cat.isChecked
                          ? 'bg-slate-900/90 border-indigo-500/60 shadow-xs ring-1 ring-indigo-500/30'
                          : 'bg-slate-900/40 border-indigo-900/30 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {/* Top row: Checkbox, Title, Status */}
                      <div>
                        <div className="flex items-start justify-between gap-1.5 pb-2 border-b border-indigo-900/40">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleCategoryCheck(cat.category)}
                              className="text-indigo-400 hover:text-white transition-colors cursor-pointer shrink-0"
                              title={cat.isChecked ? 'Uncheck category from KPI aggregate' : 'Check category for KPI aggregate'}
                            >
                              {cat.isChecked ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CategoryIcon className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                              <span className="text-xs font-bold text-white truncate" title={cat.label}>
                                {cat.label}
                              </span>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 ${
                            cat.status === 'achieved'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : cat.status === 'on_track'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}>
                            {cat.status === 'achieved' ? 'Achieved' : cat.status === 'on_track' ? 'On Track' : 'Behind'}
                          </span>
                        </div>

                        {/* Target Basis Selector Toggle */}
                        <div className="mt-2 flex items-center justify-between bg-slate-950/60 p-1 rounded-lg border border-indigo-900/50">
                          <span className="text-[9px] uppercase font-bold text-slate-400 pl-1">Target Base:</span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleSetCategoryTargetType(cat.category, 'sales')}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                                cat.targetType === 'sales'
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              title="Set target based on Total Sales Revenue"
                            >
                              Sales
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetCategoryTargetType(cat.category, 'profit_margin')}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                                cat.targetType === 'profit_margin'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              title="Set target based on Profit Margin %"
                            >
                              Margin %
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetCategoryTargetType(cat.category, 'profit_amount')}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                                cat.targetType === 'profit_amount'
                                  ? 'bg-amber-600 text-white shadow-xs'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              title="Set target based on Gross Profit Amount"
                            >
                              Profit
                            </button>
                          </div>
                        </div>

                        {/* Middle: Actual Performance Display */}
                        <div className="py-2 space-y-2">
                          <div>
                            {cat.targetType === 'sales' ? (
                              <>
                                <span className="text-[10px] uppercase font-bold text-indigo-300">Sales Revenue</span>
                                <div className="text-sm font-black text-white">
                                  {formatCurrency(cat.revenue, settings.currencySymbol)}
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {cat.units.toLocaleString()} units sold • {cat.marginPercent.toFixed(1)}% margin
                                </span>
                              </>
                            ) : cat.targetType === 'profit_margin' ? (
                              <>
                                <span className="text-[10px] uppercase font-bold text-emerald-300">Profit Margin %</span>
                                <div className="text-sm font-black text-emerald-300">
                                  {cat.marginPercent.toFixed(1)}% margin
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  Profit: {formatCurrency(cat.profit, settings.currencySymbol)} • Sales: {formatCurrency(cat.revenue, settings.currencySymbol)}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] uppercase font-bold text-amber-300">Gross Profit</span>
                                <div className="text-sm font-black text-amber-300">
                                  {formatCurrency(cat.profit, settings.currencySymbol)}
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {cat.marginPercent.toFixed(1)}% margin • Sales: {formatCurrency(cat.revenue, settings.currencySymbol)}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Settable Target Quota Box */}
                          <div className="bg-indigo-950/60 p-2 rounded-lg border border-indigo-800/40">
                            <div className="flex items-center justify-between text-[10px] font-bold text-indigo-300 mb-1">
                              <span>
                                {cat.targetType === 'sales'
                                  ? 'Sales Target Quota'
                                  : cat.targetType === 'profit_margin'
                                  ? 'Margin % Goal'
                                  : 'Gross Profit Target'}
                              </span>
                              {!isEditingThis && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTempCategoryTarget(String(cat.target));
                                    setEditingCategoryKey(cat.category);
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-white transition-colors cursor-pointer"
                                  title={`Set ${cat.targetType === 'sales' ? 'sales' : cat.targetType === 'profit_margin' ? 'margin %' : 'profit'} target`}
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                  <span>Set</span>
                                </button>
                              )}
                            </div>

                            {isEditingThis ? (
                              <div className="flex items-center gap-1">
                                <div className="relative w-full">
                                  <input
                                    type="number"
                                    autoFocus
                                    value={tempCategoryTarget}
                                    onChange={(e) => setTempCategoryTarget(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveCategoryTarget(cat.category, Number(tempCategoryTarget), cat.targetType);
                                      } else if (e.key === 'Escape') {
                                        setEditingCategoryKey(null);
                                      }
                                    }}
                                    className="w-full pl-2 pr-6 py-0.5 text-xs bg-slate-900 border border-indigo-400 rounded text-white font-semibold focus:outline-none"
                                    placeholder={cat.targetType === 'profit_margin' ? 'e.g. 25' : 'Target'}
                                  />
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none">
                                    {cat.unit}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSaveCategoryTarget(cat.category, Number(tempCategoryTarget), cat.targetType)}
                                  className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer shrink-0"
                                  title="Save Target"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryKey(null)}
                                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer shrink-0"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setTempCategoryTarget(String(cat.target));
                                  setEditingCategoryKey(cat.category);
                                }}
                                className="text-xs font-bold text-indigo-100 hover:text-white flex items-center justify-between w-full text-left group cursor-pointer"
                                title="Click to edit target"
                              >
                                <span>{cat.targetFormatted}</span>
                                <span className="text-[10px] text-indigo-400 group-hover:text-indigo-200">✎</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Progress Bar & Achievement Pacing */}
                      <div className="space-y-1 pt-1 border-t border-indigo-900/40">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-300">
                          <span>Pacing</span>
                          <span className={`font-bold ${
                            cat.achievementPct >= 100
                              ? 'text-emerald-400'
                              : cat.achievementPct >= 70
                              ? 'text-indigo-200'
                              : 'text-rose-400'
                          }`}>
                            {cat.achievementPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-indigo-900/40">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              cat.achievementPct >= 100
                                ? 'bg-emerald-400'
                                : cat.achievementPct >= 70
                                ? 'bg-indigo-400'
                                : 'bg-rose-400'
                            }`}
                            style={{ width: `${Math.min(100, cat.achievementPct)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {cat.gapFormatted}
                        </div>
                      </div>

                    </div>
                  );
                })}
            </div>

          </div>
        ) : (
          /* 2. OVERALL STORE TARGET VIEW */
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 rounded-2xl shadow-md border border-indigo-900/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-indigo-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center">
                  <Target className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <span className="text-xs font-bold text-indigo-200">Revenue Goal & Quota Tracker</span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white">
                      {formatCurrency(kpis.netSales, settings.currencySymbol)}
                    </span>
                    <span className="text-xs text-indigo-300 font-medium">of {formatCurrency(salesTarget, settings.currencySymbol)} Goal</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isEditingTarget ? (
                  <form onSubmit={handleSaveTarget} className="flex items-center gap-2">
                    <input
                      type="number"
                      value={tempTarget}
                      onChange={(e) => setTempTarget(e.target.value)}
                      className="w-36 px-2.5 py-1 text-xs bg-slate-800 border border-indigo-400 rounded-lg text-white font-semibold focus:outline-none"
                      placeholder="Enter target amount"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingTarget(false)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTempTarget(String(salesTarget));
                      setIsEditingTarget(true);
                    }}
                    className="flex items-center gap-1 text-xs text-indigo-300 hover:text-white bg-indigo-900/60 hover:bg-indigo-800/80 px-2.5 py-1 rounded-lg border border-indigo-700/50 transition-colors cursor-pointer"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Adjust Target</span>
                  </button>
                )}

                <div className="text-right pl-2 border-l border-indigo-800">
                  <span className="text-[10px] text-indigo-300 uppercase font-bold tracking-wider">Achievement</span>
                  <div className="text-sm font-black text-emerald-400">
                    {kpis.targetAchievementPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Goal Progress Bar */}
            <div className="mt-3 space-y-1.5">
              <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-indigo-700/30">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    kpis.targetAchievementPct >= 100 ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-gradient-to-r from-indigo-500 to-blue-400'
                  }`}
                  style={{ width: `${Math.min(100, kpis.targetAchievementPct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-indigo-300">
                <span>
                  {kpis.remainingToTarget > 0 ? (
                    <>Need <span className="font-bold text-amber-300">{formatCurrency(kpis.remainingToTarget, settings.currencySymbol)}</span> more to hit target</>
                  ) : (
                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Target achieved! Surplus of {formatCurrency(kpis.netSales - salesTarget, settings.currencySymbol)}
                    </span>
                  )}
                </span>
                <span>Target: {formatCurrency(salesTarget, settings.currencySymbol)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary KPI Summary Cards Strip (8-Card Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* 1. Net Sales Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Net Sales Revenue</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {formatCurrency(kpis.netSales, settings.currencySymbol)}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold mt-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{kpis.completedInvoices} completed sales</span>
          </div>
        </div>

        {/* 2. Gross Profit & Margin */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-purple-700">
            {formatCurrency(kpis.grossProfit, settings.currencySymbol)}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] font-bold mt-1">
            <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
              {kpis.grossMarginPercent.toFixed(1)}% Margin
            </span>
            <span className="text-slate-400 text-[10px]">({kpis.markupPercent.toFixed(1)}% Markup)</span>
          </div>
        </div>

        {/* 3. Average Order Value (AOV) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Avg Order Value (AOV)</span>
            <ShoppingBag className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {formatCurrency(kpis.aov, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            ~{kpis.avgUnitsPerTransaction.toFixed(1)} items / basket
          </p>
        </div>

        {/* 4. Units Sold */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Units Sold</span>
            <Tag className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {kpis.totalUnitsSold.toLocaleString()} <span className="text-sm font-normal text-slate-500">Units</span>
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Avg {formatCurrency(kpis.avgPricePerUnit, settings.currencySymbol)} / item
          </p>
        </div>

        {/* 5. Total Cost of Goods Sold (COGS) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total COGS</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-700">
            {formatCurrency(kpis.totalCostOfGoods, settings.currencySymbol)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Cost basis for sold inventory
          </p>
        </div>

        {/* 6. Discounts Granted */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Discounts</span>
            <Percent className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-700">
            {formatCurrency(kpis.totalDiscounts, settings.currencySymbol)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {kpis.discountRatePercent.toFixed(1)}% of gross sales
          </p>
        </div>

        {/* 7. Refund & Return Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-rose-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Refunds & Returns</span>
            <RotateCcw className={`w-4 h-4 ${kpis.refundedInvoices > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-lg sm:text-xl font-black ${kpis.refundedInvoices > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {formatCurrency(kpis.refundedSales, settings.currencySymbol)}
          </p>
          <p className={`text-[10px] font-bold mt-1 ${kpis.refundRatePercent > 5 ? 'text-rose-600' : 'text-slate-500'}`}>
            {kpis.refundedInvoices} orders ({kpis.refundRatePercent.toFixed(1)}% rate)
          </p>
        </div>

        {/* 8. Outstanding Receivables / Due */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-rose-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Balance Due</span>
            <AlertCircle className={`w-4 h-4 ${kpis.totalBalanceDue > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-lg sm:text-xl font-black ${kpis.totalBalanceDue > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {formatCurrency(kpis.totalBalanceDue, settings.currencySymbol)}
          </p>
          <p className={`text-[10px] font-bold mt-1 ${kpis.totalBalanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {kpis.totalBalanceDue > 0 ? 'Pending customer credit' : 'All fully settled'}
          </p>
        </div>

      </div>

      {/* Analytics Sub-View Dropdown (Minimalist Design) */}
      <div ref={kpiDropdownRef} className="relative z-20">
        <div className="flex items-center justify-between gap-3 bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
          
          {/* Dropdown Selector Button */}
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              id="kpi-subview-dropdown-trigger"
              onClick={() => setIsKpiDropdownOpen(prev => !prev)}
              aria-expanded={isKpiDropdownOpen}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-indigo-600 shrink-0 shadow-2xs">
                  <activeKpiOption.icon className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-black text-slate-900 truncate">
                    {activeKpiOption.label}
                  </span>
                  {activeKpiOption.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100/60 hidden sm:inline">
                      {activeKpiOption.badge}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-slate-400 group-hover:text-slate-700">
                <span className="text-[11px] font-bold hidden md:inline text-slate-500">View</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isKpiDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
              </div>
            </button>

            {/* Dropdown Menu Overlay */}
            {isKpiDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-full sm:w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-100 mb-1">
                  Select Analytics View
                </div>
                <div className="space-y-1">
                  {kpiTabOptions.map((opt) => {
                    const isSelected = activeKpiTab === opt.id;
                    const OptIcon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setActiveKpiTab(opt.id);
                          setIsKpiDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <OptIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-300' : 'text-slate-500'}`} />
                          <span className="truncate">{opt.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {opt.badge && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {opt.badge}
                            </span>
                          )}
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-300 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Stepper Navigation (< 1 / 5 >) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrevKpiTab}
              title="Previous analytics view"
              className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-bold text-slate-500 px-1.5 select-none hidden xs:inline">
              {activeKpiIndex + 1} / {kpiTabOptions.length}
            </span>
            <button
              type="button"
              onClick={handleNextKpiTab}
              title="Next analytics view"
              className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>

      {/* TAB 1: REVENUE & PROFIT TRENDS */}
      {activeKpiTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Main Chart: Timeline Revenue vs Profit */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900">Daily Revenue & Gross Profit Trend</h3>
                <p className="text-xs text-slate-500">Track daily revenue trajectory against gross profit generated</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-600">
                  <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" />
                  <span>Revenue</span>
                </div>
                <div className="flex items-center gap-1.5 font-bold text-emerald-600">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span>Gross Profit</span>
                </div>
              </div>
            </div>

            {kpis.dailyTrend.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                <BarChart3 className="w-8 h-8 text-slate-300 mb-2" />
                No sales recorded in this period timeframe.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpis.dailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#64748b' }} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      formatter={(val: any, name: string) => [
                        formatCurrency(Number(val), settings.currencySymbol), 
                        name === 'revenue' ? 'Sales Revenue' : 'Gross Profit'
                      ]}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Secondary Grid: Ticket Brackets & Volume Velocity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Ticket Size Bracket Distribution */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Order Value (Ticket Size) Distribution</h3>
                <p className="text-xs text-slate-500">Transaction counts categorized by price brackets</p>
              </div>

              <div className="space-y-2.5">
                {kpis.ticketBrackets.map((bracket, idx) => {
                  const pct = kpis.completedInvoices > 0 ? (bracket.count / kpis.completedInvoices) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">{bracket.label}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-500">{bracket.count} sales ({pct.toFixed(0)}%)</span>
                          <span className="font-bold text-slate-900">{formatCurrency(bracket.revenue, settings.currencySymbol)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Velocity Highlights */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Sales Velocity & Operational Run-Rate</h3>
                <p className="text-xs text-slate-500">Key transactional performance throughput metrics</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Daily Run-Rate</span>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    {formatCurrency(kpis.dailyTrend.length > 0 ? kpis.netSales / kpis.dailyTrend.length : 0, settings.currencySymbol)}
                  </div>
                  <span className="text-[10px] text-slate-500">Avg revenue per active day</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Sales Frequency</span>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    {(kpis.dailyTrend.length > 0 ? kpis.completedInvoices / kpis.dailyTrend.length : 0).toFixed(1)} / day
                  </div>
                  <span className="text-[10px] text-slate-500">Avg invoices closed per day</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Unit Velocity</span>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    {(kpis.dailyTrend.length > 0 ? kpis.totalUnitsSold / kpis.dailyTrend.length : 0).toFixed(1)} / day
                  </div>
                  <span className="text-[10px] text-slate-500">Physical units sold daily</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Profit / Invoice</span>
                  <div className="text-base font-black text-purple-700 mt-0.5">
                    {formatCurrency(kpis.completedInvoices > 0 ? kpis.grossProfit / kpis.completedInvoices : 0, settings.currencySymbol)}
                  </div>
                  <span className="text-[10px] text-slate-500">Gross margin per ticket</span>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* TAB: CATEGORY SALES & MARGIN KPIS */}
      {activeKpiTab === 'categories' && (
        <div className="space-y-6">
          
          {/* Header Banner with Category Filter quick reset / select info */}
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 rounded-3xl border border-indigo-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-black tracking-tight">Category Sales Performance & Margin Breakdown</h3>
              </div>
              <p className="text-xs text-indigo-200 mt-1">
                Comparative profitability, volume velocity, and revenue share per product line for <span className="font-bold text-white">{timeframeLabel}</span>
              </p>
            </div>
            {selectedCategory !== 'all' && onSelectCategory && (
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-colors cursor-pointer shrink-0"
              >
                Clear Category Filter ({getCategoryLabel(selectedCategory)})
              </button>
            )}
          </div>

          {/* Charts Row: Revenue by Category & Volume Share */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Category Revenue & Profit Bar Chart */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Category Revenue & Gross Profit</h3>
                <p className="text-xs text-slate-500">Compare sales revenue vs profit generated across departments</p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={kpis.categoryBreakdown.map(c => ({
                      name: getCategoryLabel(c.category),
                      rawCategory: c.category,
                      revenue: c.revenue,
                      profit: c.profit,
                    }))} 
                    margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      tickLine={false} 
                      axisLine={false}
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      formatter={(val: any, name: string) => [
                        formatCurrency(Number(val), settings.currencySymbol), 
                        name === 'revenue' ? 'Sales Revenue' : 'Gross Profit'
                      ]}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="revenue" fill="#4f46e5" radius={[6, 6, 0, 0]} name="revenue" />
                    <Bar dataKey="profit" fill="#10b981" radius={[6, 6, 0, 0]} name="profit" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Revenue Share Pie Chart */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Category Revenue Share (%)</h3>
                <p className="text-xs text-slate-500">Distribution of revenue contributions by merchandise department</p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={kpis.categoryBreakdown.map(c => ({
                        name: getCategoryLabel(c.category),
                        value: c.revenue,
                        sharePercent: c.sharePercent,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: any) => `${entry.name} (${entry.sharePercent ? entry.sharePercent.toFixed(0) : 0}%)`}
                      labelLine={false}
                    >
                      {kpis.categoryBreakdown.map((entry, index) => (
                        <Cell key={`cat-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Revenue']}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Detailed Category KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.categoryBreakdown.map((cat, idx) => {
              const isSelected = selectedCategory === cat.category;
              return (
                <div 
                  key={cat.category}
                  className={`p-5 rounded-3xl border transition-all ${
                    isSelected 
                      ? 'bg-indigo-50/70 border-indigo-400 shadow-md ring-2 ring-indigo-500/20' 
                      : 'bg-white border-slate-200 shadow-2xs hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <h4 className="text-sm font-black text-slate-900">
                        {getCategoryLabel(cat.category)}
                      </h4>
                    </div>

                    {onSelectCategory && (
                      <button
                        type="button"
                        onClick={() => onSelectCategory(isSelected ? 'all' : cat.category)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          isSelected 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'Active Filter' : 'Filter by this'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Revenue</span>
                      <div className="text-base font-black text-slate-900">
                        {formatCurrency(cat.revenue, settings.currencySymbol)}
                      </div>
                      <span className="text-[10px] font-semibold text-indigo-600">{cat.sharePercent.toFixed(1)}% of total</span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Gross Profit</span>
                      <div className="text-base font-black text-purple-700">
                        {formatCurrency(cat.profit, settings.currencySymbol)}
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600">{cat.marginPercent.toFixed(1)}% margin</span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Units Sold</span>
                      <div className="text-sm font-bold text-slate-800">
                        {cat.units.toLocaleString()} Units
                      </div>
                      <span className="text-[10px] text-slate-500">Avg {formatCurrency(cat.avgPricePerUnit, settings.currencySymbol)}/unit</span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Cost Basis (COGS)</span>
                      <div className="text-sm font-bold text-slate-600">
                        {formatCurrency(cat.cogs, settings.currencySymbol)}
                      </div>
                      <span className="text-[10px] text-slate-400">Total item cost</span>
                    </div>
                  </div>

                  {/* Category Target Pacing Section */}
                  {(() => {
                    const perf = categoryKpiPerformance.find(p => p.category === cat.category);
                    const catTargetFormatted = perf?.targetFormatted ?? formatCurrency(categorySalesTargets[cat.category] ?? 1000000, settings.currencySymbol);
                    const catAchieve = perf?.achievementPct ?? 0;
                    const catGapFormatted = perf?.gapFormatted ?? '';
                    const basisLabel = perf?.targetType === 'profit_margin' ? 'Margin Goal' : perf?.targetType === 'profit_amount' ? 'Profit Target' : 'Sales Target';

                    return (
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Target className="w-3 h-3 text-indigo-600" />
                            <span>{basisLabel} ({catTargetFormatted})</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`font-black ${catAchieve >= 100 ? 'text-emerald-600' : catAchieve >= 70 ? 'text-indigo-600' : 'text-amber-600'}`}>
                              {catAchieve.toFixed(1)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (perf) {
                                  setTempCategoryTarget(String(perf.target));
                                  setEditingCategoryKey(perf.category);
                                  setTargetViewMode('categories');
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }
                              }}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              catAchieve >= 100 ? 'bg-emerald-500' : catAchieve >= 70 ? 'bg-indigo-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, catAchieve)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>{catGapFormatted}</span>
                          <span>Revenue Share: <strong className="text-slate-700">{cat.sharePercent.toFixed(1)}%</strong></span>
                        </div>
                      </div>
                    );
                  })()}

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* TAB 2: HOURLY & DAY OF WEEK TRAFFIC HEATMAP */}
      {activeKpiTab === 'hourly_traffic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Peak Shopping Hours Chart */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Peak Store Shopping Hours (8 AM - 10 PM)</h3>
              <p className="text-xs text-slate-500">Identify rush hours to optimize staff coverage and register allocation</p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis.hourlyTraffic} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="hourLabel" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Hourly Revenue']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="revenue" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                    {kpis.hourlyTraffic.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.revenue > 0 ? '#4f46e5' : '#e2e8f0'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Day of Week Revenue Breakdown */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Revenue by Day of Week</h3>
              <p className="text-xs text-slate-500">Understand weekend vs. weekday sales velocity patterns</p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis.dowTraffic} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Total Revenue']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="revenue" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: STAFF / CASHIER LEADERBOARD */}
      {activeKpiTab === 'staff_leaderboard' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">Sales Associate & Cashier Performance</h3>
              <p className="text-xs text-slate-500">Compare sales output, closed invoices, average basket size, and gross profit by staff member</p>
            </div>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
              {kpis.staffLeaderboard.length} Active Salespeople
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 text-center">Rank</th>
                  <th className="py-3.5 px-4">Salesperson</th>
                  <th className="py-3.5 px-4 text-center">Closed Invoices</th>
                  <th className="py-3.5 px-4 text-center">Units Sold</th>
                  <th className="py-3.5 px-4 text-right">Total Revenue</th>
                  <th className="py-3.5 px-4 text-right">Gross Profit</th>
                  <th className="py-3.5 px-4 text-right">Margin %</th>
                  <th className="py-3.5 px-4 text-right">Avg Ticket (AOV)</th>
                  <th className="py-3.5 px-4 text-right">Revenue Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpis.staffLeaderboard.map((st, idx) => (
                  <tr key={st.name} className="hover:bg-slate-50/80 transition-colors">
                    {/* Rank */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-black text-xs ${
                        idx === 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                        idx === 1 ? 'bg-slate-200 text-slate-800' :
                        idx === 2 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{st.name}</span>
                        {idx === 0 && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-0.5">
                            <Award className="w-2.5 h-2.5" /> Top Seller
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Invoices */}
                    <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                      {st.invoices}
                    </td>

                    {/* Units */}
                    <td className="py-3.5 px-4 text-center text-slate-600">
                      {st.units}
                    </td>

                    {/* Revenue */}
                    <td className="py-3.5 px-4 text-right font-black text-slate-900">
                      {formatCurrency(st.revenue, settings.currencySymbol)}
                    </td>

                    {/* Profit */}
                    <td className="py-3.5 px-4 text-right font-black text-purple-700">
                      {formatCurrency(st.profit, settings.currencySymbol)}
                    </td>

                    {/* Margin */}
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                      {st.marginPercent.toFixed(1)}%
                    </td>

                    {/* AOV */}
                    <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                      {formatCurrency(st.aov, settings.currencySymbol)}
                    </td>

                    {/* Share */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${st.revenueShare}%` }} />
                        </div>
                        <span className="font-bold text-slate-700 w-10 text-right">{st.revenueShare.toFixed(1)}%</span>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENT CHANNEL MIX */}
      {activeKpiTab === 'payment_mix' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Pie Chart */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Payment Channel Volume Share</h3>
              <p className="text-xs text-slate-500">Distribution across Myanmar mobile payment apps & cash</p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={kpis.paymentBreakdown}
                    dataKey="total"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry: any) => `${getPaymentMethodInfo(entry.method as PaymentMethod).label} (${entry.sharePercent ? entry.sharePercent.toFixed(0) : 0}%)`}
                    labelLine={false}
                  >
                    {kpis.paymentBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Total Volume']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tender Breakdown Cards */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">Tender Details</h3>
              <p className="text-xs text-slate-500">Financial breakdown by payment gateway</p>
            </div>

            <div className="space-y-2.5">
              {kpis.paymentBreakdown.map((p, idx) => {
                const info = getPaymentMethodInfo(p.method as PaymentMethod);
                return (
                  <div key={p.method} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${info.badgeBg}`}>
                        {info.label}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">{p.count} transactions</span>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(p.total, settings.currencySymbol)}
                      </div>
                      <span className="text-[10px] text-indigo-600 font-bold">{p.sharePercent.toFixed(1)}% share</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* Interactive Sales Audit & Drilldown Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden space-y-4 p-5">
        
        {/* Drilldown Filter Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Sales Transactions Audit Drilldown</h3>
            <p className="text-xs text-slate-500">Explore and audit individual sales ledger entries in this period</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search invoice, customer, item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none"
              />
            </div>

            {/* Cashier Filter */}
            <select
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Cashiers</option>
              {cashierList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Payment Filter */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Payments</option>
              <option value="cash">Cash</option>
              <option value="kpay">KBZPay</option>
              <option value="wave">Wave Money</option>
              <option value="kbz">KBZ Bank</option>
              <option value="aya">AYA Pay</option>
              <option value="cb">CB Pay</option>
              <option value="yoma">Yoma Bank</option>
              <option value="split">Split</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed Only</option>
              <option value="refunded">Refunded Only</option>
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items Summary</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-center">Cashier</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.slice(0, 50).map(sale => {
                const isRefunded = sale.status === 'refunded';
                const payInfo = getPaymentMethodInfo(sale.paymentMethod);

                return (
                  <tr key={sale.id} className={`hover:bg-slate-50/80 transition-colors ${isRefunded ? 'bg-rose-50/40' : ''}`}>
                    <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                      {sale.invoiceNumber}
                      {isRefunded && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[9px] font-black">
                          REFUND
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {formatDateTime(sale.date)}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {sale.customerName || 'Walk-in Customer'}
                    </td>

                    <td className="py-3 px-4 text-slate-700 max-w-xs truncate">
                      {sale.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                        {payInfo.label}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center text-slate-600 font-medium whitespace-nowrap">
                      {sale.soldBy || 'Cashier'}
                    </td>

                    <td className={`py-3 px-4 text-right font-black ${isRefunded ? 'text-rose-600 line-through' : 'text-slate-900'}`}>
                      {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {onViewInvoice && (
                        <button
                          type="button"
                          onClick={() => onViewInvoice(sale)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg font-bold text-[10px] transition-colors cursor-pointer"
                        >
                          View
                        </button>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSales.length > 50 && (
          <p className="text-center text-xs text-slate-400 pt-2">
            Showing first 50 transactions of {filteredSales.length}. Use filters to narrow results or export full CSV.
          </p>
        )}

      </div>

      {/* Category Target Manager Modal Dialog */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center text-indigo-200">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    Product Category Target Manager
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Set individual monthly or period sales quotas for each merchandise category
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Subheader with Fast Actions */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Batch Mode:</span>
                <button
                  type="button"
                  onClick={() => handleSetAllDraftTypes('sales')}
                  className="px-2 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  title="Switch all categories to Total Sales targets"
                >
                  All Sales Amount
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllDraftTypes('profit_margin')}
                  className="px-2 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  title="Switch all categories to Profit Margin % targets"
                >
                  All Margin %
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllDraftTypes('profit_amount')}
                  className="px-2 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  title="Switch all categories to Gross Profit targets"
                >
                  All Profit
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDistributeStoreTarget}
                  className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  title="Evenly divides the store-wide sales target among all categories"
                >
                  Split Store Sales ({formatCurrency(salesTarget, settings.currencySymbol)})
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaultCategoryTargets}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            {/* Modal Body - Category List */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {categoryKpiPerformance.map((cat) => {
                const CategoryIcon = getCategoryIcon(cat.category);
                const currentType: CategoryTargetType = draftCategoryTargetTypes[cat.category] || 'sales';
                
                // Get current draft value according to active type
                let currentVal = 0;
                let unitSuffix = settings.currencySymbol;
                let draftAchievement = 0;

                if (currentType === 'sales') {
                  currentVal = draftCategorySalesTargets[cat.category] ?? DEFAULT_CATEGORY_TARGETS[cat.category] ?? 1000000;
                  unitSuffix = settings.currencySymbol;
                  draftAchievement = currentVal > 0 ? (cat.revenue / currentVal) * 100 : 0;
                } else if (currentType === 'profit_margin') {
                  currentVal = draftCategoryMarginTargets[cat.category] ?? DEFAULT_CATEGORY_MARGIN_TARGETS[cat.category] ?? 20;
                  unitSuffix = '%';
                  draftAchievement = currentVal > 0 ? (cat.marginPercent / currentVal) * 100 : 0;
                } else {
                  currentVal = draftCategoryProfitTargets[cat.category] ?? DEFAULT_CATEGORY_PROFIT_TARGETS[cat.category] ?? 200000;
                  unitSuffix = settings.currencySymbol;
                  draftAchievement = currentVal > 0 ? (cat.profit / currentVal) * 100 : 0;
                }

                return (
                  <div
                    key={`modal-cat-${cat.category}`}
                    className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-white shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    {/* Category info & actual stats */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <CategoryIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{cat.label}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                          <span>Sales: <strong className="text-slate-800">{formatCurrency(cat.revenue, settings.currencySymbol)}</strong></span>
                          <span>•</span>
                          <span>Margin: <strong className="text-emerald-700">{cat.marginPercent.toFixed(1)}%</strong></span>
                          <span>•</span>
                          <span>Profit: <strong className="text-slate-800">{formatCurrency(cat.profit, settings.currencySymbol)}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Target Basis Selector & Input */}
                    <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                      {/* Target Basis Selector */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCategoryTargetTypes(prev => ({ ...prev, [cat.category]: 'sales' }));
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            currentType === 'sales'
                              ? 'bg-white text-indigo-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Sales
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCategoryTargetTypes(prev => ({ ...prev, [cat.category]: 'profit_margin' }));
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            currentType === 'profit_margin'
                              ? 'bg-white text-emerald-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Margin %
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCategoryTargetTypes(prev => ({ ...prev, [cat.category]: 'profit_amount' }));
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            currentType === 'profit_amount'
                              ? 'bg-white text-amber-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Profit
                        </button>
                      </div>

                      {/* Target Input with Unit & Live Pacing */}
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type="number"
                            value={currentVal}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const safeVal = val >= 0 ? val : 0;
                              if (currentType === 'sales') {
                                setDraftCategorySalesTargets(prev => ({ ...prev, [cat.category]: safeVal }));
                              } else if (currentType === 'profit_margin') {
                                setDraftCategoryMarginTargets(prev => ({ ...prev, [cat.category]: safeVal }));
                              } else {
                                setDraftCategoryProfitTargets(prev => ({ ...prev, [cat.category]: safeVal }));
                              }
                            }}
                            className="w-32 pl-3 pr-7 py-1.5 text-xs font-black text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none"
                            placeholder="Target"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                            {unitSuffix}
                          </span>
                        </div>

                        {/* Live Pacing Badge */}
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black border shrink-0 ${
                          draftAchievement >= 100
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : draftAchievement >= 70
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {draftAchievement.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Changes persist automatically in your local storage.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllCategoryTargets}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Save All Category Targets
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
