import React from 'react';
import { 
  Scale, 
  Wallet, 
  Banknote, 
  Package, 
  Receipt, 
  ArrowRight, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  PlusCircle, 
  MinusCircle, 
  TrendingUp, 
  TrendingDown, 
  HelpCircle,
  Landmark,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  ArrowRightLeft
} from 'lucide-react';
import { MonthlyCapitalSnapshot, RunningCapitalBreakdown, AppTab, Product, Sale, ExpenseRecord } from '../../types';
import { formatCurrency as rawFormatCurrency } from '../../utils/formatters';
import { CashPoolTransferModal } from './CashPoolTransferModal';
import { useFinancialPrivacy } from '../../utils/useFinancialPrivacy';

interface CapitalReconciliationViewProps {
  selectedMonth: string;
  currentMonthData: {
    grossRevenue: number;
    totalCogs: number;
    grossProfit: number;
    operatingExpenses?: number;
    inventoryScrapLosses?: number;
    totalExpenses: number;
    netOperatingProfit: number;
    grossMarginPct: number;
    netMarginPct: number;
  };
  currentRunningCapital: RunningCapitalBreakdown;
  currentSnapshot: MonthlyCapitalSnapshot | null;
  initialTotalCapital: number;
  initialCash: number;
  initialStock: number;
  capitalInjections: number;
  ownerDrawings: number;
  capitalMatchResult: {
    netProfit: number;
    netMarginPercent: number;
    isProfitable: boolean;
  };
  currencySymbol: string;
  onOpenCapitalModal: () => void;
  products: Product[];
  onNavigateTab?: (tab: AppTab) => void;
}

