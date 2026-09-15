import { AuditLogEntry, AuditActionType, AuditCategory, AuditSeverity, AuditLogDetails, StaffUser } from '../types';
import { StorageService } from './storage';
import { firestoreSync } from '../services/firestoreSyncService';

/**
 * Centralized Audit Logging Service
 * Captures, records, and syncs all critical staff user operations,
 * access control events, sales, financial transactions, and inventory changes.
 */

interface LogActivityParams {
  actionType: AuditActionType;
  category: AuditCategory;
  severity: AuditSeverity;
  summary: string;
  details?: AuditLogDetails;
  staffUser?: StaffUser | null;
  clientDevice?: string;
}

function getBrowserClientDevice(): string {
  if (typeof window === 'undefined') return 'POS Terminal (Server)';
  try {
    const userAgent = navigator.userAgent;
    let os = 'Unknown OS';
    if (userAgent.indexOf('Win') !== -1) os = 'Windows';
    else if (userAgent.indexOf('Mac') !== -1) os = 'macOS';
    else if (userAgent.indexOf('Android') !== -1) os = 'Android';
    else if (userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) os = 'iOS';
    else if (userAgent.indexOf('Linux') !== -1) os = 'Linux';

    let browser = 'Browser';
    if (userAgent.indexOf('Chrome') !== -1) browser = 'Chrome';
    else if (userAgent.indexOf('Safari') !== -1) browser = 'Safari';
    else if (userAgent.indexOf('Firefox') !== -1) browser = 'Firefox';
    else if (userAgent.indexOf('Edge') !== -1) browser = 'Edge';

    return `Terminal (${browser} / ${os})`;
  } catch {
    return 'Terminal (Web Client)';
  }
}

