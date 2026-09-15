import React, { useState } from 'react';
import { X, Check, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { PersonalWallet, PersonalTransaction, ShopSettings } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface PersonalTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: PersonalTransaction) => void;
  wallets: PersonalWallet[];
  settings: ShopSettings;
  initialFromWalletId?: string;
}

export const PersonalTransferModal: React.FC<PersonalTransferModalProps> = ({
  isOpen,
  onClose,
  onSave,
  wallets,
  settings,
  initialFromWalletId,
}) => {
  const [fromWalletId, setFromWalletId] = useState(
    initialFromWalletId || wallets[0]?.id || ''
  );
  const [toWalletId, setToWalletId] = useState(() => {
    const selectedFrom = initialFromWalletId || wallets[0]?.id || '';
    const other = wallets.find(w => w.id !== selectedFrom);
    return other ? other.id : '';
  });
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const fromWallet = wallets.find(w => w.id === fromWalletId);
  const toWallet = wallets.find(w => w.id === toWalletId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid transfer amount.');
      return;
    }
    if (!fromWalletId || !toWalletId) {
      setError('Please select both source and target wallets.');
      return;
    }
    if (fromWalletId === toWalletId) {
      setError('Source and target wallets must be different.');
      return;
    }
    if (fromWallet && fromWallet.balance < parsedAmount) {
      setError(`Insufficient balance in ${fromWallet.name}. Current: ${formatCurrency(fromWallet.balance, settings.currencySymbol)}`);
      return;
    }

    const tx: PersonalTransaction = {
      id: `ptx-tr-${Date.now()}`,
      date,
      time: new Date().toTimeString().slice(0, 5),
      type: 'transfer',
      amount: parsedAmount,
      walletId: fromWalletId,
      toWalletId,
      category: 'investments',
      title: `Transfer: ${fromWallet?.name || 'Wallet'} → ${toWallet?.name || 'Wallet'}`,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onSave(tx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Transfer Funds Between Wallets</h3>
              <p className="text-xs text-slate-500">Move personal cash into mobile wallets or savings</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Transfer Amount ({settings.currencySymbol}) *
            </label>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-base font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                From Account (Source)
              </label>
              <select
                value={fromWalletId}
                onChange={(e) => setFromWalletId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
              >
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} — Balance: {formatCurrency(w.balance, settings.currencySymbol)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center -my-1">
              <div className="p-1 bg-white rounded-full border border-slate-200 text-slate-400">
                <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                To Account (Destination)
              </label>
              <select
                value={toWalletId}
                onChange={(e) => setToWalletId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
              >
                {wallets.map(w => (
                  <option key={w.id} value={w.id} disabled={w.id === fromWalletId}>
                    {w.name} — Balance: {formatCurrency(w.balance, settings.currencySymbol)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Transfer Memo
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Monthly savings"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm Transfer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
