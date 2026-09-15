import React, { useState, useMemo } from 'react';
import { 
  Package, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  Layers, 
  Search, 
  Download, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  Eye, 
  X,
  History,
  Tag,
  BarChart3,
  FileText
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell, 
  PieChart, 
  Pie 
} from 'recharts';
import { Product, ShopSettings, StockAdjustment } from '../../types';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { formatCurrency, formatDateTime, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { canonicalCategory } from '../../data/categoryTaxonomy';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';

const STOCK_REPORT_COLUMNS: ColumnDefinition[] = [
  { id: 'item_sku', label: 'Item & SKU', required: true },
  { id: 'category_brand', label: 'Category & Brand' },
  { id: 'stock_level', label: 'Stock Level & Status' },
  { id: 'cost_price', label: 'Cost Price' },
  { id: 'selling_price', label: 'Selling Price' },
  { id: 'cost_valuation', label: 'Cost Valuation' },
  { id: 'retail_valuation', label: 'Retail Valuation' },
  { id: 'imei_info', label: 'IMEI / Serial Info' },
];

interface StockInventoryReportProps {
  products: Product[];
  settings: ShopSettings;
  stockAdjustments?: StockAdjustment[];
}

type StockHealthFilter = 'all' | 'low_stock' | 'out_of_stock' | 'healthy' | 'serialized';

export const StockInventoryReport: React.FC<StockInventoryReportProps> = ({
  products,
  settings,
  stockAdjustments = [],
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accessorySubCategoryFilter, setAccessorySubCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<StockHealthFilter>('all');
  const [activeTab, setActiveTab] = useState<'valuation' | 'adjustments_history'>('valuation');
  const [selectedProductImeis, setSelectedProductImeis] = useState<Product | null>(null);

  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('stock_report_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {
      item_sku: true,
      category_brand: true,
      stock_level: true,
      cost_price: true,
      selling_price: true,
      cost_valuation: true,
      retail_valuation: true,
      imei_info: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('stock_report_visible_columns', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const activeColumnCount = useMemo(() => {
    return STOCK_REPORT_COLUMNS.filter(col => visibleColumns[col.id] !== false).length;
  }, [visibleColumns]);

  // Available brands
  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [products]);

  // Available Accessory Subcategories (derived from products + standard presets)
  const availableAccessorySubcategories = useMemo(() => {
    const map = new Map<string, number>();

    // Count actual accessory products per subcategory
    products.forEach((p) => {
      if (canonicalCategory(p.category) === 'accessories_gadgets' && p.subCategory) {
        const sub = p.subCategory.trim();
        if (sub) {
          map.set(sub, (map.get(sub) || 0) + 1);
        }
      }
    });

    const defaultPresets = [
      'Cases & Covers',
      'Screen Protectors',
      'Fast Chargers & Adapters',
      'Cables & Connectors',
      'Power Banks',
      'Wireless Chargers',
      'Earphones & TWS',
      'Car Mounts & Holders',
      'Audio & Bluetooth Speakers',
    ];

    defaultPresets.forEach((sub) => {
      if (!map.has(sub)) {
        map.set(sub, 0);
      }
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  }, [products]);

  const totalAccessoriesCount = useMemo(() => {
    return products.filter(p => canonicalCategory(p.category) === 'accessories_gadgets').length;
  }, [products]);

  // Overall Inventory Valuation Stats
  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalImeisCount = 0;

    products.forEach((p) => {
      totalUnits += p.stock;
      totalCostValuation += p.costPrice * p.stock;
      totalRetailValuation += p.sellingPrice * p.stock;
      if (p.stock <= 0) {
        outOfStockCount++;
      } else if (p.stock <= p.minStockAlert) {
        lowStockCount++;
      }
      if (p.imeiList && p.imeiList.length > 0) {
        totalImeisCount += p.imeiList.length;
      }
    });

    const potentialGrossProfit = totalRetailValuation - totalCostValuation;
    const potentialMarginPercent = totalRetailValuation > 0 ? (potentialGrossProfit / totalRetailValuation) * 100 : 0;

    return {
      totalSkus: products.length,
      totalUnits,
      totalCostValuation,
      totalRetailValuation,
      potentialGrossProfit,
      potentialMarginPercent,
      lowStockCount,
      outOfStockCount,
      totalImeisCount,
    };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const isAccessory = canonicalCategory(categoryFilter) === 'accessories_gadgets';
    return products.filter((p) => {
      if (categoryFilter !== 'all' && canonicalCategory(p.category) !== canonicalCategory(categoryFilter)) return false;
      
      // Filter specifically for accessory subcategory when category is accessories
      if (isAccessory && accessorySubCategoryFilter !== 'all') {
        if (p.subCategory !== accessorySubCategoryFilter) return false;
      }

      if (brandFilter !== 'all' && p.brand !== brandFilter) return false;

      if (healthFilter === 'low_stock' && (p.stock > p.minStockAlert || p.stock <= 0)) return false;
      if (healthFilter === 'out_of_stock' && p.stock > 0) return false;
      if (healthFilter === 'healthy' && p.stock <= p.minStockAlert) return false;
      if (healthFilter === 'serialized' && (!p.imeiList || p.imeiList.length === 0)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.subCategory && p.subCategory.toLowerCase().includes(q)) ||
        (p.imeiList && p.imeiList.some(imei => imei.includes(q)))
      );
    });
  }, [products, categoryFilter, accessorySubCategoryFilter, brandFilter, healthFilter, searchQuery]);

  // Active Subcategory Valuation Totals
  const activeSubcategorySummary = useMemo(() => {
    const isAccessory = canonicalCategory(categoryFilter) === 'accessories_gadgets';
    if (!isAccessory || accessorySubCategoryFilter === 'all') return null;
    let cost = 0;
    let retail = 0;
    let units = 0;
    filteredProducts.forEach(p => {
      cost += p.costPrice * p.stock;
      retail += p.sellingPrice * p.stock;
      units += p.stock;
    });
    return {
      name: accessorySubCategoryFilter,
      count: filteredProducts.length,
      units,
      cost,
      retail,
      profit: retail - cost,
      margin: retail > 0 ? ((retail - cost) / retail) * 100 : 0
    };
  }, [categoryFilter, accessorySubCategoryFilter, filteredProducts]);

  // Chart data: Category Valuation Share
  const categoryChartData = useMemo(() => {
    const map = new Map<string, { cost: number; retail: number; units: number }>();
    products.forEach((p) => {
      const label = getCategoryLabel(p.category);
      const existing = map.get(label) || { cost: 0, retail: 0, units: 0 };
      existing.cost += p.costPrice * p.stock;
      existing.retail += p.sellingPrice * p.stock;
      existing.units += p.stock;
      map.set(label, existing);
    });

    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899'];
    return Array.from(map.entries()).map(([category, data], idx) => ({
      category: category.length > 14 ? category.substring(0, 12) + '…' : category,
      cost: data.cost,
      retail: data.retail,
      profit: data.retail - data.cost,
      units: data.units,
      color: colors[idx % colors.length],
    }));
  }, [products]);

  const getExportData = () => {
    const headers: string[] = [];

    if (visibleColumns.item_sku !== false) {
      headers.push('SKU', 'Product Name', 'Brand');
    }
    if (visibleColumns.category_brand !== false) {
      headers.push('Category', 'Subcategory', 'Condition');
    }
    if (visibleColumns.stock_level !== false) {
      headers.push('Stock (Units)', 'Min Alert', 'Stock Status');
    }
    if (visibleColumns.cost_price !== false) {
      headers.push(`Cost Price (${settings.currencySymbol})`);
    }
    if (visibleColumns.selling_price !== false) {
      headers.push(`Selling Price (${settings.currencySymbol})`);
    }
    if (visibleColumns.cost_valuation !== false) {
      headers.push(`Total Cost Valuation (${settings.currencySymbol})`);
    }
    if (visibleColumns.retail_valuation !== false) {
      headers.push(`Total Retail Valuation (${settings.currencySymbol})`, `Potential Profit (${settings.currencySymbol})`);
    }
    if (visibleColumns.imei_info !== false) {
      headers.push('Serialized IMEIs Count', 'IMEI / Serial Numbers');
    }

    const rows = filteredProducts.map((p) => {
      const row: (string | number)[] = [];

      if (visibleColumns.item_sku !== false) {
        row.push(p.sku, p.name, p.brand || '-');
      }
      if (visibleColumns.category_brand !== false) {
        row.push(getCategoryLabel(p.category), p.subCategory || '-', getConditionLabel(p.condition).label);
      }
      if (visibleColumns.stock_level !== false) {
        row.push(
          p.stock,
          p.minStockAlert,
          p.stock <= 0 ? 'Out of Stock' : p.stock <= p.minStockAlert ? 'Low Stock' : 'Healthy'
        );
      }
      if (visibleColumns.cost_price !== false) {
        row.push(p.costPrice);
      }
      if (visibleColumns.selling_price !== false) {
        row.push(p.sellingPrice);
      }
      if (visibleColumns.cost_valuation !== false) {
        row.push(p.costPrice * p.stock);
      }
      if (visibleColumns.retail_valuation !== false) {
        row.push(p.sellingPrice * p.stock, (p.sellingPrice - p.costPrice) * p.stock);
      }
      if (visibleColumns.imei_info !== false) {
        row.push(
          p.imeiList ? p.imeiList.length : 0,
          p.imeiList && p.imeiList.length > 0 ? p.imeiList.join('; ') : '-'
        );
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    exportToCsv('Inventory_Valuation_Report', headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    exportReportToPdf({
      title: 'Stock Inventory & Valuation Report',
      subtitle: `Comprehensive stock status, cost capital tied-up, and retail profit margin overview (${filteredProducts.length} items)`,
      filename: 'Stock_Inventory_Valuation_Report',
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Cost Valuation', value: formatCurrency(stats.totalCostValuation, settings.currencySymbol) },
        { label: 'Retail Valuation', value: formatCurrency(stats.totalRetailValuation, settings.currencySymbol) },
        { label: 'Potential Profit', value: `${formatCurrency(stats.potentialGrossProfit, settings.currencySymbol)} (${stats.potentialMarginPercent.toFixed(1)}%)` },
        { label: 'Total Units', value: `${stats.totalUnits.toLocaleString()} Units` },
      ],
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Executive Valuation Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Inventory Cost Value</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(stats.totalCostValuation, settings.currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
              <span>Total purchase capital tied in stock</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Retail Selling Valuation</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {formatCurrency(stats.totalRetailValuation, settings.currencySymbol)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-emerald-600">
              <span>+{formatCurrency(stats.potentialGrossProfit, settings.currencySymbol)} Potential Profit ({stats.potentialMarginPercent.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Quantity & SKUs</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalUnits.toLocaleString()} <span className="text-sm font-semibold text-slate-500">Units</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {stats.totalSkus} Unique Products • {stats.totalImeisCount} Tracked IMEIs
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Health Alerts</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-black text-amber-600 tracking-tight">
                {stats.lowStockCount} <span className="text-xs font-bold text-slate-500">Low</span>
              </div>
              <div className="text-2xl font-black text-rose-600 tracking-tight border-l border-slate-200 pl-3">
                {stats.outOfStockCount} <span className="text-xs font-bold text-slate-500">Out</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {stats.lowStockCount + stats.outOfStockCount > 0 ? 'Requires distributor reorder' : 'All stock levels healthy'}
            </p>
          </div>
        </div>

      </div>

      {/* Visual Chart: Category Valuation */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              Inventory Valuation & Capital Breakdown by Category
            </h3>
            <p className="text-xs text-slate-500">Cost investment vs expected retail revenue value</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-500" />
              Cost Value
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-500" />
              Retail Value
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <XAxis dataKey="category" stroke="#64748b" fontSize={11} />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={10} 
                tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                formatter={(val: any, name: any) => {
                  const label = name === 'cost' ? 'Cost Value' : name === 'retail' ? 'Retail Value' : name;
                  return [formatCurrency(Number(val), settings.currencySymbol), label];
                }}
              />
              <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cost Value" />
              <Bar dataKey="retail" fill="#10b981" radius={[4, 4, 0, 0]} name="Retail Value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sub-view switcher: Valuation Ledger vs Adjustments Log */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('valuation')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'valuation'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          Detailed Stock Valuation Ledger
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('adjustments_history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'adjustments_history'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Stock Adjustment & Audit Logs ({stockAdjustments.length})
        </button>
      </div>

      {activeTab === 'valuation' ? (
        <>
          {/* Controls Bar: Filters & Search */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search & Health status pills */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search product, barcode, SKU, subcategory, or IMEI..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 transition-colors"
                  />
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-xl overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setHealthFilter('all')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      healthFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHealthFilter('low_stock')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      healthFilter === 'low_stock' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-amber-600'
                    }`}
                  >
                    Low Stock ({stats.lowStockCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHealthFilter('out_of_stock')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      healthFilter === 'out_of_stock' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-rose-600'
                    }`}
                  >
                    Out of Stock ({stats.outOfStockCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHealthFilter('serialized')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      healthFilter === 'serialized' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600 hover:text-purple-600'
                    }`}
                  >
                    Serialized IMEIs
                  </button>
                </div>
              </div>

              {/* Category, Subcategory & Brand Dropdowns + CSV Export */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Category selector */}
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCategoryFilter(val);
                    if (canonicalCategory(val) !== 'accessories_gadgets') {
                      setAccessorySubCategoryFilter('all');
                    }
                  }}
                  className={`px-3 py-2 border rounded-xl text-xs font-semibold cursor-pointer focus:outline-hidden transition-all ${
                    canonicalCategory(categoryFilter) === 'accessories_gadgets'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <option value="all">All Categories</option>
                  <option value="brand_new_phones">Brand New Smartphones</option>
                  <option value="pre_owned_phones">Used / Pre-Owned Phones</option>
                  <option value="accessories_gadgets">Accessories & Audio ({totalAccessoriesCount})</option>
                  <option value="cookware">Cookware</option>
                  <option value="sim_cards">SIM Cards & Top-up</option>
                </select>

                {/* Subcategory dropdown specifically for accessories */}
                {canonicalCategory(categoryFilter) === 'accessories_gadgets' && (
                  <div className="flex items-center gap-1.5 bg-indigo-50/90 border border-indigo-200 px-2.5 py-1 rounded-xl animate-in fade-in zoom-in-95 duration-150 shadow-2xs">
                    <Tag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="text-[11px] font-bold text-indigo-950 whitespace-nowrap">Subcategory:</span>
                    <select
                      value={accessorySubCategoryFilter}
                      onChange={(e) => setAccessorySubCategoryFilter(e.target.value)}
                      className="bg-transparent text-xs font-bold text-indigo-900 cursor-pointer focus:outline-hidden py-1 pr-1"
                    >
                      <option value="all">All Subcategories ({totalAccessoriesCount})</option>
                      {availableAccessorySubcategories.map(sub => (
                        <option key={sub.name} value={sub.name}>
                          {sub.name} ({sub.count})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Brand selector */}
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden hover:bg-slate-100 transition-colors"
                >
                  <option value="all">All Brands</option>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                {/* Export Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                    title="Export filtered items to CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                    title="Export filtered items to PDF document"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Accessory Subcategory Quick Filter Strip when Accessories is selected */}
            {canonicalCategory(categoryFilter) === 'accessories_gadgets' && (
              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500 shrink-0 flex items-center gap-1 mr-1">
                  <Layers className="w-3 h-3" />
                  Accessory Subcategory:
                </span>

                <button
                  type="button"
                  onClick={() => setAccessorySubCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    accessorySubCategoryFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700'
                  }`}
                >
                  All Accessories ({totalAccessoriesCount})
                </button>

                {availableAccessorySubcategories.map((sub) => (
                  <button
                    key={sub.name}
                    type="button"
                    onClick={() => setAccessorySubCategoryFilter(sub.name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      accessorySubCategoryFilter === sub.name
                        ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400/30'
                        : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700'
                    }`}
                  >
                    <span>{sub.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      accessorySubCategoryFilter === sub.name ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {sub.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Active Accessory Subcategory Valuation Banner */}
            {activeSubcategorySummary && (
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-indigo-950 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold flex items-center gap-1 text-indigo-800">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    Subcategory: {activeSubcategorySummary.name}
                  </span>
                  <span className="text-indigo-400">•</span>
                  <span><strong>{activeSubcategorySummary.count}</strong> SKUs ({activeSubcategorySummary.units} Units)</span>
                  <span className="text-indigo-400">•</span>
                  <span>Cost: <strong>{formatCurrency(activeSubcategorySummary.cost, settings.currencySymbol)}</strong></span>
                  <span className="text-indigo-400">•</span>
                  <span>Retail: <strong>{formatCurrency(activeSubcategorySummary.retail, settings.currencySymbol)}</strong></span>
                  <span className="text-indigo-400">•</span>
                  <span className="text-emerald-700 font-bold">Margin: {activeSubcategorySummary.margin.toFixed(1)}%</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAccessorySubCategoryFilter('all')}
                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 hover:underline cursor-pointer self-start sm:self-auto"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Subcategory Filter
                </button>
              </div>
            )}

          </div>

          {/* Stock Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Stock Ledger & Valuation ({filteredProducts.length} Items Listed)
                </h3>
                <p className="text-xs text-slate-500">Live quantities, cost basis, and retail margins</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <ColumnVisibilityFilter
                  columns={STOCK_REPORT_COLUMNS}
                  visibleColumns={visibleColumns}
                  onChange={handleColumnChange}
                  onReset={() => handleColumnChange({
                    item_sku: true,
                    category_brand: true,
                    stock_level: true,
                    cost_price: true,
                    selling_price: true,
                    cost_valuation: true,
                    retail_valuation: true,
                    imei_info: true,
                  })}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100/75 text-slate-700 uppercase font-extrabold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    {visibleColumns.item_sku !== false && <th className="py-3 px-4">Item & SKU</th>}
                    {visibleColumns.category_brand !== false && <th className="py-3 px-4">Category & Brand</th>}
                    {visibleColumns.stock_level !== false && <th className="py-3 px-4 text-center">Stock Level</th>}
                    {visibleColumns.cost_price !== false && <th className="py-3 px-4 text-right">Cost Price</th>}
                    {visibleColumns.selling_price !== false && <th className="py-3 px-4 text-right">Selling Price</th>}
                    {visibleColumns.cost_valuation !== false && <th className="py-3 px-4 text-right">Cost Valuation</th>}
                    {visibleColumns.retail_valuation !== false && <th className="py-3 px-4 text-right">Retail Valuation</th>}
                    {visibleColumns.imei_info !== false && <th className="py-3 px-4 text-center">IMEI Info</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={activeColumnCount || 8} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No inventory matching your filters found.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const costVal = p.costPrice * p.stock;
                      const retailVal = p.sellingPrice * p.stock;
                      const isOutOfStock = p.stock <= 0;
                      const isLowStock = p.stock <= p.minStockAlert;
                      const hasImeis = p.imeiList && p.imeiList.length > 0;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          
                          {/* Item & SKU */}
                          {visibleColumns.item_sku !== false && (
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{p.name}</div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-700">
                                  {p.sku}
                                </span>
                                {p.storage && <span>{p.storage}</span>}
                                {p.color && <span>• {p.color}</span>}
                              </div>
                            </td>
                          )}

                          {/* Category & Brand */}
                          {visibleColumns.category_brand !== false && (
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-800">{p.brand}</div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span>{getCategoryLabel(p.category)}</span>
                                {p.subCategory && (
                                  <span className={`inline-flex items-center px-1.5 py-0.2 rounded font-medium text-[10px] border ${
                                    p.category === 'accessories'
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80 font-bold'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {p.subCategory}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Stock Level */}
                          {visibleColumns.stock_level !== false && (
                            <td className="py-3.5 px-4 text-center">
                              <div className="font-black text-sm text-slate-900">{p.stock} Units</div>
                              <div className="mt-0.5">
                                {isOutOfStock ? (
                                  <span className="inline-block px-2 py-0.2 rounded bg-rose-50 text-rose-700 font-bold text-[9px] border border-rose-200">
                                    Out of Stock
                                  </span>
                                ) : isLowStock ? (
                                  <span className="inline-block px-2 py-0.2 rounded bg-amber-50 text-amber-700 font-bold text-[9px] border border-amber-200">
                                    Low Stock (≤{p.minStockAlert})
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px]">
                                    Healthy Level
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Cost Price */}
                          {visibleColumns.cost_price !== false && (
                            <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                              {formatCurrency(p.costPrice, settings.currencySymbol)}
                            </td>
                          )}

                          {/* Selling Price */}
                          {visibleColumns.selling_price !== false && (
                            <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                              {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                            </td>
                          )}

                          {/* Cost Valuation */}
                          {visibleColumns.cost_valuation !== false && (
                            <td className="py-3.5 px-4 text-right font-semibold text-blue-700">
                              {formatCurrency(costVal, settings.currencySymbol)}
                            </td>
                          )}

                          {/* Retail Valuation */}
                          {visibleColumns.retail_valuation !== false && (
                            <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                              {formatCurrency(retailVal, settings.currencySymbol)}
                            </td>
                          )}

                          {/* IMEI Inspector */}
                          {visibleColumns.imei_info !== false && (
                            <td className="py-3.5 px-4 text-center">
                              {hasImeis ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductImeis(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-[11px] font-bold border border-purple-200 transition-colors cursor-pointer"
                                >
                                  <Smartphone className="w-3 h-3" />
                                  {p.imeiList?.length} IMEIs
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">Non-serialized</span>
                              )}
                            </td>
                          )}

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Stock Adjustments & Loss History View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Stock Adjustments & Physical Audit Audit Log
              </h3>
              <p className="text-xs text-slate-500">Historical trace of manual quantity adjustments, damaged write-offs, and restocks</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100/75 text-slate-700 uppercase font-extrabold text-[11px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Adjustment Reason</th>
                  <th className="py-3 px-4 text-center">Previous Stock</th>
                  <th className="py-3 px-4 text-center">Qty Change</th>
                  <th className="py-3 px-4 text-center">New Stock</th>
                  <th className="py-3 px-4">Adjusted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockAdjustments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      No stock adjustments have been recorded yet.
                    </td>
                  </tr>
                ) : (
                  stockAdjustments.map((adj) => {
                    const isPositive = adj.quantityChange > 0;
                    return (
                      <tr key={adj.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {formatDateTime(adj.timestamp)}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {adj.productName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {adj.reason.replace(/_/g, ' ')}
                          </span>
                          {adj.reasonNotes && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{adj.reasonNotes}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-600">
                          {adj.previousStock}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-black px-2 py-0.5 rounded text-xs ${
                            isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {isPositive ? `+${adj.quantityChange}` : adj.quantityChange}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-black text-slate-900">
                          {adj.newStock}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {adj.adjustedBy}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Serialized IMEI Detail Modal */}
      {selectedProductImeis && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-black text-slate-900">{selectedProductImeis.name}</h4>
                <p className="text-xs text-slate-500">Active IMEIs in stock ({selectedProductImeis.imeiList?.length || 0})</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductImeis(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-2 max-h-64 overflow-y-auto">
              {selectedProductImeis.imeiList?.map((imei, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-xs font-mono font-bold text-slate-800">{imei}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                    Available
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedProductImeis(null)}
              className="w-full py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