export const CapitalReconciliationView: React.FC<CapitalReconciliationViewProps> = ({
  selectedMonth,
  currentMonthData,
  currentRunningCapital,
  currentSnapshot,
  initialTotalCapital,
  initialCash,
  initialStock,
  capitalInjections,
  ownerDrawings,
  capitalMatchResult,
  currencySymbol,
  onOpenCapitalModal,
  products,
  onNavigateTab,
}) => {
  const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);
  const hasSnapshot = Boolean(currentSnapshot);
  const { formatAmount } = useFinancialPrivacy();

  // Internal currency formatter that respects privacy mask
  const formatCurrency = (amount: number, symbol?: string) => formatAmount(amount, symbol);

  // Accounting variance between Capital Match and P&L Net Operating Profit
  const variance = Math.abs(capitalMatchResult.netProfit - currentMonthData.netOperatingProfit);
  const isVarianceNearZero = variance < 1; // within 1 currency unit

  return (
    <div className="space-y-6">
      {/* 1. Top Notice if Snapshot is missing */}
      {!hasSnapshot && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-900">
                Starting Capital Snapshot Not Configured for {selectedMonth}
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                To track exact Net Profit by capital reconciliation (Ending Capital − Starting Capital), set your initial cash and inventory snapshot for this month.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenCapitalModal}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Set Month Starting Snapshot</span>
          </button>
        </div>
      )}

      {/* 2. Hero Formula Card: Ending Capital - Initial Capital = Net Profit */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-lg border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/40 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 flex items-center gap-1.5">
                  <Scale className="w-3 h-3 text-indigo-300" />
                  <span>Capital Match Equation • အရင်းအနှီးကိုက်ညှိခြင်း နည်းလမ်း</span>
                </span>
                {hasSnapshot ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Snapshot Active ({selectedMonth})</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Auto-Estimated
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Net Profit = (Ending Running Capital) − (Initial Starting Capital)
              </h2>
            </div>

            <button
              type="button"
              onClick={onOpenCapitalModal}
              className="px-3.5 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 self-start sm:self-auto border border-indigo-400/30 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{hasSnapshot ? 'Edit Starting Snapshot' : 'Set Starting Snapshot'}</span>
            </button>
          </div>

          {/* Master Equation Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Box A: Starting Capital */}
            <div className="md:col-span-4 bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 backdrop-blur-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  (A) Starting Capital
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">Month Start</span>
              </div>
              <p className="text-2xl font-black text-white">
                {formatCurrency(initialTotalCapital, currencySymbol)}
              </p>
              <div className="text-[11px] text-slate-300 pt-2 border-t border-slate-700/60 space-y-1">
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Initial Cash:</span>
                    <span className="font-semibold text-white">{formatCurrency(initialCash, currencySymbol)}</span>
                  </div>
                  {currentSnapshot && (currentSnapshot.initialPhysicalCash !== undefined || currentSnapshot.initialDigitalCash !== undefined) && (
                    <div className="flex justify-between text-[10px] text-amber-300/80 pl-2">
                      <span>• Cash Drawer: {formatCurrency(currentSnapshot.initialPhysicalCash ?? initialCash, currencySymbol)}</span>
                      <span>• Digital Pool: {formatCurrency(currentSnapshot.initialDigitalCash ?? 0, currencySymbol)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Initial Stock Cost:</span>
                    <span className="font-semibold text-white">{formatCurrency(initialStock, currencySymbol)}</span>
                  </div>
                  {currentSnapshot && Boolean(currentSnapshot.initialDigitalStockValuation && currentSnapshot.initialDigitalStockValuation > 0) && (
                    <div className="flex justify-between text-[10px] text-emerald-300/80 pl-2">
                      <span>• Physical Stock: {formatCurrency(currentSnapshot.initialPhysicalStockValuation ?? initialStock, currencySymbol)}</span>
                      <span>• Digital Stock: {formatCurrency(currentSnapshot.initialDigitalStockValuation ?? 0, currencySymbol)}</span>
                    </div>
                  )}
                </div>

                {capitalInjections > 0 && (
                  <div>
                    <div className="flex justify-between text-indigo-300">
                      <span>+ Injected Capital:</span>
                      <span className="font-semibold">+{formatCurrency(capitalInjections, currencySymbol)}</span>
                    </div>
                    {currentSnapshot && (currentSnapshot.capitalInjectionsPhysical !== undefined || currentSnapshot.capitalInjectionsDigital !== undefined) && (
                      <div className="flex justify-between text-[10px] text-indigo-400/80 pl-2">
                        <span>• Physical: +{formatCurrency(currentSnapshot.capitalInjectionsPhysical ?? capitalInjections, currencySymbol)}</span>
                        <span>• Digital: +{formatCurrency(currentSnapshot.capitalInjectionsDigital ?? 0, currencySymbol)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Operator Minus / Arrow */}
            <div className="hidden md:flex md:col-span-1 justify-center text-slate-400">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sm">
                →
              </div>
            </div>

            {/* Box B: Ending Capital */}
            <div className="md:col-span-4 bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 backdrop-blur-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  (B) Ending Running Capital
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">Live Position</span>
              </div>
              <p className="text-2xl font-black text-emerald-400">
                {formatCurrency(currentRunningCapital.totalRunningCapital, currencySymbol)}
              </p>
              <div className="text-[11px] text-slate-300 pt-2 border-t border-slate-700/60 space-y-1">
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Remaining Cash:</span>
                    <span className="font-semibold text-white">{formatCurrency(currentRunningCapital.totalRemainingCash, currencySymbol)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-amber-300/80 pl-2">
                    <span>• Cash Drawer: {formatCurrency(currentRunningCapital.cashInDrawer, currencySymbol)}</span>
                    <span>• Digital Pool: {formatCurrency(currentRunningCapital.digitalBankBalances, currencySymbol)}</span>
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining Stock:</span>
                  <span className="font-semibold text-white">{formatCurrency(currentRunningCapital.remainingStockValuation, currencySymbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Receivables (Credit):</span>
                  <span className="font-semibold text-white">{formatCurrency(currentRunningCapital.accountsReceivable, currencySymbol)}</span>
                </div>

                {ownerDrawings > 0 && (
                  <div>
                    <div className="flex justify-between text-amber-300">
                      <span>+ Owner Drawings:</span>
                      <span className="font-semibold">+{formatCurrency(ownerDrawings, currencySymbol)}</span>
                    </div>
                    {currentSnapshot && (currentSnapshot.ownerDrawingsPhysical !== undefined || currentSnapshot.ownerDrawingsDigital !== undefined) && (
                      <div className="flex justify-between text-[10px] text-amber-400/80 pl-2">
                        <span>• Physical: +{formatCurrency(currentSnapshot.ownerDrawingsPhysical ?? ownerDrawings, currencySymbol)}</span>
                        <span>• Digital: +{formatCurrency(currentSnapshot.ownerDrawingsDigital ?? 0, currencySymbol)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Operator Equals */}
            <div className="hidden md:flex md:col-span-1 justify-center text-slate-400">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sm">
                =
              </div>
            </div>

            {/* Box C: Net Profit Result */}
            <div className={`md:col-span-2 rounded-2xl p-4 border ${
              capitalMatchResult.isProfitable 
                ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-100' 
                : 'bg-rose-950/60 border-rose-600/50 text-rose-100'
            } space-y-2`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">
                  Net Profit (B − A)
                </span>
                {capitalMatchResult.isProfitable ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                )}
              </div>
              <p className="text-xl sm:text-2xl font-black">
                {formatCurrency(capitalMatchResult.netProfit, currencySymbol)}
              </p>
              <div className="pt-2 border-t border-emerald-800/40 text-[10px] space-y-0.5">
                <p className="font-bold">
                  {capitalMatchResult.netMarginPercent.toFixed(1)}% Return on Capital
                </p>
                <p className="text-slate-300 opacity-90">
                  {capitalMatchResult.isProfitable ? 'Capital Growth Achieved' : 'Capital Deficit'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Dual-Method Reconciliation Bridge (Balance Sheet vs Income Statement) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <span>Accounting Reconciliation Match (စာရင်းကိုက်ညှိမှု အတည်ပြုချက်)</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Comparing Method 1 (Balance Sheet Capital Match) with Method 2 (Income Statement P&L)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {hasSnapshot ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Financial Reconciliation Active</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Pending Initial Snapshot</span>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Method 1: Capital Match */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
              <span>Method 1: Capital Match</span>
              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px]">Balance Sheet</span>
            </div>
            <p className="text-xl font-black text-indigo-950">
              {formatCurrency(capitalMatchResult.netProfit, currencySymbol)}
            </p>
            <p className="text-[11px] text-indigo-700 leading-snug">
              Derived from: <code className="font-bold">Ending Capital − Starting Capital</code>
            </p>
          </div>

          {/* Method 2: P&L Statement */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>Method 2: P&L Income Statement</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]">Income Statement</span>
            </div>
            <p className="text-xl font-black text-emerald-950">
              {formatCurrency(currentMonthData.netOperatingProfit, currencySymbol)}
            </p>
            <p className="text-[11px] text-emerald-700 leading-snug">
              Derived from: <code className="font-bold">Gross Revenue − COGS − Expenses</code>
            </p>
          </div>

          {/* Variance Check */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Accounting Variance</span>
              <span className="text-[10px] text-slate-500 font-semibold">Audit Check</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className={`text-xl font-black ${isVarianceNearZero ? 'text-emerald-600' : 'text-slate-800'}`}>
                {formatCurrency(variance, currencySymbol)}
              </p>
              {isVarianceNearZero && hasSnapshot && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                  0 Variance (Balanced)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              {hasSnapshot 
                ? 'Your balance sheet growth matches your monthly sales & expense statement.' 
                : 'Configure starting capital to verify 100% balance sheet matching.'}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Three Pillars of Ending Running Capital Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Pillar 1: Cash & Liquid Assets */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                <Banknote className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">Total Remaining Cash</h4>
                <p className="text-[11px] text-slate-500 font-medium">Drawer + Digital Reserves</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-amber-600">
                {formatCurrency(currentRunningCapital.totalRemainingCash, currencySymbol)}
              </span>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="px-2 py-1 text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                title="Transfer funds between Cash Drawer & Digital Pool"
              >
                <ArrowRightLeft className="w-3 h-3 text-amber-700" />
                <span>Transfer ⇄</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="font-bold text-slate-800">Cash Drawer (Physical Cash)</p>
                <p className="text-[10px] text-slate-500">Physical register counter cash</p>
              </div>
              <span className="font-black text-slate-900">
                {formatCurrency(currentRunningCapital.cashInDrawer, currencySymbol)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="font-bold text-slate-800">Digital Cash Pool (KPay, Wave, Banks)</p>
                <p className="text-[10px] text-slate-500">Digital sales net of digital expenses & PO payouts</p>
              </div>
              <span className="font-black text-slate-900">
                {formatCurrency(currentRunningCapital.digitalBankBalances, currencySymbol)}
              </span>
            </div>

            {typeof currentRunningCapital.digitalTransfersNet === 'number' && currentRunningCapital.digitalTransfersNet !== 0 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px]">
                <span className="text-amber-900 font-semibold">Net Cash Transfers (Drawer ⇄ Digital):</span>
                <span className="font-bold text-amber-950 font-mono">
                  {currentRunningCapital.digitalTransfersNet > 0 ? '+' : ''}
                  {formatCurrency(currentRunningCapital.digitalTransfersNet, currencySymbol)}
                </span>
              </div>
            )}

            {typeof currentRunningCapital.digitalPurchasesOutflow === 'number' && currentRunningCapital.digitalPurchasesOutflow > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[11px]">
                <span className="text-indigo-800 font-semibold">PO Payouts from Digital Pool:</span>
                <span className="font-bold text-indigo-900">
                  -{formatCurrency(currentRunningCapital.digitalPurchasesOutflow, currencySymbol)}
                </span>
              </div>
            )}

            <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200/60 text-[11px] text-amber-800">
              <p className="font-semibold">✓ Separate & Protected Cash Pools:</p>
              <p className="mt-0.5 text-amber-700 leading-relaxed">
                Expenses and supplier PO vouchers paid via KPay/Banks deduct strictly from the Digital Cash Pool under Remaining Cash, preserving daily counter drawer reconciliation.
              </p>
            </div>
          </div>
        </div>

        {/* Pillar 2: Remaining Inventory Valuation at Cost */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">Inventory at Cost</h4>
                <p className="text-[11px] text-slate-500 font-medium">Sellable shop inventory</p>
              </div>
            </div>
            <span className="text-sm font-black text-emerald-600">
              {formatCurrency(currentRunningCapital.remainingStockValuation, currencySymbol)}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="font-bold text-slate-800">Sellable Catalog Units</p>
                <p className="text-[10px] text-slate-500">Valued strictly at unit cost price</p>
              </div>
              <span className="font-black text-slate-900">
                {formatCurrency(currentRunningCapital.remainingStockValuation, currencySymbol)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="font-bold text-slate-800">Quarantined / Damaged Items</p>
                <p className="text-[10px] text-slate-500">Audited in damage quarantine</p>
              </div>
              <span className="font-bold text-rose-600">
                {formatCurrency(currentRunningCapital.quarantinedStockValuation, currencySymbol)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/60 text-[11px] text-emerald-800">
              <p className="font-semibold">✓ No Double Deduction:</p>
              <p className="mt-0.5 text-emerald-700">
                Damaged write-offs are tracked once in physical inventory without duplicating overhead expense vouchers.
              </p>
            </div>
          </div>
        </div>

        {/* Pillar 3: Accounts Receivable (Credit Sales) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-cyan-100 text-cyan-800 rounded-xl">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">Accounts Receivable</h4>
                <p className="text-[11px] text-slate-500 font-medium">Customer credit balances</p>
              </div>
            </div>
            <span className="text-sm font-black text-cyan-600">
              {formatCurrency(currentRunningCapital.accountsReceivable, currencySymbol)}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="font-bold text-slate-800">Active Uncollected Credit</p>
                <p className="text-[10px] text-slate-500">Collectible business asset</p>
              </div>
              <span className="font-black text-slate-900">
                {formatCurrency(currentRunningCapital.accountsReceivable, currencySymbol)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-cyan-50/50 border border-cyan-200/60 text-[11px] text-cyan-800">
              <p className="font-semibold">✓ Recognized as Business Asset:</p>
              <p className="mt-0.5 text-cyan-700">
                When an item is sold on credit, the product cost exits stock and transforms into an accounts receivable asset until repayment.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Visual Accounting Workflow Explainer (User's Exact Scenario) */}
      <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm sm:text-base font-black text-slate-900">
            How The Capital Match Workflow Works (အလုပ်လုပ်ပုံ ဥပမာအဆင့်ဆင့်)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">Step 1</span>
            <p className="font-bold text-slate-900 mt-1">Starting Capital</p>
            <p className="text-slate-600 text-[11px] leading-snug">
              Cash 200,000 + Products 800,000 = <strong className="text-slate-900">1,000,000 MMK Total Capital</strong>.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Step 2</span>
            <p className="font-bold text-slate-900 mt-1">Selling an Item</p>
            <p className="text-slate-600 text-[11px] leading-snug">
              Cost 100,000 sold for 120,000. Stock drops by −100,000, Cash increases by +120,000. Capital becomes <strong className="text-emerald-700">1,020,000 MMK</strong> (+20,000 Profit).
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Step 3</span>
            <p className="font-bold text-slate-900 mt-1">Paying Expenses</p>
            <p className="text-slate-600 text-[11px] leading-snug">
              Pay 5,000 MMK electricity from Drawer or Revenue Cash. Cash decreases by −5,000. Capital becomes <strong className="text-indigo-900">1,015,000 MMK</strong>.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">Step 4</span>
            <p className="font-bold text-slate-900 mt-1">End of Month Result</p>
            <p className="text-slate-600 text-[11px] leading-snug">
              Ending Capital (1,015,000) − Starting Capital (1,000,000) = <strong className="text-emerald-600 font-extrabold">+15,000 MMK True Net Profit</strong>!
            </p>
          </div>
        </div>
      </div>

      {/* Cash Pool Transfer Modal */}
      <CashPoolTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        settings={{ currencySymbol } as any}
      />
    </div>
  );
};
