import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Check, 
  Tag, 
  Store, 
  Zap, 
  Users, 
  Wifi, 
  Megaphone, 
  Coffee, 
  Package, 
  Truck, 
  FileText, 
  DollarSign, 
  Wrench, 
  Fuel, 
  ShoppingBag, 
  Shield, 
  Heart, 
  Sparkles, 
  Building2, 
  Smartphone, 
  Laptop, 
  Settings, 
  CreditCard, 
  Briefcase, 
  Flame, 
  Gift, 
  Layers,
  AlertTriangle,
  Search,
  Lock
} from 'lucide-react';
import { ExpenseCategoryItem, ExpenseRecord } from '../../types';
import { formatCurrency, getBadgeClassForColor } from '../../utils/formatters';

export const isProtectedExpenseCategory = (category: ExpenseCategoryItem | string): boolean => {
  if (!category) return false;
  const id = typeof category === 'string' ? category : category.id;
  const name = typeof category === 'string' ? '' : (category.name || '');
  return (
    id === 'transport_delivery' ||
    (typeof category !== 'string' && (category.isPermanent === true || category.isSystem === true)) ||
    name.toLowerCase().trim() === 'transport & stock delivery'
  );
};

interface ExpenseCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategoryItem[];
  expenses: ExpenseRecord[];
  currencySymbol: string;
  onSaveCategory: (category: ExpenseCategoryItem) => void;
  onDeleteCategory: (id: string, reassignToId?: string) => void;
  onResetCategories: () => void;
  initialEditingCategory?: ExpenseCategoryItem | null;
  onCategoryCreated?: (newCategory: ExpenseCategoryItem) => void;
}

