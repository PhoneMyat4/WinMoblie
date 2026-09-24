import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Smartphone, 
  Zap, 
  Building, 
  Landmark, 
  CreditCard, 
  Split, 
  X, 
  Check, 
  Calculator, 
  Sparkles,
  QrCode,
  HandCoins,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PaymentMethod, Customer, ShopSettings, CreditInstallmentPlan } from '../../types';
import { formatCurrency, formatDate, getPaymentMethodInfo } from '../../utils/formatters';

interface PaymentModalProps {
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  customer: Customer | null;
  settings: ShopSettings;
  preOrderFulfillment?: {
    preOrderNumber: string;
    depositAmount: number;
    fullPrice: number;
  } | null;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirmSale: (paymentInfo: {
    paymentMethod: PaymentMethod;
    amountPaid: number;
    balanceDue: number;
    paymentDetails?: {
      cashAmount?: number;
      kpayAmount?: number;
      waveAmount?: number;
      yomaAmount?: number;
      kbzAmount?: number;
      ayaAmount?: number;
      cbAmount?: number;
      transactionRef?: string;
      accountName?: string;
      // Credit Sale Details
      downPayment?: number;
      downPaymentMethod?: PaymentMethod;
      principalCreditAmount?: number;
      interestRatePercent?: number;
      interestAmount?: number;
      termDays?: number;
      dueDate?: string;
      installmentCount?: number;
      installmentFrequency?: 'lump_sum' | 'weekly' | 'biweekly' | 'monthly';
      installments?: CreditInstallmentPlan[];
      guarantorName?: string;
      guarantorPhone?: string;
      guarantorNrc?: string;
      guarantorRelationship?: string;
      collateralDescription?: string;
      notes?: string;
      promissoryAgreementTerms?: string;
    };
    pointsEarned: number;
    pointsRedeemed: number;
  }) => void;
}

const MYANMAR_PAYMENT_CHANNELS: {
  id: PaymentMethod;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}[] = [
  { id: 'cash', label: 'Cash (MMK)', sub: 'Drawer Cash', icon: DollarSign, color: 'text-emerald-600', bg: 'hover:bg-emerald-50', border: 'border-emerald-500' },
  { id: 'kpay', label: 'KBZPay (KPay)', sub: 'Scan & Pay', icon: Smartphone, color: 'text-blue-600', bg: 'hover:bg-blue-50', border: 'border-blue-500' },
  { id: 'wave', label: 'WavePay', sub: 'Wave Money', icon: Zap, color: 'text-yellow-600', bg: 'hover:bg-yellow-50', border: 'border-yellow-500' },
  { id: 'kbz', label: 'KBZ Bank', sub: 'Mobile / iBanking', icon: Landmark, color: 'text-indigo-600', bg: 'hover:bg-indigo-50', border: 'border-indigo-500' },
  { id: 'aya', label: 'AYA Bank / Pay', sub: 'AYA Mobile', icon: CreditCard, color: 'text-red-600', bg: 'hover:bg-red-50', border: 'border-red-500' },
  { id: 'cb', label: 'CB Bank / Pay', sub: 'CB Mobile', icon: CreditCard, color: 'text-orange-600', bg: 'hover:bg-orange-50', border: 'border-orange-500' },
  { id: 'yoma', label: 'Yoma Bank', sub: 'Next App', icon: Building, color: 'text-rose-600', bg: 'hover:bg-rose-50', border: 'border-rose-500' },
  { id: 'split', label: 'Split Payment', sub: 'Cash + Digital', icon: Split, color: 'text-purple-600', bg: 'hover:bg-purple-50', border: 'border-purple-500' },
  { id: 'credit', label: 'Credit Sale (AR)', sub: 'Pay on Terms', icon: HandCoins, color: 'text-purple-600', bg: 'hover:bg-purple-50', border: 'border-purple-500' },
];

