import React, { useState, useMemo } from 'react';
import { 
  Landmark, 
  DollarSign, 
  Smartphone, 
  CreditCard, 
  Receipt, 
  Printer, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Calculator, 
  Calendar, 
  Clock, 
  User, 
  FileText, 
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Save
} from 'lucide-react';
import { Sale, CashDrawerRecord, ExpenseRecord, ShopSettings, ShiftReconciliationRecord, DenominationCount } from '../../types';
import { calculateShiftReconciliation } from '../../utils/serializedUtils';
import { formatCurrency } from '../../utils/formatters';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { exportToCsv } from '../../utils/reportUtils';

interface ShiftReconciliationReportProps {
  sales: Sale[];
  cashDrawer: CashDrawerRecord;
  expenses: ExpenseRecord[];
  settings: ShopSettings;
  onSaveShiftSettlement?: (record: ShiftReconciliationRecord) => void;
}

const MYANMAR_DENOMINATIONS = [
  50000, 20000, 10000, 5000, 1000, 500, 200, 100, 50
];

export const ShiftReconciliationReport: React.FC<ShiftReconciliationReportProps> = ({
  sales,
  cashDrawer,
  expenses,
  settings,
  onSaveShiftSettlement,
}) => {
  const [shiftDate, setShiftDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [useDenominationCalculator, setUseDenominationCalculator] = useState<boolean>(true);
  const [denominations, setDenominations] = useState<Record<number, number>>({
    50000: 0,
    20000: 0,
    10000: 0,
    5000: 0,
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
  });

  const [manualCountedInput, setManualCountedInput] = useState<number>(() => {
    return cashDrawer.actualCounted || cashDrawer.expectedInDrawer || 0;
  });

  const [shiftNotes, setShiftNotes] = useState<string>('');
  const [isSavedNotice, setIsSavedNotice] = useState<boolean>(false);

  // Compute calculated denominations total
  const computedDenominations = useMemo(() => {
    const list: DenominationCount[] = [];
    let sum = 0;
    MYANMAR_DENOMINATIONS.forEach(denom => {
      const count = denominations[denom] || 0;
      const total = denom * count;
      sum += total;
      list.push({ denomination: denom, count, total });
    });
    return { list, sum };
  }, [denominations]);

  const activeCountedAmount = useDenominationCalculator 
    ? (computedDenominations.sum > 0 ? computedDenominations.sum : manualCountedInput) 
    : manualCountedInput;

  // Calculate live shift reconciliation stats
  const reconciliation = useMemo(() => {
    return calculateShiftReconciliation(
      shiftDate,
      sales,
      cashDrawer,
      expenses,
      activeCountedAmount,
      useDenominationCalculator ? computedDenominations.list : undefined
    );
  }, [shiftDate, sales, cashDrawer, expenses, activeCountedAmount, useDenominationCalculator, computedDenominations.list]);

  const handleDenominationChange = (denom: number, countStr: string) => {
    const count = Math.max(0, parseInt(countStr) || 0);
    setDenominations(prev => ({ ...prev, [denom]: count }));
  };

  const handlePrintZReport = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const cardSales = reconciliation.digitalSales.kbz + reconciliation.digitalSales.aya + reconciliation.digitalSales.cb + reconciliation.digitalSales.yoma;
    const headers = ['Financial Metric / Ledger Item', `Amount (${settings.currencySymbol})`, 'Notes & Breakdown'];
    const rows = [
      ['Shift Date', shiftDate, ''],
      ['Opening Float Balance', reconciliation.openingFloat, 'Starting Cash in Register'],
      ['Cash Sales (POS Invoices)', reconciliation.cashSalesTotal, 'From system sales invoices'],
      ['Pay In / Cash Injections', reconciliation.manualCashInTotal, 'Extra cash added during shift'],
      ['Pay Out / Drawer Removals', reconciliation.manualCashOutTotal, 'Cash withdrawn during shift'],
      ['Recorded Shift Expenses', reconciliation.expensesCashTotal, 'Cash expenses paid out'],
      ['System Expected Cash', reconciliation.expectedCashTotal, 'Float + Cash Sales + PayIns - PayOuts - Expenses'],
      ['Physical Counted Cash', reconciliation.actualCashCounted, 'Actual physical bills counted'],
      ['Cash Drawer Variance', reconciliation.variance, (reconciliation.varianceStatus || 'balanced').toUpperCase()],
      ['KBZPay / WavePay Mobile Sales', (reconciliation.digitalSales.kpay + reconciliation.digitalSales.wave), 'Digital / Mobile Wallet POS sales'],
      ['Bank Card Sales', cardSales, 'Credit/Debit POS sales'],
      ['Total Shift Revenue', reconciliation.totalGrossRevenue, 'All payment methods combined'],
      ['Shift Status', reconciliation.status, '']
    ];

    exportToCsv(`Shift_Z_Report_${shiftDate}`, headers, rows);
  };

  const handleExportPdf = () => {
    const cardSales = reconciliation.digitalSales.kbz + reconciliation.digitalSales.aya + reconciliation.digitalSales.cb + reconciliation.digitalSales.yoma;
    const headers = ['Reconciliation Line Item', 'Expected (System)', 'Actual Count / Verified', 'Variance'];
    const rows = [
      [
        'Cash Drawer Balance',
        formatCurrency(reconciliation.expectedCashTotal, settings.currencySymbol),
        formatCurrency(reconciliation.actualCashCounted, settings.currencySymbol),
        `${reconciliation.variance >= 0 ? '+' : ''}${formatCurrency(reconciliation.variance, settings.currencySymbol)} (${(reconciliation.varianceStatus || 'balanced').toUpperCase()})`
      ],
      [
        'Opening Float Balance',
        formatCurrency(reconciliation.openingFloat, settings.currencySymbol),
        formatCurrency(reconciliation.openingFloat, settings.currencySymbol),
        'Balanced'
      ],
      [
        'POS Cash Sales',
        formatCurrency(reconciliation.cashSalesTotal, settings.currencySymbol),
        formatCurrency(reconciliation.cashSalesTotal, settings.currencySymbol),
        'System Invoiced'
      ],
      [
        'Digital Payments (KPay/Wave)',
        formatCurrency(reconciliation.digitalSales.kpay + reconciliation.digitalSales.wave, settings.currencySymbol),
        formatCurrency(reconciliation.digitalSales.kpay + reconciliation.digitalSales.wave, settings.currencySymbol),
        'E-Wallet Verified'
      ],
      [
        'Bank Cards (POS Terminal)',
        formatCurrency(cardSales, settings.currencySymbol),
        formatCurrency(cardSales, settings.currencySymbol),
        'Terminal Verified'
      ],
      [
        'Shift Cash Expenses',
        formatCurrency(reconciliation.expensesCashTotal, settings.currencySymbol),
        formatCurrency(reconciliation.expensesCashTotal, settings.currencySymbol),
        'Vouchers Verified'
      ],
      [
        'Total Shift Revenue',
        formatCurrency(reconciliation.totalGrossRevenue, settings.currencySymbol),
        formatCurrency(reconciliation.totalGrossRevenue, settings.currencySymbol),
        'Net Completed'
      ]
    ];

    exportReportToPdf({
      title: `End-of-Day Shift Settlement (Z-Report)`,
      subtitle: `Official Cash Drawer Audit & Payment Reconciliation for ${shiftDate}`,
      filename: `Shift_Z_Report_${shiftDate}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Expected Cash', value: formatCurrency(reconciliation.expectedCashTotal, settings.currencySymbol) },
        { label: 'Actual Cash Count', value: formatCurrency(reconciliation.actualCashCounted, settings.currencySymbol) },
        { label: 'Cash Variance', value: `${reconciliation.variance >= 0 ? '+' : ''}${formatCurrency(reconciliation.variance, settings.currencySymbol)}` },
        { label: 'Total Shift Sales', value: formatCurrency(reconciliation.totalGrossRevenue, settings.currencySymbol) },
      ],
    });
  };

  const handleSaveShift = () => {
    if (onSaveShiftSettlement) {
      onSaveShiftSettlement({
        ...reconciliation,
        notes: shiftNotes,
        status: 'verified_by_manager',
      });
    }
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                <Landmark className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  End-of-Day Shift Reconciliation (Z-Report)
                </h2>
                <p className="text-xs text-slate-500">
                  Compare system sales invoices against physical cash count & digital payment receipts
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Shift Date Picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-bold text-slate-600">Shift Date:</span>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden font-mono"
              />
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              title="Export Shift Audit to CSV"
            >
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Export Official Z-Report to PDF"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              id="print-z-report-btn"
              onClick={handlePrintZReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Print Z-Report</span>
            </button>
          </div>
        </div>

        {/* Live Variance Highlight Alert Bar */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
          reconciliation.varianceStatus === 'balanced'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : reconciliation.varianceStatus === 'overage'
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 ${
              reconciliation.varianceStatus === 'balanced' ? 'bg-emerald-600' :
              reconciliation.varianceStatus === 'overage' ? 'bg-amber-600' : 'bg-rose-600'
            }`}>
              {reconciliation.varianceStatus === 'balanced' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider">
                  Shift Balance Status: {(reconciliation.varianceStatus || 'balanced').toUpperCase()}
                </span>
              </div>
              <p className="text-xs mt-0.5 opacity-90">
                {reconciliation.varianceStatus === 'balanced' && 'Cash drawer is perfectly balanced with zero discrepancy.'}
                {reconciliation.varianceStatus === 'overage' && `Cash in drawer exceeds system calculation by +${formatCurrency(reconciliation.variance, settings.currencySymbol)}.`}
                {reconciliation.varianceStatus === 'shortage' && `Shortage detected: Missing ${formatCurrency(Math.abs(reconciliation.variance), settings.currencySymbol)} in cash.`}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Variance</span>
            <span className={`text-base font-black font-mono ${
              reconciliation.varianceStatus === 'balanced' ? 'text-emerald-800' :
              reconciliation.varianceStatus === 'overage' ? 'text-amber-800' : 'text-rose-800'
            }`}>
              {reconciliation.variance > 0 ? `+${formatCurrency(reconciliation.variance, settings.currencySymbol)}` : formatCurrency(reconciliation.variance, settings.currencySymbol)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Calculation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column 7: Expected Invoices & Payments Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Cash Ledger Breakdown Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>1. Expected Cash In Drawer Calculation</span>
            </h3>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">(+) Opening Cash Float</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCurrency(reconciliation.openingFloat, settings.currencySymbol)}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">(+) Cash Sales ({reconciliation.cashSalesCount} Invoices)</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{formatCurrency(reconciliation.cashSalesTotal, settings.currencySymbol)}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">(+) Manual Cash In / Float Add</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{formatCurrency(reconciliation.manualCashInTotal, settings.currencySymbol)}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">(-) Manual Cash Out / Drop</span>
                <span className="font-mono font-bold text-rose-700">
                  -{formatCurrency(reconciliation.manualCashOutTotal, settings.currencySymbol)}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">(-) Shop Expenses Paid from Cash</span>
                <span className="font-mono font-bold text-rose-700">
                  -{formatCurrency(reconciliation.expensesCashTotal, settings.currencySymbol)}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">(-) Cash Sales Refunds Issued</span>
                <span className="font-mono font-bold text-rose-700">
                  -{formatCurrency(reconciliation.refundsCashTotal, settings.currencySymbol)}
                </span>
              </div>

              <div className="py-3 flex items-center justify-between bg-slate-50 px-3 rounded-xl mt-1">
                <span className="font-black text-slate-900 text-sm">(=) Expected Cash in Drawer</span>
                <span className="font-mono font-black text-slate-900 text-base">
                  {formatCurrency(reconciliation.expectedCashTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>
          </div>

          {/* Digital Payments Breakdown Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>2. Digital & Bank Transfer Audit ({formatCurrency(reconciliation.digitalSales.totalDigital, settings.currencySymbol)})</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">KBZPay (KPay)</span>
                <p className="text-xs font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(reconciliation.digitalSales.kpay, settings.currencySymbol)}
                </p>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">WaveMoney</span>
                <p className="text-xs font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(reconciliation.digitalSales.wave, settings.currencySymbol)}
                </p>
              </div>

              <div className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">KBZ Bank</span>
                <p className="text-xs font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(reconciliation.digitalSales.kbz, settings.currencySymbol)}
                </p>
              </div>

              <div className="p-3 bg-red-50/60 border border-red-200/80 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-red-700">AYA Pay/Bank</span>
                <p className="text-xs font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(reconciliation.digitalSales.aya, settings.currencySymbol)}
                </p>
              </div>

              <div className="p-3 bg-sky-50/60 border border-sky-200/80 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">CB Pay/Bank</span>
                <p className="text-xs font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(reconciliation.digitalSales.cb, settings.currencySymbol)}
                </p>
              </div>

              <div className="p-3 bg-teal-50/60 border border-teal-200/80 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-700">Yoma Bank</span>
                <p className="text-xs font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(reconciliation.digitalSales.yoma, settings.currencySymbol)}
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Total Shift Gross Sales (Cash + Digital):</span>
              <span className="font-mono font-black text-slate-900 text-sm">
                {formatCurrency(reconciliation.totalGrossRevenue, settings.currencySymbol)} ({reconciliation.totalInvoicesCount} sales)
              </span>
            </div>
          </div>

        </div>

        {/* Right Column 5: Cashier Physical Bill Counting Calculator */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-indigo-600" />
                <span>Physical Cash Count</span>
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setUseDenominationCalculator(!useDenominationCalculator)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  {useDenominationCalculator ? 'Switch to Direct Input' : 'Use Bill Counter'}
                </button>
              </div>
            </div>

            {useDenominationCalculator ? (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-500 font-medium block">
                  Input bill counts for each Myanmar Kyat denomination:
                </span>

                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                  {MYANMAR_DENOMINATIONS.map(denom => (
                    <div key={denom} className="flex items-center justify-between gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                      <span className="font-mono font-black text-slate-800 w-20">
                        {denom.toLocaleString()} Ks
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-semibold">&times;</span>
                        <input
                          type="number"
                          min="0"
                          value={denominations[denom] || ''}
                          placeholder="0"
                          onChange={(e) => handleDenominationChange(denom, e.target.value)}
                          className="w-16 px-2 py-1 text-center bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 font-mono focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <span className="font-mono font-bold text-slate-700 w-24 text-right text-[11px]">
                        {formatCurrency((denominations[denom] || 0) * denom, settings.currencySymbol)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-black text-xs text-slate-900">Total Counted Cash:</span>
                  <span className="font-mono font-black text-sm text-indigo-700">
                    {formatCurrency(computedDenominations.sum, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 block">
                  Direct Actual Counted Cash Amount:
                </label>
                <input
                  type="number"
                  value={manualCountedInput}
                  onChange={(e) => setManualCountedInput(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Shift Sign-off & Notes */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">
                Cashier / Shift Audit Notes:
              </label>
              <textarea
                value={shiftNotes}
                onChange={(e) => setShiftNotes(e.target.value)}
                placeholder="e.g. 500 Ks short due to small coin change shortage..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden"
              />
            </div>

            {/* Save & Settle Button */}
            <div className="pt-1">
              <button
                type="button"
                id="save-shift-reconciliation-btn"
                onClick={handleSaveShift}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSavedNotice ? 'Shift Settled & Saved!' : 'Settle & Close Daily Shift'}</span>
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* Hidden Printable Official Z-Report / Daily Shift Audit Slip (Format for Thermal & Laser) */}
      <div id="z-report-printable-area" className="hidden print:block bg-white text-black p-4 font-mono text-xs max-w-[80mm] mx-auto border border-black">
        <div className="text-center border-b border-black pb-2 mb-2">
          <h1 className="text-sm font-black uppercase tracking-tight">{settings.shopName}</h1>
          <p className="text-[10px]">{settings.address}</p>
          <p className="text-[10px]">Tel: {settings.phone}</p>
          <div className="mt-1 pt-1 border-t border-black text-xs font-black">
            OFFICIAL DAILY Z-REPORT
          </div>
          <p className="text-[9px]">Shift Date: {reconciliation.shiftDate}</p>
          <p className="text-[9px]">Report Ref: {reconciliation.reconciliationNumber}</p>
          <p className="text-[9px]">Printed: {new Date().toLocaleString()}</p>
        </div>

        <div className="space-y-1 text-[10px] border-b border-black pb-2 mb-2">
          <div className="flex justify-between">
            <span>Opening Float:</span>
            <span>{formatCurrency(reconciliation.openingFloat, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Cash Sales ({reconciliation.cashSalesCount}):</span>
            <span>+{formatCurrency(reconciliation.cashSalesTotal, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between">
            <span>Manual Cash In:</span>
            <span>+{formatCurrency(reconciliation.manualCashInTotal, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between">
            <span>Manual Cash Out:</span>
            <span>-{formatCurrency(reconciliation.manualCashOutTotal, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between">
            <span>Shop Expenses:</span>
            <span>-{formatCurrency(reconciliation.expensesCashTotal, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between">
            <span>Refunds Out:</span>
            <span>-{formatCurrency(reconciliation.refundsCashTotal, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between font-black border-t border-black pt-1">
            <span>EXPECTED CASH:</span>
            <span>{formatCurrency(reconciliation.expectedCashTotal, settings.currencySymbol)}</span>
          </div>
        </div>

        <div className="space-y-1 text-[10px] border-b border-black pb-2 mb-2">
          <div className="font-black">DIGITAL PAYMENTS:</div>
          <div className="flex justify-between"><span>KPay:</span><span>{formatCurrency(reconciliation.digitalSales.kpay, settings.currencySymbol)}</span></div>
          <div className="flex justify-between"><span>Wave:</span><span>{formatCurrency(reconciliation.digitalSales.wave, settings.currencySymbol)}</span></div>
          <div className="flex justify-between"><span>KBZ/Bank:</span><span>{formatCurrency(reconciliation.digitalSales.kbz, settings.currencySymbol)}</span></div>
          <div className="flex justify-between font-black border-t border-black pt-1">
            <span>TOTAL DIGITAL:</span>
            <span>{formatCurrency(reconciliation.digitalSales.totalDigital, settings.currencySymbol)}</span>
          </div>
        </div>

        <div className="space-y-1 text-[10px] border-b border-black pb-2 mb-2">
          <div className="flex justify-between font-black">
            <span>ACTUAL COUNTED:</span>
            <span>{formatCurrency(reconciliation.actualCashCounted, settings.currencySymbol)}</span>
          </div>
          <div className="flex justify-between font-black text-xs">
            <span>VARIANCE ({(reconciliation.varianceStatus || 'balanced').toUpperCase()}):</span>
            <span>{formatCurrency(reconciliation.variance, settings.currencySymbol)}</span>
          </div>
        </div>

        <div className="pt-4 text-center text-[9px] space-y-4">
          <div className="flex justify-between pt-6 border-t border-black">
            <span>Cashier Sign: _________</span>
            <span>Manager Sign: _________</span>
          </div>
          <p>*** END OF SHIFT AUDIT ***</p>
        </div>
      </div>

    </div>
  );
};
