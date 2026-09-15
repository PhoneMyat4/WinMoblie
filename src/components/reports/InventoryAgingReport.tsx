import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  AlertTriangle, 
  TrendingDown, 
  DollarSign, 
  Package, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  CheckCircle, 
  Sparkles,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
  Tag,
  FileText
} from 'lucide-react';
import { Product, ShopSettings } from '../../types';
import { calculateInventoryAging, ProductAgingRow } from '../../utils/serializedUtils';
import { formatCurrency, getCategoryLabel } from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';

const AGING_REPORT_COLUMNS: ColumnDefinition[] = [
  { id: 'product_specs', label: 'Product & Specs', required: true },
  { id: 'category', label: 'Category' },
  { id: 'stock_qty', label: 'In Stock' },
  { id: 'unit_cost', label: 'Unit Cost' },
  { id: 'tied_up_capital', label: 'Tied-up Capital' },
  { id: 'days_in_stock', label: 'Days in Stock' },
  { id: 'aging_status', label: 'Aging Status' },
  { id: 'recommended_action', label: 'Recommended Action' },
];

interface InventoryAgingReportProps {
  products: Product[];
  settings: ShopSettings;
  onOpenProductDetail?: (product: Product) => void;
}

export const InventoryAgingReport: React.FC<InventoryAgingReportProps> = ({
  products,
  settings,
  onOpenProductDetail,
}) => {
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'days' | 'capital' | 'name'>('days');

  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('aging_report_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      product_specs: true,
      category: true,
      stock_qty: true,
      unit_cost: true,
      tied_up_capital: true,
      days_in_stock: true,
      aging_status: true,
      recommended_action: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('aging_report_visible_columns', JSON.stringify(updated));
    } catch {}
  };

  const activeColumnCount = useMemo(() => {
    return AGING_REPORT_COLUMNS.filter(c => visibleColumns[c.id] !== false).length;
  }, [visibleColumns]);

  // Compute live aging data
  const agingData = useMemo(() => {
    return calculateInventoryAging(products, []);
  }, [products]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return agingData.rows.filter(row => {
      if (selectedBucket !== 'all' && row.agingBucket !== selectedBucket) return false;
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        row.productName.toLowerCase().includes(q) ||
        row.brand.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.barcode.toLowerCase().includes(q) ||
        row.serializedImeis.some(im => im.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      if (sortBy === 'days') return b.daysInStock - a.daysInStock;
      if (sortBy === 'capital') return b.totalCostTiedUp - a.totalCostTiedUp;
      return a.productName.localeCompare(b.productName);
    });
  }, [agingData.rows, selectedBucket, categoryFilter, searchQuery, sortBy]);

  // Export Data preparation
  const getExportData = () => {
    const headers: string[] = [];

    if (visibleColumns.product_specs !== false) {
      headers.push('Product Name', 'SKU', 'Brand', 'Barcode', 'Serialized IMEIs');
    }
    if (visibleColumns.category !== false) {
      headers.push('Category');
    }
    if (visibleColumns.stock_qty !== false) {
      headers.push('In Stock (Units)');
    }
    if (visibleColumns.unit_cost !== false) {
      headers.push(`Unit Cost (${settings.currencySymbol})`, `Selling Price (${settings.currencySymbol})`);
    }
    if (visibleColumns.tied_up_capital !== false) {
      headers.push(`Tied-Up Working Capital (${settings.currencySymbol})`);
    }
    if (visibleColumns.days_in_stock !== false) {
      headers.push('Received Date', 'Days In Stock');
    }
    if (visibleColumns.aging_status !== false) {
      headers.push('Aging Status');
    }
    if (visibleColumns.recommended_action !== false) {
      headers.push('Recommended Action');
    }

    const rows = filteredRows.map(r => {
      const row: (string | number)[] = [];

      if (visibleColumns.product_specs !== false) {
        row.push(
          r.productName,
          r.sku,
          r.brand || '-',
          r.barcode || '-',
          r.serializedImeis.length > 0 ? r.serializedImeis.join('; ') : '-'
        );
      }
      if (visibleColumns.category !== false) {
        row.push(getCategoryLabel(r.category));
      }
      if (visibleColumns.stock_qty !== false) {
        row.push(r.stock);
      }
      if (visibleColumns.unit_cost !== false) {
        row.push(r.costPrice, r.sellingPrice);
      }
      if (visibleColumns.tied_up_capital !== false) {
        row.push(r.totalCostTiedUp);
      }
      if (visibleColumns.days_in_stock !== false) {
        row.push(r.receivedDate.slice(0, 10), `${r.daysInStock} days`);
      }
      if (visibleColumns.aging_status !== false) {
        row.push(
          r.agingBucket === '90_plus'
            ? '90+ Days (Dead Stock)'
            : r.agingBucket === '61_90'
            ? '61-90 Days (Slow Moving)'
            : r.agingBucket === '31_60'
            ? '31-60 Days (Normal)'
            : '0-30 Days (Fresh Stock)'
        );
      }
      if (visibleColumns.recommended_action !== false) {
        row.push(r.suggestedAction);
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    exportToCsv('Inventory_Aging_Report', headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    exportReportToPdf({
      title: 'Inventory Aging & Dead Stock Audit',
      subtitle: `Working capital tied-up breakdown and actionable stock liquidation recommendations`,
      filename: 'Inventory_Aging_Dead_Stock_Report',
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Tied-up Capital', value: formatCurrency(agingData.totalTiedUpCapital, settings.currencySymbol) },
        { label: 'Fresh (<=30d)', value: formatCurrency(agingData.buckets[0].tiedUpCost, settings.currencySymbol) },
        { label: 'Slow (61-90d)', value: formatCurrency(agingData.buckets[2].tiedUpCost, settings.currencySymbol) },
        { label: 'Dead Stock (90d+)', value: formatCurrency(agingData.buckets[3].tiedUpCost, settings.currencySymbol) },
      ],
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & KPI Cards */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                <Clock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                Inventory Aging & Dead Stock Audit
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Identify slow-moving stock, tied-up working capital (&gt;30, &gt;60, &gt;90 days), and actionable clearance recommendations
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
              title="Export to PDF document"
            >
              <FileText className="w-3.5 h-3.5" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          </div>
        </div>

        {/* 4 Summary Capital KPI Blocks */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Total Tied-Up Capital
            </span>
            <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
              {formatCurrency(agingData.totalTiedUpCapital, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Across {agingData.totalUnsoldUnits} unsold units
            </span>
          </div>

          <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
              Fresh Stock (&le;30 Days)
            </span>
            <div className="text-base sm:text-lg font-black text-emerald-900 mt-0.5">
              {formatCurrency(agingData.buckets[0].tiedUpCost, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-emerald-700 font-bold block mt-0.5">
              {agingData.buckets[0].percentageOfInventory.toFixed(1)}% of total inventory
            </span>
          </div>

          <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
              Slow-Moving (&gt;60 Days)
            </span>
            <div className="text-base sm:text-lg font-black text-amber-900 mt-0.5">
              {formatCurrency(agingData.slowMovingCapital, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-amber-700 font-bold block mt-0.5">
              Capital tied up &gt; 2 months
            </span>
          </div>

          <div className="bg-rose-50/80 p-4 rounded-2xl border border-rose-200/90">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                Dead Stock Alert (&gt;90 Days)
              </span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            </div>
            <div className="text-base sm:text-lg font-black text-rose-900 mt-0.5">
              {formatCurrency(agingData.deadStockCapital, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-rose-700 font-bold block mt-0.5">
              {agingData.buckets[3].productCount} products require clearance
            </span>
          </div>

        </div>

        {/* Visual 4-Bucket Aging Distribution Bar */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Inventory Aging Spectrum Breakdown</span>
            <span className="text-slate-400 font-normal">Average stock age: {agingData.averageAgingDays} days</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {agingData.buckets.map(b => (
              <button
                key={b.bucketKey}
                type="button"
                onClick={() => setSelectedBucket(selectedBucket === b.bucketKey ? 'all' : b.bucketKey)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedBucket === b.bucketKey
                    ? 'ring-2 ring-indigo-500 bg-white shadow-xs border-indigo-300'
                    : 'bg-slate-50 hover:bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${b.badgeClass}`}>
                    {b.daysRange}
                  </span>
                  <span className="text-xs font-black text-slate-900">{b.percentageOfInventory.toFixed(0)}%</span>
                </div>
                <p className="text-xs font-black text-slate-900 mt-1.5">{b.label}</p>
                <p className="text-[11px] font-mono font-bold text-slate-600 mt-0.5">
                  {formatCurrency(b.tiedUpCost, settings.currencySymbol)}
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {b.unitsCount} units ({b.productCount} models)
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Interactive Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="aging-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter product name, brand, SKU, barcode..."
            className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Category & Sort controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            <option value="new_phones">Brand New Phones</option>
            <option value="used_phones">Pre-Owned Phones</option>
            <option value="accessories">Accessories</option>
            <option value="gadgets">Audio & Gadgets</option>
            <option value="spare_parts">Spare Parts</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'days' | 'capital' | 'name')}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
          >
            <option value="days">Sort by: Oldest First (Days)</option>
            <option value="capital">Sort by: Highest Capital Tied Up</option>
            <option value="name">Sort by: Product Name</option>
          </select>

          {selectedBucket !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedBucket('all')}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Clear Bucket Filter
            </button>
          )}
        </div>

      </div>

      {/* Main Aging Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Inventory Aging Ledger ({filteredRows.length} Products)
            </h3>
            <p className="text-xs text-slate-500">Days in stock and tied-up working capital analysis</p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <ColumnVisibilityFilter
              columns={AGING_REPORT_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              onReset={() => handleColumnChange({
                product_specs: true,
                category: true,
                stock_qty: true,
                unit_cost: true,
                tied_up_capital: true,
                days_in_stock: true,
                aging_status: true,
                recommended_action: true,
              })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {visibleColumns.product_specs !== false && <th className="py-3.5 px-4">Product & Specs</th>}
                {visibleColumns.category !== false && <th className="py-3.5 px-3">Category</th>}
                {visibleColumns.stock_qty !== false && <th className="py-3.5 px-3 text-right">In Stock</th>}
                {visibleColumns.unit_cost !== false && <th className="py-3.5 px-3 text-right">Unit Cost</th>}
                {visibleColumns.tied_up_capital !== false && <th className="py-3.5 px-3 text-right">Tied-up Capital</th>}
                {visibleColumns.days_in_stock !== false && <th className="py-3.5 px-3 text-center">Days in Stock</th>}
                {visibleColumns.aging_status !== false && <th className="py-3.5 px-3 text-center">Aging Status</th>}
                {visibleColumns.recommended_action !== false && <th className="py-3.5 px-4">Recommended Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={activeColumnCount || 8} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-bold">No inventory items matched the selected filters</p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.productId} className="hover:bg-slate-50/80 transition-colors">
                    {visibleColumns.product_specs !== false && (
                      <td className="py-3 px-4">
                        <div className="font-black text-slate-900 leading-snug">{row.productName}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span className="font-mono">{row.sku}</span>
                          {row.serializedImeis.length > 0 && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 rounded font-mono font-bold">
                              {row.serializedImeis.length} Serialized IMEI{row.serializedImeis.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {visibleColumns.category !== false && (
                      <td className="py-3 px-3">
                        <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {getCategoryLabel(row.category)}
                        </span>
                      </td>
                    )}

                    {visibleColumns.stock_qty !== false && (
                      <td className="py-3 px-3 text-right font-black text-slate-900 font-mono">
                        {row.stock}
                      </td>
                    )}

                    {visibleColumns.unit_cost !== false && (
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {formatCurrency(row.costPrice, settings.currencySymbol)}
                      </td>
                    )}

                    {visibleColumns.tied_up_capital !== false && (
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                        {formatCurrency(row.totalCostTiedUp, settings.currencySymbol)}
                      </td>
                    )}

                    {visibleColumns.days_in_stock !== false && (
                      <td className="py-3 px-3 text-center font-mono font-black">
                        <span className={`px-2 py-1 rounded-lg text-xs ${
                          row.daysInStock > 90 ? 'bg-rose-100 text-rose-800 font-black' :
                          row.daysInStock > 60 ? 'bg-amber-100 text-amber-800' :
                          row.daysInStock > 30 ? 'bg-blue-100 text-blue-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {row.daysInStock} d
                        </span>
                      </td>
                    )}

                    {visibleColumns.aging_status !== false && (
                      <td className="py-3 px-3 text-center">
                        {row.agingBucket === '0_30' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Fresh Stock
                          </span>
                        )}
                        {row.agingBucket === '31_60' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                            31-60d Normal
                          </span>
                        )}
                        {row.agingBucket === '61_90' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                            Slow Moving
                          </span>
                        )}
                        {row.agingBucket === '90_plus' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                            90+ Dead Stock
                          </span>
                        )}
                      </td>
                    )}

                    {visibleColumns.recommended_action !== false && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">
                            {row.suggestedAction}
                          </span>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
