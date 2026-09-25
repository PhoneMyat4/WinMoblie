import React, { useState, useMemo } from 'react';
import { 
  X, 
  History, 
  Smartphone, 
  Package, 
  Truck, 
  ShoppingCart, 
  RotateCcw, 
  Sliders, 
  ClipboardCheck, 
  Search, 
  Filter, 
  Calendar, 
  Download, 
  Printer, 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Clock, 
  Tag, 
  ShieldCheck, 
  ShieldAlert,
  User, 
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  Minus,
  Percent,
  RefreshCw,
  Coins
} from 'lucide-react';
import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  StockAdjustment, 
  StockAuditSession, 
  PriceChangeRecord,
  ShopSettings,
  ProductHistoryEvent,
  ProductHistoryEventType,
  StaffUser,
  DamageLog
} from '../../types';
import { 
  getProductHistoryTimeline, 
  getProductLifecycleMetrics 
} from '../../utils/productHistoryUtils';
import { 
  formatCurrency, 
  formatDate, 
  formatDateTime, 
  getCategoryLabel, 
  getConditionLabel 
} from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { StorageService } from '../../utils/storage';
import { StockAdjustmentModal } from '../modals/StockAdjustmentModal';
import { PriceChangeModal } from '../modals/PriceChangeModal';
import { QuarantineReportModal } from './QuarantineReportModal';

interface ProductHistoryModalProps {
  product: Product;
  sales: Sale[];
  purchases: PurchaseRecord[];
  stockAdjustments: StockAdjustment[];
  stockAudits?: StockAuditSession[];
  priceChanges?: PriceChangeRecord[];
  damageLogs?: DamageLog[];
  settings: ShopSettings;
  staffUsers?: StaffUser[];
  currentStaffUser?: StaffUser;
  onClose: () => void;
  onViewInvoice?: (sale: Sale) => void;
  onProductUpdated?: (updatedProduct: Product) => void;
}

