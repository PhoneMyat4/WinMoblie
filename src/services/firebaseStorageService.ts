import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import { StorageService } from '../utils/storage';
import { ShopSettings } from '../types';

export type LogoType = 'pos' | 'invoice' | 'favicon';

/**
 * Sanitizes data for Firestore by converting undefined values to null or stripping them.
 * Firestore setDoc throws an error if any field in the object tree is undefined.
 */
function sanitizeForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    return value === undefined ? null : value;
  }));
}

export class FirebaseStorageService {
  /**
   * Converts a Base64 / Data URI string into a binary Blob for direct Firebase Storage upload.
   */
  public static dataUriToBlob(dataUri: string): Blob {
    try {
      const parts = dataUri.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const byteString = atob(parts[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeType });
    } catch (e) {
      console.warn('[FirebaseStorage] Failed dataUri conversion, falling back:', e);
      return new Blob([], { type: 'image/png' });
    }
  }

  /**
   * Deletes an existing file from Firebase Storage using deleteObject.
   * Accepts a permanent download URL or storage path.
   * Returns true if deleted (or already non-existent), false if skipped or error.
   */
  public static async deleteStorageFileByUrl(fileUrl?: string | null): Promise<boolean> {
    if (!fileUrl || typeof fileUrl !== 'string') return false;
    
    // Ignore base64 data URIs or non-Firebase URLs
    const isFirebaseStorage = fileUrl.includes('firebasestorage.googleapis.com') || fileUrl.startsWith('gs://');
    if (!isFirebaseStorage) {
      return false;
    }

    try {
      let fileRef;
      // Extract the encoded storage path from Firebase Storage URL: /o/{path}?
      const match = fileUrl.match(/\/o\/([^?#]+)/);
      if (match && match[1]) {
        const decodedPath = decodeURIComponent(match[1]);
        fileRef = ref(storage, decodedPath);
      } else {
        fileRef = ref(storage, fileUrl);
      }

      // Ensure deleteObject is explicitly wrapped in try-catch to prevent uncaught rejections
      try {
        await deleteObject(fileRef);
        console.log('[FirebaseStorage] Auto-cleanup: Successfully deleted old file from Storage:', fileUrl);
        return true;
      } catch (deleteErr: any) {
        // If object already does not exist (e.g. previously deleted or cleaned up), that's fine
        if (deleteErr?.code === 'storage/object-not-found' || deleteErr?.message?.includes('does not exist')) {
          console.log('[FirebaseStorage] Auto-cleanup: File was already removed from Storage:', fileUrl);
          return true;
        }
        console.warn('[FirebaseStorage] Auto-cleanup: Notice deleting old storage file via deleteObject:', deleteErr?.message || deleteErr);
        return false;
      }
    } catch (err: any) {
      console.warn('[FirebaseStorage] Auto-cleanup: Notice resolving storage file reference:', err?.message || err);
      return false;
    }
  }

  /**
   * Safely cleans up the old logo file if it exists and isn't shared by another logo field.
   */
  private static async cleanupOldLogoIfApplicable(
    logoType: LogoType,
    explicitOldUrl?: string | null
  ): Promise<void> {
    try {
      const current = StorageService.getSettings();
      let targetUrl = explicitOldUrl;

      if (!targetUrl) {
        if (logoType === 'pos') {
          targetUrl = current.logoUrl;
        } else if (logoType === 'invoice') {
          targetUrl = current.invoiceLogoUrl || current.invoiceCustomization?.shopLogoUrl;
        } else if (logoType === 'favicon') {
          targetUrl = current.faviconUrl;
        }
      }

      if (!targetUrl) return;

      // Ensure we don't delete an image that is currently shared by another active logo field
      const isSharedWithPos = logoType !== 'pos' && current.logoUrl === targetUrl;
      const isSharedWithInvoice = logoType !== 'invoice' && (current.invoiceLogoUrl === targetUrl || current.invoiceCustomization?.shopLogoUrl === targetUrl);
      const isSharedWithFavicon = logoType !== 'favicon' && current.faviconUrl === targetUrl;

      if (isSharedWithPos || isSharedWithInvoice || isSharedWithFavicon) {
        console.log(`[FirebaseStorage] Skipping deletion of ${targetUrl} because it is shared with another logo field.`);
        return;
      }

      await this.deleteStorageFileByUrl(targetUrl);
    } catch (err) {
      console.warn('[FirebaseStorage] Error during old logo cleanup:', err);
    }
  }

  /**
   * Uploads POS App Logo with automatic cleanup of the previous POS logo file.
   * Saves permanent download URL directly into Firestore settings/global document.
   */
  public static async uploadPosLogo(
    fileOrBlob: File | Blob,
    options?: {
      oldLogoUrl?: string;
      filename?: string;
      updateFirestoreSettings?: boolean;
    }
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    // Retain the old logo URL to clean up only after the new image URL is successfully generated
    const currentSettings = StorageService.getSettings();
    const oldLogoUrlToClean = options?.oldLogoUrl || currentSettings.logoUrl;

    // 1. Prepare new upload path & metadata
    const timestamp = Date.now();
    const rawName = options?.filename || (fileOrBlob instanceof File ? fileOrBlob.name : `pos_logo_${timestamp}.png`);
    const cleanFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `logos/pos/${timestamp}_${cleanFilename}`;
    const storageRef = ref(storage, storagePath);

    const contentType = fileOrBlob.type || 'image/png';
    const metadata = {
      contentType,
      cacheControl: 'public, max-age=31536000',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        logoField: 'pos_app_logo',
      },
    };

    console.log(`[FirebaseStorage] Uploading POS App Logo to ${storagePath}...`);
    const uploadResult = await uploadBytes(storageRef, fileOrBlob, metadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);
    if (!downloadUrl || typeof downloadUrl !== 'string') {
      throw new Error('[FirebaseStorage] Failed to generate download URL for uploaded POS logo.');
    }
    console.log('[FirebaseStorage] POS Logo uploaded successfully. Download URL:', downloadUrl);

    // 2. Only trigger Firestore document update after new image URL is successfully generated
    if (options?.updateFirestoreSettings !== false) {
      try {
        const current = StorageService.getSettings();
        const updated: ShopSettings = {
          ...current,
          logoUrl: downloadUrl,
        };
        StorageService.saveSettings(updated);

        const settingsDocRef = doc(db, 'settings', 'global');
        await setDoc(settingsDocRef, sanitizeForFirestore({
          ...updated,
          logoUrl: downloadUrl,
          lastSyncedAt: new Date().toISOString(),
        }), { merge: true });

        console.log('[FirebaseStorage] POS Logo URL saved directly to Firestore settings/global document.');
      } catch (err) {
        console.warn('[FirebaseStorage] Warning persisting POS logo to Firestore:', err);
      }
    }

    // 3. Auto-cleanup old file: wrapped in try-catch and only triggered after new URL is confirmed
    if (oldLogoUrlToClean && oldLogoUrlToClean !== downloadUrl) {
      try {
        await this.cleanupOldLogoIfApplicable('pos', oldLogoUrlToClean);
      } catch (cleanupErr) {
        console.warn('[FirebaseStorage] Safe cleanup warning for old POS logo:', cleanupErr);
      }
    }

    return { downloadUrl, storagePath };
  }

  /**
   * Uploads Invoice Logo with automatic cleanup of the previous Invoice logo file.
   * Saves permanent download URL directly into Firestore settings/global document.
   */
  public static async uploadInvoiceLogo(
    fileOrBlob: File | Blob,
    options?: {
      oldLogoUrl?: string;
      filename?: string;
      updateFirestoreSettings?: boolean;
    }
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    // Retain the old invoice logo URL to clean up only after the new image URL is successfully generated
    const currentSettings = StorageService.getSettings();
    const oldLogoUrlToClean = options?.oldLogoUrl || currentSettings.invoiceLogoUrl || currentSettings.invoiceCustomization?.shopLogoUrl;

    // 1. Prepare new upload path
    const timestamp = Date.now();
    const rawName = options?.filename || (fileOrBlob instanceof File ? fileOrBlob.name : `invoice_logo_${timestamp}.png`);
    const cleanFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `logos/invoice/${timestamp}_${cleanFilename}`;
    const storageRef = ref(storage, storagePath);

    const contentType = fileOrBlob.type || 'image/png';
    const metadata = {
      contentType,
      cacheControl: 'public, max-age=31536000',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        logoField: 'invoice_logo',
      },
    };

    console.log(`[FirebaseStorage] Uploading Invoice Logo to ${storagePath}...`);
    const uploadResult = await uploadBytes(storageRef, fileOrBlob, metadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);
    if (!downloadUrl || typeof downloadUrl !== 'string') {
      throw new Error('[FirebaseStorage] Failed to generate download URL for uploaded Invoice logo.');
    }
    console.log('[FirebaseStorage] Invoice Logo uploaded successfully. Download URL:', downloadUrl);

    // 2. Only trigger Firestore document update after new image URL is successfully generated
    if (options?.updateFirestoreSettings !== false) {
      try {
        const current = StorageService.getSettings();
        const updated: ShopSettings = {
          ...current,
          invoiceLogoUrl: downloadUrl,
          invoiceCustomization: {
            ...current.invoiceCustomization,
            shopLogoUrl: downloadUrl,
            showShopLogo: true,
          },
        };
        StorageService.saveSettings(updated);

        const settingsDocRef = doc(db, 'settings', 'global');
        await setDoc(settingsDocRef, sanitizeForFirestore({
          ...updated,
          invoiceLogoUrl: downloadUrl,
          invoiceCustomization: {
            ...updated.invoiceCustomization,
            shopLogoUrl: downloadUrl,
            showShopLogo: true,
          },
          lastSyncedAt: new Date().toISOString(),
        }), { merge: true });

        console.log('[FirebaseStorage] Invoice Logo URL saved directly to Firestore settings/global document.');
      } catch (err) {
        console.warn('[FirebaseStorage] Warning persisting Invoice logo to Firestore:', err);
      }
    }

    // 3. Auto-cleanup old file: wrapped in try-catch and only triggered after new URL is confirmed
    if (oldLogoUrlToClean && oldLogoUrlToClean !== downloadUrl) {
      try {
        await this.cleanupOldLogoIfApplicable('invoice', oldLogoUrlToClean);
      } catch (cleanupErr) {
        console.warn('[FirebaseStorage] Safe cleanup warning for old Invoice logo:', cleanupErr);
      }
    }

    return { downloadUrl, storagePath };
  }

  /**
   * Uploads Favicon Logo with automatic cleanup of the previous Favicon file.
   * Saves permanent download URL directly into Firestore settings/global document.
   */
  public static async uploadFavicon(
    fileOrBlob: File | Blob,
    options?: {
      oldLogoUrl?: string;
      filename?: string;
      updateFirestoreSettings?: boolean;
    }
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    // Retain the old favicon URL to clean up only after the new image URL is successfully generated
    const currentSettings = StorageService.getSettings();
    const oldLogoUrlToClean = options?.oldLogoUrl || currentSettings.faviconUrl;

    // 1. Prepare new upload path
    const timestamp = Date.now();
    const rawName = options?.filename || (fileOrBlob instanceof File ? fileOrBlob.name : `favicon_${timestamp}.png`);
    const cleanFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `favicons/${timestamp}_${cleanFilename}`;
    const storageRef = ref(storage, storagePath);

    const contentType = fileOrBlob.type || 'image/png';
    const metadata = {
      contentType,
      cacheControl: 'public, max-age=31536000',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        logoField: 'favicon_logo',
      },
    };

    console.log(`[FirebaseStorage] Uploading Favicon to ${storagePath}...`);
    const uploadResult = await uploadBytes(storageRef, fileOrBlob, metadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);
    if (!downloadUrl || typeof downloadUrl !== 'string') {
      throw new Error('[FirebaseStorage] Failed to generate download URL for uploaded Favicon.');
    }
    console.log('[FirebaseStorage] Favicon uploaded successfully. Download URL:', downloadUrl);

    // 2. Only trigger Firestore document update after new image URL is successfully generated
    if (options?.updateFirestoreSettings !== false) {
      try {
        const current = StorageService.getSettings();
        const updated: ShopSettings = {
          ...current,
          faviconUrl: downloadUrl,
        };
        StorageService.saveSettings(updated);

        const settingsDocRef = doc(db, 'settings', 'global');
        await setDoc(settingsDocRef, sanitizeForFirestore({
          ...updated,
          faviconUrl: downloadUrl,
          lastSyncedAt: new Date().toISOString(),
        }), { merge: true });

        console.log('[FirebaseStorage] Favicon URL saved directly to Firestore settings/global document.');
      } catch (err) {
        console.warn('[FirebaseStorage] Warning persisting Favicon to Firestore:', err);
      }
    }

    // 3. Auto-cleanup old file: wrapped in try-catch and only triggered after new URL is confirmed
    if (oldLogoUrlToClean && oldLogoUrlToClean !== downloadUrl) {
      try {
        await this.cleanupOldLogoIfApplicable('favicon', oldLogoUrlToClean);
      } catch (cleanupErr) {
        console.warn('[FirebaseStorage] Safe cleanup warning for old Favicon:', cleanupErr);
      }
    }

    return { downloadUrl, storagePath };
  }

