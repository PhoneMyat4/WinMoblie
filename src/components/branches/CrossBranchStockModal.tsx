import React from 'react';
import { 
  X, 
  Building2, 
  Store, 
  Package, 
  ArrowRightLeft, 
  ShieldCheck, 
  MapPin, 
  Phone, 
  AlertCircle,
  TrendingUp,
  Tag
} from 'lucide-react';
import { Product, StoreLocation } from '../../types';
import { StorageService } from '../../utils/storage';
import { formatCurrency } from '../../utils/formatters';

interface CrossBranchStockModalProps {
  product: Product | null;
  onClose: () => void;
  onRequestTransfer?: (product: Product, fromLocationId: string) => void;
  currencySymbol?: string;
}

export const CrossBranchStockModal: React.FC<CrossBranchStockModalProps> = ({
  product,
  onClose,
  onRequestTransfer,
  currencySymbol = 'Ks',
}) => {
  if (!product) return null;

  const crossStock = StorageService.getCrossBranchStock(product.id);
  const activeLocId = StorageService.getActiveLocationId();
  const totalNetworkStock = crossStock.reduce((sum, item) => sum + item.onHand, 0);
  const totalNetworkAvailable = crossStock.reduce((sum, item) => sum + item.available, 0);
  const totalNetworkReserved = crossStock.reduce((sum, item) => sum + item.reserved, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Global Catalog Matrix
                </span>
                <span className="text-xs font-mono text-slate-300">
                  SKU: {product.sku || 'N/A'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black truncate text-white leading-tight mt-0.5">
                {product.name}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Summary Cards */}
        <div className="grid grid-cols-3 gap-2.5 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="p-3 bg-white rounded-2xl border border-slate-200 text-center">
            <p className="text-[10px] font-bold uppercase text-slate-400">Total Network Stock</p>
            <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">{totalNetworkStock} <span className="text-xs font-normal text-slate-500">units</span></p>
          </div>
          <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 text-center">
            <p className="text-[10px] font-bold uppercase text-emerald-600">Sellable Available</p>
            <p className="text-lg sm:text-xl font-black text-emerald-700 mt-0.5">{totalNetworkAvailable} <span className="text-xs font-normal text-emerald-600">units</span></p>
          </div>
          <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200 text-center">
            <p className="text-[10px] font-bold uppercase text-amber-600">Reserved / Transit</p>
            <p className="text-lg sm:text-xl font-black text-amber-700 mt-0.5">{totalNetworkReserved} <span className="text-xs font-normal text-amber-600">units</span></p>
          </div>
        </div>

        {/* Branch Stock Breakdown List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            Branch & Central Warehouse Distribution
          </p>

          <div className="space-y-2.5">
            {crossStock.map((entry) => {
              const isCurrent = entry.location.id === activeLocId;
              const isWh = entry.location.type === 'warehouse';
              const canTransfer = !isCurrent && entry.available > 0 && onRequestTransfer;

              return (
                <div
                  key={entry.location.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-slate-900 text-white border-slate-800 shadow-md ring-2 ring-emerald-500/50'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  {/* Location Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isCurrent
                        ? isWh ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                        : isWh ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {isWh ? <Building2 className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm truncate">
                          {entry.location.name}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isCurrent
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {entry.location.code}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950">
                            Current Terminal
                          </span>
                        )}
                      </div>

                      <div className={`flex items-center gap-2 mt-1 text-xs ${isCurrent ? 'text-slate-300' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[180px]">{entry.location.address}</span>
                        </span>
                        {entry.location.phone && (
                          <span className="hidden sm:inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{entry.location.phone}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock Metrics & Transfer Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1.5">
                        <span className={`text-base sm:text-lg font-black ${
                          entry.available > 0
                            ? isCurrent ? 'text-emerald-400' : 'text-emerald-600'
                            : isCurrent ? 'text-rose-400' : 'text-rose-600'
                        }`}>
                          {entry.available}
                        </span>
                        <span className={`text-xs ${isCurrent ? 'text-slate-400' : 'text-slate-500'}`}>
                          avail
                        </span>
                      </div>
                      <p className={`text-[10px] ${isCurrent ? 'text-slate-400' : 'text-slate-400'}`}>
                        ({entry.onHand} on hand • {entry.reserved} reserved)
                      </p>
                    </div>

                    {canTransfer && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onRequestTransfer(product, entry.location.id);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer shrink-0 active:scale-95"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Request Transfer</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Real-time localized ledger with zero cross-branch stock collision</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
