import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Search, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Printer, 
  FileDown, 
  Plus, 
  User, 
  Phone, 
  ShieldCheck, 
  ShieldAlert, 
  ChevronRight, 
  Smartphone, 
  CreditCard, 
  RefreshCw, 
  Send, 
  Layers, 
  X, 
  Edit3, 
  Check, 
  Sparkles, 
  ArrowUpRight, 
  Building, 
  Trash2, 
  AlertCircle,
  TrendingUp,
  Percent,
  MessageSquare
} from 'lucide-react';
import { 
  CreditSaleRecord, 
  CreditRepaymentRecord, 
  CreditSaleStatus, 
  Customer, 
  ShopSettings, 
  StaffUser, 
  StaffRole, 
  RolePermissions, 
  PaymentMethod 
} from '../../types';
import { formatCurrency, formatDate, formatDateTime, formatImei, getPaymentMethodInfo } from '../../utils/formatters';
import { StorageService } from '../../utils/storage';
import { getEffectiveUserPermissions } from '../../utils/permissionUtils';
import { 
  exportCreditAgreementPdf, 
  exportCreditRepaymentReceiptPdf, 
  exportCreditSalesRegisterPdf 
} from '../../utils/creditPdfExport';
import confetti from 'canvas-confetti';

interface CreditSalesManagerProps {
  settings: ShopSettings;
  customers?: Customer[];
  currentUser?: StaffUser;
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<StaffRole, RolePermissions>;
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToSale?: (saleId: string) => void;
  onNavigateTab?: (tab: any) => void;
  onViewInvoice?: (sale: any) => void;
}

