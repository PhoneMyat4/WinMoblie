import React, { useState } from 'react';
import { 
  Receipt, 
  Plus, 
  Search, 
  Calendar, 
  Trash2, 
  TrendingDown, 
  Tag, 
  CheckCircle2, 
  X, 
  FileText, 
  Printer, 
  SlidersHorizontal, 
  Sparkles,
  Truck,
  Lock,
  TrendingUp,
  ArrowUpRight
} from 'lucide-react';
import { ExpenseRecord, ExpenseCategoryItem, PaymentMethod, ShopSettings } from '../../types';
import { 
  formatCurrency, 
  formatDate, 
  formatDateTime, 
  getExpenseCategoryInfo, 
  getPaymentMethodInfo 
} from '../../utils/formatters';
import { StorageService } from '../../utils/storage';
import { ExpenseCategoryModal, renderCategoryIcon } from './ExpenseCategoryModal';

interface ExpensesManagerProps {
  expenses: ExpenseRecord[];
  settings: ShopSettings;
  categories?: ExpenseCategoryItem[];
  onSaveExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (id: string) => void;
  onSaveCategory?: (category: ExpenseCategoryItem) => void;
  onDeleteCategory?: (id: string, reassignToId?: string) => void;
  onResetCategories?: () => void;
  onNavigateToDailyProfit?: () => void;
}

