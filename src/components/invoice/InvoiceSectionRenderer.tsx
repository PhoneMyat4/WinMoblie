import React from 'react';
import {
  ShieldCheck,
  QrCode,
  Sparkles,
  Barcode,
  EyeOff,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { InvoiceCustomization, InvoicePaymentQrItem, InvoiceSectionKey, ShopSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  INVOICE_SECTIONS_META,
  resolveSectionStyle
} from '../../utils/invoiceLayoutUtils';

export interface InvoiceSectionItemData {
  name: string;
  imei?: string;
  imei2?: string;
  warranty?: string;
  qty: number;
  price: number;
  isFoc?: boolean;
}

interface InvoiceSectionRendererProps {
  sectionKey: InvoiceSectionKey;
  custom: InvoiceCustomization;
  settings: ShopSettings;
  paperWidth: '80mm' | '58mm' | 'a5';
  items: InvoiceSectionItemData[];
  grandTotal: number;
  pageNumber?: number;
  totalPages?: number;
  isFinalPage?: boolean;
  paymentQrs: InvoicePaymentQrItem[];
  // Interactive Figma Canvas Mode props
  isCanvasInspectMode?: boolean;
  isSelected?: boolean;
  onSelectSection?: (key: InvoiceSectionKey) => void;
  onMoveSection?: (key: InvoiceSectionKey, direction: 'up' | 'down') => void;
  onToggleVisibility?: (key: InvoiceSectionKey) => void;
  // Sale specific metadata (optional, for actual print modal)
  saleData?: {
    invoiceNumber: string;
    date: string;
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    cashierName: string;
    paymentMethodText: string;
    isRefunded?: boolean;
    isPartiallyRefunded?: boolean;
    financials?: {
      subtotal: number;
      discountTotal: number;
      taxTotal: number;
      taxRate?: number;
      grandTotal: number;
      amountPaid: number;
      balanceDue: number;
      totalGiftSaved?: number;
      changeAmount?: number;
    };
  };
}

export const InvoiceSectionRenderer: React.FC<InvoiceSectionRendererProps> = ({
  sectionKey,
  custom,
  settings,
  paperWidth,
  items,
  grandTotal,
  pageNumber = 1,
  totalPages = 1,
  isFinalPage = true,
  paymentQrs,
  isCanvasInspectMode = false,
  isSelected = false,
  onSelectSection,
  onMoveSection,
  onToggleVisibility,
  saleData,
}) => {
  const style = resolveSectionStyle(sectionKey, custom);
  const meta = INVOICE_SECTIONS_META[sectionKey];
  const isA5 = paperWidth === 'a5';

  // If hidden and not in canvas inspector mode, don't render anything
  if (!style.visible) {
    if (!isCanvasInspectMode) return null;
    return (
      <div
        onClick={() => onSelectSection?.(sectionKey)}
        className="p-2.5 my-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-100/50 text-slate-400 text-xs flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
          {meta?.title} (Hidden from print)
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility?.(sectionKey);
          }}
          className="text-[10px] font-bold text-blue-600 hover:underline px-2 py-0.5 rounded bg-white border border-slate-200"
        >
          Restore
        </button>
      </div>
    );
  }

  // Calculate box styling classes
  const getBoxClasses = () => {
    const list: string[] = ['relative transition-all'];

    // Alignment
    if (style.alignment === 'center') list.push('text-center');
    else if (style.alignment === 'right') list.push('text-right');
    else list.push('text-left');

    // Spacing
    if (style.spacing === 'compact') list.push(isA5 ? 'my-1 py-1 space-y-1' : 'my-1 py-1 space-y-1');
    else if (style.spacing === 'relaxed') list.push(isA5 ? 'my-4 py-3 space-y-3' : 'my-3 py-2 space-y-2');
    else list.push(isA5 ? 'my-2 py-2 space-y-2' : 'my-1.5 py-1.5 space-y-1.5');

    // Box Style (Remove boxes around text/sections across invoice for clean layout)
    if (isA5 || sectionKey === 'customer_tx_info' || sectionKey === 'logo_header' || sectionKey === 'items_table' || sectionKey === 'financial_totals' || sectionKey === 'payment_qrs' || sectionKey === 'warranty_policy') {
      // Clean borderless, boxless layout as requested by user
    } else if (style.boxStyle === 'card') {
      list.push('p-2 bg-slate-50/80 rounded-lg border border-slate-300');
    } else if (style.boxStyle === 'dashed') {
      list.push('py-2 px-1 border-y border-dashed border-slate-400');
    } else if (style.boxStyle === 'bordered') {
      list.push('p-2 border border-slate-400 rounded');
    }

    // Font Scaling
    if (style.fontSize === 'small') list.push('text-[10px] leading-tight');
    else if (style.fontSize === 'large') list.push('text-sm leading-relaxed');

    return list.join(' ');
  };

  // Section Content Renderers
  const renderSectionContent = () => {
    switch (sectionKey) {
      case 'logo_header':
        return renderLogoHeader();
      case 'customer_tx_info':
        return renderCustomerTxInfo();
      case 'items_table':
        return renderItemsTable();
      case 'financial_totals':
        return renderFinancialTotals();
      case 'payment_qrs':
        return renderPaymentQrs();
      case 'warranty_policy':
        return renderWarrantyPolicy();
      case 'signatures':
        return renderSignatures();
      case 'footer_note':
        return renderFooterNote();
      default:
        return null;
    }
  };

  // 1. Logo Header
  const renderLogoHeader = () => {
    if (isA5) {
      return (
        <div className="w-full flex flex-row items-start justify-between border-b-2 border-slate-900 pb-3 gap-4">
          {/* Left: Win Mobile / Shop Branding Text Group */}
          <div className="space-y-1 text-left min-w-0 flex-1">
            {custom.shopLogoUrl && (
              <img
                src={custom.shopLogoUrl}
                alt="Logo"
                style={{ height: `${custom.invoiceLogoSize || 44}px` }}
                className="object-contain mb-1 bg-transparent transition-all"
                referrerPolicy="no-referrer"
              />
            )}
            <h4 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900 leading-tight">
              {custom.headerTitle || settings.shopName}
            </h4>
            {custom.subHeader && (
              <p className="text-[11px] font-semibold text-slate-600 leading-tight">{custom.subHeader}</p>
            )}
            <p className="text-[10px] text-slate-500 leading-tight">
              {custom.addressLine1 || settings.address}, {custom.city || settings.cityCountry}
            </p>
          </div>

          {/* Right: Invoice Number Text Group (Horizontally in line with Win mobile) */}
          <div className="space-y-0.5 text-[10px] text-slate-600 text-right shrink-0">
            <div className="font-mono font-bold text-slate-900 text-xs flex items-center justify-end gap-1.5">
              <span>{saleData?.invoiceNumber || 'INV-2026-001'}</span>
              {totalPages > 1 && (
                <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded font-sans font-bold">
                  Page {pageNumber} of {totalPages}
                </span>
              )}
            </div>
            <p className="font-medium text-slate-700">{formatDateTime(saleData?.date || new Date().toISOString())}</p>
            <p className="font-bold text-slate-800">Hotline: {custom.phone1 || settings.phone}</p>
            {custom.phone2 && <p>Tel: {custom.phone2}</p>}
            {custom.viberNumber && <p>Viber: {custom.viberNumber}</p>}
          </div>
        </div>
      );
    }

    // Thermal Header
    return (
      <div className={`space-y-1 border-b border-dashed border-slate-300 pb-2.5 ${
        style.alignment === 'left' ? 'text-left' : style.alignment === 'right' ? 'text-right' : 'text-center'
      }`}>
        {custom.shopLogoUrl && (
          <img
            src={custom.shopLogoUrl}
            alt="Logo"
            style={{ height: `${Math.min(custom.invoiceLogoSize || 36, 60)}px` }}
            className={`object-contain mb-1 bg-transparent transition-all ${
              style.alignment === 'left' ? 'mr-auto' : style.alignment === 'right' ? 'ml-auto' : 'mx-auto'
            }`}
            referrerPolicy="no-referrer"
          />
        )}
        <h4 className="text-base font-black uppercase tracking-wider">{custom.headerTitle || settings.shopName}</h4>
        {custom.subHeader && <p className="text-[10px] text-slate-600">{custom.subHeader}</p>}
        <p className="text-[10px] text-slate-600">{custom.addressLine1 || settings.address}, {custom.city || settings.cityCountry}</p>
        <p className="text-[10px] font-bold">Hotline: {custom.phone1 || settings.phone} {custom.phone2 && `| ${custom.phone2}`}</p>
        {custom.viberNumber && <p className="text-[9px] text-slate-500">Viber: {custom.viberNumber}</p>}
      </div>
    );
  };

  // 2. Customer & Transaction Info
  const renderCustomerTxInfo = () => {
    if (isA5) {
      return (
        <div className="w-full flex flex-row items-start justify-between gap-4 py-1 text-[11px]">
          {/* Left: Customer Info (Under dividing line) */}
          <div className="space-y-0.5 text-left flex-1 min-w-0">
            <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider block">
              Bill To / Customer Info:
            </span>
            <div className="font-bold text-slate-900 text-xs mt-0.5">
              {custom.showCustomerInfo ? (saleData?.customerName || 'U Thura Min') : 'Walk-in Customer'}
            </div>
            {custom.showCustomerInfo && (
              <div className="text-slate-600 text-[10px]">
                {saleData?.customerPhone || '09-771234567'} {saleData?.customerAddress && `• ${saleData.customerAddress}`}
              </div>
            )}
          </div>

          {/* Right: Transaction Info (Under dividing line, horizontally aligned with Customer Info) */}
          <div className="space-y-0.5 text-right shrink-0">
            <span className="text-slate-400 font-bold text-[9px] uppercase tracking-wider block">
              Transaction Info:
            </span>
            {custom.showCashierName && (
              <div className="font-medium text-slate-700 text-xs mt-0.5">
                Cashier: <span className="font-bold text-slate-900">{saleData?.cashierName || settings.currentStaffName || 'Operator'}</span>
              </div>
            )}
            <div className="text-slate-700 text-xs mt-0.5">
              Payment: <span className="font-bold text-slate-900">{saleData?.paymentMethodText || 'KBZPay'}</span>
            </div>
          </div>
        </div>
      );
    }

    // Thermal
    return (
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span>INVOICE: #{saleData?.invoiceNumber || 'INV-2026-001'}</span>
          <span>{formatDateTime(saleData?.date || new Date().toISOString())}</span>
        </div>
        {custom.showCustomerInfo && (
          <div className="flex justify-between">
            <span>CUST: {saleData?.customerName || 'U Thura Min'}</span>
            <span>{saleData?.customerPhone || '09-771234567'}</span>
          </div>
        )}
        {custom.showCashierName && (
          <div className="flex justify-between text-slate-500">
            <span>OPERATOR: {saleData?.cashierName || settings.currentStaffName || 'Operator'}</span>
            <span>TERM: #01</span>
          </div>
        )}
      </div>
    );
  };

  // 3. Items Table
  const renderItemsTable = () => {
    if (isA5) {
      return (
        <div className="w-full">
          <table className="w-full text-left text-[11px]">
            <thead className="border-t border-b border-slate-900 text-slate-900 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2 pr-3 pl-0">Item Description</th>
                <th className="py-2 px-2 text-center w-12">Qty</th>
                <th className="py-2 px-2 text-right">Price</th>
                <th className="py-2 pl-3 pr-0 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 pr-3 pl-0">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    {custom.showImeiDetails && item.imei && (
                      <div className="text-[10px] text-blue-800 font-mono font-semibold flex flex-wrap gap-2">
                        <span>IMEI1: {item.imei}</span>
                        {item.imei2 && <span>| IMEI2: {item.imei2}</span>}
                      </div>
                    )}
                    {custom.showWarrantyDetails && item.warranty && (
                      <div className="text-[9px] text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600 inline" />
                        <span>{item.warranty}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold text-slate-800">{item.qty}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-slate-700">
                    {item.isFoc ? '0 Ks' : formatCurrency(item.price, settings.currencySymbol || 'Ks')}
                  </td>
                  <td className="py-2.5 pl-3 pr-0 text-right font-mono font-bold text-slate-900">
                    {item.isFoc ? '0 Ks' : formatCurrency(item.price * item.qty, settings.currencySymbol || 'Ks')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Thermal Items List
    return (
      <div className="border-t border-b border-dashed border-slate-300 py-2 space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="flex justify-between font-bold">
              <span className="line-clamp-1">{item.name}</span>
              <span className="shrink-0 ml-1">
                {item.isFoc ? '0 Ks' : formatCurrency(item.price * item.qty, settings.currencySymbol || 'Ks')}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{item.qty} x {formatCurrency(item.price, settings.currencySymbol || 'Ks')}</span>
              {custom.showWarrantyDetails && item.warranty && (
                <span className="text-emerald-700">{item.warranty}</span>
              )}
            </div>
            {custom.showImeiDetails && item.imei && (
              <div className="text-[9px] text-slate-600 font-mono">IMEI: {item.imei}</div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 4. Financial Breakdown & Totals
  const renderFinancialTotals = () => {
    const fin = saleData?.financials;
    const sub = fin ? fin.subtotal : grandTotal;
    const disc = fin ? fin.discountTotal : 0;
    const tax = fin ? fin.taxTotal : 0;
    const net = fin ? fin.grandTotal : grandTotal;
    const paid = fin ? fin.amountPaid : grandTotal;
    const bal = fin ? fin.balanceDue : 0;
    const gift = fin?.totalGiftSaved || 0;
    const curr = settings.currencySymbol || 'Ks';

    if (isA5) {
      return (
        <div className="space-y-1 text-[11px] max-w-xs ml-auto py-1">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-mono">{formatCurrency(sub, curr)}</span>
          </div>
          {disc > 0 && (
            <div className="flex justify-between text-rose-600 font-semibold">
              <span>Total Discount:</span>
              <span className="font-mono">-{formatCurrency(disc, curr)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Tax ({fin?.taxRate || 0}%):</span>
              <span className="font-mono">{formatCurrency(tax, curr)}</span>
            </div>
          )}
          {gift > 0 && (
            <div className="flex justify-between text-purple-800 font-bold text-[10px]">
              <span>🎁 Promo Savings:</span>
              <span className="font-mono">+{formatCurrency(gift, curr)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-sm text-slate-900 border-t-2 border-slate-900 pt-1.5 mt-1">
            <span>NET TOTAL:</span>
            <span className="text-emerald-700 font-mono font-bold text-base">{formatCurrency(net, curr)}</span>
          </div>
          <div className="flex justify-between text-slate-700 pt-0.5 text-[10px]">
            <span>Amount Paid:</span>
            <span className="font-bold font-mono">{formatCurrency(paid, curr)}</span>
          </div>
          {bal > 0 ? (
            <div className="flex justify-between text-rose-700 font-bold text-[10px]">
              <span>Balance Due (Credit):</span>
              <span className="font-mono">{formatCurrency(bal, curr)}</span>
            </div>
          ) : (
            <div className="flex justify-between text-emerald-700 text-[10px]">
              <span>Payment Status:</span>
              <span className="font-bold uppercase tracking-wider">Fully Paid</span>
            </div>
          )}
        </div>
      );
    }

    // Thermal Totals
    return (
      <div className="space-y-1 border-b border-dashed border-slate-300 pb-2 text-[11px]">
        <div className="flex justify-between">
          <span>SUBTOTAL:</span>
          <span>{formatCurrency(sub, curr)}</span>
        </div>
        {disc > 0 && (
          <div className="flex justify-between text-rose-600">
            <span>DISCOUNT:</span>
            <span>-{formatCurrency(disc, curr)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="flex justify-between">
            <span>TAX:</span>
            <span>{formatCurrency(tax, curr)}</span>
          </div>
        )}
        <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300">
          <span>NET TOTAL:</span>
          <span>{formatCurrency(net, curr)}</span>
        </div>
        <div className="flex justify-between">
          <span>PAID:</span>
          <span>{formatCurrency(paid, curr)}</span>
        </div>
        {bal > 0 ? (
          <div className="flex justify-between font-bold text-rose-600">
            <span>DUE:</span>
            <span>{formatCurrency(bal, curr)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-[10px]">
            <span>CHANGE:</span>
            <span>{formatCurrency(fin?.changeAmount || 0, curr)}</span>
          </div>
        )}
      </div>
    );
  };

  // 5. Multiple Banking Payment QRs (Minimalist)
  const renderPaymentQrs = () => {
    if (!custom.showQrCode || paymentQrs.length === 0) return null;

    if (isA5) {
      return (
        <div className="py-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            <QrCode className="w-3 h-3 text-slate-700" />
            <span>Scan to Pay (Banking QR)</span>
          </div>
          <div className="flex items-start gap-4 flex-wrap pt-0.5">
            {paymentQrs.map((qr) => (
              <div key={qr.id} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 sm:w-18 sm:h-18 bg-white p-1 rounded-lg border border-slate-300 shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
                  {qr.qrImageUrl ? (
                    <img 
                      src={qr.qrImageUrl} 
                      alt={qr.name} 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <QrCode className="w-12 h-12 text-slate-900" />
                  )}
                </div>
                <span className="text-[10px] font-black uppercase text-slate-900 tracking-wide mt-1 font-sans">
                  {qr.name}
                </span>
                {custom.showQrAccountDetails && qr.accountNumber && (
                  <span className="text-[9px] font-mono font-bold text-slate-600">
                    {qr.accountNumber}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Thermal QRs
    return (
      <div className="py-2 text-center border-b border-dashed border-slate-300 space-y-1.5">
        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">
          Scan to Pay
        </span>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {paymentQrs.map((qr) => (
            <div key={qr.id} className="flex flex-col items-center">
              <div className="w-16 h-16 bg-white p-1 border border-slate-300 rounded-lg flex items-center justify-center">
                {qr.qrImageUrl ? (
                  <img src={qr.qrImageUrl} alt={qr.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <QrCode className="w-12 h-12 text-slate-900" />
                )}
              </div>
              <span className="text-[10px] font-black uppercase mt-0.5">{qr.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 6. Warranty Policy Terms Card
  const renderWarrantyPolicy = () => {
    const policyText = custom.warrantyPolicyText || settings.warrantyPolicy;
    if (!policyText) return null;

    return (
      <div className="py-1 text-[9px] text-slate-600 space-y-0.5">
        <p className="font-bold text-slate-800 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600 inline" />
          Warranty &amp; Service Terms:
        </p>
        <p className="whitespace-pre-line leading-relaxed text-slate-600">{policyText}</p>
      </div>
    );
  };

  // 7. Signatures Blocks (A5 Slip)
  const renderSignatures = () => {
    if (!custom.showSignatures) return null;

    return (
      <div className="grid grid-cols-2 gap-6 pt-5 border-t border-slate-200 text-center text-[10px]">
        <div>
          <div className="border-b border-slate-400 pb-1 mb-1 font-mono text-slate-400">................................................</div>
          <span className="font-bold text-slate-700">Customer's Signature</span>
        </div>
        <div>
          <div className="border-b border-slate-400 pb-1 mb-1 font-mono text-slate-400">................................................</div>
          <span className="font-bold text-slate-700">Authorized Store Signature &amp; Stamp</span>
        </div>
      </div>
    );
  };

  // 8. Footer Note & Barcode
  const renderFooterNote = () => {
    return (
      <div className="text-center pt-2 space-y-1 text-[10px]">
        <div className="font-bold text-slate-800">
          {custom.footerThankYouMessage || settings.receiptFooterMessage}
        </div>
        {custom.showBarcode && (
          <div className="flex flex-col items-center justify-center pt-1">
            <div className="font-mono text-[9px] tracking-widest text-slate-500 uppercase">
              ||| | ||||| ||| |||| ||||| |||||
            </div>
            <span className="font-mono text-[8px] text-slate-400">
              {saleData?.invoiceNumber || 'INV-2026-001'}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={getBoxClasses()}>
      {renderSectionContent()}
    </div>
  );
};
