import React, { useState } from 'react';
import { X, Check, Target, PiggyBank, Plus, AlertCircle } from 'lucide-react';
import { PersonalSavingsGoal, PersonalWallet, ShopSettings } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface PersonalGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (goal: PersonalSavingsGoal) => void;
  goal?: PersonalSavingsGoal | null;
  settings: ShopSettings;
  wallets?: PersonalWallet[];
}

export const PersonalGoalModal: React.FC<PersonalGoalModalProps> = ({
  isOpen,
  onClose,
  onSave,
  goal,
  settings,
}) => {
  const [title, setTitle] = useState(goal?.title || '');
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : '');
  const [currentAmount, setCurrentAmount] = useState(goal ? String(goal.currentAmount) : '0');
  const [targetDate, setTargetDate] = useState(goal?.targetDate || '');
  const [category, setCategory] = useState(goal?.category || 'General Savings');
  const [color, setColor] = useState(goal?.color || '#10B981');
  const [notes, setNotes] = useState(goal?.notes || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a goal title.');
      return;
    }
    const target = parseFloat(targetAmount.replace(/,/g, ''));
    const current = parseFloat(currentAmount.replace(/,/g, '')) || 0;
    if (isNaN(target) || target <= 0) {
      setError('Please provide a valid target amount.');
      return;
    }

    const newGoal: PersonalSavingsGoal = {
      id: goal ? goal.id : `goal-${Date.now()}`,
      title: title.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate: targetDate || undefined,
      category: category.trim() || undefined,
      color,
      isCompleted: current >= target,
      notes: notes.trim() || undefined,
      createdAt: goal?.createdAt || new Date().toISOString(),
      contributions: goal?.contributions || [
        { id: `c-${Date.now()}`, date: new Date().toISOString().split('T')[0], amount: current, notes: 'Initial balance' }
      ],
    };

    onSave(newGoal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {goal ? 'Edit Savings Goal' : 'Create Personal Savings Goal'}
              </h3>
              <p className="text-xs text-slate-500">Track target reserves, emergency buffers & major purchases</p>
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
              Goal Target Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 6-Month Living Reserve, Family Car Down Payment"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Amount ({settings.currencySymbol}) *
              </label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="10,000,000"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Saved So Far ({settings.currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Deadline (Optional)
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Vehicle, Gold, House"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Purpose & Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this goal matters and allocation strategy..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
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
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{goal ? 'Update Goal' : 'Save Goal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
