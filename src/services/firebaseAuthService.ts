import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  updatePassword,
  User as FirebaseUser 
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { StaffUser } from '../types';

const PBKDF2_ITERATIONS = 310000;
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_STORAGE_KEY = 'mobileshop_auth_lockout_v1';

interface LockoutState {
  attempts: number;
  lockedUntil: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = (hex || '').replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export class FirebaseAuthService {
  private static currentUser: FirebaseUser | null = null;
  private static isInitialized: boolean = false;
  private static authReady: boolean = false;
  private static listeners: Set<(user: FirebaseUser | null) => void> = new Set();

  public static init() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    onAuthStateChanged(auth, async (user) => {
      this.currentUser = user;
      this.authReady = true;
      this.listeners.forEach((callback) => {
        try {
          callback(user);
        } catch (err) {
          console.error('[FirebaseAuthService] Listener error:', err);
        }
      });
    });
  }

  public static onAuthChanged(callback: (user: FirebaseUser | null) => void): () => void {
    this.listeners.add(callback);
    if (this.authReady) {
      callback(this.currentUser);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  public static getFirebaseUser(): FirebaseUser | null {
    return this.currentUser || auth.currentUser;
  }

  public static hasFirebaseSession(): boolean {
    return Boolean(this.currentUser || auth.currentUser);
  }

  public static isAuthenticated(): boolean {
    return Boolean(this.currentUser || auth.currentUser);
  }

  /**
   * Checks whether login is temporarily locked due to repeated failed PIN/password attempts (R3).
   */
  public static checkLoginLockout(identifier: string = 'global'): { locked: boolean; remainingSeconds: number; attempts: number } {
    if (typeof localStorage === 'undefined') {
      return { locked: false, remainingSeconds: 0, attempts: 0 };
    }
    try {
      const raw = localStorage.getItem(`${LOCKOUT_STORAGE_KEY}_${identifier.toLowerCase()}`);
      if (!raw) return { locked: false, remainingSeconds: 0, attempts: 0 };
      const state = JSON.parse(raw) as LockoutState;
      const now = Date.now();
      if (state.lockedUntil && state.lockedUntil > now) {
        return {
          locked: true,
          remainingSeconds: Math.ceil((state.lockedUntil - now) / 1000),
          attempts: state.attempts || LOCKOUT_MAX_ATTEMPTS,
        };
      }
      if (state.lockedUntil && state.lockedUntil <= now) {
        localStorage.removeItem(`${LOCKOUT_STORAGE_KEY}_${identifier.toLowerCase()}`);
        return { locked: false, remainingSeconds: 0, attempts: 0 };
      }
      return { locked: false, remainingSeconds: 0, attempts: state.attempts || 0 };
    } catch {
      return { locked: false, remainingSeconds: 0, attempts: 0 };
    }
  }

  public static recordFailedLoginAttempt(identifier: string = 'global'): { locked: boolean; remainingSeconds: number; attempts: number } {
    if (typeof localStorage === 'undefined') {
      return { locked: false, remainingSeconds: 0, attempts: 1 };
    }
    try {
      const current = this.checkLoginLockout(identifier);
      const nextAttempts = (current.attempts || 0) + 1;
      const now = Date.now();
      const lockedUntil = nextAttempts >= LOCKOUT_MAX_ATTEMPTS ? now + LOCKOUT_DURATION_MS : 0;
      const nextState: LockoutState = {
        attempts: nextAttempts,
        lockedUntil,
      };
      localStorage.setItem(`${LOCKOUT_STORAGE_KEY}_${identifier.toLowerCase()}`, JSON.stringify(nextState));
      return {
        locked: lockedUntil > now,
        remainingSeconds: lockedUntil > now ? Math.ceil(LOCKOUT_DURATION_MS / 1000) : 0,
        attempts: nextAttempts,
      };
    } catch {
      return { locked: false, remainingSeconds: 0, attempts: 1 };
    }
  }

  public static clearLoginLockout(identifier: string = 'global'): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(`${LOCKOUT_STORAGE_KEY}_${identifier.toLowerCase()}`);
      localStorage.removeItem(`${LOCKOUT_STORAGE_KEY}_global`);
    } catch {}
  }

