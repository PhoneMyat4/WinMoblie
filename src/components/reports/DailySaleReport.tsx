import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  DollarSign, 
  Receipt, 
  TrendingUp, 
  Tag, 
  Download, 
  Printer, 
  CheckCircle2, 
  RotateCcw, 
  ShoppingBag, 
  CreditCard, 
  Clock, 
  ArrowUpRight, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Smartphone,
  PieChart as PieIcon,
  Layers,
  Percent,
  Search
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Sale, ShopSettings, PaymentMethod } from '../../types';
import { formatCurrency, formatDateTime, getPaymentMethodInfo, getCategoryLabel } from '../../utils/formatters';
import { canonicalCategory } from '../../data/categoryTaxonomy';
import { exportReportToPdf } from '../../utils/pdfExportUtils';

interface DailySaleReportProps {
  sales: Sale[];
  settings: ShopSettings;
  initialDate?: string;
  onViewInvoice?: (sale: Sale) => void;
  hideHeaderCard?: boolean;
}

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10B981', // emerald
  kpay: '#3B82F6', // blue
  wave: '#EAB308', // amber
  kbz: '#6366F1',  // indigo
  aya: '#EF4444',  // red
  cb: '#EC4899',   // pink
  yoma: '#8B5CF6', // purple
  split: '#14B8A6',// teal
};

const CATEGORY_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316'];

