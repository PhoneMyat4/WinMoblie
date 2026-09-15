import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Package, 
  Receipt, 
  Users, 
  Calendar, 
  Printer, 
  Download, 
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Check,
  Search,
  Filter,
  DollarSign,
  Layers,
  Sparkles,
  ArrowUpRight,
  Smartphone,
  Clock,
  Landmark,
  Tag,
  X,
  ExternalLink
} from 'lucide-react';
import { 
  Product, 
  Sale, 
  Customer, 
  ShopSettings, 
  StockAdjustment, 
  PurchaseRecord, 
  CashDrawerRecord, 
  ExpenseRecord, 
  ShiftReconciliationRecord,
  ProductCategory,
  StaffUser
} from '../../types';
import { StorageService } from '../../utils/storage';
import { TimeframePreset, getDateRangeBounds, filterSalesByTimeframe, exportToCsv } from '../../utils/reportUtils';
import { MostSoldItemsReport } from './MostSoldItemsReport';
import { StockInventoryReport } from './StockInventoryReport';
import { SalesLedgerReport } from './SalesLedgerReport';
import { CustomerReport } from './CustomerReport';
import { CategoryProfitabilityReport } from './CategoryProfitabilityReport';
import { ImeiTraceabilityReport } from './ImeiTraceabilityReport';
import { InventoryAgingReport } from './InventoryAgingReport';
import { ShiftReconciliationReport } from './ShiftReconciliationReport';
import { PriceListReport } from './PriceListReport';
import { SaleKpiReport } from './SaleKpiReport';
import { DailySaleReport } from './DailySaleReport';
import { AnnualProfitManager } from '../financial/AnnualProfitManager';
import { MonthlyProfitManager } from '../financial/MonthlyProfitManager';
import { formatCurrency, getCategoryLabel } from '../../utils/formatters';
import { canonicalCategory, CANONICAL_CATEGORIES } from '../../data/categoryTaxonomy';

export type ReportSubTab = 
  | 'daily_sales'
  | 'monthly_profit'
  | 'annual_profit'
  | 'sales_kpi'
  | 'most_sold' 
  | 'category_profitability'
  | 'imei_traceability'
  | 'inventory_aging'
  | 'price_list'
  | 'shift_reconciliation'
  | 'stocks' 
  | 'sales_ledger' 
  | 'customers';

export type ReportGroup = 'all' | 'sales' | 'inventory' | 'operations';

export interface ReportOptionItem {
  id: ReportSubTab;
  title: string;
  shortTitle: string;
  description: string;
  group: 'sales' | 'inventory' | 'operations';
  groupLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  badge?: string;
}

