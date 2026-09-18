import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  deleteDoc,
  writeBatch, 
  onSnapshot, 
  query, 
  limit, 
  Unsubscribe 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FirebaseAuthService } from './firebaseAuthService';
import { StorageService, STORAGE_KEYS, isMockProduct, isMockStaffUser, MOCK_STAFF_IDS } from '../utils/storage';
import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  Customer, 
  ExpenseRecord, 
  ExpenseCategoryItem,
  ShopSettings, 
  StaffUser, 
  Supplier,
  CreditSaleRecord,
  PreOrder,
  StockAdjustment,
  PriceChangeRecord,
  StockAuditSession,
  DamageLog,
  Announcement,
  ChatChannel,
  ChatMessage,
  CashDrawerRecord,
  RolePermissions,
  StaffRole,
  PersonalWallet,
  PersonalTransaction,
  PersonalBudget,
  PersonalSavingsGoal,
  PersonalDebtIOU,
  FacebookAdPostRecord,
  AuditLogEntry
} from '../types';

export const PENDING_AUDIT_LOGS_KEY = 'pending_audit_logs';

export interface FirestoreSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
  pendingAuditLogsCount?: number;
}

/**
 * Sanitizes data for Firestore by stripping undefined values and converting invalid fields.
 */
function sanitizeForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    return value === undefined ? null : value;
  }));
}

export class FirestoreSyncService {
  private static instance: FirestoreSyncService | null = null;
  private statusListeners: Set<(status: FirestoreSyncStatus) => void> = new Set();
  private unsubscribers: Unsubscribe[] = [];
  private preAuthUnsubscribers: Unsubscribe[] = [];
  private isProcessingRemoteSnapshot: boolean = false;
  private isSyncPaused: boolean = false;
  private status: FirestoreSyncStatus = {
    isConnected: false,
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
  };

