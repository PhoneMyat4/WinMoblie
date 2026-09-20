/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Product, 
  Sale, 
  PurchaseRecord,
  ExpenseRecord,
  ExpenseCategoryItem,
  Customer, 
  Supplier, 
  CashDrawerRecord, 
  ShopSettings, 
  StaffUser,
  StaffRole,
  RolePermissions,
  StockAdjustment,
  StockAuditSession,
  PriceChangeRecord,
  PreOrder
} from './types';
import { StorageService } from './utils/storage';
import { isTabAccessibleForUser, getEffectiveUserPermissions } from './utils/permissionUtils';
import { checkStaffWorkingHoursAccess } from './utils/workingHours';
import { Navbar } from './components/Navbar';
import { Navigation, AppTab } from './components/Navigation';
import { Dashboard } from './components/dashboard/Dashboard';
import { PointOfSale } from './components/pos/PointOfSale';
import { PreOrdersManager } from './components/preorders/PreOrdersManager';
import { InventoryManager } from './components/inventory/InventoryManager';
import { DamageQuarantineManager } from './components/inventory/DamageQuarantineManager';
import { StockCheckManager } from './components/inventory/StockCheckManager';
import { ProductHistoryModal } from './components/inventory/ProductHistoryModal';
import { PurchasesManager } from './components/purchases/PurchasesManager';
import { ExpensesManager } from './components/expenses/ExpensesManager';
import { SaleHistoryManager } from './components/sales/SaleHistoryManager';
import { CustomersSuppliers } from './components/crm/CustomersSuppliers';
import { UserRolesManager } from './components/roles/UserRolesManager';
import { InvoiceCustomizer } from './components/invoice/InvoiceCustomizer';
import { CashDrawerManager } from './components/cash/CashDrawerManager';
import { CreditSalesManager } from './components/credit/CreditSalesManager';
import { DailyGrossProfitManager } from './components/financial/DailyGrossProfitManager';
import { PersonalFinanceManager } from './components/financial/PersonalFinanceManager';
import { SettingsManager } from './components/settings/SettingsManager';
import { ReportsManager } from './components/reports/ReportsManager';
import { TeamChatAndAnnouncementsHub } from './components/chat/TeamChatAndAnnouncementsHub';
import { RestrictedAccessView } from './components/common/RestrictedAccessView';
import { CashInOutModal } from './components/modals/CashInOutModal';
import { InvoicePrintModal } from './components/modals/InvoicePrintModal';
import { BarcodeLabelModal } from './components/modals/BarcodeLabelModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { AiChatWidget } from './components/ai/AiChatWidget';
import { SocialMediaMarketing } from './components/marketing/SocialMediaMarketing';
import { StaffPayrollDashboard } from './components/payroll/StaffPayrollDashboard';
import { AuditLogManager } from './components/audit/AuditLogManager';
import { AuditLogger } from './utils/auditLogger';
import { useGlobalNewTabLinks } from './hooks/useGlobalNewTabLinks';
import { usePeriodicSync } from './hooks/usePeriodicSync';
import { FirebaseAuthService } from './services/firebaseAuthService';
import { firestoreSync } from './services/firestoreSyncService';
import { updateDocumentFavicon } from './utils/favicon';

const VALID_TABS: AppTab[] = [
  'dashboard',
  'pos',
  'pre_orders',
  'reports',
  'inventory',
  'quarantine_rma',
  'stock_check',
  'purchases',
  'daily_profit',
  'personal_finance',
  'credit_sales',
  'expenses',
  'sales_history',
  'crm',
  'team_chat',
  'roles',
  'invoice_customizer',
  'cash_drawer',
  'settings',
  'social_marketing',
  'staff_payroll',
  'audit_logs'
];

function getInitialTab(): AppTab {
  if (typeof window === 'undefined') return 'dashboard';
  const searchParams = new URLSearchParams(window.location.search);
  const tabParam = searchParams.get('tab') as AppTab | null;
  if (tabParam && VALID_TABS.includes(tabParam)) {
    return tabParam;
  }
  const hash = window.location.hash.replace('#', '') as AppTab;
  if (hash && VALID_TABS.includes(hash)) {
    return hash;
  }
  return 'dashboard';
}

