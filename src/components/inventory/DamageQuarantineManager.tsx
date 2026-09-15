import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Search, 
  Filter, 
  Camera, 
  Upload, 
  DollarSign, 
  FileText, 
  Truck, 
  Trash2, 
  RotateCcw, 
  CheckCircle2, 
  Package, 
  Clock, 
  User, 
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Tag,
  Eye,
  ImageIcon,
  RefreshCw,
  Plus,
  Download,
  Printer,
  Barcode,
  Smartphone,
  Layers,
  X,
  Check,
  CheckCircle
} from 'lucide-react';
import { compressImageToBase64 } from '../../utils/imageCompression';
import { 
  DamageLog, 
  Product, 
  ShopSettings, 
  DamageReason, 
  DamageDispositionAction, 
  ItemInventoryStatus,
  Supplier,
  StaffUser,
  AppTab
} from '../../types';
import { 
  assessDamageLog, 
  executeDispositionRma, 
  executeDispositionWriteOff, 
  executeDispositionBStock 
} from '../../utils/damageManager';
import { StorageService } from '../../utils/storage';
import { formatCurrency, formatImei } from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { QuarantineReportModal } from './QuarantineReportModal';
import { CustomerErrorReturnModal } from './CustomerErrorReturnModal';

interface DamageQuarantineManagerProps {
  products: Product[];
  settings: ShopSettings;
  currentStaffUser?: StaffUser;
  onProductsUpdated?: (updatedProducts: Product[]) => void;
  onNavigateTab?: (tab: AppTab) => void;
  initialLogId?: string | null;
}

type TabFilter = 'all' | 'quarantine_needs_action' | 'pending_rma' | 'written_off' | 'b_stock';

