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
  private lastSyncedServerTimestamp = 0;
  private lastKnownLocalTimestamp = 0;
  private syncStatus: SyncStatus = 'idle';
  private lastSyncTime: Date | null = null;
  private listeners: Set<(state: SyncStateInfo) => void> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private lastWarningLogTime = 0;
  private lastWarningMessage = '';

  private logSyncWarning(prefix: string, error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    if (message !== this.lastWarningMessage || now - this.lastWarningLogTime > 60000) {
      console.warn(`${prefix}:`, error);
      this.lastWarningLogTime = now;
      this.lastWarningMessage = message;
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
   * Push local localStorage state snapshot to server
   */
  public async pushLocalStateToServer(): Promise<boolean> {
    if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.setStatus('offline');
      return false;
    }

    try {
      this.setStatus('syncing');
      const allData = StorageService.getAllData();
      const localTs = StorageService.getLastUpdatedTimestamp() || Date.now();

      const response = await authenticatedFetch('/api/sync-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientTabId: this.tabId,
          clientTimestamp: localTs,
          data: allData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync server responded with status ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        this.lastSyncedServerTimestamp = result.serverTimestamp || localTs;
        this.lastKnownLocalTimestamp = this.lastSyncedServerTimestamp;
        this.lastSyncTime = new Date();
        this.lastWarningMessage = '';
        this.setStatus('synced');

        // If server had newer data from another tab, apply it
        if (result.hasNewerServerData && result.data) {
          StorageService.applyAllData(result.data, result.serverTimestamp);
        }
        return true;
      }

      this.setStatus('error');
      return false;
    } catch (error) {
      this.logSyncWarning('[SyncManager] Push to server failed (operating in offline/local mode)', error);
      this.setStatus('offline');
      return false;
    }
  }

  /**
   * Pull newer state from server if available
   */
  public async pullServerState(): Promise<boolean> {
    if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.setStatus('offline');
      return false;
    }

    try {
      this.setStatus('syncing');
      const response = await authenticatedFetch(`/api/sync-state?since=${this.lastSyncedServerTimestamp}`);

      if (!response.ok) {
        throw new Error(`Sync server responded with status ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        this.lastSyncTime = new Date();
        this.lastWarningMessage = '';
        
        if (result.hasUpdates && result.data) {
          this.lastSyncedServerTimestamp = result.serverTimestamp;
          this.lastKnownLocalTimestamp = result.serverTimestamp;
          StorageService.applyAllData(result.data, result.serverTimestamp);
        } else if (result.serverTimestamp) {
          this.lastSyncedServerTimestamp = Math.max(this.lastSyncedServerTimestamp, result.serverTimestamp);
        }

        this.setStatus('synced');
        return true;
      }

      this.setStatus('error');
      return false;
    } catch (error) {
      this.logSyncWarning('[SyncManager] Pull from server failed', error);
      this.setStatus('offline');
      return false;
    }
  }

  /**
   * Execute a full bidirectional sync check between localStorage, other tabs, and server
   */
  public async performSyncCheck(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Cross-tab local check: Verify if localStorage was modified by another browser tab
      const currentLocalTs = StorageService.getLastUpdatedTimestamp();
      if (currentLocalTs > this.lastKnownLocalTimestamp) {
        this.lastKnownLocalTimestamp = currentLocalTs;
        window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { 
          detail: { key: 'TAB_STORAGE_SYNC', timestamp: currentLocalTs } 
        }));
      }

      // 2. Server sync check: If local has unsynced changes, push to server; otherwise check if server has updates
      if (currentLocalTs > this.lastSyncedServerTimestamp) {
        await this.pushLocalStateToServer();
      } else {
        await this.pullServerState();
      }
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
}

export const syncService = new SyncManager();
