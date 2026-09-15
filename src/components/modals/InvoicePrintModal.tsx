import React, { useState } from 'react';
import { 
  Printer, 
  MessageSquare, 
  X, 
  Smartphone, 
  CheckCircle, 
  QrCode, 
  ShieldCheck, 
  Tag, 
  FileSpreadsheet, 
  FileText,
  Building2,
  Phone,
  Check,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { Sale, ShopSettings, InvoiceCustomization } from '../../types';
import { formatCurrency, formatDateTime, formatImei, getPaymentMethodInfo, formatSalePaymentBreakdown } from '../../utils/formatters';
import { generateWhatsAppSaleMessage, openWhatsAppChat } from '../../utils/whatsapp';
import { RefundModal } from './RefundModal';
import { StorageService } from '../../utils/storage';

interface InvoicePrintModalProps {
  sale: Sale | null;
  settings: ShopSettings;
  onClose: () => void;
  onProcessRefund?: (params: {
    saleId: string;
    itemsToRefund: {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      finalPrice: number;
      refundAmount: number;
      imei?: string;
      imei2?: string;
    }[];
    reason: string;
    refundMethod: string;
    restockItems: boolean;
    totalRefundAmount: number;
    staffName: string;
    notes?: string;
  }) => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ 
  sale, 
  settings, 
  onClose,
  onProcessRefund 
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm' | 'a5'>(
    settings.invoiceCustomization?.paperWidth || '80mm'
  );
  const [isRefundModalOpen, setIsRefundModalOpen] = useState<boolean>(false);

  if (!sale) return null;

  const isRefunded = sale.status === 'refunded';
  const isPartiallyRefunded = sale.status === 'partially_refunded';
  const hasReturnableItems = sale.items.some(i => (i.quantity - (i.refundedQuantity || 0)) > 0);

  const handleExecuteRefund = (params: {
    saleId: string;
    itemsToRefund: {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      finalPrice: number;
      refundAmount: number;
      imei?: string;
      imei2?: string;
    }[];
    reason: string;
    refundMethod: string;
    restockItems: boolean;
    totalRefundAmount: number;
    staffName: string;
    notes?: string;
  }) => {
    if (onProcessRefund) {
      onProcessRefund(params);
    } else {
      StorageService.processItemRefund(params);
    }
    setIsRefundModalOpen(false);
  };

  const custom: InvoiceCustomization = settings.invoiceCustomization || {
    headerTitle: settings.shopName,
    subHeader: settings.tagline,
    addressLine1: settings.address,
    city: settings.cityCountry,
    phone1: settings.phone,
    phone2: '',
    viberNumber: settings.viberNumber,
    facebookPage: 'facebook.com/mobileshop',
    showQrCode: true,
    qrType: 'kpay',
    qrAccountName: 'Shop Pay Account',
    qrAccountNumber: settings.phone,
    qrImageUrl: '',
    qrCustomText: '',
    shopLogoUrl: settings.invoiceLogoUrl || settings.invoiceCustomization?.shopLogoUrl || settings.logoUrl || '',
    invoiceLogoSize: settings.invoiceCustomization?.invoiceLogoSize || settings.invoiceLogoSize || 44,
    showShopLogo: true,
    showImeiDetails: true,
    showWarrantyDetails: true,
    showCashierName: true,
    showCustomerInfo: true,
    showPointsEarned: true,
    showBarcode: true,
    showSignatures: true,
    paperWidth: '80mm',
    fontSize: 'standard',
    footerThankYouMessage: settings.receiptFooterMessage,
    warrantyPolicyText: settings.warrantyPolicy,
  };

  const payInfo = getPaymentMethodInfo(sale.paymentMethod);

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = ' ';
    document.body.classList.add('printing-modal-active');
    
    window.print();
    
    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove('printing-modal-active');
    }, 500);
  };

  const handleSendWhatsApp = () => {
    if (!sale.customerPhone) {
      alert('No customer phone number provided for this sale.');
      return;
    }
    const message = generateWhatsAppSaleMessage(sale, settings);
    openWhatsAppChat(sale.customerPhone, message);
  };

  return (
    <div id="invoice-print-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop">
      <div className={`bg-white rounded-3xl shadow-2xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content ${
        paperWidth === 'a5' ? 'max-w-3xl' : 'max-w-xl'
      }`}>
        
        {/* Modal Header (Hidden in Print) */}
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Sale Slip Generated</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {formatSalePaymentBreakdown(sale, settings.currencySymbol)}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">Invoice #{sale.invoiceNumber}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Return / Refund Action Button */}
            {hasReturnableItems && (
              <button
                type="button"
                onClick={() => setIsRefundModalOpen(true)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-xs font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Return / Refund items from this invoice"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return / Refund</span>
              </button>
            )}

            {/* Paper Size Selector (80mm, 58mm, A5) */}
            <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  paperWidth === '80mm' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm Roll
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  paperWidth === '58mm' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58mm Roll
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('a5')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  paperWidth === 'a5' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>A5 Voucher</span>
                <span className="px-1 py-0.2 rounded bg-indigo-500 text-white text-[8px] font-bold">New</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          
          {paperWidth === 'a5' ? (
            /* ========================= A5 VOUCHER SLIP LAYOUT ========================= */
            <div 
              id="printable-a5-invoice" 
              className="bg-white p-6 sm:p-8 shadow-xl border border-slate-300 w-full max-w-[660px] text-slate-900 font-sans text-xs leading-normal rounded-2xl space-y-4 print:shadow-none print:border-none print:p-4 print:max-w-none print:w-full"
            >
              {/* A5 Header */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div className="space-y-1">
                  {custom.shopLogoUrl && (
                    <img
                      src={custom.shopLogoUrl}
                      alt="Logo"
                      style={{ height: `${custom.invoiceLogoSize || 44}px` }}
                      className="object-contain mb-1 bg-transparent"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900">
                    {custom.headerTitle || settings.shopName}
                  </h1>
                  {custom.subHeader && (
                    <p className="text-xs font-semibold text-slate-600">{custom.subHeader}</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {custom.addressLine1 || settings.address}, {custom.city || settings.cityCountry}
                  </p>
                </div>

                <div className="text-right space-y-0.5 text-[11px] text-slate-600">
                  <p className="font-mono font-bold text-slate-900 text-xs">NO: {sale.invoiceNumber}</p>
                  <p>Date: {formatDateTime(sale.date)}</p>
                  <p className="font-bold text-slate-800">Hotline: {custom.phone1 || settings.phone}</p>
                  {custom.viberNumber && <p>Viber: {custom.viberNumber}</p>}
                </div>
              </div>

              {/* Customer & Cashier Info Bar */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Bill To / Customer Info:</span>
                  <div className="font-bold text-slate-900 text-xs mt-0.5">
                    {custom.showCustomerInfo ? sale.customerName : 'Walk-in Customer'}
                  </div>
                  {sale.customerPhone && (
                    <div className="text-slate-600 font-mono text-[11px]">Phone: {sale.customerPhone}</div>
                  )}
                  {sale.customerAddress && (
                    <div className="text-slate-500 text-[10px]">{sale.customerAddress}</div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">Transaction Info:</span>
                  {custom.showCashierName && (
                    <div className="font-semibold text-slate-800 text-xs mt-0.5">
                      Cashier: <span className="font-bold text-slate-900">{sale.soldBy}</span>
                    </div>
                  )}
                  <div className="text-slate-700 text-xs mt-0.5">
                    Payment: <span className="font-bold text-slate-900">{formatSalePaymentBreakdown(sale, settings.currencySymbol)}</span>
                  </div>
                  {(isRefunded || isPartiallyRefunded) && (
                    <div className="mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isRefunded ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'
                      }`}>
                        {isRefunded ? 'Full Refund' : 'Partial Refund'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Itemized Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Item Description</th>
                      <th className="py-2.5 px-2 text-center w-14">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-4 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sale.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 align-top">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{item.name}</span>
                            {item.color && (
                              <span className="text-[10px] font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                {item.color}
                              </span>
                            )}
                            {(item.ram || item.rom) && (
                              <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-200">
                                {[item.ram, item.rom].filter(Boolean).join('/')}
                              </span>
                            )}
                            {item.refundedQuantity && item.refundedQuantity > 0 ? (
                              <span className="inline-block px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 text-[9px] font-bold">
                                Refunded ({item.refundedQuantity})
                              </span>
                            ) : null}
                          </div>
                          
                          {/* IMEI display */}
                          {custom.showImeiDetails && item.imei && (
                            <div className="text-[10px] text-blue-900 font-mono font-semibold mt-0.5 flex flex-wrap gap-2">
                              <span>IMEI1: {formatImei(item.imei)}</span>
                              {item.imei2 && <span>| IMEI2: {formatImei(item.imei2)}</span>}
                            </div>
                          )}

                          {/* Warranty display */}
                          {custom.showWarrantyDetails && item.warrantyPeriod && (
                            <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{item.warrantyPeriod}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold align-top">
                          {item.quantity}
                          {item.refundedQuantity && item.refundedQuantity > 0 ? (
                            <div className="text-[9px] text-rose-600 font-normal">(-{item.refundedQuantity})</div>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono align-top text-slate-700">
                          {formatCurrency(item.unitPrice, settings.currencySymbol)}
                          {item.discount > 0 && (
                            <span className="block text-[10px] text-rose-600">-{formatCurrency(item.discount, settings.currencySymbol)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 align-top">
                          <span className={item.refundedQuantity === item.quantity ? 'line-through text-slate-400' : ''}>
                            {formatCurrency(item.finalPrice, settings.currencySymbol)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bottom Breakdown: Left (QR & Terms) + Right (Financial Totals) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-1">
                
                {/* Left Column: Banking QR & Policies */}
                <div className="sm:col-span-7 space-y-2.5">
                  
                  {/* Banking Payment QR Box */}
                  {custom.showQrCode && (
                    <div className="p-3 bg-purple-50/50 border border-purple-200/80 rounded-xl flex items-center gap-3">
                      <div className="w-20 h-20 bg-white p-1 rounded-lg border border-purple-200 shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
                        {custom.qrImageUrl ? (
                          <img 
                            src={custom.qrImageUrl} 
                            alt="Banking Payment QR" 
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <QrCode className="w-14 h-14 text-slate-900" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-[10px] uppercase text-purple-950 tracking-wide">
                          {custom.qrCustomText || 'Scan to Pay with KPay / Wave'}
                        </div>
                        <div className="text-[11px] text-slate-700 truncate font-semibold mt-0.5">
                          {custom.qrAccountName || 'Golden Star Mobile'}
                        </div>
                        <div className="text-[11px] font-mono font-bold text-purple-700 mt-0.5">
                          {custom.qrAccountNumber || settings.phone}
                        </div>
                        <span className="inline-block mt-1 text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold uppercase">
                          {custom.qrType || 'KBZPAY'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Warranty Terms Policy */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Warranty & Return Policy:
                    </p>
                    <p className="leading-relaxed">{custom.warrantyPolicyText}</p>
                  </div>
                </div>

                {/* Right Column: Financial Summary Table */}
                <div className="sm:col-span-5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono">{formatCurrency(sale.subtotal, settings.currencySymbol)}</span>
                  </div>

                  {sale.discountTotal > 0 && (
                    <div className="flex justify-between text-rose-600 font-semibold">
                      <span>Total Discount:</span>
                      <span className="font-mono">-{formatCurrency(sale.discountTotal, settings.currencySymbol)}</span>
                    </div>
                  )}

                  {sale.taxTotal > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({sale.taxRate}%):</span>
                      <span className="font-mono">{formatCurrency(sale.taxTotal, settings.currencySymbol)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-black text-sm text-slate-900 border-t-2 border-slate-300 pt-1.5">
                    <span>NET TOTAL:</span>
                    <span className="text-emerald-700 font-mono font-black text-base">
                      {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700 pt-0.5 text-[11px]">
                    <span>Amount Paid:</span>
                    <span className="font-bold font-mono text-emerald-800">{formatCurrency(sale.amountPaid, settings.currencySymbol)}</span>
                  </div>

                  {sale.balanceDue > 0 ? (
                    <div className="flex justify-between text-rose-600 font-bold text-[11px]">
                      <span>Balance Due:</span>
                      <span className="font-mono">{formatCurrency(sale.balanceDue, settings.currencySymbol)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-emerald-700 text-[10px]">
                      <span>Payment Status:</span>
                      <span className="font-bold uppercase">Fully Paid</span>
                    </div>
                  )}

                  {/* Loyalty Points */}
                  {custom.showPointsEarned && sale.pointsEarned > 0 && (
                    <div className="pt-2 border-t border-dashed border-slate-300 text-center text-[10px] text-indigo-800 font-bold">
                      ★ Loyalty Points Earned: +{sale.pointsEarned} pts
                    </div>
                  )}
                </div>

              </div>

              {/* Signatures */}
              {(custom.showSignatures ?? true) && (
                <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-center text-[10px]">
                  <div>
                    <div className="border-b border-slate-400 pb-1 mb-1 font-mono text-slate-300">................................................</div>
                    <span className="font-bold text-slate-700">Customer's Signature</span>
                  </div>
                  <div>
                    <div className="border-b border-slate-400 pb-1 mb-1 font-mono text-slate-300">................................................</div>
                    <span className="font-bold text-slate-700">Authorized Store Signature & Stamp</span>
                  </div>
                </div>
              )}

              {/* Footer Thank You Note */}
              <div className="text-center pt-2 text-[10px] font-bold text-slate-700">
                {custom.footerThankYouMessage}
              </div>

            </div>
          ) : (
            /* ========================= THERMAL RECEIPT SLIP LAYOUT (80mm / 58mm) ========================= */
            <div 
              id="printable-thermal-receipt" 
              className={`bg-white p-6 shadow-md border border-slate-300 w-full text-slate-900 font-mono leading-relaxed print:shadow-none print:border-none print:p-2 ${
                paperWidth === '58mm' ? 'max-w-[280px] text-[10px]' : 'max-w-[360px] text-[11px]'
              }`}
            >
              {/* Header / Shop Branding */}
              <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-0.5">
                {custom.shopLogoUrl && (
                  <img
                    src={custom.shopLogoUrl}
                    alt="Logo"
                    style={{ height: `${Math.min(custom.invoiceLogoSize || 36, 64)}px` }}
                    className="mx-auto object-contain mb-1 bg-transparent"
                    referrerPolicy="no-referrer"
                  />
                )}
                <h1 className="text-base font-black tracking-wider uppercase text-slate-900">
                  {custom.headerTitle || settings.shopName}
                </h1>
                {custom.subHeader && (
                  <p className="text-[10px] text-slate-600">{custom.subHeader}</p>
                )}
                <p className="text-[10px] text-slate-600">
                  {custom.addressLine1 || settings.address}, {custom.city || settings.cityCountry}
                </p>
                <p className="text-[10px] font-bold text-slate-800">
                  Tel: {custom.phone1 || settings.phone} {custom.phone2 && `| ${custom.phone2}`}
                </p>
                {custom.viberNumber && (
                  <p className="text-[9px] text-slate-500">Viber: {custom.viberNumber}</p>
                )}
                {custom.facebookPage && (
                  <p className="text-[9px] text-slate-500">{custom.facebookPage}</p>
                )}
              </div>

              {/* Invoice Meta */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">INVOICE:</span>
                  <span className="font-bold">{sale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">DATE:</span>
                  <span>{formatDateTime(sale.date)}</span>
                </div>
                {custom.showCustomerInfo && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">CUSTOMER:</span>
                    <span className="font-bold">{sale.customerName}</span>
                  </div>
                )}
                {sale.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PHONE:</span>
                    <span>{sale.customerPhone}</span>
                  </div>
                )}
                {custom.showCashierName && (
                  <div className="flex justify-between text-slate-500">
                    <span>CASHIER:</span>
                    <span>{sale.soldBy}</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="py-2 border-b border-dashed border-slate-400">
                <div className="font-bold text-[10px] flex justify-between pb-1 border-b border-slate-200">
                  <span>ITEM & DESCRIPTION</span>
                  <span>TOTAL</span>
                </div>

                <div className="divide-y divide-slate-100 pt-1">
                  {sale.items.map((item, idx) => (
                    <div key={idx} className="py-1.5 space-y-0.5">
                      <div className="flex justify-between font-bold">
                        <span className="truncate pr-2 flex items-center gap-1">
                          <span>{item.name}</span>
                          {item.color && (
                            <span className="text-[9px] font-semibold text-amber-900 bg-amber-50 px-1 rounded border border-amber-200">
                              {item.color}
                            </span>
                          )}
                          {(item.ram || item.rom) && (
                            <span className="text-[9px] font-mono text-indigo-700 bg-indigo-50 px-1 rounded border border-indigo-200">
                              {[item.ram, item.rom].filter(Boolean).join('/')}
                            </span>
                          )}
                          {item.refundedQuantity && item.refundedQuantity > 0 ? (
                            <span className="text-[8px] bg-rose-100 text-rose-800 px-1 rounded font-bold">
                              Refunded ({item.refundedQuantity})
                            </span>
                          ) : null}
                        </span>
                        <span className={item.refundedQuantity === item.quantity ? 'line-through text-slate-400' : ''}>
                          {formatCurrency(item.finalPrice, settings.currencySymbol)}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>
                          {item.quantity} x {formatCurrency(item.unitPrice, settings.currencySymbol)} {item.discount > 0 ? `(-${formatCurrency(item.discount, settings.currencySymbol)})` : ''}
                          {item.refundedQuantity && item.refundedQuantity > 0 ? ` [Ret: -${item.refundedQuantity}]` : ''}
                        </span>
                        {custom.showWarrantyDetails && item.warrantyPeriod && (
                          <span className="text-emerald-700 font-semibold">{item.warrantyPeriod}</span>
                        )}
                      </div>

                      {custom.showImeiDetails && item.imei && (
                        <div className="text-[9px] text-blue-900 bg-blue-50/70 p-1 rounded font-mono">
                          IMEI: {formatImei(item.imei)}
                          {item.imei2 && ` | IMEI2: ${formatImei(item.imei2)}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(sale.subtotal, settings.currencySymbol)}</span>
                </div>
                {sale.discountTotal > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discount:</span>
                    <span>-{formatCurrency(sale.discountTotal, settings.currencySymbol)}</span>
                  </div>
                )}
                {sale.taxTotal > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax ({sale.taxRate}%):</span>
                    <span>{formatCurrency(sale.taxTotal, settings.currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-300 text-slate-900">
                  <span>NET TOTAL:</span>
                  <span>{formatCurrency(sale.grandTotal, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-slate-700 pt-0.5 text-[10px]">
                  <span>Paid:</span>
                  <span className="font-bold text-right">{formatSalePaymentBreakdown(sale, settings.currencySymbol)}</span>
                </div>
                {sale.balanceDue > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(sale.balanceDue, settings.currencySymbol)}</span>
                  </div>
                )}
              </div>

              {/* Loyalty points */}
              {custom.showPointsEarned && sale.pointsEarned > 0 && (
                <div className="py-1.5 border-b border-dashed border-slate-400 text-center text-[10px] text-indigo-700">
                  ★ Earned <strong>+{sale.pointsEarned} loyalty points</strong>!
                </div>
              )}

              {/* QR Payment Code on Receipt */}
              {custom.showQrCode && (
                <div className="py-2.5 text-center border-b border-dashed border-slate-400 space-y-1">
                  <div className="w-20 h-20 bg-white p-1 border border-slate-300 flex items-center justify-center mx-auto rounded overflow-hidden">
                    {custom.qrImageUrl ? (
                      <img 
                        src={custom.qrImageUrl} 
                        alt="Banking QR" 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center rounded">
                        <QrCode className="w-14 h-14 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] font-bold uppercase">{custom.qrCustomText || 'Scan to Pay via KPay / Wave'}</p>
                  <p className="text-[9px] text-slate-600">{custom.qrAccountName} ({custom.qrAccountNumber})</p>
                </div>
              )}

              {/* Barcode */}
              {custom.showBarcode && (
                <div className="pt-2 text-center">
                  <div className="h-6 bg-slate-800 w-3/4 mx-auto flex items-center justify-center text-white text-[8px] tracking-widest font-mono">
                    ||||| ||| |||| || |||||||
                  </div>
                  <p className="text-[8px] text-slate-400 mt-0.5">{sale.invoiceNumber}</p>
                </div>
              )}

              {/* Footer Policy Notes */}
              <div className="pt-2 text-center text-[9px] text-slate-500 space-y-1">
                <p className="font-bold text-slate-800">{custom.footerThankYouMessage}</p>
                <p>{custom.warrantyPolicyText}</p>
                <div className="pt-1 text-slate-400 text-[8px] tracking-widest uppercase">
                  * * * THANK YOU FOR VISITING * * *
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions (Hidden in Print) */}
        <div className="print:hidden px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>
              Format: <strong>{paperWidth === 'a5' ? 'A5 Half-Sheet Invoice' : `${paperWidth} Thermal Roll`}</strong>.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="send-whatsapp-receipt-btn"
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              Send WhatsApp Slip
            </button>

            <button
              id="print-invoice-btn"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              {paperWidth === 'a5' ? 'Print A5 Invoice Voucher' : 'Print Thermal Slip'}
            </button>
          </div>
        </div>

      </div>

      {/* Individual Item Return / Refund Modal */}
      <RefundModal
        sale={sale}
        settings={settings}
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        onProcessRefund={handleExecuteRefund}
      />

    </div>
  );
};
