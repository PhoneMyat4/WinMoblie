import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  User, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  XCircle, 
  RefreshCw, 
  FileSpreadsheet, 
  ArrowUpDown, 
  Eye, 
  Trash2, 
  ChevronRight, 
  Sparkles, 
  Clock, 
  Monitor, 
  Copy, 
  Check, 
  Receipt, 
  Tag, 
  DollarSign, 
  Lock, 
  ShieldAlert, 
  SlidersHorizontal,
  FileText,
  Printer,
  Wifi,
  WifiOff,
  Database,
  UploadCloud,
  CheckCircle
} from 'lucide-react';
import { 
  AuditLogEntry, 
  AuditCategory, 
  AuditSeverity, 
  AuditActionType, 
  StaffUser, 
  ShopSettings, 
  RolePermissions, 
  Sale, 
  Product 
} from '../../types';
import { StorageService } from '../../utils/storage';
import { AuditLogger } from '../../utils/auditLogger';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { FirestoreSyncService, PENDING_AUDIT_LOGS_KEY } from '../../services/firestoreSyncService';

interface AuditLogManagerProps {
  settings: ShopSettings;
  currentStaffUser: StaffUser;
  rolePermissions?: Record<string, RolePermissions>;
  staffUsers: StaffUser[];
  onViewInvoice?: (sale: Sale) => void;
  onNavigateTab?: (tab: any) => void;
}