export const ExpensesManager: React.FC<ExpensesManagerProps> = ({
  expenses,
  settings,
  categories: propCategories,
  onSaveExpense,
  onDeleteExpense,
  onSaveCategory: propOnSaveCategory,
  onDeleteCategory: propOnDeleteCategory,
  onResetCategories: propOnResetCategories,
  onNavigateToDailyProfit,
}) => {
  // Local state for categories (synced with storage)
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>(() => 
    propCategories || StorageService.getExpenseCategories()
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState<ExpenseRecord | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(categories[0]?.id || 'utilities_electricity');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidTo, setPaidTo] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [deductFromCashDrawer, setDeductFromCashDrawer] = useState(true);
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Sync propCategories if passed
  React.useEffect(() => {
    if (propCategories) {
      setCategories(propCategories);
    }
  }, [propCategories]);

  // Handler for category operations
  const handleSaveCategory = (cat: ExpenseCategoryItem) => {
    if (propOnSaveCategory) {
      propOnSaveCategory(cat);
    } else {
      StorageService.saveExpenseCategory(cat);
      setCategories(StorageService.getExpenseCategories());
    }
  };

  const handleDeleteCategory = (id: string, reassignToId?: string) => {
    if (reassignToId) {
      // Reassign vouchers before deleting
      const currentExpenses = StorageService.getExpenses();
      const updated = currentExpenses.map(e => e.category === id ? { ...e, category: reassignToId } : e);
      StorageService.saveExpenses(updated);
    }

    if (propOnDeleteCategory) {
      propOnDeleteCategory(id, reassignToId);
    } else {
      StorageService.deleteExpenseCategory(id);
      setCategories(StorageService.getExpenseCategories());
    }
  };

  const handleResetCategories = () => {
    if (propOnResetCategories) {
      propOnResetCategories();
    } else {
      StorageService.resetExpenseCategories();
      setCategories(StorageService.getExpenseCategories());
    }
  };

  // Date filtering logic
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = 
      e.voucherNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.paidTo && e.paidTo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.notes && e.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;

    let matchesDate = true;
    if (dateRangeFilter === 'today') {
      matchesDate = e.date.startsWith(todayStr);
    } else if (dateRangeFilter === 'week') {
      const expDate = new Date(e.date);
      const diffDays = (now.getTime() - expDate.getTime()) / (1000 * 3600 * 24);
      matchesDate = diffDays <= 7;
    } else if (dateRangeFilter === 'month') {
      const expDate = new Date(e.date);
      matchesDate = expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
    }

    return matchesSearch && matchesCategory && matchesDate;
  });

  const totalExpenseSum = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
  const todayExpenseSum = expenses.filter(e => e.date.startsWith(todayStr)).reduce((acc, e) => acc + e.amount, 0);

  // Category sum aggregation
  const categoryTotals: Record<string, number> = {};
  expenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  const topCategoryKey = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || categories[0]?.id || 'other_general';
  const topCategoryInfo = getExpenseCategoryInfo(topCategoryKey, categories);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || amount <= 0) {
      alert('Please enter a valid expense title and amount.');
      return;
    }

    const newExpense: ExpenseRecord = {
      id: `exp-${Date.now()}`,
      voucherNumber: `${settings.expensePrefix || 'EXP-'}${Date.now().toString().slice(-6)}`,
      date: new Date(expenseDate).toISOString(),
      title,
      category,
      amount,
      paymentMethod,
      paidTo: paidTo || undefined,
      paymentRef: paymentRef || undefined,
      recordedBy: settings.currentStaffName,
      deductFromCashDrawer,
      notes: notes || undefined,
    };

    onSaveExpense(newExpense);
    setIsNewExpenseModalOpen(false);

    // Reset Form
    setTitle('');
    setAmount(0);
    setPaidTo('');
    setPaymentRef('');
    setNotes('');
  };

  return (
    <div id="expenses-manager-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Financial Module Navigation Switcher */}
      {onNavigateToDailyProfit && (
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              <span>Shop Expenses</span>
            </span>
            <button
              type="button"
              onClick={onNavigateToDailyProfit}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span>Daily Gross Profit & P&L</span>
              <ArrowUpRight className="w-3 h-3 text-slate-400" />
            </button>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Analyze real-time COGS & gross margins:</span>
            <button
              type="button"
              onClick={onNavigateToDailyProfit}
              className="font-bold text-indigo-600 hover:text-indigo-800 underline transition-colors cursor-pointer"
            >
              View Daily Gross Profit →
            </button>
          </div>
        </div>
      )}

      {/* Top Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Filtered Expenses Total</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600">
            {formatCurrency(totalExpenseSum, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{filteredExpenses.length} Vouchers in current view</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Today's Outflow</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(todayExpenseSum, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Shop operational costs today</p>
        </div>

        <div className="bg-gradient-to-br from-rose-900 to-rose-950 text-white p-4 rounded-2xl shadow-md flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="text-xs text-rose-200 font-bold uppercase">Highest Category</p>
            <h3 className="text-base font-black text-white mt-1 truncate">
              {topCategoryInfo.label}
            </h3>
            <p className="text-[11px] text-rose-300 mt-0.5">
              {formatCurrency(categoryTotals[topCategoryKey] || 0, settings.currencySymbol)} spent
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsNewExpenseModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-900 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Expense</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-3 py-1.5 bg-rose-800/80 hover:bg-rose-800 text-rose-100 text-[11px] font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 border border-rose-700/60"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Custom Categories</span>
            </button>
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Voucher #, Title, Paid to, Notes..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
          {/* Customizable Category Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden max-w-[200px]"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Customize Expense Categories"
            >
              <Tag className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['all', 'today', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDateRangeFilter(range)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                  dateRangeFilter === range
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Expense Vouchers Ledger</h3>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 font-semibold px-2 py-0.5 rounded-md hover:bg-rose-50 cursor-pointer"
            >
              <Tag className="w-3 h-3" />
              <span>{categories.length} Categories</span>
            </button>
          </div>
          <span className="text-xs text-slate-500 font-mono">{filteredExpenses.length} Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Voucher #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Expense Title</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Payment & Paid To</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">No expense records found.</p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const catInfo = getExpenseCategoryInfo(exp.category, categories);
                  const payInfo = getPaymentMethodInfo(exp.paymentMethod);

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{exp.voucherNumber}</span>
                          {(exp.isAutoGenerated || exp.purchaseId || exp.sourceType === 'purchase_delivery') && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800 border border-teal-200" title="Auto-synced delivery fee from Purchase Order">
                              <Truck className="w-2.5 h-2.5" />
                              <span>PO Delivery</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {formatDate(exp.date)}
                      </td>

                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{exp.title}</p>
                        {exp.notes && (
                          <p className="text-[10px] text-slate-500 truncate max-w-xs">{exp.notes}</p>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${catInfo.badgeClass}`}>
                          {renderCategoryIcon(catInfo.icon, 'w-3 h-3')}
                          <span>{catInfo.label}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                            {payInfo.label}
                          </span>
                          {exp.paidTo && (
                            <span className="text-[10px] text-slate-600 font-medium">To: {exp.paidTo}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {exp.recordedBy}
                        {exp.deductFromCashDrawer && (
                          <span className="block text-[9px] text-emerald-600 font-semibold">• Drawer deducted</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-black font-mono text-rose-600">
                        {formatCurrency(exp.amount, settings.currencySymbol)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingVoucher(exp)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                            title="View Voucher"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete voucher ${exp.voucherNumber}?`)) {
                                onDeleteExpense(exp.id);
                              }
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* New Expense Modal */}
      {isNewExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-modal-content">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Shop Expense Voucher</h3>
                  <p className="text-xs text-slate-500">Track operating expenses, rent, and utility disbursements</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-6 space-y-4 text-xs">
              
              <div>
                <label className="block font-bold text-slate-700 mb-1">Expense Title / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Generator Fuel & Electricity Monthly Bill"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">Category *</label>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="text-[10px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-0.5"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>+ Customize</span>
                    </button>
                  </div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount ({settings.currencySymbol}) *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={amount === 0 ? '' : amount}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmount(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                    }}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-black text-rose-600 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="cash">Cash (Drawer)</option>
                    <option value="kpay">KBZPay (KPay)</option>
                    <option value="wave">WavePay</option>
                    <option value="kbz">KBZ Bank</option>
                    <option value="aya">AYA Bank</option>
                    <option value="cb">CB Bank</option>
                    <option value="yoma">Yoma Bank</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Paid To (Vendor/Person)</label>
                  <input
                    type="text"
                    placeholder="e.g. Landlord, TrueNet, Corner Tea"
                    value={paidTo}
                    onChange={(e) => setPaidTo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Transaction Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. KP-99210"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <input
                  type="checkbox"
                  id="deductDrawer"
                  checked={deductFromCashDrawer}
                  onChange={(e) => setDeductFromCashDrawer(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="deductDrawer" className="text-slate-800 font-semibold cursor-pointer">
                  Deduct this amount directly from Live Register Cash Drawer
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsNewExpenseModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Save Expense Voucher
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Voucher Detail / Print Modal */}
      {viewingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Expense Voucher</h3>
              <button
                type="button"
                onClick={() => setViewingVoucher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-mono">
              <div className="text-center border-b border-dashed border-slate-300 pb-3">
                <h4 className="font-black text-slate-900 text-sm">{settings.shopName}</h4>
                <p className="text-[10px] text-slate-500">PAYMENT VOUCHER</p>
                <p className="font-bold text-slate-800 mt-1">#{viewingVoucher.voucherNumber}</p>
                <p className="text-slate-500 text-[10px]">{formatDateTime(viewingVoucher.date)}</p>
              </div>

              <div className="space-y-1.5 py-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Particulars:</span>
                  <span className="font-bold text-slate-900 text-right">{viewingVoucher.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-bold">
                    {getExpenseCategoryInfo(viewingVoucher.category, categories).label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Paid To:</span>
                  <span className="font-bold">{viewingVoucher.paidTo || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Method:</span>
                  <span className="font-bold">{getPaymentMethodInfo(viewingVoucher.paymentMethod).label}</span>
                </div>
                {viewingVoucher.paymentRef && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ref:</span>
                    <span>{viewingVoucher.paymentRef}</span>
                  </div>
                )}
                {(viewingVoucher.purchaseOrderNumber || viewingVoucher.purchaseId) && (
                  <div className="flex justify-between text-teal-800 bg-teal-50 p-1.5 rounded-md border border-teal-200">
                    <span className="font-semibold flex items-center gap-1">
                      <Truck className="w-3 h-3 text-teal-700" />
                      PO Source:
                    </span>
                    <span className="font-bold">
                      PO #{viewingVoucher.purchaseOrderNumber || viewingVoucher.purchaseId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Authorized By:</span>
                  <span>{viewingVoucher.recordedBy}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-dashed border-slate-300 flex justify-between text-base font-black text-rose-700">
                <span>TOTAL AMOUNT:</span>
                <span>{formatCurrency(viewingVoucher.amount, settings.currencySymbol)}</span>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Print Voucher
                </button>
                <button
                  type="button"
                  onClick={() => setViewingVoucher(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Category Customization Modal */}
      <ExpenseCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        expenses={expenses}
        currencySymbol={settings.currencySymbol}
        onSaveCategory={handleSaveCategory}
        onDeleteCategory={handleDeleteCategory}
        onResetCategories={handleResetCategories}
        onCategoryCreated={(newCat) => {
          setCategory(newCat.id);
        }}
      />

    </div>
  );
};
