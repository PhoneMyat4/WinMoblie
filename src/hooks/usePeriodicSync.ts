import { useEffect, useState } from 'react';
import { syncService, SyncStateInfo } from '../utils/syncService';

/**
 * React hook that provides live multi-tab synchronization and online/offline status to the UI
 * without running any conflicting whole-localStorage HTTP background loops.
 */
export function usePeriodicSync(_intervalMs?: number) {
  const [syncInfo, setSyncInfo] = useState<SyncStateInfo>(() => syncService.getSyncState());

  useEffect(() => {
    // Subscribe to multi-tab sync and connectivity status changes
    const unsubscribe = syncService.subscribe((state) => {
      setSyncInfo(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    ...syncInfo,
    triggerManualSync: () => syncService.performSyncCheck(),
  };
}
