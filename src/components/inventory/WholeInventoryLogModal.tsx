import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Search,
  Download,
  Filter,
  History,
  Tag,
  ShoppingCart,
  Truck,
  Sliders,
  ShieldAlert,
  RotateCcw,
  ClipboardCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Clock,
  User,
  FileSpreadsheet,
  Package,
  Barcode,
  Eye,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  StockAdjustment, 
  StockAuditSession, 
  PriceChangeRecord, 
  DamageLog, 
  ShopSettings, 
  StaffUser,
  ProductHistoryEvent,
  ProductHistoryEventType
} from '../../types';
import { getAllInventoryHistoryTimeline } from '../../utils/productHistoryUtils';
import { formatCurrency, formatDateTime, formatDate, getCategoryLabel } from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { StorageService } from '../../utils/storage';

interface WholeInventoryLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: ShopSettings;
  sales?: Sale[];
  purchases?: PurchaseRecord[];
  stockAdjustments?: StockAdjustment[];
  stockAudits?: StockAuditSession[];
  priceChanges?: PriceChangeRecord[];
  damageLogs?: DamageLog[];
  staffUsers?: StaffUser[];
  onOpenProductHistory?: (product: Product) => void;
}

export const WholeInventoryLogModal: React.FC<WholeInventoryLogModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  sales: initialSales,
  purchases: initialPurchases,
  stockAdjustments: initialAdjustments,
  stockAudits: initialAudits,
  priceChanges: initialPriceChanges,
  damageLogs: initialDamageLogs,
  staffUsers = [],
  onOpenProductHistory,
}) => {
  // Pull live state from StorageService or props
  const sales = useMemo(() => initialSales && initialSales.length > 0 ? initialSales : StorageService.getSales(), [initialSales]);
  const purchases = useMemo(() => initialPurchases && initialPurchases.length > 0 ? initialPurchases : StorageService.getPurchases(), [initialPurchases]);
  const stockAdjustments = useMemo(() => initialAdjustments && initialAdjustments.length > 0 ? initialAdjustments : StorageService.getStockAdjustments(), [initialAdjustments]);
  const stockAudits = useMemo(() => initialAudits && initialAudits.length > 0 ? initialAudits : StorageService.getStockAudits(), [initialAudits]);
  const priceChanges = useMemo(() => initialPriceChanges && initialPriceChanges.length > 0 ? initialPriceChanges : StorageService.getPriceChanges(), [initialPriceChanges]);
  const damageLogs = useMemo(() => initialDamageLogs && initialDamageLogs.length > 0 ? initialDamageLogs : StorageService.getDamageLogs(), [initialDamageLogs]);

  // Filtering states
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Generate master chronological inventory timeline
  const fullTimeline = useMemo(() => {
    return getAllInventoryHistoryTimeline(
      products,
      sales,
      purchases,
      stockAdjustments,
      stockAudits,
      priceChanges,
      damageLogs
    );
  }, [products, sales, purchases, stockAdjustments, stockAudits, priceChanges, damageLogs, refreshKey]);

  // Categories list from products
  const productCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set).sort();
  }, [products]);

  // Quick Date Preset handler
  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const yest = new Date(now.getTime() - 86400000);
      const yestStr = yest.toISOString().split('T')[0];
      setStartDate(yestStr);
      setEndDate(yestStr);
    } else if (preset === 'last7') {
      const past7 = new Date(now.getTime() - 7 * 86400000);
      setStartDate(past7.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === 'last30') {
      const past30 = new Date(now.getTime() - 30 * 86400000);
      setStartDate(past30.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
    setCurrentPage(1);
  };

  // Activity counts across categories
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
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
    fullTimeline.forEach(ev => {
      if (ev.type in counts) {
        counts[ev.type]++;
      }
    });
    return counts;
  }, [fullTimeline]);

  // Filtered timeline
  const filteredTimeline = useMemo(() => {
    return fullTimeline.filter(event => {
      // 1. Event Type Filter
      if (selectedEventType !== 'all' && event.type !== selectedEventType) {
        return false;
      }

      // 2. Product Filter
      if (selectedProductId !== 'all' && event.productId !== selectedProductId) {
        return false;
      }

      // 3. Category Filter
      if (selectedCategory !== 'all' && event.productCategory !== selectedCategory) {
        return false;
      }

      // 4. Date Range Filter
      if (startDate) {
        const evDate = event.timestamp.split('T')[0];
        if (evDate < startDate) return false;
      }
      if (endDate) {
        const evDate = event.timestamp.split('T')[0];
        if (evDate > endDate) return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = event.title.toLowerCase().includes(q);
        const matchDetails = event.details.toLowerCase().includes(q);
        const matchProdName = event.productName.toLowerCase().includes(q);
        const matchBrand = (event.productBrand || '').toLowerCase().includes(q);
        const matchSku = (event.productSku || '').toLowerCase().includes(q);
        const matchBarcode = (event.productBarcode || '').toLowerCase().includes(q);
        const matchRef = (event.referenceDoc || '').toLowerCase().includes(q);
        const matchStaff = event.performedBy.toLowerCase().includes(q);
        const matchReason = (event.reasonLabel || '').toLowerCase().includes(q);
        const matchImei = event.imeiAffected?.some(im => im.toLowerCase().includes(q));

        if (!matchTitle && !matchDetails && !matchProdName && !matchBrand && !matchSku && !matchBarcode && !matchRef && !matchStaff && !matchReason && !matchImei) {
          return false;
        }
      }

      return true;
    });
  }, [fullTimeline, selectedEventType, selectedProductId, selectedCategory, startDate, endDate, searchQuery]);

  // Aggregate Metrics over filtered events
  const metrics = useMemo(() => {
    let totalInflowQty = 0;
    let totalOutflowQty = 0;
    let priceChangesCount = 0;
    let quarantineCount = 0;
    let adjustmentsCount = 0;

    filteredTimeline.forEach(ev => {
      if (ev.type === 'purchase_stock_in' && ev.quantityChange) {
        totalInflowQty += ev.quantityChange;
      } else if (ev.type === 'sale_refund' && ev.quantityChange) {
        totalInflowQty += ev.quantityChange;
      } else if (ev.type === 'pos_sale' && ev.quantityChange) {
        totalOutflowQty += Math.abs(ev.quantityChange);
      } else if (ev.type === 'quarantine_damage') {
        quarantineCount++;
        if (ev.quantityChange) totalOutflowQty += Math.abs(ev.quantityChange);
      } else if (ev.type === 'price_change') {
        priceChangesCount++;
      } else if (ev.type === 'stock_adjustment' || ev.type === 'physical_audit') {
        adjustmentsCount++;
      }
    });

    return {
      totalEvents: filteredTimeline.length,
      totalInflowQty,
      totalOutflowQty,
      netStockChange: totalInflowQty - totalOutflowQty,
      priceChangesCount,
      quarantineCount,
      adjustmentsCount,
    };
  }, [filteredTimeline]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredTimeline.length / pageSize) || 1;
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTimeline.slice(start, start + pageSize);
  }, [filteredTimeline, currentPage, pageSize]);

  // Reset page when filters change
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSelectedEventType('all');
    setSelectedProductId('all');
    setSelectedCategory('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setDatePreset('all');
    setCurrentPage(1);
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = [
      'Timestamp',
      'Event Type',
      'Product Name',
      'Brand',
      'Category',
      'SKU',
      'Barcode',
      'Activity Title',
      'Details',
      'Stock Impact',
      'Unit Cost',
      'Selling Price',
      'Reference Doc',
      'Performed By',
      'Serial / IMEI',
    ];

    const rows = filteredTimeline.map(ev => [
      formatDateTime(ev.timestamp),
      ev.type,
      ev.productName,
      ev.productBrand || '-',
      ev.productCategory ? getCategoryLabel(ev.productCategory as any) : '-',
      ev.productSku || '-',
      ev.productBarcode || '-',
      ev.title,
      ev.details,
      ev.quantityChange !== undefined ? (ev.quantityChange > 0 ? `+${ev.quantityChange}` : ev.quantityChange) : '0',
      ev.unitCost !== undefined ? ev.unitCost : '-',
      ev.sellingPrice !== undefined ? ev.sellingPrice : '-',
      ev.referenceDoc || '-',
      ev.performedBy,
      ev.imeiAffected ? ev.imeiAffected.join('; ') : '-',
    ]);

    exportToCsv(`Whole_Inventory_Audit_Log_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  const getEventBadge = (type: ProductHistoryEventType) => {
    switch (type) {
      case 'pos_sale':
        return {
          label: 'POS Sale',
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: ShoppingCart,
          impactColor: 'text-rose-600 bg-rose-50 border-rose-200',
        };
      case 'purchase_stock_in':
        return {
          label: 'Stock-In / PO',
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: Truck,
          impactColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        };
      case 'sale_refund':
        return {
          label: 'Customer Return',
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: RotateCcw,
          impactColor: 'text-amber-700 bg-amber-50 border-amber-200',
        };
      case 'stock_adjustment':
        return {
          label: 'Stock Adjustment',
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: Sliders,
          impactColor: 'text-purple-700 bg-purple-50 border-purple-200',
        };
      case 'physical_audit':
        return {
          label: 'Stock Audit',
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: ClipboardCheck,
          impactColor: 'text-indigo-700 bg-indigo-50 border-indigo-200',
        };
      case 'price_change':
        return {
          label: 'Price Change',
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: Tag,
          impactColor: 'text-slate-700 bg-slate-100 border-slate-200',
        };
      case 'quarantine_damage':
        return {
          label: 'Quarantine / Loss',
          bg: 'bg-red-50 text-red-800 border-red-200',
          icon: ShieldAlert,
          impactColor: 'text-red-700 bg-red-50 border-red-200',
        };
      case 'creation':
        return {
          label: 'Catalog Added',
          bg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
          icon: Calendar,
          impactColor: 'text-cyan-700 bg-cyan-50 border-cyan-200',
        };
      default:
        return {
          label: 'Activity',
          bg: 'bg-slate-50 text-slate-800 border-slate-200',
          icon: History,
          impactColor: 'text-slate-700 bg-slate-100 border-slate-200',
        };
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      id="whole-inventory-log-modal-backdrop" 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div 
        id="whole-inventory-log-modal-container"
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-7xl h-[94vh] flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white shrink-0 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-inner">
              <History className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white tracking-tight">
                  Whole Store Inventory Audit &amp; Activity Log
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 text-xs font-bold border border-indigo-400/30">
                  {filteredTimeline.length} Total Events
                </span>
                <span className="text-xs text-slate-400">
                  • {products.length} Products Monitored
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Complete master log of stock movements, retail price changes, POS sales, damage quarantine, and supplier receiving.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-refresh-inventory-log"
              onClick={() => setRefreshKey(k => k + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              title="Refresh log data from database"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              id="btn-export-inventory-log-csv"
              onClick={handleExportCsv}
              disabled={filteredTimeline.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              title="Export current filtered view to CSV file"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV ({filteredTimeline.length})</span>
            </button>

            <button
              type="button"
              id="btn-close-inventory-log-modal"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer ml-1"
              aria-label="Close inventory log"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Summary Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-4 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Log Entries</span>
            <p className="text-xl font-black text-slate-900 mt-0.5">{metrics.totalEvents.toLocaleString()}</p>
            <span className="text-[10px] text-slate-500 font-medium">All recorded activities</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Stock Inflow</span>
            <p className="text-xl font-black text-blue-900 mt-0.5">+{metrics.totalInflowQty.toLocaleString()} Units</p>
            <span className="text-[10px] text-blue-700 font-medium">Purchases &amp; Returns</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Stock Outflow</span>
            <p className="text-xl font-black text-rose-900 mt-0.5">-{metrics.totalOutflowQty.toLocaleString()} Units</p>
            <span className="text-[10px] text-rose-700 font-medium">POS Sales &amp; Quarantine</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Net Balance Flow</span>
            <p className={`text-xl font-black mt-0.5 ${metrics.netStockChange >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {metrics.netStockChange >= 0 ? `+${metrics.netStockChange}` : metrics.netStockChange} Units
            </p>
            <span className="text-[10px] text-slate-500 font-medium">Inflow minus Outflow</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">Price Revisions</span>
            <p className="text-xl font-black text-purple-900 mt-0.5">{metrics.priceChangesCount} Changes</p>
            <span className="text-[10px] text-purple-700 font-medium">Retail price shifts</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Quarantine / Loss</span>
            <p className="text-xl font-black text-red-900 mt-0.5">{metrics.quarantineCount} Records</p>
            <span className="text-[10px] text-red-700 font-medium">Damaged or lost items</span>
          </div>
        </div>

        {/* Filters & Control Toolbar */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                placeholder="Search by product name, SKU, barcode, invoice #, PO #, staff, serial IMEI, damage log..."
                className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleFilterChange(setSearchQuery, '')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Filters: Product, Category, Date Preset */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Product Selector */}
              <select
                value={selectedProductId}
                onChange={(e) => handleFilterChange(setSelectedProductId, e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 max-w-[180px] truncate"
                title="Filter by specific product"
              >
                <option value="all">All Products ({products.length})</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Category Selector */}
              <select
                value={selectedCategory}
                onChange={(e) => handleFilterChange(setSelectedCategory, e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                title="Filter by category"
              >
                <option value="all">All Categories</option>
                {productCategories.map(cat => (
                  <option key={cat} value={cat}>{getCategoryLabel(cat as any)}</option>
                ))}
              </select>

              {/* Date Presets */}
              <select
                value={datePreset}
                onChange={(e) => handleDatePreset(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                title="Quick date filter"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 Days</option>
                <option value="thisMonth">This Month</option>
                <option value="last30">Last 30 Days</option>
              </select>

              {/* Custom Date Pickers */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    handleFilterChange(setStartDate, e.target.value);
                  }}
                  className="bg-transparent text-[11px] text-slate-700 focus:outline-hidden cursor-pointer"
                  title="Start Date"
                />
                <span className="text-slate-400">➔</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    handleFilterChange(setEndDate, e.target.value);
                  }}
                  className="bg-transparent text-[11px] text-slate-700 focus:outline-hidden cursor-pointer"
                  title="End Date"
                />
              </div>

              {(searchQuery || selectedProductId !== 'all' || selectedCategory !== 'all' || selectedEventType !== 'all' || startDate || endDate) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                  title="Reset all filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Activity Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase tracking-wider mr-1">Activity Scope:</span>
            {[
              { id: 'all', label: 'All Activities', count: categoryCounts.all, icon: History },
              { id: 'price_change', label: 'Price Changes', count: categoryCounts.price_change, icon: Tag },
              { id: 'pos_sale', label: 'Sold (POS)', count: categoryCounts.pos_sale, icon: ShoppingCart },
              { id: 'purchase_stock_in', label: 'Stock-In / PO', count: categoryCounts.purchase_stock_in, icon: Truck },
              { id: 'stock_adjustment', label: 'Stock Adjustments', count: categoryCounts.stock_adjustment, icon: Sliders },
              { id: 'quarantine_damage', label: 'Quarantine / Loss', count: categoryCounts.quarantine_damage, icon: ShieldAlert },
              { id: 'sale_refund', label: 'Returns', count: categoryCounts.sale_refund, icon: RotateCcw },
              { id: 'physical_audit', label: 'Physical Audits', count: categoryCounts.physical_audit, icon: ClipboardCheck },
              { id: 'creation', label: 'Catalog Added', count: categoryCounts.creation, icon: Calendar },
            ].map(tab => {
              const isSelected = selectedEventType === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleFilterChange(setSelectedEventType, tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-indigo-500/50 text-white' : 'bg-slate-200 text-slate-700 font-semibold'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Master Log Table / Event Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {filteredTimeline.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
                <History className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Inventory Activities Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                No inventory log records matched your active search query or date range filters. Try resetting your filters.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedEvents.map(event => {
                const badge = getEventBadge(event.type);
                const BadgeIcon = badge.icon;
                const isPositive = event.quantityChange && event.quantityChange > 0;
                const isNegative = event.quantityChange && event.quantityChange < 0;

                const matchedProduct = products.find(p => p.id === event.productId);

                return (
                  <div
                    key={event.id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:border-indigo-200 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    {/* Left: Event Type Icon + Details */}
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border mt-0.5 ${badge.bg}`}>
                        <BadgeIcon className="w-5 h-5" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Tags and Product Name */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${badge.bg}`}>
                            {badge.label}
                          </span>

                          <strong className="text-sm font-bold text-slate-900 truncate">
                            {event.productName}
                          </strong>

                          {event.productBrand && (
                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.2 rounded-md">
                              {event.productBrand}
                            </span>
                          )}

                          {event.productCategory && (
                            <span className="text-[11px] text-slate-400">
                              • {getCategoryLabel(event.productCategory as any)}
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <p className="text-xs font-semibold text-slate-800">
                          {event.title}
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {event.details}
                        </p>

                        {/* Metadata row: Reference Doc, Performed By, IMEIs, SKU */}
                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400 font-mono pt-1">
                          {event.referenceDoc && (
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                              Doc: {event.referenceDoc}
                            </span>
                          )}

                          {event.productSku && (
                            <span>SKU: <strong className="text-slate-600">{event.productSku}</strong></span>
                          )}

                          {event.productBarcode && (
                            <span>Barcode: <strong className="text-slate-600">{event.productBarcode}</strong></span>
                          )}

                          <span className="flex items-center gap-1 text-slate-500">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{event.performedBy}</span>
                          </span>

                          {event.imeiAffected && event.imeiAffected.length > 0 && (
                            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded text-[10px]">
                              IMEI: {event.imeiAffected.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quantity Change, Price Impact, Timestamp & Actions */}
                    <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                      {/* Quantity or Price delta badge */}
                      <div className="text-right">
                        {event.quantityChange !== undefined && event.quantityChange !== 0 ? (
                          <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black border ${badge.impactColor}`}>
                            {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            <span>{isPositive ? `+${event.quantityChange}` : event.quantityChange} Units</span>
                          </div>
                        ) : event.priceDelta !== undefined ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-800 border border-rose-200">
                            <Tag className="w-3.5 h-3.5" />
                            <span>{event.priceDelta >= 0 ? `+${event.priceDelta.toLocaleString()}` : event.priceDelta.toLocaleString()} Ks</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-semibold px-2.5 py-1 bg-slate-100 rounded-xl">
                            Catalog Entry
                          </span>
                        )}

                        {event.sellingPrice !== undefined && event.sellingPrice > 0 && (
                          <div className="text-[11px] text-slate-500 font-mono mt-1">
                            Price: {formatCurrency(event.sellingPrice, settings.currencySymbol)}
                          </div>
                        )}
                      </div>

                      {/* Timestamp & Inspect Product Button */}
                      <div className="text-right space-y-1">
                        <span className="text-xs font-bold text-slate-800 block">
                          {formatDate(event.timestamp)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {matchedProduct && onOpenProductHistory && (
                          <button
                            type="button"
                            onClick={() => onOpenProductHistory(matchedProduct)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                            title="Open single product lifecycle history modal"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Item</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer & Pagination Controls */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 shrink-0 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Showing</span>
            <span className="font-bold text-slate-900">
              {filteredTimeline.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>
            <span>to</span>
            <span className="font-bold text-slate-900">
              {Math.min(currentPage * pageSize, filteredTimeline.length)}
            </span>
            <span>of</span>
            <span className="font-bold text-slate-900">{filteredTimeline.length}</span>
            <span>events</span>

            <span className="text-slate-300 mx-1">|</span>

            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="px-2 font-mono text-xs font-bold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
