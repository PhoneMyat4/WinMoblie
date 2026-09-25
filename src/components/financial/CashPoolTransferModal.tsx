import React, { useState, useMemo } from 'react';
import { 
  X, 
  ArrowRightLeft, 
  Banknote, 
  Wallet, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ShieldCheck,
  Building,
  Smartphone
} from 'lucide-react';
import { StorageService } from '../../utils/storage';
import { formatCurrency, getPaymentMethodInfo } from '../../utils/formatters';
import { ShopSettings, PaymentMethod, CapitalCashTransfer } from '../../types';
import { calculateRunningCapital } from '../../utils/capitalUtils';

interface CashPoolTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransferred?: () => void;
  settings: ShopSettings;
  suggestedDirection?: 'drawer_to_digital' | 'digital_to_drawer';
  suggestedAmount?: number;
  suggestedChannel?: PaymentMethod | string;
  suggestedReason?: string;
}

export const CashPoolTransferModal: React.FC<CashPoolTransferModalProps> = ({
  isOpen,
  onClose,
  onTransferred,
  settings,
  suggestedDirection = 'drawer_to_digital',
  suggestedAmount = 0,
  suggestedChannel = 'kpay',
  suggestedReason = ''
}) => {
  const [direction, setDirection] = useState<'drawer_to_digital' | 'digital_to_drawer'>(suggestedDirection);
  const [amount, setAmount] = useState<number>(suggestedAmount);
  const [channel, setChannel] = useState<string>(suggestedChannel);
  const [reason, setReason] = useState<string>(suggestedReason);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync suggestion if modal opens with preset parameters
  React.useEffect(() => {
    if (isOpen) {
      setDirection(suggestedDirection);
      if (suggestedAmount > 0) setAmount(suggestedAmount);
      if (suggestedChannel) setChannel(suggestedChannel);
      if (suggestedReason) setReason(suggestedReason);
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, suggestedDirection, suggestedAmount, suggestedChannel, suggestedReason]);

  // Current Live Balances
  const cashDrawer = useMemo(() => StorageService.getCashDrawer(), [isOpen, successMessage]);
  const products = useMemo(() => StorageService.getProducts(), [isOpen]);
  const creditSales = useMemo(() => StorageService.getCreditSales(), [isOpen]);
  const expenses = useMemo(() => StorageService.getExpenses(), [isOpen, successMessage]);
  const sales = useMemo(() => StorageService.getSales(), [isOpen]);
  const purchases = useMemo(() => StorageService.getPurchases(), [isOpen, successMessage]);
  const transfers = useMemo(() => StorageService.getCashTransfers(), [isOpen, successMessage]);

  const runningCapital = useMemo(() => {
    return calculateRunningCapital(products, cashDrawer, creditSales, expenses, sales, undefined, purchases);
  }, [products, cashDrawer, creditSales, expenses, sales, purchases, transfers, successMessage]);

  const cashInDrawer = runningCapital.cashInDrawer || 0;
  const digitalPool = runningCapital.digitalBankBalances || 0;
  const totalRemainingCash = runningCapital.totalRemainingCash || 0;

  // Max transferable based on direction
  const maxAvailable = direction === 'drawer_to_digital' ? cashInDrawer : digitalPool;

  // Post-transfer projection
  const projectedDrawer = direction === 'drawer_to_digital'
    ? Math.max(0, cashInDrawer - (amount || 0))
    : cashInDrawer + (amount || 0);

  const projectedDigital = direction === 'drawer_to_digital'
    ? digitalPool + (amount || 0)
    : Math.max(0, digitalPool - (amount || 0));

  const handleQuickAmount = (val: number) => {
    setAmount(val);
    setErrorMessage(null);
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid transfer amount greater than 0.');
      return;
    }

    if (direction === 'drawer_to_digital' && amount > cashInDrawer) {
      setErrorMessage(`Cannot transfer ${formatCurrency(amount, settings.currencySymbol)}. Cash Drawer only has ${formatCurrency(cashInDrawer, settings.currencySymbol)} available.`);
      return;
    }

    if (direction === 'digital_to_drawer' && amount > digitalPool) {
      setErrorMessage(`Cannot transfer ${formatCurrency(amount, settings.currencySymbol)}. Digital Cash Pool only has ${formatCurrency(digitalPool, settings.currencySymbol)} available.`);
      return;
    }

    try {
      const from = direction === 'drawer_to_digital' ? 'cash_drawer' : 'digital_cash_pool';
      const to = direction === 'drawer_to_digital' ? 'digital_cash_pool' : 'cash_drawer';

      StorageService.recordCapitalCashTransfer({
        from,
        to,
        amount,
        digitalChannel: channel,
        reasonNotes: reason.trim() || (direction === 'drawer_to_digital' ? 'Cash deposit to digital pool' : 'Digital withdrawal to drawer'),
        performedBy: 'Store Admin / Cashier'
      });

      setSuccessMessage(`Transferred ${formatCurrency(amount, settings.currencySymbol)} successfully between Cash Drawer & Digital Cash Pool.`);
      setAmount(0);
      setReason('');

      if (onTransferred) {
        onTransferred();
      }

      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to complete cash transfer.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg flex items-center gap-2">
                <span>Cash Pool Transfer & Adjustment</span>
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                Move liquid money between Physical Counter Cash & Digital Accounts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-700 flex-1">
          {/* Success / Error Messages */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Liquid Balances Snapshot Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wider">
                Current Liquid Balances
              </span>
              <span className="text-[11px] font-extrabold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                Total Remaining Cash: {formatCurrency(totalRemainingCash, settings.currencySymbol)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center sm:text-left">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[11px]">
                  <Banknote className="w-3.5 h-3.5 text-amber-500" />
                  <span>Physical Cash Drawer</span>
                </div>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {formatCurrency(cashInDrawer, settings.currencySymbol)}
                </p>
                <p className="text-[10px] text-slate-400">Counter Register Cash</p>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[11px]">
                  <Wallet className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Digital Cash Pool</span>
                </div>
                <p className="text-base sm:text-lg font-black text-slate-900 mt-1">
                  {formatCurrency(digitalPool, settings.currencySymbol)}
                </p>
                <p className="text-[10px] text-slate-400">KPay, Wave & Bank Accounts</p>
              </div>
            </div>
          </div>

          {/* Transfer Form */}
          <form onSubmit={handleExecuteTransfer} className="space-y-4">
            {/* Direction Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-2">
                Transfer Flow Direction *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDirection('drawer_to_digital')}
                  className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all ${
                    direction === 'drawer_to_digital'
                      ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${direction === 'drawer_to_digital' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Building className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 text-xs">Drawer ➜ Digital Pool</p>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Take counter cash & deposit into KPay or Bank
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDirection('digital_to_drawer')}
                  className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all ${
                    direction === 'digital_to_drawer'
                      ? 'border-amber-600 bg-amber-50/70 ring-2 ring-amber-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${direction === 'digital_to_drawer' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 text-xs">Digital Pool ➜ Drawer</p>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Withdraw KPay / Bank funds to replenish register float
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Digital Channel Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                Target Digital Channel / Account *
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="kpay">KBZPay (KPay)</option>
                <option value="wave">WavePay (Wave Money)</option>
                <option value="kbz">KBZ Bank (iBanking)</option>
                <option value="aya">AYA Bank (AYA Pay / Banking)</option>
                <option value="cb">CB Bank (CB Pay / Banking)</option>
                <option value="yoma">Yoma Bank (Next)</option>
                <option value="general">General Digital Pool Account</option>
              </select>
            </div>

            {/* Transfer Amount */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-900">
                  Transfer Amount ({settings.currencySymbol}) *
                </label>
                <span className="text-[10px] text-slate-500 font-medium">
                  Max Available: <strong>{formatCurrency(maxAvailable, settings.currencySymbol)}</strong>
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max={maxAvailable > 0 ? maxAvailable : undefined}
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="e.g. 100,000"
                  className="w-full pl-3.5 pr-20 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setAmount(maxAvailable)}
                  className="absolute right-2 top-2 px-2 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                >
                  All ({formatCurrency(maxAvailable, settings.currencySymbol)})
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[50000, 100000, 200000, 500000, 1000000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAmount(val)}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                  >
                    +{formatCurrency(val, settings.currencySymbol)}
                  </button>
                ))}
              </div>
            </div>

            {/* Transfer Reason / Reference Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                Transfer Reason & Reference Notes
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Evening counter cash deposit to KBZ Bank, KPay withdrawal for counter float"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            {/* Live Projected Balances Preview */}
            <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-100 rounded-2xl space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-indigo-950 font-bold">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Projected Post-Transfer Balances:</span>
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                  ✓ Total Cash Unchanged: {formatCurrency(totalRemainingCash, settings.currencySymbol)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-500">Drawer:</span>{' '}
                  <strong className="text-slate-900">{formatCurrency(projectedDrawer, settings.currencySymbol)}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-500">Digital Pool:</span>{' '}
                  <strong className="text-slate-900">{formatCurrency(projectedDigital, settings.currencySymbol)}</strong>
                </div>
              </div>
            </div>

            {/* Submit Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4 text-amber-300" />
                <span>Execute Transfer ({formatCurrency(amount || 0, settings.currencySymbol)})</span>
              </button>
            </div>
          </form>

          {/* History Accordion */}
          <div className="pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{showHistory ? 'Hide Transfer History' : `View Recent Transfer History (${transfers.length})`}</span>
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {transfers.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No transfers recorded yet.</p>
                ) : (
                  transfers.slice(0, 10).map((t) => (
                    <div key={t.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-[11px]">
                      <div>
                        <div className="flex items-center gap-1 font-bold text-slate-800">
                          <span>{t.from === 'cash_drawer' ? 'Drawer' : 'Digital'}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span>{t.to === 'cash_drawer' ? 'Drawer' : 'Digital'}</span>
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded uppercase">
                            {t.digitalChannel}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">{t.reasonNotes || 'No notes'}</p>
                        <p className="text-[9px] text-slate-400">{new Date(t.timestamp).toLocaleString()}</p>
                      </div>
                      <span className="font-mono font-extrabold text-slate-900">
                        {formatCurrency(t.amount, settings.currencySymbol)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
