import React, { useState } from 'react';
import { X, Check, Wallet, Smartphone, Landmark, PiggyBank, CircleDollarSign, AlertCircle } from 'lucide-react';
import { PersonalWallet, PersonalWalletType, ShopSettings } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface PersonalWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (wallet: PersonalWallet) => void;
  wallet?: PersonalWallet | null;
  settings: ShopSettings;
}

const WALLET_TYPES: { type: PersonalWalletType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'cash', label: 'Cash in Hand / Pocket', icon: CircleDollarSign },
  { type: 'mobile_wallet', label: 'Mobile Wallet (KPay/Wave)', icon: Smartphone },
  { type: 'bank_account', label: 'Bank Account (Savings/Checking)', icon: Landmark },
  { type: 'savings', label: 'Emergency / Long-Term Vault', icon: PiggyBank },
  { type: 'investment', label: 'Gold & Investments', icon: Wallet },
];

const PRESET_COLORS = [
  '#10B981', // Emerald
  '#2563EB', // Blue
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#64748B', // Slate
];

export const PersonalWalletModal: React.FC<PersonalWalletModalProps> = ({
  isOpen,
  onClose,
  onSave,
  wallet,
  settings,
}) => {
  const [name, setName] = useState(wallet?.name || '');
  const [type, setType] = useState<PersonalWalletType>(wallet?.type || 'mobile_wallet');
  const [balance, setBalance] = useState(wallet ? String(wallet.balance) : '0');
  const [accountNumber, setAccountNumber] = useState(wallet?.accountNumber || '');
  const [color, setColor] = useState(wallet?.color || '#2563EB');
  const [isDefault, setIsDefault] = useState(wallet?.isDefault || false);
  const [notes, setNotes] = useState(wallet?.notes || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide an account or wallet name.');
      return;
    }
    const parsedBalance = parseFloat(balance.replace(/,/g, ''));
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      setError('Please provide a valid non-negative balance.');
      return;
    }

    const newWallet: PersonalWallet = {
      id: wallet ? wallet.id : `wallet-${Date.now()}`,
      name: name.trim(),
      type,
      balance: parsedBalance,
      currency: settings.currencySymbol || 'MMK',
      accountNumber: accountNumber.trim() || undefined,
      color,
      isDefault,
      notes: notes.trim() || undefined,
      createdAt: wallet?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newWallet);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {wallet ? 'Edit Personal Wallet' : 'Add Personal Wallet / Account'}
              </h3>
              <p className="text-xs text-slate-500">
                Manage personal bank accounts, digital wallets & cash reserves
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
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
              Account / Wallet Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., KBZPay Personal, CB Bank Checking, Pocket Cash"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Wallet Classification
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PersonalWalletType)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {WALLET_TYPES.map(wt => (
                <option key={wt.type} value={wt.type}>
                  {wt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Balance ({settings.currencySymbol}) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account / Phone # (Optional)
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="09-xxxxxxxxx or Acc #"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Wallet Color Accent
            </label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer border-2 ${
                    color === c ? 'scale-110 border-slate-900 shadow-sm' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Personal Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Kept in bedroom safe, only for urgent situations"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultWallet"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="isDefaultWallet" className="text-xs text-slate-700 font-medium cursor-pointer select-none">
              Set as primary / default personal wallet
            </label>
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
              <span>{wallet ? 'Save Changes' : 'Create Wallet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