  /**
   * Removes a specific logo field, performs deleteObject auto-cleanup in Storage,
   * and clears the field in Firestore settings/global document.
   */
  public static async removeLogo(logoType: LogoType, currentUrl?: string | null): Promise<void> {
    const current = StorageService.getSettings();
    let urlToRemove = currentUrl;

    if (!urlToRemove) {
      if (logoType === 'pos') urlToRemove = current.logoUrl;
      else if (logoType === 'invoice') urlToRemove = current.invoiceLogoUrl || current.invoiceCustomization?.shopLogoUrl;
      else if (logoType === 'favicon') urlToRemove = current.faviconUrl;
    }

    // Auto-cleanup from Firebase Storage safely wrapped in try-catch
    if (urlToRemove) {
      try {
        await this.cleanupOldLogoIfApplicable(logoType, urlToRemove);
      } catch (cleanupErr) {
        console.warn(`[FirebaseStorage] Safe cleanup warning for ${logoType} logo in removeLogo:`, cleanupErr);
      }
    }

    // Update settings
    try {
      let updated: ShopSettings = { ...current };
      const firestoreUpdate: any = { lastSyncedAt: new Date().toISOString() };

      if (logoType === 'pos') {
        updated.logoUrl = '';
        firestoreUpdate.logoUrl = '';
      } else if (logoType === 'invoice') {
        updated.invoiceLogoUrl = '';
        updated.invoiceCustomization = {
          ...updated.invoiceCustomization,
          shopLogoUrl: '',
          showShopLogo: false,
        };
        firestoreUpdate.invoiceLogoUrl = '';
        firestoreUpdate.invoiceCustomization = {
          ...updated.invoiceCustomization,
          shopLogoUrl: '',
          showShopLogo: false,
        };
      } else if (logoType === 'favicon') {
        updated.faviconUrl = '';
        firestoreUpdate.faviconUrl = '';
      }

      StorageService.saveSettings(updated);

      const settingsDocRef = doc(db, 'settings', 'global');
      await setDoc(settingsDocRef, sanitizeForFirestore(firestoreUpdate), { merge: true });
      console.log(`[FirebaseStorage] ${logoType.toUpperCase()} logo removed from Storage and Firestore settings.`);
    } catch (err) {
      console.warn(`[FirebaseStorage] Warning clearing ${logoType} logo:`, err);
    }
  }

  /**
   * Alias for backward compatibility with uploadShopLogo
   */
  public static async uploadShopLogo(
    fileOrBlob: File | Blob,
    options?: {
      filename?: string;
      updateFirestoreSettings?: boolean;
      oldLogoUrl?: string;
    }
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    return this.uploadPosLogo(fileOrBlob, options);
  }

  /**
   * Generic image uploader for product photos, vouchers, or payment proofs.
   */
  public static async uploadImage(
    fileOrBlob: File | Blob,
    folder: string = 'images'
  ): Promise<string> {
    const timestamp = Date.now();
    const cleanFilename = `${timestamp}_${Math.random().toString(36).substring(2, 9)}.png`;
    const storagePath = `${folder}/${cleanFilename}`;
    const storageRef = ref(storage, storagePath);

    const metadata = {
      contentType: fileOrBlob.type || 'image/png',
    };

    const uploadResult = await uploadBytes(storageRef, fileOrBlob, metadata);
    return await getDownloadURL(uploadResult.ref);
  }
}
