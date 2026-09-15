import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Package, 
  Tag, 
  TrendingUp, 
  Search, 
  Download, 
  Printer, 
  FileText, 
  Smartphone, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Percent, 
  Calculator, 
  ArrowUpDown, 
  CheckCircle2, 
  AlertCircle, 
  Barcode, 
  Grid, 
  List, 
  SlidersHorizontal,
  X,
  Sparkles,
  Info
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
import { Product, ShopSettings, ProductCategory, DeviceCondition } from '../../types';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { formatCurrency, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';

export interface PriceListReportProps {
  products: Product[];
  settings: ShopSettings;
  onOpenBarcodeModal?: (product: Product, imei?: string) => void;
}

export type PriceListMode = 'retail' | 'internal' | 'wholesale';
export type ViewDisplayMode = 'table' | 'grid';

const PRICE_LIST_COLUMNS: ColumnDefinition[] = [
  { id: 'product_info', label: 'Product Name & Specs', required: true },
  { id: 'sku_barcode', label: 'SKU & Barcode' },
  { id: 'category_brand', label: 'Category & Brand' },
  { id: 'condition', label: 'Condition' },
  { id: 'stock_status', label: 'Stock Level' },
  { id: 'cost_price', label: 'Cost Price (Internal)' },
  { id: 'selling_price', label: 'Retail Price', required: true },
  { id: 'margin_amount', label: 'Gross Margin ($)' },
  { id: 'margin_percent', label: 'Margin (%)' },
  { id: 'markup_percent', label: 'Markup (%)' },
  { id: 'wholesale_tier1', label: 'Wholesale T1 (-5%)' },
  { id: 'wholesale_tier2', label: 'Wholesale T2 (-10%)' },
  { id: 'warranty', label: 'Warranty' },
  { id: 'actions', label: 'Quick Actions' },
];

export const PriceListReport: React.FC<PriceListReportProps> = ({
  products,
  settings,
  onOpenBarcodeModal,
}) => {
  // Mode & Layout State
  const [priceMode, setPriceMode] = useState<PriceListMode>('retail');
  const [viewMode, setViewMode] = useState<ViewDisplayMode>('table');
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);
  const [selectedProductForCalculator, setSelectedProductForCalculator] = useState<Product | null>(null);
  const [customWholesaleDiscount, setCustomWholesaleDiscount] = useState<number>(8);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('all');
  const [priceTierFilter, setPriceTierFilter] = useState<string>('all');
  const [marginTierFilter, setMarginTierFilter] = useState<string>('all');

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'cost' | 'margin' | 'stock' | 'brand'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('price_list_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {
      product_info: true,
      sku_barcode: true,
      category_brand: true,
      condition: true,
      stock_status: true,
      cost_price: false, // Default hidden for customer safety
      selling_price: true,
      margin_amount: false,
      margin_percent: false,
      markup_percent: false,
      wholesale_tier1: false,
      wholesale_tier2: false,
      warranty: true,
      actions: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('price_list_visible_columns', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Sync default visible columns when switching modes
  const handleModeSwitch = (newMode: PriceListMode) => {
    setPriceMode(newMode);
    if (newMode === 'retail') {
      const updated = {
        ...visibleColumns,
        cost_price: false,
        margin_amount: false,
        margin_percent: false,
        markup_percent: false,
        wholesale_tier1: false,
        wholesale_tier2: false,
      };
      setVisibleColumns(updated);
    } else if (newMode === 'internal') {
      const updated = {
        ...visibleColumns,
        cost_price: true,
        margin_amount: true,
        margin_percent: true,
        markup_percent: true,
      };
      setVisibleColumns(updated);
    } else if (newMode === 'wholesale') {
      const updated = {
        ...visibleColumns,
        cost_price: true,
        wholesale_tier1: true,
        wholesale_tier2: true,
        margin_percent: true,
      };
      setVisibleColumns(updated);
    }
  };

  // Extract unique brands from products
  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    products.forEach((p) => {
      if (p.brand && p.brand.trim()) {
        brands.add(p.brand.trim());
      }
    });
    return Array.from(brands).sort();
  }, [products]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(q);
        const matchesBrand = product.brand.toLowerCase().includes(q);
        const matchesModel = product.model?.toLowerCase().includes(q);
        const matchesSku = product.sku?.toLowerCase().includes(q);
        const matchesBarcode = product.barcode?.toLowerCase().includes(q);
        const matchesSpecs = (product.ram && product.ram.toLowerCase().includes(q)) || 
                             (product.rom && product.rom.toLowerCase().includes(q)) || 
                             (product.storage && product.storage.toLowerCase().includes(q)) ||
                             (product.color && product.color.toLowerCase().includes(q));
        if (!matchesName && !matchesBrand && !matchesModel && !matchesSku && !matchesBarcode && !matchesSpecs) {
          return false;
        }
      }

      // Category
      if (categoryFilter !== 'all' && product.category !== categoryFilter) {
        return false;
      }

      // Brand
      if (brandFilter !== 'all' && product.brand.toLowerCase() !== brandFilter.toLowerCase()) {
        return false;
      }

      // Condition
      if (conditionFilter !== 'all' && product.condition !== conditionFilter) {
        return false;
      }

      // Stock Status
      if (stockStatusFilter === 'in_stock' && product.stock <= 0) return false;
      if (stockStatusFilter === 'out_of_stock' && product.stock > 0) return false;
      if (stockStatusFilter === 'low_stock' && (product.stock <= 0 || product.stock > product.minStockAlert)) return false;

      // Price Tiers
      if (priceTierFilter !== 'all') {
        const price = product.sellingPrice;
        if (priceTierFilter === 'tier_under_100k' && price >= 100000) return false;
        if (priceTierFilter === 'tier_100k_500k' && (price < 100000 || price >= 500000)) return false;
        if (priceTierFilter === 'tier_500k_1m' && (price < 500000 || price >= 1000000)) return false;
        if (priceTierFilter === 'tier_1m_2m' && (price < 1000000 || price >= 2000000)) return false;
        if (priceTierFilter === 'tier_above_2m' && price < 2000000) return false;
      }

      // Margin Tiers
      if (marginTierFilter !== 'all') {
        const marginPct = product.sellingPrice > 0 
          ? ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100 
          : 0;
        if (marginTierFilter === 'high' && marginPct < 30) return false;
        if (marginTierFilter === 'medium' && (marginPct < 15 || marginPct >= 30)) return false;
        if (marginTierFilter === 'low' && (marginPct <= 0 || marginPct >= 15)) return false;
        if (marginTierFilter === 'negative' && marginPct > 0) return false;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'price') {
        comparison = a.sellingPrice - b.sellingPrice;
      } else if (sortBy === 'cost') {
        comparison = a.costPrice - b.costPrice;
      } else if (sortBy === 'margin') {
        const marginA = a.sellingPrice > 0 ? (a.sellingPrice - a.costPrice) / a.sellingPrice : 0;
        const marginB = b.sellingPrice > 0 ? (b.sellingPrice - b.costPrice) / b.sellingPrice : 0;
        comparison = marginA - marginB;
      } else if (sortBy === 'stock') {
        comparison = a.stock - b.stock;
      } else if (sortBy === 'brand') {
        comparison = a.brand.localeCompare(b.brand);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [
    products, 
    searchQuery, 
    categoryFilter, 
    brandFilter, 
    conditionFilter, 
    stockStatusFilter, 
    priceTierFilter, 
    marginTierFilter, 
    sortBy, 
    sortDirection
  ]);

  // Overall Catalog Statistics
  const stats = useMemo(() => {
    const totalItems = filteredProducts.length;
    let totalPriceSum = 0;
    let totalCostSum = 0;
    let totalStockQty = 0;
    let totalRetailValuation = 0;
    let inStockCount = 0;
    let outOfStockCount = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    filteredProducts.forEach((p) => {
      totalPriceSum += p.sellingPrice;
      totalCostSum += p.costPrice;
      totalStockQty += p.stock;
      totalRetailValuation += p.sellingPrice * p.stock;
      
      if (p.stock > 0) {
        inStockCount++;
      } else {
        outOfStockCount++;
      }

      if (p.sellingPrice < minPrice) minPrice = p.sellingPrice;
      if (p.sellingPrice > maxPrice) maxPrice = p.sellingPrice;
    });

    const avgPrice = totalItems > 0 ? totalPriceSum / totalItems : 0;
    const avgCost = totalItems > 0 ? totalCostSum / totalItems : 0;
    const avgGrossMarginAmount = avgPrice - avgCost;
    const avgMarginPercent = avgPrice > 0 ? (avgGrossMarginAmount / avgPrice) * 100 : 0;
    const avgMarkupPercent = avgCost > 0 ? (avgGrossMarginAmount / avgCost) * 100 : 0;

    return {
      totalItems,
      avgPrice,
      avgCost,
      avgGrossMarginAmount,
      avgMarginPercent,
      avgMarkupPercent,
      totalStockQty,
      totalRetailValuation,
      inStockCount,
      outOfStockCount,
      minPrice: totalItems > 0 ? minPrice : 0,
      maxPrice: totalItems > 0 ? maxPrice : 0,
    };
  }, [filteredProducts]);

  // Price Distribution by Bracket
  const priceBracketsData = useMemo(() => {
    const brackets = [
      { name: '< 100K', count: 0, min: 0, max: 100000 },
      { name: '100K - 500K', count: 0, min: 100000, max: 500000 },
      { name: '500K - 1M', count: 0, min: 500000, max: 1000000 },
      { name: '1M - 2M', count: 0, min: 1000000, max: 2000000 },
      { name: '2M+', count: 0, min: 2000000, max: Infinity },
    ];

    filteredProducts.forEach((p) => {
      const price = p.sellingPrice;
      for (const b of brackets) {
        if (price >= b.min && price < b.max) {
          b.count++;
          break;
        }
      }
    });

    return brackets;
  }, [filteredProducts]);

  // Average Price by Category
  const categoryPriceData = useMemo(() => {
    const map = new Map<string, { count: number; totalPrice: number; totalCost: number }>();
    filteredProducts.forEach((p) => {
      const cat = p.category;
      const cur = map.get(cat) || { count: 0, totalPrice: 0, totalCost: 0 };
      cur.count += 1;
      cur.totalPrice += p.sellingPrice;
      cur.totalCost += p.costPrice;
      map.set(cat, cur);
    });

    return Array.from(map.entries()).map(([cat, val]) => ({
      category: getCategoryLabel(cat as ProductCategory),
      avgPrice: Math.round(val.totalPrice / val.count),
      avgCost: Math.round(val.totalCost / val.count),
      count: val.count,
    }));
  }, [filteredProducts]);

  // Handle Sort Click
  const handleSort = (field: 'name' | 'price' | 'cost' | 'margin' | 'stock' | 'brand') => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Export Data Preparation
  const getExportData = () => {
    const isCustomerView = priceMode === 'retail';
    const headers: string[] = [];

    if (visibleColumns.product_info !== false) headers.push('Product Name');
    if (visibleColumns.sku_barcode !== false) {
      headers.push('SKU');
      headers.push('Barcode');
    }
    if (visibleColumns.category_brand !== false) {
      headers.push('Category');
      headers.push('Brand');
    }
    if (visibleColumns.condition !== false) headers.push('Condition');
    if (visibleColumns.stock_status !== false) headers.push('Stock On Hand');
    
    if (!isCustomerView && visibleColumns.cost_price !== false) {
      headers.push(`Cost Price (${settings.currencySymbol})`);
    }

    if (visibleColumns.selling_price !== false) {
      headers.push(`Retail Price (${settings.currencySymbol})`);
    }

    if (!isCustomerView) {
      if (visibleColumns.margin_amount !== false) headers.push(`Gross Margin (${settings.currencySymbol})`);
      if (visibleColumns.margin_percent !== false) headers.push('Margin (%)');
      if (visibleColumns.markup_percent !== false) headers.push('Markup (%)');
    }

    if (priceMode === 'wholesale' || visibleColumns.wholesale_tier1 !== false) {
      headers.push(`Wholesale Tier 1 - 5% (${settings.currencySymbol})`);
    }
    if (priceMode === 'wholesale' || visibleColumns.wholesale_tier2 !== false) {
      headers.push(`Wholesale Tier 2 - 10% (${settings.currencySymbol})`);
    }

    if (visibleColumns.warranty !== false) headers.push('Warranty');

    const rows = filteredProducts.map((p) => {
      const row: (string | number)[] = [];
      const specsStr = [p.ram ? `${p.ram} RAM` : '', p.rom || p.storage, p.color].filter(Boolean).join(' / ');
      const fullName = specsStr ? `${p.name} (${specsStr})` : p.name;

      if (visibleColumns.product_info !== false) row.push(fullName);
      if (visibleColumns.sku_barcode !== false) {
        row.push(p.sku || '-');
        row.push(p.barcode || '-');
      }
      if (visibleColumns.category_brand !== false) {
        row.push(getCategoryLabel(p.category));
        row.push(p.brand || '-');
      }
      if (visibleColumns.condition !== false) row.push(getConditionLabel(p.condition).label);
      if (visibleColumns.stock_status !== false) row.push(p.stock > 0 ? `${p.stock} Units` : 'Out of Stock');

      if (!isCustomerView && visibleColumns.cost_price !== false) {
        row.push(p.costPrice);
      }

      if (visibleColumns.selling_price !== false) {
        row.push(p.sellingPrice);
      }

      if (!isCustomerView) {
        const marginAmt = p.sellingPrice - p.costPrice;
        const marginPct = p.sellingPrice > 0 ? (marginAmt / p.sellingPrice) * 100 : 0;
        const markupPct = p.costPrice > 0 ? (marginAmt / p.costPrice) * 100 : 0;

        if (visibleColumns.margin_amount !== false) row.push(marginAmt);
        if (visibleColumns.margin_percent !== false) row.push(`${marginPct.toFixed(1)}%`);
        if (visibleColumns.markup_percent !== false) row.push(`${markupPct.toFixed(1)}%`);
      }

      if (priceMode === 'wholesale' || visibleColumns.wholesale_tier1 !== false) {
        row.push(Math.round(p.sellingPrice * 0.95));
      }
      if (priceMode === 'wholesale' || visibleColumns.wholesale_tier2 !== false) {
        row.push(Math.round(p.sellingPrice * 0.90));
      }

      if (visibleColumns.warranty !== false) {
        row.push(p.warrantyMonths ? `${p.warrantyMonths} Months` : 'No Warranty');
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    const modeTag = priceMode === 'retail' ? 'Retail_Catalog' : priceMode === 'wholesale' ? 'Wholesale_Price_List' : 'Master_Price_List';
    exportToCsv(`Product_Price_List_${modeTag}_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    const isCustomerView = priceMode === 'retail';
    const modeTitle = isCustomerView 
      ? 'Product Price Catalog & Retail Sheet' 
      : priceMode === 'wholesale' 
        ? 'Wholesale & B2B Tiered Price List' 
        : 'Internal Product Price Master & Margin Audit';

    exportReportToPdf({
      title: modeTitle,
      subtitle: `Official catalog of items, pricing specifications, warranty terms, and availability`,
      timeframeLabel: `Catalog Snapshot (${new Date().toLocaleDateString()})`,
      filename: `Product_Price_List_${priceMode}_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      settings,
      summaryMetrics: isCustomerView ? [
        { label: 'Listed Products', value: `${stats.totalItems} Items` },
        { label: 'In Stock Items', value: `${stats.inStockCount} Products` },
        { label: 'Average Price', value: formatCurrency(stats.avgPrice, settings.currencySymbol) },
        { label: 'Price Range', value: `${formatCurrency(stats.minPrice, settings.currencySymbol)} - ${formatCurrency(stats.maxPrice, settings.currencySymbol)}` },
      ] : [
        { label: 'Total Catalog', value: `${stats.totalItems} Items` },
        { label: 'Avg Retail Price', value: formatCurrency(stats.avgPrice, settings.currencySymbol) },
        { label: 'Avg Cost Price', value: formatCurrency(stats.avgCost, settings.currencySymbol) },
        { label: 'Avg Gross Margin', value: `${stats.avgMarginPercent.toFixed(1)}%` },
      ],
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Mode Switcher Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Product Price List & Retail Catalog</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    {filteredProducts.length} Items
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate customer price sheets, internal margin audits, wholesale rate cards, and printable flyers
                </p>
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => handleModeSwitch('retail')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                priceMode === 'retail'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Customer-safe view (hides cost and profit margins)"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Customer Price Sheet</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch('internal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                priceMode === 'internal'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Management view with cost price and margin audit"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Internal Master (Cost & Margin)</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch('wholesale')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                priceMode === 'wholesale'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Wholesale tier pricing & discount simulator"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Wholesale Tiers</span>
            </button>
          </div>
        </div>

        {/* Global Catalog KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Items</span>
            <div className="text-base font-black text-slate-900 mt-0.5">
              {stats.totalItems} <span className="text-xs font-normal text-slate-500">Products</span>
            </div>
            <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">
              {stats.inStockCount} In Stock
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Selling Price</span>
            <div className="text-base font-black text-indigo-700 mt-0.5">
              {formatCurrency(stats.avgPrice, settings.currencySymbol)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              Min: {formatCurrency(stats.minPrice, settings.currencySymbol)}
            </div>
          </div>

          {priceMode !== 'retail' && (
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Cost Price</span>
              <div className="text-base font-black text-slate-700 mt-0.5">
                {formatCurrency(stats.avgCost, settings.currencySymbol)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Markup: {stats.avgMarkupPercent.toFixed(1)}%
              </div>
            </div>
          )}

          {priceMode !== 'retail' && (
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Gross Margin</span>
              <div className="text-base font-black text-purple-700 mt-0.5">
                {stats.avgMarginPercent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-purple-600 font-semibold mt-0.5">
                +{formatCurrency(stats.avgGrossMarginAmount, settings.currencySymbol)} / unit
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">On-Hand Stock Qty</span>
            <div className="text-base font-black text-slate-900 mt-0.5">
              {stats.totalStockQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {stats.outOfStockCount > 0 ? `${stats.outOfStockCount} Out of stock` : 'All stocked'}
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Retail Inventory Value</span>
            <div className="text-base font-black text-emerald-700 mt-0.5">
              {formatCurrency(stats.totalRetailValuation, settings.currencySymbol)}
            </div>
            <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
              Potential Revenue
            </div>
          </div>
        </div>

      </div>

      {/* Analytics Visualizer (Optional Toggle) */}
      {showAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in duration-200">
          
          {/* Price Range Distribution */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">
              Price Range Distribution
            </h3>
            <p className="text-xs text-slate-400 mb-4">Number of catalog items across price brackets</p>
            
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priceBracketsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(value: any) => [`${value} Products`, 'Catalog Count']}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]}>
                    {priceBracketsData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Average Price & Cost by Category */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">
              Average Price by Category
            </h3>
            <p className="text-xs text-slate-400 mb-4">Category-level average retail pricing and catalog density</p>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryPriceData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(value: any) => [formatCurrency(value, settings.currencySymbol), 'Avg Price']}
                  />
                  <Bar dataKey="avgPrice" fill="#10b981" radius={[8, 8, 0, 0]} name="Avg Selling Price" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* Main Filter & Action Toolbar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product name, brand, model, specs, SKU, barcode..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Buttons: Column Picker, CSV, PDF, Print, Analytics Toggle, View Mode */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            
            <button
              type="button"
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                showAnalytics 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Toggle Visual Price Analytics"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Charts</span>
            </button>

            {/* View Mode Toggle: Table / Grid */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Catalog Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Column Picker */}
            <ColumnVisibilityFilter
              columns={PRICE_LIST_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              buttonLabel="Columns"
            />

            {/* CSV Export */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              title="Export Price List to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>

            {/* PDF Export */}
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Export formatted PDF price list catalog"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            {/* Print */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              title="Print Price List Sheet"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Print</span>
            </button>

          </div>

        </div>

        {/* Dropdown Filters Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100">
          
          {/* Category Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="new_phones">New Phones</option>
              <option value="used_phones">Used Phones</option>
              <option value="accessories">Accessories</option>
              <option value="gadgets">Gadgets</option>
              <option value="sim_topup">SIM & Top-up</option>
              <option value="spare_parts">Spare Parts</option>
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Brand
            </label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Brands ({uniqueBrands.length})</option>
              {uniqueBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Condition Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Condition
            </label>
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Conditions</option>
              <option value="brand_new">Brand New</option>
              <option value="used_grade_a_plus">Used (Grade A+)</option>
              <option value="used_grade_a">Used (Grade A)</option>
              <option value="used_grade_b">Used (Grade B)</option>
              <option value="used_grade_c">Used (Grade C)</option>
            </select>
          </div>

          {/* Stock Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Availability
            </label>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Stock Status</option>
              <option value="in_stock">In Stock Only</option>
              <option value="low_stock">Low Stock Alert</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>

          {/* Price Range Tier */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Price Bracket
            </label>
            <select
              value={priceTierFilter}
              onChange={(e) => setPriceTierFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Price Ranges</option>
              <option value="tier_under_100k">&lt; 100,000 MMK</option>
              <option value="tier_100k_500k">100K - 500K MMK</option>
              <option value="tier_500k_1m">500K - 1M MMK</option>
              <option value="tier_1m_2m">1M - 2M MMK</option>
              <option value="tier_above_2m">&gt; 2,000,000 MMK</option>
            </select>
          </div>

          {/* Profit Margin Tier (if internal mode) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Margin Filter
            </label>
            <select
              value={marginTierFilter}
              onChange={(e) => setMarginTierFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Margins</option>
              <option value="high">High Margin (&gt; 30%)</option>
              <option value="medium">Medium (15% - 30%)</option>
              <option value="low">Low Margin (&lt; 15%)</option>
              <option value="negative">At Cost / Negative</option>
            </select>
          </div>

        </div>

      </div>

      {/* Wholesale / Custom Quote Calculator Popout */}
      {selectedProductForCalculator && (
        <div className="bg-indigo-900 text-white rounded-3xl p-5 border border-indigo-700 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-black tracking-tight text-white">
                  Wholesale & Bulk Quotation Simulator
                </h3>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                Simulating custom volume pricing for <span className="font-bold text-white">{selectedProductForCalculator.name}</span> ({selectedProductForCalculator.brand})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProductForCalculator(null)}
              className="p-1 rounded-lg text-indigo-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-indigo-800/60">
            
            <div className="bg-white/10 p-3 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Base Retail Price</span>
              <div className="text-base font-black text-white mt-0.5">
                {formatCurrency(selectedProductForCalculator.sellingPrice, settings.currencySymbol)}
              </div>
              <div className="text-[10px] text-indigo-200 mt-0.5">
                Cost: {formatCurrency(selectedProductForCalculator.costPrice, settings.currencySymbol)}
              </div>
            </div>

            <div className="bg-white/10 p-3 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Custom Discount %</span>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={customWholesaleDiscount}
                  onChange={(e) => setCustomWholesaleDiscount(Math.max(0, Math.min(50, Number(e.target.value))))}
                  className="w-20 px-2 py-1 bg-white text-slate-900 font-black rounded-lg text-sm focus:outline-hidden"
                />
                <span className="text-xs font-bold text-indigo-200">% off retail</span>
              </div>
            </div>

            <div className="bg-emerald-500/20 border border-emerald-400/30 p-3 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Quoted Wholesale Unit Price</span>
              <div className="text-base font-black text-emerald-300 mt-0.5">
                {formatCurrency(Math.round(selectedProductForCalculator.sellingPrice * (1 - customWholesaleDiscount / 100)), settings.currencySymbol)}
              </div>
              <div className="text-[10px] text-emerald-200 mt-0.5">
                Save {formatCurrency(Math.round(selectedProductForCalculator.sellingPrice * (customWholesaleDiscount / 100)), settings.currencySymbol)} / unit
              </div>
            </div>

            <div className="bg-white/10 p-3 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Remaining Margin</span>
              {(() => {
                const discountedPrice = selectedProductForCalculator.sellingPrice * (1 - customWholesaleDiscount / 100);
                const marginAmt = discountedPrice - selectedProductForCalculator.costPrice;
                const marginPct = discountedPrice > 0 ? (marginAmt / discountedPrice) * 100 : 0;
                return (
                  <div>
                    <div className={`text-base font-black mt-0.5 ${marginAmt >= 0 ? 'text-white' : 'text-rose-300'}`}>
                      {marginPct.toFixed(1)}% ({formatCurrency(marginAmt, settings.currencySymbol)})
                    </div>
                    <div className="text-[10px] text-indigo-200 mt-0.5">
                      {marginAmt >= 0 ? 'Safe profit margin' : 'Warning: Below cost!'}
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {/* Main Content Area: Table or Grid */}
      {viewMode === 'table' ? (
        
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  
                  {visibleColumns.product_info !== false && (
                    <th 
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Product & Specs</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  )}

                  {visibleColumns.sku_barcode !== false && (
                    <th className="py-3 px-4">SKU / Barcode</th>
                  )}

                  {visibleColumns.category_brand !== false && (
                    <th 
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('brand')}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Brand & Category</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  )}

                  {visibleColumns.condition !== false && (
                    <th className="py-3 px-4">Condition</th>
                  )}

                  {visibleColumns.stock_status !== false && (
                    <th 
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-center"
                      onClick={() => handleSort('stock')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Availability</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  )}

                  {priceMode !== 'retail' && visibleColumns.cost_price !== false && (
                    <th 
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right"
                      onClick={() => handleSort('cost')}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Cost Price</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  )}

                  {visibleColumns.selling_price !== false && (
                    <th 
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right"
                      onClick={() => handleSort('price')}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Selling Price</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  )}

                  {priceMode !== 'retail' && visibleColumns.margin_amount !== false && (
                    <th className="py-3 px-4 text-right">Gross Profit</th>
                  )}

                  {priceMode !== 'retail' && visibleColumns.margin_percent !== false && (
                    <th 
                      className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors text-right"
                      onClick={() => handleSort('margin')}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Margin %</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  )}

                  {priceMode !== 'retail' && visibleColumns.markup_percent !== false && (
                    <th className="py-3 px-4 text-right">Markup %</th>
                  )}

                  {(priceMode === 'wholesale' || visibleColumns.wholesale_tier1 !== false) && (
                    <th className="py-3 px-4 text-right">Tier 1 (-5%)</th>
                  )}

                  {(priceMode === 'wholesale' || visibleColumns.wholesale_tier2 !== false) && (
                    <th className="py-3 px-4 text-right">Tier 2 (-10%)</th>
                  )}

                  {visibleColumns.warranty !== false && (
                    <th className="py-3 px-4 text-center">Warranty</th>
                  )}

                  {visibleColumns.actions !== false && (
                    <th className="py-3 px-4 text-center">Actions</th>
                  )}

                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-400">
                      <Tag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">No products match the selected price filters</p>
                      <p className="text-xs text-slate-400 mt-1">Try resetting the search query or adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => {
                    const marginAmt = product.sellingPrice - product.costPrice;
                    const marginPct = product.sellingPrice > 0 ? (marginAmt / product.sellingPrice) * 100 : 0;
                    const markupPct = product.costPrice > 0 ? (marginAmt / product.costPrice) * 100 : 0;
                    const condInfo = getConditionLabel(product.condition);
                    const specs = [product.ram ? `${product.ram} RAM` : '', product.rom || product.storage, product.color].filter(Boolean).join(' • ');

                    return (
                      <tr 
                        key={product.id} 
                        className="hover:bg-slate-50/70 transition-colors group"
                      >
                        
                        {/* Product Info */}
                        {visibleColumns.product_info !== false && (
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-2.5">
                              {product.imageUrl ? (
                                <img 
                                  src={product.imageUrl} 
                                  alt={product.name} 
                                  referrerPolicy="no-referrer"
                                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0" 
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                  <Smartphone className="w-4 h-4" />
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-900">{product.name}</div>
                                {specs && (
                                  <div className="text-[11px] font-normal text-slate-500 mt-0.5">{specs}</div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {/* SKU / Barcode */}
                        {visibleColumns.sku_barcode !== false && (
                          <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                            <div>{product.sku || '-'}</div>
                            {product.barcode && (
                              <div className="text-slate-400 text-[10px] mt-0.5">{product.barcode}</div>
                            )}
                          </td>
                        )}

                        {/* Category & Brand */}
                        {visibleColumns.category_brand !== false && (
                          <td className="py-3.5 px-4 text-slate-700">
                            <div className="font-bold text-slate-800">{product.brand || '-'}</div>
                            <div className="text-[10px] text-slate-400">{getCategoryLabel(product.category)}</div>
                          </td>
                        )}

                        {/* Condition */}
                        {visibleColumns.condition !== false && (
                          <td className="py-3.5 px-4">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${condInfo.badgeClass}`}>
                              {condInfo.label}
                            </span>
                          </td>
                        )}

                        {/* Stock Level & Status */}
                        {visibleColumns.stock_status !== false && (
                          <td className="py-3.5 px-4 text-center">
                            {product.stock > product.minStockAlert ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <CheckCircle2 className="w-3 h-3" />
                                {product.stock} In Stock
                              </span>
                            ) : product.stock > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                <AlertCircle className="w-3 h-3" />
                                {product.stock} Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                                <X className="w-3 h-3" />
                                Out of Stock
                              </span>
                            )}
                          </td>
                        )}

                        {/* Cost Price */}
                        {priceMode !== 'retail' && visibleColumns.cost_price !== false && (
                          <td className="py-3.5 px-4 text-right font-bold text-slate-600">
                            {formatCurrency(product.costPrice, settings.currencySymbol)}
                          </td>
                        )}

                        {/* Selling Price */}
                        {visibleColumns.selling_price !== false && (
                          <td className="py-3.5 px-4 text-right">
                            <span className="font-black text-sm text-indigo-700">
                              {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                            </span>
                          </td>
                        )}

                        {/* Margin Amount */}
                        {priceMode !== 'retail' && visibleColumns.margin_amount !== false && (
                          <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                            <span className={marginAmt >= 0 ? 'text-slate-800' : 'text-rose-600'}>
                              {formatCurrency(marginAmt, settings.currencySymbol)}
                            </span>
                          </td>
                        )}

                        {/* Margin % */}
                        {priceMode !== 'retail' && visibleColumns.margin_percent !== false && (
                          <td className="py-3.5 px-4 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black ${
                              marginPct >= 30 ? 'bg-emerald-100 text-emerald-800' :
                              marginPct >= 15 ? 'bg-purple-100 text-purple-800' :
                              marginPct > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </td>
                        )}

                        {/* Markup % */}
                        {priceMode !== 'retail' && visibleColumns.markup_percent !== false && (
                          <td className="py-3.5 px-4 text-right text-slate-500 font-semibold">
                            {markupPct.toFixed(1)}%
                          </td>
                        )}

                        {/* Wholesale Tier 1 */}
                        {(priceMode === 'wholesale' || visibleColumns.wholesale_tier1 !== false) && (
                          <td className="py-3.5 px-4 text-right font-bold text-slate-700">
                            {formatCurrency(Math.round(product.sellingPrice * 0.95), settings.currencySymbol)}
                          </td>
                        )}

                        {/* Wholesale Tier 2 */}
                        {(priceMode === 'wholesale' || visibleColumns.wholesale_tier2 !== false) && (
                          <td className="py-3.5 px-4 text-right font-bold text-slate-700">
                            {formatCurrency(Math.round(product.sellingPrice * 0.90), settings.currencySymbol)}
                          </td>
                        )}

                        {/* Warranty */}
                        {visibleColumns.warranty !== false && (
                          <td className="py-3.5 px-4 text-center text-slate-600">
                            {product.warrantyMonths ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                {product.warrantyMonths} Mo
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">None</span>
                            )}
                          </td>
                        )}

                        {/* Actions */}
                        {visibleColumns.actions !== false && (
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              
                              {/* Bulk Quotation Simulator Button */}
                              <button
                                type="button"
                                onClick={() => setSelectedProductForCalculator(product)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="Open Wholesale / Bulk Discount Calculator"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                              </button>

                              {/* Barcode / Shelf Price Tag Modal */}
                              {onOpenBarcodeModal && (
                                <button
                                  type="button"
                                  onClick={() => onOpenBarcodeModal(product)}
                                  className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Generate Barcode / Shelf Price Label"
                                >
                                  <Barcode className="w-3.5 h-3.5" />
                                </button>
                              )}

                            </div>
                          </td>
                        )}

                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Table Footer with Summary */}
              {filteredProducts.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold text-xs">
                    <td colSpan={visibleColumns.product_info !== false ? 1 : 0} className="py-3.5 px-4">
                      <span>Summary Totals ({filteredProducts.length} Items)</span>
                    </td>
                    
                    {visibleColumns.sku_barcode !== false && <td className="py-3.5 px-4"></td>}
                    {visibleColumns.category_brand !== false && <td className="py-3.5 px-4"></td>}
                    {visibleColumns.condition !== false && <td className="py-3.5 px-4"></td>}
                    
                    {visibleColumns.stock_status !== false && (
                      <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                        {stats.totalStockQty.toLocaleString()} Units
                      </td>
                    )}

                    {priceMode !== 'retail' && visibleColumns.cost_price !== false && (
                      <td className="py-3.5 px-4 text-right text-slate-300">
                        Avg: {formatCurrency(stats.avgCost, settings.currencySymbol)}
                      </td>
                    )}

                    {visibleColumns.selling_price !== false && (
                      <td className="py-3.5 px-4 text-right text-emerald-400 font-black">
                        Avg: {formatCurrency(stats.avgPrice, settings.currencySymbol)}
                      </td>
                    )}

                    {priceMode !== 'retail' && visibleColumns.margin_amount !== false && (
                      <td className="py-3.5 px-4 text-right text-purple-300">
                        Avg: +{formatCurrency(stats.avgGrossMarginAmount, settings.currencySymbol)}
                      </td>
                    )}

                    {priceMode !== 'retail' && visibleColumns.margin_percent !== false && (
                      <td className="py-3.5 px-4 text-right text-purple-300 font-black">
                        {stats.avgMarginPercent.toFixed(1)}%
                      </td>
                    )}

                    {priceMode !== 'retail' && visibleColumns.markup_percent !== false && (
                      <td className="py-3.5 px-4 text-right text-slate-400">
                        {stats.avgMarkupPercent.toFixed(1)}%
                      </td>
                    )}

                    {(priceMode === 'wholesale' || visibleColumns.wholesale_tier1 !== false) && (
                      <td className="py-3.5 px-4 text-right text-slate-300">-</td>
                    )}

                    {(priceMode === 'wholesale' || visibleColumns.wholesale_tier2 !== false) && (
                      <td className="py-3.5 px-4 text-right text-slate-300">-</td>
                    )}

                    {visibleColumns.warranty !== false && <td className="py-3.5 px-4"></td>}
                    {visibleColumns.actions !== false && <td className="py-3.5 px-4"></td>}
                  </tr>
                </tfoot>
              )}

            </table>
          </div>

        </div>

      ) : (

        /* Grid / Catalog Card View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-400">
              <Tag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No products match the selected price filters</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing or adjusting your search parameters</p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const condInfo = getConditionLabel(product.condition);
              const marginAmt = product.sellingPrice - product.costPrice;
              const marginPct = product.sellingPrice > 0 ? (marginAmt / product.sellingPrice) * 100 : 0;
              const specs = [product.ram ? `${product.ram} RAM` : '', product.rom || product.storage, product.color].filter(Boolean).join(' • ');

              return (
                <div 
                  key={product.id}
                  className="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div>
                    {/* Card Top: Badges & Brand */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {product.brand}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${condInfo.badgeClass}`}>
                        {condInfo.label}
                      </span>
                    </div>

                    {/* Product Name */}
                    <h4 className="font-bold text-slate-900 text-sm line-clamp-2 leading-tight">
                      {product.name}
                    </h4>

                    {specs && (
                      <p className="text-xs text-slate-500 mt-1">{specs}</p>
                    )}

                    {/* Stock Status Badge */}
                    <div className="mt-2.5">
                      {product.stock > product.minStockAlert ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          {product.stock} Units In Stock
                        </span>
                      ) : product.stock > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          {product.stock} Units Left (Low Stock)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600">
                          <X className="w-3 h-3" />
                          Out of Stock
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom: Price & Details */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Retail Price
                        </span>
                        <span className="text-lg font-black text-indigo-700">
                          {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                        </span>
                      </div>

                      {priceMode !== 'retail' && (
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Margin
                          </span>
                          <span className={`text-xs font-black px-1.5 py-0.5 rounded-md ${
                            marginPct >= 30 ? 'bg-emerald-100 text-emerald-800' :
                            marginPct >= 15 ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {marginPct.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Wholesale rate cards in wholesale mode */}
                    {priceMode === 'wholesale' && (
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Tier 1 (-5%)</span>
                          <span className="font-black text-slate-800">
                            {formatCurrency(Math.round(product.sellingPrice * 0.95), settings.currencySymbol)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Tier 2 (-10%)</span>
                          <span className="font-black text-slate-800">
                            {formatCurrency(Math.round(product.sellingPrice * 0.90), settings.currencySymbol)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-slate-400 text-xs">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {product.sku || product.barcode || '-'}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedProductForCalculator(product)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Wholesale Calculator"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                        </button>
                        {onOpenBarcodeModal && (
                          <button
                            type="button"
                            onClick={() => onOpenBarcodeModal(product)}
                            className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                            title="Print Price / Barcode Tag"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

      )}

    </div>
  );
};