export const REPORT_OPTIONS: ReportOptionItem[] = [
  // Group: Sales & Analytics
  {
    id: 'daily_sales',
    title: 'Daily Sales Report & Audit',
    shortTitle: 'Daily Sales Report',
    description: 'Inspect detailed revenue, payment methods, hourly sales, and transactions for any selected date',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: Calendar,
    iconBg: 'bg-emerald-50 border-emerald-200',
    iconColor: 'text-emerald-600',
    badge: 'Daily Audit',
  },
  {
    id: 'monthly_profit',
    title: 'Monthly Profit & Financial Performance',
    shortTitle: 'Monthly Profit & MoM',
    description: '30-day operating margin, MoM KPI variance, daily composed trends, and staff commission leaderboard',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: BarChart3,
    iconBg: 'bg-amber-50 border-amber-200',
    iconColor: 'text-amber-600',
    badge: 'Monthly MoM',
  },
  {
    id: 'annual_profit',
    title: 'Annual Profit & Multi-Year P&L Statement',
    shortTitle: 'Annual Profit & P&L',
    description: '12-month fiscal accounting, inventory cost basis (COGS), operating overhead, and audited store net income',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: TrendingUp,
    iconBg: 'bg-indigo-50 border-indigo-200',
    iconColor: 'text-indigo-600',
    badge: 'Annual P&L',
  },
  {
    id: 'sales_kpi',
    title: 'Sales KPI & Performance',
    shortTitle: 'Sales KPI & Categories',
    description: 'Executive overview, revenue metrics, category margins, and hourly traffic heatmap',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: BarChart3,
    iconBg: 'bg-indigo-50 border-indigo-200',
    iconColor: 'text-indigo-600',
    badge: 'Executive',
  },
  {
    id: 'most_sold',
    title: 'Most Sold Items (Velocity)',
    shortTitle: 'Most Sold Items',
    description: 'Fastest-moving phone models, turnover velocity, and bestselling accessories',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: TrendingUp,
    iconBg: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-600',
    badge: 'Velocity',
  },
  {
    id: 'category_profitability',
    title: 'Category Profitability & Margins',
    shortTitle: 'Category Profitability',
    description: 'Gross profit margins, COGS cost analysis, and product department shares',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: DollarSign,
    iconBg: 'bg-emerald-50 border-emerald-200',
    iconColor: 'text-emerald-600',
    badge: 'Margins',
  },
  {
    id: 'sales_ledger',
    title: 'Sales Transaction Ledger',
    shortTitle: 'Sales Ledger',
    description: 'Full chronological transaction ledger with invoice audit trails and payment mix',
    group: 'sales',
    groupLabel: 'Sales & Analytics',
    icon: Receipt,
    iconBg: 'bg-violet-50 border-violet-200',
    iconColor: 'text-violet-600',
    badge: 'Audit Log',
  },

  // Group: Inventory & Devices
  {
    id: 'stocks',
    title: 'Stock Valuation & Inventory Levels',
    shortTitle: 'Stock Valuation',
    description: 'Real-time inventory asset valuation, stock quantity balance, and reorder alerts',
    group: 'inventory',
    groupLabel: 'Inventory & Devices',
    icon: Package,
    iconBg: 'bg-amber-50 border-amber-200',
    iconColor: 'text-amber-600',
    badge: 'Assets',
  },
  {
    id: 'imei_traceability',
    title: 'IMEI Serial Traceability & Lifecycle',
    shortTitle: 'IMEI Traceability',
    description: 'End-to-end device serial tracking across PO receiving, inventory, warranty, and sale',
    group: 'inventory',
    groupLabel: 'Inventory & Devices',
    icon: Smartphone,
    iconBg: 'bg-cyan-50 border-cyan-200',
    iconColor: 'text-cyan-600',
    badge: 'Serials',
  },
  {
    id: 'inventory_aging',
    title: 'Inventory Aging Analysis (30/60/90+ Days)',
    shortTitle: 'Inventory Aging',
    description: 'Dead stock identification, holding cost risk, and aging bracket breakdown',
    group: 'inventory',
    groupLabel: 'Inventory & Devices',
    icon: Clock,
    iconBg: 'bg-rose-50 border-rose-200',
    iconColor: 'text-rose-600',
    badge: 'Holding Risk',
  },
  {
    id: 'price_list',
    title: 'Product Price List & Retail Catalog',
    shortTitle: 'Price List Catalog',
    description: 'Retail & wholesale pricing tables, barcode generation, and cost margin catalog',
    group: 'inventory',
    groupLabel: 'Inventory & Devices',
    icon: Tag,
    iconBg: 'bg-teal-50 border-teal-200',
    iconColor: 'text-teal-600',
    badge: 'Pricing',
  },

  // Group: Operations & CRM
  {
    id: 'shift_reconciliation',
    title: 'End-of-Day Shift Z-Report',
    shortTitle: 'Shift Reconciliation',
    description: 'Register shift summaries, cash drawer float, and payment discrepancy audit',
    group: 'operations',
    groupLabel: 'Operations & Cash',
    icon: Landmark,
    iconBg: 'bg-orange-50 border-orange-200',
    iconColor: 'text-orange-600',
    badge: 'Z-Report',
  },
  {
    id: 'customers',
    title: 'Customer & CRM Performance',
    shortTitle: 'Customer CRM',
    description: 'Customer spending habits, top VIP buyers, repeat order frequency, and credit balances',
    group: 'operations',
    groupLabel: 'Operations & Cash',
    icon: Users,
    iconBg: 'bg-pink-50 border-pink-200',
    iconColor: 'text-pink-600',
    badge: 'CRM',
  },
];

