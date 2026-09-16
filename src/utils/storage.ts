import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  PurchaseItem,
  ExpenseRecord, 
  ExpenseCategoryItem,
  StockAdjustment, 
  StockAuditSession,
  PriceChangeRecord,
  PriceChangeReason,
  Customer, 
  Supplier, 
  CashDrawerRecord, 
  ShopSettings, 
  StaffUser,
  RefundRecord,
  RefundItem,
  PaymentMethod,
  StaffRole,
  RolePermissions,
  PreOrder,
  PreOrderStatus,
  Announcement,
  ChatChannel,
  ChatMessage,
  FirebaseSyncConfig,
  CreditSaleRecord,
  CreditRepaymentRecord,
  CreditSaleStatus,
  DamageLog,
  SystemHealthReport,
  CleanupResult,
  PersonalWallet,
  PersonalTransaction,
  PersonalBudget,
  PersonalSavingsGoal,
  PersonalDebtIOU,
  SocialMarketingState,
  FacebookAdPostRecord,
  AuditLogEntry,
  AuditActionType,
  AuditCategory,
  AuditSeverity
} from '../types';
import { 
  initialSettings, 
  initialProducts, 
  initialSales, 
  initialPurchases, 
  initialExpenses, 
  initialExpenseCategories,
  initialStockAdjustments, 
  initialStockAudits,
  initialPriceChanges,
  initialStaffUsers, 
  initialCustomers, 
  initialSuppliers, 
  initialCashDrawer,
  initialPreOrders,
  initialAnnouncements,
  initialChatChannels,
  initialChatMessages,
  initialCreditSales,
  initialDamageLogs,
  initialAuditLogs
} from '../data/initialData';
import {
  initialPersonalWallets,
  initialPersonalTransactions,
  initialPersonalBudgets,
  initialPersonalSavingsGoals,
  initialPersonalDebts
} from '../data/initialPersonalFinance';
import { DEFAULT_ROLE_PERMISSIONS } from './permissionUtils';
import { isSameProductVariant, findExactVariantMatch, normalizeVariantText } from './variantUtils';
import { canonicalCategory, isPhoneCategory } from '../data/categoryTaxonomy';

export const STORAGE_KEYS = {
  SETTINGS: 'mobileshop_settings_v2',
  PRODUCTS: 'mobileshop_products_v2',
  SALES: 'mobileshop_sales_v2',
  CREDIT_SALES: 'mobileshop_credit_sales_v2',
  PURCHASES: 'mobileshop_purchases_v2',
  EXPENSES: 'mobileshop_expenses_v2',
  EXPENSE_CATEGORIES: 'mobileshop_expense_categories_v2',
  STOCK_ADJUSTMENTS: 'mobileshop_adjustments_v2',
  PRICE_CHANGES: 'mobileshop_price_changes_v2',
  STOCK_AUDITS: 'mobileshop_stock_audits_v2',
  STAFF_USERS: 'mobileshop_staff_v2',
  ROLE_PERMISSIONS: 'mobileshop_role_permissions_v2',
  CUSTOMERS: 'mobileshop_customers_v2',
  SUPPLIERS: 'mobileshop_suppliers_v2',
  CASH_DRAWER: 'mobileshop_cash_drawer_v2',
  PRE_ORDERS: 'mobileshop_preorders_v2',
  ANNOUNCEMENTS: 'mobileshop_announcements_v2',
  CHAT_CHANNELS: 'mobileshop_chat_channels_v2',
  CHAT_MESSAGES: 'mobileshop_chat_messages_v2',
  DAMAGE_LOGS: 'mobileshop_damage_logs_v2',
  FIREBASE_SYNC_CONFIG: 'mobileshop_firebase_sync_config_v2',
  PERSONAL_WALLETS: 'mobileshop_personal_wallets_v2',
  PERSONAL_TRANSACTIONS: 'mobileshop_personal_transactions_v2',
  PERSONAL_BUDGETS: 'mobileshop_personal_budgets_v2',
  PERSONAL_GOALS: 'mobileshop_personal_goals_v2',
  PERSONAL_DEBTS: 'mobileshop_personal_debts_v2',
  SOCIAL_MARKETING_STATE: 'mobileshop_social_marketing_state_v2',
  FACEBOOK_POSTS: 'mobileshop_facebook_posts_v2',
  AUDIT_LOGS: 'mobileshop_audit_logs_v2',
  IS_FRESH_DATABASE: 'mobileshop_fresh_db_initialized_v2',
  LAST_UPDATED: 'mobileshop_last_updated_v2',
  BRANDING_BACKUP: 'mobileshop_branding_backup_v2',
};

// Cross-tab broadcast channel for instantaneous reactive tab synchronization
let tabBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    tabBroadcastChannel = new BroadcastChannel('mobileshop_tab_sync_channel');
  }
} catch {
  // BroadcastChannel unavailable in sandboxed context
}

function isFreshDatabase(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  if (localStorage.getItem(STORAGE_KEYS.IS_FRESH_DATABASE) === 'true') return true;
  try {
    const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      if (parsed?.isFreshDatabase === true) {
        // Also heal the dedicated flag so subsequent checks are fast
        localStorage.setItem(STORAGE_KEYS.IS_FRESH_DATABASE, 'true');
        return true;
      }
    }
  } catch {
    // ignore parse error
  }
  return false;
}

function getItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return defaultValue;
  }
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      // If the user initialized a fresh clean database, do not fall back to mock demo data arrays
      if (isFreshDatabase() && Array.isArray(defaultValue)) {
        return [] as unknown as T;
      }
      return defaultValue;
    }
    return JSON.parse(saved);
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T, notify = true): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, String(now));
    
    if (notify) {
      window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key, timestamp: now } }));
      if (tabBroadcastChannel) {
        tabBroadcastChannel.postMessage({ type: 'DATA_UPDATED', key, timestamp: now });
      }
    }
  } catch (err) {
    console.error(`Error writing ${key} to storage:`, err);
  }
}

function removeItem(key: string, notify = true): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(key);
    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, String(now));
    if (notify) {
      window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key, timestamp: now } }));
      if (tabBroadcastChannel) {
        tabBroadcastChannel.postMessage({ type: 'DATA_UPDATED', key, timestamp: now });
      }
    }
  } catch (err) {
    console.error(`Error removing ${key} from storage:`, err);
  }
}

export interface StorageChangeHandler {
  onSaleUpsert?: (sale: Sale) => void;
  onSalesBatch?: (sales: Sale[]) => void;
  onSaleDelete?: (id: string) => void;
  onPurchaseUpsert?: (purchase: PurchaseRecord) => void;
  onPurchasesBatch?: (purchases: PurchaseRecord[]) => void;
  onPurchaseDelete?: (id: string) => void;
  onCustomerUpsert?: (customer: Customer) => void;
  onExpenseUpsert?: (expense: ExpenseRecord) => void;
  onExpenseDelete?: (id: string) => void;
  onProductUpsert?: (product: Product) => void;
  onProductDelete?: (id: string) => void;
  onSettingsUpsert?: (settings: ShopSettings) => void;
  onSupplierUpsert?: (supplier: Supplier) => void;
  onStaffUserUpsert?: (user: StaffUser) => void;
  onStaffUsersBatch?: (users: StaffUser[]) => void;
  onStaffUserDelete?: (id: string) => void;
}

let activeStorageSyncHandler: StorageChangeHandler | null = null;