export default function App() {
  // Activate global new-tab link and button delegation
  useGlobalNewTabLinks();

  // Periodic localStorage-to-server synchronization hook (checks every 2 seconds & on tab focus)
  const syncInfo = usePeriodicSync(2000);

  // Application Data State
  const [products, setProducts] = useState<Product[]>(StorageService.getProducts());
  const [sales, setSales] = useState<Sale[]>(StorageService.getSales());
  const [preOrders, setPreOrders] = useState<PreOrder[]>(StorageService.getPreOrders());
  const [preOrderToFulfillInPos, setPreOrderToFulfillInPos] = useState<PreOrder | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(StorageService.getPurchases());
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(StorageService.getExpenses());
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryItem[]>(StorageService.getExpenseCategories());
  const [customers, setCustomers] = useState<Customer[]>(StorageService.getCustomers());
  const [suppliers, setSuppliers] = useState<Supplier[]>(StorageService.getSuppliers());
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>(StorageService.getStaffUsers());
  const [cashDrawer, setCashDrawer] = useState<CashDrawerRecord>(StorageService.getCashDrawer());
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>(StorageService.getStockAdjustments());
  const [priceChanges, setPriceChanges] = useState<PriceChangeRecord[]>(StorageService.getPriceChanges());
  const [stockAudits, setStockAudits] = useState<StockAuditSession[]>(StorageService.getStockAudits());
  const [settings, setSettings] = useState<ShopSettings>(StorageService.getSettings());
  const [rolePermissions, setRolePermissions] = useState<Record<StaffRole, RolePermissions>>(StorageService.getRolePermissions());

  // Authentication & Terminal Lock State (Check both sessionStorage & localStorage for new-tab continuity)
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const isAuth = sessionStorage.getItem('mobileshop_session_auth') === 'true' || 
                   localStorage.getItem('mobileshop_auth_active') === 'true';
    return !isAuth;
  });

  // UI Navigation State - initialized from URL parameters
  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab);
  const [selectedInvoiceToView, setSelectedInvoiceToView] = useState<Sale | null>(null);
  const [historyModalProduct, setHistoryModalProduct] = useState<Product | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState<boolean>(false);

  // Sync activeTab with browser URL search params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') !== activeTab) {
      params.set('tab', activeTab);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({ tab: activeTab }, '', newUrl);
    }
  }, [activeTab]);

  // Support browser Back/Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as AppTab | null;
      if (tabParam && VALID_TABS.includes(tabParam)) {
        setActiveTab(tabParam);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Security enforcement: purge any legacy client-stored AI API keys from localStorage
  useEffect(() => {
    try {
      const storedSettings = StorageService.getSettings();
      if (storedSettings?.secrets && ((storedSettings.secrets as any).openAiApiKey || (storedSettings.secrets as any).geminiApiKey)) {
        StorageService.saveSettings(storedSettings);
        setSettings(StorageService.getSettings());
      }
    } catch {
      // ignore
    }
  }, []);

  // Real-time browser tab favicon synchronization
  useEffect(() => {
    updateDocumentFavicon(settings.faviconUrl || settings.logoUrl);
  }, [settings.faviconUrl, settings.logoUrl]);

  // Global Quick Modal Triggers
  const [cashInOutModalType, setCashInOutModalType] = useState<'in' | 'out' | null>(null);
  const [barcodeModalProduct, setBarcodeModalProduct] = useState<{ product: Product; imei?: string } | null>(null);

  // Sync state on Storage & Cross-tab updates
  useEffect(() => {
    const handleStorageUpdate = () => {
      setProducts(StorageService.getProducts());
      setSales(StorageService.getSales());
      setPurchases(StorageService.getPurchases());
      setExpenses(StorageService.getExpenses());
      setExpenseCategories(StorageService.getExpenseCategories());
      setCustomers(StorageService.getCustomers());
      setSuppliers(StorageService.getSuppliers());
      setStaffUsers(StorageService.getStaffUsers());
      setCashDrawer(StorageService.getCashDrawer());
      setPreOrders(StorageService.getPreOrders());
      setStockAdjustments(StorageService.getStockAdjustments());
      setPriceChanges(StorageService.getPriceChanges());
      setStockAudits(StorageService.getStockAudits());
      setSettings(StorageService.getSettings());
      setRolePermissions(StorageService.getRolePermissions());

      // Sync auth & lock status across tabs
      const isAuth = sessionStorage.getItem('mobileshop_session_auth') === 'true' || 
                     localStorage.getItem('mobileshop_auth_active') === 'true';
      setIsLocked(!isAuth);
    };

    // Initialize Firebase Auth & Realtime synchronization if authenticated
    FirebaseAuthService.init();
    const isInitiallyAuth = sessionStorage.getItem('mobileshop_session_auth') === 'true' || 
                            localStorage.getItem('mobileshop_auth_active') === 'true';
    if (isInitiallyAuth) {
      firestoreSync.startRealtimeSync();
    }

    window.addEventListener('mobileshop_data_updated', handleStorageUpdate);
    window.addEventListener('storage', handleStorageUpdate);
    return () => {
      window.removeEventListener('mobileshop_data_updated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      firestoreSync.stopRealtimeSync();
    };
  }, []);

  // Compute live badges
  const lowStockCount = useMemo(() => {
    if (!Array.isArray(products)) return 0;
    return products.filter(p => {
      if (!p) return false;
      const stock = Number(p.stock) || 0;
      const min = typeof p.minStockAlert === 'number' ? p.minStockAlert : 0;
      return min > 0 ? stock <= min : stock <= 0;
    }).length;
  }, [products]);

  const quarantinedCount = useMemo(() => {
    try {
      const logs = StorageService.getDamageLogs();
      if (!Array.isArray(logs)) return 0;
      return logs.filter(l => l && l.status === 'Quarantined').length;
    } catch {
      return 0;
    }
  }, [products]);

  // Handlers for Authentication & Lock
  const handleLoginSuccess = (user: StaffUser) => {
    setIsLocked(false);
    sessionStorage.setItem('mobileshop_session_auth', 'true');
    localStorage.setItem('mobileshop_auth_active', 'true');
    const currentLatest = StorageService.getSettings();
    const updated = {
      ...currentLatest,
      currentStaffId: user.id,
      currentStaffName: user.name,
      currentStaffRole: user.role,
    };
    StorageService.saveSettings(updated);
    setSettings(updated);

    // Audit log login event
    AuditLogger.logAuth('AUTH_LOGIN', user, `Staff signed in: ${user.name} (${user.role})`);

    // Start real-time Firestore database synchronization
    firestoreSync.startRealtimeSync();

    // If Cashier logs in and no specific tab in URL, redirect to POS
    const params = new URLSearchParams(window.location.search);
    if (!params.get('tab')) {
      if (user.role === 'Cashier') {
        setActiveTab('pos');
      } else if (user.role === 'Inventory_Staff') {
        setActiveTab('inventory');
      }
    }
  };

  const handleLockTerminal = () => {
    AuditLogger.logAuth('TERMINAL_LOCK', currentActiveUser, `Terminal locked by ${currentActiveUser.name}`);
    setIsLocked(true);
    sessionStorage.removeItem('mobileshop_session_auth');
    localStorage.removeItem('mobileshop_auth_active');
    FirebaseAuthService.logout();
    firestoreSync.stopRealtimeSync();
  };

  const handleLogout = () => {
    AuditLogger.logAuth('AUTH_LOGOUT', currentActiveUser, `Staff logged out: ${currentActiveUser.name}`);
    setIsLocked(true);
    sessionStorage.removeItem('mobileshop_session_auth');
    localStorage.removeItem('mobileshop_auth_active');
    FirebaseAuthService.logout();
    firestoreSync.stopRealtimeSync();
  };

  // Handlers
  const handleCompleteSale = (newSale: Sale, updatedProducts: Product[], updatedCustomer?: Customer) => {
    StorageService.saveSale(newSale);
    StorageService.saveProducts(updatedProducts);
    if (updatedCustomer) {
      StorageService.saveCustomer(updatedCustomer);
    }
    AuditLogger.logSale(newSale, currentActiveUser, false);
    setSelectedInvoiceToView(newSale);
  };

  const handleSaveProduct = (prod: Product) => {
    StorageService.saveProduct(prod);
    AuditLogger.logInventory('PRODUCT_UPDATED', `Saved product: ${prod.name}`, currentActiveUser, {
      targetId: prod.id,
      targetName: prod.name,
      newValue: prod.stock
    });
  };

  const handleBulkSaveProducts = (newProducts: Product[], mergeWithExisting: boolean) => {
    StorageService.bulkSaveProducts(newProducts, mergeWithExisting);
    AuditLogger.logInventory('BULK_IMPORT', `Bulk updated ${newProducts.length} products`, currentActiveUser);
  };

  const handleDeleteProduct = (id: string) => {
    const existing = StorageService.getProducts().find(p => p.id === id);
    StorageService.deleteProduct(id);
    AuditLogger.logInventory('PRODUCT_DELETED', `Deleted product: ${existing?.name || id}`, currentActiveUser, { targetId: id });
  };

  const handleClearAllProducts = () => {
    StorageService.clearAllProducts();
    setProducts([]);
    AuditLogger.logInventory('PRODUCT_DELETED', 'Cleared all inventory products', currentActiveUser);
  };

  const handleStockAdjustment = (adj: StockAdjustment) => {
    StorageService.adjustStock(adj);
    AuditLogger.logInventory(
      'STOCK_ADJUSTED',
      `Stock adjusted for ${adj.productName}: ${adj.quantityChange > 0 ? '+' : ''}${adj.quantityChange} (${adj.reason})`,
      currentActiveUser,
      {
        targetId: adj.productId,
        targetName: adj.productName,
        previousValue: adj.previousStock,
        newValue: adj.newStock,
        quantityChange: adj.quantityChange,
        reason: adj.reason
      }
    );
  };

  const handleSavePurchase = (purchase: PurchaseRecord) => {
    StorageService.savePurchase(purchase);
    AuditLogger.log({
      actionType: 'PURCHASE_RECEIVED',
      category: 'purchases',
      severity: 'success',
      summary: `Supplier purchase recorded: ${purchase.purchaseOrderNumber || purchase.id} from ${purchase.supplierName}`,
      details: {
        targetId: purchase.id,
        supplierName: purchase.supplierName,
        invoiceNumber: purchase.purchaseOrderNumber,
        amount: purchase.grandTotal
      },
      staffUser: currentActiveUser
    });
  };

  const handleDeletePurchase = (id: string) => {
    StorageService.deletePurchase(id);
    AuditLogger.log({
      actionType: 'PURCHASE_DELETED',
      category: 'purchases',
      severity: 'danger',
      summary: `Deleted purchase record ID: ${id}`,
      details: { targetId: id },
      staffUser: currentActiveUser
    });
  };

  const handleSaveStockAudit = (audit: StockAuditSession) => {
    StorageService.saveStockAudit(audit);
    AuditLogger.logInventory('STOCK_ADJUSTED', `Saved stock audit session: ${audit.title || audit.id}`, currentActiveUser, { targetId: audit.id });
  };

  const handleReconcileStockAudit = (auditId: string) => {
    const res = StorageService.reconcileStockAudit(auditId);
    AuditLogger.logInventory('STOCK_ADJUSTED', `Reconciled stock audit discrepancies for session ${auditId}`, currentActiveUser, { targetId: auditId });
    return res;
  };

  const handleDeleteStockAudit = (auditId: string) => {
    StorageService.deleteStockAudit(auditId);
    AuditLogger.logInventory('STOCK_ADJUSTED', `Deleted stock audit session ${auditId}`, currentActiveUser, { targetId: auditId });
  };

  const handleSaveExpense = (exp: ExpenseRecord) => {
    StorageService.saveExpense(exp);
    AuditLogger.logExpense('EXPENSE_RECORDED', `Logged expense: ${exp.title} (${exp.category}) - ${exp.amount.toLocaleString()} Ks`, currentActiveUser, {
      targetId: exp.id,
      invoiceNumber: exp.voucherNumber,
      amount: exp.amount
    });
  };

  const handleDeleteExpense = (id: string) => {
    StorageService.deleteExpense(id);
    AuditLogger.logExpense('EXPENSE_DELETED', `Deleted expense voucher ID: ${id}`, currentActiveUser, { targetId: id });
  };

  const handleSaveExpenseCategory = (cat: ExpenseCategoryItem) => {
    StorageService.saveExpenseCategory(cat);
  };

  const handleDeleteExpenseCategory = (id: string, reassignToId?: string) => {
    if (reassignToId) {
      const currentExpenses = StorageService.getExpenses();
      const updated = currentExpenses.map(e => e.category === id ? { ...e, category: reassignToId } : e);
      StorageService.saveExpenses(updated);
    }
    StorageService.deleteExpenseCategory(id);
  };

  const handleResetExpenseCategories = () => {
    StorageService.resetExpenseCategories();
  };

  const handleRefundSale = (saleId: string, reason: string, staffName: string) => {
    const sale = StorageService.getSales().find(s => s.id === saleId);
    StorageService.refundSale(saleId, reason, staffName);
    AuditLogger.logSale(
      sale || { id: saleId, totalAmount: 0 },
      currentActiveUser,
      true,
      reason
    );
  };

  const handleProcessItemRefund = (params: {
    saleId: string;
    itemsToRefund: {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      finalPrice: number;
      refundAmount: number;
      imei?: string;
      imei2?: string;
    }[];
    reason: string;
    refundMethod: string;
    restockItems: boolean;
    totalRefundAmount: number;
    staffName: string;
    notes?: string;
  }) => {
    StorageService.processItemRefund(params);
    AuditLogger.logSale(
      { id: params.saleId, totalAmount: params.totalRefundAmount },
      currentActiveUser,
      true,
      `${params.reason} (Method: ${params.refundMethod}, Restock: ${params.restockItems ? 'Yes' : 'No'})`
    );
  };

  const handleSaveCustomer = (cust: Customer) => {
    StorageService.saveCustomer(cust);
  };

  const handleSaveSupplier = (sup: Supplier) => {
    StorageService.saveSupplier(sup);
  };

  const handleSaveStaffUser = (user: StaffUser) => {
    StorageService.saveStaffUser(user);
    const updated = StorageService.getStaffUsers();
    setStaffUsers(updated);
    AuditLogger.logSecurity('STAFF_UPDATED', `Updated staff account: ${user.name} (${user.role})`, currentActiveUser, {
      targetId: user.id,
      targetName: user.name
    });
  };

  const handleDeleteStaffUser = (id: string) => {
    StorageService.deleteStaffUser(id);
    const updated = StorageService.getStaffUsers();
    setStaffUsers(updated);
    AuditLogger.logSecurity('STAFF_DELETED', `Deleted staff account ID: ${id}`, currentActiveUser, {
      targetId: id
    });
  };

  const handlePurgeMockStaffUsers = () => {
    const updated = StorageService.purgeMockStaffUsers();
    setStaffUsers(updated);
    firestoreSync.purgeMockStaffUsersFromFirestore().catch(() => {});
    AuditLogger.logSecurity('STAFF_DELETED', `Purged all mock demonstration staff user accounts`, currentActiveUser);
  };

  const handleSwitchActiveStaff = (user: StaffUser) => {
    const latestStaff = StorageService.getStaffUsers();
    const freshUser = latestStaff.find(u => u.id === user.id) || user;

    const hoursCheck = checkStaffWorkingHoursAccess(freshUser);
    if (!hoursCheck.allowed) {
      alert(hoursCheck.reason);
      return;
    }

    const updated = {
      ...settings,
      currentStaffId: freshUser.id,
      currentStaffName: freshUser.name,
      currentStaffRole: freshUser.role,
    };
    StorageService.saveSettings(updated);
    setSettings(updated);
    setStaffUsers(latestStaff);

    AuditLogger.logAuth('OPERATOR_SWITCH', freshUser, `Terminal operator switched to ${freshUser.name} (${freshUser.role})`);

    if (!isTabAccessibleForUser(activeTab, freshUser, rolePermissions)) {
      setActiveTab('dashboard');
    }
  };

  const handleSaveRolePermissions = (newPermissions: Record<StaffRole, RolePermissions>) => {
    StorageService.saveRolePermissions(newPermissions);
    setRolePermissions(newPermissions);
    AuditLogger.logSecurity('ROLE_PERMISSIONS_UPDATED', `Updated role permissions matrix`, currentActiveUser);
  };

  const handleResetRolePermissions = (role?: StaffRole) => {
    const updated = StorageService.resetRolePermissions(role);
    setRolePermissions(updated);
    AuditLogger.logSecurity('ROLE_PERMISSIONS_UPDATED', `Reset role permissions to system defaults`, currentActiveUser);
  };

  const handleCashVoucherSubmit = (reason: string, amount: number) => {
    if (cashInOutModalType) {
      StorageService.recordCashTransaction(cashInOutModalType, amount, reason);
      AuditLogger.logCashDrawer(
        cashInOutModalType === 'in' ? 'CASH_DRAWER_IN' : 'CASH_DRAWER_OUT',
        `Cash ${cashInOutModalType === 'in' ? 'In' : 'Out'} voucher: ${amount.toLocaleString()} Ks (${reason})`,
        currentActiveUser,
        { amount, reason }
      );
      setCashInOutModalType(null);
    }
  };

  const handleCloseShift = (actualCounted: number, notes: string) => {
    StorageService.closeCashDrawerShift(actualCounted, notes);
    AuditLogger.logCashDrawer(
      'CASH_SHIFT_CLOSED',
      `Cash drawer shift closed. Counted: ${actualCounted.toLocaleString()} Ks`,
      currentActiveUser,
      { amount: actualCounted, notes }
    );
  };

  const handleUpdateSettings = (newSettings: ShopSettings) => {
    StorageService.saveSettings(newSettings);
    setSettings(newSettings);
    AuditLogger.log({
      actionType: 'SETTINGS_UPDATED',
      category: 'settings',
      severity: 'info',
      summary: `Updated store profile settings (${newSettings.shopName})`,
      staffUser: currentActiveUser
    });
  };

  const handleTriggerSearch = (query: string) => {
    // Navigate to Inventory or Sales history depending on query
    if (query.startsWith('INV-')) {
      setActiveTab('sales_history');
    } else {
      setActiveTab('inventory');
    }
  };

  // Current Active Staff and Access Authorization
  const currentActiveUser: StaffUser = useMemo(() => {
    const fallbackUser: StaffUser = {
      id: 'staff-owner-1',
      username: 'owner',
      name: 'Shop Owner',
      role: 'Owner',
      phone: '09-123456789',
      pin: '1234',
      password: 'password123',
      active: true
    };
    if (!Array.isArray(staffUsers) || staffUsers.length === 0) {
      return fallbackUser;
    }
    return (
      staffUsers.find(u => u && u.id === settings.currentStaffId) || 
      staffUsers.find(u => u && u.name === settings.currentStaffName) || 
      staffUsers.find(u => Boolean(u)) || 
      fallbackUser
    );
  }, [staffUsers, settings.currentStaffId, settings.currentStaffName]);

  const effectiveUserPerms = useMemo(() => {
    return getEffectiveUserPermissions(currentActiveUser, rolePermissions);
  }, [currentActiveUser, rolePermissions]);

  const canAccessAiCopilot = Boolean(effectiveUserPerms?.canAccessAiCopilot ?? (currentActiveUser.role === 'Owner' || currentActiveUser.role === 'Manager'));
  const isCurrentTabPermitted = isTabAccessibleForUser(activeTab, currentActiveUser, rolePermissions);

  if (isLocked) {
    return (
      <LoginScreen
        staffUsers={staffUsers}
        settings={settings}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-row text-slate-800 antialiased selection:bg-emerald-500 selection:text-white w-full max-w-full overflow-x-clip">
      
      {/* Left Side Navigation Sidebar */}
      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        lowStockCount={lowStockCount}
        quarantinedCount={quarantinedCount}
        settings={settings}
        currentStaffUser={currentActiveUser}
        rolePermissions={rolePermissions}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onOpenMobile={() => setIsMobileMenuOpen(true)}
        onLockTerminal={handleLockTerminal}
        onOpenAiAssistant={canAccessAiCopilot ? () => setIsAiChatOpen(true) : undefined}
      />

      {/* Main Content Area (Right of Sidebar) */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-screen w-full max-w-full transition-all duration-300 print:ml-0 ${
        isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
      }`}>
        
        {/* Top Header Navbar */}
        <Navbar
          settings={settings}
          cashDrawer={cashDrawer}
          staffUsers={staffUsers}
          currentStaffUser={currentActiveUser}
          rolePermissions={rolePermissions}
          syncInfo={syncInfo}
          onOpenNewSale={() => setActiveTab('pos')}
          onOpenPurchases={() => setActiveTab('purchases')}
          onOpenExpenses={() => setActiveTab('expenses')}
          onOpenCashInOut={(type) => setCashInOutModalType(type)}
          onTriggerSearch={handleTriggerSearch}
          onSwitchStaffUser={handleSwitchActiveStaff}
          onOpenRolesTab={() => setActiveTab('roles')}
          onOpenAiAssistant={canAccessAiCopilot ? () => setIsAiChatOpen(true) : undefined}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onLockTerminal={handleLockTerminal}
          onLogout={handleLogout}
        />

        {/* Primary Screen View */}
        <main className="flex-1 overflow-x-clip pb-20 md:pb-6">
          {!isCurrentTabPermitted ? (
            <RestrictedAccessView
              tab={activeTab}
              currentStaffUser={currentActiveUser}
              staffUsers={staffUsers}
              settings={settings}
              rolePermissions={rolePermissions}
              onSwitchStaffUser={handleSwitchActiveStaff}
              onNavigateToAllowedTab={(tab) => setActiveTab(tab)}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard
                  products={products}
                  sales={sales}
                  purchases={purchases}
                  expenses={expenses}
                  cashDrawer={cashDrawer}
                  settings={settings}
                  currentStaffUser={currentActiveUser}
                  rolePermissions={rolePermissions}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenNewSale={() => setActiveTab('pos')}
                  onOpenNewPurchase={() => setActiveTab('purchases')}
                  onOpenNewExpense={() => setActiveTab('expenses')}
                  onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
                />
              )}

          {activeTab === 'pos' && (
            <PointOfSale
              products={products}
              customers={customers}
              settings={settings}
              activePreOrderToFulfill={preOrderToFulfillInPos}
              onClearActivePreOrder={() => setPreOrderToFulfillInPos(null)}
              onCompleteSale={handleCompleteSale}
              onAddNewCustomer={handleSaveCustomer}
            />
          )}

          {activeTab === 'pre_orders' && (
            <PreOrdersManager
              preOrders={preOrders}
              customers={customers}
              products={products}
              settings={settings}
              onRefreshData={() => {
                setPreOrders(StorageService.getPreOrders());
                setProducts(StorageService.getProducts());
                setCustomers(StorageService.getCustomers());
              }}
              onSaveCustomer={handleSaveCustomer}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onSelectPreOrderForPos={(order) => {
                setPreOrderToFulfillInPos(order);
                setActiveTab('pos');
              }}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryManager
              products={products}
              settings={settings}
              onSaveProduct={handleSaveProduct}
              onBulkSaveProducts={handleBulkSaveProducts}
              onDeleteProduct={handleDeleteProduct}
              onClearAllProducts={handleClearAllProducts}
              onOpenProductHistory={(product) => setHistoryModalProduct(product)}
              onOpenStockCheck={() => setActiveTab('stock_check')}
              onOpenQuarantineRma={() => setActiveTab('quarantine_rma')}
            />
          )}

          {activeTab === 'quarantine_rma' && (
            <DamageQuarantineManager
              products={products}
              settings={settings}
              currentStaffUser={currentActiveUser}
              onProductsUpdated={(updated) => setProducts(updated)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'stock_check' && (
            <StockCheckManager
              products={products}
              stockAudits={stockAudits}
              settings={settings}
              staffUsers={staffUsers}
              onSaveAudit={handleSaveStockAudit}
              onReconcileAudit={handleReconcileStockAudit}
              onDeleteAudit={handleDeleteStockAudit}
              onOpenProductHistory={(product) => setHistoryModalProduct(product)}
            />
          )}

          {activeTab === 'purchases' && (
            <PurchasesManager
              purchases={purchases}
              products={products}
              suppliers={suppliers}
              settings={settings}
              preOrders={preOrders}
              currentStaffUser={currentActiveUser}
              staffUsers={staffUsers}
              rolePermissions={rolePermissions}
              onSavePurchase={handleSavePurchase}
              onSaveSupplier={handleSaveSupplier}
            />
          )}

          {activeTab === 'daily_profit' && (
            <DailyGrossProfitManager
              sales={sales}
              products={products}
              expenses={expenses}
              settings={settings}
              staffUsers={staffUsers}
              currentStaffUser={currentActiveUser}
              onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'personal_finance' && (
            <PersonalFinanceManager
              settings={settings}
              currentStaffUser={currentActiveUser}
              cashDrawer={cashDrawer}
              sales={sales}
              expenses={expenses}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'credit_sales' && (
            <CreditSalesManager
              customers={customers}
              settings={settings}
              currentStaffUser={currentActiveUser}
              rolePermissions={rolePermissions}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesManager
              expenses={expenses}
              settings={settings}
              categories={expenseCategories}
              onSaveExpense={handleSaveExpense}
              onDeleteExpense={handleDeleteExpense}
              onSaveCategory={handleSaveExpenseCategory}
              onDeleteCategory={handleDeleteExpenseCategory}
              onResetCategories={handleResetExpenseCategories}
              onNavigateToDailyProfit={() => setActiveTab('daily_profit')}
            />
          )}

          {activeTab === 'sales_history' && (
            <SaleHistoryManager
              sales={sales}
              settings={settings}
              onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
              onRefundSale={handleRefundSale}
              onProcessItemRefund={handleProcessItemRefund}
              onArchiveSalesComplete={(deletedIds) => {
                const deletedSet = new Set(deletedIds);
                setSales((prev) => prev.filter((s) => !deletedSet.has(s.id)));
              }}
            />
          )}

          {activeTab === 'reports' && (
            <div className="p-4 sm:p-6 lg:p-8">
              <ReportsManager
                products={products}
                sales={sales}
                customers={customers}
                settings={settings}
                staffUsers={staffUsers}
                purchases={purchases}
                cashDrawer={cashDrawer}
                expenses={expenses}
                stockAdjustments={stockAdjustments}
                onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
                onOpenBarcodeModal={(product, imei) => setBarcodeModalProduct({ product, imei })}
              />
            </div>
          )}

          {activeTab === 'crm' && (
            <CustomersSuppliers
              customers={customers}
              suppliers={suppliers}
              sales={sales}
              preOrders={preOrders}
              settings={settings}
              onSaveCustomer={handleSaveCustomer}
              onSaveSupplier={handleSaveSupplier}
              onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
            />
          )}

          {activeTab === 'team_chat' && (
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
              <TeamChatAndAnnouncementsHub
                currentUser={currentActiveUser}
                canManageAnnouncements={Boolean(rolePermissions?.[currentActiveUser.role]?.canManageAnnouncements ?? (currentActiveUser.role === 'Owner' || currentActiveUser.role === 'Manager'))}
                products={products}
                staffUsers={staffUsers}
              />
            </div>
          )}

          {activeTab === 'roles' && (
            <UserRolesManager
              staffUsers={staffUsers}
              settings={settings}
              rolePermissions={rolePermissions}
              onSaveStaffUser={handleSaveStaffUser}
              onDeleteStaffUser={handleDeleteStaffUser}
              onPurgeMockStaffUsers={handlePurgeMockStaffUsers}
              onSwitchActiveStaff={handleSwitchActiveStaff}
              onSaveRolePermissions={handleSaveRolePermissions}
              onResetRolePermissions={handleResetRolePermissions}
            />
          )}

          {activeTab === 'audit_logs' && (
            <AuditLogManager
              settings={settings}
              currentStaffUser={currentActiveUser}
              rolePermissions={rolePermissions}
              staffUsers={staffUsers}
              onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'invoice_customizer' && (
            <InvoiceCustomizer
              settings={settings}
              onSaveSettings={handleUpdateSettings}
            />
          )}

          {activeTab === 'cash_drawer' && (
            <CashDrawerManager
              cashDrawer={cashDrawer}
              settings={settings}
              onOpenCashInOut={(type) => setCashInOutModalType(type)}
              onCloseShift={handleCloseShift}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsManager
              settings={settings}
              sales={sales}
              onUpdateSettings={handleUpdateSettings}
              onResetData={() => {
                StorageService.resetToInitialData();
              }}
              onClearTestData={() => {
                StorageService.clearAllTestData();
              }}
              onArchiveSalesComplete={(deletedIds) => {
                const deletedSet = new Set(deletedIds);
                setSales((prev) => prev.filter((s) => !deletedSet.has(s.id)));
              }}
            />
          )}

          {activeTab === 'social_marketing' && (
            <SocialMediaMarketing
              products={products}
              settings={settings}
              onNavigateTab={(tab) => setActiveTab(tab as AppTab)}
            />
          )}
          {activeTab === 'staff_payroll' && (
            <StaffPayrollDashboard
              staffUsers={staffUsers}
              currentStaffUser={currentActiveUser}
              rolePermissions={rolePermissions}
            />
          )}

          </>
          )}
        </main>

      </div>

      {/* Global Quick Cash In / Cash Out Modal */}
      {cashInOutModalType && (
        <CashInOutModal
          type={cashInOutModalType}
          settings={settings}
          onClose={() => setCashInOutModalType(null)}
          onSubmit={handleCashVoucherSubmit}
        />
      )}

      {/* Customizable Thermal Receipt Modal */}
      {selectedInvoiceToView && (
        <InvoicePrintModal
          sale={selectedInvoiceToView}
          settings={settings}
          onClose={() => setSelectedInvoiceToView(null)}
        />
      )}

      {/* Product Movement History & Lifecycle Modal */}
      {historyModalProduct && (
        <ProductHistoryModal
          product={historyModalProduct}
          sales={sales}
          purchases={purchases}
          stockAdjustments={stockAdjustments}
          stockAudits={stockAudits}
          priceChanges={priceChanges}
          settings={settings}
          staffUsers={staffUsers}
          currentStaffUser={currentActiveUser}
          onClose={() => setHistoryModalProduct(null)}
          onViewInvoice={(sale) => setSelectedInvoiceToView(sale)}
          onProductUpdated={(updated) => {
            setProducts(StorageService.getProducts());
            setStockAdjustments(StorageService.getStockAdjustments());
            setPriceChanges(StorageService.getPriceChanges());
            setHistoryModalProduct(updated);
          }}
        />
      )}

      {/* Barcode & Price Tag Print Modal */}
      {barcodeModalProduct && (
        <BarcodeLabelModal
          product={barcodeModalProduct.product}
          selectedImei={barcodeModalProduct.imei}
          settings={settings}
          onClose={() => setBarcodeModalProduct(null)}
        />
      )}

      {/* Interactive AI Chatbot Assistant Widget with Voice & Function Calling */}
      <AiChatWidget
        products={products}
        sales={sales}
        expenses={expenses}
        purchases={purchases}
        cashDrawer={cashDrawer}
        stockAdjustments={stockAdjustments}
        settings={settings}
        isOpen={isAiChatOpen}
        onClose={() => setIsAiChatOpen(false)}
        onNavigateToInventory={() => setActiveTab('inventory')}
        onNavigateToReports={() => setActiveTab('reports')}
        canAccess={canAccessAiCopilot}
        currentStaffUser={currentActiveUser}
        rolePermissions={rolePermissions}
      />

    </div>
  );
}
