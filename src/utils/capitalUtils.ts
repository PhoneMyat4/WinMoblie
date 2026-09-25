import { Product, CashDrawerRecord, CreditSaleRecord, ExpenseRecord, Sale, MonthlyCapitalSnapshot, RunningCapitalBreakdown, PurchaseRecord } from '../types';
import { StorageService } from './storage';

/**
 * Calculates true live running capital based on:
 * 1. Remaining Inventory Valuation (at cost price)
 * 2. Total Remaining Cash:
 *    - Live Cash Drawer Expected Balance (physical counter register)
 *    - Digital Cash Pool & Bank Reserves (KPay, Wave, Bank accounts net of digital expenses and supplier PO payments)
 * 3. Accounts Receivable (Outstanding Customer Credit Sales balance)
 * 4. Quarantined / Damaged stock valuation (tracked separately to prevent double-deductions)
 */
export function calculateRunningCapital(
  products: Product[],
  cashDrawer: CashDrawerRecord,
  creditSales: CreditSaleRecord[],
  expenses: ExpenseRecord[],
  sales: Sale[] = [],
  monthFilterYM?: string,
  purchases?: PurchaseRecord[]
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

  // 4. Digital Cash Pool & Bank Accounts Balance from Sales, Expenses, Purchases, Transfers & Refunds
  // Inflows: Digital sales revenue (KPay, Wave, Banks, and Credit down payments)
  let digitalSalesRevenue = 0;
  const targetSales = monthFilterYM 
    ? sales.filter(s => s.date?.startsWith(monthFilterYM))
    : sales;

  targetSales.forEach(s => {
    if (s.paymentMethod !== 'cash' && s.paymentMethod !== 'credit') {
      digitalSalesRevenue += s.grandTotal || 0;
    } else if (s.paymentMethod === 'credit' && s.paymentDetails?.downPaymentMethod && s.paymentDetails.downPaymentMethod !== 'cash') {
      digitalSalesRevenue += s.paymentDetails.downPayment || 0;
    }
  });

  // Outflows 1: Expenses paid strictly from Digital Cash Pool / Revenue Cash
  const targetExpenses = monthFilterYM
    ? expenses.filter(e => e.date?.startsWith(monthFilterYM))
    : expenses;

  const revenueCashExpenses = targetExpenses
    .filter(e => e.fundingSource === 'revenue_cash' || (!e.deductFromCashDrawer && e.paymentMethod !== 'cash' && !e.isInventoryAssetLoss))
    .reduce((acc, e) => acc + (e.amount || 0), 0);

  // Outflows 2: Supplier Purchase Payments disbursed via Digital Cash Pool (KPay, Wave, KBZ, CB, AYA, Yoma)
  let actualPurchases = purchases;
  if (!actualPurchases || actualPurchases.length === 0) {
    if (typeof window !== 'undefined' && StorageService?.getPurchases) {
      try {
        actualPurchases = StorageService.getPurchases();
      } catch {
        actualPurchases = [];
      }
    } else {
      actualPurchases = [];
    }
  }

  const targetPurchases = monthFilterYM
    ? actualPurchases.filter(p => p.status !== 'draft' && p.status !== 'cancelled' && (p.date?.startsWith(monthFilterYM) || p.confirmedAt?.startsWith(monthFilterYM)))
    : actualPurchases.filter(p => p.status !== 'draft' && p.status !== 'cancelled');

  const digitalPurchasesOutflow = targetPurchases
    .filter(p => p.paymentMethod !== 'cash' && p.paymentMethod !== 'credit' && (p.amountPaid || 0) > 0)
    .reduce((acc, p) => acc + (p.amountPaid || 0), 0);

  // Outflows 3: Customer Refunds disbursed via Digital Cash Pool (KPay, Wave, Banks)
  let digitalRefundsOutflow = 0;
  targetSales.forEach(s => {
    if (s.refundHistory && s.refundHistory.length > 0) {
      s.refundHistory.forEach(ref => {
        if (monthFilterYM && !ref.date?.startsWith(monthFilterYM)) return;
        const isDigitalRefund = 
          ref.refundFundingSource === 'digital_cash_pool' ||
          (ref.refundFundingSource !== 'cash_drawer' && 
           ref.refundMethod && 
           !ref.refundMethod.toLowerCase().includes('cash') &&
           ref.refundMethod.toLowerCase() !== 'store credit');
        if (isDigitalRefund) {
          digitalRefundsOutflow += (ref.totalRefundAmount || 0);
        }
      });
    }
  });

  // Inflows 2: Owner Capital Injections deposited into Digital Cash Pool from Personal Finance
  let digitalInjectionsNet = 0;
  if (typeof window !== 'undefined' && StorageService?.getPersonalTransactions) {
    try {
      const pTxs = StorageService.getPersonalTransactions();
      const targetPTxs = monthFilterYM
        ? pTxs.filter(t => t.date?.startsWith(monthFilterYM))
        : pTxs;

      targetPTxs.forEach(t => {
        if (t.type === 'injection_to_business' && t.syncWithBusiness !== false && t.businessFundingSource === 'digital_cash_pool') {
          digitalInjectionsNet += (t.amount || 0);
        }
      });
    } catch {
      digitalInjectionsNet = 0;
    }
  }

  // Transfers between Cash Drawer & Digital Cash Pool
  let digitalTransfersNet = 0;
  if (typeof window !== 'undefined' && StorageService?.getCashTransfers) {
    try {
      const allTransfers = StorageService.getCashTransfers();
      const targetTransfers = monthFilterYM
        ? allTransfers.filter(t => t.timestamp?.startsWith(monthFilterYM))
        : allTransfers;

      targetTransfers.forEach(t => {
        if (t.from === 'cash_drawer' && t.to === 'digital_cash_pool') {
          digitalTransfersNet += t.amount || 0;
        } else if (t.from === 'digital_cash_pool' && t.to === 'cash_drawer') {
          digitalTransfersNet -= t.amount || 0;
        }
      });
    } catch {
      digitalTransfersNet = 0;
    }
  }

  // Digital Bank Balances = Digital Sales Revenue + Digital Injections - Digital Expenses - Digital Purchases - Digital Refunds + Net Transfers from Drawer
  const digitalBankBalances = Math.max(0, digitalSalesRevenue + digitalInjectionsNet - revenueCashExpenses - digitalPurchasesOutflow - digitalRefundsOutflow + digitalTransfersNet);
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
    digitalSalesRevenue,
    revenueCashExpenses,
    digitalPurchasesOutflow,
    digitalRefundsOutflow,
    digitalInjectionsNet,
    digitalTransfersNet,
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