  public static getInstance(): FirestoreSyncService {
    if (!this.instance) {
      this.instance = new FirestoreSyncService();
    }
    return this.instance;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.registerStorageHooks();
      this.registerDataUpdatedEventListener();

      // Listen for network connectivity changes (Offline Queueing & Sync)
      window.addEventListener('online', () => {
        console.log('[FirestoreSync] Network connection restored. Flushing queued pending_audit_logs to Firestore...');
        this.updateStatus({ isConnected: true, error: null });
        this.flushPendingAuditLogs();
      });

      window.addEventListener('offline', () => {
        console.warn('[FirestoreSync] Network connection lost. Storing activity logs in pending_audit_logs queue.');
        this.updateStatus({ isConnected: false });
      });

      // Start pre-auth listener for staffUsers and settings so login terminal is always up to date
      this.startPreAuthSync();

      FirebaseAuthService.onAuthChanged((user) => {
        const isAuth = Boolean(user) || FirebaseAuthService.isAuthenticated();
        if (isAuth) {
          this.stopPreAuthSync();
          this.updateStatus({ isConnected: true, error: null });
          this.startRealtimeSync();
          // Flush any offline queued activity logs once authenticated
          this.flushPendingAuditLogs();
        } else {
          this.stopRealtimeSync();
          this.startPreAuthSync();
          this.updateStatus({ isConnected: false });
        }
      });
    }
  }

  /**
   * Listen to local storage update events so ANY collection saved through StorageService
   * is automatically synced to Firestore without missing anything.
   */
  private registerDataUpdatedEventListener() {
    window.addEventListener('mobileshop_data_updated', (e: any) => {
      if (this.isSyncPaused || this.isProcessingRemoteSnapshot) return;
      if (!FirebaseAuthService.isAuthenticated()) return;

      const key = e.detail?.key;
      if (!key) return;

      try {
        switch (key) {
          case STORAGE_KEYS.SETTINGS:
            this.syncSettings(StorageService.getSettings());
            break;
          case STORAGE_KEYS.PRODUCTS:
            this.syncProducts(StorageService.getProducts());
            break;
          case STORAGE_KEYS.SALES:
            this.syncSales(StorageService.getSales());
            break;
          case STORAGE_KEYS.CREDIT_SALES:
            this.syncCreditSales(StorageService.getCreditSales());
            break;
          case STORAGE_KEYS.PURCHASES:
            this.syncPurchases(StorageService.getPurchases());
            break;
          case STORAGE_KEYS.EXPENSES:
            this.syncExpenses(StorageService.getExpenses());
            break;
          case STORAGE_KEYS.EXPENSE_CATEGORIES:
            this.syncExpenseCategories(StorageService.getExpenseCategories());
            break;
          case STORAGE_KEYS.CUSTOMERS:
            this.syncCustomers(StorageService.getCustomers());
            break;
          case STORAGE_KEYS.SUPPLIERS:
            this.syncSuppliers(StorageService.getSuppliers());
            break;
          case STORAGE_KEYS.STAFF_USERS:
            this.syncStaffUsers(StorageService.getStaffUsers());
            break;
          case STORAGE_KEYS.ROLE_PERMISSIONS:
            this.syncRolePermissions(StorageService.getRolePermissions());
            break;
          case STORAGE_KEYS.CASH_DRAWER:
            this.syncCashDrawer(StorageService.getCashDrawer());
            break;
          case STORAGE_KEYS.PRE_ORDERS:
            this.syncPreOrders(StorageService.getPreOrders());
            break;
          case STORAGE_KEYS.STOCK_ADJUSTMENTS:
            this.syncStockAdjustments(StorageService.getStockAdjustments());
            break;
          case STORAGE_KEYS.PRICE_CHANGES:
            this.syncPriceChanges(StorageService.getPriceChanges());
            break;
          case STORAGE_KEYS.STOCK_AUDITS:
            this.syncStockAudits(StorageService.getStockAudits());
            break;
          case STORAGE_KEYS.DAMAGE_LOGS:
            this.syncDamageLogs(StorageService.getDamageLogs());
            break;
          case STORAGE_KEYS.ANNOUNCEMENTS:
            this.syncAnnouncements(StorageService.getAnnouncements());
            break;
          case STORAGE_KEYS.CHAT_CHANNELS:
            this.syncChatChannels(StorageService.getChatChannels());
            break;
          case STORAGE_KEYS.CHAT_MESSAGES:
            this.syncChatMessages(StorageService.getChatMessages());
            break;
          case STORAGE_KEYS.PERSONAL_WALLETS:
            this.syncPersonalWallets(StorageService.getPersonalWallets());
            break;
          case STORAGE_KEYS.PERSONAL_TRANSACTIONS:
            this.syncPersonalTransactions(StorageService.getPersonalTransactions());
            break;
          case STORAGE_KEYS.PERSONAL_BUDGETS:
            this.syncPersonalBudgets(StorageService.getPersonalBudgets());
            break;
          case STORAGE_KEYS.PERSONAL_GOALS:
            this.syncPersonalGoals(StorageService.getPersonalSavingsGoals());
            break;
          case STORAGE_KEYS.PERSONAL_DEBTS:
            this.syncPersonalDebts(StorageService.getPersonalDebts());
            break;
          case STORAGE_KEYS.FACEBOOK_POSTS:
            this.syncFacebookPosts(StorageService.getFacebookPosts());
            break;
          case STORAGE_KEYS.AUDIT_LOGS:
            this.syncAuditLogs(StorageService.getAuditLogs());
            break;
        }
      } catch (err) {
        console.warn('[FirestoreSync] Auto-sync event handler warning:', err);
      }
    });
  }

  /**
   * Connects high-priority local storage hooks directly into Firestore push operations
   */
  private registerStorageHooks() {
    StorageService.setSyncHandler({
      onSaleUpsert: (sale) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncSale(sale);
      },
      onSalesBatch: (sales) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncSales(sales);
      },
      onSaleDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.deleteSale(id);
      },
      onPurchaseUpsert: (purchase) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncPurchase(purchase);
      },
      onPurchasesBatch: (purchases) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncPurchases(purchases);
      },
      onPurchaseDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.deletePurchase(id);
      },
      onCustomerUpsert: (customer) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncCustomer(customer);
      },
      onExpenseUpsert: (expense) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncExpense(expense);
      },
      onExpenseDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.deleteExpense(id);
      },
      onProductUpsert: (product) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncProduct(product);
      },
      onProductDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.deleteProduct(id);
      },
      onSettingsUpsert: (settings) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncSettings(settings);
      },
      onSupplierUpsert: (supplier) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncSupplier(supplier);
      },
      onStaffUserUpsert: (staff) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncStaffUser(staff);
      },
      onStaffUsersBatch: (staffList) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.syncStaffUsers(staffList);
      },
      onStaffUserDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot) this.deleteStaffUser(id);
      },
    });
  }

  public subscribeStatus(callback: (status: FirestoreSyncStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private updateStatus(partial: Partial<FirestoreSyncStatus>) {
    this.status = { ...this.status, ...partial };
    this.statusListeners.forEach(cb => {
      try {
        cb(this.status);
      } catch (e) {
        console.error('[FirestoreSync] Callback error:', e);
      }
    });
  }

  // ==========================================
  // REAL-TIME FIRESTORE LISTENERS (PULL/SYNC)
  // ==========================================

  /**
   * Safely merges remote settings with local settings.
   * Crucial guarantee: Never allows an empty or missing remote logoUrl, invoiceLogoUrl,
   * or faviconUrl to overwrite a valid existing local branding logo.
   */
  private mergeSettingsSafely(current: ShopSettings, remoteSettings: ShopSettings): ShopSettings {
    const hasValidRemoteLogo = Boolean(remoteSettings.logoUrl && remoteSettings.logoUrl.trim() !== '');
    const hasValidRemoteFavicon = Boolean(remoteSettings.faviconUrl && remoteSettings.faviconUrl.trim() !== '');
    const hasValidRemoteInvoiceLogo = Boolean(remoteSettings.invoiceLogoUrl && remoteSettings.invoiceLogoUrl.trim() !== '');

    const resolvedLogoUrl = hasValidRemoteLogo ? remoteSettings.logoUrl : (current.logoUrl || '');
    const resolvedFaviconUrl = hasValidRemoteFavicon ? remoteSettings.faviconUrl : (current.faviconUrl || '');
    const resolvedInvoiceLogoUrl = hasValidRemoteInvoiceLogo ? remoteSettings.invoiceLogoUrl : (current.invoiceLogoUrl || '');

    const invoiceCustomization = current.invoiceCustomization ? {
      ...current.invoiceCustomization,
      ...(remoteSettings.invoiceCustomization || {}),
      shopLogoUrl: remoteSettings.invoiceCustomization?.shopLogoUrl || resolvedInvoiceLogoUrl || current.invoiceCustomization?.shopLogoUrl || '',
      showShopLogo: remoteSettings.invoiceCustomization?.showShopLogo ?? current.invoiceCustomization?.showShopLogo ?? true,
    } : remoteSettings.invoiceCustomization;

    return {
      ...current,
      ...remoteSettings,
      logoUrl: resolvedLogoUrl,
      faviconUrl: resolvedFaviconUrl,
      invoiceLogoUrl: resolvedInvoiceLogoUrl,
      invoiceCustomization: invoiceCustomization as any,
      shopLogoSize: remoteSettings.shopLogoSize || current.shopLogoSize || 40,
      invoiceLogoSize: remoteSettings.invoiceLogoSize || current.invoiceLogoSize || 44,
      logoTransparentBg: remoteSettings.logoTransparentBg !== undefined 
        ? remoteSettings.logoTransparentBg 
        : (current.logoTransparentBg ?? true),
    };
  }

  /**
   * Listens to public POS terminal collections (staffUsers and settings/global) before authentication
   * so that the login screen always has the real store branding and staff accounts from Firestore.
   */
  public startPreAuthSync() {
    this.stopPreAuthSync();
    try {
      // 1. Pre-auth Staff Users Listener
      const unsubStaff = onSnapshot(query(collection(db, 'staffUsers'), limit(500)), (snap) => {
        if (!snap.empty) {
          const remoteStaff: StaffUser[] = [];
          snap.forEach(d => {
            const data = d.data() as StaffUser;
            if (data && !isMockStaffUser(data)) {
              remoteStaff.push({
                ...data,
                id: data.id || d.id,
                active: data.active !== false,
                password: data.password || data.pin,
                pin: data.pin || data.password || '1234',
              });
            }
          });
          if (remoteStaff.length > 0) {
            this.isProcessingRemoteSnapshot = true;
            try {
              const localStaff = StorageService.getStaffUsers();
              const merged = [...localStaff];
              remoteStaff.forEach(remote => {
                const idx = merged.findIndex(l => l.id === remote.id);
                if (idx >= 0) merged[idx] = { ...merged[idx], ...remote };
                else merged.push(remote);
              });
              const cleanMerged = merged.filter(u => !isMockStaffUser(u));
              StorageService.saveStaffUsers(cleanMerged, true);
              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            } finally {
              this.isProcessingRemoteSnapshot = false;
            }
          }
        }
      }, (err) => console.warn('[FirestoreSync] Pre-auth staff listener notice:', err.message));
      this.preAuthUnsubscribers.push(unsubStaff);

      // 2. Pre-auth Settings Listener
      const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        if (snap.exists()) {
          const remoteSettings = snap.data() as ShopSettings;
          if (remoteSettings && remoteSettings.shopName) {
            this.isProcessingRemoteSnapshot = true;
            try {
              const current = StorageService.getSettings();
              const merged = this.mergeSettingsSafely(current, remoteSettings);
              StorageService.saveSettings(merged, true);
              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            } finally {
              this.isProcessingRemoteSnapshot = false;
            }
          }
        }
      }, (err) => console.warn('[FirestoreSync] Pre-auth settings listener notice:', err.message));
      this.preAuthUnsubscribers.push(unsubSettings);
    } catch (err) {
      console.warn('[FirestoreSync] startPreAuthSync notice:', err);
    }
  }

  public stopPreAuthSync() {
    this.preAuthUnsubscribers.forEach(unsub => {
      try { unsub(); } catch {}
    });
    this.preAuthUnsubscribers = [];
  }

  /**
   * Starts real-time snapshots for ALL active collections in Firestore
   */
  public startRealtimeSync() {
    this.stopRealtimeSync();

    if (this.isSyncPaused) {
      console.log('[FirestoreSync] Realtime sync is currently paused. Skipping startRealtimeSync.');
      return;
    }

    try {
      // Purge any residual mock staff from Firestore in the background
      this.purgeMockStaffUsersFromFirestore().catch(() => {});

      // 1. Settings Listener
      const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        if (snap.exists()) {
          const remoteSettings = snap.data() as ShopSettings;
          if (remoteSettings && remoteSettings.shopName) {
            this.isProcessingRemoteSnapshot = true;
            try {
              const current = StorageService.getSettings();
              const merged = this.mergeSettingsSafely(current, remoteSettings);
              StorageService.saveSettings(merged, false);

              // Auto-repair remote Firestore document if it had empty logos but local had valid ones
              const remoteMissingLogos = (!remoteSettings.logoUrl && merged.logoUrl) ||
                                         (!remoteSettings.faviconUrl && merged.faviconUrl) ||
                                         (!remoteSettings.invoiceLogoUrl && merged.invoiceLogoUrl);
              if (remoteMissingLogos) {
                console.log('[FirestoreSync] Auto-repairing Firestore settings/global with local branding...');
                this.syncSettings(merged);
              }

              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            } finally {
              this.isProcessingRemoteSnapshot = false;
            }
          }
        }
      }, (err) => console.warn('[FirestoreSync] Settings listener:', err.message));
      this.unsubscribers.push(unsubSettings);

      // 2. Products Listener - strictly replaces local state and handles 'removed' changes
      const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as Product | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveProducts([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteProducts: Product[] = [];
          snap.forEach(d => {
            const data = d.data() as Product;
            if (data && isMockProduct(data)) {
              deleteDoc(doc(db, 'products', d.id)).catch(() => {});
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteProducts.push({
                ...data,
                id: data.id || d.id,
              });
            }
          });

          // Strictly replace the local state with authoritative Firestore products list
          StorageService.saveProducts(remoteProducts);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Products listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Products listener:', err.message));
      this.unsubscribers.push(unsubProducts);

      // 3. Sales Listener - strictly replaces local state and handles 'removed' changes
      const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as Sale | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveSales([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteSales: Sale[] = [];
          snap.forEach(d => {
            const data = d.data() as Sale;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteSales.push({ ...data, id: data.id || d.id });
            }
          });

          remoteSales.sort((a, b) => {
            const timeA = new Date(a.date || (a as any).createdAt || 0).getTime();
            const timeB = new Date(b.date || (b as any).createdAt || 0).getTime();
            return timeB - timeA;
          });

          StorageService.saveSales(remoteSales);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Sales listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Sales listener:', err.message));
      this.unsubscribers.push(unsubSales);

      // 4. Credit Sales Listener - strictly replaces local state and handles 'removed' changes
      const unsubCreditSales = onSnapshot(collection(db, 'creditSales'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as CreditSaleRecord | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveCreditSales([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteCreditSales: CreditSaleRecord[] = [];
          snap.forEach(d => {
            const data = d.data() as CreditSaleRecord;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteCreditSales.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveCreditSales(remoteCreditSales);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Credit sales listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Credit sales listener:', err.message));
      this.unsubscribers.push(unsubCreditSales);

      // 5. Purchases Listener - strictly replaces local state and handles 'removed' changes
      const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as PurchaseRecord | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.savePurchases([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remotePurchases: PurchaseRecord[] = [];
          snap.forEach(d => {
            const data = d.data() as PurchaseRecord;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remotePurchases.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.savePurchases(remotePurchases);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Purchases listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Purchases listener:', err.message));
      this.unsubscribers.push(unsubPurchases);

      // 6. Customers Listener - strictly replaces local state and handles 'removed' changes
      const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as Customer | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveCustomers([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteCustomers: Customer[] = [];
          snap.forEach(d => {
            const data = d.data() as Customer;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteCustomers.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveCustomers(remoteCustomers);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Customers listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Customers listener:', err.message));
      this.unsubscribers.push(unsubCustomers);

      // 7. Expenses Listener - strictly replaces local state and handles 'removed' changes
      const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as ExpenseRecord | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveExpenses([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteExpenses: ExpenseRecord[] = [];
          snap.forEach(d => {
            const data = d.data() as ExpenseRecord;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteExpenses.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveExpenses(remoteExpenses);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Expenses listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Expenses listener:', err.message));
      this.unsubscribers.push(unsubExpenses);

      // 8. Expense Categories Listener
      const unsubExpenseCategories = onSnapshot(doc(db, 'expenseCategories', 'global'), (snap) => {
        if (snap.exists()) {
          const categories = snap.data()?.categories as ExpenseCategoryItem[];
          if (Array.isArray(categories)) {
            this.isProcessingRemoteSnapshot = true;
            try {
              StorageService.saveExpenseCategories(categories);
              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            } finally {
              this.isProcessingRemoteSnapshot = false;
            }
          }
        }
      }, (err) => console.warn('[FirestoreSync] Expense categories listener:', err.message));
      this.unsubscribers.push(unsubExpenseCategories);

      // 9. Suppliers Listener - strictly replaces local state and handles 'removed' changes
      const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as Supplier | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveSuppliers([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteSuppliers: Supplier[] = [];
          snap.forEach(d => {
            const data = d.data() as Supplier;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteSuppliers.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveSuppliers(remoteSuppliers);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Suppliers listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Suppliers listener:', err.message));
      this.unsubscribers.push(unsubSuppliers);

      // 10. Staff Users Listener - strictly replaces local state and handles 'removed' changes
      const unsubStaff = onSnapshot(collection(db, 'staffUsers'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as StaffUser | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          const remoteStaff: StaffUser[] = [];
          snap.forEach(d => {
            const data = d.data() as StaffUser;
            if (data && !isMockStaffUser(data) && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteStaff.push({
                ...data,
                id: data.id || d.id,
              });
            } else if (data && isMockStaffUser(data)) {
              deleteDoc(d.ref).catch(() => {});
            }
          });

          if (remoteStaff.length > 0) {
            StorageService.saveStaffUsers(remoteStaff);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Staff listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Staff listener:', err.message));
      this.unsubscribers.push(unsubStaff);

      // 11. Role Permissions Listener
      const unsubRolePerms = onSnapshot(doc(db, 'rolePermissions', 'global'), (snap) => {
        if (snap.exists()) {
          const perms = snap.data()?.permissions as Record<any, any>;
          if (perms) {
            this.isProcessingRemoteSnapshot = true;
            try {
              StorageService.saveRolePermissions(perms);
              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            } finally {
              this.isProcessingRemoteSnapshot = false;
            }
          }
        }
      }, (err) => console.warn('[FirestoreSync] Role permissions listener:', err.message));
      this.unsubscribers.push(unsubRolePerms);

      // 12. Cash Drawer Listener
      const unsubCashDrawer = onSnapshot(doc(db, 'cashDrawer', 'current'), (snap) => {
        if (snap.exists()) {
          const remoteDrawer = snap.data() as CashDrawerRecord;
          if (remoteDrawer && (remoteDrawer.openingFloat !== undefined || remoteDrawer.status !== undefined)) {
            this.isProcessingRemoteSnapshot = true;
            try {
              StorageService.saveCashDrawer(remoteDrawer);
              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            } finally {
              this.isProcessingRemoteSnapshot = false;
            }
          }
        }
      }, (err) => console.warn('[FirestoreSync] Cash drawer listener:', err.message));
      this.unsubscribers.push(unsubCashDrawer);

      // 13. Pre-Orders Listener - strictly replaces local state and handles 'removed' changes
      const unsubPreOrders = onSnapshot(collection(db, 'preOrders'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as PreOrder | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.savePreOrders([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remotePreOrders: PreOrder[] = [];
          snap.forEach(d => {
            const data = d.data() as PreOrder;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remotePreOrders.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.savePreOrders(remotePreOrders);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Pre-orders listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Pre-orders listener:', err.message));
      this.unsubscribers.push(unsubPreOrders);

      // 14. Stock Adjustments Listener - strictly replaces local state and handles 'removed' changes
      const unsubAdjustments = onSnapshot(collection(db, 'stockAdjustments'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as StockAdjustment | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveStockAdjustments([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteAdjs: StockAdjustment[] = [];
          snap.forEach(d => {
            const data = d.data() as StockAdjustment;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteAdjs.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveStockAdjustments(remoteAdjs);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Stock adjustments listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Stock adjustments listener:', err.message));
      this.unsubscribers.push(unsubAdjustments);

      // 15. Price Changes Listener - strictly replaces local state and handles 'removed' changes
      const unsubPriceChanges = onSnapshot(collection(db, 'priceChanges'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as PriceChangeRecord | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.savePriceChanges([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remotePcs: PriceChangeRecord[] = [];
          snap.forEach(d => {
            const data = d.data() as PriceChangeRecord;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remotePcs.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.savePriceChanges(remotePcs);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Price changes listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Price changes listener:', err.message));
      this.unsubscribers.push(unsubPriceChanges);

      // 16. Stock Audits Listener - strictly replaces local state and handles 'removed' changes
      const unsubAudits = onSnapshot(collection(db, 'stockAudits'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as StockAuditSession | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveStockAudits([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteAudits: StockAuditSession[] = [];
          snap.forEach(d => {
            const data = d.data() as StockAuditSession;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteAudits.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveStockAudits(remoteAudits);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Stock audits listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Stock audits listener:', err.message));
      this.unsubscribers.push(unsubAudits);

      // 17. Damage Logs Listener - strictly replaces local state and handles 'removed' changes
      const unsubDamage = onSnapshot(collection(db, 'damageLogs'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as DamageLog | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveDamageLogs([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteDamage: DamageLog[] = [];
          snap.forEach(d => {
            const data = d.data() as DamageLog;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteDamage.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveDamageLogs(remoteDamage);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Damage logs listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Damage logs listener:', err.message));
      this.unsubscribers.push(unsubDamage);

      // 18. Announcements Listener - strictly replaces local state and handles 'removed' changes
      const unsubAnnounce = onSnapshot(collection(db, 'announcements'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as Announcement | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveAnnouncements([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteAnnounce: Announcement[] = [];
          snap.forEach(d => {
            const data = d.data() as Announcement;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteAnnounce.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveAnnouncements(remoteAnnounce);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Announcements listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Announcements listener:', err.message));
      this.unsubscribers.push(unsubAnnounce);

      // 19. Chat Messages Listener - strictly replaces local state and handles 'removed' changes
      const unsubChat = onSnapshot(collection(db, 'chatMessages'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as ChatMessage | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveChatMessages([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteChat: ChatMessage[] = [];
          snap.forEach(d => {
            const data = d.data() as ChatMessage;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteChat.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveChatMessages(remoteChat);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Chat messages listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Chat messages listener:', err.message));
      this.unsubscribers.push(unsubChat);

      // 20. Audit Logs Listener - strictly replaces local state and handles 'removed' changes
      const unsubAudit = onSnapshot(collection(db, 'auditLogs'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as AuditLogEntry | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            StorageService.saveAuditLogs([]);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteLogs: AuditLogEntry[] = [];
          snap.forEach(d => {
            const data = d.data() as AuditLogEntry;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteLogs.push({ ...data, id: data.id || d.id });
            }
          });

          StorageService.saveAuditLogs(remoteLogs);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Audit logs listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Audit logs listener:', err.message));
      this.unsubscribers.push(unsubAudit);

      this.updateStatus({ isConnected: true, error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Realtime sync initialization warning:', err.message);
      this.updateStatus({ error: err.message });
    }
  }

  public stopRealtimeSync() {
    this.unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
    this.unsubscribers = [];
  }

  /**
   * Pauses all realtime listeners and outgoing sync updates.
   * Useful when performing critical database-clearing or wipe operations.
   */
  public pauseSync(): void {
    console.log('[FirestoreSync] Pausing all realtime listeners and outgoing sync...');
    this.isSyncPaused = true;
    this.stopRealtimeSync();
  }

  /**
   * Resumes realtime sync and re-establishes snapshots if authenticated.
   */
  public resumeSync(): void {
    console.log('[FirestoreSync] Resuming realtime sync...');
    this.isSyncPaused = false;
    if (FirebaseAuthService.isAuthenticated()) {
      this.startRealtimeSync();
    }
  }

  public isPaused(): boolean {
    return this.isSyncPaused;
  }

  // ==========================================
  // INDIVIDUAL REAL-TIME PUSH OPERATIONS
  // ==========================================

  public async syncSale(sale: Sale): Promise<void> {
    if (!sale?.id) return;
    try {
      const docRef = doc(db, 'sales', sale.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...sale,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing sale:', err?.message || err);
    }
  }

  public async syncSales(sales: Sale[]): Promise<void> {
    await this.batchWriteCollection('sales', sales, s => s.id);
  }

  public async deleteSale(id: string): Promise<void> {
    if (!id) return;
    try {
      const docRef = doc(db, 'sales', id);
      await deleteDoc(docRef);
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting sale:', err?.message || err);
    }
  }

  public async syncCreditSales(creditSales: CreditSaleRecord[]): Promise<void> {
    await this.batchWriteCollection('creditSales', creditSales, cs => cs.id);
  }

  public async syncPurchase(purchase: PurchaseRecord): Promise<void> {
    if (!purchase?.id) return;
    try {
      const docRef = doc(db, 'purchases', purchase.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...purchase,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing purchase:', err?.message || err);
    }
  }

  public async syncPurchases(purchases: PurchaseRecord[]): Promise<void> {
    await this.batchWriteCollection('purchases', purchases, p => p.id);
  }

  public async deletePurchase(id: string): Promise<void> {
    if (!id) return;
    try {
      const docRef = doc(db, 'purchases', id);
      await deleteDoc(docRef);
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting purchase:', err?.message || err);
    }
  }

  public async syncCustomer(customer: Customer): Promise<void> {
    if (!customer?.id) return;
    try {
      const docRef = doc(db, 'customers', customer.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...customer,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing customer:', err?.message || err);
    }
  }

  public async syncCustomers(customers: Customer[]): Promise<void> {
    await this.batchWriteCollection('customers', customers, c => c.id);
  }

  public async syncExpense(expense: ExpenseRecord): Promise<void> {
    if (!expense?.id) return;
    try {
      const docRef = doc(db, 'expenses', expense.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...expense,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing expense:', err?.message || err);
    }
  }

  public async syncExpenses(expenses: ExpenseRecord[]): Promise<void> {
    await this.batchWriteCollection('expenses', expenses, e => e.id);
  }

  public async deleteExpense(id: string): Promise<void> {
    if (!id) return;
    try {
      const docRef = doc(db, 'expenses', id);
      await deleteDoc(docRef);
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting expense:', err?.message || err);
    }
  }

  public async syncExpenseCategories(categories: ExpenseCategoryItem[]): Promise<void> {
    try {
      const docRef = doc(db, 'expenseCategories', 'global');
      await setDoc(docRef, sanitizeForFirestore({
        categories,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing expense categories:', err?.message || err);
    }
  }

  public async syncProduct(product: Product): Promise<void> {
    if (!product?.id) return;
    try {
      const docRef = doc(db, 'products', product.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...product,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing product:', err?.message || err);
    }
  }

  public async syncProducts(products: Product[]): Promise<void> {
    await this.batchWriteCollection('products', products, p => p.id);
  }

  public async deleteProduct(id: string): Promise<void> {
    if (!id) return;
    try {
      const docRef = doc(db, 'products', id);
      await deleteDoc(docRef);
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting product:', err?.message || err);
    }
  }

  public async syncSettings(settings: ShopSettings): Promise<void> {
    try {
      const docRef = doc(db, 'settings', 'global');
      await setDoc(docRef, sanitizeForFirestore({
        ...settings,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing settings:', err?.message || err);
    }
  }

  public async syncSupplier(supplier: Supplier): Promise<void> {
    if (!supplier?.id) return;
    try {
      const docRef = doc(db, 'suppliers', supplier.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...supplier,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing supplier:', err?.message || err);
    }
  }

  public async syncSuppliers(suppliers: Supplier[]): Promise<void> {
    await this.batchWriteCollection('suppliers', suppliers, s => s.id);
  }

  public async syncStaffUsers(staff: StaffUser[]): Promise<void> {
    const cleanStaff = staff.filter(u => !isMockStaffUser(u));
    await this.batchWriteCollection('staffUsers', cleanStaff, u => u.id);
  }

  /**
   * Fetches all registered staff users directly from Firestore /staffUsers
   * and merges them into local StorageService.
   */
  public async fetchStaffUsersFromFirestore(): Promise<StaffUser[]> {
    try {
      const snap = await getDocs(collection(db, 'staffUsers'));
      const remoteStaff: StaffUser[] = [];
      snap.forEach(d => {
        const data = d.data() as StaffUser;
        if (data && !isMockStaffUser(data)) {
          remoteStaff.push({
            ...data,
            id: data.id || d.id,
            active: data.active !== false,
            password: data.password || data.pin,
            pin: data.pin || data.password || '1234',
          });
        }
      });
      if (remoteStaff.length > 0) {
        const local = StorageService.getStaffUsers();
        const merged = [...local];
        remoteStaff.forEach(r => {
          const idx = merged.findIndex(m => m.id === r.id);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...r };
          else merged.push(r);
        });
        const cleanMerged = merged.filter(u => !isMockStaffUser(u));
        StorageService.saveStaffUsers(cleanMerged, true);
        return cleanMerged;
      }
    } catch (err: any) {
      console.warn('[FirestoreSync] fetchStaffUsersFromFirestore notice:', err?.message || err);
    }
    return StorageService.getStaffUsers();
  }

  /**
   * Looks up a staff user in Firestore by username, email, phone number, or document ID.
   */
  public async findStaffUserInFirestore(identifier: string): Promise<StaffUser | null> {
    const cleanId = (identifier || '').trim().toLowerCase();
    if (!cleanId) return null;
    const cleanDigits = cleanId.replace(/\D/g, '');

    try {
      const snap = await getDocs(collection(db, 'staffUsers'));
      for (const d of snap.docs) {
        const u = d.data() as StaffUser;
        if (!u || isMockStaffUser(u)) continue;

        const docId = (d.id || '').trim().toLowerCase();
        const uId = (u.id || '').trim().toLowerCase();
        const uName = (u.username || '').trim().toLowerCase();
        const fullName = (u.name || '').trim().toLowerCase();
        const uEmail = (u.email || '').trim().toLowerCase();
        const uPhoneDigits = (u.phone || '').replace(/\D/g, '');

        if (
          docId === cleanId ||
          uId === cleanId ||
          uName === cleanId ||
          fullName === cleanId ||
          uEmail === cleanId ||
          (cleanDigits.length >= 6 && uPhoneDigits.endsWith(cleanDigits))
        ) {
          const userObj: StaffUser = {
            id: u.id || d.id,
            username: u.username || (cleanId.includes('@') ? cleanId.split('@')[0] : cleanId),
            name: u.name || 'Store Staff',
            role: (u.role as StaffRole) || 'Cashier',
            phone: u.phone || '',
            email: u.email || (cleanId.includes('@') ? cleanId : undefined),
            pin: u.pin || u.password || '1234',
            password: u.password || u.pin || '1234',
            active: u.active !== false,
            avatarColor: u.avatarColor || (u.role === 'Owner' ? 'bg-purple-600' : 'bg-emerald-600'),
            customPermissions: u.customPermissions,
            restrictWorkingHours: u.role === 'Owner' ? false : Boolean(u.restrictWorkingHours),
            workStartTime: u.workStartTime,
            workEndTime: u.workEndTime,
          };
          return userObj;
        }
      }
    } catch (err: any) {
      console.warn('[FirestoreSync] findStaffUserInFirestore notice:', err?.message || err);
    }
    return null;
  }

  /**
   * Fetches fresh, real-time staff document from Firestore by document ID
   * to ensure credentials and PIN are 100% current.
   */
  public async getFreshStaffUser(userId: string): Promise<StaffUser | null> {
    if (!userId) return null;
    try {
      const docRef = doc(db, 'staffUsers', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const u = snap.data() as StaffUser;
        if (u && !isMockStaffUser(u)) {
          return {
            ...u,
            id: u.id || snap.id,
            active: u.active !== false,
            password: u.password || u.pin,
            pin: u.pin || u.password || '1234',
          };
        }
      }
    } catch (err: any) {
      console.warn('[FirestoreSync] getFreshStaffUser notice:', err?.message || err);
    }
    return null;
  }

  public async purgeMockStaffUsersFromFirestore(): Promise<void> {
    try {
      const mockIds = ['staff-1', 'staff-2', 'staff-3', 'staff-4'];
      for (const id of mockIds) {
        const docRef = doc(db, 'staffUsers', id);
        await deleteDoc(docRef).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[FirestoreSync] Error purging mock staff from Firestore:', err?.message || err);
    }
  }

  public async syncStaffUser(staff: StaffUser): Promise<void> {
    try {
      const docRef = doc(db, 'staffUsers', staff.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...staff,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing staff user:', err?.message || err);
    }
  }

  public async deleteStaffUser(id: string): Promise<void> {
    try {
      const docRef = doc(db, 'staffUsers', id);
      await deleteDoc(docRef);
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting staff user:', err?.message || err);
    }
  }

  public async syncRolePermissions(permissions: Record<any, any>): Promise<void> {
    try {
      const docRef = doc(db, 'rolePermissions', 'global');
      await setDoc(docRef, sanitizeForFirestore({
        permissions,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing role permissions:', err?.message || err);
    }
  }

  public async syncCashDrawer(drawer: CashDrawerRecord): Promise<void> {
    try {
      const docRef = doc(db, 'cashDrawer', 'current');
      await setDoc(docRef, sanitizeForFirestore({
        ...drawer,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing cash drawer:', err?.message || err);
    }
  }

  public async syncPreOrders(preOrders: PreOrder[]): Promise<void> {
    await this.batchWriteCollection('preOrders', preOrders, po => po.id);
  }

  public async syncStockAdjustments(adjs: StockAdjustment[]): Promise<void> {
    await this.batchWriteCollection('stockAdjustments', adjs, a => a.id);
  }

  public async syncPriceChanges(pcs: PriceChangeRecord[]): Promise<void> {
    await this.batchWriteCollection('priceChanges', pcs, p => p.id);
  }

  public async syncStockAudits(audits: StockAuditSession[]): Promise<void> {
    await this.batchWriteCollection('stockAudits', audits, a => a.id);
  }

  public async syncDamageLogs(logs: DamageLog[]): Promise<void> {
    await this.batchWriteCollection('damageLogs', logs, d => d.id);
  }

  // ==========================================
  // OFFLINE AUDIT LOG QUEUE & RETRY ENGINE
  // ==========================================

  /**
   * Retrieves pending activity logs stored in the localStorage offline queue.
   */
  public getPendingAuditLogs(): AuditLogEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(PENDING_AUDIT_LOGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[FirestoreSync] Error reading pending_audit_logs from localStorage:', e);
      return [];
    }
  }

  /**
   * Persists pending activity logs into the localStorage offline queue.
   */
  public savePendingAuditLogs(logs: AuditLogEntry[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PENDING_AUDIT_LOGS_KEY, JSON.stringify(logs));
      window.dispatchEvent(new CustomEvent('mobileshop_pending_audit_updated', { 
        detail: { count: logs.length, pendingLogs: logs } 
      }));
    } catch (e) {
      console.error('[FirestoreSync] Error saving pending_audit_logs to localStorage:', e);
    }
  }

  /**
   * Enqueues an activity log into the offline queue when disconnected or sync fails.
   */
  public queuePendingAuditLog(entry: AuditLogEntry): void {
    if (!entry?.id) return;
    const currentQueue = this.getPendingAuditLogs();
    if (!currentQueue.some(item => item.id === entry.id)) {
      currentQueue.push(entry);
      // Bound size to prevent memory exhaustion
      if (currentQueue.length > 500) {
        currentQueue.shift();
      }
      this.savePendingAuditLogs(currentQueue);
      console.log(`[FirestoreSync] Queued activity log ${entry.id} in pending_audit_logs (${currentQueue.length} pending).`);
      this.updateStatus({ pendingAuditLogsCount: currentQueue.length });
    }
  }

  /**
   * Prunes stale logs from the offline queue based on retention cutoff.
   */
  public prunePendingAuditLogs(cutoffTimestamp: number): void {
    const currentQueue = this.getPendingAuditLogs();
    const filtered = currentQueue.filter(item => new Date(item.timestamp).getTime() >= cutoffTimestamp);
    if (filtered.length !== currentQueue.length) {
      this.savePendingAuditLogs(filtered);
      this.updateStatus({ pendingAuditLogsCount: filtered.length });
    }
  }

  /**
   * Pushes a single activity log to Firestore.
   * If the device is offline or sync fails, stores in pending_audit_logs queue.
   */
  public async pushActivityLog(entry: AuditLogEntry): Promise<void> {
    if (!entry?.id) return;

    // Check if device is offline or not authenticated
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || !FirebaseAuthService.isAuthenticated()) {
      this.queuePendingAuditLog(entry);
      return;
    }

    try {
      const sanitized = sanitizeForFirestore({
        ...entry,
        expireAt: entry.expireAt || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        syncedAt: new Date().toISOString()
      });

      // Target immutable collection activityLogs as well as auditLogs
      const activityDocRef = doc(db, 'activityLogs', entry.id);
      const auditDocRef = doc(db, 'auditLogs', entry.id);

      await Promise.allSettled([
        setDoc(activityDocRef, sanitized),
        setDoc(auditDocRef, sanitized)
      ]);

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Failed to push activity log directly, queueing in pending_audit_logs:', err?.message || err);
      this.queuePendingAuditLog(entry);
    }
  }

  /**
   * Automatically pushes all queued pending_audit_logs to Firestore once network connection is restored.
   */
  public async flushPendingAuditLogs(): Promise<{ flushed: number; remaining: number }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { flushed: 0, remaining: this.getPendingAuditLogs().length };
    }

    if (!FirebaseAuthService.isAuthenticated()) {
      return { flushed: 0, remaining: this.getPendingAuditLogs().length };
    }

    const pending = this.getPendingAuditLogs();
    if (pending.length === 0) {
      this.updateStatus({ pendingAuditLogsCount: 0 });
      return { flushed: 0, remaining: 0 };
    }

    console.log(`[FirestoreSync] Flushing ${pending.length} queued activity logs to Firestore...`);
    let flushedCount = 0;
    const remaining: AuditLogEntry[] = [];

    for (const log of pending) {
      try {
        const sanitized = sanitizeForFirestore({
          ...log,
          expireAt: log.expireAt || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          syncedAt: new Date().toISOString()
        });

        const activityDocRef = doc(db, 'activityLogs', log.id);
        const auditDocRef = doc(db, 'auditLogs', log.id);

        await Promise.allSettled([
          setDoc(activityDocRef, sanitized),
          setDoc(auditDocRef, sanitized)
        ]);

        flushedCount++;
      } catch (err: any) {
        // If document already exists and immutability blocks update, consider document persisted
        if (err?.code === 'permission-denied' && (err?.message?.includes('update') || err?.message?.includes('write'))) {
          flushedCount++;
        } else {
          console.warn(`[FirestoreSync] Could not flush queued log ${log.id}, keeping in queue:`, err?.message || err);
          remaining.push(log);
        }
      }
    }

    this.savePendingAuditLogs(remaining);
    this.updateStatus({ 
      pendingAuditLogsCount: remaining.length,
      lastSyncedAt: flushedCount > 0 ? new Date() : this.status.lastSyncedAt,
      error: null 
    });

    if (flushedCount > 0) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mobileshop_pending_audit_flushed', { 
          detail: { flushed: flushedCount, remaining: remaining.length } 
        }));
      }
      console.log(`[FirestoreSync] Successfully flushed ${flushedCount} pending audit logs to Firestore. (${remaining.length} remaining)`);
    }

    return { flushed: flushedCount, remaining: remaining.length };
  }

  public async syncAuditLogs(logs: AuditLogEntry[]): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logs.slice(0, 50).forEach(l => this.queuePendingAuditLog(l));
      return;
    }

    if (!FirebaseAuthService.isAuthenticated()) {
      logs.slice(0, 50).forEach(l => this.queuePendingAuditLog(l));
      return;
    }

    try {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
        const chunk = logs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const item of chunk) {
          if (!item?.id) continue;
          const sanitized = sanitizeForFirestore({
            ...item,
            expireAt: item.expireAt || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            syncedAt: new Date().toISOString()
          });
          const actRef = doc(db, 'activityLogs', item.id);
          const audRef = doc(db, 'auditLogs', item.id);
          batch.set(actRef, sanitized);
          batch.set(audRef, sanitized);
        }
        await batch.commit();
      }
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] syncAuditLogs encountered error, saving to pending_audit_logs queue:', err?.message || err);
      logs.slice(0, 50).forEach(l => this.queuePendingAuditLog(l));
    }
  }

  public async syncAnnouncements(announcements: Announcement[]): Promise<void> {
    await this.batchWriteCollection('announcements', announcements, a => a.id);
  }

  public async syncChatChannels(channels: ChatChannel[]): Promise<void> {
    await this.batchWriteCollection('chatChannels', channels, c => c.id);
  }

  public async syncChatMessages(messages: ChatMessage[]): Promise<void> {
    await this.batchWriteCollection('chatMessages', messages, m => m.id);
  }

  public async syncPersonalWallets(wallets: PersonalWallet[]): Promise<void> {
    await this.batchWriteCollection('personalWallets', wallets, w => w.id);
  }

  public async syncPersonalTransactions(txs: PersonalTransaction[]): Promise<void> {
    await this.batchWriteCollection('personalTransactions', txs, t => t.id);
  }

  public async syncPersonalBudgets(budgets: PersonalBudget[]): Promise<void> {
    await this.batchWriteCollection('personalBudgets', budgets, b => b.id);
  }

  public async syncPersonalGoals(goals: PersonalSavingsGoal[]): Promise<void> {
    await this.batchWriteCollection('personalGoals', goals, g => g.id);
  }

  public async syncPersonalDebts(debts: PersonalDebtIOU[]): Promise<void> {
    await this.batchWriteCollection('personalDebts', debts, d => d.id);
  }

  public async syncFacebookPosts(posts: FacebookAdPostRecord[]): Promise<void> {
    await this.batchWriteCollection('facebookPosts', posts, p => p.id);
  }

  // ==========================================
  // BATCH BULK ACTIONS (MANUAL PUSH / PULL)
  // ==========================================

  private async batchWriteCollection<T>(
    collectionName: string,
    items: T[],
    getId: (item: T) => string
  ): Promise<number> {
    if (!items || items.length === 0) return 0;
    
    const CHUNK_SIZE = 400; // Well within Firestore 500 operation limit
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const docId = getId(item);
        if (!docId) continue;
        const ref = doc(db, collectionName, String(docId));
        batch.set(ref, sanitizeForFirestore({
          ...item,
          syncedAt: new Date().toISOString(),
        }), { merge: true });
      }
      await batch.commit();
    }
    return items.length;
  }

  /**
   * Pushes ALL 25 local storage collections to Firestore database
   */
  public async pushAllToFirestore(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!FirebaseAuthService.isAuthenticated()) {
      return { success: false, message: 'Must be authenticated with Firebase to sync.' };
    }

    this.updateStatus({ isSyncing: true, error: null });

    try {
      const settings = StorageService.getSettings();
      const products = StorageService.getProducts();
      const sales = StorageService.getSales();
      const creditSales = StorageService.getCreditSales();
      const purchases = StorageService.getPurchases();
      const customers = StorageService.getCustomers();
      const expenses = StorageService.getExpenses();
      const expenseCategories = StorageService.getExpenseCategories();
      const suppliers = StorageService.getSuppliers();
      const staffUsers = StorageService.getStaffUsers();
      const rolePermissions = StorageService.getRolePermissions();
      const cashDrawer = StorageService.getCashDrawer();
      const preOrders = StorageService.getPreOrders();
      const stockAdjustments = StorageService.getStockAdjustments();
      const priceChanges = StorageService.getPriceChanges();
      const stockAudits = StorageService.getStockAudits();
      const damageLogs = StorageService.getDamageLogs();
      const announcements = StorageService.getAnnouncements();
      const chatChannels = StorageService.getChatChannels();
      const chatMessages = StorageService.getChatMessages();
      const personalWallets = StorageService.getPersonalWallets();
      const personalTransactions = StorageService.getPersonalTransactions();
      const personalBudgets = StorageService.getPersonalBudgets();
      const personalGoals = StorageService.getPersonalSavingsGoals();
      const personalDebts = StorageService.getPersonalDebts();
      const facebookPosts = StorageService.getFacebookPosts();

      // 1. Settings (Global doc)
      await setDoc(doc(db, 'settings', 'global'), sanitizeForFirestore({
        ...settings,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      // 2. Expense Categories (Global doc)
      await setDoc(doc(db, 'expenseCategories', 'global'), sanitizeForFirestore({
        categories: expenseCategories,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      // 3. Role Permissions (Global doc)
      await setDoc(doc(db, 'rolePermissions', 'global'), sanitizeForFirestore({
        permissions: rolePermissions,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      // 4. Cash Drawer (Current doc)
      await setDoc(doc(db, 'cashDrawer', 'current'), sanitizeForFirestore({
        ...cashDrawer,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      // 5. Batch writes for collections
      await this.batchWriteCollection('products', products, p => p.id);
      await this.batchWriteCollection('sales', sales, s => s.id);
      await this.batchWriteCollection('creditSales', creditSales, cs => cs.id);
      await this.batchWriteCollection('purchases', purchases, p => p.id);
      await this.batchWriteCollection('customers', customers, c => c.id);
      await this.batchWriteCollection('expenses', expenses, e => e.id);
      await this.batchWriteCollection('suppliers', suppliers, s => s.id);
      await this.batchWriteCollection('staffUsers', staffUsers, u => u.id);
      await this.batchWriteCollection('preOrders', preOrders, po => po.id);
      await this.batchWriteCollection('stockAdjustments', stockAdjustments, sa => sa.id);
      await this.batchWriteCollection('priceChanges', priceChanges, pc => pc.id);
      await this.batchWriteCollection('stockAudits', stockAudits, sa => sa.id);
      await this.batchWriteCollection('damageLogs', damageLogs, dl => dl.id);
      await this.batchWriteCollection('announcements', announcements, a => a.id);
      await this.batchWriteCollection('chatChannels', chatChannels, cc => cc.id);
      await this.batchWriteCollection('chatMessages', chatMessages, cm => cm.id);
      await this.batchWriteCollection('personalWallets', personalWallets, pw => pw.id);
      await this.batchWriteCollection('personalTransactions', personalTransactions, pt => pt.id);
      await this.batchWriteCollection('personalBudgets', personalBudgets, pb => pb.id);
      await this.batchWriteCollection('personalGoals', personalGoals, pg => pg.id);
      await this.batchWriteCollection('personalDebts', personalDebts, pd => pd.id);
      await this.batchWriteCollection('facebookPosts', facebookPosts, fp => fp.id);
      const auditLogs = StorageService.getAuditLogs();
      await this.batchWriteCollection('auditLogs', auditLogs, al => al.id);

      const totalCount = products.length + sales.length + creditSales.length + purchases.length +
        customers.length + expenses.length + suppliers.length + staffUsers.length + preOrders.length +
        stockAdjustments.length + priceChanges.length + stockAudits.length + damageLogs.length +
        announcements.length + chatMessages.length + personalWallets.length + personalTransactions.length + auditLogs.length;

      this.updateStatus({ 
        isSyncing: false, 
        lastSyncedAt: new Date(), 
        isConnected: true, 
        error: null 
      });

      return { 
        success: true, 
        message: `Successfully synchronized all collections to Firestore! (${totalCount} total documents across 25 database collections: ${products.length} products, ${sales.length} sales, ${creditSales.length} credit sales, ${purchases.length} purchases, ${customers.length} customers, ${expenses.length} expenses, ${preOrders.length} pre-orders, ${staffUsers.length} staff, ${suppliers.length} suppliers)` 
      };
    } catch (err: any) {
      console.error('[FirestoreSync] Push failed:', err);
      this.updateStatus({ isSyncing: false, error: err.message });
      return { success: false, message: err.message || 'Failed to sync with Firebase' };
    }
  }

  /**
   * Clears test and demo transactional data from Firestore while preserving
   * store settings, expense categories, role permissions, and staff accounts.
   */
  public async clearFirestoreTestData(): Promise<{ success: boolean; deletedCount: number; message: string }> {
    if (!FirebaseAuthService.isAuthenticated()) {
      return { success: false, deletedCount: 0, message: 'Not authenticated with Firebase. Please sign in to clear cloud database.' };
    }

    this.updateStatus({ isSyncing: true, error: null });

    const collectionsToClear = [
      'products',
      'sales',
      'creditSales',
      'purchases',
      'customers',
      'suppliers',
      'expenses',
      'preOrders',
      'stockAdjustments',
      'priceChanges',
      'stockAudits',
      'damageLogs',
      'chatMessages',
      'personalWallets',
      'personalTransactions',
      'personalBudgets',
      'personalGoals',
      'personalDebts',
      'facebookPosts',
    ];

    try {
      let totalDeleted = 0;
      this.isProcessingRemoteSnapshot = true;

      for (const colName of collectionsToClear) {
        try {
          const snap = await getDocs(collection(db, colName));
          if (!snap.empty) {
            const docs = snap.docs;
            const CHUNK_SIZE = 400;
            for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
              const chunk = docs.slice(i, i + CHUNK_SIZE);
              const batch = writeBatch(db);
              chunk.forEach(d => batch.delete(d.ref));
              await batch.commit();
              totalDeleted += chunk.length;
            }
          }
        } catch (colErr: any) {
          console.warn(`[FirestoreSync] Error clearing collection ${colName}:`, colErr?.message || colErr);
        }
      }

      // Reset cash drawer doc in Firestore to zeroed closed state
      try {
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
        await setDoc(doc(db, 'cashDrawer', 'current'), sanitizeForFirestore({
          ...cleanDrawer,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (drawerErr) {
        console.warn('[FirestoreSync] Error resetting cash drawer in Firestore:', drawerErr);
      }

      // Ensure preserved settings, staff accounts, permissions & expense categories stay synced
      const settings = StorageService.getSettings();
      const staffUsers = StorageService.getStaffUsers();
      const rolePerms = StorageService.getRolePermissions();
      const expenseCats = StorageService.getExpenseCategories();

      await setDoc(doc(db, 'settings', 'global'), sanitizeForFirestore({
        ...settings,
        isFreshDatabase: true,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      await setDoc(doc(db, 'expenseCategories', 'global'), sanitizeForFirestore({
        categories: expenseCats,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      await setDoc(doc(db, 'rolePermissions', 'global'), sanitizeForFirestore({
        permissions: rolePerms,
        lastSyncedAt: new Date().toISOString(),
      }), { merge: true });

      await this.batchWriteCollection('staffUsers', staffUsers, u => u.id);

      // Seed initialization log in auditLogs
      const auditLog = StorageService.getAuditLogs();
      if (auditLog.length > 0) {
        await this.batchWriteCollection('auditLogs', auditLog, al => al.id);
      }

      this.isProcessingRemoteSnapshot = false;
      this.updateStatus({ 
        isSyncing: false, 
        lastSyncedAt: new Date(), 
        isConnected: true, 
        error: null 
      });

      return {
        success: true,
        deletedCount: totalDeleted,
        message: `Successfully wiped ${totalDeleted} test documents from Firestore. Store profile and admin accounts remain intact.`
      };
    } catch (err: any) {
      this.isProcessingRemoteSnapshot = false;
      console.error('[FirestoreSync] Clear test data failed:', err);
      this.updateStatus({ isSyncing: false, error: err?.message || 'Failed to clear Firestore' });
      return { success: false, deletedCount: 0, message: err?.message || 'Error clearing Firestore collections' };
    }
  }

  /**
   * Pulls remote data from ALL collections in Firestore to local storage
   */
  public async pullAllFromFirestore(): Promise<{ success: boolean; count: number; details?: any }> {
    if (!FirebaseAuthService.isAuthenticated()) {
      return { success: false, count: 0 };
    }

    this.updateStatus({ isSyncing: true, error: null });

    try {
      let count = 0;
      this.isProcessingRemoteSnapshot = true;

      // 1. Pull Settings
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
        if (settingsSnap.exists()) {
          const remoteSettings = settingsSnap.data() as ShopSettings;
          if (remoteSettings && remoteSettings.shopName) {
            const current = StorageService.getSettings();
            const merged = this.mergeSettingsSafely(current, remoteSettings);
            StorageService.saveSettings(merged, false);
            count += 1;
          }
        }
      } catch (err) {
        console.warn('[FirestoreSync] Settings pull:', err);
      }

      // 2. Pull Expense Categories
      try {
        const catSnap = await getDoc(doc(db, 'expenseCategories', 'global'));
        if (catSnap.exists()) {
          const categories = catSnap.data()?.categories as ExpenseCategoryItem[];
          if (Array.isArray(categories)) {
            StorageService.saveExpenseCategories(categories);
            count += categories.length;
          }
        }
      } catch (err) {
        console.warn('[FirestoreSync] Expense categories pull:', err);
      }

      // 3. Pull Role Permissions
      try {
        const permSnap = await getDoc(doc(db, 'rolePermissions', 'global'));
        if (permSnap.exists()) {
          const perms = permSnap.data()?.permissions as Record<any, any>;
          if (perms) {
            StorageService.saveRolePermissions(perms);
            count += 1;
          }
        }
      } catch (err) {
        console.warn('[FirestoreSync] Role permissions pull:', err);
      }

      // 4. Pull Cash Drawer
      try {
        const drawerSnap = await getDoc(doc(db, 'cashDrawer', 'current'));
        if (drawerSnap.exists()) {
          const remoteDrawer = drawerSnap.data() as CashDrawerRecord;
          if (remoteDrawer && (remoteDrawer.openingFloat !== undefined || remoteDrawer.status !== undefined)) {
            StorageService.saveCashDrawer(remoteDrawer);
            count += 1;
          }
        }
      } catch (err) {
        console.warn('[FirestoreSync] Cash drawer pull:', err);
      }

      // Helper for collection pulls - strictly replaces local state
      const pullCollection = async <T>(
        colName: string, 
        saver: (items: T[]) => void
      ) => {
        try {
          const snap = await getDocs(collection(db, colName));
          const items: T[] = [];
          if (!snap.empty) {
            snap.forEach(d => {
              const data = d.data() as T;
              if (data) {
                if (typeof data === 'object' && !(data as any).id) {
                  (data as any).id = d.id;
                }
                items.push(data);
              }
            });
          }
          // Strictly replace local state with items (even if empty [])
          saver(items);
          count += items.length;
        } catch (err) {
          console.warn(`[FirestoreSync] ${colName} pull:`, err);
        }
      };

      // Pull all remaining collections - strictly replacing local state with fetched data
      await pullCollection<Product>('products', items => {
        const filtered = items.filter(p => !isMockProduct(p));
        StorageService.saveProducts(filtered);
      });
      await pullCollection<Sale>('sales', items => StorageService.saveSales(items));
      await pullCollection<CreditSaleRecord>('creditSales', items => StorageService.saveCreditSales(items));
      await pullCollection<PurchaseRecord>('purchases', items => StorageService.savePurchases(items));
      await pullCollection<Customer>('customers', items => StorageService.saveCustomers(items));
      await pullCollection<ExpenseRecord>('expenses', items => StorageService.saveExpenses(items));
      await pullCollection<Supplier>('suppliers', items => StorageService.saveSuppliers(items));
      await pullCollection<StaffUser>('staffUsers', items => {
        const clean = items.filter(u => !isMockStaffUser(u));
        if (clean.length > 0) {
          StorageService.saveStaffUsers(clean);
        }
      });
      await pullCollection<PreOrder>('preOrders', items => StorageService.savePreOrders(items));
      await pullCollection<StockAdjustment>('stockAdjustments', items => StorageService.saveStockAdjustments(items));
      await pullCollection<PriceChangeRecord>('priceChanges', items => StorageService.savePriceChanges(items));
      await pullCollection<StockAuditSession>('stockAudits', items => StorageService.saveStockAudits(items));
      await pullCollection<DamageLog>('damageLogs', items => StorageService.saveDamageLogs(items));
      await pullCollection<Announcement>('announcements', items => StorageService.saveAnnouncements(items));
      await pullCollection<ChatChannel>('chatChannels', items => StorageService.saveChatChannels(items));
      await pullCollection<ChatMessage>('chatMessages', items => StorageService.saveChatMessages(items));
      await pullCollection<PersonalWallet>('personalWallets', items => StorageService.savePersonalWallets(items));
      await pullCollection<PersonalTransaction>('personalTransactions', items => StorageService.savePersonalTransactions(items));
      await pullCollection<PersonalBudget>('personalBudgets', items => StorageService.savePersonalBudgets(items));
      await pullCollection<PersonalSavingsGoal>('personalGoals', items => StorageService.savePersonalSavingsGoals(items));
      await pullCollection<PersonalDebtIOU>('personalDebts', items => StorageService.savePersonalDebts(items));
      await pullCollection<FacebookAdPostRecord>('facebookPosts', items => StorageService.saveFacebookPosts(items));
      await pullCollection<AuditLogEntry>('auditLogs', items => StorageService.saveAuditLogs(items));

      this.isProcessingRemoteSnapshot = false;

      this.updateStatus({ 
        isSyncing: false, 
        lastSyncedAt: new Date(), 
        isConnected: true, 
        error: null 
      });

      return { success: true, count };
    } catch (err: any) {
      this.isProcessingRemoteSnapshot = false;
      console.error('[FirestoreSync] Pull failed:', err);
      this.updateStatus({ isSyncing: false, error: err.message });
      return { success: false, count: 0 };
    }
  }
}

export const firestoreSync = FirestoreSyncService.getInstance();