export const StorageService = {
  setSyncHandler: (handler: StorageChangeHandler | null) => {
    activeStorageSyncHandler = handler;
  },
  getSyncHandler: () => activeStorageSyncHandler,

  // Settings
  getSettings: (): ShopSettings => {
    const s = getItem(STORAGE_KEYS.SETTINGS, initialSettings);
    if (s?.secrets) {
      if ((s.secrets as any).openAiApiKey) delete (s.secrets as any).openAiApiKey;
      if ((s.secrets as any).geminiApiKey) delete (s.secrets as any).geminiApiKey;
    }
    // Safeguard: If branding/logos are missing from settings, restore from durable branding backup
    try {
      const brandingBackup = getItem<any>(STORAGE_KEYS.BRANDING_BACKUP, null);
      if (brandingBackup && typeof brandingBackup === 'object') {
        if (!s.logoUrl && brandingBackup.logoUrl) s.logoUrl = brandingBackup.logoUrl;
        if (!s.faviconUrl && brandingBackup.faviconUrl) s.faviconUrl = brandingBackup.faviconUrl;
        if (!s.invoiceLogoUrl && brandingBackup.invoiceLogoUrl) s.invoiceLogoUrl = brandingBackup.invoiceLogoUrl;
        if (!s.shopLogoSize && brandingBackup.shopLogoSize) s.shopLogoSize = brandingBackup.shopLogoSize;
        if (!s.invoiceLogoSize && brandingBackup.invoiceLogoSize) s.invoiceLogoSize = brandingBackup.invoiceLogoSize;
        if (s.logoTransparentBg === undefined && brandingBackup.logoTransparentBg !== undefined) {
          s.logoTransparentBg = brandingBackup.logoTransparentBg;
        }
      }
    } catch {
      // ignore
    }
    return s;
  },
  saveSettings: (settings: ShopSettings, triggerSync = true) => {
    const cleanSettings = { ...settings };
    if (cleanSettings?.secrets) {
      const cleanSecrets = { ...cleanSettings.secrets };
      delete (cleanSecrets as any).openAiApiKey;
      delete (cleanSecrets as any).geminiApiKey;
      cleanSettings.secrets = cleanSecrets;
    }

    // Persist branding backup whenever valid logos/branding are present
    try {
      const brandingBackup: any = getItem(STORAGE_KEYS.BRANDING_BACKUP, {});
      let changed = false;
      if (cleanSettings.logoUrl) {
        brandingBackup.logoUrl = cleanSettings.logoUrl;
        changed = true;
      }
      if (cleanSettings.faviconUrl) {
        brandingBackup.faviconUrl = cleanSettings.faviconUrl;
        changed = true;
      }
      if (cleanSettings.invoiceLogoUrl) {
        brandingBackup.invoiceLogoUrl = cleanSettings.invoiceLogoUrl;
        changed = true;
      }
      if (cleanSettings.shopLogoSize) {
        brandingBackup.shopLogoSize = cleanSettings.shopLogoSize;
        changed = true;
      }
      if (cleanSettings.invoiceLogoSize) {
        brandingBackup.invoiceLogoSize = cleanSettings.invoiceLogoSize;
        changed = true;
      }
      if (cleanSettings.logoTransparentBg !== undefined) {
        brandingBackup.logoTransparentBg = cleanSettings.logoTransparentBg;
        changed = true;
      }
      if (changed) {
        setItem(STORAGE_KEYS.BRANDING_BACKUP, brandingBackup, false);
      }
    } catch {
      // ignore
    }

    setItem(STORAGE_KEYS.SETTINGS, cleanSettings);
    if (triggerSync && activeStorageSyncHandler?.onSettingsUpsert) {
      activeStorageSyncHandler.onSettingsUpsert(cleanSettings);
    }
  },

  // Staff Users
  getStaffUsers: (): StaffUser[] => {
    const raw = getItem<StaffUser[]>(STORAGE_KEYS.STAFF_USERS, initialStaffUsers);
    return raw.map((u, idx) => ({
      ...u,
      username: u.username || (
        u.role === 'Owner' ? 'owner' :
        u.role === 'Manager' ? 'manager' :
        u.role === 'Inventory_Staff' ? 'stock' :
        `cashier${idx + 1}`
      ),
      password: u.password || u.pin || 'password123',
      restrictWorkingHours: u.role === 'Owner' ? false : Boolean(u.restrictWorkingHours),
      workStartTime: u.workStartTime || (u.restrictWorkingHours ? '07:30' : undefined),
      workEndTime: u.workEndTime || (u.restrictWorkingHours ? '19:00' : undefined),
    }));
  },
  saveStaffUsers: (users: StaffUser[], triggerSync = true) => {
    setItem(STORAGE_KEYS.STAFF_USERS, users);
    if (triggerSync && activeStorageSyncHandler?.onStaffUsersBatch) {
      activeStorageSyncHandler.onStaffUsersBatch(users);
    }
  },
  saveStaffUser: (user: StaffUser, triggerSync = true) => {
    const users = StorageService.getStaffUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    StorageService.saveStaffUsers(users, false);
    if (triggerSync && activeStorageSyncHandler?.onStaffUserUpsert) {
      activeStorageSyncHandler.onStaffUserUpsert(user);
    }
  },
  deleteStaffUser: (id: string, triggerSync = true) => {
    const users = StorageService.getStaffUsers().filter(u => u.id !== id);
    StorageService.saveStaffUsers(users, false);
    if (triggerSync && activeStorageSyncHandler?.onStaffUserDelete) {
      activeStorageSyncHandler.onStaffUserDelete(id);
    }
  },

  // Role Permissions
  getRolePermissions: (): Record<StaffRole, RolePermissions> => {
    const raw = getItem<Record<StaffRole, RolePermissions> | null>(STORAGE_KEYS.ROLE_PERMISSIONS, null);
    if (!raw) {
      return { ...DEFAULT_ROLE_PERMISSIONS };
    }
    // Deep merge to ensure newly added permission keys exist
    return {
      Owner: { ...DEFAULT_ROLE_PERMISSIONS.Owner, ...(raw.Owner || {}) },
      Manager: { ...DEFAULT_ROLE_PERMISSIONS.Manager, ...(raw.Manager || {}) },
      Cashier: { ...DEFAULT_ROLE_PERMISSIONS.Cashier, ...(raw.Cashier || {}) },
      Inventory_Staff: { ...DEFAULT_ROLE_PERMISSIONS.Inventory_Staff, ...(raw.Inventory_Staff || {}) },
    };
  },
  saveRolePermissions: (permissions: Record<StaffRole, RolePermissions>) => {
    setItem(STORAGE_KEYS.ROLE_PERMISSIONS, permissions);
  },
  resetRolePermissions: (role?: StaffRole): Record<StaffRole, RolePermissions> => {
    const current = StorageService.getRolePermissions();
    if (role) {
      current[role] = { ...DEFAULT_ROLE_PERMISSIONS[role] };
    } else {
      Object.assign(current, {
        Owner: { ...DEFAULT_ROLE_PERMISSIONS.Owner },
        Manager: { ...DEFAULT_ROLE_PERMISSIONS.Manager },
        Cashier: { ...DEFAULT_ROLE_PERMISSIONS.Cashier },
        Inventory_Staff: { ...DEFAULT_ROLE_PERMISSIONS.Inventory_Staff },
      });
    }
    StorageService.saveRolePermissions(current);
    return current;
  },

  // Products & Inventory
  getProducts: (): Product[] => {
    const prods = getItem(STORAGE_KEYS.PRODUCTS, initialProducts);
    
    // One-time migration guard for initial sample cookware - respects user deletions afterwards
    let list = prods;
    const COOKWARE_MIGRATED_KEY = 'mobileshop_cookware_migrated_v1';
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(COOKWARE_MIGRATED_KEY)) {
      const hasCookware = prods.some(p => canonicalCategory(p.category) === 'cookware');
      if (!hasCookware && prods.length > 0 && !isFreshDatabase()) {
        const cookwareSeed = initialProducts.filter(p => p.category === 'cookware');
        list = [...prods, ...cookwareSeed];
        setItem(STORAGE_KEYS.PRODUCTS, list);
      }
      localStorage.setItem(COOKWARE_MIGRATED_KEY, 'true');
    }

    // Merge any duplicate products created from legacy repurchasing glitches
    const deduplicated: Product[] = [];
    const seenMap = new Map<string, number>();
    list.forEach(p => {
      const key = `${canonicalCategory(p.category)}|${normalizeVariantText(p.brand)}|${normalizeVariantText(p.name)}|${normalizeVariantText(p.rom || p.storage)}|${normalizeVariantText(p.color)}`;
      if (seenMap.has(key)) {
        const existingIdx = seenMap.get(key)!;
        const existing = deduplicated[existingIdx];
        // Merge stock and IMEIs into the existing primary product
        existing.stock += p.stock;
        if (p.costPrice && p.costPrice > 0) existing.costPrice = p.costPrice;
        if (p.sellingPrice && p.sellingPrice > 0) existing.sellingPrice = p.sellingPrice;
        if (p.imeiPairs && p.imeiPairs.length > 0) {
          const set = new Set((existing.imeiPairs || []).map(x => x.imei1));
          const add = p.imeiPairs.filter(x => !set.has(x.imei1));
          existing.imeiPairs = [...(existing.imeiPairs || []), ...add];
        }
        if (p.imeiList && p.imeiList.length > 0) {
          const set = new Set(existing.imeiList || []);
          p.imeiList.forEach(x => set.add(x));
          existing.imeiList = Array.from(set);
        }
        if (isPhoneCategory(existing.category) && (existing.imeiPairs?.length || existing.imeiList?.length)) {
          const count = existing.imeiPairs?.length || existing.imeiList?.length || 0;
          existing.stock = Math.max(existing.stock, count);
        }
      } else {
        seenMap.set(key, deduplicated.length);
        deduplicated.push({ ...p });
      }
    });
    if (deduplicated.length !== list.length) {
      setItem(STORAGE_KEYS.PRODUCTS, deduplicated);
      list = deduplicated;
    }

    return list.map(p => ({
      ...p,
      category: canonicalCategory(p.category),
      model: p.model || p.name,
    }));
  },
  saveProducts: (products: Product[]) => setItem(STORAGE_KEYS.PRODUCTS, products),
  saveProduct: (product: Product, changedByStaff?: string, triggerSync = true) => {
    const products = StorageService.getProducts();
    const index = products.findIndex(p => p.id === product.id);
    if (index >= 0) {
      const existing = products[index];

      // Automatically capture price revisions if sellingPrice or costPrice changed
      if (existing.sellingPrice !== product.sellingPrice || (product.costPrice !== undefined && existing.costPrice !== product.costPrice)) {
        const oldSelling = existing.sellingPrice;
        const newSelling = product.sellingPrice;
        const oldCost = existing.costPrice || 0;
        const newCost = product.costPrice !== undefined ? product.costPrice : oldCost;
        const priceDelta = newSelling - oldSelling;
        const pctChange = oldSelling > 0 ? Number(((priceDelta / oldSelling) * 100).toFixed(1)) : 0;
        const oldMargin = oldSelling > 0 ? Number((((oldSelling - oldCost) / oldSelling) * 100).toFixed(1)) : 0;
        const newMargin = newSelling > 0 ? Number((((newSelling - newCost) / newSelling) * 100).toFixed(1)) : 0;

        const priceRecord: PriceChangeRecord = {
          id: `pc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          productName: product.name,
          timestamp: new Date().toISOString(),
          oldSellingPrice: oldSelling,
          newSellingPrice: newSelling,
          oldCostPrice: oldCost,
          newCostPrice: newCost,
          priceDelta,
          percentageChange: pctChange,
          oldMarginPercent: oldMargin,
          newMarginPercent: newMargin,
          reason: priceDelta < 0 ? 'promo_discount' : 'market_adjustment',
          reasonNotes: `Price updated via product catalog editor (${priceDelta >= 0 ? '+' : ''}${priceDelta.toLocaleString()} Ks)`,
          changedBy: changedByStaff || 'Authorized Staff',
          effectiveDate: new Date().toISOString().split('T')[0],
        };
        StorageService.recordPriceChange(priceRecord);
      }

      // Automatically capture stock adjustments if stock was modified directly
      if (existing.stock !== product.stock) {
        const diff = product.stock - existing.stock;
        const adjRecord: StockAdjustment = {
          id: `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          productName: product.name,
          type: diff > 0 ? 'add' : 'reduce',
          quantityChange: diff,
          previousStock: existing.stock,
          newStock: product.stock,
          reason: 'correction',
          reasonNotes: `Direct inventory level adjustment via product editor (${diff > 0 ? '+' : ''}${diff} units)`,
          timestamp: new Date().toISOString(),
          adjustedBy: changedByStaff || 'Authorized Staff',
        };
        StorageService.recordStockAdjustment(adjRecord);
      }

      products[index] = product;
    } else {
      products.unshift(product);
    }
    StorageService.saveProducts(products);

    if (triggerSync && activeStorageSyncHandler?.onProductUpsert) {
      activeStorageSyncHandler.onProductUpsert(product);
    }
  },
  bulkSaveProducts: (newProducts: Product[], mergeDuplicates: boolean = true, triggerSync: boolean = false) => {
    const existing = StorageService.getProducts();
    const currentList = [...existing];

    newProducts.forEach(newProd => {
      if (mergeDuplicates) {
        // Match exact variant
        const exactMatchIndex = currentList.findIndex(p =>
          isSameProductVariant(p, newProd) || (p.sku && newProd.sku && p.sku === newProd.sku)
        );

        if (exactMatchIndex >= 0) {
          const match = currentList[exactMatchIndex];
          const isPhone = isPhoneCategory(match.category);
          
          // Merge IMEIs
          const mergedPairs = [...(match.imeiPairs || [])];
          (newProd.imeiPairs || []).forEach(p => {
            if (!mergedPairs.some(ep => ep.imei1 === p.imei1)) {
              mergedPairs.push(p);
            }
          });

          const mergedFlatList = new Set(match.imeiList || []);
          (newProd.imeiList || []).forEach(im => mergedFlatList.add(im));

          currentList[exactMatchIndex] = {
            ...match,
            costPrice: newProd.costPrice > 0 ? newProd.costPrice : match.costPrice,
            sellingPrice: newProd.sellingPrice > 0 ? newProd.sellingPrice : match.sellingPrice,
            stock: isPhone && mergedPairs.length > 0 ? mergedPairs.length : (typeof newProd.stock === 'number' ? newProd.stock : match.stock),
            imeiPairs: isPhone && mergedPairs.length > 0 ? mergedPairs : match.imeiPairs,
            imeiList: isPhone && mergedFlatList.size > 0 ? Array.from(mergedFlatList) : match.imeiList,
            lastRestockedAt: newProd.lastRestockedAt || match.lastRestockedAt || new Date().toISOString(),
          };
          return;
        }
      }

      // Check if product with identical ID exists
      const idIndex = currentList.findIndex(p => p.id === newProd.id);
      if (idIndex >= 0) {
        currentList[idIndex] = newProd;
      } else {
        currentList.unshift(newProd);
      }
    });

    StorageService.saveProducts(currentList);
    if (triggerSync && activeStorageSyncHandler?.onProductUpsert) {
      newProducts.forEach(np => activeStorageSyncHandler?.onProductUpsert?.(np));
    }
  },
  deleteProduct: (id: string, triggerSync = true) => {
    const products = StorageService.getProducts().filter(p => p.id !== id);
    StorageService.saveProducts(products);
    if (triggerSync && activeStorageSyncHandler?.onProductDelete) {
      activeStorageSyncHandler.onProductDelete(id);
    }
  },

  // Damage Logs (3-Phase Quarantine, Assessment & Disposition System)
  getDamageLogs: (): DamageLog[] => getItem(STORAGE_KEYS.DAMAGE_LOGS, initialDamageLogs),
  saveDamageLogs: (logs: DamageLog[]) => setItem(STORAGE_KEYS.DAMAGE_LOGS, logs),
  addDamageLog: (log: DamageLog) => {
    const logs = StorageService.getDamageLogs();
    logs.unshift(log);
    StorageService.saveDamageLogs(logs);
  },
  updateDamageLog: (updatedLog: DamageLog) => {
    const logs = StorageService.getDamageLogs();
    const idx = logs.findIndex(l => l.id === updatedLog.id);
    if (idx !== -1) {
      logs[idx] = updatedLog;
    } else {
      logs.unshift(updatedLog);
    }
    StorageService.saveDamageLogs(logs);
  },
  deleteDamageLog: (id: string) => {
    const logs = StorageService.getDamageLogs().filter(l => l.id !== id);
    StorageService.saveDamageLogs(logs);
  },

  // User Activity & Audit Log History
  getAuditLogs: (): AuditLogEntry[] => getItem(STORAGE_KEYS.AUDIT_LOGS, initialAuditLogs),
  saveAuditLogs: (logs: AuditLogEntry[]) => setItem(STORAGE_KEYS.AUDIT_LOGS, logs),
  addAuditLog: (entry: AuditLogEntry | (Partial<AuditLogEntry> & { actionType: AuditActionType; category: AuditCategory; severity: AuditSeverity; summary: string })): AuditLogEntry => {
    const fullEntry: AuditLogEntry = {
      id: entry.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      staffId: entry.staffId || 'staff-admin',
      staffName: entry.staffName || 'System Admin',
      staffRole: entry.staffRole || 'Owner',
      actionType: entry.actionType,
      category: entry.category,
      severity: entry.severity,
      summary: entry.summary,
      details: entry.details,
      clientDevice: entry.clientDevice || 'Terminal (POS)',
      ipAddress: entry.ipAddress,
      expireAt: entry.expireAt || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
    };
    const logs = StorageService.getAuditLogs();
    logs.unshift(fullEntry);
    if (logs.length > 1500) {
      logs.length = 1500;
    }
    StorageService.saveAuditLogs(logs);
    return fullEntry;
  },
  clearAuditLogs: () => {
    StorageService.saveAuditLogs([]);
  },

  // Stock Adjustments (Flexible Quantity Adjust logging)
  getStockAdjustments: (): StockAdjustment[] => getItem(STORAGE_KEYS.STOCK_ADJUSTMENTS, initialStockAdjustments),
  saveStockAdjustments: (adjustments: StockAdjustment[]) => setItem(STORAGE_KEYS.STOCK_ADJUSTMENTS, adjustments),
  recordStockAdjustment: (adjustment: StockAdjustment) => {
    const adjustments = StorageService.getStockAdjustments();
    adjustments.unshift(adjustment);
    if (adjustments.length > 1000) {
      adjustments.length = 1000;
    }
    StorageService.saveStockAdjustments(adjustments);
  },
  adjustStock: (adjustment: StockAdjustment) => {
    StorageService.recordStockAdjustment(adjustment);
    const products = StorageService.getProducts();
    const prod = products.find(p => p.id === adjustment.productId);
    if (prod) {
      prod.stock = Math.max(0, adjustment.newStock);

      // Maintain serialized device IMEIs if specific IMEIs are affected
      if (adjustment.imeiList && adjustment.imeiList.length > 0) {
        if (adjustment.type === 'reduce' || adjustment.reason === 'damaged' || adjustment.reason === 'return_supplier' || adjustment.reason === 'sample') {
          const removedSet = new Set(adjustment.imeiList);
          if (prod.imeiList) {
            prod.imeiList = prod.imeiList.filter(im => !removedSet.has(im));
          }
          if (prod.imeiPairs) {
            prod.imeiPairs = prod.imeiPairs.filter(pair => !removedSet.has(pair.imei1) && (!pair.imei2 || !removedSet.has(pair.imei2)));
          }
        } else if (adjustment.type === 'add' || adjustment.reason === 'restock') {
          const existingImeis = new Set(prod.imeiList || []);
          const toAdd = adjustment.imeiList.filter(im => !existingImeis.has(im));
          if (!prod.imeiList) prod.imeiList = [];
          prod.imeiList.push(...toAdd);
        }
      }

      StorageService.saveProducts(products);
    }
  },

  // Product Price Change History & Activity Tracking
  getPriceChanges: (): PriceChangeRecord[] => getItem(STORAGE_KEYS.PRICE_CHANGES, initialPriceChanges),
  savePriceChanges: (records: PriceChangeRecord[]) => setItem(STORAGE_KEYS.PRICE_CHANGES, records),
  recordPriceChange: (record: PriceChangeRecord) => {
    const records = StorageService.getPriceChanges();
    records.unshift(record);
    if (records.length > 1000) {
      records.length = 1000;
    }
    StorageService.savePriceChanges(records);
  },
  getPriceChangesForProduct: (productId: string): PriceChangeRecord[] => {
    return StorageService.getPriceChanges().filter(p => p.productId === productId);
  },
  updateProductPrice: (
    productId: string,
    newSellingPrice: number,
    newCostPrice?: number,
    reason: PriceChangeReason = 'market_adjustment',
    reasonNotes?: string,
    changedBy: string = 'Authorized Staff'
  ): { success: boolean; product?: Product; priceRecord?: PriceChangeRecord } => {
    const products = StorageService.getProducts();
    const prod = products.find(p => p.id === productId);
    if (!prod) return { success: false };

    const oldSelling = prod.sellingPrice;
    const oldCost = prod.costPrice || 0;
    const newCost = newCostPrice !== undefined ? newCostPrice : oldCost;
    const priceDelta = newSellingPrice - oldSelling;
    const pctChange = oldSelling > 0 ? Number(((priceDelta / oldSelling) * 100).toFixed(1)) : 0;
    const oldMargin = oldSelling > 0 ? Number((((oldSelling - oldCost) / oldSelling) * 100).toFixed(1)) : 0;
    const newMargin = newSellingPrice > 0 ? Number((((newSellingPrice - newCost) / newSellingPrice) * 100).toFixed(1)) : 0;

    const priceRecord: PriceChangeRecord = {
      id: `pc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      productName: prod.name,
      timestamp: new Date().toISOString(),
      oldSellingPrice: oldSelling,
      newSellingPrice: newSellingPrice,
      oldCostPrice: oldCost,
      newCostPrice: newCost,
      priceDelta,
      percentageChange: pctChange,
      oldMarginPercent: oldMargin,
      newMarginPercent: newMargin,
      reason,
      reasonNotes: reasonNotes || `Price revised: ${priceDelta >= 0 ? '+' : ''}${priceDelta.toLocaleString()} Ks`,
      changedBy,
      effectiveDate: new Date().toISOString().split('T')[0],
    };

    StorageService.recordPriceChange(priceRecord);

    prod.sellingPrice = newSellingPrice;
    if (newCostPrice !== undefined) {
      prod.costPrice = newCostPrice;
    }
    StorageService.saveProducts(products);

    return { success: true, product: prod, priceRecord };
  },

  // Physical Stock Audits & Stock Taking Sessions
  getStockAudits: (): StockAuditSession[] => getItem(STORAGE_KEYS.STOCK_AUDITS, initialStockAudits),
  saveStockAudits: (audits: StockAuditSession[]) => setItem(STORAGE_KEYS.STOCK_AUDITS, audits),
  saveStockAudit: (audit: StockAuditSession) => {
    const audits = StorageService.getStockAudits();
    const index = audits.findIndex(a => a.id === audit.id);
    if (index >= 0) {
      audits[index] = audit;
    } else {
      audits.unshift(audit);
    }
    StorageService.saveStockAudits(audits);
  },
  deleteStockAudit: (id: string) => {
    const audits = StorageService.getStockAudits().filter(a => a.id !== id);
    StorageService.saveStockAudits(audits);
  },
  reconcileStockAudit: (auditId: string, staffName: string = 'Admin') => {
    const audits = StorageService.getStockAudits();
    const auditIndex = audits.findIndex(a => a.id === auditId);
    if (auditIndex === -1) return;

    const audit = audits[auditIndex];
    const products = StorageService.getProducts();
    const adjustments = StorageService.getStockAdjustments();
    const now = new Date().toISOString();

    audit.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return;

      if (item.variance !== 0) {
        // Record adjustment
        const adj: StockAdjustment = {
          id: `adj-aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productId: prod.id,
          productName: prod.name,
          type: item.variance > 0 ? 'add' : 'reduce',
          quantityChange: item.variance,
          previousStock: prod.stock,
          newStock: item.countedStock,
          reason: 'physical_audit',
          reasonNotes: item.notes || `Stock reconciled via Physical Audit #${audit.auditNumber} (Counted: ${item.countedStock}, System: ${item.bookStock})`,
          timestamp: now,
          adjustedBy: staffName,
          auditSessionId: audit.id,
        };
        adjustments.unshift(adj);
        prod.stock = item.countedStock;
      }

      // Sync IMEI list if scanned
      if (item.scannedImeis && item.scannedImeis.length > 0) {
        prod.imeiList = [...item.scannedImeis];
      }
    });

    audit.reconciled = true;
    audit.reconciledAt = now;
    audit.reconciledBy = staffName;
    audit.status = 'completed';
    audit.completedAt = audit.completedAt || now;

    audits[auditIndex] = audit;

    StorageService.saveProducts(products);
    StorageService.saveStockAdjustments(adjustments);
    StorageService.saveStockAudits(audits);
  },

  // Sales
  getSales: (): Sale[] => getItem(STORAGE_KEYS.SALES, initialSales),
  saveSales: (sales: Sale[], triggerSync = false) => {
    setItem(STORAGE_KEYS.SALES, sales);
    if (triggerSync && activeStorageSyncHandler?.onSalesBatch) {
      activeStorageSyncHandler.onSalesBatch(sales);
    }
  },
  saveSale: (sale: Sale, triggerSync = true) => {
    const sales = StorageService.getSales();
    sales.unshift(sale);
    StorageService.saveSales(sales, false);

    // If cash paid, auto-record in cash drawer
    if (sale.paymentMethod === 'cash' || sale.paymentDetails?.cashAmount) {
      const cashAmt = sale.paymentDetails?.cashAmount || sale.amountPaid;
      StorageService.recordCashTransaction('sale_cash', cashAmt, `POS Invoice #${sale.invoiceNumber} (${sale.customerName})`);
    }

    if (triggerSync && activeStorageSyncHandler?.onSaleUpsert) {
      activeStorageSyncHandler.onSaleUpsert(sale);
    }
  },
  bulkSaveSales: (remoteSales: Sale[], triggerSync = false) => {
    if (!remoteSales || remoteSales.length === 0) return;
    const currentSales = StorageService.getSales();
    const map = new Map<string, Sale>();
    currentSales.forEach(s => map.set(s.id, s));
    remoteSales.forEach(s => map.set(s.id, s));
    const merged = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.date || (a as any).createdAt || 0).getTime();
      const timeB = new Date(b.date || (b as any).createdAt || 0).getTime();
      return timeB - timeA;
    });
    setItem(STORAGE_KEYS.SALES, merged);
    if (triggerSync && activeStorageSyncHandler?.onSalesBatch) {
      activeStorageSyncHandler.onSalesBatch(merged);
    }
  },
  processItemRefund: (params: {
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
    const sales = StorageService.getSales();
    const saleIndex = sales.findIndex(s => s.id === params.saleId);
    if (saleIndex === -1) return;

    const sale = sales[saleIndex];
    const products = StorageService.getProducts();

    const refundItemsList: RefundItem[] = [];

    params.itemsToRefund.forEach(refundReq => {
      if (refundReq.quantity <= 0) return;

      // Find matching item in sale
      const targetSaleItem = sale.items.find(i => 
        i.productId === refundReq.productId && 
        (!refundReq.imei || i.imei === refundReq.imei)
      ) || sale.items.find(i => i.productId === refundReq.productId);

      if (targetSaleItem) {
        targetSaleItem.refundedQuantity = (targetSaleItem.refundedQuantity || 0) + refundReq.quantity;
        if (refundReq.imei) {
          targetSaleItem.refundedImeis = targetSaleItem.refundedImeis || [];
          if (!targetSaleItem.refundedImeis.includes(refundReq.imei)) {
            targetSaleItem.refundedImeis.push(refundReq.imei);
          }
        }
      }

      refundItemsList.push({
        productId: refundReq.productId,
        name: refundReq.name,
        quantity: refundReq.quantity,
        unitPrice: refundReq.unitPrice,
        finalPrice: refundReq.finalPrice,
        refundAmount: refundReq.refundAmount,
        imei: refundReq.imei,
        imei2: refundReq.imei2,
        restocked: params.restockItems,
      });

      // If restock items is enabled, return goods to inventory
      if (params.restockItems) {
        const prod = products.find(p => p.id === refundReq.productId);
        if (prod) {
          prod.stock += refundReq.quantity;
          
          // Re-insert IMEI to available pool
          if (refundReq.imei) {
            prod.imeiList = prod.imeiList || [];
            if (!prod.imeiList.includes(refundReq.imei)) {
              prod.imeiList.push(refundReq.imei);
            }

            // Update serialized item status if exists
            if (prod.serializedItems) {
              const serialItem = prod.serializedItems.find(si => si.imei === refundReq.imei);
              if (serialItem) {
                serialItem.status = 'In Stock';
                serialItem.soldInvoiceNumber = undefined;
                serialItem.soldDate = undefined;
                serialItem.history.push({
                  id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  timestamp: new Date().toISOString(),
                  action: 'refunded',
                  details: `Returned from invoice #${sale.invoiceNumber} (${params.reason}). Restocked.`,
                  performedBy: params.staffName,
                  referenceDoc: sale.invoiceNumber,
                });
              }
            }

            // Update imeiPairs if exists
            if (prod.imeiPairs) {
              const pair = prod.imeiPairs.find(p => p.imei1 === refundReq.imei);
              if (pair) {
                pair.status = 'In Stock';
              }
            }
          }
        }
      }
    });

    if (params.restockItems) {
      StorageService.saveProducts(products);
    }

    // Determine overall status
    const totalSoldQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalRefundedQty = sale.items.reduce((sum, item) => sum + (item.refundedQuantity || 0), 0);

    const isFullyRefunded = totalRefundedQty >= totalSoldQty;
    sale.status = isFullyRefunded ? 'refunded' : 'partially_refunded';
    sale.refundReason = params.reason;
    sale.refundedAt = new Date().toISOString();
    sale.refundedBy = params.staffName;
    sale.totalRefundedAmount = (sale.totalRefundedAmount || 0) + params.totalRefundAmount;

    // Record in refund history
    const refundRecord: RefundRecord = {
      id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      date: new Date().toISOString(),
      items: refundItemsList,
      reason: params.reason,
      refundMethod: params.refundMethod,
      restockItems: params.restockItems,
      totalRefundAmount: params.totalRefundAmount,
      refundedBy: params.staffName,
      notes: params.notes,
    };

    sale.refundHistory = sale.refundHistory || [];
    sale.refundHistory.unshift(refundRecord);

    sales[saleIndex] = sale;
    StorageService.saveSales(sales, false);
    if (activeStorageSyncHandler?.onSaleUpsert) {
      activeStorageSyncHandler.onSaleUpsert(sale);
    }

    // If refund method is Cash, deduct from Cash Register Drawer
    if (params.refundMethod.toLowerCase().includes('cash')) {
      StorageService.recordCashTransaction(
        'out', 
        params.totalRefundAmount, 
        `Refund Invoice #${sale.invoiceNumber} (${params.reason}) - ${params.itemsToRefund.length} item(s)`
      );
    }
  },
  refundSale: (saleId: string, refundReason: string, staffName: string) => {
    const sales = StorageService.getSales();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    // Default full refund of remaining returnable items
    const itemsToRefund = sale.items.map(item => {
      const returnableQty = item.quantity - (item.refundedQuantity || 0);
      const unitFinal = item.quantity > 0 ? item.finalPrice / item.quantity : item.unitPrice;
      return {
        productId: item.productId,
        name: item.name,
        quantity: Math.max(0, returnableQty),
        unitPrice: item.unitPrice,
        finalPrice: item.finalPrice,
        refundAmount: Math.max(0, returnableQty) * unitFinal,
        imei: item.imei,
        imei2: item.imei2,
      };
    }).filter(i => i.quantity > 0);

    const totalRefundAmount = itemsToRefund.reduce((sum, i) => sum + i.refundAmount, 0);

    StorageService.processItemRefund({
      saleId,
      itemsToRefund,
      reason: refundReason,
      refundMethod: sale.paymentMethod || 'cash',
      restockItems: true,
      totalRefundAmount,
      staffName,
    });
  },

  // Purchases (Supplier Orders & Stock In)
  getPurchases: (): PurchaseRecord[] => getItem(STORAGE_KEYS.PURCHASES, initialPurchases),
  savePurchases: (purchases: PurchaseRecord[], triggerSync = false) => {
    setItem(STORAGE_KEYS.PURCHASES, purchases);
    if (triggerSync && activeStorageSyncHandler?.onPurchasesBatch) {
      activeStorageSyncHandler.onPurchasesBatch(purchases);
    }
  },
  bulkSavePurchases: (remotePurchases: PurchaseRecord[], triggerSync = false) => {
    if (!remotePurchases || remotePurchases.length === 0) return;
    const currentPurchases = StorageService.getPurchases();
    const map = new Map<string, PurchaseRecord>();
    currentPurchases.forEach(p => map.set(p.id, p));
    remotePurchases.forEach(p => map.set(p.id, p));
    const merged = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.date || (a as any).createdAt || 0).getTime();
      const timeB = new Date(b.date || (b as any).createdAt || 0).getTime();
      return timeB - timeA;
    });
    setItem(STORAGE_KEYS.PURCHASES, merged);
    if (triggerSync && activeStorageSyncHandler?.onPurchasesBatch) {
      activeStorageSyncHandler.onPurchasesBatch(merged);
    }
  },
  savePurchase: (purchase: PurchaseRecord, triggerSync = true) => {
    const purchases = StorageService.getPurchases();
    const existingIndex = purchases.findIndex(p => p.id === purchase.id);
    
    if (existingIndex >= 0) {
      purchases[existingIndex] = purchase;
    } else {
      purchases.unshift(purchase);
    }
    StorageService.savePurchases(purchases, false);

    // Automatically sync delivery charges to Shop Expenses > Transport & Stock Delivery
    StorageService.syncPurchaseDeliveryExpense(purchase);

    // ONLY auto-update or restock products in inventory when the goods are physically RECEIVED
    if (purchase.status === 'received' && !purchase.inventoryUpdated) {
      const products = StorageService.getProducts();
      const totalDeliveryFee = (purchase.deliveryCharges !== undefined ? purchase.deliveryCharges : purchase.shippingFee) || 0;
      const totalUnits = purchase.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const deliveryPerUnit = totalUnits > 0 ? Math.round(totalDeliveryFee / totalUnits) : 0;

      purchase.items.forEach(item => {
        // Retain the supplier unit cost and selling price input at Stage 1
        item.landedUnitCost = item.unitCost;

        // Locate matching product in catalog
        let targetProduct: Product | undefined;

        // 1. Direct match by productId if bound to an existing catalog product
        if (item.productId && !item.productId.startsWith('prod-draft-')) {
          targetProduct = products.find(p => p.id === item.productId);
        }

        // 2. Exact variant match across catalog
        if (!targetProduct) {
          targetProduct = findExactVariantMatch(products, item);
        }

        // 3. Match by canonical category, brand, and name/model
        if (!targetProduct) {
          const cleanBrand = normalizeVariantText(item.brand);
          const cleanName = normalizeVariantText(item.name);
          const cleanCat = canonicalCategory(item.category);
          targetProduct = products.find(p => {
            if (canonicalCategory(p.category) !== cleanCat) return false;
            if (cleanBrand && normalizeVariantText(p.brand) !== cleanBrand) return false;
            const pName = normalizeVariantText(p.name);
            const pModel = p.model ? normalizeVariantText(p.model) : '';
            return pName === cleanName || pModel === cleanName ||
                   (cleanBrand && pName === `${cleanBrand} ${cleanName}`.trim());
          });
        }

        if (targetProduct) {
          item.productId = targetProduct.id;
          const oldCost = targetProduct.costPrice || 0;
          const oldSelling = targetProduct.sellingPrice || 0;

          // Restock existing variant with exact supplier unit cost and target retail price
          targetProduct.stock += item.quantity;
          if (item.unitCost > 0) {
            targetProduct.costPrice = item.unitCost;
          }
          if (item.sellingPrice > 0) {
            targetProduct.sellingPrice = item.sellingPrice;
          }
          targetProduct.lastRestockedAt = purchase.date;
          if (item.subCategory) targetProduct.subCategory = item.subCategory;
          if (item.condition) targetProduct.condition = item.condition;
          if (item.ram && (!targetProduct.ram || targetProduct.ram === '-')) targetProduct.ram = item.ram;
          if (item.rom && !targetProduct.rom) targetProduct.rom = item.rom;
          if (item.color && !targetProduct.color) targetProduct.color = item.color;
          if (item.warrantyMonths !== undefined) targetProduct.warrantyMonths = item.warrantyMonths;
          if (item.description) targetProduct.description = item.description;
          if (item.minStockAlert) targetProduct.minStockAlert = item.minStockAlert;
          
          // Merge IMEIs without duplicates
          if (item.imeiPairs && item.imeiPairs.length > 0) {
            const existingPairs = targetProduct.imeiPairs || [];
            const existingImei1Set = new Set(existingPairs.map(p => p.imei1));
            const newPairsToAdd = item.imeiPairs.filter(p => !existingImei1Set.has(p.imei1));
            targetProduct.imeiPairs = [...existingPairs, ...newPairsToAdd];
          }
          if (item.imeiList && item.imeiList.length > 0) {
            const existingList = new Set(targetProduct.imeiList || []);
            item.imeiList.forEach(im => existingList.add(im));
            targetProduct.imeiList = Array.from(existingList);
          }

          // Record price change history if cost or selling price was revised
          if ((item.sellingPrice > 0 && item.sellingPrice !== oldSelling) || (item.unitCost > 0 && item.unitCost !== oldCost)) {
            const newSelling = item.sellingPrice > 0 ? item.sellingPrice : oldSelling;
            const newCost = item.unitCost > 0 ? item.unitCost : oldCost;
            const priceDelta = newSelling - oldSelling;
            const pctChange = oldSelling > 0 ? Number(((priceDelta / oldSelling) * 100).toFixed(1)) : 0;
            const oldMargin = oldSelling > 0 ? Number((((oldSelling - oldCost) / oldSelling) * 100).toFixed(1)) : 0;
            const newMargin = newSelling > 0 ? Number((((newSelling - newCost) / newSelling) * 100).toFixed(1)) : 0;

            StorageService.recordPriceChange({
              id: `pc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              productId: targetProduct.id,
              productName: targetProduct.name,
              timestamp: new Date().toISOString(),
              oldSellingPrice: oldSelling,
              newSellingPrice: newSelling,
              oldCostPrice: oldCost,
              newCostPrice: newCost,
              priceDelta,
              percentageChange: pctChange,
              oldMarginPercent: oldMargin,
              newMarginPercent: newMargin,
              reason: 'supplier_cost_change',
              reasonNotes: `Price revised from Purchase Invoice #${purchase.purchaseOrderNumber}`,
              changedBy: purchase.receivedBy || purchase.createdBy || 'Authorized Staff',
              effectiveDate: new Date().toISOString().split('T')[0],
            });
          }
        } else {
          // Create new distinct variant in inventory with exact supplier unit cost and selling price
          const newProduct: Product = {
            id: item.productId && !products.some(p => p.id === item.productId)
              ? item.productId
              : `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: item.name,
            brand: item.brand,
            model: item.name,
            category: item.category,
            subCategory: item.subCategory,
            condition: item.condition || 'brand_new',
            sku: item.sku || `SKU-${Date.now().toString().slice(-6)}`,
            barcode: item.barcode || `${Math.floor(100000000000 + Math.random() * 900000000000)}`,
            costPrice: item.unitCost,
            sellingPrice: item.sellingPrice,
            stock: item.quantity,
            minStockAlert: item.minStockAlert || 2,
            warrantyMonths: item.warrantyMonths !== undefined ? item.warrantyMonths : 12,
            description: item.description || '',
            ram: item.ram,
            rom: item.rom,
            storage: item.storage,
            color: item.color,
            batteryHealth: item.batteryHealth,
            imeiPairs: item.imeiPairs || [],
            dualImei: item.dualImei ?? true,
            imeiList: item.imeiList || [],
            supplierId: purchase.supplierId,
            supplierName: purchase.supplierName,
            lastRestockedAt: purchase.date,
          };
          item.productId = newProduct.id;
          products.unshift(newProduct);
        }
      });
      StorageService.saveProducts(products);

      // Auto-bind allocated Pre-Orders to arriving inventory (Late-Linking Stage 2)
      const preOrders = StorageService.getPreOrders();
      let preOrdersUpdated = false;

      purchase.items.forEach(item => {
        const matchingProduct = products.find(p => p.id === item.productId) || findExactVariantMatch(products, item);
        
        // Check per-unit IMEI allocations
        if (item.imeiPairs && item.imeiPairs.length > 0) {
          item.imeiPairs.forEach(pair => {
            if (pair.allocatedPreOrderId) {
              const orderIdx = preOrders.findIndex(o => o.id === pair.allocatedPreOrderId);
              if (orderIdx >= 0) {
                preOrders[orderIdx] = {
                  ...preOrders[orderIdx],
                  status: 'Stock Arrived',
                  productId: matchingProduct?.id || item.productId,
                  productName: matchingProduct?.name || item.name,
                  allocatedImei: pair.imei1,
                  allocatedImei2: pair.imei2,
                  allocatedBarcode: matchingProduct?.barcode || item.barcode,
                  allocatedSku: matchingProduct?.sku || item.sku,
                  allocatedCostPrice: item.unitCost,
                  allocatedPurchaseOrderId: purchase.id,
                  allocatedPurchaseOrderNumber: purchase.purchaseOrderNumber,
                  allocatedAt: purchase.receivedAt || new Date().toISOString(),
                  allocatedBy: purchase.receivedBy || 'Storekeeper',
                };
                preOrdersUpdated = true;
              }
            }
          });
        }

        // Check line-item level allocation
        if (item.allocatedPreOrderId) {
          const orderIdx = preOrders.findIndex(o => o.id === item.allocatedPreOrderId);
          if (orderIdx >= 0) {
            const firstImei = item.imeiPairs?.[0]?.imei1 || item.imeiList?.[0];
            const secondImei = item.imeiPairs?.[0]?.imei2;
            preOrders[orderIdx] = {
              ...preOrders[orderIdx],
              status: 'Stock Arrived',
              productId: matchingProduct?.id || item.productId,
              productName: matchingProduct?.name || item.name,
              allocatedImei: preOrders[orderIdx].allocatedImei || firstImei,
              allocatedImei2: preOrders[orderIdx].allocatedImei2 || secondImei,
              allocatedBarcode: matchingProduct?.barcode || item.barcode,
              allocatedSku: matchingProduct?.sku || item.sku,
              allocatedCostPrice: item.unitCost,
              allocatedPurchaseOrderId: purchase.id,
              allocatedPurchaseOrderNumber: purchase.purchaseOrderNumber,
              allocatedAt: purchase.receivedAt || new Date().toISOString(),
              allocatedBy: purchase.receivedBy || 'Storekeeper',
            };
            preOrdersUpdated = true;
          }
        }
      });

      if (preOrdersUpdated) {
        StorageService.savePreOrders(preOrders);
      }

      purchase.inventoryUpdated = true;
      StorageService.savePurchases(purchases);
    }

    // If paid with cash, record outflow
    if (purchase.paymentMethod === 'cash' && purchase.amountPaid > 0 && purchase.status !== 'draft') {
      StorageService.recordCashTransaction('out', purchase.amountPaid, `Purchase Order #${purchase.purchaseOrderNumber} to ${purchase.supplierName}`);
    }

    if (triggerSync && activeStorageSyncHandler?.onPurchaseUpsert) {
      activeStorageSyncHandler.onPurchaseUpsert(purchase);
    }
  },
  submitPurchaseForApproval: (purchaseId: string, submitterName: string) => {
    const purchases = StorageService.getPurchases();
    const target = purchases.find(p => p.id === purchaseId);
    if (target && target.status === 'draft') {
      target.status = 'pending_approval';
      target.submittedForApprovalAt = new Date().toISOString();
      target.submittedBy = submitterName;
      StorageService.savePurchases(purchases);
      if (activeStorageSyncHandler?.onPurchaseUpsert) {
        activeStorageSyncHandler.onPurchaseUpsert(target);
      }
    }
  },
  confirmPurchaseOrder: (
    purchaseId: string, 
    data: {
      paymentMethod: PaymentMethod;
      isFullyPaid: boolean;
      amountPaid: number;
      paymentProofUrl?: string;
      paymentProofFileName?: string;
      approvalNotes?: string;
      confirmedBy: string;
      confirmedByRole: StaffRole;
    }
  ) => {
    const purchases = StorageService.getPurchases();
    const target = purchases.find(p => p.id === purchaseId);
    if (!target) return;

    target.status = 'confirmed';
    target.paymentMethod = data.paymentMethod;
    target.isFullyPaid = data.isFullyPaid;
    target.amountPaid = data.amountPaid;
    target.balanceDue = Math.max(0, target.grandTotal - data.amountPaid);
    target.paymentStatus = data.amountPaid >= target.grandTotal ? 'paid' : data.amountPaid > 0 ? 'partial' : 'unpaid';
    target.paymentProofUrl = data.paymentProofUrl;
    target.paymentProofFileName = data.paymentProofFileName;
    target.approvalNotes = data.approvalNotes;
    target.confirmedBy = data.confirmedBy;
    target.confirmedByRole = data.confirmedByRole;
    target.confirmedAt = new Date().toISOString();

    StorageService.savePurchases(purchases);
    if (activeStorageSyncHandler?.onPurchaseUpsert) {
      activeStorageSyncHandler.onPurchaseUpsert(target);
    }

    if (data.paymentMethod === 'cash' && data.amountPaid > 0) {
      StorageService.recordCashTransaction('out', data.amountPaid, `PO #${target.purchaseOrderNumber} Payment to ${target.supplierName}`);
    }
  },
  receivePurchaseOrder: (
    purchaseId: string,
    data: {
      deliveryCharges: number;
      receivedBy: string;
      receivingNotes?: string;
      receivedDate?: string;
      updatedItems?: PurchaseItem[];
    }
  ) => {
    const purchases = StorageService.getPurchases();
    const target = purchases.find(p => p.id === purchaseId);
    if (!target) return;

    if (data.updatedItems && data.updatedItems.length > 0) {
      target.items = data.updatedItems;
      target.subtotal = data.updatedItems.reduce((acc, item) => acc + item.totalCost, 0);
    }

    target.status = 'received';
    target.deliveryCharges = data.deliveryCharges;
    target.shippingFee = data.deliveryCharges;
    target.grandTotal = target.subtotal + target.otherCosts + data.deliveryCharges;
    target.totalLandedCost = target.grandTotal;
    target.receivedBy = data.receivedBy;
    target.receivedAt = data.receivedDate || new Date().toISOString();
    target.receivingNotes = data.receivingNotes;

    // Recalculate balance if fully paid or recalculate with delivery charges
    if (target.isFullyPaid) {
      target.amountPaid = target.grandTotal;
      target.balanceDue = 0;
      target.paymentStatus = 'paid';
    } else {
      target.balanceDue = Math.max(0, target.grandTotal - target.amountPaid);
    }

    StorageService.savePurchase(target);
  },
  revertPurchaseToDraft: (purchaseId: string) => {
    const purchases = StorageService.getPurchases();
    const target = purchases.find(p => p.id === purchaseId);
    if (!target) return;

    // If was received and inventory was updated, rollback stock first
    if (target.status === 'received' && target.inventoryUpdated) {
      StorageService.rollbackPurchaseInventory(target);
    }

    target.status = 'draft';
    target.submittedForApprovalAt = undefined;
    target.submittedBy = undefined;
    target.confirmedAt = undefined;
    target.confirmedBy = undefined;
    target.confirmedByRole = undefined;
    target.paymentProofUrl = undefined;
    target.paymentProofFileName = undefined;
    target.receivedAt = undefined;
    target.receivedBy = undefined;
    target.receivingNotes = undefined;
    target.inventoryUpdated = false;
    target.paymentStatus = 'unpaid';
    target.amountPaid = 0;
    target.balanceDue = target.grandTotal;

    StorageService.savePurchases(purchases);
    if (activeStorageSyncHandler?.onPurchaseUpsert) {
      activeStorageSyncHandler.onPurchaseUpsert(target);
    }
  },
  revertPurchaseToPendingApproval: (purchaseId: string) => {
    const purchases = StorageService.getPurchases();
    const target = purchases.find(p => p.id === purchaseId);
    if (!target) return;

    if (target.status === 'received' && target.inventoryUpdated) {
      StorageService.rollbackPurchaseInventory(target);
    }

    target.status = 'pending_approval';
    target.confirmedAt = undefined;
    target.confirmedBy = undefined;
    target.confirmedByRole = undefined;
    target.paymentProofUrl = undefined;
    target.paymentProofFileName = undefined;
    target.receivedAt = undefined;
    target.receivedBy = undefined;
    target.receivingNotes = undefined;
    target.inventoryUpdated = false;

    StorageService.savePurchases(purchases);
    if (activeStorageSyncHandler?.onPurchaseUpsert) {
      activeStorageSyncHandler.onPurchaseUpsert(target);
    }
  },
  revertPurchaseToConfirmed: (purchaseId: string) => {
    const purchases = StorageService.getPurchases();
    const target = purchases.find(p => p.id === purchaseId);
    if (!target) return;

    if (target.status === 'received' && target.inventoryUpdated) {
      StorageService.rollbackPurchaseInventory(target);
    }

    target.status = 'confirmed';
    target.receivedAt = undefined;
    target.receivedBy = undefined;
    target.receivingNotes = undefined;
    target.inventoryUpdated = false;

    StorageService.savePurchases(purchases);
    if (activeStorageSyncHandler?.onPurchaseUpsert) {
      activeStorageSyncHandler.onPurchaseUpsert(target);
    }
  },
  rollbackPurchaseInventory: (purchase: PurchaseRecord) => {
    const products = StorageService.getProducts();
    
    purchase.items.forEach(item => {
      // Find matching product
      let targetProduct: Product | undefined;
      if (item.productId && !item.productId.startsWith('prod-draft-')) {
        targetProduct = products.find(p => p.id === item.productId);
      }
      if (!targetProduct) {
        targetProduct = findExactVariantMatch(products, item);
      }
      if (!targetProduct) {
        const cleanBrand = normalizeVariantText(item.brand);
        const cleanName = normalizeVariantText(item.name);
        const cleanCat = canonicalCategory(item.category);
        targetProduct = products.find(p => {
          if (canonicalCategory(p.category) !== cleanCat) return false;
          if (cleanBrand && normalizeVariantText(p.brand) !== cleanBrand) return false;
          const pName = normalizeVariantText(p.name);
          const pModel = p.model ? normalizeVariantText(p.model) : '';
          return pName === cleanName || pModel === cleanName ||
                 (cleanBrand && pName === `${cleanBrand} ${cleanName}`.trim());
        });
      }

      if (targetProduct) {
        // Decrease stock
        targetProduct.stock = Math.max(0, targetProduct.stock - item.quantity);

        // Remove item's IMEIs from product
        if (item.imeiPairs && item.imeiPairs.length > 0) {
          const itemImei1Set = new Set(item.imeiPairs.map(p => p.imei1));
          targetProduct.imeiPairs = (targetProduct.imeiPairs || []).filter(p => !itemImei1Set.has(p.imei1));
        }
        if (item.imeiList && item.imeiList.length > 0) {
          const itemImeiSet = new Set(item.imeiList);
          targetProduct.imeiList = (targetProduct.imeiList || []).filter(im => !itemImeiSet.has(im));
        }
      }
    });

    StorageService.saveProducts(products);
  },
  updatePurchaseRecord: (updatedPurchase: PurchaseRecord) => {
    const purchases = StorageService.getPurchases();
    const index = purchases.findIndex(p => p.id === updatedPurchase.id);
    if (index !== -1) {
      purchases[index] = updatedPurchase;
      StorageService.savePurchases(purchases);
      StorageService.syncPurchaseDeliveryExpense(updatedPurchase);
      if (activeStorageSyncHandler?.onPurchaseUpsert) {
        activeStorageSyncHandler.onPurchaseUpsert(updatedPurchase);
      }
    }
  },
  deletePurchase: (id: string) => {
    const purchases = StorageService.getPurchases().filter(p => p.id !== id);
    StorageService.savePurchases(purchases);
    if (activeStorageSyncHandler?.onPurchaseDelete) {
      activeStorageSyncHandler.onPurchaseDelete(id);
    }
    // Also remove any auto-generated delivery expense linked to this purchase
    const expenses = StorageService.getExpenses().filter(
      e => e.purchaseId !== id && e.id !== `exp-deliv-${id}`
    );
    StorageService.saveExpenses(expenses);
  },

  // Helper to sync delivery charges from a Purchase Invoice directly to Shop Expenses under "Transport & Stock Delivery"
  syncPurchaseDeliveryExpense: (purchase: PurchaseRecord) => {
    const deliveryFee = Number(
      purchase.deliveryCharges !== undefined ? purchase.deliveryCharges : (purchase.shippingFee || 0)
    );
    const currentExpenses = getItem<ExpenseRecord[]>(STORAGE_KEYS.EXPENSES, initialExpenses);
    
    // Find if an expense for this purchase already exists
    const existingIndex = currentExpenses.findIndex(
      e => e.purchaseId === purchase.id || e.id === `exp-deliv-${purchase.id}`
    );

    const expenseDate = purchase.receivedAt || purchase.date || new Date().toISOString();
    const poNumber = purchase.purchaseOrderNumber || purchase.id;

    if (deliveryFee > 0) {
      const deliveryExpense: ExpenseRecord = {
        id: `exp-deliv-${purchase.id}`,
        voucherNumber: `EXP-DELIV-${poNumber.replace(/[^A-Za-z0-9]/g, '')}`,
        date: expenseDate,
        title: `Stock Delivery Fee: PO #${poNumber} (${purchase.supplierName})`,
        category: 'transport_delivery',
        amount: deliveryFee,
        paymentMethod: purchase.paymentMethod || 'cash',
        paymentRef: `PO #${poNumber}${purchase.referenceInvoiceNo ? ` (Ref: ${purchase.referenceInvoiceNo})` : ''}`,
        paidTo: `${purchase.supplierName} (Cargo / Delivery Gate)`,
        recordedBy: purchase.receivedBy || purchase.createdBy || 'Purchase ERP Sync',
        deductFromCashDrawer: purchase.paymentMethod === 'cash',
        notes: `Auto-saved delivery charge from Purchase Invoice #${poNumber} dated ${expenseDate.split('T')[0]}.`,
        purchaseId: purchase.id,
        purchaseOrderNumber: poNumber,
        isAutoGenerated: true,
        sourceType: 'purchase_delivery',
      };

      if (existingIndex >= 0) {
        currentExpenses[existingIndex] = {
          ...currentExpenses[existingIndex],
          ...deliveryExpense,
        };
      } else {
        currentExpenses.unshift(deliveryExpense);
      }
      setItem(STORAGE_KEYS.EXPENSES, currentExpenses);
    } else {
      // If delivery fee was removed or set to 0, remove the auto-synced voucher
      if (existingIndex >= 0) {
        currentExpenses.splice(existingIndex, 1);
        setItem(STORAGE_KEYS.EXPENSES, currentExpenses);
      }
    }
  },

  // Expenses
  getExpenses: (): ExpenseRecord[] => {
    const expenses = getItem<ExpenseRecord[]>(STORAGE_KEYS.EXPENSES, initialExpenses);
    return expenses;
  },
  saveExpenses: (expenses: ExpenseRecord[]) => setItem(STORAGE_KEYS.EXPENSES, expenses),
  saveExpense: (expense: ExpenseRecord, triggerSync = true) => {
    const expenses = StorageService.getExpenses();
    const index = expenses.findIndex(e => e.id === expense.id);
    if (index >= 0) {
      expenses[index] = expense;
    } else {
      expenses.unshift(expense);
    }
    StorageService.saveExpenses(expenses);

    // If deduct from drawer is checked, log cash outflow
    if (expense.deductFromCashDrawer || expense.paymentMethod === 'cash') {
      StorageService.recordCashTransaction('out', expense.amount, `Expense #${expense.voucherNumber}: ${expense.title}`);
    }

    if (triggerSync && activeStorageSyncHandler?.onExpenseUpsert) {
      activeStorageSyncHandler.onExpenseUpsert(expense);
    }
  },
  bulkSaveExpenses: (remoteExpenses: ExpenseRecord[], triggerSync = false) => {
    if (!remoteExpenses || remoteExpenses.length === 0) return;
    const currentExpenses = StorageService.getExpenses();
    const map = new Map<string, ExpenseRecord>();
    currentExpenses.forEach(e => map.set(e.id, e));
    remoteExpenses.forEach(e => map.set(e.id, e));
    const merged = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.date || (a as any).createdAt || 0).getTime();
      const timeB = new Date(b.date || (b as any).createdAt || 0).getTime();
      return timeB - timeA;
    });
    setItem(STORAGE_KEYS.EXPENSES, merged);
  },
  deleteExpense: (id: string, triggerSync = true) => {
    const expenses = StorageService.getExpenses().filter(e => e.id !== id);
    StorageService.saveExpenses(expenses);
    if (triggerSync && activeStorageSyncHandler?.onExpenseDelete) {
      activeStorageSyncHandler.onExpenseDelete(id);
    }
  },

  // Expense Categories (Customizable, with "Transport & Stock Delivery" Protected & Permanent)
  getExpenseCategories: (): ExpenseCategoryItem[] => {
    const categories = getItem<ExpenseCategoryItem[]>(STORAGE_KEYS.EXPENSE_CATEGORIES, initialExpenseCategories);
    const hasTransport = categories.some(c => c.id === 'transport_delivery');
    if (!hasTransport) {
      const defaultTransport: ExpenseCategoryItem = {
        id: 'transport_delivery',
        name: 'Transport & Stock Delivery',
        icon: 'Truck',
        badgeColor: 'teal',
        description: 'Highway bus gate fees, cargo shipping & messenger (System Protected)',
        isDefault: true,
        isPermanent: true,
        isSystem: true,
      };
      categories.push(defaultTransport);
      setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, categories);
    }
    return categories.map(c => 
      c.id === 'transport_delivery' 
        ? { ...c, isPermanent: true, isSystem: true, name: 'Transport & Stock Delivery' } 
        : c
    );
  },
  saveExpenseCategories: (categories: ExpenseCategoryItem[]) => {
    // Ensure transport_delivery is always preserved and permanent
    const hasTransport = categories.some(c => c.id === 'transport_delivery');
    let finalCategories = categories;
    if (!hasTransport) {
      finalCategories = [
        ...categories,
        {
          id: 'transport_delivery',
          name: 'Transport & Stock Delivery',
          icon: 'Truck',
          badgeColor: 'teal',
          description: 'Highway bus gate fees, cargo shipping & messenger (System Protected)',
          isDefault: true,
          isPermanent: true,
          isSystem: true,
        }
      ];
    } else {
      finalCategories = categories.map(c => 
        c.id === 'transport_delivery' 
          ? { ...c, isPermanent: true, isSystem: true, name: 'Transport & Stock Delivery' } 
          : c
      );
    }
    setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, finalCategories);
  },
  saveExpenseCategory: (category: ExpenseCategoryItem) => {
    const categories = StorageService.getExpenseCategories();
    // If attempting to modify protected category, ensure core attributes stay intact
    if (category.id === 'transport_delivery') {
      category.name = 'Transport & Stock Delivery';
      category.isPermanent = true;
      category.isSystem = true;
    }
    const index = categories.findIndex(c => c.id === category.id);
    if (index >= 0) {
      categories[index] = category;
    } else {
      categories.push(category);
    }
    StorageService.saveExpenseCategories(categories);
  },
  deleteExpenseCategory: (id: string) => {
    // Prevent deletion of protected transport_delivery category
    if (id === 'transport_delivery') {
      console.warn('Transport & Stock Delivery is a protected system category and cannot be deleted.');
      return;
    }
    const categories = StorageService.getExpenseCategories().filter(c => c.id !== id);
    StorageService.saveExpenseCategories(categories);
  },
  resetExpenseCategories: () => {
    StorageService.saveExpenseCategories(initialExpenseCategories);
  },

  // Customers
  getCustomers: (): Customer[] => getItem(STORAGE_KEYS.CUSTOMERS, initialCustomers),
  saveCustomers: (customers: Customer[]) => setItem(STORAGE_KEYS.CUSTOMERS, customers),
  saveCustomer: (customer: Customer, triggerSync = true) => {
    const customers = StorageService.getCustomers();
    const index = customers.findIndex(c => c.id === customer.id);
    if (index >= 0) {
      customers[index] = customer;
    } else {
      customers.unshift(customer);
    }
    StorageService.saveCustomers(customers);
    if (triggerSync && activeStorageSyncHandler?.onCustomerUpsert) {
      activeStorageSyncHandler.onCustomerUpsert(customer);
    }
  },
  bulkSaveCustomers: (remoteCustomers: Customer[], triggerSync = false) => {
    if (!remoteCustomers || remoteCustomers.length === 0) return;
    const currentCustomers = StorageService.getCustomers();
    const map = new Map<string, Customer>();
    currentCustomers.forEach(c => map.set(c.id, c));
    remoteCustomers.forEach(c => map.set(c.id, c));
    const merged = Array.from(map.values()).sort((a, b) => {
      return (b.totalSpent || 0) - (a.totalSpent || 0);
    });
    setItem(STORAGE_KEYS.CUSTOMERS, merged);
  },

  // Suppliers
  getSuppliers: (): Supplier[] => getItem(STORAGE_KEYS.SUPPLIERS, initialSuppliers),
  saveSuppliers: (suppliers: Supplier[]) => setItem(STORAGE_KEYS.SUPPLIERS, suppliers),
  saveSupplier: (supplier: Supplier, triggerSync = true) => {
    const suppliers = StorageService.getSuppliers();
    const index = suppliers.findIndex(s => s.id === supplier.id);
    if (index >= 0) {
      suppliers[index] = supplier;
    } else {
      suppliers.unshift(supplier);
    }
    StorageService.saveSuppliers(suppliers);
    if (triggerSync && activeStorageSyncHandler?.onSupplierUpsert) {
      activeStorageSyncHandler.onSupplierUpsert(supplier);
    }
  },
  bulkSaveSuppliers: (remoteSuppliers: Supplier[], triggerSync = false) => {
    if (!remoteSuppliers || remoteSuppliers.length === 0) return;
    const currentSuppliers = StorageService.getSuppliers();
    const map = new Map<string, Supplier>();
    currentSuppliers.forEach(s => map.set(s.id, s));
    remoteSuppliers.forEach(s => map.set(s.id, s));
    const merged = Array.from(map.values());
    setItem(STORAGE_KEYS.SUPPLIERS, merged);
  },

  // Cash Drawer
  getCashDrawer: (): CashDrawerRecord => getItem(STORAGE_KEYS.CASH_DRAWER, initialCashDrawer),
  saveCashDrawer: (drawer: CashDrawerRecord) => setItem(STORAGE_KEYS.CASH_DRAWER, drawer),
  recordCashTransaction: (type: string, amount: number, description: string) => {
    const drawer = StorageService.getCashDrawer();
    const now = new Date().toISOString();
    const isIn = type === 'in' || type === 'sale_cash';

    if (isIn) {
      if (type === 'sale_cash') drawer.cashSales = (drawer.cashSales || 0) + amount;
      drawer.cashInManual.push({ reason: description, amount, time: now });
      drawer.expectedInDrawer = Number(((drawer.expectedInDrawer || 0) + amount).toFixed(2));
      drawer.totalCashIn = (drawer.totalCashIn || 0) + amount;
    } else {
      drawer.cashOutManual.push({ reason: description, amount, time: now });
      drawer.expectedInDrawer = Number(((drawer.expectedInDrawer || 0) - amount).toFixed(2));
      drawer.totalCashOut = (drawer.totalCashOut || 0) + amount;
    }

    if (!drawer.transactions) drawer.transactions = [];
    drawer.transactions.unshift({
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: now,
      type: isIn ? 'in' : 'out',
      description,
      amount,
    });

    StorageService.saveCashDrawer(drawer);
  },
  closeCashDrawerShift: (actualCounted: number, notes: string) => {
    const drawer = StorageService.getCashDrawer();
    drawer.status = 'closed';
    drawer.closedAt = new Date().toISOString();
    drawer.actualCounted = actualCounted;
    drawer.variance = Number((actualCounted - drawer.expectedInDrawer).toFixed(2));
    drawer.closingNotes = notes;
    StorageService.saveCashDrawer(drawer);
  },

  // Pre-Orders & Booking
  getPreOrders: (): PreOrder[] => getItem<PreOrder[]>(STORAGE_KEYS.PRE_ORDERS, initialPreOrders),
  getPendingPreOrders: (): PreOrder[] => {
    const orders = StorageService.getPreOrders();
    return orders.filter(o => o.status === 'Pending');
  },
  savePreOrders: (orders: PreOrder[]) => setItem(STORAGE_KEYS.PRE_ORDERS, orders),
  savePreOrder: (order: PreOrder) => {
    const orders = StorageService.getPreOrders();
    const index = orders.findIndex(o => o.id === order.id);
    
    // Auto-sync customer to Customers & Suppliers database session
    if (order.customerName && order.customerPhone) {
      const customers = StorageService.getCustomers();
      const cleanPhone = order.customerPhone.replace(/\D/g, '');
      const trimmedName = order.customerName.trim().toLowerCase();
      
      const existingIdx = customers.findIndex(c => 
        (order.customerId && c.id === order.customerId) ||
        (cleanPhone && c.phone.replace(/\D/g, '') === cleanPhone) ||
        c.name.trim().toLowerCase() === trimmedName
      );

      if (existingIdx >= 0) {
        // Update existing customer record if missing address or to link pre-order
        const existing = customers[existingIdx];
        order.customerId = existing.id;
        
        let shouldUpdateCustomer = false;
        if (!existing.address && order.customerAddress) {
          existing.address = order.customerAddress.trim();
          shouldUpdateCustomer = true;
        }
        
        // Add note reference if not already present
        const noteTag = `Pre-Order #${order.preOrderNumber}`;
        if (!existing.notes || !existing.notes.includes(noteTag)) {
          existing.notes = existing.notes 
            ? `${existing.notes} | ${noteTag} (${order.phoneModel})`
            : `${noteTag} (${order.phoneModel})`;
          shouldUpdateCustomer = true;
        }

        if (shouldUpdateCustomer) {
          customers[existingIdx] = existing;
          StorageService.saveCustomers(customers);
        }
      } else {
        // Create new customer record in Customers & Suppliers directory
        const newCustomerId = order.customerId || `cust-${Date.now()}`;
        order.customerId = newCustomerId;

        const newCustomer: Customer = {
          id: newCustomerId,
          name: order.customerName.trim(),
          phone: order.customerPhone.trim(),
          address: order.customerAddress?.trim() || undefined,
          loyaltyPoints: 10, // Initial welcome bonus
          totalSpent: 0,
          totalVisits: 1,
          createdAt: new Date().toISOString().split('T')[0],
          notes: `Registered via Pre-Order #${order.preOrderNumber} (${order.phoneModel})`,
        };

        customers.unshift(newCustomer);
        StorageService.saveCustomers(customers);
      }
    }

    if (index >= 0) {
      orders[index] = order;
    } else {
      orders.unshift(order);
    }
    StorageService.savePreOrders(orders);

    // If deposit was paid in Cash, log cash deposit into Cash Drawer
    if (order.depositPaymentMethod === 'cash' && order.depositAmount > 0 && index === -1) {
      StorageService.recordCashTransaction(
        'in', 
        order.depositAmount, 
        `Pre-Order Deposit #${order.preOrderNumber} - ${order.customerName} (${order.phoneModel})`
      );
    }
  },
  updatePreOrderStatus: (
    id: string, 
    status: PreOrderStatus, 
    fulfillmentData?: { 
      fulfilledSaleId?: string; 
      fulfilledInvoiceNumber?: string; 
      fulfilledBy?: string;
      notes?: string;
    }
  ) => {
    const orders = StorageService.getPreOrders();
    const index = orders.findIndex(o => o.id === id);
    if (index >= 0) {
      orders[index] = {
        ...orders[index],
        status,
        ...(status === 'Completed' ? {
          fulfilledDate: new Date().toISOString(),
          fulfilledSaleId: fulfillmentData?.fulfilledSaleId,
          fulfilledInvoiceNumber: fulfillmentData?.fulfilledInvoiceNumber,
          fulfilledBy: fulfillmentData?.fulfilledBy || 'Cashier',
        } : {}),
        ...(fulfillmentData?.notes ? { notes: fulfillmentData.notes } : {})
      };
      StorageService.savePreOrders(orders);
    }
  },
  allocatePreOrderToInventoryItem: (
    preOrderId: string,
    allocationData: {
      productId?: string;
      productName?: string;
      allocatedImei?: string;
      allocatedImei2?: string;
      allocatedBarcode?: string;
      allocatedSku?: string;
      allocatedCostPrice?: number;
      allocatedPurchaseOrderId?: string;
      allocatedPurchaseOrderNumber?: string;
      allocatedBy?: string;
    }
  ) => {
    const orders = StorageService.getPreOrders();
    const index = orders.findIndex(o => o.id === preOrderId);
    if (index >= 0) {
      orders[index] = {
        ...orders[index],
        status: 'Stock Arrived',
        productId: allocationData.productId,
        productName: allocationData.productName,
        allocatedImei: allocationData.allocatedImei,
        allocatedImei2: allocationData.allocatedImei2,
        allocatedBarcode: allocationData.allocatedBarcode,
        allocatedSku: allocationData.allocatedSku,
        allocatedCostPrice: allocationData.allocatedCostPrice,
        allocatedPurchaseOrderId: allocationData.allocatedPurchaseOrderId,
        allocatedPurchaseOrderNumber: allocationData.allocatedPurchaseOrderNumber,
        allocatedAt: new Date().toISOString(),
        allocatedBy: allocationData.allocatedBy || 'Inventory Staff',
      };
      StorageService.savePreOrders(orders);
    }
  },
  unallocatePreOrder: (preOrderId: string) => {
    const orders = StorageService.getPreOrders();
    const index = orders.findIndex(o => o.id === preOrderId);
    if (index >= 0) {
      orders[index] = {
        ...orders[index],
        status: 'Pending',
        productId: undefined,
        productName: undefined,
        allocatedImei: undefined,
        allocatedImei2: undefined,
        allocatedBarcode: undefined,
        allocatedSku: undefined,
        allocatedCostPrice: undefined,
        allocatedPurchaseOrderId: undefined,
        allocatedPurchaseOrderNumber: undefined,
        allocatedAt: undefined,
        allocatedBy: undefined,
      };
      StorageService.savePreOrders(orders);
    }
  },
  deletePreOrder: (id: string) => {
    const orders = StorageService.getPreOrders().filter(o => o.id !== id);
    StorageService.savePreOrders(orders);
  },

  // ==========================================
  // Notice Board Announcements
  // ==========================================
  getAnnouncements: (): Announcement[] => {
    return getItem(STORAGE_KEYS.ANNOUNCEMENTS, initialAnnouncements);
  },
  saveAnnouncements: (announcements: Announcement[]) => {
    setItem(STORAGE_KEYS.ANNOUNCEMENTS, announcements);
  },
  addAnnouncement: (announcement: Announcement) => {
    const list = StorageService.getAnnouncements();
    const updated = [announcement, ...list];
    StorageService.saveAnnouncements(updated);
  },
  updateAnnouncement: (announcement: Announcement) => {
    const list = StorageService.getAnnouncements();
    const updated = list.map(a => a.id === announcement.id ? announcement : a);
    StorageService.saveAnnouncements(updated);
  },
  deleteAnnouncement: (id: string) => {
    const list = StorageService.getAnnouncements().filter(a => a.id !== id);
    StorageService.saveAnnouncements(list);
  },
  togglePinAnnouncement: (id: string, staffName: string) => {
    const list = StorageService.getAnnouncements();
    const updated = list.map(a => {
      if (a.id === id) {
        const nextPin = !a.isPinned;
        return {
          ...a,
          isPinned: nextPin,
          pinnedAt: nextPin ? new Date().toISOString() : undefined,
          pinnedBy: nextPin ? staffName : undefined,
          updatedAt: new Date().toISOString()
        };
      }
      return a;
    });
    StorageService.saveAnnouncements(updated);
  },
  acknowledgeAnnouncement: (id: string, staff: { id: string; name: string; role: StaffRole }) => {
    const list = StorageService.getAnnouncements();
    const updated = list.map(a => {
      if (a.id === id) {
        const acks = a.acknowledgedBy || [];
        const alreadyAcked = acks.some(ack => ack.staffId === staff.id);
        if (alreadyAcked) return a;
        return {
          ...a,
          acknowledgedBy: [
            ...acks,
            {
              staffId: staff.id,
              staffName: staff.name,
              staffRole: staff.role,
              acknowledgedAt: new Date().toISOString()
            }
          ]
        };
      }
      return a;
    });
    StorageService.saveAnnouncements(updated);
  },
  reactToAnnouncement: (id: string, emoji: string, staffId: string) => {
    const list = StorageService.getAnnouncements();
    const updated = list.map(a => {
      if (a.id === id) {
        const reactions = a.reactions ? [...a.reactions] : [];
        const existingIdx = reactions.findIndex(r => r.emoji === emoji);
        if (existingIdx >= 0) {
          const current = reactions[existingIdx];
          const hasReacted = current.staffIds.includes(staffId);
          if (hasReacted) {
            current.staffIds = current.staffIds.filter(s => s !== staffId);
          } else {
            current.staffIds.push(staffId);
          }
          if (current.staffIds.length === 0) {
            reactions.splice(existingIdx, 1);
          }
        } else {
          reactions.push({ emoji, staffIds: [staffId] });
        }
        return { ...a, reactions };
      }
      return a;
    });
    StorageService.saveAnnouncements(updated);
  },

  // ==========================================
  // Team Chat Channels & Messages
  // ==========================================
  getChatChannels: (): ChatChannel[] => {
    return getItem(STORAGE_KEYS.CHAT_CHANNELS, initialChatChannels);
  },
  saveChatChannels: (channels: ChatChannel[]) => {
    setItem(STORAGE_KEYS.CHAT_CHANNELS, channels);
  },
  addChatChannel: (channel: ChatChannel) => {
    const list = StorageService.getChatChannels();
    if (!list.some(c => c.id === channel.id)) {
      const updated = [...list, channel];
      StorageService.saveChatChannels(updated);
    }
  },
  getChatMessages: (channelId?: string): ChatMessage[] => {
    const all = getItem<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, initialChatMessages);
    if (!channelId) return all;
    return all.filter(m => m.channelId === channelId);
  },
  saveChatMessages: (messages: ChatMessage[]) => {
    setItem(STORAGE_KEYS.CHAT_MESSAGES, messages);
  },
  addChatMessage: (msg: ChatMessage) => {
    const all = getItem<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, initialChatMessages);
    const updated = [...all, msg];
    // Keep max 1500 messages to prevent unbounded localStorage growth
    if (updated.length > 1500) {
      updated.splice(0, updated.length - 1500);
    }
    StorageService.saveChatMessages(updated);

    // Update channel lastMessage preview
    const channels = StorageService.getChatChannels();
    const updatedChannels = channels.map(c => {
      if (c.id === msg.channelId) {
        return {
          ...c,
          lastMessage: {
            content: msg.content,
            senderName: msg.senderName,
            timestamp: msg.timestamp
          }
        };
      }
      return c;
    });
    StorageService.saveChatChannels(updatedChannels);
  },
  deleteChatMessage: (id: string) => {
    const all = getItem<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, initialChatMessages);
    const updated = all.filter(m => m.id !== id);
    StorageService.saveChatMessages(updated);
  },
  reactToChatMessage: (id: string, emoji: string, staffId: string) => {
    const all = getItem<ChatMessage[]>(STORAGE_KEYS.CHAT_MESSAGES, initialChatMessages);
    const updated = all.map(m => {
      if (m.id === id) {
        const reactions = { ...(m.reactions || {}) };
        const staffList = reactions[emoji] ? [...reactions[emoji]] : [];
        if (staffList.includes(staffId)) {
          reactions[emoji] = staffList.filter(s => s !== staffId);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        } else {
          reactions[emoji] = [...staffList, staffId];
        }
        return { ...m, reactions };
      }
      return m;
    });
    StorageService.saveChatMessages(updated);
  },

  // ==========================================
  // Credit Sales & Accounts Receivable
  // ==========================================
  getCreditSales: (): CreditSaleRecord[] => getItem<CreditSaleRecord[]>(STORAGE_KEYS.CREDIT_SALES, initialCreditSales),
  saveCreditSales: (creditSales: CreditSaleRecord[]) => setItem(STORAGE_KEYS.CREDIT_SALES, creditSales),
  saveCreditSale: (creditSale: CreditSaleRecord) => {
    const list = StorageService.getCreditSales();
    const index = list.findIndex(c => c.id === creditSale.id);
    if (index >= 0) {
      list[index] = creditSale;
    } else {
      list.unshift(creditSale);
    }
    StorageService.saveCreditSales(list);

    // If downpayment was paid in cash, record in cash drawer
    if (creditSale.downPayment && creditSale.downPayment > 0 && creditSale.downPaymentMethod === 'cash') {
      StorageService.recordCashTransaction(
        'sale_cash',
        creditSale.downPayment,
        `Credit Down Payment #${creditSale.creditNumber} (${creditSale.customerName})`
      );
    }

    // Auto-update customer outstanding balance & profile
    if (creditSale.customerId) {
      StorageService.recalculateCustomerCreditBalance(creditSale.customerId);
    }

    // Record audit log
    StorageService.addAuditLog({
      actionType: index >= 0 ? 'CREDIT_SALE_UPDATED' : 'CREDIT_SALE_CREATED',
      category: 'sales',
      severity: 'info',
      summary: `${index >= 0 ? 'Updated' : 'Approved new'} credit installment plan #${creditSale.creditNumber} for ${creditSale.customerName} (${(creditSale.totalSaleAmount || creditSale.totalPayable || 0).toLocaleString()} Ks)`,
      details: {
        targetId: creditSale.id,
        invoiceNumber: creditSale.invoiceNumber,
        customerName: creditSale.customerName,
        amount: creditSale.totalSaleAmount || creditSale.totalPayable,
        notes: `Down payment: ${creditSale.downPayment || 0} Ks | Term: ${creditSale.installmentCount || 1} installments`
      },
      staffId: creditSale.createdById || 'staff-admin',
      staffName: creditSale.approvedBy || creditSale.createdBy || 'Store Manager',
      staffRole: 'Manager'
    });
  },
  recordCreditRepayment: (repayment: CreditRepaymentRecord) => {
    const list = StorageService.getCreditSales();
    const index = list.findIndex(c => c.id === repayment.creditSaleId);
    if (index === -1) return;

    const creditSale = { ...list[index] };
    const prevBalance = creditSale.remainingBalance;
    const newRemaining = Math.max(0, prevBalance - repayment.amount);
    const newTotalPaid = (creditSale.totalPaid || 0) + repayment.amount;

    repayment.previousBalance = prevBalance;
    repayment.newBalance = newRemaining;

    // Add repayment record
    const updatedRepayments = [repayment, ...(creditSale.repayments || [])];
    creditSale.repayments = updatedRepayments;
    creditSale.remainingBalance = newRemaining;
    creditSale.totalPaid = newTotalPaid;

    // Update installments if applicable
    if (creditSale.installments && creditSale.installments.length > 0) {
      let remainingPaymentToAllocate = repayment.amount;
      creditSale.installments = creditSale.installments.map(inst => {
        if (remainingPaymentToAllocate <= 0) return inst;
        const unpaidOnInst = Math.max(0, inst.amountDue - (inst.amountPaid || 0));
        if (unpaidOnInst <= 0) return inst;

        const payForThis = Math.min(unpaidOnInst, remainingPaymentToAllocate);
        remainingPaymentToAllocate -= payForThis;
        const updatedPaid = (inst.amountPaid || 0) + payForThis;
        const isSettled = updatedPaid >= inst.amountDue;

        return {
          ...inst,
          amountPaid: updatedPaid,
          status: isSettled ? 'paid' : (inst.status === 'overdue' ? 'overdue' : 'partially_paid'),
          paidDate: isSettled ? new Date().toISOString() : inst.paidDate,
          paidAmount: updatedPaid,
        };
      });
    }

    // Determine new status
    if (newRemaining <= 0) {
      creditSale.status = 'paid';
      creditSale.settledAt = new Date().toISOString();
    } else {
      creditSale.status = 'partially_paid';
    }

    list[index] = creditSale;
    StorageService.saveCreditSales(list);

    // If collected in cash, record in cash drawer
    if (repayment.paymentMethod === 'cash') {
      repayment.recordedInCashDrawer = true;
      StorageService.recordCashTransaction(
        'sale_cash',
        repayment.amount,
        `Credit Debt Collection #${repayment.receiptVoucherNumber} (${creditSale.customerName})`
      );
    }

    // Update customer outstanding balance
    if (creditSale.customerId) {
      StorageService.recalculateCustomerCreditBalance(creditSale.customerId);
    }

    // Record audit log
    StorageService.addAuditLog({
      actionType: 'CREDIT_REPAYMENT_COLLECTED',
      category: 'sales',
      severity: 'success',
      summary: `Collected credit installment repayment ${repayment.receiptVoucherNumber}: ${repayment.amount.toLocaleString()} Ks from ${repayment.customerName}`,
      details: {
        targetId: repayment.creditSaleId,
        invoiceNumber: repayment.invoiceNumber,
        customerName: repayment.customerName,
        amount: repayment.amount,
        paymentMethod: repayment.paymentMethod,
        previousValue: prevBalance,
        newValue: newRemaining,
        notes: repayment.notes
      },
      staffId: repayment.collectedById || 'staff-cashier',
      staffName: repayment.collectedBy || 'Cashier Staff',
      staffRole: 'Cashier'
    });
  },
  updateCreditSaleStatus: (id: string, status: CreditSaleStatus, notes?: string) => {
    const list = StorageService.getCreditSales();
    const index = list.findIndex(c => c.id === id);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        status,
        ...(notes ? { notes: `${list[index].notes ? list[index].notes + ' | ' : ''}${notes}` } : {})
      };
      StorageService.saveCreditSales(list);
      if (list[index].customerId) {
        StorageService.recalculateCustomerCreditBalance(list[index].customerId);
      }

      StorageService.addAuditLog({
        actionType: 'CREDIT_STATUS_CHANGED',
        category: 'sales',
        severity: status === 'bad_debt' ? 'danger' : 'warning',
        summary: `Credit sale #${list[index].creditNumber} status updated to ${status.toUpperCase()}`,
        details: {
          targetId: id,
          invoiceNumber: list[index].invoiceNumber,
          customerName: list[index].customerName,
          notes
        },
        staffId: 'staff-admin',
        staffName: 'Store Manager',
        staffRole: 'Manager'
      });
    }
  },
  recalculateCustomerCreditBalance: (customerId: string) => {
    const customers = StorageService.getCustomers();
    const custIdx = customers.findIndex(c => c.id === customerId);
    if (custIdx === -1) return;

    const creditSales = StorageService.getCreditSales();
    const customerCredits = creditSales.filter(c => c.customerId === customerId && c.status !== 'cancelled' && c.status !== 'bad_debt');
    const totalOutstanding = customerCredits.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
    const hasOverdue = customerCredits.some(c => c.status === 'overdue' || (c.remainingBalance > 0 && new Date(c.dueDate) < new Date()));

    const customer = customers[custIdx];
    customer.outstandingCreditBalance = totalOutstanding;
    if (hasOverdue) {
      customer.creditStatus = 'warning';
    } else if (customer.creditLimit && totalOutstanding >= customer.creditLimit) {
      customer.creditStatus = 'warning';
    } else if (customer.creditStatus !== 'blocked') {
      customer.creditStatus = 'allowed';
    }

    customers[custIdx] = customer;
    StorageService.saveCustomers(customers);
  },

  // ==========================================
  // Firebase Sync Configuration
  // ==========================================
  getFirebaseSyncConfig: (): FirebaseSyncConfig => {
    return getItem(STORAGE_KEYS.FIREBASE_SYNC_CONFIG, {
      isEnabled: true,
      autoSyncIntervalSeconds: 3,
      projectId: 'mobileshop-pos-live',
      firestoreDatabaseId: '(default)',
      lastSyncedAt: new Date().toISOString()
    });
  },
  saveFirebaseSyncConfig: (config: FirebaseSyncConfig) => {
    setItem(STORAGE_KEYS.FIREBASE_SYNC_CONFIG, config);
  },

  // Reset & Backup
  isFreshDatabase: (): boolean => isFreshDatabase(),

  clearAllTestData: (): void => {
    if (typeof localStorage === 'undefined') return;

    localStorage.setItem(STORAGE_KEYS.IS_FRESH_DATABASE, 'true');
    localStorage.setItem('mobileshop_cookware_migrated_v1', 'true');
    localStorage.setItem('mobileshop_cookware_sample_seeding_done', 'true');

    // Wipe transactional & inventory demo data
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CREDIT_SALES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.STOCK_ADJUSTMENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PRICE_CHANGES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.STOCK_AUDITS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.DAMAGE_LOGS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PRE_ORDERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_WALLETS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_TRANSACTIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_BUDGETS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_GOALS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_DEBTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.FACEBOOK_POSTS, JSON.stringify([]));

    // Reset cash drawer to clean closed state
    const cleanDrawer: CashDrawerRecord = {
      id: `shift_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      openedBy: 'Administrator',
      closedBy: 'Administrator',
      status: 'closed',
      openingFloat: 0,
      openingBalance: 0,
      cashSales: 0,
      cashInManual: [],
      cashOutManual: [],
      expectedInDrawer: 0,
      actualCounted: 0,
      variance: 0,
      closingNotes: 'Fresh database initialized with zero balance.',
    };
    localStorage.setItem(STORAGE_KEYS.CASH_DRAWER, JSON.stringify(cleanDrawer));

    // Persist isFreshDatabase: true directly into the settings document as well
    const currentSettings = StorageService.getSettings();
    const freshSettings: ShopSettings = {
      ...currentSettings,
      isFreshDatabase: true,
    };
    StorageService.saveSettings(freshSettings, true);

    // Log initialization event in clean audit log
    const currentStaffId = freshSettings.currentStaffId || 'user-1';
    const staffUser = StorageService.getStaffUsers().find(s => s.id === currentStaffId);
    const auditEntry: AuditLogEntry = {
      id: `audit_fresh_${Date.now()}`,
      timestamp: new Date().toISOString(),
      staffId: currentStaffId,
      staffName: staffUser?.name || 'Administrator',
      staffRole: (staffUser?.role as StaffRole) || 'Owner',
      actionType: 'DATA_RESET',
      category: 'settings',
      severity: 'info',
      summary: 'Store database initialized with fresh clean state. All initial test data was removed.',
      details: {
        notes: 'Store test data wiped and fresh database initialized.',
      },
    };
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([auditEntry]));

    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, String(now));

    // Broadcast across windows/tabs
    window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'ALL_RESET', timestamp: now } }));
    if (tabBroadcastChannel) {
      tabBroadcastChannel.postMessage({ type: 'DATA_UPDATED', key: 'ALL_RESET', timestamp: now });
    }
  },

  resetToInitialData: () => {
    StorageService.resetAllToDemoData();
  },
  resetAllToDemoData: () => {
    localStorage.removeItem(STORAGE_KEYS.IS_FRESH_DATABASE);
    const cleanInitialSettings = { ...initialSettings, isFreshDatabase: false };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(cleanInitialSettings));
    localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(initialStaffUsers));
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(initialProducts));
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(initialSales));
    localStorage.setItem(STORAGE_KEYS.CREDIT_SALES, JSON.stringify(initialCreditSales));
    localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(initialPurchases));
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(initialExpenses));
    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(initialExpenseCategories));
    localStorage.setItem(STORAGE_KEYS.STOCK_ADJUSTMENTS, JSON.stringify(initialStockAdjustments));
    localStorage.setItem(STORAGE_KEYS.PRICE_CHANGES, JSON.stringify(initialPriceChanges));
    localStorage.setItem(STORAGE_KEYS.STOCK_AUDITS, JSON.stringify(initialStockAudits));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(initialCustomers));
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(initialSuppliers));
    localStorage.setItem(STORAGE_KEYS.CASH_DRAWER, JSON.stringify(initialCashDrawer));
    localStorage.setItem(STORAGE_KEYS.PRE_ORDERS, JSON.stringify(initialPreOrders));
    localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(initialAnnouncements));
    localStorage.setItem(STORAGE_KEYS.CHAT_CHANNELS, JSON.stringify(initialChatChannels));
    localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(initialChatMessages));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_WALLETS, JSON.stringify(initialPersonalWallets));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_TRANSACTIONS, JSON.stringify(initialPersonalTransactions));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_BUDGETS, JSON.stringify(initialPersonalBudgets));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_GOALS, JSON.stringify(initialPersonalSavingsGoals));
    localStorage.setItem(STORAGE_KEYS.PERSONAL_DEBTS, JSON.stringify(initialPersonalDebts));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(initialAuditLogs));
    window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'ALL_RESET' } }));
  },

  exportAllData: (): string => {
    const backup = {
      settings: StorageService.getSettings(),
      staffUsers: StorageService.getStaffUsers(),
      products: StorageService.getProducts(),
      sales: StorageService.getSales(),
      creditSales: StorageService.getCreditSales(),
      purchases: StorageService.getPurchases(),
      expenses: StorageService.getExpenses(),
      expenseCategories: StorageService.getExpenseCategories(),
      stockAdjustments: StorageService.getStockAdjustments(),
      priceChanges: StorageService.getPriceChanges(),
      stockAudits: StorageService.getStockAudits(),
      customers: StorageService.getCustomers(),
      suppliers: StorageService.getSuppliers(),
      cashDrawer: StorageService.getCashDrawer(),
      preOrders: StorageService.getPreOrders(),
      announcements: StorageService.getAnnouncements(),
      chatChannels: StorageService.getChatChannels(),
      chatMessages: StorageService.getChatMessages(),
      personalWallets: StorageService.getPersonalWallets(),
      personalTransactions: StorageService.getPersonalTransactions(),
      personalBudgets: StorageService.getPersonalBudgets(),
      personalGoals: StorageService.getPersonalSavingsGoals(),
      personalDebts: StorageService.getPersonalDebts(),
      auditLogs: StorageService.getAuditLogs(),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(backup, null, 2);
  },

  importBackup: (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.products) {
        if (parsed.settings) StorageService.saveSettings(parsed.settings);
        if (parsed.staffUsers) StorageService.saveStaffUsers(parsed.staffUsers);
        if (parsed.products) StorageService.saveProducts(parsed.products);
        if (parsed.sales) StorageService.saveSales(parsed.sales);
        if (parsed.creditSales) StorageService.saveCreditSales(parsed.creditSales);
        if (parsed.purchases) StorageService.savePurchases(parsed.purchases);
        if (parsed.expenses) StorageService.saveExpenses(parsed.expenses);
        if (parsed.expenseCategories) StorageService.saveExpenseCategories(parsed.expenseCategories);
        if (parsed.stockAdjustments) StorageService.saveStockAdjustments(parsed.stockAdjustments);
        if (parsed.priceChanges) StorageService.savePriceChanges(parsed.priceChanges);
        if (parsed.stockAudits) StorageService.saveStockAudits(parsed.stockAudits);
        if (parsed.customers) StorageService.saveCustomers(parsed.customers);
        if (parsed.suppliers) StorageService.saveSuppliers(parsed.suppliers);
        if (parsed.cashDrawer) StorageService.saveCashDrawer(parsed.cashDrawer);
        if (parsed.preOrders) StorageService.savePreOrders(parsed.preOrders);
        if (parsed.announcements) StorageService.saveAnnouncements(parsed.announcements);
        if (parsed.chatChannels) StorageService.saveChatChannels(parsed.chatChannels);
        if (parsed.chatMessages) StorageService.saveChatMessages(parsed.chatMessages);
        if (parsed.auditLogs) StorageService.saveAuditLogs(parsed.auditLogs);
        window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'ALL_IMPORTED' } }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  importData: (jsonString: string): boolean => {
    return StorageService.importBackup(jsonString);
  },

  // State synchronization helpers
  getLastUpdatedTimestamp: (): number => {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.LAST_UPDATED);
      return val ? Number(val) : 0;
    } catch {
      return 0;
    }
  },

  getAllData: (): Record<string, any> => {
    return {
      settings: StorageService.getSettings(),
      staffUsers: StorageService.getStaffUsers(),
      rolePermissions: StorageService.getRolePermissions(),
      products: StorageService.getProducts(),
      sales: StorageService.getSales(),
      creditSales: StorageService.getCreditSales(),
      purchases: StorageService.getPurchases(),
      expenses: StorageService.getExpenses(),
      expenseCategories: StorageService.getExpenseCategories(),
      stockAdjustments: StorageService.getStockAdjustments(),
      priceChanges: StorageService.getPriceChanges(),
      stockAudits: StorageService.getStockAudits(),
      customers: StorageService.getCustomers(),
      suppliers: StorageService.getSuppliers(),
      cashDrawer: StorageService.getCashDrawer(),
      preOrders: StorageService.getPreOrders(),
      announcements: StorageService.getAnnouncements(),
      chatChannels: StorageService.getChatChannels(),
      chatMessages: StorageService.getChatMessages(),
      damageLogs: StorageService.getDamageLogs(),
      auditLogs: StorageService.getAuditLogs(),
      lastUpdated: StorageService.getLastUpdatedTimestamp() || Date.now(),
    };
  },

  applyAllData: (data: Record<string, any>, remoteTimestamp?: number): void => {
    if (!data || typeof data !== 'object') return;
    try {
      const isFresh = isFreshDatabase();

      if (data.settings) {
        // If local is currently fresh but incoming settings does not have it, preserve fresh flag
        const settingsToSave = isFresh ? { ...data.settings, isFreshDatabase: true } : data.settings;
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settingsToSave));
      }
      if (data.staffUsers) localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(data.staffUsers));
      if (data.rolePermissions) localStorage.setItem(STORAGE_KEYS.ROLE_PERMISSIONS, JSON.stringify(data.rolePermissions));

      // If user initialized fresh database and remote data has mock/demo data, do not overwrite empty collections
      if (data.products) {
        if (!isFresh || (Array.isArray(data.products) && data.products.length > 0 && !data.products[0]?.id?.startsWith('prod-'))) {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data.products));
        }
      }
      if (data.sales) {
        if (!isFresh || (Array.isArray(data.sales) && data.sales.length > 0 && !data.sales[0]?.id?.startsWith('sale-'))) {
          localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(data.sales));
        }
      }
      if (data.creditSales) localStorage.setItem(STORAGE_KEYS.CREDIT_SALES, JSON.stringify(data.creditSales));
      if (data.purchases) {
        if (!isFresh || (Array.isArray(data.purchases) && data.purchases.length > 0 && !data.purchases[0]?.id?.startsWith('purch-'))) {
          localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(data.purchases));
        }
      }
      if (data.expenses) {
        if (!isFresh || (Array.isArray(data.expenses) && data.expenses.length > 0 && !data.expenses[0]?.id?.startsWith('exp-'))) {
          localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(data.expenses));
        }
      }
      if (data.expenseCategories) localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(data.expenseCategories));
      if (data.stockAdjustments) localStorage.setItem(STORAGE_KEYS.STOCK_ADJUSTMENTS, JSON.stringify(data.stockAdjustments));
      if (data.priceChanges) localStorage.setItem(STORAGE_KEYS.PRICE_CHANGES, JSON.stringify(data.priceChanges));
      if (data.stockAudits) localStorage.setItem(STORAGE_KEYS.STOCK_AUDITS, JSON.stringify(data.stockAudits));
      if (data.customers) {
        if (!isFresh || (Array.isArray(data.customers) && data.customers.length > 0 && !data.customers[0]?.id?.startsWith('cust-'))) {
          localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
        }
      }
      if (data.suppliers) localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(data.suppliers));
      if (data.cashDrawer) localStorage.setItem(STORAGE_KEYS.CASH_DRAWER, JSON.stringify(data.cashDrawer));
      if (data.preOrders) localStorage.setItem(STORAGE_KEYS.PRE_ORDERS, JSON.stringify(data.preOrders));
      if (data.announcements) localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(data.announcements));
      if (data.chatChannels) localStorage.setItem(STORAGE_KEYS.CHAT_CHANNELS, JSON.stringify(data.chatChannels));
      if (data.chatMessages) localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(data.chatMessages));
      if (data.damageLogs) localStorage.setItem(STORAGE_KEYS.DAMAGE_LOGS, JSON.stringify(data.damageLogs));
      if (data.auditLogs) localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(data.auditLogs));
      
      const ts = remoteTimestamp || data.lastUpdated || Date.now();
      localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, String(ts));

      window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'SERVER_SYNC_APPLIED', timestamp: ts } }));
    } catch (err) {
      console.error('Error applying synced data to storage:', err);
    }
  },

  getSystemHealthReport: (): SystemHealthReport => {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mobileshop_')) {
          const val = localStorage.getItem(key) || '';
          totalBytes += (key.length + val.length) * 2;
        }
      }
    } catch {
      // fallback
    }

    const products = StorageService.getProducts();
    const phoneVariants = products.filter(p => isPhoneCategory(p.category));
    const totalStockUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const serializedImeisCount = products.reduce((acc, p) => acc + (p.imeiPairs?.length || p.imeiList?.length || 0), 0);
    const purchases = StorageService.getPurchases();
    const sales = StorageService.getSales();
    const creditSales = StorageService.getCreditSales();
    const expenses = StorageService.getExpenses();
    const customers = StorageService.getCustomers();
    const suppliers = StorageService.getSuppliers();
    const priceChanges = StorageService.getPriceChanges();
    const stockAdjustments = StorageService.getStockAdjustments();
    const chatMessages = StorageService.getChatMessages();

    // Check integrity: duplicates
    const seenVariants = new Set<string>();
    let duplicateVariantsFound = 0;
    products.forEach(p => {
      const key = `${canonicalCategory(p.category)}|${normalizeVariantText(p.brand)}|${normalizeVariantText(p.name)}|${normalizeVariantText(p.rom || p.storage)}|${normalizeVariantText(p.color)}|${normalizeVariantText(p.condition)}`.toLowerCase();
      if (seenVariants.has(key)) {
        duplicateVariantsFound++;
      } else {
        seenVariants.add(key);
      }
    });

    const seenImeis = new Set<string>();
    let duplicateImeisFound = 0;
    products.forEach(p => {
      if (p.imeiPairs && p.imeiPairs.length > 0) {
        p.imeiPairs.forEach(pr => {
          if (pr.imei1) {
            if (seenImeis.has(pr.imei1)) duplicateImeisFound++;
            else seenImeis.add(pr.imei1);
          }
          if (pr.imei2) {
            if (seenImeis.has(pr.imei2)) duplicateImeisFound++;
            else seenImeis.add(pr.imei2);
          }
        });
      } else if (p.imeiList && p.imeiList.length > 0) {
        p.imeiList.forEach(im => {
          if (seenImeis.has(im)) duplicateImeisFound++;
          else seenImeis.add(im);
        });
      }
    });

    let excessLogsCount = 0;
    if (priceChanges.length > 500) excessLogsCount += (priceChanges.length - 500);
    if (stockAdjustments.length > 500) excessLogsCount += (stockAdjustments.length - 500);
    if (chatMessages.length > 500) excessLogsCount += (chatMessages.length - 500);

    let orphanedDraftsCount = 0;
    purchases.forEach(po => {
      po.items.forEach(item => {
        if (item.productId && item.productId.startsWith('prod-draft-')) {
          orphanedDraftsCount++;
        }
      });
    });

    const storageSizeKb = Math.round((totalBytes / 1024) * 10) / 10;
    const storageLimitKb = 5120; // 5MB standard quota
    const usagePercentage = Math.round((storageSizeKb / storageLimitKb) * 1000) / 10;

    return {
      storageSizeKb,
      storageLimitKb,
      usagePercentage,
      collections: {
        productsCount: products.length,
        phoneVariantsCount: phoneVariants.length,
        totalStockUnits,
        serializedImeisCount,
        purchasesCount: purchases.length,
        salesCount: sales.length,
        creditSalesCount: creditSales.length,
        expensesCount: expenses.length,
        customersCount: customers.length,
        suppliersCount: suppliers.length,
        priceChangeLogsCount: priceChanges.length,
        stockAdjustmentLogsCount: stockAdjustments.length,
        chatMessagesCount: chatMessages.length,
      },
      integrity: {
        duplicateVariantsFound,
        duplicateImeisFound,
        excessLogsCount,
        orphanedDraftsCount,
      },
      status: (duplicateVariantsFound > 0 || duplicateImeisFound > 0 || usagePercentage > 75) ? 'attention_needed' : 'optimal'
    };
  },

  performDataOptimization: (): CleanupResult => {
    let initialBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mobileshop_')) {
          initialBytes += (key.length + (localStorage.getItem(key)?.length || 0)) * 2;
        }
      }
    } catch {
      // fallback
    }

    let variantsMerged = 0;
    let imeisDeduplicated = 0;
    let logsPruned = 0;
    let draftIdsCleaned = 0;

    // 1. Optimize products and IMEIs
    const products = StorageService.getProducts();
    const globalImeis = new Set<string>();
    const cleanedProducts = products.map(prod => {
      const p = { ...prod };
      if (p.imeiPairs && p.imeiPairs.length > 0) {
        const cleanPairs: typeof p.imeiPairs = [];
        p.imeiPairs.forEach(pr => {
          const im1 = pr.imei1?.trim();
          if (im1 && !globalImeis.has(im1)) {
            globalImeis.add(im1);
            if (pr.imei2?.trim()) globalImeis.add(pr.imei2.trim());
            cleanPairs.push(pr);
          } else {
            imeisDeduplicated++;
          }
        });
        p.imeiPairs = cleanPairs;
        p.imeiList = cleanPairs.flatMap(pr => pr.imei2 ? [pr.imei1, pr.imei2] : [pr.imei1]);
      } else if (p.imeiList && p.imeiList.length > 0) {
        const cleanList: string[] = [];
        p.imeiList.forEach(im => {
          const trimmed = im?.trim();
          if (trimmed && !globalImeis.has(trimmed)) {
            globalImeis.add(trimmed);
            cleanList.push(trimmed);
          } else {
            imeisDeduplicated++;
          }
        });
        p.imeiList = cleanList;
      }
      if (isPhoneCategory(p.category) && (p.imeiPairs?.length || p.imeiList?.length)) {
        p.stock = Math.max(p.stock, p.imeiPairs?.length || p.imeiList?.length || 0);
      }
      return p;
    });
    StorageService.saveProducts(cleanedProducts);

    // 2. Prune old log entries if over 500
    const priceChanges = StorageService.getPriceChanges();
    if (priceChanges.length > 500) {
      logsPruned += (priceChanges.length - 500);
      StorageService.savePriceChanges(priceChanges.slice(0, 500));
    }

    const stockAdjustments = StorageService.getStockAdjustments();
    if (stockAdjustments.length > 500) {
      logsPruned += (stockAdjustments.length - 500);
      StorageService.saveStockAdjustments(stockAdjustments.slice(0, 500));
    }

    const chatMessages = StorageService.getChatMessages();
    if (chatMessages.length > 500) {
      logsPruned += (chatMessages.length - 500);
      StorageService.saveChatMessages(chatMessages.slice(-500));
    }

    // 3. Resolve orphaned draft IDs in purchase records
    const purchases = StorageService.getPurchases();
    let purchaseUpdated = false;
    const updatedPurchases = purchases.map(po => {
      const updatedItems = po.items.map(it => {
        if (it.productId && it.productId.startsWith('prod-draft-')) {
          const match = cleanedProducts.find(p => {
            return normalizeVariantText(p.name) === normalizeVariantText(it.name) &&
              normalizeVariantText(p.brand) === normalizeVariantText(it.brand);
          });
          if (match) {
            draftIdsCleaned++;
            purchaseUpdated = true;
            return { ...it, productId: match.id };
          }
        }
        return it;
      });
      return { ...po, items: updatedItems };
    });
    if (purchaseUpdated) {
      StorageService.savePurchases(updatedPurchases);
    }

    let finalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mobileshop_')) {
          finalBytes += (key.length + (localStorage.getItem(key)?.length || 0)) * 2;
        }
      }
    } catch {
      // fallback
    }

    const freedBytes = Math.max(0, initialBytes - finalBytes);
    const newStorageSizeKb = Math.round((finalBytes / 1024) * 10) / 10;

    StorageService.touchLastUpdated();

    return {
      variantsMerged,
      imeisDeduplicated,
      logsPruned,
      draftIdsCleaned,
      freedBytes,
      newStorageSizeKb,
    };
  },

  // ==========================================
  // Personal Finance Methods
  // ==========================================
  getPersonalWallets: (): PersonalWallet[] => {
    return getItem<PersonalWallet[]>(STORAGE_KEYS.PERSONAL_WALLETS, initialPersonalWallets);
  },
  savePersonalWallets: (wallets: PersonalWallet[]) => {
    setItem(STORAGE_KEYS.PERSONAL_WALLETS, wallets);
  },
  savePersonalWallet: (wallet: PersonalWallet) => {
    const wallets = StorageService.getPersonalWallets();
    const existingIdx = wallets.findIndex(w => w.id === wallet.id);
    let updated: PersonalWallet[];
    if (existingIdx >= 0) {
      updated = wallets.map(w => w.id === wallet.id ? wallet : w);
    } else {
      updated = [...wallets, wallet];
    }
    if (wallet.isDefault) {
      updated = updated.map(w => w.id === wallet.id ? w : { ...w, isDefault: false });
    }
    StorageService.savePersonalWallets(updated);
  },
  deletePersonalWallet: (walletId: string) => {
    const wallets = StorageService.getPersonalWallets().filter(w => w.id !== walletId);
    StorageService.savePersonalWallets(wallets);
  },

  getPersonalTransactions: (): PersonalTransaction[] => {
    return getItem<PersonalTransaction[]>(STORAGE_KEYS.PERSONAL_TRANSACTIONS, initialPersonalTransactions);
  },
  savePersonalTransactions: (transactions: PersonalTransaction[]) => {
    setItem(STORAGE_KEYS.PERSONAL_TRANSACTIONS, transactions);
  },
  savePersonalTransaction: (tx: PersonalTransaction) => {
    const transactions = StorageService.getPersonalTransactions();
    const existingIdx = transactions.findIndex(t => t.id === tx.id);
    const prevTx = existingIdx >= 0 ? transactions[existingIdx] : null;

    const wallets = StorageService.getPersonalWallets();

    // Helper to apply balance changes
    const applyImpact = (t: PersonalTransaction, isReverting: boolean) => {
      const mult = isReverting ? -1 : 1;
      const src = wallets.find(w => w.id === t.walletId);
      const dest = t.toWalletId ? wallets.find(w => w.id === t.toWalletId) : null;

      if (t.type === 'expense' || t.type === 'injection_to_business') {
        if (src) {
          src.balance = Math.max(0, src.balance - (t.amount * mult));
          src.updatedAt = new Date().toISOString();
        }
      } else if (t.type === 'income' || t.type === 'drawing_from_business') {
        if (src) {
          src.balance = Math.max(0, src.balance + (t.amount * mult));
          src.updatedAt = new Date().toISOString();
        }
      } else if (t.type === 'transfer') {
        if (src) {
          src.balance = Math.max(0, src.balance - (t.amount * mult));
          src.updatedAt = new Date().toISOString();
        }
        if (dest) {
          dest.balance = Math.max(0, dest.balance + (t.amount * mult));
          dest.updatedAt = new Date().toISOString();
        }
      }
    };

    if (prevTx) {
      applyImpact(prevTx, true);
    }
    applyImpact(tx, false);

    let updatedTxList: PersonalTransaction[];
    if (existingIdx >= 0) {
      updatedTxList = transactions.map(t => t.id === tx.id ? tx : t);
    } else {
      updatedTxList = [tx, ...transactions];
    }

    StorageService.savePersonalWallets(wallets);
    StorageService.savePersonalTransactions(updatedTxList);

    // Business synchronization hook
    if (tx.syncWithBusiness) {
      if (tx.type === 'drawing_from_business') {
        const drawingExpense: ExpenseRecord = {
          id: tx.linkedShopExpenseId || `exp-draw-${Date.now()}`,
          voucherNumber: `DRAW-${Date.now().toString().slice(-6)}`,
          title: `[Owner Drawing] ${tx.title}`,
          category: 'other_general',
          amount: tx.amount,
          date: tx.date,
          paymentMethod: 'cash',
          notes: `Personal Drawing taken by owner: ${tx.notes || ''}`,
          recordedBy: 'Owner',
          deductFromCashDrawer: true,
        };
        tx.linkedShopExpenseId = drawingExpense.id;
        StorageService.saveExpense(drawingExpense);
      } else if (tx.type === 'injection_to_business') {
        StorageService.recordCashTransaction('in', tx.amount, `[Owner Capital Injection] ${tx.title}`);
      }
    }
  },
  deletePersonalTransaction: (id: string) => {
    const transactions = StorageService.getPersonalTransactions();
    const target = transactions.find(t => t.id === id);
    if (target) {
      const wallets = StorageService.getPersonalWallets();
      const mult = -1; // Revert
      const src = wallets.find(w => w.id === target.walletId);
      const dest = target.toWalletId ? wallets.find(w => w.id === target.toWalletId) : null;

      if (target.type === 'expense' || target.type === 'injection_to_business') {
        if (src) src.balance = src.balance - (target.amount * mult);
      } else if (target.type === 'income' || target.type === 'drawing_from_business') {
        if (src) src.balance = Math.max(0, src.balance + (target.amount * mult));
      } else if (target.type === 'transfer') {
        if (src) src.balance = src.balance - (target.amount * mult);
        if (dest) dest.balance = Math.max(0, dest.balance + (target.amount * mult));
      }
      StorageService.savePersonalWallets(wallets);

      if (target.linkedShopExpenseId) {
        StorageService.deleteExpense(target.linkedShopExpenseId);
      }
    }
    StorageService.savePersonalTransactions(transactions.filter(t => t.id !== id));
  },

  getPersonalBudgets: (): PersonalBudget[] => {
    return getItem<PersonalBudget[]>(STORAGE_KEYS.PERSONAL_BUDGETS, initialPersonalBudgets);
  },
  savePersonalBudgets: (budgets: PersonalBudget[]) => {
    setItem(STORAGE_KEYS.PERSONAL_BUDGETS, budgets);
  },

  getPersonalSavingsGoals: (): PersonalSavingsGoal[] => {
    return getItem<PersonalSavingsGoal[]>(STORAGE_KEYS.PERSONAL_GOALS, initialPersonalSavingsGoals);
  },
  savePersonalSavingsGoals: (goals: PersonalSavingsGoal[]) => {
    setItem(STORAGE_KEYS.PERSONAL_GOALS, goals);
  },
  savePersonalSavingsGoal: (goal: PersonalSavingsGoal) => {
    const goals = StorageService.getPersonalSavingsGoals();
    const idx = goals.findIndex(g => g.id === goal.id);
    if (idx >= 0) {
      goals[idx] = goal;
    } else {
      goals.unshift(goal);
    }
    StorageService.savePersonalSavingsGoals(goals);
  },
  deletePersonalSavingsGoal: (id: string) => {
    const goals = StorageService.getPersonalSavingsGoals().filter(g => g.id !== id);
    StorageService.savePersonalSavingsGoals(goals);
  },

  getPersonalDebts: (): PersonalDebtIOU[] => {
    return getItem<PersonalDebtIOU[]>(STORAGE_KEYS.PERSONAL_DEBTS, initialPersonalDebts);
  },
  savePersonalDebts: (debts: PersonalDebtIOU[]) => {
    setItem(STORAGE_KEYS.PERSONAL_DEBTS, debts);
  },
  savePersonalDebt: (debt: PersonalDebtIOU) => {
    const debts = StorageService.getPersonalDebts();
    const idx = debts.findIndex(d => d.id === debt.id);
    if (idx >= 0) {
      debts[idx] = debt;
    } else {
      debts.unshift(debt);
    }
    StorageService.savePersonalDebts(debts);
  },
  deletePersonalDebt: (id: string) => {
    const debts = StorageService.getPersonalDebts().filter(d => d.id !== id);
    StorageService.savePersonalDebts(debts);
  },

  // Social Media Automated Marketing
  getSocialMarketingState: (): SocialMarketingState | null => {
    return getItem<SocialMarketingState | null>(STORAGE_KEYS.SOCIAL_MARKETING_STATE, null);
  },
  saveSocialMarketingState: (state: SocialMarketingState) => {
    setItem(STORAGE_KEYS.SOCIAL_MARKETING_STATE, state);
  },
  clearSocialMarketingState: () => {
    removeItem(STORAGE_KEYS.SOCIAL_MARKETING_STATE);
  },
  getFacebookPosts: (): FacebookAdPostRecord[] => {
    return getItem<FacebookAdPostRecord[]>(STORAGE_KEYS.FACEBOOK_POSTS, []);
  },
  saveFacebookPosts: (posts: FacebookAdPostRecord[]) => {
    setItem(STORAGE_KEYS.FACEBOOK_POSTS, posts);
  },
  saveFacebookPost: (post: FacebookAdPostRecord) => {
    const posts = StorageService.getFacebookPosts();
    const idx = posts.findIndex(p => p.id === post.id);
    if (idx >= 0) {
      posts[idx] = post;
    } else {
      posts.unshift(post);
    }
    StorageService.saveFacebookPosts(posts);
  },

  touchLastUpdated: (customTimestamp?: number): void => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const ts = customTimestamp || Date.now();
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, String(ts));
      window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'TOUCH', timestamp: ts } }));
    } catch (err) {
      console.error('Error updating storage timestamp:', err);
    }
  }
};
