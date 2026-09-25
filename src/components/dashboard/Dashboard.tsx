import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  ShoppingBag, 
  Package, 
  AlertTriangle, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  Smartphone, 
  Receipt, 
  CreditCard, 
  Truck, 
  BarChart3, 
  Users, 
  Clock, 
  CheckCircle,
  ExternalLink,
  Zap,
  Tag,
  CalendarClock,
  Megaphone,
  MessageSquare,
  Pin,
  Wallet,
  Banknote,
  Landmark,
  Layers,
  ArrowRightLeft
} from 'lucide-react';
import { Product, Sale, PurchaseRecord, ExpenseRecord, CashDrawerRecord, ShopSettings, StaffUser, StaffRole, RolePermissions } from '../../types';
import { formatCurrency, formatDateTime, getPaymentMethodInfo, formatSalePaymentBreakdown } from '../../utils/formatters';
import { getEffectiveUserPermissions } from '../../utils/permissionUtils';
import { StorageService } from '../../utils/storage';
import { calculateRunningCapital } from '../../utils/capitalUtils';
import { AppLink } from '../common/AppLink';
import { CashPoolTransferModal } from '../financial/CashPoolTransferModal';
import { useFinancialPrivacy, PrivacyToggleButton } from '../../utils/useFinancialPrivacy';

interface DashboardProps {
  products: Product[];
  sales: Sale[];
  purchases: PurchaseRecord[];
  expenses: ExpenseRecord[];
  cashDrawer: CashDrawerRecord;
  settings: ShopSettings;
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<StaffRole, RolePermissions>;
  onNavigateTab: (tab: any) => void;
  onOpenNewSale: () => void;
  onOpenNewPurchase: () => void;
  onOpenNewExpense: () => void;
  onViewInvoice: (sale: Sale) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  products,
  sales,
  purchases,
  expenses,
  cashDrawer,
  settings,
  currentStaffUser,
  rolePermissions,
  onNavigateTab,
  onOpenNewSale,
  onOpenNewPurchase,
  onOpenNewExpense,
  onViewInvoice,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const effectivePerms = getEffectiveUserPermissions(currentStaffUser, rolePermissions);

