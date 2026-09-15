import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  X, 
  MessageSquare, 
  DollarSign, 
  Package, 
  Check, 
  AlertCircle,
  Smartphone,
  Tag
} from 'lucide-react';
import { Sale, SaleItem, ShopSettings } from '../../types';
import { formatCurrency, formatImei } from '../../utils/formatters';

interface RefundModalProps {
  sale: Sale | null;
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
  onProcessRefund: (params: {
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

export const RefundModal: React.FC<RefundModalProps> = ({
  sale,
  settings,
  isOpen,
  onClose,
  onProcessRefund,
}) => {
  if (!isOpen || !sale) return null;

  // Initialize return quantities for each item in the sale
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    sale.items.forEach((item, index) => {
      const returnable = Math.max(0, item.quantity - (item.refundedQuantity || 0));
      // Default to 0 or 1 if single returnable item
      initial[`${item.productId}_${item.imei || ''}_${index}`] = 0;
    });
    return initial;
  });

  const [reason, setReason] = useState<string>('Defective/Faulty');
  const [customReasonNote, setCustomReasonNote] = useState<string>('');
  const [refundMethod, setRefundMethod] = useState<string>('Cash');
  const [restockItems, setRestockItems] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Map each sale item with returnable calculation
  const itemsWithReturnable = useMemo(() => {
    return sale.items.map((item, index) => {
      const key = `${item.productId}_${item.imei || ''}_${index}`;
      const returnable = Math.max(0, item.quantity - (item.refundedQuantity || 0));
      const currentQty = returnQuantities[key] || 0;
      
      // Calculate unit price after discounts
      const unitFinalPrice = item.quantity > 0 ? (item.finalPrice / item.quantity) : item.unitPrice;
      const refundAmount = currentQty * unitFinalPrice;

      return {
        key,
        item,
        index,
        sold: item.quantity,
        returnable,
        currentQty,
        unitFinalPrice,
        refundAmount,
      };
    });
  }, [sale.items, returnQuantities]);

  // Calculate grand refund total
  const totalRefundAmount = useMemo(() => {
    return itemsWithReturnable.reduce((sum, i) => sum + i.refundAmount, 0);
  }, [itemsWithReturnable]);

  const totalReturnQty = useMemo(() => {
    return itemsWithReturnable.reduce((sum, i) => sum + i.currentQty, 0);
  }, [itemsWithReturnable]);

  const handleQuantityChange = (key: string, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, isNaN(value) ? 0 : value));
    setReturnQuantities(prev => ({
      ...prev,
      [key]: clamped,
    }));
  };

  const handleSetAllMax = () => {
    const updated: Record<string, number> = {};
    itemsWithReturnable.forEach(i => {
      updated[i.key] = i.returnable;
    });
    setReturnQuantities(updated);
  };

  const handleSetAllZero = () => {
    const updated: Record<string, number> = {};
    itemsWithReturnable.forEach(i => {
      updated[i.key] = 0;
    });
    setReturnQuantities(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalReturnQty <= 0) {
      alert('Please enter a return quantity greater than 0 for at least one item.');
      return;
    }

    const itemsToRefund = itemsWithReturnable
      .filter(i => i.currentQty > 0)
      .map(i => ({
        productId: i.item.productId,
        name: i.item.name,
        quantity: i.currentQty,
        unitPrice: i.item.unitPrice,
        finalPrice: i.item.finalPrice,
        refundAmount: i.refundAmount,
        imei: i.item.imei,
        imei2: i.item.imei2,
      }));

    setIsSubmitting(true);

    try {
      onProcessRefund({
        saleId: sale.id,
        itemsToRefund,
        reason: reason === 'Other' && customReasonNote.trim() ? customReasonNote.trim() : reason,
        refundMethod,
        restockItems,
        totalRefundAmount,
        staffName: settings.currentStaffName || 'Admin',
        notes: customReasonNote.trim() || undefined,
      });

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      id="refund-modal-overlay" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop"
    >
      <div 
        id="refund-modal-card" 
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 flex flex-col my-auto text-slate-900 animate-modal-content"
      >
        
        {/* Header matching user's photo: Dark navy bar with ↺ Return / Refund — INV-XXXX */}
        <div className="bg-[#0B1528] text-white px-5 py-4 flex items-center justify-between select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <RotateCcw className="w-5 h-5 text-slate-100 shrink-0" />
            <h2 className="text-base sm:text-lg font-black tracking-tight truncate">
              Return / Refund — {sale.invoiceNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          
          {/* Quick Item Selection Bar */}
          <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
            <span className="font-semibold">Select return quantities for individual items:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSetAllMax}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                Select All Max
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={handleSetAllZero}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Items Table - Matches photo styling exactly */}
          <div className="rounded-xl overflow-hidden border border-[#0B1528]/20 shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0B1528] text-white text-xs font-black select-none">
                  <th className="py-2.5 px-3.5 sm:px-4 font-bold">Item</th>
                  <th className="py-2.5 px-2 text-center font-bold w-14">Sold</th>
                  <th className="py-2.5 px-2 text-center font-bold w-20">Returnable</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right font-bold w-28">Return Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs sm:text-sm bg-white">
                {itemsWithReturnable.map(({ key, item, sold, returnable, currentQty, refundAmount }) => {
                  const isFullyReturned = returnable === 0;

                  return (
                    <tr 
                      key={key} 
                      className={`transition-colors ${
                        currentQty > 0 
                          ? 'bg-blue-50/60' 
                          : isFullyReturned 
                            ? 'bg-slate-50 opacity-60' 
                            : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Item Name & Details */}
                      <td className="py-3 px-3.5 sm:px-4 align-middle">
                        <div className="font-bold text-slate-900 leading-tight">
                          {item.name}
                        </div>
                        {item.imei && (
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Smartphone className="w-3 h-3 text-slate-400" />
                            <span>IMEI: {item.imei}</span>
                          </div>
                        )}
                        {currentQty > 0 && (
                          <div className="text-[11px] font-semibold text-blue-700 mt-0.5">
                            Refund: {formatCurrency(refundAmount, settings.currencySymbol)}
                          </div>
                        )}
                      </td>

                      {/* Sold Qty */}
                      <td className="py-3 px-2 text-center align-middle font-medium text-slate-700">
                        {sold}
                      </td>

                      {/* Returnable Qty */}
                      <td className="py-3 px-2 text-center align-middle font-medium text-slate-700">
                        <span className={`px-2 py-0.5 rounded-md font-bold ${
                          returnable > 0 ? 'bg-slate-100 text-slate-800' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {returnable}
                        </span>
                      </td>

                      {/* Return Qty Input */}
                      <td className="py-3 px-3 sm:px-4 text-right align-middle">
                        {isFullyReturned ? (
                          <span className="text-[11px] font-bold text-slate-400 italic">
                            Fully Refunded
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max={returnable}
                              value={currentQty === 0 ? '' : currentQty}
                              placeholder="0"
                              onChange={(e) => handleQuantityChange(key, parseInt(e.target.value, 10), returnable)}
                              className="w-16 sm:w-20 px-2.5 py-1.5 text-center font-bold text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0B1528] focus:border-[#0B1528] text-xs sm:text-sm"
                            />
                            {returnable > 1 && (
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(key, returnable, returnable)}
                                className="text-[10px] font-black px-1.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                                title="Set to max returnable"
                              >
                                Max
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Form Row: Reason & Refund Method (2 columns as in photo) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
            
            {/* Reason Dropdown */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-600" />
                <span>Reason</span>
              </label>
              <div className="relative">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0B1528] focus:border-[#0B1528] cursor-pointer appearance-none pr-8"
                >
                  <option value="Defective/Faulty">Defective/Faulty</option>
                  <option value="Customer Changed Mind">Customer Changed Mind</option>
                  <option value="Wrong Item Sold">Wrong Item Sold</option>
                  <option value="Warranty Claim / Exchange">Warranty Claim / Exchange</option>
                  <option value="Overcharged / Price Correction">Overcharged / Price Correction</option>
                  <option value="Damaged in Box">Damaged in Box</option>
                  <option value="Other">Other</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>

              {reason === 'Other' && (
                <input
                  type="text"
                  placeholder="Specify custom reason..."
                  value={customReasonNote}
                  onChange={(e) => setCustomReasonNote(e.target.value)}
                  className="mt-2 w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B1528]"
                  autoFocus
                />
              )}
            </div>

            {/* Refund Method Dropdown */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-600" />
                <span>Refund Method</span>
              </label>
              <div className="relative">
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0B1528] focus:border-[#0B1528] cursor-pointer appearance-none pr-8"
                >
                  <option value="Cash">Cash (from Drawer)</option>
                  <option value="KBZPay (KPay)">KBZPay (KPay)</option>
                  <option value="WavePay">WavePay</option>
                  <option value="Card / Bank Transfer">Card / Bank Transfer</option>
                  <option value="Store Credit">Store Credit / Voucher</option>
                  <option value={(sale.paymentMethod || 'cash').toUpperCase()}>Original ({(sale.paymentMethod || 'cash').toUpperCase()})</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>
            </div>

          </div>

          {/* Restock Items Switch (Exactly as in photo) */}
          <div className="pt-2 flex items-center justify-between gap-3 select-none">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Package className="w-3.5 h-3.5 text-slate-700" />
                <span>Restock items</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Return goods to sellable inventory (reverses COGS).
              </p>
            </div>

            {/* iOS Style Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={restockItems}
                onChange={(e) => setRestockItems(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2563EB]"></div>
            </label>
          </div>

          {/* Horizontal Divider */}
          <div className="border-t border-slate-200 my-2"></div>

          {/* Refund Total Row */}
          <div className="flex items-center justify-between py-1">
            <span className="text-base sm:text-lg font-black text-[#0B1528]">
              Refund total
            </span>
            <span className="text-xl sm:text-2xl font-black text-[#0B1528] tracking-tight">
              {formatCurrency(totalRefundAmount, settings.currencySymbol)}
            </span>
          </div>

          {/* Action Buttons: Process Refund (Dark Navy) & Cancel (Slate Grey) */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={totalReturnQty === 0 || isSubmitting}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-xs sm:text-sm text-white transition-all shadow-md cursor-pointer ${
                totalReturnQty === 0 || isSubmitting
                  ? 'bg-slate-400 cursor-not-allowed opacity-70'
                  : 'bg-[#0B1528] hover:bg-[#152542] active:scale-[0.99]'
              }`}
            >
              <Check className="w-4 h-4 font-black" />
              <span>{isSubmitting ? 'Processing...' : 'Process Refund'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm bg-slate-600 hover:bg-slate-700 text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
