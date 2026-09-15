import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Receipt, 
  ArrowUpRight, 
  ArrowDownRight, 
  Search, 
  Printer, 
  Download, 
  ShoppingBag, 
  Package, 
  Tag, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft, 
  CreditCard, 
  Clock, 
  Smartphone, 
  ShieldAlert, 
  Percent, 
  Filter, 
  FileText, 
  CheckCircle2, 
  Layers, 
  Building, 
  User, 
  SlidersHorizontal,
  X,
  ExternalLink,
  Info,
  BarChart3
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Area, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  Sale, 
  Product, 
  ExpenseRecord, 
  ShopSettings, 
  AppTab, 
  PaymentMethod,
  SaleItem,
  StaffUser
} from '../../types';
import { 
  formatCurrency, 
  formatDate, 
  formatDateTime, 
  getCategoryLabel, 
  getPaymentMethodInfo 
} from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import {
  exportDailyProfitDossierPdf,
  exportDailyProfitStatementPdf,
  exportDailyProfitLedgerPdf,
} from '../../utils/dailyProfitPdfExport';
import { AnnualProfitManager } from './AnnualProfitManager';
import { MonthlyProfitManager } from './MonthlyProfitManager';
import { StorageService } from '../../utils/storage';

interface DailyGrossProfitManagerProps {
  sales: Sale[];
  products: Product[];
  expenses: ExpenseRecord[];
  settings: ShopSettings;
  staffUsers?: StaffUser[];
  currentStaffUser?: StaffUser;
  onViewInvoice?: (sale: Sale) => void;
  onNavigateTab?: (tab: AppTab) => void;
  initialDate?: string;
  initialScope?: 'daily' | 'monthly' | 'annual';
}

type ProfitViewTab = 'overview' | 'ledger' | 'categories' | 'statement' | 'top_items';

