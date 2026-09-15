import { useEffect, useState } from 'react';
import { syncService, SyncStateInfo } from '../utils/syncService';

/**
 * React hook that manages the periodic localStorage-to-server synchronization interval
 * and provides live multi-tab sync status to the UI.
 * 
 * @param intervalMs Periodic sync interval in milliseconds (default: 2000ms)
 */
export function usePeriodicSync(intervalMs = 2000) {
  const [syncInfo, setSyncInfo] = useState<SyncStateInfo>(() => syncService.getSyncState());

  useEffect(() => {
    // Subscribe to sync status changes
    const unsubscribe = syncService.subscribe((state) => {
      setSyncInfo(state);
    });

    // Start periodic setInterval sync check
    const cleanupPeriodic = syncService.startPeriodicSync(intervalMs);

    return () => {
      unsubscribe();
      cleanupPeriodic();
    };
  }, [intervalMs]);

  return {
    ...syncInfo,
    triggerManualSync: () => syncService.performSyncCheck(),
  };
}
