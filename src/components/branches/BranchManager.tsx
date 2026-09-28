import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, 
  Store, 
  ArrowRightLeft, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle, 
  Clock, 
  Truck, 
  AlertTriangle, 
  XCircle, 
  Printer, 
  Package, 
  MapPin, 
  Phone, 
  User, 
  Users,
  ChevronRight, 
  ChevronDown, 
  ExternalLink,
  ShieldCheck,
  Edit2,
  Trash2,
  Check,
  X,
  FileText,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  QrCode
} from 'lucide-react';
import { 
  StoreLocation, 
  BranchInventory, 
  StockTransfer, 
  StockTransferItem, 
  TransferStatus, 
  Product, 
  StaffUser, 
  ShopSettings, 
  DamageLog 
} from '../../types';
import { StorageService } from '../../utils/storage';
import { firestoreSync } from '../../services/firestoreSyncService';
import { formatCurrency } from '../../utils/formatters';
import { TransferDeliveryNoteModal } from './TransferDeliveryNoteModal';

interface BranchManagerProps {
  products: Product[];
  currentStaffUser?: StaffUser;
  settings: ShopSettings;
  staffUsers?: StaffUser[];
  onSaveStaffUser?: (user: StaffUser) => void;
  onOpenDamageQuarantine?: () => void;
}