const PAYMENT_THEMES: Record<string, { label: string; color: string; bg: string }> = {
  cash: { label: 'Cash', color: '#10B981', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  kpay: { label: 'KBZPay', color: '#3B82F6', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  wave: { label: 'WavePay', color: '#EAB308', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  kbz: { label: 'KBZ Bank', color: '#6366F1', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  aya: { label: 'AYA Bank', color: '#EF4444', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  cb: { label: 'CB Bank', color: '#EC4899', bg: 'bg-pink-50 text-pink-700 border-pink-200' },
  yoma: { label: 'Yoma Bank', color: '#8B5CF6', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
  split: { label: 'Split Pay', color: '#14B8A6', bg: 'bg-teal-50 text-teal-700 border-teal-200' },
};

const CATEGORY_PALETTE = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316'];

export const DailyGrossProfitManager: React.FC<DailyGrossProfitManagerProps> = ({
  sales,
  products,
  expenses,
  settings,
  staffUsers,
  currentStaffUser,
  onViewInvoice,
  onNavigateTab,
  initialDate,
  initialScope,
}) => {
  const [profitScope, setProfitScope] = useState<'daily' | 'monthly' | 'annual'>(initialScope || 'daily');

  // Selected date in YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    return new Date().toISOString().slice(0, 10);
  });

  const [activeTab, setActiveTab] = useState<ProfitViewTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [marginFilter, setMarginFilter] = useState<'all' | 'high' | 'medium' | 'slim' | 'loss'>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPdfMenuOpen, setIsPdfMenuOpen] = useState(false);

  // Quick Date Navigation
  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleSetToday = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  const handleSetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  // Formatted display date
  const displayFormattedDate = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
    } catch {}
    return selectedDate;
  }, [selectedDate]);

  // Product map for quick cost fallback lookup
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      map.set(p.id, p.costPrice || 0);
    });
    return map;
  }, [products]);

  // Daily Sales & Daily Expenses
  const dailySales = useMemo(() => {
    return sales.filter((s) => s.date.startsWith(selectedDate));
  }, [sales, selectedDate]);

  const dailyExpenses = useMemo(() => {
    return expenses.filter((e) => e.date.startsWith(selectedDate));
  }, [expenses, selectedDate]);

  // Calculate detailed financials for the day
  const dailyFinancials = useMemo(() => {
    const completedSales = dailySales.filter((s) => s.status === 'completed');
    const refundedSales = dailySales.filter((s) => s.status === 'refunded');

    let grossRevenue = 0;
    let totalDiscountsGiven = 0;
    let totalCogs = 0;
    let totalUnitsSold = 0;
    let serializedPhoneUnits = 0;
    let accessoryUnits = 0;

    // Hourly Distribution for 8 AM - 10 PM
    const hourlyStats: Record<number, { hourLabel: string; revenue: number; cogs: number; profit: number; count: number }> = {};
    for (let h = 8; h <= 21; h++) {
      const label = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
      hourlyStats[h] = { hourLabel: label, revenue: 0, cogs: 0, profit: 0, count: 0 };
    }

    // Category profitability map
    const categoryStats: Record<string, { name: string; revenue: number; cogs: number; profit: number; units: number }> = {};

    // Payment method distribution
    const paymentStats: Record<string, { revenue: number; cogs: number; profit: number; count: number }> = {};

    // Product leaderboard
    const productStats: Record<string, { id: string; name: string; category: string; units: number; revenue: number; cogs: number; profit: number }> = {};

    // Detailed invoice-by-invoice analysis
    const invoiceRows = completedSales.map((sale) => {
      const saleRevenue = sale.grandTotal;
      let saleCogs = 0;
      let saleUnits = 0;

      const itemRows = sale.items.map((item) => {
        const unitCost = item.costPrice > 0 ? item.costPrice : (productCostMap.get(item.productId) || 0);
        const lineRevenue = item.finalPrice !== undefined 
          ? item.finalPrice 
          : (item.unitPrice * item.quantity - (item.discount || 0));
        const lineCogs = unitCost * item.quantity;
        const lineProfit = lineRevenue - lineCogs;
        const lineMargin = lineRevenue > 0 ? (lineProfit / lineRevenue) * 100 : 0;

        saleCogs += lineCogs;
        saleUnits += item.quantity;

        // Category aggregation
        const catKey = item.category || 'other';
        if (!categoryStats[catKey]) {
          categoryStats[catKey] = {
            name: getCategoryLabel(catKey),
            revenue: 0,
            cogs: 0,
            profit: 0,
            units: 0,
          };
        }
        categoryStats[catKey].revenue += lineRevenue;
        categoryStats[catKey].cogs += lineCogs;
        categoryStats[catKey].profit += lineProfit;
        categoryStats[catKey].units += item.quantity;

        // Serialized phone vs accessory count
        if (item.category === 'brand_new_phones' || item.category === 'pre_owned_phones') {
          serializedPhoneUnits += item.quantity;
        } else {
          accessoryUnits += item.quantity;
        }

        // Product stats aggregation
        const prodKey = item.productId || item.name;
        if (!productStats[prodKey]) {
          productStats[prodKey] = {
            id: item.productId,
            name: item.name,
            category: getCategoryLabel(item.category),
            units: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
          };
        }
        productStats[prodKey].units += item.quantity;
        productStats[prodKey].revenue += lineRevenue;
        productStats[prodKey].cogs += lineCogs;
        productStats[prodKey].profit += lineProfit;

        return {
          ...item,
          unitCost,
          lineRevenue,
          lineCogs,
          lineProfit,
          lineMargin,
        };
      });

      const saleProfit = saleRevenue - saleCogs;
      const saleMargin = saleRevenue > 0 ? (saleProfit / saleRevenue) * 100 : 0;

      grossRevenue += saleRevenue;
      totalCogs += saleCogs;
      totalUnitsSold += saleUnits;
      totalDiscountsGiven += (sale.discountTotal || 0);

      // Hourly aggregation
      try {
        const saleHour = new Date(sale.date).getHours();
        if (hourlyStats[saleHour]) {
          hourlyStats[saleHour].revenue += saleRevenue;
          hourlyStats[saleHour].cogs += saleCogs;
          hourlyStats[saleHour].profit += saleProfit;
          hourlyStats[saleHour].count += 1;
        } else {
          hourlyStats[saleHour] = {
            hourLabel: `${saleHour > 12 ? saleHour - 12 : saleHour} ${saleHour >= 12 ? 'PM' : 'AM'}`,
            revenue: saleRevenue,
            cogs: saleCogs,
            profit: saleProfit,
            count: 1,
          };
        }
      } catch {}

      // Payment method aggregation
      const methodKey = sale.paymentMethod || 'cash';
      if (!paymentStats[methodKey]) {
        paymentStats[methodKey] = { revenue: 0, cogs: 0, profit: 0, count: 0 };
      }
      paymentStats[methodKey].revenue += saleRevenue;
      paymentStats[methodKey].cogs += saleCogs;
      paymentStats[methodKey].profit += saleProfit;
      paymentStats[methodKey].count += 1;

      return {
        sale,
        saleRevenue,
        saleCogs,
        saleProfit,
        saleMargin,
        itemRows,
      };
    });

    const totalRefundsAmount = refundedSales.reduce((acc, s) => acc + s.grandTotal, 0);
    const netSalesRevenue = Math.max(0, grossRevenue - totalRefundsAmount);
    const grossProfit = grossRevenue - totalCogs;
    const overallGrossMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    const overallMarkupPercent = totalCogs > 0 ? (grossProfit / totalCogs) * 100 : 0;
    const averageProfitPerOrder = completedSales.length > 0 ? grossProfit / completedSales.length : 0;

    // Daily Expenses
    const operatingExpensesTotal = dailyExpenses.reduce((acc, e) => acc + e.amount, 0);
    const writeOffScrapLosses = dailyExpenses
      .filter((e) => e.category === 'damage_loss' || e.paidTo?.includes('Inventory Scrap Write-Off') || e.isAutoGenerated)
      .reduce((acc, e) => acc + e.amount, 0);

    const netOperatingProfit = grossProfit - operatingExpensesTotal;
    const netProfitMargin = grossRevenue > 0 ? (netOperatingProfit / grossRevenue) * 100 : 0;

    // Hourly chart data array
    const hourlyChartData = Object.keys(hourlyStats)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b)
      .map((h) => hourlyStats[h]);

    // Category chart data array
    const categoryRows = Object.entries(categoryStats).map(([key, data], idx) => {
      const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
      const contribution = grossProfit > 0 ? (data.profit / grossProfit) * 100 : 0;
      return {
        key,
        name: data.name,
        revenue: data.revenue,
        cogs: data.cogs,
        profit: data.profit,
        units: data.units,
        margin,
        contribution,
        color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
      };
    }).sort((a, b) => b.profit - a.profit);

    // Payment chart data
    const paymentRows = Object.entries(paymentStats).map(([method, data]) => {
      const theme = PAYMENT_THEMES[method] || { label: method, color: '#64748B', bg: 'bg-slate-100' };
      return {
        method,
        label: theme.label,
        color: theme.color,
        revenue: data.revenue,
        cogs: data.cogs,
        profit: data.profit,
        count: data.count,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Cash vs Digital Profit split
    const cashStats = paymentStats['cash'] || { revenue: 0, cogs: 0, profit: 0, count: 0 };
    const digitalRevenue = grossRevenue - cashStats.revenue;
    const digitalProfit = grossProfit - cashStats.profit;

    // Top products array
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 15);

    return {
      completedInvoicesCount: completedSales.length,
      refundedInvoicesCount: refundedSales.length,
      grossRevenue,
      netSalesRevenue,
      totalDiscountsGiven,
      totalRefundsAmount,
      totalCogs,
      totalUnitsSold,
      serializedPhoneUnits,
      accessoryUnits,
      grossProfit,
      overallGrossMargin,
      overallMarkupPercent,
      averageProfitPerOrder,
      operatingExpensesTotal,
      writeOffScrapLosses,
      netOperatingProfit,
      netProfitMargin,
      cashRevenue: cashStats.revenue,
      cashProfit: cashStats.profit,
      digitalRevenue,
      digitalProfit,
      invoiceRows,
      hourlyChartData,
      categoryRows,
      paymentRows,
      topProducts,
    };
  }, [dailySales, dailyExpenses, productCostMap]);

  // Filtered invoice rows
  const filteredInvoiceRows = useMemo(() => {
    return dailyFinancials.invoiceRows.filter((row) => {
      const { sale, saleMargin } = row;
      const matchesSearch = 
        !searchQuery ||
        sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sale.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sale.customerPhone && sale.customerPhone.includes(searchQuery)) ||
        (sale.soldBy && sale.soldBy.toLowerCase().includes(searchQuery.toLowerCase())) ||
        sale.items.some((i) => 
          i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (i.imei && i.imei.includes(searchQuery))
        );

      const matchesPayment = paymentFilter === 'all' || sale.paymentMethod === paymentFilter;

      let matchesMargin = true;
      if (marginFilter === 'high') matchesMargin = saleMargin >= 25;
      else if (marginFilter === 'medium') matchesMargin = saleMargin >= 10 && saleMargin < 25;
      else if (marginFilter === 'slim') matchesMargin = saleMargin >= 0 && saleMargin < 10;
      else if (marginFilter === 'loss') matchesMargin = saleMargin < 0;

      return matchesSearch && matchesPayment && matchesMargin;
    });
  }, [dailyFinancials.invoiceRows, searchQuery, paymentFilter, marginFilter]);

  const toggleInvoiceExpand = (id: string) => {
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAllInvoices = () => {
    const allIds = new Set(dailyFinancials.invoiceRows.map((r) => r.sale.id));
    setExpandedInvoiceIds(allIds);
  };

  const collapseAllInvoices = () => {
    setExpandedInvoiceIds(new Set());
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'Invoice Number',
      'Date & Time',
      'Customer',
      'Phone',
      'Salesperson',
      'Payment Method',
      'Items Count',
      `Invoiced Total (${settings.currencySymbol})`,
      `Total Cost (${settings.currencySymbol})`,
      `Gross Profit (${settings.currencySymbol})`,
      'Gross Margin %',
    ];

    const rows = dailyFinancials.invoiceRows.map(({ sale, saleRevenue, saleCogs, saleProfit, saleMargin }) => [
      sale.invoiceNumber,
      formatDateTime(sale.date),
      sale.customerName || 'Walk-in Customer',
      sale.customerPhone || 'N/A',
      sale.soldBy || 'Staff',
      getPaymentMethodInfo(sale.paymentMethod).label,
      sale.items.reduce((sum, i) => sum + i.quantity, 0),
      saleRevenue,
      saleCogs,
      saleProfit,
      `${saleMargin.toFixed(1)}%`,
    ]);

    exportToCsv(`daily_gross_profit_${selectedDate}.csv`, headers, rows);
  };

  // PDF Export Handlers
  const handleExportFullDossierPdf = () => {
    setIsPdfMenuOpen(false);
    exportDailyProfitDossierPdf({
      selectedDate,
      displayFormattedDate,
      dailyFinancials,
      dailyExpenses,
      settings,
      staffName: currentStaffUser?.name,
    });
  };

  const handleExportStatementPdf = () => {
    setIsPdfMenuOpen(false);
    exportDailyProfitStatementPdf({
      selectedDate,
      displayFormattedDate,
      dailyFinancials,
      dailyExpenses,
      settings,
      staffName: currentStaffUser?.name,
    });
  };

  const handleExportLedgerPdf = () => {
    setIsPdfMenuOpen(false);
    const filterDesc = [
      searchQuery ? `Search: "${searchQuery}"` : '',
      paymentFilter !== 'all' ? `Payment: ${(paymentFilter || '').toUpperCase()}` : '',
      marginFilter !== 'all' ? `Margin: ${(marginFilter || '').toUpperCase()}` : '',
    ].filter(Boolean).join(' | ');

    exportDailyProfitLedgerPdf({
      selectedDate,
      displayFormattedDate,
      dailyFinancials,
      dailyExpenses,
      settings,
      staffName: currentStaffUser?.name,
      activeFilterSummary: filterDesc,
      filteredInvoices: filteredInvoiceRows,
    });
  };

  // Default export PDF triggers the comprehensive dossier
  const handleExportPdf = () => {
    handleExportFullDossierPdf();
  };

  return (
    <div id="daily-gross-profit-module" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Scope Switcher: Daily Closing vs Annual & Multi-Year P&L */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900 text-white p-3.5 sm:px-5 sm:py-3.5 rounded-2xl shadow-md border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase font-extrabold tracking-wider text-indigo-300">
                Financial Management & P&L Suite
              </span>
            </div>
            <span className="text-sm sm:text-base font-bold text-white">
              {profitScope === 'daily' 
                ? 'Daily Shift Reconciliation & Day P&L' 
                : profitScope === 'monthly'
                ? 'Monthly Profit & Financial Performance (MoM)'
                : 'Annual & Multi-Year Fiscal P&L Statement'}
            </span>
          </div>
        </div>

        <div className="flex items-center p-1 bg-slate-800 rounded-xl border border-slate-700/80 shadow-inner self-start sm:self-auto gap-1">
          <button
            type="button"
            onClick={() => setProfitScope('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              profitScope === 'daily'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Daily Profit</span>
          </button>
          <button
            type="button"
            onClick={() => setProfitScope('monthly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              profitScope === 'monthly'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Monthly Profit</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/30 font-extrabold">
              MoM
            </span>
          </button>
          <button
            type="button"
            onClick={() => setProfitScope('annual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              profitScope === 'annual'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Annual P&L</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 font-extrabold">
              FY
            </span>
          </button>
        </div>
      </div>

      {profitScope === 'monthly' ? (
        <MonthlyProfitManager
          sales={sales}
          expenses={expenses}
          products={products}
          staffUsers={staffUsers || StorageService.getStaffUsers()}
          settings={settings}
          onViewInvoice={onViewInvoice}
          onNavigateTab={onNavigateTab}
        />
      ) : profitScope === 'annual' ? (
        <AnnualProfitManager
          sales={sales}
          products={products}
          expenses={expenses}
          settings={settings}
          currentStaffUser={currentStaffUser}
          onNavigateTab={onNavigateTab}
          onViewDailyDate={(dateStr) => {
            setSelectedDate(dateStr);
            setProfitScope('daily');
          }}
        />
      ) : (
        <>
          {/* Module Header & Date Control Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Financial Management Module
              </span>
              {isToday && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Today
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Daily Gross Profit & P&L Analysis
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Accurate itemized cost of goods sold (COGS), real-time device margins, and store bottom-line operating income.
            </p>
          </div>

          {/* Quick Date Stepper & Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleShiftDate(-1)}
                title="Previous Day"
                className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSetToday}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  isToday 
                    ? 'bg-indigo-600 text-white shadow-2xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleSetYesterday}
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleShiftDate(1)}
                title="Next Day"
                className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Custom Date Input */}
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            {/* Print & Export Actions */}
            <div className="flex items-center gap-1.5">
              {/* PDF Export Dropdown Button */}
              <div className="relative">
                <div className="inline-flex rounded-xl shadow-2xs">
                  <button
                    type="button"
                    onClick={handleExportFullDossierPdf}
                    title="Export Full Daily Gross Profit & P&L PDF Dossier"
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-l-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
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
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Daily Profit PDF Formats</span>
                      <p className="text-xs text-slate-600 font-medium mt-0.5">Select your desired financial report layout</p>
                    </div>

                    <div className="p-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={handleExportFullDossierPdf}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-50 transition-colors flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 mt-0.5">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center gap-1.5">
                            <span>Full Financial Dossier</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold">Landscape</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            KPIs, category profitability, cash/digital split, invoice ledger & dual sign-off.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportStatementPdf}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-50 transition-colors flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 mt-0.5">
                          <Receipt className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-indigo-700 flex items-center gap-1.5">
                            <span>Official P&L Statement</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-semibold">Portrait</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            Executive 1-page P&L with revenue, COGS, gross profit, expenses & bottom line.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportLedgerPdf}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-50 transition-colors flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 mt-0.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 flex items-center gap-1.5">
                            <span>Transactions Ledger</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded font-semibold">Active Filter</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            Detailed sales table with items, unit costs, gross margins and cashier tracking.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                title="Print Daily Profit Statement"
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Statement</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                title="Export CSV Data"
                className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Selected Date Header Sub-banner */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span className="font-bold text-slate-900 text-sm">{displayFormattedDate}</span>
            <span className="text-slate-400">•</span>
            <span>{dailyFinancials.completedInvoicesCount} invoices recorded</span>
            <span className="text-slate-400">•</span>
            <span>{dailyFinancials.totalUnitsSold} units sold</span>
          </div>

          {/* Quick links to sister financial tools */}
          <div className="flex items-center gap-2">
            {onNavigateTab && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('pos')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                >
                  <span>Open POS Register</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => onNavigateTab('expenses')}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 transition-colors"
                >
                  <span>Record Expense</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => onNavigateTab('cash_drawer')}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors"
                >
                  <span>Cash Drawer Shift</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Primary Financial KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card 1: Gross Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Daily Sales Revenue</span>
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(dailyFinancials.grossRevenue, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{dailyFinancials.completedInvoicesCount} Orders</span>
            {dailyFinancials.totalDiscountsGiven > 0 && (
              <span className="text-amber-600 font-medium">-{formatCurrency(dailyFinancials.totalDiscountsGiven, settings.currencySymbol)} disc.</span>
            )}
          </div>
        </div>

        {/* Card 2: Cost of Goods Sold (COGS) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Cost of Goods (COGS)</span>
            <Package className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-700">
            {formatCurrency(dailyFinancials.totalCogs, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{dailyFinancials.totalUnitsSold} Units</span>
            <span className="font-semibold text-slate-700">
              {dailyFinancials.grossRevenue > 0 
                ? `${((dailyFinancials.totalCogs / dailyFinancials.grossRevenue) * 100).toFixed(1)}% of sales` 
                : '0%'}
            </span>
          </div>
        </div>

        {/* Card 3: Daily Gross Profit (Core Highlight) */}
        <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white p-4 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">
            <span>Daily Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">
            {formatCurrency(dailyFinancials.grossProfit, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-indigo-200 mt-2 pt-2 border-t border-indigo-800/80">
            <span className="font-bold text-white">
              {dailyFinancials.overallGrossMargin.toFixed(1)}% Margin
            </span>
            <span className="text-indigo-300">
              {dailyFinancials.overallMarkupPercent.toFixed(1)}% Markup
            </span>
          </div>
        </div>

        {/* Card 4: Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Operating Expenses</span>
            <Receipt className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600">
            {formatCurrency(dailyFinancials.operatingExpensesTotal, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{dailyExpenses.length} Vouchers</span>
            {dailyFinancials.writeOffScrapLosses > 0 ? (
              <span className="text-rose-700 font-medium">
                Incl. {formatCurrency(dailyFinancials.writeOffScrapLosses, settings.currencySymbol)} scrap
              </span>
            ) : (
              <span>Bills & Delivery</span>
            )}
          </div>
        </div>

        {/* Card 5: Net Operating Profit */}
        <div className={`p-4 rounded-2xl border shadow-2xs ${
          dailyFinancials.netOperatingProfit >= 0 
            ? 'bg-emerald-50/70 border-emerald-200' 
            : 'bg-rose-50/70 border-rose-200'
        }`}>
          <div className="flex items-center justify-between text-xs font-semibold mb-1">
            <span className={dailyFinancials.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
              Net Operating Profit
            </span>
            {dailyFinancials.netOperatingProfit >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <p className={`text-2xl font-black ${
            dailyFinancials.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}>
            {formatCurrency(dailyFinancials.netOperatingProfit, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-200/60">
            <span className="text-slate-600">Bottom Line</span>
            <span className={`font-bold ${dailyFinancials.netOperatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {dailyFinancials.netProfitMargin.toFixed(1)}% Net Margin
            </span>
          </div>
        </div>

      </div>

      {/* Cash vs Digital Channels Settlement Reconciliation */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Cash Drawer vs Digital Collections
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Reconciles physical cash revenue destined for the cash drawer versus digital bank/wallet receipts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Cash Sales & Profit</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-sm font-black text-slate-900">
                {formatCurrency(dailyFinancials.cashRevenue, settings.currencySymbol)}
              </span>
              <span className="text-[11px] font-bold text-emerald-600">
                ({formatCurrency(dailyFinancials.cashProfit, settings.currencySymbol)} profit)
              </span>
            </div>
          </div>

          <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Digital Sales & Profit (KPay/Wave/Banks)</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-sm font-black text-indigo-600">
                {formatCurrency(dailyFinancials.digitalRevenue, settings.currencySymbol)}
              </span>
              <span className="text-[11px] font-bold text-emerald-600">
                ({formatCurrency(dailyFinancials.digitalProfit, settings.currencySymbol)} profit)
              </span>
            </div>
          </div>
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
            Overview & Hourly Trends
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ledger'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Invoice Profit Ledger</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'ledger' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {dailyFinancials.completedInvoicesCount}
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
            Category Profitability
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('top_items')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeTab === 'top_items'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Top Profitable Items
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
            Daily P&L Statement
          </button>
          <button
            type="button"
            onClick={() => setProfitScope('annual')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Annual P&L Analysis</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-200 text-emerald-900 font-extrabold">NEW</span>
          </button>
        </div>
      </div>

      {/* TAB CONTENT 1: OVERVIEW & HOURLY TRENDS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Hourly Profitability Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Hourly Sales & Gross Profit Timeline
                </h3>
                <p className="text-xs text-slate-500">
                  Hour-by-hour operational rhythm showing peak profit generating windows throughout the day.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-indigo-500"></span>
                  <span className="text-slate-600">Gross Sales</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-300"></span>
                  <span className="text-slate-600">COGS</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500"></span>
                  <span className="text-slate-900 font-bold">Gross Profit</span>
                </div>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyFinancials.hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="hourLabel" 
                    stroke="#94A3B8" 
                    fontSize={11} 
                    tickLine={false} 
                  />
                  <YAxis 
                    stroke="#94A3B8" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatCurrency(value, settings.currencySymbol),
                      name === 'revenue' ? 'Sales Revenue' : name === 'cogs' ? 'Cost of Goods' : 'Gross Profit'
                    ]}
                    labelStyle={{ fontWeight: 'bold', color: '#1E293B' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="revenue" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={28} name="revenue" />
                  <Bar dataKey="cogs" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={28} name="cogs" />
                  <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981' }} name="profit" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Device Category vs Accessory Dynamics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Category Performance Matrix */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-slate-900">
                  Category Profit Contribution Today
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {dailyFinancials.categoryRows.length} Categories Sold
                </span>
              </div>

              {dailyFinancials.categoryRows.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No completed category transactions for {selectedDate}.
                </div>
              ) : (
                <div className="space-y-3">
                  {dailyFinancials.categoryRows.map((cat) => (
                    <div key={cat.key} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-900">{cat.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">{cat.units} units</span>
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10px]">
                            {cat.margin.toFixed(1)}% Margin
                          </span>
                        </div>
                      </div>
                      
                      {/* Bar indicator */}
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full rounded-full transition-all" 
                          style={{ 
                            width: `${Math.min(100, Math.max(5, cat.contribution))}%`, 
                            backgroundColor: cat.color 
                          }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] mt-1.5 text-slate-600">
                        <span>Rev: {formatCurrency(cat.revenue, settings.currencySymbol)}</span>
                        <span>COGS: {formatCurrency(cat.cogs, settings.currencySymbol)}</span>
                        <span className="font-bold text-slate-900">
                          Profit: {formatCurrency(cat.profit, settings.currencySymbol)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Shop Domain Insight & Fast Stats */}
            <div className="space-y-4">
              <div className="bg-linear-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-indigo-600 text-white">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-indigo-950">
                      Mobile Shop Margin Mechanics
                    </h4>
                    <p className="text-xs text-indigo-800/80 mt-1 leading-relaxed">
                      Brand-new smartphones typically turn over at <strong>6% - 12% gross margin</strong>, driving revenue volume. In contrast, cases, screen protectors, chargers, and pre-owned devices yield <strong>35% - 65% gross margin</strong>, making up the bulk of net operating cash profit.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-indigo-200/70">
                  <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100">
                    <span className="text-[10px] font-bold text-indigo-900 uppercase">Smartphones Sold</span>
                    <p className="text-xl font-black text-indigo-950 mt-0.5">
                      {dailyFinancials.serializedPhoneUnits} units
                    </p>
                    <span className="text-[10px] text-indigo-700">Serialized IMEI tracking</span>
                  </div>
                  <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100">
                    <span className="text-[10px] font-bold text-indigo-900 uppercase">Accessories Sold</span>
                    <p className="text-xl font-black text-indigo-950 mt-0.5">
                      {dailyFinancials.accessoryUnits} units
                    </p>
                    <span className="text-[10px] text-indigo-700">High-margin profit boosters</span>
                  </div>
                </div>
              </div>

              {/* Payment Methods Distribution Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                  Payment Channels Profit Share
                </h4>
                <div className="space-y-2.5">
                  {dailyFinancials.paymentRows.map((pay) => (
                    <div key={pay.method} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pay.color }}></span>
                        <span className="font-semibold text-slate-800">{pay.label}</span>
                        <span className="text-[10px] text-slate-400">({pay.count} txns)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900">
                          {formatCurrency(pay.revenue, settings.currencySymbol)}
                        </span>
                        <span className="text-[10px] text-emerald-600 block">
                          +{formatCurrency(pay.profit, settings.currencySymbol)} profit
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* TAB CONTENT 2: INVOICE PROFIT LEDGER */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          
          {/* Ledger Toolbar & Search */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search invoice #, customer, staff, or IMEI..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700"
              >
                <option value="all">All Payments</option>
                <option value="cash">Cash Only</option>
                <option value="kpay">KBZPay</option>
                <option value="wave">WavePay</option>
                <option value="kbz">KBZ Bank</option>
                <option value="aya">AYA Bank</option>
                <option value="cb">CB Bank</option>
              </select>

              <select
                value={marginFilter}
                onChange={(e) => setMarginFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700"
              >
                <option value="all">All Margins</option>
                <option value="high">High Margin (≥ 25%)</option>
                <option value="medium">Medium (10% - 25%)</option>
                <option value="slim">Slim Margin (&lt; 10%)</option>
                <option value="loss">Loss / Negative</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportLedgerPdf}
                title="Export Filtered Ledger as PDF"
                className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Download className="w-3 h-3" />
                <span>Export Ledger PDF</span>
              </button>
              <button
                type="button"
                onClick={expandAllInvoices}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Expand Items
              </button>
              <button
                type="button"
                onClick={collapseAllInvoices}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Collapse
              </button>
            </div>
          </div>

          {/* Invoices Profit Table */}
          {filteredInvoiceRows.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No completed transactions match the filters for {selectedDate}.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredInvoiceRows.map(({ sale, saleRevenue, saleCogs, saleProfit, saleMargin, itemRows }) => {
                const isExpanded = expandedInvoiceIds.has(sale.id);
                const payTheme = PAYMENT_THEMES[sale.paymentMethod] || { label: sale.paymentMethod, bg: 'bg-slate-100' };

                return (
                  <div key={sale.id} className="transition-colors hover:bg-slate-50/50">
                    
                    {/* Invoice Row Header */}
                    <div 
                      onClick={() => toggleInvoiceExpand(sale.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-slate-400 hover:text-slate-700">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs font-mono">
                              #{sale.invoiceNumber}
                            </span>
                            <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${payTheme.bg}`}>
                              {payTheme.label}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-medium text-slate-700">
                              {sale.customerName || 'Walk-in Customer'}
                            </span>
                            {sale.customerPhone && <span>({sale.customerPhone})</span>}
                            <span>•</span>
                            <span>Cashier: {sale.soldBy || 'Staff'}</span>
                            <span>•</span>
                            <span>{itemRows.length} item{itemRows.length > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>

                      {/* Profit Numbers */}
                      <div className="flex items-center gap-4 sm:gap-6 text-right shrink-0">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Revenue</span>
                          <span className="text-xs font-black text-slate-900">
                            {formatCurrency(saleRevenue, settings.currencySymbol)}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Cost</span>
                          <span className="text-xs font-medium text-slate-600">
                            {formatCurrency(saleCogs, settings.currencySymbol)}
                          </span>
                        </div>

                        <div className="min-w-[90px]">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Gross Profit</span>
                          <div className="flex items-baseline justify-end gap-1">
                            <span className={`text-sm font-black ${saleProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCurrency(saleProfit, settings.currencySymbol)}
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold block ${saleProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {saleMargin.toFixed(1)}% margin
                          </span>
                        </div>

                        {onViewInvoice && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewInvoice(sale);
                            }}
                            title="View Invoice Receipt"
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Line Item Details */}
                    {isExpanded && (
                      <div className="bg-slate-50 px-4 py-3 sm:px-10 border-t border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Item-Level Cost & Profit Breakdown
                        </p>
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3">Item Description</th>
                                <th className="py-2 px-3">Category</th>
                                <th className="py-2 px-3 text-center">Qty</th>
                                <th className="py-2 px-3 text-right">Unit Cost</th>
                                <th className="py-2 px-3 text-right">Selling Price</th>
                                <th className="py-2 px-3 text-right">Line Revenue</th>
                                <th className="py-2 px-3 text-right">Gross Profit</th>
                                <th className="py-2 px-3 text-right">Margin %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {itemRows.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/70">
                                  <td className="py-2 px-3 font-medium text-slate-900">
                                    {item.name}
                                    {item.imei && (
                                      <span className="block text-[10px] font-mono text-indigo-600">
                                        IMEI/SN: {item.imei}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 text-[11px]">
                                    {getCategoryLabel(item.category)}
                                  </td>
                                  <td className="py-2 px-3 text-center font-bold text-slate-700">
                                    {item.quantity}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-500 font-mono">
                                    {formatCurrency(item.unitCost, settings.currencySymbol)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-700 font-mono">
                                    {formatCurrency(item.unitPrice, settings.currencySymbol)}
                                    {item.discount > 0 && (
                                      <span className="block text-[10px] text-rose-500">
                                        -{formatCurrency(item.discount, settings.currencySymbol)} disc
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                                    {formatCurrency(item.lineRevenue, settings.currencySymbol)}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-black font-mono ${
                                    item.lineProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                  }`}>
                                    {formatCurrency(item.lineProfit, settings.currencySymbol)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-slate-700">
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                                      item.lineMargin >= 25 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : item.lineMargin >= 10 
                                        ? 'bg-blue-100 text-blue-800' 
                                        : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {item.lineMargin.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* TAB CONTENT 3: CATEGORY PROFITABILITY */}
      {activeTab === 'categories' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Department & Category Profitability Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparative analysis of sales volume, inventory cost absorption, and profit margins across product lines for {displayFormattedDate}.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Category Name</th>
                  <th className="py-3 px-4 text-center">Units Sold</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                  <th className="py-3 px-4 text-right">Cost of Goods</th>
                  <th className="py-3 px-4 text-right">Gross Profit</th>
                  <th className="py-3 px-4 text-right">Gross Margin %</th>
                  <th className="py-3 px-4 text-right">Profit Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyFinancials.categoryRows.map((cat) => (
                  <tr key={cat.key} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }}></span>
                      {cat.name}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">
                      {cat.units}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800 font-mono">
                      {formatCurrency(cat.revenue, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-500 font-mono">
                      {formatCurrency(cat.cogs, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-emerald-600 font-mono">
                      {formatCurrency(cat.profit, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        cat.margin >= 30 ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {cat.margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-700">
                      {cat.contribution.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-200">
                <tr>
                  <td className="py-3 px-4">TOTALS</td>
                  <td className="py-3 px-4 text-center">{dailyFinancials.totalUnitsSold}</td>
                  <td className="py-3 px-4 text-right font-mono">
                    {formatCurrency(dailyFinancials.grossRevenue, settings.currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {formatCurrency(dailyFinancials.totalCogs, settings.currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-600">
                    {formatCurrency(dailyFinancials.grossProfit, settings.currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {dailyFinancials.overallGrossMargin.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: TOP PROFITABLE ITEMS LEADERBOARD */}
      {activeTab === 'top_items' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Top Profit Generating Products Today
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked list of products delivering the highest gross profit contribution on {displayFormattedDate}.
            </p>
          </div>

          {dailyFinancials.topProducts.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No product sales recorded for {selectedDate}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Units</th>
                    <th className="py-3 px-4 text-right">Revenue</th>
                    <th className="py-3 px-4 text-right">Total Cost</th>
                    <th className="py-3 px-4 text-right">Gross Profit</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyFinancials.topProducts.map((prod, idx) => {
                    const margin = prod.revenue > 0 ? (prod.profit / prod.revenue) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-bold text-slate-400">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {prod.name}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {prod.category}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700">
                          {prod.units}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-800 font-mono">
                          {formatCurrency(prod.revenue, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-500 font-mono">
                          {formatCurrency(prod.cogs, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600 font-mono">
                          {formatCurrency(prod.profit, settings.currencySymbol)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            margin >= 30 ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 5: DAILY P&L STATEMENT */}
      {activeTab === 'statement' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs max-w-3xl mx-auto space-y-6">
          <div className="text-center pb-4 border-b border-slate-200">
            <h2 className="text-xl font-black text-slate-900">{settings.shopName}</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">
              Daily Statement of Profit and Loss
            </p>
            <p className="text-xs text-indigo-600 font-bold mt-1">
              For Period: {displayFormattedDate}
            </p>
          </div>

          <div className="space-y-4 text-xs">
            
            {/* 1. Operating Revenue */}
            <div>
              <h4 className="font-black text-slate-900 text-sm mb-2">1. Operating Revenue</h4>
              <div className="space-y-1.5 pl-3 border-l-2 border-slate-200">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Gross POS Sales (Completed Orders)</span>
                  <span className="font-mono">{formatCurrency(dailyFinancials.grossRevenue, settings.currencySymbol)}</span>
                </div>
                {dailyFinancials.totalDiscountsGiven > 0 && (
                  <div className="flex items-center justify-between text-rose-600">
                    <span>Less: Promotional Discounts Given</span>
                    <span className="font-mono">({formatCurrency(dailyFinancials.totalDiscountsGiven, settings.currencySymbol)})</span>
                  </div>
                )}
                {dailyFinancials.totalRefundsAmount > 0 && (
                  <div className="flex items-center justify-between text-rose-600">
                    <span>Less: Customer Refunds Issued</span>
                    <span className="font-mono">({formatCurrency(dailyFinancials.totalRefundsAmount, settings.currencySymbol)})</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-bold text-slate-900 pt-1 border-t border-slate-100">
                  <span>Net Sales Revenue</span>
                  <span className="font-mono">{formatCurrency(dailyFinancials.netSalesRevenue, settings.currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* 2. Cost of Goods Sold */}
            <div>
              <h4 className="font-black text-slate-900 text-sm mb-2">2. Cost of Goods Sold (COGS)</h4>
              <div className="space-y-1.5 pl-3 border-l-2 border-slate-200">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Direct Inventory Procurement Cost of Sold Units</span>
                  <span className="font-mono">({formatCurrency(dailyFinancials.totalCogs, settings.currencySymbol)})</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>(Encompassing {dailyFinancials.serializedPhoneUnits} phones & {dailyFinancials.accessoryUnits} accessories)</span>
                </div>
              </div>
            </div>

            {/* 3. Gross Profit */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-between font-black text-emerald-900 text-sm">
                <span>DAILY GROSS PROFIT</span>
                <span className="font-mono text-base">{formatCurrency(dailyFinancials.grossProfit, settings.currencySymbol)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-emerald-700 font-semibold mt-1">
                <span>Gross Profit Margin</span>
                <span>{dailyFinancials.overallGrossMargin.toFixed(1)}%</span>
              </div>
            </div>

            {/* 4. Operating Expenses */}
            <div>
              <h4 className="font-black text-slate-900 text-sm mb-2">4. Operating Expenses & Deductions</h4>
              <div className="space-y-1.5 pl-3 border-l-2 border-slate-200">
                {dailyExpenses.length === 0 ? (
                  <div className="text-slate-400 italic text-[11px]">No operating expenses recorded for this date.</div>
                ) : (
                  dailyExpenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between text-slate-700">
                      <span>{exp.title} ({exp.voucherNumber})</span>
                      <span className="font-mono text-rose-600">({formatCurrency(exp.amount, settings.currencySymbol)})</span>
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between font-bold text-slate-900 pt-1 border-t border-slate-100">
                  <span>Total Daily Operational Disbursements</span>
                  <span className="font-mono text-rose-600">({formatCurrency(dailyFinancials.operatingExpensesTotal, settings.currencySymbol)})</span>
                </div>
              </div>
            </div>

            {/* 5. Net Operating Profit */}
            <div className={`p-4 rounded-xl border-2 ${
              dailyFinancials.netOperatingProfit >= 0 
                ? 'bg-emerald-100/60 border-emerald-400 text-emerald-950' 
                : 'bg-rose-100/60 border-rose-400 text-rose-950'
            }`}>
              <div className="flex items-center justify-between font-black text-base">
                <span>NET DAILY OPERATING PROFIT</span>
                <span className="font-mono text-lg">
                  {formatCurrency(dailyFinancials.netOperatingProfit, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold mt-1.5">
                <span>Net Profit Margin</span>
                <span>{dailyFinancials.netProfitMargin.toFixed(1)}%</span>
              </div>
            </div>

          </div>

          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleExportStatementPdf}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Statement PDF (Portrait)</span>
            </button>
            <button
              type="button"
              onClick={handleExportFullDossierPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Full Dossier PDF (Landscape)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>
          </div>
        </div>
      )}

      {/* PRINTABLE DAILY PROFIT VOUCHER MODAL */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">Print Daily Gross Profit Slip</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Preview Area */}
            <div id="printable-profit-voucher" className="p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50/50 font-mono text-xs space-y-3">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <p className="font-bold text-sm text-slate-900 uppercase">{settings.shopName}</p>
                <p className="text-[10px] text-slate-500">{settings.address || 'Mobile Phone & Electronics Store'}</p>
                <p className="text-[10px] text-slate-500">Tel: {settings.phone || 'N/A'}</p>
                <p className="text-[11px] font-bold text-indigo-700 mt-1">DAILY GROSS PROFIT RECONCILIATION</p>
                <p className="text-[10px] text-slate-600">Date: {displayFormattedDate}</p>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between">
                  <span>Completed Invoices:</span>
                  <span className="font-bold">{dailyFinancials.completedInvoicesCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Units Sold:</span>
                  <span className="font-bold">{dailyFinancials.totalUnitsSold}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Revenue:</span>
                  <span className="font-bold">{formatCurrency(dailyFinancials.grossRevenue, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cost of Goods (COGS):</span>
                  <span>{formatCurrency(dailyFinancials.totalCogs, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t border-slate-200">
                  <span>GROSS PROFIT:</span>
                  <span>{formatCurrency(dailyFinancials.grossProfit, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-emerald-700">
                  <span>Gross Margin:</span>
                  <span>{dailyFinancials.overallGrossMargin.toFixed(1)}%</span>
                </div>
              </div>

              <div className="space-y-1 border-b border-dashed border-slate-300 pb-2 text-[11px]">
                <div className="flex justify-between text-rose-700">
                  <span>Operating Expenses ({dailyExpenses.length}):</span>
                  <span>-{formatCurrency(dailyFinancials.operatingExpensesTotal, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between font-black text-xs text-slate-900 pt-1 border-t border-slate-200">
                  <span>NET OPERATING PROFIT:</span>
                  <span>{formatCurrency(dailyFinancials.netOperatingProfit, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>Net Margin:</span>
                  <span>{dailyFinancials.netProfitMargin.toFixed(1)}%</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-slate-500 space-y-4">
                <div className="flex justify-between text-[9px]">
                  <span>Cash Drawer: {formatCurrency(dailyFinancials.cashRevenue, settings.currencySymbol)}</span>
                  <span>Digital: {formatCurrency(dailyFinancials.digitalRevenue, settings.currencySymbol)}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-6 text-center border-t border-dashed border-slate-300">
                  <div>
                    <div className="border-b border-slate-400 h-6"></div>
                    <span className="text-[9px] mt-1 block">Prepared by Staff</span>
                  </div>
                  <div>
                    <div className="border-b border-slate-400 h-6"></div>
                    <span className="text-[9px] mt-1 block">Verified by Owner / Mgr</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExportStatementPdf();
                  setIsPrintModalOpen(false);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Save Statement PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExportFullDossierPdf();
                  setIsPrintModalOpen(false);
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Full Dossier PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}

    </div>
  );
};