const AVAILABLE_COLORS = [
  { id: 'rose', name: 'Rose Red', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  { id: 'amber', name: 'Amber Gold', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  { id: 'emerald', name: 'Emerald Green', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'blue', name: 'Royal Blue', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  { id: 'cyan', name: 'Cyan Sky', bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
  { id: 'indigo', name: 'Indigo Deep', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  { id: 'purple', name: 'Purple Violet', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  { id: 'pink', name: 'Pink Magenta', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
  { id: 'orange', name: 'Sunset Orange', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  { id: 'teal', name: 'Teal Aqua', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500' },
  { id: 'slate', name: 'Slate Neutral', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500' },
];

const AVAILABLE_ICONS = [
  { id: 'Tag', label: 'Tag', icon: Tag },
  { id: 'Store', label: 'Store', icon: Store },
  { id: 'Zap', label: 'Electricity', icon: Zap },
  { id: 'Users', label: 'Salary/Staff', icon: Users },
  { id: 'Wifi', label: 'Internet', icon: Wifi },
  { id: 'Megaphone', label: 'Ads/Marketing', icon: Megaphone },
  { id: 'Coffee', label: 'Food/Meals', icon: Coffee },
  { id: 'Package', label: 'Packaging', icon: Package },
  { id: 'Truck', label: 'Delivery/Transport', icon: Truck },
  { id: 'FileText', label: 'Licenses/Bills', icon: FileText },
  { id: 'DollarSign', label: 'General Cash', icon: DollarSign },
  { id: 'Wrench', label: 'Repairs/Maint.', icon: Wrench },
  { id: 'Fuel', label: 'Fuel/Generator', icon: Fuel },
  { id: 'ShoppingBag', label: 'Supplies', icon: ShoppingBag },
  { id: 'Shield', label: 'Security/Insurance', icon: Shield },
  { id: 'Sparkles', label: 'Promotion/Bonus', icon: Sparkles },
  { id: 'Building2', label: 'Premises', icon: Building2 },
  { id: 'Smartphone', label: 'Mobile Topup', icon: Smartphone },
  { id: 'Laptop', label: 'IT/Hardware', icon: Laptop },
  { id: 'CreditCard', label: 'Bank Charges', icon: CreditCard },
  { id: 'Briefcase', label: 'Consulting', icon: Briefcase },
  { id: 'Flame', label: 'Gas/Heating', icon: Flame },
  { id: 'Gift', label: 'Staff Gift/Reward', icon: Gift },
  { id: 'Layers', label: 'Other Sundry', icon: Layers },
];

export const renderCategoryIcon = (iconName?: string, className = "w-4 h-4") => {
  const iconItem = AVAILABLE_ICONS.find(i => i.id === iconName);
  if (iconItem) {
    const IconComponent = iconItem.icon;
    return <IconComponent className={className} />;
  }
  return <Tag className={className} />;
};

export const ExpenseCategoryModal: React.FC<ExpenseCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  expenses,
  currencySymbol,
  onSaveCategory,
  onDeleteCategory,
  onResetCategories,
  initialEditingCategory,
  onCategoryCreated,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [isEditingMode, setIsEditingMode] = useState<boolean>(!!initialEditingCategory);
  const [editingId, setEditingId] = useState<string | null>(initialEditingCategory?.id || null);

  // Form State
  const [name, setName] = useState(initialEditingCategory?.name || '');
  const [description, setDescription] = useState(initialEditingCategory?.description || '');
  const [badgeColor, setBadgeColor] = useState(initialEditingCategory?.badgeColor || 'rose');
  const [icon, setIcon] = useState(initialEditingCategory?.icon || 'Tag');

  // Deletion Reassignment Modal State
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategoryItem | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('other_general');

  if (!isOpen) return null;

  // Aggregate category usage counts
  const categoryStats: Record<string, { count: number; total: number }> = {};
  expenses.forEach(e => {
    if (!categoryStats[e.category]) {
      categoryStats[e.category] = { count: 0, total: 0 };
    }
    categoryStats[e.category].count += 1;
    categoryStats[e.category].total += e.amount;
  });

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  const startCreateNew = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setBadgeColor('blue');
    setIcon('Tag');
    setIsEditingMode(true);
  };

  const startEditCategory = (cat: ExpenseCategoryItem) => {
    if (isProtectedExpenseCategory(cat)) {
      alert('The "Transport & Stock Delivery" category is a protected core system category and cannot be edited. It is automatically linked with Purchase Invoice delivery fees.');
      return;
    }
    setEditingId(cat.id);
    setName(cat.name);
    setDescription(cat.description || '');
    setBadgeColor(cat.badgeColor || 'slate');
    setIcon(cat.icon || 'Tag');
    setIsEditingMode(true);
  };

  const cancelEdit = () => {
    setIsEditingMode(false);
    setEditingId(null);
    setName('');
    setDescription('');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter a category name.');
      return;
    }

    if (editingId && isProtectedExpenseCategory(editingId)) {
      alert('The "Transport & Stock Delivery" category is protected and cannot be edited.');
      return;
    }

    const categoryId = editingId || `cat_${Date.now()}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16)}`;
    
    const existing = categories.find(c => c.id === categoryId);

    const savedCategory: ExpenseCategoryItem = {
      id: categoryId,
      name: name.trim(),
      description: description.trim() || undefined,
      badgeColor,
      icon,
      isDefault: existing?.isDefault ?? false,
    };

    onSaveCategory(savedCategory);
    if (onCategoryCreated) {
      onCategoryCreated(savedCategory);
    }
    setIsEditingMode(false);
    setEditingId(null);
    setName('');
    setDescription('');
  };

  const initiateDelete = (cat: ExpenseCategoryItem) => {
    if (isProtectedExpenseCategory(cat)) {
      alert('The "Transport & Stock Delivery" category is a protected core system category and cannot be deleted.');
      return;
    }
    const stats = categoryStats[cat.id];
    if (stats && stats.count > 0) {
      // Prompt for reassignment
      const defaultReplacement = categories.find(c => c.id !== cat.id && !isProtectedExpenseCategory(c))?.id || 'other_general';
      setReassignTargetId(defaultReplacement);
      setCategoryToDelete(cat);
    } else {
      if (confirm(`Are you sure you want to delete the expense category "${cat.name}"?`)) {
        onDeleteCategory(cat.id);
      }
    }
  };

  const confirmReassignAndDelete = () => {
    if (!categoryToDelete) return;
    onDeleteCategory(categoryToDelete.id, reassignTargetId);
    setCategoryToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh] animate-modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Customize Expense Categories</h3>
              <p className="text-xs text-slate-500">Add, edit, style, or reassign custom shop expense categories</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Top Actions & Search Bar */}
          {!isEditingMode && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter categories by name or keyword..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={startCreateNew}
                  className="flex-1 sm:flex-none px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Category
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Reset all expense categories to default presets? Custom categories will be restored to original factory list.')) {
                      onResetCategories();
                    }
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                  title="Reset to Defaults"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset Defaults</span>
                </button>
              </div>
            </div>
          )}

          {/* CREATE / EDIT FORM */}
          {isEditingMode ? (
            <form onSubmit={handleSaveForm} className="space-y-5 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-rose-600" />
                  {editingId ? 'Edit Expense Category' : 'Create New Expense Category'}
                </h4>
                
                {/* Live Preview Pill */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">Live Preview:</span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold border ${getBadgeClassForColor(badgeColor)}`}>
                    {renderCategoryIcon(icon, 'w-3.5 h-3.5')}
                    <span>{name.trim() || 'Category Name'}</span>
                  </span>
                </div>
              </div>

              {/* Name & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Generator Diesel Fuel"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Description / Usage Purpose</label>
                  <input
                    type="text"
                    placeholder="e.g. Daily generator fuel & power backup maintenance"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block font-bold text-slate-700 text-xs mb-2">Badge Color Palette</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {AVAILABLE_COLORS.map((c) => {
                    const isSelected = badgeColor === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setBadgeColor(c.id)}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-slate-900 bg-white ring-2 ring-slate-900/10 shadow-xs' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${c.dot} shrink-0 flex items-center justify-center`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-[11px] font-semibold text-slate-800 truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block font-bold text-slate-700 text-xs mb-2">Category Icon</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-44 overflow-y-auto p-1 bg-white rounded-xl border border-slate-200">
                  {AVAILABLE_ICONS.map((i) => {
                    const IconComp = i.icon;
                    const isSelected = icon === i.id;
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setIcon(i.id)}
                        className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300 shadow-2xs'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                        title={i.label}
                      >
                        <IconComp className="w-4 h-4" />
                        <span className="text-[9px] truncate max-w-[55px]">{i.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {editingId ? 'Save Changes' : 'Create Category'}
                </button>
              </div>

            </form>
          ) : (
            /* CATEGORIES LIST */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                <span>All Configured Categories ({filteredCategories.length})</span>
                <span>Usage in Ledger</span>
              </div>

              {filteredCategories.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400">
                  <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-xs">No expense categories match "{searchFilter}".</p>
                  <button
                    type="button"
                    onClick={startCreateNew}
                    className="mt-3 px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg border border-rose-200"
                  >
                    + Create "{searchFilter}" Category
                  </button>
                </div>
              ) : (
                filteredCategories.map((cat) => {
                  const stats = categoryStats[cat.id] || { count: 0, total: 0 };
                  const badgeClass = getBadgeClassForColor(cat.badgeColor || 'slate');
                  const isProtected = isProtectedExpenseCategory(cat);

                  return (
                    <div
                      key={cat.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors shadow-2xs gap-3 ${
                        isProtected ? 'bg-teal-50/50 border-teal-200' : 'bg-white hover:bg-slate-50/80 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border shrink-0 ${badgeClass}`}>
                          {renderCategoryIcon(cat.icon, 'w-3.5 h-3.5')}
                          <span>{cat.name}</span>
                        </span>
                        
                        <div className="min-w-0">
                          {cat.description ? (
                            <p className="text-[11px] text-slate-600 truncate max-w-sm">{cat.description}</p>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic">No notes</p>
                          )}
                          {isProtected && (
                            <p className="text-[10px] text-teal-700 font-semibold flex items-center gap-1 mt-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              <span>Core System Category • Auto-records Purchase Invoice Delivery Fees</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-800">
                            {stats.count} {stats.count === 1 ? 'voucher' : 'vouchers'}
                          </span>
                          {stats.total > 0 && (
                            <p className="text-[10px] text-rose-600 font-mono font-bold">
                              {formatCurrency(stats.total, currencySymbol)}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                          {isProtected ? (
                            <div 
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-100/80 text-teal-900 border border-teal-300 shadow-2xs"
                              title="System Protected Category: Cannot be edited or deleted. Automatically records Purchase Invoice delivery charges."
                            >
                              <Lock className="w-3 h-3 text-teal-700" />
                              <span>Protected</span>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditCategory(cat)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Edit Category"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => initiateDelete(cat)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Category"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Total {categories.length} active expense categories configured
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>

      {/* REASSIGN & DELETE MODAL (When deleting category with vouchers) */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4 animate-modal-content">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Reassign Vouchers Before Deleting</h4>
                <p className="text-xs text-slate-500">
                  Category "{categoryToDelete.name}" has {categoryStats[categoryToDelete.id]?.count || 0} recorded voucher(s).
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Please choose which category to reassign these existing vouchers to, so that your expense reports and audit trail remain accurate:
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Replacement Category:</label>
              <select
                value={reassignTargetId}
                onChange={(e) => setReassignTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
              >
                {categories
                  .filter(c => c.id !== categoryToDelete.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReassignAndDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
              >
                Reassign & Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
