import React, { useState, useMemo } from 'react';
import { 
  CalendarClock, 
  Search, 
  Plus, 
  Smartphone, 
  User, 
  Phone, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Printer, 
  Trash2, 
  Edit3, 
  ArrowRight, 
  Calendar,
  Sparkles,
  TrendingUp,
  CreditCard,
  Building,
  RefreshCw,
  Filter,
  PackageCheck,
  Link2,
  Boxes,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';
import { PreOrder, Customer, Product, ShopSettings, AppTab } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';
import { PreOrderFormModal } from '../modals/PreOrderFormModal';
import { StorageService } from '../../utils/storage';

interface PreOrdersManagerProps {
  preOrders: PreOrder[];
  customers: Customer[];
  products: Product[];
  settings: ShopSettings;
  onRefreshData: () => void;
  onNavigateTab: (tab: AppTab) => void;
  onSelectPreOrderForPos?: (preOrder: PreOrder) => void;
  onSaveCustomer?: (customer: Customer) => void;
}

export const PreOrdersManager: React.FC<PreOrdersManagerProps> = ({
  preOrders,
  customers,
  products,
  settings,
  onRefreshData,
  onNavigateTab,
  onSelectPreOrderForPos,
  onSaveCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Stock Arrived' | 'Completed' | 'Cancelled'>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<PreOrder | null>(null);

  // Cancellation & Deletion custom dialog states (replaces iframe-blocked native confirm)
  const [orderToCancel, setOrderToCancel] = useState<PreOrder | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Customer Request');
  const [refundDepositOption, setRefundDepositOption] = useState<boolean>(true);
  const [orderToDelete, setOrderToDelete] = useState<PreOrder | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered Pre-Orders
  const filteredPreOrders = useMemo(() => {
    return preOrders.filter(order => {
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const matchName = order.customerName.toLowerCase().includes(q);
      const matchPhone = order.customerPhone.toLowerCase().includes(q);
      const matchNum = order.preOrderNumber.toLowerCase().includes(q);
      const matchModel = order.phoneModel.toLowerCase().includes(q);
      const matchBrand = order.brand ? order.brand.toLowerCase().includes(q) : false;
      const matchImei = order.allocatedImei ? order.allocatedImei.toLowerCase().includes(q) : false;

      return matchName || matchPhone || matchNum || matchModel || matchBrand || matchImei;
    });
  }, [preOrders, searchQuery, statusFilter]);

  // Key KPI Metrics
  const stats = useMemo(() => {
    const totalCount = preOrders.length;
    const pendingCount = preOrders.filter(p => p.status === 'Pending').length;
    const stockArrivedCount = preOrders.filter(p => p.status === 'Stock Arrived').length;
    const completedCount = preOrders.filter(p => p.status === 'Completed').length;
    const cancelledCount = preOrders.filter(p => p.status === 'Cancelled').length;
    const totalDeposits = preOrders.reduce((sum, p) => sum + (p.depositAmount || 0), 0);
    const activeBalanceValue = preOrders
      .filter(p => p.status === 'Pending' || p.status === 'Stock Arrived')
      .reduce((sum, p) => sum + (p.remainingBalance || 0), 0);

    return {
      totalCount,
      pendingCount,
      stockArrivedCount,
      completedCount,
      cancelledCount,
      totalDeposits,
      activeBalanceValue,
    };
  }, [preOrders]);

  const handleSaveOrder = (saved: PreOrder) => {
    StorageService.savePreOrder(saved);
    onRefreshData();
    showToast(`Pre-Order #${saved.preOrderNumber} saved successfully`);
  };

  const handleConfirmCancelOrder = () => {
    if (!orderToCancel) return;

    const orderId = orderToCancel.id;
    const reasonText = cancelReason.trim();

    // 1. If stock was allocated, unallocate it
    if (orderToCancel.allocatedImei || orderToCancel.productId) {
      StorageService.unallocatePreOrder(orderId);
    }

    // 2. If deposit was paid in cash and refund is selected, record cash out from cash drawer
    if (refundDepositOption && orderToCancel.depositAmount > 0 && orderToCancel.depositPaymentMethod === 'cash') {
      StorageService.recordCashTransaction(
        'out',
        orderToCancel.depositAmount,
        `Pre-Order Deposit Refund #${orderToCancel.preOrderNumber} - ${orderToCancel.customerName}`
      );
    }

    // 3. Mark pre-order status as Cancelled
    const updatedNotes = reasonText
      ? `${orderToCancel.notes ? orderToCancel.notes + ' | ' : ''}Cancellation: ${reasonText}${refundDepositOption ? ' (Deposit Refunded)' : ''}`
      : orderToCancel.notes;

    StorageService.updatePreOrderStatus(orderId, 'Cancelled', {
      notes: updatedNotes
    });

    onRefreshData();
    showToast(`Pre-Order #${orderToCancel.preOrderNumber} was marked as Cancelled`);
    setOrderToCancel(null);
  };

  const handleRestoreOrder = (order: PreOrder) => {
    StorageService.updatePreOrderStatus(order.id, 'Pending', {
      notes: `${order.notes ? order.notes + ' | ' : ''}Reopened from Cancelled on ${new Date().toLocaleDateString()}`
    });
    onRefreshData();
    showToast(`Pre-Order #${order.preOrderNumber} restored to Pending`);
  };

  const handleConfirmDeleteOrder = () => {
    if (!orderToDelete) return;
    const num = orderToDelete.preOrderNumber;
    StorageService.deletePreOrder(orderToDelete.id);
    onRefreshData();
    showToast(`Pre-Order #${num} deleted`);
    setOrderToDelete(null);
  };

  const handleFulfillInPos = (order: PreOrder) => {
    if (onSelectPreOrderForPos) {
      onSelectPreOrderForPos(order);
    }
    onNavigateTab('pos');
  };

  return (
    <div id="preorders-manager-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pre-Orders & Advance Bookings</h1>
            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-full">
              Two-Step Workflow
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Capture advance customer deposits for upcoming flagships & fulfill balances seamlessly at POS checkout.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefreshData}
            title="Refresh Pre-Orders"
            className="p-2.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            id="capture-new-preorder-btn"
            onClick={() => {
              setSelectedOrderForEdit(null);
              setIsNewModalOpen(true);
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Capture New Pre-Order</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Bookings */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Total Bookings</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.totalCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">All-time pre-orders recorded</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <CalendarClock className="w-5 h-5" />
          </div>
        </div>

        {/* Stock Arrived & Ready */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-800">Stock Arrived (Ready)</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{stats.stockArrivedCount}</h3>
            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {stats.stockArrivedCount > 0 ? 'Ready for POS checkout' : '0 ready for pickup'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Intake */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-amber-800">Awaiting Stock</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">{stats.pendingCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Due: {formatCurrency(stats.activeBalanceValue, settings.currencySymbol)}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Completed Fulfilled */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Fulfilled at POS</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.completedCount}</h3>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              {stats.totalCount > 0 ? `${Math.round((stats.completedCount / stats.totalCount) * 100)}% fulfillment rate` : 'No orders yet'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        
        {/* Search input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by customer, phone, model, IMEI, or pre-order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-indigo-600 rounded-xl text-xs text-slate-900 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Status Filter Badges */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {(['all', 'Pending', 'Stock Arrived', 'Completed', 'Cancelled'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === st
                  ? st === 'Stock Arrived'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : st === 'Pending'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : st === 'Completed'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : st === 'Cancelled'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'all' ? 'All Orders' : st}
              <span className="ml-1.5 opacity-80 text-[10px]">
                ({st === 'all' ? preOrders.length : preOrders.filter(p => p.status === st).length})
              </span>
            </button>
          ))}
        </div>

      </div>

      {/* Main Pre-Orders Cards / Table */}
      <div className="space-y-3">
        {filteredPreOrders.length === 0 ? (
          <div className="py-20 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h4 className="text-base font-bold text-slate-800">No Pre-Orders Found</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {searchQuery
                ? `No orders matched your search "${searchQuery}".`
                : 'There are no pre-orders recorded under this filter.'
              }
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedOrderForEdit(null);
                setIsNewModalOpen(true);
              }}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Capture New Pre-Order</span>
            </button>
          </div>
        ) : (
          filteredPreOrders.map(order => {
            const isStockArrived = order.status === 'Stock Arrived';
            const isPending = order.status === 'Pending';
            const isCompleted = order.status === 'Completed';
            const isCancelled = order.status === 'Cancelled';

            return (
              <div
                key={order.id}
                id={`preorder-row-${order.id}`}
                className={`bg-white rounded-2xl border p-4 sm:p-5 transition-all shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isStockArrived
                    ? 'border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-400/30 shadow-sm'
                    : isPending 
                    ? 'border-indigo-100 hover:border-indigo-300' 
                    : isCompleted
                    ? 'border-slate-200 bg-slate-50/40'
                    : 'border-slate-200 opacity-60 bg-slate-50/70'
                }`}
              >
                {/* Left: Pre-Order Ref, Status & Customer Info */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-900 px-2.5 py-0.5 rounded-md border border-indigo-200">
                      {order.preOrderNumber}
                    </span>

                    <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                      isStockArrived
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold shadow-2xs'
                        : isPending 
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : isCompleted
                        ? 'bg-slate-100 text-slate-800 border-slate-300'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {isStockArrived && <PackageCheck className="w-3 h-3 text-emerald-700 shrink-0" />}
                      {order.status}
                    </span>

                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Date: {order.orderDate}
                    </span>

                    {order.expectedArrivalDate && (
                      <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.2 rounded font-semibold border border-indigo-200">
                        Expected: {order.expectedArrivalDate}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{order.customerName}</span>
                    </h3>
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

                    {(order.quantity || 1) > 1 && (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <Boxes className="w-3 h-3 text-emerald-600" />
                        Qty: {order.quantity} Units
                      </span>
                    )}

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
                  </div>

                  {/* Late-Linked Physical Unit Details Banner (Stage 2) */}
                  {order.allocatedImei && (
                    <div className="mt-2 p-2 bg-emerald-50/90 border border-emerald-300 rounded-xl text-xs flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-emerald-950 flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5 text-emerald-700" />
                          Allocated Unit:
                        </span>
                        <span className="font-mono font-bold bg-white text-emerald-900 px-2 py-0.5 rounded border border-emerald-200">
                          IMEI: {order.allocatedImei}
                        </span>
                        {order.allocatedImei2 && (
                          <span className="font-mono text-[11px] text-emerald-800">
                            SIM 2: {order.allocatedImei2}
                          </span>
                        )}
                        {order.allocatedPurchaseOrderNumber && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            (PO: {order.allocatedPurchaseOrderNumber})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Ready for Customer Pickup
                      </span>
                    </div>
                  )}

                  {order.notes && (
                    <p className="text-[11px] text-slate-500 italic">
                      Note: "{order.notes}"
                    </p>
                  )}
                </div>

                {/* Middle: Financials */}
                <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 flex flex-row lg:flex-col justify-between lg:justify-center gap-2 text-right shrink-0">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Agreed Price {(order.quantity || 1) > 1 && `(${order.quantity} units)`}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {formatCurrency(order.fullPrice, settings.currencySymbol)}
                    </span>
                    {(order.quantity || 1) > 1 && (
                      <span className="text-[10px] text-slate-500 font-mono block">
                        @{formatCurrency(order.unitPrice || Math.round(order.fullPrice / order.quantity!), settings.currencySymbol)}/ea
                      </span>
                    )}
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

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {/* Fulfill in POS button for Stock Arrived & Pending */}
                  {(isStockArrived || isPending) && (
                    <button
                      type="button"
                      onClick={() => handleFulfillInPos(order)}
                      className={`px-4 py-2 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                        isStockArrived
                          ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 shadow-md ring-2 ring-emerald-500/30'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>{isStockArrived ? 'Fulfill in POS (Ready)' : 'Fulfill in POS'}</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  )}

                  {/* Print Booking Voucher */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderForEdit(order);
                      setIsNewModalOpen(true);
                    }}
                    title="View & Print Voucher"
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  {/* Edit Order if Pending or Stock Arrived */}
                  {(isPending || isStockArrived) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderForEdit(order);
                        setIsNewModalOpen(true);
                      }}
                      title="Edit Pre-Order"
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-indigo-600 rounded-xl transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Cancel Order (for Pending & Stock Arrived) */}
                  {(isPending || isStockArrived) && (
                    <button
                      type="button"
                      id={`cancel-preorder-btn-${order.id}`}
                      onClick={() => {
                        setOrderToCancel(order);
                        setCancelReason('Customer Request');
                        setRefundDepositOption(order.depositAmount > 0);
                      }}
                      title="Cancel Pre-Order & Handle Deposit"
                      className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-xl transition-colors cursor-pointer border border-rose-200 flex items-center justify-center"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}

                  {/* Restore button if Cancelled */}
                  {isCancelled && (
                    <button
                      type="button"
                      onClick={() => handleRestoreOrder(order)}
                      title="Reopen / Restore Pre-Order to Pending"
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-amber-200"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reopen</span>
                    </button>
                  )}

                  {/* Delete record */}
                  <button
                    type="button"
                    id={`delete-preorder-btn-${order.id}`}
                    onClick={() => setOrderToDelete(order)}
                    title="Delete Record"
                    className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-2.5 text-xs font-bold animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Custom Confirmation Modal: Cancel Pre-Order */}
      {orderToCancel && (
        <div id="cancel-preorder-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div 
            id="cancel-preorder-modal"
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Cancel Pre-Order</h3>
                  <p className="text-xs text-rose-700 font-mono font-bold mt-0.5">
                    Order #{orderToCancel.preOrderNumber}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-white/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Order summary card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-semibold">Customer:</span>
                  <span className="font-bold text-slate-900">{orderToCancel.customerName} ({orderToCancel.customerPhone})</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-semibold">Device Reserved:</span>
                  <span className="font-bold text-slate-900">
                    {orderToCancel.phoneModel} {orderToCancel.color} ({orderToCancel.ram}/{orderToCancel.rom})
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-semibold">Agreed Full Price:</span>
                  <span className="font-mono font-bold text-slate-900">{formatCurrency(orderToCancel.fullPrice, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Pre-Paid Deposit:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {formatCurrency(orderToCancel.depositAmount, settings.currencySymbol)}
                    <span className="text-[10px] text-slate-500 uppercase ml-1 font-normal">({orderToCancel.depositPaymentMethod})</span>
                  </span>
                </div>
              </div>

              {/* Notice if inventory unit was allocated */}
              {(orderToCancel.allocatedImei || orderToCancel.productId) && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <PackageCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <strong className="block font-bold">Allocated Inventory will be Released</strong>
                    <span className="text-[11px] text-amber-800">
                      IMEI <code className="font-mono font-bold">{orderToCancel.allocatedImei}</code> will be unreserved and made available for counter sales.
                    </span>
                  </div>
                </div>
              )}

              {/* Cancellation Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cancellation Reason / Note
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[
                    'Customer Request',
                    'Stock Delayed',
                    'Changed Model',
                    'Refund Requested'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCancelReason(preset)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer ${
                        cancelReason === preset
                          ? 'bg-rose-50 border-rose-300 text-rose-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Enter specific reason..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {/* Deposit Refund Handling */}
              {orderToCancel.depositAmount > 0 && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={refundDepositOption}
                      onChange={(e) => setRefundDepositOption(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <span className="font-bold text-slate-800 text-xs">
                      Process Deposit Refund of {formatCurrency(orderToCancel.depositAmount, settings.currencySymbol)}
                    </span>
                  </label>
                  {refundDepositOption && orderToCancel.depositPaymentMethod === 'cash' && (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-medium">
                      ✓ A cash refund entry will automatically be logged in the Cash Drawer.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Keep Pre-Order Active
              </button>

              <button
                type="button"
                id="confirm-cancel-preorder-btn"
                onClick={handleConfirmCancelOrder}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-rose-200 transition-all flex items-center gap-2 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal: Delete Pre-Order */}
      {orderToDelete && (
        <div id="delete-preorder-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div 
            id="delete-preorder-modal"
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Delete Pre-Order Record</h3>
                <p className="text-xs text-rose-700 font-mono font-bold mt-0.5">
                  Order #{orderToDelete.preOrderNumber}
                </p>
              </div>
            </div>

            <div className="p-6 text-xs text-slate-600 space-y-3">
              <p>
                Are you sure you want to permanently delete pre-order <strong className="text-slate-900">#{orderToDelete.preOrderNumber}</strong> for <strong className="text-slate-900">{orderToDelete.customerName}</strong> ({orderToDelete.phoneModel})?
              </p>
              <p className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                This action cannot be undone. If you only wish to mark the booking as cancelled, use the Cancel action instead.
              </p>
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Keep Record
              </button>

              <button
                type="button"
                id="confirm-delete-preorder-btn"
                onClick={handleConfirmDeleteOrder}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Order Capture Modal */}
      {isNewModalOpen && (
        <PreOrderFormModal
          isOpen={isNewModalOpen}
          onClose={() => {
            setIsNewModalOpen(false);
            setSelectedOrderForEdit(null);
          }}
          onSavePreOrder={handleSaveOrder}
          onSaveCustomer={onSaveCustomer}
          existingPreOrder={selectedOrderForEdit}
          customers={customers}
          products={products}
          settings={settings}
        />
      )}

    </div>
  );
};
