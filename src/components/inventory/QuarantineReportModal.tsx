import React, { useState, useMemo, useRef } from 'react';
import { 
  AlertTriangle, 
  X, 
  Search, 
  Barcode, 
  ShieldAlert, 
  Package, 
  CheckCircle2, 
  Smartphone, 
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';
import { Product, ImeiPair, ShopSettings } from '../../types';
import { quarantineItem, searchItemsForQuarantine } from '../../utils/damageManager';
import { formatCurrency } from '../../utils/formatters';

interface QuarantineReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: ShopSettings;
  preSelectedProduct?: Product | null;
  onSuccess: (updatedProduct: Product) => void;
  onOpenManagerReview?: (logId: string) => void;
}

export const QuarantineReportModal: React.FC<QuarantineReportModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  preSelectedProduct,
  onSuccess,
  onOpenManagerReview,
}) => {
  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(preSelectedProduct || null);
  const [selectedImei, setSelectedImei] = useState<string>('');
  const [reporterName, setReporterName] = useState<string>('Staff Member');
  const [damageNotes, setDamageNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    logNumber: string;
    productName: string;
    serialOrImei?: string;
    logId: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync preSelectedProduct when modal opens
  React.useEffect(() => {
    if (preSelectedProduct) {
      setSelectedProduct(preSelectedProduct);
      if (preSelectedProduct.imeiPairs && preSelectedProduct.imeiPairs.length > 0) {
        const availablePair = preSelectedProduct.imeiPairs.find(
          p => p.status !== 'Quarantined' && p.status !== 'Pending RMA' && p.status !== 'Written-Off'
        );
        if (availablePair) {
          setSelectedImei(availablePair.imei1);
        }
      }
    } else {
      setSelectedProduct(null);
      setSelectedImei('');
    }
    setErrorMsg(null);
    setSuccessResult(null);
    setDamageNotes('');
  }, [preSelectedProduct, isOpen]);

  // Search results for item selection
  const searchResults = useMemo(() => {
    if (!searchInput.trim() || selectedProduct) return [];
    return searchItemsForQuarantine(searchInput, products).slice(0, 8);
  }, [searchInput, products, selectedProduct]);

  if (!isOpen) return null;

  const handleSelectProduct = (product: Product, specificImei?: string) => {
    setSelectedProduct(product);
    setErrorMsg(null);
    if (specificImei) {
      setSelectedImei(specificImei);
    } else if (product.imeiPairs && product.imeiPairs.length > 0) {
      const avail = product.imeiPairs.find(
        p => p.status !== 'Quarantined' && p.status !== 'Pending RMA' && p.status !== 'Written-Off'
      );
      if (avail) setSelectedImei(avail.imei1);
    } else if (product.imeiList && product.imeiList.length > 0) {
      setSelectedImei(product.imeiList[0]);
    } else {
      setSelectedImei('');
    }
    setSearchInput('');
  };

  const handleClearSelection = () => {
    setSelectedProduct(null);
    setSelectedImei('');
    setErrorMsg(null);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleSubmitQuarantine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setErrorMsg('Please select an item to quarantine.');
      return;
    }

    if (selectedProduct.stock <= 0) {
      setErrorMsg(`"${selectedProduct.name}" has 0 sellable units remaining in stock.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const result = quarantineItem({
        productId: selectedProduct.id,
        serialOrImei: selectedImei.trim() || undefined,
        reporterName: reporterName.trim() || 'Staff Member',
        notes: damageNotes.trim(),
        quarantinedQuantity: 1,
      });

      if (!result.success || !result.log || !result.updatedProduct) {
        setErrorMsg(result.error || 'Failed to quarantine item.');
        setIsSubmitting(false);
        return;
      }

      onSuccess(result.updatedProduct);
      setSuccessResult({
        logNumber: result.log.logNumber,
        productName: result.log.productName,
        serialOrImei: result.log.serialOrImei,
        logId: result.log.id,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="quarantine-report-modal"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-rose-500 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                  Phase 1: Quarantine
                </span>
                <span className="text-xs text-amber-100 font-medium">Immediate POS Isolation</span>
              </div>
              <h2 className="text-lg font-black text-white">Report Damage & Quarantine Item</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {successResult ? (
            /* Success State Confirmation */
            <div className="py-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900">Item Successfully Quarantined!</h3>
                <p className="text-slate-500 text-xs max-w-md mx-auto">
                  Logged as <strong className="text-indigo-600">{successResult.logNumber}</strong>. 
                  The unit has been deducted from active sellable inventory and locked from POS register checkout.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-md mx-auto text-left space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Product:</span>
                  <span className="font-bold text-slate-900">{successResult.productName}</span>
                </div>
                {successResult.serialOrImei && (
                  <div className="flex justify-between text-slate-600">
                    <span>Isolated Serial/IMEI:</span>
                    <span className="font-mono font-bold text-amber-700">{successResult.serialOrImei}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Current Status:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                    Quarantined (Phase 1)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
                >
                  Close & Return
                </button>
                {onOpenManagerReview && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenManagerReview(successResult.logId);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    <span>Proceed to Manager Review (Phase 2 & 3)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitQuarantine} className="space-y-5">
              
              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 1: Select Item via Barcode, Serial Number or Search */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-800">
                  1. Scan Barcode / Serial Number / IMEI or Search Product <span className="text-rose-500">*</span>
                </label>
                
                {!selectedProduct ? (
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Barcode className="w-4 h-4 text-amber-500" />
                    </div>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Scan barcode or type serial number, IMEI, SKU, model..."
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden transition-all font-medium"
                      autoFocus
                    />
                    
                    {/* Search suggestions dropdown */}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {searchResults.map((item, idx) => (
                          <button
                            key={`${item.product.id}-${idx}`}
                            type="button"
                            onClick={() => handleSelectProduct(item.product, item.matchedField === 'imei' ? item.matchedValue : undefined)}
                            className="w-full px-4 py-2.5 text-left hover:bg-amber-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{item.product.name}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span>SKU: {item.product.sku}</span>
                                <span>•</span>
                                <span className="text-amber-700 font-mono">Matched: {item.matchedValue}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-slate-900">
                                {formatCurrency(item.product.costPrice, settings.currencySymbol)} (Cost)
                              </span>
                              <p className="text-[10px] text-slate-500">{item.product.stock} in stock</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Selected Product Card */
                  <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center shrink-0 text-amber-600">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{selectedProduct.name}</h4>
                          <p className="text-[11px] text-slate-600 font-mono">
                            SKU: {selectedProduct.sku} | Barcode: {selectedProduct.barcode || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        Change Item
                      </button>
                    </div>

                    {/* Stock & Cost Impact Details */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-200/50">
                      <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">Original Unit Cost</span>
                        <span className="text-xs font-bold text-slate-900">
                          {formatCurrency(selectedProduct.costPrice, settings.currencySymbol)}
                        </span>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">Active Sellable Stock</span>
                        <span className={`text-xs font-bold ${selectedProduct.stock <= 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {selectedProduct.stock} units
                        </span>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100">
                        <span className="text-[10px] text-slate-500 font-semibold block">Quarantine Impact</span>
                        <span className="text-xs font-bold text-amber-800">
                          -1 unit immediately
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Serial / IMEI Selection (if serialized item) */}
              {selectedProduct && selectedProduct.imeiPairs && selectedProduct.imeiPairs.length > 0 && (
                <div className="space-y-2">
                  <label className="block font-bold text-slate-800 flex items-center justify-between">
                    <span>Select Specific Unit (Serial / Dual IMEI)</span>
                    <span className="text-[11px] font-normal text-slate-500">Pick which physical device is damaged</span>
                  </label>
                  <select
                    value={selectedImei}
                    onChange={(e) => setSelectedImei(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden font-mono"
                  >
                    <option value="">-- General Unit (No specific IMEI attached) --</option>
                    {selectedProduct.imeiPairs.map((pair, pIdx) => {
                      const isAlreadyQuarantined = pair.status === 'Quarantined';
                      return (
                        <option 
                          key={pIdx} 
                          value={pair.imei1}
                          disabled={isAlreadyQuarantined}
                        >
                          {pair.imei1} {pair.imei2 ? ` / ${pair.imei2}` : ''} {isAlreadyQuarantined ? '(Already Quarantined)' : '(In Stock)'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Step 2: Reporter & Observation Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-800">Reported By (Staff Member)</label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Staff name / ID"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-800">Target Isolation Status</label>
                  <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-bold flex items-center justify-between">
                    <span>Quarantined</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200 text-amber-900">Immediate Isolation</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-800">
                  Initial Damage Sighting / Staff Notes
                </label>
                <textarea
                  rows={2}
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder="Describe where and how the damage occurred (e.g., dropped on floor by customer, cosmetic scratch detected during unboxing)..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Immediate POS Deduction Warning Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3 text-slate-600">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-900 text-xs">Immediate POS Register Lockout</p>
                  <p className="text-[11px] leading-relaxed">
                    Confirming will immediately reduce the sellable inventory count by 1 unit. 
                    Cashiers will be blocked from adding this barcode or serial/IMEI to any sale ticket until manager review.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="confirm-quarantine-btn"
                  type="submit"
                  disabled={!selectedProduct || isSubmitting || selectedProduct.stock <= 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{isSubmitting ? 'Isolating...' : 'Isolate & Quarantine Item'}</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