export const BranchManager: React.FC<BranchManagerProps> = ({
  products,
  currentStaffUser,
  settings,
  staffUsers,
  onSaveStaffUser,
  onOpenDamageQuarantine,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'transfers' | 'locations' | 'catalog_matrix' | 'transit_monitoring'>('transfers');
  
  // Data States
  const [locations, setLocations] = useState<StoreLocation[]>(() => StorageService.getLocations());
  const [transfers, setTransfers] = useState<StockTransfer[]>(() => StorageService.getStockTransfers());
  const [branchInventory, setBranchInventory] = useState<BranchInventory[]>(() => StorageService.getBranchInventoryList());
  const [activeLocationId, setActiveLocationId] = useState<string>(() => StorageService.getActiveLocationId());
  const [staffList, setStaffList] = useState<StaffUser[]>(() => staffUsers && staffUsers.length > 0 ? staffUsers : StorageService.getStaffUsers());
  const [assigningStaffLocation, setAssigningStaffLocation] = useState<StoreLocation | null>(null);

  useEffect(() => {
    if (staffUsers && staffUsers.length > 0) {
      setStaffList(staffUsers);
    }
  }, [staffUsers]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // Modals
  const [isNewTransferModalOpen, setIsNewTransferModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StoreLocation | null>(null);
  
  // Handshake Step Modals
  const [transferToDispatch, setTransferToDispatch] = useState<StockTransfer | null>(null);
  const [transferToReceive, setTransferToReceive] = useState<StockTransfer | null>(null);
  const [transferToPrint, setTransferToPrint] = useState<StockTransfer | null>(null);
  const [rejectionModalTransfer, setRejectionModalTransfer] = useState<StockTransfer | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Matrix inline edit state
  const [editingMatrixEntry, setEditingMatrixEntry] = useState<{ productId: string; locationId: string; minThreshold: number; localPrice?: number } | null>(null);

  // Reload data on custom events
  const reloadData = () => {
    setLocations(StorageService.getLocations());
    setTransfers(StorageService.getStockTransfers());
    setBranchInventory(StorageService.getBranchInventoryList());
    setActiveLocationId(StorageService.getActiveLocationId());
    setStaffList(StorageService.getStaffUsers());
  };

  const handleToggleStaffBranch = (user: StaffUser, location: StoreLocation) => {
    const isCurrentlyAssigned = user.branchId === location.id;
    const currentAllowed = user.allowedLocationIds || [];
    
    let updatedBranchId: string | undefined = user.branchId;
    let updatedBranchName: string | undefined = user.branchName;
    let updatedAllowed = [...currentAllowed];

    if (isCurrentlyAssigned) {
      updatedBranchId = undefined;
      updatedBranchName = undefined;
      updatedAllowed = updatedAllowed.filter(id => id !== location.id);
    } else {
      updatedBranchId = location.id;
      updatedBranchName = location.name;
      if (!updatedAllowed.includes(location.id)) {
        updatedAllowed.push(location.id);
      }
    }

    const updatedUser: StaffUser = {
      ...user,
      branchId: updatedBranchId,
      branchName: updatedBranchName,
      allowedLocationIds: updatedAllowed.length > 0 ? updatedAllowed : undefined,
    };

    StorageService.saveStaffUser(updatedUser);
    if (onSaveStaffUser) {
      onSaveStaffUser(updatedUser);
    }
    setStaffList(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  useEffect(() => {
    const handleStorageChange = () => reloadData();
    window.addEventListener('mobileshop_data_updated', handleStorageChange);
    window.addEventListener('mobileshop_location_changed', handleStorageChange);
    return () => {
      window.removeEventListener('mobileshop_data_updated', handleStorageChange);
      window.removeEventListener('mobileshop_location_changed', handleStorageChange);
    };
  }, []);

  // Filtered Transfers
  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      const matchesSearch = 
        t.transferNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.fromLocationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.toLocationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.items.some(i => i.productName.toLowerCase().includes(searchQuery.toLowerCase()) || i.brand.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesLocation = locationFilter === 'all' || t.fromLocationId === locationFilter || t.toLocationId === locationFilter;

      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [transfers, searchQuery, statusFilter, locationFilter]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const inTransit = transfers.filter(t => t.status === 'dispatched').length;
    const pendingApproval = transfers.filter(t => t.status === 'requested').length;
    const completed = transfers.filter(t => t.status === 'received').length;
    const withDiscrepancy = transfers.filter(t => t.items.some(i => (i.discrepancyQty || 0) > 0)).length;
    const totalLocations = locations.length;
    const totalWarehouses = locations.filter(l => l.type === 'warehouse').length;
    const totalBranches = locations.filter(l => l.type === 'branch').length;

    return { inTransit, pendingApproval, completed, withDiscrepancy, totalLocations, totalWarehouses, totalBranches };
  }, [transfers, locations]);

  // -------------------------------------------------------------------------
  // Handshake Handlers
  // -------------------------------------------------------------------------

  const handleApprove = async (transfer: StockTransfer) => {
    if (!window.confirm(`Approve transfer request ${transfer.transferNumber}? Origin warehouse can then dispatch goods.`)) return;
    try {
      const staffInfo = {
        staffId: currentStaffUser?.id || 'staff_owner',
        name: currentStaffUser?.name || settings.currentStaffName || 'Store Manager',
      };
      const updated = StorageService.approveStockTransfer(transfer.id, staffInfo);
      await firestoreSync.syncStockTransfer(updated);
      reloadData();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectionModalTransfer) return;
    try {
      const staffInfo = {
        staffId: currentStaffUser?.id || 'staff_owner',
        name: currentStaffUser?.name || settings.currentStaffName || 'Store Manager',
      };
      const updated = StorageService.rejectStockTransfer(rejectionModalTransfer.id, staffInfo, rejectionReason || 'Declined by warehouse manager');
      await firestoreSync.executeAtomicTransferReject(updated);
      setRejectionModalTransfer(null);
      setRejectionReason('');
      reloadData();
    } catch (err: any) {
      alert(`Rejection failed: ${err.message}`);
    }
  };

  // -------------------------------------------------------------------------
  // Location CRUD Handlers
  // -------------------------------------------------------------------------
  const handleSaveLocation = (locData: Partial<StoreLocation>) => {
    if (!locData.name || !locData.code) {
      alert('Please provide location Name and Code.');
      return;
    }

    const newLoc: StoreLocation = {
      id: editingLocation ? editingLocation.id : `loc_${locData.type === 'warehouse' ? 'wh' : 'br'}_${Date.now()}`,
      code: locData.code.toUpperCase().trim(),
      name: locData.name.trim(),
      type: locData.type || 'branch',
      address: locData.address || '',
      phone: locData.phone || '',
      managerName: locData.managerName || '',
      isActive: locData.isActive ?? true,
      isDefault: locData.isDefault ?? false,
      createdAt: editingLocation ? editingLocation.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // If marked default, unset others
    let updatedLocs = [...locations];
    if (newLoc.isDefault) {
      updatedLocs = updatedLocs.map(l => ({ ...l, isDefault: false }));
    }

    const idx = updatedLocs.findIndex(l => l.id === newLoc.id);
    if (idx >= 0) {
      updatedLocs[idx] = newLoc;
    } else {
      updatedLocs.push(newLoc);
    }

    StorageService.saveLocations(updatedLocs);
    firestoreSync.syncLocation(newLoc);
    setIsLocationModalOpen(false);
    setEditingLocation(null);
    reloadData();
  };

  const handleDeleteLocation = (locId: string) => {
    if (locations.length <= 1) {
      alert('You cannot delete the only remaining location.');
      return;
    }
    const loc = locations.find(l => l.id === locId);
    if (!window.confirm(`Are you sure you want to delete "${loc?.name}" (${loc?.code})?`)) return;
    
    StorageService.deleteLocation(locId);
    reloadData();
  };

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* Page Title & Navigation Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 sm:p-6 rounded-3xl text-white shadow-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Multi-Branch Architecture
            </span>
            <span className="text-xs text-slate-400">
              Global Catalog with Localized Stock & Serial Tracking
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <span>Multi-Branch & Central Warehouse Hub</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Centralized product master with isolated branch inventory, 3-way transfer handshake, serial transit tracking, and automated transit shrinkage protection.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditingLocation(null);
              setIsLocationModalOpen(true);
            }}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Branch / Warehouse</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewTransferModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-900/30 active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>New Stock Transfer</span>
          </button>
        </div>
      </div>

      {/* Network Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Operating Network</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.totalLocations}</span>
            <span className="text-[11px] text-slate-500 font-medium">({stats.totalWarehouses} WH • {stats.totalBranches} Stores)</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 uppercase">Active In-Transit</span>
            <Truck className="w-4 h-4 text-blue-500 animate-pulse" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-700">{stats.inTransit}</span>
            <span className="text-[11px] text-blue-600 font-medium">shipments moving</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 uppercase">Pending Approvals</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700">{stats.pendingApproval}</span>
            <span className="text-[11px] text-amber-600 font-medium">transfer requests</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-600 uppercase">Transit Shrinkage</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-700">{stats.withDiscrepancy}</span>
            <span className="text-[11px] text-rose-600 font-medium">discrepancy reports</span>
          </div>
        </div>
      </div>

      {/* Main Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('transfers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'transfers'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
          <span>Inter-Branch Stock Transfers</span>
          {stats.inTransit > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
              {stats.inTransit}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('locations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'locations'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Building2 className="w-4 h-4 text-slate-600" />
          <span>Branches & Warehouses ({locations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('catalog_matrix')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'catalog_matrix'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Package className="w-4 h-4 text-purple-600" />
          <span>Global Catalog & Stock Matrix</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('transit_monitoring')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'transit_monitoring'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Truck className="w-4 h-4 text-amber-600" />
          <span>In-Transit & Shrinkage Audit</span>
          {stats.withDiscrepancy > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
              {stats.withDiscrepancy}
            </span>
          )}
        </button>
      </div>

      {/* =====================================================================
          TAB 1: INTER-BRANCH STOCK TRANSFERS (3-WAY HANDSHAKE)
          ===================================================================== */}
      {activeSubTab === 'transfers' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transfer #, product, or branch name..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="requested">Requested (Pending Approval)</option>
                <option value="approved">Approved (Ready to Dispatch)</option>
                <option value="dispatched">Dispatched (In Transit)</option>
                <option value="received">Received (Completed)</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Location Filter */}
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">All Locations</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Transfers List */}
          {filteredTransfers.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">No Stock Transfers Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No transfer records match your current search or filters. Click &quot;New Stock Transfer&quot; to initiate a movement between branches.
              </p>
              <button
                type="button"
                onClick={() => setIsNewTransferModalOpen(true)}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Create First Transfer Request
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransfers.map((t) => {
                const isRequested = t.status === 'requested';
                const isApproved = t.status === 'approved';
                const isDispatched = t.status === 'dispatched';
                const isReceived = t.status === 'received';
                const isRejected = t.status === 'rejected';
                const hasDiscrepancy = t.items.some(i => (i.discrepancyQty || 0) > 0);

                return (
                  <div
                    key={t.id}
                    className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-3"
                  >
                    {/* Transfer Top Meta */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                          {t.transferNumber}
                        </span>

                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isReceived
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isDispatched
                            ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                            : isApproved
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : isRequested
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {t.status.toUpperCase()}
                        </span>

                        {hasDiscrepancy && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Discrepancy Logged
                          </span>
                        )}

                        <span className="text-xs text-slate-400">
                          • {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Waybill Print Button */}
                        <button
                          type="button"
                          onClick={() => setTransferToPrint(t)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="Print Waybill / Delivery Note"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Waybill</span>
                        </button>
                      </div>
                    </div>

                    {/* Route Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">From:</span>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-600" />
                          <span className="font-bold text-slate-800">{t.fromLocationName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">To:</span>
                        <div className="flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold text-slate-800">{t.toLocationName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Items Mini Table */}
                    <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-xs">
                      <div className="space-y-1.5">
                        {t.items.map((item) => (
                          <div key={item.productId} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 truncate">{item.productName}</span>
                              <span className="text-[10px] text-slate-500 ml-1.5">({item.brand} • SKU: {item.sku})</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-right">
                              <span className="text-slate-500 text-[11px]">Req: {item.requestedQty}</span>
                              {item.dispatchedQty > 0 && (
                                <span className="font-bold text-blue-700 text-[11px]">Disp: {item.dispatchedQty}</span>
                              )}
                              {item.receivedQty > 0 && (
                                <span className="font-bold text-emerald-700 text-[11px]">Recv: {item.receivedQty}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Step Bar (3-Way Handshake) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500">
                        Requested by: <span className="font-bold text-slate-700">{t.requestedBy.name}</span>
                        {t.dispatchedBy && (
                          <span className="ml-2">| Dispatched by: <span className="font-bold text-blue-700">{t.dispatchedBy.name}</span></span>
                        )}
                        {t.receivedBy && (
                          <span className="ml-2">| Received by: <span className="font-bold text-emerald-700">{t.receivedBy.name}</span></span>
                        )}
                      </div>

                      {/* Step Actions */}
                      <div className="flex items-center gap-2">
                        {isRequested && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectionModalTransfer(t);
                                setRejectionReason('');
                              }}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApprove(t)}
                              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                            >
                              Approve Transfer
                            </button>
                          </>
                        )}

                        {isApproved && (
                          <button
                            type="button"
                            onClick={() => setTransferToDispatch(t)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Dispatch Goods (Scan IMEIs)</span>
                          </button>
                        )}

                        {isDispatched && (
                          <button
                            type="button"
                            onClick={() => setTransferToReceive(t)}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Verify & Receive Stock</span>
                          </button>
                        )}

                        {isReceived && (
                          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            Stock successfully settled
                          </span>
                        )}

                        {isRejected && (
                          <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                            <X className="w-4 h-4" />
                            Declined: {t.rejectionReason}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* =====================================================================
          TAB 2: BRANCHES & WAREHOUSES MANAGEMENT
          ===================================================================== */}
      {activeSubTab === 'locations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Physical Warehouses & Store Branches</h2>
              <p className="text-xs text-slate-500">Each branch maintains an isolated stock ledger and unique cash float.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingLocation(null);
                setIsLocationModalOpen(true);
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Location</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map((loc) => {
              const isWh = loc.type === 'warehouse';
              const isCurrent = loc.id === activeLocationId;
              const branchItems = branchInventory.filter(i => i.locationId === loc.id);
              const totalItemsOnHand = branchItems.reduce((sum, i) => sum + i.onHandStock, 0);

              return (
                <div
                  key={loc.id}
                  className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                      : 'bg-white border-slate-200 shadow-2xs hover:shadow-xs'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          isWh ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isWh ? <Building2 className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-black text-sm text-slate-900">{loc.name}</h3>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {loc.code}
                            </span>
                            <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                              isWh ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {isWh ? 'Central Warehouse' : 'Retail Branch'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLocation(loc);
                            setIsLocationModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Location"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!loc.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLocation(loc.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Location"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Address & Contact */}
                    <div className="space-y-1.5 py-2 text-xs text-slate-600 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{loc.address || 'Address not configured'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{loc.phone || 'Phone not set'}</span>
                      </div>
                      {loc.managerName && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Manager: {loc.managerName}</span>
                        </div>
                      )}
                    </div>

                    {/* Assigned Staff Roster */}
                    {(() => {
                      const assignedStaff = staffList.filter(s => s.branchId === loc.id || (s.allowedLocationIds && s.allowedLocationIds.includes(loc.id)));
                      return (
                        <div className="py-2 px-2.5 bg-slate-50/90 rounded-xl border border-slate-100 mt-2 text-xs">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                              <Users className="w-3 h-3 text-slate-400" />
                              Assigned Staff ({assignedStaff.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => setAssigningStaffLocation(loc)}
                              className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                            >
                              + Assign Staff
                            </button>
                          </div>
                          {assignedStaff.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {assignedStaff.map(st => (
                                <span
                                  key={st.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 shadow-2xs"
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    st.role === 'Owner' ? 'bg-purple-500' :
                                    st.role === 'Manager' ? 'bg-blue-500' :
                                    st.role === 'Inventory_Staff' ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`} />
                                  {st.name}
                                  <span className="text-[9px] text-slate-400 font-mono">({st.role.replace('_', ' ')})</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No specific staff assigned yet</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Stock Metrics & Active Context Status */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Total Stock On-Hand</p>
                      <p className="text-sm font-black text-slate-900">{totalItemsOnHand} units</p>
                    </div>

                    {isCurrent ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-lg border border-emerald-300">
                        Active Terminal
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          StorageService.setActiveLocationId(loc.id);
                          setActiveLocationId(loc.id);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Switch To This
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: GLOBAL CATALOG & LOCALIZED STOCK MATRIX
          ===================================================================== */}
      {activeSubTab === 'catalog_matrix' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">Multi-Branch Catalog Stock Ledger</h2>
              <p className="text-xs text-slate-500">Compare physical on-hand stock and regional price overrides across every location.</p>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog products..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white"
              />
            </div>
          </div>

          {/* Matrix Table */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-white uppercase text-[10px] font-black">
                  <tr>
                    <th className="p-3.5">Product & SKU</th>
                    <th className="p-3.5 text-center">Global Price</th>
                    {locations.map((loc) => (
                      <th key={loc.id} className="p-3.5 text-center border-l border-slate-800">
                        <div>{loc.name}</div>
                        <div className="text-[9px] font-mono opacity-60">[{loc.code}]</div>
                      </th>
                    ))}
                    <th className="p-3.5 text-center border-l border-slate-800">Network Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products
                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.brand.toLowerCase().includes(searchQuery.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())))
                    .slice(0, 50)
                    .map((p) => {
                      const crossStock = StorageService.getCrossBranchStock(p.id);
                      const totalAvail = crossStock.reduce((s, i) => s + i.available, 0);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-3.5">
                            <p className="font-black text-slate-900">{p.name}</p>
                            <p className="text-[10px] text-slate-500">{p.brand} • SKU: {p.sku || 'N/A'}</p>
                          </td>

                          <td className="p-3.5 text-center font-bold text-slate-700">
                            {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                          </td>

                          {locations.map((loc) => {
                            const entry = crossStock.find(c => c.location.id === loc.id);
                            const avail = entry?.available ?? 0;
                            const isZero = avail <= 0;

                            return (
                              <td key={loc.id} className="p-3.5 text-center border-l border-slate-100">
                                <span className={`font-black text-xs px-2 py-0.5 rounded-md ${
                                  isZero ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {avail} avail
                                </span>
                                <p className="text-[9px] text-slate-400 mt-0.5">({entry?.onHand ?? 0} on hand)</p>
                              </td>
                            );
                          })}

                          <td className="p-3.5 text-center font-black text-slate-900 border-l border-slate-200 bg-slate-50/70">
                            <span className="text-sm font-black text-indigo-700">{totalAvail}</span>
                            <span className="text-[10px] text-slate-400 block">units</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: IN-TRANSIT & SHRINKAGE AUDIT MONITORING
          ===================================================================== */}
      {activeSubTab === 'transit_monitoring' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm">Automated Transit Shrinkage Protection Active</h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  When a receiving branch confirms physical receipt, if received items are fewer than dispatched items, an automatic Quarantine Shrinkage Incident is written into the Damage & RMA ledger.
                </p>
              </div>
            </div>

            {onOpenDamageQuarantine && (
              <button
                type="button"
                onClick={onOpenDamageQuarantine}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Open Quarantine RMA Ledger
              </button>
            )}
          </div>

          {/* In-Transit Shipments List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
              Currently In-Transit Between Branches
            </h3>

            {transfers.filter(t => t.status === 'dispatched').length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
                No shipments currently in transit. All transfers have arrived at their destination.
              </div>
            ) : (
              transfers.filter(t => t.status === 'dispatched').map(t => (
                <div key={t.id} className="p-4 bg-white rounded-2xl border border-blue-200 shadow-2xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <Truck className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900">{t.transferNumber}</span>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Moving: {t.fromLocationName} ➔ {t.toLocationName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Dispatched: {t.dispatchedAt ? new Date(t.dispatchedAt).toLocaleString() : 'Recently'} by {t.dispatchedBy?.name}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTransferToReceive(t)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
                  >
                    Receive Shipment
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: NEW STOCK TRANSFER REQUEST
          ===================================================================== */}
      {isNewTransferModalOpen && (
        <NewTransferRequestModal
          locations={locations}
          products={products}
          currentStaffUser={currentStaffUser}
          settings={settings}
          onClose={() => setIsNewTransferModalOpen(false)}
          onSuccess={() => {
            setIsNewTransferModalOpen(false);
            reloadData();
          }}
        />
      )}

      {/* =====================================================================
          MODAL: DISPATCH TRANSFER (Select IMEIs & Mark Dispatched)
          ===================================================================== */}
      {transferToDispatch && (
        <DispatchTransferModal
          transfer={transferToDispatch}
          products={products}
          currentStaffUser={currentStaffUser}
          settings={settings}
          onClose={() => setTransferToDispatch(null)}
          onSuccess={() => {
            setTransferToDispatch(null);
            reloadData();
          }}
        />
      )}

      {/* =====================================================================
          MODAL: RECEIVE TRANSFER (Physical Count & Discrepancy Shrinkage Auto-Logging)
          ===================================================================== */}
      {transferToReceive && (
        <ReceiveTransferModal
          transfer={transferToReceive}
          products={products}
          currentStaffUser={currentStaffUser}
          settings={settings}
          onClose={() => setTransferToReceive(null)}
          onSuccess={() => {
            setTransferToReceive(null);
            reloadData();
          }}
        />
      )}

      {/* =====================================================================
          MODAL: REJECT TRANSFER WITH REASON
          ===================================================================== */}
      {rejectionModalTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <XCircle className="w-5 h-5" />
              <h3 className="font-black text-sm">Decline Stock Transfer Request</h3>
            </div>
            <p className="text-xs text-slate-600">
              Rejecting <strong>{rejectionModalTransfer.transferNumber}</strong> will immediately release the reserved stock back to the origin branch.
            </p>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Reason for Rejection</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Origin warehouse stock low for local demand, alternate model recommended..."
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectionModalTransfer(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT LOCATION
          ===================================================================== */}
      {isLocationModalOpen && (
        <LocationFormModal
          location={editingLocation}
          onClose={() => {
            setIsLocationModalOpen(false);
            setEditingLocation(null);
          }}
          onSave={handleSaveLocation}
        />
      )}

      {/* =====================================================================
          MODAL: PRINT DELIVERY NOTE / WAYBILL
          ===================================================================== */}
      {transferToPrint && (
        <TransferDeliveryNoteModal
          transfer={transferToPrint}
          settings={settings}
          onClose={() => setTransferToPrint(null)}
        />
      )}

      {/* =====================================================================
          MODAL: QUICK STAFF ASSIGNMENT FOR BRANCH
          ===================================================================== */}
      {assigningStaffLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm">Assign Staff to Branch</h3>
                  <p className="text-[11px] text-slate-300">{assigningStaffLocation.name} ({assigningStaffLocation.code})</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setAssigningStaffLocation(null)} 
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Click on staff members below to toggle their assignment for <strong>{assigningStaffLocation.name}</strong>.
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {staffList.map(st => {
                  const isPrimary = st.branchId === assigningStaffLocation.id;
                  const isAllowed = Boolean(st.allowedLocationIds?.includes(assigningStaffLocation.id)) || isPrimary;

                  return (
                    <div
                      key={st.id}
                      onClick={() => handleToggleStaffBranch(st, assigningStaffLocation)}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                        isPrimary
                          ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20'
                          : isAllowed
                          ? 'bg-slate-50 border-slate-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white ${st.avatarColor || 'bg-slate-600'}`}>
                          {st.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-xs text-slate-900">{st.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-500 font-mono">@{st.username || 'user'}</span>
                            <span className="text-[10px] font-bold text-slate-400">•</span>
                            <span className="text-[10px] font-semibold text-slate-600">{st.role.replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isPrimary ? (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Primary
                          </span>
                        ) : isAllowed ? (
                          <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold">
                            Authorized
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400 text-[10px] font-medium">
                            + Assign
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setAssigningStaffLocation(null)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// =============================================================================
// SUB-COMPONENT: NEW TRANSFER REQUEST MODAL
// =============================================================================

interface NewTransferRequestModalProps {
  locations: StoreLocation[];
  products: Product[];
  currentStaffUser?: StaffUser;
  settings: ShopSettings;
  onClose: () => void;
  onSuccess: () => void;
}

const NewTransferRequestModal: React.FC<NewTransferRequestModalProps> = ({
  locations,
  products,
  currentStaffUser,
  settings,
  onClose,
  onSuccess,
}) => {
  const [fromLocId, setFromLocId] = useState<string>(locations[0]?.id || '');
  const [toLocId, setToLocId] = useState<string>(locations[1]?.id || locations[0]?.id || '');
  const [selectedItems, setSelectedItems] = useState<Array<{ productId: string; requestedQty: number }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available products at origin
  const originBranchStock = useMemo(() => {
    return products.map(p => {
      const bStock = StorageService.getBranchProductStock(p.id, fromLocId);
      return {
        product: p,
        available: bStock.availableStock,
        onHand: bStock.onHandStock,
      };
    });
  }, [products, fromLocId]);

  const filteredOriginProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    return originBranchStock.filter(item => 
      item.product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      item.product.brand.toLowerCase().includes(productSearch.toLowerCase()) ||
      (item.product.sku && item.product.sku.toLowerCase().includes(productSearch.toLowerCase()))
    ).slice(0, 10);
  }, [originBranchStock, productSearch]);

  const handleAddItem = (productId: string) => {
    if (selectedItems.some(i => i.productId === productId)) return;
    setSelectedItems(prev => [...prev, { productId, requestedQty: 1 }]);
    setProductSearch('');
  };

  const handleUpdateQty = (productId: string, qty: number) => {
    setSelectedItems(prev => prev.map(i => i.productId === productId ? { ...i, requestedQty: Math.max(1, qty) } : i));
  };

  const handleRemoveItem = (productId: string) => {
    setSelectedItems(prev => prev.filter(i => i.productId !== productId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromLocId === toLocId) {
      alert('Origin and Destination locations must be different.');
      return;
    }
    if (selectedItems.length === 0) {
      alert('Please add at least one product to transfer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        fromLocationId: fromLocId,
        toLocationId: toLocId,
        items: selectedItems,
        requestedBy: {
          staffId: currentStaffUser?.id || 'staff_admin',
          name: currentStaffUser?.name || settings.currentStaffName || 'Requester',
        },
        notes,
      };

      const newTransfer = StorageService.createStockTransfer(payload);
      await firestoreSync.executeAtomicTransferRequest(newTransfer);
      onSuccess();
    } catch (err: any) {
      alert(`Transfer request creation failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">Create Inter-Branch Stock Transfer Request</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Origin & Destination Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                From Location (Origin Warehouse / Branch)
              </label>
              <select
                value={fromLocId}
                onChange={(e) => setFromLocId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} [{l.code}]</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                To Location (Receiving Branch)
              </label>
              <select
                value={toLocId}
                onChange={(e) => setToLocId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} [{l.code}]</option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Picker */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Add Products to Transfer
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Type product name or brand to search origin stock..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white"
              />
            </div>

            {/* Suggestions Dropdown */}
            {filteredOriginProducts.length > 0 && (
              <div className="mt-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto space-y-1">
                {filteredOriginProducts.map(({ product, available }) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleAddItem(product.id)}
                    className="w-full p-2 text-left hover:bg-slate-50 rounded-lg flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{product.name}</span>
                      <span className="text-slate-400 ml-1.5">({product.brand})</span>
                    </div>
                    <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {available} avail at origin
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Items List */}
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Transfer Items ({selectedItems.length})</h4>
            {selectedItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                Search and add products above.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedItems.map((item) => {
                  const prod = products.find(p => p.id === item.productId);
                  const bStock = StorageService.getBranchProductStock(item.productId, fromLocId);

                  return (
                    <div key={item.productId} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{prod?.name}</p>
                        <p className="text-[10px] text-slate-500">{prod?.brand} • Avail: {bStock.availableStock}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[10px] font-bold text-slate-500">Qty:</label>
                        <input
                          type="number"
                          min="1"
                          max={bStock.availableStock > 0 ? bStock.availableStock : 9999}
                          value={item.requestedQty}
                          onChange={(e) => handleUpdateQty(item.productId, parseInt(e.target.value) || 1)}
                          className="w-16 p-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.productId)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Transfer Notes & Instructions</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Urgent customer booking, flagship store weekend restock..."
              rows={2}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Submit Transfer Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// SUB-COMPONENT: DISPATCH TRANSFER MODAL (Select IMEIs & Dispatch)
// =============================================================================

interface DispatchTransferModalProps {
  transfer: StockTransfer;
  products: Product[];
  currentStaffUser?: StaffUser;
  settings: ShopSettings;
  onClose: () => void;
  onSuccess: () => void;
}

const DispatchTransferModal: React.FC<DispatchTransferModalProps> = ({
  transfer,
  products,
  currentStaffUser,
  settings,
  onClose,
  onSuccess,
}) => {
  const [dispatchedItems, setDispatchedItems] = useState<StockTransferItem[]>(transfer.items.map(i => ({
    ...i,
    dispatchedQty: i.requestedQty,
    imeiList: i.imeiList || [],
  })));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleImei = (productId: string, imei: string) => {
    setDispatchedItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const currentList = item.imeiList || [];
      const nextList = currentList.includes(imei)
        ? currentList.filter(x => x !== imei)
        : [...currentList, imei];
      return {
        ...item,
        imeiList: nextList,
        dispatchedQty: nextList.length > 0 ? nextList.length : item.dispatchedQty,
      };
    }));
  };

  const handleConfirmDispatch = async () => {
    setIsSubmitting(true);
    try {
      const staffInfo = {
        staffId: currentStaffUser?.id || 'staff_sender',
        name: currentStaffUser?.name || settings.currentStaffName || 'Warehouse Dispatcher',
      };

      const dateStr = new Date().toISOString();
      const updatedTransfer: StockTransfer = {
        ...transfer,
        status: 'dispatched',
        items: dispatchedItems,
        totalDispatchedQty: dispatchedItems.reduce((s, i) => s + i.dispatchedQty, 0),
        dispatchedBy: { ...staffInfo, date: dateStr },
        dispatchedAt: dateStr,
        updatedAt: dateStr,
      };

      // Atomic local update
      StorageService.saveStockTransfer(updatedTransfer);
      // Atomic Cloud Sync: decrements origin onHandStock, releases reservedStock, sets serial devices to 'in_transit'
      await firestoreSync.executeAtomicTransferDispatch(updatedTransfer);

      onSuccess();
    } catch (err: any) {
      alert(`Dispatch failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 bg-blue-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-300" />
            <span className="font-bold text-sm">Dispatch Goods: {transfer.transferNumber}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <p className="text-xs text-slate-600">
            Confirm items and assign physical 15-digit serial IMEIs being dispatched from <strong>{transfer.fromLocationName}</strong> to <strong>{transfer.toLocationName}</strong>.
          </p>

          <div className="space-y-3">
            {dispatchedItems.map((item) => {
              const prod = products.find(p => p.id === item.productId);
              const availableImeis = prod?.imeiList || [];

              return (
                <div key={item.productId} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-slate-900">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">Requested: {item.requestedQty} unit(s)</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700">Dispatched Qty:</span>
                      <input
                        type="number"
                        min="1"
                        value={item.dispatchedQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setDispatchedItems(prev => prev.map(x => x.productId === item.productId ? { ...x, dispatchedQty: val } : x));
                        }}
                        className="w-16 p-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                      />
                    </div>
                  </div>

                  {/* Serialized IMEI Picker (if device has registered IMEIs) */}
                  {availableImeis.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Select Physical Serial Units (IMEIs):
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {availableImeis.map((im) => {
                          const isPicked = item.imeiList?.includes(im);
                          return (
                            <button
                              key={im}
                              type="button"
                              onClick={() => handleToggleImei(item.productId, im)}
                              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                                isPicked
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {im}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmDispatch}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isSubmitting ? 'Dispatching...' : 'Mark Dispatched & In-Transit'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SUB-COMPONENT: RECEIVE TRANSFER MODAL (Discrepancy Shrinkage Protection)
// =============================================================================

interface ReceiveTransferModalProps {
  transfer: StockTransfer;
  products: Product[];
  currentStaffUser?: StaffUser;
  settings: ShopSettings;
  onClose: () => void;
  onSuccess: () => void;
}

const ReceiveTransferModal: React.FC<ReceiveTransferModalProps> = ({
  transfer,
  products,
  currentStaffUser,
  settings,
  onClose,
  onSuccess,
}) => {
  const [receivedItems, setReceivedItems] = useState<StockTransferItem[]>(transfer.items.map(i => ({
    ...i,
    receivedQty: i.dispatchedQty,
    receivedImeiList: i.imeiList || [],
    discrepancyQty: 0,
  })));
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAnyDiscrepancy = receivedItems.some(i => (i.dispatchedQty - i.receivedQty) > 0);

  const handleUpdateReceivedQty = (productId: string, val: number) => {
    setReceivedItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const rec = Math.max(0, val);
      const disc = Math.max(0, item.dispatchedQty - rec);
      return { ...item, receivedQty: rec, discrepancyQty: disc };
    }));
  };

  const handleConfirmReceipt = async () => {
    setIsSubmitting(true);
    try {
      const staffInfo = {
        staffId: currentStaffUser?.id || 'staff_receiver',
        name: currentStaffUser?.name || settings.currentStaffName || 'Branch Receiver',
      };

      // StorageService processes atomic local receipt & auto-creates DamageLog if shrinkage occurred
      const result = StorageService.receiveStockTransfer(
        transfer.id,
        staffInfo,
        receivedItems,
        discrepancyReason
      );

      // Cloud atomic update
      await firestoreSync.executeAtomicTransferReceive(result.transfer, result.damageLogCreated);

      onSuccess();
    } catch (err: any) {
      alert(`Receipt processing failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 bg-emerald-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">Physical Inspection & Receipt: {transfer.transferNumber}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <p className="text-xs text-slate-600">
            Verify actual counted units arriving at <strong>{transfer.toLocationName}</strong>. If fewer items arrived than were dispatched, indicate the reason below for automated transit damage/shrinkage logging.
          </p>

          <div className="space-y-3">
            {receivedItems.map((item) => {
              const diff = item.dispatchedQty - item.receivedQty;

              return (
                <div key={item.productId} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-slate-900">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">Dispatched by Sender: {item.dispatchedQty} unit(s)</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-700">Actual Count:</label>
                      <input
                        type="number"
                        min="0"
                        max={item.dispatchedQty}
                        value={item.receivedQty}
                        onChange={(e) => handleUpdateReceivedQty(item.productId, parseInt(e.target.value) || 0)}
                        className={`w-16 p-1 bg-white border rounded-lg text-xs font-bold text-center ${
                          diff > 0 ? 'border-rose-400 text-rose-700 bg-rose-50' : 'border-slate-200 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  {diff > 0 && (
                    <div className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{diff} unit(s) missing upon delivery!</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Shrinkage Reason Prompt if Discrepancy Exists */}
          {hasAnyDiscrepancy && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Transit Shrinkage Incident Report</span>
              </div>
              <p className="text-[11px] text-rose-700">
                A discrepancy was detected. An automated Quarantine Shrinkage Incident will be recorded in the Damage & RMA ledger. Please describe what occurred:
              </p>
              <textarea
                value={discrepancyReason}
                onChange={(e) => setDiscrepancyReason(e.target.value)}
                placeholder="e.g. Courier carton torn open in transit, 1 phone unit box missing from delivery..."
                rows={2}
                className="w-full p-2 bg-white border border-rose-300 rounded-xl text-xs text-rose-900 focus:outline-hidden"
              />
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmReceipt}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isSubmitting ? 'Receiving...' : 'Confirm Receipt & Settle Stock'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SUB-COMPONENT: LOCATION FORM MODAL (Add / Edit Location)
// =============================================================================

interface LocationFormModalProps {
  location: StoreLocation | null;
  onClose: () => void;
  onSave: (data: Partial<StoreLocation>) => void;
}

const LocationFormModal: React.FC<LocationFormModalProps> = ({
  location,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(location?.name || '');
  const [code, setCode] = useState(location?.code || '');
  const [type, setType] = useState<'warehouse' | 'branch'>(location?.type || 'branch');
  const [address, setAddress] = useState(location?.address || '');
  const [phone, setPhone] = useState(location?.phone || '');
  const [managerName, setManagerName] = useState(location?.managerName || '');
  const [isDefault, setIsDefault] = useState(location?.isDefault || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      code,
      type,
      address,
      phone,
      managerName,
      isDefault,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <span className="font-bold text-sm">
            {location ? 'Edit Location' : 'Add Store Location / Warehouse'}
          </span>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Location Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mandalay Central Branch"
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Location Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. BR-MDY-01"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Location Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="branch">Retail Store Branch</option>
                <option value="warehouse">Central Warehouse</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Physical Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 78th Street, Between 31st & 32nd, Mandalay"
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09-xxxxxxxxx"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Branch Manager</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="e.g. U Thura"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isDefaultCheckbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isDefaultCheckbox" className="font-bold text-slate-700 cursor-pointer">
              Set as primary default location
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
            >
              Save Location
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
