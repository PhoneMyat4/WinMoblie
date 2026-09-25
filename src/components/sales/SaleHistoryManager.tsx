import React, { useState } from 'react';
import { 
  Receipt, 
  Search, 
  Calendar, 
  Printer, 
  RotateCcw, 
  Eye, 
  DollarSign, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Filter, 
  CreditCard,
  Smartphone,
  Tag,
  BarChart3,
  List,
  Archive,
  Trash2,
  CheckSquare
} from 'lucide-react';
import { Sale, PaymentMethod, ShopSettings, StaffUser } from '../../types';
import { formatCurrency, formatDate, formatDateTime, getPaymentMethodInfo, formatSalePaymentBreakdown } from '../../utils/formatters';
import { RefundModal } from '../modals/RefundModal';
import { StorageService } from '../../utils/storage';
import { DailySaleReport } from '../reports/DailySaleReport';
import { DataArchiveCleanup } from '../admin/DataArchiveCleanup';

interface SaleHistoryManagerProps {
  sales: Sale[];
  settings: ShopSettings;
  currentUser?: StaffUser;
  onViewInvoice: (sale: Sale) => void;
  onRefundSale?: (saleId: string, reason: string, staffName: string) => void;
  onProcessItemRefund?: (params: {
    saleId: string;
    itemsToRefund: {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      finalPrice: number;
      refundAmount: number;
      imei?: string;
      imei2?: string;
    }[];
    reason: string;
    refundFundingSource?: 'cash_drawer' | 'digital_cash_pool';
    refundMethod: string;
    digitalChannel?: string;
    restockItems: boolean;
    totalRefundAmount: number;
    staffName: string;
    notes?: string;
  }) => void;
  onArchiveSalesComplete?: (deletedSaleIds: string[]) => void;
  onDeleteSale?: (saleId: string, options?: { restockItems?: boolean }) => void;
  onDeleteSales?: (saleIds: string[], options?: { restockItems?: boolean }) => void;
}