export const ProductHistoryModal: React.FC<ProductHistoryModalProps> = ({
  product: initialProduct,
  sales,
  purchases,
  stockAdjustments: initialStockAdjustments,
  stockAudits = [],
  priceChanges: initialPriceChanges,
  damageLogs: initialDamageLogs,
  settings,
  staffUsers = [],
  currentStaffUser,
  onClose,
  onViewInvoice,
  onProductUpdated,
}) => {
  const [currentProduct, setCurrentProduct] = useState<Product>(initialProduct);
  const [localAdjustments, setLocalAdjustments] = useState<StockAdjustment[]>(
    initialStockAdjustments.length > 0 ? initialStockAdjustments : StorageService.getStockAdjustments()
  );
  const [localPriceChanges, setLocalPriceChanges] = useState<PriceChangeRecord[]>(
    initialPriceChanges && initialPriceChanges.length > 0 ? initialPriceChanges : StorageService.getPriceChanges()
  );
  const [localDamageLogs, setLocalDamageLogs] = useState<DamageLog[]>(
    initialDamageLogs && initialDamageLogs.length > 0 ? initialDamageLogs : StorageService.getDamageLogs()
  );

  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Quick Action Modal States
  const [isStockAdjustmentOpen, setIsStockAdjustmentOpen] = useState<boolean>(false);
  const [isPriceChangeOpen, setIsPriceChangeOpen] = useState<boolean>(false);
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const fullTimeline = useMemo(() => {
    return getProductHistoryTimeline(
      currentProduct, 
      sales, 
      purchases, 
      localAdjustments, 
      stockAudits,
      localPriceChanges,
      localDamageLogs
    );
  }, [currentProduct, sales, purchases, localAdjustments, stockAudits, localPriceChanges, localDamageLogs]);

  // Derived Item Created or Added Date
  const itemAddedDate = useMemo(() => {
    if (currentProduct.createdAt) return currentProduct.createdAt;
    const createEv = fullTimeline.find(e => e.type === 'creation');
    if (createEv) return createEv.timestamp;
    if (fullTimeline.length > 0) {
      const sorted = [...fullTimeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (sorted[0]?.timestamp) return sorted[0].timestamp;
    }
    return currentProduct.lastRestockedAt || null;
  }, [currentProduct, fullTimeline]);

  // Activity category counts for quick-filter tabs
  const categoryCounts = useMemo(() => {
    const counts = {
      all: fullTimeline.length,
      price_change: 0,
      pos_sale: 0,
      purchase_stock_in: 0,
      stock_adjustment: 0,
      quarantine_damage: 0,
      sale_refund: 0,
      physical_audit: 0,
      creation: 0,
    };
    fullTimeline.forEach(e => {
      if (e.type in counts) {
        counts[e.type as keyof typeof counts]++;
      }
    });
    return counts;
  }, [fullTimeline]);

  const metrics = useMemo(() => {
    return getProductLifecycleMetrics(currentProduct, fullTimeline);
  }, [currentProduct, fullTimeline]);

  const filteredTimeline = useMemo(() => {
    return fullTimeline.filter(ev => {
      // Event type filter
      if (selectedEventType !== 'all' && ev.type !== selectedEventType) {
        return false;
      }

      // Date range filter
      if (startDate) {
        const evDate = ev.timestamp.split('T')[0];
        if (evDate < startDate) return false;
      }
      if (endDate) {
        const evDate = ev.timestamp.split('T')[0];
        if (evDate > endDate) return false;
      }

      // Search keyword filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = ev.title.toLowerCase().includes(q);
        const matchDetails = ev.details.toLowerCase().includes(q);
        const matchDoc = ev.referenceDoc?.toLowerCase().includes(q);
        const matchStaff = ev.performedBy.toLowerCase().includes(q);
        const matchReason = ev.reasonLabel?.toLowerCase().includes(q);
        const matchImei = ev.imeiAffected?.some(im => im.toLowerCase().includes(q));
        if (!matchTitle && !matchDetails && !matchDoc && !matchStaff && !matchReason && !matchImei) {
          return false;
        }
      }

      return true;
    });
  }, [fullTimeline, selectedEventType, searchQuery, startDate, endDate]);

  // Handle Confirmed Stock Adjustment
  const handleConfirmStockAdjustment = (adjustment: StockAdjustment) => {
    StorageService.adjustStock(adjustment);
    const updatedProducts = StorageService.getProducts();
    const updatedProd = updatedProducts.find(p => p.id === currentProduct.id) || {
      ...currentProduct,
      stock: adjustment.newStock,
    };

    setCurrentProduct(updatedProd);
    setLocalAdjustments(StorageService.getStockAdjustments());
    if (onProductUpdated) {
      onProductUpdated(updatedProd);
    }
    showToast(`Stock updated to ${adjustment.newStock} units (${adjustment.quantityChange >= 0 ? '+' : ''}${adjustment.quantityChange}). Activity recorded in history.`);
  };

  // Handle Confirmed Price Change
  const handleConfirmPriceChange = (priceRecord: PriceChangeRecord, updatedProduct: Product) => {
    StorageService.recordPriceChange(priceRecord);
    StorageService.saveProduct(updatedProduct);

    setCurrentProduct(updatedProduct);
    setLocalPriceChanges(StorageService.getPriceChanges());
    if (onProductUpdated) {
      onProductUpdated(updatedProduct);
    }
    const delta = priceRecord.priceDelta;
    showToast(`Price updated to ${updatedProduct.sellingPrice.toLocaleString()} Ks (${delta >= 0 ? '+' : ''}${delta.toLocaleString()} Ks). Activity recorded in history.`);
  };

  // Handle Confirmed Stock Quarantine (Damaged / Lost Unit)
  const handleConfirmQuarantine = (updatedProduct: Product) => {
    setCurrentProduct(updatedProduct);
    setLocalAdjustments(StorageService.getStockAdjustments());
    setLocalDamageLogs(StorageService.getDamageLogs());
    if (onProductUpdated) {
      onProductUpdated(updatedProduct);
    }
    showToast(`Stock Quarantine Confirmed: 1 unit of "${updatedProduct.name}" isolated from sellable inventory.`);
    setIsQuarantineModalOpen(false);
  };

  const handleExportCsv = () => {
    const headers = [
      'Timestamp',
      'Event Type',
      'Title',
      'Reason',
      'Quantity Change',
      'Stock Before',
      'Stock After',
      'Old Selling Price (Ks)',
      'New Selling Price (Ks)',
      'Price Change (%)',
      'Reference Doc',
      'Unit Cost (Ks)',
      'Performed By',
      'IMEI Numbers',
      'Details'
    ];

    const rows = filteredTimeline.map(ev => [
      formatDateTime(ev.timestamp),
      ev.type,
      ev.title,
      ev.reasonLabel || '-',
      ev.quantityChange !== undefined ? `${ev.quantityChange >= 0 ? '+' : ''}${ev.quantityChange}` : '0',
      ev.stockBefore !== undefined ? String(ev.stockBefore) : '-',
      ev.stockAfter !== undefined ? String(ev.stockAfter) : '-',
      ev.oldSellingPrice !== undefined ? String(ev.oldSellingPrice) : '-',
      ev.newSellingPrice !== undefined ? String(ev.newSellingPrice) : (ev.sellingPrice ? String(ev.sellingPrice) : '-'),
      ev.priceChangePercent !== undefined ? `${ev.priceChangePercent}%` : '-',
      ev.referenceDoc || '-',
      ev.unitCost ? String(ev.unitCost) : '-',
      ev.performedBy,
      ev.imeiAffected?.join('; ') || '-',
      ev.details.replace(/"/g, '""')
    ]);

    exportToCsv(`Product_History_${currentProduct.sku || currentProduct.id}_${Date.now()}`, headers, rows);
  };

  const getEventBadge = (type: ProductHistoryEventType) => {
    switch (type) {
      case 'price_change':
        return {
          label: 'Price Change',
          bg: 'bg-amber-50 text-amber-900 border-amber-200',
          icon: Tag,
          dotColor: 'bg-amber-500',
          accentBorder: 'border-l-amber-500'
        };
      case 'stock_adjustment':
        return {
          label: 'Stock Adjustment',
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: Sliders,
          dotColor: 'bg-rose-500',
          accentBorder: 'border-l-rose-500'
        };
      case 'purchase_stock_in':
        return {
          label: 'Stock-In / PO',
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: Truck,
          dotColor: 'bg-emerald-500',
          accentBorder: 'border-l-emerald-500'
        };
      case 'pos_sale':
        return {
          label: 'POS Sale',
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: ShoppingCart,
          dotColor: 'bg-blue-500',
          accentBorder: 'border-l-blue-500'
        };
      case 'sale_refund':
        return {
          label: 'Return / Refund',
          bg: 'bg-orange-50 text-orange-800 border-orange-200',
          icon: RotateCcw,
          dotColor: 'bg-orange-500',
          accentBorder: 'border-l-orange-500'
        };
      case 'physical_audit':
        return {
          label: 'Audit Stocktake',
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: ClipboardCheck,
          dotColor: 'bg-purple-500',
          accentBorder: 'border-l-purple-500'
        };
      case 'quarantine_damage':
        return {
          label: 'Quarantine / Damaged',
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: ShieldAlert,
          dotColor: 'bg-rose-600',
          accentBorder: 'border-l-rose-600'
        };
      case 'creation':
        return {
          label: 'Catalog Registered',
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: Calendar,
          dotColor: 'bg-indigo-600',
          accentBorder: 'border-l-indigo-600'
        };
      default:
        return {
          label: 'System Activity',
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          icon: Tag,
          dotColor: 'bg-slate-500',
          accentBorder: 'border-l-slate-400'
        };
    }
  };

  const cond = getConditionLabel(currentProduct.condition);
  const currentMarginAmt = Math.max(0, currentProduct.sellingPrice - currentProduct.costPrice);
  const currentMarginPct = currentProduct.sellingPrice > 0 
    ? ((currentMarginAmt / currentProduct.sellingPrice) * 100).toFixed(1)
    : '0';

  const priceChangesCount = fullTimeline.filter(e => e.type === 'price_change').length;
  const stockAdjustmentsCount = fullTimeline.filter(e => e.type === 'stock_adjustment' || e.type === 'physical_audit').length;

  return (
    <>
      <div 
        id="product-history-modal-backdrop" 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div 
          id="product-history-modal-container"
          className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content my-auto"
        >
          {/* Header Strip */}
          <div className="flex items-start justify-between px-6 py-4.5 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
            <div className="flex items-start gap-3 min-w-0 pr-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-900/50 mt-0.5">
                <History className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-800/80 text-indigo-200 text-xs font-bold font-mono uppercase tracking-wider">
                    {currentProduct.brand}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                    {getCategoryLabel(currentProduct.category)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                    {cond.label}
                  </span>

                  {/* Item Created or Added Date Badge */}
                  <span 
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 text-xs font-medium border border-emerald-700/60 shadow-2xs"
                    title={itemAddedDate ? `Item registered in system on ${formatDateTime(itemAddedDate)}` : 'Initial catalog entry'}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Added: <strong className="font-mono text-white">{itemAddedDate ? formatDate(itemAddedDate) : 'Catalog Setup'}</strong></span>
                  </span>

                  {/* Quarantined Stock Warning Badge */}
                  {Boolean(currentProduct.quarantinedStock && currentProduct.quarantinedStock > 0) && (
                    <span 
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/40 shadow-2xs"
                      title={`${currentProduct.quarantinedStock} unit(s) currently isolated in damage/loss quarantine`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      <span>{currentProduct.quarantinedStock} In Quarantine</span>
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-white text-lg tracking-tight mt-1 truncate">
                  {currentProduct.name}
                </h3>

                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 font-mono mt-0.5">
                  <span>SKU: <strong className="text-indigo-300 font-bold">{currentProduct.sku || 'N/A'}</strong></span>
                  <span>•</span>
                  <span>Barcode: <strong className="text-slate-300">{currentProduct.barcode}</strong></span>
                  {itemAddedDate && (
                    <>
                      <span>•</span>
                      <span className="text-slate-300">Added Date: <strong className="text-white font-mono">{formatDateTime(itemAddedDate)}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Quarantine Action Trigger */}
              <button
                type="button"
                id="btn-quarantine-item-header"
                onClick={() => setIsQuarantineModalOpen(true)}
                disabled={currentProduct.stock <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                title={currentProduct.stock <= 0 ? 'No sellable stock to quarantine' : 'Quarantine damaged or lost stock item'}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-200" />
                <span className="hidden sm:inline">Quarantine (Damaged/Loss)</span>
                <span className="sm:hidden">Quarantine</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Toast notification banner */}
          {toastMessage && (
            <div className="bg-emerald-600 text-white px-6 py-2.5 flex items-center justify-between text-xs font-bold shadow-inner animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{toastMessage}</span>
              </div>
              <button 
                onClick={() => setToastMessage(null)}
                className="p-1 text-white/80 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Scrollable Content Body */}
          <div className="p-6 overflow-y-auto space-y-6 text-slate-800">

            {/* Quick Activity Triggers Bar: Adjust Stock & Change Price & Quarantine */}
            <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-50/70 via-indigo-50/50 to-rose-50/50 border border-slate-200 rounded-2xl flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Quick Inventory Activities:</span>
                <span className="text-xs text-slate-500 hidden sm:inline">Log real-time price updates, physical stock adjustments, or isolate damaged/lost units</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsPriceChangeOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-xs shadow-amber-200 transition-all cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Update Price</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsStockAdjustmentOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs shadow-indigo-200 transition-all cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Adjust Stock</span>
                </button>

                <button
                  type="button"
                  id="btn-quarantine-item-activity-bar"
                  onClick={() => setIsQuarantineModalOpen(true)}
                  disabled={currentProduct.stock <= 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs shadow-xs shadow-rose-200 transition-all cursor-pointer"
                  title={currentProduct.stock <= 0 ? 'No sellable stock to quarantine' : 'Report unit as damaged or lost to isolate into quarantine'}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-200" />
                  <span>Quarantine Stock (Damaged / Loss)</span>
                </button>
              </div>
            </div>

            {/* Active Quarantine Banner if product has quarantined units */}
            {Boolean(currentProduct.quarantinedStock && currentProduct.quarantinedStock > 0) && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-900 gap-3 flex-wrap animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  </div>
                  <div>
                    <strong className="block font-bold">Quarantine Isolation Active: {currentProduct.quarantinedStock} unit(s)</strong>
                    <span className="text-rose-700">These units have been removed from sellable inventory due to reported damage, defects, or loss.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEventType('quarantine_damage')}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs transition-colors"
                >
                  View Quarantine Logs
                </button>
              </div>
            )}

            {/* 360° Life-cycle KPI Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Current Stock & Valuation */}
              <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                  <span>Current In-Stock</span>
                  <Package className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <p className="text-xl font-black text-indigo-950">
                  {currentProduct.stock} Units
                </p>
                <div className="flex items-center justify-between flex-wrap gap-1 mt-0.5">
                  <span className="text-[10px] text-slate-500 font-mono">
                    Valuation: {formatCurrency(currentProduct.stock * currentProduct.costPrice, settings.currencySymbol)}
                  </span>
                  {Boolean(currentProduct.quarantinedStock && currentProduct.quarantinedStock > 0) && (
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-100/80 px-1.5 py-0.2 rounded-md">
                      {currentProduct.quarantinedStock} quarantined
                    </span>
                  )}
                </div>
              </div>

              {/* Retail Price & Margin */}
              <div className="p-3.5 bg-amber-50/60 border border-amber-100 rounded-2xl">
                <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                  <span>Selling Price & Margin</span>
                  <Tag className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <p className="text-xl font-black text-amber-950">
                  {formatCurrency(currentProduct.sellingPrice, settings.currencySymbol)}
                </p>
                <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                  Margin: <strong>{currentMarginPct}%</strong> ({priceChangesCount} revisions)
                </p>
              </div>

              {/* Total Sold at POS */}
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-2xl">
                <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                  <span>Total POS Sales</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <p className="text-xl font-black text-blue-950">
                  {metrics.totalSoldQty} Sold
                </p>
                <p className="text-[10px] text-blue-700 font-bold mt-0.5">
                  Rev: {formatCurrency(metrics.totalSoldRevenue, settings.currencySymbol)}
                </p>
              </div>

              {/* Stock Movement & Adjustments */}
              <div className="p-3.5 bg-rose-50/60 border border-rose-100 rounded-2xl">
                <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                  <span>Adjustments & Quarantine</span>
                  <Sliders className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <p className="text-xl font-black text-rose-950">
                  {stockAdjustmentsCount + categoryCounts.quarantine_damage} Logs
                </p>
                <p className="text-[10px] text-rose-700 font-medium mt-0.5">
                  Net adjusted: {metrics.totalAdjustedQty >= 0 ? `+${metrics.totalAdjustedQty}` : metrics.totalAdjustedQty} units
                </p>
              </div>
            </div>

            {/* Filter & Search Bar with Category Tabs */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search price revision, adjustment, invoice #, PO #, damage log, IMEI..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Event Type Filter Dropdown */}
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  <select
                    value={selectedEventType}
                    onChange={(e) => setSelectedEventType(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="all">All Activities ({categoryCounts.all})</option>
                    <option value="price_change">🏷️ Price Changes ({categoryCounts.price_change})</option>
                    <option value="pos_sale">🛒 Sold (POS) ({categoryCounts.pos_sale})</option>
                    <option value="purchase_stock_in">📦 Stock-In / Purchases ({categoryCounts.purchase_stock_in})</option>
                    <option value="stock_adjustment">⚙️ Stock Adjustments ({categoryCounts.stock_adjustment})</option>
                    <option value="quarantine_damage">🛡️ Quarantine / Damage ({categoryCounts.quarantine_damage})</option>
                    <option value="sale_refund">↩️ Returns / Refunds ({categoryCounts.sale_refund})</option>
                    <option value="physical_audit">📋 Physical Stock Audits ({categoryCounts.physical_audit})</option>
                    <option value="creation">📅 Catalog Added / Created ({categoryCounts.creation})</option>
                  </select>

                  {/* Date range pickers */}
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600"
                    title="Filter start date"
                  />
                  <span className="text-slate-400 text-xs">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600"
                    title="Filter end date"
                  />
                </div>
              </div>

              {/* Activity Categories Quick Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
                <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase tracking-wider mr-1">Filter Activities:</span>
                {[
                  { id: 'all', label: 'All', count: categoryCounts.all },
                  { id: 'price_change', label: 'Price Changes', count: categoryCounts.price_change, icon: Tag },
                  { id: 'pos_sale', label: 'Sold', count: categoryCounts.pos_sale, icon: ShoppingCart },
                  { id: 'purchase_stock_in', label: 'Stock-In', count: categoryCounts.purchase_stock_in, icon: Truck },
                  { id: 'stock_adjustment', label: 'Adjustments', count: categoryCounts.stock_adjustment, icon: Sliders },
                  { id: 'quarantine_damage', label: 'Quarantine / Loss', count: categoryCounts.quarantine_damage, icon: ShieldAlert },
                  { id: 'sale_refund', label: 'Returns', count: categoryCounts.sale_refund, icon: RotateCcw },
                  { id: 'physical_audit', label: 'Audits', count: categoryCounts.physical_audit, icon: ClipboardCheck },
                  { id: 'creation', label: 'Created / Added', count: categoryCounts.creation, icon: Calendar },
                ].map(tab => {
                  const isSelected = selectedEventType === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedEventType(tab.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-200'
                          : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      <span>{tab.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        isSelected ? 'bg-indigo-500/50 text-white' : 'bg-slate-100 text-slate-600 font-semibold'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chronological Event Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Product Activities & Audit Trail ({filteredTimeline.length} Records)</span>
                </h4>
                {(selectedEventType !== 'all' || searchQuery || startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventType('all');
                      setSearchQuery('');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {filteredTimeline.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">No activity events found</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try adjusting your filters or search keywords.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {filteredTimeline.map((event) => {
                    const badge = getEventBadge(event.type);
                    const Icon = badge.icon;
                    const isPriceChange = event.type === 'price_change';
                    const isStockAdjustment = event.type === 'stock_adjustment' || event.type === 'physical_audit';

                    return (
                      <div 
                        key={event.id}
                        className={`relative bg-white border rounded-2xl p-4 shadow-xs transition-all ${
                          isPriceChange 
                            ? 'border-amber-200 hover:border-amber-300 bg-gradient-to-r from-white via-amber-50/20 to-white' 
                            : isStockAdjustment
                            ? 'border-rose-200 hover:border-rose-300'
                            : 'border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {/* Timeline Dot */}
                        <span className={`absolute -left-[27px] top-4.5 w-3.5 h-3.5 rounded-full border-2 border-white ${badge.dotColor} shadow-xs`} />

                        {/* Top Row: Event Type, Date, Badges */}
                        <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ${badge.bg}`}>
                              <Icon className="w-3 h-3" />
                              <span>{badge.label}</span>
                            </span>

                            {event.reasonLabel && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                                {event.reasonLabel}
                              </span>
                            )}

                            {event.referenceDoc && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                                {event.referenceDoc}
                              </span>
                            )}

                            {/* Quantity Change Badge for stock activities */}
                            {event.quantityChange !== undefined && event.quantityChange !== 0 && (
                              <span className={`px-2 py-0.5 rounded-md text-xs font-black font-mono ${
                                event.quantityChange > 0 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {event.quantityChange > 0 ? `+${event.quantityChange}` : event.quantityChange} Units
                              </span>
                            )}

                            {/* Price Delta Badge for price revisions */}
                            {isPriceChange && event.priceDelta !== undefined && (
                              <span className={`px-2 py-0.5 rounded-md text-xs font-black font-mono ${
                                event.priceDelta >= 0 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {event.priceDelta >= 0 ? `+${event.priceDelta.toLocaleString()}` : event.priceDelta.toLocaleString()} Ks
                                {event.priceChangePercent !== undefined && ` (${event.priceChangePercent >= 0 ? '+' : ''}${event.priceChangePercent}%)`}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDateTime(event.timestamp)}</span>
                          </div>
                        </div>

                        {/* Event Details Content */}
                        <div className="mt-2.5 space-y-1.5">
                          <h5 className="font-bold text-slate-900 text-sm">
                            {event.title}
                          </h5>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {event.details}
                          </p>
                        </div>

                        {/* Price Change Visual Comparison Card */}
                        {isPriceChange && event.oldSellingPrice !== undefined && event.newSellingPrice !== undefined && (
                          <div className="mt-3 p-3 bg-amber-50/50 border border-amber-200/80 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block">Old Selling Price</span>
                              <span className="font-bold text-slate-700">{event.oldSellingPrice.toLocaleString()} Ks</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block">New Selling Price</span>
                              <span className="font-black text-amber-900">{event.newSellingPrice.toLocaleString()} Ks</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block">Margin Impact</span>
                              <span className="font-bold text-slate-700">
                                {event.marginPercentBefore !== undefined && `${event.marginPercentBefore}% → `}
                                <strong className="text-amber-900">{event.marginPercentAfter !== undefined ? `${event.marginPercentAfter}%` : '-'}</strong>
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold block">Effective Shift</span>
                              <span className={`font-bold ${event.priceDelta && event.priceDelta >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {event.priceDelta && event.priceDelta >= 0 ? '+' : ''}{event.priceDelta?.toLocaleString()} Ks
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Stock Adjustment Visual Progression Card */}
                        {isStockAdjustment && event.stockBefore !== undefined && event.stockAfter !== undefined && (
                          <div className="mt-3 p-2.5 bg-rose-50/40 border border-rose-200/70 rounded-xl flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <div>
                                <span className="text-[10px] text-slate-400 font-semibold block">Stock Before</span>
                                <span className="font-bold text-slate-700">{event.stockBefore} units</span>
                              </div>
                              <span className="text-slate-400">➔</span>
                              <div>
                                <span className="text-[10px] text-slate-400 font-semibold block">Stock After</span>
                                <span className="font-black text-slate-900">{event.stockAfter} units</span>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                              (event.quantityChange || 0) >= 0 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              Net: {(event.quantityChange || 0) >= 0 ? `+${event.quantityChange}` : event.quantityChange} units
                            </span>
                          </div>
                        )}

                        {/* IMEI Badges if affected */}
                        {event.imeiAffected && event.imeiAffected.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100">
                            <span className="text-[11px] font-bold text-slate-400 block mb-1">
                              Associated Serial Numbers / IMEIs:
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {event.imeiAffected.map((im, i) => (
                                <span 
                                  key={i}
                                  className="px-2 py-0.5 bg-indigo-50/70 border border-indigo-100 text-indigo-900 rounded-md font-mono text-[11px] font-semibold"
                                >
                                  {im}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer: Performed By Staff */}
                        <div className="mt-3 pt-2 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>Staff: <strong className="text-slate-700">{event.performedBy}</strong></span>
                          </div>

                          {event.extraMeta?.notes && (
                            <div className="italic text-slate-500 max-w-xs truncate">
                              "{String(event.extraMeta.notes)}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Showing <strong className="text-slate-800">{filteredTimeline.length}</strong> of {fullTimeline.length} activity records
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              Close History
            </button>
          </div>

        </div>
      </div>

      {/* Embedded Stock Adjustment Modal */}
      {isStockAdjustmentOpen && (
        <StockAdjustmentModal
          product={currentProduct}
          isOpen={isStockAdjustmentOpen}
          onClose={() => setIsStockAdjustmentOpen(false)}
          onConfirm={handleConfirmStockAdjustment}
          staffUsers={staffUsers}
          currentStaffUser={currentStaffUser}
        />
      )}

      {/* Embedded Price Change Modal */}
      {isPriceChangeOpen && (
        <PriceChangeModal
          product={currentProduct}
          isOpen={isPriceChangeOpen}
          onClose={() => setIsPriceChangeOpen(false)}
          onConfirm={handleConfirmPriceChange}
          staffUsers={staffUsers}
          currentStaffUser={currentStaffUser}
        />
      )}

      {/* Embedded Stock Quarantine (Damaged / Loss) Modal */}
      {isQuarantineModalOpen && (
        <QuarantineReportModal
          isOpen={isQuarantineModalOpen}
          onClose={() => setIsQuarantineModalOpen(false)}
          products={StorageService.getProducts()}
          settings={settings}
          preSelectedProduct={currentProduct}
          onSuccess={handleConfirmQuarantine}
        />
      )}
    </>
  );
};