export class AuditLogger {
  /**
   * Log an activity or audit event
   */
  public static log(params: LogActivityParams): AuditLogEntry {
    try {
      const activeStaff = params.staffUser || this.getActiveStaffUser();
      const staffId = activeStaff?.id || 'sys-terminal';
      const staffName = activeStaff?.name || 'Authorized Staff';
      const staffRole = activeStaff?.role || 'Cashier';

      const entry: AuditLogEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        staffId,
        staffName,
        staffRole,
        actionType: params.actionType,
        category: params.category,
        severity: params.severity,
        summary: params.summary,
        details: params.details || {},
        clientDevice: params.clientDevice || getBrowserClientDevice(),
        expireAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 180-day TTL expiration
      };

      // Save locally
      StorageService.addAuditLog(entry);

      // Trigger Cloud Sync or secure offline queueing
      try {
        if (firestoreSync) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            firestoreSync.queuePendingAuditLog(entry);
          } else {
            firestoreSync.pushActivityLog(entry).catch((err) => {
              console.warn('[AuditLogger] Push activity log failed, queuing in pending_audit_logs:', err);
              firestoreSync.queuePendingAuditLog(entry);
            });
          }
        }
      } catch (syncErr) {
        console.warn('[AuditLogger] Sync dispatcher exception:', syncErr);
        if (firestoreSync) {
          firestoreSync.queuePendingAuditLog(entry);
        }
      }

      // Broadcast update event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mobileshop_audit_logged', { detail: entry }));
        window.dispatchEvent(new CustomEvent('mobileshop_data_updated', { detail: { key: 'AUDIT_LOGS' } }));
      }

      return entry;
    } catch (err) {
      console.error('[AuditLogger] Failed to write audit log entry:', err);
      // Fallback return
      return {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        staffId: 'error',
        staffName: 'System',
        staffRole: 'Cashier',
        actionType: params.actionType,
        category: params.category,
        severity: params.severity,
        summary: params.summary,
        details: params.details,
      };
    }
  }

  /**
   * Retrieves active staff user from local storage or cached session
   */
  private static getActiveStaffUser(): StaffUser | null {
    try {
      // 1. Try session storage for current logged in user
      if (typeof sessionStorage !== 'undefined') {
        const sessionUserId = sessionStorage.getItem('mobileshop_active_user_id');
        if (sessionUserId) {
          const staffUsers = StorageService.getStaffUsers();
          const user = staffUsers.find(u => u.id === sessionUserId);
          if (user) return user;
        }
      }
      // 2. Default to first active user or Owner
      const allUsers = StorageService.getStaffUsers();
      return allUsers.find(u => u.active && u.role === 'Owner') || allUsers[0] || null;
    } catch {
      return null;
    }
  }

  // --- Convenience Specialized Loggers ---

  public static logAuth(
    actionType: 'AUTH_LOGIN' | 'AUTH_LOGOUT' | 'TERMINAL_LOCK' | 'TERMINAL_UNLOCK' | 'OPERATOR_SWITCH',
    staffUser: StaffUser | null,
    summary: string,
    details?: AuditLogDetails
  ) {
    const severity: AuditSeverity = 
      actionType === 'TERMINAL_LOCK' ? 'warning' :
      actionType === 'AUTH_LOGOUT' ? 'info' :
      actionType === 'AUTH_LOGIN' ? 'success' : 'info';

    return this.log({
      actionType,
      category: 'auth',
      severity,
      summary,
      details,
      staffUser
    });
  }

  public static logSale(
    sale: { id: string; invoiceNumber?: string; totalAmount?: number; total?: number; paymentMethod?: string; customerName?: string; items?: unknown[] },
    cashier: StaffUser | null,
    isRefund = false,
    reason?: string
  ) {
    const calculatedAmount = sale.totalAmount ?? sale.total ?? 0;
    return this.log({
      actionType: isRefund ? 'SALE_REFUNDED' : 'SALE_CREATED',
      category: 'sales',
      severity: isRefund ? 'danger' : 'success',
      summary: isRefund
        ? `Refunded Sale #${sale.invoiceNumber || sale.id}`
        : `Completed Sale #${sale.invoiceNumber || sale.id} (${(sale.items?.length || 0)} items)`,
      details: {
        targetId: sale.id,
        invoiceNumber: sale.invoiceNumber || sale.id,
        amount: calculatedAmount,
        paymentMethod: sale.paymentMethod,
        customerName: sale.customerName,
        reason,
        notes: isRefund ? `Refund reason: ${reason || 'Customer request'}` : undefined
      },
      staffUser: cashier
    });
  }

  public static logInventory(
    actionType: 'PRODUCT_CREATED' | 'PRODUCT_UPDATED' | 'PRODUCT_DELETED' | 'STOCK_ADJUSTED' | 'PRICE_CHANGED' | 'BULK_IMPORT',
    summary: string,
    staffUser: StaffUser | null,
    details?: AuditLogDetails
  ) {
    const severity: AuditSeverity = 
      actionType === 'PRODUCT_DELETED' ? 'danger' :
      actionType === 'STOCK_ADJUSTED' || actionType === 'PRICE_CHANGED' ? 'warning' : 'info';

    return this.log({
      actionType,
      category: 'inventory',
      severity,
      summary,
      details,
      staffUser
    });
  }

  public static logCashDrawer(
    actionType: 'CASH_DRAWER_IN' | 'CASH_DRAWER_OUT' | 'CASH_SHIFT_CLOSED',
    summary: string,
    staffUser: StaffUser | null,
    details?: AuditLogDetails
  ) {
    const severity: AuditSeverity = 
      actionType === 'CASH_SHIFT_CLOSED' && (details?.variance ?? 0) !== 0 ? 'warning' :
      actionType === 'CASH_DRAWER_OUT' ? 'warning' : 'info';

    return this.log({
      actionType,
      category: 'cash_drawer',
      severity,
      summary,
      details,
      staffUser
    });
  }

  public static logExpense(
    actionType: 'EXPENSE_RECORDED' | 'EXPENSE_DELETED',
    summary: string,
    staffUser: StaffUser | null,
    details?: AuditLogDetails
  ) {
    return this.log({
      actionType,
      category: 'expenses',
      severity: actionType === 'EXPENSE_DELETED' ? 'danger' : 'info',
      summary,
      details,
      staffUser
    });
  }

  public static logSecurity(
    actionType: 'STAFF_CREATED' | 'STAFF_UPDATED' | 'STAFF_DELETED' | 'ROLE_PERMISSIONS_UPDATED' | 'ROLE_PERMISSIONS_RESET',
    summary: string,
    staffUser: StaffUser | null,
    details?: AuditLogDetails
  ) {
    const severity: AuditSeverity = 
      actionType === 'STAFF_DELETED' ? 'danger' :
      actionType === 'ROLE_PERMISSIONS_UPDATED' || actionType === 'ROLE_PERMISSIONS_RESET' ? 'warning' : 'info';

    return this.log({
      actionType,
      category: 'staff_roles',
      severity,
      summary,
      details,
      staffUser
    });
  }

  /**
   * Secure Owner-Triggered Historical Log Purge (Auto-Purging / Cleanup)
   * Purges audit logs older than the specified retention period (default 180 days / 6 months)
   * Prevents storage bloat while strictly validating that the requesting operator is an 'Owner'.
   */
  public static purgeArchivedAuditLogs(
    operator: StaffUser,
    daysThreshold: number = 180
  ): { success: boolean; purgedCount: number; remainingCount: number; cutoffDate: string } {
    if (!operator || operator.role !== 'Owner') {
      throw new Error('SECURITY_VIOLATION: Historical audit log purging is restricted exclusively to the Store Owner.');
    }

    const cutoffTime = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffTime).toISOString();
    
    const currentLogs = StorageService.getAuditLogs();
    const remainingLogs = currentLogs.filter(log => new Date(log.timestamp).getTime() >= cutoffTime);
    const purgedCount = currentLogs.length - remainingLogs.length;

    // Save pruned logs
    StorageService.saveAuditLogs(remainingLogs);

    // Also clean up any stale items in offline pending queue older than threshold
    if (firestoreSync && typeof (firestoreSync as any).prunePendingAuditLogs === 'function') {
      (firestoreSync as any).prunePendingAuditLogs(cutoffTime);
    }

    // Log the audit event for compliance
    this.log({
      actionType: 'SETTINGS_UPDATED',
      category: 'staff_roles',
      severity: 'warning',
      summary: `Automated Retention Purge: Cleared ${purgedCount} audit logs older than ${daysThreshold} days (6 months)`,
      staffUser: operator,
      details: {
        notes: `Purged logs older than ${cutoffDate}. Remaining records: ${remainingLogs.length}.`,
        metadata: {
          daysThreshold,
          cutoffDate,
          purgedCount,
          remainingCount: remainingLogs.length
        }
      }
    });

    return {
      success: true,
      purgedCount,
      remainingCount: remainingLogs.length,
      cutoffDate
    };
  }
}
