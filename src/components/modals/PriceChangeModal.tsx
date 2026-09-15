import React, { useState, useMemo } from 'react';
import { 
  X, 
  Tag, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  AlertTriangle, 
  CheckCircle2, 
  User, 
  ArrowRight,
  ShieldAlert,
  Coins
} from 'lucide-react';
import { Product, PriceChangeRecord, PriceChangeReason, StaffUser } from '../../types';

interface PriceChangeModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (priceRecord: PriceChangeRecord, updatedProduct: Product) => void;
  staffUsers?: StaffUser[];
  currentStaffUser?: StaffUser;
}

export const PriceChangeModal: React.FC<PriceChangeModalProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm,
  staffUsers = [],
  currentStaffUser,
}) => {
  const [newSellingPrice, setNewSellingPrice] = useState<number>(product.sellingPrice);
  const [alsoUpdateCost, setAlsoUpdateCost] = useState<boolean>(false);
  const [newCostPrice, setNewCostPrice] = useState<number>(product.costPrice);
  const [reason, setReason] = useState<PriceChangeReason>('market_adjustment');
  const [reasonNotes, setReasonNotes] = useState<string>('');
  const [performedBy, setPerformedBy] = useState<string>(
    currentStaffUser?.name || (staffUsers[0]?.name) || 'Store Manager'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calculations
  const oldSelling = product.sellingPrice;
  const oldCost = product.costPrice;
  const oldMarginAmt = oldSelling - oldCost;
  const oldMarginPct = oldSelling > 0 ? (oldMarginAmt / oldSelling) * 100 : 0;

  const effectiveNewCost = alsoUpdateCost ? newCostPrice : oldCost;
  const priceDelta = newSellingPrice - oldSelling;
  const percentageChange = oldSelling > 0 ? (priceDelta / oldSelling) * 100 : 0;

  const newMarginAmt = newSellingPrice - effectiveNewCost;
  const newMarginPct = newSellingPrice > 0 ? (newMarginAmt / newSellingPrice) * 100 : 0;
  const marginPctDelta = newMarginPct - oldMarginPct;

  const isBelowCost = newSellingPrice < effectiveNewCost;

  if (!isOpen) return null;

  const handleApplyPreset = (percentMultiplier: number) => {
    const calculated = Math.round((oldSelling * (1 + percentMultiplier)) / 1000) * 1000;
    setNewSellingPrice(Math.max(100, calculated));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newSellingPrice <= 0) {
      setErrorMsg('Selling price must be greater than 0 Ks.');
      return;
    }

    if (priceDelta === 0 && (!alsoUpdateCost || newCostPrice === oldCost)) {
      setErrorMsg('No price change detected. Enter a different selling or cost price.');
      return;
    }

    const priceRecord: PriceChangeRecord = {
      id: `pc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: product.id,
      productName: product.name,
      timestamp: new Date().toISOString(),
      oldSellingPrice: oldSelling,
      newSellingPrice: newSellingPrice,
      oldCostPrice: oldCost,
      newCostPrice: alsoUpdateCost ? newCostPrice : oldCost,
      priceDelta,
      percentageChange: Number(percentageChange.toFixed(1)),
      oldMarginPercent: Number(oldMarginPct.toFixed(1)),
      newMarginPercent: Number(newMarginPct.toFixed(1)),
      reason,
      reasonNotes: reasonNotes.trim() || undefined,
      changedBy: performedBy,
      effectiveDate: new Date().toISOString().split('T')[0],
    };

    const updatedProduct: Product = {
      ...product,
      sellingPrice: newSellingPrice,
      costPrice: alsoUpdateCost ? newCostPrice : product.costPrice,
    };

    onConfirm(priceRecord, updatedProduct);
    onClose();
  };

  return (
    <div 
      id="price-change-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col animate-modal-content max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 via-indigo-50/20 to-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Update Product Price</h3>
              <p className="text-xs text-slate-500 line-clamp-1">{product.brand} - {product.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-slate-800 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pricing & Margin Impact Comparison Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">Current Retail Price</span>
                <div className="text-xl font-bold text-slate-700 mt-0.5">
                  {oldSelling.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Ks</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Cost: {oldCost.toLocaleString()} Ks ({oldMarginPct.toFixed(1)}% margin)
                </div>
              </div>

              <div className="flex flex-col items-center justify-center px-3">
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${
                  priceDelta > 0 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : priceDelta < 0 
                    ? 'bg-amber-100 text-amber-800' 
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {priceDelta > 0 ? `+${priceDelta.toLocaleString()}` : priceDelta < 0 ? priceDelta.toLocaleString() : '0'} Ks
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {percentageChange > 0 ? `+${percentageChange.toFixed(1)}%` : `${percentageChange.toFixed(1)}%`}
                </span>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500 font-medium">New Retail Price</span>
                <div className={`text-xl font-black mt-0.5 ${
                  priceDelta > 0 ? 'text-emerald-600' : priceDelta < 0 ? 'text-amber-600' : 'text-slate-800'
                }`}>
                  {newSellingPrice.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Ks</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Margin: <span className="font-bold text-slate-800">{newMarginPct.toFixed(1)}%</span> ({newMarginAmt.toLocaleString()} Ks)
                </div>
              </div>
            </div>

            {/* Profit Margin Delta Bar */}
            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
              isBelowCost 
                ? 'bg-rose-50 border-rose-300 text-rose-800'
                : marginPctDelta >= 0 
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50/80 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-center gap-1.5">
                {isBelowCost ? (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                ) : marginPctDelta >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  {isBelowCost 
                    ? 'Warning: New price is below product cost price! Negative profit margin.'
                    : marginPctDelta >= 0 
                    ? `Margin improves by +${marginPctDelta.toFixed(1)}% (+${(newMarginAmt - oldMarginAmt).toLocaleString()} Ks profit/unit)`
                    : `Margin contracts by ${marginPctDelta.toFixed(1)}% (${(newMarginAmt - oldMarginAmt).toLocaleString()} Ks/unit)`
                  }
                </span>
              </div>
            </div>
          </div>

          {/* New Selling Price Input Field with Quick Preset Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">New Selling Price (Ks)</label>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 mr-1">Quick:</span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(-0.10)}
                  className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] border border-amber-200"
                >
                  -10%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(-0.05)}
                  className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] border border-amber-200"
                >
                  -5%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(0.05)}
                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200"
                >
                  +5%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset(0.10)}
                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200"
                >
                  +10%
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type="number"
                min="100"
                step="500"
                value={newSellingPrice}
                onChange={(e) => setNewSellingPrice(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-base"
                required
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                MMK
              </span>
            </div>
          </div>

          {/* Optional: Update Cost Price Toggle */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoUpdateCost}
                onChange={(e) => setAlsoUpdateCost(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span className="text-xs font-bold text-slate-800">
                Also update inbound wholesale cost price
              </span>
            </label>

            {alsoUpdateCost && (
              <div className="pt-2 border-t border-slate-200/60">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  New Unit Cost Price (Ks)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs sm:text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                    MMK
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Price Change</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as PriceChangeReason)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs sm:text-sm"
            >
              <option value="market_adjustment">Competitive Market Rate Adjustment</option>
              <option value="promo_discount">Promotional Discount / Weekend Sale Event</option>
              <option value="supplier_cost_change">Supplier Wholesale Cost Shift</option>
              <option value="clearance">End-of-Life / Old Model Clearance</option>
              <option value="currency_fluctuation">Foreign Currency (USD/MMK) Fluctuation</option>
              <option value="manual_correction">Price Correction / Catalog Typo Fix</option>
              <option value="bulk_reprice">Batch Catalog Reprice</option>
              <option value="other">Other Operational Pricing Revision</option>
            </select>
          </div>

          {/* Reason Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Justification & Reference Notes (Optional)
            </label>
            <textarea
              value={reasonNotes}
              onChange={(e) => setReasonNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Lowered price by 100,000 Ks to match official reseller promotion..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Performed By Staff Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Authorized Staff Member</span>
            </label>
            {staffUsers.length > 0 ? (
              <select
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs sm:text-sm"
              >
                {staffUsers.map(st => (
                  <option key={st.id} value={st.name}>
                    {st.name} ({st.role})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 text-xs sm:text-sm"
                required
              />
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-md shadow-amber-200 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Price Revision</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
