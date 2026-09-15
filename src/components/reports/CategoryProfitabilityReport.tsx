import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Layers, 
  PieChart, 
  Download, 
  Printer, 
  ChevronRight, 
  Sparkles, 
  ArrowUpRight,
  PackageCheck,
  Percent,
  FileText
} from 'lucide-react';
import { Product, Sale, ShopSettings } from '../../types';
import { calculateCategoryProfitability, CategoryProfitabilityRow } from '../../utils/serializedUtils';
import { formatCurrency } from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';

const CATEGORY_PROFIT_COLUMNS: ColumnDefinition[] = [
  { id: 'category', label: 'Category', required: true },
  { id: 'units_sold', label: 'Units Sold' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'revenue', label: 'Total Revenue' },
  { id: 'cogs', label: 'Total COGS' },
  { id: 'gross_profit', label: 'Gross Profit' },
  { id: 'margin_percent', label: 'Margin %' },
  { id: 'profit_contribution', label: 'Profit Contribution' },
];

interface CategoryProfitabilityReportProps {
  sales: Sale[];
  products: Product[];
  settings: ShopSettings;
  timeframeLabel: string;
}

export const CategoryProfitabilityReport: React.FC<CategoryProfitabilityReportProps> = ({
  sales,
  products,
  settings,
  timeframeLabel,
}) => {
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('cat_profit_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      category: true,
      units_sold: true,
      invoices: true,
      revenue: true,
      cogs: true,
      gross_profit: true,
      margin_percent: true,
      profit_contribution: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('cat_profit_visible_columns', JSON.stringify(updated));
    } catch {}
  };

  const activeColumnCount = useMemo(() => {
    return CATEGORY_PROFIT_COLUMNS.filter(c => visibleColumns[c.id] !== false).length;
  }, [visibleColumns]);

  const profitabilityData = useMemo(() => {
    return calculateCategoryProfitability(sales, products);
  }, [sales, products]);

  const getExportData = () => {
    const headers: string[] = [];

    if (visibleColumns.category !== false) {
      headers.push('Category');
    }
    if (visibleColumns.units_sold !== false) {
      headers.push('Units Sold');
    }
    if (visibleColumns.invoices !== false) {
      headers.push('Invoices Count');
    }
    if (visibleColumns.revenue !== false) {
      headers.push(`Total Sales Revenue (${settings.currencySymbol})`);
    }
    if (visibleColumns.cogs !== false) {
      headers.push(`Total COGS (${settings.currencySymbol})`);
    }
    if (visibleColumns.gross_profit !== false) {
      headers.push(`Gross Profit (${settings.currencySymbol})`);
    }
    if (visibleColumns.margin_percent !== false) {
      headers.push('Gross Margin %');
    }
    if (visibleColumns.profit_contribution !== false) {
      headers.push('Profit Contribution %', 'Revenue Contribution %');
    }

    const rows = profitabilityData.rows.map(r => {
      const row: (string | number)[] = [];

      if (visibleColumns.category !== false) {
        row.push(r.categoryLabel);
      }
      if (visibleColumns.units_sold !== false) {
        row.push(r.totalUnitsSold);
      }
      if (visibleColumns.invoices !== false) {
        row.push(r.invoicesCount);
      }
      if (visibleColumns.revenue !== false) {
        row.push(r.totalSalesRevenue);
      }
      if (visibleColumns.cogs !== false) {
        row.push(r.totalCogs);
      }
      if (visibleColumns.gross_profit !== false) {
        row.push(r.grossProfit);
      }
      if (visibleColumns.margin_percent !== false) {
        row.push(`${r.grossMarginPercent.toFixed(2)}%`);
      }
      if (visibleColumns.profit_contribution !== false) {
        row.push(`${r.profitContributionPercent.toFixed(2)}%`, `${r.revenueContributionPercent.toFixed(2)}%`);
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    exportToCsv('Category_Profitability_Report', headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    exportReportToPdf({
      title: 'Category Profitability & Margin Analysis',
      subtitle: `Sales revenue, cost of goods sold (COGS), gross margins, and profit contribution`,
      timeframeLabel,
      filename: `Category_Profitability_${timeframeLabel.replace(/\s+/g, '_')}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Total Revenue', value: formatCurrency(profitabilityData.totalStoreRevenue, settings.currencySymbol) },
        { label: 'Total COGS', value: formatCurrency(profitabilityData.totalStoreCogs, settings.currencySymbol) },
        { label: 'Gross Profit', value: formatCurrency(profitabilityData.totalStoreGrossProfit, settings.currencySymbol) },
        { label: 'Overall Margin', value: `${profitabilityData.overallGrossMarginPercent.toFixed(1)}%` },
      ],
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & KPI Overview */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  Profitability Margin by Category (Revenue - COGS)
                </h2>
                <p className="text-xs text-slate-500">
                  Performance breakdown for {timeframeLabel}
                </p>
              </div>
            </div>
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

        {/* 4 Key Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Total Sales Revenue
            </span>
            <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
              {formatCurrency(profitabilityData.totalStoreRevenue, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Across {profitabilityData.totalUnitsSold} total units sold
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Cost of Goods Sold (COGS)
            </span>
            <div className="text-base sm:text-lg font-black text-slate-700 mt-0.5">
              {formatCurrency(profitabilityData.totalStoreCogs, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Inventory procurement cost
            </span>
          </div>

          <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200/90">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
              Gross Profit (Net Margin)
            </span>
            <div className="text-base sm:text-lg font-black text-emerald-900 mt-0.5">
              {formatCurrency(profitabilityData.totalStoreGrossProfit, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-emerald-700 font-bold block mt-0.5">
              Revenue minus total COGS
            </span>
          </div>

          <div className="bg-purple-50/80 p-4 rounded-2xl border border-purple-200/90">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">
              Blended Gross Margin %
            </span>
            <div className="text-base sm:text-lg font-black text-purple-900 mt-0.5">
              {profitabilityData.overallGrossMarginPercent.toFixed(1)}%
            </div>
            <span className="text-[11px] text-purple-700 font-bold block mt-0.5">
              Store-wide margin efficiency
            </span>
          </div>

        </div>
      </div>

      {/* Visual Category Comparison Cards & Profit Contribution Spectrum */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
          Category Profit & Margin Contribution Comparison
        </h3>

        <div className="space-y-3">
          {profitabilityData.rows.map(cat => (
            <div key={cat.category} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-900 text-sm">
                    {cat.categoryLabel}
                  </span>
                  <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                    {cat.totalUnitsSold} Units
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Revenue</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(cat.totalSalesRevenue, settings.currencySymbol)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">COGS</span>
                    <span className="font-mono text-slate-600">
                      {formatCurrency(cat.totalCogs, settings.currencySymbol)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-600 block font-bold uppercase">Gross Profit</span>
                    <span className="font-mono font-black text-emerald-700">
                      {formatCurrency(cat.grossProfit, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="bg-white px-2.5 py-1 rounded-xl border border-slate-200 font-mono font-black text-slate-900 text-xs">
                    {cat.grossMarginPercent.toFixed(1)}% Margin
                  </div>
                </div>
              </div>

              {/* Progress Bar of Profit Margin */}
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, cat.grossMarginPercent))}%` }}
                />
              </div>

              {/* Subcategory Pill Breakdown if available */}
              {cat.subCategoryBreakdown && cat.subCategoryBreakdown.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Top Models/Brands:</span>
                  {cat.subCategoryBreakdown.slice(0, 4).map(sub => (
                    <span key={sub.name} className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700 font-medium">
                      {sub.name}: <strong className="text-emerald-700">{sub.marginPercent.toFixed(0)}%</strong> ({formatCurrency(sub.profit, settings.currencySymbol)})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Comprehensive Category Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Category Margin Breakdown Ledger
            </h3>
            <span className="text-xs text-slate-400 font-medium">Formula: Gross Profit = Sales Revenue - COGS</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <ColumnVisibilityFilter
              columns={CATEGORY_PROFIT_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              onReset={() => handleColumnChange({
                category: true,
                units_sold: true,
                invoices: true,
                revenue: true,
                cogs: true,
                gross_profit: true,
                margin_percent: true,
                profit_contribution: true,
              })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                {visibleColumns.category !== false && <th className="py-3 px-4">Category</th>}
                {visibleColumns.units_sold !== false && <th className="py-3 px-3 text-right">Units Sold</th>}
                {visibleColumns.invoices !== false && <th className="py-3 px-3 text-right">Invoices</th>}
                {visibleColumns.revenue !== false && <th className="py-3 px-3 text-right">Total Revenue</th>}
                {visibleColumns.cogs !== false && <th className="py-3 px-3 text-right">Total COGS</th>}
                {visibleColumns.gross_profit !== false && <th className="py-3 px-3 text-right">Gross Profit</th>}
                {visibleColumns.margin_percent !== false && <th className="py-3 px-3 text-right">Margin %</th>}
                {visibleColumns.profit_contribution !== false && <th className="py-3 px-4 text-right">Profit Contribution</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {profitabilityData.rows.map(row => (
                <tr key={row.category} className="hover:bg-slate-50/80 transition-colors">
                  {visibleColumns.category !== false && (
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      {row.categoryLabel}
                    </td>
                  )}
                  {visibleColumns.units_sold !== false && (
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-800">
                      {row.totalUnitsSold}
                    </td>
                  )}
                  {visibleColumns.invoices !== false && (
                    <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                      {row.invoicesCount}
                    </td>
                  )}
                  {visibleColumns.revenue !== false && (
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(row.totalSalesRevenue, settings.currencySymbol)}
                    </td>
                  )}
                  {visibleColumns.cogs !== false && (
                    <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                      {formatCurrency(row.totalCogs, settings.currencySymbol)}
                    </td>
                  )}
                  {visibleColumns.gross_profit !== false && (
                    <td className="py-3.5 px-3 text-right font-mono font-black text-emerald-700">
                      {formatCurrency(row.grossProfit, settings.currencySymbol)}
                    </td>
                  )}
                  {visibleColumns.margin_percent !== false && (
                    <td className="py-3.5 px-3 text-right font-mono font-black text-slate-900">
                      <span className={`px-2 py-0.5 rounded-md ${
                        row.grossMarginPercent >= 20 ? 'bg-emerald-100 text-emerald-800' :
                        row.grossMarginPercent >= 10 ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {row.grossMarginPercent.toFixed(1)}%
                      </span>
                    </td>
                  )}
                  {visibleColumns.profit_contribution !== false && (
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700">
                      {row.profitContributionPercent.toFixed(1)}%
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-xs">
                {visibleColumns.category !== false && <td className="py-3.5 px-4">TOTAL / STORE-WIDE</td>}
                {visibleColumns.units_sold !== false && <td className="py-3.5 px-3 text-right font-mono">{profitabilityData.totalUnitsSold}</td>}
                {visibleColumns.invoices !== false && <td className="py-3.5 px-3 text-right font-mono">-</td>}
                {visibleColumns.revenue !== false && <td className="py-3.5 px-3 text-right font-mono">{formatCurrency(profitabilityData.totalStoreRevenue, settings.currencySymbol)}</td>}
                {visibleColumns.cogs !== false && <td className="py-3.5 px-3 text-right font-mono">{formatCurrency(profitabilityData.totalStoreCogs, settings.currencySymbol)}</td>}
                {visibleColumns.gross_profit !== false && <td className="py-3.5 px-3 text-right font-mono text-emerald-400">{formatCurrency(profitabilityData.totalStoreGrossProfit, settings.currencySymbol)}</td>}
                {visibleColumns.margin_percent !== false && <td className="py-3.5 px-3 text-right font-mono">{profitabilityData.overallGrossMarginPercent.toFixed(1)}%</td>}
                {visibleColumns.profit_contribution !== false && <td className="py-3.5 px-4 text-right font-mono">100.0%</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
};
