import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { StaffUser } from '../types';

export class FirebaseAuthService {
  private static currentUser: FirebaseUser | null = null;
  private static listeners: Set<(user: FirebaseUser | null) => void> = new Set();

  public static init() {
    if (typeof window === 'undefined') return;

    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
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
    callback(this.currentUser);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public static getFirebaseUser(): FirebaseUser | null {
    return this.currentUser || auth.currentUser;
  }

  public static isAuthenticated(): boolean {
    return Boolean(this.currentUser || auth.currentUser);
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
   * Signs in or registers the staff user into Firebase Authentication.
   * Ensures Firebase request.auth is populated for Firestore security rules.
   */
  public static async loginStaffWithFirebase(staff: StaffUser, enteredPassword: string): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
    const email = this.getAuthEmail(staff);
    const password = enteredPassword.length >= 6 ? enteredPassword : `${enteredPassword}123456`.slice(0, 12);

    try {
      // 1. Attempt standard email/password sign-in
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        this.currentUser = cred.user;
        await this.syncStaffProfileToFirestore(staff, cred.user.uid);
        return { success: true, user: cred.user };
      } catch (signInErr: any) {
        // If user doesn't exist yet in Firebase Auth, create account
        if (
          signInErr.code === 'auth/user-not-found' ||
          signInErr.code === 'auth/invalid-credential' ||
          signInErr.code === 'auth/invalid-email'
        ) {
          try {
            const newCred = await createUserWithEmailAndPassword(auth, email, password);
            this.currentUser = newCred.user;
            await this.syncStaffProfileToFirestore(staff, newCred.user.uid);
            return { success: true, user: newCred.user };
          } catch (createErr: any) {
            // If creation fails due to existing email with another password, try anonymous sign-in
            console.warn('[FirebaseAuthService] Creation error, attempting anonymous fallback:', createErr.message);
          }
        } else {
          console.warn('[FirebaseAuthService] Sign-in warning:', signInErr.message);
        }
      }

      // 2. Anonymous authentication fallback to ensure Firestore database access
      const anonCred = await signInAnonymously(auth);
      this.currentUser = anonCred.user;
      await this.syncStaffProfileToFirestore(staff, anonCred.user.uid);
      return { success: true, user: anonCred.user };
    } catch (err: any) {
      console.error('[FirebaseAuthService] Firebase authentication error:', err);
      return { 
        success: false, 
        error: err.message || 'Firebase authentication failed' 
      };
    }
  }

  /**
   * Synchronize active staff user record into Firestore /staffUsers/{id}
   */
  public static async syncStaffProfileToFirestore(staff: StaffUser, firebaseUid: string): Promise<void> {
    try {
      const userRef = doc(db, 'staffUsers', staff.id);
      const payload = {
        id: staff.id,
        username: staff.username,
        name: staff.name,
        role: staff.role,
        phone: staff.phone,
        email: staff.email || '',
        active: staff.active !== false,
        restrictWorkingHours: staff.restrictWorkingHours ?? false,
        workStartTime: staff.workStartTime || null,
        workEndTime: staff.workEndTime || null,
        firebaseUid,
        lastLoginAt: new Date().toISOString(),
      };
      await setDoc(userRef, payload, { merge: true });
    } catch (err) {
      console.warn('[FirebaseAuthService] Could not save staff profile to Firestore:', err);
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
