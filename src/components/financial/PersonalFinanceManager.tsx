import React, { useState, useMemo } from 'react';
import { 
  Wallet, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Calendar, 
  Filter, 
  Download, 
  Printer, 
  Trash2, 
  Edit3, 
  Target, 
  PiggyBank, 
  HandCoins, 
  SlidersHorizontal, 
  Briefcase, 
  Landmark, 
  Smartphone, 
  CircleDollarSign, 
  AlertCircle, 
  CheckCircle2, 
  Check, 
  Clock, 
  Tag, 
  Info,
  Phone,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { 
  PersonalWallet, 
  PersonalTransaction, 
  PersonalBudget, 
  PersonalSavingsGoal, 
  PersonalDebtIOU, 
  ShopSettings, 
  StaffUser,
  AppTab,
  CashDrawerRecord,
  Sale,
  ExpenseRecord
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { StorageService } from '../../utils/storage';
import { PERSONAL_CATEGORIES } from '../../data/initialPersonalFinance';
import { PersonalTransactionModal } from './personal/PersonalTransactionModal';
import { PersonalWalletModal } from './personal/PersonalWalletModal';
import { PersonalTransferModal } from './personal/PersonalTransferModal';
import { PersonalGoalModal } from './personal/PersonalGoalModal';
import { PersonalDebtModal } from './personal/PersonalDebtModal';
import { PersonalBudgetModal } from './personal/PersonalBudgetModal';

type SubView = 'overview' | 'transactions' | 'wallets' | 'business_flow' | 'budgets' | 'savings_goals' | 'debts';

interface PersonalFinanceManagerProps {
  settings: ShopSettings;
  currentStaffUser?: StaffUser;
  cashDrawer?: CashDrawerRecord;
  sales?: Sale[];
  expenses?: ExpenseRecord[];
  onNavigateTab?: (tab: AppTab) => void;
}

export const PersonalFinanceManager: React.FC<PersonalFinanceManagerProps> = ({
  settings,
  currentStaffUser,
  cashDrawer,
  sales = [],
  expenses = [],
  onNavigateTab,
}) => {
  // Navigation sub-tab
  const [subView, setSubView] = useState<SubView>('overview');

  // Core Data States
  const [wallets, setWallets] = useState<PersonalWallet[]>(() => StorageService.getPersonalWallets());
  const [transactions, setTransactions] = useState<PersonalTransaction[]>(() => StorageService.getPersonalTransactions());
  const [budgets, setBudgets] = useState<PersonalBudget[]>(() => StorageService.getPersonalBudgets());
  const [savingsGoals, setSavingsGoals] = useState<PersonalSavingsGoal[]>(() => StorageService.getPersonalSavingsGoals());
  const [debts, setDebts] = useState<PersonalDebtIOU[]>(() => StorageService.getPersonalDebts());

  // Filters for Transactions View
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [walletFilter, setWalletFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'this_month' | 'last_month' | 'this_year' | 'all'>('this_month');

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<PersonalTransaction | null>(null);
  const [txInitialType, setTxInitialType] = useState<PersonalTransaction['type']>('expense');

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<PersonalWallet | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [fromWalletTransfer, setFromWalletTransfer] = useState<string | undefined>(undefined);

  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<PersonalSavingsGoal | null>(null);

  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<PersonalDebtIOU | null>(null);

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<PersonalBudget | null>(null);

  // Quick Action Modal for Goal Contribution
  const [contributeGoal, setContributeGoal] = useState<PersonalSavingsGoal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeWalletId, setContributeWalletId] = useState(wallets[0]?.id || '');

  // Quick Action Modal for Debt Payment
  const [repayDebt, setRepayDebt] = useState<PersonalDebtIOU | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayWalletId, setRepayWalletId] = useState(wallets[0]?.id || '');

  // Total Personal Liquidity (sum of all wallets)
  const totalNetWorth = useMemo(() => {
    return wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
  }, [wallets]);

  // Current Month String (e.g., '2026-09')
  const currentMonthPrefix = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const lastMonthPrefix = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Filtered transactions by selected date range, type, wallet, and search
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Date filter
      if (dateFilter === 'this_month') {
        if (!t.date.startsWith(currentMonthPrefix)) return false;
      } else if (dateFilter === 'last_month') {
        if (!t.date.startsWith(lastMonthPrefix)) return false;
      } else if (dateFilter === 'this_year') {
        const year = new Date().getFullYear().toString();
        if (!t.date.startsWith(year)) return false;
      }

      // Type filter
      if (typeFilter !== 'all') {
        if (typeFilter === 'business') {
          if (t.type !== 'drawing_from_business' && t.type !== 'injection_to_business') return false;
        } else if (t.type !== typeFilter) {
          return false;
        }
      }

      // Wallet filter
      if (walletFilter !== 'all') {
        if (t.walletId !== walletFilter && t.toWalletId !== walletFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const catMeta = PERSONAL_CATEGORIES.find(c => c.id === t.category);
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchPayee = (t.recipientOrPayer || '').toLowerCase().includes(q);
        const matchCategory = (catMeta?.name || '').toLowerCase().includes(q);
        if (!matchTitle && !matchNotes && !matchPayee && !matchCategory) return false;
      }

      return true;
    });
  }, [transactions, dateFilter, typeFilter, walletFilter, searchQuery, currentMonthPrefix, lastMonthPrefix]);

  // Monthly stats (current month)
  const currentMonthStats = useMemo(() => {
    const mtx = transactions.filter(t => t.date.startsWith(currentMonthPrefix));
    let totalIncome = 0;
    let totalExpense = 0;
    let businessDrawings = 0;
    let businessInjections = 0;

    mtx.forEach(t => {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') totalExpense += t.amount;
      else if (t.type === 'drawing_from_business') businessDrawings += t.amount;
      else if (t.type === 'injection_to_business') businessInjections += t.amount;
    });

    const netCashFlow = (totalIncome + businessDrawings) - (totalExpense + businessInjections);
    const savingsRate = (totalIncome + businessDrawings) > 0 
      ? Math.max(0, (netCashFlow / (totalIncome + businessDrawings)) * 100) 
      : 0;

    return {
      totalIncome,
      totalExpense,
      businessDrawings,
      businessInjections,
      totalInflow: totalIncome + businessDrawings,
      totalOutflow: totalExpense + businessInjections,
      netCashFlow,
      savingsRate,
    };
  }, [transactions, currentMonthPrefix]);

  // Spending per category this month
  const categorySpendingThisMonth = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter(t => t.date.startsWith(currentMonthPrefix) && (t.type === 'expense' || t.type === 'injection_to_business'))
      .forEach(t => {
        map.set(t.category, (map.get(t.category) || 0) + t.amount);
      });
    return map;
  }, [transactions, currentMonthPrefix]);

  // Handler: Save transaction
  const handleSaveTransaction = (tx: PersonalTransaction) => {
    StorageService.savePersonalTransaction(tx);
    setTransactions(StorageService.getPersonalTransactions());
    setWallets(StorageService.getPersonalWallets());
  };

  // Handler: Delete transaction
  const handleDeleteTransaction = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction? Wallet balances will be adjusted accordingly.')) return;
    StorageService.deletePersonalTransaction(id);
    setTransactions(StorageService.getPersonalTransactions());
    setWallets(StorageService.getPersonalWallets());
  };

  // Handler: Save wallet
  const handleSaveWallet = (wallet: PersonalWallet) => {
    StorageService.savePersonalWallet(wallet);
    setWallets(StorageService.getPersonalWallets());
  };

  // Handler: Delete wallet
  const handleDeleteWallet = (id: string) => {
    const w = wallets.find(item => item.id === id);
    if (!w) return;
    if (wallets.length <= 1) {
      alert('You must have at least one active personal wallet.');
      return;
    }
    if (w.balance > 0) {
      if (!window.confirm(`This wallet has an active balance of ${formatCurrency(w.balance, settings.currencySymbol)}. Are you sure you want to delete it?`)) return;
    } else {
      if (!window.confirm(`Delete wallet "${w.name}"?`)) return;
    }
    StorageService.deletePersonalWallet(id);
    setWallets(StorageService.getPersonalWallets());
  };

  // Handler: Save savings goal
  const handleSaveGoal = (goal: PersonalSavingsGoal) => {
    StorageService.savePersonalSavingsGoal(goal);
    setSavingsGoals(StorageService.getPersonalSavingsGoals());
  };

  const handleDeleteGoal = (id: string) => {
    if (!window.confirm('Delete this savings goal?')) return;
    StorageService.deletePersonalSavingsGoal(id);
    setSavingsGoals(StorageService.getPersonalSavingsGoals());
  };

  // Handler: Contribute to savings goal
  const handleContributeGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributeGoal) return;
    const amount = parseFloat(contributeAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) return;

    // Deduct from wallet if selected
    if (contributeWalletId) {
      const sourceW = wallets.find(w => w.id === contributeWalletId);
      if (sourceW && sourceW.balance < amount) {
        alert('Insufficient wallet balance to allocate this contribution.');
        return;
      }
      // Record personal expense or transfer
      const tx: PersonalTransaction = {
        id: `ptx-goal-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        type: 'expense',
        amount,
        walletId: contributeWalletId,
        category: 'investments',
        title: `Goal Contribution: ${contributeGoal.title}`,
        notes: `Allocated to savings goal "${contributeGoal.title}"`,
        createdAt: new Date().toISOString(),
      };
      StorageService.savePersonalTransaction(tx);
      setTransactions(StorageService.getPersonalTransactions());
      setWallets(StorageService.getPersonalWallets());
    }

    const updatedGoal: PersonalSavingsGoal = {
      ...contributeGoal,
      currentAmount: contributeGoal.currentAmount + amount,
      isCompleted: (contributeGoal.currentAmount + amount) >= contributeGoal.targetAmount,
      contributions: [
        ...(contributeGoal.contributions || []),
        { id: `c-${Date.now()}`, date: new Date().toISOString().split('T')[0], amount, walletId: contributeWalletId, notes: 'Direct contribution' }
      ]
    };
    StorageService.savePersonalSavingsGoal(updatedGoal);
    setSavingsGoals(StorageService.getPersonalSavingsGoals());
    setContributeGoal(null);
    setContributeAmount('');
  };

  // Handler: Save debt IOU
  const handleSaveDebt = (debt: PersonalDebtIOU) => {
    StorageService.savePersonalDebt(debt);
    setDebts(StorageService.getPersonalDebts());
  };

  const handleDeleteDebt = (id: string) => {
    if (!window.confirm('Delete this IOU record?')) return;
    StorageService.deletePersonalDebt(id);
    setDebts(StorageService.getPersonalDebts());
  };

  // Handler: Repay debt
  const handleRepayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayDebt) return;
    const amount = parseFloat(repayAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) return;

    if (repayWalletId) {
      const tx: PersonalTransaction = {
        id: `ptx-iou-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        type: repayDebt.type === 'lent' ? 'income' : 'expense',
        amount,
        walletId: repayWalletId,
        category: 'personal_debt_pay',
        title: repayDebt.type === 'lent' ? `Repayment Received: ${repayDebt.personName}` : `Debt Repaid to: ${repayDebt.personName}`,
        notes: `IOU reference: ${repayDebt.notes || ''}`,
        createdAt: new Date().toISOString(),
      };
      StorageService.savePersonalTransaction(tx);
      setTransactions(StorageService.getPersonalTransactions());
      setWallets(StorageService.getPersonalWallets());
    }

    const newPaid = repayDebt.paidAmount + amount;
    const newRemaining = Math.max(0, repayDebt.totalAmount - newPaid);
    const updatedDebt: PersonalDebtIOU = {
      ...repayDebt,
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newRemaining <= 0 ? 'settled' : 'active',
      payments: [
        ...(repayDebt.payments || []),
        { id: `p-${Date.now()}`, date: new Date().toISOString().split('T')[0], amount, walletId: repayWalletId }
      ]
    };
    StorageService.savePersonalDebt(updatedDebt);
    setDebts(StorageService.getPersonalDebts());
    setRepayDebt(null);
    setRepayAmount('');
  };

  // Handler: Save budget
  const handleSaveBudget = (budget: PersonalBudget) => {
    const existing = StorageService.getPersonalBudgets();
    const idx = existing.findIndex(b => b.category === budget.category);
    let updated: PersonalBudget[];
    if (idx >= 0) {
      updated = existing.map(b => b.category === budget.category ? budget : b);
    } else {
      updated = [...existing, budget];
    }
    StorageService.savePersonalBudgets(updated);
    setBudgets(updated);
  };

  const handleDeleteBudget = (id: string) => {
    if (!window.confirm('Remove this category budget?')) return;
    const updated = budgets.filter(b => b.id !== id);
    StorageService.savePersonalBudgets(updated);
    setBudgets(updated);
  };

  // Export CSV of personal transactions
  const handleExportCsv = () => {
    const headers = ['Transaction ID', 'Date', 'Time', 'Type', 'Title', 'Category', 'Amount', 'Wallet', 'Payee/Payer', 'Notes'];
    const rows = filteredTransactions.map(t => {
      const srcW = wallets.find(w => w.id === t.walletId);
      const catMeta = PERSONAL_CATEGORIES.find(c => c.id === t.category);
      return [
        t.id,
        t.date,
        t.time || '',
        t.type,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${catMeta?.name || t.category}"`,
        t.amount,
        `"${srcW?.name || t.walletId}"`,
        `"${(t.recipientOrPayer || '').replace(/"/g, '""')}"`,
        `"${(t.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Personal_Finance_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                Financials Module
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Private & Owner Protected
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Wallet className="w-8 h-8 text-indigo-400 shrink-0" />
              <span>Personal Finance & Wealth</span>
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Track personal liquid net worth, living expense budgets, savings reserves, and seamlessly manage owner profit drawings & capital injections separated from store operations.
            </p>
          </div>

          {/* Quick Action Button Group */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingTx(null);
                setTxInitialType('expense');
                setIsTxModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Transaction</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTransferModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Quick Transfer</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingTx(null);
                setTxInitialType('drawing_from_business');
                setIsTxModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Draw / Inject</span>
            </button>
          </div>
        </div>

        {/* Highlight KPI Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Personal Net Worth
            </span>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">
              {formatCurrency(totalNetWorth, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Across {wallets.length} personal wallets & vaults
            </span>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" />
              <span>This Month Inflows</span>
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
              +{formatCurrency(currentMonthStats.totalInflow, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Drawings: {formatCurrency(currentMonthStats.businessDrawings, settings.currencySymbol)}
            </span>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              <span>This Month Outflows</span>
            </span>
            <div className="text-xl sm:text-2xl font-black text-rose-400 mt-1">
              -{formatCurrency(currentMonthStats.totalOutflow, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Living expenses & shop injections
            </span>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block">
              Net Savings & Cash Flow
            </span>
            <div className={`text-xl sm:text-2xl font-black mt-1 ${currentMonthStats.netCashFlow >= 0 ? 'text-indigo-400' : 'text-amber-400'}`}>
              {currentMonthStats.netCashFlow >= 0 ? '+' : ''}{formatCurrency(currentMonthStats.netCashFlow, settings.currencySymbol)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block font-medium">
              Savings Rate: {currentMonthStats.savingsRate.toFixed(1)}% of income
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSubView('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'overview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Overview & Net Worth</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('transactions')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'transactions'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Transactions Ledger ({transactions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('wallets')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'wallets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Wallets & Accounts ({wallets.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('business_flow')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'business_flow'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Store Equity & Drawings</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('budgets')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'budgets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Budgets & Spending</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('savings_goals')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'savings_goals'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Savings Goals ({savingsGoals.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('debts')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subView === 'debts'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>Personal IOUs ({debts.length})</span>
          </button>
        </div>

        {/* Global Export & Print */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            title="Export CSV"
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print Statement"
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SUBVIEW 1: OVERVIEW & NET WORTH DASHBOARD                 */}
      {/* ========================================================= */}
      {subView === 'overview' && (
        <div className="space-y-6">
          
          {/* Wallets Horizontal Cards Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-600" />
                <span>My Accounts & Reserves</span>
              </h3>
              <button
                type="button"
                onClick={() => setSubView('wallets')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
              >
                View all accounts →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
              {wallets.map(wallet => {
                const isCash = wallet.type === 'cash';
                const isBank = wallet.type === 'bank_account';
                const isMobile = wallet.type === 'mobile_wallet';
                const isSavings = wallet.type === 'savings';

                return (
                  <div 
                    key={wallet.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
                  >
                    <div 
                      className="absolute top-0 left-0 right-0 h-1" 
                      style={{ backgroundColor: wallet.color || '#3B82F6' }}
                    />
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 truncate">
                          {wallet.name}
                        </span>
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                          {isCash && <CircleDollarSign className="w-3.5 h-3.5 text-emerald-600" />}
                          {isBank && <Landmark className="w-3.5 h-3.5 text-blue-600" />}
                          {isMobile && <Smartphone className="w-3.5 h-3.5 text-amber-600" />}
                          {isSavings && <PiggyBank className="w-3.5 h-3.5 text-pink-600" />}
                        </div>
                      </div>

                      <div className="text-lg font-black text-slate-900 tracking-tight">
                        {formatCurrency(wallet.balance, settings.currencySymbol)}
                      </div>

                      {wallet.accountNumber && (
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {wallet.accountNumber}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-[11px]">
                      {wallet.isDefault ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Default
                        </span>
                      ) : (
                        <span className="text-slate-400 capitalize">{wallet.type.replace('_', ' ')}</span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setFromWalletTransfer(wallet.id);
                          setIsTransferModalOpen(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                      >
                        Transfer →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2-Column Grid: Category Spending Breakdown & Business Flow Alert */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Category Spending Bars (2 cols) */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Monthly Personal Expense Breakdown
                  </h3>
                  <p className="text-xs text-slate-500">
                    Active category spending compared to set monthly budgets
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('budgets')}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                >
                  Manage Budgets →
                </button>
              </div>

              <div className="space-y-4">
                {PERSONAL_CATEGORIES.filter(c => c.type === 'expense').map(cat => {
                  const spent = categorySpendingThisMonth.get(cat.id) || 0;
                  const budgetItem = budgets.find(b => b.category === cat.id);
                  const limit = budgetItem?.monthlyLimit || 0;
                  const percent = limit > 0 ? (spent / limit) * 100 : 0;
                  const isOver = limit > 0 && spent > limit;

                  if (spent === 0 && !budgetItem) return null;

                  return (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-semibold text-slate-700">{cat.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-800">
                            {formatCurrency(spent, settings.currencySymbol)}
                          </span>
                          {limit > 0 && (
                            <span className="text-slate-400 ml-1.5">
                              / {formatCurrency(limit, settings.currencySymbol)} ({percent.toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </div>

                      {limit > 0 && (
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOver 
                                ? 'bg-rose-500' 
                                : percent > 80 
                                  ? 'bg-amber-500' 
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, percent)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Owner Business Summary Card (1 col) */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-900 mb-2">
                  <Briefcase className="w-5 h-5 text-amber-700" />
                  <h3 className="text-sm font-bold">Store & Personal Equity Bridge</h3>
                </div>
                <p className="text-xs text-amber-800/80 leading-relaxed mb-4">
                  Keep clear records of when you draw funds from mobile shop profits or temporarily inject personal capital into store inventory.
                </p>

                <div className="space-y-3 bg-white/80 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Month Drawings Taken:</span>
                    <span className="font-black text-emerald-700">
                      +{formatCurrency(currentMonthStats.businessDrawings, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Month Capital Injected:</span>
                    <span className="font-black text-rose-700">
                      -{formatCurrency(currentMonthStats.businessInjections, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-amber-100">
                    <span className="font-bold text-slate-800">Net Owner Extraction:</span>
                    <span className="font-black text-indigo-900">
                      {formatCurrency(currentMonthStats.businessDrawings - currentMonthStats.businessInjections, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTx(null);
                    setTxInitialType('drawing_from_business');
                    setIsTxModalOpen(true);
                  }}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors text-center cursor-pointer"
                >
                  + Record Drawing or Injection
                </button>
              </div>
            </div>

          </div>

          {/* Recent 5 Transactions */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">
                Recent Personal Activity
              </h3>
              <button
                type="button"
                onClick={() => setSubView('transactions')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
              >
                View full ledger ({transactions.length}) →
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {transactions.slice(0, 5).map(tx => {
                const srcW = wallets.find(w => w.id === tx.walletId);
                const destW = tx.toWalletId ? wallets.find(w => w.id === tx.toWalletId) : null;
                const catMeta = PERSONAL_CATEGORIES.find(c => c.id === tx.category);

                const isExpense = tx.type === 'expense' || tx.type === 'injection_to_business';
                const isIncome = tx.type === 'income' || tx.type === 'drawing_from_business';

                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        isExpense ? 'bg-rose-50 text-rose-600' : isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {isExpense && <ArrowUpRight className="w-4 h-4" />}
                        {isIncome && <ArrowDownLeft className="w-4 h-4" />}
                        {tx.type === 'transfer' && <ArrowRightLeft className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800 truncate">{tx.title}</span>
                          {tx.syncWithBusiness && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              Shop Synced
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{formatDate(tx.date)} {tx.time}</span>
                          <span>•</span>
                          <span className="text-slate-600">{catMeta?.name || tx.category}</span>
                          <span>•</span>
                          <span className="font-medium text-slate-500">
                            {tx.type === 'transfer' ? `${srcW?.name} → ${destW?.name}` : srcW?.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-black text-sm ${
                        isExpense ? 'text-rose-600' : isIncome ? 'text-emerald-600' : 'text-indigo-600'
                      }`}>
                        {isExpense ? '-' : isIncome ? '+' : ''}{formatCurrency(tx.amount, settings.currencySymbol)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* SUBVIEW 2: TRANSACTIONS LEDGER                            */}
      {/* ========================================================= */}
      {subView === 'transactions' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              
              {/* Search */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search memo, category, payee..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_year">This Year</option>
                <option value="all">All Dates</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="all">All Types</option>
                <option value="expense">Expenses Only</option>
                <option value="income">Income Only</option>
                <option value="transfer">Transfers Only</option>
                <option value="business">Business Draw / Inject</option>
              </select>

              {/* Wallet Filter */}
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="all">All Wallets</option>
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">
                {filteredTransactions.length} records found
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingTx(null);
                  setTxInitialType('expense');
                  setIsTxModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Record</span>
              </button>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Title / Description</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Wallet / Account</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No personal transactions found matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map(tx => {
                      const srcW = wallets.find(w => w.id === tx.walletId);
                      const destW = tx.toWalletId ? wallets.find(w => w.id === tx.toWalletId) : null;
                      const catMeta = PERSONAL_CATEGORIES.find(c => c.id === tx.category);

                      const isExpense = tx.type === 'expense' || tx.type === 'injection_to_business';
                      const isIncome = tx.type === 'income' || tx.type === 'drawing_from_business';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            <span className="font-semibold text-slate-800">{formatDate(tx.date)}</span>
                            {tx.time && <span className="text-slate-400 ml-1.5">{tx.time}</span>}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                              tx.type === 'expense' 
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : tx.type === 'income'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : tx.type === 'transfer'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : tx.type === 'drawing_from_business'
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'bg-orange-50 text-orange-800 border border-orange-200'
                            }`}>
                              {tx.type === 'drawing_from_business' && 'Draw from Shop'}
                              {tx.type === 'injection_to_business' && 'Inject to Shop'}
                              {tx.type === 'expense' && 'Expense'}
                              {tx.type === 'income' && 'Income'}
                              {tx.type === 'transfer' && 'Transfer'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800 leading-snug">
                              {tx.title}
                            </div>
                            {tx.recipientOrPayer && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Payee / Payer: {tx.recipientOrPayer}
                              </div>
                            )}
                            {tx.notes && (
                              <div className="text-[11px] text-slate-500 italic mt-0.5">
                                "{tx.notes}"
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-medium text-slate-700">
                              {catMeta?.name || tx.category}
                            </span>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-slate-800">
                              {tx.type === 'transfer' ? (
                                <span className="flex items-center gap-1 text-indigo-700 font-bold">
                                  {srcW?.name} <ArrowRightLeft className="w-3 h-3" /> {destW?.name}
                                </span>
                              ) : (
                                srcW?.name || tx.walletId
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className={`font-black text-sm ${
                              isExpense ? 'text-rose-600' : isIncome ? 'text-emerald-600' : 'text-indigo-600'
                            }`}>
                              {isExpense ? '-' : isIncome ? '+' : ''}{formatCurrency(tx.amount, settings.currencySymbol)}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTx(tx);
                                  setIsTxModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit transaction"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(tx.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete transaction"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBVIEW 3: WALLETS & ACCOUNTS                             */}
      {/* ========================================================= */}
      {subView === 'wallets' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Personal Wallets & Accounts</h2>
              <p className="text-xs text-slate-500">Manage bank accounts, digital wallets, cash in safe, and savings vaults</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingWallet(null);
                setIsWalletModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Wallet</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.map(wallet => (
              <div 
                key={wallet.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between"
              >
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5" 
                  style={{ backgroundColor: wallet.color || '#3B82F6' }}
                />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {wallet.type.replace('_', ' ')}
                    </span>
                    {wallet.isDefault && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Default Primary
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    {wallet.name}
                  </h3>

                  <div className="text-2xl font-black text-slate-900 tracking-tight mt-2">
                    {formatCurrency(wallet.balance, settings.currencySymbol)}
                  </div>

                  {wallet.accountNumber && (
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      Account / Phone: {wallet.accountNumber}
                    </p>
                  )}

                  {wallet.notes && (
                    <p className="text-xs text-slate-400 mt-2 italic">
                      "{wallet.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWallet(wallet);
                        setIsWalletModalOpen(true);
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-indigo-600 cursor-pointer"
                    >
                      Edit
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteWallet(wallet.id)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFromWalletTransfer(wallet.id);
                      setIsTransferModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    Transfer Funds →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBVIEW 4: STORE EQUITY & DRAWINGS                        */}
      {/* ========================================================= */}
      {subView === 'business_flow' && (
        <div className="space-y-6">
          <div className="bg-amber-500/10 border border-amber-200 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                <Briefcase className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-950">
                  Owner Drawings & Capital Injections (Store Bridge)
                </h3>
                <p className="text-xs text-amber-800 mt-1 max-w-3xl leading-relaxed">
                  Every retail entrepreneur needs to separate business capital from personal living money.
                  When you take profit withdrawals (Drawings), it is recorded here and can automatically deduct from store cash drawer/expenses.
                  When you inject emergency personal cash into the store to buy inventory, it counts as an Owner Capital Injection.
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTx(null);
                      setTxInitialType('drawing_from_business');
                      setIsTxModalOpen(true);
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    + Record Owner Drawing / Injection
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Drawings vs Injections Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Store Equity Movement History
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Flow Type</th>
                    <th className="py-2.5 px-4">Memo / Reason</th>
                    <th className="py-2.5 px-4">Personal Wallet</th>
                    <th className="py-2.5 px-4">Store Reconciliation</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions
                    .filter(t => t.type === 'drawing_from_business' || t.type === 'injection_to_business')
                    .map(tx => {
                      const w = wallets.find(item => item.id === tx.walletId);
                      const isDraw = tx.type === 'drawing_from_business';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 text-slate-700 font-semibold">{formatDate(tx.date)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isDraw ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {isDraw ? 'Owner Drawing (+ Personal)' : 'Capital Injection (- Personal)'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-800">{tx.title}</span>
                            {tx.notes && <p className="text-[11px] text-slate-500 italic mt-0.5">"{tx.notes}"</p>}
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{w?.name || tx.walletId}</td>
                          <td className="py-3 px-4">
                            {tx.syncWithBusiness ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Synced with Store Ledger
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Unlinked / Private</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-sm">
                            <span className={isDraw ? 'text-emerald-700' : 'text-rose-700'}>
                              {isDraw ? '+' : '-'}{formatCurrency(tx.amount, settings.currencySymbol)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBVIEW 5: BUDGETS & SPENDING LIMITS                      */}
      {/* ========================================================= */}
      {subView === 'budgets' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Monthly Spending Budgets</h2>
              <p className="text-xs text-slate-500">Set monthly limits for living expenses to enforce personal financial discipline</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingBudget(null);
                setIsBudgetModalOpen(true);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Set Category Budget</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map(budget => {
              const catMeta = PERSONAL_CATEGORIES.find(c => c.id === budget.category);
              const spent = categorySpendingThisMonth.get(budget.category) || 0;
              const percent = budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0;
              const isOver = spent > budget.monthlyLimit;
              const remaining = Math.max(0, budget.monthlyLimit - spent);

              return (
                <div key={budget.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: budget.color || '#8B5CF6' }}
                        />
                        <h4 className="font-bold text-slate-800 text-sm">
                          {catMeta?.name || budget.category}
                        </h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isOver ? 'bg-rose-100 text-rose-800' : percent > 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {percent.toFixed(0)}% Used
                      </span>
                    </div>

                    <div className="space-y-1 mb-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-black text-slate-900">
                          {formatCurrency(spent, settings.currencySymbol)}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">
                          Cap: {formatCurrency(budget.monthlyLimit, settings.currencySymbol)}
                        </span>
                      </div>

                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mt-2">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            isOver ? 'bg-rose-500' : percent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      {isOver ? (
                        <span className="text-rose-600 font-bold">
                          Over budget by {formatCurrency(spent - budget.monthlyLimit, settings.currencySymbol)}!
                        </span>
                      ) : (
                        <span>
                          {formatCurrency(remaining, settings.currencySymbol)} remaining this month
                        </span>
                      )}
                    </p>

                    {budget.notes && (
                      <p className="text-[11px] text-slate-400 mt-2 italic">
                        "{budget.notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBudget(budget);
                        setIsBudgetModalOpen(true);
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-indigo-600 cursor-pointer"
                    >
                      Edit Limit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBudget(budget.id)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBVIEW 6: SAVINGS GOALS                                  */}
      {/* ========================================================= */}
      {subView === 'savings_goals' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Savings Goals & Wealth Targets</h2>
              <p className="text-xs text-slate-500">Track progress towards long-term safety buffers, car upgrades, and gold investments</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingGoal(null);
                setIsGoalModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Savings Target</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {savingsGoals.map(goal => {
              const percent = (goal.currentAmount / goal.targetAmount) * 100;
              const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

              return (
                <div key={goal.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {goal.category || 'Savings Target'}
                      </span>
                      {goal.isCompleted ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Goal Achieved
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-indigo-600">
                          {percent.toFixed(0)}% Saved
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {goal.title}
                    </h3>

                    <div className="mt-3 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-black text-emerald-700">
                          {formatCurrency(goal.currentAmount, settings.currencySymbol)}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          Target: {formatCurrency(goal.targetAmount, settings.currencySymbol)}
                        </span>
                      </div>

                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mt-2">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all"
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-500 space-y-1">
                      {goal.targetDate && (
                        <p className="flex items-center gap-1 text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Deadline: {formatDate(goal.targetDate)}</span>
                        </p>
                      )}
                      {!goal.isCompleted && (
                        <p className="text-slate-600 font-medium">
                          Needs {formatCurrency(remaining, settings.currencySymbol)} more to reach target
                        </p>
                      )}
                      {goal.notes && (
                        <p className="text-[11px] text-slate-400 italic">
                          "{goal.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGoal(goal);
                          setIsGoalModalOpen(true);
                        }}
                        className="text-xs text-slate-500 hover:text-indigo-600 font-semibold cursor-pointer"
                      >
                        Edit
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setContributeGoal(goal);
                        setContributeAmount('');
                      }}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      + Add Savings Deposit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBVIEW 7: PERSONAL IOUs (Lent / Borrowed)                 */}
      {/* ========================================================= */}
      {subView === 'debts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Personal IOUs & Loans</h2>
              <p className="text-xs text-slate-500">Track private money lent to relatives/friends or borrowed from personal contacts</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingDebt(null);
                setIsDebtModalOpen(true);
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record Personal IOU</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debts.map(iou => {
              const isLent = iou.type === 'lent'; // someone owes me
              const isSettled = iou.remainingAmount <= 0;

              return (
                <div key={iou.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isLent ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isLent ? 'Money Lent (They owe me)' : 'Money Borrowed (I owe them)'}
                      </span>
                      {isSettled ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Fully Settled
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-700">
                          Active Unsettled
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {iou.personName}
                    </h3>

                    {iou.contactPhone && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{iou.contactPhone}</span>
                      </p>
                    )}

                    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl my-3 border border-slate-100 text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total</span>
                        <span className="text-xs font-bold text-slate-800">{formatCurrency(iou.totalAmount, settings.currencySymbol)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Paid Back</span>
                        <span className="text-xs font-bold text-emerald-600">{formatCurrency(iou.paidAmount, settings.currencySymbol)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Remaining</span>
                        <span className={`text-xs font-black ${isSettled ? 'text-slate-400' : 'text-rose-600'}`}>
                          {formatCurrency(iou.remainingAmount, settings.currencySymbol)}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1">
                      {iou.dueDate && (
                        <p className="flex items-center gap-1 text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Due date: {formatDate(iou.dueDate)}</span>
                        </p>
                      )}
                      {iou.notes && (
                        <p className="text-[11px] text-slate-400 italic">
                          "{iou.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDebt(iou);
                          setIsDebtModalOpen(true);
                        }}
                        className="text-xs text-slate-500 hover:text-indigo-600 font-semibold cursor-pointer"
                      >
                        Edit
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDebt(iou.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>

                    {!isSettled && (
                      <button
                        type="button"
                        onClick={() => {
                          setRepayDebt(iou);
                          setRepayAmount(String(iou.remainingAmount));
                        }}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        + Record Payment
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS SECTION                                            */}
      {/* ========================================================= */}

      {/* 1. Transaction Modal */}
      {isTxModalOpen && (
        <PersonalTransactionModal
          isOpen={isTxModalOpen}
          onClose={() => setIsTxModalOpen(false)}
          onSave={handleSaveTransaction}
          wallets={wallets}
          settings={settings}
          initialType={txInitialType}
          editingTransaction={editingTx}
        />
      )}

      {/* 2. Wallet Modal */}
      {isWalletModalOpen && (
        <PersonalWalletModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          onSave={handleSaveWallet}
          wallet={editingWallet}
          settings={settings}
        />
      )}

      {/* 3. Inter-Wallet Transfer Modal */}
      {isTransferModalOpen && (
        <PersonalTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setFromWalletTransfer(undefined);
          }}
          onSave={handleSaveTransaction}
          wallets={wallets}
          settings={settings}
          initialFromWalletId={fromWalletTransfer}
        />
      )}

      {/* 4. Goal Modal */}
      {isGoalModalOpen && (
        <PersonalGoalModal
          isOpen={isGoalModalOpen}
          onClose={() => setIsGoalModalOpen(false)}
          onSave={handleSaveGoal}
          goal={editingGoal}
          settings={settings}
          wallets={wallets}
        />
      )}

      {/* 5. Debt Modal */}
      {isDebtModalOpen && (
        <PersonalDebtModal
          isOpen={isDebtModalOpen}
          onClose={() => setIsDebtModalOpen(false)}
          onSave={handleSaveDebt}
          iou={editingDebt}
          settings={settings}
        />
      )}

      {/* 6. Budget Modal */}
      {isBudgetModalOpen && (
        <PersonalBudgetModal
          isOpen={isBudgetModalOpen}
          onClose={() => setIsBudgetModalOpen(false)}
          onSave={handleSaveBudget}
          budget={editingBudget}
          settings={settings}
        />
      )}

      {/* 7. Quick Goal Contribution Modal */}
      {contributeGoal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-5 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-slate-800">
              Deposit to: {contributeGoal.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Add savings contribution from one of your personal accounts
            </p>

            <form onSubmit={handleContributeGoalSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contribution Amount ({settings.currencySymbol}) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  placeholder="e.g., 200,000"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Source Wallet
                </label>
                <select
                  value={contributeWalletId}
                  onChange={(e) => setContributeWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatCurrency(w.balance, settings.currencySymbol)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setContributeGoal(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm cursor-pointer"
                >
                  Confirm Deposit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Quick Repay Debt Modal */}
      {repayDebt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-5 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-slate-800">
              Record Payment: {repayDebt.personName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {repayDebt.type === 'lent' ? 'Collecting repayment on money lent' : 'Paying back money borrowed'}
            </p>

            <form onSubmit={handleRepayDebtSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Amount ({settings.currencySymbol}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={repayDebt.remainingAmount}
                  step="any"
                  required
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Affected Wallet
                </label>
                <select
                  value={repayWalletId}
                  onChange={(e) => setRepayWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatCurrency(w.balance, settings.currencySymbol)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRepayDebt(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm cursor-pointer"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