export const DamageQuarantineManager: React.FC<DamageQuarantineManagerProps> = ({
  products,
  settings,
  currentStaffUser,
  onProductsUpdated,
  onNavigateTab,
  initialLogId,
}) => {
  const [logs, setLogs] = useState<DamageLog[]>(() => StorageService.getDamageLogs());
  const [selectedLogId, setSelectedLogId] = useState<string | null>(initialLogId || null);
  const [activeTab, setActiveTab] = useState<TabFilter>('quarantine_needs_action');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterReason, setFilterReason] = useState<string>('all');
  
  // Suppliers list for quick RMA supplier selection
  const suppliers: Supplier[] = useMemo(() => StorageService.getSuppliers(), []);

  // Modal for reporting new damage
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  // Modal for customer defective error item return
  const [isCustomerReturnModalOpen, setIsCustomerReturnModalOpen] = useState<boolean>(false);

  // Phase 2 Form State
  const [damageReason, setDamageReason] = useState<DamageReason>('Out-of-box failure');
  const [photoProof, setPhotoProof] = useState<string>('');
  const [assessmentNotes, setAssessmentNotes] = useState<string>('');
  const [assessedBy, setAssessedBy] = useState<string>(currentStaffUser?.name || 'Store Manager');

  // Phase 3 Action Panel State
  const [activeDispositionMode, setActiveDispositionMode] = useState<DamageDispositionAction | null>(null);

  // Resolution 1: RMA State
  const [rmaVendorName, setRmaVendorName] = useState<string>('');
  const [rmaVendorContact, setRmaVendorContact] = useState<string>('');
  const [rmaTrackingNumber, setRmaTrackingNumber] = useState<string>('');
  const [rmaNotes, setRmaNotes] = useState<string>('');

  // Resolution 2: Write-Off State
  const [scrapReason, setScrapReason] = useState<string>('Irreparable physical defect / internal hardware failure');
  const [scrapAuthorizedBy, setScrapAuthorizedBy] = useState<string>(currentStaffUser?.name || 'Store Manager');

  // Resolution 3: B-Stock State
  const [bStockPrice, setBStockPrice] = useState<string>('');
  const [bStockCondition, setBStockCondition] = useState<string>('Open-Box/Refurbished');
  const [bStockNotes, setBStockNotes] = useState<string>('Inspected & certified fully functional with minor cosmetic blemishes. Packaged with standard store accessories.');

  // Notification Toast
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Photo Lightbox Zoom Modal
  const [isPhotoZoomOpen, setIsPhotoZoomOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reload logs from storage
  const refreshLogs = () => {
    const latest = StorageService.getDamageLogs();
    setLogs(latest);
    if (selectedLogId) {
      const stillExists = latest.find(l => l.id === selectedLogId);
      if (!stillExists && latest.length > 0) {
        setSelectedLogId(latest[0].id);
      }
    } else if (latest.length > 0) {
      setSelectedLogId(latest[0].id);
    }
  };

  useEffect(() => {
    refreshLogs();
    if (initialLogId) {
      setSelectedLogId(initialLogId);
    }
  }, [initialLogId]);

  // Sync selected log to form fields
  const activeLog = useMemo(() => {
    return logs.find(l => l.id === selectedLogId) || null;
  }, [logs, selectedLogId]);

  useEffect(() => {
    if (activeLog) {
      setDamageReason(activeLog.damageReason || 'Out-of-box failure');
      setPhotoProof(activeLog.photoProof || '');
      setAssessmentNotes(activeLog.assessmentNotes || '');
      setAssessedBy(activeLog.assessedBy || currentStaffUser?.name || 'Store Manager');

      // Pre-fill RMA fields
      setRmaVendorName(activeLog.rmaVendorName || activeLog.brand || '');
      setRmaVendorContact(activeLog.rmaVendorContact || '');
      setRmaTrackingNumber(activeLog.rmaTrackingNumber || '');
      setRmaNotes(activeLog.rmaNotes || '');

      // Pre-fill B-Stock price if not set
      if (activeLog.bStockDiscountedPrice) {
        setBStockPrice(String(activeLog.bStockDiscountedPrice));
      } else {
        // Default to 15% discount off original price
        const discounted = Math.round((activeLog.originalSellingPrice * 0.85) / 1000) * 1000;
        setBStockPrice(String(discounted));
      }

      setBStockNotes(activeLog.bStockNotes || 'Inspected & certified fully functional with minor cosmetic blemishes. Packaged with standard store accessories.');
      setActiveDispositionMode(null);
      setStatusFeedback(null);
    }
  }, [activeLog, currentStaffUser]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Tab filter
      if (activeTab === 'quarantine_needs_action') {
        if (log.status !== 'Quarantined') return false;
      } else if (activeTab === 'pending_rma') {
        if (log.status !== 'Pending RMA') return false;
      } else if (activeTab === 'written_off') {
        if (log.status !== 'Written-Off') return false;
      } else if (activeTab === 'b_stock') {
        if (log.dispositionAction !== 'b_stock') return false;
      }

      // Reason filter
      if (filterReason !== 'all' && log.damageReason !== filterReason) {
        return false;
      }

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (log.logNumber || '').toLowerCase().includes(q) ||
        (log.productName || '').toLowerCase().includes(q) ||
        (log.serialOrImei && log.serialOrImei.toLowerCase().includes(q)) ||
        (log.brand && log.brand.toLowerCase().includes(q)) ||
        (log.subCategory && log.subCategory.toLowerCase().includes(q)) ||
        (log.reportedBy && log.reportedBy.toLowerCase().includes(q)) ||
        (log.quarantineNotes && log.quarantineNotes.toLowerCase().includes(q)) ||
        (log.customerName && log.customerName.toLowerCase().includes(q)) ||
        (log.customerPhone && log.customerPhone.toLowerCase().includes(q)) ||
        (log.originalInvoiceNumber && log.originalInvoiceNumber.toLowerCase().includes(q)) ||
        (log.rmaTrackingNumber && log.rmaTrackingNumber.toLowerCase().includes(q))
      );
    });
  }, [logs, activeTab, searchQuery, filterReason]);

  // Automatically select first item in filtered list if current selection is invalid
  useEffect(() => {
    if (filteredLogs.length > 0 && (!selectedLogId || !filteredLogs.some(l => l.id === selectedLogId))) {
      setSelectedLogId(filteredLogs[0].id);
    }
  }, [filteredLogs, selectedLogId]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const quarantinedLogs = logs.filter(l => l.status === 'Quarantined');
    const rmaLogs = logs.filter(l => l.status === 'Pending RMA');
    const writtenOffLogs = logs.filter(l => l.status === 'Written-Off');
    const bStockLogs = logs.filter(l => l.dispositionAction === 'b_stock');

    const totalQuarantinedCost = quarantinedLogs.reduce((sum, l) => sum + (l.costImpact || 0), 0);
    const totalRmaCost = rmaLogs.reduce((sum, l) => sum + (l.costImpact || 0), 0);
    const totalScrappedLoss = writtenOffLogs.reduce((sum, l) => sum + (l.costImpact || 0), 0);
    const totalBStockRecovery = bStockLogs.reduce((sum, l) => sum + (l.bStockDiscountedPrice || 0), 0);

    return {
      quarantinedCount: quarantinedLogs.length,
      quarantinedCost: totalQuarantinedCost,
      rmaCount: rmaLogs.length,
      rmaCost: totalRmaCost,
      writtenOffCount: writtenOffLogs.length,
      scrappedLoss: totalScrappedLoss,
      bStockCount: bStockLogs.length,
      bStockRecovery: totalBStockRecovery,
      totalLogs: logs.length
    };
  }, [logs]);

  // Handle Photo Proof Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatusFeedback({ type: 'error', message: 'Please select an image file (PNG, JPG, WEBP).' });
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setStatusFeedback({ type: 'error', message: 'Image size exceeds 4MB. Please upload a smaller photo.' });
      return;
    }

    try {
      const compressedData = await compressImageToBase64(file, { maxDimension: 1200, quality: 0.8 });
      setPhotoProof(compressedData);
      setStatusFeedback({ type: 'success', message: 'Damage photo proof compressed and attached successfully.' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to compress photo.' });
    }
  };

  // Phase 2: Save Assessment
  const handleSaveAssessment = () => {
    if (!activeLog) return;

    try {
      const result = assessDamageLog({
        logId: activeLog.id,
        damageReason,
        photoProof: photoProof || undefined,
        assessmentNotes,
        assessedBy: assessedBy.trim() || 'Store Manager',
      });

      if (!result.success) {
        setStatusFeedback({ type: 'error', message: result.error || 'Failed to save assessment.' });
        return;
      }

      setStatusFeedback({ 
        type: 'success', 
        message: `Assessment saved for ${activeLog.logNumber}. Ready for manager disposition.` 
      });
      refreshLogs();
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error saving assessment.' });
    }
  };

  // Phase 3: Execute RMA Return
  const handleExecuteRma = () => {
    if (!activeLog) return;
    if (!rmaVendorName.trim()) {
      setStatusFeedback({ type: 'error', message: 'Please specify the vendor or supplier for the RMA return.' });
      return;
    }

    try {
      const result = executeDispositionRma({
        logId: activeLog.id,
        vendorName: rmaVendorName.trim(),
        vendorContact: rmaVendorContact.trim() || undefined,
        rmaTrackingNumber: rmaTrackingNumber.trim() || undefined,
        rmaNotes: rmaNotes.trim() || undefined,
        resolvedBy: currentStaffUser?.name || 'Store Manager',
      });

      if (!result.success) {
        setStatusFeedback({ type: 'error', message: result.error || 'Failed to execute RMA disposition.' });
        return;
      }

      setStatusFeedback({
        type: 'success',
        message: `RMA initiated for ${activeLog.logNumber}. Item marked as Pending RMA with supplier.`
      });
      
      const freshProducts = StorageService.getProducts();
      onProductsUpdated?.(freshProducts);
      refreshLogs();
      setActiveDispositionMode(null);
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error processing RMA.' });
    }
  };

  // Phase 3: Execute Write-Off Scrap
  const handleExecuteWriteOff = () => {
    if (!activeLog) return;

    try {
      const result = executeDispositionWriteOff({
        logId: activeLog.id,
        scrapReason: scrapReason.trim() || 'Unsalvageable internal hardware damage',
        authorizedBy: scrapAuthorizedBy.trim() || 'Store Manager',
      });

      if (!result.success) {
        setStatusFeedback({ type: 'error', message: result.error || 'Failed to write off item.' });
        return;
      }

      setStatusFeedback({
        type: 'success',
        message: `${activeLog.logNumber} written-off. Capital loss of ${formatCurrency(activeLog.costImpact, settings.currencySymbol)} recognized as store expense.`
      });

      const freshProducts = StorageService.getProducts();
      onProductsUpdated?.(freshProducts);
      refreshLogs();
      setActiveDispositionMode(null);
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error writing off item.' });
    }
  };

  // Phase 3: Execute B-Stock Clearance
  const handleExecuteBStock = () => {
    if (!activeLog) return;
    const priceNum = parseFloat(bStockPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setStatusFeedback({ type: 'error', message: 'Please enter a valid discounted price for B-Stock resale.' });
      return;
    }

    try {
      const result = executeDispositionBStock({
        logId: activeLog.id,
        newDiscountedPrice: priceNum,
        bStockCondition: bStockCondition.trim() || 'Open-Box/Refurbished',
        bStockNotes: bStockNotes.trim() || undefined,
        resolvedBy: currentStaffUser?.name || 'Store Manager',
      });

      if (!result.success) {
        setStatusFeedback({ type: 'error', message: result.error || 'Failed to reclassify as B-Stock.' });
        return;
      }

      setStatusFeedback({
        type: 'success',
        message: `${activeLog.logNumber} reclassified as B-Stock and restored to POS inventory at ${formatCurrency(priceNum, settings.currencySymbol)}.`
      });

      const freshProducts = StorageService.getProducts();
      onProductsUpdated?.(freshProducts);
      refreshLogs();
      setActiveDispositionMode(null);
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error reclassifying item.' });
    }
  };

  // Export Damage Audit Log to CSV
  const handleExportCsv = () => {
    const headers = [
      'Log Number',
      'Phase',
      'Status',
      'Product Name',
      'Brand',
      'Model',
      'Serial / IMEI',
      'Damage Reason',
      'Quarantine Date',
      'Reported By',
      'Unit Acquisition Cost',
      'Original Selling Price',
      'Disposition Action',
      'RMA Tracking Number',
      'RMA Vendor',
      'B-Stock Price',
      'Resolved Date',
      'Resolved By',
      'Notes'
    ];

    const rows = logs.map(l => [
      l.logNumber,
      l.phase,
      l.status,
      l.productName,
      l.brand || '',
      l.subCategory || '',
      l.serialOrImei || '',
      l.damageReason || '',
      new Date(l.reportedAt).toLocaleDateString(),
      l.reportedBy,
      l.costImpact || 0,
      l.originalSellingPrice || 0,
      l.dispositionAction || 'None',
      l.rmaTrackingNumber || '',
      l.rmaVendorName || '',
      l.bStockDiscountedPrice || '',
      l.dispositionDate ? new Date(l.dispositionDate).toLocaleDateString() : '',
      l.dispositionBy || '',
      l.quarantineNotes || l.assessmentNotes || ''
    ]);

    exportToCsv('damage_quarantine_audit', headers, rows);
  };

  return (
    <div id="damage-quarantine-module" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                    Inventory & Supply
                  </span>
                  <span className="text-xs text-slate-500 font-medium">3-Phase RMA & Loss Control System</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  Damage Quarantine & RMA Disposition Hub
                </h1>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
              Phase 1: Defect Isolation from POS → Phase 2: Manager Defect Assessment with Photo Proof → Phase 3: Vendor RMA Return, Scrap Write-Off, or B-Stock Reclassification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              id="customer-error-return-btn"
              onClick={() => setIsCustomerReturnModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              title="Process error item return from customer with stock replacement or vendor RMA"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Customer Error Return</span>
            </button>

            <button
              type="button"
              id="report-new-damage-btn"
              onClick={() => setIsReportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Report Damaged Item</span>
            </button>

            <button
              type="button"
              id="export-damage-csv-btn"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
              title="Export complete Damage & RMA audit ledger to CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Export Audit CSV</span>
            </button>

            <button
              type="button"
              onClick={refreshLogs}
              className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              title="Refresh logs from database"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Quarantined */}
        <div 
          onClick={() => setActiveTab('quarantine_needs_action')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'quarantine_needs_action' 
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 font-semibold text-xs mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Quarantined in Stock
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-700">{metrics.quarantinedCount} units</p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Capital Locked:</span>
            <span className="font-bold text-slate-800">{formatCurrency(metrics.quarantinedCost, settings.currencySymbol)}</span>
          </div>
        </div>

        {/* Metric 2: Pending RMA */}
        <div 
          onClick={() => setActiveTab('pending_rma')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'pending_rma' 
              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 font-semibold text-xs mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Pending Vendor RMA
            </span>
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-700">{metrics.rmaCount} units</p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Supplier Credit Pending:</span>
            <span className="font-bold text-slate-800">{formatCurrency(metrics.rmaCost, settings.currencySymbol)}</span>
          </div>
        </div>

        {/* Metric 3: Written-Off Loss */}
        <div 
          onClick={() => setActiveTab('written_off')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'written_off' 
              ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-400/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:border-rose-200 hover:bg-rose-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 font-semibold text-xs mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Scrapped / Written-Off
            </span>
            <Trash2 className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-700">{metrics.writtenOffCount} units</p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Total Expense Loss:</span>
            <span className="font-bold text-rose-800">{formatCurrency(metrics.scrappedLoss, settings.currencySymbol)}</span>
          </div>
        </div>

        {/* Metric 4: B-Stock Recovered */}
        <div 
          onClick={() => setActiveTab('b_stock')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'b_stock' 
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/20 shadow-sm' 
              : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 font-semibold text-xs mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              B-Stock / Clearance
            </span>
            <Tag className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700">{metrics.bStockCount} units</p>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
            <span>Restored Resale Value:</span>
            <span className="font-bold text-emerald-800">{formatCurrency(metrics.bStockRecovery, settings.currencySymbol)}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('quarantine_needs_action')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'quarantine_needs_action'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Needs Review</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'quarantine_needs_action' ? 'bg-amber-800 text-amber-100' : 'bg-amber-200 text-amber-900'
              }`}>
                {metrics.quarantinedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending_rma')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pending_rma'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Pending RMA</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'pending_rma' ? 'bg-blue-800 text-blue-100' : 'bg-blue-200 text-blue-900'
              }`}>
                {metrics.rmaCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('written_off')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'written_off'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Written-Off Scrap</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'written_off' ? 'bg-rose-800 text-rose-100' : 'bg-rose-200 text-rose-900'
              }`}>
                {metrics.writtenOffCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('b_stock')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'b_stock'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>B-Stock Clearance</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'b_stock' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-200 text-emerald-900'
              }`}>
                {metrics.bStockCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>All History</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'all' ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'
              }`}>
                {metrics.totalLogs}
              </span>
            </button>
          </div>

          {/* Quick jump to general Inventory */}
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Back to General Inventory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search & Reason Filter Input */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Log #, product name, IMEI / Serial, brand, or reported notes..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="w-full sm:w-60">
            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
            >
              <option value="all">All Defect Reasons</option>
              <option value="Out-of-box failure">Out-of-box failure</option>
              <option value="Screen cracked / Display defect">Screen / Display defect</option>
              <option value="Water / Liquid damage">Water / Liquid damage</option>
              <option value="Customer return defect">Customer return defect</option>
              <option value="Transit / Delivery damage">Transit / Delivery damage</option>
              <option value="Cosmetic blemish / Scratches">Cosmetic blemish</option>
              <option value="Battery defect / Swelling">Battery defect / Swelling</option>
              <option value="Motherboard / Power failure">Motherboard / Power failure</option>
              <option value="Other">Other Reasons</option>
            </select>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {statusFeedback && (
        <div 
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            statusFeedback.type === 'success' 
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusFeedback.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusFeedback(null)}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Dual-Column Workbench Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Damaged Items Queue List (5 columns on desktop) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Item Queue ({filteredLogs.length})
            </span>
            <span className="text-[11px] text-slate-400">Click an item to inspect</span>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">No damaged items found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {searchQuery 
                    ? 'No records match your search query.' 
                    : 'There are currently no items matching this filter status.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-600" />
                <span>Report Damaged Item</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
              {filteredLogs.map((log) => {
                const isSelected = log.id === selectedLogId;

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-400 shadow-sm ring-2 ring-amber-400/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[11px] font-black text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {log.logNumber}
                      </span>

                      {/* Status Chip */}
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        log.status === 'Quarantined' 
                          ? 'bg-amber-100 text-amber-800 border-amber-200' 
                          : log.status === 'Pending RMA'
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : log.status === 'Written-Off'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}>
                        {log.status}
                      </span>
                    </div>

                    {/* Product Name */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                        {log.productName}
                      </h4>
                      {log.isCustomerReturn && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                          <RotateCcw className="w-2.5 h-2.5" />
                          Customer Return
                        </span>
                      )}
                    </div>

                    {/* Serial / IMEI or SKU */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                      {log.serialOrImei ? (
                        <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-bold">
                          IMEI: {formatImei(log.serialOrImei)}
                        </span>
                      ) : (
                        <span className="text-slate-400">General Stock (Qty: 1)</span>
                      )}
                      {log.brand && (
                        <span className="text-slate-400">• {log.brand}</span>
                      )}
                    </div>

                    {/* Footer Row: Cost Impact & Phase */}
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="text-slate-400">Cost:</span>
                        <span className="font-black text-slate-900">
                          {formatCurrency(log.costImpact, settings.currencySymbol)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {log.photoProof && (
                          <span className="p-1 rounded bg-slate-100 text-slate-600" title="Photo proof attached">
                            <ImageIcon className="w-3 h-3 text-indigo-500" />
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          log.phase === 'quarantine' 
                            ? 'bg-amber-100/60 text-amber-700' 
                            : log.phase === 'assessment'
                            ? 'bg-indigo-100/60 text-indigo-700'
                            : 'bg-emerald-100/60 text-emerald-700'
                        }`}>
                          {log.phase === 'quarantine' ? 'P1: Isolated' : log.phase === 'assessment' ? 'P2: Assessed' : 'P3: Resolved'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detailed Item Assessment & Disposition Console (7 columns on desktop) */}
        <div className="lg:col-span-7">
          {activeLog ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {/* Active Log Header */}
              <div className="p-5 sm:p-6 bg-slate-900 text-white border-b border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                        {activeLog.logNumber}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        activeLog.status === 'Quarantined'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : activeLog.status === 'Pending RMA'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : activeLog.status === 'Written-Off'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {activeLog.status}
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-white">{activeLog.productName}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeLog.brand || 'Brand Device'} {activeLog.subCategory ? `• ${activeLog.subCategory}` : ''}
                    </p>
                  </div>

                  <div className="text-left sm:text-right bg-slate-800/80 p-3 rounded-xl border border-slate-700/80">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Unit Acquisition Cost</span>
                    <span className="text-base font-black text-amber-400">
                      {formatCurrency(activeLog.costImpact, settings.currencySymbol)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Retail: {formatCurrency(activeLog.originalSellingPrice, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* 3-Phase Interactive Visual Stepper */}
                <div className="mt-6 pt-5 border-t border-slate-800/80">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {/* Phase 1: Isolation */}
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-xs shadow-xs mb-1">
                        <Check className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-white text-[11px]">Phase 1</span>
                      <span className="text-[10px] text-slate-400">POS Isolation</span>
                    </div>

                    {/* Phase 2: Assessment */}
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-xs mb-1 ${
                        activeLog.phase === 'assessment' || activeLog.phase === 'disposed'
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {activeLog.phase === 'disposed' ? <Check className="w-4 h-4" /> : '2'}
                      </div>
                      <span className={`font-bold text-[11px] ${
                        activeLog.phase === 'assessment' || activeLog.phase === 'disposed' ? 'text-white' : 'text-slate-400'
                      }`}>Phase 2</span>
                      <span className="text-[10px] text-slate-400">Manager Assessment</span>
                    </div>

                    {/* Phase 3: Final Disposition */}
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-xs mb-1 ${
                        activeLog.phase === 'disposed'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {activeLog.phase === 'disposed' ? <Check className="w-4 h-4" /> : '3'}
                      </div>
                      <span className={`font-bold text-[11px] ${
                        activeLog.phase === 'disposed' ? 'text-white' : 'text-slate-400'
                      }`}>Phase 3</span>
                      <span className="text-[10px] text-slate-400">RMA / Scrap / B-Stock</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Console Body */}
              <div className="p-5 sm:p-6 space-y-6">
                
                {/* Phase 1 Section: Isolation Details */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Phase 1: Quarantine Isolation Record
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Isolated on {new Date(activeLog.reportedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-slate-600">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Reported By Staff:</span>
                      <span className="font-bold text-slate-800">{activeLog.reportedBy}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Device Identifier:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeLog.serialOrImei ? `IMEI: ${activeLog.serialOrImei}` : 'Non-serialized inventory'}
                      </span>
                    </div>
                  </div>

                  {activeLog.quarantineNotes && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] text-slate-400 block">Initial Triage Notes:</span>
                      <p className="text-slate-700 italic mt-0.5">{activeLog.quarantineNotes}</p>
                    </div>
                  )}

                  {activeLog.isCustomerReturn && (
                    <div className="pt-2 border-t border-indigo-100 bg-indigo-50/70 p-3 rounded-xl border border-indigo-200/80 text-indigo-950 space-y-2">
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span className="flex items-center gap-1.5 text-indigo-800">
                          <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Customer Defective Return Intake</span>
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold">
                          {activeLog.returnExchangeType === 'replace_from_stock' ? 'Option 1: Exchanged from Stock' : 'Option 2: Routed for Vendor RMA'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Customer:</span>
                          <span className="font-bold text-slate-800">{activeLog.customerName || 'N/A'} {activeLog.customerPhone ? `(${activeLog.customerPhone})` : ''}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Original Invoice #:</span>
                          <span className="font-bold font-mono text-slate-800">{activeLog.originalInvoiceNumber || 'N/A'}</span>
                        </div>
                        {activeLog.replacementSerialOrImei && (
                          <div className="col-span-1 sm:col-span-2 pt-1 border-t border-indigo-200/50">
                            <span className="text-slate-500 block text-[10px]">Issued Replacement Unit IMEI to Customer:</span>
                            <span className="font-bold font-mono text-emerald-700">{formatImei(activeLog.replacementSerialOrImei)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-2 rounded-lg bg-amber-100/50 border border-amber-200/60 text-amber-900 text-[11px] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Item is isolated from POS checkout. Cashiers cannot add this unit to cart.</span>
                  </div>
                </div>

                {/* Phase 2 Section: Manager Technical Assessment */}
                <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      Phase 2: Technical Defect Assessment
                    </span>
                    {activeLog.phase !== 'quarantine' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Assessed by {activeLog.assessedBy || 'Manager'}
                      </span>
                    )}
                  </div>

                  {/* Defect Category */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Defect Classification
                    </label>
                    <select
                      value={damageReason}
                      onChange={(e) => setDamageReason(e.target.value as DamageReason)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="Out-of-box failure">Out-of-box failure</option>
                      <option value="Screen cracked / Display defect">Screen cracked / Display defect</option>
                      <option value="Water / Liquid damage">Water / Liquid damage</option>
                      <option value="Customer return defect">Customer return defect</option>
                      <option value="Transit / Delivery damage">Transit / Delivery damage</option>
                      <option value="Cosmetic blemish / Scratches">Cosmetic blemish / Scratches</option>
                      <option value="Battery defect / Swelling">Battery defect / Swelling</option>
                      <option value="Motherboard / Power failure">Motherboard / Power failure</option>
                      <option value="Other">Other Uncategorized Defect</option>
                    </select>
                  </div>

                  {/* Photographic Proof Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5 text-slate-500" />
                        <span>Defect Photographic Proof</span>
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{photoProof ? 'Replace Photo' : 'Attach Photo Proof'}</span>
                      </button>
                    </div>

                    {photoProof ? (
                      <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
                        <img
                          src={photoProof}
                          alt="Defect proof"
                          className="w-full max-h-48 object-contain rounded-lg cursor-pointer bg-slate-900"
                          onClick={() => setIsPhotoZoomOpen(true)}
                        />
                        <div className="absolute top-3 right-3 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsPhotoZoomOpen(true)}
                            className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                            title="Zoom photo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhotoProof('')}
                            className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                            title="Remove photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-indigo-50/20"
                      >
                        <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                        <span className="text-xs text-slate-600 font-medium block">Upload or take photo proof of hardware defect</span>
                        <span className="text-[10px] text-slate-400">Supports JPG, PNG up to 4MB</span>
                      </div>
                    )}
                  </div>

                  {/* Assessment Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Technical Assessment Findings & Notes
                    </label>
                    <textarea
                      rows={2}
                      value={assessmentNotes}
                      onChange={(e) => setAssessmentNotes(e.target.value)}
                      placeholder="Describe technician inspection findings, component status, and recommendation..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">
                      Assessor: <strong className="text-slate-700">{assessedBy}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveAssessment}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Technical Assessment</span>
                    </button>
                  </div>
                </div>

                {/* Phase 3 Section: Three Final Disposition Paths */}
                <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-emerald-600" />
                      Phase 3: Manager Final Disposition
                    </span>
                    {activeLog.dispositionAction && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Resolved: {(activeLog.dispositionAction || '').toUpperCase()}
                      </span>
                    )}
                  </div>

                  {activeLog.dispositionAction ? (
                    <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Resolution Executed on {activeLog.dispositionDate ? new Date(activeLog.dispositionDate).toLocaleDateString() : 'N/A'}</span>
                      </div>
                      <div className="text-slate-700 space-y-1 pt-1">
                        {activeLog.dispositionAction === 'rma' && (
                          <>
                            <p><strong>Vendor / Supplier:</strong> {activeLog.rmaVendorName}</p>
                            {activeLog.rmaTrackingNumber && <p><strong>RMA Tracking #:</strong> {activeLog.rmaTrackingNumber}</p>}
                            {activeLog.rmaNotes && <p><strong>RMA Notes:</strong> {activeLog.rmaNotes}</p>}
                          </>
                        )}
                        {activeLog.dispositionAction === 'write_off' && (
                          <>
                            <p><strong>Scrap Reason:</strong> {activeLog.scrapReason || 'Hardware loss written off'}</p>
                            <p><strong>Financial Loss Recognized:</strong> {formatCurrency(activeLog.costImpact, settings.currencySymbol)}</p>
                          </>
                        )}
                        {activeLog.dispositionAction === 'b_stock' && (
                          <>
                            <p><strong>Discounted Resale Price:</strong> {formatCurrency(activeLog.bStockDiscountedPrice || 0, settings.currencySymbol)}</p>
                            <p><strong>Condition Grade:</strong> {activeLog.bStockCondition || 'Open-Box'}</p>
                          </>
                        )}
                        <p className="text-[11px] text-slate-500">Authorized by: {activeLog.dispositionBy || 'Manager'}</p>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveDispositionMode('rma')}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                        >
                          Modify or Re-evaluate Disposition Paths
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-600">
                        Choose one of the three resolution paths below to conclude the triage process for this quarantined item:
                      </p>

                      {/* 3 Path Choice Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Path 1: Vendor RMA */}
                        <div
                          onClick={() => setActiveDispositionMode(activeDispositionMode === 'rma' ? null : 'rma')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            activeDispositionMode === 'rma'
                              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20 shadow-xs'
                              : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                          }`}
                        >
                          <div className="p-2 rounded-lg bg-blue-100 text-blue-700 w-fit mb-2">
                            <Truck className="w-4 h-4" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-900">1. Return to Vendor (RMA)</h4>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Ship back to supplier for warranty replacement or credit note.
                          </p>
                        </div>

                        {/* Path 2: Write-Off Scrap */}
                        <div
                          onClick={() => setActiveDispositionMode(activeDispositionMode === 'write_off' ? null : 'write_off')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            activeDispositionMode === 'write_off'
                              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/20 shadow-xs'
                              : 'bg-slate-50 border-slate-200 hover:border-rose-300 hover:bg-rose-50/30'
                          }`}
                        >
                          <div className="p-2 rounded-lg bg-rose-100 text-rose-700 w-fit mb-2">
                            <Trash2 className="w-4 h-4" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-900">2. Write-Off & Scrap</h4>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Unsalvageable defect. Recognize loss as operating expense.
                          </p>
                        </div>

                        {/* Path 3: B-Stock Clearance */}
                        <div
                          onClick={() => setActiveDispositionMode(activeDispositionMode === 'b_stock' ? null : 'b_stock')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            activeDispositionMode === 'b_stock'
                              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20 shadow-xs'
                              : 'bg-slate-50 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                          }`}
                        >
                          <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 w-fit mb-2">
                            <Tag className="w-4 h-4" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-900">3. B-Stock Clearance</h4>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Recondition & restore to POS at discounted selling price.
                          </p>
                        </div>
                      </div>

                      {/* Path 1 Active Form: RMA */}
                      {activeDispositionMode === 'rma' && (
                        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3 animate-in fade-in duration-150">
                          <h4 className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-blue-600" />
                            <span>Vendor RMA Shipping & Return Dispatch</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Supplier / Vendor Name *
                              </label>
                              {suppliers.length > 0 ? (
                                <div className="space-y-1">
                                  <select
                                    value={rmaVendorName}
                                    onChange={(e) => {
                                      setRmaVendorName(e.target.value);
                                      const matched = suppliers.find(s => s.name === e.target.value);
                                      if (matched?.phone) setRmaVendorContact(matched.phone);
                                    }}
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                                  >
                                    <option value="">Select Supplier from CRM...</option>
                                    {suppliers.map(s => (
                                      <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={rmaVendorName}
                                    onChange={(e) => setRmaVendorName(e.target.value)}
                                    placeholder="Or type custom vendor name"
                                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                  />
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={rmaVendorName}
                                  onChange={(e) => setRmaVendorName(e.target.value)}
                                  placeholder="e.g. Official Samsung Distributor"
                                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                />
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Vendor Contact / Representative
                              </label>
                              <input
                                type="text"
                                value={rmaVendorContact}
                                onChange={(e) => setRmaVendorContact(e.target.value)}
                                placeholder="Phone number or contact person"
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                RMA Number / Courier Tracking #
                              </label>
                              <input
                                type="text"
                                value={rmaTrackingNumber}
                                onChange={(e) => setRmaTrackingNumber(e.target.value)}
                                placeholder="e.g. RMA-998231 / Waybill #5501"
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Dispatch Notes
                              </label>
                              <input
                                type="text"
                                value={rmaNotes}
                                onChange={(e) => setRmaNotes(e.target.value)}
                                placeholder="Shipped via Royal Express, expecting replacement in 7 days"
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                              />
                            </div>
                          </div>

                          <div className="pt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveDispositionMode(null)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleExecuteRma}
                              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Execute RMA Return</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Path 2 Active Form: Write-Off Scrap */}
                      {activeDispositionMode === 'write_off' && (
                        <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 space-y-3 animate-in fade-in duration-150">
                          <h4 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                            <Trash2 className="w-4 h-4 text-rose-600" />
                            <span>Confirm Write-Off & Capital Loss Recognition</span>
                          </h4>

                          <p className="text-xs text-rose-800">
                            Warning: Writing off this item permanently removes it from inventory. An operational loss expense of <strong>{formatCurrency(activeLog.costImpact, settings.currencySymbol)}</strong> will be booked automatically.
                          </p>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Scrap Justification & Destruction Reason
                            </label>
                            <input
                              type="text"
                              value={scrapReason}
                              onChange={(e) => setScrapReason(e.target.value)}
                              placeholder="e.g. Beyond economical repair / crushed in transit"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                            />
                          </div>

                          <div className="pt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveDispositionMode(null)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleExecuteWriteOff}
                              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Execute Write-Off & Scrap</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Path 3 Active Form: B-Stock */}
                      {activeDispositionMode === 'b_stock' && (
                        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3 animate-in fade-in duration-150">
                          <h4 className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                            <Tag className="w-4 h-4 text-emerald-600" />
                            <span>Reclassify as B-Stock & Restore to POS</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Discounted Selling Price * ({settings.currencySymbol})
                              </label>
                              <input
                                type="number"
                                value={bStockPrice}
                                onChange={(e) => setBStockPrice(e.target.value)}
                                placeholder="e.g. 850000"
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-emerald-700"
                              />
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Original: {formatCurrency(activeLog.originalSellingPrice, settings.currencySymbol)} | Cost: {formatCurrency(activeLog.costImpact, settings.currencySymbol)}
                              </span>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Condition Grade
                              </label>
                              <select
                                value={bStockCondition}
                                onChange={(e) => setBStockCondition(e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                <option value="Open-Box/Refurbished">Open-Box / Refurbished</option>
                                <option value="Minor Cosmetic Scratches (Grade A)">Minor Scratches (Grade A)</option>
                                <option value="Certified Repaired (Grade B)">Certified Repaired (Grade B)</option>
                                <option value="Clearance Clearance As-Is">Clearance / As-Is</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Customer Warranty & B-Stock Notes
                            </label>
                            <input
                              type="text"
                              value={bStockNotes}
                              onChange={(e) => setBStockNotes(e.target.value)}
                              placeholder="Notes shown on invoice / inventory card"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                            />
                          </div>

                          <div className="pt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveDispositionMode(null)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleExecuteBStock}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Restore to POS as B-Stock</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-2xs">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-black text-slate-900">Select an Item from the Queue</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose a quarantined or RMA item from the queue on the left to inspect defect details, attach photo proof, and apply final dispositions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Report Damaged Item</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal: Report New Damage */}
      {isReportModalOpen && (
        <QuarantineReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          products={products}
          settings={settings}
          onSuccess={(updatedProduct) => {
            setIsReportModalOpen(false);
            const freshProducts = StorageService.getProducts();
            onProductsUpdated?.(freshProducts);
            refreshLogs();
            setStatusFeedback({
              type: 'success',
              message: `Item successfully isolated to quarantine. Removed from sellable POS stock.`
            });
          }}
          onOpenManagerReview={(logId) => {
            setIsReportModalOpen(false);
            refreshLogs();
            setSelectedLogId(logId);
            setActiveTab('quarantine_needs_action');
          }}
        />
      )}

      {/* Modal: Customer Error Item Return & Exchange / Vendor RMA */}
      {isCustomerReturnModalOpen && (
        <CustomerErrorReturnModal
          isOpen={isCustomerReturnModalOpen}
          onClose={() => setIsCustomerReturnModalOpen(false)}
          products={products}
          settings={settings}
          currentStaffUser={currentStaffUser}
          onSuccess={(newLog, updatedProduct) => {
            refreshLogs();
            setSelectedLogId(newLog.id);
            setActiveTab('quarantine_needs_action');
            const freshProducts = StorageService.getProducts();
            onProductsUpdated?.(freshProducts);
            setStatusFeedback({
              type: 'success',
              message: `Customer return recorded successfully (Log #${newLog.logNumber}). Unit isolated in Quarantine.`
            });
          }}
        />
      )}

      {/* Modal: Photo Zoom Lightbox */}
      {isPhotoZoomOpen && photoProof && (
        <div 
          onClick={() => setIsPhotoZoomOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img 
              src={photoProof} 
              alt="Zoomed defect proof" 
              className="max-w-full max-h-[90vh] object-contain rounded-2xl"
            />
            <button
              type="button"
              onClick={() => setIsPhotoZoomOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
