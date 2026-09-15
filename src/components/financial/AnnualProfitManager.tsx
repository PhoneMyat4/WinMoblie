import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Receipt, 
  ArrowUpRight, 
  ArrowDownRight, 
  Printer, 
  Download, 
  ShoppingBag, 
  Package, 
  ChevronDown, 
  FileText, 
  CheckCircle2, 
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  Layers,
  ArrowRight,
  Filter,
  Sparkles,
  Building,
  Info
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  Sale, 
  Product, 
  ExpenseRecord, 
  ShopSettings, 
  AppTab, 
  StaffUser 
} from '../../types';
import { formatCurrency, getCategoryLabel } from '../../utils/formatters';
import { 
  AnnualFinancialData, 
  MonthlyFinancialSummary, 
  QuarterlySummary,
  exportAnnualProfitDossierPdf, 
  exportAnnualProfitStatementPdf, 
  exportAnnualProfitCsv 
} from '../../utils/annualProfitPdfExport';

interface AnnualProfitManagerProps {
  sales: Sale[];
  products: Product[];
  expenses: ExpenseRecord[];
  settings: ShopSettings;
  currentStaffUser?: StaffUser;
  onNavigateTab?: (tab: AppTab) => void;
  onViewDailyDate?: (dateString: string) => void;
}

type AnnualViewTab = 'overview' | 'monthly_table' | 'categories' | 'top_products' | 'expenses' | 'statement';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', 
  '#06B6D4', '#EF4444', '#14B8A6', '#64748B'
];

