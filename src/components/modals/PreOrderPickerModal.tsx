import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  CalendarClock, 
  User, 
  Phone, 
  Smartphone, 
  CheckCircle2, 
  Clock, 
  Boxes, 
  Tag, 
  ArrowRight,
  Sparkles,
  Package,
  Layers,
  AlertCircle,
  FileSpreadsheet,
  Check
} from 'lucide-react';
import { PreOrder, ShopSettings } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PreOrderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  preOrders: PreOrder[];
  settings: ShopSettings;
  onSelectPreOrder: (preOrder: PreOrder) => void;
}

export const PreOrderPickerModal: React.FC<PreOrderPickerModalProps> = ({
  isOpen,
  onClose,
  preOrders,
  settings,
  onSelectPreOrder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'stock_arrived' | 'completed'>('pending');

  // Helper for color dot
  const getColorDotHex = (colorName: string): string => {
    const c = colorName.toLowerCase();
    if (c.includes('black') || c.includes('midnight') || c.includes('dark')) return '#0f172a';
    if (c.includes('white') || c.includes('starlight') || c.includes('silver') || c.includes('pearl')) return '#e2e8f0';
    if (c.includes('blue') || c.includes('sierra') || c.includes('pacific') || c.includes('navy')) return '#2563eb';
    if (c.includes('titanium') || c.includes('gray') || c.includes('grey') || c.includes('space')) return '#64748b';
    if (c.includes('gold') || c.includes('desert') || c.includes('champagne')) return '#d97706';
    if (c.includes('green') || c.includes('olive') || c.includes('mint') || c.includes('emerald')) return '#059669';
    if (c.includes('purple') || c.includes('violet') || c.includes('lavender')) return '#7c3aed';
    if (c.includes('red') || c.includes('coral') || c.includes('rose') || c.includes('pink')) return '#e11d48';
    if (c.includes('yellow') || c.includes('orange')) return '#ea580c';
    return '#94a3b8';
  };

  const filteredOrders = useMemo(() => {
    let list = [...preOrders];

    // Status filter
    if (statusFilter === 'pending') {
      list = list.filter(o => o.status === 'Pending');
    } else if (statusFilter === 'stock_arrived') {
      list = list.filter(o => o.status === 'Stock Arrived');
    } else if (statusFilter === 'completed') {
      list = list.filter(o => o.status === 'Completed');
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o => 
        o.preOrderNumber.toLowerCase().includes(q) ||
        o.phoneModel.toLowerCase().includes(q) ||
        (o.brand && o.brand.toLowerCase().includes(q)) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.color.toLowerCase().includes(q) ||
        o.ram.toLowerCase().includes(q) ||
        o.rom.toLowerCase().includes(q)
      );
    }

    // Sort newest orders first
    return list.sort((a, b) => new Date(b.orderDate || b.createdAt).getTime() - new Date(a.orderDate || a.createdAt).getTime());
  }, [preOrders, statusFilter, searchQuery]);

  const pendingCount = useMemo(() => preOrders.filter(o => o.status === 'Pending').length, [preOrders]);
  const stockArrivedCount = useMemo(() => preOrders.filter(o => o.status === 'Stock Arrived').length, [preOrders]);

  if (!isOpen) return null;

  return (
    <div 
      id="preorder-picker-modal-overlay" 
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-modal-content">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-base sm:text-lg">
                  Import Specifications from Customer Pre-Order
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/40 border border-indigo-400/50 text-indigo-100">
                  {pendingCount} Awaiting Stock
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                Select a customer pre-order to automatically draw exact Model Name, Brand, Color, RAM/ROM & Quantity to purchase invoice.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Awaiting Stock ({pendingCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('stock_arrived')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                statusFilter === 'stock_arrived'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Stock Arrived ({stockArrivedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Orders ({preOrders.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search phone, model, customer, #PRE..."
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 focus:border-indigo-500 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-100 outline-hidden transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content / List of Pre-Orders */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 divide-y divide-slate-100">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <CalendarClock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No matching pre-orders found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery 
                  ? `No pre-orders matched your search "${searchQuery}". Try a different keyword.` 
                  : `No pre-orders currently with status "${statusFilter}".`}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const qty = Math.max(1, order.quantity || 1);
              const unitPrice = order.unitPrice || Math.round(order.fullPrice / qty);

              const isAwaitingStock = order.status === 'Pending';
              const isStockArrived = order.status === 'Stock Arrived';
              const isCompleted = order.status === 'Completed';

              return (
                <div 
                  key={order.id}
                  className="pt-3 first:pt-0"
                >
                  <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md bg-white hover:bg-indigo-50/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    
                    {/* Left: Device & Customer Specifications */}
                    <div className="space-y-2 flex-1 min-w-0">
                      
                      {/* Top Badges */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {order.preOrderNumber}
                        </span>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isAwaitingStock 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : isStockArrived 
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : isCompleted
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {order.status === 'Pending' ? 'Awaiting Supplier Stock' : order.status}
                        </span>

                        <span className="text-[11px] text-slate-500 font-medium">
                          Booked: {formatDate(order.orderDate)}
                        </span>

                        {order.expectedArrivalDate && (
                          <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            Exp: {formatDate(order.expectedArrivalDate)}
                          </span>
                        )}
                      </div>

                      {/* Device Title & Brand */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Smartphone className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {order.phoneModel}
                        </h4>
                        
                        {order.brand && (
                          <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {order.brand}
                          </span>
                        )}

                        {qty > 1 && (
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                            <Boxes className="w-3 h-3 text-emerald-600" />
                            Qty: {qty} Units
                          </span>
                        )}
                      </div>

                      {/* Hardware Specification Pills */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        {order.color && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-800 font-medium text-[11px]">
                            <span 
                              className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: getColorDotHex(order.color) }}
                            />
                            {order.color}
                          </span>
                        )}

                        {order.ram && order.ram !== '-' && (
                          <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono font-bold rounded text-[11px]">
                            RAM: {order.ram}
                          </span>
                        )}

                        {order.rom && order.rom !== '-' && (
                          <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-800 font-mono font-bold rounded text-[11px]">
                            Storage: {order.rom}
                          </span>
                        )}

                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold rounded text-[11px]">
                          Brand New
                        </span>
                      </div>

                      {/* Customer Info */}
                      <div className="flex items-center gap-3 text-xs text-slate-600 pt-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-800">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {order.customerName}
                        </span>
                        <span className="flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {order.customerPhone}
                        </span>
                        {order.notes && (
                          <span className="text-[11px] text-slate-500 italic truncate max-w-xs" title={order.notes}>
                            &ldquo;{order.notes}&rdquo;
                          </span>
                        )}
                      </div>

                    </div>

                    {/* Right: Financial Summary & Select Button */}
                    <div className="flex sm:flex-row md:flex-col items-center md:items-end justify-between gap-3 shrink-0 border-t sm:border-t-0 md:border-l md:pl-4 border-slate-200 pt-3 sm:pt-0">
                      <div className="text-left md:text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">
                          Agreed Selling Price {qty > 1 && `(${qty} units)`}
                        </span>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {formatCurrency(order.fullPrice, settings.currencySymbol)}
                        </span>
                        {qty > 1 && (
                          <span className="text-[10px] text-slate-500 font-mono block">
                            @{formatCurrency(unitPrice, settings.currencySymbol)}/ea
                          </span>
                        )}
                        <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                          Deposit: {formatCurrency(order.depositAmount, settings.currencySymbol)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectPreOrder(order);
                          onClose();
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-sm hover:shadow-md cursor-pointer shrink-0"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Draw to Purchase Invoice</span>
                      </button>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Clicking <b>&ldquo;Draw to Purchase Invoice&rdquo;</b> copies Model Name, Brand, Color, RAM/ROM & Qty with 100% precision.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
