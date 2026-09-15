import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  ShoppingBag, 
  Package, 
  Users, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles, 
  Award, 
  AlertCircle, 
  FileText, 
  CheckCircle2, 
  Smartphone, 
  Headphones, 
  Utensils, 
  CreditCard,
  Percent,
  RefreshCw,
  Clock,
  Filter
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  Sale, 
  ExpenseRecord, 
  Product, 
  StaffUser, 
  ShopSettings, 
  ProductCategory,
  AppTab 
} from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { canonicalCategory, CANONICAL_CATEGORIES } from '../../data/categoryTaxonomy';

export interface MonthlyProfitManagerProps {
  sales: Sale[];
  expenses: ExpenseRecord[];
  products: Product[];
  staffUsers: StaffUser[];
  settings: ShopSettings;
  onViewInvoice?: (sale: Sale) => void;
  onNavigateTab?: (tab: AppTab) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const CATEGORY_PALETTE = [
  '#4F46E5', // Indigo (Brand New)
  '#06B6D4', // Cyan (Pre-owned)
  '#10B981', // Emerald (Accessories)
  '#F59E0B', // Amber (Cookware)
  '#8B5CF6', // Purple (Sim cards)
  '#EC4899', // Pink
  '#F97316', // Orange
  '#64748B', // Slate
];

type StaffSortField = 'grossProfit' | 'revenue' | 'units' | 'invoices';

export const MonthlyProfitManager: React.FC<MonthlyProfitManagerProps> = ({
  sales,
  expenses,
  products,
  staffUsers,
  settings,
  onViewInvoice,
  onNavigateTab,
}) => {
  const currencySymbol = settings?.currencySymbol || 'Ks';

  // Current month default in YYYY-MM format
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [staffSortField, setStaffSortField] = useState<StaffSortField>('grossProfit');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Available Years extracted from sales and expenses
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    years.add(currentYear - 1);

    sales.forEach(s => {
      if (s.date) {
        const y = parseInt(s.date.slice(0, 4), 10);
        if (!isNaN(y)) years.add(y);
      }
    });
    expenses.forEach(e => {
      if (e.date) {
        const y = parseInt(e.date.slice(0, 4), 10);
        if (!isNaN(y)) years.add(y);
      }
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [sales, expenses]);

  // Selected year and month index
  const { year: selectedYear, monthIndex: selectedMonthIndex } = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr, 10) || new Date().getFullYear();
    const mIdx = (parseInt(mStr, 10) || 1) - 1;
    return { year: y, monthIndex: Math.max(0, Math.min(11, mIdx)) };
  }, [selectedMonth]);

  // Previous month string in YYYY-MM
  const previousMonthStr = useMemo(() => {
    const prevDate = new Date(selectedYear, selectedMonthIndex - 1, 1);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
    return `${py}-${pm}`;
  }, [selectedYear, selectedMonthIndex]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    const prevDate = new Date(selectedYear, selectedMonthIndex - 1, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(selectedYear, selectedMonthIndex + 1, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return selectedMonth === currentYM;
  }, [selectedMonth]);

  // Product cost map for COGS fallback
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => {
      map.set(p.id, p.costPrice || 0);
    });
    return map;
  }, [products]);

  // Helper to calculate financials for any specific month
  const calculateMonthFinancials = (monthYM: string) => {
    const mSales = sales.filter(s => s.status === 'completed' && s.date && s.date.startsWith(monthYM));
    const mExpenses = expenses.filter(e => e.date && e.date.startsWith(monthYM));

    let grossRevenue = 0;
    let totalCogs = 0;
    let totalUnits = 0;

    mSales.forEach(sale => {
      grossRevenue += sale.grandTotal || 0;
      sale.items.forEach(item => {
        const qty = item.quantity || 1;
        totalUnits += qty;
        const unitCost = item.costPrice > 0 ? item.costPrice : (productCostMap.get(item.productId) || 0);
        totalCogs += unitCost * qty;
      });
    });

    const grossProfit = grossRevenue - totalCogs;
    const totalExpenses = mExpenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const netOperatingProfit = grossProfit - totalExpenses;
    const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    const netMarginPct = grossRevenue > 0 ? (netOperatingProfit / grossRevenue) * 100 : 0;

    return {
      salesCount: mSales.length,
      unitsSold: totalUnits,
      grossRevenue,
      totalCogs,
      grossProfit,
      totalExpenses,
      netOperatingProfit,
      grossMarginPct,
      netMarginPct,
    };
  };

  // Selected Month & Previous Month Financials
  const currentMonthData = useMemo(() => calculateMonthFinancials(selectedMonth), [selectedMonth, sales, expenses, productCostMap]);
  const prevMonthData = useMemo(() => calculateMonthFinancials(previousMonthStr), [previousMonthStr, sales, expenses, productCostMap]);

  // Month-Over-Month (MoM) Growth percentage calculator
  const calcMomGrowth = (current: number, previous: number) => {
    if (previous === 0) {
      if (current === 0) return { pct: 0, direction: 'neutral' as const };
      return { pct: 100, direction: 'up' as const };
    }
    const diff = current - previous;
    const pct = (diff / Math.abs(previous)) * 100;
    return {
      pct,
      direction: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('neutral' as const)
    };
  };

  const momRevenue = calcMomGrowth(currentMonthData.grossRevenue, prevMonthData.grossRevenue);
  const momCogs = calcMomGrowth(currentMonthData.totalCogs, prevMonthData.totalCogs);
  const momGrossProfit = calcMomGrowth(currentMonthData.grossProfit, prevMonthData.grossProfit);
  const momExpenses = calcMomGrowth(currentMonthData.totalExpenses, prevMonthData.totalExpenses);
  const momNetProfit = calcMomGrowth(currentMonthData.netOperatingProfit, prevMonthData.netOperatingProfit);

  // 2. Daily Performance Trend (ComposedChart for 1st to 28th/30th/31st of selected month)
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
  }, [selectedYear, selectedMonthIndex]);

  const dailyTrendData = useMemo(() => {
    const daysData: {
      dayNumber: number;
      dayLabel: string;
      dateStr: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      expenses: number;
      dailyNetProfit: number;
      cumulativeNetProfit: number;
    }[] = [];

    const monthSales = sales.filter(s => s.status === 'completed' && s.date && s.date.startsWith(selectedMonth));
    const monthExpenses = expenses.filter(e => e.date && e.date.startsWith(selectedMonth));

    let runningCumulativeProfit = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const fullDateStr = `${selectedMonth}-${dayStr}`;

      const daySales = monthSales.filter(s => s.date.startsWith(fullDateStr));
      const dayExpenses = monthExpenses.filter(e => e.date.startsWith(fullDateStr));

      let dayRev = 0;
      let dayCogs = 0;
      daySales.forEach(s => {
        dayRev += s.grandTotal || 0;
        s.items.forEach(item => {
          const qty = item.quantity || 1;
          const unitCost = item.costPrice > 0 ? item.costPrice : (productCostMap.get(item.productId) || 0);
          dayCogs += unitCost * qty;
        });
      });

      const dayExp = dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const dayGP = dayRev - dayCogs;
      const dayNet = dayGP - dayExp;
      runningCumulativeProfit += dayNet;

      daysData.push({
        dayNumber: d,
        dayLabel: `${d}`,
        dateStr: fullDateStr,
        revenue: dayRev,
        cogs: dayCogs,
        grossProfit: dayGP,
        expenses: dayExp,
        dailyNetProfit: dayNet,
        cumulativeNetProfit: runningCumulativeProfit,
      });
    }

    return daysData;
  }, [selectedMonth, selectedYear, selectedMonthIndex, daysInMonth, sales, expenses, productCostMap]);

  // 3. Category Profitability Breakdown
  const categoryBreakdown = useMemo(() => {
    const monthSales = sales.filter(s => s.status === 'completed' && s.date && s.date.startsWith(selectedMonth));
    
    // Category aggregation accumulator
    const stats: Record<string, {
      categoryKey: ProductCategory | string;
      categoryLabel: string;
      units: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
    }> = {};

    monthSales.forEach(sale => {
      sale.items.forEach(item => {
        const canonical = canonicalCategory(item.category);
        const qty = item.quantity || 1;
        const lineRev = item.finalPrice !== undefined 
          ? item.finalPrice 
          : (item.unitPrice * qty - (item.discount || 0));
        const unitCost = item.costPrice > 0 ? item.costPrice : (productCostMap.get(item.productId) || 0);
        const lineCogs = unitCost * qty;
        const lineGp = lineRev - lineCogs;

        if (!stats[canonical]) {
          const catMeta = CANONICAL_CATEGORIES.find(c => c.id === canonical);
          stats[canonical] = {
            categoryKey: canonical,
            categoryLabel: catMeta?.label || canonical.replace(/_/g, ' '),
            units: 0,
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
          };
        }

        stats[canonical].units += qty;
        stats[canonical].revenue += lineRev;
        stats[canonical].cogs += lineCogs;
        stats[canonical].grossProfit += lineGp;
      });
    });

    const list = Object.values(stats);
    const totalCategoryGp = list.reduce((sum, c) => sum + Math.max(0, c.grossProfit), 0);

    return list.map((c, index) => {
      const marginPct = c.revenue > 0 ? (c.grossProfit / c.revenue) * 100 : 0;
      const contributionPct = totalCategoryGp > 0 && c.grossProfit > 0 
        ? (c.grossProfit / totalCategoryGp) * 100 
        : 0;

      return {
        ...c,
        marginPct,
        contributionPct,
        color: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length],
      };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
  }, [selectedMonth, sales, productCostMap]);

  // Donut chart dataset (only positive gross profits for clean pie rendering)
  const donutChartData = useMemo(() => {
    return categoryBreakdown
      .filter(c => c.grossProfit > 0)
      .map(c => ({
        name: c.categoryLabel,
        value: Math.round(c.grossProfit),
        color: c.color,
        contributionPct: c.contributionPct,
      }));
  }, [categoryBreakdown]);

  // 4. Staff Performance & Commission Leaderboard
  const staffLeaderboard = useMemo(() => {
    const monthSales = sales.filter(s => s.status === 'completed' && s.date && s.date.startsWith(selectedMonth));

    // Map by cashier identifier
    const staffMap = new Map<string, {
      staffId: string;
      staffName: string;
      role: string;
      avatarColor?: string;
      invoicesCount: number;
      unitsSold: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
    }>();

    monthSales.forEach(sale => {
      const cashierId = sale.cashierId || sale.soldById || sale.cashierName || sale.soldBy || 'unassigned';
      const cashierName = sale.cashierName || sale.soldBy || 'Unassigned Staff';

      if (!staffMap.has(cashierId)) {
        const foundUser = staffUsers.find(u => 
          (sale.cashierId && u.id === sale.cashierId) ||
          (sale.soldById && u.id === sale.soldById) ||
          u.name.toLowerCase() === cashierName.toLowerCase() ||
          cashierName.toLowerCase().includes(u.name.toLowerCase())
        );
        staffMap.set(cashierId, {
          staffId: cashierId,
          staffName: foundUser ? foundUser.name : cashierName,
          role: foundUser ? (foundUser.role || 'Staff') : 'Cashier',
          invoicesCount: 0,
          unitsSold: 0,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
        });
      }

      const record = staffMap.get(cashierId)!;
      record.invoicesCount += 1;
      record.revenue += sale.grandTotal || 0;

      sale.items.forEach(item => {
        const qty = item.quantity || 1;
        record.unitsSold += qty;
        const unitCost = item.costPrice > 0 ? item.costPrice : (productCostMap.get(item.productId) || 0);
        const itemRev = item.finalPrice !== undefined 
          ? item.finalPrice 
          : (item.unitPrice * qty - (item.discount || 0));
        const itemCogs = unitCost * qty;
        record.cogs += itemCogs;
        record.grossProfit += (itemRev - itemCogs);
      });
    });

    const list = Array.from(staffMap.values()).map(s => {
      const marginPct = s.revenue > 0 ? (s.grossProfit / s.revenue) * 100 : 0;
      const aov = s.invoicesCount > 0 ? s.revenue / s.invoicesCount : 0;
      // Retail commission benchmark: 1.5% on sales revenue or 5% on gross profit margin
      const estimatedCommission = s.grossProfit > 0 ? Math.round(s.grossProfit * 0.05) : 0;

      return {
        ...s,
        marginPct,
        aov,
        estimatedCommission,
      };
    });

    // Sort according to active sort field
    return list.sort((a, b) => {
      if (staffSortField === 'grossProfit') return b.grossProfit - a.grossProfit;
      if (staffSortField === 'revenue') return b.revenue - a.revenue;
      if (staffSortField === 'units') return b.unitsSold - a.unitsSold;
      return b.invoicesCount - a.invoicesCount;
    });
  }, [selectedMonth, sales, staffUsers, productCostMap, staffSortField]);

  // 5. Export Button Handler (Stub with rich console log and user toast)
  const handleExportPdf = () => {
    const exportDossierPayload = {
      month: selectedMonth,
      monthName: `${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`,
      shopName: settings.shopName,
      currency: currencySymbol,
      kpis: {
        grossRevenue: currentMonthData.grossRevenue,
        totalCogs: currentMonthData.totalCogs,
        grossProfit: currentMonthData.grossProfit,
        grossMarginPct: currentMonthData.grossMarginPct,
        operatingExpenses: currentMonthData.totalExpenses,
        netOperatingProfit: currentMonthData.netOperatingProfit,
        netMarginPct: currentMonthData.netMarginPct,
      },
      momGrowth: {
        revenue: momRevenue.pct,
        grossProfit: momGrossProfit.pct,
        netProfit: momNetProfit.pct,
      },
      categories: categoryBreakdown,
      staffPerformance: staffLeaderboard,
      dailyTrendCount: dailyTrendData.length,
      generatedAt: new Date().toISOString(),
    };

    console.log('Export Monthly Dossier (PDF) payload prepared:', exportDossierPayload);

    setToastMessage(`Export Monthly Dossier (${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}): Dossier structure compiled successfully. Ready for jsPDF / autoTable integration.`);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Quick CSV Export for immediate user utility
  const handleExportCsv = () => {
    const rows = [
      ['Date', 'Revenue', 'COGS', 'Gross Profit', 'Expenses', 'Daily Net Profit', 'Cumulative Net Profit'],
      ...dailyTrendData.map(d => [
        d.dateStr,
        d.revenue.toFixed(2),
        d.cogs.toFixed(2),
        d.grossProfit.toFixed(2),
        d.expenses.toFixed(2),
        d.dailyNetProfit.toFixed(2),
        d.cumulativeNetProfit.toFixed(2)
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `monthly_profit_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for Category Icon
  const renderCategoryIcon = (catKey: string) => {
    switch (catKey) {
      case 'brand_new_phones':
        return <Smartphone className="w-3.5 h-3.5" />;
      case 'pre_owned_phones':
        return <RefreshCw className="w-3.5 h-3.5" />;
      case 'accessories_gadgets':
        return <Headphones className="w-3.5 h-3.5" />;
      case 'cookware':
        return <Utensils className="w-3.5 h-3.5" />;
      case 'sim_cards':
        return <CreditCard className="w-3.5 h-3.5" />;
      default:
        return <Package className="w-3.5 h-3.5" />;
    }
  };

  const hasMonthData = currentMonthData.grossRevenue > 0 || currentMonthData.totalExpenses > 0;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex items-start gap-3 animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-white">Monthly Dossier Export</p>
            <p className="text-xs text-slate-300 leading-relaxed">{toastMessage}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-xs font-bold ml-auto cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar: Month Selector & Export Action */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Monthly Profit Manager</h2>
              <p className="text-xs text-slate-500 font-medium">
                Fiscal performance, MoM variance, category margins, and staff productivity
              </p>
            </div>
          </div>
        </div>

        {/* Month Picker & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Previous / Next Month Navigation */}
          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-2">
              <select
                value={selectedMonthIndex}
                onChange={(e) => {
                  const m = String(parseInt(e.target.value, 10) + 1).padStart(2, '0');
                  setSelectedMonth(`${selectedYear}-${m}`);
                }}
                className="bg-transparent text-xs font-bold text-slate-800 border-none focus:outline-hidden cursor-pointer"
              >
                {MONTH_NAMES.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => {
                  const y = e.target.value;
                  const m = String(selectedMonthIndex + 1).padStart(2, '0');
                  setSelectedMonth(`${y}-${m}`);
                }}
                className="bg-transparent text-xs font-bold text-slate-800 border-none focus:outline-hidden cursor-pointer"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick "Current Month" button */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 transition-all cursor-pointer"
            >
              This Month
            </button>
          )}

          {/* Quick CSV Export */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!hasMonthData}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download daily performance spreadsheet (CSV)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          {/* PDF Dossier Export Button Stub */}
          <button
            type="button"
            id="export-monthly-dossier-btn"
            onClick={handleExportPdf}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Export Monthly Dossier (PDF)</span>
          </button>
        </div>
      </div>

      {/* 1. Month-Over-Month KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Gross Revenue */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gross Revenue</span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">
              {formatCurrency(currentMonthData.grossRevenue, currencySymbol)}
            </p>
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {momRevenue.direction === 'up' ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowUpRight className="w-3 h-3" />
                  +{momRevenue.pct.toFixed(1)}%
                </span>
              ) : momRevenue.direction === 'down' ? (
                <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowDownRight className="w-3 h-3" />
                  {momRevenue.pct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-slate-400 font-medium text-[11px]">0.0% MoM</span>
              )}
              <span className="text-[11px] text-slate-400 font-medium">MoM</span>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">{currentMonthData.salesCount} Invoices</span>
          </div>
        </div>

        {/* Card 2: Total COGS */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total COGS</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Package className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">
              {formatCurrency(currentMonthData.totalCogs, currencySymbol)}
            </p>
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {momCogs.direction === 'up' ? (
                <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowUpRight className="w-3 h-3" />
                  +{momCogs.pct.toFixed(1)}%
                </span>
              ) : momCogs.direction === 'down' ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowDownRight className="w-3 h-3" />
                  {momCogs.pct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-slate-400 font-medium text-[11px]">0.0% MoM</span>
              )}
              <span className="text-[11px] text-slate-400 font-medium">MoM</span>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">
              {currentMonthData.grossRevenue > 0 
                ? `${((currentMonthData.totalCogs / currentMonthData.grossRevenue) * 100).toFixed(1)}% rev` 
                : '0% rev'}
            </span>
          </div>
        </div>

        {/* Card 3: Gross Profit */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gross Profit</span>
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">
              {formatCurrency(currentMonthData.grossProfit, currencySymbol)}
            </p>
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {momGrossProfit.direction === 'up' ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowUpRight className="w-3 h-3" />
                  +{momGrossProfit.pct.toFixed(1)}%
                </span>
              ) : momGrossProfit.direction === 'down' ? (
                <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowDownRight className="w-3 h-3" />
                  {momGrossProfit.pct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-slate-400 font-medium text-[11px]">0.0% MoM</span>
              )}
              <span className="text-[11px] text-slate-400 font-medium">MoM</span>
            </div>
            <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md">
              {currentMonthData.grossMarginPct.toFixed(1)}% margin
            </span>
          </div>
        </div>

        {/* Card 4: Operating Expenses */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Operating Expenses</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 tracking-tight">
              {formatCurrency(currentMonthData.totalExpenses, currencySymbol)}
            </p>
          </div>

          <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {momExpenses.direction === 'up' ? (
                <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowUpRight className="w-3 h-3" />
                  +{momExpenses.pct.toFixed(1)}%
                </span>
              ) : momExpenses.direction === 'down' ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md text-[11px]">
                  <ArrowDownRight className="w-3 h-3" />
                  {momExpenses.pct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-slate-400 font-medium text-[11px]">0.0% MoM</span>
              )}
              <span className="text-[11px] text-slate-400 font-medium">MoM</span>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">Overhead</span>
          </div>
        </div>

        {/* Card 5: Net Operating Profit (Highlight Card) */}
        <div className={`rounded-2xl p-4 border shadow-2xs relative overflow-hidden flex flex-col justify-between ${
          currentMonthData.netOperatingProfit >= 0 
            ? 'bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/60 border-emerald-300' 
            : 'bg-gradient-to-br from-rose-50 via-red-50 to-rose-100/60 border-rose-300'
        }`}>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                currentMonthData.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
              }`}>
                Net Operating Profit
              </span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                currentMonthData.netOperatingProfit >= 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
              }`}>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className={`text-xl font-black tracking-tight ${
              currentMonthData.netOperatingProfit >= 0 ? 'text-emerald-950' : 'text-rose-950'
            }`}>
              {formatCurrency(currentMonthData.netOperatingProfit, currencySymbol)}
            </p>
          </div>

          <div className="pt-3 mt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              {momNetProfit.direction === 'up' ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-800 font-bold bg-white/80 px-1.5 py-0.5 rounded-md text-[11px] shadow-2xs">
                  <ArrowUpRight className="w-3 h-3" />
                  +{momNetProfit.pct.toFixed(1)}%
                </span>
              ) : momNetProfit.direction === 'down' ? (
                <span className="inline-flex items-center gap-0.5 text-rose-800 font-bold bg-white/80 px-1.5 py-0.5 rounded-md text-[11px] shadow-2xs">
                  <ArrowDownRight className="w-3 h-3" />
                  {momNetProfit.pct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-slate-600 font-medium text-[11px]">0.0% MoM</span>
              )}
              <span className="text-[11px] text-emerald-800 font-medium">MoM</span>
            </div>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-white/80 shadow-2xs ${
              currentMonthData.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
            }`}>
              {currentMonthData.netMarginPct.toFixed(1)}% net
            </span>
          </div>
        </div>
      </div>

      {/* 2. Daily Performance Trend (Recharts ComposedChart) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Daily Performance Trend</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Daily revenue & operating expenses (bars, left axis) with cumulative net profit trajectory (emerald line, right axis)
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-indigo-600"></span>
              <span>Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-500"></span>
              <span>Expenses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-emerald-500"></span>
              <span>Cumulative Profit</span>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        {hasMonthData ? (
          <div className="w-full h-80 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyTrendData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="dayLabel" 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  interval={Math.floor(daysInMonth / 15)}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#10b981' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 min-w-[200px]">
                          <p className="font-bold text-slate-200 border-b border-slate-700 pb-1">
                            {MONTH_NAMES[selectedMonthIndex]} {data.dayNumber}, {selectedYear}
                          </p>
                          <div className="flex justify-between items-center text-indigo-300">
                            <span>Daily Revenue:</span>
                            <span className="font-bold">{formatCurrency(data.revenue, currencySymbol)}</span>
                          </div>
                          <div className="flex justify-between items-center text-rose-300">
                            <span>Daily Expenses:</span>
                            <span className="font-bold">{formatCurrency(data.expenses, currencySymbol)}</span>
                          </div>
                          <div className="flex justify-between items-center text-amber-300">
                            <span>Cost of Goods (COGS):</span>
                            <span className="font-bold">{formatCurrency(data.cogs, currencySymbol)}</span>
                          </div>
                          <div className="flex justify-between items-center text-teal-300">
                            <span>Daily Gross Profit:</span>
                            <span className="font-bold">{formatCurrency(data.grossProfit, currencySymbol)}</span>
                          </div>
                          <div className="pt-1.5 mt-1 border-t border-slate-700 flex justify-between items-center text-emerald-400 font-bold">
                            <span>Cumulative Net:</span>
                            <span>{formatCurrency(data.cumulativeNetProfit, currencySymbol)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  yAxisId="left" 
                  dataKey="revenue" 
                  name="Daily Revenue" 
                  fill="#4F46E5" 
                  radius={[3, 3, 0, 0]} 
                  maxBarSize={16}
                />
                <Bar 
                  yAxisId="left" 
                  dataKey="expenses" 
                  name="Daily Expenses" 
                  fill="#F43F5E" 
                  radius={[3, 3, 0, 0]} 
                  maxBarSize={16}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativeNetProfit"
                  name="Cumulative Net Profit"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: '#10B981' }}
                  activeDot={{ r: 5, fill: '#059669' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-700">No Sales or Expense Records in {MONTH_NAMES[selectedMonthIndex]} {selectedYear}</p>
            <p className="text-xs text-slate-400 max-w-sm">
              Transactions completed in this calendar month will automatically chart daily revenue bars and cumulative profit lines here.
            </p>
          </div>
        )}
      </div>

      {/* 3. Category Profitability Breakdown & 4. Staff Performance Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Category Profitability Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <PieChartIcon className="w-4 h-4 text-indigo-600" />
                <span>Category Profitability</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">Profit contribution by product taxonomy</p>
            </div>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {categoryBreakdown.length} Categories
            </span>
          </div>

          {/* Donut Chart */}
          {donutChartData.length > 0 ? (
            <div className="w-full h-52 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value) || 0, currencySymbol), 'Gross Profit']}
                    contentStyle={{ borderRadius: '0.75rem', fontSize: '11px', background: '#0f172a', border: 'none', color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Profit</span>
                <span className="text-xs font-black text-slate-900">
                  {formatCurrency(currentMonthData.grossProfit, currencySymbol)}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No category sales recorded for this month
            </div>
          )}

          {/* Category Data Table with Contribution % */}
          <div className="space-y-2.5 pt-1">
            {categoryBreakdown.map((cat) => (
              <div 
                key={cat.categoryKey}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: cat.color }} 
                    />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      {renderCategoryIcon(cat.categoryKey)}
                      <span>{cat.categoryLabel}</span>
                    </div>
                  </div>
                  <span className="text-xs font-black text-slate-900">
                    {formatCurrency(cat.grossProfit, currencySymbol)}
                  </span>
                </div>

                {/* Progress Bar for Profit Contribution % */}
                <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ 
                      width: `${Math.min(100, Math.max(0, cat.contributionPct))}%`, 
                      backgroundColor: cat.color 
                    }} 
                  />
                </div>

                {/* Row Submetrics */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>{cat.units} units sold</span>
                  <div className="flex items-center gap-3">
                    <span>{cat.marginPct.toFixed(1)}% margin</span>
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded-md">
                      {cat.contributionPct.toFixed(1)}% share
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Staff Performance & Commission Leaderboard (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Staff Performance & Commission Leaderboard</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Sales rankings by total revenue, units sold, and generated gross profit
              </p>
            </div>

            {/* Sort Toggle Controls */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-[11px] font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setStaffSortField('grossProfit')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  staffSortField === 'grossProfit' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'hover:text-slate-900'
                }`}
              >
                Gross Profit
              </button>
              <button
                type="button"
                onClick={() => setStaffSortField('revenue')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  staffSortField === 'revenue' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'hover:text-slate-900'
                }`}
              >
                Revenue
              </button>
              <button
                type="button"
                onClick={() => setStaffSortField('units')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  staffSortField === 'units' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'hover:text-slate-900'
                }`}
              >
                Units
              </button>
            </div>
          </div>

          {/* Table Leaderboard */}
          {staffLeaderboard.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50/50">
                    <th className="py-2.5 px-3 rounded-l-xl">Rank</th>
                    <th className="py-2.5 px-3">Staff Member</th>
                    <th className="py-2.5 px-3 text-center">Orders</th>
                    <th className="py-2.5 px-3 text-center">Units</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Gross Profit</th>
                    <th className="py-2.5 px-3 text-right rounded-r-xl">Est. Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffLeaderboard.map((member, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;

                    return (
                      <tr 
                        key={member.staffId} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isTop1 ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3 px-3">
                          <div className="flex items-center">
                            {isTop1 ? (
                              <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center shadow-xs">
                                1
                              </span>
                            ) : isTop2 ? (
                              <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center">
                                2
                              </span>
                            ) : isTop3 ? (
                              <span className="w-6 h-6 rounded-full bg-amber-600/70 text-white font-black text-xs flex items-center justify-center">
                                3
                              </span>
                            ) : (
                              <span className="w-6 h-6 text-slate-400 font-bold text-xs flex items-center justify-center">
                                {idx + 1}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Staff Profile */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {member.staffName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 leading-tight flex items-center gap-1.5">
                                <span>{member.staffName}</span>
                                {isTop1 && (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md font-bold">
                                    Top Closer
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-400 font-medium capitalize">
                                {member.role.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Orders count */}
                        <td className="py-3 px-3 text-center text-slate-600 font-semibold">
                          {member.invoicesCount}
                        </td>

                        {/* Units sold */}
                        <td className="py-3 px-3 text-center text-slate-700 font-bold">
                          {member.unitsSold}
                        </td>

                        {/* Revenue */}
                        <td className="py-3 px-3 text-right font-semibold text-slate-700">
                          {formatCurrency(member.revenue, currencySymbol)}
                        </td>

                        {/* Gross Profit */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-emerald-600">
                            {formatCurrency(member.grossProfit, currencySymbol)}
                          </span>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {member.marginPct.toFixed(1)}% margin
                          </p>
                        </td>

                        {/* Commission */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">
                            {formatCurrency(member.estimatedCommission, currencySymbol)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Users className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
              <p className="font-bold text-slate-600">No staff sales recorded for this month</p>
              <p className="text-[11px] text-slate-400">Checkout transactions logged with staff cashier tags will appear on this leaderboard.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
