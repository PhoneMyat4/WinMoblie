import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  ShieldAlert, 
  Truck, 
  PackageCheck, 
  FileText, 
  Building, 
  Calendar, 
  DollarSign, 
  Printer, 
  Image as ImageIcon, 
  Lock, 
  ArrowRight,
  Sparkles,
  Info,
  Layers,
  Smartphone,
  ExternalLink,
  Download,
  FileDown,
  ChevronDown,
  FileSpreadsheet,
  Paperclip,
  Eye
} from 'lucide-react';
import { PurchaseRecord, ShopSettings, StaffRole, PaymentMethod } from '../../types';
import { formatCurrency, formatDate, formatDateTime, getPaymentMethodInfo } from '../../utils/formatters';
import { 
  exportPurchaseOrderPdf, 
  exportPurchasePaymentVoucherPdf, 
  exportGoodsReceiptNotePdf, 
  exportPurchaseFullDossierPdf 
} from '../../utils/purchasePdfExport';

interface PurchaseWorkflowDetailModalProps {
  purchase: PurchaseRecord;
  settings: ShopSettings;
  currentRole: StaffRole;
  currentStaffName: string;
  canApprovePurchases?: boolean;
  canReceivePurchases?: boolean;
  onSubmitForApproval: (id: string) => void;
  onOpenPaymentModal: (purchase: PurchaseRecord) => void;
  onOpenReceiveModal: (purchase: PurchaseRecord) => void;
  onRevertStage?: (purchaseId: string, targetStatus: 'draft' | 'pending_approval' | 'confirmed') => void;
  onClose: () => void;
}