export const DailySaleReport: React.FC<DailySaleReportProps> = ({
  sales,
  settings,
  initialDate,
  onViewInvoice,
  hideHeaderCard = false,
}) => {
  // Selected single date (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate) return initialDate;
    return new Date().toISOString().slice(0, 10);
  });

  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Human-readable formatted date title
  const formattedSelectedDate = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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

  // Is today?
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  // Filter sales for the selected single day
  const dailySales = useMemo(() => {
    return sales.filter((s) => s.date.startsWith(selectedDate));
  }, [sales, selectedDate]);

  // Apply sub-filters (payment, status, search)
  const filteredDailySales = useMemo(() => {
    return dailySales.filter((sale) => {
      const matchesSearch = 
        !searchQuery ||
        sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sale.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sale.customerPhone && sale.customerPhone.includes(searchQuery)) ||
        sale.items.some(i => 
          i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (i.imei && i.imei.includes(searchQuery))
        );

      const matchesPayment = paymentFilter === 'all' || sale.paymentMethod === paymentFilter;
      const matchesStatus = statusFilter === 'all' || sale.status === statusFilter;

      return matchesSearch && matchesPayment && matchesStatus;
    });
  }, [dailySales, searchQuery, paymentFilter, statusFilter]);

  // Key KPI metrics for the selected day
  const metrics = useMemo(() => {
    const completedSales = dailySales.filter(s => s.status === 'completed');
    const refundedSales = dailySales.filter(s => s.status === 'refunded');

    const totalGrossRevenue = completedSales.reduce((acc, s) => acc + s.grandTotal, 0);
    const totalDiscounts = completedSales.reduce((acc, s) => acc + (s.discountTotal || 0), 0);
    const totalRefundsAmount = refundedSales.reduce((acc, s) => acc + s.grandTotal, 0);

    // Units sold and product cost
    let totalUnitsSold = 0;
    let totalCogs = 0;
    const categoryBreakdown: Record<string, { revenue: number; units: number; name: string }> = {};
    const paymentBreakdown: Record<string, number> = {};
    const hourlyDistribution: Record<number, { hour: string; sales: number; count: number }> = {};

    // Initialize 24-hr or open shop hours (8 AM to 10 PM)
    for (let h = 8; h <= 21; h++) {
      const hourLabel = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
      hourlyDistribution[h] = { hour: hourLabel, sales: 0, count: 0 };
    }

    completedSales.forEach((sale) => {
      // Payment method breakdown
      paymentBreakdown[sale.paymentMethod] = (paymentBreakdown[sale.paymentMethod] || 0) + sale.grandTotal;

      // Hourly breakdown
      try {
        const d = new Date(sale.date);
        const hr = d.getHours();
        if (hourlyDistribution[hr]) {
          hourlyDistribution[hr].sales += sale.grandTotal;
          hourlyDistribution[hr].count += 1;
        } else {
          hourlyDistribution[hr] = { 
            hour: `${hr > 12 ? hr - 12 : hr} ${hr >= 12 ? 'PM' : 'AM'}`, 
            sales: sale.grandTotal, 
            count: 1 
          };
        }
      } catch {}

      // Items & category analysis
      sale.items.forEach((item) => {
        totalUnitsSold += item.quantity;
        const itemCost = item.costPrice ? item.costPrice * item.quantity : 0;
        totalCogs += itemCost;

        const catKey = canonicalCategory(item.category);
        if (!categoryBreakdown[catKey]) {
          categoryBreakdown[catKey] = {
            revenue: 0,
            units: 0,
            name: getCategoryLabel(catKey),
          };
        }
        categoryBreakdown[catKey].revenue += (item.finalPrice || (item.unitPrice * item.quantity));
        categoryBreakdown[catKey].units += item.quantity;
      });
    });

    const netProfit = totalGrossRevenue - totalCogs;
    const profitMargin = totalGrossRevenue > 0 ? (netProfit / totalGrossRevenue) * 100 : 0;
    const averageOrderValue = completedSales.length > 0 ? totalGrossRevenue / completedSales.length : 0;

    const hourlyChartData = Object.keys(hourlyDistribution)
      .map(k => parseInt(k))
      .sort((a, b) => a - b)
      .map(h => hourlyDistribution[h]);

    const categoryChartData = Object.keys(categoryBreakdown).map((k, idx) => ({
      key: k,
      name: categoryBreakdown[k].name,
      revenue: categoryBreakdown[k].revenue,
      units: categoryBreakdown[k].units,
      color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
    }));

    const paymentChartData = Object.keys(paymentBreakdown).map((k) => ({
      method: k,
      name: getPaymentMethodInfo(k as PaymentMethod).label,
      amount: paymentBreakdown[k],
      color: PAYMENT_COLORS[k] || '#64748B',
    }));

    return {
      completedCount: completedSales.length,
      refundedCount: refundedSales.length,
      totalGrossRevenue,
      totalDiscounts,
      totalRefundsAmount,
      totalUnitsSold,
      totalCogs,
      netProfit,
      profitMargin,
      averageOrderValue,
      hourlyChartData,
      categoryChartData,
      paymentChartData,
    };
  }, [dailySales]);

  // Export Daily Sale Report to PDF
  const handleExportPdf = () => {
    const headers = [
      'Invoice #',
      'Time',
      'Customer',
      'Items & IMEI',
      'Payment',
      'Cashier',
      'Discount',
      'Grand Total',
      'Status'
    ];

    const rows = filteredDailySales.map((s) => [
      s.invoiceNumber,
      formatDateTime(s.date).split(' ')[1] || formatDateTime(s.date),
      `${s.customerName}${s.customerPhone ? ' (' + s.customerPhone + ')' : ''}`,
      s.items.map(i => `${i.name} (x${i.quantity})${i.imei ? ' [' + i.imei + ']' : ''}`).join(', '),
      getPaymentMethodInfo(s.paymentMethod).label,
      s.soldBy || 'Admin',
      s.discountTotal ? `${s.discountTotal.toLocaleString()} ${settings.currencySymbol}` : '-',
      `${s.grandTotal.toLocaleString()} ${settings.currencySymbol}`,
      (s.status || 'completed').toUpperCase(),
    ]);

    exportReportToPdf({
      title: `Daily Sales Audit Report - ${selectedDate}`,
      subtitle: `${formattedSelectedDate} • Official Daily Settlement`,
      filename: `Daily_Sales_Report_${selectedDate}.pdf`,
      headers,
      rows,
      settings,
      timeframeLabel: formattedSelectedDate,
      summaryMetrics: [
        { label: 'Date', value: selectedDate },
        { label: 'Total Revenue', value: formatCurrency(metrics.totalGrossRevenue, settings.currencySymbol) },
        { label: 'Completed Invoices', value: metrics.completedCount },
        { label: 'Units Sold', value: metrics.totalUnitsSold },
        { label: 'Estimated Profit', value: formatCurrency(metrics.netProfit, settings.currencySymbol) },
        { label: 'Avg Order Value', value: formatCurrency(metrics.averageOrderValue, settings.currencySymbol) },
      ],
      orientation: 'landscape',
    });
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Invoice No', 'Date & Time', 'Customer Name', 'Phone', 'Payment Method', 'Items Count', 'Subtotal', 'Discount', 'Grand Total', 'Status', 'Cashier'];
    const rows = filteredDailySales.map(s => [
      s.invoiceNumber,
      `"${formatDateTime(s.date)}"`,
      `"${s.customerName}"`,
      s.customerPhone || '',
      (s.paymentMethod || 'cash').toUpperCase(),
      s.items.reduce((sum, i) => sum + i.quantity, 0),
      s.subtotal,
      s.discountTotal || 0,
      s.grandTotal,
      (s.status || 'completed').toUpperCase(),
      `"${s.soldBy}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daily_Sales_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="daily-sale-report-container" className="space-y-6">
      
      {/* Date Picker & Selector Header Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Left: Date Selection Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleShiftDate(-1)}
                title="Previous Day"
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-2.5 py-1 bg-white rounded-xl shadow-2xs border border-slate-200/60">
                <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs sm:text-sm font-black text-slate-900 bg-transparent focus:outline-hidden cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() => handleShiftDate(1)}
                title="Next Day"
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick shortcuts: Today & Yesterday */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSetToday}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isToday
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleSetYesterday}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
              >
                Yesterday
              </button>
            </div>
          </div>

          {/* Right: Date Title Banner & Export Buttons */}
          <div className="flex items-center flex-wrap gap-2.5 justify-between lg:justify-end">
            <div className="text-left lg:text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Selected Daily Settlement</span>
              <h2 className="text-sm sm:text-base font-black text-slate-900">{formattedSelectedDate}</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* 4 Main Summary KPI Cards for Selected Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Gross Sales Revenue */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Daily Sales Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">
            {formatCurrency(metrics.totalGrossRevenue, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{metrics.completedCount} Completed sales</span>
            {metrics.totalDiscounts > 0 && (
              <span className="text-purple-600 font-bold">
                -{formatCurrency(metrics.totalDiscounts, settings.currencySymbol)} disc
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Units Sold & Transactions */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Units Sold & Volume</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-blue-600">
            {metrics.totalUnitsSold} <span className="text-base font-bold text-slate-500">units</span>
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>Avg {metrics.completedCount > 0 ? (metrics.totalUnitsSold / metrics.completedCount).toFixed(1) : 0} items/ticket</span>
            <span className="font-mono font-bold text-slate-700">
              AOV: {formatCurrency(metrics.averageOrderValue, settings.currencySymbol)}
            </span>
          </div>
        </div>

        {/* Card 3: Estimated Gross Profit & Margin */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Estimated Gross Profit</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-600">
            {formatCurrency(metrics.netProfit, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>Margin: <strong className="text-emerald-600">{metrics.profitMargin.toFixed(1)}%</strong></span>
            <span>COGS: {formatCurrency(metrics.totalCogs, settings.currencySymbol)}</span>
          </div>
        </div>

        {/* Card 4: Refunds & Reversals */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
            <span>Refunds & Returns</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600">
            {formatCurrency(metrics.totalRefundsAmount, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{metrics.refundedCount} Refunded tickets</span>
            <span className="text-emerald-600 font-bold">
              {metrics.completedCount > 0 ? ((metrics.refundedCount / (metrics.completedCount + metrics.refundedCount)) * 100).toFixed(1) : 0}% return rate
            </span>
          </div>
        </div>

      </div>

      {/* Visual Analytics: Hourly Traffic Heatmap & Payment Channel Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Hourly Sales Distribution Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Hourly Sales Velocity ({formattedSelectedDate})
              </h3>
              <p className="text-xs text-slate-400">Peak customer traffic & transaction timing for this date</p>
            </div>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg font-mono">
              8:00 AM - 10:00 PM
            </span>
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailySalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#64748B' }} 
                  axisLine={false} 
                  tickLine={false}
                  tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val} 
                />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(Number(value) || 0, settings.currencySymbol), 'Sales']}
                  contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#dailySalesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Channels Breakdown */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Payment Channels Mix
            </h3>
            <p className="text-xs text-slate-400">Cash vs Mobile Banking (KPay/Wave/Banks)</p>
          </div>

          <div className="space-y-2.5 py-2">
            {metrics.paymentChartData.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No payment transactions recorded for this date.
              </div>
            ) : (
              metrics.paymentChartData.map((item) => {
                const percent = metrics.totalGrossRevenue > 0 ? (item.amount / metrics.totalGrossRevenue) * 100 : 0;
                return (
                  <div key={item.method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </span>
                      <span className="font-mono text-slate-900 font-bold">
                        {formatCurrency(item.amount, settings.currencySymbol)}
                        <span className="text-[10px] text-slate-400 ml-1">({percent.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all" 
                        style={{ width: `${percent}%`, backgroundColor: item.color }} 
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Total Daily Settlements</span>
            <strong className="text-slate-900 font-black">{formatCurrency(metrics.totalGrossRevenue, settings.currencySymbol)}</strong>
          </div>
        </div>

      </div>

      {/* Category Performance Breakdown for the Day */}
      {metrics.categoryChartData.length > 0 && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            Category Sales Distribution ({formattedSelectedDate})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {metrics.categoryChartData.map((cat) => {
              const catPercent = metrics.totalGrossRevenue > 0 ? (cat.revenue / metrics.totalGrossRevenue) * 100 : 0;
              return (
                <div key={cat.key} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-xs font-bold text-slate-800 truncate">{cat.name}</span>
                  </div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {formatCurrency(cat.revenue, settings.currencySymbol)}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                    <span>{cat.units} sold</span>
                    <span className="font-bold text-indigo-600">{catPercent.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Invoices & Transaction Audit Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
        
        {/* Table Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search daily invoice #, customer, phone, or IMEI..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="all">All Payment Channels</option>
              <option value="cash">Cash</option>
              <option value="kpay">KBZPay (KPay)</option>
              <option value="wave">WavePay</option>
              <option value="kbz">KBZ Bank</option>
              <option value="aya">AYA Bank</option>
              <option value="cb">CB Bank</option>
              <option value="yoma">Yoma Bank</option>
              <option value="split">Split Multi-Payment</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="refunded">Refunded</option>
            </select>

            <span className="text-xs font-mono font-bold text-slate-500 px-2">
              {filteredDailySales.length} Invoices
            </span>
          </div>

        </div>

        {/* Invoices Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Purchased Items & IMEIs</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                {onViewInvoice && <th className="py-3 px-4 text-center">Voucher</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDailySales.length === 0 ? (
                <tr>
                  <td colSpan={onViewInvoice ? 9 : 8} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">No sales recorded on {selectedDate}.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Use the date selector above to jump to another date.</p>
                  </td>
                </tr>
              ) : (
                filteredDailySales.map((sale) => {
                  const payInfo = getPaymentMethodInfo(sale.paymentMethod);
                  const isRefunded = sale.status === 'refunded';
                  const timeOnly = formatDateTime(sale.date).split(' ')[1] || formatDateTime(sale.date);

                  return (
                    <tr key={sale.id} className={`hover:bg-slate-50/80 transition-colors ${isRefunded ? 'opacity-70 bg-rose-50/20' : ''}`}>
                      
                      <td className="py-3 px-4">
                        {onViewInvoice ? (
                          <button
                            type="button"
                            onClick={() => onViewInvoice(sale)}
                            className="group inline-flex items-center gap-1.5 font-mono font-bold text-indigo-600 hover:text-indigo-900 bg-indigo-50/70 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200/60 transition-all cursor-pointer text-left shadow-2xs hover:shadow-xs"
                            title="Click to view voucher"
                          >
                            <Printer className="w-3.5 h-3.5 text-indigo-500 group-hover:text-indigo-700 transition-transform group-hover:scale-110 shrink-0" />
                            <span>{sale.invoiceNumber}</span>
                          </button>
                        ) : (
                          <span className="font-mono font-bold text-slate-800">{sale.invoiceNumber}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-mono font-semibold">
                        {timeOnly}
                      </td>

                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{sale.customerName}</p>
                        {sale.customerPhone && (
                          <p className="text-[10px] text-slate-400 font-mono">{sale.customerPhone}</p>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5 max-w-xs">
                          {sale.items.map((item, idx) => (
                            <div key={idx} className="text-slate-800">
                              <span className="font-semibold">{item.name}</span> (x{item.quantity})
                              {item.imei && (
                                <span className="block text-[10px] text-blue-700 font-mono">
                                  IMEI: {item.imei}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                          {payInfo.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {sale.soldBy || 'Admin'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isRefunded ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {sale.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-black font-mono text-slate-900">
                        <span className={isRefunded ? 'line-through text-slate-400' : ''}>
                          {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                        </span>
                      </td>

                      {onViewInvoice && (
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(sale)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Voucher</span>
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

    </div>
  );
};