  // Today's metrics
  const todaySales = sales.filter(s => s.date.startsWith(todayStr) && s.status === 'completed');
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.grandTotal, 0);
  
  // Gross profit calculation
  const todayCost = todaySales.reduce((acc, s) => {
    const saleCost = s.items.reduce((itemAcc, item) => itemAcc + ((item.costPrice || 0) * item.quantity), 0);
    return acc + saleCost;
  }, 0);
  const todayGrossProfit = Math.max(0, todayRevenue - todayCost);
  const profitMarginPercent = todayRevenue > 0 ? Math.round((todayGrossProfit / todayRevenue) * 100) : 0;

  // Today's expenses & purchases
  const todayExpenses = expenses.filter(e => e.date.startsWith(todayStr));
  const todayExpensesTotal = todayExpenses.reduce((acc, e) => acc + e.amount, 0);

  const todayPurchases = purchases.filter(p => p.date.startsWith(todayStr));
  const todayPurchasesTotal = todayPurchases.reduce((acc, p) => acc + p.grandTotal, 0);

  const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);
  const [transferRefreshCount, setTransferRefreshCount] = React.useState(0);
  const { hideDigits, toggleHideDigits, formatAmount } = useFinancialPrivacy();

  // Live Running Business Capital (Stock at cost + Liquid Cash + Receivables)
  const creditSales = React.useMemo(() => StorageService.getCreditSales(), []);
  const currentLiveDrawer = React.useMemo(() => StorageService.getCashDrawer(), [cashDrawer, transferRefreshCount]);
  const runningCapital = React.useMemo(() => {
    return calculateRunningCapital(products, currentLiveDrawer, creditSales, expenses, sales, undefined, purchases);
  }, [products, currentLiveDrawer, creditSales, expenses, sales, purchases, transferRefreshCount]);

  // Inventory stats
  const lowStockProducts = products.filter(p => {
    const min = typeof p.minStockAlert === 'number' ? p.minStockAlert : 0;
    return min > 0 ? p.stock <= min : p.stock <= 0;
  });
  const totalStockCount = products.reduce((acc, p) => acc + p.stock, 0);
  const totalStockValuation = products.reduce((acc, p) => acc + (p.stock * p.costPrice), 0);

  // Payment channel distribution (All-time or last 30 days)
  const paymentBreakdown: Record<string, { count: number; total: number }> = {};
  sales.filter(s => s.status === 'completed').forEach(s => {
    const m = s.paymentMethod;
    if (!paymentBreakdown[m]) {
      paymentBreakdown[m] = { count: 0, total: 0 };
    }
    paymentBreakdown[m].count += 1;
    paymentBreakdown[m].total += s.grandTotal;
  });

  // Top selling products
  const productSalesMap: Record<string, { product: Product; quantity: number; revenue: number }> = {};
  sales.filter(s => s.status === 'completed').forEach(sale => {
    sale.items.forEach(item => {
      if (!productSalesMap[item.productId]) {
        const prod = products.find(p => p.id === item.productId) || {
          id: item.productId,
          name: item.name,
          brand: item.brand,
          category: item.category,
        } as Product;
        productSalesMap[item.productId] = { product: prod, quantity: 0, revenue: 0 };
      }
      productSalesMap[item.productId].quantity += item.quantity;
      productSalesMap[item.productId].revenue += item.finalPrice;
    });
  });

  const topSellingList = Object.values(productSalesMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Last 7 days revenue trend calculation
  const last7Days: { dateStr: string; label: string; revenue: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const daySales = sales.filter(s => s.date.startsWith(dateKey) && s.status === 'completed');
    const dayRev = daySales.reduce((acc, s) => acc + s.grandTotal, 0);
    last7Days.push({
      dateStr: dateKey,
      label: dayName,
      revenue: dayRev,
      orders: daySales.length,
    });
  }
  const maxDayRevenue = Math.max(...last7Days.map(d => d.revenue), 100000);

  return (
    <div id="dashboard-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Welcome & Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Store Dashboard Overview</h2>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">Live Terminal</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Logged in as <strong className="text-slate-800">{settings.currentStaffName}</strong> ({settings.currentStaffRole}) • Today: {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center flex-wrap gap-2 w-full sm:w-auto">
          {/* Privacy Eye Toggle Button */}
          <PrivacyToggleButton
            hideDigits={hideDigits}
            onToggle={toggleHideDigits}
            variant="outline"
            size="sm"
          />

          {/* Business Reports Button/Link */}
          {effectivePerms.canViewReports && (
            <AppLink
              tab="reports"
              toTab={onNavigateTab}
              id="dash-reports-action-btn"
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
              title="Open Business Reports (Right click to open in new tab/window)"
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Reports</span>
              <ExternalLink className="w-3 h-3 opacity-70 hidden sm:inline shrink-0" />
            </AppLink>
          )}

          {/* Pre-Orders & Bookings Link */}
          {effectivePerms.canManagePreOrders && (
            <AppLink
              tab="pre_orders"
              toTab={onNavigateTab}
              id="dash-preorders-action-btn"
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
              title="Manage Pre-Orders & Bookings (Right click to open in new tab/window)"
            >
              <CalendarClock className="w-4 h-4 shrink-0 text-purple-600" />
              <span>Pre-Orders</span>
              <ExternalLink className="w-3 h-3 opacity-70 hidden sm:inline shrink-0" />
            </AppLink>
          )}

          {/* POS Terminal Link */}
          {effectivePerms.canAccessPos && (
            <AppLink
              tab="pos"
              toTab={onNavigateTab}
              id="dash-pos-action-btn"
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
              title="Launch POS Terminal (Right click to open in new tab/window)"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>POS Register</span>
              <ExternalLink className="w-3 h-3 hidden sm:inline shrink-0" />
            </AppLink>
          )}

          {(effectivePerms.canManagePurchases || effectivePerms.canApprovePurchases || effectivePerms.canReceivePurchases) && (
            <AppLink
              tab="purchases"
              toTab={onNavigateTab}
              id="dash-purchase-action-btn"
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
              title="Stock Purchase (Right click to open in new tab/window)"
            >
              <Truck className="w-4 h-4 shrink-0" />
              <span>+ Purchase</span>
            </AppLink>
          )}

          {effectivePerms.canRecordExpenses && (
            <AppLink
              tab="expenses"
              toTab={onNavigateTab}
              id="dash-expense-action-btn"
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
              title="Record Expense (Right click to open in new tab/window)"
            >
              <Receipt className="w-4 h-4 shrink-0" />
              <span>+ Expense</span>
            </AppLink>
          )}

          {/* Team Chat & Notice Board Link */}
          <AppLink
            tab="team_chat"
            toTab={onNavigateTab}
            id="dash-team-chat-action-btn"
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
            title="Open Team Chat & Notice Board"
          >
            <Megaphone className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Notice Board & Chat</span>
            <ExternalLink className="w-3 h-3 opacity-70 hidden sm:inline shrink-0" />
          </AppLink>

          {/* Transfer Cash between Drawer & Digital Pool */}
          <button
            type="button"
            onClick={() => setIsTransferModalOpen(true)}
            id="dash-transfer-cash-action-btn"
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
            title="Transfer / Adjust Cash between Physical Drawer & Digital Pool"
          >
            <ArrowRightLeft className="w-4 h-4 shrink-0 text-indigo-600" />
            <span>Transfer Cash ⇄</span>
          </button>
        </div>
      </div>

      {/* Pinned Announcements High Priority Alert Banner */}
      {(() => {
        const pinnedList = StorageService.getAnnouncements().filter(a => a.isPinned);
        if (pinnedList.length === 0) return null;
        const topPinned = pinnedList[0];

        return (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500 text-white shrink-0 shadow-xs">
                <Pin className="w-5 h-5 fill-current" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white uppercase tracking-wider">
                    High Priority Pinned Notice
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Posted by {topPinned.authorName}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                  {topPinned.title}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-1">
                  {topPinned.content}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
              <button
                onClick={() => onNavigateTab('team_chat')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors w-full sm:w-auto text-center"
              >
                View Notice Board ({pinnedList.length} Pinned) →
              </button>
            </div>
          </div>
        );
      })()}

      {/* Store Total Running Capital Banner (User Workflow: Cash + Inventory at Cost + Receivables) */}
      {effectivePerms.canViewCostAndProfit && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-lg border border-indigo-900/50 relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            {/* Left: Total Running Capital */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-indigo-300" />
                  <span>True Business Capital • လက်ကျန်လည်ပတ်အရင်း</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Live Balance Sheet</span>
              </div>
              <div className="flex items-baseline gap-3">
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {formatAmount(runningCapital.totalRunningCapital, settings.currencySymbol)}
                </h2>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  Live Solvency
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium max-w-xl leading-relaxed">
                Total Operating Capital = Remaining Stock (at cost) + Remaining Cash (Drawer + Digital) + Active Credit Receivables.
              </p>
            </div>

            {/* Middle/Right: Breakdown Pillars */}
            <div className="grid grid-cols-3 gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60 backdrop-blur-xs">
              {/* Pillar 1: Total Liquid Cash */}
              <div className="p-2 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold">
                  <Banknote className="w-3.5 h-3.5 text-amber-400" />
                  <span>Total Remaining Cash</span>
                </div>
                <p className="text-sm sm:text-base font-black text-amber-300">
                  {formatAmount(runningCapital.totalRemainingCash, settings.currencySymbol)}
                </p>
                <div className="text-[10px] text-slate-400 space-y-0.5 font-medium">
                  <p className="flex justify-between items-center">
                    <span>Drawer:</span>
                    <span className="text-slate-200 font-semibold">{formatAmount(runningCapital.cashInDrawer, settings.currencySymbol)}</span>
                  </p>
                  <p className="flex justify-between items-center">
                    <span>Digital:</span>
                    <span className="text-slate-200 font-semibold">{formatAmount(runningCapital.digitalBankBalances, settings.currencySymbol)}</span>
                  </p>
                </div>
              </div>

              {/* Pillar 2: Inventory Valuation */}
              <div className="p-2 space-y-1 border-l border-slate-700/80">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Stock at Cost</span>
                </div>
                <p className="text-sm sm:text-base font-black text-emerald-300">
                  {formatAmount(runningCapital.remainingStockValuation, settings.currencySymbol)}
                </p>
                <p className="text-[10px] text-slate-400">
                  {products.length} catalog items
                </p>
              </div>

              {/* Pillar 3: Receivables */}
              <div className="p-2 space-y-1 border-l border-slate-700/80">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold">
                  <Receipt className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Receivables</span>
                </div>
                <p className="text-sm sm:text-base font-black text-cyan-300">
                  {formatAmount(runningCapital.accountsReceivable, settings.currencySymbol)}
                </p>
                <p className="text-[10px] text-slate-400">
                  Customer credits
                </p>
              </div>
            </div>

            {/* Actions Stack: Transfer Cash above Monthly Capital Match */}
            <div className="flex flex-col gap-2 shrink-0 justify-center sm:min-w-[175px]">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="w-full px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-white font-bold text-xs rounded-xl border border-amber-400/40 shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Transfer funds between Cash Drawer & Digital Pool"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-300" />
                <span>Transfer Cash ⇄</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('monthly_profit')}
                className="w-full px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-indigo-400/40 whitespace-nowrap"
                title="Open Monthly Capital Match & Balance Sheet Reconciliation"
              >
                <span>Monthly Capital Match →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Today's Sales */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Today's Total Sales</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatAmount(todayRevenue, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100 text-slate-500">
            <span>{todaySales.length} Orders completed</span>
            {effectivePerms.canViewCostAndProfit && (
              <span className="text-emerald-600 font-bold">~{profitMarginPercent}% Margin</span>
            )}
          </div>
        </div>

        {/* Today's Gross Profit */}
        <div 
          onClick={() => effectivePerms.canViewCostAndProfit && onNavigateTab('daily_profit')}
          className={`bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs transition-all ${
            effectivePerms.canViewCostAndProfit 
              ? 'hover:border-indigo-400 hover:shadow-xs cursor-pointer group' 
              : ''
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span className="group-hover:text-indigo-600 transition-colors">Daily Gross Profit</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          {effectivePerms.canViewCostAndProfit ? (
            <>
              <p className="text-2xl font-black text-emerald-600">
                {formatAmount(todayGrossProfit, settings.currencySymbol)}
              </p>
              <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100 text-slate-500">
                <span>COGS: {formatAmount(todayCost, settings.currencySymbol)}</span>
                <span className="text-indigo-600 font-bold group-hover:underline flex items-center gap-0.5">
                  Analyze P&L →
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-black text-slate-300 tracking-wider">
                ••••••••
              </p>
              <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100 text-slate-400">
                <span>Profit view restricted</span>
              </div>
            </>
          )}
        </div>

        {/* Today's Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-rose-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Today's Expenses</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600">
            {formatAmount(todayExpensesTotal, settings.currencySymbol)}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100 text-slate-500">
            <span>{todayExpenses.length} Vouchers recorded</span>
            {effectivePerms.canRecordExpenses && (
              <AppLink 
                tab="expenses"
                toTab={onNavigateTab}
                className="text-rose-600 hover:underline font-semibold"
                title="View Expenses (Right click to open in new tab/window)"
              >
                View →
              </AppLink>
            )}
          </div>
        </div>

        {/* Register Cash Float */}
        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
              <span>Expected Drawer Cash</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-2xl font-black text-emerald-400">
              {formatAmount(cashDrawer.expectedInDrawer, settings.currencySymbol)}
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800">
            <span>Float: {formatAmount(cashDrawer.openingBalance || cashDrawer.openingFloat, settings.currencySymbol)}</span>
            <AppLink 
              tab="cash_drawer"
              toTab={onNavigateTab}
              className="text-emerald-400 hover:text-emerald-300 font-bold"
              title="Reconcile Cash Register (Right click to open in new tab/window)"
            >
              Reconcile →
            </AppLink>
          </div>
        </div>

      </div>

      {/* Main Analytics Grid (Sales Trend + Payment Channels) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 7-Day Revenue Trend Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">7-Day Sales Trend (Kyats)</h3>
              <p className="text-[11px] text-slate-500">Daily revenue performance</p>
            </div>
            <AppLink
              tab="sales_history"
              toTab={onNavigateTab}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              title="View Full Sales History (Right click to open in new tab/window)"
            >
              Full History <ArrowUpRight className="w-3.5 h-3.5" />
            </AppLink>
          </div>

          <div className="pt-4 pb-2">
            <div className="flex items-end justify-between gap-2 h-44 px-2">
              {last7Days.map((day, idx) => {
                const heightPercent = Math.max(8, Math.round((day.revenue / maxDayRevenue) * 100));
                const isToday = idx === 6;

                return (
                  <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <div className="text-[10px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                      {formatAmount(day.revenue, settings.currencySymbol)}
                    </div>
                    <div className="w-full bg-slate-100 rounded-t-lg h-32 flex items-end p-1">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-md transition-all ${
                          isToday
                            ? 'bg-emerald-500 shadow-xs'
                            : 'bg-indigo-500/80 group-hover:bg-indigo-600'
                        }`}
                      />
                    </div>
                    <div className="text-center">
                      <p className={`text-[11px] font-bold ${isToday ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {day.label}
                      </p>
                      <p className="text-[9px] text-slate-400">{day.orders} sales</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Myanmar Payment Methods Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Payment Channels</h3>
              <p className="text-[11px] text-slate-500">KPay, Wave, Yoma, KBZ, Cash breakdown</p>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {Object.keys(paymentBreakdown).length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No transactions recorded yet.</p>
            ) : (
              Object.entries(paymentBreakdown).map(([method, data]) => {
                const info = getPaymentMethodInfo(method as any);
                const totalSalesAmount = sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + s.grandTotal, 0) || 1;
                const percent = Math.round((data.total / totalSalesAmount) * 100);

                return (
                  <div key={method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-slate-800">
                        <span className={`w-2 h-2 rounded-full ${info.colorClass.replace('text-', 'bg-')}`} />
                        {info.label} ({data.count})
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatAmount(data.total, settings.currencySymbol)} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${percent}%` }}
                        className={`h-full rounded-full ${info.colorClass.replace('text-', 'bg-')}`} 
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Total Inflow:</span>
            <span className="font-bold text-slate-900 font-mono">
              {formatAmount(
                sales.filter(s => s.status === 'completed').reduce((a, s) => a + s.grandTotal, 0),
                settings.currencySymbol
              )}
            </span>
          </div>
        </div>

      </div>

      {/* Bottom Grid: Low Stock Alert & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Low Stock Warning Box */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Low Stock Warnings</h3>
                <p className="text-[11px] text-slate-500">{lowStockProducts.length} items below safety threshold</p>
              </div>
            </div>
            <AppLink
              tab="inventory"
              toTab={onNavigateTab}
              className="text-xs font-bold text-amber-600 hover:text-amber-700"
              title="Open Inventory Manager (Right click to open in new tab/window)"
            >
              Inventory Manager →
            </AppLink>
          </div>

          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {lowStockProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-1 text-emerald-500 opacity-60" />
                <p className="text-xs font-bold text-slate-700">All Stock Healthy!</p>
                <p className="text-[11px]">No products are currently under minimum stock threshold.</p>
              </div>
            ) : (
              lowStockProducts.map(prod => (
                <div key={prod.id} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 px-1 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{prod.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      SKU: {prod.sku} • Cost: {formatAmount(prod.costPrice, settings.currencySymbol)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="inline-block px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-xs font-black">
                      {prod.stock} Left (Min: {prod.minStockAlert})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenNewPurchase}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg shrink-0 cursor-pointer"
                  >
                    + Purchase
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Top Selling Products</h3>
                <p className="text-[11px] text-slate-500">Highest grossing items in store</p>
              </div>
            </div>
            <AppLink
              tab="reports"
              toTab={onNavigateTab}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              title="View Full Reports (Right click to open in new tab/window)"
            >
              Full Report →
            </AppLink>
          </div>

          <div className="divide-y divide-slate-100">
            {topSellingList.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No sales completed yet.</p>
            ) : (
              topSellingList.map((item, idx) => (
                <div key={item.product.id || idx} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.product.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {item.quantity} units sold • {item.product.brand}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-slate-900 font-mono">
                      {formatAmount(item.revenue, settings.currencySymbol)}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-semibold">Revenue</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Recent Sales Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Store Invoices</h3>
            <p className="text-[11px] text-slate-500">Latest transactions from register</p>
          </div>
          <AppLink
            tab="sales_history"
            toTab={onNavigateTab}
            className="text-xs font-bold text-blue-600 hover:text-blue-700"
            title="View All Sales (Right click to open in new tab/window)"
          >
            View All ({sales.length}) →
          </AppLink>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Payment Channel</th>
                <th className="py-3 px-4 text-right">Total (Ks)</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.slice(0, 5).map(sale => {
                const payInfo = getPaymentMethodInfo(sale.paymentMethod);

                return (
                  <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {sale.invoiceNumber}
                    </td>

                    <td className="py-3 px-4 text-slate-500 font-mono">
                      {formatDateTime(sale.date)}
                    </td>

                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{sale.customerName}</p>
                      {sale.customerPhone && (
                        <p className="text-[10px] text-slate-400 font-mono">{sale.customerPhone}</p>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className="text-slate-700">
                        {sale.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {sale.paymentMethod === 'split' ? (
                        <div className="space-y-0.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                            {payInfo.label}
                          </span>
                          <div className="text-[10px] font-bold text-purple-900 font-mono">
                            {hideDigits ? 'Cash •••••• + Digital ••••••' : formatSalePaymentBreakdown(sale, settings.currencySymbol)}
                          </div>
                        </div>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${payInfo.badgeBg}`}>
                          {payInfo.label}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-black text-slate-900 font-mono">
                      {formatAmount(sale.grandTotal, settings.currencySymbol)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(sale)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Window Workstation & New-Tab Launchpad */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <ExternalLink className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Multi-Screen & New-Tab Workstations</h3>
              <p className="text-[11px] text-slate-400">Launch separate operational modules across dual monitors or browser tabs</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 w-fit">
            Secure Popup-Safe Listeners Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: Standard Link */}
          <AppLink
            tab="reports"
            openInNewTab={true}
            className="p-4 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-all group flex flex-col justify-between cursor-pointer"
            title="Open Financial Reports in a new tab or window"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Reports Terminal</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              </div>
              <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                Financial Reports & KPI
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Natively right-clickable: Open in new tab, new window, or incognito.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center text-[10px] font-semibold text-indigo-400 group-hover:translate-x-0.5 transition-transform">
              Open in New Tab →
            </div>
          </AppLink>

          {/* Card 2: Dedicated POS */}
          <AppLink
            tab="pos"
            openInNewTab={true}
            className="text-left p-4 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/50 rounded-xl transition-all group flex flex-col justify-between cursor-pointer"
            title="Launch Dedicated POS Cashier Terminal in a new tab or window"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">POS Register</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </div>
              <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                Dedicated POS Cashier Terminal
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Direct register interface for dual-monitor setups or multi-cashier stations.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center text-[10px] font-semibold text-emerald-400 group-hover:translate-x-0.5 transition-transform">
              Launch POS Register →
            </div>
          </AppLink>

          {/* Card 3: Live Inventory */}
          <AppLink
            tab="inventory"
            openInNewTab={true}
            className="p-4 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-teal-500/50 rounded-xl transition-all group flex flex-col justify-between cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-teal-400"
            title="Audit Live Inventory & Serialized IMEI Stock in a new tab or window"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Live Stock Audit</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition-colors" />
              </div>
              <h4 className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
                Live Inventory & IMEI Stock
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Manage stock in/out, barcode labels, and IMEI tracking independently.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center text-[10px] font-semibold text-teal-400 group-hover:translate-x-0.5 transition-transform">
              Audit Stock in New Tab →
            </div>
          </AppLink>
        </div>
      </div>

      {/* Cash Pool Transfer Modal */}
      <CashPoolTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onTransferred={() => setTransferRefreshCount(c => c + 1)}
        settings={settings}
      />

    </div>
  );
};
