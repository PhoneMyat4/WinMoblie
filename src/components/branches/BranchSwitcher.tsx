import React, { useState, useRef, useEffect } from 'react';
import { 
  Building2, 
  Store, 
  ChevronDown, 
  Check, 
  Lock, 
  ArrowRightLeft, 
  MapPin, 
  Phone, 
  ShieldAlert,
  Plus
} from 'lucide-react';
import { StoreLocation, StaffUser, RolePermissions } from '../../types';
import { StorageService } from '../../utils/storage';
import { checkUserPermission } from '../../utils/permissionUtils';

interface BranchSwitcherProps {
  locations: StoreLocation[];
  activeLocationId: string;
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<string, RolePermissions>;
  onLocationChange: (locationId: string) => void;
  onOpenBranchManager?: () => void;
  compact?: boolean;
}

export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({
  locations,
  activeLocationId,
  currentStaffUser,
  rolePermissions,
  onLocationChange,
  onOpenBranchManager,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if staff can switch branch
  const canSwitch = React.useMemo(() => {
    if (!currentStaffUser) return true;
    if (currentStaffUser.role === 'Owner' || currentStaffUser.role === 'Manager') return true;
    return checkUserPermission(currentStaffUser, 'canSwitchBranch', rolePermissions as any);
  }, [currentStaffUser, rolePermissions]);

  const activeLoc = locations.find(l => l.id === activeLocationId) || locations[0] || {
    id: 'loc_br_yangon_01',
    code: 'BR-YGN-01',
    name: 'Yangon Flagship Store',
    type: 'branch',
    address: 'Downtown, Yangon',
    phone: '09-12345678',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectLocation = (loc: StoreLocation) => {
    if (!canSwitch && currentStaffUser?.branchId && currentStaffUser.branchId !== loc.id) {
      return;
    }
    StorageService.setActiveLocationId(loc.id);
    onLocationChange(loc.id);
    setIsOpen(false);
  };

  const isWarehouse = activeLoc.type === 'warehouse';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        id="branch-switcher-btn"
        onClick={() => {
          if (!canSwitch) return;
          setIsOpen(!isOpen);
        }}
        disabled={!canSwitch}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${
          isWarehouse
            ? 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-300 text-amber-950'
            : 'bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-300 text-emerald-950'
        } ${!canSwitch ? 'cursor-default opacity-90' : 'shadow-2xs active:scale-[0.98]'}`}
        title={canSwitch ? 'Switch Active Branch / Warehouse Context' : 'Branch locked to operator assignment'}
      >
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
          isWarehouse ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {isWarehouse ? (
            <Building2 className="w-3.5 h-3.5" />
          ) : (
            <Store className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] sm:text-xs font-black truncate max-w-[85px] xs:max-w-[110px] sm:max-w-[140px] xl:max-w-[170px] leading-tight">
              {activeLoc.name}
            </span>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md hidden md:inline-block ${
              isWarehouse ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
            }`}>
              {activeLoc.code}
            </span>
          </div>
          {!compact && (
            <p className="text-[10px] text-slate-500 font-medium leading-none mt-0.5 truncate max-w-[140px] hidden xl:block">
              {isWarehouse ? 'Central Warehouse' : 'Active Retail Store'}
            </p>
          )}
        </div>

        {canSwitch ? (
          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        ) : (
          <span title="Locked by staff role assignment" className="shrink-0 flex items-center">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Operating Branch / Warehouse
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Select location to isolate stock & sales
              </p>
            </div>
            {onOpenBranchManager && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenBranchManager();
                }}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer bg-blue-50 px-2 py-1 rounded-lg"
              >
                <ArrowRightLeft className="w-3 h-3" />
                Hub
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
            {locations.map((loc) => {
              const isSelected = loc.id === activeLoc.id;
              const isWh = loc.type === 'warehouse';

              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full text-left p-2.5 rounded-xl transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? isWh ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                        : isWh ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {isWh ? <Building2 className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs truncate">
                          {loc.name}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected 
                            ? 'bg-white/20 text-white' 
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {loc.code}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 mt-1 text-[11px] opacity-80 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{loc.address || 'Local Branch'}</span>
                      </div>

                      {loc.phone && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-70">
                          <Phone className="w-2.5 h-2.5 shrink-0" />
                          <span>{loc.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 mt-1">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {onOpenBranchManager && (
            <div className="p-2 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenBranchManager();
                }}
                className="w-full py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
                <span>Inter-Branch Transfers & Central Hub</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
