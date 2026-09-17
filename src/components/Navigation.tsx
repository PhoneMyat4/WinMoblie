import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Truck, 
  Receipt, 
  DollarSign, 
  Users, 
  ShieldCheck, 
  Sliders, 
  Landmark, 
  Settings,
  Store,
  ChevronLeft,
  ChevronRight,
  X,
  Bot,
  AlertTriangle,
  BarChart3,
  Lock,
  ClipboardCheck,
  ExternalLink,
  Menu,
  MoreHorizontal,
  CalendarClock,
  MessageSquare,
  Megaphone,
  HandCoins,
  TrendingUp,
  ShieldAlert,
  Wallet,
  History
} from 'lucide-react';
import { ShopSettings, StaffUser, AppTab, StaffRole, RolePermissions } from '../types';
import { AppLink } from './common/AppLink';
import { isTabAccessibleForUser, getEffectiveUserPermissions } from '../utils/permissionUtils';
import { StorageService } from '../utils/storage';

export type { AppTab };

interface NavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  lowStockCount: number;
  quarantinedCount?: number;
  settings: ShopSettings;
  currentStaffUser?: StaffUser;
  rolePermissions?: Record<StaffRole, RolePermissions>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenMobile?: () => void;
  onLockTerminal?: () => void;
  onOpenAiAssistant?: () => void;
}

