import React, { useState, useMemo, useRef } from 'react';
import { 
  ShieldAlert, 
  X, 
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
  AlertTriangle, 
  Package, 
  Clock, 
  User, 
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Tag,
  Eye,
  ImageIcon,
  RefreshCw
} from 'lucide-react';
import { compressImageToBase64 } from '../../utils/imageCompression';
import { 
  DamageLog, 
  Product, 
  ShopSettings, 
  DamageReason, 
  DamageDispositionAction, 
  ItemInventoryStatus,
  Supplier
} from '../../types';
import { 
  assessDamageLog, 
  executeDispositionRma, 
  executeDispositionWriteOff, 
  executeDispositionBStock 
} from '../../utils/damageManager';
import { StorageService } from '../../utils/storage';
import { formatCurrency } from '../../utils/formatters';

interface QuarantineManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: ShopSettings;
  initialSelectedLogId?: string | null;
  onDataChanged: () => void;
}

type TabFilter = 'all' | 'quarantine_needs_action' | 'pending_rma' | 'written_off' | 'b_stock';

export const QuarantineManagerModal: React.FC<QuarantineManagerModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  initialSelectedLogId,
  onDataChanged,
}) => {
  const [logs, setLogs] = useState<DamageLog[]>(() => StorageService.getDamageLogs());
  const [selectedLogId, setSelectedLogId] = useState<string | null>(initialSelectedLogId || null);
  const [activeTab, setActiveTab] = useState<TabFilter>('quarantine_needs_action');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Suppliers list for quick RMA supplier selection
  const suppliers: Supplier[] = useMemo(() => StorageService.getSuppliers(), []);

  // Phase 2 Form State
  const [damageReason, setDamageReason] = useState<DamageReason>('Out-of-box failure');
  const [photoProof, setPhotoProof] = useState<string>('');
  const [assessmentNotes, setAssessmentNotes] = useState<string>('');
  const [assessedBy, setAssessedBy] = useState<string>('Store Manager');

  // Phase 3 Action Panel State
  const [activeDispositionMode, setActiveDispositionMode] = useState<DamageDispositionAction | null>(null);

  // Resolution 1: RMA State
  const [rmaVendorName, setRmaVendorName] = useState<string>('');
  const [rmaVendorContact, setRmaVendorContact] = useState<string>('');
  const [rmaTrackingNumber, setRmaTrackingNumber] = useState<string>('');
  const [rmaNotes, setRmaNotes] = useState<string>('');

  // Resolution 2: Write-Off State
  const [scrapReason, setScrapReason] = useState<string>('Irreparable physical defect / internal hardware failure');
  const [scrapAuthorizedBy, setScrapAuthorizedBy] = useState<string>('Store Manager');

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

  // Reload logs when opened or triggered
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

  React.useEffect(() => {
    if (isOpen) {
      refreshLogs();
      if (initialSelectedLogId) {
        setSelectedLogId(initialSelectedLogId);
      }
    }
  }, [isOpen, initialSelectedLogId]);

  // Sync selected log to form fields
  const activeLog = useMemo(() => {
    return logs.find(l => l.id === selectedLogId) || null;
  }, [logs, selectedLogId]);

  React.useEffect(() => {
    if (activeLog) {
      setDamageReason(activeLog.damageReason || 'Out-of-box failure');
      setPhotoProof(activeLog.photoProof || '');
      setAssessmentNotes(activeLog.assessmentNotes || '');
      setAssessedBy(activeLog.assessedBy || 'Store Manager');

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
  }, [activeLog]);

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

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        log.logNumber.toLowerCase().includes(q) ||
        log.productName.toLowerCase().includes(q) ||
        log.sku.toLowerCase().includes(q) ||
        log.barcode.toLowerCase().includes(q) ||
        (log.serialOrImei && log.serialOrImei.toLowerCase().includes(q)) ||
        (log.damageReason && log.damageReason.toLowerCase().includes(q)) ||
        (log.reportedBy && log.reportedBy.toLowerCase().includes(q))
      );
    });
  }, [logs, activeTab, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const quarantinedLogs = logs.filter(l => l.status === 'Quarantined');
    const rmaLogs = logs.filter(l => l.status === 'Pending RMA');
    const writtenOffLogs = logs.filter(l => l.status === 'Written-Off');
    const bStockLogs = logs.filter(l => l.dispositionAction === 'b_stock');

    const totalQuarantinedCost = quarantinedLogs.reduce((sum, l) => sum + (l.costImpact || 0), 0);
    const totalScrappedLoss = writtenOffLogs.reduce((sum, l) => sum + (l.lossRecordedAmount || l.costImpact || 0), 0);

    return {
      quarantinedCount: quarantinedLogs.length,
      quarantinedCost: totalQuarantinedCost,
      rmaCount: rmaLogs.length,
      writtenOffCount: writtenOffLogs.length,
      scrappedLoss: totalScrappedLoss,
      bStockCount: bStockLogs.length,
    };
  }, [logs]);

  if (!isOpen) return null;

  // Handle Photo Proof File Upload (with client-side image compression to Base64)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatusFeedback({ type: 'error', message: 'Please upload an image file (PNG, JPG, WEBP).' });
      return;
    }

    try {
      const compressedDataUrl = await compressImageToBase64(file, { maxDimension: 800, quality: 0.75 });
      setPhotoProof(compressedDataUrl);
      setStatusFeedback({ type: 'success', message: 'Photo proof compressed and attached successfully.' });
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err?.message || 'Failed to compress photo proof.' });
    }
  };

  // Phase 2: Save Assessment
  const handleSaveAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLog) return;

    const result = assessDamageLog({
      logId: activeLog.id,
      damageReason,
      photoProof: photoProof.trim() || undefined,
      assessmentNotes: assessmentNotes.trim(),
      assessedBy: assessedBy.trim() || 'Store Manager',
    });

    if (result.success) {
      setStatusFeedback({ type: 'success', message: 'Manager Assessment logged successfully (Phase 2 saved).' });
      refreshLogs();
      onDataChanged();
    } else {
      setStatusFeedback({ type: 'error', message: result.error || 'Failed to save assessment.' });
    }
  };

  // Phase 3: Action 1 - Return to Vendor (RMA)
  const handleConfirmRma = () => {
    if (!activeLog) return;
    if (!rmaVendorName.trim()) {
      setStatusFeedback({ type: 'error', message: 'Vendor name is required for RMA return.' });
      return;
    }

    // Auto-save assessment if not saved yet
    assessDamageLog({
      logId: activeLog.id,
      damageReason,
      photoProof: photoProof.trim() || undefined,
      assessmentNotes: assessmentNotes.trim(),
      assessedBy: assessedBy.trim() || 'Store Manager',
    });

    const result = executeDispositionRma({
      logId: activeLog.id,
      vendorName: rmaVendorName.trim(),
      vendorContact: rmaVendorContact.trim(),
      rmaTrackingNumber: rmaTrackingNumber.trim(),
      rmaNotes: rmaNotes.trim(),
      resolvedBy: assessedBy.trim() || 'Store Manager',
    });

    if (result.success) {
      setStatusFeedback({
        type: 'success',
        message: `Disposition Confirmed: Status changed to "Pending RMA" for vendor ${rmaVendorName}.`,
      });
      setActiveDispositionMode(null);
      refreshLogs();
      onDataChanged();
    } else {
      setStatusFeedback({ type: 'error', message: result.error || 'Failed to process RMA.' });
    }
  };

  // Phase 3: Action 2 - Write-Off (Scrap)
  const handleConfirmWriteOff = () => {
    if (!activeLog) return;

    // Auto-save assessment
    assessDamageLog({
      logId: activeLog.id,
      damageReason,
      photoProof: photoProof.trim() || undefined,
      assessmentNotes: assessmentNotes.trim(),
      assessedBy: assessedBy.trim() || 'Store Manager',
    });

    const result = executeDispositionWriteOff({
      logId: activeLog.id,
      scrapReason: scrapReason.trim(),
      authorizedBy: scrapAuthorizedBy.trim() || 'Store Manager',
    });

    if (result.success) {
      setStatusFeedback({
        type: 'success',
        message: `Disposition Confirmed: Unit permanently written-off and financial loss of ${formatCurrency(activeLog.costImpact, settings.currencySymbol)} recorded in expenses.`,
      });
      setActiveDispositionMode(null);
      refreshLogs();
      onDataChanged();
    } else {
      setStatusFeedback({ type: 'error', message: result.error || 'Failed to process Write-Off.' });
    }
  };

  // Phase 3: Action 3 - Move to B-Stock
  const handleConfirmBStock = () => {
    if (!activeLog) return;
    const priceNum = parseFloat(bStockPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setStatusFeedback({ type: 'error', message: 'Please enter a valid discounted price greater than 0.' });
      return;
    }

    // Auto-save assessment
    assessDamageLog({
      logId: activeLog.id,
      damageReason,
      photoProof: photoProof.trim() || undefined,
      assessmentNotes: assessmentNotes.trim(),
      assessedBy: assessedBy.trim() || 'Store Manager',
    });

    const result = executeDispositionBStock({
      logId: activeLog.id,
      newDiscountedPrice: priceNum,
      bStockCondition: bStockCondition.trim() || 'Open-Box/Refurbished',
      bStockNotes: bStockNotes.trim(),
      resolvedBy: assessedBy.trim() || 'Store Manager',
    });

    if (result.success) {
      setStatusFeedback({
        type: 'success',
        message: `Disposition Confirmed: Reclaimed to Available inventory as "Open-Box/Refurbished" at ${formatCurrency(priceNum, settings.currencySymbol)}.`,
      });
      setActiveDispositionMode(null);
      refreshLogs();
      onDataChanged();
    } else {
      setStatusFeedback({ type: 'error', message: result.error || 'Failed to process B-Stock.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="quarantine-manager-modal"
        className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[94vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Manager Workflow
                </span>
                <span className="text-xs text-slate-400">Phase 2 (Assessment) & Phase 3 (Final Disposition)</span>
              </div>
              <h2 className="text-lg font-black text-white">Quarantined Inventory & Damage Logs</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshLogs}
              title="Refresh logs"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Summary Metrics Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 font-semibold mb-1">
              <span>Quarantined (Needs Review)</span>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600">{metrics.quarantinedCount} units</p>
            <p className="text-[10px] text-slate-400">Awaiting manager disposition</p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 font-semibold mb-1">
              <span>Quarantined Capital Impact</span>
              <DollarSign className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <p className="text-xl font-black text-slate-900">
              {formatCurrency(metrics.quarantinedCost, settings.currencySymbol)}
            </p>
            <p className="text-[10px] text-slate-400">Locked unit acquisition cost</p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 font-semibold mb-1">
              <span>Pending RMA (Vendor Return)</span>
              <Truck className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <p className="text-xl font-black text-blue-600">{metrics.rmaCount} units</p>
            <p className="text-[10px] text-slate-400">Sent to supplier for exchange</p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 font-semibold mb-1">
              <span>Scrapped Financial Losses</span>
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600">
              {formatCurrency(metrics.scrappedLoss, settings.currencySymbol)}
            </p>
            <p className="text-[10px] text-slate-400">{metrics.writtenOffCount} units written-off</p>
          </div>
        </div>

        {/* Main Content: Left Column (Queue List) & Right Column (Assessment & Disposition Form) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Panel: Items List & Filtering */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
            {/* Search & Tabs */}
            <div className="p-3 border-b border-slate-200 space-y-2 bg-white">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search log #, serial, model..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('quarantine_needs_action')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'quarantine_needs_action'
                      ? 'bg-amber-100 text-amber-900 font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Needs Action ({metrics.quarantinedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pending_rma')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'pending_rma'
                      ? 'bg-blue-100 text-blue-900 font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  RMA ({metrics.rmaCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('written_off')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'written_off'
                      ? 'bg-rose-100 text-rose-900 font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Scrapped ({metrics.writtenOffCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('b_stock')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'b_stock'
                      ? 'bg-emerald-100 text-emerald-900 font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  B-Stock ({metrics.bStockCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'all'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All ({logs.length})
                </button>
              </div>
            </div>

            {/* List of damage logs */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-1">
                  <Package className="w-8 h-8 mx-auto stroke-1 text-slate-300" />
                  <p className="text-xs font-semibold">No damage logs found</p>
                  <p className="text-[11px]">Items will appear here once reported.</p>
                </div>
              ) : (
                filteredLogs.map(log => {
                  const isSelected = log.id === selectedLogId;
                  let statusBadgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
                  if (log.status === 'Pending RMA') statusBadgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                  if (log.status === 'Written-Off') statusBadgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
                  if (log.status === 'Available' || log.dispositionAction === 'b_stock') statusBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';

                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedLogId(log.id)}
                      className={`w-full p-3 text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                        isSelected 
                          ? 'bg-white border-l-4 border-l-amber-500 shadow-xs' 
                          : 'hover:bg-slate-100/80 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-900">
                          {log.logNumber}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass}`}>
                          {log.dispositionAction === 'b_stock' ? 'B-Stock (Available)' : log.status}
                        </span>
                      </div>

                      <p className="font-bold text-slate-900 text-xs truncate">
                        {log.productName}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        {log.serialOrImei ? (
                          <span className="font-mono text-amber-700 truncate max-w-[130px]">
                            {log.serialOrImei}
                          </span>
                        ) : (
                          <span>1 Unit</span>
                        )}
                        <span className="font-bold text-slate-900">
                          {formatCurrency(log.costImpact, settings.currencySymbol)} (Cost)
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <span>By {log.reportedBy}</span>
                        <span>{new Date(log.reportedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Selected Item Detail, Phase 2 Assessment Form & Phase 3 Actions */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-white text-xs">
            {activeLog ? (
              <div className="space-y-6 max-w-3xl">
                
                {/* Feedback Toast */}
                {statusFeedback && (
                  <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
                    statusFeedback.type === 'success' 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}>
                    <div className="flex items-center gap-2">
                      {statusFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span className="font-semibold">{statusFeedback.message}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setStatusFeedback(null)}
                      className="p-1 hover:bg-black/5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Phase 1 Summary Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-700">
                          Phase 1: Quarantine Record
                        </span>
                        <span className="font-mono font-bold text-indigo-600">{activeLog.logNumber}</span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 mt-1">{activeLog.productName}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${
                        activeLog.status === 'Quarantined' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        activeLog.status === 'Pending RMA' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        activeLog.status === 'Written-Off' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                        'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}>
                        Current Status: {activeLog.dispositionAction === 'b_stock' ? 'B-Stock (Available)' : activeLog.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-slate-600">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">SKU / Barcode</span>
                      <span className="font-mono text-slate-800">{activeLog.sku}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Serial / IMEI</span>
                      <span className="font-mono text-amber-700 font-bold">
                        {activeLog.serialOrImei || 'Non-serialized unit'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Reported By</span>
                      <span className="text-slate-800">{activeLog.reportedBy}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Date Quarantined</span>
                      <span className="text-slate-800">{new Date(activeLog.reportedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {activeLog.quarantineNotes && (
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-slate-700 text-[11px]">
                      <span className="font-bold text-slate-900 block mb-0.5">Initial Staff Observation:</span>
                      {activeLog.quarantineNotes}
                    </div>
                  )}
                </div>

                {/* ======================================================== */}
                {/* PHASE 2: ASSESSMENT & LOGGING FORM                       */}
                {/* Fields: Damage Reason, Photo Proof, Cost Impact          */}
                {/* ======================================================== */}
                <form onSubmit={handleSaveAssessment} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                        2
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Phase 2: Manager Assessment & Damage Logging</h4>
                        <p className="text-[11px] text-slate-500">Record technical findings, evidence photos, and cost impact</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      activeLog.phase === 'quarantine' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                    }`}>
                      {activeLog.phase === 'quarantine' ? 'Awaiting Assessment' : 'Assessed & Verified'}
                    </span>
                  </div>

                  {/* 1. Cost Impact (Read-Only pulling original unit cost from database) */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-800 flex items-center justify-between">
                      <span>Cost Impact (Original Unit Acquisition Cost)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Pulled from database • Read-Only</span>
                    </label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <DollarSign className="w-4 h-4 text-slate-500" />
                      </div>
                      <input
                        id="cost-impact-read-only"
                        type="text"
                        readOnly
                        value={`${formatCurrency(activeLog.costImpact, settings.currencySymbol)} (Original Cost)`}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-800 font-bold cursor-not-allowed select-all"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Original unit cost of this item recorded at initial stock-in. This value represents the total financial exposure.
                    </p>
                  </div>

                  {/* 2. Damage Reason (Dropdown with required options) */}
                  <div className="space-y-1.5">
                    <label htmlFor="damage-reason-select" className="block font-bold text-slate-800">
                      Damage Reason <span className="text-rose-500">*</span>
                    </label>
                    <select
                      id="damage-reason-select"
                      value={damageReason}
                      onChange={(e) => setDamageReason(e.target.value as DamageReason)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-hidden"
                    >
                      <option value="Out-of-box failure">Out-of-box failure</option>
                      <option value="Dropped in store">Dropped in store</option>
                      <option value="Water damage">Water damage</option>
                      <option value="Customer return">Customer return</option>
                    </select>
                  </div>

                  {/* 3. Photo Proof (File Upload Input with live thumbnail preview) */}
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-800 flex items-center justify-between">
                      <span>Photo Proof (Damage Evidence)</span>
                      {photoProof && (
                        <button
                          type="button"
                          onClick={() => setPhotoProof('')}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Remove Photo
                        </button>
                      )}
                    </label>

                    {photoProof ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-4">
                        <div className="relative group w-24 h-24 rounded-lg overflow-hidden bg-slate-900 border border-slate-300 shrink-0">
                          <img 
                            src={photoProof} 
                            alt="Damage Evidence" 
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setIsPhotoZoomOpen(true)}
                            className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <p className="font-bold text-slate-900 text-xs">Evidence Image Attached</p>
                          <p className="text-[11px] text-slate-500">
                            Photo proof uploaded for inspection audit trail. Click preview to zoom.
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsPhotoZoomOpen(true)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              View Full Size
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              Replace
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/40 p-6 rounded-2xl text-center cursor-pointer transition-all group"
                      >
                        <Camera className="w-8 h-8 mx-auto text-slate-400 group-hover:text-indigo-600 transition-colors" />
                        <p className="text-xs font-bold text-slate-800 mt-2">
                          Click to upload or drag & drop photo proof
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Upload high-resolution camera photo of crack, moisture tag, or cosmetic damage (PNG, JPG, WEBP)
                        </p>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </div>

                  {/* Manager Assessment Findings & Notes */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-800">
                      Manager Review Findings & Notes
                    </label>
                    <textarea
                      rows={2}
                      value={assessmentNotes}
                      onChange={(e) => setAssessmentNotes(e.target.value)}
                      placeholder="e.g., Tested display touch response, found cracked OLED layer behind glass. Verified with serial number..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Assessed By Input */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-700">Assessing Manager:</span>
                      <input
                        type="text"
                        value={assessedBy}
                        onChange={(e) => setAssessedBy(e.target.value)}
                        className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                      />
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Save Assessment Findings
                    </button>
                  </div>
                </form>

                {/* ======================================================== */}
                {/* PHASE 3: FINAL DISPOSITION ACTIONS                       */}
                {/* 1. Return to Vendor (RMA)                                */}
                {/* 2. Write-Off (Scrap)                                     */}
                {/* 3. Move to B-Stock                                       */}
                {/* ======================================================== */}
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black">
                      3
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Phase 3: Final Disposition Action</h4>
                      <p className="text-[11px] text-slate-500">Select one of the three resolution paths to resolve this quarantined item</p>
                    </div>
                  </div>

                  {/* Three Distinct Resolution Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    
                    {/* Action 1 Button: Return to Vendor (RMA) */}
                    <button
                      type="button"
                      onClick={() => setActiveDispositionMode(activeDispositionMode === 'rma' ? null : 'rma')}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        activeDispositionMode === 'rma' || activeLog.dispositionAction === 'rma'
                          ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/50 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                          <Truck className="w-4 h-4" />
                        </div>
                        {activeLog.status === 'Pending RMA' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                            Active RMA
                          </span>
                        )}
                      </div>
                      <div>
                        <h5 className="font-black text-slate-900 text-xs">Return to Vendor (RMA)</h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Update status to "Pending RMA" & log vendor details
                        </p>
                      </div>
                    </button>

                    {/* Action 2 Button: Write-Off (Scrap) */}
                    <button
                      type="button"
                      onClick={() => setActiveDispositionMode(activeDispositionMode === 'write_off' ? null : 'write_off')}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        activeDispositionMode === 'write_off' || activeLog.dispositionAction === 'write_off'
                          ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/50 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        {activeLog.status === 'Written-Off' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                            Scrapped
                          </span>
                        )}
                      </div>
                      <div>
                        <h5 className="font-black text-slate-900 text-xs">Write-Off (Scrap)</h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Permanently remove from inventory & log financial loss
                        </p>
                      </div>
                    </button>

                    {/* Action 3 Button: Move to B-Stock */}
                    <button
                      type="button"
                      onClick={() => setActiveDispositionMode(activeDispositionMode === 'b_stock' ? null : 'b_stock')}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        activeDispositionMode === 'b_stock' || activeLog.dispositionAction === 'b_stock'
                          ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/50 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <Tag className="w-4 h-4" />
                        </div>
                        {activeLog.dispositionAction === 'b_stock' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">
                            B-Stock Active
                          </span>
                        )}
                      </div>
                      <div>
                        <h5 className="font-black text-slate-900 text-xs">Move to B-Stock</h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Reclaim as Open-Box/Refurbished with discounted price
                        </p>
                      </div>
                    </button>

                  </div>

                  {/* SUB-FORM 1: Return to Vendor (RMA) Details */}
                  {activeDispositionMode === 'rma' && (
                    <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-amber-950 flex items-center gap-2">
                          <Truck className="w-4 h-4 text-amber-600" />
                          <span>Vendor Return (RMA) Details</span>
                        </h5>
                        <span className="text-[11px] text-amber-800 font-medium">Updates status to "Pending RMA"</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">
                            Supplier / Vendor Name <span className="text-rose-500">*</span>
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={rmaVendorName}
                              onChange={(e) => setRmaVendorName(e.target.value)}
                              placeholder="e.g. Official Apple Distributor"
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-medium"
                            />
                            {suppliers.length > 0 && (
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setRmaVendorName(e.target.value);
                                    const s = suppliers.find(sup => sup.name === e.target.value);
                                    if (s?.phone) setRmaVendorContact(s.phone);
                                  }
                                }}
                                className="px-2 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-600"
                              >
                                <option value="">Quick Pick Supplier</option>
                                {suppliers.map(s => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">Vendor Contact / Rep</label>
                          <input
                            type="text"
                            value={rmaVendorContact}
                            onChange={(e) => setRmaVendorContact(e.target.value)}
                            placeholder="Phone number, email or contact person"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">RMA / Waybill Tracking Number</label>
                          <input
                            type="text"
                            value={rmaTrackingNumber}
                            onChange={(e) => setRmaTrackingNumber(e.target.value)}
                            placeholder="e.g. RMA-2026-98124 or Courier Track #"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">RMA Dispatch Notes</label>
                          <input
                            type="text"
                            value={rmaNotes}
                            onChange={(e) => setRmaNotes(e.target.value)}
                            placeholder="e.g. Dispatched via Royal Express courier"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveDispositionMode(null)}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          id="confirm-rma-disposition-btn"
                          type="button"
                          onClick={handleConfirmRma}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                        >
                          Confirm RMA (Update to Pending RMA)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-FORM 2: Write-Off (Scrap) Details */}
                  {activeDispositionMode === 'write_off' && (
                    <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-rose-950 flex items-center gap-2">
                          <Trash2 className="w-4 h-4 text-rose-600" />
                          <span>Permanent Inventory Write-Off (Scrap)</span>
                        </h5>
                        <span className="text-[11px] text-rose-800 font-bold">
                          Financial Loss: {formatCurrency(activeLog.costImpact, settings.currencySymbol)}
                        </span>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-rose-200 text-slate-700 space-y-1.5">
                        <div className="flex items-center gap-2 text-rose-700 font-bold">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Financial & Physical Inventory Impact:</span>
                        </div>
                        <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-600">
                          <li>The item will be <strong>permanently removed</strong> from physical store stock counts.</li>
                          <li>If serialized, serial/IMEI will be decommissioned.</li>
                          <li>An official expense record of <strong>{formatCurrency(activeLog.costImpact, settings.currencySymbol)}</strong> will be logged in the financial loss expense ledger.</li>
                        </ul>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">Scrap Reason / Justification</label>
                          <input
                            type="text"
                            value={scrapReason}
                            onChange={(e) => setScrapReason(e.target.value)}
                            placeholder="e.g. Beyond economical repair"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">Authorized Manager Signature</label>
                          <input
                            type="text"
                            value={scrapAuthorizedBy}
                            onChange={(e) => setScrapAuthorizedBy(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveDispositionMode(null)}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          id="confirm-writeoff-disposition-btn"
                          type="button"
                          onClick={handleConfirmWriteOff}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                        >
                          Confirm Permanent Scrap & Log Financial Loss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-FORM 3: Move to B-Stock Details */}
                  {activeDispositionMode === 'b_stock' && (
                    <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-emerald-950 flex items-center gap-2">
                          <Tag className="w-4 h-4 text-emerald-600" />
                          <span>Move to B-Stock (Reclaim to Sellable Inventory)</span>
                        </h5>
                        <span className="text-[11px] text-emerald-800 font-bold">
                          Flag: "Open-Box/Refurbished"
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800 flex items-center justify-between">
                            <span>New Discounted Selling Price <span className="text-rose-500">*</span></span>
                            <span className="text-[10px] text-slate-500">
                              Orig: {formatCurrency(activeLog.originalSellingPrice, settings.currencySymbol)}
                            </span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                              {settings.currencySymbol}
                            </span>
                            <input
                              id="b-stock-discounted-price-input"
                              type="number"
                              value={bStockPrice}
                              onChange={(e) => setBStockPrice(e.target.value)}
                              placeholder="Enter discounted price"
                              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-black"
                            />
                          </div>
                          {parseFloat(bStockPrice) > 0 && activeLog.originalSellingPrice > 0 && (
                            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                              {(((activeLog.originalSellingPrice - parseFloat(bStockPrice)) / activeLog.originalSellingPrice) * 100).toFixed(1)}% Discount off original retail price
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-800">Listing Condition Tag</label>
                          <input
                            type="text"
                            value={bStockCondition}
                            onChange={(e) => setBStockCondition(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2 space-y-1">
                          <label className="block font-bold text-slate-800">B-Stock Warranty & Customer Description</label>
                          <input
                            type="text"
                            value={bStockNotes}
                            onChange={(e) => setBStockNotes(e.target.value)}
                            placeholder="Notes visible on invoice / product details"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveDispositionMode(null)}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          id="confirm-bstock-disposition-btn"
                          type="button"
                          onClick={handleConfirmBStock}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                        >
                          Reclaim as B-Stock (Make Available)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Disposition History Audit (If already resolved) */}
                  {activeLog.phase === 'disposed' && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] space-y-1">
                      <span className="font-bold text-slate-900">Disposition Record:</span>
                      <div className="text-slate-600">
                        {activeLog.dispositionAction === 'rma' && (
                          <p>Returned to Vendor (RMA): <strong>{activeLog.rmaVendorName}</strong> | Tracking: {activeLog.rmaTrackingNumber || 'N/A'}</p>
                        )}
                        {activeLog.dispositionAction === 'write_off' && (
                          <p>Scrapped / Written-Off: Loss of <strong>{formatCurrency(activeLog.lossRecordedAmount || activeLog.costImpact, settings.currencySymbol)}</strong> recorded under voucher <strong>{activeLog.expenseVoucherNumber}</strong></p>
                        )}
                        {activeLog.dispositionAction === 'b_stock' && (
                          <p>Reinstated as B-Stock: Discounted Selling Price set to <strong>{formatCurrency(activeLog.bStockDiscountedPrice || 0, settings.currencySymbol)}</strong></p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Resolved on {new Date(activeLog.dispositionDate || '').toLocaleString()} by {activeLog.dispositionBy}
                        </p>
                      </div>
                    </div>
                  )}

                </div>

              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <ShieldAlert className="w-12 h-12 mx-auto stroke-1 text-slate-300" />
                <h4 className="text-sm font-bold text-slate-700">No Item Selected</h4>
                <p className="text-xs max-w-sm mx-auto">
                  Select a quarantined item from the left queue to view original unit cost impact, attach damage photo proof, and apply final disposition actions.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Lightbox Zoom Modal for Photo Proof */}
      {isPhotoZoomOpen && photoProof && (
        <div 
          onClick={() => setIsPhotoZoomOpen(false)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div className="max-w-3xl max-h-[85vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl relative">
            <button
              onClick={() => setIsPhotoZoomOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <img 
              src={photoProof} 
              alt="Full Size Damage Proof" 
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
