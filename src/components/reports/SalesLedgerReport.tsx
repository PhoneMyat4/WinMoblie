import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  DollarSign, 
  TrendingUp, 
  Search, 
  Download, 
  CreditCard, 
  Calendar, 
  Eye, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Tag, 
  Percent, 
  X,
  FileText,
  BarChart2
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar 
} from 'recharts';
import { Sale, ShopSettings } from '../../types';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { formatCurrency, formatDateTime, getPaymentMethodInfo, formatSalePaymentBreakdown } from '../../utils/formatters';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';

const SALES_LEDGER_COLUMNS: ColumnDefinition[] = [
  { id: 'invoice_date', label: 'Invoice # & Date', required: true },
  { id: 'customer', label: 'Customer Details' },
  { id: 'items', label: 'Purchased Items' },
  { id: 'payment_method', label: 'Payment Method' },
  { id: 'subtotal', label: 'Subtotal' },
  { id: 'discount', label: 'Discount' },
  { id: 'grand_total', label: 'Grand Total' },
  { id: 'status', label: 'Status' },
  { id: 'action', label: 'Action' },
];

interface SalesLedgerReportProps {
  sales: Sale[];
  settings: ShopSettings;
  timeframeLabel: string;
  onViewInvoice?: (sale: Sale) => void;
}

