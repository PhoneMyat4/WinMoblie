import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  CalendarClock, 
  Smartphone, 
  User, 
  Phone, 
  DollarSign, 
  ArrowRight, 
  Plus, 
  CheckCircle, 
  Clock, 
  Sparkles,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { PreOrder, ShopSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';

interface PreOrderSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  preOrders: PreOrder[];
  settings: ShopSettings;
  onSelectPreOrder: (preOrder: PreOrder) => void;
  onOpenNewPreOrderForm: () => void;
}

export const PreOrderSearchModal: React.FC<PreOrderSearchModalProps> = ({
  isOpen,
  onClose,
  preOrders,
  settings,
  onSelectPreOrder,
  onOpenNewPreOrderForm,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'all'>('Pending');

  // Filter pending preorders by default, or all if selected
  const filteredOrders = useMemo(() => {
    return preOrders.filter(order => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = order.customerName.toLowerCase().includes(q);
      const matchPhone = order.customerPhone.toLowerCase().includes(q);
      const matchNum = order.preOrderNumber.toLowerCase().includes(q);
      const matchModel = order.phoneModel.toLowerCase().includes(q);
      const matchBrand = order.brand ? order.brand.toLowerCase().includes(q) : false;

      return matchName || matchPhone || matchNum || matchModel || matchBrand;
    });
  }, [preOrders, searchQuery, statusFilter]);

  const pendingCount = preOrders.filter(p => p.status === 'Pending').length;

  if (!isOpen) return null;

  return (
    <div id="preorder-search-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 my-auto flex flex-col max-h-[85vh] animate-modal-content">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">POS Pre-Order Fulfillment</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pendingCount} Pending Pickup
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Search customer name or phone to load pre-order deposit and settle final payment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="new-preorder-from-search-btn"
              onClick={() => {
                onClose();
                onOpenNewPreOrderForm();
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Pre-Order</span>
            </button>

            <button
              type="button"
              id="close-preorder-search-modal-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          {/* Quick Search Input */}
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              id="preorder-search-input"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Customer Name, Phone, or Pre-Order #..."
              className="w-full pl-10 pr-8 py-2 bg-white border border-slate-300 focus:border-indigo-600 rounded-xl text-xs font-medium text-slate-900 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter tabs */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setStatusFilter('Pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === 'Pending'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              Pending Only ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              All Records ({preOrders.length})
            </button>
          </div>
        </div>

        {/* Pre-Orders List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          {filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
              <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Matching Pre-Orders Found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery 
                  ? `No pre-orders matched "${searchQuery}". Try searching with a different customer name or phone number.`
                  : 'There are currently no active pending pre-orders waiting for fulfillment.'
                }
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewPreOrderForm();
                }}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Capture New Pre-Order Now</span>
              </button>
            </div>
          ) : (
            filteredOrders.map(order => {
              const isPending = order.status === 'Pending';
              const isCompleted = order.status === 'Completed';
              const isCancelled = order.status === 'Cancelled';

              return (
                <div
                  key={order.id}
                  id={`preorder-card-${order.id}`}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isPending 
                      ? 'border-indigo-100 hover:border-indigo-400 hover:shadow-md' 
                      : 'border-slate-200 opacity-75 bg-slate-50/60'
                  }`}
                >
                  {/* Left: Customer & Device Info */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded-md border border-indigo-200">
                        {order.preOrderNumber}
                      </span>
                      
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        isPending 
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : isCompleted
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        {order.status}
                      </span>

                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Booked: {order.orderDate}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{order.customerName}</span>
                      </h4>
                      <div className="text-xs font-mono font-bold text-indigo-600 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{order.customerPhone}</span>
                      </div>
                    </div>

                    {/* Device Specification Tag Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
                      <span className="font-bold text-slate-900 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                        {order.phoneModel}
                      </span>

                      {order.brand && (
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                          {order.brand}
                        </span>
                      )}

                      {order.color && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          <span
                            className="w-2 h-2 rounded-full border border-black/20"
                            style={{ backgroundColor: getColorDotHex(order.color) }}
                          />
                          <span>{order.color}</span>
                        </span>
                      )}

                      {(order.ram || order.rom) && (
                        <span className="text-[11px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                          {order.ram} / {order.rom}
                        </span>
                      )}

                      {order.expectedArrivalDate && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold border border-emerald-200">
                          Expected: {order.expectedArrivalDate}
                        </span>
                      )}
                    </div>

                    {order.notes && (
                      <p className="text-[11px] text-slate-500 italic">
                        Note: "{order.notes}"
                      </p>
                    )}
                  </div>

                  {/* Middle: Financials Breakdown */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-row md:flex-col justify-between md:justify-center gap-2 text-right shrink-0">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Agreed Price</span>
                      <span className="font-mono text-xs font-bold text-slate-800">
                        {formatCurrency(order.fullPrice, settings.currencySymbol)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-emerald-600 font-bold uppercase block">
                        Deposit ({(order.depositPaymentMethod || 'cash').toUpperCase()})
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-700">
                        -{formatCurrency(order.depositAmount, settings.currencySymbol)}
                      </span>
                    </div>

                    <div className="border-t border-slate-200 pt-1">
                      <span className="text-[10px] text-indigo-600 font-bold uppercase block">Remaining Balance</span>
                      <span className="font-mono text-sm font-black text-indigo-900">
                        {formatCurrency(order.remainingBalance, settings.currencySymbol)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Select & Fulfill Action */}
                  <div className="shrink-0 flex items-center justify-end">
                    {isPending ? (
                      <button
                        type="button"
                        id={`fulfill-preorder-btn-${order.id}`}
                        onClick={() => onSelectPreOrder(order)}
                        className="w-full md:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Fulfill & Load in POS</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : isCompleted ? (
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Fulfilled</span>
                        </span>
                        {order.fulfilledDate && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            {formatDateTime(order.fulfilledDate)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-rose-600 font-bold bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200">
                        Order Cancelled
                      </span>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            Showing <span className="font-bold text-slate-900">{filteredOrders.length}</span> of {preOrders.length} pre-orders
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
