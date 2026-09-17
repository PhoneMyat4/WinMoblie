import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Package, 
  DollarSign, 
  Percent, 
  ArrowUpDown, 
  Search, 
  Download, 
  Award, 
  AlertCircle, 
  Layers, 
  BarChart2, 
  PieChart as PieIcon,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
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
import { Product, Sale, ShopSettings } from '../../types';
import { SoldItemAggregate, computeMostSoldItems, exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { formatCurrency, getCategoryLabel } from '../../utils/formatters';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';
import { isPhoneCategory } from '../../data/categoryTaxonomy';

const MOST_SOLD_COLUMNS: ColumnDefinition[] = [
  { id: 'rank', label: 'Rank' },
  { id: 'product_details', label: 'Product Details', required: true },
  { id: 'category', label: 'Category' },
  { id: 'units_sold', label: 'Units Sold' },
  { id: 'total_revenue', label: 'Total Revenue' },
  { id: 'gross_profit', label: 'Gross Profit' },
  { id: 'profit_margin', label: 'Margin %' },
  { id: 'remaining_stock', label: 'Remaining Stock' },
];

interface MostSoldItemsReportProps {
  sales: Sale[];
  products: Product[];
  settings: ShopSettings;
  timeframeLabel: string;
}

type SortField = 'unitsSold' | 'totalRevenue' | 'grossProfit' | 'profitMarginPercent' | 'currentStock';

export const MostSoldItemsReport: React.FC<MostSoldItemsReportProps> = ({
  sales,
  products,
  settings,
  timeframeLabel,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('unitsSold');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'all' | 'phones' | 'accessories'>('all');

  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('most_sold_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      rank: true,
      product_details: true,
      category: true,
      units_sold: true,
      total_revenue: true,
      gross_profit: true,
      profit_margin: true,
      remaining_stock: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('most_sold_visible_columns', JSON.stringify(updated));
    } catch {}
  };

  const activeColumnCount = useMemo(() => {
    return MOST_SOLD_COLUMNS.filter(c => visibleColumns[c.id] !== false).length;
  }, [visibleColumns]);

  // Compute aggregated items based on sales in this timeframe
  const aggregatedItems = useMemo(() => {
    return computeMostSoldItems(sales, products, categoryFilter);
  }, [sales, products, categoryFilter]);

  // Filtered & Sorted list
  const filteredAndSortedItems = useMemo(() => {
    return aggregatedItems
      .filter((item) => {
        if (viewMode === 'phones') {
          if (!isPhoneCategory(item.category)) return false;
        } else if (viewMode === 'accessories') {
          if (isPhoneCategory(item.category)) return false;
        }

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return sortOrder === 'desc' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
      });
  }, [aggregatedItems, searchQuery, sortField, sortOrder, viewMode]);

  // Overall Statistics for this timeframe
  const stats = useMemo(() => {
    const totalUnits = aggregatedItems.reduce((acc, i) => acc + i.unitsSold, 0);
    const totalRevenue = aggregatedItems.reduce((acc, i) => acc + i.totalRevenue, 0);
    const totalCost = aggregatedItems.reduce((acc, i) => acc + i.totalCost, 0);
    const totalGrossProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
    const topItem = aggregatedItems.length > 0 ? aggregatedItems[0] : null;

    return {
      totalUnits,
      totalRevenue,
      totalCost,
      totalGrossProfit,
      overallMargin,
      topItem,
      uniqueSoldProductsCount: aggregatedItems.length,
    };
  }, [aggregatedItems]);

  // Chart data: Top 8 items by Units & Revenue
  const topBarChartData = useMemo(() => {
    return [...aggregatedItems]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 7)
      .map(item => ({
        name: item.name.length > 18 ? item.name.substring(0, 16) + '…' : item.name,
        units: item.unitsSold,
        revenue: item.totalRevenue,
        profit: item.grossProfit,
      }));
  }, [aggregatedItems]);

  // Category Distribution data for Pie Chart
  const categoryPieData = useMemo(() => {
    const map = new Map<string, number>();
    aggregatedItems.forEach(item => {
      const label = getCategoryLabel(item.category);
      map.set(label, (map.get(label) || 0) + item.totalRevenue);
    });
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1'];
    return Array.from(map.entries()).map(([name, value], idx) => ({
      name,
      value,
      color: colors[idx % colors.length],
    }));
  }, [aggregatedItems]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getExportData = () => {
    const headers: string[] = [];

    if (visibleColumns.rank !== false) {
      headers.push('Rank');
    }
    if (visibleColumns.product_details !== false) {
      headers.push('Product Name', 'Brand', `Avg Price (${settings.currencySymbol})`, 'IMEI Serialized');
    }
    if (visibleColumns.category !== false) {
      headers.push('Category');
    }
    if (visibleColumns.units_sold !== false) {
      headers.push('Units Sold', 'Orders Count');
    }
    if (visibleColumns.total_revenue !== false) {
      headers.push(`Total Revenue (${settings.currencySymbol})`);
    }
    if (visibleColumns.gross_profit !== false) {
      headers.push(`Total Cost (${settings.currencySymbol})`, `Gross Profit (${settings.currencySymbol})`);
    }
    if (visibleColumns.profit_margin !== false) {
      headers.push('Profit Margin (%)');
    }
    if (visibleColumns.remaining_stock !== false) {
      headers.push('Current Stock', 'Stock Status');
    }

    const rows = filteredAndSortedItems.map((item, idx) => {
      const row: (string | number)[] = [];

      if (visibleColumns.rank !== false) {
        row.push(idx + 1);
      }
      if (visibleColumns.product_details !== false) {
        row.push(
          item.name,
          item.brand || '-',
          Math.round(item.averagePrice),
          item.hasImei ? 'Yes' : 'No'
        );
      }
      if (visibleColumns.category !== false) {
        row.push(getCategoryLabel(item.category));
      }
      if (visibleColumns.units_sold !== false) {
        row.push(item.unitsSold, item.orderCount);
      }
      if (visibleColumns.total_revenue !== false) {
        row.push(item.totalRevenue);
      }
      if (visibleColumns.gross_profit !== false) {
        row.push(item.totalCost, item.grossProfit);
      }
      if (visibleColumns.profit_margin !== false) {
        row.push(item.profitMarginPercent.toFixed(1) + '%');
      }
      if (visibleColumns.remaining_stock !== false) {
        const isLow = (item.minStockAlert || 0) > 0 && item.currentStock <= item.minStockAlert;
        row.push(
          item.currentStock,
          item.currentStock <= 0 ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'
        );
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    exportToCsv(`Most_Sold_Items_${timeframeLabel.replace(/\s+/g, '_')}`, headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    exportReportToPdf({
      title: 'Most Sold Items (Velocity) Report',
      subtitle: `Best-selling products, volume breakdown, and revenue velocity rankings`,
      timeframeLabel,
      filename: `Most_Sold_Items_${timeframeLabel.replace(/\s+/g, '_')}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue, settings.currencySymbol) },
        { label: 'Gross Profit', value: formatCurrency(stats.totalGrossProfit, settings.currencySymbol) },
        { label: 'Units Sold', value: `${stats.totalUnits.toLocaleString()} Units` },
        { label: 'Average Margin', value: `${stats.overallMargin.toFixed(1)}%` },
      ],
    });
  };

  const BAR_COLORS = ['#10b981', '#059669', '#34d399', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Units Sold</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalUnits.toLocaleString()} <span className="text-sm font-semibold text-slate-500">Units</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
              <span>Across {stats.uniqueSoldProductsCount} unique SKUs in {timeframeLabel}</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Sales Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(stats.totalRevenue, settings.currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
              <span>Cost of Goods: {formatCurrency(stats.totalCost, settings.currencySymbol)}</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Profit Earned</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-purple-700 tracking-tight">
              {formatCurrency(stats.totalGrossProfit, settings.currencySymbol)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-emerald-600">
              <Percent className="w-3.5 h-3.5" />
              <span>{stats.overallMargin.toFixed(1)}% Average Gross Margin</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">#1 Top Selling Product</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            {stats.topItem ? (
              <>
                <div className="text-base font-extrabold text-slate-900 truncate" title={stats.topItem.name}>
                  {stats.topItem.name}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 mt-1 font-medium">
                  <span className="font-bold text-emerald-700">{stats.topItem.unitsSold} units sold</span>
                  <span>{formatCurrency(stats.topItem.totalRevenue, settings.currencySymbol)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">No sales recorded in this period</p>
            )}
          </div>
        </div>

      </div>

      {/* Visual Analytics Grid */}
      {aggregatedItems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Top Products Bar Chart */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-emerald-600" />
                  Top Best-Selling Items ({timeframeLabel})
                </h3>
                <p className="text-xs text-slate-500">Comparison of volume sold by SKU</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                Units Sold
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBarChartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={110} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(value: any, name: any) => {
                      if (name === 'units') return [`${value} Units`, 'Quantity Sold'];
                      if (name === 'revenue') return [formatCurrency(Number(value), settings.currencySymbol), 'Total Revenue'];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="units" radius={[0, 6, 6, 0]}>
                    {topBarChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue by Category Distribution */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col">
            <div className="mb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-purple-600" />
                Sales Share by Category
              </h3>
              <p className="text-xs text-slate-500">Revenue split in {timeframeLabel}</p>
            </div>

            <div className="h-44 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryPieData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '10px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(value: any) => [formatCurrency(Number(value), settings.currencySymbol), 'Revenue']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-auto space-y-1.5 pt-2 border-t border-slate-100 max-h-36 overflow-y-auto">
              {categoryPieData.map((cat, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-slate-700 truncate">{cat.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 shrink-0">
                    {formatCurrency(cat.value, settings.currencySymbol)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Control Bar: Search, Category Filter & Export */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search & Mode toggles */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search best sellers by product name, brand..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Items
            </button>
            <button
              type="button"
              onClick={() => setViewMode('phones')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'phones' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Phones Only
            </button>
            <button
              type="button"
              onClick={() => setViewMode('accessories')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'accessories' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Accessories & Gadgets
            </button>
          </div>
        </div>

        {/* Category Dropdown & Export */}
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            <option value="brand_new_phones">Brand New Phones</option>
            <option value="pre_owned_phones">Pre-Owned Phones</option>
            <option value="accessories_gadgets">Accessories & Gadgets</option>
            <option value="cookware">Cookware</option>
            <option value="sim_cards">SIM Cards & Top-up</option>
          </select>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
              title="Export filtered items to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Export filtered items to PDF"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

      </div>

      {/* Main Best Sellers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Product Velocity & Sales Ranking ({filteredAndSortedItems.length} Products)
            </h3>
            <p className="text-xs text-slate-500">Sorted by highest sales volume and gross profitability</p>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap">
            <div className="text-xs text-slate-400 font-semibold hidden md:block">
              Timeframe: <span className="text-slate-800 font-bold">{timeframeLabel}</span>
            </div>
            <ColumnVisibilityFilter
              columns={MOST_SOLD_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              onReset={() => handleColumnChange({
                rank: true,
                product_details: true,
                category: true,
                units_sold: true,
                total_revenue: true,
                gross_profit: true,
                profit_margin: true,
                remaining_stock: true,
              })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 text-slate-700 uppercase font-extrabold text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                {visibleColumns.rank !== false && <th className="py-3 px-4 w-12 text-center">Rank</th>}
                {visibleColumns.product_details !== false && <th className="py-3 px-4">Product Details</th>}
                {visibleColumns.category !== false && <th className="py-3 px-4">Category</th>}
                {visibleColumns.units_sold !== false && (
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('unitsSold')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Units Sold</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.total_revenue !== false && (
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('totalRevenue')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Total Revenue</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.gross_profit !== false && (
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('grossProfit')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Gross Profit</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.profit_margin !== false && (
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('profitMarginPercent')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Margin %</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.remaining_stock !== false && (
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('currentStock')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Remaining Stock</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedItems.length === 0 ? (
                <tr>
                  <td colSpan={activeColumnCount || 8} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No sales matching the criteria found in this timeframe.
                  </td>
                </tr>
              ) : (
                filteredAndSortedItems.map((item, idx) => {
                  const isGold = idx === 0;
                  const isSilver = idx === 1;
                  const isBronze = idx === 2;
                  const isLowStock = (item.minStockAlert || 0) > 0 && item.currentStock <= item.minStockAlert;
                  const isOutOfStock = item.currentStock <= 0;

                  return (
                    <tr key={item.productId || idx} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Rank Badge */}
                      {visibleColumns.rank !== false && (
                        <td className="py-3.5 px-4 text-center">
                          {isGold ? (
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-[11px] inline-flex items-center justify-center shadow-xs">
                              1
                            </span>
                          ) : isSilver ? (
                            <span className="w-6 h-6 rounded-full bg-slate-400 text-white font-black text-[11px] inline-flex items-center justify-center shadow-xs">
                              2
                            </span>
                          ) : isBronze ? (
                            <span className="w-6 h-6 rounded-full bg-amber-700 text-white font-black text-[11px] inline-flex items-center justify-center shadow-xs">
                              3
                            </span>
                          ) : (
                            <span className="font-bold text-slate-500">#{idx + 1}</span>
                          )}
                        </td>
                      )}

                      {/* Product Name & Brand */}
                      {visibleColumns.product_details !== false && (
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">{item.brand}</span>
                            <span>•</span>
                            <span>Avg: {formatCurrency(item.averagePrice, settings.currencySymbol)}</span>
                            {item.hasImei && (
                              <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 rounded text-[9px] font-bold border border-purple-200">
                                IMEI Serialized
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Category */}
                      {visibleColumns.category !== false && (
                        <td className="py-3.5 px-4">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {getCategoryLabel(item.category)}
                          </span>
                        </td>
                      )}

                      {/* Units Sold */}
                      {visibleColumns.units_sold !== false && (
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-black text-sm text-slate-900">
                            {item.unitsSold}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            {item.orderCount} order{item.orderCount > 1 ? 's' : ''}
                          </div>
                        </td>
                      )}

                      {/* Total Revenue */}
                      {visibleColumns.total_revenue !== false && (
                        <td className="py-3.5 px-4 text-right font-black text-slate-900">
                          {formatCurrency(item.totalRevenue, settings.currencySymbol)}
                        </td>
                      )}

                      {/* Gross Profit */}
                      {visibleColumns.gross_profit !== false && (
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-black text-emerald-700">
                            {formatCurrency(item.grossProfit, settings.currencySymbol)}
                          </span>
                        </td>
                      )}

                      {/* Profit Margin */}
                      {visibleColumns.profit_margin !== false && (
                        <td className="py-3.5 px-4 text-right">
                          <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                            item.profitMarginPercent >= 20 
                              ? 'bg-emerald-50 text-emerald-800' 
                              : item.profitMarginPercent >= 10
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}>
                            {item.profitMarginPercent.toFixed(1)}%
                          </span>
                        </td>
                      )}

                      {/* Remaining Stock */}
                      {visibleColumns.remaining_stock !== false && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {isOutOfStock ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-black text-[10px] border border-rose-200">
                                <AlertCircle className="w-3 h-3" />
                                0 (Out)
                              </span>
                            ) : isLowStock ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-black text-[10px] border border-amber-200">
                                <AlertTriangle className="w-3 h-3" />
                                {item.currentStock} (Low)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                {item.currentStock} Units
                              </span>
                            )}
                          </div>
                          {isLowStock && item.unitsSold >= 2 && (
                            <p className="text-[9px] text-rose-600 font-bold mt-0.5">High velocity: Reorder</p>
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

    </div>
  );
};
