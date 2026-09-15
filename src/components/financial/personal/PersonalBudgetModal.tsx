import React, { useState } from 'react';
import { X, Check, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { PersonalBudget, ShopSettings } from '../../../types';
import { PERSONAL_CATEGORIES } from '../../../data/initialPersonalFinance';
import { formatCurrency } from '../../../utils/formatters';

interface PersonalBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (budget: PersonalBudget) => void;
  budget?: PersonalBudget | null;
  settings: ShopSettings;
}

export const PersonalBudgetModal: React.FC<PersonalBudgetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  budget,
  settings,
}) => {
  const expenseCategories = PERSONAL_CATEGORIES.filter(c => c.type === 'expense');
  const [category, setCategory] = useState(budget?.category || expenseCategories[0].id);
  const [monthlyLimit, setMonthlyLimit] = useState(budget ? String(budget.monthlyLimit) : '');
  const [notes, setNotes] = useState(budget?.notes || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(monthlyLimit.replace(/,/g, ''));
    if (isNaN(limit) || limit <= 0) {
      setError('Please provide a valid positive monthly limit.');
      return;
    }

    const catMeta = PERSONAL_CATEGORIES.find(c => c.id === category);

    const record: PersonalBudget = {
      id: budget ? budget.id : `bgt-${Date.now()}`,
      category,
      monthlyLimit: limit,
      period: 'monthly_default',
      color: catMeta?.color || '#3B82F6',
      notes: notes.trim() || undefined,
    };

    onSave(record);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {budget ? 'Edit Category Budget' : 'Set Monthly Category Budget'}
              </h3>
              <p className="text-xs text-slate-500">Enforce disciplined spending caps per month</p>
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
              Expense Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500"
            >
              {expenseCategories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Monthly Cap ({settings.currencySymbol}) *
            </label>
            <input
              type="number"
              min="1"
              step="any"
              required
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              placeholder="e.g., 500,000"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Budget Goal / Guidelines
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Target saving at least 20% on outside dining"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-purple-500"
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
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Budget</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