interface NavGroup {
  groupTitle: string;
  items: {
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | null;
    badgeColor?: string;
  }[];
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  lowStockCount,
  quarantinedCount,
  settings,
  currentStaffUser,
  rolePermissions,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  onOpenMobile,
  onLockTerminal,
  onOpenAiAssistant,
}) => {
  const effectivePerms = getEffectiveUserPermissions(currentStaffUser, rolePermissions);
  const canAccessAi = effectivePerms.canAccessAiCopilot ?? true;

  const quarantinedBadgeCount = React.useMemo(() => {
    if (typeof quarantinedCount === 'number') return quarantinedCount;
    try {
      return StorageService.getDamageLogs().filter(l => l.status === 'Quarantined').length;
    } catch {
      return 0;
    }
  }, [quarantinedCount, activeTab]);

  const navGroups: NavGroup[] = [
    {
      groupTitle: 'Operations',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
        },
        {
          id: 'pos',
          label: 'POS Register',
          icon: ShoppingCart,
        },
        {
          id: 'pre_orders',
          label: 'Pre-Orders & Bookings',
          icon: CalendarClock,
        },
        {
          id: 'sales_history',
          label: 'Sale History & Refunds',
          icon: Receipt,
        },
        {
          id: 'social_marketing',
          label: 'Social Media Marketing',
          icon: Megaphone,
          badge: 'AI',
          badgeColor: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold',
        },
      ],
    },
    {
      groupTitle: 'Inventory & Supply',
      items: [
        {
          id: 'inventory',
          label: 'Inventory & Stock Adjust',
          icon: Package,
          badge: lowStockCount > 0 ? `${lowStockCount} Low` : null,
          badgeColor: 'bg-amber-500 text-white',
        },
        {
          id: 'quarantine_rma',
          label: 'Damage & Quarantine RMA',
          icon: ShieldAlert,
          badge: quarantinedBadgeCount > 0 ? `${quarantinedBadgeCount} Quarantined` : null,
          badgeColor: 'bg-rose-500 text-white',
        },
        {
          id: 'stock_check',
          label: 'Stock Check & Audit',
          icon: ClipboardCheck,
        },
        {
          id: 'purchases',
          label: 'Purchases / Stock-In',
          icon: Truck,
        },
      ],
    },
    {
      groupTitle: 'Financials',
      items: [
        {
          id: 'daily_profit',
          label: 'Daily & Annual Profit',
          icon: TrendingUp,
          badge: 'P&L',
          badgeColor: 'bg-emerald-100 text-emerald-800',
        },
        {
          id: 'personal_finance',
          label: 'Personal Finance',
          icon: Wallet,
          badge: 'New',
          badgeColor: 'bg-indigo-100 text-indigo-800',
        },
        {
          id: 'credit_sales',
          label: 'Credit Sales & AR',
          icon: HandCoins,
        },
        {
          id: 'cash_drawer',
          label: 'Cash Drawer & Shifts',
          icon: Landmark,
        },
        {
          id: 'expenses',
          label: 'Shop Expenses',
          icon: DollarSign,
        },
      ],
    },
    {
      groupTitle: 'Analytics & Reports',
      items: [
        {
          id: 'reports',
          label: 'Business Reports',
          icon: BarChart3,
        },
      ],
    },
    {
      groupTitle: 'CRM & Staff',
      items: [
        {
          id: 'team_chat',
          label: 'Team Chat & Notice Board',
          icon: MessageSquare,
        },
        {
          id: 'staff_payroll',
          label: 'Staff Payroll & KPIs',
          icon: DollarSign,
        },
        {
          id: 'crm',
          label: 'Customers & Suppliers',
          icon: Users,
        },
        {
          id: 'roles',
          label: 'User Roles & PINs',
          icon: ShieldCheck,
        },
        {
          id: 'audit_logs',
          label: 'User Activity & Audit Logs',
          icon: History,
          badge: 'Live',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        },
      ],
    },
    {
      groupTitle: 'Configuration',
      items: [
        {
          id: 'invoice_customizer',
          label: 'Customize Invoice',
          icon: Sliders,
        },
        {
          id: 'settings',
          label: 'Shop Settings',
          icon: Settings,
        },
      ],
    },
  ];

  const handleSelectTab = (id: AppTab) => {
    onTabChange(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 border-r border-slate-800 select-none">
      
      {/* Sidebar Header / Brand Identity */}
      <div 
        style={{ minHeight: '77.9941px' }}
        className="px-4 py-2 flex items-center justify-between border-b border-slate-800 shrink-0 bg-slate-950/40 h-auto"
      >
        <div 
          style={{
            minHeight: '63.998px',
            width: '244.379px',
            marginRight: '3px',
            marginLeft: '-8px',
          }}
          className={`flex items-center gap-3 transition-all ${isCollapsed ? 'justify-center w-full' : ''}`}
        >
          {settings.logoUrl ? (
            <div 
              style={{
                width: `${settings.shopLogoSize || 53}px`,
                height: `${settings.shopLogoSize || 53}px`,
              }}
              className="shrink-0 flex items-center justify-center transition-all"
            >
              <img 
                src={settings.logoUrl} 
                alt={settings.shopName}
                style={{
                  maxWidth: `${settings.shopLogoSize || 53}px`,
                  maxHeight: `${settings.shopLogoSize || 53}px`,
                }}
                className={`w-full h-full object-contain ${
                  settings.logoTransparentBg === false
                    ? 'bg-white p-1 rounded-xl border border-slate-700 shadow-md'
                    : 'bg-transparent'
                }`}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div 
              style={{ width: '53px', height: '53px' }}
              className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-950/40 shrink-0"
            >
              <Store className="w-5 h-5 text-white" />
            </div>
          )}
          {!isCollapsed && (
            <div className="min-w-0 flex-1 py-1">
              <h1 
                title={settings.shopName}
                className="text-xs sm:text-sm lg:text-base font-black text-white tracking-tight break-words whitespace-normal leading-snug [font-size:clamp(0.8125rem,0.725rem+0.45vw,1.05rem)]"
              >
                {settings.shopName}
              </h1>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                <span className="text-[9px] sm:text-[10px] lg:text-[11px] text-emerald-400 font-bold uppercase tracking-wider break-words whitespace-normal leading-tight">
                  POS & Inventory
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Close Button */}
        <button
          type="button"
          id="close-mobile-nav-btn"
          onClick={onCloseMobile}
          className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          title="Close Navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav Groups Container */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        {navGroups
          .map((group) => ({
            ...group,
            items: group.items.filter((tab) =>
              currentStaffUser
                ? isTabAccessibleForUser(tab.id, currentStaffUser, rolePermissions)
                : true
            ),
          }))
          .filter((group) => group.items.length > 0)
          .map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {!isCollapsed ? (
              <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5 break-words whitespace-normal leading-tight">
                {group.groupTitle}
              </div>
            ) : (
              <div className="w-6 h-px bg-slate-800 mx-auto my-2" />
            )}

            <div className="space-y-1">
              {group.items.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <div
                    key={tab.id}
                    className="relative group/tab flex items-center"
                  >
                    <AppLink
                      tab={tab.id}
                      toTab={handleSelectTab}
                      id={`sidebar-tab-${tab.id}`}
                      title={
                        isCollapsed
                          ? `${tab.label} (Click to switch, right-click to open in new tab/window)`
                          : undefined
                      }
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs lg:text-[13px] xl:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                      } ${isCollapsed ? 'justify-center px-0' : ''}`}
                    >
                      <div className="relative">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform group-hover/tab:scale-110 ${
                            isActive
                              ? 'text-white'
                              : 'text-slate-400 group-hover/tab:text-emerald-400'
                          }`}
                        />
                      </div>
                      
                      {!isCollapsed && (
                        <span className="flex-1 text-left flex items-center justify-between min-w-0">
                          <span className="text-xs lg:text-[13px] xl:text-sm [font-size:clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-semibold transition-colors break-words whitespace-normal leading-snug">
                            {tab.label}
                          </span>
                        </span>
                      )}

                      {!isCollapsed && tab.badge && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${tab.badgeColor || 'bg-slate-700 text-white'}`}>
                          {tab.badge}
                        </span>
                      )}

                      {isCollapsed && tab.badge && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900" />
                      )}
                    </AppLink>

                    {/* Pop-out in New Tab button using data-open-new-tab and standard anchor */}
                    {!isCollapsed && (
                      <a
                        href={`?tab=${tab.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-open-new-tab="true"
                        data-url={`?tab=${tab.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        title={`Open ${tab.label} in new tab`}
                        className={`opacity-0 group-hover/tab:opacity-100 p-1.5 mr-1.5 rounded-lg transition-all text-slate-400 hover:text-white hover:bg-slate-700/80 cursor-pointer absolute right-0 z-10 ${
                          isActive ? 'text-emerald-100 hover:bg-emerald-700' : ''
                        }`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* AI Assistant Copilot Launcher Banner */}
      {canAccessAi && onOpenAiAssistant && (
        <div className="p-3 border-t border-slate-800/80 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950/60 shrink-0">
          {!isCollapsed ? (
            <button
              type="button"
              id="sidebar-ai-copilot-card"
              onClick={onOpenAiAssistant}
              className="w-full text-left p-2.5 bg-gradient-to-r from-indigo-900/60 to-purple-900/40 hover:from-indigo-800/70 hover:to-purple-800/50 border border-indigo-500/30 rounded-xl transition-all group shadow-sm cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500 text-white flex items-center justify-center shadow-xs">
                    <Bot className="w-3.5 h-3.5 text-white group-hover:scale-110 transition-transform" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white leading-none block">AI Copilot</span>
                    <span className="text-[10px] text-indigo-300 font-medium">Voice & Reports</span>
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-semibold">
                  Gemini
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              id="sidebar-ai-copilot-icon"
              onClick={onOpenAiAssistant}
              title="Open AI Store Copilot (Voice & Reports)"
              className="w-10 h-10 mx-auto rounded-xl bg-indigo-900/60 hover:bg-indigo-800 border border-indigo-500/40 text-indigo-200 flex items-center justify-center transition-colors cursor-pointer group"
            >
              <Bot className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
      )}

      {/* Operator & Collapse Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/30 shrink-0">
        {!isCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 font-black text-xs flex items-center justify-center shrink-0">
                  {settings.currentStaffName.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">{settings.currentStaffName}</p>
                  <p className="text-[10px] text-purple-400 font-semibold truncate capitalize">{settings.currentStaffRole.replace('_', ' ')}</p>
                </div>
              </div>

              {onToggleCollapse && (
                <button
                  type="button"
                  id="collapse-sidebar-btn"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>

            {onLockTerminal && (
              <button
                type="button"
                id="sidebar-lock-terminal-btn"
                onClick={onLockTerminal}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700/60 flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Lock Terminal</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div 
              title={`${settings.currentStaffName} (${settings.currentStaffRole})`}
              className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 font-black text-xs flex items-center justify-center cursor-pointer"
            >
              {settings.currentStaffName.slice(0, 1)}
            </div>
            
            {onLockTerminal && (
              <button
                type="button"
                id="sidebar-collapsed-lock-btn"
                onClick={onLockTerminal}
                title="Lock Terminal"
                className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            {onToggleCollapse && (
              <button
                type="button"
                id="expand-sidebar-btn"
                onClick={onToggleCollapse}
                title="Expand sidebar"
                className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed Left) */}
      <aside 
        className={`hidden md:block print:hidden fixed top-0 bottom-0 left-0 h-screen z-40 transition-all duration-300 shrink-0 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {navContent}
      </aside>

      {/* Mobile Drawer (Slide in from Left) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={onCloseMobile}
          />
          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Ultra-responsive one-thumb navigation) */}
      <nav 
        id="mobile-bottom-nav-bar"
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden print:hidden bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom"
        aria-label="Mobile Navigation"
      >
        {/* POS Tab */}
        {(!currentStaffUser || isTabAccessibleForUser('pos', currentStaffUser, rolePermissions)) && (
          <button
            type="button"
            id="mobile-nav-pos"
            onClick={() => handleSelectTab('pos')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all min-h-[44px] min-w-[56px] ${
              activeTab === 'pos'
                ? 'text-emerald-400 font-bold bg-emerald-950/60 ring-1 ring-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight font-bold">POS</span>
          </button>
        )}

        {/* Inventory Tab */}
        {(!currentStaffUser || isTabAccessibleForUser('inventory', currentStaffUser, rolePermissions)) && (
          <button
            type="button"
            id="mobile-nav-inventory"
            onClick={() => handleSelectTab('inventory')}
            className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all min-h-[44px] min-w-[56px] ${
              activeTab === 'inventory' || activeTab === 'stock_check'
                ? 'text-emerald-400 font-bold bg-emerald-950/60 ring-1 ring-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <div className="relative">
              <Package className="w-5 h-5 mb-0.5" />
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full bg-amber-500 text-white font-black text-[9px] min-w-[14px] text-center leading-none">
                  {lowStockCount > 9 ? '9+' : lowStockCount}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight font-bold">Stock</span>
          </button>
        )}

        {/* Dashboard Tab */}
        {(!currentStaffUser || isTabAccessibleForUser('dashboard', currentStaffUser, rolePermissions)) && (
          <button
            type="button"
            id="mobile-nav-dashboard"
            onClick={() => handleSelectTab('dashboard')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all min-h-[44px] min-w-[56px] ${
              activeTab === 'dashboard'
                ? 'text-emerald-400 font-bold bg-emerald-950/60 ring-1 ring-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight font-bold">Dashboard</span>
          </button>
        )}

        {/* Sales / Reports Tab */}
        {(!currentStaffUser || isTabAccessibleForUser('sales_history', currentStaffUser, rolePermissions)) && (
          <button
            type="button"
            id="mobile-nav-sales"
            onClick={() => handleSelectTab('sales_history')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all min-h-[44px] min-w-[56px] ${
              activeTab === 'sales_history'
                ? 'text-emerald-400 font-bold bg-emerald-950/60 ring-1 ring-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight font-bold">Sales</span>
          </button>
        )}

        {/* More / Menu Drawer Trigger */}
        <button
          type="button"
          id="mobile-nav-more"
          onClick={onOpenMobile}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-400 hover:text-white transition-all min-h-[44px] min-w-[56px]"
          title="Open All Menus & Settings"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight font-bold">Menu</span>
        </button>
      </nav>
    </>
  );
};
