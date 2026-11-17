import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc,
  deleteDoc,
  deleteField,
  writeBatch, 
  runTransaction,
  increment,
  arrayUnion,
  onSnapshot, 
  query, 
  where,
  limit, 
  Unsubscribe 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FirebaseAuthService } from './firebaseAuthService';
import { 
  StorageService, 
  STORAGE_KEYS, 
  isMockProduct, 
  isMockStaffUser, 
  MOCK_STAFF_IDS,
  isMockPurchase,
  isMockExpense,
  isMockCustomer,
  isMockSupplier,
  isMockAnnouncement,
  isMockStockTransfer,
  isMockCashDrawer,
  isMockAuditLog
} from '../utils/storage';
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
  AuditLogEntry,
  StoreLocation,
  BranchInventory,
  StockTransfer,
  MonthlyCapitalSnapshot,
  CapitalCashTransfer,
  FocDistributionRecord
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
  private productsSyncTimeout: any = null;
  private locationsSyncTimeout: any = null;
  private branchInventorySyncTimeout: any = null;
  private stockTransfersSyncTimeout: any = null;
  private salesSyncTimeout: any = null;
  private purchasesSyncTimeout: any = null;
  private staffUsersSyncTimeout: any = null;
  private adjustmentsSyncTimeout: any = null;
  private isFlushingLogs: boolean = false;
  private hasHydrated: boolean = false;
  private hydrationListeners: Set<(isHydrated: boolean) => void> = new Set();
  private initialCollectionsPending = new Set(['settings', 'staffUsers', 'products']);
  private status: FirestoreSyncStatus = {
    isConnected: false,
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
  };

  public isInitialHydrationComplete(): boolean {
    return this.hasHydrated;
  }

  public onHydrationComplete(cb: (isHydrated: boolean) => void): () => void {
    this.hydrationListeners.add(cb);
    if (this.hasHydrated) {
      setTimeout(() => cb(true), 0);
    }
    return () => {
      this.hydrationListeners.delete(cb);
    };
  }

  public markCollectionHydrated(col: string) {
    this.initialCollectionsPending.delete(col);
    if (this.initialCollectionsPending.size === 0 && !this.hasHydrated) {
      this.hasHydrated = true;
      this.hydrationListeners.forEach(fn => {
        try { fn(true); } catch {}
      });
    }
  }

  public static getInstance(): FirestoreSyncService {
    if (!this.instance) {
      this.instance = new FirestoreSyncService();
    }
    return this.instance;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.registerStorageHooks();

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

      FirebaseAuthService.onAuthChanged((user) => {
        const isAuth = Boolean(user) || FirebaseAuthService.hasFirebaseSession();
        if (isAuth) {
          this.stopPreAuthSync();
          this.updateStatus({ isConnected: true, error: null });
          this.startRealtimeSync();
          // Flush any offline queued activity logs once authenticated
          this.flushPendingAuditLogs();
        } else {
          this.stopRealtimeSync();
          this.updateStatus({ isConnected: false });
          this.markCollectionHydrated('settings');
          this.markCollectionHydrated('products');
          this.markCollectionHydrated('staffUsers');
        }
      });
    }
  }

  /**
   * Connects high-priority local storage hooks directly into Firestore push operations
   */
  private registerStorageHooks() {
    StorageService.setSyncHandler({
      onSaleUpsert: (sale) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncSale(sale);
        }
      },
      onSalesBatch: (sales) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.salesSyncTimeout) clearTimeout(this.salesSyncTimeout);
          this.salesSyncTimeout = setTimeout(() => {
            this.syncSales(sales);
          }, 1500);
        }
      },
      onSaleDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteSale(id);
        }
      },
      onSalesDelete: (ids) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteSales(ids);
        }
      },
      onPurchaseUpsert: (purchase) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncPurchase(purchase);
        }
      },
      onPurchasesBatch: (purchases) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.purchasesSyncTimeout) clearTimeout(this.purchasesSyncTimeout);
          this.purchasesSyncTimeout = setTimeout(() => {
            this.syncPurchases(purchases);
          }, 1500);
        }
      },
      onPurchaseDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deletePurchase(id);
        }
      },
      onCustomerUpsert: (customer) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncCustomer(customer);
        }
      },
      onExpenseUpsert: (expense) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncExpense(expense);
        }
      },
      onExpenseDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteExpense(id);
        }
      },
      onProductUpsert: (product) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncProduct(product);
        }
      },
      onProductPriceUpdate: (productId, sellingPrice, costPrice) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncProductPrice(productId, sellingPrice, costPrice);
        }
      },
      onProductsBatch: (products) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.productsSyncTimeout) clearTimeout(this.productsSyncTimeout);
          this.productsSyncTimeout = setTimeout(() => {
            this.syncProducts(products);
          }, 1200);
        }
      },
      onProductDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteProduct(id);
        }
      },
      onSettingsUpsert: (settings) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncSettings(settings);
        }
      },
      onSupplierUpsert: (supplier) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncSupplier(supplier);
        }
      },
      onStaffUserUpsert: (staff) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncStaffUser(staff);
        }
      },
      onStaffUsersBatch: (staffList) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.staffUsersSyncTimeout) clearTimeout(this.staffUsersSyncTimeout);
          this.staffUsersSyncTimeout = setTimeout(() => {
            this.syncStaffUsers(staffList);
          }, 1500);
        }
      },
      onStaffUserDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteStaffUser(id);
        }
      },
      onLocationsBatch: (locations) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.locationsSyncTimeout) clearTimeout(this.locationsSyncTimeout);
          this.locationsSyncTimeout = setTimeout(() => {
            this.syncLocations(locations);
          }, 1500);
        }
      },
      onLocationDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteLocation(id);
        }
      },
      onBranchInventoryBatch: (inventory) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.branchInventorySyncTimeout) clearTimeout(this.branchInventorySyncTimeout);
          this.branchInventorySyncTimeout = setTimeout(() => {
            this.syncBranchInventoryList(inventory);
          }, 1500);
        }
      },
      onStockTransfersBatch: (transfers) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.stockTransfersSyncTimeout) clearTimeout(this.stockTransfersSyncTimeout);
          this.stockTransfersSyncTimeout = setTimeout(() => {
            this.syncStockTransfers(transfers);
          }, 1500);
        }
      },
      onStockAdjustmentUpsert: (adjustment) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncStockAdjustment(adjustment);
        }
      },
      onStockAdjustmentsBatch: (adjustments) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          if (this.adjustmentsSyncTimeout) clearTimeout(this.adjustmentsSyncTimeout);
          this.adjustmentsSyncTimeout = setTimeout(() => {
            this.syncStockAdjustments(adjustments);
          }, 1200);
        }
      },
      onMonthlyCapitalSnapshotUpsert: (snapshot) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncMonthlyCapitalSnapshot(snapshot);
        }
      },
      onCashTransfersBatch: (transfers) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncCashTransfers(transfers);
        }
      },
      onFocDistributionUpsert: (record) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncFocDistribution(record);
        }
      },
      onFocDistributionDelete: (id) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.deleteFocDistribution(id);
        }
      },
      onStockTransferDeviceSync: (params) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncStockTransferDeviceUnits(params);
        }
      },
      onAuditLogUpsert: (entry) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.pushActivityLog(entry);
        }
      },
      onCashDrawerShiftClosed: (shift) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncClosedCashDrawerShift(shift);
        }
      },
      onCashDrawerEntryAdded: (params) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncCashDrawerEntry(params);
        }
      },
      onSocialMarketingStateUpsert: (state) => {
        if (!this.isSyncPaused && !this.isProcessingRemoteSnapshot && FirebaseAuthService.isAuthenticated()) {
          this.syncSocialMarketingState(state);
        }
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
      // Preserve local terminal session identity so remote changes do not clobber this terminal's active user
      currentStaffId: current.currentStaffId,
      currentStaffName: current.currentStaffName,
      currentStaffRole: current.currentStaffRole,
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
    if (!FirebaseAuthService.hasFirebaseSession()) {
      return;
    }
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
                pin: '',
                password: undefined,
                credentialHash: data.credentialHash,
                credentialSalt: data.credentialSalt,
                credentialIterations: data.credentialIterations,
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
              StorageService.saveStaffUsers(cleanMerged, false);
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
              StorageService.saveSettings(merged, false);
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

    if (!FirebaseAuthService.hasFirebaseSession()) {
      this.markCollectionHydrated('settings');
      this.markCollectionHydrated('products');
      this.markCollectionHydrated('staffUsers');
      return;
    }

    try {
      // Offline fallback timer: ensure UI unblocks after 2.5s even if network is offline
      setTimeout(() => {
        this.markCollectionHydrated('settings');
        this.markCollectionHydrated('products');
        this.markCollectionHydrated('staffUsers');
      }, 2500);

      // Purge any residual mock data and migrate any legacy plaintext staff PINs/passwords to PBKDF2 + deleteField() (R3)
      this.purgeAllRemoteMockData().catch(() => {});
      this.migrateStaffPlaintextCredentials().catch(() => {});
      this.replayPendingSales().catch(() => {});
      this.replayPendingOfflineRefunds().catch(() => {});

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
              this.markCollectionHydrated('settings');
            }
          } else {
            this.markCollectionHydrated('settings');
          }
        } else {
          this.markCollectionHydrated('settings');
        }
      }, (err) => {
        console.warn('[FirestoreSync] Settings listener:', err.message);
        this.markCollectionHydrated('settings');
      });
      this.unsubscribers.push(unsubSettings);

      // 2. Products Listener - handles 'removed' changes, expunges locally deleted tombstones, and preserves recent local sales
      const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const deletedProductIds = new Set(StorageService.getDeletedProductIds());
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
              const data = change.doc.data() as Product | undefined;
              if (data?.id) removedIds.add(data.id);
            }
          });

          if (snap.empty) {
            const currentLocal = StorageService.getProducts();
            if (currentLocal.length > 0 && !StorageService.isFreshDatabase()) {
              this.syncProducts(currentLocal).catch(() => {});
            } else {
              StorageService.saveProducts([], false);
            }
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteProducts: Product[] = [];
          snap.forEach(d => {
            const data = d.data() as Product;
            const prodId = data?.id || d.id;
            if (data && isMockProduct(data)) {
              deleteDoc(doc(db, 'products', d.id)).catch(() => {});
            } else if ((data as any)?.archived === true) {
              // Archived products remain in Firestore for historical invoice/PO integrity but are excluded from active catalog
            } else if (deletedProductIds.has(prodId) || deletedProductIds.has(d.id)) {
              // Soft-archive deleted product in Firestore if not already archived
              setDoc(doc(db, 'products', d.id), { archived: true, deletedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteProducts.push({
                ...data,
                id: prodId,
              });
            }
          });

          // Cloud snapshot is authoritative for inventory and catalog
          StorageService.saveProducts(remoteProducts, false);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Products listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
          this.markCollectionHydrated('products');
        }
      }, (err) => {
        console.warn('[FirestoreSync] Products listener:', err.message);
        this.markCollectionHydrated('products');
      });
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
            const currentLocal = StorageService.getSales();
            if (currentLocal.length > 0 && !StorageService.isFreshDatabase()) {
              this.syncSales(currentLocal).catch(() => {});
            } else {
              StorageService.saveSales([], false);
            }
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteSales: Sale[] = [];
          const mockIdsToDelete: string[] = [];
          const MOCK_IDS = new Set(['sale-1', 'sale-2', 'sale-3', 'sale-4', 'sale-5', 'sale-6']);

          snap.forEach(d => {
            const data = d.data() as Sale;
            if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              const saleId = data.id || d.id;
              const isMock = MOCK_IDS.has(saleId) ||
                MOCK_IDS.has(d.id) ||
                (data.soldBy && data.soldBy.includes('Ko Min Thu') && (saleId.startsWith('sale-') || d.id.startsWith('sale-')));
              
              if (isMock) {
                mockIdsToDelete.push(d.id);
                if (data.id && data.id !== d.id) mockIdsToDelete.push(data.id);
              } else if (!(data as any).archived && (data as any).status !== 'voided') {
                remoteSales.push({ ...data, id: saleId });
              }
            }
          });

          // Note: Sales are immutable in Firestore (R4: allow delete: if false); mock sales are filtered out in-memory above without issuing forbidden deleteDoc calls.

          // Preserve any offline-created local sales with syncState === 'pending' or 'conflict' and replay pending sales atomically (R4)
          const remoteIdSet = new Set(remoteSales.map(s => s.id));
          const localPendingSales = StorageService.getSales().filter(
            ls => ls && ls.id && (ls.syncState === 'pending' || ls.syncState === 'conflict') && !remoteIdSet.has(ls.id) && !removedIds.has(ls.id)
          );
          if (localPendingSales.length > 0) {
            for (const pendingSale of localPendingSales) {
              remoteSales.push(pendingSale);
            }
            if (
              localPendingSales.some(s => s.syncState === 'pending') &&
              typeof navigator !== 'undefined' &&
              navigator.onLine &&
              FirebaseAuthService.isAuthenticated()
            ) {
              this.replayPendingSales().catch(() => {});
            }
          }

          remoteSales.sort((a, b) => {
            const timeA = new Date(a.date || (a as any).createdAt || 0).getTime();
            const timeB = new Date(b.date || (b as any).createdAt || 0).getTime();
            return timeB - timeA;
          });

          StorageService.saveSales(remoteSales, false);
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Sales listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Sales listener:', err.message));
      this.unsubscribers.push(unsubSales);

      // 3b. Offline Sale Conflicts Listener - keeps Manager Review Queue synchronized across terminals
      const unsubOfflineConflicts = onSnapshot(collection(db, 'offlineSaleConflicts'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const remoteConflicts: Sale[] = [];
          snap.forEach(d => {
            const data = d.data() as Sale;
            if (data && (data as any).status !== 'voided') {
              remoteConflicts.push({
                ...data,
                id: data.id || d.id,
                syncState: 'conflict',
              });
            }
          });
          StorageService.saveOfflineSaleConflicts(remoteConflicts);
        } catch (err: any) {
          console.warn('[FirestoreSync] OfflineSaleConflicts listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] OfflineSaleConflicts listener:', err.message));
      this.unsubscribers.push(unsubOfflineConflicts);

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
            const currentLocal = StorageService.getCreditSales();
            if (currentLocal.length === 0 || StorageService.isFreshDatabase()) {
              StorageService.saveCreditSales([], false);
            }
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

          StorageService.saveCreditSales(remoteCreditSales, false);
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
            const currentLocal = StorageService.getPurchases();
            const cleanLocal = currentLocal.filter(p => !isMockPurchase(p));
            if (cleanLocal.length > 0 && !StorageService.isFreshDatabase()) {
              this.syncPurchases(cleanLocal).catch(() => {});
            } else {
              StorageService.savePurchases([], false);
            }
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remotePurchases: PurchaseRecord[] = [];
          const mockPurchaseDocsToDelete: string[] = [];

          snap.forEach(d => {
            const data = d.data() as PurchaseRecord;
            const poId = data?.id || d.id;
            if (data && (isMockPurchase(data) || isMockPurchase({ id: d.id, ...data }))) {
              mockPurchaseDocsToDelete.push(d.id);
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remotePurchases.push({ ...data, id: poId });
            }
          });

          if (mockPurchaseDocsToDelete.length > 0) {
            mockPurchaseDocsToDelete.forEach(id => deleteDoc(doc(db, 'purchases', id)).catch(() => {}));
          }

          StorageService.savePurchases(remotePurchases, false);
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
            StorageService.saveCustomers([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteCustomers: Customer[] = [];
          const mockCustDocsToDelete: string[] = [];

          snap.forEach(d => {
            const data = d.data() as Customer;
            const custId = data?.id || d.id;
            if (data && (isMockCustomer(data) || isMockCustomer({ id: d.id, ...data }))) {
              mockCustDocsToDelete.push(d.id);
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteCustomers.push({ ...data, id: custId });
            }
          });

          if (mockCustDocsToDelete.length > 0) {
            mockCustDocsToDelete.forEach(id => deleteDoc(doc(db, 'customers', id)).catch(() => {}));
          }

          StorageService.saveCustomers(remoteCustomers, false);
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
            const currentLocal = StorageService.getExpenses();
            const cleanLocal = currentLocal.filter(e => !isMockExpense(e));
            if (cleanLocal.length > 0 && !StorageService.isFreshDatabase()) {
              this.syncExpenses(cleanLocal).catch(() => {});
            } else {
              StorageService.saveExpenses([], false);
            }
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteExpenses: ExpenseRecord[] = [];
          const mockExpenseDocsToDelete: string[] = [];

          snap.forEach(d => {
            const data = d.data() as ExpenseRecord;
            const expId = data?.id || d.id;
            if (data && (isMockExpense(data) || isMockExpense({ id: d.id, ...data }))) {
              mockExpenseDocsToDelete.push(d.id);
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteExpenses.push({ ...data, id: expId });
            }
          });

          if (mockExpenseDocsToDelete.length > 0) {
            mockExpenseDocsToDelete.forEach(id => deleteDoc(doc(db, 'expenses', id)).catch(() => {}));
          }

          StorageService.saveExpenses(remoteExpenses, false);
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
              StorageService.saveExpenseCategories(categories, false);
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
            StorageService.saveSuppliers([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteSuppliers: Supplier[] = [];
          const mockSupplierDocsToDelete: string[] = [];

          snap.forEach(d => {
            const data = d.data() as Supplier;
            const supId = data?.id || d.id;
            if (data && (isMockSupplier(data) || isMockSupplier({ id: d.id, ...data }))) {
              mockSupplierDocsToDelete.push(d.id);
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteSuppliers.push({ ...data, id: supId });
            }
          });

          if (mockSupplierDocsToDelete.length > 0) {
            mockSupplierDocsToDelete.forEach(id => deleteDoc(doc(db, 'suppliers', id)).catch(() => {}));
          }

          StorageService.saveSuppliers(remoteSuppliers, false);
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

          const localStaffMap = new Map(StorageService.getStaffUsers().map(u => [u.id, u]));
          const remoteStaff: StaffUser[] = [];
          snap.forEach(d => {
            const data = d.data() as StaffUser;
            if (data && !isMockStaffUser(data) && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              const staffId = data.id || d.id;
              const existingLocal = localStaffMap.get(staffId);
              remoteStaff.push({
                ...data,
                id: staffId,
                pin: '',
                password: undefined,
                credentialHash: data.credentialHash || existingLocal?.credentialHash,
                credentialSalt: data.credentialSalt || existingLocal?.credentialSalt,
                credentialIterations: data.credentialIterations || existingLocal?.credentialIterations,
              });
            } else if (data && isMockStaffUser(data)) {
              deleteDoc(d.ref).catch(() => {});
            }
          });

          if (remoteStaff.length > 0) {
            StorageService.saveStaffUsers(remoteStaff, false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Staff listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
          this.markCollectionHydrated('staffUsers');
        }
      }, (err) => {
        console.warn('[FirestoreSync] Staff listener:', err.message);
        this.markCollectionHydrated('staffUsers');
      });
      this.unsubscribers.push(unsubStaff);

      // 11. Role Permissions Listener
      const unsubRolePerms = onSnapshot(doc(db, 'rolePermissions', 'global'), (snap) => {
        if (snap.exists()) {
          const perms = snap.data()?.permissions as Record<any, any>;
          if (perms) {
            this.isProcessingRemoteSnapshot = true;
            try {
              StorageService.saveRolePermissions(perms, false);
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
          if (isMockCashDrawer(remoteDrawer)) {
            const cleanDrawer = StorageService.getCashDrawer();
            setDoc(doc(db, 'cashDrawer', 'current'), cleanDrawer).catch(() => {});
          } else if (remoteDrawer && (remoteDrawer.openingFloat !== undefined || remoteDrawer.status !== undefined)) {
            this.isProcessingRemoteSnapshot = true;
            try {
              StorageService.saveCashDrawer(remoteDrawer, false);
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
            const currentLocal = StorageService.getPreOrders();
            if (currentLocal.length === 0 || StorageService.isFreshDatabase()) {
              StorageService.savePreOrders([], false);
            }
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

          StorageService.savePreOrders(remotePreOrders, false);
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
            const currentLocal = StorageService.getStockAdjustments();
            if (currentLocal.length > 0) {
              this.syncStockAdjustments(currentLocal).catch(() => {});
            } else {
              StorageService.saveStockAdjustments([], false);
            }
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

          // Smart merge: preserve any local adjustments that haven't pushed yet
          const currentLocal = StorageService.getStockAdjustments();
          const mergedMap = new Map<string, StockAdjustment>();
          remoteAdjs.forEach(adj => mergedMap.set(adj.id, adj));
          currentLocal.forEach(adj => {
            if (!removedIds.has(adj.id) && !mergedMap.has(adj.id)) {
              mergedMap.set(adj.id, adj);
              this.syncStockAdjustment(adj).catch(() => {});
            }
          });

          const finalAdjs = Array.from(mergedMap.values()).sort((a, b) => {
            const timeA = new Date(a.timestamp || (a as any).createdAt || 0).getTime();
            const timeB = new Date(b.timestamp || (b as any).createdAt || 0).getTime();
            return timeB - timeA;
          });

          StorageService.saveStockAdjustments(finalAdjs, false);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobileshop_data_updated', {
              detail: { key: 'STOCK_ADJUSTMENTS', timestamp: Date.now() }
            }));
          }
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
            StorageService.savePriceChanges([], false);
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

          StorageService.savePriceChanges(remotePcs, false);
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
            StorageService.saveStockAudits([], false);
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

          StorageService.saveStockAudits(remoteAudits, false);
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
            StorageService.saveDamageLogs([], false);
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

          StorageService.saveDamageLogs(remoteDamage, false);
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
            StorageService.saveAnnouncements([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteAnnounce: Announcement[] = [];
          const mockAnnounceToDelete: string[] = [];

          snap.forEach(d => {
            const data = d.data() as Announcement;
            if (data && (isMockAnnouncement(data) || isMockAnnouncement({ id: d.id, ...data }))) {
              mockAnnounceToDelete.push(d.id);
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteAnnounce.push({ ...data, id: data.id || d.id });
            }
          });

          if (mockAnnounceToDelete.length > 0) {
            mockAnnounceToDelete.forEach(id => deleteDoc(doc(db, 'announcements', id)).catch(() => {}));
          }

          StorageService.saveAnnouncements(remoteAnnounce, false);
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
            StorageService.saveChatMessages([], false);
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

          StorageService.saveChatMessages(remoteChat, false);
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
            StorageService.saveAuditLogs([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
            return;
          }

          const remoteLogs: AuditLogEntry[] = [];
          const mockAuditLogsToDelete: string[] = [];

          snap.forEach(d => {
            const data = d.data() as AuditLogEntry;
            if (data && (isMockAuditLog(data) || isMockAuditLog({ id: d.id, ...data }))) {
              mockAuditLogsToDelete.push(d.id);
            } else if (data && !removedIds.has(d.id) && !removedIds.has(data.id)) {
              remoteLogs.push({ ...data, id: data.id || d.id });
            }
          });

          // Note: Audit logs are append-only in Firestore (allow delete: if false); mock logs are filtered out in-memory above.

          StorageService.saveAuditLogs(remoteLogs, false);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobileshop_data_updated', {
              detail: { key: 'AUDIT_LOGS', timestamp: Date.now() }
            }));
          }
          this.updateStatus({ lastSyncedAt: new Date(), error: null });
        } catch (err: any) {
          console.warn('[FirestoreSync] Audit logs listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Audit logs listener:', err.message));
      this.unsubscribers.push(unsubAudit);

      // 21. Locations & Warehouses Listener
      const unsubLocations = onSnapshot(collection(db, 'locations'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          const deletedLocIds = new Set(StorageService.getDeletedLocationIds());
          const removedIds = new Set<string>();
          snap.docChanges().forEach(change => {
            if (change.type === 'removed') {
              removedIds.add(change.doc.id);
            }
          });

          if (!snap.empty) {
            const remoteLocs: StoreLocation[] = [];
            snap.forEach(d => {
              const data = d.data() as StoreLocation;
              const locId = data?.id || d.id;
              if (deletedLocIds.has(locId) || deletedLocIds.has(d.id)) {
                // Expunge ghost location from Firestore if it was deleted locally
                deleteDoc(doc(db, 'locations', d.id)).catch(() => {});
              } else if (data && !removedIds.has(d.id) && !removedIds.has(locId)) {
                remoteLocs.push({ ...data, id: locId });
              }
            });
            if (remoteLocs.length > 0) {
              StorageService.saveLocations(remoteLocs, false);
            }
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Locations listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Locations listener warning:', err.message));
      this.unsubscribers.push(unsubLocations);

      // 22. Branch Inventory Localized Stock Ledger Listener
      const unsubBranchInv = onSnapshot(collection(db, 'branch_inventory'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          if (!snap.empty) {
            const remoteInv: BranchInventory[] = [];
            snap.forEach(d => {
              const data = d.data() as BranchInventory;
              if (data) remoteInv.push({ ...data, id: data.id || d.id });
            });
            StorageService.saveBranchInventoryList(remoteInv, false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Branch inventory listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Branch inventory listener warning:', err.message));
      this.unsubscribers.push(unsubBranchInv);

      // 23. Inter-Branch Stock Transfers Listener
      const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          if (!snap.empty) {
            const remoteTransfers: StockTransfer[] = [];
            snap.forEach(d => {
              const data = d.data() as StockTransfer;
              if (data && (isMockStockTransfer(data) || isMockStockTransfer({ id: d.id, ...data }))) {
                deleteDoc(d.ref).catch(() => {});
              } else if (data) {
                remoteTransfers.push({ ...data, id: data.id || d.id });
              }
            });
            StorageService.saveStockTransfers(remoteTransfers, false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          } else {
            StorageService.saveStockTransfers([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Stock transfers listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Stock transfers listener warning:', err.message));
      this.unsubscribers.push(unsubTransfers);

      // 24. Monthly Capital Snapshots Listener (H12)
      const unsubCapitalSnapshots = onSnapshot(collection(db, 'monthlyCapitalSnapshots'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          if (!snap.empty) {
            const remoteMap: Record<string, MonthlyCapitalSnapshot> = {};
            snap.forEach(d => {
              const data = d.data() as MonthlyCapitalSnapshot;
              if (data) {
                const key = data.monthYM || d.id;
                remoteMap[key] = { ...data, monthYM: key };
              }
            });
            StorageService.saveMonthlyCapitalSnapshots(remoteMap, false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Monthly capital snapshots listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Monthly capital snapshots listener warning:', err.message));
      this.unsubscribers.push(unsubCapitalSnapshots);

      // 25. Capital Cash Transfers Listener (H12)
      const unsubCashTransfers = onSnapshot(collection(db, 'capitalCashTransfers'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          if (!snap.empty) {
            const remoteList: CapitalCashTransfer[] = [];
            snap.forEach(d => {
              const data = d.data() as CapitalCashTransfer;
              if (data) remoteList.push({ ...data, id: data.id || d.id });
            });
            remoteList.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
            StorageService.saveCashTransfers(remoteList, false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          } else {
            StorageService.saveCashTransfers([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] Capital cash transfers listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] Capital cash transfers listener warning:', err.message));
      this.unsubscribers.push(unsubCashTransfers);

      // 26. FOC Gift Distributions Listener (H12)
      const unsubFocDistributions = onSnapshot(collection(db, 'focDistributions'), (snap) => {
        this.isProcessingRemoteSnapshot = true;
        try {
          if (!snap.empty) {
            const remoteFoc: FocDistributionRecord[] = [];
            snap.forEach(d => {
              const data = d.data() as FocDistributionRecord;
              if (data) remoteFoc.push({ ...data, id: data.id || d.id });
            });
            remoteFoc.sort((a, b) => new Date(b.date || (b as any).createdAt || 0).getTime() - new Date(a.date || (a as any).createdAt || 0).getTime());
            StorageService.saveFocDistributions(remoteFoc, false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          } else {
            StorageService.saveFocDistributions([], false);
            this.updateStatus({ lastSyncedAt: new Date(), error: null });
          }
        } catch (err: any) {
          console.warn('[FirestoreSync] FOC distributions listener error:', err?.message || err);
        } finally {
          this.isProcessingRemoteSnapshot = false;
        }
      }, (err) => console.warn('[FirestoreSync] FOC distributions listener warning:', err.message));
      this.unsubscribers.push(unsubFocDistributions);

      // 27. Social Marketing State Listener (H12)
      const unsubSocialState = onSnapshot(doc(db, 'socialMarketing', 'state'), (snap) => {
        if (snap.exists()) {
          this.isProcessingRemoteSnapshot = true;
          try {
            const data = snap.data() as any;
            if (data) {
              StorageService.saveSocialMarketingState(data, false);
              this.updateStatus({ lastSyncedAt: new Date(), error: null });
            }
          } catch (err: any) {
            console.warn('[FirestoreSync] Social marketing state listener error:', err?.message || err);
          } finally {
            this.isProcessingRemoteSnapshot = false;
          }
        }
      }, (err) => console.warn('[FirestoreSync] Social marketing state listener warning:', err.message));
      this.unsubscribers.push(unsubSocialState);

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
  // ATOMIC TRANSACTIONS & MULTI-DEVICE CONCURRENCY
  // ==========================================

  /**
   * Executes an atomic sale checkout.
   * If Firestore is connected, performs an atomic runTransaction with read-before-write validation
   * to guarantee that another terminal hasn't concurrently sold the same IMEI or consumed stock.
   */
  public async executeAtomicSaleTransaction({
    sale,
    creditRecord,
    cartItems,
    updatedCustomer,
    preOrderId,
  }: {
    sale: Sale;
    creditRecord?: CreditSaleRecord;
    cartItems: Array<{
      product: Product;
      quantity: number;
      selectedImei?: string;
      selectedImei2?: string;
    }>;
    updatedCustomer?: Customer;
    preOrderId?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    updatedProducts: Product[];
    finalizedSale?: Sale;
    finalizedCreditRecord?: CreditSaleRecord;
    cloudCommitted?: boolean;
  }> {
    // 1. Perform side-effect-free local validation first against fresh storage (commitBranchUpdate = false)
    const saleLocId = sale.locationId || StorageService.getActiveLocationId();
    const localResult = StorageService.deductStockForSale(cartItems, saleLocId, false);
    if (!localResult.success) {
      return { ...localResult, cloudCommitted: false };
    }

    let finalizedSale: Sale = { ...sale, locationId: saleLocId, syncState: 'pending' };
    let finalizedCreditRecord: CreditSaleRecord | undefined = creditRecord ? { ...creditRecord } : undefined;
    let cloudCommitted = false;

    // 2. If online and authenticated with Firebase, execute all-in-one atomic Firestore transaction
    if (FirebaseAuthService.isAuthenticated() && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        await runTransaction(db, async (transaction) => {
          // Idempotency guard inside transaction: check if this sale ID was already committed by a concurrent retry
          const saleDocRef = doc(db, 'sales', finalizedSale.id);
          const existingSaleSnap = await transaction.get(saleDocRef);
          if (existingSaleSnap.exists()) {
            const committedData = existingSaleSnap.data() as Sale;
            finalizedSale = {
              ...committedData,
              id: committedData.id || finalizedSale.id,
              syncState: 'synced',
              syncError: undefined,
            };
            transaction.delete(doc(db, 'offlineSaleConflicts', finalizedSale.id));
            return;
          }

          // Distinct products involved in this transaction
          const distinctProductIds = Array.from(new Set(cartItems.map(i => i.product.id)));
          const productDocs: { id: string; ref: any; data: Product }[] = [];
          const branchDocs: { prodId: string; ref: any; data?: BranchInventory }[] = [];

          // --- ALL READS FIRST (Firestore transaction requirement) ---
          for (const prodId of distinctProductIds) {
            const productRef = doc(db, 'products', prodId);
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) {
              throw new Error(`Product "${prodId}" does not exist in cloud database catalog. Cannot finalize sale.`);
            }
            productDocs.push({
              id: prodId,
              ref: productRef,
              data: productSnap.data() as Product,
            });

            // Read branch localized stock
            const branchRef = doc(db, 'branch_inventory', `${prodId}_${saleLocId}`);
            const branchSnap = await transaction.get(branchRef);
            if (branchSnap.exists()) {
              branchDocs.push({
                prodId,
                ref: branchRef,
                data: branchSnap.data() as BranchInventory,
              });
            } else {
              branchDocs.push({ prodId, ref: branchRef });
            }
          }

          // R8: Read sequential invoice counter & optional credit counter using branch code and fixed Asia/Yangon date
          const loc = StorageService.getLocations().find(l => l.id === saleLocId);
          const locCode = ((loc?.code || saleLocId || 'MAIN').replace(/[^A-Za-z0-9]/g, '') || 'MAIN').toUpperCase();
          const yyyymmdd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon' })
            .format(new Date())
            .replace(/-/g, '');
          const invCtrRef = doc(db, 'counters', `invoice-${locCode}-${yyyymmdd}`);
          const invCtrSnap = await transaction.get(invCtrRef);

          let crdCtrRef: any = null;
          let crdCtrSnap: any = null;
          if (finalizedCreditRecord) {
            crdCtrRef = doc(db, 'counters', `credit-${locCode}-${yyyymmdd}`);
            crdCtrSnap = await transaction.get(crdCtrRef);
          }

          // Read pre-order if fulfilling one
          let preOrderRef: any = null;
          let preOrderSnap: any = null;
          const activePreOrderId = preOrderId || sale.preOrderId;
          if (activePreOrderId) {
            preOrderRef = doc(db, 'preOrders', activePreOrderId);
            preOrderSnap = await transaction.get(preOrderRef);
          }

          // Read customer if present
          let custDocRef: any = null;
          let custSnap: any = null;
          if (updatedCustomer?.id) {
            custDocRef = doc(db, 'customers', updatedCustomer.id);
            custSnap = await transaction.get(custDocRef);
          }

          // Read current cash drawer if cash is involved
          let cashAmt = 0;
          if (sale.paymentMethod === 'cash') {
            cashAmt = sale.amountPaid || sale.grandTotal || 0;
          } else if (sale.paymentDetails?.cashAmount) {
            cashAmt = sale.paymentDetails.cashAmount;
          } else if (sale.paymentMethod === 'credit' && sale.paymentDetails?.downPaymentMethod === 'cash' && sale.paymentDetails?.downPayment) {
            cashAmt = sale.paymentDetails.downPayment;
          }

          let drawerRef: any = null;
          let drawerSnap: any = null;
          if (cashAmt > 0) {
            drawerRef = doc(db, 'cashDrawer', 'current');
            drawerSnap = await transaction.get(drawerRef);
          }

          // Read authenticated user's verified role and permissions from Firestore (R6: never trust localStorage alone)
          const activeSettings = StorageService.getSettings();
          const currentFbUser = FirebaseAuthService.getFirebaseUser();
          let staffAccessSnap: any = null;
          let staffDocSnap: any = null;
          if (currentFbUser?.uid) {
            staffAccessSnap = await transaction.get(doc(db, 'staffAccess', currentFbUser.uid));
          }
          if (activeSettings.currentStaffId) {
            staffDocSnap = await transaction.get(doc(db, 'staffUsers', activeSettings.currentStaffId));
          }
          const rolePermsSnap = await transaction.get(doc(db, 'rolePermissions', 'global'));

          // --- VALIDATIONS ---
          if (preOrderSnap && preOrderSnap.exists()) {
            const livePreOrder = preOrderSnap.data() as PreOrder;
            if (livePreOrder.status === 'Completed' || livePreOrder.status === 'Cancelled') {
              throw new Error(`Pre-Order #${livePreOrder.preOrderNumber} has already been ${livePreOrder.status.toLowerCase()} on another terminal.`);
            }
          }

          // --- VALIDATIONS: Recompute Line-Item Math, Price Override & Below-Cost Guard (Item 9 & R6) ---
          const fbEmail = (currentFbUser?.email || '').toLowerCase();
          const isBootstrapOwnerEmail = fbEmail === 'phonemyatpaing950@gmail.com' && currentFbUser?.emailVerified === true;
          const cloudRole = (
            isBootstrapOwnerEmail
              ? 'Owner'
              : staffAccessSnap?.exists()
                ? staffAccessSnap.data()?.role
                : staffDocSnap?.exists()
                  ? staffDocSnap.data()?.role
                  : activeSettings.currentStaffRole
          ) as StaffRole || 'Cashier';
          const staffRole: StaffRole = cloudRole;
          const cloudPermsMap = rolePermsSnap?.exists() ? rolePermsSnap.data()?.permissions : StorageService.getRolePermissions();
          const rolePerms = cloudPermsMap?.[staffRole] || StorageService.getRolePermissions()?.[staffRole];
          const isPrivilegedRole = staffRole === 'Owner' || staffRole === 'Manager';
          const canOverridePrice = isPrivilegedRole || Boolean(rolePerms?.canEditPrice);
          const canGiveDiscount = isPrivilegedRole || Boolean(rolePerms?.canGiveDiscount);
          const canApplyFoc = isPrivilegedRole || Boolean(rolePerms?.canApplyFoc);

          if (Array.isArray(finalizedSale.items) && finalizedSale.items.length > 0) {
            let recomputedSubtotal = 0;
            finalizedSale.items = finalizedSale.items.map(line => {
              const matchedDoc = productDocs.find(p => p.id === line.productId);
              const liveCost = Math.round(Number(matchedDoc?.data?.costPrice ?? line.costPrice ?? 0));
              const liveSelling = Math.round(Number(matchedDoc?.data?.sellingPrice ?? line.unitPrice ?? 0));
              const qty = Math.max(1, Number(line.quantity) || 1);
              const unitPrice = line.isFoc ? 0 : Math.round(Number(line.unitPrice) || 0);
              const lineDiscount = Math.round(Number(line.discount) || 0);
              const lineFinal = line.isFoc
                ? 0
                : Math.round(Number(line.finalPrice !== undefined ? line.finalPrice : unitPrice * qty - lineDiscount));

              if (line.isFoc && !canApplyFoc) {
                throw new Error(`Permission Denied: Role "${staffRole}" is not authorized to issue FOC items.`);
              }
              if (!line.isFoc) {
                // R6 Fix: Price override strictly requires canOverridePrice (canEditPrice), never bypassed by canGiveDiscount
                if (liveSelling > 0 && unitPrice !== liveSelling && !canOverridePrice) {
                  throw new Error(
                    `Price Override Denied: "${line.name}" was submitted at ${unitPrice.toLocaleString()} Ks instead of catalog price ${liveSelling.toLocaleString()} Ks.`
                  );
                }
                if (lineDiscount > 0 && !canGiveDiscount) {
                  throw new Error(`Discount Denied: Role "${staffRole}" is not authorized to grant line discounts.`);
                }
                if (liveCost > 0 && (unitPrice < liveCost || lineFinal < liveCost * qty) && !isPrivilegedRole) {
                  throw new Error(
                    `Below-Cost Protection: "${line.name}" cannot be sold below unit cost (${liveCost.toLocaleString()} Ks) without Owner/Manager authorization.`
                  );
                }
              }

              recomputedSubtotal += lineFinal;
              return {
                ...line,
                costPrice: liveCost,
                unitPrice,
                finalPrice: lineFinal,
              };
            });

            const orderDiscount = Math.round(Number(finalizedSale.discountTotal) || 0);
            if (orderDiscount > 0 && !canGiveDiscount) {
              throw new Error(`Discount Denied: Role "${staffRole}" is not authorized to grant order discounts.`);
            }
            const taxTotal = Math.round(Number(finalizedSale.taxTotal) || 0);
            const depositDeducted = Math.round(Number(finalizedSale.depositDeducted) || 0);
            const expectedGrandTotal = Math.max(0, Math.round(recomputedSubtotal - orderDiscount + taxTotal - depositDeducted));
            const submittedGrandTotal = Math.round(Number(finalizedSale.grandTotal) || 0);

            if (Math.abs(expectedGrandTotal - submittedGrandTotal) > 5) {
              throw new Error(
                `Invoice Total Mismatch: Computed total (${expectedGrandTotal.toLocaleString()} Ks) does not match submitted total (${submittedGrandTotal.toLocaleString()} Ks).`
              );
            }
          }

          for (const prodInfo of productDocs) {
            const liveProd = prodInfo.data;
            const soldItemsOfProd = cartItems.filter(c => c.product.id === prodInfo.id);
            const totalQtySold = soldItemsOfProd.reduce((s, i) => s + i.quantity, 0);
            const isBlockedStatus =
              liveProd.itemStatus === 'Quarantined' ||
              liveProd.itemStatus === 'Pending RMA' ||
              liveProd.itemStatus === 'Written-Off';
            const liveSellable = isBlockedStatus ? 0 : Math.max(0, liveProd.stock || 0);

            if (totalQtySold > liveSellable) {
              throw new Error(
                `Cloud Stock Conflict: "${liveProd.name}" only has ${liveSellable} sellable units in cloud database. Another terminal may have just finalized a sale.`
              );
            }

            // Also check branch-scoped inventory if available
            const branchInfo = branchDocs.find(b => b.prodId === prodInfo.id);
            if (branchInfo?.data) {
              const branchAvail = branchInfo.data.availableStock ?? branchInfo.data.onHandStock ?? 0;
              if (totalQtySold > branchAvail) {
                throw new Error(
                  `Branch Stock Conflict: "${liveProd.name}" only has ${branchAvail} available units at this location.`
                );
              }
            }

            const usedImeis = soldItemsOfProd.map(i => i.selectedImei).filter(Boolean) as string[];
            const usedImei2s = soldItemsOfProd.map(i => i.selectedImei2).filter(Boolean) as string[];
            const allUsedImeis = [...usedImeis, ...usedImei2s];

            // Verify IMEIs are still available in cloud database
            for (const imei of usedImeis) {
              const hasImei = liveProd.imeiList?.includes(imei) || liveProd.imeiPairs?.some(p => p.imei1 === imei);
              if (!hasImei) {
                throw new Error(
                  `Multi-Device Conflict: IMEI "${imei}" for "${liveProd.name}" was already sold or transferred on another terminal!`
                );
              }
            }

            for (const imei2 of usedImei2s) {
              const hasImei2 = liveProd.imeiList?.includes(imei2) || liveProd.imeiPairs?.some(p => p.imei2 === imei2);
              if (!hasImei2) {
                throw new Error(
                  `Multi-Device Conflict: Secondary IMEI "${imei2}" for "${liveProd.name}" was already sold on another terminal!`
                );
              }
            }

            // --- WRITES: Product, Branch Inventory, Device Units ---
            const newStock = Math.max(0, (liveProd.stock || 0) - totalQtySold);
            const updatedImeiList = liveProd.imeiList ? liveProd.imeiList.filter(im => !allUsedImeis.includes(im)) : undefined;
            const updatedImeiPairs = liveProd.imeiPairs
              ? liveProd.imeiPairs.filter(p => !usedImeis.includes(p.imei1) && (!p.imei2 || !usedImei2s.includes(p.imei2)))
              : undefined;

            transaction.update(prodInfo.ref, sanitizeForFirestore({
              stock: newStock,
              imeiList: updatedImeiList || [],
              imeiPairs: updatedImeiPairs || [],
              updatedAt: new Date().toISOString(),
              lastModifiedAt: new Date().toISOString(),
            }));

            // Write updated localized branch inventory
            if (branchInfo) {
              const currentOnHand = branchInfo.data?.onHandStock ?? liveProd.stock ?? 0;
              const currentReserved = branchInfo.data?.reservedStock ?? 0;
              const newBranchOnHand = Math.max(0, currentOnHand - totalQtySold);
              const newBranchAvail = Math.max(0, newBranchOnHand - currentReserved);

              transaction.set(branchInfo.ref, sanitizeForFirestore({
                id: `${prodInfo.id}_${saleLocId}`,
                productId: prodInfo.id,
                locationId: saleLocId,
                onHandStock: newBranchOnHand,
                reservedStock: currentReserved,
                availableStock: newBranchAvail,
                minThreshold: branchInfo.data?.minThreshold || liveProd.minStockAlert || 2,
                localSellingPrice: branchInfo.data?.localSellingPrice || liveProd.sellingPrice,
                updatedAt: new Date().toISOString(),
              }), { merge: true });
            }

            // Update device_units status for serialized devices sold
            for (const imei of allUsedImeis) {
              const deviceRef = doc(db, 'device_units', imei);
              transaction.set(deviceRef, sanitizeForFirestore({
                imei,
                productId: prodInfo.id,
                currentLocationId: saleLocId,
                status: 'sold',
                soldInvoiceId: finalizedSale.id,
                soldAt: new Date().toISOString(),
              }), { merge: true });
            }
          }

          // --- WRITES: Sequential Counters (Item 4 & R8: Always assign authoritative sequential invoice & credit numbers with branch code & Myanmar date) ---
          const currentInvSeq = invCtrSnap.exists() ? (invCtrSnap.data()?.seq || 0) : 0;
          const nextInvSeq = currentInvSeq + 1;
          transaction.set(invCtrRef, { seq: nextInvSeq, branchCode: locCode, date: yyyymmdd, updatedAt: new Date().toISOString() }, { merge: true });

          const invPrefix = (activeSettings.invoicePrefix || 'INV').replace(/-+$/, '');
          finalizedSale.invoiceNumber = `${invPrefix}-${locCode}-${yyyymmdd}-${String(nextInvSeq).padStart(4, '0')}`;

          if (finalizedCreditRecord && crdCtrRef) {
            const currentCrdSeq = crdCtrSnap?.exists() ? (crdCtrSnap.data()?.seq || 0) : 0;
            const nextCrdSeq = currentCrdSeq + 1;
            transaction.set(crdCtrRef, { seq: nextCrdSeq, branchCode: locCode, date: yyyymmdd, updatedAt: new Date().toISOString() }, { merge: true });
            finalizedCreditRecord.creditNumber = `CRD-${locCode}-${yyyymmdd}-${String(nextCrdSeq).padStart(4, '0')}`;
            finalizedCreditRecord.invoiceNumber = finalizedSale.invoiceNumber;
            finalizedSale.creditSaleNumber = finalizedCreditRecord.creditNumber;
            finalizedSale.creditSaleId = finalizedCreditRecord.id;
          }

          // --- WRITES: Sale Document ---
          finalizedSale.syncState = 'synced';
          finalizedSale.syncError = undefined;
          transaction.set(saleDocRef, sanitizeForFirestore({
            ...finalizedSale,
            locationId: saleLocId,
            syncedAt: new Date().toISOString(),
          }));
          transaction.delete(doc(db, 'offlineSaleConflicts', finalizedSale.id));

          // --- WRITES: Credit Record ---
          if (finalizedCreditRecord) {
            const creditDocRef = doc(db, 'creditSales', finalizedCreditRecord.id);
            transaction.set(creditDocRef, sanitizeForFirestore({
              ...finalizedCreditRecord,
              syncedAt: new Date().toISOString(),
            }));
          }

          // --- WRITES: Pre-Order Completion ---
          if (preOrderRef && preOrderSnap && preOrderSnap.exists()) {
            transaction.update(preOrderRef, sanitizeForFirestore({
              status: 'Completed',
              fulfilledDate: new Date().toISOString(),
              fulfilledSaleId: finalizedSale.id,
              fulfilledInvoiceNumber: finalizedSale.invoiceNumber,
              fulfilledBy: finalizedSale.soldBy || 'Cashier',
              updatedAt: new Date().toISOString(),
            }));
          }

          // --- WRITES: Atomic Customer Increment ---
          if (custDocRef && updatedCustomer?.id) {
            const pointsDelta = (finalizedSale.pointsEarned || 0) - (finalizedSale.pointsRedeemed || 0);
            const creditDelta = finalizedCreditRecord ? (finalizedCreditRecord.remainingBalance || 0) : 0;
            if (custSnap && custSnap.exists()) {
              const liveCust = custSnap.data() as Customer;
              const newLoyalty = Math.max(0, (liveCust.loyaltyPoints || 0) + pointsDelta);
              const newCreditBal = Math.max(0, (liveCust.outstandingCreditBalance || 0) + creditDelta);
              transaction.update(custDocRef, {
                totalSpent: increment(Math.round(finalizedSale.grandTotal || 0)),
                totalVisits: increment(1),
                loyaltyPoints: newLoyalty,
                ...(creditDelta > 0 ? { outstandingCreditBalance: newCreditBal } : {}),
                updatedAt: new Date().toISOString(),
              });
            } else {
              transaction.set(custDocRef, sanitizeForFirestore(updatedCustomer), { merge: true });
            }
          }

          // --- WRITES: Atomic Cash Drawer Update & Per-Shift Entry (Item 8 & R9) ---
          if (drawerRef && cashAmt > 0) {
            const nowIso = new Date().toISOString();
            const roundedCashAmt = Math.round(cashAmt);
            const cashierId = finalizedSale.soldById || finalizedSale.soldBy || activeSettings.currentStaffId || 'cashier';
            const terminalId = StorageService.getTerminalId();
            const txEntry = {
              id: `tx-sale-${finalizedSale.id}`,
              timestamp: nowIso,
              type: 'in' as const,
              entryType: 'sale' as const,
              description: finalizedCreditRecord
                ? `Credit Down Payment #${finalizedCreditRecord.creditNumber} (${finalizedSale.customerName})`
                : `POS Invoice #${finalizedSale.invoiceNumber} (${finalizedSale.customerName})`,
              amount: roundedCashAmt,
              cashierId,
              terminalId,
            };
            const localDrawer = StorageService.getCashDrawer();
            const liveDrawer = drawerSnap && drawerSnap.exists() ? (drawerSnap.data() as CashDrawerRecord) : undefined;
            const activeShiftId = liveDrawer?.id || localDrawer.id || `shift-${yyyymmdd}`;

            // Write immutable per-shift drawer entry document (R9)
            const shiftEntryRef = doc(db, 'cashDrawerShifts', activeShiftId, 'entries', txEntry.id);
            transaction.set(shiftEntryRef, sanitizeForFirestore({
              ...txEntry,
              shiftId: activeShiftId,
              locationId: saleLocId,
              updatedAt: nowIso,
            }));

            if (liveDrawer) {
              const existingTxs = Array.isArray(liveDrawer.transactions) ? liveDrawer.transactions : [];
              const alreadyBooked = existingTxs.some(t => t.id === txEntry.id);
              if (!alreadyBooked) {
                transaction.update(drawerRef, {
                  cashSales: increment(roundedCashAmt),
                  expectedInDrawer: increment(roundedCashAmt),
                  totalCashIn: increment(roundedCashAmt),
                  transactions: arrayUnion(sanitizeForFirestore(txEntry)),
                  syncedAt: nowIso,
                });
              }
            } else {
              const openingFloat = Math.round(Number(localDrawer.openingFloat || localDrawer.openingBalance || 0));
              transaction.set(drawerRef, sanitizeForFirestore({
                id: activeShiftId,
                date: localDrawer.date || nowIso.slice(0, 10),
                openedAt: localDrawer.openedAt || nowIso,
                openedBy: localDrawer.openedBy || finalizedSale.soldBy || 'Cashier',
                status: 'open',
                openingFloat,
                cashSales: roundedCashAmt,
                cashInManual: [],
                cashOutManual: [],
                totalCashIn: roundedCashAmt,
                totalCashOut: 0,
                expectedInDrawer: openingFloat + roundedCashAmt,
                transactions: [txEntry],
                syncedAt: nowIso,
              }), { merge: true });
            }
          }

          // --- WRITES: Atomic Audit Log ---
          const auditId = `audit-sale-${finalizedSale.id}`;
          const auditRef = doc(db, 'auditLogs', auditId);
          transaction.set(auditRef, sanitizeForFirestore({
            id: auditId,
            timestamp: new Date().toISOString(),
            staffId: finalizedSale.soldBy || 'cashier',
            staffName: finalizedSale.soldBy || 'Cashier',
            staffRole: staffRole,
            actionType: 'SALE_COMPLETED',
            category: 'sales',
            severity: 'info',
            summary: `Completed Sale #${finalizedSale.invoiceNumber} for ${finalizedSale.customerName} (${Math.round(finalizedSale.grandTotal).toLocaleString()} Ks)`,
            details: {
              targetId: finalizedSale.id,
              invoiceNumber: finalizedSale.invoiceNumber,
              customerName: finalizedSale.customerName,
              amount: Math.round(finalizedSale.grandTotal),
              paymentMethod: finalizedSale.paymentMethod,
            },
          }));
        });

        cloudCommitted = true;
        this.updateStatus({ lastSyncedAt: new Date(), error: null });
      } catch (cloudErr: any) {
        console.error('[FirestoreSync] Atomic transaction failed:', cloudErr);
        return {
          success: false,
          error: cloudErr.message || 'Atomic transaction failed due to a database concurrency conflict. Please try again.',
          updatedProducts: StorageService.getProducts(),
          cloudCommitted: false,
        };
      }
    }

    // 3. Only commit local branch_inventory decrements AFTER cloud transaction succeeds (or when operating offline)
    const distinctProductIds = Array.from(new Set(cartItems.map(c => c.product.id)));
    for (const productId of distinctProductIds) {
      const totalQtySold = cartItems
        .filter(c => c.product.id === productId)
        .reduce((s, i) => s + i.quantity, 0);
      try {
        StorageService.updateBranchStock(productId, saleLocId, -totalQtySold, 0, false);
      } catch (branchStockErr) {
        console.warn('Failed to update local branch stock after checkout:', branchStockErr);
      }
    }

    return {
      ...localResult,
      finalizedSale,
      finalizedCreditRecord,
      cloudCommitted,
    };
  }

  /**
   * Executes an atomic Firestore transaction for item or full sale refunds:
   * Enforces quantity and amount caps against live cloud state, restores product & branch stock,
   * resets device_units/{imei} status back to 'in_stock', reverses customer spend/credit balance,
   * and records cash drawer outflow + audit log atomically.
   */
  public async executeAtomicRefundTransaction(params: {
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
    refundFundingSource?: 'cash_drawer' | 'digital_cash_pool';
    refundMethod: string;
    digitalChannel?: string;
    restockItems: boolean;
    totalRefundAmount: number;
    staffName: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!FirebaseAuthService.isAuthenticated() || typeof navigator === 'undefined' || !navigator.onLine) {
      StorageService.processItemRefund(params);
      StorageService.enqueuePendingOfflineRefund(params);
      return { success: true };
    }

    try {
      let committedSaleUpdate: Sale | null = null;
      const committedProductUpdates = new Map<string, Product>();
      let committedCustomerUpdate: Customer | null = null;
      let committedCreditUpdate: CreditSaleRecord | null = null;
      let committedDrawerUpdate: CashDrawerRecord | null = null;

      await runTransaction(db, async (transaction) => {
        // 1. Read live Sale document
        const saleRef = doc(db, 'sales', params.saleId);
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) {
          throw new Error('Sale record not found in cloud database.');
        }
        const liveSale = saleSnap.data() as Sale;
        const saleLocId = liveSale.locationId || StorageService.getActiveLocationId();

        // 2. Read all affected Products & Branch Inventory documents first
        const distinctProdIds = Array.from(new Set(params.itemsToRefund.map(i => i.productId).filter(Boolean)));
        const prodSnaps = new Map<string, { ref: any; data?: Product }>();
        const branchSnaps = new Map<string, { ref: any; data?: BranchInventory }>();

        for (const pid of distinctProdIds) {
          const pRef = doc(db, 'products', pid);
          const pSnap = await transaction.get(pRef);
          prodSnaps.set(pid, { ref: pRef, data: pSnap.exists() ? (pSnap.data() as Product) : undefined });

          const bRef = doc(db, 'branch_inventory', `${pid}_${saleLocId}`);
          const bSnap = await transaction.get(bRef);
          branchSnaps.set(pid, { ref: bRef, data: bSnap.exists() ? (bSnap.data() as BranchInventory) : undefined });
        }

        // Read Customer if linked
        let custRef: any = null;
        let custSnap: any = null;
        if (liveSale.customerId) {
          custRef = doc(db, 'customers', liveSale.customerId);
          custSnap = await transaction.get(custRef);
        }

        // Read CreditSaleRecord if credit sale (Item M-b & R8: match strictly by ID, never by invoiceNumber)
        let creditRef: any = null;
        let creditSnap: any = null;
        const linkedCreditId =
          liveSale.creditSaleId ||
          liveSale.paymentDetails?.creditSaleId ||
          (liveSale.paymentMethod === 'credit'
            ? StorageService.getCreditSales().find(cs => cs.saleId === liveSale.id)?.id
            : undefined);
        if (linkedCreditId) {
          creditRef = doc(db, 'creditSales', linkedCreditId);
          creditSnap = await transaction.get(creditRef);
        }

        // Read Cash Drawer if cash_drawer refund
        const fundingSource = params.refundFundingSource ||
          (params.refundMethod && params.refundMethod.toLowerCase().includes('cash') && !params.refundMethod.toLowerCase().includes('kpay')
            ? 'cash_drawer'
            : 'digital_cash_pool');

        let drawerRef: any = null;
        let drawerSnap: any = null;
        if (fundingSource === 'cash_drawer') {
          drawerRef = doc(db, 'cashDrawer', 'current');
          drawerSnap = await transaction.get(drawerRef);
        }

        // 3. Validate refund caps against live sale items (Item 5: Cap per-line refund amount)
        let computedRefundTotal = 0;
        const refundItemsList: any[] = [];
        const updatedSaleItems = [...(liveSale.items || [])];

        for (const req of params.itemsToRefund) {
          if (req.quantity <= 0) continue;
          const itemIdx = updatedSaleItems.findIndex(
            i => i.productId === req.productId && (!req.imei || i.imei === req.imei)
          );
          const fallbackIdx = itemIdx >= 0 ? itemIdx : updatedSaleItems.findIndex(i => i.productId === req.productId);
          if (fallbackIdx === -1) {
            throw new Error(`Item "${req.name}" does not exist on Invoice #${liveSale.invoiceNumber}.`);
          }

          const targetLine = { ...updatedSaleItems[fallbackIdx] };
          const remainingReturnable = (targetLine.quantity || 1) - (targetLine.refundedQuantity || 0);
          if (req.quantity > remainingReturnable) {
            throw new Error(
              `Refund Quantity Exceeded: Cannot refund ${req.quantity} unit(s) of "${req.name}" (only ${remainingReturnable} remaining refundable).`
            );
          }

          targetLine.refundedQuantity = (targetLine.refundedQuantity || 0) + req.quantity;
          if (req.imei) {
            const prevImeis = targetLine.refundedImeis || [];
            if (!prevImeis.includes(req.imei)) {
              targetLine.refundedImeis = [...prevImeis, req.imei];
            }
          }
          updatedSaleItems[fallbackIdx] = targetLine;

          const unitNet = (targetLine.finalPrice || (targetLine.unitPrice * targetLine.quantity)) / (targetLine.quantity || 1);
          const maxLineRefund = Math.round(unitNet * req.quantity);
          const lineRefund = req.refundAmount > 0
            ? Math.min(Math.round(req.refundAmount), maxLineRefund)
            : maxLineRefund;
          computedRefundTotal += lineRefund;

          refundItemsList.push({
            productId: req.productId,
            name: req.name,
            quantity: req.quantity,
            unitPrice: req.unitPrice,
            finalPrice: req.finalPrice,
            refundAmount: lineRefund,
            imei: req.imei,
            imei2: req.imei2,
            restocked: params.restockItems,
          });
        }

        if (refundItemsList.length === 0) {
          throw new Error('No valid refundable items specified.');
        }

        const currentRefundedSum = (liveSale.refundHistory || []).reduce((acc, r) => acc + (r.totalRefundAmount || 0), 0);
        const maxRefundableAmount = Math.max(0, (liveSale.grandTotal || 0) - currentRefundedSum);
        const requestedTotal = params.totalRefundAmount > 0
          ? Math.min(Math.round(params.totalRefundAmount), computedRefundTotal)
          : computedRefundTotal;

        if (requestedTotal > maxRefundableAmount) {
          throw new Error(
            `Refund Amount Exceeded: Requested ${requestedTotal.toLocaleString()} Ks exceeds remaining refundable invoice balance of ${maxRefundableAmount.toLocaleString()} Ks.`
          );
        }

        const effectiveRefundAmount = Math.min(requestedTotal, maxRefundableAmount);

        // 4. Write Product, Branch Inventory, and Device Units restock updates
        if (params.restockItems) {
          for (const pid of distinctProdIds) {
            const pEntry = prodSnaps.get(pid);
            const bEntry = branchSnaps.get(pid);
            const linesForProd = refundItemsList.filter(r => r.productId === pid);
            const qtyRestocked = linesForProd.reduce((s, r) => s + r.quantity, 0);
            const returnedImeis = linesForProd.flatMap(r => [r.imei, r.imei2]).filter(Boolean) as string[];

            if (pEntry?.data) {
              const liveProd = pEntry.data;
              const newStock = (liveProd.stock || 0) + qtyRestocked;
              const mergedImeiList = liveProd.imeiList ? Array.from(new Set([...liveProd.imeiList, ...returnedImeis])) : undefined;
              const nowIso = new Date().toISOString();

              transaction.update(pEntry.ref, sanitizeForFirestore({
                stock: newStock,
                ...(mergedImeiList ? { imeiList: mergedImeiList } : {}),
                updatedAt: nowIso,
                lastModifiedAt: nowIso,
              }));

              committedProductUpdates.set(pid, {
                ...liveProd,
                id: pid,
                stock: newStock,
                ...(mergedImeiList ? { imeiList: mergedImeiList } : {}),
              });
            }

            if (bEntry) {
              const curOnHand = bEntry.data?.onHandStock ?? pEntry?.data?.stock ?? 0;
              const curReserved = bEntry.data?.reservedStock ?? 0;
              const newOnHand = curOnHand + qtyRestocked;
              transaction.set(bEntry.ref, sanitizeForFirestore({
                id: `${pid}_${saleLocId}`,
                productId: pid,
                locationId: saleLocId,
                onHandStock: newOnHand,
                reservedStock: curReserved,
                availableStock: Math.max(0, newOnHand - curReserved),
                updatedAt: new Date().toISOString(),
              }), { merge: true });
            }

            // Reset device_units/{imei} status back to 'in_stock'
            for (const imei of returnedImeis) {
              const devRef = doc(db, 'device_units', imei);
              transaction.set(devRef, sanitizeForFirestore({
                imei,
                productId: pid,
                currentLocationId: saleLocId,
                status: 'in_stock',
                soldInvoiceId: null,
                soldAt: null,
                updatedAt: new Date().toISOString(),
              }), { merge: true });
            }
          }
        }

        // R7: For credit sales, cancel unpaid debt first and only pay out cash/digital up to what the customer actually paid
        const isCreditSale = Boolean(
          liveSale.paymentMethod === 'credit' ||
          liveSale.isCreditSale ||
          liveSale.creditSaleId ||
          liveSale.paymentDetails?.creditSaleId ||
          (creditSnap && creditSnap.exists())
        );
        const liveCreditData = creditSnap && creditSnap.exists() ? (creditSnap.data() as CreditSaleRecord) : undefined;
        const priorCashRefunded = (liveSale.refundHistory || []).reduce(
          (acc, r) => acc + (r.cashPayoutAmount !== undefined ? r.cashPayoutAmount : (isCreditSale ? 0 : (r.totalRefundAmount || 0))),
          0
        );
        const totalCustomerPaidOnCredit = Math.max(
          0,
          Math.round(Number(liveCreditData?.totalPaid ?? liveSale.amountPaid ?? 0)) - priorCashRefunded
        );
        const cashBack = isCreditSale
          ? Math.min(effectiveRefundAmount, totalCustomerPaidOnCredit)
          : effectiveRefundAmount;
        const debtCancel = isCreditSale
          ? Math.max(0, effectiveRefundAmount - cashBack)
          : 0;

        // 5. Write Updated Sale Document
        const totalSoldQty = updatedSaleItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalRefundedQty = updatedSaleItems.reduce((sum, item) => sum + (item.refundedQuantity || 0), 0);
        const isFullyRefunded = totalRefundedQty >= totalSoldQty;
        const nowIso = new Date().toISOString();

        const refundRecord = {
          id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          saleId: liveSale.id,
          invoiceNumber: liveSale.invoiceNumber,
          date: nowIso,
          items: refundItemsList,
          reason: params.reason,
          refundMethod: params.refundMethod,
          refundFundingSource: fundingSource,
          digitalChannel: params.digitalChannel || (fundingSource === 'digital_cash_pool' ? params.refundMethod : undefined),
          restockItems: params.restockItems,
          totalRefundAmount: effectiveRefundAmount,
          cashPayoutAmount: cashBack,
          debtCancelledAmount: debtCancel,
          refundedBy: params.staffName,
          notes: params.notes,
        };

        const salePatch = {
          items: updatedSaleItems,
          status: (isFullyRefunded ? 'refunded' : 'partially_refunded') as Sale['status'],
          refundReason: params.reason,
          refundedAt: nowIso,
          refundedBy: params.staffName,
          totalRefundedAmount: currentRefundedSum + effectiveRefundAmount,
          refundHistory: [refundRecord, ...(liveSale.refundHistory || [])],
          syncedAt: nowIso,
        };

        transaction.update(saleRef, sanitizeForFirestore(salePatch));
        committedSaleUpdate = { ...liveSale, id: liveSale.id || params.saleId, ...salePatch };

        // 6. Reverse Customer Spend & Credit Balance + Update creditSales Record (Item M-b & R7)
        if (custRef && custSnap && custSnap.exists() && effectiveRefundAmount > 0) {
          const liveCust = custSnap.data() as Customer;
          const newSpent = Math.max(0, (liveCust.totalSpent || 0) - effectiveRefundAmount);
          const newCreditBal = isCreditSale
            ? Math.max(0, (liveCust.outstandingCreditBalance || 0) - debtCancel)
            : liveCust.outstandingCreditBalance;

          transaction.update(custRef, sanitizeForFirestore({
            totalSpent: newSpent,
            ...(newCreditBal !== undefined ? { outstandingCreditBalance: newCreditBal } : {}),
            updatedAt: nowIso,
          }));
          committedCustomerUpdate = {
            ...liveCust,
            totalSpent: newSpent,
            ...(newCreditBal !== undefined ? { outstandingCreditBalance: newCreditBal } : {}),
          };
        }

        if (creditRef && creditSnap && creditSnap.exists() && effectiveRefundAmount > 0) {
          const liveCredit = creditSnap.data() as CreditSaleRecord;
          const newRemBalance = Math.max(0, (liveCredit.remainingBalance || 0) - debtCancel);
          const newTotalPayable = Math.max(0, (liveCredit.totalPayable || 0) - effectiveRefundAmount);
          const newTotalPaid = Math.max(0, (liveCredit.totalPaid || 0) - cashBack);
          const newStatus = newRemBalance <= 0 ? 'paid' : liveCredit.status;
          transaction.update(creditRef, sanitizeForFirestore({
            remainingBalance: newRemBalance,
            totalPayable: newTotalPayable,
            totalPaid: newTotalPaid,
            status: newStatus,
            updatedAt: nowIso,
          }));
          committedCreditUpdate = {
            ...liveCredit,
            remainingBalance: newRemBalance,
            totalPayable: newTotalPayable,
            totalPaid: newTotalPaid,
            status: newStatus,
          };
        }

        // 7. Record Cash Drawer Outflow ONLY for cashBack actually paid out (R7, R9 & Item 8)
        if (drawerRef && cashBack > 0) {
          const activeSettings = StorageService.getSettings();
          const cashierId = activeSettings.currentStaffId || params.staffName || 'manager';
          const terminalId = StorageService.getTerminalId();
          const txEntry = {
            id: `tx-ref-${refundRecord.id}`,
            timestamp: nowIso,
            type: 'out' as const,
            entryType: 'refund' as const,
            description: `Refund Invoice #${liveSale.invoiceNumber} (${params.reason}) - ${refundItemsList.length} item(s) [Physical Cash Drawer]`,
            amount: cashBack,
            cashierId,
            terminalId,
          };
          const manualOutEntry = {
            reason: txEntry.description,
            amount: cashBack,
            time: nowIso,
            entryType: 'refund' as const,
            cashierId,
            terminalId,
          };
          const localDrawer = StorageService.getCashDrawer();
          const liveDrawer = drawerSnap && drawerSnap.exists() ? (drawerSnap.data() as CashDrawerRecord) : undefined;
          const activeShiftId = liveDrawer?.id || localDrawer.id || `shift-${nowIso.slice(0, 10)}`;

          // Write immutable per-shift drawer entry document (R9)
          const shiftEntryRef = doc(db, 'cashDrawerShifts', activeShiftId, 'entries', txEntry.id);
          transaction.set(shiftEntryRef, sanitizeForFirestore({
            ...txEntry,
            shiftId: activeShiftId,
            locationId: saleLocId,
            updatedAt: nowIso,
          }));

          if (liveDrawer) {
            transaction.update(drawerRef, {
              expectedInDrawer: increment(-cashBack),
              totalCashOut: increment(cashBack),
              cashOutManual: arrayUnion(sanitizeForFirestore(manualOutEntry)),
              transactions: arrayUnion(sanitizeForFirestore(txEntry)),
              syncedAt: nowIso,
            });
            committedDrawerUpdate = {
              ...liveDrawer,
              expectedInDrawer: Math.round((liveDrawer.expectedInDrawer || 0) - cashBack),
              totalCashOut: Math.round((liveDrawer.totalCashOut || 0) + cashBack),
              cashOutManual: [...(liveDrawer.cashOutManual || []), manualOutEntry],
              transactions: [txEntry, ...(liveDrawer.transactions || [])].slice(0, 500),
            };
          } else {
            const openingFloat = Math.round(Number(localDrawer.openingFloat || localDrawer.openingBalance || 0));
            const initializedDrawer: CashDrawerRecord = {
              id: activeShiftId,
              date: localDrawer.date || nowIso.slice(0, 10),
              openedAt: localDrawer.openedAt || nowIso,
              openedBy: localDrawer.openedBy || params.staffName || 'Manager',
              status: 'open',
              openingFloat,
              cashSales: 0,
              cashInManual: [],
              cashOutManual: [manualOutEntry],
              totalCashIn: 0,
              totalCashOut: cashBack,
              expectedInDrawer: Math.max(0, openingFloat - cashBack),
              transactions: [txEntry],
            };
            transaction.set(drawerRef, sanitizeForFirestore({ ...initializedDrawer, syncedAt: nowIso }), { merge: true });
            committedDrawerUpdate = initializedDrawer;
          }
        }

        // 8. Write Append-Only Audit Log
        const auditId = `audit-ref-${refundRecord.id}`;
        const auditRef = doc(db, 'auditLogs', auditId);
        transaction.set(auditRef, sanitizeForFirestore({
          id: auditId,
          timestamp: nowIso,
          staffId: params.staffName || 'admin',
          staffName: params.staffName || 'Admin',
          staffRole: 'Manager',
          actionType: 'SALE_REFUNDED',
          category: 'sales',
          severity: 'warning',
          summary: `Refunded ${effectiveRefundAmount.toLocaleString()} Ks for #${liveSale.invoiceNumber} via ${fundingSource === 'cash_drawer' ? 'Daily Cash Drawer' : `Digital Pool [${params.refundMethod}]`}`,
          details: {
            targetId: liveSale.id,
            invoiceNumber: liveSale.invoiceNumber,
            amount: effectiveRefundAmount,
            paymentMethod: params.refundMethod,
          },
        }));
      });

      // Item 7: Update local caches with triggerSync = false (never call StorageService.processItemRefund again after cloud transaction commits)
      if (committedSaleUpdate) {
        const localSales = StorageService.getSales();
        const idx = localSales.findIndex(s => s.id === (committedSaleUpdate as Sale).id);
        if (idx >= 0) {
          localSales[idx] = committedSaleUpdate;
        } else {
          localSales.unshift(committedSaleUpdate);
        }
        StorageService.saveSales(localSales, false);
      }
      if (committedProductUpdates.size > 0) {
        const localProds = StorageService.getProducts().map(p => committedProductUpdates.get(p.id) || p);
        StorageService.saveProducts(localProds, false);
      }
      if (committedCustomerUpdate) {
        StorageService.saveCustomer(committedCustomerUpdate, false);
      }
      if (committedCreditUpdate) {
        StorageService.saveCreditSale(committedCreditUpdate, false);
      }
      if (committedDrawerUpdate) {
        StorageService.saveCashDrawer(committedDrawerUpdate, false);
      }

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
      return { success: true };
    } catch (err: any) {
      console.error('[FirestoreSync] executeAtomicRefundTransaction failed:', err);
      return {
        success: false,
        error: err.message || 'Refund transaction failed due to a cloud validation conflict.',
      };
    }
  }

  // ==========================================
  // ATOMIC STOCK TRANSFERS (3-WAY HANDSHAKE)
  // ==========================================

  /**
   * Executes atomic Transfer Request:
   * Increments origin location reservedStock and records transfer in requested status.
   */
  public async executeAtomicTransferRequest(transfer: StockTransfer): Promise<{ success: boolean; error?: string }> {
    if (!FirebaseAuthService.isAuthenticated() || typeof navigator === 'undefined' || !navigator.onLine) {
      return { success: true };
    }

    try {
      await runTransaction(db, async (transaction) => {
        // Read origin branch inventory documents for all items
        const branchRefs: Array<{ ref: any; item: any; currentData?: BranchInventory }> = [];

        for (const item of transfer.items) {
          const bRef = doc(db, 'branch_inventory', `${item.productId}_${transfer.fromLocationId}`);
          const snap = await transaction.get(bRef);
          branchRefs.push({
            ref: bRef,
            item,
            currentData: snap.exists() ? (snap.data() as BranchInventory) : undefined,
          });
        }

        // Concurrency check: Ensure origin branch has enough available stock
        for (const b of branchRefs) {
          if (b.currentData) {
            const avail = b.currentData.availableStock ?? b.currentData.onHandStock ?? 0;
            if (avail < b.item.requestedQty) {
              throw new Error(
                `Transfer Request Conflict: "${b.item.productName}" only has ${avail} available units at ${transfer.fromLocationName}.`
              );
            }
          }
        }

        // Apply reservations
        for (const b of branchRefs) {
          const currentOnHand = b.currentData?.onHandStock ?? 0;
          const currentReserved = b.currentData?.reservedStock ?? 0;
          const newReserved = currentReserved + b.item.requestedQty;
          const newAvail = Math.max(0, currentOnHand - newReserved);

          transaction.set(b.ref, sanitizeForFirestore({
            id: `${b.item.productId}_${transfer.fromLocationId}`,
            productId: b.item.productId,
            locationId: transfer.fromLocationId,
            onHandStock: currentOnHand,
            reservedStock: newReserved,
            availableStock: newAvail,
            updatedAt: new Date().toISOString(),
          }), { merge: true });
        }

        // Write transfer record
        const trfRef = doc(db, 'stock_transfers', transfer.id);
        transaction.set(trfRef, sanitizeForFirestore(transfer));
      });

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
      return { success: true };
    } catch (err: any) {
      console.error('[FirestoreSync] executeAtomicTransferRequest error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Executes atomic Transfer Dispatch:
   * Decrements origin onHandStock, releases reservedStock, sets serial devices to 'in_transit'.
   */
  public async executeAtomicTransferDispatch(transfer: StockTransfer): Promise<{ success: boolean; error?: string }> {
    if (!FirebaseAuthService.isAuthenticated() || typeof navigator === 'undefined' || !navigator.onLine) {
      return { success: true };
    }

    try {
      await runTransaction(db, async (transaction) => {
        // Read and update origin branch inventory
        for (const item of transfer.items) {
          const bRef = doc(db, 'branch_inventory', `${item.productId}_${transfer.fromLocationId}`);
          const snap = await transaction.get(bRef);
          const current = snap.exists() ? (snap.data() as BranchInventory) : undefined;

          const currentOnHand = current?.onHandStock ?? item.dispatchedQty;
          const currentReserved = current?.reservedStock ?? item.requestedQty;
          const newOnHand = Math.max(0, currentOnHand - item.dispatchedQty);
          const newReserved = Math.max(0, currentReserved - item.requestedQty);

          transaction.set(bRef, sanitizeForFirestore({
            id: `${item.productId}_${transfer.fromLocationId}`,
            productId: item.productId,
            locationId: transfer.fromLocationId,
            onHandStock: newOnHand,
            reservedStock: newReserved,
            availableStock: Math.max(0, newOnHand - newReserved),
            updatedAt: new Date().toISOString(),
          }), { merge: true });

          // Update serialized IMEIs to 'in_transit'
          if (item.imeiList && item.imeiList.length > 0) {
            for (const imei of item.imeiList) {
              const devRef = doc(db, 'device_units', imei);
              transaction.set(devRef, sanitizeForFirestore({
                imei,
                productId: item.productId,
                currentLocationId: transfer.fromLocationId,
                status: 'in_transit',
                activeTransferId: transfer.id,
                updatedAt: new Date().toISOString(),
              }), { merge: true });
            }
          }
        }

        // Update transfer doc to dispatched
        const trfRef = doc(db, 'stock_transfers', transfer.id);
        transaction.set(trfRef, sanitizeForFirestore(transfer));
      });

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
      return { success: true };
    } catch (err: any) {
      console.error('[FirestoreSync] executeAtomicTransferDispatch error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Executes atomic Transfer Receive:
   * Increments destination onHandStock, updates serial devices to 'in_stock' at destination,
   * and auto-writes DamageLog if any discrepancy is detected.
   */
  public async executeAtomicTransferReceive(
    transfer: StockTransfer,
    damageLog?: DamageLog
  ): Promise<{ success: boolean; error?: string }> {
    if (!FirebaseAuthService.isAuthenticated() || typeof navigator === 'undefined' || !navigator.onLine) {
      return { success: true };
    }

    try {
      await runTransaction(db, async (transaction) => {
        // Increment destination branch inventory
        for (const item of transfer.items) {
          const bRef = doc(db, 'branch_inventory', `${item.productId}_${transfer.toLocationId}`);
          const snap = await transaction.get(bRef);
          const current = snap.exists() ? (snap.data() as BranchInventory) : undefined;

          const currentOnHand = current?.onHandStock ?? 0;
          const currentReserved = current?.reservedStock ?? 0;
          const newOnHand = currentOnHand + item.receivedQty;

          transaction.set(bRef, sanitizeForFirestore({
            id: `${item.productId}_${transfer.toLocationId}`,
            productId: item.productId,
            locationId: transfer.toLocationId,
            onHandStock: newOnHand,
            reservedStock: currentReserved,
            availableStock: Math.max(0, newOnHand - currentReserved),
            updatedAt: new Date().toISOString(),
          }), { merge: true });

          // Relocate verified IMEIs to destination
          const imeisToRelocate = item.receivedImeiList || item.imeiList || [];
          for (const imei of imeisToRelocate) {
            const devRef = doc(db, 'device_units', imei);
            transaction.set(devRef, sanitizeForFirestore({
              imei,
              productId: item.productId,
              currentLocationId: transfer.toLocationId,
              status: 'in_stock',
              activeTransferId: null,
              lastReceivedAt: new Date().toISOString(),
            }), { merge: true });
          }
        }

        // Update transfer doc
        const trfRef = doc(db, 'stock_transfers', transfer.id);
        transaction.set(trfRef, sanitizeForFirestore(transfer));

        // Auto-create DamageLog in transaction if transit discrepancy occurred
        if (damageLog?.id) {
          const dmgRef = doc(db, 'damageLogs', damageLog.id);
          transaction.set(dmgRef, sanitizeForFirestore(damageLog));
        }
      });

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
      return { success: true };
    } catch (err: any) {
      console.error('[FirestoreSync] executeAtomicTransferReceive error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Executes atomic Transfer Rejection:
   * Releases origin branch reservedStock.
   */
  public async executeAtomicTransferReject(transfer: StockTransfer): Promise<{ success: boolean; error?: string }> {
    if (!FirebaseAuthService.isAuthenticated() || typeof navigator === 'undefined' || !navigator.onLine) {
      return { success: true };
    }

    try {
      await runTransaction(db, async (transaction) => {
        for (const item of transfer.items) {
          const bRef = doc(db, 'branch_inventory', `${item.productId}_${transfer.fromLocationId}`);
          const snap = await transaction.get(bRef);
          if (snap.exists()) {
            const current = snap.data() as BranchInventory;
            const newReserved = Math.max(0, (current.reservedStock || 0) - item.requestedQty);
            transaction.update(bRef, {
              reservedStock: newReserved,
              availableStock: Math.max(0, (current.onHandStock || 0) - newReserved),
              updatedAt: new Date().toISOString(),
            });
          }
        }

        const trfRef = doc(db, 'stock_transfers', transfer.id);
        transaction.set(trfRef, sanitizeForFirestore(transfer));
      });

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
      return { success: true };
    } catch (err: any) {
      console.error('[FirestoreSync] executeAtomicTransferReject error:', err);
      return { success: false, error: err.message };
    }
  }

  // Multi-Branch Collection Pushes
  public async syncLocations(locations: StoreLocation[]): Promise<void> {
    const deletedIds = new Set(StorageService.getDeletedLocationIds());
    const valid = (locations || []).filter(l => l && l.id && !deletedIds.has(l.id));
    await this.batchWriteCollection('locations', valid, l => l.id);

    // Also sweep Firestore to purge any lingering deleted locations
    try {
      if (deletedIds.size > 0 && FirebaseAuthService.isAuthenticated()) {
        const snap = await getDocs(collection(db, 'locations'));
        const toDelete: any[] = [];
        snap.forEach(d => {
          if (deletedIds.has(d.id)) {
            toDelete.push(d.ref);
          }
        });
        if (toDelete.length > 0) {
          const batch = writeBatch(db);
          toDelete.forEach(ref => batch.delete(ref));
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn('[FirestoreSync] Failed to purge deleted locations from Firestore:', e);
    }
  }

  public async syncLocation(location: StoreLocation): Promise<void> {
    if (!location?.id) return;
    try {
      const docRef = doc(db, 'locations', location.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...location,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing location:', err?.message || err);
    }
  }

  public async deleteLocation(id: string): Promise<void> {
    if (!id) return;
    try {
      const docRef = doc(db, 'locations', id);
      await deleteDoc(docRef);

      // Also clean up any localized branch_inventory in Firestore for this location
      try {
        const invSnap = await getDocs(query(collection(db, 'branch_inventory'), where('locationId', '==', id)));
        if (!invSnap.empty) {
          const batch = writeBatch(db);
          invSnap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (invErr) {
        console.warn('[FirestoreSync] Clean branch_inventory on location delete:', invErr);
      }

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting location from Firestore:', err?.message || err);
    }
  }

  public async syncBranchInventoryList(list: BranchInventory[]): Promise<void> {
    await this.batchWriteCollection('branch_inventory', list, item => item.id);
  }

  public async syncStockTransfers(transfers: StockTransfer[]): Promise<void> {
    await this.batchWriteCollection('stock_transfers', transfers, t => t.id);
  }

  public async syncStockTransfer(transfer: StockTransfer): Promise<void> {
    if (!transfer?.id) return;
    try {
      const docRef = doc(db, 'stock_transfers', transfer.id);
      await setDoc(docRef, sanitizeForFirestore(transfer), { merge: true });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing transfer:', err?.message || err);
    }
  }

  // ==========================================
  // INDIVIDUAL REAL-TIME PUSH OPERATIONS
  // ==========================================

  /**
   * Replays offline-created pending sales through the full atomic Firestore transaction (R4):
   * Performs live stock oversell check, IMEI availability check, device_units status = 'sold',
   * sequential invoice/credit numbering, customer spend/credit increments, and cash drawer entry.
   * If a pending sale fails any cloud check, it is marked syncState = 'conflict' and placed in the
   * Manager Review Queue (offlineSaleConflicts/{sale.id}) rather than overwriting cloud inventory.
   */
  private isReplayingPendingSales = false;

  public async replayPendingSales(): Promise<void> {
    if (
      this.isReplayingPendingSales ||
      !FirebaseAuthService.isAuthenticated() ||
      typeof navigator === 'undefined' ||
      !navigator.onLine
    ) {
      return;
    }
    const pendingSales = StorageService.getSales().filter(s => s && s.id && s.syncState === 'pending');
    if (pendingSales.length === 0) return;

    this.isReplayingPendingSales = true;
    try {
      for (const pendingSale of pendingSales) {
        try {
          // Reconstruct cartItems for the atomic checkout transaction (idempotency is enforced inside runTransaction)
          const localProds = StorageService.getProducts();
          const cartItems = (pendingSale.items || []).map(item => {
            const foundProd = localProds.find(p => p.id === item.productId) || ({
              id: item.productId,
              name: item.name,
              brand: item.brand || '',
              model: item.name,
              category: item.category || 'accessories',
              condition: 'brand_new',
              sku: '',
              barcode: '',
              costPrice: item.costPrice || 0,
              sellingPrice: item.unitPrice || 0,
              stock: item.quantity,
              minStockAlert: 1,
            } as Product);
            return {
              product: foundProd,
              quantity: item.quantity,
              selectedImei: item.imei,
              selectedImei2: item.imei2,
            };
          });

          const linkedCredit = pendingSale.creditSaleId
            ? StorageService.getCreditSales().find(cs => cs.id === pendingSale.creditSaleId || cs.saleId === pendingSale.id)
            : undefined;
          const linkedCustomer = pendingSale.customerId
            ? StorageService.getCustomers().find(c => c.id === pendingSale.customerId)
            : undefined;

          const res = await this.executeAtomicSaleTransaction({
            cartItems,
            sale: pendingSale,
            creditRecord: linkedCredit,
            updatedCustomer: linkedCustomer,
            preOrderId: pendingSale.preOrderId,
          });

          if (res.success && res.cloudCommitted && res.finalizedSale) {
            const allLocal = StorageService.getSales();
            const idx = allLocal.findIndex(x => x.id === pendingSale.id);
            if (idx >= 0) {
              allLocal[idx] = { ...res.finalizedSale, syncState: 'synced', syncError: undefined };
              StorageService.saveSales(allLocal, false);
            }
            const remainingConflicts = StorageService.getOfflineSaleConflicts().filter(c => c.id !== pendingSale.id);
            StorageService.saveOfflineSaleConflicts(remainingConflicts);
          } else {
            const conflictReason = res.error || 'Offline sale failed cloud stock/IMEI/price validation during replay.';
            await this.queueOfflineSaleForManagerReview(pendingSale, conflictReason);
          }
        } catch (err: any) {
          const conflictReason = err?.message || 'Offline sale replay failed validation.';
          await this.queueOfflineSaleForManagerReview(pendingSale, conflictReason);
        }
      }
    } finally {
      this.isReplayingPendingSales = false;
    }
  }

  private async queueOfflineSaleForManagerReview(sale: Sale, reason: string): Promise<void> {
    const conflictedSale: Sale = {
      ...sale,
      syncState: 'conflict',
      syncError: reason,
    };
    const allLocal = StorageService.getSales();
    const idx = allLocal.findIndex(x => x.id === sale.id);
    if (idx >= 0) {
      allLocal[idx] = conflictedSale;
      StorageService.saveSales(allLocal, false);
    }
    const existingConflicts = StorageService.getOfflineSaleConflicts().filter(c => c.id !== sale.id);
    StorageService.saveOfflineSaleConflicts([conflictedSale, ...existingConflicts]);
    try {
      await setDoc(doc(db, 'offlineSaleConflicts', sale.id), sanitizeForFirestore({
        ...conflictedSale,
        flaggedAt: new Date().toISOString(),
      }), { merge: true });
    } catch {}
  }

  /**
   * Manager action 1 (Fix / Retry): Re-runs the full atomic sale transaction against current cloud stock/IMEI.
   */
  public async retryOfflineSaleConflict(sale: Sale): Promise<{ success: boolean; error?: string }> {
    const localProds = StorageService.getProducts();
    const cartItems = (sale.items || []).map(item => {
      const foundProd = localProds.find(p => p.id === item.productId) || ({
        id: item.productId,
        name: item.name,
        brand: item.brand || '',
        model: item.name,
        category: item.category || 'accessories',
        condition: 'brand_new',
        sku: '',
        barcode: '',
        costPrice: item.costPrice || 0,
        sellingPrice: item.unitPrice || 0,
        stock: Math.max(item.quantity, 1),
        minStockAlert: 1,
      } as Product);
      return {
        product: { ...foundProd, stock: Math.max(foundProd.stock || 0, item.quantity) },
        quantity: item.quantity,
        selectedImei: item.imei,
        selectedImei2: item.imei2,
      };
    });

    const linkedCredit = sale.creditSaleId
      ? StorageService.getCreditSales().find(cs => cs.id === sale.creditSaleId || cs.saleId === sale.id)
      : undefined;
    const linkedCustomer = sale.customerId
      ? StorageService.getCustomers().find(c => c.id === sale.customerId)
      : undefined;

    const res = await this.executeAtomicSaleTransaction({
      cartItems,
      sale,
      creditRecord: linkedCredit,
      updatedCustomer: linkedCustomer,
      preOrderId: sale.preOrderId,
    });

    if (res.success && res.cloudCommitted && res.finalizedSale) {
      const allLocal = StorageService.getSales();
      const idx = allLocal.findIndex(x => x.id === sale.id);
      if (idx >= 0) {
        allLocal[idx] = { ...res.finalizedSale, syncState: 'synced', syncError: undefined };
      } else {
        allLocal.unshift({ ...res.finalizedSale, syncState: 'synced', syncError: undefined });
      }
      StorageService.saveSales(allLocal, false);
      StorageService.saveOfflineSaleConflicts(
        StorageService.getOfflineSaleConflicts().filter(c => c.id !== sale.id)
      );
      try {
        await deleteDoc(doc(db, 'offlineSaleConflicts', sale.id));
      } catch {}
      return { success: true };
    }

    return {
      success: false,
      error: res.error || 'Cloud validation still failed. Check product stock or use Force Accept.',
    };
  }

  /**
   * Manager action 2 (Accept / Force Commit): Approves a conflicted offline sale when the item already physically left the store,
   * clamps cloud stock at >= 0, commits the sale to sales/{id}, and removes it from offlineSaleConflicts/{id}.
   */
  public async forceAcceptOfflineSaleConflict(sale: Sale, resolvedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const nowIso = new Date().toISOString();
      const saleLocId = sale.locationId || StorageService.getActiveLocationId();
      const acceptedSale: Sale = {
        ...sale,
        syncState: 'synced',
        syncError: undefined,
      };

      await runTransaction(db, async (tx) => {
        const saleDocRef = doc(db, 'sales', sale.id);
        const existingSaleSnap = await tx.get(saleDocRef);

        const distinctProductIds = Array.from(new Set((sale.items || []).map(i => i.productId)));
        const prodSnaps = new Map<string, any>();
        for (const pid of distinctProductIds) {
          const pRef = doc(db, 'products', pid);
          prodSnaps.set(pid, await tx.get(pRef));
        }

        if (!existingSaleSnap.exists()) {
          for (const pid of distinctProductIds) {
            const pSnap = prodSnaps.get(pid);
            if (pSnap && pSnap.exists()) {
              const liveProd = pSnap.data() as Product;
              const qtySold = (sale.items || [])
                .filter(i => i.productId === pid)
                .reduce((s, i) => s + (Number(i.quantity) || 1), 0);
              const soldImeis = new Set(
                (sale.items || [])
                  .filter(i => i.productId === pid)
                  .flatMap(i => [i.imei, i.imei2].filter(Boolean) as string[])
              );
              const newStock = Math.max(0, Number(liveProd.stock || 0) - qtySold);
              const nextImeis = Array.isArray(liveProd.imeiList)
                ? liveProd.imeiList.filter(im => !soldImeis.has(im))
                : undefined;
              tx.update(doc(db, 'products', pid), sanitizeForFirestore({
                stock: newStock,
                ...(nextImeis !== undefined ? { imeiList: nextImeis } : {}),
                updatedAt: nowIso,
              }));
            }
          }

          tx.set(saleDocRef, sanitizeForFirestore({
            ...acceptedSale,
            locationId: saleLocId,
            conflictResolvedBy: resolvedBy,
            conflictResolvedAt: nowIso,
            syncedAt: nowIso,
          }));
        }

        tx.delete(doc(db, 'offlineSaleConflicts', sale.id));

        const auditId = `audit-conflict-accept-${sale.id}-${Date.now()}`;
        tx.set(doc(db, 'auditLogs', auditId), sanitizeForFirestore({
          id: auditId,
          timestamp: nowIso,
          staffId: resolvedBy,
          staffName: resolvedBy,
          staffRole: 'Manager',
          actionType: 'OFFLINE_SALE_CONFLICT_ACCEPTED',
          category: 'sales',
          severity: 'warning',
          summary: `Accepted offline conflicted sale #${sale.invoiceNumber} (${Math.round(sale.grandTotal).toLocaleString()} Ks)`,
          details: {
            targetId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            previousConflictReason: sale.syncError || '',
          },
        }));
      });

      const allLocal = StorageService.getSales();
      const idx = allLocal.findIndex(x => x.id === sale.id);
      if (idx >= 0) {
        allLocal[idx] = acceptedSale;
      } else {
        allLocal.unshift(acceptedSale);
      }
      StorageService.saveSales(allLocal, false);
      StorageService.saveOfflineSaleConflicts(
        StorageService.getOfflineSaleConflicts().filter(c => c.id !== sale.id)
      );

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to accept offline sale conflict.' };
    }
  }

  /**
   * Manager action 3 (Void): Cancels and removes a conflicted offline sale from the queue.
   */
  public async voidOfflineSaleConflict(sale: Sale, reason: string, resolvedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const nowIso = new Date().toISOString();
      try {
        await deleteDoc(doc(db, 'offlineSaleConflicts', sale.id));
        const auditId = `audit-conflict-void-${sale.id}-${Date.now()}`;
        await setDoc(doc(db, 'auditLogs', auditId), sanitizeForFirestore({
          id: auditId,
          timestamp: nowIso,
          staffId: resolvedBy,
          staffName: resolvedBy,
          staffRole: 'Manager',
          actionType: 'OFFLINE_SALE_CONFLICT_VOIDED',
          category: 'sales',
          severity: 'warning',
          summary: `Voided offline conflicted sale #${sale.invoiceNumber}: ${reason}`,
          details: {
            targetId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            previousConflictReason: sale.syncError || '',
            voidReason: reason,
          },
        }));
      } catch {}

      const allLocal = StorageService.getSales().filter(x => x.id !== sale.id);
      StorageService.saveSales(allLocal, false);
      StorageService.saveOfflineSaleConflicts(
        StorageService.getOfflineSaleConflicts().filter(c => c.id !== sale.id)
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to void offline sale conflict.' };
    }
  }

  public async replayPendingOfflineRefunds(): Promise<void> {
    if (!FirebaseAuthService.isAuthenticated() || typeof navigator === 'undefined' || !navigator.onLine) {
      return;
    }
    const queuedRefunds = StorageService.getPendingOfflineRefunds();
    if (queuedRefunds.length === 0) return;

    for (const refundParams of queuedRefunds) {
      const res = await this.executeAtomicRefundTransaction(refundParams);
      if (res.success) {
        StorageService.dequeuePendingOfflineRefund(refundParams.saleId);
      }
    }
  }

  public async syncSale(sale: Sale): Promise<void> {
    if (!sale?.id) return;
    if (sale.syncState === 'pending') {
      await this.replayPendingSales();
      return;
    }
    try {
      const docRef = doc(db, 'sales', sale.id);
      const syncedSale: Sale = {
        ...sale,
        syncState: 'synced',
      };
      await setDoc(docRef, sanitizeForFirestore({
        ...syncedSale,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing sale:', err?.message || err);
    }
  }

  public async syncSales(sales: Sale[]): Promise<void> {
    const MOCK_IDS = new Set(['sale-1', 'sale-2', 'sale-3', 'sale-4', 'sale-5', 'sale-6']);
    const cleanSales = sales.filter(s => !MOCK_IDS.has(s.id) && !s.soldBy?.includes('Ko Min Thu'));
    await this.batchWriteCollection('sales', cleanSales, s => s.id);
  }

  public async deleteSale(id: string): Promise<void> {
    if (!id) return;
    try {
      const nowIso = new Date().toISOString();
      const docRef = doc(db, 'sales', id);
      await setDoc(docRef, sanitizeForFirestore({
        status: 'voided',
        archived: true,
        voidedAt: nowIso,
        syncedAt: nowIso,
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error voiding sale:', err?.message || err);
    }
  }

  public async deleteSales(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      for (const id of ids) {
        if (id) {
          batch.set(doc(db, 'sales', id), sanitizeForFirestore({
            status: 'voided',
            archived: true,
            voidedAt: nowIso,
            syncedAt: nowIso,
          }), { merge: true });
        }
      }
      await batch.commit();
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error voiding sales batch:', err?.message || err);
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
      const nowIso = new Date().toISOString();
      const docRef = doc(db, 'products', product.id);
      const existingSnap = await getDoc(docRef);

      if (existingSnap.exists()) {
        // R5: Exclude inventory fields (stock, imeiList, imeiPairs, quarantinedStock, quarantinedImeis) from catalog edits
        // so renaming or repricing a product never overwrites cloud stock or resurrects sold IMEIs
        const {
          stock: _stock,
          imeiList: _imeiList,
          imeiPairs: _imeiPairs,
          quarantinedStock: _quarantinedStock,
          quarantinedImeis: _quarantinedImeis,
          ...catalogFields
        } = product;
        await setDoc(docRef, sanitizeForFirestore({
          ...catalogFields,
          archived: false,
          syncedAt: nowIso,
        }), { merge: true });
      } else {
        // Brand-new product creation initializes initial stock and IMEIs
        await setDoc(docRef, sanitizeForFirestore({
          ...product,
          archived: false,
          syncedAt: nowIso,
        }), { merge: true });
      }

      // Item 10: Only sync quarantinedImeis to device_units on generic product edits; never overwrite activeImeis to 'in_stock' here so concurrently sold IMEIs are never flipped back to 'in_stock'
      const quarantinedImeis = Array.isArray(product.quarantinedImeis) ? product.quarantinedImeis.filter(Boolean) : [];
      if (quarantinedImeis.length > 0) {
        const activeLocId = StorageService.getActiveLocationId();
        const activeLocName = StorageService.getLocations().find(l => l.id === activeLocId)?.name || 'Main Store';
        const batch = writeBatch(db);
        let ops = 0;
        for (const qImei of quarantinedImeis.slice(0, 100)) {
          const cleanQImei = String(qImei).trim();
          if (!cleanQImei) continue;
          batch.set(doc(db, 'device_units', cleanQImei), sanitizeForFirestore({
            imei: cleanQImei,
            productId: product.id,
            productName: product.name,
            brand: product.brand || '',
            category: product.category || '',
            status: 'quarantined',
            locationId: activeLocId,
            locationName: activeLocName,
            updatedAt: nowIso,
          }), { merge: true });
          ops++;
        }
        if (ops > 0) {
          await batch.commit().catch(() => {});
        }
      }

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing product:', err?.message || err);
    }
  }

  public async syncProductPrice(productId: string, sellingPrice: number, costPrice?: number): Promise<void> {
    if (!productId) return;
    try {
      const docRef = doc(db, 'products', productId);
      const nowIso = new Date().toISOString();
      await setDoc(docRef, sanitizeForFirestore({
        sellingPrice: Math.round(Number(sellingPrice) || 0),
        ...(costPrice !== undefined ? { costPrice: Math.round(Number(costPrice) || 0) } : {}),
        updatedAt: nowIso,
        syncedAt: nowIso,
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing product price:', err?.message || err);
    }
  }

  public async syncProducts(products: Product[]): Promise<void> {
    const deletedIds = new Set(StorageService.getDeletedProductIds());
    const clean = (products || []).filter(p => p && p.id && !isMockProduct(p) && !deletedIds.has(p.id));
    await this.batchWriteCollection('products', clean, p => p.id);

    // Also sweep Firestore to purge any lingering deleted products
    try {
      if (deletedIds.size > 0 && FirebaseAuthService.isAuthenticated()) {
        const snap = await getDocs(collection(db, 'products'));
        const toDelete: any[] = [];
        snap.forEach(d => {
          if (deletedIds.has(d.id) && !(d.data() as any)?.archived) {
            toDelete.push(d.ref);
          }
        });
        if (toDelete.length > 0) {
          const batch = writeBatch(db);
          const nowIso = new Date().toISOString();
          toDelete.forEach(ref => batch.set(ref, { archived: true, deletedAt: nowIso }, { merge: true }));
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn('[FirestoreSync] Failed to archive deleted products in Firestore:', e);
    }
  }

  public async deleteProduct(id: string): Promise<void> {
    if (!id) return;
    try {
      const docRef = doc(db, 'products', id);
      await setDoc(docRef, sanitizeForFirestore({
        id,
        archived: true,
        deletedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error archiving deleted product:', err?.message || err);
    }
  }

  public async syncSettings(settings: ShopSettings): Promise<void> {
    try {
      const cleanSettings = { ...settings };
      // Strip terminal-local session staff identifiers before syncing store-wide global settings
      delete (cleanSettings as any).currentStaffId;
      delete (cleanSettings as any).currentStaffName;
      delete (cleanSettings as any).currentStaffRole;

      const docRef = doc(db, 'settings', 'global');
      await setDoc(docRef, sanitizeForFirestore({
        ...cleanSettings,
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

  /**
   * One-time and continuous cloud migration (R3):
   * Converts any leftover plaintext pin/password or weak hash on /staffUsers documents to salted PBKDF2-SHA256
   * and explicitly removes pin and password from Firestore via deleteField().
   */
  public async migrateStaffPlaintextCredentials(): Promise<void> {
    if (!FirebaseAuthService.isAuthenticated()) return;
    const currentRole = StorageService.getSettings()?.currentStaffRole;
    if (currentRole !== 'Owner') return;
    try {
      const snap = await getDocs(collection(db, 'staffUsers'));
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (!data || isMockStaffUser(data)) continue;
        const hasPlaintext = data.pin !== undefined || data.password !== undefined;
        const needsPbkdf2 = !data.credentialHash || !String(data.credentialHash).startsWith('pbkdf2_') || !data.credentialSalt;

        if (hasPlaintext || needsPbkdf2) {
          const rawSecret = String(data.password || data.pin || '').trim();
          const updatePayload: Record<string, any> = {
            pin: deleteField(),
            password: deleteField(),
            updatedAt: new Date().toISOString(),
          };
          if (rawSecret) {
            const pbkdf2 = await FirebaseAuthService.derivePbkdf2Hash(rawSecret, data.credentialSalt, data.credentialIterations);
            updatePayload.credentialHash = pbkdf2.credentialHash;
            updatePayload.credentialSalt = pbkdf2.credentialSalt;
            updatePayload.credentialIterations = pbkdf2.credentialIterations;
          }
          await updateDoc(d.ref, updatePayload).catch(() => {});
        }

        if (data.firebaseUid && data.role) {
          await setDoc(doc(db, 'staffAccess', data.firebaseUid), {
            uid: data.firebaseUid,
            staffId: data.id || d.id,
            username: data.username || '',
            name: data.name || '',
            role: data.role,
            email: data.email || '',
            active: data.active !== false,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[FirestoreSync] migrateStaffPlaintextCredentials notice:', err);
    }
  }

  public async syncStaffUsers(staff: StaffUser[]): Promise<void> {
    const cleanStaff: StaffUser[] = [];
    for (const u of staff) {
      if (!u || isMockStaffUser(u)) continue;
      let credentialHash = u.credentialHash;
      let credentialSalt = u.credentialSalt;
      let credentialIterations = u.credentialIterations;
      const rawCred = (u.password || u.pin || '').trim();
      if (rawCred && (!credentialHash || !credentialHash.startsWith('pbkdf2_') || !credentialSalt)) {
        const pbkdf2 = await FirebaseAuthService.derivePbkdf2Hash(rawCred, credentialSalt, credentialIterations);
        credentialHash = pbkdf2.credentialHash;
        credentialSalt = pbkdf2.credentialSalt;
        credentialIterations = pbkdf2.credentialIterations;
      }
      const sanitizedUser: Record<string, any> = {
        ...u,
        ...(credentialHash ? { credentialHash } : {}),
        ...(credentialSalt ? { credentialSalt } : {}),
        ...(credentialIterations ? { credentialIterations } : {}),
      };
      delete sanitizedUser.password;
      delete sanitizedUser.pin;
      cleanStaff.push(sanitizedUser as StaffUser);
    }
    await this.batchWriteCollection('staffUsers', cleanStaff, u => u.id);

    // R3: Explicitly remove any existing pin/password fields on Firestore documents via deleteField()
    for (const u of cleanStaff) {
      try {
        await updateDoc(doc(db, 'staffUsers', u.id), {
          pin: deleteField(),
          password: deleteField(),
        });
        if (u.firebaseUid) {
          await setDoc(doc(db, 'staffAccess', u.firebaseUid), {
            uid: u.firebaseUid,
            staffId: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            email: u.email || FirebaseAuthService.getAuthEmail(u),
            active: u.active !== false,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      } catch {}
    }
  }

  /**
   * Fetches all registered staff users directly from Firestore /staffUsers
   * and merges them into local StorageService.
   */
  public async fetchStaffUsersFromFirestore(): Promise<StaffUser[]> {
    try {
      const snap = await getDocs(collection(db, 'staffUsers'));
      const localMap = new Map(StorageService.getStaffUsers().map(u => [u.id, u]));
      const remoteStaff: StaffUser[] = [];
      snap.forEach(d => {
        const data = d.data() as StaffUser;
        if (data && !isMockStaffUser(data)) {
          const staffId = data.id || d.id;
          const existingLocal = localMap.get(staffId);
          remoteStaff.push({
            ...data,
            id: staffId,
            active: data.active !== false,
            pin: '',
            password: undefined,
            credentialHash: data.credentialHash || existingLocal?.credentialHash,
            credentialSalt: data.credentialSalt || existingLocal?.credentialSalt,
            credentialIterations: data.credentialIterations || existingLocal?.credentialIterations,
          });
        }
      });
      if (remoteStaff.length > 0) {
        const local = StorageService.getStaffUsers();
        const merged = [...local];
        remoteStaff.forEach(r => {
          const idx = merged.findIndex(m => m.id === r.id);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...r, pin: '', password: undefined };
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
            pin: '',
            password: undefined,
            credentialHash: u.credentialHash,
            credentialSalt: u.credentialSalt,
            credentialIterations: u.credentialIterations,
            firebaseUid: u.firebaseUid,
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
   * to ensure credentials and PIN hash are 100% current.
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
            pin: '',
            password: undefined,
            credentialHash: u.credentialHash,
            credentialSalt: u.credentialSalt,
            credentialIterations: u.credentialIterations,
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

  private hasPurgedRemoteMockData = false;

  public async purgeAllRemoteMockData(): Promise<void> {
    if (!FirebaseAuthService.hasFirebaseSession() || this.hasPurgedRemoteMockData) return;
    const currentRole = StorageService.getSettings()?.currentStaffRole || 'Owner';
    if (currentRole !== 'Owner' && currentRole !== 'Manager') return;
    this.hasPurgedRemoteMockData = true;

    try {
      if (currentRole === 'Owner') {
        await this.purgeMockStaffUsersFromFirestore();
      }

      // 1. Purge purchases
      const pSnap = await getDocs(collection(db, 'purchases'));
      for (const d of pSnap.docs) {
        if (isMockPurchase({ id: d.id, ...d.data() })) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }

      // 2. Purge expenses
      const eSnap = await getDocs(collection(db, 'expenses'));
      for (const d of eSnap.docs) {
        if (isMockExpense({ id: d.id, ...d.data() })) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }

      // 3. Purge announcements
      const aSnap = await getDocs(collection(db, 'announcements'));
      for (const d of aSnap.docs) {
        if (isMockAnnouncement({ id: d.id, ...d.data() })) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }

      // 4. Purge stock transfers
      const tSnap = await getDocs(collection(db, 'stock_transfers'));
      for (const d of tSnap.docs) {
        if (isMockStockTransfer({ id: d.id, ...d.data() })) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }

      // 5. Purge mock customers & suppliers (Note: sales, auditLogs, and activityLogs are immutable/append-only per R4 and are filtered in-memory)
      const cSnap = await getDocs(collection(db, 'customers'));
      for (const d of cSnap.docs) {
        if (isMockCustomer({ id: d.id, ...d.data() })) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
      const supSnap = await getDocs(collection(db, 'suppliers'));
      for (const d of supSnap.docs) {
        if (isMockSupplier({ id: d.id, ...d.data() })) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }

      // 6. Cash Drawer
      const drawerSnap = await getDoc(doc(db, 'cashDrawer', 'current'));
      if (drawerSnap.exists() && isMockCashDrawer(drawerSnap.data() as CashDrawerRecord)) {
        await setDoc(doc(db, 'cashDrawer', 'current'), StorageService.getCashDrawer()).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[FirestoreSync] purgeAllRemoteMockData error:', err?.message || err);
    }
  }

  public async syncStaffUser(staff: StaffUser): Promise<void> {
    try {
      const docRef = doc(db, 'staffUsers', staff.id);
      let credentialHash = staff.credentialHash;
      let credentialSalt = staff.credentialSalt;
      let credentialIterations = staff.credentialIterations;
      const rawCred = (staff.password || staff.pin || '').trim();
      if (rawCred && (!credentialHash || !credentialHash.startsWith('pbkdf2_') || !credentialSalt)) {
        const pbkdf2 = await FirebaseAuthService.derivePbkdf2Hash(rawCred, credentialSalt, credentialIterations);
        credentialHash = pbkdf2.credentialHash;
        credentialSalt = pbkdf2.credentialSalt;
        credentialIterations = pbkdf2.credentialIterations;
      }
      const sanitized: Record<string, any> = {
        ...staff,
        ...(credentialHash ? { credentialHash } : {}),
        ...(credentialSalt ? { credentialSalt } : {}),
        ...(credentialIterations ? { credentialIterations } : {}),
        updatedAt: new Date().toISOString(),
      };
      delete sanitized.pin;
      delete sanitized.password;

      await setDoc(docRef, sanitizeForFirestore(sanitized), { merge: true });
      // Explicitly remove any legacy plaintext pin/password stored in Firestore (R3)
      await updateDoc(docRef, {
        pin: deleteField(),
        password: deleteField(),
      }).catch(() => {});

      if (staff.firebaseUid) {
        await setDoc(doc(db, 'staffAccess', staff.firebaseUid), {
          uid: staff.firebaseUid,
          staffId: staff.id,
          username: staff.username,
          name: staff.name,
          role: staff.role,
          email: staff.email || FirebaseAuthService.getAuthEmail(staff),
          active: staff.active !== false,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }

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

  /**
   * R9: Atomically records an individual cash drawer entry without overwriting the shared cashDrawer/current document.
   * 1. Writes an idempotent document at cashDrawerShifts/{shiftId}/entries/{entry.id} with cashierId and terminalId.
   * 2. Applies delta increments (increment() + arrayUnion()) to cashDrawer/current so concurrent terminals never overwrite each other.
   */
  public async syncCashDrawerEntry(params: {
    shiftId: string;
    entry: {
      id: string;
      timestamp: string;
      type: 'in' | 'out';
      entryType: 'manual' | 'sale' | 'expense' | 'refund';
      description: string;
      amount: number;
      cashierId: string;
      terminalId: string;
    };
    isSaleCash?: boolean;
  }): Promise<void> {
    if (!params?.entry?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const { shiftId, entry, isSaleCash } = params;
      const roundedAmt = Math.round(Number(entry.amount) || 0);
      if (roundedAmt <= 0) return;

      const activeShiftId = shiftId || `shift-${nowIso.slice(0, 10)}`;
      const entryRef = doc(db, 'cashDrawerShifts', activeShiftId, 'entries', entry.id);
      const drawerRef = doc(db, 'cashDrawer', 'current');

      await runTransaction(db, async (tx) => {
        const existingEntrySnap = await tx.get(entryRef);
        const drawerSnap = await tx.get(drawerRef);

        // Idempotency guard: if this exact entry ID already exists in Firestore, do not double-increment
        if (existingEntrySnap.exists()) {
          return;
        }

        tx.set(entryRef, sanitizeForFirestore({
          ...entry,
          amount: roundedAmt,
          shiftId: activeShiftId,
          updatedAt: nowIso,
        }));

        const isIn = entry.type === 'in';
        const signedDelta = isIn ? roundedAmt : -roundedAmt;
        const manualItem = {
          reason: entry.description,
          amount: roundedAmt,
          time: entry.timestamp || nowIso,
          entryType: entry.entryType,
          cashierId: entry.cashierId,
          terminalId: entry.terminalId,
        };

        if (drawerSnap.exists()) {
          const updateFields: Record<string, any> = {
            expectedInDrawer: increment(signedDelta),
            transactions: arrayUnion(sanitizeForFirestore(entry)),
            lastSyncedAt: nowIso,
          };
          if (isIn) {
            updateFields.totalCashIn = increment(roundedAmt);
            if (isSaleCash) {
              updateFields.cashSales = increment(roundedAmt);
            } else {
              updateFields.cashInManual = arrayUnion(sanitizeForFirestore(manualItem));
            }
          } else {
            updateFields.totalCashOut = increment(roundedAmt);
            updateFields.cashOutManual = arrayUnion(sanitizeForFirestore(manualItem));
          }
          tx.update(drawerRef, updateFields);
        } else {
          const localDrawer = StorageService.getCashDrawer();
          const openingFloat = Math.round(Number(localDrawer.openingFloat || localDrawer.openingBalance || 0));
          tx.set(drawerRef, sanitizeForFirestore({
            id: activeShiftId,
            date: localDrawer.date || nowIso.slice(0, 10),
            openedAt: localDrawer.openedAt || nowIso,
            openedBy: localDrawer.openedBy || entry.cashierId || 'Staff',
            status: 'open',
            openingFloat,
            cashSales: isIn && isSaleCash ? roundedAmt : 0,
            cashInManual: isIn && !isSaleCash ? [manualItem] : [],
            cashOutManual: !isIn ? [manualItem] : [],
            totalCashIn: isIn ? roundedAmt : 0,
            totalCashOut: !isIn ? roundedAmt : 0,
            expectedInDrawer: openingFloat + signedDelta,
            transactions: [entry],
            lastSyncedAt: nowIso,
          }), { merge: true });
        }
      });

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing cash drawer entry delta:', err?.message || err);
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

  public async syncClosedCashDrawerShift(shift: CashDrawerRecord): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      const shiftId = shift.id || `shift-${shift.date || nowIso.slice(0, 10)}-${Date.now()}`;
      const drawerRef = doc(db, 'cashDrawer', 'current');
      const shiftDocRef = doc(db, 'cashDrawerShifts', shiftId);
      const roundedCounted = Math.round(Number(shift.actualCounted) || 0);

      // R9: Close shift inside a transaction reading the authoritative cloud expectedInDrawer so variance is never computed from a stale local drawer
      await runTransaction(db, async (tx) => {
        const drawerSnap = await tx.get(drawerRef);
        const liveDrawer = drawerSnap.exists() ? (drawerSnap.data() as CashDrawerRecord) : shift;
        const authoritativeExpected = Math.round(Number(liveDrawer.expectedInDrawer ?? shift.expectedInDrawer ?? 0));
        const authoritativeVariance = Math.round(roundedCounted - authoritativeExpected);

        const closedPayload = sanitizeForFirestore({
          ...liveDrawer,
          id: shiftId,
          status: 'closed',
          closedAt: shift.closedAt || nowIso,
          closedBy: shift.closedBy || liveDrawer.closedBy || 'Manager',
          actualCounted: roundedCounted,
          expectedInDrawer: authoritativeExpected,
          variance: authoritativeVariance,
          closingNotes: shift.closingNotes || '',
          archivedAt: nowIso,
          lastSyncedAt: nowIso,
        });

        tx.set(drawerRef, closedPayload, { merge: true });
        tx.set(shiftDocRef, closedPayload, { merge: true });
      });

      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error archiving closed cash drawer shift:', err?.message || err);
    }
  }

  public async syncSocialMarketingState(state: any): Promise<void> {
    if (!state) return;
    try {
      const docRef = doc(db, 'socialMarketing', 'state');
      await setDoc(docRef, sanitizeForFirestore({
        ...state,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing social marketing state:', err?.message || err);
    }
  }

  public async syncPreOrders(preOrders: PreOrder[]): Promise<void> {
    await this.batchWriteCollection('preOrders', preOrders, po => po.id);
  }

  public async syncStockAdjustment(adj: StockAdjustment): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      // R5: Always apply stock adjustments via an atomic Firestore transaction using increment(delta)
      await runTransaction(db, async (tx) => {
        const prodRef = doc(db, 'products', adj.productId);
        const prodSnap = await tx.get(prodRef);
        const adjRef = doc(db, 'stockAdjustments', adj.id);
        const existingAdjSnap = await tx.get(adjRef);

        // Only apply the stock delta if this adjustment hasn't already been committed
        if (!existingAdjSnap.exists() && prodSnap.exists()) {
          const liveProd = prodSnap.data() as Product;
          const curStock = Number(liveProd.stock ?? 0);
          const delta = Number(adj.quantityChange || 0);
          if (curStock + delta < 0) {
            throw new Error(`INSUFFICIENT_STOCK: Cannot reduce stock of "${liveProd.name}" by ${Math.abs(delta)} (current cloud stock: ${curStock}).`);
          }
          const prodUpdate: Record<string, any> = {
            stock: increment(delta),
            updatedAt: nowIso,
            lastModifiedAt: nowIso,
          };
          if (adj.imeiList && adj.imeiList.length > 0) {
            if (adj.type === 'reduce' || adj.reason === 'damaged' || adj.reason === 'return_supplier' || adj.reason === 'sample') {
              const removedSet = new Set(adj.imeiList);
              if (liveProd.imeiList) {
                prodUpdate.imeiList = liveProd.imeiList.filter(im => !removedSet.has(im));
              }
              if (liveProd.imeiPairs) {
                prodUpdate.imeiPairs = liveProd.imeiPairs.filter(pair => !removedSet.has(pair.imei1) && (!pair.imei2 || !removedSet.has(pair.imei2)));
              }
            } else if (adj.type === 'add' || adj.reason === 'restock') {
              const merged = Array.from(new Set([...(liveProd.imeiList || []), ...adj.imeiList]));
              prodUpdate.imeiList = merged;
            }
          }
          tx.update(prodRef, sanitizeForFirestore(prodUpdate));
        }

        tx.set(adjRef, sanitizeForFirestore({
          ...adj,
          updatedAt: nowIso,
        }), { merge: true });
      });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing stock adjustment:', err?.message || err);
    }
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

  public async syncMonthlyCapitalSnapshot(snapshot: MonthlyCapitalSnapshot): Promise<void> {
    if (!snapshot?.monthYM) return;
    try {
      const docRef = doc(db, 'monthlyCapitalSnapshots', snapshot.monthYM);
      await setDoc(docRef, sanitizeForFirestore({
        ...snapshot,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing monthly capital snapshot:', err?.message || err);
    }
  }

  public async syncCashTransfers(transfers: CapitalCashTransfer[]): Promise<void> {
    await this.batchWriteCollection('capitalCashTransfers', transfers, t => t.id);
  }

  public async syncFocDistribution(record: FocDistributionRecord): Promise<void> {
    if (!record?.id) return;
    try {
      const docRef = doc(db, 'focDistributions', record.id);
      await setDoc(docRef, sanitizeForFirestore({
        ...record,
        syncedAt: new Date().toISOString(),
      }), { merge: true });
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing FOC distribution:', err?.message || err);
    }
  }

  public async deleteFocDistribution(id: string): Promise<void> {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'focDistributions', id));
      this.updateStatus({ lastSyncedAt: new Date(), error: null });
    } catch (err: any) {
      console.warn('[FirestoreSync] Error deleting FOC distribution:', err?.message || err);
    }
  }

  public async syncStockTransferDeviceUnits(params: {
    transferId: string;
    transferNumber: string;
    action: 'dispatch' | 'receive';
    locationId: string;
    locationName: string;
    imeiList: string[];
    missingImeis?: string[];
  }): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      let count = 0;

      for (const imei of params.imeiList || []) {
        const clean = imei?.trim();
        if (!clean) continue;
        batch.set(doc(db, 'device_units', clean), sanitizeForFirestore({
          id: clean,
          imei1: clean,
          status: params.action === 'dispatch' ? 'in_transit' : 'in_stock',
          locationId: params.locationId,
          locationName: params.locationName,
          lastTransferId: params.transferId,
          lastTransferNumber: params.transferNumber,
          updatedAt: nowIso,
          syncedAt: nowIso,
        }), { merge: true });
        count++;
      }

      for (const missingImei of params.missingImeis || []) {
        const clean = missingImei?.trim();
        if (!clean) continue;
        batch.set(doc(db, 'device_units', clean), sanitizeForFirestore({
          id: clean,
          imei1: clean,
          status: 'quarantined',
          locationId: params.locationId,
          locationName: params.locationName,
          lastTransferId: params.transferId,
          lastTransferNumber: params.transferNumber,
          updatedAt: nowIso,
          syncedAt: nowIso,
        }), { merge: true });
        count++;
      }

      if (count > 0) {
        await batch.commit();
        this.updateStatus({ lastSyncedAt: new Date(), error: null });
      }
    } catch (err: any) {
      console.warn('[FirestoreSync] Error syncing stock transfer device units:', err?.message || err);
    }
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
    if (this.isFlushingLogs) {
      return { flushed: 0, remaining: this.getPendingAuditLogs().length };
    }

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

    this.isFlushingLogs = true;
    console.log(`[FirestoreSync] Flushing ${pending.length} queued activity logs to Firestore...`);
    let flushedCount = 0;
    const remaining: AuditLogEntry[] = [];

    try {
      // Chunk into batches of 40 (each log writes to activityLogs + auditLogs, so 80 operations per batch)
      const BATCH_CHUNK_SIZE = 40;
      for (let i = 0; i < pending.length; i += BATCH_CHUNK_SIZE) {
        const chunk = pending.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const log of chunk) {
          if (!log?.id) continue;
          const sanitized = sanitizeForFirestore({
            ...log,
            expireAt: log.expireAt || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            syncedAt: new Date().toISOString()
          });
          const actRef = doc(db, 'activityLogs', log.id);
          const audRef = doc(db, 'auditLogs', log.id);
          batch.set(actRef, sanitized, { merge: true });
          batch.set(audRef, sanitized, { merge: true });
        }

        try {
          await batch.commit();
          flushedCount += chunk.length;
        } catch (batchErr: any) {
          console.warn('[FirestoreSync] Batch commit error during log flush:', batchErr?.message || batchErr);
          remaining.push(...chunk);
        }
      }
    } finally {
      this.isFlushingLogs = false;
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
          batch.set(actRef, sanitized, { merge: true });
          batch.set(audRef, sanitized, { merge: true });
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

      const locations = StorageService.getLocations();
      await this.syncLocations(locations);
      const branchInventory = StorageService.getBranchInventoryList();
      await this.syncBranchInventoryList(branchInventory);
      const stockTransfers = StorageService.getStockTransfers();
      await this.syncStockTransfers(stockTransfers);

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
      'activityLogs',
      'auditLogs',
    ];

    try {
      let totalDeleted = 0;
      this.isProcessingRemoteSnapshot = true;

      // Clear local pending audit log queue so wiped test logs are not re-queued
      this.savePendingAuditLogs([]);

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

      // Seed initialization log in auditLogs and activityLogs
      const auditLog = StorageService.getAuditLogs();
      if (auditLog.length > 0) {
        await this.batchWriteCollection('auditLogs', auditLog, al => al.id);
        await this.batchWriteCollection('activityLogs', auditLog, al => al.id);
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
            StorageService.saveExpenseCategories(categories, false);
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
            StorageService.saveRolePermissions(perms, false);
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
            StorageService.saveCashDrawer(remoteDrawer, false);
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
        StorageService.saveProducts(filtered, false);
      });
      await pullCollection<Sale>('sales', items => StorageService.saveSales(items, false));
      await pullCollection<CreditSaleRecord>('creditSales', items => StorageService.saveCreditSales(items, false));
      await pullCollection<PurchaseRecord>('purchases', items => StorageService.savePurchases(items, false));
      await pullCollection<Customer>('customers', items => StorageService.saveCustomers(items, false));
      await pullCollection<ExpenseRecord>('expenses', items => StorageService.saveExpenses(items, false));
      await pullCollection<Supplier>('suppliers', items => StorageService.saveSuppliers(items, false));
      await pullCollection<StaffUser>('staffUsers', items => {
        const clean = items.filter(u => !isMockStaffUser(u));
        if (clean.length > 0) {
          StorageService.saveStaffUsers(clean, false);
        }
      });
      await pullCollection<PreOrder>('preOrders', items => StorageService.savePreOrders(items, false));
      await pullCollection<StockAdjustment>('stockAdjustments', items => StorageService.saveStockAdjustments(items, false));
      await pullCollection<PriceChangeRecord>('priceChanges', items => StorageService.savePriceChanges(items, false));
      await pullCollection<StockAuditSession>('stockAudits', items => StorageService.saveStockAudits(items, false));
      await pullCollection<DamageLog>('damageLogs', items => StorageService.saveDamageLogs(items, false));
      await pullCollection<Announcement>('announcements', items => StorageService.saveAnnouncements(items, false));
      await pullCollection<ChatChannel>('chatChannels', items => StorageService.saveChatChannels(items, false));
      await pullCollection<ChatMessage>('chatMessages', items => StorageService.saveChatMessages(items, false));
      await pullCollection<PersonalWallet>('personalWallets', items => StorageService.savePersonalWallets(items, false));
      await pullCollection<PersonalTransaction>('personalTransactions', items => StorageService.savePersonalTransactions(items, false));
      await pullCollection<PersonalBudget>('personalBudgets', items => StorageService.savePersonalBudgets(items, false));
      await pullCollection<PersonalSavingsGoal>('personalGoals', items => StorageService.savePersonalSavingsGoals(items, false));
      await pullCollection<PersonalDebtIOU>('personalDebts', items => StorageService.savePersonalDebts(items, false));
      await pullCollection<FacebookAdPostRecord>('facebookPosts', items => StorageService.saveFacebookPosts(items, false));
      await pullCollection<AuditLogEntry>('auditLogs', items => StorageService.saveAuditLogs(items, false));

      await pullCollection<StoreLocation>('locations', items => {
        const deletedIds = new Set(StorageService.getDeletedLocationIds());
        const valid = (items || []).filter(l => l && l.id && !deletedIds.has(l.id));
        if (valid.length > 0) {
          StorageService.saveLocations(valid, false);
        }
      });
      await pullCollection<BranchInventory>('branch_inventory', items => StorageService.saveBranchInventoryList(items, false));
      await pullCollection<StockTransfer>('stock_transfers', items => StorageService.saveStockTransfers(items, false));

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
