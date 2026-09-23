import { Product, CashDrawerRecord, CreditSaleRecord, ExpenseRecord, Sale, MonthlyCapitalSnapshot, RunningCapitalBreakdown } from '../types';

/**
 * Calculates true live running capital based on:
 * 1. Remaining Inventory Valuation (at cost price)
 * 2. Total Remaining Cash:
 *    - Live Cash Drawer Expected Balance (net of drawer expenses and drawer cash sales)
 *    - Digital Accounts & Bank Reserves (KPay, Wave, Bank accounts from digital sales net of revenue cash expenses)
 * 3. Accounts Receivable (Outstanding Customer Credit Sales balance)
 * 4. Quarantined / Damaged stock valuation (tracked separately to prevent double-deductions)
 */
export function calculateRunningCapital(
  products: Product[],
  cashDrawer: CashDrawerRecord,
  creditSales: CreditSaleRecord[],
  expenses: ExpenseRecord[],
  sales: Sale[] = [],
  monthFilterYM?: string
): RunningCapitalBreakdown {
  // 1. Remaining Sellable Inventory Valuation at cost
  const remainingStockValuation = products.reduce((acc, p) => {
    const sellable = Math.max(0, p.stock || 0);
    const unitCost = Math.max(0, p.costPrice || 0);
    return acc + (sellable * unitCost);
  }, 0);

  // 2. Quarantined Damaged Stock Valuation
  const quarantinedStockValuation = products.reduce((acc, p) => {
    const quarantined = Math.max(0, p.quarantinedStock || 0);
    const unitCost = Math.max(0, p.costPrice || 0);
    return acc + (quarantined * unitCost);
  }, 0);

  // 3. Cash in Drawer (Live Counter Cash)
  const cashInDrawer = Math.max(0, cashDrawer?.expectedInDrawer || 0);

  // 4. Digital & Bank Accounts Balance from Sales & Expenses
  // Digital sales revenue (KPay, Wave, Banks)
  let digitalSalesRevenue = 0;
  const targetSales = monthFilterYM 
    ? sales.filter(s => s.status === 'completed' && s.date?.startsWith(monthFilterYM))
    : sales.filter(s => s.status === 'completed');

  targetSales.forEach(s => {
    if (s.paymentMethod !== 'cash' && s.paymentMethod !== 'credit') {
      digitalSalesRevenue += s.grandTotal || 0;
    } else if (s.paymentMethod === 'credit' && s.paymentDetails?.downPaymentMethod && s.paymentDetails.downPaymentMethod !== 'cash') {
      digitalSalesRevenue += s.paymentDetails.downPayment || 0;
    }
  });

  // Outflows paid strictly from Revenue Cash (Digital accounts/reserves)
  const targetExpenses = monthFilterYM
    ? expenses.filter(e => e.date?.startsWith(monthFilterYM))
    : expenses;

  const revenueCashExpenses = targetExpenses
    .filter(e => e.fundingSource === 'revenue_cash' || (!e.deductFromCashDrawer && e.paymentMethod !== 'cash' && !e.isInventoryAssetLoss))
    .reduce((acc, e) => acc + (e.amount || 0), 0);

  const digitalBankBalances = Math.max(0, digitalSalesRevenue - revenueCashExpenses);
  const totalRemainingCash = cashInDrawer + digitalBankBalances;

  // 5. Accounts Receivable (Outstanding Customer Credit Sales balance)
  const activeCredits = creditSales.filter(c => c.status !== 'cancelled' && c.status !== 'bad_debt');
  const accountsReceivable = activeCredits.reduce((acc, c) => acc + (c.remainingBalance || 0), 0);

  // 6. Total Running Capital
  // Total Running Capital = Remaining Stock (at cost) + Total Remaining Cash + Accounts Receivable
  const totalRunningCapital = remainingStockValuation + totalRemainingCash + accountsReceivable;

  return {
    cashInDrawer,
    digitalBankBalances,
    totalRemainingCash,
    remainingStockValuation,
    quarantinedStockValuation,
    accountsReceivable,
    totalRunningCapital,
  };
}

/**
 * Calculates Net Profit by Capital Reconciliation:
 * Net Profit = (Ending Running Capital + Owner Drawings) - (Initial Capital + Capital Injections)
 */
export function calculateCapitalMatchNetProfit(
  initialCapital: number,
  endingRunningCapital: number,
  capitalInjections: number = 0,
  ownerDrawings: number = 0
): {
  netProfit: number;
  netMarginPercent: number;
  isProfitable: boolean;
} {
  const netProfit = (endingRunningCapital + ownerDrawings) - (initialCapital + capitalInjections);
  const netMarginPercent = initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0;
  return {
    netProfit,
    netMarginPercent,
    isProfitable: netProfit >= 0,
  };
}
