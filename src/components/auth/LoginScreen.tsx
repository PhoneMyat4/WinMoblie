import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  ShieldCheck, 
  Store, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  User, 
  ArrowRight, 
  CheckCircle2,
  Database,
  Flame
} from 'lucide-react';
import { StaffUser, ShopSettings } from '../../types';
import { FirebaseAuthService } from '../../services/firebaseAuthService';
import { FirestoreSyncService } from '../../services/firestoreSyncService';
import { checkStaffWorkingHoursAccess } from '../../utils/workingHours';
import { StorageService } from '../../utils/storage';

interface LoginScreenProps {
  staffUsers: StaffUser[];
  settings: ShopSettings;
  onLoginSuccess: (user: StaffUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  staffUsers,
  settings,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState<string>(() => {
    try {
      return localStorage.getItem('mobileshop_remembered_username') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberUsername, setRememberUsername] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('mobileshop_remembered_username'));
    } catch {
      return false;
    }
  });
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // Filter active staff accounts
  const activeStaff = staffUsers.filter(u => u.active !== false);

  // Proactively synchronize registered staff users from Firestore whenever the login screen mounts
  useEffect(() => {
    FirestoreSyncService.getInstance().fetchStaffUsersFromFirestore().catch(() => {});
  }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername) {
      setErrorMsg('Please enter your username.');
      triggerShake();
      return;
    }

    if (!cleanPassword) {
      setErrorMsg('Please enter your password.');
      triggerShake();
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    // 1. Gather all local registered staff accounts (from props and StorageService cache)
    const localCachedStaff = StorageService.getStaffUsers();
    const combinedStaff = localCachedStaff.length > 0 ? localCachedStaff : staffUsers;
    const activeStaffPool = combinedStaff.filter(u => u.active !== false);

    // Match registered staff user by username, email, phone, ID, or full name
    let matchedUser = activeStaffPool.find((u) => {
      const uId = (u.id || '').trim().toLowerCase();
      const uName = (u.username || '').trim().toLowerCase();
      const fullName = (u.name || '').trim().toLowerCase();
      const phoneDigits = (u.phone || '').replace(/\D/g, '');
      const inputDigits = cleanUsername.replace(/\D/g, '');
      const email = (u.email || '').trim().toLowerCase();

      return (
        uId === cleanUsername ||
        uName === cleanUsername ||
        fullName === cleanUsername ||
        (inputDigits.length >= 6 && phoneDigits.endsWith(inputDigits)) ||
        (cleanUsername.includes('@') && email === cleanUsername)
      );
    });

    // 2. If user is not yet in local cache, query Firestore directly for the live account
    if (!matchedUser) {
      try {
        const remoteUser = await FirestoreSyncService.getInstance().findStaffUserInFirestore(cleanUsername);
        if (remoteUser) {
          matchedUser = remoteUser;
          // Cache locally for offline resilience and fast subsequent loads
          StorageService.saveStaffUser(remoteUser, false);
        }
      } catch (lookupErr) {
        console.warn('Direct Firestore staff lookup failed:', lookupErr);
      }
    }

    // 3. Fallback: If no accounts exist at all in an empty database, allow bootstrap owner creation
    if (!matchedUser && activeStaffPool.length === 0) {
      const isOwnerEmail = cleanUsername === 'phonemyatpaing950@gmail.com' || cleanUsername.includes('@');
      const ownerUsername = isOwnerEmail ? cleanUsername.split('@')[0] : (cleanUsername || 'owner');
      const ownerAccount: StaffUser = {
        id: `owner-${Date.now()}`,
        username: ownerUsername,
        name: isOwnerEmail ? `Store Owner (${ownerUsername})` : 'Store Owner',
        role: 'Owner',
        email: isOwnerEmail ? cleanUsername : 'owner@apexpos.internal',
        phone: '09-123456789',
        pin: cleanPassword.length <= 6 && /^\d+$/.test(cleanPassword) ? cleanPassword : '1234',
        password: cleanPassword,
        active: true,
        avatarColor: 'bg-purple-600',
      };
      StorageService.saveStaffUser(ownerAccount, true);
      matchedUser = ownerAccount;
    }

    if (!matchedUser) {
      setErrorMsg('Invalid username or password. Please check your credentials.');
      triggerShake();
      setIsSubmitting(false);
      return;
    }

    // Track effective user object in case credentials update
    let effectiveUser = matchedUser;

    // 4. Verify password:
    // Check registered password or PIN strictly against the user's account (no hardcoded bypasses)
    let isValidPassword = 
      Boolean(cleanPassword) && (
        (Boolean(matchedUser.password) && matchedUser.password?.trim() === cleanPassword) ||
        (Boolean(matchedUser.pin) && matchedUser.pin?.trim() === cleanPassword)
      );

    // 5. If local password check fails, fetch the latest document directly from Firestore
    // (Handles when passwords or PINs are updated directly in the Firebase Console)
    if (!isValidPassword && matchedUser.id) {
      try {
        const freshUser = await FirestoreSyncService.getInstance().getFreshStaffUser(matchedUser.id);
        if (freshUser) {
          const freshMatches = 
            (freshUser.password && freshUser.password.trim() === cleanPassword) ||
            (freshUser.pin && freshUser.pin.trim() === cleanPassword);
          if (freshMatches) {
            isValidPassword = true;
            effectiveUser = { ...matchedUser, ...freshUser };
            StorageService.saveStaffUser(effectiveUser, false);
          }
        }
      } catch (freshErr) {
        console.warn('Fresh Firestore credential verification warning:', freshErr);
      }
    }

    // 6. If still not valid, verify directly with Firebase Authentication
    if (!isValidPassword) {
      try {
        const fbResult = await FirebaseAuthService.verifyFirebaseCredentials(matchedUser, cleanPassword);
        if (fbResult.verified) {
          isValidPassword = true;
          effectiveUser = {
            ...matchedUser,
            password: cleanPassword,
            pin: cleanPassword.length <= 6 ? cleanPassword : matchedUser.pin,
          };
          StorageService.saveStaffUser(effectiveUser, true);
        }
      } catch (err) {
        console.warn('Direct Firebase Auth verification error:', err);
      }
    }

    if (!isValidPassword) {
      setErrorMsg('Invalid username or password. Please check your credentials.');
      triggerShake();
      setPassword('');
      setIsSubmitting(false);
      return;
    }

    // 7. Enforce time-based working hours restriction (Staff with role 'Owner' is always exempt)
    const hoursCheck = checkStaffWorkingHoursAccess(effectiveUser);
    if (!hoursCheck.allowed) {
      setErrorMsg(hoursCheck.reason || 'Access denied: Login is not permitted outside authorized working hours. Please contact the store administrator.');
      triggerShake();
      setPassword('');
      setIsSubmitting(false);
      return;
    }

    // 8. Authenticate with Firebase Auth and sync user session to Firestore
    try {
      await FirebaseAuthService.loginStaffWithFirebase(effectiveUser, cleanPassword);
    } catch (fbErr) {
      console.warn('Firebase auth connection notice:', fbErr);
    }

    // 9. Remember username preference
    try {
      if (rememberUsername) {
        localStorage.setItem('mobileshop_remembered_username', cleanUsername);
      } else {
        localStorage.removeItem('mobileshop_remembered_username');
      }
    } catch {
      // ignore
    }

    setErrorMsg('');
    setIsSubmitting(false);
    onLoginSuccess(effectiveUser);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 relative overflow-hidden select-none">
      
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 p-6 sm:p-8">
        
        {/* Brand & Terminal Header */}
        <div className="flex flex-col items-center text-center mb-6">
          {settings.logoUrl ? (
            <div
              style={{
                width: `${Math.max(48, Math.min(96, Math.round((settings.shopLogoSize || 40) * 1.5)))}px`,
                height: `${Math.max(48, Math.min(96, Math.round((settings.shopLogoSize || 40) * 1.5)))}px`,
              }}
              className="flex items-center justify-center mb-3"
            >
              <img
                src={settings.logoUrl}
                alt={settings.shopName}
                className={`w-full h-full object-contain ${
                  settings.logoTransparentBg === false
                    ? 'bg-white p-2 rounded-2xl border border-slate-700 shadow-lg shadow-emerald-950/50'
                    : 'bg-transparent'
                }`}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-950/50 mb-3">
              <Store className="w-8 h-8" />
            </div>
          )}

          <h1 className="text-xl font-black text-white tracking-tight leading-snug">
            {settings.shopName || 'Mobile Shop POS'}
          </h1>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            POS Terminal Authentication
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] text-emerald-400 font-medium shadow-inner">
            <Flame className="w-3 h-3 text-amber-400 fill-amber-400/20" />
            <span>Firebase Auth & Firestore Connected</span>
          </div>
        </div>

        {/* Clean slate notice if no staff accounts exist */}
        {activeStaff.length === 0 && (
          <div className="mb-4 p-3 bg-purple-950/40 border border-purple-800/60 rounded-2xl text-purple-200 text-xs text-left">
            <p className="font-bold text-purple-100 flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Clean Slate Mode (0 Staff Accounts)</span>
            </p>
            <p className="text-[11px] text-purple-300/90 leading-relaxed">
              Sign in with any username (e.g. <span className="font-semibold text-white">owner</span> or your email) and password to initialize your genuine Store Owner account.
            </p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          
          {/* Username Input */}
          <div>
            <label 
              htmlFor="login-username-input"
              className="block text-xs font-bold text-slate-300 mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-username-input"
                type="text"
                required
                autoFocus={!username}
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-2xl text-sm font-semibold text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label 
                htmlFor="login-password-input"
                className="text-xs font-bold text-slate-300"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] font-semibold text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus={Boolean(username)}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-2xl text-sm font-medium text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Options Row */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-300 select-none">
              <input
                type="checkbox"
                checked={rememberUsername}
                onChange={(e) => setRememberUsername(e.target.checked)}
                className="w-4 h-4 rounded-md border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900"
              />
              <span>Remember username</span>
            </label>
            <span className="text-[11px] text-slate-500">
              Role-protected
            </span>
          </div>

          {/* Error Notification */}
          {errorMsg && (
            <div className={`flex items-start gap-2.5 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs font-semibold text-left ${isShaking ? 'animate-bounce' : ''}`}>
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="leading-relaxed flex-1">{errorMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="submit-staff-login-btn"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4" />
              <span>{isSubmitting ? 'Authenticating with Firebase...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </form>

        {/* Security Footer Note */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Secure Session &bull; Authorized Staff Only
          </p>
        </div>

      </div>

    </div>
  );
};