export const AnnualProfitManager: React.FC<AnnualProfitManagerProps> = ({
  sales,
  products,
  expenses,
  settings,
  currentStaffUser,
  onNavigateTab,
  onViewDailyDate,
}) => {
  // Available Years detected in database
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    const currentYr = new Date().getFullYear();
    yearsSet.add(currentYr);

    sales.forEach((s) => {
      if (s.date) {
        const yr = parseInt(s.date.slice(0, 4), 10);
        if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
      }
    });

    expenses.forEach((e) => {
      if (e.date) {
        const yr = parseInt(e.date.slice(0, 4), 10);
        if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
      }
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [sales, expenses]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return new Date().getFullYear();
  });

  const [activeTab, setActiveTab] = useState<AnnualViewTab>('overview');
  const [isPdfMenuOpen, setIsPdfMenuOpen] = useState(false);
  const [compareWithPriorYear, setCompareWithPriorYear] = useState(true);

  // Product cost map fallback
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      map.set(p.id, p.costPrice || 0);
    });
    return map;
  }, [products]);

  // Prior year financial totals for YoY comparison
  const priorYear = selectedYear - 1;
  const priorYearSales = useMemo(() => {
    return sales.filter((s) => s.date && s.date.startsWith(String(priorYear)));
  }, [sales, priorYear]);

  const priorYearFinancials = useMemo(() => {
    let gross = 0;
    let cogs = 0;
    priorYearSales.forEach((s) => {
      if (s.status === 'completed') {
        gross += s.grandTotal || 0;
        s.items?.forEach((it) => {
          const unitCost = it.costPrice !== undefined ? it.costPrice : (productCostMap.get(it.productId) || 0);
          cogs += (it.quantity || 1) * unitCost;
        });
      }
    });
    const grossProfit = gross - cogs;
    return { grossRevenue: gross, totalCogs: cogs, grossProfit };
  }, [priorYearSales, productCostMap]);

  // Annual Financials Computation for the selectedYear
  const annualData = useMemo<AnnualFinancialData>(() => {
    const yearStr = String(selectedYear);
    const yearSales = sales.filter((s) => s.date && s.date.startsWith(yearStr));
    const yearExpenses = expenses.filter((e) => e.date && e.date.startsWith(yearStr));

    const completedSales = yearSales.filter((s) => s.status === 'completed');
    const refundedSales = yearSales.filter((s) => s.status === 'refunded');

    let grossSalesRevenue = 0;
    let totalDiscountsGiven = 0;
    let totalCogs = 0;
    let totalUnitsSold = 0;
    let phoneUnitsSold = 0;
    let accessoryUnitsSold = 0;

    // Monthly buckets (0 to 11)
    const monthlyStats: Array<{
      ordersCount: number;
      unitsSold: number;
      grossRevenue: number;
      discountsGiven: number;
      netRevenue: number;
      cogs: number;
      grossProfit: number;
      operatingExpenses: number;
    }> = Array.from({ length: 12 }, () => ({
      ordersCount: 0,
      unitsSold: 0,
      grossRevenue: 0,
      discountsGiven: 0,
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      operatingExpenses: 0,
    }));

    // Categories bucket
    const categoryMap = new Map<string, { revenue: number; cogs: number; profit: number; units: number }>();

    // Products bucket
    const productMap = new Map<string, { name: string; category: string; units: number; revenue: number; cogs: number; profit: number }>();

    // Process Completed Sales
    completedSales.forEach((sale) => {
      grossSalesRevenue += sale.grandTotal || 0;
      const saleDiscount = sale.discountTotal || 0;
      totalDiscountsGiven += saleDiscount;

      let saleMonth = 0;
      try {
        const m = parseInt(sale.date.slice(5, 7), 10) - 1;
        if (m >= 0 && m <= 11) saleMonth = m;
      } catch {}

      monthlyStats[saleMonth].ordersCount += 1;
      monthlyStats[saleMonth].grossRevenue += sale.grandTotal || 0;
      monthlyStats[saleMonth].discountsGiven += saleDiscount;
      monthlyStats[saleMonth].netRevenue += sale.grandTotal || 0;

      let saleCogs = 0;

      sale.items?.forEach((item) => {
        const qty = item.quantity || 1;
        totalUnitsSold += qty;
        monthlyStats[saleMonth].unitsSold += qty;

        const unitCost = item.costPrice !== undefined ? item.costPrice : (productCostMap.get(item.productId) || 0);
        const itemCogs = qty * unitCost;
        const itemRevenue = item.finalPrice !== undefined ? item.finalPrice : (item.unitPrice * qty);
        const itemProfit = itemRevenue - itemCogs;

        saleCogs += itemCogs;
        totalCogs += itemCogs;

        // Categorize by phone vs accessory
        const catLower = (item.category || '').toLowerCase();
        if (catLower.includes('phone') || item.imei || item.imei2) {
          phoneUnitsSold += qty;
        } else {
          accessoryUnitsSold += qty;
        }

        // Category aggregator
        const catKey = item.category || 'General Products';
        const currentCat = categoryMap.get(catKey) || { revenue: 0, cogs: 0, profit: 0, units: 0 };
        currentCat.revenue += itemRevenue;
        currentCat.cogs += itemCogs;
        currentCat.profit += itemProfit;
        currentCat.units += qty;
        categoryMap.set(catKey, currentCat);

        // Product aggregator
        const prodKey = item.productId || item.name;
        const currentProd = productMap.get(prodKey) || {
          name: item.name,
          category: item.category || 'General',
          units: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
        };
        currentProd.units += qty;
        currentProd.revenue += itemRevenue;
        currentProd.cogs += itemCogs;
        currentProd.profit += itemProfit;
        productMap.set(prodKey, currentProd);
      });

      monthlyStats[saleMonth].cogs += saleCogs;
      monthlyStats[saleMonth].grossProfit += (sale.grandTotal - saleCogs);
    });

    // Process Refunds
    let totalRefundsAmount = 0;
    refundedSales.forEach((s) => {
      totalRefundsAmount += s.grandTotal || 0;
    });

    const netSalesRevenue = grossSalesRevenue - totalRefundsAmount;
    const grossProfit = netSalesRevenue - totalCogs;
    const grossMarginPercent = netSalesRevenue > 0 ? (grossProfit / netSalesRevenue) * 100 : 0;

    // Process Expenses
    let totalOperatingExpenses = 0;
    const expenseCategoryMap = new Map<string, { amount: number; count: number }>();

    yearExpenses.forEach((exp) => {
      const amt = exp.amount || 0;
      totalOperatingExpenses += amt;

      let expMonth = 0;
      try {
        const m = parseInt(exp.date.slice(5, 7), 10) - 1;
        if (m >= 0 && m <= 11) expMonth = m;
      } catch {}
      monthlyStats[expMonth].operatingExpenses += amt;

      const cat = exp.category || 'General Expenses';
      const curExp = expenseCategoryMap.get(cat) || { amount: 0, count: 0 };
      curExp.amount += amt;
      curExp.count += 1;
      expenseCategoryMap.set(cat, curExp);
    });

    const netOperatingProfit = grossProfit - totalOperatingExpenses;
    const netMarginPercent = netSalesRevenue > 0 ? (netOperatingProfit / netSalesRevenue) * 100 : 0;
    const averageOrderValue = completedSales.length > 0 ? grossSalesRevenue / completedSales.length : 0;

    // Build Monthly Summaries
    const months: MonthlyFinancialSummary[] = monthlyStats.map((st, idx) => {
      const gProfit = st.grossRevenue - st.cogs;
      const gMargin = st.grossRevenue > 0 ? (gProfit / st.grossRevenue) * 100 : 0;
      const nProfit = gProfit - st.operatingExpenses;
      const nMargin = st.grossRevenue > 0 ? (nProfit / st.grossRevenue) * 100 : 0;
      const monthNum = String(idx + 1).padStart(2, '0');

      return {
        monthIndex: idx,
        monthName: MONTH_SHORT[idx],
        fullName: MONTH_NAMES[idx],
        monthKey: `${selectedYear}-${monthNum}`,
        ordersCount: st.ordersCount,
        unitsSold: st.unitsSold,
        grossRevenue: st.grossRevenue,
        discountsGiven: st.discountsGiven,
        netRevenue: st.netRevenue,
        cogs: st.cogs,
        grossProfit: gProfit,
        grossMarginPercent: gMargin,
        operatingExpenses: st.operatingExpenses,
        netOperatingProfit: nProfit,
        netMarginPercent: nMargin,
      };
    });

    // Build Quarterly Summaries
    const quarters: QuarterlySummary[] = [
      { quarter: 'Q1', name: 'Quarter 1', months: 'Jan - Mar', slice: [0, 3] },
      { quarter: 'Q2', name: 'Quarter 2', months: 'Apr - Jun', slice: [3, 6] },
      { quarter: 'Q3', name: 'Quarter 3', months: 'Jul - Sep', slice: [6, 9] },
      { quarter: 'Q4', name: 'Quarter 4', months: 'Oct - Dec', slice: [9, 12] },
    ].map(({ quarter, name, months: mLabel, slice }) => {
      const qMonths = months.slice(slice[0], slice[1]);
      const qRev = qMonths.reduce((sum, m) => sum + m.grossRevenue, 0);
      const qCogs = qMonths.reduce((sum, m) => sum + m.cogs, 0);
      const qGrossProfit = qRev - qCogs;
      const qExp = qMonths.reduce((sum, m) => sum + m.operatingExpenses, 0);
      const qNetProfit = qGrossProfit - qExp;
      const qMargin = qRev > 0 ? (qGrossProfit / qRev) * 100 : 0;
      const qNetMargin = qRev > 0 ? (qNetProfit / qRev) * 100 : 0;
      const qOrders = qMonths.reduce((sum, m) => sum + m.ordersCount, 0);

      return {
        quarter,
        name,
        months: mLabel,
        grossRevenue: qRev,
        cogs: qCogs,
        grossProfit: qGrossProfit,
        grossMarginPercent: qMargin,
        operatingExpenses: qExp,
        netOperatingProfit: qNetProfit,
        netMarginPercent: qNetMargin,
        ordersCount: qOrders,
      };
    });

    // Build Category Summaries
    const categories = Array.from(categoryMap.entries())
      .map(([cat, val]) => ({
        category: getCategoryLabel(cat),
        revenue: val.revenue,
        cogs: val.cogs,
        profit: val.profit,
        marginPercent: val.revenue > 0 ? (val.profit / val.revenue) * 100 : 0,
        unitsSold: val.units,
        profitContributionPercent: grossProfit > 0 ? (val.profit / grossProfit) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);

    // Build Top Products
    const topProducts = Array.from(productMap.values())
      .map((p) => ({
        name: p.name,
        category: getCategoryLabel(p.category),
        unitsSold: p.units,
        revenue: p.revenue,
        cogs: p.cogs,
        profit: p.profit,
        marginPercent: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 15);

    // Build Expense Categories
    const expensesByCategory = Array.from(expenseCategoryMap.entries())
      .map(([cat, val]) => ({
        category: cat,
        amount: val.amount,
        count: val.count,
        percentageOfTotal: totalOperatingExpenses > 0 ? (val.amount / totalOperatingExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      selectedYear,
      isCurrentYear: selectedYear === new Date().getFullYear(),
      totalCompletedInvoices: completedSales.length,
      totalRefundedInvoices: refundedSales.length,
      totalUnitsSold,
      phoneUnitsSold,
      accessoryUnitsSold,
      grossSalesRevenue,
      totalDiscountsGiven,
      totalRefundsAmount,
      netSalesRevenue,
      totalCogs,
      grossProfit,
      grossMarginPercent,
      totalOperatingExpenses,
      netOperatingProfit,
      netMarginPercent,
      averageOrderValue,
      months,
      quarters,
      categories,
      topProducts,
      expensesByCategory,
    };
  }, [sales, expenses, selectedYear, productCostMap]);

  // YoY Growth Rate Calculation
  const yoyRevenueGrowth = priorYearFinancials.grossRevenue > 0
    ? ((annualData.grossSalesRevenue - priorYearFinancials.grossRevenue) / priorYearFinancials.grossRevenue) * 100
    : null;

  const yoyProfitGrowth = priorYearFinancials.grossProfit > 0
    ? ((annualData.grossProfit - priorYearFinancials.grossProfit) / priorYearFinancials.grossProfit) * 100
    : null;

  // Chart Data for 12 months
  const monthlyChartData = useMemo(() => {
    return annualData.months.map((m) => ({
      name: m.monthName,
      fullName: m.fullName,
      revenue: Math.round(m.grossRevenue),
      cogs: Math.round(m.cogs),
      grossProfit: Math.round(m.grossProfit),
      expenses: Math.round(m.operatingExpenses),
      netProfit: Math.round(m.netOperatingProfit),
      margin: Math.round(m.grossMarginPercent),
    }));
  }, [annualData.months]);

  // Export handlers
  const handleExportFullDossier = () => {
    setIsPdfMenuOpen(false);
    exportAnnualProfitDossierPdf({
      annualData,
      settings,
      staffName: currentStaffUser?.name,
    });
  };

  const handleExportStatement = () => {
    setIsPdfMenuOpen(false);
    exportAnnualProfitStatementPdf({
      annualData,
      settings,
      staffName: currentStaffUser?.name,
    });
  };

  const handleExportCsvData = () => {
    exportAnnualProfitCsv(annualData, settings.currencySymbol);
  };

  return (
    <div id="annual-profit-manager" className="space-y-6">
      
      {/* Top Header & Year Selector Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Annual Financial & Fiscal Reporting
              </span>
              {annualData.isCurrentYear && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Year-to-Date (YTD) {annualData.selectedYear}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Annual Profit & Multi-Year P&L Statement
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Cumulative 12-month store revenue, realized inventory COGS, operating overhead, and audited net profit.
            </p>
          </div>

          {/* Year Selection & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Year Buttons */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              {availableYears.slice(0, 3).map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    selectedYear === yr
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  {yr}
                </button>
              ))}

              {availableYears.length > 3 && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  aria-label="Select fiscal year"
                  className="bg-transparent text-xs font-bold text-slate-700 px-2 py-1 outline-hidden cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      FY {yr}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-1.5">
              {/* PDF Dropdown Button */}
              <div className="relative">
                <div className="inline-flex rounded-xl shadow-2xs">
                  <button
                    type="button"
                    onClick={handleExportFullDossier}
                    title="Export Full Annual Financial Dossier PDF"
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-l-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Annual PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPdfMenuOpen((prev) => !prev)}
                    title="Choose PDF Format"
                    className="px-2 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-r-xl text-xs font-bold border-l border-rose-500/60 transition-all flex items-center justify-center cursor-pointer"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPdfMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isPdfMenuOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onClick={() => setIsPdfMenuOpen(false)}
                  >
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Annual PDF Formats</span>
                      <p className="text-xs text-slate-600 font-medium mt-0.5">Select your desired annual financial document</p>
                    </div>

                    <div className="p-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={handleExportFullDossier}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-50 transition-colors flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 mt-0.5">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center gap-1.5">
                            <span>Full Annual Dossier</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold">Landscape</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            12-month schedule, quarterly tables, category contributions, and dual sign-off.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportStatement}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-50 transition-colors flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 mt-0.5">
                          <Receipt className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-indigo-700 flex items-center gap-1.5">
                            <span>Official Annual P&L</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-semibold">Portrait</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            Multi-step GAAP-standard income statement for bank audits, tax, and owners.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportCsvData}
                title="Export 12-Month Performance CSV"
                className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Selected Year Sub-banner */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">Fiscal Year {selectedYear}</span>
            <span className="text-slate-400">•</span>
            <span>{annualData.totalCompletedInvoices.toLocaleString()} total invoices</span>
            <span className="text-slate-400">•</span>
            <span>{annualData.totalUnitsSold.toLocaleString()} total units sold</span>
            <span className="text-slate-400">•</span>
            <span className="text-indigo-600 font-semibold">{annualData.phoneUnitsSold} phones</span>
            <span className="text-slate-400">&</span>
            <span className="text-emerald-600 font-semibold">{annualData.accessoryUnitsSold} accessories</span>
          </div>

          {/* Quick links & YoY comparison toggle */}
          <div className="flex items-center gap-3">
            {priorYearFinancials.grossRevenue > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={compareWithPriorYear}
                  onChange={(e) => setCompareWithPriorYear(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Compare with {priorYear} (YoY)</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Primary Annual Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card 1: Annual Gross Sales Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Annual Gross Sales</span>
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(annualData.grossSalesRevenue, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{annualData.totalCompletedInvoices} Invoices</span>
            {compareWithPriorYear && yoyRevenueGrowth !== null && (
              <span className={`font-semibold flex items-center gap-0.5 ${yoyRevenueGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {yoyRevenueGrowth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(yoyRevenueGrowth).toFixed(1)}% YoY
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Annual Cost of Goods Sold (COGS) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Annual Cost Basis (COGS)</span>
            <Package className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-700">
            {formatCurrency(annualData.totalCogs, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{annualData.totalUnitsSold} Units Sold</span>
            <span className="font-semibold text-slate-700">
              {annualData.grossSalesRevenue > 0 
                ? `${((annualData.totalCogs / annualData.grossSalesRevenue) * 100).toFixed(1)}% of sales` 
                : '0%'}
            </span>
          </div>
        </div>

        {/* Card 3: Annual Gross Profit (Core Trading Margin) */}
        <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white p-4 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Annual Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">
            {formatCurrency(annualData.grossProfit, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-indigo-200 mt-2 pt-2 border-t border-indigo-800/80">
            <span className="font-bold text-white">
              {annualData.grossMarginPercent.toFixed(1)}% Gross Margin
            </span>
            {compareWithPriorYear && yoyProfitGrowth !== null && (
              <span className={`font-semibold flex items-center gap-0.5 ${yoyProfitGrowth >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {yoyProfitGrowth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(yoyProfitGrowth).toFixed(1)}% YoY
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Annual Overhead (Expenses)</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-slate-800">
            {formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{annualData.expensesByCategory.length} Cost Categories</span>
            <span className="font-semibold text-rose-600">
              {annualData.grossSalesRevenue > 0
                ? `${((annualData.totalOperatingExpenses / annualData.grossSalesRevenue) * 100).toFixed(1)}% of rev.`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Card 5: Net Operating Profit (Bottom Line) */}
        <div className={`p-4 rounded-2xl border shadow-2xs ${
          annualData.netOperatingProfit >= 0 
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
            : 'bg-rose-50/70 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1">
            <span className={annualData.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
              Net Operating Profit
            </span>
            <CheckCircle2 className={`w-4 h-4 ${annualData.netOperatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
          </div>
          <p className={`text-2xl font-black ${annualData.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatCurrency(annualData.netOperatingProfit, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] font-semibold mt-2 pt-2 border-t border-emerald-200/60">
            <span>Net Bottom Line</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
              annualData.netOperatingProfit >= 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
            }`}>
              {annualData.netMarginPercent.toFixed(1)}% Net Margin
            </span>
          </div>
        </div>
      </div>

      {/* Quarterly Performance Highlights */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Quarterly Financial Milestones (FY {selectedYear})
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">Q1 through Q4 aggregated performance</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {annualData.quarters.map((q) => (
            <div 
              key={q.quarter}
              className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-indigo-100 text-indigo-800">
                  {q.quarter} ({q.months})
                </span>
                <span className="text-[11px] font-bold text-emerald-600">
                  {q.grossMarginPercent.toFixed(1)}% Margin
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Revenue:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(q.grossRevenue, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>COGS:</span>
                  <span className="font-medium text-slate-700">{formatCurrency(q.cogs, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Gross Profit:</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(q.grossProfit, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Expenses:</span>
                  <span className="text-rose-600 font-medium">{formatCurrency(q.operatingExpenses, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-slate-200/70">
                  <span className="font-bold text-slate-700">Net Profit:</span>
                  <span className={`font-bold ${q.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(q.netOperatingProfit, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            12-Month Performance Charts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monthly_table')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'monthly_table'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Monthly Performance Ledger</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'monthly_table' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              12 mos
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Category Profitability ({annualData.categories.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('top_products')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'top_products'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Top Profitable Products (Annual)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'expenses'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Overhead Breakdown
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('statement')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'statement'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Official Income Statement (P&L)
          </button>
        </div>
      </div>

      {/* TAB 1: 12-MONTH CHARTS & OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main 12-Month Bar & Area Composed Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Monthly Revenue vs. COGS vs. Net Profit (FY {selectedYear})
                </h3>
                <p className="text-xs text-slate-500">
                  Compare top-line sales, inventory acquisition cost, and net profit generation month by month.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-indigo-600"></span>
                  <span className="font-semibold text-slate-700">Gross Sales</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-400"></span>
                  <span className="font-semibold text-slate-700">COGS Basis</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500"></span>
                  <span className="font-semibold text-slate-700">Net Profit</span>
                </div>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  />
                  <Tooltip 
                    formatter={(val: any, name: any) => [
                      formatCurrency(Number(val), settings.currencySymbol),
                      name === 'revenue' ? 'Gross Revenue' : name === 'cogs' ? 'Cost of Goods (COGS)' : name === 'netProfit' ? 'Net Operating Profit' : name
                    ]}
                    labelFormatter={(label, items) => {
                      const item = items?.[0]?.payload;
                      return item?.fullName || label;
                    }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="cogs" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Row: Profit Margin Fluctuations & Department Contribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Margin Trend Over the Year */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-black text-slate-900 mb-1">
                Monthly Profit Margin Fluctuations (%)
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Monthly gross margin performance (Average annual margin: {annualData.grossMarginPercent.toFixed(1)}%)
              </p>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} unit="%" />
                    <Tooltip 
                      formatter={(v: any) => [`${v}%`, 'Gross Margin']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    />
                    <Area type="monotone" dataKey="margin" stroke="#10b981" fill="#ecfdf5" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department Profit Contribution Pie */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-1">
                  Department Gross Profit Distribution
                </h3>
                <p className="text-xs text-slate-500 mb-2">
                  Share of annual profit contributed by each merchandise department.
                </p>
              </div>

              {annualData.categories.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={annualData.categories.slice(0, 6)}
                          dataKey="profit"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          {annualData.categories.slice(0, 6).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(v: any) => [formatCurrency(Number(v), settings.currencySymbol), 'Gross Profit']}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex-1 space-y-1.5 w-full">
                    {annualData.categories.slice(0, 5).map((cat, idx) => (
                      <div key={cat.category} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} 
                          />
                          <span className="font-semibold text-slate-700 truncate">{cat.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <span className="font-bold text-slate-900">{formatCurrency(cat.profit, settings.currencySymbol)}</span>
                          <span className="text-[10px] text-slate-400 font-mono w-10">
                            {cat.profitContributionPercent.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-8 text-center">No category sales recorded for {selectedYear}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MONTHLY PERFORMANCE TABLE */}
      {activeTab === 'monthly_table' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                12-Month Fiscal Performance Ledger (FY {selectedYear})
              </h3>
              <p className="text-xs text-slate-500">
                Complete month-by-month accounting audit with order volumes, merchandise turnover, margins, and expenses.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsvData}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-3 text-right">Invoices</th>
                  <th className="py-3 px-3 text-right">Units</th>
                  <th className="py-3 px-3 text-right">Gross Sales</th>
                  <th className="py-3 px-3 text-right">Discounts</th>
                  <th className="py-3 px-3 text-right">COGS Basis</th>
                  <th className="py-3 px-3 text-right text-emerald-700">Gross Profit</th>
                  <th className="py-3 px-3 text-right">Margin %</th>
                  <th className="py-3 px-3 text-right text-rose-700">Expenses</th>
                  <th className="py-3 px-4 text-right text-indigo-700">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {annualData.months.map((m) => (
                  <tr key={m.monthKey} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <span>{m.fullName}</span>
                      {m.grossRevenue > 0 && onViewDailyDate && (
                        <button
                          type="button"
                          onClick={() => onViewDailyDate(`${m.monthKey}-01`)}
                          title={`Inspect daily records for ${m.monthName}`}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">{m.ordersCount}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">{m.unitsSold}</td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(m.grossRevenue, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-600">
                      {m.discountsGiven > 0 ? `-${formatCurrency(m.discountsGiven, settings.currencySymbol)}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                      {formatCurrency(m.cogs, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                      {formatCurrency(m.grossProfit, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700">
                      {m.grossMarginPercent > 0 ? `${m.grossMarginPercent.toFixed(1)}%` : '0%'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-600">
                      {formatCurrency(m.operatingExpenses, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className={m.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                        {formatCurrency(m.netOperatingProfit, settings.currencySymbol)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="py-3.5 px-4 font-black">ANNUAL TOTAL ({selectedYear})</td>
                  <td className="py-3.5 px-3 text-right font-mono">{annualData.totalCompletedInvoices}</td>
                  <td className="py-3.5 px-3 text-right font-mono">{annualData.totalUnitsSold}</td>
                  <td className="py-3.5 px-3 text-right font-mono">
                    {formatCurrency(annualData.grossSalesRevenue, settings.currencySymbol)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-amber-600">
                    -{formatCurrency(annualData.totalDiscountsGiven, settings.currencySymbol)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono">
                    {formatCurrency(annualData.totalCogs, settings.currencySymbol)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-emerald-600 text-sm">
                    {formatCurrency(annualData.grossProfit, settings.currencySymbol)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-indigo-700">
                    {annualData.grossMarginPercent.toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-rose-600">
                    {formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm">
                    <span className={annualData.netOperatingProfit >= 0 ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}>
                      {formatCurrency(annualData.netOperatingProfit, settings.currencySymbol)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORY PROFITABILITY */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">
                Annual Department & Category Profit Contribution (FY {selectedYear})
              </h3>
              <p className="text-xs text-slate-500">
                Evaluates product department sales margins, inventory turnover, and % contribution to cumulative store profit.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4">Department / Category</th>
                    <th className="py-3 px-3 text-right">Units Sold</th>
                    <th className="py-3 px-3 text-right">Annual Revenue</th>
                    <th className="py-3 px-3 text-right">COGS Basis</th>
                    <th className="py-3 px-3 text-right text-emerald-700">Annual Gross Profit</th>
                    <th className="py-3 px-3 text-right">Margin %</th>
                    <th className="py-3 px-4 text-right text-indigo-700">Store Profit Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {annualData.categories.map((cat, idx) => (
                    <tr key={cat.category} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} 
                        />
                        <span>{cat.category}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{cat.unitsSold}</td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(cat.revenue, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {formatCurrency(cat.cogs, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                        {formatCurrency(cat.profit, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] ${
                          cat.marginPercent >= 25 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {cat.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600">
                        {cat.profitContributionPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TOP PROFITABLE PRODUCTS */}
      {activeTab === 'top_products' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900">
              Top 15 Most Profitable Items for Fiscal Year {selectedYear}
            </h3>
            <p className="text-xs text-slate-500">
              Ranked by cumulative gross profit dollars generated throughout the year.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Rank & Item Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 text-right">Units Sold</th>
                  <th className="py-3 px-3 text-right">Total Revenue</th>
                  <th className="py-3 px-3 text-right">Total COGS</th>
                  <th className="py-3 px-3 text-right text-emerald-700">Gross Profit</th>
                  <th className="py-3 px-4 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {annualData.topProducts.map((p, idx) => (
                  <tr key={p.name} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">{p.category}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">{p.unitsSold}</td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(p.revenue, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                      {formatCurrency(p.cogs, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                      {formatCurrency(p.profit, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] ${
                        p.marginPercent >= 20 ? 'bg-emerald-50 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {p.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: EXPENSES OVERHEAD BREAKDOWN */}
      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">
                Operating Expenses Itemization (FY {selectedYear})
              </h3>
              <p className="text-xs text-slate-500">
                Categorized store expenditures and overhead deductions taken against annual gross profit.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4">Expense Category</th>
                    <th className="py-3 px-3 text-right">Voucher Count</th>
                    <th className="py-3 px-3 text-right text-rose-700">Total Spent</th>
                    <th className="py-3 px-4 text-right">% of Overhead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {annualData.expensesByCategory.map((exp) => (
                    <tr key={exp.category} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{exp.category}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">{exp.count} vouchers</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">
                        {formatCurrency(exp.amount, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700">
                        {exp.percentageOfTotal.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900">
                    <td className="py-3.5 px-4 font-black">TOTAL OPERATING OVERHEAD</td>
                    <td className="py-3.5 px-3 text-right font-mono">
                      {annualData.expensesByCategory.reduce((sum, e) => sum + e.count, 0)} vouchers
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-rose-600 text-sm">
                      {formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-black text-slate-900 mb-1">Overhead Share</h4>
              <p className="text-xs text-slate-500 mb-4">
                Proportion of overhead per category.
              </p>
              <div className="space-y-3">
                {annualData.expensesByCategory.slice(0, 5).map((exp, idx) => (
                  <div key={exp.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700">{exp.category}</span>
                      <span className="text-slate-900">{exp.percentageOfTotal.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-rose-500 rounded-full" 
                        style={{ width: `${Math.min(100, exp.percentageOfTotal)}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {onNavigateTab && (
              <div className="pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => onNavigateTab('expenses')}
                  className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Manage & Record Expenses</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: FORMAL ANNUAL P&L STATEMENT */}
      {activeTab === 'statement' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs max-w-4xl mx-auto">
          {/* Header of Statement */}
          <div className="text-center pb-6 border-b border-slate-200">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">
              {settings.shopName || 'MOBILE STORE POS'}
            </h2>
            <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mt-1">
              Annual Statement of Profit and Loss
            </p>
            <p className="text-xs text-slate-500 mt-1">
              For the Fiscal Year Ended December 31, {selectedYear}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Basis: Realized Item Cost of Goods Sold (COGS) • Reporting Currency: {settings.currencySymbol}
            </p>
          </div>

          {/* Statement Body */}
          <div className="py-6 space-y-6 text-xs text-slate-800">
            
            {/* Section 1: Revenue */}
            <div>
              <div className="flex justify-between font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider text-[11px]">
                <span>1. Operating & Trading Sales Revenue</span>
                <span>Sub-Total</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="py-2 flex justify-between">
                  <span className="pl-4 text-slate-600">
                    Gross Point of Sale Invoiced Sales ({annualData.totalCompletedInvoices.toLocaleString()} orders)
                  </span>
                  <span className="font-mono font-semibold">
                    {formatCurrency(annualData.grossSalesRevenue, settings.currencySymbol)}
                  </span>
                </div>
                {annualData.totalDiscountsGiven > 0 && (
                  <div className="py-2 flex justify-between">
                    <span className="pl-4 text-slate-600">Less: Customer Trade Discounts Given</span>
                    <span className="font-mono text-amber-600">
                      ({formatCurrency(annualData.totalDiscountsGiven, settings.currencySymbol)})
                    </span>
                  </div>
                )}
                {annualData.totalRefundsAmount > 0 && (
                  <div className="py-2 flex justify-between">
                    <span className="pl-4 text-slate-600">
                      Less: Sales Returns & Customer Refunds ({annualData.totalRefundedInvoices} refunds)
                    </span>
                    <span className="font-mono text-amber-600">
                      ({formatCurrency(annualData.totalRefundsAmount, settings.currencySymbol)})
                    </span>
                  </div>
                )}
                <div className="py-2 flex justify-between font-bold bg-indigo-50/50 px-2 rounded-lg text-indigo-900">
                  <span>Net Operating Sales Revenue</span>
                  <span className="font-mono">{formatCurrency(annualData.netSalesRevenue, settings.currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* Section 2: COGS */}
            <div>
              <div className="flex justify-between font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider text-[11px]">
                <span>2. Cost of Goods Sold (Direct Inventory Cost)</span>
                <span>Sub-Total</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="py-2 flex justify-between">
                  <span className="pl-4 text-slate-600">
                    Direct Device Cost Basis & Wholesale Acquisition ({annualData.totalUnitsSold.toLocaleString()} units sold)
                  </span>
                  <span className="font-mono font-semibold">
                    {formatCurrency(annualData.totalCogs, settings.currencySymbol)}
                  </span>
                </div>
                <div className="py-2 flex justify-between font-bold bg-slate-100 px-2 rounded-lg text-slate-800">
                  <span>Total Cost of Sales (COGS)</span>
                  <span className="font-mono">({formatCurrency(annualData.totalCogs, settings.currencySymbol)})</span>
                </div>
              </div>
            </div>

            {/* Gross Profit Callout */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Trading Account Result</span>
                <span className="text-sm font-black text-emerald-950">GROSS OPERATING PROFIT</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black font-mono text-emerald-700 block">
                  {formatCurrency(annualData.grossProfit, settings.currencySymbol)}
                </span>
                <span className="text-xs font-bold text-emerald-800">
                  {annualData.grossMarginPercent.toFixed(2)}% Gross Margin
                </span>
              </div>
            </div>

            {/* Section 3: Operating Expenses */}
            <div>
              <div className="flex justify-between font-bold text-slate-900 border-b border-slate-200 pb-1 uppercase tracking-wider text-[11px]">
                <span>3. Operating Overhead & Store Expenses</span>
                <span>Sub-Total</span>
              </div>
              <div className="divide-y divide-slate-100">
                {annualData.expensesByCategory.map((exp) => (
                  <div key={exp.category} className="py-2 flex justify-between">
                    <span className="pl-4 text-slate-600">
                      {exp.category} ({exp.count} vouchers)
                    </span>
                    <span className="font-mono">{formatCurrency(exp.amount, settings.currencySymbol)}</span>
                  </div>
                ))}
                <div className="py-2 flex justify-between font-bold bg-rose-50/50 px-2 rounded-lg text-rose-900">
                  <span>Total Operating Expenses</span>
                  <span className="font-mono">({formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol)})</span>
                </div>
              </div>
            </div>

            {/* Section 4: Net Operating Income Bottom Line */}
            <div className={`p-5 rounded-2xl border-2 flex items-center justify-between ${
              annualData.netOperatingProfit >= 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest block opacity-80">
                  Final Annual Fiscal Result (FY {selectedYear})
                </span>
                <span className="text-base sm:text-lg font-black">
                  NET OPERATING PROFIT / (LOSS)
                </span>
              </div>
              <div className="text-right">
                <span className={`text-xl sm:text-2xl font-black font-mono block ${
                  annualData.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                  {formatCurrency(annualData.netOperatingProfit, settings.currencySymbol)}
                </span>
                <span className="text-xs font-bold opacity-90">
                  {annualData.netMarginPercent.toFixed(2)}% Net Profit Margin
                </span>
              </div>
            </div>

          </div>

          {/* Actions & Print Button */}
          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleExportStatement}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Statement PDF (Portrait)</span>
            </button>
            <button
              type="button"
              onClick={handleExportFullDossier}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Full Dossier PDF (Landscape)</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
