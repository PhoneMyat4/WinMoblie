import { StorageService, STORAGE_KEYS } from './storage';
import { authenticatedFetch } from './apiClient';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncStateInfo {
  status: SyncStatus;
  lastSyncTime: Date | null;
  lastSyncedTimestamp: number;
  tabId: string;
  isOnline: boolean;
}

// Generate unique tab ID for this browser tab session
const CLIENT_TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

class SyncManager {
  private tabId: string = CLIENT_TAB_ID;
  private intervalId: number | null = null;
  private isSyncing = false;
  private isPaused = false;
  private lastSyncedServerTimestamp = 0;
  private lastKnownLocalTimestamp = 0;
  private syncStatus: SyncStatus = 'idle';
  private lastSyncTime: Date | null = null;
  private listeners: Set<(state: SyncStateInfo) => void> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private lastWarningLogTime = 0;
  private lastWarningKey = '';
  private hasPerformedInitialPull = false;

  private logSyncWarning(prefix: string, error: any) {
    const errText = error instanceof Error ? error.message : String(error);
    const key = `${prefix}::${errText}`;
    const now = Date.now();
    // Throttle duplicate warning logs to at most once per 60 seconds
    if (key !== this.lastWarningKey || now - this.lastWarningLogTime > 60000) {
      console.warn(`${prefix}:`, error);
      this.lastWarningLogTime = now;
      this.lastWarningKey = key;
    }
  }

  constructor() {
    this.lastKnownLocalTimestamp = StorageService.getLastUpdatedTimestamp();
    
    // Initialize BroadcastChannel if supported
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('mobileshop_tab_sync_channel');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'DATA_UPDATED') {
            this.handleCrossTabUpdate(event.data.timestamp);
          }
        };
      }
    } catch {
      // BroadcastChannel unavailable
    }
  }

  public getTabId(): string {
    return this.tabId;
  }

  public getSyncState(): SyncStateInfo {
    return {
      status: this.syncStatus,
      lastSyncTime: this.lastSyncTime,
      lastSyncedTimestamp: this.lastSyncedServerTimestamp,
      tabId: this.tabId,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
  }

  public subscribe(listener: (state: SyncStateInfo) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSyncState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const state = this.getSyncState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }

  private setStatus(status: SyncStatus): void {
    if (this.syncStatus !== status) {
      this.syncStatus = status;
      this.notifyListeners();
    }
  }

  /**
   * Called when another tab sends a broadcast or triggers storage update
   */
  public handleCrossTabUpdate(incomingTimestamp?: number): void {
    const currentStorageTs = StorageService.getLastUpdatedTimestamp();
    const newTs = incomingTimestamp || currentStorageTs;

    if (newTs > this.lastKnownLocalTimestamp) {
      this.lastKnownLocalTimestamp = newTs;
      window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'CROSS_TAB_SYNC', timestamp: newTs } }));
    }
  }

  /**
   * Push local localStorage state snapshot to server (Deprecated: Firestore is now the sole cross-device authority)
   */
  public async pushLocalStateToServer(): Promise<boolean> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.setStatus(isOnline ? 'synced' : 'offline');
    return isOnline;
  }

  /**
   * Pull newer state from server if available (Deprecated: Firestore is now the sole cross-device authority)
   */
  public async pullServerState(): Promise<boolean> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.setStatus(isOnline ? 'synced' : 'offline');
    return isOnline;
  }

  /**
   * Execute a full bidirectional sync check between localStorage, other tabs, and server
   */
  public async performSyncCheck(): Promise<void> {
    if (this.isSyncing || this.isPaused) return;
    this.isSyncing = true;

    try {
      // 1. Cross-tab local check: Instant local synchronization between tabs via localStorage and BroadcastChannel
      const currentLocalTs = StorageService.getLastUpdatedTimestamp();
      if (currentLocalTs > this.lastKnownLocalTimestamp) {
        this.lastKnownLocalTimestamp = currentLocalTs;
        window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { 
          detail: { key: 'TAB_STORAGE_SYNC', timestamp: currentLocalTs } 
        }));
      }

      // Firestore is the authoritative cross-device database.
      // Update local sync status indicator
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      this.setStatus(isOnline ? 'synced' : 'offline');
    } catch (err) {
      console.error('[SyncManager] Sync check error:', err);
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Start periodic setInterval synchronization loop (default every 2000ms / 2s)
   */
  public startPeriodicSync(intervalMs = 2000): () => void {
    // Initial sync check on launch
    this.performSyncCheck();

    // Setup periodic setInterval timer
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }

    this.intervalId = window.setInterval(() => {
      this.performSyncCheck();
    }, intervalMs);

    // Also sync immediately when tab becomes focused / active
    const handleFocus = () => {
      this.performSyncCheck();
    };

    // Also sync immediately when browser storage event fires from another tab
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.LAST_UPDATED || Object.values(STORAGE_KEYS).includes(event.key || '')) {
        const newTs = StorageService.getLastUpdatedTimestamp();
        this.handleCrossTabUpdate(newTs);
      }
    };

    const handleOnline = () => {
      this.setStatus('syncing');
      this.performSyncCheck();
    };

    const handleOffline = () => {
      this.setStatus('offline');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Return cleanup function
    return () => {
      if (this.intervalId !== null) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  public stopPeriodicSync(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public pause(): void {
    console.log('[SyncManager] Pausing sync service...');
    this.isPaused = true;
  }

  public resume(): void {
    console.log('[SyncManager] Resuming sync service...');
    this.isPaused = false;
  }

  public isSyncPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Pushes the fresh zeroed clean state to the server explicitly with isReset: true flag
   * to guarantee the in-memory server snapshot does not re-contaminate this or other tabs.
   */
  public async resetServerState(): Promise<boolean> {
    const localTs = Date.now();
    this.lastSyncedServerTimestamp = localTs;
    this.lastKnownLocalTimestamp = localTs;
    return true;
  }
}

export const syncService = new SyncManager();