export const PaymentModal: React.FC<PaymentModalProps> = ({
  grandTotal,
  customer,
  settings,
  preOrderFulfillment,
  isProcessing = false,
  onClose,
  onConfirmSale,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState<number>(grandTotal);
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [senderAccountName, setSenderAccountName] = useState<string>('');

  // Split payment state
  const [splitCash, setSplitCash] = useState<number>(Math.round(grandTotal / 2));
  const [splitDigitalMethod, setSplitDigitalMethod] = useState<PaymentMethod>('kpay');
  const [splitDigitalAmount, setSplitDigitalAmount] = useState<number>(grandTotal - Math.round(grandTotal / 2));
  const [splitTxRef, setSplitTxRef] = useState<string>('');

  // Credit Sale state
  const [creditDownPayment, setCreditDownPayment] = useState<number>(0);
  const [creditDownPaymentMethod, setCreditDownPaymentMethod] = useState<PaymentMethod>('cash');
  const [creditTermDays, setCreditTermDays] = useState<number>(30);
  const [creditInstallmentCount, setCreditInstallmentCount] = useState<number>(1);
  const [creditInstallmentFrequency, setCreditInstallmentFrequency] = useState<'lump_sum' | 'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [creditGuarantorName, setCreditGuarantorName] = useState<string>(customer?.guarantorName || '');
  const [creditGuarantorPhone, setCreditGuarantorPhone] = useState<string>(customer?.guarantorPhone || '');
  const [creditGuarantorNrc, setCreditGuarantorNrc] = useState<string>(customer?.guarantorNrc || '');
  const [creditCollateral, setCreditCollateral] = useState<string>('');
  const [creditNotes, setCreditNotes] = useState<string>('');

  // Loyalty points
  const [usePoints, setUsePoints] = useState<boolean>(false);
  const maxRedeemablePoints = customer ? Math.min(customer.loyaltyPoints, Math.floor(grandTotal * 0.1)) : 0;
  const pointsDiscountValue = usePoints ? maxRedeemablePoints : 0; // 1 pt = 1 Ks

  const finalPayable = Math.max(0, grandTotal - pointsDiscountValue);
  const cashChange = Math.max(0, cashTendered - finalPayable);
  const cashShortage = Math.max(0, finalPayable - cashTendered);

  const pointsEarned = Math.floor(finalPayable * settings.loyaltyPointsPerDollar);

  // Credit calculation
  const creditPrincipal = Math.max(0, finalPayable - creditDownPayment);
  const creditDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + creditTermDays);
    return d.toISOString().split('T')[0];
  }, [creditTermDays]);

  // Installment schedule generation
  const generatedInstallments = useMemo<CreditInstallmentPlan[]>(() => {
    if (creditInstallmentCount <= 1) {
      return [{
        installmentNumber: 1,
        dueDate: creditDueDate,
        amountDue: creditPrincipal,
        amountPaid: 0,
        status: 'pending'
      }];
    }

    const perInstallment = Math.round(creditPrincipal / creditInstallmentCount);
    const plans: CreditInstallmentPlan[] = [];
    const intervalDays = creditInstallmentFrequency === 'weekly' ? 7 : creditInstallmentFrequency === 'biweekly' ? 14 : 30;

    let accumulated = 0;
    for (let i = 1; i <= creditInstallmentCount; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * intervalDays));
      const isLast = i === creditInstallmentCount;
      const amt = isLast ? (creditPrincipal - accumulated) : perInstallment;
      accumulated += amt;

      plans.push({
        installmentNumber: i,
        dueDate: d.toISOString().split('T')[0],
        amountDue: amt,
        amountPaid: 0,
        status: 'pending'
      });
    }
    return plans;
  }, [creditInstallmentCount, creditPrincipal, creditDueDate, creditInstallmentFrequency]);

  // Credit Limit check
  const customerCreditLimit = customer?.creditLimit || 5000000;
  const currentCreditBalance = customer?.outstandingCreditBalance || 0;
  const projectedCreditTotal = currentCreditBalance + creditPrincipal;
  const isCreditLimitExceeded = customer && projectedCreditTotal > customerCreditLimit;

  // Quick preset suggestions for MMK notes (e.g. 5,000, 10,000, 50,000, 100,000 increments)
  const quickCashPresets = [
    finalPayable,
    Math.ceil(finalPayable / 10000) * 10000,
    Math.ceil(finalPayable / 50000) * 50000,
    Math.ceil(finalPayable / 100000) * 100000,
  ].filter((v, idx, arr) => v >= finalPayable && arr.indexOf(v) === idx).slice(0, 4);

  const handleComplete = () => {
    if (method === 'credit' && !customer) {
      alert('Please select or create a Customer before finalizing a Credit Sale.');
      return;
    }

    try {
      confetti({
        particleCount: 65,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore
    }

    let paymentDetails: any = {};
    let amountPaid = finalPayable;
    let balanceDue = 0;

    if (method === 'cash') {
      paymentDetails = { cashAmount: finalPayable };
    } else if (method === 'kpay') {
      paymentDetails = { kpayAmount: finalPayable, transactionRef, accountName: senderAccountName };
    } else if (method === 'wave') {
      paymentDetails = { waveAmount: finalPayable, transactionRef, accountName: senderAccountName };
    } else if (method === 'kbz') {
      paymentDetails = { kbzAmount: finalPayable, transactionRef, accountName: senderAccountName };
    } else if (method === 'aya') {
      paymentDetails = { ayaAmount: finalPayable, transactionRef, accountName: senderAccountName };
    } else if (method === 'cb') {
      paymentDetails = { cbAmount: finalPayable, transactionRef, accountName: senderAccountName };
    } else if (method === 'yoma') {
      paymentDetails = { yomaAmount: finalPayable, transactionRef, accountName: senderAccountName };
    } else if (method === 'split') {
      paymentDetails = {
        cashAmount: splitCash,
        splitMethod: splitDigitalMethod,
        digitalMethod: splitDigitalMethod,
        digitalAmount: splitDigitalAmount,
        [`${splitDigitalMethod}Amount`]: splitDigitalAmount,
        transactionRef: splitTxRef,
      };
      amountPaid = splitCash + splitDigitalAmount;
      balanceDue = Math.max(0, finalPayable - amountPaid);
    } else if (method === 'credit') {
      paymentDetails = {
        downPayment: creditDownPayment,
        downPaymentMethod: creditDownPaymentMethod,
        principalCreditAmount: creditPrincipal,
        termDays: creditTermDays,
        dueDate: creditDueDate,
        installmentCount: creditInstallmentCount,
        installmentFrequency: creditInstallmentFrequency,
        installments: generatedInstallments,
        guarantorName: creditGuarantorName || customer?.guarantorName,
        guarantorPhone: creditGuarantorPhone || customer?.guarantorPhone,
        guarantorNrc: creditGuarantorNrc || customer?.guarantorNrc,
        collateralDescription: creditCollateral,
        notes: creditNotes,
        promissoryAgreementTerms: `Buyer ${customer?.name} agrees to settle ${formatCurrency(creditPrincipal, settings.currencySymbol)} on or before ${formatDate(creditDueDate)}.`,
      };
      amountPaid = creditDownPayment;
      balanceDue = creditPrincipal;
    }

    onConfirmSale({
      paymentMethod: method,
      amountPaid,
      balanceDue,
      paymentDetails,
      pointsEarned,
      pointsRedeemed: usePoints ? maxRedeemablePoints : 0,
    });
  };

  return (
    <div id="payment-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">Checkout & Settle Bill</h3>
            <p className="text-xs text-slate-500">Select payment channel & finalize register receipt</p>
          </div>
          <button
            id="close-payment-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          
          {/* Total Payable Box */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-300 font-bold uppercase tracking-wider">Total Amount Due</p>
              <h2 className="text-3xl font-black text-emerald-400 mt-1">
                {formatCurrency(finalPayable, settings.currencySymbol)}
              </h2>
              {usePoints && (
                <p className="text-xs text-indigo-300 mt-0.5">
                  Points applied: -{formatCurrency(pointsDiscountValue, settings.currencySymbol)}
                </p>
              )}
            </div>

            {customer && (
              <div className="text-right border-l border-slate-700 pl-4">
                <p className="text-xs text-slate-400">Customer</p>
                <p className="text-sm font-bold text-white">{customer.name}</p>
                <p className="text-xs text-indigo-300 font-mono">{customer.phone}</p>
              </div>
            )}
          </div>

          {/* Pre-Order Fulfillment Banner */}
          {preOrderFulfillment && (
            <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-indigo-950">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Fulfilling Pre-Order: {preOrderFulfillment.preOrderNumber}</span>
                </span>
                <span className="text-[11px] font-mono bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">
                  Deposit Credited
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                <div>Device Agreed Price: <span className="font-bold text-slate-900">{formatCurrency(preOrderFulfillment.fullPrice, settings.currencySymbol)}</span></div>
                <div className="text-right">Deposit Deducted: <span className="font-bold text-emerald-700">-{formatCurrency(preOrderFulfillment.depositAmount, settings.currencySymbol)}</span></div>
              </div>
            </div>
          )}

          {/* Loyalty Points Redemption */}
          {customer && customer.loyaltyPoints >= 100 && (
            <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <div>
                  <p className="font-bold text-indigo-900">Redeem Loyalty Points</p>
                  <p className="text-indigo-700 text-[11px]">
                    Use {maxRedeemablePoints} points for {formatCurrency(maxRedeemablePoints, settings.currencySymbol)} discount
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUsePoints(!usePoints)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  usePoints ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    usePoints ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Payment Methods Grid */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
              Select Myanmar Payment Channel
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MYANMAR_PAYMENT_CHANNELS.map((chan) => {
                const Icon = chan.icon;
                const isSelected = method === chan.id;

                return (
                  <button
                    key={chan.id}
                    type="button"
                    onClick={() => {
                      setMethod(chan.id);
                      if (chan.id === 'cash') {
                        setCashTendered(finalPayable);
                      }
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? `bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-400`
                        : `border-slate-200 text-slate-700 ${chan.bg}`
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-1 ${isSelected ? 'text-white' : chan.color}`} />
                    <span className="truncate w-full text-center">{chan.label}</span>
                    <span className={`text-[10px] font-normal ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                      {chan.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method Details Box */}
          {method === 'cash' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cash Received Tendered ({settings.currencySymbol})</label>
                <input
                  type="number"
                  placeholder="0"
                  value={cashTendered === 0 ? '' : cashTendered}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setCashTendered(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-lg font-black text-slate-900 font-mono"
                />
              </div>

              {/* Quick MMK Presets */}
              <div className="flex flex-wrap gap-1.5">
                {quickCashPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCashTendered(preset)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-md text-[11px] font-bold text-slate-700 font-mono"
                  >
                    {formatCurrency(preset, settings.currencySymbol)}
                  </button>
                ))}
              </div>

              {/* Change / Balance calculation */}
              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-emerald-950">
                    {cashShortage > 0 ? 'Amount Short (Due):' : 'Change Due to Customer:'}
                  </span>
                </div>
                <span className={`text-base font-black font-mono ${cashShortage > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {cashShortage > 0 ? `-${formatCurrency(cashShortage, settings.currencySymbol)}` : formatCurrency(cashChange, settings.currencySymbol)}
                </span>
              </div>
            </div>
          )}

          {(method === 'kpay' || method === 'wave' || method === 'kbz' || method === 'aya' || method === 'cb' || method === 'yoma') && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg">
                <QrCode className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-bold text-slate-900">
                    {settings.invoiceCustomization?.qrAccountName || 'Shop Pay Channel'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Account: {settings.invoiceCustomization?.qrAccountNumber || settings.phone}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Transaction Ref / Slip #</label>
                  <input
                    type="text"
                    placeholder="e.g. KP-88910294"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sender Account / Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. U Thura (09-77123...)"
                    value={senderAccountName}
                    onChange={(e) => setSenderAccountName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {method === 'split' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cash Portion ({settings.currencySymbol})</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={splitCash === 0 ? '' : splitCash}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const c = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                      setSplitCash(c);
                      setSplitDigitalAmount(Math.max(0, finalPayable - c));
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Digital App Channel</label>
                  <select
                    value={splitDigitalMethod}
                    onChange={(e) => setSplitDigitalMethod(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="kpay">KBZPay (KPay)</option>
                    <option value="wave">WavePay</option>
                    <option value="kbz">KBZ Bank</option>
                    <option value="aya">AYA Pay</option>
                    <option value="cb">CB Pay</option>
                    <option value="yoma">Yoma Bank</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Digital Portion ({settings.currencySymbol})</label>
                <input
                  type="number"
                  placeholder="0"
                  value={splitDigitalAmount === 0 ? '' : splitDigitalAmount}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const d = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                    setSplitDigitalAmount(d);
                    setSplitCash(Math.max(0, finalPayable - d));
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-blue-700"
                />
              </div>

              <div className="flex justify-between text-[11px] font-bold text-slate-600 pt-1 border-t border-slate-200">
                <span>Sum: {formatCurrency(splitCash + splitDigitalAmount, settings.currencySymbol)}</span>
                <span>Due: {formatCurrency(finalPayable, settings.currencySymbol)}</span>
              </div>
            </div>
          )}

          {/* Credit Sale / Accounts Receivable Configuration */}
          {method === 'credit' && (
            <div className="bg-purple-50/40 p-4 rounded-xl border border-purple-200 space-y-3.5 text-xs">
              
              {/* Customer Warning if missing */}
              {!customer ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Customer Required:</strong> Please close this dialog and select/create a registered customer before completing a credit sale.
                  </span>
                </div>
              ) : (
                <div className="p-2.5 bg-white border border-purple-100 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <div>
                      <p className="font-bold text-slate-900">{customer.name}</p>
                      <p className="text-[11px] text-slate-500">
                        NRC: {customer.nrcNumber || 'Not registered'} • Headroom Limit: {formatCurrency(customerCreditLimit, settings.currencySymbol)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[10px] text-slate-400 block">Existing Debt</span>
                    <span className="font-bold text-slate-700">{formatCurrency(currentCreditBalance, settings.currencySymbol)}</span>
                  </div>
                </div>
              )}

              {/* Credit Limit Alert */}
              {isCreditLimitExceeded && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>Credit Limit Exceeded:</strong> Total projected debt ({formatCurrency(projectedCreditTotal, settings.currencySymbol)}) exceeds customer limit of {formatCurrency(customerCreditLimit, settings.currencySymbol)}. Manager approval required.
                  </span>
                </div>
              )}

              {/* Down Payment & Channel */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Upfront Down Payment ({settings.currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={finalPayable}
                    placeholder="0"
                    value={creditDownPayment === 0 ? '' : creditDownPayment}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onChange={(e) => setCreditDownPayment(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Down Payment Method</label>
                  <select
                    value={creditDownPaymentMethod}
                    onChange={(e) => setCreditDownPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="cash">Cash (Drawer)</option>
                    <option value="kpay">KBZPay</option>
                    <option value="wave">WavePay</option>
                    <option value="kbz">KBZ Bank</option>
                    <option value="aya">AYA Pay</option>
                  </select>
                </div>
              </div>

              {/* Principal Financed & Term / Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Financed Principal Due</label>
                  <div className="px-3 py-2 bg-white border border-purple-200 rounded-lg font-mono font-black text-purple-700 text-sm">
                    {formatCurrency(creditPrincipal, settings.currencySymbol)}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Credit Term (Days)</label>
                  <select
                    value={creditTermDays}
                    onChange={(e) => setCreditTermDays(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value={7}>7 Days (Weekly)</option>
                    <option value={15}>15 Days (Half-month)</option>
                    <option value={30}>30 Days (1 Month)</option>
                    <option value={60}>60 Days (2 Months)</option>
                    <option value={90}>90 Days (3 Months)</option>
                    <option value={180}>180 Days (6 Months)</option>
                  </select>
                </div>
              </div>

              {/* Installments Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Installment Count</label>
                  <select
                    value={creditInstallmentCount}
                    onChange={(e) => setCreditInstallmentCount(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value={1}>1 (Lump Sum at Due Date)</option>
                    <option value={2}>2 Installments</option>
                    <option value={3}>3 Installments</option>
                    <option value={4}>4 Installments</option>
                    <option value={6}>6 Installments</option>
                    <option value={12}>12 Installments</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Frequency</label>
                  <select
                    value={creditInstallmentFrequency}
                    onChange={(e) => setCreditInstallmentFrequency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="biweekly">Bi-weekly (Every 2 wks)</option>
                    <option value="weekly">Weekly</option>
                    <option value="lump_sum">Lump sum at end</option>
                  </select>
                </div>
              </div>

              {/* Guarantor Details */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-purple-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guarantor Name</label>
                  <input
                    type="text"
                    placeholder="e.g. U Kyaw Thu"
                    value={creditGuarantorName}
                    onChange={(e) => setCreditGuarantorName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guarantor Phone</label>
                  <input
                    type="text"
                    placeholder="09-xxxxxxxxx"
                    value={creditGuarantorPhone}
                    onChange={(e) => setCreditGuarantorPhone(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Collateral / Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Collateral Lien / Agreement Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Device Serial IMEI Lien held until balance liquidated"
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              {/* Installment Schedule Preview Box */}
              {generatedInstallments.length > 1 && (
                <div className="p-2.5 bg-white border border-purple-100 rounded-lg space-y-1 text-[11px]">
                  <p className="font-bold text-slate-800 flex items-center justify-between">
                    <span>Generated Installment Schedule:</span>
                    <span className="font-mono text-purple-700">Due on {formatDate(creditDueDate)}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1 pt-1 font-mono text-[10px]">
                    {generatedInstallments.slice(0, 3).map((inst) => (
                      <div key={inst.installmentNumber} className="bg-purple-50/60 p-1 rounded border border-purple-100 text-center">
                        <span className="font-bold block">#{inst.installmentNumber}: {formatDate(inst.dueDate)}</span>
                        <span className="text-purple-700 font-bold">{formatCurrency(inst.amountDue, settings.currencySymbol)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleComplete}
            disabled={isProcessing || (method === 'cash' && cashShortage > 0) || (method === 'credit' && !customer)}
            className={`inline-flex items-center gap-2 px-6 py-2.5 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer ${
              method === 'credit' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isProcessing ? (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isProcessing 
              ? 'Verifying & Finalizing Sale...' 
              : method === 'credit' 
                ? 'Confirm Credit Sale & Create Promissory Note' 
                : 'Confirm Payment & Print Receipt'}
          </button>
        </div>

      </div>
    </div>
  );
};