export const SaleHistoryManager: React.FC<SaleHistoryManagerProps> = ({
  sales,
  settings,
  currentUser,
  onViewInvoice,
  onRefundSale,
  onProcessItemRefund,
  onArchiveSalesComplete,
  onDeleteSale,
  onDeleteSales,
}) => {
  const [viewMode, setViewMode] = useState<'history' | 'daily_report'>('history');
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom_date'>('all');

  // Deletion and Multi-selection state
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);
  const [restockOnDelete, setRestockOnDelete] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Refund Modal State
  const [refundModalSale, setRefundModalSale] = useState<Sale | null>(null);

  const handleExecuteRefund = (params: {
    saleId: string;
    itemsToRefund: {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      finalPrice: number;
      refundAmount: number;
      imei?: string;
      imei2?: string;
    }[];
    reason: string;
    refundFundingSource?: 'cash_drawer' | 'digital_cash_pool';
    refundMethod: string;
    digitalChannel?: string;
    restockItems: boolean;
    totalRefundAmount: number;
    staffName: string;
    notes?: string;
  }) => {
    if (onProcessItemRefund) {
      onProcessItemRefund(params);
    } else {
      StorageService.processItemRefund(params);
    }
    setRefundModalSale(null);
  };

  const handleToggleSelectSale = (saleId: string) => {
    setSelectedSaleIds(prev => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedSaleIds.size === filteredSales.length && filteredSales.length > 0) {
      setSelectedSaleIds(new Set());
    } else {
      setSelectedSaleIds(new Set(filteredSales.map(s => s.id)));
    }
  };

  const handleConfirmDeleteSingle = () => {
    if (!saleToDelete) return;
    setIsDeleting(true);
    try {
      const invoiceNum = saleToDelete.invoiceNumber;
      if (onDeleteSale) {
        onDeleteSale(saleToDelete.id, { restockItems: restockOnDelete });
      } else {
        StorageService.deleteSale(saleToDelete.id, {
          restockItems: restockOnDelete,
          staffName: currentUser?.name || 'Owner',
        });
      }
      setSelectedSaleIds(prev => {
        const next = new Set(prev);
        next.delete(saleToDelete.id);
        return next;
      });
      showToast(`Invoice #${invoiceNum} successfully deleted from history.`);
      setSaleToDelete(null);
    } catch (err) {
      console.error('Failed to delete sale:', err);
      showToast('Failed to delete sale record.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteBulk = () => {
    const ids = Array.from(selectedSaleIds);
    if (ids.length === 0) return;
    setIsDeleting(true);
    try {
      if (onDeleteSales) {
        onDeleteSales(ids, { restockItems: restockOnDelete });
      } else {
        StorageService.deleteSales(ids, {
          restockItems: restockOnDelete,
          staffName: currentUser?.name || 'Owner',
        });
      }
      showToast(`Successfully deleted ${ids.length} invoice log(s) from history.`);
      setSelectedSaleIds(new Set());
      setShowBulkDeleteModal(false);
    } catch (err) {
      console.error('Failed to batch delete sales:', err);
      showToast('Failed to delete selected records.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const filteredSales = sales.filter((sale) => {
    const matchesSearch = 
      sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sale.customerPhone && sale.customerPhone.includes(searchQuery)) ||
      sale.items.some(i => 
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.imei && i.imei.includes(searchQuery))
      );

    const matchesPayment = paymentFilter === 'all' || sale.paymentMethod === paymentFilter;
    const matchesStatus = statusFilter === 'all' || sale.status === statusFilter;

    let matchesDate = true;
    if (dateFilter === 'today') {
      matchesDate = sale.date.startsWith(todayStr);
    } else if (dateFilter === 'yesterday') {
      matchesDate = sale.date.startsWith(yesterday);
    } else if (dateFilter === 'custom_date') {
      matchesDate = sale.date.startsWith(selectedCustomDate);
    } else if (dateFilter === 'week') {
      const saleDate = new Date(sale.date);
      const diffDays = (now.getTime() - saleDate.getTime()) / (1000 * 3600 * 24);
      matchesDate = diffDays <= 7;
    } else if (dateFilter === 'month') {
      const saleDate = new Date(sale.date);
      matchesDate = saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
    }

    return matchesSearch && matchesPayment && matchesStatus && matchesDate;
  });

  const totalFilteredRevenue = filteredSales
    .filter(s => s.status === 'completed')
    .reduce((acc, s) => acc + s.grandTotal, 0);

  const totalFilteredDiscounts = filteredSales
    .filter(s => s.status === 'completed')
    .reduce((acc, s) => acc + (s.discountTotal || 0), 0);

  const handleExportCsv = () => {
    const headers = ['Invoice No', 'Date', 'Customer Name', 'Phone', 'Payment Method', 'Items Count', 'Subtotal', 'Discount', 'Grand Total', 'Status', 'Sold By'];
    const rows = filteredSales.map(s => [
      s.invoiceNumber,
      formatDateTime(s.date),
      `"${s.customerName}"`,
      s.customerPhone || '',
      (s.paymentMethod || 'cash').toUpperCase(),
      s.items.reduce((sum, i) => sum + i.quantity, 0),
      s.subtotal,
      s.discountTotal,
      s.grandTotal,
      (s.status || 'completed').toUpperCase(),
      `"${s.soldBy}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sales_History_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="sale-history-manager-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Header Mode Switcher & Quick Navigation */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900">Sale History & Settlements</h1>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-lg border border-emerald-200">
              Audit & Reports
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track individual invoice vouchers or inspect comprehensive daily sales reports by date.
          </p>
        </div>

        {/* View Switcher: Transaction History vs Daily Sale Report */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full sm:w-auto justify-center">
            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-4 h-4 text-indigo-600" />
              <span>Invoice History Log</span>
            </button>
            
            <button
              type="button"
              onClick={() => setViewMode('daily_report')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'daily_report'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Daily Sale Report</span>
            </button>
          </div>

          <button
            type="button"
            id="open-archive-data-btn"
            onClick={() => setIsArchiveModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer shadow-2xs"
            title="Archive old sales to Firebase Cloud Storage and purge Firestore records"
          >
            <Archive className="w-4 h-4 text-amber-600" />
            <span>Archive &amp; Cleanup</span>
          </button>
        </div>
      </div>

      {/* Conditionally render Daily Sale Report or Full Invoices Ledger */}
      {viewMode === 'daily_report' ? (
        <DailySaleReport
          sales={sales}
          settings={settings}
          initialDate={selectedCustomDate}
          onViewInvoice={onViewInvoice}
        />
      ) : (
        <>
          {/* Top Banner & KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Filtered Sales Revenue</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-slate-900">
                {formatCurrency(totalFilteredRevenue, settings.currencySymbol)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {filteredSales.filter(s => s.status === 'completed').length} completed invoices
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Total Discounts Given</span>
                <Tag className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-black text-purple-600">
                {formatCurrency(totalFilteredDiscounts, settings.currencySymbol)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Customer loyalty & promo discounts</p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-md flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-300 font-bold uppercase">Export Report</p>
                <h3 className="text-base font-black text-white mt-1">CSV Sales Ledger</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Download current filtered dataset</p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            
            <div className="relative flex-1 w-full lg:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Invoice #, Customer, Phone, Item, or IMEI..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto justify-end">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden"
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
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="refunded">Refunded</option>
              </select>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {(['all', 'today', 'yesterday', 'week', 'month'] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setDateFilter(range)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                      dateFilter === range
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {range}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setDateFilter('custom_date')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    dateFilter === 'custom_date'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>Pick Date</span>
                </button>
              </div>

              {/* Single Custom Date Picker when Pick Date is active */}
              {dateFilter === 'custom_date' && (
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-xl animate-in fade-in">
                  <span className="text-[11px] font-bold text-indigo-900">Date:</span>
                  <input
                    type="date"
                    value={selectedCustomDate}
                    onChange={(e) => setSelectedCustomDate(e.target.value)}
                    className="bg-white border border-indigo-200 text-xs font-bold text-slate-900 rounded-lg px-2 py-0.5 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('daily_report');
                    }}
                    title="Open Daily Sale Report for this date"
                    className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 underline ml-1 cursor-pointer"
                  >
                    View Report &rarr;
                  </button>
                </div>
              )}

            </div>

          </div>

      {/* Bulk Selection Action Banner */}
      {selectedSaleIds.size > 0 && (
        <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 text-white p-4 rounded-2xl border border-rose-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center justify-center text-xs font-black">
              {selectedSaleIds.size}
            </span>
            <div>
              <p className="text-xs font-bold text-white">
                {selectedSaleIds.size} invoice log{selectedSaleIds.size > 1 ? 's' : ''} selected
              </p>
              <p className="text-[11px] text-slate-300">
                You can permanently purge these transaction records from sales history.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setSelectedSaleIds(new Set())}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => {
                const anyCompleted = sales.some(s => selectedSaleIds.has(s.id) && s.status !== 'refunded');
                setRestockOnDelete(anyCompleted);
                setShowBulkDeleteModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedSaleIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Sales Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 bg-slate-50">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-900">Sales Invoices & Transactions</h3>
            <span className="text-xs text-slate-500 font-mono">{filteredSales.length} Transactions</span>
          </div>

          <div className="flex items-center gap-2">
            {filteredSales.filter(s => s.status === 'refunded').length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const refunded = filteredSales.filter(s => s.status === 'refunded');
                  setSelectedSaleIds(new Set(refunded.map(s => s.id)));
                  setRestockOnDelete(false);
                  setShowBulkDeleteModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-all cursor-pointer shadow-2xs"
                title="Delete all refunded test sales in current view"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Refunded Logs ({filteredSales.filter(s => s.status === 'refunded').length})</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredSales.length > 0 && selectedSaleIds.size === filteredSales.length}
                    onChange={handleToggleSelectAll}
                    title="Select / deselect all filtered invoices"
                    className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items & IMEIs</th>
                <th className="py-3 px-4">Payment Channel</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">No sales match your search or filter.</p>
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const payInfo = getPaymentMethodInfo(sale.paymentMethod);
                  const isRefunded = sale.status === 'refunded';

                  return (
                    <tr key={sale.id} className={`hover:bg-slate-50/80 transition-colors ${isRefunded ? 'opacity-75 bg-rose-50/20' : ''} ${selectedSaleIds.has(sale.id) ? 'bg-indigo-50/40' : ''}`}>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedSaleIds.has(sale.id)}
                          onChange={() => handleToggleSelectSale(sale.id)}
                          className="w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onViewInvoice(sale)}
                          className="group inline-flex items-center gap-1.5 font-mono font-bold text-indigo-600 hover:text-indigo-900 bg-indigo-50/70 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200/60 transition-all cursor-pointer text-left shadow-2xs hover:shadow-xs"
                          title="Click to print preview invoice voucher"
                        >
                          <Printer className="w-3.5 h-3.5 text-indigo-500 group-hover:text-indigo-700 transition-transform group-hover:scale-110 shrink-0" />
                          <span>{sale.invoiceNumber}</span>
                        </button>
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {formatDateTime(sale.date)}
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
                        {sale.paymentMethod === 'split' ? (
                          <div className="space-y-0.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                              {payInfo.label}
                            </span>
                            <div className="text-[10px] font-bold text-purple-900 font-mono">
                              {formatSalePaymentBreakdown(sale, settings.currencySymbol)}
                            </div>
                          </div>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                            {payInfo.label}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {sale.soldBy}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isRefunded ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {sale.status}
                        </span>
                        {isRefunded && sale.refundReason && (
                          <span className="block text-[9px] text-rose-600 truncate max-w-[120px] mx-auto mt-0.5">
                            {sale.refundReason}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-black font-mono text-slate-900">
                        <span className={isRefunded ? 'line-through text-slate-400' : ''}>
                          {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(sale)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[11px] font-bold rounded-lg border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                            title="Print Preview & Voucher"
                          >
                            <Printer className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Print Preview</span>
                          </button>

                          {!isRefunded && (
                            <button
                              type="button"
                              onClick={() => setRefundModalSale(sale)}
                              className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold rounded-lg border border-rose-200 transition-colors cursor-pointer"
                              title="Refund Invoice"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setSaleToDelete(sale);
                              setRestockOnDelete(sale.status !== 'refunded');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 text-[11px] font-bold rounded-lg border border-rose-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                            title="Delete this invoice record from history"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Single Sale Delete Confirmation Modal */}
      {saleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black">Delete Sale Invoice Log</h3>
                  <p className="text-xs text-rose-100">Permanently purge invoice record from history</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaleToDelete(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Are you sure you want to permanently delete this sale?</span>
                </div>
                <p className="text-rose-700 leading-relaxed">
                  This will remove <strong>#{saleToDelete.invoiceNumber}</strong> from your sales history and cloud database. This action cannot be undone.
                </p>
              </div>

              {/* Invoice Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Invoice Number:</span>
                  <span className="font-mono font-bold text-slate-900">{saleToDelete.invoiceNumber}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Customer:</span>
                  <span className="font-bold text-slate-900">{saleToDelete.customerName}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Status:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    saleToDelete.status === 'refunded' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {saleToDelete.status}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Date & Time:</span>
                  <span className="font-mono text-slate-700">{formatDateTime(saleToDelete.date)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-700 font-bold">Grand Total:</span>
                  <span className="font-mono font-black text-sm text-slate-900">
                    {formatCurrency(saleToDelete.grandTotal, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              {/* Restock items option if not already refunded */}
              {saleToDelete.status !== 'refunded' && (
                <label className="flex items-start gap-3 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={restockOnDelete}
                    onChange={(e) => setRestockOnDelete(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">Restock items back into product inventory</span>
                    <span className="text-slate-500 text-[11px]">
                      Restores {saleToDelete.items.reduce((s, i) => s + i.quantity, 0)} unit(s) and any registered serial IMEIs back into store stock.
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSaleToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black">Delete Selected Sale Logs</h3>
                  <p className="text-xs text-rose-100">Permanently purge {selectedSaleIds.size} invoice record(s)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Are you sure you want to permanently delete {selectedSaleIds.size} invoice record(s)?</span>
                </div>
                <p className="text-rose-700 leading-relaxed">
                  These records will be removed from your sales history and cloud database.
                </p>
              </div>

              {/* Selected List Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-48 overflow-y-auto space-y-1.5 text-xs">
                <div className="text-[11px] font-bold text-slate-500 uppercase pb-1 border-b border-slate-200">
                  Selected Invoices:
                </div>
                {sales
                  .filter(s => selectedSaleIds.has(s.id))
                  .map(s => (
                    <div key={s.id} className="flex justify-between items-center py-1 border-b border-slate-100 text-slate-700">
                      <span className="font-mono font-bold text-indigo-600">{s.invoiceNumber}</span>
                      <span className="text-slate-500 truncate max-w-[140px]">{s.customerName}</span>
                      <span className="font-mono font-semibold">{formatCurrency(s.grandTotal, settings.currencySymbol)}</span>
                    </div>
                  ))}
              </div>

              {/* Restock items option */}
              {sales.some(s => selectedSaleIds.has(s.id) && s.status !== 'refunded') && (
                <label className="flex items-start gap-3 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={restockOnDelete}
                    onChange={(e) => setRestockOnDelete(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">Restock completed items back into inventory</span>
                    <span className="text-slate-500 text-[11px]">
                      Restores product stock quantities and serial IMEIs for any active completed sales being deleted.
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBulk}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : `Delete ${selectedSaleIds.size} Record(s)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Itemized Return / Refund Modal */}
      <RefundModal
        sale={refundModalSale}
        settings={settings}
        isOpen={Boolean(refundModalSale)}
        onClose={() => setRefundModalSale(null)}
        onProcessRefund={handleExecuteRefund}
      />
        </>
      )}

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold ${
            toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-800'
          }`}>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage.text}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="ml-2 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Data Archiving & Cloud Storage Cleanup Modal */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 sm:p-8 relative">
            <button
              type="button"
              onClick={() => setIsArchiveModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all cursor-pointer z-10"
            >
              ✕
            </button>
            <DataArchiveCleanup
              settings={settings}
              sales={sales}
              onClose={() => setIsArchiveModalOpen(false)}
              onArchiveComplete={(deletedIds) => {
                if (onArchiveSalesComplete) {
                  onArchiveSalesComplete(deletedIds);
                }
              }}
            />
          </div>
        </div>
      )}

    </div>
  );
};
