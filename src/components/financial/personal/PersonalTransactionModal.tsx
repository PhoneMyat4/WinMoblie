import React, { useState } from 'react';
import { 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  Check, 
  Calendar, 
  Clock, 
  Tag, 
  FileText, 
  Wallet, 
  AlertCircle 
} from 'lucide-react';
import { 
  PersonalTransaction, 
  PersonalTransactionType, 
  PersonalWallet, 
  ShopSettings 
} from '../../../types';
import { PERSONAL_CATEGORIES } from '../../../data/initialPersonalFinance';
import { formatCurrency } from '../../../utils/formatters';

interface PersonalTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: PersonalTransaction) => void;
  wallets: PersonalWallet[];
  settings: ShopSettings;
  initialType?: PersonalTransactionType;
  editingTransaction?: PersonalTransaction | null;
}

export const PersonalTransactionModal: React.FC<PersonalTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  wallets,
  settings,
  initialType = 'expense',
  editingTransaction = null,
}) => {
  const [type, setType] = useState<PersonalTransactionType>(
    editingTransaction ? editingTransaction.type : initialType
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
  const [walletId, setWalletId] = useState<string>(() => {
    if (editingTransaction) return editingTransaction.walletId;
    const defaultW = wallets.find(w => w.isDefault);
    return defaultW ? defaultW.id : (wallets[0]?.id || '');
  });
  const [toWalletId, setToWalletId] = useState<string>(() => {
    if (editingTransaction?.toWalletId) return editingTransaction.toWalletId;
    const second = wallets.find(w => w.id !== walletId);
    return second ? second.id : '';
  });
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
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredCategories = PERSONAL_CATEGORIES.filter(c => {
    if (type === 'income' || type === 'drawing_from_business') return c.type === 'income';
    if (type === 'expense' || type === 'injection_to_business') return c.type === 'expense';
    return true;
  });

  const selectedSourceWallet = wallets.find(w => w.id === walletId);
  const selectedTargetWallet = wallets.find(w => w.id === toWalletId);

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
    if (!walletId) {
      setError('Please select a wallet.');
      return;
    }
    if (type === 'transfer') {
      if (!toWalletId) {
        setError('Please select a destination wallet for the transfer.');
        return;
      }
      if (walletId === toWalletId) {
        setError('Source and Destination wallets cannot be the same.');
        return;
      }
    }

    const tx: PersonalTransaction = {
      id: editingTransaction ? editingTransaction.id : `ptx-${Date.now()}`,
      date,
      time,
      type,
      amount: parsedAmount,
      walletId,
      toWalletId: type === 'transfer' ? toWalletId : undefined,
      category,
      title: title.trim(),
      notes: notes.trim() || undefined,
      recipientOrPayer: recipientOrPayer.trim() || undefined,
      syncWithBusiness: (type === 'drawing_from_business' || type === 'injection_to_business') ? syncWithBusiness : false,
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
              Track personal expenses, income, inter-wallet transfers, and owner drawings
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

          {/* Type Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              Transaction Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setType('expense');
                  setCategory('food_dining');
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
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
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
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
                  setType('transfer');
                  setCategory('investments');
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                  type === 'transfer'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('drawing_from_business');
                  setCategory('shop_profit_draw');
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                  type === 'drawing_from_business'
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
                <span className="font-medium">Draw from Shop Profit (+ into Personal)</span>
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
                <span className="font-medium">Inject Capital into Shop (- from Personal)</span>
              </label>
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

          {/* Wallets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {type === 'transfer' ? 'From Wallet (Source)' : type === 'income' || type === 'drawing_from_business' ? 'Deposit Into Wallet' : 'Pay From Wallet'} *
              </label>
              <select
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({formatCurrency(w.balance, settings.currencySymbol)})
                  </option>
                ))}
              </select>
            </div>

            {type === 'transfer' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  To Wallet (Destination) *
                </label>
                <select
                  value={toWalletId}
                  onChange={(e) => setToWalletId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select Destination Wallet...</option>
                  {wallets
                    .filter(w => w.id !== walletId)
                    .map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({formatCurrency(w.balance, settings.currencySymbol)})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {filteredCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date & Time & Payee */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payee / Beneficiary
              </label>
              <input
                type="text"
                value={recipientOrPayer}
                onChange={(e) => setRecipientOrPayer(e.target.value)}
                placeholder="e.g., City Mart / Shell"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
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
                    ? 'Automatically deduct cash from the store cash drawer and log an Owner Drawing expense in the shop ledger.'
                    : 'Automatically log cash inflow into the shop cash drawer as owner capital injection.'}
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
