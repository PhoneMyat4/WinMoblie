import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  KeyRound, 
  Users, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { StaffUser, StaffRole, RolePermissions, ShopSettings, AppTab } from '../../types';
import { getRoleBadgeClass } from '../../utils/formatters';
import { getTabRequiredPermissionInfo, checkUserPermission } from '../../utils/permissionUtils';

interface RestrictedAccessViewProps {
  tab: AppTab;
  currentStaffUser: StaffUser;
  staffUsers: StaffUser[];
  settings: ShopSettings;
  rolePermissions: Record<StaffRole, RolePermissions>;
  onSwitchStaffUser: (user: StaffUser) => void;
  onNavigateToAllowedTab: (tab: AppTab) => void;
  onAuthorizeSessionBypass?: (tab: AppTab) => void;
}

export const RestrictedAccessView: React.FC<RestrictedAccessViewProps> = ({
  tab,
  currentStaffUser,
  staffUsers,
  settings,
  rolePermissions,
  onSwitchStaffUser,
  onNavigateToAllowedTab,
  onAuthorizeSessionBypass,
}) => {
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const permissionInfo = getTabRequiredPermissionInfo(tab);

  // Find authorized staff members who have permission to unlock or access this session
  const authorizedStaffMembers = staffUsers.filter(u => {
    if (u.role === 'Owner') return true;
    if (permissionInfo.permissionKey) {
      return checkUserPermission(u, permissionInfo.permissionKey, rolePermissions);
    }
    return u.role === 'Manager';
  });

  const handleVerifySupervisorPin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    if (!enteredPin || enteredPin.length < 4) {
      setPinError('Please enter a valid 4-digit security PIN.');
      return;
    }

    // Check if the PIN matches any authorized supervisor / owner / manager
    const matchingSupervisor = authorizedStaffMembers.find(u => u.pin === enteredPin && u.active);

    if (matchingSupervisor) {
      setPinSuccess(`Supervisor authorization verified: ${matchingSupervisor.name} (${matchingSupervisor.role})`);
      setTimeout(() => {
        if (onAuthorizeSessionBypass) {
          onAuthorizeSessionBypass(tab);
        } else {
          // Switch to supervisor
          onSwitchStaffUser(matchingSupervisor);
        }
      }, 750);
    } else {
      setPinError('Invalid supervisor PIN or unauthorized staff account.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      
      {/* Access Denied Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Top Banner Alert */}
        <div className="bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shrink-0">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-black/20 text-white font-mono text-[10px] font-extrabold uppercase tracking-wider">
                  Security Guard
                </span>
                <span className="text-white/80 text-xs font-semibold">
                  Access Restricted
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                {permissionInfo.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToAllowedTab('dashboard')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>

        {/* Details and Actions Body */}
        <div className="p-6 sm:p-8 space-y-8">
          
          {/* Current Operator & Restriction Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Operator Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Current Terminal Operator
              </span>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl ${currentStaffUser?.avatarColor || 'bg-slate-700'} text-white font-black text-sm flex items-center justify-center shadow-xs`}>
                  {(currentStaffUser?.name || 'Staff').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    {currentStaffUser?.name || 'Staff User'}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${getRoleBadgeClass(currentStaffUser?.role || 'Cashier')}`}>
                      {(currentStaffUser?.role || 'Staff').replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      @{currentStaffUser?.username || currentStaffUser?.name?.toLowerCase() || 'staff'}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pt-1 border-t border-slate-200/60">
                This operator account is currently restricted from accessing this session under the active store permissions configuration.
              </p>
            </div>

            {/* Required Permission Card */}
            <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
              <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">
                Required Security Authorization
              </span>
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-900 shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-950">
                    {permissionInfo.requiredPermissionLabel}
                  </h4>
                  <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                    {permissionInfo.description}
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Supervisor PIN Override Box */}
          <div className="p-6 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 text-white space-y-4 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">
                    Supervisor / Manager PIN Override
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Enter an authorized Owner or Manager PIN to unlock this session or switch operator.
                  </p>
                </div>
              </div>
            </div>

            {pinError && (
              <div className="p-3 bg-rose-900/40 border border-rose-500/50 rounded-xl text-rose-200 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {pinSuccess && (
              <div className="p-3 bg-emerald-900/40 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{pinSuccess}</span>
              </div>
            )}

            <form onSubmit={handleVerifySupervisorPin} className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <div className="relative w-full sm:w-64">
                <input
                  type="password"
                  maxLength={6}
                  value={enteredPin}
                  onChange={(e) => {
                    setEnteredPin(e.target.value);
                    if (pinError) setPinError(null);
                  }}
                  placeholder="Enter 4-digit PIN..."
                  className="w-full px-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm font-mono text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-center tracking-widest"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Authorize & Unlock</span>
              </button>
            </form>
          </div>

          {/* Quick Safe Actions Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>
                To configure role access permissions permanently, visit <strong>Staff Roles & Security</strong> as an Owner.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToAllowedTab('pos')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Go to POS Register
              </button>
              <button
                type="button"
                onClick={() => onNavigateToAllowedTab('dashboard')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Dashboard Overview
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
