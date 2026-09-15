import React, { useState } from 'react';
import { X, Check, HandCoins, AlertCircle, Phone, Calendar } from 'lucide-react';
import { PersonalDebtIOU, ShopSettings } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface PersonalDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (iou: PersonalDebtIOU) => void;
  iou?: PersonalDebtIOU | null;
  settings: ShopSettings;
}

export const PersonalDebtModal: React.FC<PersonalDebtModalProps> = ({
  isOpen,
  onClose,
  onSave,
  iou,
  settings,
}) => {
  const [type, setType] = useState<'lent' | 'borrowed'>(iou?.type || 'lent');
  const [personName, setPersonName] = useState(iou?.personName || '');
  const [contactPhone, setContactPhone] = useState(iou?.contactPhone || '');
  const [totalAmount, setTotalAmount] = useState(iou ? String(iou.totalAmount) : '');
  const [paidAmount, setPaidAmount] = useState(iou ? String(iou.paidAmount) : '0');
  const [dueDate, setDueDate] = useState(iou?.dueDate || '');
  const [category, setCategory] = useState(iou?.category || 'Personal Loan');
  const [notes, setNotes] = useState(iou?.notes || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim()) {
      setError('Please provide the person or contact name.');
      return;
    }
    const total = parseFloat(totalAmount.replace(/,/g, ''));
    const paid = parseFloat(paidAmount.replace(/,/g, '')) || 0;
    if (isNaN(total) || total <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    const remaining = Math.max(0, total - paid);

    const record: PersonalDebtIOU = {
      id: iou ? iou.id : `iou-${Date.now()}`,
      type,
      personName: personName.trim(),
      contactPhone: contactPhone.trim() || undefined,
      totalAmount: total,
      paidAmount: paid,
      remainingAmount: remaining,
      dueDate: dueDate || undefined,
      status: remaining <= 0 ? 'settled' : 'active',
      category: category.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: iou?.createdAt || new Date().toISOString(),
      payments: iou?.payments || (paid > 0 ? [
        { id: `pay-${Date.now()}`, date: new Date().toISOString().split('T')[0], amount: paid, notes: 'Initial recorded repayment' }
      ] : []),
    };

    onSave(record);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {iou ? 'Edit Personal IOU Record' : 'Record Personal Debt / Loan'}
              </h3>
              <p className="text-xs text-slate-500">Track private money lent out or borrowed</p>
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
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
              IOU Direction
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setType('lent')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  type === 'lent'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Money Lent (They owe me)
              </button>
              <button
                type="button"
                onClick={() => setType('borrowed')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  type === 'borrowed'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Money Borrowed (I owe them)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Person / Contact Name *
              </label>
              <input
                type="text"
                required
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="e.g., Ko Zaw (Cousin)"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="09-xxxxxxxxx"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Total Principal ({settings.currencySymbol}) *
              </label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="500,000"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Already Repaid ({settings.currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Promised Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category / Label
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Family, Business Loan"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Agreement Memo / Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Terms, reason or repayment schedule notes..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
            />
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
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{iou ? 'Save Changes' : 'Record IOU'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