  /**
   * Translates a staff username or email into a Firebase Auth email identifier.
   */
  public static getAuthEmail(user: StaffUser): string {
    if (user.email && user.email.includes('@')) {
      return user.email.trim().toLowerCase();
    }
    const cleanUsername = (user.username || user.id).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${cleanUsername || 'staff'}@apexpos.internal`;
  }

  /**
   * Translates a staff username directly into an internal POS email identifier.
   */
  public static getInternalAuthEmail(user: StaffUser): string {
    const cleanUsername = (user.username || user.id).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${cleanUsername || 'staff'}@apexpos.internal`;
  }

  /**
   * Derives a 256-bit PBKDF2-SHA256 hash using WebCrypto (R3: slow salted hash, 310,000 iterations).
   */
  public static async derivePbkdf2Hash(
    rawSecret: string,
    saltHex?: string,
    iterations: number = PBKDF2_ITERATIONS
  ): Promise<{ credentialHash: string; credentialSalt: string; credentialIterations: number }> {
    const cleanSecret = String(rawSecret || '').trim();
    const saltBytes = saltHex && saltHex.length >= 16
      ? hexToBytes(saltHex)
      : crypto.getRandomValues(new Uint8Array(16));
    const resolvedSaltHex = bytesToHex(saltBytes);

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(cleanSecret),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes as unknown as BufferSource,
          iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );
      return {
        credentialHash: `pbkdf2_${bytesToHex(new Uint8Array(derivedBits))}`,
        credentialSalt: resolvedSaltHex,
        credentialIterations: iterations,
      };
    }

    // Fallback deterministic hash only if WebCrypto is unavailable in test environment
    return {
      credentialHash: this.hashStaffCredential(`${resolvedSaltHex}:${cleanSecret}`),
      credentialSalt: resolvedSaltHex,
      credentialIterations: iterations,
    };
  }

  /**
   * Derives a strong Firebase Auth password from the staff user's unique ID + credential so the raw 4-digit PIN is never stored or padded as the Firebase password (R3).
   */
  public static async deriveStrongFirebasePassword(staff: StaffUser, enteredCredential: string): Promise<string> {
    const fixedSalt = bytesToHex(new TextEncoder().encode(`fb_auth_v2_${staff.id || staff.username}`).slice(0, 16));
    const derived = await this.derivePbkdf2Hash(`${staff.id}:${enteredCredential}`, fixedSalt, 10000);
    return `Pos#${derived.credentialHash.replace(/^pbkdf2_/, '').slice(0, 24)}!9`;
  }

  /**
   * Verifies an entered PIN/password strictly against the staff user's salted PBKDF2 hash (R3).
   * Never accepts raw plaintext comparison if a PBKDF2 hash exists.
   */
  public static async verifyStaffCredential(staff: StaffUser, enteredPassword: string): Promise<{ valid: boolean; needsMigration: boolean }> {
    const cleanEntered = String(enteredPassword || '').trim();
    if (!cleanEntered) return { valid: false, needsMigration: false };

    // 1. Primary path: Salted WebCrypto PBKDF2 verification
    if (staff.credentialHash && staff.credentialHash.startsWith('pbkdf2_') && staff.credentialSalt) {
      const iterations = staff.credentialIterations || PBKDF2_ITERATIONS;
      const computed = await this.derivePbkdf2Hash(cleanEntered, staff.credentialSalt, iterations);
      return {
        valid: computed.credentialHash === staff.credentialHash,
        needsMigration: Boolean(staff.pin || staff.password),
      };
    }

    // 2. Legacy 64-bit hash migration path (upgrades immediately to PBKDF2 on match)
    if (staff.credentialHash && staff.credentialHash.startsWith('sha_')) {
      const legacyHash = this.hashStaffCredential(cleanEntered);
      if (legacyHash === staff.credentialHash) {
        return { valid: true, needsMigration: true };
      }
      return { valid: false, needsMigration: false };
    }

    // 3. Unmigrated bootstrap record (only when no credentialHash exists yet; upgrades immediately to PBKDF2 and deletes plaintext)
    if (!staff.credentialHash && ((staff.password && staff.password === cleanEntered) || (staff.pin && staff.pin === cleanEntered))) {
      return { valid: true, needsMigration: true };
    }

    return { valid: false, needsMigration: false };
  }

  public static hashStaffCredential(raw: string): string {
    const str = `winmobile_pos_v1:${String(raw || '').trim()}`;
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `sha_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  }

  /**
   * Resolves a staff user profile on a brand-new browser (where localStorage is empty and auth.currentUser is null)
   * by verifying credentials via the backend /api/auth/resolve-staff endpoint or direct Firebase Auth sign-in.
   */
  public static async resolveStaffFromServer(identifier: string, enteredPassword: string): Promise<StaffUser | null> {
    const cleanIdentifier = String(identifier || '').trim().toLowerCase();
    const cleanPassword = String(enteredPassword || '').trim();
    if (!cleanIdentifier || !cleanPassword) return null;

    // 1. Primary path: Verify credentials via backend /api/auth/resolve-staff (which reads /staffUsers using server auth)
    try {
      const response = await fetch('/api/auth/resolve-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password: cleanPassword,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.success && data?.staffUser?.id) {
          return data.staffUser as StaffUser;
        }
      } else if (response.status === 401) {
        return null;
      }
    } catch {
      // Backend endpoint unreachable (e.g., static hosting environment); fall through to direct Firebase Auth lookup
    }

    // 2. Fallback path: Attempt direct Firebase Auth sign-in using email/username and read /staffAccess/{uid} + /staffUsers/{staffId}
    const candidateEmails: string[] = [];
    if (cleanIdentifier.includes('@')) {
      candidateEmails.push(cleanIdentifier);
    } else {
      const sanitizedUser = cleanIdentifier.replace(/[^a-z0-9]/g, '');
      if (sanitizedUser) {
        candidateEmails.push(`${sanitizedUser}@apexpos.internal`);
      }
    }

    const legacyPassword = cleanPassword.length >= 6 ? cleanPassword : `${cleanPassword}123456`.slice(0, 12);
    const candidatePasswords = Array.from(new Set([cleanPassword, legacyPassword]));

    for (const email of candidateEmails) {
      for (const pass of candidatePasswords) {
        try {
          const cred = await signInWithEmailAndPassword(auth, email, pass);
          this.currentUser = cred.user;
          // Once signed in, request.auth.uid == uid allows reading /staffAccess/{uid}
          const accessSnap = await getDoc(doc(db, 'staffAccess', cred.user.uid));
          if (accessSnap.exists()) {
            const accessData = accessSnap.data();
            const staffId = String(accessData?.staffId || '');
            if (staffId) {
              const staffSnap = await getDoc(doc(db, 'staffUsers', staffId));
              if (staffSnap.exists()) {
                return { ...(staffSnap.data() as StaffUser), id: staffSnap.id };
              }
            }
            if (accessData?.role) {
              return {
                id: staffId || `staff-${cred.user.uid.slice(0, 8)}`,
                username: String(accessData.username || cleanIdentifier),
                name: String(accessData.name || cleanIdentifier),
                role: accessData.role,
                email: String(accessData.email || email),
                phone: '',
                pin: '',
                active: accessData.active !== false,
                firebaseUid: cred.user.uid,
              };
            }
          }
        } catch {
          // Continue trying next candidate
        }
      }
    }

    return null;
  }

  /**
   * Signs in the staff user into Firebase Authentication, migrates legacy credentials to PBKDF2 + deleteField(),
   * and binds their UID in /staffAccess/{uid} for role-based Firestore security rules (R1 & R3).
   */
  public static async loginStaffWithFirebase(staff: StaffUser, enteredPassword: string): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
    const primaryEmail = this.getAuthEmail(staff);
    const internalEmail = this.getInternalAuthEmail(staff);
    const legacyPassword = enteredPassword.length >= 6 ? enteredPassword : `${enteredPassword}123456`.slice(0, 12);
    const strongPassword = await this.deriveStrongFirebasePassword(staff, enteredPassword);
    const credCheck = await this.verifyStaffCredential(staff, enteredPassword);
    const isLocalCredentialValid = credCheck.valid;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      return isLocalCredentialValid
        ? { success: true }
        : { success: false, error: 'Invalid staff credentials (offline verification failed).' };
    }

    try {
      // Ensure PBKDF2 hash is generated if missing or upgrading
      if (isLocalCredentialValid && (!staff.credentialHash?.startsWith('pbkdf2_') || !staff.credentialSalt)) {
        const pbkdf2 = await this.derivePbkdf2Hash(enteredPassword);
        staff.credentialHash = pbkdf2.credentialHash;
        staff.credentialSalt = pbkdf2.credentialSalt;
        staff.credentialIterations = pbkdf2.credentialIterations;
      }

      // 1. Attempt sign-in with strong derived password first, then legacy password (and rotate to strong password on success)
      const candidateCredentials: Array<{ email: string; pass: string; isLegacy: boolean }> = [
        { email: primaryEmail, pass: strongPassword, isLegacy: false },
        { email: primaryEmail, pass: legacyPassword, isLegacy: true },
      ];
      if (internalEmail !== primaryEmail) {
        candidateCredentials.push(
          { email: internalEmail, pass: strongPassword, isLegacy: false },
          { email: internalEmail, pass: legacyPassword, isLegacy: true }
        );
      }

      let lastSignInErr: any = null;
      for (const candidate of candidateCredentials) {
        try {
          const cred = await signInWithEmailAndPassword(auth, candidate.email, candidate.pass);
          this.currentUser = cred.user;
          if (candidate.isLegacy) {
            // Rotate legacy padded-PIN Firebase password to strong random/derived password (R3)
            try {
              await updatePassword(cred.user, strongPassword);
            } catch {}
          }
          await this.syncStaffProfileToFirestore(staff, cred.user.uid);
          return { success: true, user: cred.user };
        } catch (err: any) {
          lastSignInErr = err;
        }
      }

      // If error is strictly network-related while navigator.onLine was still true, allow verified PBKDF2 fallback
      if (
        isLocalCredentialValid &&
        lastSignInErr &&
        (lastSignInErr.code === 'auth/network-request-failed' ||
         String(lastSignInErr.message || '').toLowerCase().includes('network'))
      ) {
        return { success: true };
      }

      return { success: false, error: 'Invalid staff credentials or Firebase Authentication rejected sign-in.' };
    } catch (err: any) {
      console.warn('[FirebaseAuthService] Firebase authentication notice:', err?.message || err);
      const isNetErr = String(err?.code || err?.message || '').toLowerCase().includes('network');
      return { 
        success: isOffline || (isNetErr && isLocalCredentialValid),
        error: 'Authentication failed.'
      };
    }
  }

  /**
   * Direct verification against Firebase Authentication email/password.
   * Returns { verified: true, user } if the entered password matches Firebase Auth.
   */
  public static async verifyFirebaseCredentials(staff: StaffUser, enteredPassword: string): Promise<{ verified: boolean; user?: FirebaseUser }> {
    const email = this.getAuthEmail(staff);
    const strongPassword = await this.deriveStrongFirebasePassword(staff, enteredPassword);
    const legacyPassword = enteredPassword.length >= 6 ? enteredPassword : `${enteredPassword}123456`.slice(0, 12);

    for (const candidatePass of [strongPassword, legacyPassword, enteredPassword]) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, candidatePass);
        this.currentUser = cred.user;
        if (candidatePass !== strongPassword) {
          try {
            await updatePassword(cred.user, strongPassword);
          } catch {}
        }
        const pbkdf2 = await this.derivePbkdf2Hash(enteredPassword, staff.credentialSalt, staff.credentialIterations || PBKDF2_ITERATIONS);
        staff.credentialHash = pbkdf2.credentialHash;
        staff.credentialSalt = pbkdf2.credentialSalt;
        staff.credentialIterations = pbkdf2.credentialIterations;
        await this.syncStaffProfileToFirestore(staff, cred.user.uid);
        return { verified: true, user: cred.user };
      } catch {}
    }
    return { verified: false };
  }

  /**
   * Updates or synchronizes the Firebase Auth password for the current authenticated staff.
   */
  public static async updateAuthPassword(newPassword: string, staff?: StaffUser): Promise<{ success: boolean; error?: string }> {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'No authenticated Firebase user session found' };
    }
    const cleanPass = staff
      ? await this.deriveStrongFirebasePassword(staff, newPassword)
      : (newPassword.length >= 12 ? newPassword : `Pos#${this.hashStaffCredential(newPassword)}!9`);
    try {
      await updatePassword(user, cleanPass);
      return { success: true };
    } catch (err: any) {
      console.warn('[FirebaseAuthService] updateAuthPassword failed:', err?.message || err);
      return { success: false, error: err?.message || 'Password update failed' };
    }
  }

  /**
   * Synchronize active staff user record into Firestore /staffUsers/{id} and /staffAccess/{firebaseUid}
   * Explicitly deletes any leftover plaintext pin/password fields in Firestore using deleteField() (R1 & R3).
   */
  public static async syncStaffProfileToFirestore(staff: StaffUser, firebaseUid: string, isOwnerAction: boolean = false): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      const canWriteStaffAccess = isOwnerAction || staff.role === 'Owner';

      // 1. Only Owner sessions write /staffAccess/{firebaseUid} (Critical #2: non-Owner clients never write staffAccess)
      if (canWriteStaffAccess) {
        const accessRef = doc(db, 'staffAccess', firebaseUid);
        await setDoc(accessRef, {
          uid: firebaseUid,
          staffId: staff.id,
          username: staff.username,
          name: staff.name,
          role: staff.role,
          email: staff.email || this.getAuthEmail(staff),
          active: staff.active !== false,
          updatedAt: nowIso,
        }, { merge: true }).catch(() => {});
      }

      // 2. Sync staff profile in /staffUsers/{id}
      const userRef = doc(db, 'staffUsers', staff.id);
      const payload: Record<string, any> = {
        id: staff.id,
        username: staff.username,
        name: staff.name,
        role: staff.role,
        phone: staff.phone,
        email: staff.email || this.getAuthEmail(staff),
        active: staff.active !== false,
        restrictWorkingHours: staff.restrictWorkingHours ?? false,
        workStartTime: staff.workStartTime || null,
        workEndTime: staff.workEndTime || null,
        firebaseUid,
        ...(staff.credentialHash ? { credentialHash: staff.credentialHash } : {}),
        ...(staff.credentialSalt ? { credentialSalt: staff.credentialSalt } : {}),
        ...(staff.credentialIterations ? { credentialIterations: staff.credentialIterations } : {}),
        lastLoginAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(userRef, payload, { merge: true });
      if (staff.pin || staff.password) {
        await updateDoc(userRef, {
          pin: deleteField(),
          password: deleteField(),
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[FirebaseAuthService] Could not save staff profile to Firestore:', err);
    }
  }

  /**
   * Provisions a new or updated staff member's Firebase Authentication account via the Owner-only server endpoint (/api/staff)
   * without calling createUserWithEmailAndPassword from the browser (Critical #1).
   */
  public static async provisionStaffAccountOnServer(
    staff: StaffUser,
    rawPinOrPassword: string
  ): Promise<{ success: boolean; uid?: string; error?: string }> {
    try {
      const currentOwner = this.getFirebaseUser();
      if (!currentOwner) {
        return { success: false, error: 'Owner Firebase Auth session is required to provision staff.' };
      }
      const idToken = await currentOwner.getIdToken();
      const internalEmail = this.getInternalAuthEmail(staff);
      const strongPassword = await this.deriveStrongFirebasePassword(staff, rawPinOrPassword);

      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          id: staff.id,
          username: staff.username,
          name: staff.name,
          role: staff.role,
          email: internalEmail,
          password: strongPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.uid) {
        return { success: false, error: data?.error || `Server returned HTTP ${res.status}` };
      }
      await this.syncStaffProfileToFirestore({ ...staff, firebaseUid: data.uid }, data.uid, true);
      return { success: true, uid: data.uid };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Staff provisioning request failed' };
    }
  }

  /**
   * Logs out from Firebase Authentication
   */
  public static async logout(): Promise<void> {
    try {
      await firebaseSignOut(auth);
      this.currentUser = null;
    } catch (err) {
      console.warn('[FirebaseAuthService] Sign out error:', err);
    }
  }
}

// Initialize on module load
if (typeof window !== 'undefined') {
  FirebaseAuthService.init();
}
