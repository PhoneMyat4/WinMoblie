import 'dotenv/config';
import { collection, getDocs, doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { db, auth } from '../src/lib/firebase';
import type { PosDataContext } from './aiAssistant';
import type {
  Product,
  Sale,
  ExpenseRecord,
  PurchaseRecord,
  ShopSettings,
  CashDrawerRecord,
} from '../src/types';

let lastFirestoreAuthError: string | null = null;

let hasLoggedMissingServiceAuth = false;

/**
 * Ensures authentication with Firebase so that Firestore security rules
 * permit read and write operations from background/server processes.
 * R12: Never fall back to hardcoded credentials, anonymous sign-in, or auto-signup (createUserWithEmailAndPassword).
 */
export async function ensureAuth() {
  if (auth.currentUser) {
    lastFirestoreAuthError = null;
    return auth.currentUser;
  }

  const email = (process.env.MCP_AUTH_EMAIL || process.env.FIREBASE_AUTH_EMAIL || '').trim();
  const password = (process.env.MCP_AUTH_PASSWORD || process.env.FIREBASE_AUTH_PASSWORD || '').trim();

  if (!email || !password) {
    lastFirestoreAuthError = 'MCP_AUTH_EMAIL / MCP_AUTH_PASSWORD are not configured';
    return null;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    lastFirestoreAuthError = null;
    console.error(`[FirestoreService] Authenticated with Firebase as ${cred.user.email}`);
    return cred.user;
  } catch (signInErr: any) {
    lastFirestoreAuthError = signInErr?.message || 'Firebase service account sign-in failed';
    if (!hasLoggedMissingServiceAuth) {
      hasLoggedMissingServiceAuth = true;
      console.error('[FirestoreService] Service account sign-in failed (R12 — auto-creation disabled):', lastFirestoreAuthError);
    }
    return null;
  }
}

export function getLastFirestoreAuthError(): string | null {
  return lastFirestoreAuthError;
}

let serverStateSnapshotGetter: (() => Record<string, any> | null) | null = null;

export function registerServerStateSnapshotGetter(getter: () => Record<string, any> | null) {
  serverStateSnapshotGetter = getter;
}

export function getServerStateSnapshot(): Record<string, any> | null {
  return serverStateSnapshotGetter ? serverStateSnapshotGetter() : null;
}

/**
 * Fetches current POS and inventory state directly from the Firestore database
 * to construct a fresh PosDataContext for report and inventory evaluation.
 * R12: If Firestore reads fail and no authenticated snapshot is available, marks dataUnavailable=true
 * so callers report "data unavailable" instead of silently answering "0 sales".
 */
export async function fetchPosDataContext(): Promise<PosDataContext> {
  const authedUser = await ensureAuth();

  let products: Product[] = [];
  let sales: Sale[] = [];
  let expenses: ExpenseRecord[] = [];
  let purchases: PurchaseRecord[] = [];
  let settings: ShopSettings | undefined = undefined;
  let cashDrawer: CashDrawerRecord | undefined = undefined;
  let firestoreReadFailed = !authedUser;
  let firestoreFailureReason = !authedUser
    ? (lastFirestoreAuthError || 'Service account not authenticated')
    : '';

  if (authedUser) {
    const [
      productsSnap,
      salesSnap,
      expensesSnap,
      purchasesSnap,
      settingsSnap,
      cashDrawerSnap,
    ] = await Promise.allSettled([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'sales')),
      getDocs(collection(db, 'expenses')),
      getDocs(collection(db, 'purchases')),
      getDoc(doc(db, 'settings', 'global')),
      getDoc(doc(db, 'cashDrawer', 'current')),
    ]);

    if (productsSnap.status === 'fulfilled') {
      productsSnap.value.forEach((d) => {
        products.push({ id: d.id, ...(d.data() as any) });
      });
    } else {
      firestoreReadFailed = true;
      firestoreFailureReason = productsSnap.reason?.message || String(productsSnap.reason || 'Products read denied');
    }

    if (salesSnap.status === 'fulfilled') {
      salesSnap.value.forEach((d) => {
        const data = d.data() as any;
        if (data && !data.archived && data.status !== 'voided') {
          sales.push({ id: d.id, ...data });
        }
      });
    } else {
      firestoreReadFailed = true;
      firestoreFailureReason = salesSnap.reason?.message || String(salesSnap.reason || 'Sales read denied');
    }

    if (expensesSnap.status === 'fulfilled') {
      expensesSnap.value.forEach((d) => {
        expenses.push({ id: d.id, ...(d.data() as any) });
      });
    }

    if (purchasesSnap.status === 'fulfilled') {
      purchasesSnap.value.forEach((d) => {
        purchases.push({ id: d.id, ...(d.data() as any) });
      });
    }

    if (settingsSnap.status === 'fulfilled' && settingsSnap.value.exists()) {
      settings = settingsSnap.value.data() as ShopSettings;
    }

    if (cashDrawerSnap.status === 'fulfilled' && cashDrawerSnap.value.exists()) {
      cashDrawer = cashDrawerSnap.value.data() as CashDrawerRecord;
    }
  }

  // Firestore is the authoritative source of truth; fall back to in-memory server state snapshot only if Firestore returned empty
  const serverState = getServerStateSnapshot();
  let usedServerSnapshot = false;
  if (serverState) {
    if (sales.length === 0 && Array.isArray(serverState.sales) && serverState.sales.length > 0) {
      sales = serverState.sales;
      usedServerSnapshot = true;
    }
    if (products.length === 0 && Array.isArray(serverState.products) && serverState.products.length > 0) {
      products = serverState.products;
      usedServerSnapshot = true;
    }
    if (expenses.length === 0 && Array.isArray(serverState.expenses) && serverState.expenses.length > 0) {
      expenses = serverState.expenses;
      usedServerSnapshot = true;
    }
    if (purchases.length === 0 && Array.isArray(serverState.purchases) && serverState.purchases.length > 0) {
      purchases = serverState.purchases;
      usedServerSnapshot = true;
    }
    if (!settings && serverState.settings) {
      settings = serverState.settings;
      usedServerSnapshot = true;
    }
    if (!cashDrawer && serverState.cashDrawer) {
      cashDrawer = serverState.cashDrawer;
      usedServerSnapshot = true;
    }
  }

  const dataUnavailable = Boolean((!authedUser || firestoreReadFailed) && !usedServerSnapshot);
  const dataUnavailableReason = dataUnavailable
    ? `Data unavailable: Server could not read Firestore (${lastFirestoreAuthError || firestoreFailureReason || 'Service credentials missing or access denied'}).`
    : undefined;

  return {
    products,
    sales,
    expenses,
    purchases,
    settings,
    cashDrawer,
    currencySymbol: settings?.currencySymbol || 'MMK',
    dataUnavailable,
    dataUnavailableReason,
  };
}