export const CreditSalesManager: React.FC<CreditSalesManagerProps> = ({
  settings,
  customers,
  currentUser,
  currentStaffUser,
  rolePermissions,
  onNavigateToCustomer,
  onNavigateToSale,
  onNavigateTab,
  onViewInvoice,
}) => {
  const activeStaff = currentUser || currentStaffUser;
  const [creditSales, setCreditSales] = useState<CreditSaleRecord[]>(() => StorageService.getCreditSales());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | CreditSaleStatus>('all');
  const [selectedCreditForDetail, setSelectedCreditForDetail] = useState<CreditSaleRecord | null>(null);
  const [creditToRepay, setCreditToRepay] = useState<CreditSaleRecord | null>(null);
  const [creditForReminder, setCreditForReminder] = useState<CreditSaleRecord | null>(null);

  // Repayment form state
  const [repayAmount, setRepayAmount] = useState<number>(0);
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');
  const [repayRef, setRepayRef] = useState<string>('');
  const [repayNotes, setRepayNotes] = useState<string>('');

  const perms = getEffectiveUserPermissions(activeStaff, rolePermissions);

  const refreshData = () => {
    setCreditSales(StorageService.getCreditSales());
  };

  // Recalculate overdue statuses on mount / active check
  const processedCreditSales = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return creditSales.map((c) => {
      if (c.status === 'active' || c.status === 'partially_paid') {
        const dueDate = new Date(c.dueDate);
        if (dueDate < today && c.remainingBalance > 0) {
          return { ...c, status: 'overdue' as CreditSaleStatus };
        }
      }
      return c;
    });
  }, [creditSales]);

  // Filtered List
  const filteredSales = useMemo(() => {
    return processedCreditSales.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.customerName.toLowerCase().includes(q) ||
        (c.customerPhone && c.customerPhone.includes(q)) ||
        c.creditNumber.toLowerCase().includes(q) ||
        c.invoiceNumber.toLowerCase().includes(q) ||
        (c.customerNrc && c.customerNrc.toLowerCase().includes(q)) ||
        (c.imeis && c.imeis.some(im => im.includes(q))) ||
        (c.itemsSummary && c.itemsSummary.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [processedCreditSales, statusFilter, searchQuery]);

  // Financial KPIs
  const stats = useMemo(() => {
    const activeAndOverdue = processedCreditSales.filter(c => c.status !== 'cancelled' && c.status !== 'bad_debt');
    const totalOutstanding = activeAndOverdue.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
    const overdueRecords = processedCreditSales.filter(c => c.status === 'overdue');
    const overdueAmount = overdueRecords.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
    const totalCollected = processedCreditSales.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
    const activeDebtorsCount = activeAndOverdue.filter(c => c.remainingBalance > 0).length;

    return {
      totalOutstanding,
      overdueAmount,
      overdueCount: overdueRecords.length,
      totalCollected,
      activeDebtorsCount,
      totalCount: processedCreditSales.length,
    };
  }, [processedCreditSales]);

  // Open Repayment Modal
  const handleOpenRepayModal = (credit: CreditSaleRecord) => {
    setCreditToRepay(credit);
    // Suggest first unpaid installment amount or full remaining
    const nextUnpaidInst = credit.installments?.find(i => i.status !== 'paid');
    if (nextUnpaidInst) {
      setRepayAmount(Math.max(0, nextUnpaidInst.amountDue - (nextUnpaidInst.amountPaid || 0)));
    } else {
      setRepayAmount(credit.remainingBalance);
    }
    setRepayMethod('cash');
    setRepayRef('');
    setRepayNotes('');
  };

  // Submit Repayment
  const handleSubmitRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditToRepay || repayAmount <= 0) return;

    if (repayAmount > creditToRepay.remainingBalance) {
      alert(`Repayment amount cannot exceed remaining balance of ${formatCurrency(creditToRepay.remainingBalance, settings.currencySymbol)}`);
      return;
    }

    const receiptVoucherNumber = `CR-REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const repaymentRecord: CreditRepaymentRecord = {
      id: `repay-${Date.now()}`,
      creditSaleId: creditToRepay.id,
      creditSaleNumber: creditToRepay.creditNumber,
      invoiceNumber: creditToRepay.invoiceNumber,
      customerId: creditToRepay.customerId,
      customerName: creditToRepay.customerName,
      date: new Date().toISOString(),
      amount: repayAmount,
      paymentMethod: repayMethod,
      paymentRef: repayRef,
      collectedBy: currentUser?.name || settings.currentStaffName || 'Cashier',
      collectedById: currentUser?.id,
      receiptVoucherNumber,
      notes: repayNotes,
      recordedInCashDrawer: repayMethod === 'cash',
      previousBalance: creditToRepay.remainingBalance,
      newBalance: Math.max(0, creditToRepay.remainingBalance - repayAmount),
    };

    StorageService.recordCreditRepayment(repaymentRecord);
    refreshData();

    try {
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }

    const updatedList = StorageService.getCreditSales();
    const updatedCredit = updatedList.find(c => c.id === creditToRepay.id);

    // Offer immediate receipt export
    if (updatedCredit && confirm('Repayment recorded successfully! Would you like to export the Official Receipt Voucher PDF now?')) {
      exportCreditRepaymentReceiptPdf(repaymentRecord, updatedCredit, settings);
    }

    setCreditToRepay(null);
    if (selectedCreditForDetail && updatedCredit) {
      setSelectedCreditForDetail(updatedCredit);
    }
  };

  // Status Change Handler
  const handleUpdateStatus = (id: string, newStatus: CreditSaleStatus) => {
    if (!confirm(`Are you sure you want to change this credit record status to "${newStatus.replace(/_/g, ' ')}"?`)) return;
    StorageService.updateCreditSaleStatus(id, newStatus);
    refreshData();
    if (selectedCreditForDetail && selectedCreditForDetail.id === id) {
      setSelectedCreditForDetail(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  // Generate WhatsApp / Viber Reminder Message
  const handleSendReminder = (credit: CreditSaleRecord) => {
    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(credit.dueDate).getTime()) / (1000 * 60 * 60 * 24)));
    const msg = `Mingalarpar ${credit.customerName}, this is a friendly payment reminder from ${settings.shopName}.\n\n` +
      `Credit Reference: #${credit.creditNumber} (Invoice #${credit.invoiceNumber})\n` +
      `Financed: ${credit.itemsSummary}\n` +
      `Outstanding Balance Due: ${formatCurrency(credit.remainingBalance, settings.currencySymbol)}\n` +
      `Agreed Due Date: ${formatDate(credit.dueDate)}${daysOverdue > 0 ? ` (${daysOverdue} days overdue)` : ''}\n\n` +
      `Please arrange payment at your earliest convenience or contact us at ${settings.phone}. Thank you!`;

    navigator.clipboard.writeText(msg);
    alert('Payment reminder message template copied to clipboard! You can paste it into Viber, WhatsApp, or SMS.');
    setCreditForReminder(null);
  };

  return (
    <div id="credit-sales-module" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-600 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Credit Sales & Accounts Receivable (AR)</h1>
              <p className="text-xs text-slate-500">Track customer installment debts, collections, promissory contracts & overdue balances</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="refresh-credits-btn"
            onClick={refreshData}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="Refresh Credit Ledger"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            id="export-credits-register-pdf-btn"
            onClick={() => exportCreditSalesRegisterPdf(processedCreditSales, settings)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Export Accounts Receivable Register Statement PDF"
          >
            <FileDown className="w-4 h-4" />
            <span>Export AR Register PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outstanding AR */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Outstanding AR</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {formatCurrency(stats.totalOutstanding, settings.currencySymbol)}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{stats.activeDebtorsCount} active debtors</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Overdue Debt */}
        <div className={`p-4 bg-white rounded-2xl border shadow-2xs flex items-center justify-between ${
          stats.overdueCount > 0 ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
        }`}>
          <div>
            <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Overdue Receivables</p>
            <h3 className="text-2xl font-black text-rose-600 mt-1 font-mono">
              {formatCurrency(stats.overdueAmount, settings.currencySymbol)}
            </h3>
            <p className="text-[11px] text-rose-700 font-semibold mt-0.5">{stats.overdueCount} accounts overdue</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Total Collected */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Total Debt Collected</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">
              {formatCurrency(stats.totalCollected, settings.currencySymbol)}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Across all settled & partial sales</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Total Financed Contracts */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Credit Contracts</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {stats.totalCount}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Total registered credit sales</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All Records', count: processedCreditSales.length },
              { id: 'active', label: 'Active', count: processedCreditSales.filter(c => c.status === 'active').length },
              { id: 'partially_paid', label: 'Partially Paid', count: processedCreditSales.filter(c => c.status === 'partially_paid').length },
              { id: 'overdue', label: 'Overdue', count: processedCreditSales.filter(c => c.status === 'overdue').length, badgeColor: 'bg-rose-500 text-white' },
              { id: 'paid', label: 'Fully Paid / Settled', count: processedCreditSales.filter(c => c.status === 'paid').length },
              { id: 'bad_debt', label: 'Bad Debt', count: processedCreditSales.filter(c => c.status === 'bad_debt').length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                  statusFilter === tab.id ? 'bg-white/20 text-white' : tab.badgeColor || 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, phone, NRC, invoice #..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Credit Sales Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredSales.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <DollarSign className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-600">No credit sales match the current filters</p>
            <p className="text-xs text-slate-400">Credit sales created in the POS checkout will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider select-none">
                  <th className="py-3 px-4">Contract / Ref</th>
                  <th className="py-3 px-4">Customer & Guarantor</th>
                  <th className="py-3 px-4">Financed Devices / IMEI</th>
                  <th className="py-3 px-4 text-right">Total Financed</th>
                  <th className="py-3 px-4 text-right">Down Pay</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.map((credit) => {
                  const percentPaid = credit.totalSaleAmount > 0 
                    ? Math.min(100, Math.round(((credit.totalPaid || 0) / credit.totalSaleAmount) * 100))
                    : 0;

                  return (
                    <tr key={credit.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Contract / Ref */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 font-mono flex items-center gap-1">
                          <span>{credit.creditNumber}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          Inv: #{credit.invoiceNumber}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {formatDate(credit.startDate)}
                        </span>
                      </td>

                      {/* Customer & Guarantor */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">
                          {credit.customerName}
                        </div>
                        {credit.customerPhone && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            {credit.customerPhone}
                          </div>
                        )}
                        {credit.customerNrc && (
                          <div className="text-[9px] text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded font-mono inline-block mt-0.5">
                            NRC: {credit.customerNrc}
                          </div>
                        )}
                        {credit.guarantorName && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Guar: {credit.guarantorName}
                          </span>
                        )}
                      </td>

                      {/* Financed Items */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <span className="font-semibold text-slate-800 line-clamp-1">
                          {credit.itemsSummary}
                        </span>
                        {credit.imeis && credit.imeis.length > 0 && (
                          <span className="text-[10px] text-slate-500 font-mono block truncate">
                            IMEI: {credit.imeis.join(', ')}
                          </span>
                        )}
                      </td>

                      {/* Total Financed */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(credit.totalSaleAmount, settings.currencySymbol)}
                      </td>

                      {/* Down Payment */}
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-700">
                        {formatCurrency(credit.downPayment || 0, settings.currencySymbol)}
                      </td>

                      {/* Total Paid */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-indigo-700">
                        {formatCurrency(credit.totalPaid || 0, settings.currencySymbol)}
                      </td>

                      {/* Balance Due */}
                      <td className="py-3.5 px-4 text-right">
                        <span className={`font-mono font-black text-sm block ${
                          credit.remainingBalance > 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}>
                          {formatCurrency(credit.remainingBalance, settings.currencySymbol)}
                        </span>
                        {/* Progress Bar */}
                        <div className="w-20 ml-auto bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentPaid >= 100 ? 'bg-emerald-500' : percentPaid >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${percentPaid}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                          {percentPaid}% liquidated
                        </span>
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-700 block">
                          {formatDate(credit.dueDate)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {credit.termDays} days term
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          credit.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : credit.status === 'overdue'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : credit.status === 'partially_paid'
                            ? 'bg-blue-100 text-blue-800'
                            : credit.status === 'bad_debt'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {credit.status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Collect Repayment Button */}
                          {credit.remainingBalance > 0 && perms.canCollectCreditRepayment && (
                            <button
                              type="button"
                              onClick={() => handleOpenRepayModal(credit)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Collect Debt Repayment"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Collect</span>
                            </button>
                          )}

                          {/* View Detail Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedCreditForDetail(credit)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="View Full Contract & Ledger"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Export Agreement PDF */}
                          <button
                            type="button"
                            onClick={() => exportCreditAgreementPdf(credit, settings)}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                            title="Export Credit Agreement Contract PDF"
                          >
                            <FileDown className="w-4 h-4" />
                          </button>

                          {/* Send WhatsApp/Viber Reminder */}
                          {credit.remainingBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSendReminder(credit)}
                              className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                              title="Copy Viber / WhatsApp / SMS Reminder Message"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: Collect Repayment Modal */}
      {/* ========================================================= */}
      {creditToRepay && (
        <div id="collect-repayment-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-modal-content">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Collect Credit Debt Repayment</h3>
                <p className="text-xs text-slate-400 font-mono">Ref: #{creditToRepay.creditNumber} • {creditToRepay.customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setCreditToRepay(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitRepayment} className="p-6 space-y-4 text-xs">
              
              {/* Outstanding Balance Banner */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Current Outstanding Debt</span>
                  <h4 className="text-2xl font-black text-rose-600 font-mono">
                    {formatCurrency(creditToRepay.remainingBalance, settings.currencySymbol)}
                  </h4>
                  <span className="text-[10px] text-slate-500">
                    Total Financed: {formatCurrency(creditToRepay.totalSaleAmount, settings.currencySymbol)} • Paid So Far: {formatCurrency(creditToRepay.totalPaid || 0, settings.currencySymbol)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Due Date</span>
                  <span className="text-xs font-bold text-slate-800 font-mono">{formatDate(creditToRepay.dueDate)}</span>
                </div>
              </div>

              {/* Repayment Amount Input */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Collection Amount ({settings.currencySymbol}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={creditToRepay.remainingBalance}
                  value={repayAmount === 0 ? '' : repayAmount}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setRepayAmount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xl font-black text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Quick Amount Buttons */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setRepayAmount(creditToRepay.remainingBalance)}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold"
                >
                  Full Remaining ({formatCurrency(creditToRepay.remainingBalance, settings.currencySymbol)})
                </button>
                {creditToRepay.remainingBalance >= 100000 && (
                  <button
                    type="button"
                    onClick={() => setRepayAmount(Math.round(creditToRepay.remainingBalance / 2))}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold"
                  >
                    50% ({formatCurrency(Math.round(creditToRepay.remainingBalance / 2), settings.currencySymbol)})
                  </button>
                )}
              </div>

              {/* Payment Channel Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method / Channel *</label>
                <select
                  value={repayMethod}
                  onChange={(e) => setRepayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800"
                >
                  <option value="cash">Cash (Direct into Cash Drawer)</option>
                  <option value="kpay">KBZPay (KPay)</option>
                  <option value="wave">WavePay</option>
                  <option value="kbz">KBZ Bank</option>
                  <option value="aya">AYA Pay</option>
                  <option value="cb">CB Pay</option>
                  <option value="yoma">Yoma Bank</option>
                </select>
                {repayMethod === 'cash' && (
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                    ✓ Cash collected will automatically increment the active POS Register Drawer float.
                  </p>
                )}
              </div>

              {/* Transaction Ref / Note */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Slip / Transaction Ref</label>
                  <input
                    type="text"
                    placeholder="e.g. KP-991823"
                    value={repayRef}
                    onChange={(e) => setRepayRef(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Collection Notes</label>
                  <input
                    type="text"
                    placeholder="Installment #2 / Cashier deposit"
                    value={repayNotes}
                    onChange={(e) => setRepayNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCreditToRepay(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={repayAmount <= 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm Collection & Print Voucher</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: Full Credit Contract & Repayment History Dossier */}
      {/* ========================================================= */}
      {selectedCreditForDetail && (
        <div id="credit-detail-dossier-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-modal-content">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center font-bold">
                  CR
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Credit Sale Contract Dossier</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-700 font-mono font-bold">
                      #{selectedCreditForDetail.creditNumber}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Linked Invoice #{selectedCreditForDetail.invoiceNumber} • Financed on {formatDate(selectedCreditForDetail.startDate)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCreditForDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-700">
              
              {/* Financial Snapshot Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Financed</span>
                  <span className="text-base font-black text-slate-900 font-mono block mt-0.5">
                    {formatCurrency(selectedCreditForDetail.totalSaleAmount, settings.currencySymbol)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Down Payment</span>
                  <span className="text-base font-black text-emerald-700 font-mono block mt-0.5">
                    {formatCurrency(selectedCreditForDetail.downPayment || 0, settings.currencySymbol)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Repaid</span>
                  <span className="text-base font-black text-indigo-700 font-mono block mt-0.5">
                    {formatCurrency(selectedCreditForDetail.totalPaid || 0, settings.currencySymbol)}
                  </span>
                </div>

                <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200">
                  <span className="text-[10px] text-rose-700 font-bold uppercase block">Remaining Balance</span>
                  <span className="text-base font-black text-rose-600 font-mono block mt-0.5">
                    {formatCurrency(selectedCreditForDetail.remainingBalance, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              {/* Customer & Guarantor Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Customer (Borrower)</span>
                  </h4>
                  <p><b className="text-slate-500">Name:</b> <span className="font-bold text-slate-900">{selectedCreditForDetail.customerName}</span></p>
                  <p><b className="text-slate-500">Phone:</b> <span className="font-mono">{selectedCreditForDetail.customerPhone || 'N/A'}</span></p>
                  {selectedCreditForDetail.customerNrc && (
                    <p><b className="text-slate-500">NRC:</b> <span className="font-mono font-semibold">{selectedCreditForDetail.customerNrc}</span></p>
                  )}
                  {selectedCreditForDetail.customerAddress && (
                    <p><b className="text-slate-500">Address:</b> {selectedCreditForDetail.customerAddress}</p>
                  )}
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                    <span>Guarantor & Security</span>
                  </h4>
                  <p><b className="text-slate-500">Guarantor Name:</b> <span className="font-bold text-slate-900">{selectedCreditForDetail.guarantorName || 'Self-Guaranteed'}</span></p>
                  <p><b className="text-slate-500">Guarantor Phone:</b> <span className="font-mono">{selectedCreditForDetail.guarantorPhone || 'N/A'}</span></p>
                  {selectedCreditForDetail.guarantorNrc && (
                    <p><b className="text-slate-500">Guarantor NRC:</b> <span className="font-mono">{selectedCreditForDetail.guarantorNrc}</span></p>
                  )}
                  {selectedCreditForDetail.collateralDescription && (
                    <p><b className="text-slate-500">Collateral Lien:</b> {selectedCreditForDetail.collateralDescription}</p>
                  )}
                </div>
              </div>

              {/* Financed Items List */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-2">
                  Financed Merchandise & Serialized IMEIs
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-2.5">Item Description</th>
                        <th className="p-2.5">IMEI / Serial</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedCreditForDetail.items || []).map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-semibold text-slate-900">{item.name}</td>
                          <td className="p-2.5 font-mono text-slate-600">{item.imei || 'Non-serialized'}</td>
                          <td className="p-2.5 text-center font-bold">{item.quantity}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(item.finalPrice || (item.unitPrice * item.quantity), settings.currencySymbol)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Repayments History */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider mb-2 flex items-center justify-between">
                  <span>Repayments Collection History ({selectedCreditForDetail.repayments?.length || 0})</span>
                  {selectedCreditForDetail.remainingBalance > 0 && perms.canCollectCreditRepayment && (
                    <button
                      type="button"
                      onClick={() => handleOpenRepayModal(selectedCreditForDetail)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Collect New Repayment</span>
                    </button>
                  )}
                </h4>

                {!selectedCreditForDetail.repayments || selectedCreditForDetail.repayments.length === 0 ? (
                  <p className="text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-slate-200">
                    No debt repayments recorded yet.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                          <th className="p-2.5">Receipt #</th>
                          <th className="p-2.5">Date & Time</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5 text-right">Amount Paid</th>
                          <th className="p-2.5 text-right">Balance After</th>
                          <th className="p-2.5">Collector</th>
                          <th className="p-2.5 text-center">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedCreditForDetail.repayments.map((r) => (
                          <tr key={r.id}>
                            <td className="p-2.5 font-mono font-bold text-slate-900">{r.receiptVoucherNumber}</td>
                            <td className="p-2.5 text-slate-600">{formatDateTime(r.date)}</td>
                            <td className="p-2.5 uppercase font-semibold text-slate-700">{r.paymentMethod}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                              {formatCurrency(r.amount, settings.currencySymbol)}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-700">
                              {formatCurrency(r.newBalance, settings.currencySymbol)}
                            </td>
                            <td className="p-2.5 text-slate-600">{r.collectedBy}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => exportCreditRepaymentReceiptPdf(r, selectedCreditForDetail, settings)}
                                className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded"
                                title="Download PDF Voucher"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {perms.canApproveCreditSale && selectedCreditForDetail.status !== 'bad_debt' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedCreditForDetail.id, 'bad_debt')}
                    className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Mark as Bad Debt
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportCreditAgreementPdf(selectedCreditForDetail, settings)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download Agreement PDF</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
