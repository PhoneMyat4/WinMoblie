import React, { useState, useMemo } from 'react';
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
  AlertTriangle,
  Gift
} from 'lucide-react';
import { Sale, ShopSettings, InvoiceCustomization } from '../../types';
import { formatCurrency, formatDateTime, formatImei, getPaymentMethodInfo, formatSalePaymentBreakdown } from '../../utils/formatters';
import { generateWhatsAppSaleMessage, openWhatsAppChat } from '../../utils/whatsapp';
import { RefundModal } from './RefundModal';
import { StorageService } from '../../utils/storage';
import { getActivePaymentQrs } from '../../utils/qrUtils';
import { DEFAULT_INVOICE_SECTION_ORDER, DEFAULT_INVOICE_SECTION_STYLES, resolveSectionOrder } from '../../utils/invoiceLayoutUtils';
import { InvoiceSectionRenderer, InvoiceSectionItemData } from '../invoice/InvoiceSectionRenderer';

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
    refundFundingSource?: 'cash_drawer' | 'digital_cash_pool';
    refundMethod: string;
    digitalChannel?: string;
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
    refundFundingSource?: 'cash_drawer' | 'digital_cash_pool';
    refundMethod: string;
    digitalChannel?: string;
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
    maxItemsPerA5Page: settings.invoiceCustomization?.maxItemsPerA5Page || 3,
    footerThankYouMessage: settings.receiptFooterMessage,
    warrantyPolicyText: settings.warrantyPolicy,
  };

  const maxItemsPerPage = custom.maxItemsPerA5Page || settings.invoiceCustomization?.maxItemsPerA5Page || 3;

  const a5Pages = useMemo(() => {
    if (paperWidth !== 'a5' || !sale.items || sale.items.length === 0) {
      return [sale.items || []];
    }
    const chunks: typeof sale.items[] = [];
    for (let i = 0; i < sale.items.length; i += maxItemsPerPage) {
      chunks.push(sale.items.slice(i, i + maxItemsPerPage));
    }
    return chunks;
  }, [paperWidth, sale.items, maxItemsPerPage]);

  const paymentQrs = useMemo(() => {
    return getActivePaymentQrs(custom, settings.shopName, settings.phone);
  }, [custom, settings.shopName, settings.phone]);

  const payInfo = getPaymentMethodInfo(sale.paymentMethod);
  const totalGiftSaved = sale.items
    .filter(i => i.isFoc)
    .reduce((sum, i) => sum + (i.originalPrice || i.unitPrice) * i.quantity, 0);

  const activeSectionOrder = useMemo(() => {
    return resolveSectionOrder(custom);
  }, [custom.sectionOrder]);

  const sectionItems: InvoiceSectionItemData[] = useMemo(() => {
    return (sale.items || []).map((i) => ({
      name: i.name,
      imei: i.imei,
      imei2: i.imei2,
      warranty: i.warrantyPeriod,
      qty: i.quantity,
      price: i.unitPrice,
      isFoc: i.isFoc,
    }));
  }, [sale.items]);

  const a5PageSectionItems = useMemo(() => {
    return a5Pages.map((page) =>
      page.map((i) => ({
        name: i.name,
        imei: i.imei,
        imei2: i.imei2,
        warranty: i.warrantyPeriod,
        qty: i.quantity,
        price: i.unitPrice,
        isFoc: i.isFoc,
      }))
    );
  }, [a5Pages]);

  const saleData = useMemo(() => ({
    invoiceNumber: sale.invoiceNumber,
    date: sale.date,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    customerAddress: sale.customerAddress,
    cashierName: sale.soldBy,
    paymentMethodText: formatSalePaymentBreakdown(sale, settings.currencySymbol),
    isRefunded,
    isPartiallyRefunded,
    financials: {
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      taxTotal: sale.taxTotal,
      taxRate: sale.taxRate,
      grandTotal: sale.grandTotal,
      amountPaid: sale.amountPaid,
      balanceDue: sale.balanceDue,
      totalGiftSaved,
      changeAmount: Math.max(0, (sale.amountPaid || 0) - (sale.grandTotal || 0)),
    },
  }), [sale, settings.currencySymbol, isRefunded, isPartiallyRefunded, totalGiftSaved]);

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
        <div data-print-hidden="true" className="print:hidden flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50">
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
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  paperWidth === 'a5' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>A5 Voucher</span>
                {paperWidth === 'a5' && a5Pages.length > 1 && (
                  <span className="px-1.5 py-0.2 rounded bg-indigo-500 text-white text-[9px] font-bold">
                    {a5Pages.length} Sheets
                  </span>
                )}
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
            /* ========================= A5 VOUCHER SLIP LAYOUT (MULTI-SHEET SPLIT SUPPORT) ========================= */
            <div className="w-full max-w-[660px] space-y-6 print:space-y-0 print:max-w-none print:w-full">
              {a5Pages.map((pageItems, pageIdx) => {
                const totalPages = a5Pages.length;
                const pageNumber = pageIdx + 1;
                const isFinalPage = pageNumber === totalPages;
                const pageSubtotal = pageItems.reduce((acc, i) => acc + (i.finalPrice || 0), 0);

                return (
                  <React.Fragment key={pageIdx}>
                    {pageIdx > 0 && (
                      <div data-print-hidden="true" className="flex items-center justify-center gap-3 py-1 print:hidden">
                        <div className="h-px bg-slate-300 flex-1"></div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-200 px-3 py-0.5 rounded-full shadow-2xs">
                          Sheet {pageNumber} of {totalPages} (Page Break)
                        </span>
                        <div className="h-px bg-slate-300 flex-1"></div>
                      </div>
                    )}
                    <div 
                      id={pageIdx === 0 ? "printable-a5-invoice" : undefined}
                      className="a5-voucher-sheet bg-white p-6 sm:p-8 shadow-xl border border-slate-300 w-full text-slate-900 font-sans text-xs leading-normal rounded-2xl space-y-4 print:shadow-none print:border-none print:p-4 print:max-w-none print:w-full print:rounded-none"
                    >
                      {activeSectionOrder.map((sectionKey) => {
                        const isTable = sectionKey === 'items_table';
                        const isHeader = sectionKey === 'logo_header';
                        const isCustomer = sectionKey === 'customer_tx_info';

                        if (!isFinalPage && !isTable && !isHeader && !isCustomer) {
                          return null;
                        }

                        const itemsForPage = a5PageSectionItems[pageIdx] || [];

                        return (
                          <React.Fragment key={sectionKey}>
                            <InvoiceSectionRenderer
                              sectionKey={sectionKey}
                              custom={custom}
                              settings={settings}
                              paperWidth="a5"
                              items={itemsForPage}
                              grandTotal={sale.grandTotal}
                              pageNumber={pageNumber}
                              totalPages={totalPages}
                              isFinalPage={isFinalPage}
                              paymentQrs={paymentQrs}
                              saleData={saleData}
                            />
                            {!isFinalPage && isTable && (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Sheet {pageNumber} Subtotal:</span>
                                    <span className="font-mono font-bold text-slate-900">{formatCurrency(pageSubtotal, settings.currencySymbol || 'Ks')}</span>
                                  </div>
                                  <div className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                                    Continued on Sheet {pageNumber + 1} of {totalPages} ➔
                                  </div>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            /* ========================= THERMAL RECEIPT SLIP LAYOUT (80mm / 58mm) ========================= */
            <div 
              id="printable-thermal-receipt" 
              className={`bg-white p-6 shadow-md border border-slate-300 w-full text-slate-900 font-mono leading-relaxed print:shadow-none print:border-none print:p-2 space-y-2 ${
                paperWidth === '58mm' ? 'max-w-[280px] text-[10px]' : 'max-w-[360px] text-[11px]'
              }`}
            >
              {activeSectionOrder.map((sectionKey) => (
                <InvoiceSectionRenderer
                  key={sectionKey}
                  sectionKey={sectionKey}
                  custom={custom}
                  settings={settings}
                  paperWidth={paperWidth === '58mm' ? '58mm' : '80mm'}
                  items={sectionItems}
                  grandTotal={sale.grandTotal}
                  paymentQrs={paymentQrs}
                  saleData={saleData}
                />
              ))}
            </div>
          )}

        </div>

        {/* Footer Actions (Hidden in Print) */}
        <div data-print-hidden="true" className="print:hidden px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
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
