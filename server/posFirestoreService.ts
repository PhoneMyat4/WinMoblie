import 'dotenv/config';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
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