/**
 * Persists a newly created or updated product to Firestore.
 */
export async function persistProductToFirestore(product: Product): Promise<boolean> {
  try {
    const user = await ensureAuth();
    if (!user) {
      console.error('[FirestoreService] Cannot persist product: service account is not authenticated (R12).');
      return false;
    }
    if (!product.id) return false;
    await setDoc(doc(db, 'products', product.id), product, { merge: true });
    console.log(`[FirestoreService] Successfully persisted product "${product.name}" (${product.id}) to Firestore.`);
    return true;
  } catch (err: any) {
    console.error(`[FirestoreService] Failed to persist product to Firestore:`, err.message);
    return false;
  }
}

/**
 * Updates only a product's pricing fields in Firestore so concurrent stock or IMEI mutations are never overwritten.
 */
export async function persistProductPriceUpdateToFirestore(
  productId: string,
  sellingPrice: number,
  costPrice?: number
): Promise<boolean> {
  try {
    const user = await ensureAuth();
    if (!user) {
      console.error('[FirestoreService] Cannot update product price: service account is not authenticated (R12).');
      return false;
    }
    if (!productId) return false;
    const nowIso = new Date().toISOString();
    await setDoc(
      doc(db, 'products', productId),
      {
        sellingPrice: Math.round(Number(sellingPrice) || 0),
        ...(costPrice !== undefined ? { costPrice: Math.round(Number(costPrice) || 0) } : {}),
        updatedAt: nowIso,
        syncedAt: nowIso,
      },
      { merge: true }
    );
    console.log(`[FirestoreService] Successfully updated price for product (${productId}) in Firestore.`);
    return true;
  } catch (err: any) {
    console.error(`[FirestoreService] Failed to update product price in Firestore:`, err.message);
    return false;
  }
}

/**
 * Updates a secret or configuration field in the global settings document in Firestore.
 */
