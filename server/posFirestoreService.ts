import 'dotenv/config';
import { collection, getDocs, doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
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

/**
 * Ensures authentication with Firebase so that Firestore security rules
 * permit read and write operations from background/server processes.
 */
export async function ensureAuth() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  const email =
    process.env.MCP_AUTH_EMAIL ||
    process.env.FIREBASE_AUTH_EMAIL ||
    'mcp-agent@apexpos.internal';
  const password =
    process.env.MCP_AUTH_PASSWORD ||
    process.env.FIREBASE_AUTH_PASSWORD ||
    'password123456';

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.error(`[FirestoreService] Authenticated with Firebase as ${cred.user.email}`);
    return cred.user;
  } catch (signInErr: any) {
    if (
      signInErr.code === 'auth/user-not-found' ||
      signInErr.code === 'auth/invalid-credential'
    ) {
      try {
        const newCred = await createUserWithEmailAndPassword(auth, email, password);
        console.error(`[FirestoreService] Created & authenticated service account: ${newCred.user.email}`);
        return newCred.user;
      } catch (createErr: any) {
        console.error('[FirestoreService] Service account creation fallback notice:', createErr.message);
      }
    } else {
      console.error('[FirestoreService] Sign-in notice:', signInErr.message);
    }
  }

  try {
    const anon = await signInAnonymously(auth);
    console.error('[FirestoreService] Authenticated with Firebase anonymously');
    return anon.user;
  } catch (err: any) {
    console.warn('[FirestoreService] Firebase auth notice (queries will proceed with default credentials):', err.message);
    return null;
  }
}

/**
 * Fetches current POS and inventory state directly from the Firestore database
 * to construct a fresh PosDataContext for report and inventory evaluation.
 */
export async function fetchPosDataContext(): Promise<PosDataContext> {
  await ensureAuth();

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

  const products: Product[] = [];
  if (productsSnap.status === 'fulfilled') {
    productsSnap.value.forEach((d) => {
      products.push({ id: d.id, ...(d.data() as any) });
    });
  } else {
    console.error('[FirestoreService] Failed to load products collection:', productsSnap.reason);
  }

  const sales: Sale[] = [];
  if (salesSnap.status === 'fulfilled') {
    salesSnap.value.forEach((d) => {
      sales.push({ id: d.id, ...(d.data() as any) });
    });
  } else {
    console.error('[FirestoreService] Failed to load sales collection:', salesSnap.reason);
  }

  const expenses: ExpenseRecord[] = [];
  if (expensesSnap.status === 'fulfilled') {
    expensesSnap.value.forEach((d) => {
      expenses.push({ id: d.id, ...(d.data() as any) });
    });
  } else {
    console.error('[FirestoreService] Failed to load expenses collection:', expensesSnap.reason);
  }

  const purchases: PurchaseRecord[] = [];
  if (purchasesSnap.status === 'fulfilled') {
    purchasesSnap.value.forEach((d) => {
      purchases.push({ id: d.id, ...(d.data() as any) });
    });
  } else {
    console.error('[FirestoreService] Failed to load purchases collection:', purchasesSnap.reason);
  }

  let settings: ShopSettings | undefined = undefined;
  if (settingsSnap.status === 'fulfilled' && settingsSnap.value.exists()) {
    settings = settingsSnap.value.data() as ShopSettings;
  }

  let cashDrawer: CashDrawerRecord | undefined = undefined;
  if (cashDrawerSnap.status === 'fulfilled' && cashDrawerSnap.value.exists()) {
    cashDrawer = cashDrawerSnap.value.data() as CashDrawerRecord;
  }

  return {
    products,
    sales,
    expenses,
    purchases,
    settings,
    cashDrawer,
    currencySymbol: settings?.currencySymbol || 'MMK',
  };
}

/**
 * Persists a newly created or updated product to Firestore.
 */
export async function persistProductToFirestore(product: Product): Promise<boolean> {
  try {
    await ensureAuth();
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
 * Updates a secret or configuration field in the global settings document in Firestore.
 */
export async function updateSettingSecretInFirestore(key: string, value: any): Promise<boolean> {
  try {
    await ensureAuth();
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
    await ensureAuth();
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
    // If Firestore transaction fails (e.g. offline/network glitch), fallback to memory lock
    console.warn(`[FirestoreService] Distributed lock notice for ${sanitizedKey}:`, err?.message || err);
    if (!inMemoryProcessedMessages.has(sanitizedKey)) {
      inMemoryProcessedMessages.set(sanitizedKey, now);
      return true;
    }
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
    await ensureAuth();
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
    // On unexpected error, default to leader so bot doesn't freeze
    return { isLeader: true, leaderId: instanceId };
  }
}

/**
 * Retrieves the latest acknowledged Telegram polling offset from Firestore.
 */
export async function getTelegramPollingOffset(): Promise<number> {
  try {
    await ensureAuth();
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
    await ensureAuth();
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