export const PurchaseWorkflowDetailModal: React.FC<PurchaseWorkflowDetailModalProps> = ({
  purchase,
  settings,
  currentRole,
  currentStaffName,
  canApprovePurchases,
  canReceivePurchases,
  onSubmitForApproval,
  onOpenPaymentModal,
  onOpenReceiveModal,
  onRevertStage,
  onClose,
}) => {
  const [selectedProofZoom, setSelectedProofZoom] = useState<boolean>(false);
  const [isSupplierVoucherZoom, setIsSupplierVoucherZoom] = useState<boolean>(false);
  const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState<boolean>(false);

  // RBAC Permission checks based on granular permissions with fallback to role
  const isAuthorizedStage2 = canApprovePurchases !== undefined ? canApprovePurchases : (currentRole === 'Owner' || currentRole === 'Manager');
  const isAuthorizedStage3 = canReceivePurchases !== undefined ? canReceivePurchases : true;

  // Step Status determination
  const isStage1Complete = purchase.status === 'pending_approval' || purchase.status === 'confirmed' || purchase.status === 'received';
  const isStage2Complete = purchase.status === 'confirmed' || purchase.status === 'received';
  const isStage3Complete = purchase.status === 'received';

  const totalQuantity = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = (purchase.deliveryCharges !== undefined ? purchase.deliveryCharges : purchase.shippingFee) || 0;
  const landedPerUnit = totalQuantity > 0 ? Math.round(deliveryFee / totalQuantity) : 0;
  const totalLandedCost = purchase.subtotal + (purchase.otherCosts || 0) + deliveryFee;

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Purchase_Order_${purchase.purchaseOrderNumber}_${purchase.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    document.body.classList.add('printing-po-active');

    window.print();

    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove('printing-po-active');
    }, 600);
  };

  return (
    <div id="purchase-workflow-detail-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-content">
        {/* On-Screen Modal Body (Hidden in Print) */}
        <div className="flex flex-col flex-1 overflow-hidden print:hidden">
          {/* Modal Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
              ERP
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-white">Purchase Order Workflow Tracker</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-mono font-bold border border-slate-700">
                  #{purchase.purchaseOrderNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Multi-Stage Procurement Lifecycle: Draft ➔ Executive Approval ➔ Goods Intake
              </p>
            </div>
          </div>
          <button 
            id="close-workflow-detail-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Stage Visual Stepper */}
        <div className="bg-slate-50 px-6 py-5 border-b border-slate-200">
          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-3 gap-2 relative">
              {/* Connecting Progress Line */}
              <div className="absolute top-4 left-1/6 right-1/6 h-1 bg-slate-200 -z-0">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-500"
                  style={{
                    width: isStage3Complete ? '100%' : isStage2Complete ? '50%' : isStage1Complete ? '20%' : '0%'
                  }}
                />
              </div>

              {/* Stage 1: Draft */}
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                  isStage1Complete
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : purchase.status === 'draft'
                    ? 'bg-amber-500 text-white ring-4 ring-amber-100'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {isStage1Complete ? <CheckCircle2 className="w-4 h-4" /> : '1'}
                </div>
                <span className="font-bold text-xs text-slate-900 mt-2">1. Draft Creation</span>
                <span className="text-[10px] text-slate-500">
                  {purchase.status === 'draft' ? 'Draft in progress' : `Created by ${purchase.createdBy || 'Cashier'}`}
                </span>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    purchase.status === 'draft'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {purchase.status === 'draft' ? 'Draft' : 'Submitted'}
                  </span>
                  <button
                    type="button"
                    onClick={() => exportPurchaseOrderPdf(purchase, settings)}
                    className="p-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-indigo-600 rounded-md text-[9px] font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-0.5"
                    title="Export Stage 1 Purchase Order (PO) PDF"
                  >
                    <FileDown className="w-2.5 h-2.5" />
                    <span>PO</span>
                  </button>
                </div>
              </div>

              {/* Stage 2: Confirmation & Payment */}
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                  isStage2Complete
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                    : purchase.status === 'pending_approval'
                    ? 'bg-purple-600 text-white ring-4 ring-purple-100 animate-pulse'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {isStage2Complete ? <CheckCircle2 className="w-4 h-4" /> : '2'}
                </div>
                <span className="font-bold text-xs text-slate-900 mt-2">2. Confirmation & Payment</span>
                <span className="text-[10px] text-slate-500">
                  {isStage2Complete 
                    ? `Approved by ${purchase.confirmedBy || 'Manager'}`
                    : 'Manager / Owner Approval'}
                </span>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    isStage2Complete
                      ? 'bg-emerald-100 text-emerald-800'
                      : purchase.status === 'pending_approval'
                      ? 'bg-purple-100 text-purple-800 border border-purple-300'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isStage2Complete ? 'Approved & Paid' : purchase.status === 'pending_approval' ? 'Pending Approval' : 'Awaiting Stage 1'}
                  </span>
                  {isStage2Complete && (
                    <button
                      type="button"
                      onClick={() => exportPurchasePaymentVoucherPdf(purchase, settings)}
                      className="p-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-emerald-600 rounded-md text-[9px] font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-0.5"
                      title="Export Stage 2 Payment Voucher & Disbursement Slip PDF"
                    >
                      <FileDown className="w-2.5 h-2.5" />
                      <span>Voucher</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stage 3: Goods Receipt */}
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                  isStage3Complete
                    ? 'bg-teal-600 text-white ring-4 ring-teal-100'
                    : purchase.status === 'confirmed'
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {isStage3Complete ? <CheckCircle2 className="w-4 h-4" /> : '3'}
                </div>
                <span className="font-bold text-xs text-slate-900 mt-2">3. Receive & Landed Cost</span>
                <span className="text-[10px] text-slate-500">
                  {isStage3Complete ? `Received by ${purchase.receivedBy}` : 'Stock Intake & Delivery Fee'}
                </span>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    isStage3Complete
                      ? 'bg-teal-100 text-teal-800'
                      : purchase.status === 'confirmed'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isStage3Complete ? 'Inventory Restocked' : purchase.status === 'confirmed' ? 'Ready to Receive' : 'Locked'}
                  </span>
                  {isStage3Complete && (
                    <button
                      type="button"
                      onClick={() => exportGoodsReceiptNotePdf(purchase, settings)}
                      className="p-1 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 text-teal-600 rounded-md text-[9px] font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-0.5"
                      title="Export Stage 3 Goods Receipt Note (GRN) & Serialized IMEI Intake PDF"
                    >
                      <FileDown className="w-2.5 h-2.5" />
                      <span>GRN</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-xs">
          {/* Top Info Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Vendor / Supplier</span>
              <strong className="text-xs text-slate-900 block truncate">{purchase.supplierName}</strong>
              <span className="text-[11px] text-slate-500">{purchase.supplierPhone || 'No phone recorded'}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Order Date</span>
              <strong className="text-xs text-slate-900 block">{formatDate(purchase.date)}</strong>
              <span className="text-[11px] text-slate-500 font-mono">Ref: {purchase.referenceInvoiceNo || 'N/A'}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Payment Status</span>
              <div className="flex items-center space-x-1 mt-0.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getPaymentMethodInfo(purchase.paymentMethod).badgeBg}`}>
                  {getPaymentMethodInfo(purchase.paymentMethod).shortLabel}
                </span>
                <span className="font-bold text-slate-900 capitalize">{purchase.paymentMethod}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium block">
                {purchase.paymentMethod === 'cash' ? 'Cash Drawer (Physical Cash)' : 'Digital Cash Pool (Remaining Cash)'}
              </span>
              <span className={`text-[10px] font-bold uppercase mt-0.5 block ${
                purchase.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {purchase.paymentStatus === 'paid' ? 'Fully Paid' : `Balance Due: ${formatCurrency(purchase.balanceDue, settings.currencySymbol)}`}
              </span>
            </div>

            <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200">
              <span className="text-[10px] text-indigo-700 uppercase font-bold block">Total Landed Valuation</span>
              <strong className="text-sm font-extrabold text-indigo-900 font-mono block">
                {formatCurrency(totalLandedCost, settings.currencySymbol)}
              </strong>
              <span className="text-[10px] text-indigo-600 font-medium">
                Incl. {formatCurrency(deliveryFee, settings.currencySymbol)} delivery
              </span>
            </div>
          </div>

          {/* Line Items Table with Landed Cost Valuation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Procured Line Items ({purchase.items.length})</span>
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">
                Total Ordered: <strong>{totalQuantity} Units</strong>
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Item Name & Specs</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Supplier Unit Cost</th>
                    <th className="p-2.5 text-right text-emerald-900 bg-emerald-50/50">Selling Price</th>
                    <th className="p-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchase.items.map((item, idx) => {
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center space-x-2 mt-0.5">
                            <span className="font-medium text-slate-700">{item.brand}</span>
                            {item.condition && (
                              <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded text-[10px]">
                                {item.condition.replace(/_/g, ' ')}
                              </span>
                            )}
                            {item.imeiList && item.imeiList.length > 0 && (
                              <span className="text-indigo-600 font-mono text-[10px]">
                                IMEIs: {item.imeiList.join(', ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 text-slate-600 capitalize">
                          {item.category.replace(/_/g, ' ')}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-700">
                          {formatCurrency(item.unitCost, settings.currencySymbol)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                          {formatCurrency(item.sellingPrice || 0, settings.currencySymbol)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(item.totalCost, settings.currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3-Stage ERP Audit Details Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Stage 1 Audit & Supplier Voucher Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Stage 1 PO &amp; Supplier Voucher</span>
                </h5>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isStage1Complete ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {purchase.status === 'draft' ? 'Draft' : 'Submitted'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Created By:</span>
                  <strong className="text-slate-900">{purchase.createdBy || 'Staff'}</strong>
                </div>
                {purchase.createdAt && (
                  <div className="flex justify-between">
                    <span>Drafted On:</span>
                    <span className="font-mono text-[11px]">{formatDateTime(purchase.createdAt)}</span>
                  </div>
                )}
                {purchase.submittedForApprovalAt && (
                  <div className="flex justify-between">
                    <span>Submitted On:</span>
                    <span className="font-mono text-[11px]">{formatDateTime(purchase.submittedForApprovalAt)}</span>
                  </div>
                )}
                {purchase.notes && (
                  <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700 italic">
                    "{purchase.notes}"
                  </div>
                )}
              </div>

              {/* Stage 1 Supplier Voucher Photo Preview */}
              {purchase.supplierVoucherPhoto ? (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Supplier Voucher / Bill</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSupplierVoucherZoom(!isSupplierVoucherZoom)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium underline flex items-center space-x-0.5 cursor-pointer"
                    >
                      <span>{isSupplierVoucherZoom ? 'Collapse' : 'Expand Voucher'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div 
                    onClick={() => setIsSupplierVoucherZoom(!isSupplierVoucherZoom)}
                    className="rounded-lg overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <img 
                      src={purchase.supplierVoucherPhoto} 
                      alt="Voucher from Supplier" 
                      className={`w-full object-contain ${isSupplierVoucherZoom ? 'max-h-80' : 'max-h-28'}`} 
                    />
                  </div>
                  {purchase.supplierVoucherFileName && (
                    <div className="flex items-center space-x-1 text-[10px] text-slate-400 truncate">
                      <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{purchase.supplierVoucherFileName}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
                  No supplier voucher photo attached.
                </div>
              )}
            </div>

            {/* Stage 2 Audit & Payment Proof Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Stage 2 Approval &amp; Payment Proof</span>
                </h5>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isStage2Complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {isStage2Complete ? 'Approved' : 'Pending'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Authorized Approver:</span>
                  <strong className="text-slate-900">{purchase.confirmedBy || 'Pending Manager Approval'}</strong>
                </div>
                {purchase.confirmedAt && (
                  <div className="flex justify-between">
                    <span>Approved Timestamp:</span>
                    <span className="font-mono text-[11px]">{formatDateTime(purchase.confirmedAt)}</span>
                  </div>
                )}
                {purchase.approvalNotes && (
                  <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700 italic">
                    "{purchase.approvalNotes}"
                  </div>
                )}
              </div>

              {/* Payment Proof Preview */}
              {purchase.paymentProofUrl ? (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Attached Payment Proof Slip</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedProofZoom(!selectedProofZoom)}
                      className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium underline flex items-center space-x-0.5 cursor-pointer"
                    >
                      <span>{selectedProofZoom ? 'Collapse' : 'Expand Slip'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div 
                    onClick={() => setSelectedProofZoom(!selectedProofZoom)}
                    className="rounded-lg overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <img 
                      src={purchase.paymentProofUrl} 
                      alt="Bank Proof Slip" 
                      className={`w-full object-contain ${selectedProofZoom ? 'max-h-80' : 'max-h-28'}`} 
                    />
                  </div>
                  {purchase.paymentProofFileName && (
                    <span className="text-[10px] text-slate-400 block truncate">{purchase.paymentProofFileName}</span>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
                  No payment slip attached yet.
                </div>
              )}
            </div>

            {/* Stage 3 Audit & Physical Intake Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                  <Truck className="w-4 h-4 text-teal-600" />
                  <span>Stage 3 Goods Intake & Delivery Fees</span>
                </h5>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isStage3Complete ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {isStage3Complete ? 'Received' : 'Awaiting Delivery'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Storekeeper / Received By:</span>
                  <strong className="text-slate-900">{purchase.receivedBy || 'Pending receipt'}</strong>
                </div>
                {purchase.receivedAt && (
                  <div className="flex justify-between">
                    <span>Receipt Date:</span>
                    <span className="font-mono text-[11px]">{formatDateTime(purchase.receivedAt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-teal-700 font-medium">
                  <span>Delivery & Cargo Fee:</span>
                  <span className="font-mono font-bold">+{formatCurrency(deliveryFee, settings.currencySymbol)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex items-center justify-between p-2 bg-teal-50/80 rounded-lg border border-teal-200 text-teal-900 text-[11px]">
                    <span className="flex items-center gap-1 font-semibold">
                      <Truck className="w-3.5 h-3.5 text-teal-700" />
                      <span>Shop Expense:</span>
                    </span>
                    <span className="font-bold text-teal-800">Auto-recorded under "Transport & Stock Delivery"</span>
                  </div>
                )}
                {purchase.receivingNotes && (
                  <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700 italic">
                    "{purchase.receivingNotes}"
                  </div>
                )}
              </div>

              {/* Inventory restock indicator */}
              <div className={`p-2.5 rounded-lg border flex items-center space-x-2 text-xs ${
                purchase.inventoryUpdated
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {purchase.inventoryUpdated 
                    ? `Physical inventory was automatically credited with ${totalQuantity} units.`
                    : 'Physical inventory has not been restocked yet.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions Based on Stage */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Close
            </button>

            {/* Backward stage navigation options */}
            {onRevertStage && purchase.status === 'pending_approval' && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Return this Purchase Order back to Draft status for revision?')) {
                    onRevertStage(purchase.id, 'draft');
                    onClose();
                  }
                }}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center space-x-1"
                title="Revert back to Draft stage"
              >
                <span>⬅ Return to Draft</span>
              </button>
            )}

            {onRevertStage && purchase.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Revert this confirmed Purchase Order back to Draft status for revision?')) {
                    onRevertStage(purchase.id, 'draft');
                    onClose();
                  }
                }}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center space-x-1"
                title="Revert back to Draft stage"
              >
                <span>⬅ Revert to Draft</span>
              </button>
            )}

            {onRevertStage && purchase.status === 'received' && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Rollback inventory receipt? This will deduct the restocked units and IMEIs from current inventory and return the order to Confirmed status.')) {
                    onRevertStage(purchase.id, 'confirmed');
                    onClose();
                  }
                }}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center space-x-1"
                title="Rollback inventory restock and return to Stage 2"
              >
                <span>⬅ Rollback to Confirmed</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Stage 1 Action: Submit for approval */}
            {purchase.status === 'draft' && (
              <button
                type="button"
                id="workflow-submit-approval-btn"
                onClick={() => {
                  onSubmitForApproval(purchase.id);
                  onClose();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <span>Submit for Manager Approval (➔ Stage 2)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Stage 2 Action: Approve & Pay */}
            {(purchase.status === 'draft' || purchase.status === 'pending_approval') && (
              <button
                type="button"
                id="workflow-open-payment-btn"
                onClick={() => {
                  onClose();
                  onOpenPaymentModal(purchase);
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-all ${
                  isAuthorizedStage2
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-500/20 cursor-pointer'
                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300 cursor-pointer'
                }`}
                title={isAuthorizedStage2 ? 'Confirm PO & Pay (Authorized)' : 'View Stage 2 Payment (Approval Permission Required)'}
              >
                {isAuthorizedStage2 ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirm PO & Pay (➔ Stage 2)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Stage 2 Approval Required</span>
                  </>
                )}
              </button>
            )}

            {/* Stage 3 Action: Receive Products */}
            {purchase.status === 'confirmed' && (
              <button
                type="button"
                id="workflow-open-receive-btn"
                onClick={() => {
                  onClose();
                  onOpenReceiveModal(purchase);
                }}
                className={`px-5 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer ${
                  isAuthorizedStage3
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                }`}
                title={isAuthorizedStage3 ? 'Receive products & IMEIs' : 'View Stage 3 Goods Intake (Receive Permission Required)'}
              >
                {isAuthorizedStage3 ? (
                  <>
                    <PackageCheck className="w-4 h-4" />
                    <span>Receive Products & IMEIs (➔ Stage 3)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Stage 3 Intake Required</span>
                  </>
                )}
              </button>
            )}

            {/* Export PDF Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                id="export-purchase-pdf-dropdown-btn"
                onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                title="Export Official PDF Documents"
              >
                <FileDown className="w-4 h-4 text-indigo-600" />
                <span>Export PDF</span>
                <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
              </button>

              {isPdfDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsPdfDropdownOpen(false)} 
                  />
                  <div className="absolute right-0 bottom-full mb-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-50 divide-y divide-slate-100 animate-fadeIn">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Procurement Stage PDF Reports
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          exportPurchaseOrderPdf(purchase, settings);
                          setIsPdfDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-indigo-50/80 rounded-lg flex items-center space-x-2.5 transition-colors cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          1
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-800 group-hover:text-indigo-700">Stage 1: Purchase Order (PO)</div>
                          <div className="text-[10px] text-slate-500">Official order & supplier quotation sheet</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          exportPurchasePaymentVoucherPdf(purchase, settings);
                          setIsPdfDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left rounded-lg flex items-center space-x-2.5 transition-colors cursor-pointer group ${
                          isStage2Complete ? 'hover:bg-emerald-50/80' : 'opacity-60 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isStage2Complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          2
                        </div>
                        <div>
                          <div className={`font-bold text-xs ${isStage2Complete ? 'text-slate-800 group-hover:text-emerald-700' : 'text-slate-500'}`}>
                            Stage 2: Payment Voucher Slip
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {isStage2Complete ? 'Approved disbursement & settlement receipt' : 'Available upon approval & payment'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          exportGoodsReceiptNotePdf(purchase, settings);
                          setIsPdfDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left rounded-lg flex items-center space-x-2.5 transition-colors cursor-pointer group ${
                          isStage3Complete ? 'hover:bg-teal-50/80' : 'opacity-60 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isStage3Complete ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          3
                        </div>
                        <div>
                          <div className={`font-bold text-xs ${isStage3Complete ? 'text-slate-800 group-hover:text-teal-700' : 'text-slate-500'}`}>
                            Stage 3: Goods Receipt Note (GRN)
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {isStage3Complete ? 'Serialized IMEIs & landed cost breakdown' : 'Available upon warehouse intake'}
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          exportPurchaseFullDossierPdf(purchase, settings);
                          setIsPdfDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-100 rounded-lg flex items-center space-x-2.5 transition-colors cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
                          ERP
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-800 group-hover:text-indigo-900">
                            Full 3-Stage Audit Dossier
                          </div>
                          <div className="text-[10px] text-slate-500">Complete multi-stage procurement lifecycle report</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Print PO */}
            <button
              type="button"
              id="print-purchase-order-btn"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              title="Print Official Purchase Order Document"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print PO</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Printable Purchase Order Document (Hidden on screen, Visible in Print)   */}
      {/* ========================================================================= */}
      <div id="printable-purchase-order" className="hidden print:block p-8 bg-white text-black font-sans text-xs leading-normal">
        {/* Official Company / Store Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-5">
          <div className="flex items-center gap-3">
            {(settings.logoUrl || settings.invoiceCustomization?.shopLogoUrl) && (
              <img 
                src={settings.logoUrl || settings.invoiceCustomization?.shopLogoUrl} 
                alt="Shop Logo" 
                className="w-14 h-14 object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <h1 className="text-xl font-black tracking-tight text-black uppercase">{settings.shopName || 'Mobile & Electronics Store'}</h1>
              {settings.tagline && (
                <p className="text-[11px] text-gray-700 font-medium">{settings.tagline}</p>
              )}
              <p className="text-[10px] text-gray-600 mt-0.5">
                {settings.address && <span>{settings.address}, {settings.cityCountry} • </span>}
                {settings.phone && <span>Tel: {settings.phone} • </span>}
                {settings.email && <span>Email: {settings.email}</span>}
              </p>
              {settings.taxRegistrationNumber && (
                <p className="text-[10px] text-gray-600 font-mono">Tax / Reg ID: {settings.taxRegistrationNumber}</p>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-black text-white font-extrabold text-sm uppercase tracking-wider rounded-xs">
              PURCHASE ORDER
            </span>
            <p className="text-sm font-mono font-bold mt-2 text-black">PO #{purchase.purchaseOrderNumber}</p>
            <p className="text-[11px] text-gray-700">Date: {formatDate(purchase.date)}</p>
            {purchase.referenceInvoiceNo && (
              <p className="text-[10px] text-gray-600 font-mono">Vendor Ref: {purchase.referenceInvoiceNo}</p>
            )}
            <div className="mt-1">
              <span className="inline-block px-2 py-0.5 border border-black text-[9px] font-bold uppercase">
                Status: {purchase.status === 'received' ? 'GOODS RECEIVED' : purchase.status === 'confirmed' ? 'APPROVED & PAID' : purchase.status === 'pending_approval' ? 'PENDING APPROVAL' : 'DRAFT'}
              </span>
            </div>
          </div>
        </div>

        {/* Vendor & Ship-To Address Cards */}
        <div className="grid grid-cols-2 gap-6 mb-5 border border-gray-300 p-3 bg-gray-50 rounded-xs">
          <div>
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-black border-b border-gray-300 pb-1 mb-1.5">
              Vendor / Supplier Information:
            </h4>
            <strong className="text-xs text-black block">{purchase.supplierName}</strong>
            {purchase.supplierPhone && (
              <p className="text-[11px] text-gray-700">Phone: {purchase.supplierPhone}</p>
            )}
            <p className="text-[10px] text-gray-600 font-mono">Supplier ID: {purchase.supplierId || 'Direct Supplier'}</p>
          </div>

          <div>
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-black border-b border-gray-300 pb-1 mb-1.5">
              Delivery Location & Store Details:
            </h4>
            <strong className="text-xs text-black block">{settings.shopName}</strong>
            <p className="text-[11px] text-gray-700">Receiving Desk / Store Inventory Department</p>
            {settings.address && (
              <p className="text-[10px] text-gray-600 mt-0.5">{settings.address}, {settings.cityCountry}</p>
            )}
            <p className="text-[10px] text-gray-600">
              Payment Term: <span className="font-bold uppercase text-black">{purchase.paymentMethod}</span> ({purchase.paymentStatus === 'paid' ? 'Fully Paid' : 'Pending / Balance Due'})
            </p>
          </div>
        </div>

        {/* Itemized Purchase Table */}
        <div className="mb-5">
          <table className="w-full text-left text-xs border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100 text-black font-bold border-b border-black">
                <th className="p-2 border-r border-black w-10 text-center">#</th>
                <th className="p-2 border-r border-black">Item Description & Specifications</th>
                <th className="p-2 border-r border-black w-24">Category</th>
                <th className="p-2 border-r border-black w-14 text-center">Qty</th>
                <th className="p-2 border-r border-black w-24 text-right">Unit Cost</th>
                <th className="p-2 w-28 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-300">
                  <td className="p-2 border-r border-black text-center font-mono">{index + 1}</td>
                  <td className="p-2 border-r border-black">
                    <strong className="text-black block text-xs">{item.name}</strong>
                    <div className="text-[10px] text-gray-600 flex flex-wrap gap-1 mt-0.5">
                      <span>Brand: {item.brand}</span>
                      {item.ram && <span>• RAM: {item.ram}</span>}
                      {item.rom && <span>• ROM: {item.rom}</span>}
                      {item.condition && <span>• Condition: {item.condition.replace(/_/g, ' ')}</span>}
                      {item.warrantyMonths && <span>• Warranty: {item.warrantyMonths} Months</span>}
                    </div>
                    {item.imeiList && item.imeiList.length > 0 && (
                      <div className="mt-1 text-[9px] font-mono text-gray-700">
                        IMEIs: {item.imeiList.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="p-2 border-r border-black text-gray-700 capitalize">
                    {item.category?.replace(/_/g, ' ') || 'General'}
                  </td>
                  <td className="p-2 border-r border-black text-center font-bold text-black font-mono">
                    {item.quantity}
                  </td>
                  <td className="p-2 border-r border-black text-right font-mono">
                    {formatCurrency(item.unitCost, settings.currencySymbol)}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-black">
                    {formatCurrency(item.totalCost || (item.unitCost * item.quantity), settings.currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Notes Summary */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="border border-gray-300 p-3 bg-gray-50 rounded-xs text-[11px] space-y-2">
            <h5 className="font-bold uppercase tracking-wider text-black text-[10px]">Procurement Audit & Notes:</h5>
            <div className="space-y-1 text-gray-700">
              <p>• <b>Created By:</b> {purchase.createdBy || 'Staff'} ({formatDate(purchase.date)})</p>
              {purchase.confirmedBy && <p>• <b>Approved & Paid By:</b> {purchase.confirmedBy}</p>}
              {purchase.receivedBy && <p>• <b>Goods Received By:</b> {purchase.receivedBy} ({purchase.receivedAt ? formatDate(purchase.receivedAt) : 'Restocked'})</p>}
            </div>
            {purchase.notes && (
              <div className="pt-2 border-t border-gray-200">
                <p className="font-bold text-[10px] uppercase text-gray-800">Order Remarks:</p>
                <p className="text-gray-700 italic">{purchase.notes}</p>
              </div>
            )}
          </div>

          <div className="border border-black p-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-700">
              <span>Items Subtotal ({totalQuantity} Units):</span>
              <span className="font-mono">{formatCurrency(purchase.subtotal, settings.currencySymbol)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Delivery / Freight Charges:</span>
                <span className="font-mono">+{formatCurrency(deliveryFee, settings.currencySymbol)}</span>
              </div>
            )}
            {purchase.otherCosts && purchase.otherCosts > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Customs / Other Surcharges:</span>
                <span className="font-mono">+{formatCurrency(purchase.otherCosts, settings.currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-black border-t-2 border-black pt-1.5">
              <span>Total PO Valuation:</span>
              <span className="font-mono font-extrabold">{formatCurrency(totalLandedCost, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-800 pt-1 border-t border-gray-300">
              <span>Amount Paid ({purchase.paymentMethod}):</span>
              <span className="font-mono font-semibold">{formatCurrency(purchase.amountPaid || (purchase.paymentStatus === 'paid' ? totalLandedCost : 0), settings.currencySymbol)}</span>
            </div>
            {purchase.balanceDue > 0 && (
              <div className="flex justify-between text-[11px] font-bold text-red-700">
                <span>Outstanding Balance Due:</span>
                <span className="font-mono">{formatCurrency(purchase.balanceDue, settings.currencySymbol)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Signatures & Approvals */}
        <div className="grid grid-cols-2 gap-12 pt-8 mt-6 border-t border-gray-300 text-xs">
          <div className="text-center">
            <div className="border-b border-black w-3/4 mx-auto mb-2" />
            <p className="font-bold uppercase text-[10px]">Authorised Store Purchasing Officer</p>
            <p className="text-[10px] text-gray-500">{purchase.confirmedBy || purchase.createdBy || settings.shopName}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-black w-3/4 mx-auto mb-2" />
            <p className="font-bold uppercase text-[10px]">Supplier / Vendor Acceptance</p>
            <p className="text-[10px] text-gray-500">{purchase.supplierName}</p>
          </div>
        </div>

        {/* Document Footer */}
        <div className="mt-8 text-center text-[9px] text-gray-400 border-t border-gray-200 pt-2">
          This is an official computer-generated Purchase Order document issued by {settings.shopName}.
        </div>
      </div>
    </div>
  </div>
  );
};
