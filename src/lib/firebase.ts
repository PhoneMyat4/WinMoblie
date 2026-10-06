import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Suppress internal Firestore SDK verbose warnings (like BloomFilter optimization fallback)
try {
  setLogLevel('error');
} catch {
  // ignore
}

// Silence internal BloomFilter errors emitted by @firebase/firestore watch change aggregator
if (typeof console !== 'undefined') {
  const origError = console.error;
  console.error = (...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'string' && (args[0].includes('BloomFilter') || args[0].includes('BloomFilterError'))) {
      return;
    }
    origError.apply(console, args);
  };
  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'string' && (args[0].includes('BloomFilter') || args[0].includes('BloomFilterError'))) {
      return;
    }
    origWarn.apply(console, args);
  };
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

const databaseId = firebaseConfig.firestoreDatabaseId || undefined;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, databaseId);
} catch {
  firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const db = firestoreInstance;

export const storage = getStorage(app);

export { firebaseConfig };
export default app;