interface ReportsManagerProps {
  products: Product[];
  sales: Sale[];
  customers: Customer[];
  settings: ShopSettings;
  staffUsers?: StaffUser[];
  purchases?: PurchaseRecord[];
  cashDrawer?: CashDrawerRecord;
  expenses?: ExpenseRecord[];
  stockAdjustments?: StockAdjustment[];
  onViewInvoice?: (sale: Sale) => void;
  onOpenBarcodeModal?: (product: Product, imei?: string) => void;
  onSaveShiftSettlement?: (record: ShiftReconciliationRecord) => void;
}

export const ReportsManager: React.FC<ReportsManagerProps> = ({
  products,
  sales,
  customers,
  settings,
  staffUsers,
  purchases = [],
  cashDrawer = {
    id: 'DRAWER-TODAY',
    date: new Date().toISOString().slice(0, 10),
    openedAt: new Date().toISOString(),
    openedBy: 'Admin',
    openingFloat: 50000,
    cashSales: 0,
    cashInManual: [],
    cashOutManual: [],
    expectedInDrawer: 50000,
    actualCounted: 50000,
    variance: 0,
    closingNotes: '',
    status: 'open',
    transactions: [],
  },
  expenses = [],
  stockAdjustments = [],
  onViewInvoice,
  onOpenBarcodeModal,
  onSaveShiftSettlement,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<ReportSubTab>('sales_kpi');
  const [isReportDropdownOpen, setIsReportDropdownOpen] = useState<boolean>(false);
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');
  const [reportGroupFilter, setReportGroupFilter] = useState<ReportGroup>('all');
  const reportDropdownRef = useRef<HTMLDivElement>(null);

  const [timeframePreset, setTimeframePreset] = useState<TimeframePreset>('last_30_days');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Handle clicking outside to close report dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reportDropdownRef.current && !reportDropdownRef.current.contains(event.target as Node)) {
        setIsReportDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsReportDropdownOpen(false);
      }
    };

    if (isReportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isReportDropdownOpen]);

  // Current active report item configuration
  const currentReport = useMemo(() => {
    return REPORT_OPTIONS.find(r => r.id === activeReportTab) || REPORT_OPTIONS[0];
  }, [activeReportTab]);

  // Filter report options by search query and group
  const filteredReportOptions = useMemo(() => {
    return REPORT_OPTIONS.filter((item) => {
      const matchesGroup = reportGroupFilter === 'all' || item.group === reportGroupFilter;
      const q = reportSearchQuery.trim().toLowerCase();
      const matchesSearch = !q || 
        item.title.toLowerCase().includes(q) || 
        item.shortTitle.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q) ||
        item.groupLabel.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [reportGroupFilter, reportSearchQuery]);

  // Quick navigation indices (prev / next report)
  const currentReportIndex = useMemo(() => {
    return REPORT_OPTIONS.findIndex(r => r.id === activeReportTab);
  }, [activeReportTab]);

  const handlePrevReport = () => {
    const prevIndex = currentReportIndex > 0 ? currentReportIndex - 1 : REPORT_OPTIONS.length - 1;
    setActiveReportTab(REPORT_OPTIONS[prevIndex].id);
  };

  const handleNextReport = () => {
    const nextIndex = currentReportIndex < REPORT_OPTIONS.length - 1 ? currentReportIndex + 1 : 0;
    setActiveReportTab(REPORT_OPTIONS[nextIndex].id);
  };

  // Calculate dynamic date bounds based on timeframe preset
  const dateRange = useMemo(() => {
    return getDateRangeBounds(timeframePreset, customStartDate, customEndDate);
  }, [timeframePreset, customStartDate, customEndDate]);

  // Extract all categories available in products normalized to the 5 canonical categories
  const availableCategories = useMemo(() => {
    // Single source of truth: 5 canonical categories with accurate counts
    const categoriesMap = new Map<ProductCategory, { id: ProductCategory; label: string; count: number }>();

    // Seed canonical categories in clean display order
    CANONICAL_CATEGORIES.forEach(c => {
      categoriesMap.set(c.id, {
        id: c.id,
        label: c.label,
        count: 0,
      });
    });

    // Tally product counts normalized to canonical category
    products.forEach(p => {
      const canonical = canonicalCategory(p.category);
      const existing = categoriesMap.get(canonical);
      if (existing) {
        existing.count += 1;
      } else {
        categoriesMap.set(canonical, {
          id: canonical,
          label: getCategoryLabel(canonical),
          count: 1,
        });
      }
    });

    // Only return canonical categories that exist, or all canonical categories with their accurate counts
    return Array.from(categoriesMap.values()).filter(c => c.count > 0);
  }, [products]);

  // Filter sales occurring within the selected timeframe
  const timeframeSales = useMemo(() => {
    return filterSalesByTimeframe(sales, dateRange.startDate, dateRange.endDate);
  }, [sales, dateRange]);

  // Category-filtered sales and products based on selected category (normalized)
  const categoryFilteredSales = useMemo(() => {
    if (selectedCategory === 'all') return timeframeSales;
    const targetCanonical = canonicalCategory(selectedCategory);

    return timeframeSales
      .map(sale => {
        const matchingItems = sale.items.filter(item => canonicalCategory(item.category) === targetCanonical);
        if (matchingItems.length === 0) return null;

        // Recalculate line total for this category
        const categoryGrandTotal = matchingItems.reduce((sum, item) => sum + (item.finalPrice || (item.unitPrice * item.quantity)), 0);
        return {
          ...sale,
          items: matchingItems,
          grandTotal: categoryGrandTotal,
        };
      })
      .filter((s): s is Sale => s !== null);
  }, [timeframeSales, selectedCategory]);

  const categoryFilteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    const targetCanonical = canonicalCategory(selectedCategory);
    return products.filter(p => canonicalCategory(p.category) === targetCanonical);
  }, [products, selectedCategory]);

  // Global KPIs for this timeframe and selected category
  const periodKpis = useMemo(() => {
    let completedRevenue = 0;
    let completedProfit = 0;
    let completedUnits = 0;
    let completedInvoices = 0;

    categoryFilteredSales.forEach((s) => {
      if (s.status === 'completed') {
        completedInvoices++;
        completedRevenue += s.grandTotal;
        let cogs = 0;
        s.items.forEach(i => {
          completedUnits += i.quantity;
          cogs += (i.costPrice || 0) * i.quantity;
        });
        completedProfit += (s.grandTotal - cogs);
      }
    });

    const marginPercent = completedRevenue > 0 ? (completedProfit / completedRevenue) * 100 : 0;

    // Active stock inventory value for selected category products
    let totalStockValuation = 0;
    let totalStockUnits = 0;
    categoryFilteredProducts.forEach(p => {
      totalStockValuation += p.costPrice * p.stock;
      totalStockUnits += p.stock;
    });

    return {
      completedRevenue,
      completedProfit,
      completedUnits,
      completedInvoices,
      marginPercent,
      totalStockValuation,
      totalStockUnits,
    };
  }, [categoryFilteredSales, categoryFilteredProducts]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      
      {/* Top Header & Timeframe Bar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Business Analytics & Reports
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Multi-dimensional reporting for sales KPI metrics, category performance, inventory valuation, and transaction ledger
            </p>
          </div>

          {/* Action buttons & Category Filter Dropdown */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Global Category Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-xs font-bold text-slate-600">Category:</span>
              <select
                id="reports-global-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-black text-slate-900 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Categories ({products.length} Products)</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label} ({cat.count})
                  </option>
                ))}
              </select>
              {selectedCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="text-slate-400 hover:text-slate-700 p-0.5 rounded-full cursor-pointer ml-1"
                  title="Reset to all categories"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Print Action */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>

            {/* Pop-out in New Tab using global data-open-new-tab */}
            <button
              type="button"
              data-open-new-tab="true"
              data-url="?tab=reports"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-colors cursor-pointer"
              title="Open full report in a dedicated browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Tab</span>
            </button>
          </div>
        </div>

        {/* Timeframe Presets & Custom Range Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
            <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1 shrink-0">
              <Calendar className="w-3.5 h-3.5" />
              Period:
            </span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last_7_days', label: 'Last 7 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_30_days', label: 'Last 30 Days' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'all_time', label: 'All Time' },
              { id: 'custom', label: 'Custom' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setTimeframePreset(preset.id as TimeframePreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  timeframePreset === preset.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers (visible if custom is active) */}
          {timeframePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 animate-in fade-in">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden"
                />
              </div>
            </div>
          )}

        </div>

        {/* Filter State Banner (if filtered by category) */}
        {selectedCategory !== 'all' && (
          <div className="bg-indigo-50 border border-indigo-200/80 px-3.5 py-2 rounded-xl flex items-center justify-between text-xs text-indigo-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Filtering all charts, KPIs and widgets by <span className="font-black text-indigo-950">{getCategoryLabel(selectedCategory)}</span> ({categoryFilteredProducts.length} items in catalog)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-950 underline cursor-pointer"
            >
              Reset to All Categories
            </button>
          </div>
        )}

        {/* Real-time Summary strip for active timeframe & category */}
        <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {selectedCategory === 'all' ? 'Period Revenue' : 'Category Revenue'}
            </span>
            <div className="text-base font-black text-slate-900">
              {formatCurrency(periodKpis.completedRevenue, settings.currencySymbol)}
            </div>
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {selectedCategory === 'all' ? 'Gross Profit' : 'Category Profit'}
            </span>
            <div className="text-base font-black text-purple-700">
              {formatCurrency(periodKpis.completedProfit, settings.currencySymbol)}
              <span className="text-[10px] font-bold text-emerald-600 ml-1">({periodKpis.marginPercent.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Units Sold</span>
            <div className="text-base font-black text-slate-900">
              {periodKpis.completedUnits.toLocaleString()} <span className="text-xs font-normal text-slate-500">in {periodKpis.completedInvoices} sales</span>
            </div>
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {selectedCategory === 'all' ? 'Stock Valuation' : 'Category Stock Value'}
            </span>
            <div className="text-base font-black text-emerald-700">
              {formatCurrency(periodKpis.totalStockValuation, settings.currencySymbol)}
              <span className="text-[10px] font-normal text-slate-500 ml-1">({periodKpis.totalStockUnits} in stock)</span>
            </div>
          </div>
        </div>

      </div>

      {/* Report Categories Dropdown Selector */}
      <div ref={reportDropdownRef} className="relative z-30">
        
        {/* Main Selector Bar & Quick Steppers */}
        <div className="bg-white rounded-3xl p-3 sm:p-4 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Active Report Dropdown Trigger Button */}
          <button
            type="button"
            id="report-category-dropdown-trigger"
            onClick={() => setIsReportDropdownOpen((prev) => !prev)}
            aria-expanded={isReportDropdownOpen}
            className="flex-1 flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50/40 border border-slate-200/80 hover:border-indigo-300 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs shrink-0 transition-transform group-hover:scale-105 ${currentReport.iconBg} ${currentReport.iconColor}`}>
                <currentReport.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                    {currentReport.groupLabel}
                  </span>
                  {currentReport.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                      {currentReport.badge}
                    </span>
                  )}
                </div>
                <div className="text-sm sm:text-base font-black text-slate-900 truncate flex items-center gap-1.5 mt-0.5">
                  <span>{currentReport.title}</span>
                </div>
                <p className="text-xs text-slate-500 truncate hidden sm:block">
                  {currentReport.description}
                </p>
              </div>
            </div>

            {/* Dropdown Chevron Indicator */}
            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              <span className="text-xs font-bold text-indigo-600 hidden lg:inline">Switch Report</span>
              <div className={`w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-transform duration-200 ${isReportDropdownOpen ? 'rotate-180 bg-indigo-50 text-indigo-600 border-indigo-300' : ''}`}>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </button>

          {/* Quick Domain Group Chips & Stepper Navigation */}
          <div className="flex items-center justify-between md:justify-end gap-2 shrink-0">
            
            {/* Quick Category Filter Pills */}
            <div className="hidden xl:flex items-center gap-1 bg-slate-100/70 p-1 rounded-2xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => {
                  setReportGroupFilter('all');
                  setIsReportDropdownOpen(true);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  reportGroupFilter === 'all' && isReportDropdownOpen
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All (11)
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportGroupFilter('sales');
                  setIsReportDropdownOpen(true);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  reportGroupFilter === 'sales' && isReportDropdownOpen
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sales (5)
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportGroupFilter('inventory');
                  setIsReportDropdownOpen(true);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  reportGroupFilter === 'inventory' && isReportDropdownOpen
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inventory (4)
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportGroupFilter('operations');
                  setIsReportDropdownOpen(true);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  reportGroupFilter === 'operations' && isReportDropdownOpen
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Operations (2)
              </button>
            </div>

            {/* Quick Prev / Next Report Buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevReport}
                title="Previous report category"
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200/80"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-[11px] font-bold text-slate-500 px-2 select-none">
                {currentReportIndex + 1} / {REPORT_OPTIONS.length}
              </div>
              <button
                type="button"
                onClick={handleNextReport}
                title="Next report category"
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200/80"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

        {/* Dropdown Menu Overlay Panel */}
        {isReportDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl border border-slate-200 shadow-2xl p-4 sm:p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[75vh] flex flex-col">
            
            {/* Dropdown Search and Group Filters Header */}
            <div className="pb-4 border-b border-slate-100 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Select Report Category
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose from 10 specialized intelligence and audit reporting modules
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReportDropdownOpen(false)}
                  className="self-end sm:self-auto p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Close menu (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Live Search Input Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search report categories (e.g. profit, IMEI, aging, Z-report, stock, ledger)..."
                  value={reportSearchQuery}
                  onChange={(e) => setReportSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                {reportSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setReportSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Group Filter Tabs inside Dropdown */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {[
                  { id: 'all', label: 'All Reports (10)' },
                  { id: 'sales', label: 'Sales & Analytics (4)' },
                  { id: 'inventory', label: 'Inventory & Devices (4)' },
                  { id: 'operations', label: 'Operations & Cash (2)' },
                ].map((grp) => (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => setReportGroupFilter(grp.id as ReportGroup)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      reportGroupFilter === grp.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {grp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Report Category Items */}
            <div className="overflow-y-auto pt-3 space-y-2.5 flex-1 pr-1 scrollbar-thin">
              {filteredReportOptions.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-bold text-slate-600">No report categories found</p>
                  <p className="text-xs mt-1">Try searching with a different term or clear the filter</p>
                  <button
                    type="button"
                    onClick={() => {
                      setReportSearchQuery('');
                      setReportGroupFilter('all');
                    }}
                    className="mt-3 px-3 py-1.5 bg-indigo-50 text-indigo-600 font-bold text-xs rounded-xl hover:bg-indigo-100 cursor-pointer"
                  >
                    Reset Search & Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {filteredReportOptions.map((item) => {
                    const isSelected = activeReportTab === item.id;
                    const ItemIcon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveReportTab(item.id);
                          setIsReportDropdownOpen(false);
                        }}
                        className={`w-full flex items-start gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer group ${
                          isSelected
                            ? 'bg-indigo-50/80 border-indigo-400 shadow-xs ring-2 ring-indigo-500/20'
                            : 'bg-white hover:bg-slate-50 border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105 ${item.iconBg} ${item.iconColor}`}>
                          <ItemIcon className="w-5 h-5" />
                        </div>

                        {/* Text & Meta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                              {item.groupLabel}
                            </span>
                            {isSelected && (
                              <span className="flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-md">
                                <Check className="w-3 h-3" /> Active
                              </span>
                            )}
                          </div>

                          <h4 className={`text-xs sm:text-sm font-black mt-0.5 truncate ${
                            isSelected ? 'text-indigo-950' : 'text-slate-900 group-hover:text-indigo-600'
                          }`}>
                            {item.title}
                          </h4>

                          <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dropdown Footer info */}
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
              <span>Showing {filteredReportOptions.length} of {REPORT_OPTIONS.length} report modules</span>
              <span className="font-semibold text-slate-500">Click to switch or press Esc to close</span>
            </div>

          </div>
        )}

      </div>

      {/* Active Sub-Report Content */}
      <div className="report-content-container">
        {activeReportTab === 'daily_sales' && (
          <DailySaleReport
            sales={sales}
            settings={settings}
            onViewInvoice={onViewInvoice}
          />
        )}

        {activeReportTab === 'monthly_profit' && (
          <MonthlyProfitManager
            sales={sales}
            products={products}
            expenses={expenses}
            staffUsers={staffUsers || StorageService.getStaffUsers()}
            settings={settings}
            onViewInvoice={onViewInvoice}
          />
        )}

        {activeReportTab === 'annual_profit' && (
          <AnnualProfitManager
            sales={sales}
            products={products}
            expenses={expenses}
            settings={settings}
            onViewDailyDate={(dateStr) => {
              setActiveReportTab('daily_sales');
            }}
          />
        )}

        {activeReportTab === 'sales_kpi' && (
          <SaleKpiReport
            sales={categoryFilteredSales}
            rawSales={timeframeSales}
            products={categoryFilteredProducts}
            allProducts={products}
            settings={settings}
            timeframeLabel={dateRange.label}
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => setSelectedCategory(cat)}
            onViewInvoice={onViewInvoice}
          />
        )}

        {activeReportTab === 'most_sold' && (
          <MostSoldItemsReport
            sales={categoryFilteredSales}
            products={categoryFilteredProducts}
            settings={settings}
            timeframeLabel={dateRange.label}
          />
        )}

        {activeReportTab === 'category_profitability' && (
          <CategoryProfitabilityReport
            sales={timeframeSales}
            products={products}
            settings={settings}
            timeframeLabel={dateRange.label}
          />
        )}

        {activeReportTab === 'imei_traceability' && (
          <ImeiTraceabilityReport
            products={categoryFilteredProducts}
            sales={sales}
            purchases={purchases}
            settings={settings}
            onViewInvoice={onViewInvoice}
            onOpenBarcodeModal={onOpenBarcodeModal}
          />
        )}

        {activeReportTab === 'inventory_aging' && (
          <InventoryAgingReport
            products={categoryFilteredProducts}
            settings={settings}
          />
        )}

        {activeReportTab === 'shift_reconciliation' && (
          <ShiftReconciliationReport
            sales={sales}
            cashDrawer={cashDrawer}
            expenses={expenses}
            settings={settings}
            onSaveShiftSettlement={onSaveShiftSettlement}
          />
        )}

        {activeReportTab === 'price_list' && (
          <PriceListReport
            products={categoryFilteredProducts}
            settings={settings}
            onOpenBarcodeModal={onOpenBarcodeModal}
          />
        )}

        {activeReportTab === 'stocks' && (
          <StockInventoryReport
            products={categoryFilteredProducts}
            settings={settings}
            stockAdjustments={stockAdjustments}
          />
        )}

        {activeReportTab === 'sales_ledger' && (
          <SalesLedgerReport
            sales={categoryFilteredSales}
            settings={settings}
            timeframeLabel={dateRange.label}
            onViewInvoice={onViewInvoice}
          />
        )}

        {activeReportTab === 'customers' && (
          <CustomerReport
            customers={customers}
            sales={categoryFilteredSales}
            settings={settings}
            timeframeLabel={dateRange.label}
          />
        )}
      </div>

    </div>
  );
};
