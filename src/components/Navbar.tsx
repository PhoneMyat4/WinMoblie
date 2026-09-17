import React, { useState, useEffect } from 'react';
import { 
  Search, 
  DollarSign, 
  Plus, 
  UserCheck, 
  ShieldCheck, 
  ChevronDown, 
  Truck, 
  Store,
  Menu,
  Lock,
  LogOut,
  Sparkles,
  Bot,
  Mic,
  ExternalLink,
  RefreshCw,
  Cloud,
  Check
} from 'lucide-react';
import { ShopSettings, CashDrawerRecord, StaffRole, StaffUser, RolePermissions } from '../types';
import { formatCurrency } from '../utils/formatters';
import { getEffectiveUserPermissions } from '../utils/permissionUtils';
import { AppLink } from './common/AppLink';
import { SyncStateInfo } from '../utils/syncService';

interface NavbarProps {
  settings: ShopSettings;
  cashDrawer: CashDrawerRecord;
  staffUsers: StaffUser[];
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<StaffRole, RolePermissions>;
  syncInfo?: SyncStateInfo & { triggerManualSync: () => void };
  onOpenNewSale: () => void;
  onOpenPurchases: () => void;
  onOpenExpenses: () => void;
  onOpenCashInOut: (type: 'in' | 'out') => void;
  onTriggerSearch: (query: string) => void;
  onSwitchStaffUser: (user: StaffUser) => void;
  onOpenRolesTab: () => void;
  onOpenAiAssistant?: () => void;
  onOpenMobileMenu?: () => void;
  onLockTerminal?: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  cashDrawer,
  staffUsers,
  currentStaffUser,
  rolePermissions,
  syncInfo,
  onOpenNewSale,
  onOpenPurchases,
  onOpenExpenses,
  onOpenCashInOut,
  onTriggerSearch,
  onSwitchStaffUser,
  onOpenRolesTab,
  onOpenAiAssistant,
  onOpenMobileMenu,
  onLockTerminal,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const effectivePerms = getEffectiveUserPermissions(currentStaffUser, rolePermissions);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onTriggerSearch(searchQuery.trim());
    }
  };

  return (
    <header className="print:hidden bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 shadow-xs w-full max-w-full">
      <div className="px-3 sm:px-6 py-2 sm:py-2.5 w-full max-w-full">
        <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
          
          {/* Mobile Menu Toggle & Title */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0">
            {onOpenMobileMenu && (
              <button
                type="button"
                id="open-mobile-sidebar-btn"
                onClick={onOpenMobileMenu}
                className="md:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors shrink-0"
                title="Open Navigation"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="md:hidden flex items-center gap-1.5 min-w-0">
              {settings.logoUrl ? (
                <div 
                  style={{
                    width: `${Math.min(32, Math.max(24, settings.shopLogoSize || 30))}px`,
                    height: `${Math.min(32, Math.max(24, settings.shopLogoSize || 30))}px`,
                  }}
                  className="shrink-0 flex items-center justify-center"
                >
                  <img
                    src={settings.logoUrl}
                    alt={settings.shopName}
                    className={`w-full h-full object-contain ${
                      settings.logoTransparentBg === false
                        ? 'bg-white p-0.5 rounded-lg border border-slate-200 shadow-xs'
                        : 'bg-transparent'
                    }`}
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              )}
              <span className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[100px] xs:max-w-[140px]">
                {settings.shopName}
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-lg hidden sm:block">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                id="global-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Item, Barcode, Serialized IMEI, or Invoice #..."
                autoComplete="off"
                spellCheck={false}
                style={{ color: '#0f172a', backgroundColor: '#f8fafc' }}
                className="w-full pl-9 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all placeholder:text-slate-400 font-medium"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Search
              </button>
            </div>
          </form>

          {/* Right Action Widgets */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            
            {/* Live Cash Float Widget */}
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase leading-none">Register Cash</p>
                <p className="text-xs font-black text-slate-900 leading-tight">
                  {formatCurrency(cashDrawer.expectedInDrawer, settings.currencySymbol)}
                </p>
              </div>
              {/* Cash In / Out controls */}
              {effectivePerms.canManageCashDrawer && (
                <div className="flex items-center gap-0.5 ml-1 border-l border-slate-200 pl-1">
                  <button
                    type="button"
                    title="Record Cash In"
                    onClick={() => onOpenCashInOut('in')}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Record Cash Out"
                    onClick={() => onOpenCashInOut('out')}
                    className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {effectivePerms.canAccessAiCopilot && onOpenAiAssistant && (
                <button
                  type="button"
                  id="header-ai-copilot-btn"
                  onClick={onOpenAiAssistant}
                  className="inline-flex items-center gap-1 p-1.5 sm:px-3 sm:py-1.5 bg-gradient-to-r from-indigo-900 to-indigo-700 hover:from-indigo-800 hover:to-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs border border-indigo-500/40 transition-all cursor-pointer group shrink-0"
                  title="Open AI Store Assistant with Voice & Reports Tool Calling"
                >
                  <Bot className="w-3.5 h-3.5 text-indigo-100 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="hidden sm:inline">AI Copilot</span>
                </button>
              )}

              {(effectivePerms.canManagePurchases || effectivePerms.canApprovePurchases || effectivePerms.canReceivePurchases) && (
                <AppLink
                  tab="purchases"
                  toTab={onOpenPurchases}
                  id="header-stockin-btn"
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition-colors cursor-pointer"
                  title="Stock Purchase (Right click to open in new tab/window)"
                >
                  <Truck className="w-3.5 h-3.5" />
                  + Stock In
                </AppLink>
              )}

              {effectivePerms.canRecordExpenses && (
                <AppLink
                  tab="expenses"
                  toTab={onOpenExpenses}
                  id="header-expense-btn"
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl border border-amber-200 transition-colors cursor-pointer"
                  title="Record Shop Expense (Right click to open in new tab/window)"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  + Expense
                </AppLink>
              )}

              {effectivePerms.canAccessPos && (
                <>
                  <AppLink
                    tab="pos"
                    toTab={onOpenNewSale}
                    id="header-newsale-btn"
                    className="inline-flex items-center gap-1 px-2 sm:px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                    title="Open POS Terminal (Right click to open in new tab/window)"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xs:inline">New Sale</span>
                    <span className="xs:hidden">Sale</span>
                  </AppLink>

                  {/* Pop-out in New Tab using semantic anchor */}
                  <AppLink
                    tab="pos"
                    openInNewTab={true}
                    id="header-new-tab-pos-btn"
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                    title="Open POS Terminal in a new browser tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden xl:inline">New Tab POS</span>
                  </AppLink>
                </>
              )}
            </div>

            {/* Multi-Tab & Server Sync Status Badge */}
            {syncInfo && (
              <button
                type="button"
                id="header-sync-status-btn"
                onClick={() => syncInfo.triggerManualSync()}
                title={
                  syncInfo.status === 'syncing'
                    ? 'Syncing state across browser tabs & server...'
                    : syncInfo.status === 'offline'
                    ? 'Offline mode: Changes stored in localStorage and synced when reconnected.'
                    : `Multi-tab & Server sync active. Last synced at ${syncInfo.lastSyncTime ? syncInfo.lastSyncTime.toLocaleTimeString() : 'now'}. Click to force sync.`
                }
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
              >
                {syncInfo.status === 'syncing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    <span className="text-[11px] text-blue-700 font-bold hidden lg:inline">Syncing...</span>
                  </>
                ) : syncInfo.status === 'offline' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[11px] text-amber-700 font-medium hidden lg:inline">Offline (Local)</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <Cloud className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] text-slate-600 font-medium hidden xl:inline">Synced</span>
                  </>
                )}
              </button>
            )}

            {/* Operator / Staff Switcher */}
            <div className="relative shrink-0">
              <button
                type="button"
                id="staff-operator-btn"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-1.5 p-1 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <div className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-black shrink-0">
                  {settings.currentStaffName.slice(0, 1)}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="leading-tight text-[11px] font-bold text-slate-900">{settings.currentStaffName}</p>
                  <p className="text-[9px] text-purple-700 font-semibold leading-tight">{settings.currentStaffRole.replace('_', ' ')}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in">
                  <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                    Current Operator Account
                  </div>
                  <div className="px-3 py-2 bg-purple-50/50 mb-1 border-b border-slate-100">
                    <p className="font-bold text-xs text-purple-950">{settings.currentStaffName}</p>
                    <p className="text-[10px] text-purple-700 font-semibold">{settings.currentStaffRole.replace('_', ' ')}</p>
                  </div>

                  {/* Switch Staff Account - Feature Disabled */}
                  <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 mx-1.5 my-1 rounded-xl border border-slate-200/80">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-slate-400" />
                        Switch Staff Account
                      </span>
                      <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded-md border border-amber-300">
                        Disabled
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Quick staff switching is disabled. To change operator, lock the terminal or verify PIN in Staff &amp; Roles.
                    </p>
                  </div>

                  <div className="pt-1.5 border-t border-slate-100 px-2 space-y-1">
                    <button
                      type="button"
                      id="navbar-lock-terminal-btn"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        if (onLockTerminal) onLockTerminal();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5 text-slate-600" />
                      Lock Register Terminal
                    </button>

                    {effectivePerms.canManageStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenRolesTab();
                          setUserDropdownOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                        Roles & Security PINs
                      </button>
                    )}

                    {onLogout && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onLogout();
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-500" />
                        Log Out & Exit
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Lock Button */}
            {onLockTerminal && (
              <button
                type="button"
                id="header-quick-lock-btn"
                title="Lock Terminal (Requires PIN to unlock)"
                onClick={onLockTerminal}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
