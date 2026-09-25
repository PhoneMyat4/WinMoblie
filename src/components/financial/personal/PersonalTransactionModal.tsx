import React, { useState, useMemo } from 'react';
import { 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  Calendar, 
  Clock, 
  Tag, 
  FileText, 
  AlertCircle,
  Banknote,
  Smartphone,
  Building,
  CheckCircle2,
  AlertTriangle,
  Check
} from 'lucide-react';
import { 
  PersonalTransaction, 
  PersonalTransactionType, 
  ShopSettings 
} from '../../../types';
import { PERSONAL_CATEGORIES } from '../../../data/initialPersonalFinance';
import { formatCurrency, getPaymentMethodInfo } from '../../../utils/formatters';
import { StorageService } from '../../../utils/storage';
import { calculateRunningCapital } from '../../../utils/capitalUtils';

interface PersonalTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: PersonalTransaction) => void;
  wallets?: any[];
  settings: ShopSettings;
  initialType?: PersonalTransactionType;
  editingTransaction?: PersonalTransaction | null;
}

export const PersonalTransactionModal: React.FC<PersonalTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  settings,
  initialType = 'expense',
  editingTransaction = null,
}) => {
  const [type, setType] = useState<PersonalTransactionType>(
    editingTransaction ? editingTransaction.type : initialType === 'transfer' ? 'expense' : initialType
  );
  const [amount, setAmount] = useState<string>(
    editingTransaction ? String(editingTransaction.amount) : ''
  );
  const [title, setTitle] = useState<string>(
    editingTransaction ? editingTransaction.title : ''
  );
  const [category, setCategory] = useState<string>(
    editingTransaction 
      ? editingTransaction.category 
      : type === 'expense' 
        ? 'food_dining' 
        : type === 'income' 
          ? 'salary_allowance' 
          : type === 'drawing_from_business' 
            ? 'shop_profit_draw' 
            : 'other_personal'
  );
  const [date, setDate] = useState<string>(
    editingTransaction 
      ? editingTransaction.date 
      : new Date().toISOString().split('T')[0]
  );
  const [time, setTime] = useState<string>(() => {
    if (editingTransaction?.time) return editingTransaction.time;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [notes, setNotes] = useState<string>(editingTransaction?.notes || '');
  const [recipientOrPayer, setRecipientOrPayer] = useState<string>(editingTransaction?.recipientOrPayer || '');
  const [syncWithBusiness, setSyncWithBusiness] = useState<boolean>(
    editingTransaction?.syncWithBusiness ?? (type === 'drawing_from_business' || type === 'injection_to_business')
  );
  // Business Funding Source for Draw/Deposit: 'cash_drawer' (Physical Cash) vs 'digital_cash_pool' (Digital Money/Bank)
  const [businessFundingSource, setBusinessFundingSource] = useState<'cash_drawer' | 'digital_cash_pool'>(
    editingTransaction?.businessFundingSource || 'cash_drawer'
  );
  const [digitalChannel, setDigitalChannel] = useState<string>(
    editingTransaction?.digitalChannel || 'kpay'
  );
  const [error, setError] = useState<string | null>(null);

  // Live Capital metrics for shop drawer & digital pool
  const liveCapital = useMemo(() => {
    if (!isOpen) return { cashInDrawer: 0, digitalBankBalances: 0 };
    const prods = StorageService.getProducts();
    const drawer = StorageService.getCashDrawer();
    const credits = StorageService.getCreditSales();
    const exps = StorageService.getExpenses();
    const sls = StorageService.getSales();
    const pur = StorageService.getPurchases();
    return calculateRunningCapital(prods, drawer, credits, exps, sls, undefined, pur);
  }, [isOpen]);

  const liveDrawerCash = liveCapital.cashInDrawer || 0;
  const liveDigitalPool = liveCapital.digitalBankBalances || 0;

  if (!isOpen) return null;

  const filteredCategories = PERSONAL_CATEGORIES.filter(c => {
    if (type === 'income' || type === 'drawing_from_business') return c.type === 'income';
    if (type === 'expense' || type === 'injection_to_business') return c.type === 'expense';
    return true;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a title or description.');
      return;
    }

    const tx: PersonalTransaction = {
      id: editingTransaction ? editingTransaction.id : `ptx-${Date.now()}`,
      date,
      time,
      type,
      amount: parsedAmount,
      category,
      title: title.trim(),
      notes: notes.trim() || undefined,
      recipientOrPayer: recipientOrPayer.trim() || undefined,
      syncWithBusiness: (type === 'drawing_from_business' || type === 'injection_to_business') ? syncWithBusiness : false,
      businessFundingSource: (type === 'drawing_from_business' || type === 'injection_to_business') ? businessFundingSource : undefined,
      digitalChannel: (type === 'drawing_from_business' || type === 'injection_to_business') && businessFundingSource === 'digital_cash_pool' ? digitalChannel : undefined,
      linkedShopExpenseId: editingTransaction?.linkedShopExpenseId,
      createdAt: editingTransaction?.createdAt || new Date().toISOString(),
    };

    onSave(tx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {editingTransaction ? 'Edit Personal Transaction' : 'Record Personal Transaction'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track personal expenses, personal income, and store drawings & capital injections
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Selector Tabs (3 options: Expense, Income, Draw/Inject) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              Transaction Type
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setType('expense');
                  setCategory('food_dining');
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  type === 'expense'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Expense</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('income');
                  setCategory('salary_allowance');
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  type === 'income'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Income</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('drawing_from_business');
                  setCategory('shop_profit_draw');
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  type === 'drawing_from_business' || type === 'injection_to_business'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Draw / Inject</span>
              </button>
            </div>
          </div>

          {/* Sub-toggle for Draw vs Inject if on business flow */}
          {(type === 'drawing_from_business' || type === 'injection_to_business') && (
            <div className="space-y-3">
              {/* Flow Direction Selector */}
              <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold">Business Flow:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bizType"
                    checked={type === 'drawing_from_business'}
                    onChange={() => {
                      setType('drawing_from_business');
                      setCategory('shop_profit_draw');
                    }}
                    className="text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-medium">Draw Money from Shop (+ into Personal)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer ml-3">
                  <input
                    type="radio"
                    name="bizType"
                    checked={type === 'injection_to_business'}
                    onChange={() => {
                      setType('injection_to_business');
                      setCategory('other_personal');
                    }}
                    className="text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-medium">Deposit Money into Shop (- from Personal)</span>
                </label>
              </div>

              {/* Business Channel Selector (Physical Cash vs Digital Cash Pool) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    {type === 'drawing_from_business' 
                      ? 'Shop Source to Draw Money From (ငွေထုတ်ယူမည့် စတိုးအရင်းအမြစ်) *' 
                      : 'Shop Destination to Deposit Money Into (ငွေထည့်သွင်းမည့် စတိုးအရင်းအမြစ်) *'}
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: Physical Cash Drawer */}
                  <button
                    type="button"
                    onClick={() => setBusinessFundingSource('cash_drawer')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      businessFundingSource === 'cash_drawer'
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl shrink-0 ${
                        businessFundingSource === 'cash_drawer' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Banknote className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-extrabold text-xs text-slate-900">
                          Daily Counter Drawer Cash
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Physical shift cash drawer
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Drawer Balance:</span>
                      <strong className="font-mono text-slate-900 font-bold">
                        {formatCurrency(liveDrawerCash, settings.currencySymbol)}
                      </strong>
                    </div>
                  </button>

                  {/* Option 2: Digital Cash Pool */}
                  <button
                    type="button"
                    onClick={() => setBusinessFundingSource('digital_cash_pool')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      businessFundingSource === 'digital_cash_pool'
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl shrink-0 ${
                        businessFundingSource === 'digital_cash_pool' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-extrabold text-xs text-slate-900">
                          Digital Cash Pool
                        </p>
                        <p className="text-[10px] text-slate-500">
                          KPay, Wave, Bank accounts
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Digital Pool:</span>
                      <strong className="font-mono text-slate-900 font-bold">
                        {formatCurrency(liveDigitalPool, settings.currencySymbol)}
                      </strong>
                    </div>
                  </button>
                </div>

                {/* Sub-channel selector if Digital Cash Pool */}
                {businessFundingSource === 'digital_cash_pool' ? (
                  <div className="mt-2 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2 text-[11px] text-indigo-900">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Digital Payment Channel:</span>
                      </label>
                      <span className="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                        Drawer NOT affected
                      </span>
                    </div>

                    <select
                      value={digitalChannel}
                      onChange={(e) => setDigitalChannel(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="kpay">KBZPay (KPay)</option>
                      <option value="wave">WavePay</option>
                      <option value="kbz">KBZ Bank (iBanking)</option>
                      <option value="aya">AYA Bank (AYA Pay / Banking)</option>
                      <option value="cb">CB Bank (CB Pay / Banking)</option>
                      <option value="yoma">Yoma Bank (Next)</option>
                      <option value="other">Other Digital / Card Account</option>
                    </select>

                    <p className="text-[10px] text-indigo-800 leading-snug">
                      ✓ {type === 'drawing_from_business'
                        ? `Draws from store Digital Cash Pool (${getPaymentMethodInfo(digitalChannel as any).label}). Daily shift cash drawer will NOT be reduced.`
                        : `Deposits into store Digital Cash Pool (${getPaymentMethodInfo(digitalChannel as any).label}). Daily shift cash drawer is NOT affected.`}
                    </p>

                    {/* Deficit warning if drawing more than available digital pool */}
                    {type === 'drawing_from_business' && parseFloat(amount || '0') > liveDigitalPool && (
                      <div className="p-2 bg-rose-100 border border-rose-300 rounded-lg text-rose-900 text-[10px] font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>
                          Notice: Drawing ({formatCurrency(parseFloat(amount || '0'), settings.currencySymbol)}) exceeds available Digital Pool ({formatCurrency(liveDigitalPool, settings.currencySymbol)}).
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 p-2 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Counter Drawer Cash:</span>
                    </div>
                    <p className="text-[10px] text-amber-800 leading-snug pl-5">
                      ✓ {type === 'drawing_from_business'
                        ? 'Deducts physical cash directly from today\'s active shift cash drawer. Digital Cash Pool remains unchanged.'
                        : 'Deposits physical cash directly into today\'s active shift cash drawer. Digital Cash Pool remains unchanged.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Amount & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount ({settings.currencySymbol}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-3 pr-12 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  {settings.currencySymbol}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Title / Memo *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === 'expense' 
                    ? 'e.g., Grocery at City Mart' 
                    : type === 'income' 
                      ? 'e.g., Monthly Owner Dividend' 
                      : type === 'transfer' 
                        ? 'e.g., Transfer to Savings' 
                        : 'e.g., Drawing from cash drawer'
                }
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Category & Payee */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs cursor-pointer"
              >
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Payee / Beneficiary (Optional)
              </label>
              <input
                type="text"
                value={recipientOrPayer}
                onChange={(e) => setRecipientOrPayer(e.target.value)}
                placeholder="e.g., City Mart / Shell / Person"
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Time
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Personal Note / Memo (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details, itemized breakdown, or purpose..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Business sync checkbox */}
          {(type === 'drawing_from_business' || type === 'injection_to_business') && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <input
                type="checkbox"
                id="syncWithBiz"
                checked={syncWithBusiness}
                onChange={(e) => setSyncWithBusiness(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
              />
              <label htmlFor="syncWithBiz" className="text-xs text-slate-700 cursor-pointer select-none">
                <span className="font-bold text-amber-900">Synchronize with Store Operations</span>
                <p className="text-slate-500 mt-0.5 leading-relaxed">
                  {type === 'drawing_from_business'
                    ? businessFundingSource === 'cash_drawer'
                      ? 'Automatically deduct cash from the store cash drawer and log an Owner Drawing expense in the shop ledger.'
                      : `Automatically deduct funds from the Digital Cash Pool (${getPaymentMethodInfo(digitalChannel as any).label}) and log an Owner Drawing expense without altering the cash drawer.`
                    : businessFundingSource === 'cash_drawer'
                      ? 'Automatically log physical cash inflow into the store cash drawer as owner capital injection.'
                      : `Automatically credit into the Digital Cash Pool (${getPaymentMethodInfo(digitalChannel as any).label}) as owner capital injection without altering the cash drawer.`}
                </p>
              </label>
            </div>
          )}

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{editingTransaction ? 'Save Changes' : 'Confirm Transaction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