type ViewMode = 'timeline' | 'table';
type DateRangeOption = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const AuditLogManager: React.FC<AuditLogManagerProps> = ({
  settings,
  currentStaffUser,
  rolePermissions,
  staffUsers,
  onViewInvoice,
  onNavigateTab,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>(() => StorageService.getAuditLogs());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [dateRangeOption, setDateRangeOption] = useState<DateRangeOption>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [sortField, setSortField] = useState<'timestamp' | 'staffName' | 'severity' | 'category'>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Security, Offline Queue & Auto-Purging State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(PENDING_AUDIT_LOGS_KEY);
      return raw ? JSON.parse(raw).length : 0;
    } catch {
      return 0;
    }
  });
  const [isFlushingQueue, setIsFlushingQueue] = useState<boolean>(false);
  const [flushResultMsg, setFlushResultMsg] = useState<string | null>(null);
  const [showAutoPurgeModal, setShowAutoPurgeModal] = useState<boolean>(false);
  const [showTtlInfoModal, setShowTtlInfoModal] = useState<boolean>(false);
  const [purgeFeedback, setPurgeFeedback] = useState<string | null>(null);

  // Permissions check
  const userPerms = rolePermissions?.[currentStaffUser.role];
  const canExport = Boolean(currentStaffUser.role === 'Owner' || currentStaffUser.role === 'Manager' || userPerms?.canExportAuditLogs);
  const canClearLogs = Boolean(currentStaffUser.role === 'Owner');

  // Reload logs on external or storage update
  const refreshLogs = () => {
    setLogs(StorageService.getAuditLogs());
    try {
      const syncService = FirestoreSyncService.getInstance();
      setPendingQueueCount(syncService.getPendingAuditLogs().length);
    } catch {}
  };

  // Retention Cutoff calculations (180 days / 6 months)
  const cutoff180Days = useMemo(() => {
    return Date.now() - (180 * 24 * 60 * 60 * 1000);
  }, []);

  const logsOlderThan180Days = useMemo(() => {
    return logs.filter(l => new Date(l.timestamp).getTime() < cutoff180Days);
  }, [logs, cutoff180Days]);

  useEffect(() => {
    const handleUpdate = () => {
      setLogs(StorageService.getAuditLogs());
    };
    const handleOnline = () => {
      setIsOnline(true);
      try {
        const syncService = FirestoreSyncService.getInstance();
        setPendingQueueCount(syncService.getPendingAuditLogs().length);
      } catch {}
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleQueueUpdated = (e: any) => {
      setPendingQueueCount(e.detail?.count || 0);
    };
    const handleQueueFlushed = (e: any) => {
      setPendingQueueCount(e.detail?.remaining || 0);
      setFlushResultMsg(`Sync complete: ${e.detail?.flushed} queued activity logs pushed to Firestore.`);
      setTimeout(() => setFlushResultMsg(null), 5000);
    };

    window.addEventListener('mobileshop_audit_logged', handleUpdate);
    window.addEventListener('mobileshop_data_updated', handleUpdate);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('mobileshop_pending_audit_updated', handleQueueUpdated);
    window.addEventListener('mobileshop_pending_audit_flushed', handleQueueFlushed);

    return () => {
      window.removeEventListener('mobileshop_audit_logged', handleUpdate);
      window.removeEventListener('mobileshop_data_updated', handleUpdate);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('mobileshop_pending_audit_updated', handleQueueUpdated);
      window.removeEventListener('mobileshop_pending_audit_flushed', handleQueueFlushed);
    };
  }, []);

  // Filter logic
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return logs.filter(log => {
      // Staff filter
      if (selectedStaffId !== 'all' && log.staffId !== selectedStaffId) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }

      // Severity filter
      if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) {
        return false;
      }

      // Date Range filter
      const logDate = new Date(log.timestamp);
      const logDateStr = log.timestamp.split('T')[0];

      if (dateRangeOption === 'today') {
        if (logDateStr !== todayStr) return false;
      } else if (dateRangeOption === 'yesterday') {
        if (logDateStr !== yesterdayStr) return false;
      } else if (dateRangeOption === 'week') {
        if (logDate < sevenDaysAgo) return false;
      } else if (dateRangeOption === 'month') {
        if (logDate < thirtyDaysAgo) return false;
      } else if (dateRangeOption === 'custom') {
        if (customStartDate && logDateStr < customStartDate) return false;
        if (customEndDate && logDateStr > customEndDate) return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const staffMatch = log.staffName.toLowerCase().includes(query) || log.staffRole.toLowerCase().includes(query);
        const actionMatch = log.actionType.toLowerCase().includes(query);
        const summaryMatch = log.summary.toLowerCase().includes(query);
        const invoiceMatch = log.details?.invoiceNumber?.toLowerCase().includes(query);
        const targetMatch = log.details?.targetName?.toLowerCase().includes(query);
        const customerMatch = log.details?.customerName?.toLowerCase().includes(query);
        const reasonMatch = log.details?.reason?.toLowerCase().includes(query);
        const deviceMatch = log.clientDevice?.toLowerCase().includes(query);

        if (!staffMatch && !actionMatch && !summaryMatch && !invoiceMatch && !targetMatch && !customerMatch && !reasonMatch && !deviceMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'timestamp') {
        const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        return sortDirection === 'asc' ? diff : -diff;
      }
      if (sortField === 'staffName') {
        const diff = a.staffName.localeCompare(b.staffName);
        return sortDirection === 'asc' ? diff : -diff;
      }
      if (sortField === 'severity') {
        const diff = a.severity.localeCompare(b.severity);
        return sortDirection === 'asc' ? diff : -diff;
      }
      if (sortField === 'category') {
        const diff = a.category.localeCompare(b.category);
        return sortDirection === 'asc' ? diff : -diff;
      }
      return 0;
    });
  }, [
    logs, 
    selectedStaffId, 
    selectedCategory, 
    selectedSeverity, 
    dateRangeOption, 
    customStartDate, 
    customEndDate, 
    searchQuery,
    sortField,
    sortDirection
  ]);

  // Key KPI metrics calculations
  const stats = useMemo(() => {
    const totalEntries = logs.length;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayEntries = logs.filter(l => l.timestamp.split('T')[0] === todayStr).length;

    const warningCount = logs.filter(l => l.severity === 'warning').length;
    const dangerCount = logs.filter(l => l.severity === 'danger').length;

    let totalMonetaryVolume = 0;
    logs.forEach(l => {
      if (l.details?.amount) {
        totalMonetaryVolume += Math.abs(l.details.amount);
      }
    });

    const uniqueStaffIds = new Set(logs.map(l => l.staffId)).size;

    return {
      totalEntries,
      todayEntries,
      alertsCount: warningCount + dangerCount,
      warningCount,
      dangerCount,
      totalMonetaryVolume,
      activeStaffCount: uniqueStaffIds,
    };
  }, [logs]);

  // Category visual styles helper
  const getCategoryBadge = (category: AuditCategory) => {
    switch (category) {
      case 'sales':
        return { label: 'Sales & Invoices', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'inventory':
        return { label: 'Inventory & Stock', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'cash_drawer':
        return { label: 'Cash Register & Shift', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'purchases':
        return { label: 'Purchases / Restock', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'expenses':
        return { label: 'Expenses', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'auth':
        return { label: 'Auth & Sessions', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
      case 'staff_roles':
        return { label: 'Staff & Security', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'settings':
        return { label: 'Shop Settings', color: 'bg-slate-100 text-slate-700 border-slate-300' };
      default:
        return { label: category, color: 'bg-gray-50 text-gray-700 border-gray-200' };
    }
  };

  // Severity visual styles helper
  const getSeverityBadge = (severity: AuditSeverity) => {
    switch (severity) {
      case 'success':
        return { 
          icon: CheckCircle2, 
          label: 'Success', 
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500' 
        };
      case 'warning':
        return { 
          icon: AlertTriangle, 
          label: 'Warning', 
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500' 
        };
      case 'danger':
        return { 
          icon: XCircle, 
          label: 'High Risk', 
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500' 
        };
      case 'info':
      default:
        return { 
          icon: Info, 
          label: 'Info', 
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          dot: 'bg-sky-500' 
        };
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!canExport) return;
    try {
      const headers = ['Timestamp', 'Staff Name', 'Staff Role', 'Action Type', 'Category', 'Severity', 'Summary', 'Invoice No', 'Amount (Ks)', 'Device Terminal', 'Notes'];
      const rows = filteredLogs.map(l => [
        `"${l.timestamp}"`,
        `"${l.staffName.replace(/"/g, '""')}"`,
        `"${l.staffRole}"`,
        `"${l.actionType}"`,
        `"${l.category}"`,
        `"${l.severity}"`,
        `"${l.summary.replace(/"/g, '""')}"`,
        `"${l.details?.invoiceNumber || ''}"`,
        `"${l.details?.amount || ''}"`,
        `"${(l.clientDevice || '').replace(/"/g, '""')}"`,
        `"${(l.details?.notes || l.details?.reason || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Audit_Log_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      AuditLogger.log({
        actionType: 'SETTINGS_UPDATED',
        category: 'settings',
        severity: 'info',
        summary: `Exported ${filteredLogs.length} audit logs to CSV report`,
        staffUser: currentStaffUser,
        details: { notes: `Filter: ${selectedCategory} | ${selectedSeverity}` }
      });
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

  // Export to JSON
  const handleExportJSON = () => {
    if (!canExport) return;
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `audit_trail_history_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Failed to export JSON:', err);
    }
  };

  // Clear Audit Trail (Owner Only)
  const handleClearAuditLogs = () => {
    if (!canClearLogs) return;
    StorageService.clearAuditLogs();
    AuditLogger.log({
      actionType: 'SETTINGS_UPDATED',
      category: 'staff_roles',
      severity: 'danger',
      summary: 'Cleared historic audit logs repository (Authorized by Store Owner)',
      staffUser: currentStaffUser,
      details: { notes: 'Prior logs were purged by owner.' }
    });
    setLogs(StorageService.getAuditLogs());
    setShowClearConfirmModal(false);
    setSelectedLogForDetails(null);
  };

  // Owner Auto-Purge (180 Days / 6 Months Retention Cleanup)
  const handleTriggerAutoPurge = () => {
    if (currentStaffUser.role !== 'Owner') return;
    try {
      const result = AuditLogger.purgeArchivedAuditLogs(currentStaffUser, 180);
      setLogs(StorageService.getAuditLogs());
      setPurgeFeedback(`Purge Successful: Cleaned ${result.purgedCount} logs older than 180 days (6 months). ${result.remainingCount} active logs preserved.`);
      setShowAutoPurgeModal(false);
      setTimeout(() => setPurgeFeedback(null), 6000);
    } catch (err: any) {
      alert(`Purge Error: ${err.message}`);
    }
  };

  // Manual Flush of Offline Queue
  const handleManualFlushQueue = async () => {
    if (isFlushingQueue) return;
    setIsFlushingQueue(true);
    setFlushResultMsg(null);
    try {
      const syncService = FirestoreSyncService.getInstance();
      const res = await syncService.flushPendingAuditLogs();
      const updatedQueue = syncService.getPendingAuditLogs();
      setPendingQueueCount(updatedQueue.length);
      setFlushResultMsg(`Sync complete: ${res.flushed} logs uploaded to Firestore. (${res.remaining} remaining)`);
      setTimeout(() => setFlushResultMsg(null), 5000);
    } catch (err: any) {
      setFlushResultMsg(`Queue sync failed: ${err.message}`);
    } finally {
      setIsFlushingQueue(false);
    }
  };

  // Copy JSON Details
  const handleCopyJson = (obj: any) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Open related invoice
  const handleOpenRelatedInvoice = (invoiceNumber?: string, targetId?: string) => {
    if (!onViewInvoice) return;
    const sales = StorageService.getSales();
    const foundSale = sales.find(s => s.invoiceNumber === invoiceNumber || s.id === targetId);
    if (foundSale) {
      onViewInvoice(foundSale);
      setSelectedLogForDetails(null);
    } else {
      alert(`Invoice ${invoiceNumber || targetId} not found in active records.`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-md shadow-slate-900/10">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                User Activity & Audit Log History
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Tamper-Evident Monitoring
                </span>
              </h1>
              <p className="text-sm text-slate-500">
                Chronological security trail tracking sales, price overrides, inventory reconciliations, and staff operations.
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={refreshLogs}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors active:scale-95"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
            <span>Refresh</span>
          </button>

          {canExport && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 rounded-xl transition-all active:scale-95 shadow-xs"
                title="Export filtered records to CSV spreadsheet"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handleExportJSON}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-all active:scale-95 shadow-xs"
                title="Download raw JSON backup"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>JSON</span>
              </button>
            </div>
          )}

          {/* Security & TTL Architecture Documentation Button */}
          <button
            onClick={() => setShowTtlInfoModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition-all active:scale-95 shadow-xs"
            title="View Data Immutability Rules & Firestore TTL Policy"
          >
            <Shield className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Security & TTL</span>
          </button>

          {/* Owner Auto-Purge (>6 Months) */}
          {canClearLogs && (
            <button
              onClick={() => setShowAutoPurgeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl transition-colors"
              title="Auto-Purge logs older than 180 days (6 months)"
            >
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Auto-Purge (&gt;6 Mos)</span>
              {logsOlderThan180Days.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-800">
                  {logsOlderThan180Days.length}
                </span>
              )}
            </button>
          )}

          {canClearLogs && (
            <button
              onClick={() => setShowClearConfirmModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="Purge all logs (Owner only)"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Purge All</span>
            </button>
          )}
        </div>
      </div>

      {/* Security, Immutability & Offline Queue Status Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Immutability Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            <span>Append-Only Immutability Active</span>
          </div>

          {/* Network & Offline Queue Badge */}
          {isOnline ? (
            pendingQueueCount > 0 ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/90">
                <UploadCloud className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                <span>{pendingQueueCount} logs in offline queue (pending_audit_logs)</span>
                <button
                  onClick={handleManualFlushQueue}
                  disabled={isFlushingQueue}
                  className="ml-1 px-2.5 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium transition-colors flex items-center gap-1 shadow-xs"
                >
                  <RefreshCw className={`w-3 h-3 ${isFlushingQueue ? 'animate-spin' : ''}`} />
                  <span>{isFlushingQueue ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online (Offline Queue Synced)</span>
              </div>
            )
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
              <span>Offline Mode ({pendingQueueCount} queued locally in pending_audit_logs)</span>
            </div>
          )}

          {/* TTL Auto-Purge Policy Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>180-Day TTL Retention ({logsOlderThan180Days.length} eligible for auto-purge)</span>
          </div>
        </div>

        <button
          onClick={() => setShowTtlInfoModal(true)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 self-start md:self-auto"
        >
          <span>Firestore TTL &amp; Rules Setup</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Dynamic Feedback Banner */}
      {purgeFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-800 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{purgeFeedback}</span>
          </div>
          <button onClick={() => setPurgeFeedback(null)} className="text-emerald-700 hover:text-emerald-900 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {flushResultMsg && (
        <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sm font-semibold text-sky-800 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-sky-600 shrink-0" />
            <span>{flushResultMsg}</span>
          </div>
          <button onClick={() => setFlushResultMsg(null)} className="text-sky-700 hover:text-sky-900 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Logs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Total Activity Events</span>
            <div className="text-2xl font-bold text-slate-900">{stats.totalEntries.toLocaleString()}</div>
            <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <span>{stats.todayEntries} recorded today</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <History className="w-6 h-6 text-slate-600" />
          </div>
        </div>

        {/* Security & Risk Alerts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Security & Risk Flags</span>
            <div className="text-2xl font-bold text-amber-600">{stats.alertsCount}</div>
            <div className="text-xs text-slate-600 font-medium">
              {stats.dangerCount} Critical / {stats.warningCount} Warnings
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Audited Financial Volume */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Audited Volume Tracked</span>
            <div className="text-2xl font-bold text-emerald-700">
              {formatCurrency(stats.totalMonetaryVolume, settings.currencySymbol)}
            </div>
            <div className="text-xs text-slate-600 font-medium">Sales, refunds & petty cash</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Staff Monitored */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Staff In Audit Trail</span>
            <div className="text-2xl font-bold text-indigo-900">{stats.activeStaffCount} Operator{stats.activeStaffCount > 1 ? 's' : ''}</div>
            <div className="text-xs text-indigo-700 font-medium">Across all roles & terminals</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Shield className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff, invoice #, action type, product name, device..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          {/* View Mode & Sorter Switcher */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
            {/* View Mode Toggle */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'timeline'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Timeline Feed
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tabular Grid
              </button>
            </div>

            {/* Sort Direction Toggle */}
            <button
              onClick={() => setSortDirection(d => d === 'desc' ? 'asc' : 'desc')}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              title="Reverse chronological order"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>{sortDirection === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>

        {/* Multi-Dimensional Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Staff Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Staff Member</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Staff Members ({staffUsers.length})</option>
              {staffUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Activity Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Categories</option>
              <option value="sales">Sales & POS Checkout</option>
              <option value="inventory">Inventory & Stock Pricing</option>
              <option value="cash_drawer">Cash Register & Shift Float</option>
              <option value="purchases">Purchases & Supplier Restock</option>
              <option value="expenses">Shop Expenses</option>
              <option value="auth">Staff Login & Terminal Locks</option>
              <option value="staff_roles">Security & User Permissions</option>
              <option value="settings">Shop Profile & Settings</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Severity / Risk Level</label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Severities</option>
              <option value="info">Info (Standard operations)</option>
              <option value="success">Success (Completed milestones)</option>
              <option value="warning">Warning (Adjustments & Price changes)</option>
              <option value="danger">High Risk (Deletions & Refunds)</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Timeframe</label>
            <select
              value={dateRangeOption}
              onChange={(e) => setDateRangeOption(e.target.value as DateRangeOption)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Time History</option>
              <option value="today">Today Only</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Past 7 Days</option>
              <option value="month">Past 30 Days</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Row */}
        {dateRangeOption === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 bg-slate-50/70 p-3 rounded-xl border border-dashed border-slate-200">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Select Date Range:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
              />
            </div>
          </div>
        )}

        {/* Active Filter Badges */}
        {(selectedStaffId !== 'all' || selectedCategory !== 'all' || selectedSeverity !== 'all' || dateRangeOption !== 'all' || searchQuery) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <span className="text-slate-400 font-medium">Active Filters:</span>
            {selectedStaffId !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Staff: {staffUsers.find(u => u.id === selectedStaffId)?.name || selectedStaffId}
                <button onClick={() => setSelectedStaffId('all')} className="hover:text-slate-900 font-bold ml-1">×</button>
              </span>
            )}
            {selectedCategory !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Category: {selectedCategory}
                <button onClick={() => setSelectedCategory('all')} className="hover:text-slate-900 font-bold ml-1">×</button>
              </span>
            )}
            {selectedSeverity !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Severity: {selectedSeverity}
                <button onClick={() => setSelectedSeverity('all')} className="hover:text-slate-900 font-bold ml-1">×</button>
              </span>
            )}
            {dateRangeOption !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Date: {dateRangeOption}
                <button onClick={() => setDateRangeOption('all')} className="hover:text-slate-900 font-bold ml-1">×</button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Query: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-slate-900 font-bold ml-1">×</button>
              </span>
            )}
            <button
              onClick={() => {
                setSelectedStaffId('all');
                setSelectedCategory('all');
                setSelectedSeverity('all');
                setDateRangeOption('all');
                setSearchQuery('');
              }}
              className="text-indigo-600 hover:text-indigo-800 font-semibold underline ml-2"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing <strong className="text-slate-800">{filteredLogs.length}</strong> of {logs.length} logged activities
        </span>
        <span className="text-slate-400">All timestamps recorded in Myanmar Standard Time (MMT)</span>
      </div>

      {/* Content View: Timeline Stream vs Tabular Grid */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <History className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">No activity logs found matching your criteria</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try resetting your filters or clearing your search term to see the complete audit trail history.
          </p>
          <button
            onClick={() => {
              setSelectedStaffId('all');
              setSelectedCategory('all');
              setSelectedSeverity('all');
              setDateRangeOption('all');
              setSearchQuery('');
            }}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all"
          >
            Clear Active Filters
          </button>
        </div>
      ) : viewMode === 'timeline' ? (
        /* Timeline Feed View */
        <div className="relative border-l-2 border-slate-200/80 ml-4 sm:ml-6 pl-5 sm:pl-7 space-y-4">
          {filteredLogs.map((log) => {
            const cat = getCategoryBadge(log.category);
            const sev = getSeverityBadge(log.severity);
            const SevIcon = sev.icon;

            return (
              <div 
                key={log.id} 
                className="relative group transition-all"
              >
                {/* Timeline node icon */}
                <div className={`absolute -left-[31px] sm:-left-[39px] top-4 w-7 h-7 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow-xs ${sev.bg}`}>
                  <SevIcon className="w-3.5 h-3.5" />
                </div>

                {/* Audit Card */}
                <div className="bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md transition-all p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Category Chip */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${cat.color}`}>
                        {cat.label}
                      </span>

                      {/* Severity Chip */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${sev.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {sev.label}
                      </span>

                      {/* Action Code Tag */}
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {log.actionType}
                      </span>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDateTime(log.timestamp)}</span>
                    </div>
                  </div>

                  {/* Summary Text */}
                  <div className="text-sm font-semibold text-slate-900 leading-snug">
                    {log.summary}
                  </div>

                  {/* Contextual Badges and Detail Highlights */}
                  {log.details && (
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                      {log.details.invoiceNumber && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-medium border border-emerald-200/70">
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          Invoice: {log.details.invoiceNumber}
                        </span>
                      )}

                      {log.details.amount !== undefined && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                          Amount: {formatCurrency(log.details.amount, settings.currencySymbol)}
                        </span>
                      )}

                      {log.details.paymentMethod && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 font-medium border border-sky-200/70">
                          Pay: {log.details.paymentMethod.toUpperCase()}
                        </span>
                      )}

                      {log.details.customerName && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                          Customer: {log.details.customerName}
                        </span>
                      )}

                      {log.details.previousValue !== undefined && log.details.newValue !== undefined && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/70 font-mono">
                          {typeof log.details.previousValue === 'object' ? JSON.stringify(log.details.previousValue) : String(log.details.previousValue)} → {typeof log.details.newValue === 'object' ? JSON.stringify(log.details.newValue) : String(log.details.newValue)}
                        </span>
                      )}

                      {log.details.reason && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 font-medium border border-rose-200/70">
                          Reason: {log.details.reason}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer metadata: Staff profile & Device Fingerprint */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">
                        {log.staffName.charAt(0)}
                      </div>
                      <span className="font-medium text-slate-800">{log.staffName}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500 font-medium">{log.staffRole}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {log.clientDevice && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Monitor className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[200px]">{log.clientDevice}</span>
                        </div>
                      )}

                      <button
                        onClick={() => setSelectedLogForDetails(log)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Payload</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tabular Grid View */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => {
                      if (sortField === 'timestamp') setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortField('timestamp'); setSortDirection('desc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Timestamp</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => {
                      if (sortField === 'staffName') setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortField('staffName'); setSortDirection('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Staff Operator</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Action Type</th>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => {
                      if (sortField === 'category') setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortField('category'); setSortDirection('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Category</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => {
                      if (sortField === 'severity') setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortField('severity'); setSortDirection('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Severity</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4 min-w-[260px]">Summary & Context</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map(log => {
                  const cat = getCategoryBadge(log.category);
                  const sev = getSeverityBadge(log.severity);
                  const SevIcon = sev.icon;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[9px]">
                            {log.staffName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{log.staffName}</div>
                            <div className="text-[10px] text-slate-400">{log.staffRole}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                          {log.actionType}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${cat.color}`}>
                          {cat.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${sev.bg}`}>
                          <SevIcon className="w-3 h-3" />
                          {sev.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 line-clamp-1">{log.summary}</div>
                        {log.details?.invoiceNumber && (
                          <span className="text-[10px] font-semibold text-emerald-600">
                            Inv #{log.details.invoiceNumber} • {formatCurrency(log.details.amount || 0, settings.currencySymbol)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLogForDetails(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Modal Drawer */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-emerald-400 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Audit Record Inspector</h3>
                  <p className="text-xs text-slate-500 font-mono">ID: {selectedLogForDetails.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {/* Event Overview Banner */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Category Chip */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${getCategoryBadge(selectedLogForDetails.category).color}`}>
                    {getCategoryBadge(selectedLogForDetails.category).label}
                  </span>
                  {/* Severity Chip */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${getSeverityBadge(selectedLogForDetails.severity).bg}`}>
                    {getSeverityBadge(selectedLogForDetails.severity).label}
                  </span>
                  {/* Action Type */}
                  <span className="font-mono text-xs text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    {selectedLogForDetails.actionType}
                  </span>
                </div>
                <div className="text-base font-semibold text-slate-900 pt-1">
                  {selectedLogForDetails.summary}
                </div>
              </div>

              {/* Staff and Terminal Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="text-slate-500 font-medium">Logged Staff Operator</div>
                  <div className="text-sm font-bold text-slate-900">{selectedLogForDetails.staffName}</div>
                  <div className="text-slate-500">Role: <strong className="text-slate-800">{selectedLogForDetails.staffRole}</strong> (ID: {selectedLogForDetails.staffId})</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="text-slate-500 font-medium">Exact Timestamp & Terminal</div>
                  <div className="text-sm font-bold text-slate-900">{formatDateTime(selectedLogForDetails.timestamp)}</div>
                  <div className="text-slate-500 flex items-center gap-1 font-mono text-[11px] truncate">
                    <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {selectedLogForDetails.clientDevice || 'Main POS Terminal'}
                  </div>
                </div>
              </div>

              {/* Key Highlights if available */}
              {selectedLogForDetails.details && Object.keys(selectedLogForDetails.details).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recorded Event Payload</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {selectedLogForDetails.details.invoiceNumber && (
                      <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex justify-between items-center">
                        <span className="text-emerald-700 font-medium">Invoice Number:</span>
                        <span className="font-bold text-emerald-900 font-mono">{selectedLogForDetails.details.invoiceNumber}</span>
                      </div>
                    )}
                    {selectedLogForDetails.details.amount !== undefined && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Monetary Value:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(selectedLogForDetails.details.amount, settings.currencySymbol)}</span>
                      </div>
                    )}
                    {selectedLogForDetails.details.paymentMethod && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Payment Method:</span>
                        <span className="font-bold text-slate-900 uppercase">{selectedLogForDetails.details.paymentMethod}</span>
                      </div>
                    )}
                    {selectedLogForDetails.details.customerName && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Customer:</span>
                        <span className="font-bold text-slate-900">{selectedLogForDetails.details.customerName}</span>
                      </div>
                    )}
                    {selectedLogForDetails.details.targetName && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center col-span-1 sm:col-span-2">
                        <span className="text-slate-600 font-medium">Target Item:</span>
                        <span className="font-bold text-slate-900">{selectedLogForDetails.details.targetName}</span>
                      </div>
                    )}
                    {selectedLogForDetails.details.reason && (
                      <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 flex justify-between items-center col-span-1 sm:col-span-2">
                        <span className="text-amber-800 font-medium">Reason:</span>
                        <span className="font-bold text-amber-950">{selectedLogForDetails.details.reason}</span>
                      </div>
                    )}
                    {selectedLogForDetails.details.notes && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 col-span-1 sm:col-span-2">
                        <span className="text-slate-500 font-medium block mb-1">Additional Notes:</span>
                        <span className="text-slate-800">{selectedLogForDetails.details.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Raw JSON Inspector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Raw Audit JSON Payload</span>
                  <button
                    onClick={() => handleCopyJson(selectedLogForDetails)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto max-h-48 select-all">
                  {JSON.stringify(selectedLogForDetails, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div>
                {selectedLogForDetails.details?.invoiceNumber && (
                  <button
                    onClick={() => handleOpenRelatedInvoice(selectedLogForDetails.details?.invoiceNumber, selectedLogForDetails.details?.targetId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>View Related Invoice</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Purge Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4 animate-scaleUp text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Purge Entire Audit Log History?</h3>
              <p className="text-xs text-slate-600 mt-1">
                This action will delete all recorded activity trails from local storage. An immutable security record of this clear action will be created in its place.
              </p>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 text-left space-y-1 font-medium">
              <div>• Restricted to Store Owner only</div>
              <div>• Ensure you have exported a CSV/JSON backup first</div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAuditLogs}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs"
              >
                Confirm Full Purge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner Auto-Purge Modal (180 Days / 6 Months Retention) */}
      {showAutoPurgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-amber-200 space-y-5 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Auto-Purging: 180-Day Retention Cleanup</h3>
                <p className="text-xs text-slate-500">Prevent storage bloat by clearing archived logs older than 6 months</p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600 font-medium">Current Retention Window:</span>
                <span className="font-bold text-slate-900">180 Days (6 Months)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600 font-medium">Cutoff Timestamp:</span>
                <span className="font-bold text-slate-900">{new Date(cutoff180Days).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600 font-medium">Records Eligible for Purge (&gt;180 days):</span>
                <span className={`font-bold ${logsOlderThan180Days.length > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                  {logsOlderThan180Days.length} records
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 font-medium">Records Retained (&lt;180 days):</span>
                <span className="font-bold text-emerald-700">{logs.length - logsOlderThan180Days.length} records</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-700" />
                <span>Security &amp; Audit Compliance Guarantee</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Logs within the last 180 days remain untouched. An immutable audit record will be logged documenting this maintenance operation.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowAutoPurgeModal(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerAutoPurge}
                disabled={logsOlderThan180Days.length === 0}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors shadow-xs"
              >
                {logsOlderThan180Days.length === 0 ? 'No Stale Logs to Purge' : `Purge ${logsOlderThan180Days.length} Archived Logs`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security & TTL Architecture Guide Modal */}
      {showTtlInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-indigo-200 space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Security &amp; Reliability Architecture</h3>
                  <p className="text-xs text-slate-500">Data Immutability, Offline Queueing &amp; Auto-Purging (TTL)</p>
                </div>
              </div>
              <button
                onClick={() => setShowTtlInfoModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Feature 1: Data Immutability */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-950 text-sm">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  <span>1. Data Immutability (Firestore Rules)</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  Both <code className="px-1 py-0.5 bg-white rounded border border-indigo-200 text-indigo-800">activityLogs</code> and <code className="px-1 py-0.5 bg-white rounded border border-indigo-200 text-indigo-800">auditLogs</code> collections are strictly append-only. No user, regardless of role, can modify or delete existing audit entries once created in Firestore.
                </p>
                <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[11px] overflow-x-auto">
                  <div>match /activityLogs/{'{logId}'} &#123;</div>
                  <div className="pl-4 text-slate-400">// Authenticated users can read and record activity events</div>
                  <div className="pl-4">allow read: if isAuthenticated();</div>
                  <div className="pl-4">allow create: if isAuthenticated();</div>
                  <div className="pl-4 text-rose-400">// Strict Immutability: updates and deletes are permanently forbidden</div>
                  <div className="pl-4 text-rose-400">allow update, delete: if false;</div>
                  <div>&#125;</div>
                </div>
              </div>

              {/* Feature 2: Offline Queueing & Sync */}
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                  <UploadCloud className="w-4 h-4 text-amber-600" />
                  <span>2. Offline Queueing &amp; Auto-Sync</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  When network connection drops, logs are automatically queued into <code className="px-1 py-0.5 bg-white rounded border border-amber-200 text-amber-900 font-semibold">localStorage.pending_audit_logs</code>. An event listener detects when connection is restored (<code className="px-1 py-0.5 bg-white rounded border border-amber-200 text-amber-900">window.online</code>) and flushes queued logs to Firestore immediately.
                </p>
                <div className="p-3 bg-white rounded-xl border border-amber-200/80 flex items-center justify-between">
                  <span className="text-slate-700 font-medium">Current Queue Buffer:</span>
                  <span className="font-bold text-amber-900">{pendingQueueCount} logs queued</span>
                </div>
              </div>

              {/* Feature 3: Auto-Purging (TTL / Cleanup) */}
              <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sky-950 text-sm">
                  <Clock className="w-4 h-4 text-sky-600" />
                  <span>3. Auto-Purging &amp; TTL Setup Instructions</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  Every log entry includes an <code className="px-1 py-0.5 bg-white rounded border border-sky-200 text-sky-900 font-mono">expireAt</code> field set to exactly 180 days from creation. To enable Firestore automated backend TTL deletion, configure the policy via Google Cloud CLI:
                </p>
                <div className="bg-slate-900 text-sky-300 p-3 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                  gcloud firestore fields ttls update expireAt \<br />
                  &nbsp;&nbsp;--collection-group=activityLogs \<br />
                  &nbsp;&nbsp;--enable-ttl
                </div>
                <p className="text-[11px] text-slate-500">
                  Alternatively, in the Firebase Console: Navigate to <strong>Firestore Database</strong> &gt; <strong>Data</strong> &gt; Click the three dots on <code className="font-mono">activityLogs</code> &gt; select <strong>Manage TTL</strong> &gt; Enter field name: <code className="font-mono font-bold text-slate-800">expireAt</code>.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowTtlInfoModal(false)}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