export async function updateSettingSecretInFirestore(key: string, value: any): Promise<boolean> {
  try {
    const user = await ensureAuth();
    if (!user) {
      console.error('[FirestoreService] Cannot update setting secret: service account is not authenticated (R12).');
      return false;
    }
    await setDoc(
      doc(db, 'settings', 'global'),
      {
        secrets: {
          [key]: value,
        },
      },
      { merge: true }
    );
    console.log(`[FirestoreService] Successfully updated setting secrets.${key} in Firestore.`);
    return true;
  } catch (err: any) {
    console.error(`[FirestoreService] Failed to update setting secret in Firestore:`, err.message);
    return false;
  }
}

// In-memory fast cache to reject duplicate updates instantaneously
const inMemoryProcessedMessages = new Map<string, number>();

// Clean up stale cache keys periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of inMemoryProcessedMessages.entries()) {
    if (now - ts > 15 * 60 * 1000) {
      inMemoryProcessedMessages.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Atomically claims processing rights for a specific Telegram message/update.
 * Guarantees that even if multiple server instances (e.g. dev vs preview) or duplicate polling loops
 * receive the exact same user query, ONLY ONE instance processes it and replies.
 */
export async function claimTelegramMessageLock(lockKey: string, instanceId: string): Promise<boolean> {
  const now = Date.now();
  const sanitizedKey = lockKey.replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. Fast in-memory check
  const cachedTs = inMemoryProcessedMessages.get(sanitizedKey);
  if (cachedTs && now - cachedTs < 15 * 60 * 1000) {
    return false; // Already claimed or processed
  }

  // 2. Distributed Firestore atomic transaction claim across all server instances
  try {
    const user = await ensureAuth();
    if (!user) return false;
    const docRef = doc(db, 'telegram_processed_messages', sanitizedKey);
    const claimed = await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const docTs = typeof data?.timestamp === 'number' ? data.timestamp : 0;
        // If claimed within the last 15 minutes, reject duplicate
        if (now - docTs < 15 * 60 * 1000) {
          return false;
        }
      }
      txn.set(docRef, {
        timestamp: now,
        instanceId,
        claimedAt: new Date(now).toISOString(),
      });
      return true;
    });

    // Cache locally
    inMemoryProcessedMessages.set(sanitizedKey, now);
    return claimed;
  } catch (err: any) {
    // Item M-a: Fail closed on distributed lock failure so two instances never both process the same message
    console.warn(`[FirestoreService] Distributed lock failed (failing closed) for ${sanitizedKey}:`, err?.message || err);
    return false;
  }
}

/**
 * Distributed leader lease for Telegram Bot long-polling.
 * Guarantees that only ONE server instance at a time acts as the active polling worker,
 * completely preventing Telegram HTTP 409 Conflict errors and duplicate updates.
 */
export async function acquireTelegramPollingLease(
  instanceId: string,
  ttlMs: number = 35000
): Promise<{ isLeader: boolean; leaderId?: string }> {
  try {
    const user = await ensureAuth();
    if (!user) return { isLeader: false, leaderId: '' };
    const now = Date.now();
    const docRef = doc(db, 'telegram_bot_state', 'polling_lease');

    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const currentLeader = data?.leaderId;
        const expiresAt = typeof data?.leaseExpiresAt === 'number' ? data.leaseExpiresAt : 0;

        // If another leader holds an unexpired lease, yield
        if (currentLeader && currentLeader !== instanceId && now < expiresAt) {
          return { isLeader: false, leaderId: currentLeader };
        }
      }

      txn.set(docRef, {
        leaderId: instanceId,
        leaseExpiresAt: now + ttlMs,
        heartbeatAt: new Date(now).toISOString(),
      });
      return { isLeader: true, leaderId: instanceId };
    });
  } catch (err: any) {
    console.warn('[TelegramBot] Failed to acquire polling lease from Firestore:', err?.message || err);
    return { isLeader: false, leaderId: '' };
  }
}

/**
 * Retrieves the latest acknowledged Telegram polling offset from Firestore.
 */
export async function getTelegramPollingOffset(): Promise<number> {
  try {
    const user = await ensureAuth();
    if (!user) return 0;
    const snap = await getDoc(doc(db, 'telegram_bot_state', 'polling_offset'));
    if (snap.exists()) {
      const val = snap.data()?.offset;
      return typeof val === 'number' ? val : 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Persists the latest acknowledged Telegram polling offset to Firestore.
 */
export async function saveTelegramPollingOffset(offset: number): Promise<void> {
  try {
    const user = await ensureAuth();
    if (!user) return;
    await setDoc(
      doc(db, 'telegram_bot_state', 'polling_offset'),
      {
        offset,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    // Non-critical
  }
}

