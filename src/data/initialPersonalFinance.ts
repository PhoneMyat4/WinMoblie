import { 
  PersonalWallet, 
  PersonalTransaction, 
  PersonalBudget, 
  PersonalSavingsGoal, 
  PersonalDebtIOU 
} from '../types';

export interface PersonalCategoryMeta {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
  bgLight: string;
}

export const PERSONAL_CATEGORIES: PersonalCategoryMeta[] = [
  // Expense categories
  { id: 'food_dining', name: 'Food, Groceries & Dining', type: 'expense', icon: 'Utensils', color: '#10B981', bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'housing_bills', name: 'Housing, Rent & Home Bills', type: 'expense', icon: 'Home', color: '#6366F1', bgLight: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'transport_fuel', name: 'Vehicle, Fuel & Commute', type: 'expense', icon: 'Car', color: '#F59E0B', bgLight: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'family_children', name: 'Family & Children Care', type: 'expense', icon: 'Heart', color: '#EC4899', bgLight: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'health_medical', name: 'Health, Wellness & Medical', type: 'expense', icon: 'Activity', color: '#EF4444', bgLight: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'shopping_lifestyle', name: 'Personal Shopping & Gadgets', type: 'expense', icon: 'ShoppingBag', color: '#8B5CF6', bgLight: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'entertainment_travel', name: 'Entertainment & Travel', type: 'expense', icon: 'Film', color: '#06B6D4', bgLight: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'education_books', name: 'Education & Self-Growth', type: 'expense', icon: 'GraduationCap', color: '#3B82F6', bgLight: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'donations_charity', name: 'Merit, Charity & Donation', type: 'expense', icon: 'Gift', color: '#14B8A6', bgLight: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'personal_debt_pay', name: 'Personal Debt Repayment', type: 'expense', icon: 'CreditCard', color: '#64748B', bgLight: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'other_personal', name: 'Miscellaneous Outflow', type: 'expense', icon: 'Tag', color: '#64748B', bgLight: 'bg-slate-100 text-slate-700 border-slate-200' },

  // Income categories
  { id: 'shop_profit_draw', name: 'Store Profit Drawing / Dividends', type: 'income', icon: 'TrendingUp', color: '#10B981', bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'salary_allowance', name: 'Personal Salary & Allowance', type: 'income', icon: 'Briefcase', color: '#3B82F6', bgLight: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'side_business', name: 'Side Freelance & Consultations', type: 'income', icon: 'Sparkles', color: '#8B5CF6', bgLight: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'investments', name: 'Investment, Gold & Interest', type: 'income', icon: 'Coins', color: '#F59E0B', bgLight: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'gifts_family', name: 'Family Gifts & Allowances', type: 'income', icon: 'HeartHandshake', color: '#EC4899', bgLight: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'other_income', name: 'Other Personal Inflows', type: 'income', icon: 'PlusCircle', color: '#14B8A6', bgLight: 'bg-teal-50 text-teal-700 border-teal-200' },
];

export const initialPersonalWallets: PersonalWallet[] = [];
export const initialPersonalTransactions: PersonalTransaction[] = [];
export const initialPersonalBudgets: PersonalBudget[] = [];
export const initialPersonalSavingsGoals: PersonalSavingsGoal[] = [];
export const initialPersonalDebts: PersonalDebtIOU[] = [];
