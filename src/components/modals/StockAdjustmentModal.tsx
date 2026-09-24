import React, { useState } from 'react';
import { 
  X, 
  Sliders, 
  Plus, 
  Minus, 
  Equal, 
  AlertTriangle, 
  CheckCircle2, 
  User, 
  FileText, 
  Smartphone,
  ShieldAlert
} from 'lucide-react';
import { Product, StockAdjustment, StaffUser } from '../../types';

interface StockAdjustmentModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (adjustment: StockAdjustment) => void;
  staffUsers?: StaffUser[];
  currentStaffUser?: StaffUser;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm,
  staffUsers = [],
  currentStaffUser,
}) => {
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'reduce' | 'set_exact'>('reduce');
  const [quantityInput, setQuantityInput] = useState<number>(1);
  const [exactCountInput, setExactCountInput] = useState<number>(product.stock);
  const [reason, setReason] = useState<StockAdjustment['reason']>('damaged');
  const [reasonNotes, setReasonNotes] = useState<string>('');
  const [performedBy, setPerformedBy] = useState<string>(
    currentStaffUser?.name || 'Authorized Staff'
  );
  const [selectedImeisToRemove, setSelectedImeisToRemove] = useState<string[]>([]);
  const [newImeisToAdd, setNewImeisToAdd] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate projected new stock
  let projectedStock = product.stock;
  let quantityChange = 0;

  if (adjustmentType === 'add') {
    quantityChange = Math.max(1, quantityInput);
    projectedStock = product.stock + quantityChange;
  } else if (adjustmentType === 'reduce') {
    quantityChange = -Math.max(1, quantityInput);
    projectedStock = Math.max(0, product.stock + quantityChange);
  } else {
    // set exact
    projectedStock = Math.max(0, exactCountInput);
    quantityChange = projectedStock - product.stock;
  }

  const isSerialized = Boolean(product.imeiList && product.imeiList.length > 0);
  const availableImeis = product.imeiList || [];

  const handleToggleImeiSelection = (imei: string) => {
    setSelectedImeisToRemove(prev => {
      if (prev.includes(imei)) {
        return prev.filter(i => i !== imei);
      } else {
        const updated = [...prev, imei];
        if (adjustmentType === 'reduce') {
          setQuantityInput(updated.length);
        }
        return updated;
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (quantityChange === 0) {
      setErrorMsg('No stock quantity change detected.');
      return;
    }

    if (projectedStock < 0) {
      setErrorMsg('Stock quantity cannot be negative.');
      return;
    }

    let affectedImeis: string[] | undefined = undefined;

    if (isSerialized) {
      if (adjustmentType === 'reduce') {
        if (selectedImeisToRemove.length > 0) {
          affectedImeis = selectedImeisToRemove;
        }
      } else if (adjustmentType === 'add') {
        if (newImeisToAdd.trim()) {
          const parsed = newImeisToAdd
            .split(/[\n,;\s]+/)
            .map(s => s.trim())
            .filter(Boolean);
          if (parsed.length > 0) {
            affectedImeis = parsed;
          }
        }
      }
    }

    const newAdjustment: StockAdjustment = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: product.id,
      productName: product.name,
      type: adjustmentType,
      quantityChange,
      previousStock: product.stock,
      newStock: projectedStock,
      reason,
      reasonNotes: reasonNotes.trim() || undefined,
      timestamp: new Date().toISOString(),
      adjustedBy: performedBy,
      imeiList: affectedImeis,
    };

    onConfirm(newAdjustment);
    onClose();
  };

  return (
    <div 
      id="stock-adjustment-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col animate-modal-content max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-50 via-indigo-50/30 to-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-200">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Adjust Stock Level</h3>
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

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-slate-800 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current Stock vs New Stock Preview Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">Current Stock</span>
              <div className="text-2xl font-black text-slate-800 mt-0.5">
                {product.stock} <span className="text-xs font-semibold text-slate-500">units</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center px-4">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                quantityChange > 0 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : quantityChange < 0 
                  ? 'bg-rose-100 text-rose-800' 
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {quantityChange > 0 ? `+${quantityChange}` : quantityChange < 0 ? `${quantityChange}` : '0'} units
              </span>
              <span className="text-[10px] text-slate-400 mt-1 font-mono">Transition</span>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium">Projected New Stock</span>
              <div className={`text-2xl font-black mt-0.5 ${
                (product.minStockAlert > 0 ? projectedStock <= product.minStockAlert : projectedStock <= 0) ? 'text-amber-600' : 'text-indigo-600'
              }`}>
                {projectedStock} <span className="text-xs font-semibold text-slate-500">units</span>
              </div>
            </div>
          </div>

          {/* Adjustment Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Adjustment Action</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdjustmentType('reduce');
                  if (reason === 'restock') setReason('damaged');
                }}
                className={`py-2.5 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer font-bold text-xs ${
                  adjustmentType === 'reduce'
                    ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-xs ring-2 ring-rose-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Minus className="w-3.5 h-3.5" />
                  <span>Deduct Units</span>
                </div>
                <span className="text-[10px] font-normal text-slate-400">Damage / Sample / RMA</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustmentType('add');
                  if (reason === 'damaged' || reason === 'sample') setReason('restock');
                }}
                className={`py-2.5 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer font-bold text-xs ${
                  adjustmentType === 'add'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs ring-2 ring-emerald-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Units</span>
                </div>
                <span className="text-[10px] font-normal text-slate-400">Restock / Bonus / Found</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustmentType('set_exact');
                  setReason('correction');
                }}
                className={`py-2.5 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer font-bold text-xs ${
                  adjustmentType === 'set_exact'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs ring-2 ring-indigo-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Equal className="w-3.5 h-3.5" />
                  <span>Set Exact Count</span>
                </div>
                <span className="text-[10px] font-normal text-slate-400">Audit Recount Reset</span>
              </button>
            </div>
          </div>

          {/* Quantity Input Field */}
          {adjustmentType !== 'set_exact' ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {adjustmentType === 'add' ? 'Quantity to Add (+)' : 'Quantity to Deduct (-)'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={adjustmentType === 'reduce' ? product.stock : 9999}
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm"
                  required
                />
                <div className="flex items-center gap-1">
                  {[1, 2, 5, 10].map(qty => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setQuantityInput(qty)}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                New Exact Stock On Hand
              </label>
              <input
                type="number"
                min="0"
                value={exactCountInput}
                onChange={(e) => setExactCountInput(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm"
                required
              />
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Adjustment Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as StockAdjustment['reason'])}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm"
            >
              {adjustmentType === 'reduce' ? (
                <>
                  <option value="damaged">Damaged / Cracked / Defect Write-off</option>
                  <option value="sample">Showroom / Store Display Demo Sample</option>
                  <option value="return_supplier">Returned to Supplier (RMA / Defect)</option>
                  <option value="correction">Inventory Recount / Shrinkage Discrepancy</option>
                  <option value="physical_audit">Physical Stocktake Variance</option>
                  <option value="other">Other Operational Deduction</option>
                </>
              ) : adjustmentType === 'add' ? (
                <>
                  <option value="restock">Manual Restock / Supplementary Replenishment</option>
                  <option value="correction">Inventory Recount / Found Stock</option>
                  <option value="physical_audit">Physical Stocktake Surplus</option>
                  <option value="other">Other Inflow Adjustment</option>
                </>
              ) : (
                <>
                  <option value="correction">Inventory Data Correction / Recount</option>
                  <option value="physical_audit">Full Physical Audit Reconciliation</option>
                  <option value="other">Other Exact Stock Set</option>
                </>
              )}
            </select>
          </div>

          {/* Serialized Device / IMEI Handler */}
          {isSerialized && (
            <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-2">
              <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                <Smartphone className="w-4 h-4 text-amber-600" />
                <span>Serialized IMEI Device Management</span>
              </div>

              {adjustmentType === 'reduce' ? (
                <div>
                  <p className="text-[11px] text-slate-600 mb-2">
                    Select specific IMEI(s) being removed from active inventory:
                  </p>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                    {availableImeis.map(imei => (
                      <label 
                        key={imei}
                        className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          selectedImeisToRemove.includes(imei)
                            ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedImeisToRemove.includes(imei)}
                          onChange={() => handleToggleImeiSelection(imei)}
                          className="rounded text-rose-600 focus:ring-rose-500"
                        />
                        <span className="font-mono text-xs">{imei}</span>
                      </label>
                    ))}
                  </div>
                  {selectedImeisToRemove.length > 0 && (
                    <p className="text-[10px] text-rose-700 font-medium mt-1">
                      {selectedImeisToRemove.length} IMEI(s) tagged for deduction
                    </p>
                  )}
                </div>
              ) : adjustmentType === 'add' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    New IMEI Numbers (comma or newline separated, optional):
                  </label>
                  <textarea
                    value={newImeisToAdd}
                    onChange={(e) => setNewImeisToAdd(e.target.value)}
                    rows={2}
                    placeholder="358291048291046, 358291048291047..."
                    className="w-full p-2 bg-white border border-amber-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              ) : null}
            </div>
          )}

          {/* Notes / Reason Details */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Detailed Reason / Reference Notes
            </label>
            <div className="relative">
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Scratched screen during display setup, moved to RMA bin..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
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
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm"
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
              className={`px-5 py-2.5 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                adjustmentType === 'add'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Stock Adjustment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
