import React, { useState } from 'react';
import { DollarSign, X, ArrowDownRight, ArrowUpRight, Check } from 'lucide-react';
import { ShopSettings } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface CashInOutModalProps {
  type: 'in' | 'out';
  settings: ShopSettings;
  onClose: () => void;
  onSubmit: (reason: string, amount: number) => void;
}

export const CashInOutModal: React.FC<CashInOutModalProps> = ({
  type,
  settings,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || amount <= 0) {
      alert('Please enter a valid reason and amount.');
      return;
    }
    onSubmit(reason.trim(), amount);
  };

  return (
    <div id="cash-in-out-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {type === 'in' ? <ArrowDownRight className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {type === 'in' ? 'Record Cash In (Deposit / Float)' : 'Record Cash Out (Expense / Payout)'}
              </h3>
              <p className="text-xs text-slate-500">Updates current active cash drawer float</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Amount ({settings.currencySymbol}) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">{settings.currencySymbol}</span>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={amount === 0 ? '' : amount}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.currentTarget.select()}
                onChange={(e) => setAmount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-lg font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Reason / Voucher Description *
            </label>
            <input
              type="text"
              required
              placeholder={type === 'in' ? 'e.g. Added $100 small bills from vault' : 'e.g. Courier shipping fee, Shop electricity bill, Water'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Preset Reasons */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(type === 'in'
              ? ['Cash Float Top-up', 'Owner Deposit', 'Cash Change In']
              : ['Shop Utilities & Tea', 'Vendor Courier Fee', 'Cleaning & Supplies', 'Emergency Cash Handover']
            ).map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setReason(preset)}
                className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-xl"
            >
              Cancel
            </button>

            <button
              type="submit"
              className={`inline-flex items-center gap-2 px-5 py-2 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer ${
                type === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              <Check className="w-4 h-4" />
              Save Cash Voucher
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
