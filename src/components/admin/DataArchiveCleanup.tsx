import React, { useState, useEffect } from 'react';
import { 
  Archive, 
  Trash2, 
  Download, 
  Cloud, 
  Database, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  ShieldAlert, 
  ExternalLink, 
  Copy, 
  Search, 
  Check, 
  Clock, 
  HardDrive,
  FileSpreadsheet,
  ArrowRight,
  Info
} from 'lucide-react';
import { authenticatedFetch } from '../../utils/apiClient';
import { StorageService } from '../../utils/storage';
import { Sale, ShopSettings } from '../../types';

interface DataArchiveCleanupProps {
  settings?: ShopSettings;
  sales?: Sale[];
  onArchiveComplete?: (deletedSaleIds: string[]) => void;
  onClose?: () => void;
}

interface ArchiveFileInfo {
  name: string;
  fullPath: string;
  size: number;
  timeCreated: string;
  downloadUrl: string;
}

interface PreviewSummary {
  count: number;
  totalGrandTotal: number;
  sampleInvoices: string[];
  earliestDate: string;
  latestDate: string;
}

export const DataArchiveCleanup: React.FC<DataArchiveCleanupProps> = ({
  settings,
  sales = [],
  onArchiveComplete,
  onClose
}) => {
  // Default end date: 90 days ago
  const defaultEndDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  };

  // Default start date: 2 years ago
  const defaultStartDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(defaultStartDate());
  const [endDate, setEndDate] = useState<string>(defaultEndDate());

  // State management
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [scanPreview, setScanPreview] = useState<PreviewSummary | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [archivedResult, setArchivedResult] = useState<{
    count: number;
    storagePath: string;
    downloadUrl: string;
    fileSize: number;
    deletedIds: string[];
    archivedAt: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Safety confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [hasConfirmedCheckbox, setHasConfirmedCheckbox] = useState<boolean>(false);

  // Past archives list
  const [pastArchives, setPastArchives] = useState<ArchiveFileInfo[]>([]);
  const [isLoadingPastArchives, setIsLoadingPastArchives] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Progress steps during execution
  const [progressStep, setProgressStep] = useState<string>('');

  // Fetch past archives on mount
  useEffect(() => {
    fetchPastArchives();
  }, []);

  const fetchPastArchives = async () => {
    setIsLoadingPastArchives(true);
    try {
      const res = await authenticatedFetch('/api/archive-data/list');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.files)) {
          setPastArchives(data.files);
        }
      }
    } catch (err) {
      console.warn('[DataArchiveCleanup] Failed to fetch past archives:', err);
    } finally {
      setIsLoadingPastArchives(false);
    }
  };

  // Quick Presets Handler
  const applyPreset = (daysAgo: number) => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() - daysAgo);

    const start = new Date(today);
    start.setFullYear(today.getFullYear() - 3);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setScanPreview(null);
    setScanMessage(null);
    setErrorMessage(null);
  };

  // 1. Scan / Preview matching records without modifying anything
  const handleScanPreview = async () => {
    if (!endDate) {
      setErrorMessage('Please select an End Date before scanning.');
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setScanMessage(null);
    setArchivedResult(null);

    try {
      const res = await authenticatedFetch('/api/archive-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate || undefined,
          endDate,
          previewOnly: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to scan matching records from Firestore.');
      }

      if (data.count === 0) {
        setScanPreview(null);
        setScanMessage(data.message || 'No sales records found matching the specified date range.');
      } else {
        setScanPreview({
          count: data.count,
          totalGrandTotal: data.preview?.totalGrandTotal || 0,
          sampleInvoices: data.preview?.sampleInvoices || [],
          earliestDate: data.preview?.earliestDate || '',
          latestDate: data.preview?.latestDate || '',
        });
        setScanMessage(null);
      }
    } catch (err: any) {
      console.error('[DataArchiveCleanup] Scan error:', err);
      setErrorMessage(err.message || 'An error occurred while scanning Firestore sales records.');
      setScanPreview(null);
    } finally {
      setIsScanning(false);
    }
  };

  // 2. Open confirmation modal
  const handleInitiateArchive = () => {
    if (!endDate) {
      setErrorMessage('Please select an End Date for data cleanup.');
      return;
    }
    setHasConfirmedCheckbox(false);
    setShowConfirmModal(true);
  };

  // 3. Execute the actual Archive & Cleanup operation
  const handleExecuteArchive = async () => {
    setShowConfirmModal(false);
    setIsArchiving(true);
    setErrorMessage(null);
    setArchivedResult(null);
    setProgressStep('Connecting to Firestore & fetching records...');

    try {
      setProgressStep('Querying sales and building CSV spreadsheet...');
      
      const res = await authenticatedFetch('/api/archive-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate || undefined,
          endDate,
          previewOnly: false,
        }),
      });

      setProgressStep('Uploading CSV to Firebase Cloud Storage & batch deleting from Firestore...');

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to archive data and clean up Firestore database.');
      }

      // Success
      setArchivedResult({
        count: data.archivedCount || data.count || 0,
        storagePath: data.storagePath || '',
        downloadUrl: data.downloadUrl || '',
        fileSize: data.fileSize || 0,
        deletedIds: data.deletedIds || [],
        archivedAt: data.archivedAt || new Date().toISOString(),
      });

      // Log in client audit logs
      try {
        StorageService.addAuditLog({
          actionType: 'SETTINGS_CHANGED' as any,
          category: 'system' as any,
          severity: 'warning',
          summary: `Archived ${data.archivedCount || data.count} sales records to Cloud Storage (${data.storagePath}) and cleaned up Firestore space.`,
          details: {
            targetType: 'sales_archive',
            targetId: data.storagePath,
            notes: `Archived ${data.archivedCount || data.count} sales records (${startDate || 'Beginning'} to ${endDate}) to Cloud Storage: ${data.storagePath}`,
            metadata: {
              dateRange: `${startDate || 'Beginning'} to ${endDate}`,
              count: data.archivedCount || data.count,
              storagePath: data.storagePath,
              downloadUrl: data.downloadUrl,
            },
          },
          staffId: 'admin',
          staffName: settings?.shopName ? `${settings.shopName} Admin` : 'System Administrator',
          staffRole: 'Owner',
        });
      } catch (logErr) {
        console.warn('[DataArchiveCleanup] Warning logging to audit log:', logErr);
      }

      // Synchronize with parent app and local storage
      if (Array.isArray(data.deletedIds) && data.deletedIds.length > 0) {
        const deletedSet = new Set(data.deletedIds);
        const currentLocalSales = StorageService.getSales();
        const updatedLocal = currentLocalSales.filter((s) => !deletedSet.has(s.id));
        StorageService.saveSales(updatedLocal);

        if (onArchiveComplete) {
          onArchiveComplete(data.deletedIds);
        }
      }

      // Refresh list of archives
      await fetchPastArchives();
      setScanPreview(null);
    } catch (err: any) {
      console.error('[DataArchiveCleanup] Archive error:', err);
      setErrorMessage(
        err.message || 
        'An error occurred during data archiving. Your Firestore records were NOT deleted because the process could not safely complete.'
      );
    } finally {
      setIsArchiving(false);
      setProgressStep('');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const currencySymbol = settings?.currencySymbol || 'MMK';

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 border border-slate-700/80 shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Database className="w-48 h-48 text-indigo-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Archive className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black tracking-tight text-white">
                Data Archiving & Cloud Cleanup
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Firestore + Cloud Storage
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Export historic sales records into an RFC-compliant CSV spreadsheet, permanently store the backup inside 
              <span className="font-semibold text-amber-300"> Firebase Cloud Storage</span>, and safely purge original documents from 
              <span className="font-semibold text-indigo-300"> Cloud Firestore</span> to reclaim quota, lower cloud costs, and speed up queries.
            </p>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="self-start md:self-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-600"
            >
              Back to Settings
            </button>
          )}
        </div>

        {/* 4-Step Architecture Pipeline */}
        <div className="mt-6 pt-5 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center font-black shrink-0 text-[11px]">
              1
            </div>
            <div>
              <p className="font-bold text-slate-200">Date Range Filter</p>
              <p className="text-[11px] text-slate-400">Select vintage sales older than 30, 90, or 365 days.</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black shrink-0 text-[11px]">
              2
            </div>
            <div>
              <p className="font-bold text-slate-200">Convert to CSV</p>
              <p className="text-[11px] text-slate-400">Compiles invoice totals, customer details & serialized IMEIs.</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-black shrink-0 text-[11px]">
              3
            </div>
            <div>
              <p className="font-bold text-slate-200">Upload to Cloud Storage</p>
              <p className="text-[11px] text-slate-400">Stores permanently in <code className="text-blue-300">archives/sales/</code>.</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center font-black shrink-0 text-[11px]">
              4
            </div>
            <div>
              <p className="font-bold text-slate-200">Batch Purge Firestore</p>
              <p className="text-[11px] text-slate-400">Safely reclaims document quota only after verified upload.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* Preset Quick Filters */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
            Quick Date Presets
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset(0)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
            >
              All History (Up to Today)
            </button>
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Older than 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Older than 30 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset(90)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
            >
              Older than 90 Days (Recommended)
            </button>
            <button
              type="button"
              onClick={() => applyPreset(180)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Older than 6 Months
            </button>
            <button
              type="button"
              onClick={() => applyPreset(365)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Older than 1 Year
            </button>
          </div>
        </div>

        {/* Date Range Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Start Date (Earliest)</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setScanPreview(null);
                setScanMessage(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <span className="text-[11px] text-slate-400">
              Leave blank or set to an early date to archive from the beginning.
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span>End Date (Cut-off Threshold)</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setScanPreview(null);
                setScanMessage(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <span className="text-[11px] text-slate-400">
              All sales records on or before this date (up to 23:59:59) will be archived.
            </span>
          </div>
        </div>

        {/* Action Buttons: Scan & Archive */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScanPreview}
              disabled={isScanning || isArchiving || !endDate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                  <span>Scanning Firestore...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 text-slate-600" />
                  <span>Scan Matching Records</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            id="archive-and-cleanup-btn"
            onClick={handleInitiateArchive}
            disabled={isScanning || isArchiving || !endDate}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isArchiving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Archiving & Purging...</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Archive & Cleanup Data</span>
              </>
            )}
          </button>
        </div>

        {/* Live Scan Preview Card */}
        {scanPreview && (
          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span>Found {scanPreview.count} Sales Records Ready for Archiving</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-200/80 text-indigo-900">
                Total: {(scanPreview.totalGrandTotal || 0).toLocaleString()} {currencySymbol}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-indigo-950 font-medium pt-1">
              <div className="p-2 rounded-lg bg-white/80 border border-indigo-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Records Count</span>
                <span className="text-sm font-extrabold text-indigo-700">{scanPreview.count} Documents</span>
              </div>
              <div className="p-2 rounded-lg bg-white/80 border border-indigo-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Earliest Sale</span>
                <span className="font-semibold text-slate-800">
                  {scanPreview.earliestDate ? new Date(scanPreview.earliestDate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white/80 border border-indigo-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Cut-off Sale</span>
                <span className="font-semibold text-slate-800">
                  {scanPreview.latestDate ? new Date(scanPreview.latestDate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {scanPreview.sampleInvoices.length > 0 && (
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-700">Sample Invoices:</span>
                {scanPreview.sampleInvoices.map((inv) => (
                  <span key={inv} className="px-2 py-0.5 rounded bg-white font-mono text-[10px] border border-indigo-200 font-bold text-slate-700">
                    {inv}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scan Message when 0 records found */}
        {scanMessage && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs font-medium text-slate-700">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <span>{scanMessage}</span>
          </div>
        )}

        {/* Loading Progress State during Active Archiving */}
        {isArchiving && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
              <span>Archiving in progress... Please do not close or refresh this tab.</span>
            </div>
            {progressStep && (
              <p className="text-xs font-mono text-amber-800 pl-6 animate-pulse">
                &gt; {progressStep}
              </p>
            )}
            <div className="w-full bg-amber-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-600 h-full w-2/3 animate-pulse rounded-full" />
            </div>
          </div>
        )}

        {/* Error Notification with Zero-Data-Loss Guarantee */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
            <div className="flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-900">Archiving Error</p>
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-100/70 border border-rose-200 text-[11px] text-rose-900 font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
              <span>Data Protection Guarantee: Original Firestore records were NOT deleted.</span>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {archivedResult && (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-4 animate-fadeIn">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Data Archiving & Cleanup Successfully Completed!</span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-200 text-emerald-900">
                Verified
              </span>
            </div>

            <p className="text-xs text-emerald-800 leading-relaxed">
              Successfully exported <strong className="font-bold">{archivedResult.count} sales records</strong> into an 
              RFC-compliant CSV spreadsheet, uploaded it to Firebase Cloud Storage, and purged the matching records 
              from Firestore to reclaim database storage.
            </p>

            {/* Metrics & Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white border border-emerald-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Purged From Firestore</span>
                <span className="text-sm font-extrabold text-emerald-700">{archivedResult.count} Documents</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-emerald-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Cloud Storage File</span>
                <span className="font-mono text-[11px] font-bold text-slate-800 truncate block" title={archivedResult.storagePath}>
                  {archivedResult.storagePath}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-emerald-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Spreadsheet Size</span>
                <span className="text-sm font-extrabold text-slate-800">
                  {(archivedResult.fileSize / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>

            {/* Action Bar: Direct Download & Copy URL */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={archivedResult.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Archived CSV</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopyUrl(archivedResult.downloadUrl)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-emerald-100/60 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all cursor-pointer"
              >
                {copiedUrl === archivedResult.downloadUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied URL!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copy Storage URL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historical Cloud Storage Archives Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Cloud className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-800">
              Cloud Storage Archives Repository
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
              {pastArchives.length} files
            </span>
          </div>

          <button
            type="button"
            onClick={fetchPastArchives}
            disabled={isLoadingPastArchives}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPastArchives ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {pastArchives.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-medium text-slate-500">
              {isLoadingPastArchives ? 'Scanning Firebase Cloud Storage...' : 'No historical CSV archives found in archives/sales/ yet.'}
            </p>
            <p className="text-[11px] text-slate-400">
              When you archive vintage sales data, the CSV spreadsheets will be listed here with instant download access.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Archive File</th>
                  <th className="py-2.5 px-3">Date Created</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastArchives.map((file) => (
                  <tr key={file.fullPath} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-mono text-[11px] font-bold text-slate-800">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {new Date(file.timeCreated).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                      {(file.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={file.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(file.downloadUrl)}
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                          title="Copy Cloud Storage URL"
                        >
                          {copiedUrl === file.downloadUrl ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Safety Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-amber-600 to-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-white" />
                <span>Confirm Data Archiving & Firestore Cleanup</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-white/80 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed font-medium">
                You are about to archive sales records from{' '}
                <strong className="text-slate-900">{startDate || 'the earliest record'}</strong> up to{' '}
                <strong className="text-slate-900">{endDate}</strong>.
              </p>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-amber-950">
                <p className="font-bold flex items-center gap-1.5 text-amber-900 text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Important Database Purge Notice</span>
                </p>
                <ul className="space-y-1.5 pl-5 list-disc text-[11px]">
                  <li>All matching sales records will be compiled into a single CSV spreadsheet.</li>
                  <li>The CSV file will be securely uploaded to Firebase Cloud Storage under <code className="font-mono text-amber-900 font-bold">archives/sales/</code>.</li>
                  <li>
                    <strong>Only after verified upload</strong>, the original documents will be permanently deleted from Cloud Firestore to reclaim storage space.
                  </li>
                  <li>If the storage upload fails for any reason, no records will be deleted.</li>
                </ul>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  id="confirm-archive-checkbox"
                  checked={hasConfirmedCheckbox}
                  onChange={(e) => setHasConfirmedCheckbox(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-[11px] font-semibold text-slate-800 leading-snug">
                  I understand that matching sales will be safely exported to Firebase Cloud Storage and permanently purged from Firestore.
                </span>
              </label>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="modal-confirm-archive-btn"
                onClick={handleExecuteArchive}
                disabled={!hasConfirmedCheckbox}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Archive className="w-4 h-4" />
                <span>Confirm & Start Archiving</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
