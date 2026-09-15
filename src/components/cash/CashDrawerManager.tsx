import React, { useState } from 'react';
import { 
  Landmark, 
  DollarSign, 
  ArrowDownRight, 
  ArrowUpRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Printer, 
  Plus, 
  Minus,
  User
} from 'lucide-react';
import { CashDrawerRecord, ShopSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

interface CashDrawerManagerProps {
  cashDrawer: CashDrawerRecord;
  settings: ShopSettings;
  onOpenCashInOut: (type: 'in' | 'out') => void;
  onCloseShift: (actualCounted: number, notes: string) => void;
}

export const CashDrawerManager: React.FC<CashDrawerManagerProps> = ({
  cashDrawer,
  settings,
  onOpenCashInOut,
  onCloseShift,
}) => {
  const [isClosingModalOpen, setIsClosingModalOpen] = useState<boolean>(false);
  const [actualCashCounted, setActualCashCounted] = useState<number>(cashDrawer.expectedInDrawer || 0);
  const [closingNotes, setClosingNotes] = useState<string>('');

  const openingFloat = cashDrawer.openingBalance ?? cashDrawer.openingFloat ?? 0;
  const inManualTotal = (cashDrawer.cashInManual || []).reduce((s, i) => s + i.amount, 0);
  const outManualTotal = (cashDrawer.cashOutManual || []).reduce((s, i) => s + i.amount, 0);
  const totalCashIn = cashDrawer.totalCashIn ?? ((cashDrawer.cashSales || 0) + inManualTotal);
  const totalCashOut = cashDrawer.totalCashOut ?? outManualTotal;
  const expectedInDrawer = cashDrawer.expectedInDrawer ?? (openingFloat + totalCashIn - totalCashOut);

  const discrepancy = Number((actualCashCounted - expectedInDrawer).toFixed(2));

  // Build unified transaction list
  const transactions = cashDrawer.transactions ?? [
    ...(cashDrawer.cashInManual || []).map((t, idx) => ({
      id: `in-${idx}`,
      timestamp: t.time,
      type: 'in',
      description: t.reason,
      amount: t.amount,
    })),
    ...(cashDrawer.cashOutManual || []).map((t, idx) => ({
      id: `out-${idx}`,
      timestamp: t.time,
      type: 'out',
      description: t.reason,
      amount: t.amount,
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const handlePrintZReport = () => {
    window.print();
  };

  const handleConfirmCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    onCloseShift(actualCashCounted, closingNotes);
    setIsClosingModalOpen(false);
  };

  return (
    <div id="cash-drawer-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Banner KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Shift Opening Float</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(openingFloat, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Shift started at {formatDateTime(cashDrawer.openedAt || cashDrawer.date)}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Cash In (Sales & Inflow)</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700">
            +{formatCurrency(totalCashIn, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-emerald-600 mt-1 font-semibold">POS + Repairs + Float In</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Cash Out (Expenses)</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-700">
            -{formatCurrency(totalCashOut, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-rose-600 mt-1 font-medium">Vouchers & Payouts</p>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
              <span>Expected Cash in Drawer</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400">
              {formatCurrency(expectedInDrawer, settings.currencySymbol)}
            </p>
          </div>
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[10px] uppercase font-bold text-slate-300">
              Status: {(cashDrawer.status || 'open').toUpperCase()}
            </span>
          </div>
        </div>

      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenCashInOut('in')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + Record Cash In
          </button>

          <button
            type="button"
            onClick={() => onOpenCashInOut('out')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
            - Record Cash Out (Expense)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintZReport}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Cash Shift Report
          </button>

          <button
            type="button"
            onClick={() => {
              setActualCashCounted(expectedInDrawer);
              setIsClosingModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            Shift Reconciliation / Close Shift
          </button>
        </div>

      </div>

      {/* Cash Transactions Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900">Current Register Shift Log</h3>
          <span className="text-xs text-slate-500 font-mono">Shift ID: #{cashDrawer.id}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Time & Stamp</th>
                <th className="py-3 px-4">Transaction Type</th>
                <th className="py-3 px-4">Description / Reference</th>
                <th className="py-3 px-4 text-right">Inflow (+)</th>
                <th className="py-3 px-4 text-right">Outflow (-)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Landmark className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">No cash drawer transactions recorded in this shift yet.</p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isIn = tx.type === 'in' || tx.type === 'sale_cash' || tx.type === 'repair_cash';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {formatDateTime(tx.timestamp)}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isIn
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {tx.type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-900">
                        {tx.description}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-emerald-700 font-mono">
                        {isIn ? `+${formatCurrency(tx.amount, settings.currencySymbol)}` : '—'}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-rose-700 font-mono">
                        {!isIn ? `-${formatCurrency(tx.amount, settings.currencySymbol)}` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Close / Z-Report Reconciliation Modal */}
      {isClosingModalOpen && (
        <div id="close-shift-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">Close Shift & Cash Reconciliation</h3>
              <button onClick={() => setIsClosingModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleConfirmCloseShift} className="p-6 space-y-4 text-xs">
              
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">System Expected Cash:</span>
                  <span className="font-bold font-mono text-slate-900">
                    {formatCurrency(expectedInDrawer, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Physical Cash Counted in Drawer ({settings.currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={actualCashCounted === 0 ? '' : actualCashCounted}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setActualCashCounted(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-lg font-bold text-slate-900"
                />
              </div>

              {/* Discrepancy indicator */}
              <div className={`p-3 rounded-xl border ${
                discrepancy === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : discrepancy > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="flex justify-between items-center font-bold">
                  <span>Reconciliation Status:</span>
                  <span>
                    {discrepancy === 0 ? '✓ Balanced (No Shortage)' : discrepancy > 0 ? `+${formatCurrency(discrepancy, settings.currencySymbol)} Cash Overage` : `${formatCurrency(discrepancy, settings.currencySymbol)} Shortage`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Shift Handover Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Handed over $200 float to evening cashier..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Confirm & Finalize Shift
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