export const SalesLedgerReport: React.FC<SalesLedgerReportProps> = ({
  sales,
  settings,
  timeframeLabel,
  onViewInvoice,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded' | 'partially_refunded'>('all');
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null);

  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sales_ledger_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      invoice_date: true,
      customer: true,
      items: true,
      payment_method: true,
      subtotal: true,
      discount: true,
      grand_total: true,
      status: true,
      action: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('sales_ledger_visible_columns', JSON.stringify(updated));
    } catch {}
  };

  const activeColumnCount = useMemo(() => {
    return SALES_LEDGER_COLUMNS.filter(c => visibleColumns[c.id] !== false).length;
  }, [visibleColumns]);

  // Available Cashiers/Staff who sold items
  const cashiers = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => {
      if (s.soldBy) set.add(s.soldBy);
    });
    return Array.from(set).sort();
  }, [sales]);

  const [cashierFilter, setCashierFilter] = useState<string>('all');

  // Filtered Sales based on search & options
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (paymentFilter !== 'all' && sale.paymentMethod !== paymentFilter) return false;
      if (statusFilter !== 'all' && sale.status !== statusFilter) return false;
      if (cashierFilter !== 'all' && sale.soldBy !== cashierFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchInvoice = sale.invoiceNumber.toLowerCase().includes(q);
      const matchCustomer = sale.customerName.toLowerCase().includes(q) || sale.customerPhone.includes(q);
      const matchRef = sale.paymentDetails?.transactionRef?.toLowerCase().includes(q);
      const matchItem = sale.items.some(item => 
        item.name.toLowerCase().includes(q) || 
        (item.imei && item.imei.includes(q))
      );

      return matchInvoice || matchCustomer || matchRef || matchItem;
    });
  }, [sales, paymentFilter, statusFilter, cashierFilter, searchQuery]);

  // Executive Financial Metrics
  const stats = useMemo(() => {
    let grossSubtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let grandTotalCompleted = 0;
    let totalCostOfGoods = 0;
    let totalRefundedAmount = 0;
    let completedCount = 0;
    let refundedCount = 0;

    sales.forEach((s) => {
      if (s.status === 'completed') {
        completedCount++;
        grossSubtotal += s.subtotal;
        totalDiscount += s.discountTotal;
        totalTax += s.taxTotal;
        grandTotalCompleted += s.grandTotal;
        
        s.items.forEach(item => {
          totalCostOfGoods += (item.costPrice || 0) * item.quantity;
        });
      } else if (s.status === 'refunded') {
        refundedCount++;
        totalRefundedAmount += s.grandTotal;
      }
    });

    const netSales = grandTotalCompleted;
    const realizedProfit = netSales - totalCostOfGoods;
    const profitMarginPercent = netSales > 0 ? (realizedProfit / netSales) * 100 : 0;
    const averageOrderValue = completedCount > 0 ? netSales / completedCount : 0;

    return {
      completedCount,
      refundedCount,
      grossSubtotal,
      totalDiscount,
      totalTax,
      netSales,
      totalCostOfGoods,
      realizedProfit,
      profitMarginPercent,
      totalRefundedAmount,
      averageOrderValue,
    };
  }, [sales]);

  // Daily Trend data for Recharts Area chart
  const dailyTrendData = useMemo(() => {
    const dateMap = new Map<string, { date: string; revenue: number; profit: number; orders: number }>();
    
    // Sort chronological
    const sorted = [...sales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sorted.forEach((sale) => {
      if (sale.status === 'completed') {
        const d = new Date(sale.date);
        const dayKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const existing = dateMap.get(dayKey) || { date: dayKey, revenue: 0, profit: 0, orders: 0 };
        
        let saleCost = 0;
        sale.items.forEach(i => saleCost += (i.costPrice || 0) * i.quantity);

        existing.revenue += sale.grandTotal;
        existing.profit += (sale.grandTotal - saleCost);
        existing.orders += 1;
        dateMap.set(dayKey, existing);
      }
    });

    return Array.from(dateMap.values());
  }, [sales]);

  // Payment methods breakdown
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    sales.forEach((s) => {
      if (s.status === 'completed') {
        const existing = map.get(s.paymentMethod) || { count: 0, total: 0 };
        existing.count += 1;
        existing.total += s.grandTotal;
        map.set(s.paymentMethod, existing);
      }
    });

    return Array.from(map.entries()).map(([method, data]) => ({
      method,
      info: getPaymentMethodInfo(method as any),
      count: data.count,
      total: data.total,
      percent: stats.netSales > 0 ? (data.total / stats.netSales) * 100 : 0,
    }));
  }, [sales, stats.netSales]);

  const getExportData = () => {
    const headers: string[] = [];

    if (visibleColumns.invoice_date !== false) {
      headers.push('Invoice Number', 'Date & Time', 'Sold By (Staff)');
    }
    if (visibleColumns.customer !== false) {
      headers.push('Customer Name', 'Customer Phone');
    }
    if (visibleColumns.items !== false) {
      headers.push('Items Description', 'Total Units Count');
    }
    if (visibleColumns.payment_method !== false) {
      headers.push('Payment Method', 'Payment Breakdown', 'Transaction Reference');
    }
    if (visibleColumns.subtotal !== false) {
      headers.push(`Subtotal (${settings.currencySymbol})`);
    }
    if (visibleColumns.discount !== false) {
      headers.push(`Discount (${settings.currencySymbol})`);
    }
    if (visibleColumns.grand_total !== false) {
      headers.push(`Grand Total (${settings.currencySymbol})`);
    }
    if (visibleColumns.status !== false) {
      headers.push('Status');
    }

    const rows = filteredSales.map((s) => {
      const row: (string | number)[] = [];

      if (visibleColumns.invoice_date !== false) {
        row.push(s.invoiceNumber, formatDateTime(s.date), s.soldBy);
      }
      if (visibleColumns.customer !== false) {
        row.push(s.customerName, s.customerPhone);
      }
      if (visibleColumns.items !== false) {
        row.push(
          s.items.map(i => `${i.name} (x${i.quantity})`).join('; '),
          s.items.reduce((acc, i) => acc + i.quantity, 0)
        );
      }
      if (visibleColumns.payment_method !== false) {
        row.push(
          (s.paymentMethod || 'cash').toUpperCase(),
          s.paymentMethod === 'split' ? formatSalePaymentBreakdown(s, settings.currencySymbol) : '-',
          s.paymentDetails?.transactionRef || '-'
        );
      }
      if (visibleColumns.subtotal !== false) {
        row.push(s.subtotal);
      }
      if (visibleColumns.discount !== false) {
        row.push(s.discountTotal);
      }
      if (visibleColumns.grand_total !== false) {
        row.push(s.grandTotal);
      }
      if (visibleColumns.status !== false) {
        row.push((s.status || 'completed').toUpperCase());
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    exportToCsv(`Sales_Ledger_${timeframeLabel.replace(/\s+/g, '_')}`, headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    exportReportToPdf({
      title: 'Sales Transaction & Audit Ledger Report',
      subtitle: `Complete sales audit, item breakdown, payment methods, and net revenue`,
      timeframeLabel,
      filename: `Sales_Ledger_${timeframeLabel.replace(/\s+/g, '_')}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Net Sales Revenue', value: formatCurrency(stats.netSales, settings.currencySymbol) },
        { label: 'Completed Sales', value: `${stats.completedCount} Invoices` },
        { label: 'Realized Profit', value: formatCurrency(stats.realizedProfit, settings.currencySymbol) },
        { label: 'Average Order Value', value: formatCurrency(stats.averageOrderValue, settings.currencySymbol) },
      ],
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Executive Financial Ledger Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Net Sales Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(stats.netSales, settings.currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {stats.completedCount} Completed Invoices • Avg: {formatCurrency(stats.averageOrderValue, settings.currencySymbol)}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Realized Gross Profit</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-purple-700 tracking-tight">
              {formatCurrency(stats.realizedProfit, settings.currencySymbol)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-emerald-600">
              <Percent className="w-3.5 h-3.5" />
              <span>{stats.profitMarginPercent.toFixed(1)}% Realized Gross Margin</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cost of Goods Sold (COGS)</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(stats.totalCostOfGoods, settings.currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Discounts Given: {formatCurrency(stats.totalDiscount, settings.currencySymbol)}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Refunds & Returns</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {formatCurrency(stats.totalRefundedAmount, settings.currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {stats.refundedCount} Refunded Transaction{stats.refundedCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

      </div>

      {/* Visual Revenue & Daily Trend + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sales & Profit Timeline Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-emerald-600" />
                Sales & Profit Realization Timeline ({timeframeLabel})
              </h3>
              <p className="text-xs text-slate-500">Chronological daily cash flow and profit spikes</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500" />
                Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-purple-500" />
                Profit
              </span>
            </div>
          </div>

          <div className="h-56 w-full">
            {dailyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrendData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(val: any, name: any) => [
                      formatCurrency(Number(val), settings.currencySymbol), 
                      name === 'revenue' ? 'Sales Revenue' : 'Gross Profit'
                    ]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                  <Area type="monotone" dataKey="profit" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No chronological sales in this timeframe.
              </div>
            )}
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Payment Channel Mix
            </h3>
            <p className="text-xs text-slate-500">Collected amounts by payment gateway</p>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-60 pr-1">
            {paymentBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No payments recorded</p>
            ) : (
              paymentBreakdown.map((item) => (
                <div key={item.method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-slate-800">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.info.badgeBg} ${item.info.badgeText}`}>
                        {item.info.shortLabel}
                      </span>
                      <span>({item.count} orders)</span>
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(item.total, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, item.percent)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Control Bar: Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice #, customer name, phone, item, IMEI..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Filters and Export */}
        <div className="flex flex-wrap items-center gap-2">
          
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Payment Methods</option>
            <option value="cash">Cash (ကျပ်)</option>
            <option value="kpay">KBZPay (KPay)</option>
            <option value="wave">WavePay</option>
            <option value="yoma">Yoma Bank</option>
            <option value="kbz">KBZ Bank / iBanking</option>
            <option value="aya">AYA Pay / Bank</option>
            <option value="cb">CB Pay / Bank</option>
            <option value="split">Split Multi-Payment</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed Sales</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="refunded">Fully Refunded</option>
          </select>

          <select
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Cashiers / Staff</option>
            {cashiers.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Export to PDF document"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>

        </div>

      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Sales Transaction Ledger ({filteredSales.length} Invoices)
            </h3>
            <p className="text-xs text-slate-500">Every sale transaction, item list, payment route, and audit status</p>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap">
            <div className="text-xs text-slate-400 font-semibold hidden md:block">
              Timeframe: <span className="text-slate-800 font-bold">{timeframeLabel}</span>
            </div>
            <ColumnVisibilityFilter
              columns={SALES_LEDGER_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              onReset={() => handleColumnChange({
                invoice_date: true,
                customer: true,
                items: true,
                payment_method: true,
                subtotal: true,
                discount: true,
                grand_total: true,
                status: true,
                action: true,
              })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 text-slate-700 uppercase font-extrabold text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                {visibleColumns.invoice_date !== false && <th className="py-3 px-4">Invoice # & Date</th>}
                {visibleColumns.customer !== false && <th className="py-3 px-4">Customer Details</th>}
                {visibleColumns.items !== false && <th className="py-3 px-4">Purchased Items</th>}
                {visibleColumns.payment_method !== false && <th className="py-3 px-4">Payment Method</th>}
                {visibleColumns.subtotal !== false && <th className="py-3 px-4 text-right">Subtotal</th>}
                {visibleColumns.discount !== false && <th className="py-3 px-4 text-right">Discount</th>}
                {visibleColumns.grand_total !== false && <th className="py-3 px-4 text-right">Grand Total</th>}
                {visibleColumns.status !== false && <th className="py-3 px-4 text-center">Status</th>}
                {visibleColumns.action !== false && <th className="py-3 px-4 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={activeColumnCount || 9} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No sales matching the filter found in this period.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const payInfo = getPaymentMethodInfo(sale.paymentMethod);
                  const isRefunded = sale.status === 'refunded';
                  const totalUnits = sale.items.reduce((acc, i) => acc + i.quantity, 0);

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Invoice & Date */}
                      {visibleColumns.invoice_date !== false && (
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900">{sale.invoiceNumber}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(sale.date)}</div>
                          <div className="text-[10px] text-slate-500 font-semibold">By: {sale.soldBy}</div>
                        </td>
                      )}

                      {/* Customer */}
                      {visibleColumns.customer !== false && (
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{sale.customerName}</div>
                          <div className="text-[11px] text-slate-500">{sale.customerPhone}</div>
                        </td>
                      )}

                      {/* Items */}
                      {visibleColumns.items !== false && (
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-semibold text-slate-800 truncate">
                            {sale.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {totalUnits} item{totalUnits > 1 ? 's' : ''}
                          </div>
                        </td>
                      )}

                      {/* Payment */}
                      {visibleColumns.payment_method !== false && (
                        <td className="py-3.5 px-4">
                          {sale.paymentMethod === 'split' ? (
                            <div className="space-y-0.5">
                              <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${payInfo.badgeBg} ${payInfo.badgeText}`}>
                                {payInfo.label}
                              </span>
                              <div className="text-[10px] font-bold text-purple-900 font-mono">
                                {formatSalePaymentBreakdown(sale, settings.currencySymbol)}
                              </div>
                            </div>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${payInfo.badgeBg} ${payInfo.badgeText}`}>
                              {payInfo.label}
                            </span>
                          )}
                          {sale.paymentDetails?.transactionRef && (
                            <div className="font-mono text-[10px] text-slate-500 mt-0.5 truncate max-w-[120px]">
                              Ref: {sale.paymentDetails.transactionRef}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Subtotal */}
                      {visibleColumns.subtotal !== false && (
                        <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                          {formatCurrency(sale.subtotal, settings.currencySymbol)}
                        </td>
                      )}

                      {/* Discount */}
                      {visibleColumns.discount !== false && (
                        <td className="py-3.5 px-4 text-right font-medium text-amber-600">
                          {sale.discountTotal > 0 ? `-${formatCurrency(sale.discountTotal, settings.currencySymbol)}` : '-'}
                        </td>
                      )}

                      {/* Grand Total */}
                      {visibleColumns.grand_total !== false && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-black text-sm text-slate-900">
                            {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                          </div>
                        </td>
                      )}

                      {/* Status */}
                      {visibleColumns.status !== false && (
                        <td className="py-3.5 px-4 text-center">
                          {sale.status === 'refunded' ? (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                              Refunded
                            </span>
                          ) : sale.status === 'partially_refunded' ? (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200">
                              Partial Return
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                              Completed
                            </span>
                          )}
                        </td>
                      )}

                      {/* Action */}
                      {visibleColumns.action !== false && (
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedSaleDetail(sale)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="View sale detail breakdown"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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

      {/* Sale Detail Breakdown Drawer / Modal */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-black text-slate-900">Invoice #{selectedSaleDetail.invoiceNumber}</h4>
                <p className="text-xs text-slate-500">{formatDateTime(selectedSaleDetail.date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaleDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              
              {/* Customer & Staff Info */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 font-bold">Customer</span>
                  <div className="font-bold text-slate-900">{selectedSaleDetail.customerName}</div>
                  <div className="text-slate-500">{selectedSaleDetail.customerPhone}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">Cashier / Sold By</span>
                  <div className="font-bold text-slate-900">{selectedSaleDetail.soldBy}</div>
                  <div className="text-slate-700 font-semibold mt-0.5">
                    Payment: <span className="font-bold text-slate-900">{formatSalePaymentBreakdown(selectedSaleDetail, settings.currencySymbol)}</span>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">Purchased Items:</span>
                {selectedSaleDetail.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100">
                    <div>
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="text-[11px] text-slate-500">
                        Qty: {item.quantity} × {formatCurrency(item.unitPrice, settings.currencySymbol)}
                        {item.imei && <span className="ml-2 font-mono text-purple-700">IMEI: {item.imei}</span>}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 text-right">
                      {formatCurrency(item.finalPrice, settings.currencySymbol)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(selectedSaleDetail.subtotal, settings.currencySymbol)}</span>
                </div>
                {selectedSaleDetail.discountTotal > 0 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Discount:</span>
                    <span>-{formatCurrency(selectedSaleDetail.discountTotal, settings.currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span>{formatCurrency(selectedSaleDetail.grandTotal, settings.currencySymbol)}</span>
                </div>
              </div>

            </div>

            <div className="pt-3 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedSaleDetail(null)}
                className="flex-1 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
