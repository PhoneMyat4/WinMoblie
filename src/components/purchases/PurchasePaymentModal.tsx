import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  DollarSign, 
  CreditCard, 
  CheckCircle2, 
  Lock, 
  FileCheck,
  AlertTriangle,
  FileDown,
  Eye,
  Paperclip,
  ExternalLink,
  FileText,
  Banknote,
  Wallet,
  ArrowRightLeft
} from 'lucide-react';
import { PurchaseRecord, PaymentMethod, StaffRole, ShopSettings } from '../../types';
import { formatCurrency, getPaymentMethodInfo } from '../../utils/formatters';
import { exportPurchaseOrderPdf, exportPurchasePaymentVoucherPdf } from '../../utils/purchasePdfExport';
import { compressImageToBase64 } from '../../utils/imageCompression';
import { StorageService } from '../../utils/storage';
import { calculateRunningCapital } from '../../utils/capitalUtils';

interface PurchasePaymentModalProps {
  purchase: PurchaseRecord;
  settings: ShopSettings;
  currentRole: StaffRole;
  currentStaffName: string;
  hasPermission?: boolean;
  onConfirmPayment: (data: {
    paymentMethod: PaymentMethod;
    isFullyPaid: boolean;
    amountPaid: number;
    paymentProofUrl?: string;
    paymentProofFileName?: string;
    approvalNotes?: string;
    confirmedBy: string;
    confirmedByRole: StaffRole;
  }) => void;
  onRevertToDraft?: (purchaseId: string) => void;
  onClose: () => void;
}

export const PurchasePaymentModal: React.FC<PurchasePaymentModalProps> = ({
  purchase,
  settings,
  currentRole,
  currentStaffName,
  hasPermission,
  onConfirmPayment,
  onRevertToDraft,
  onClose,
}) => {
  // Role & Permission verification: checks role permissions system with fallback
  const isAuthorized = hasPermission !== undefined ? hasPermission : (currentRole === 'Owner' || currentRole === 'Manager');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(purchase.paymentMethod || 'kbz');
  const [isFullyPaid, setIsFullyPaid] = useState<boolean>(purchase.isFullyPaid ?? true);
  const [customAmountPaid, setCustomAmountPaid] = useState<number>(purchase.grandTotal || purchase.subtotal);
  const [proofImage, setProofImage] = useState<string | null>(purchase.paymentProofUrl || null);
  const [proofFileName, setProofFileName] = useState<string>(purchase.paymentProofFileName || '');
  const [isSupplierVoucherZoomed, setIsSupplierVoucherZoomed] = useState<boolean>(false);
  const [approvalNotes, setApprovalNotes] = useState<string>(purchase.approvalNotes || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  const effectiveAmountPaid = isFullyPaid ? purchase.grandTotal : customAmountPaid;

  // Compute live capital & liquid balances
  const liveCapital = React.useMemo(() => {
    const prods = StorageService.getProducts();
    const drawer = StorageService.getCashDrawer();
    const credits = StorageService.getCreditSales();
    const exps = StorageService.getExpenses();
    const sls = StorageService.getSales();
    const pur = StorageService.getPurchases();
    return calculateRunningCapital(prods, drawer, credits, exps, sls, undefined, pur);
  }, [transferSuccess]);

  const availableDigital = liveCapital.digitalBankBalances || 0;
  const availableDrawer = liveCapital.cashInDrawer || 0;
  const isDigital = paymentMethod !== 'cash';
  const hasDigitalDeficit = isDigital && effectiveAmountPaid > availableDigital;
  const digitalDeficit = hasDigitalDeficit ? effectiveAmountPaid - availableDigital : 0;

  const handleQuickTransferFromDrawer = (amountToTransfer: number) => {
    try {
      StorageService.recordCapitalCashTransfer({
        from: 'cash_drawer',
        to: 'digital_cash_pool',
        amount: amountToTransfer,
        digitalChannel: paymentMethod,
        reasonNotes: `Automated transfer for PO #${purchase.purchaseOrderNumber} payout`,
        performedBy: currentStaffName || 'Authorized Staff'
      });
      setTransferSuccess(`Transferred ${formatCurrency(amountToTransfer, settings.currencySymbol)} from Cash Drawer to Digital Cash Pool successfully!`);
      setErrorMessage(null);
      setTimeout(() => setTransferSuccess(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to transfer from drawer.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        setErrorMessage('Proof of payment image file size should be less than 8MB.');
        return;
      }
      setErrorMessage(null);
      setProofFileName(file.name);
      try {
        const compressed = await compressImageToBase64(file, { maxDimension: 1200, quality: 0.8 });
        setProofImage(compressed);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to compress receipt image.');
      }
    }
  };

  const handleSimulateSampleSlip = () => {
    const svgSlip = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="30%" fill="%2338bdf8" font-family="sans-serif" font-weight="bold" font-size="15" text-anchor="middle">BANK TRANSACTION RECEIPT</text><text x="50%" y="45%" fill="%23ffffff" font-family="sans-serif" font-size="13" text-anchor="middle">Beneficiary: ${purchase.supplierName}</text><text x="50%" y="60%" fill="%2394a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">Txn Ref: TXN-${Date.now().toString().slice(-8)}</text><text x="50%" y="78%" fill="%2322c55e" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle">TRANSFER SUCCESS: ${formatCurrency(effectiveAmountPaid, settings.currencySymbol)}</text></svg>`;
    setProofImage(svgSlip);
    setProofFileName(`bank_transfer_slip_${purchase.purchaseOrderNumber}.png`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) {
      setErrorMessage('Access Denied: You do not have permission to confirm POs and authorize payments (Stage 2 permission required).');
      return;
    }

    onConfirmPayment({
      paymentMethod,
      isFullyPaid,
      amountPaid: effectiveAmountPaid,
      paymentProofUrl: proofImage || undefined,
      paymentProofFileName: proofFileName || undefined,
      approvalNotes: approvalNotes.trim() || undefined,
      confirmedBy: currentStaffName,
      confirmedByRole: currentRole,
    });
  };

  return (
    <div id="purchase-payment-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-content">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Stage 2: Confirmation & Payment
                </span>
                <span className="text-xs text-slate-300 font-mono font-bold">
                  #{purchase.purchaseOrderNumber}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Manager/Owner Approval & Payment Disbursement
              </h3>
            </div>
          </div>
          <button 
            id="close-payment-modal-btn"
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RBAC Notification Banner */}
        <div className={`px-6 py-3 border-b text-xs flex items-center justify-between ${
          isAuthorized 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <div className="flex items-center space-x-2">
            {isAuthorized ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              <strong>RBAC Permission Check:</strong> Current User: <strong>{currentStaffName}</strong> (Role: <span className="font-mono underline">{currentRole}</span>).
              {isAuthorized ? ' Authorized for Stage 2 Payment Approval.' : ' Insufficient permission to authorize payment.'}
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            isAuthorized ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
          }`}>
            {isAuthorized ? 'Access Granted' : 'Approval Permission Required'}
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Order Summary Recap Card */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Supplier / Vendor:</span>
              <strong className="text-slate-900 font-semibold">{purchase.supplierName}</strong>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Total Items in PO:</span>
              <span className="font-medium text-slate-800">{purchase.items.length} items ({purchase.items.reduce((s, i) => s + i.quantity, 0)} units)</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
              <span className="font-bold text-slate-700">Total Payable Amount:</span>
              <span className="text-base font-extrabold text-indigo-700 font-mono">
                {formatCurrency(purchase.grandTotal, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Stage 1 Uploaded Voucher from Supplier Reference Card */}
          <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-xs">Voucher from Supplier (Uploaded at Stage 1)</h4>
              </div>
              {purchase.supplierVoucherPhoto ? (
                <div className="flex items-center space-x-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Attached
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSupplierVoucherZoomed(!isSupplierVoucherZoomed)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium underline flex items-center space-x-0.5 cursor-pointer"
                  >
                    <span>{isSupplierVoucherZoomed ? 'Collapse' : 'Expand Voucher'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                  No Voucher Attached
                </span>
              )}
            </div>

            {purchase.supplierVoucherPhoto ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-600">
                  Cross-check the supplier's original billing voucher against the order amount before authorizing payout.
                </p>
                <div 
                  onClick={() => setIsSupplierVoucherZoomed(!isSupplierVoucherZoomed)}
                  className="rounded-xl overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer hover:opacity-95 transition-opacity"
                >
                  <img 
                    src={purchase.supplierVoucherPhoto} 
                    alt="Voucher from Supplier" 
                    className={`w-full object-contain ${isSupplierVoucherZoomed ? 'max-h-96' : 'max-h-36'}`} 
                  />
                </div>
                {purchase.supplierVoucherFileName && (
                  <div className="flex items-center space-x-1 text-[10px] text-slate-500 truncate">
                    <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{purchase.supplierVoucherFileName}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
                No voucher/bill photo was uploaded during the Stage 1 draft creation.
              </div>
            )}
          </div>

          {/* 1. Payment Method Selector */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-800 text-xs">
              1. Payment Method <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['cash', 'kbz', 'kpay', 'wave', 'aya', 'cb', 'yoma'] as PaymentMethod[]).map((method) => {
                const info = getPaymentMethodInfo(method);
                const isSelected = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`p-2.5 rounded-xl border text-left flex items-center space-x-2 transition-all ${
                      isSelected 
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 ring-2 ring-indigo-500/20' 
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${info.badgeBg}`}>
                      {info.shortLabel}
                    </span>
                    <span className="font-bold text-xs truncate">{info.label}</span>
                  </button>
                );
              })}
            </div>
            {paymentMethod === 'cash' ? (
              <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-1.5 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  * Sourced from <strong>Cash Drawer (Physical Cash)</strong>. Automatically logs an outflow transaction in today's register upon confirmation.
                </span>
              </p>
            ) : (
              <div className="space-y-2 mt-1.5">
                <p className="text-[11px] text-indigo-800 bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-200 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      * Sourced from <strong>Digital Cash Pool ({getPaymentMethodInfo(paymentMethod).label})</strong> under <strong>Total Remaining Cash</strong>.
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200 shrink-0">
                    Avail: {formatCurrency(availableDigital, settings.currencySymbol)}
                  </span>
                </p>

                {/* Transfer Success Alert */}
                {transferSuccess && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{transferSuccess}</span>
                  </div>
                )}

                {/* Insufficient Digital Balance Warning with Quick Transfer */}
                {hasDigitalDeficit && (
                  <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2.5 animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs">
                        <p className="font-extrabold text-amber-900">
                          ⚠️ Insufficient Digital Cash Pool Balance
                        </p>
                        <p className="text-[11px] text-amber-800 leading-snug">
                          Digital Cash Pool has <strong className="text-amber-950 font-mono">{formatCurrency(availableDigital, settings.currencySymbol)}</strong>, but this payment requires <strong className="text-amber-950 font-mono">{formatCurrency(effectiveAmountPaid, settings.currencySymbol)}</strong> (Short by <strong className="text-rose-700 font-mono">{formatCurrency(digitalDeficit, settings.currencySymbol)}</strong>).
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] text-amber-800">
                        Counter Cash Drawer: <strong>{formatCurrency(availableDrawer, settings.currencySymbol)}</strong> available
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickTransferFromDrawer(digitalDeficit)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Transfer {formatCurrency(digitalDeficit, settings.currencySymbol)} from Cash Drawer</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Fully Paid Status Toggle */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-bold text-slate-900 text-xs flex items-center space-x-2">
                  <span>2. Payment Status Settlement</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Toggle whether the full order amount is being settled upfront
                </p>
              </div>
              <button
                type="button"
                id="toggle-fully-paid-btn"
                onClick={() => setIsFullyPaid(!isFullyPaid)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  isFullyPaid ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isFullyPaid ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-600">
                {isFullyPaid ? 'Settlement Type:' : 'Partial Payment Amount:'}
              </span>
              {isFullyPaid ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Fully Paid ({formatCurrency(purchase.grandTotal, settings.currencySymbol)})
                </span>
              ) : (
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={purchase.grandTotal}
                    step="any"
                    placeholder="0"
                    value={customAmountPaid === 0 ? '' : customAmountPaid}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomAmountPaid(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                    }}
                    className="w-36 px-2.5 py-1 border border-slate-300 rounded-lg text-right font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                  <span className="text-xs text-slate-500">{settings.currencySymbol}</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Image Upload Input Area (Proof of Payment / Bank Slip) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                <span>3. Attach Proof of Payment (Bank Transfer / QR Slip / Cheque)</span>
              </label>
              {!proofImage && (
                <button
                  type="button"
                  onClick={handleSimulateSampleSlip}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-medium"
                >
                  Attach Simulated Bank Receipt
                </button>
              )}
            </div>

            {proofImage ? (
              <div className="p-3 bg-slate-50 rounded-xl border border-indigo-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 truncate max-w-xs">{proofFileName || 'payment_proof_slip.png'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProofImage(null);
                      setProofFileName('');
                    }}
                    className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Remove</span>
                  </button>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-300 max-h-48 bg-slate-900 flex items-center justify-center">
                  <img src={proofImage} alt="Payment Proof" className="max-h-44 object-contain" />
                </div>
              </div>
            ) : (
              <label 
                id="payment-proof-dropzone"
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl bg-slate-50/70 hover:bg-indigo-50/40 cursor-pointer transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="font-bold text-slate-700 text-xs">
                  Click to browse or drop payment slip / screenshot
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Supports PNG, JPG, WebP, SVG (Max 5MB)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* 4. Approval Notes */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800 text-xs">
              4. Executive Approval Notes (Optional)
            </label>
            <input
              type="text"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="e.g. Approved wholesale terms, paid via KBZ Corporate Portal."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              id="export-payment-voucher-pdf-modal-btn"
              onClick={() => {
                exportPurchasePaymentVoucherPdf(purchase, settings, {
                  paymentMethod,
                  amountPaid: effectiveAmountPaid,
                  confirmedBy: currentStaffName,
                  confirmedByRole: currentRole,
                  approvalNotes,
                });
              }}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Export Stage 2 Official Payment Voucher & Disbursement Slip PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Voucher PDF</span>
            </button>

            {onRevertToDraft && (
              <button
                type="button"
                id="reject-to-draft-btn"
                onClick={() => {
                  if (confirm('Return this Purchase Order back to Draft status for revision?')) {
                    onRevertToDraft(purchase.id);
                    onClose();
                  }
                }}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center space-x-1"
                title="Send back to Draft status so cashier can edit lines or pricing"
              >
                <span>⬅ Return to Draft</span>
              </button>
            )}
          </div>

          <button
            type="button"
            id="submit-payment-confirmation-btn"
            disabled={!isAuthorized}
            onClick={handleSubmit}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 shadow-sm transition-all ${
              isAuthorized
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-500/20 active:scale-98 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isAuthorized ? (
              <>
                <FileCheck className="w-4 h-4" />
                <span>Confirm PO & Authorize Payment</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Approval Permission Required</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
