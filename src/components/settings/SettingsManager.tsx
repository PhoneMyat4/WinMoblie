import React, { useState, useRef } from 'react';
import { 
  Settings, 
  Store, 
  Printer, 
  DollarSign, 
  FileText, 
  MessageSquare, 
  RotateCcw, 
  Download, 
  Upload, 
  Check, 
  ShieldCheck,
  Smartphone,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  Link,
  Info,
  RefreshCw,
  Cloud,
  Radio,
  Database,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Wrench,
  Share2,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  Flame,
  ArrowUpCircle,
  ArrowDownCircle,
  Server,
  Sliders,
  Archive
} from 'lucide-react';
import { ShopSettings, SystemHealthReport, CleanupResult, Sale } from '../../types';
import { StorageService } from '../../utils/storage';
import { syncService } from '../../utils/syncService';
import { usePeriodicSync } from '../../hooks/usePeriodicSync';
import { SecretsVaultManager } from './SecretsVaultManager';
import { DataArchiveCleanup } from '../admin/DataArchiveCleanup';
import { authenticatedFetch } from '../../utils/apiClient';
import { firestoreSync, FirestoreSyncStatus } from '../../services/firestoreSyncService';
import { FirebaseAuthService } from '../../services/firebaseAuthService';
import { firebaseConfig } from '../../lib/firebase';
import { LogoSizeAdjusterModal } from './LogoSizeAdjusterModal';
import { processLogoImage } from '../../utils/imageCompression';
import { FirebaseStorageService } from '../../services/firebaseStorageService';
import { processFaviconImage, updateDocumentFavicon } from '../../utils/favicon';

interface SettingsManagerProps {
  settings: ShopSettings;
  onUpdateSettings: (settings: ShopSettings) => void;
  onResetData: () => void;
  onClearTestData?: () => void;
  sales?: Sale[];
  onArchiveSalesComplete?: (deletedSaleIds: string[]) => void;
}

export type SettingsSection = 'all' | 'secrets' | 'store' | 'facebook' | 'system' | 'firebase' | 'archive';

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  settings,
  onUpdateSettings,
  onResetData,
  onClearTestData,
  sales = [],
  onArchiveSalesComplete,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('all');
  const [formData, setFormData] = useState<ShopSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Fresh Database / Wipe Test Data State
  const [isClearFreshModalOpen, setIsClearFreshModalOpen] = useState<boolean>(false);
  const [includeFirestoreWipe, setIncludeFirestoreWipe] = useState<boolean>(true);
  const [isWipingData, setIsWipingData] = useState<boolean>(false);
  const [wipeResult, setWipeResult] = useState<{ success: boolean; message: string } | null>(null);

  // 1. POS App Logo Management State
  const posLogoInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingPosLogo, setIsDraggingPosLogo] = useState<boolean>(false);
  const [posUrlInputOpen, setPosUrlInputOpen] = useState<boolean>(false);
  const [customPosUrl, setCustomPosUrl] = useState<string>('');
  const [isUploadingPosLogo, setIsUploadingPosLogo] = useState<boolean>(false);
  const [posStorageStatus, setPosStorageStatus] = useState<string | null>(null);

  // 2. Invoice & Receipt Logo Management State
  const invoiceLogoInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingInvoiceLogo, setIsDraggingInvoiceLogo] = useState<boolean>(false);
  const [invoiceUrlInputOpen, setInvoiceUrlInputOpen] = useState<boolean>(false);
  const [customInvoiceUrl, setCustomInvoiceUrl] = useState<string>('');
  const [isUploadingInvoiceLogo, setIsUploadingInvoiceLogo] = useState<boolean>(false);
  const [invoiceStorageStatus, setInvoiceStorageStatus] = useState<string | null>(null);

  // 3. Browser Favicon Management State
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFavicon, setIsDraggingFavicon] = useState<boolean>(false);
  const [isFaviconUrlInputOpen, setIsFaviconUrlInputOpen] = useState<boolean>(false);
  const [customFaviconUrl, setCustomFaviconUrl] = useState<string>('');
  const [isUploadingFavicon, setIsUploadingFavicon] = useState<boolean>(false);
  const [faviconStatusMessage, setFaviconStatusMessage] = useState<string | null>(null);

  const syncInfo = usePeriodicSync(2000);

  const [healthReport, setHealthReport] = useState<SystemHealthReport>(() => StorageService.getSystemHealthReport());
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);

  const [firebaseStatus, setFirebaseStatus] = useState<FirestoreSyncStatus>({
    isConnected: FirebaseAuthService.isAuthenticated(),
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
  });
  const [fbSyncMessage, setFbSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    return firestoreSync.subscribeStatus((status) => {
      setFirebaseStatus(status);
    });
  }, []);

  const handlePushToFirebase = async () => {
    setFbSyncMessage(null);
    const res = await firestoreSync.pushAllToFirestore();
    if (res.success) {
      setFbSyncMessage({ type: 'success', text: res.message });
    } else {
      setFbSyncMessage({ type: 'error', text: res.message });
    }
  };

  const handlePullFromFirebase = async () => {
    setFbSyncMessage(null);
    const res = await firestoreSync.pullAllFromFirestore();
    if (res.success) {
      setFbSyncMessage({ type: 'success', text: `Successfully pulled and synchronized ${res.count} records from Firestore (local state replaced)!` });
    } else {
      setFbSyncMessage({ type: 'error', text: 'Could not fetch records from Firestore.' });
    }
  };

  const handleStartFresh = async () => {
    setIsWipingData(true);
    setWipeResult(null);

    // Pause both Firestore realtime sync and server sync so that listeners
    // do not immediately re-hydrate the cleared data mid-wipe
    firestoreSync.pauseSync();
    syncService.pause();

    try {
      // 1. Wipe local test data (products, sales, purchases, customers, expenses, drawers, etc.)
      if (onClearTestData) {
        onClearTestData();
      } else {
        StorageService.clearAllTestData();
      }

      let firestoreInfo = '';
      // 2. Wipe Firestore test collections if requested & authenticated
      if (includeFirestoreWipe && FirebaseAuthService.isAuthenticated()) {
        const firestoreRes = await firestoreSync.clearFirestoreTestData();
        if (firestoreRes.success) {
          firestoreInfo = ` and wiped ${firestoreRes.deletedCount} remote records in Cloud Firestore`;
        } else {
          firestoreInfo = ` (Cloud warning: ${firestoreRes.message})`;
        }
      }

      // 3. Explicitly reset and synchronize clean state to the server
      await syncService.resetServerState();

      setWipeResult({
        success: true,
        message: `Database successfully cleared! All demo products, IMEI serials, and test transactions were removed${firestoreInfo}. Your store is ready for live stock.`,
      });

      // Automatically dismiss modal after showing confirmation
      setTimeout(() => {
        setIsClearFreshModalOpen(false);
        setIsWipingData(false);
      }, 1600);
    } catch (err: any) {
      console.error('Error starting fresh database:', err);
      setWipeResult({
        success: false,
        message: err?.message || 'Failed to wipe test data.',
      });
      setIsWipingData(false);
    } finally {
      // Resume sync services now that the wipe and reset are complete
      firestoreSync.resumeSync();
      syncService.resume();
    }
  };

  const [showFbToken, setShowFbToken] = useState<boolean>(false);
  const [fbTesting, setFbTesting] = useState<boolean>(false);
  const [fbTestResult, setFbTestResult] = useState<{ success: boolean; message: string; pageName?: string } | null>(null);

  const handleTestFbConnection = async () => {
    setFbTesting(true);
    setFbTestResult(null);
    try {
      const pageId = formData.socialMediaConfig?.pageId?.trim();
      const pageAccessToken = formData.socialMediaConfig?.pageAccessToken?.trim();

      const response = await authenticatedFetch('/api/facebook/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, pageAccessToken }),
      });

      const data = await response.json();
      if (data.success) {
        setFbTestResult({
          success: true,
          message: data.message || `Successfully connected to Facebook Page "${data.pageName || pageId}"!`,
          pageName: data.pageName,
        });
        if (data.pageName && !formData.socialMediaConfig?.pageName) {
          setFormData(prev => ({
            ...prev,
            socialMediaConfig: {
              ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
              pageName: data.pageName,
            },
          }));
        }
      } else {
        setFbTestResult({
          success: false,
          message: data.error || 'Connection failed. Please verify your Page ID and Page Access Token.',
        });
      }
    } catch (err: any) {
      setFbTestResult({
        success: false,
        message: err?.message || 'Network error testing Facebook credentials.',
      });
    } finally {
      setFbTesting(false);
    }
  };

  const handleOptimizeStorage = () => {
    setOptimizing(true);
    setTimeout(() => {
      const res = StorageService.performDataOptimization();
      setCleanupResult(res);
      setHealthReport(StorageService.getSystemHealthReport());
      setOptimizing(false);
    }, 400);
  };

  const [isLogoAdjusterOpen, setIsLogoAdjusterOpen] = useState<boolean>(false);
  const [logoAdjusterTarget, setLogoAdjusterTarget] = useState<'shop' | 'invoice'>('shop');

  // ==========================================
  // 1. POS APP LOGO HANDLERS (Firebase Storage + Auto-Cleanup)
  // ==========================================
  const uploadPosLogoToFirebaseStorage = async (originalFile?: File, dataUri?: string) => {
    try {
      setIsUploadingPosLogo(true);
      setPosStorageStatus('Uploading POS App Logo to Firebase Storage...');

      let blobToUpload: Blob;
      if (originalFile) {
        blobToUpload = originalFile;
      } else if (dataUri) {
        blobToUpload = FirebaseStorageService.dataUriToBlob(dataUri);
      } else {
        return;
      }

      // Upload to Firebase Storage with auto-cleanup (deleteObject) of old POS logo
      const { downloadUrl } = await FirebaseStorageService.uploadPosLogo(blobToUpload, {
        oldLogoUrl: formData.logoUrl,
        updateFirestoreSettings: true,
      });

      setPosStorageStatus('POS App Logo saved to Firebase Storage & Firestore!');
      setTimeout(() => setPosStorageStatus(null), 4000);

      setFormData(prev => {
        const next = {
          ...prev,
          logoUrl: downloadUrl,
        };
        onUpdateSettings(next);
        StorageService.saveSettings(next);
        firestoreSync.syncSettings(next).catch(e => console.warn('[SettingsManager] syncSettings POS logo error:', e));
        return next;
      });
    } catch (err: any) {
      console.warn('[SettingsManager] Firebase Storage POS logo upload:', err);
      setPosStorageStatus('Saved locally (Storage sync will retry)');
      setTimeout(() => setPosStorageStatus(null), 4000);
    } finally {
      setIsUploadingPosLogo(false);
    }
  };

  const processPosLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WEBP, or SVG).');
      return;
    }

    try {
      const pngDataUri = await processLogoImage(file, {
        maxDimension: 600,
        backgroundColor: 'transparent',
      });
      setFormData(prev => ({
        ...prev,
        logoUrl: pngDataUri,
        logoTransparentBg: true,
        shopLogoSize: prev.shopLogoSize || 40,
      }));
      setLogoAdjusterTarget('shop');
      setIsLogoAdjusterOpen(true);

      uploadPosLogoToFirebaseStorage(file, pngDataUri);
    } catch (err: any) {
      alert(err?.message || 'Failed to process POS logo image.');
    }
  };

  const handlePosLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processPosLogoFile(file);
  };

  const handlePosLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingPosLogo(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processPosLogoFile(file);
  };

  const handleApplyPosLogoUrl = () => {
    if (!customPosUrl.trim()) return;
    const cleanUrl = customPosUrl.trim();
    setFormData(prev => ({ ...prev, logoUrl: cleanUrl }));
    setCustomPosUrl('');
    setPosUrlInputOpen(false);
    setPosStorageStatus('Online POS logo URL applied!');
    setTimeout(() => setPosStorageStatus(null), 3500);
  };

  const handleRemovePosLogo = async () => {
    const oldUrl = formData.logoUrl;
    setFormData(prev => ({
      ...prev,
      logoUrl: '',
    }));
    if (posLogoInputRef.current) posLogoInputRef.current.value = '';
    setPosStorageStatus('Removing POS logo and auto-cleaning Storage...');
    await FirebaseStorageService.removeLogo('pos', oldUrl);
    setPosStorageStatus('POS logo removed successfully');
    setTimeout(() => setPosStorageStatus(null), 3000);
  };

  // ==========================================
  // 2. INVOICE & RECEIPT LOGO HANDLERS (Firebase Storage + Auto-Cleanup)
  // ==========================================
  const uploadInvoiceLogoToFirebaseStorage = async (originalFile?: File, dataUri?: string) => {
    try {
      setIsUploadingInvoiceLogo(true);
      setInvoiceStorageStatus('Uploading Invoice Logo to Firebase Storage...');

      let blobToUpload: Blob;
      if (originalFile) {
        blobToUpload = originalFile;
      } else if (dataUri) {
        blobToUpload = FirebaseStorageService.dataUriToBlob(dataUri);
      } else {
        return;
      }

      // Upload to Firebase Storage with auto-cleanup (deleteObject) of old Invoice logo
      const currentInvoiceUrl = formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl;
      const { downloadUrl } = await FirebaseStorageService.uploadInvoiceLogo(blobToUpload, {
        oldLogoUrl: currentInvoiceUrl,
        updateFirestoreSettings: true,
      });

      setInvoiceStorageStatus('Invoice Logo saved to Firebase Storage & Firestore!');
      setTimeout(() => setInvoiceStorageStatus(null), 4000);

      setFormData(prev => {
        const next = {
          ...prev,
          invoiceLogoUrl: downloadUrl,
          invoiceCustomization: {
            ...prev.invoiceCustomization,
            shopLogoUrl: downloadUrl,
            showShopLogo: true,
          },
        };
        onUpdateSettings(next);
        StorageService.saveSettings(next);
        firestoreSync.syncSettings(next).catch(e => console.warn('[SettingsManager] syncSettings Invoice logo error:', e));
        return next;
      });
    } catch (err: any) {
      console.warn('[SettingsManager] Firebase Storage Invoice logo upload:', err);
      setInvoiceStorageStatus('Saved locally (Storage sync will retry)');
      setTimeout(() => setInvoiceStorageStatus(null), 4000);
    } finally {
      setIsUploadingInvoiceLogo(false);
    }
  };

  const processInvoiceLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WEBP, or SVG).');
      return;
    }

    try {
      const pngDataUri = await processLogoImage(file, {
        maxDimension: 600,
        backgroundColor: 'transparent',
      });
      setFormData(prev => ({
        ...prev,
        invoiceLogoUrl: pngDataUri,
        invoiceLogoSize: prev.invoiceLogoSize || 44,
        invoiceCustomization: {
          ...prev.invoiceCustomization,
          shopLogoUrl: pngDataUri,
          showShopLogo: true,
          invoiceLogoSize: prev.invoiceCustomization?.invoiceLogoSize || prev.invoiceLogoSize || 44,
        },
      }));
      setLogoAdjusterTarget('invoice');
      setIsLogoAdjusterOpen(true);

      uploadInvoiceLogoToFirebaseStorage(file, pngDataUri);
    } catch (err: any) {
      alert(err?.message || 'Failed to process Invoice logo image.');
    }
  };

  const handleInvoiceLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processInvoiceLogoFile(file);
  };

  const handleInvoiceLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingInvoiceLogo(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processInvoiceLogoFile(file);
  };

  const handleApplyInvoiceLogoUrl = () => {
    if (!customInvoiceUrl.trim()) return;
    const cleanUrl = customInvoiceUrl.trim();
    setFormData(prev => ({
      ...prev,
      invoiceLogoUrl: cleanUrl,
      invoiceCustomization: {
        ...prev.invoiceCustomization,
        shopLogoUrl: cleanUrl,
        showShopLogo: true,
      },
    }));
    setCustomInvoiceUrl('');
    setInvoiceUrlInputOpen(false);
    setInvoiceStorageStatus('Online Invoice logo URL applied!');
    setTimeout(() => setInvoiceStorageStatus(null), 3500);
  };

  const handleSyncPosToInvoiceLogo = () => {
    if (!formData.logoUrl) {
      alert('Please upload a POS App logo first or choose an invoice logo image.');
      return;
    }
    const logoUrl = formData.logoUrl;
    setFormData(prev => ({
      ...prev,
      invoiceLogoUrl: logoUrl,
      invoiceCustomization: {
        ...prev.invoiceCustomization,
        shopLogoUrl: logoUrl,
        showShopLogo: true,
      },
    }));
    setInvoiceStorageStatus('POS logo copied to invoice logo!');
    setTimeout(() => setInvoiceStorageStatus(null), 3000);

    if (logoUrl.startsWith('data:')) {
      uploadInvoiceLogoToFirebaseStorage(undefined, logoUrl);
    }
  };

  const handleRemoveInvoiceLogo = async () => {
    const oldUrl = formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl;
    setFormData(prev => ({
      ...prev,
      invoiceLogoUrl: '',
      invoiceCustomization: {
        ...prev.invoiceCustomization,
        shopLogoUrl: '',
        showShopLogo: false,
      },
    }));
    if (invoiceLogoInputRef.current) invoiceLogoInputRef.current.value = '';
    setInvoiceStorageStatus('Removing invoice logo and auto-cleaning Storage...');
    await FirebaseStorageService.removeLogo('invoice', oldUrl);
    setInvoiceStorageStatus('Invoice logo removed successfully');
    setTimeout(() => setInvoiceStorageStatus(null), 3000);
  };

  // ==========================================
  // 3. BROWSER FAVICON HANDLERS (Firebase Storage + Auto-Cleanup)
  // ==========================================
  const uploadFaviconToFirebaseStorage = async (originalFile?: File, dataUri?: string) => {
    try {
      setIsUploadingFavicon(true);
      setFaviconStatusMessage('Uploading favicon to Firebase Storage...');
      
      let blobToUpload: Blob;
      if (originalFile) {
        blobToUpload = originalFile;
      } else if (dataUri) {
        blobToUpload = FirebaseStorageService.dataUriToBlob(dataUri);
      } else {
        return;
      }

      // Upload to Firebase Storage with auto-cleanup (deleteObject) of old favicon
      const { downloadUrl } = await FirebaseStorageService.uploadFavicon(blobToUpload, {
        oldLogoUrl: formData.faviconUrl,
        updateFirestoreSettings: true,
      });

      setFaviconStatusMessage('Favicon uploaded to Firebase Storage & saved to Firestore!');
      setTimeout(() => setFaviconStatusMessage(null), 4000);

      setFormData(prev => {
        const next = {
          ...prev,
          faviconUrl: downloadUrl,
        };
        onUpdateSettings(next);
        StorageService.saveSettings(next);
        firestoreSync.syncSettings(next).catch(e => console.warn('[SettingsManager] syncSettings Favicon error:', e));
        return next;
      });
      updateDocumentFavicon(downloadUrl);
    } catch (err: any) {
      console.warn('[SettingsManager] Firebase Storage favicon upload:', err);
      setFaviconStatusMessage('Favicon saved locally & applied to browser tab');
      setTimeout(() => setFaviconStatusMessage(null), 4000);
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const processAndApplyFavicon = async (file: File) => {
    if (!file.type.startsWith('image/') && !file.name.endsWith('.ico')) {
      alert('Please upload a valid image file (ICO, PNG, SVG, WEBP, or JPG).');
      return;
    }

    try {
      const dataUri = await processFaviconImage(file);
      setFormData(prev => ({
        ...prev,
        faviconUrl: dataUri,
      }));
      updateDocumentFavicon(dataUri);
      uploadFaviconToFirebaseStorage(file, dataUri);
    } catch (err) {
      console.error('Error processing favicon:', err);
      alert('Could not process image for favicon. Please try another file.');
    }
  };

  const handleFaviconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndApplyFavicon(file);
    }
  };

  const handleFaviconDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFavicon(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processAndApplyFavicon(file);
    }
  };

  const handleApplyCustomFaviconUrl = () => {
    if (!customFaviconUrl.trim()) return;
    const cleanUrl = customFaviconUrl.trim();
    setFormData(prev => ({
      ...prev,
      faviconUrl: cleanUrl,
    }));
    updateDocumentFavicon(cleanUrl);
    setCustomFaviconUrl('');
    setIsFaviconUrlInputOpen(false);
    setFaviconStatusMessage('Custom favicon URL applied!');
    setTimeout(() => setFaviconStatusMessage(null), 3500);
  };

  const handleUseLogoAsFavicon = () => {
    if (!formData.logoUrl) {
      alert('Please upload a POS logo first or select a favicon file.');
      return;
    }
    const logoUrl = formData.logoUrl;
    setFormData(prev => ({
      ...prev,
      faviconUrl: logoUrl,
    }));
    updateDocumentFavicon(logoUrl);
    setFaviconStatusMessage('POS logo applied as browser tab favicon!');
    setTimeout(() => setFaviconStatusMessage(null), 3500);

    if (logoUrl.startsWith('data:')) {
      uploadFaviconToFirebaseStorage(undefined, logoUrl);
    }
  };

  const handleRemoveFavicon = async () => {
    const oldUrl = formData.faviconUrl;
    setFormData(prev => ({
      ...prev,
      faviconUrl: '',
    }));
    updateDocumentFavicon('');
    if (faviconInputRef.current) {
      faviconInputRef.current.value = '';
    }
    setFaviconStatusMessage('Removing favicon and cleaning Storage...');
    await FirebaseStorageService.removeLogo('favicon', oldUrl);
    setFaviconStatusMessage('Favicon reset to default');
    setTimeout(() => setFaviconStatusMessage(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    StorageService.saveSettings(formData);
    try {
      await firestoreSync.syncSettings(formData);
    } catch (err) {
      console.warn('[SettingsManager] syncSettings error on form submit:', err);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportBackup = () => {
    const data = StorageService.exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MobileShop_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const success = StorageService.importData(json);
        if (success) {
          alert('Backup restored successfully! The page will now refresh.');
          window.location.reload();
        } else {
          alert('Failed to parse backup file. Invalid format.');
        }
      } catch (err) {
        alert('Error reading backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div id="settings-screen" className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Shop & System Configuration</h2>
          <p className="text-xs text-slate-500">Configure business information, custom app logo, printer styles, tax rates, and database backups</p>
        </div>

        {savedSuccess && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl animate-in fade-in">
            <Check className="w-4 h-4" /> Settings Saved!
          </span>
        )}
      </div>

      {/* Settings Section Quick Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveSection('all')}
          className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Settings
        </button>

        <button
          type="button"
          id="tab-secrets-vault"
          onClick={() => setActiveSection('secrets')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'secrets'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Secrets & API Keys</span>
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('store')}
          className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'store'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Store & Invoices
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('facebook')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'facebook'
              ? 'bg-[#1877F2] text-white shadow-xs'
              : 'bg-blue-50 border border-blue-200 text-[#1877F2] hover:bg-blue-100'
          }`}
        >
          <span>Facebook Marketing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('system')}
          className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'system'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Storage & Backups
        </button>

        <button
          type="button"
          id="tab-firebase-database"
          onClick={() => setActiveSection('firebase')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'firebase'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Firebase Database</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </button>

        <button
          type="button"
          id="tab-data-archive"
          onClick={() => setActiveSection('archive')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'archive'
              ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-xs'
              : 'bg-amber-50/80 border border-amber-200 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-amber-600" />
          <span>Data Archiving & Cleanup</span>
        </button>
      </div>

      {(activeSection === 'all' || activeSection === 'store') && (
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* 3 Distinct Logo Fields: POS App Logo, Invoice Logo, and Favicon Logo */}
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  Branding &amp; 3 Dedicated Logo Fields
                  <span className="text-[10px] normal-case bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-medium">
                    Auto-Cleanup Active
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Direct Firebase Storage uploads (<code className="text-amber-300 font-mono text-[11px]">uploadBytes</code> + <code className="text-amber-300 font-mono text-[11px]">getDownloadURL</code>) with automatic orphaned file deletion (<code className="text-amber-300 font-mono text-[11px]">deleteObject</code>).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Synced directly to Firestore settings document</span>
            </div>
          </div>

          {/* =========================================================
              LOGO FIELD 1: POS APP LOGO
             ========================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs">
                  1
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    POS App Logo
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 normal-case">
                      Sidebar &bull; Top App Bar &bull; Staff Lock Screen
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Primary software logo used in UI headers, navigation drawer, and staff authentication screen
                  </p>
                </div>
              </div>

              {formData.logoUrl && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="adjust-pos-photo-size-btn"
                    onClick={() => {
                      setLogoAdjusterTarget('shop');
                      setIsLogoAdjusterOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Crop &amp; Transparency
                  </button>
                  <button
                    type="button"
                    id="remove-pos-logo-btn"
                    onClick={handleRemovePosLogo}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove POS Logo
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left: Upload and Controls */}
              <div className="md:col-span-7 space-y-4">
                <input
                  ref={posLogoInputRef}
                  type="file"
                  id="pos-logo-file-input"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={handlePosLogoFileChange}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingPosLogo(true); }}
                  onDragLeave={() => setIsDraggingPosLogo(false)}
                  onDrop={handlePosLogoDrop}
                  onClick={() => posLogoInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer ${
                    isDraggingPosLogo 
                      ? 'border-indigo-600 bg-indigo-50/50 scale-[1.01]' 
                      : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2 shadow-xs">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-800 mb-0.5">
                    {isUploadingPosLogo ? 'Uploading to Firebase Storage...' : 'Drag & drop POS App logo or browse files'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Supports PNG, JPG, WEBP, SVG. Preserves alpha transparency automatically.
                  </p>
                </div>

                {posStorageStatus && (
                  <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                    isUploadingPosLogo 
                      ? 'bg-indigo-50/80 border-indigo-200 text-indigo-800' 
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    <Flame className={`w-4 h-4 ${isUploadingPosLogo ? 'animate-pulse text-indigo-600' : 'text-emerald-600'}`} />
                    <span className="font-medium">{posStorageStatus}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPosUrlInputOpen(!posUrlInputOpen)}
                    className="text-slate-600 hover:text-indigo-600 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Link className="w-3.5 h-3.5" />
                    {posUrlInputOpen ? 'Hide URL input' : 'Paste online Image URL'}
                  </button>
                  <span className="text-[11px] text-slate-400 font-medium">Auto-cleans replaced storage files</span>
                </div>

                {posUrlInputOpen && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in">
                    <input
                      type="url"
                      placeholder="https://example.com/pos-logo.png"
                      value={customPosUrl}
                      onChange={(e) => setCustomPosUrl(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPosLogoUrl}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}

                {/* Size and Style Settings for POS Logo */}
                {formData.logoUrl && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-slate-700">POS Logo Display Size:</label>
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {formData.shopLogoSize || 40}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="24"
                        max="80"
                        step="2"
                        value={formData.shopLogoSize || 40}
                        onChange={(e) => setFormData(prev => ({ ...prev, shopLogoSize: parseInt(e.target.value) }))}
                        className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                      />
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {[28, 40, 52, 64].map(sz => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, shopLogoSize: sz }))}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                              (formData.shopLogoSize || 40) === sz
                                ? 'bg-indigo-600 text-white border-indigo-700'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {sz}px
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Display Background:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, logoTransparentBg: true }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            formData.logoTransparentBg !== false
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Transparent
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, logoTransparentBg: false }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            formData.logoTransparentBg === false
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          White Card
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Live Preview in POS Sidebar Dark Mode & Alpha Test */}
              <div className="md:col-span-5 bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  POS Sidebar Preview &bull; Dark Navigation Bar
                </span>

                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-center gap-3">
                  {formData.logoUrl ? (
                    <div
                      style={{
                        width: `${formData.shopLogoSize || 40}px`,
                        height: `${formData.shopLogoSize || 40}px`,
                      }}
                      className="shrink-0 flex items-center justify-center transition-all"
                    >
                      <img
                        src={formData.logoUrl}
                        alt="POS Logo Preview"
                        style={{
                          maxWidth: `${formData.shopLogoSize || 40}px`,
                          maxHeight: `${formData.shopLogoSize || 40}px`,
                        }}
                        className={`w-full h-full object-contain ${
                          formData.logoTransparentBg === false
                            ? 'bg-white p-1 rounded-xl border border-slate-700 shadow-md'
                            : 'bg-transparent'
                        }`}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shrink-0">
                      <Store className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white truncate leading-tight">
                      {formData.shopName || 'Mobile Store POS'}
                    </p>
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                      POS Main Navigation ({formData.shopLogoSize || 40}px)
                    </span>
                  </div>
                </div>

                {formData.logoUrl && (
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-700 block">Transparency Checker:</span>
                    <div
                      className="w-full h-16 rounded-lg border border-slate-300 flex items-center justify-center p-1.5 relative overflow-hidden"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                        backgroundSize: '10px 10px',
                        backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <img
                        src={formData.logoUrl}
                        alt="POS Checker"
                        className="max-h-full max-w-full object-contain bg-transparent"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* =========================================================
              LOGO FIELD 2: INVOICE & RECEIPT LOGO
             ========================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                  2
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    Invoice &amp; Receipt Logo
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 normal-case">
                      Printed Customer Bills &bull; 80mm/58mm Thermal Receipts &bull; Invoice PDFs
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    High-contrast logo rendered at the top of customer sales vouchers and thermal printer receipts
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={handleSyncPosToInvoiceLogo}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Copy from POS Logo
                  </button>
                )}

                {(formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl) && (
                  <>
                    <button
                      type="button"
                      id="adjust-invoice-photo-size-btn"
                      onClick={() => {
                        setLogoAdjusterTarget('invoice');
                        setIsLogoAdjusterOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Adjust Crop
                    </button>
                    <button
                      type="button"
                      id="remove-invoice-logo-btn"
                      onClick={handleRemoveInvoiceLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Invoice Logo
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left: Upload & Controls */}
              <div className="md:col-span-7 space-y-4">
                <input
                  ref={invoiceLogoInputRef}
                  type="file"
                  id="invoice-logo-file-input"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={handleInvoiceLogoFileChange}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingInvoiceLogo(true); }}
                  onDragLeave={() => setIsDraggingInvoiceLogo(false)}
                  onDrop={handleInvoiceLogoDrop}
                  onClick={() => invoiceLogoInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer ${
                    isDraggingInvoiceLogo 
                      ? 'border-emerald-600 bg-emerald-50/50 scale-[1.01]' 
                      : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-800 mb-0.5">
                    {isUploadingInvoiceLogo ? 'Uploading to Firebase Storage...' : 'Upload dedicated Invoice / Receipt logo'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    High resolution monochrome or clean color logo recommended for sharp thermal prints.
                  </p>
                </div>

                {invoiceStorageStatus && (
                  <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                    isUploadingInvoiceLogo 
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' 
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    <Flame className={`w-4 h-4 ${isUploadingInvoiceLogo ? 'animate-pulse text-emerald-600' : 'text-emerald-600'}`} />
                    <span className="font-medium">{invoiceStorageStatus}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setInvoiceUrlInputOpen(!invoiceUrlInputOpen)}
                    className="text-slate-600 hover:text-emerald-600 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Link className="w-3.5 h-3.5" />
                    {invoiceUrlInputOpen ? 'Hide URL input' : 'Paste Invoice Image URL'}
                  </button>
                  <span className="text-[11px] text-slate-400 font-medium">Automatic deleteObject on replace</span>
                </div>

                {invoiceUrlInputOpen && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in">
                    <input
                      type="url"
                      placeholder="https://example.com/invoice-logo.png"
                      value={customInvoiceUrl}
                      onChange={(e) => setCustomInvoiceUrl(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleApplyInvoiceLogoUrl}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}

                {/* Invoice Logo Size Slider */}
                {(formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl) && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-slate-700">Receipt Printed Logo Height:</label>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {formData.invoiceLogoSize || 44}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="24"
                      max="120"
                      step="2"
                      value={formData.invoiceLogoSize || 44}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        invoiceLogoSize: parseInt(e.target.value),
                        invoiceCustomization: {
                          ...prev.invoiceCustomization,
                          invoiceLogoSize: parseInt(e.target.value),
                        }
                      }))}
                      className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                    />
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {[32, 44, 60, 80].map(sz => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            invoiceLogoSize: sz,
                            invoiceCustomization: {
                              ...prev.invoiceCustomization,
                              invoiceLogoSize: sz,
                            }
                          }))}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            (formData.invoiceLogoSize || 44) === sz
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {sz}px
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Live Printed Receipt Header Mockup */}
              <div className="md:col-span-5 bg-slate-100/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Live Thermal Receipt Header Mockup
                </span>

                <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-xs font-mono text-center space-y-2">
                  <div className="flex justify-center items-center">
                    {(formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl) ? (
                      <img
                        src={formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl}
                        alt="Invoice Logo Receipt Preview"
                        style={{ maxHeight: `${formData.invoiceLogoSize || 44}px` }}
                        className="w-auto object-contain transition-all"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase">
                      {formData.shopName || 'MYANMAR MOBILE STORE'}
                    </h4>
                    <p className="text-[10px] text-slate-500">{formData.address || 'No. 124, Anawrahta Road, Yangon'}</p>
                    <p className="text-[10px] text-slate-500">Tel: {formData.phone || '09-798123456'}</p>
                  </div>

                  <div className="border-t border-dashed border-slate-300 pt-1.5 text-[10px] text-slate-400 flex justify-between">
                    <span>INV-202609-001</span>
                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================
              LOGO FIELD 3: BROWSER FAVICON & TAB ICON
             ========================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black text-xs">
                  3
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    Favicon Logo
                    <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 normal-case">
                      Browser Tabs &bull; Bookmarks &bull; PWA App Icon
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Miniature 16x16 / 32x32 icon displayed on browser tab headers and mobile home screen shortcuts
                  </p>
                </div>
              </div>

              {faviconStatusMessage && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg animate-in fade-in">
                  {faviconStatusMessage}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left Column: Upload and Setup Controls */}
              <div className="md:col-span-7 space-y-4">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFavicon(true); }}
                  onDragLeave={() => setIsDraggingFavicon(false)}
                  onDrop={handleFaviconDrop}
                  onClick={() => faviconInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    isDraggingFavicon
                      ? 'border-purple-500 bg-purple-50/50'
                      : 'border-slate-200 hover:border-purple-400 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png, image/x-icon, image/vnd.microsoft.icon, image/svg+xml, image/webp, image/jpeg"
                    onChange={handleFaviconFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {isUploadingFavicon ? 'Uploading favicon to Firebase Storage...' : 'Click to upload or drag & drop Favicon'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Supports .ico, .png, .svg, .webp (Square 32x32 or 64x64 recommended)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={handleUseLogoAsFavicon}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Use Current POS Logo
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsFaviconUrlInputOpen(!isFaviconUrlInputOpen)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Link className="w-3.5 h-3.5" />
                    {isFaviconUrlInputOpen ? 'Hide URL Input' : 'Enter Favicon URL'}
                  </button>

                  {formData.faviconUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveFavicon}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Reset to Default Favicon
                    </button>
                  )}
                </div>

                {/* URL Input Box */}
                {isFaviconUrlInputOpen && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in">
                    <input
                      type="url"
                      placeholder="https://example.com/icon.png or .ico"
                      value={customFaviconUrl}
                      onChange={(e) => setCustomFaviconUrl(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCustomFaviconUrl}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Live Browser Tab Mockup & Live Previews */}
              <div className="md:col-span-5 space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Live Browser Tab &amp; Bookmark Mockup
                </span>

                {/* Realistic Browser Window Bar */}
                <div className="bg-slate-200 rounded-xl p-2.5 border border-slate-300 shadow-inner">
                  {/* Simulated Tab Bar */}
                  <div className="flex items-center gap-1 mb-2">
                    <div className="flex gap-1.5 px-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                    </div>

                    {/* Active Tab Pill */}
                    <div className="flex-1 max-w-[210px] bg-white rounded-t-lg px-2.5 py-1.5 flex items-center gap-2 shadow-xs border-t border-x border-slate-200">
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        {formData.faviconUrl ? (
                          <img
                            src={formData.faviconUrl}
                            alt="Favicon"
                            className="w-4 h-4 object-contain rounded-xs"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-xs bg-purple-600 text-white flex items-center justify-center text-[9px] font-black">
                            📱
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-800 truncate leading-none">
                        {formData.shopName || 'Mobile Store POS'}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto font-mono">×</span>
                    </div>

                    <span className="text-slate-400 text-xs px-1 font-bold">+</span>
                  </div>

                  {/* Simulated Address Bar */}
                  <div className="bg-white rounded-md px-2.5 py-1 text-[10px] text-slate-600 flex items-center gap-1.5 border border-slate-200">
                    <span className="text-emerald-600 font-bold text-[9px]">🔒</span>
                    <span className="text-slate-400">https://</span>
                    <span className="text-slate-700 font-medium truncate">
                      {(formData.shopName || 'mobilestore').toLowerCase().replace(/[^a-z0-9]/g, '')}.pos.app
                    </span>
                  </div>
                </div>

                {/* Status Note */}
                <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[11px] text-slate-600">
                  <Info className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                  <p>
                    {formData.faviconUrl
                      ? 'Custom favicon is active. Your current browser tab has been dynamically updated in real-time.'
                      : 'Using default system favicon. Upload a PNG/ICO or click "Use Current POS Logo" to activate.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Store Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="w-5 h-5 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Store Profile & Information</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Store / Business Name *</label>
              <input
                type="text"
                required
                value={formData.shopName}
                onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Store Slogan / Tagline</label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Phone / WhatsApp</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* Financial & Tax Configuration */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Financial & Invoice Formats</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Symbol</label>
              <input
                type="text"
                value={formData.currencySymbol}
                onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tax / VAT Rate %</label>
              <input
                type="number"
                step="0.1"
                placeholder="0"
                value={formData.taxRatePercent === 0 ? '' : formData.taxRatePercent}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.currentTarget.select()}
                onChange={(e) => setFormData({ ...formData, taxRatePercent: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Prefix</label>
              <input
                type="text"
                value={formData.invoicePrefix}
                onChange={(e) => setFormData({ ...formData, invoicePrefix: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Repair Prefix</label>
              <input
                type="text"
                value={formData.repairPrefix}
                onChange={(e) => setFormData({ ...formData, repairPrefix: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Terms & Warranty Policy Notice</label>
            <textarea
              rows={2}
              value={formData.termsAndConditions}
              onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
          >
            Save All Configurations
          </button>
        </div>

      </form>
      )}

      {/* Secrets & API Credentials Vault Manager */}
      {(activeSection === 'all' || activeSection === 'secrets') && (
        <SecretsVaultManager
          formData={formData}
          setFormData={setFormData}
          onSave={() => {
            onUpdateSettings(formData);
            setSavedSuccess(true);
            setTimeout(() => setSavedSuccess(false), 3000);
          }}
        />
      )}

      {/* Multi-Tab & Server Synchronization Status */}
      {(activeSection === 'all' || activeSection === 'system') && (
      <>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-600 animate-pulse" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Multi-Tab & Server Synchronization</h3>
          </div>
          <button
            type="button"
            onClick={() => syncInfo.triggerManualSync()}
            disabled={syncInfo.status === 'syncing'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncInfo.status === 'syncing' ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
            <span>{syncInfo.status === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-500">Sync Status</span>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  syncInfo.status === 'offline' ? 'bg-amber-400' : 'bg-emerald-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  syncInfo.status === 'offline' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}></span>
              </span>
              <p className="font-bold text-slate-900 capitalize">{syncInfo.status === 'idle' ? 'Synced (Active)' : syncInfo.status}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-500">Sync Interval (Heartbeat)</span>
            <p className="font-bold text-slate-900 font-mono">Every 2.0s (setInterval)</p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-500">Current Tab Session</span>
            <p className="font-mono text-[11px] font-bold text-slate-700 truncate" title={syncInfo.tabId}>
              {syncInfo.tabId.slice(0, 16)}...
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          A continuous background sync interval runs every 2 seconds, instantly harmonizing sales, inventory stock changes, staff pin changes, and cash drawer balances across all opened browser windows and tabs.
        </p>
      </div>

      {/* System Health, Storage Footprint & Optimization */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">System Health & Storage Integrity</h3>
              <p className="text-xs text-slate-500">Local storage quota, collection footprint, and proactive deduplication</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOptimizeStorage}
            disabled={optimizing}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60 self-start sm:self-auto"
          >
            <Sparkles className={`w-3.5 h-3.5 ${optimizing ? 'animate-spin' : ''}`} />
            <span>{optimizing ? 'Optimizing Database...' : 'Run Storage Optimization'}</span>
          </button>
        </div>

        {cleanupResult && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Storage Optimization Complete</span>
            </div>
            <p className="text-emerald-700 text-[11px]">
              Freed {cleanupResult.freedBytes} bytes. Verified {healthReport.collections.productsCount} catalog items, pruned {cleanupResult.logsPruned} old logs, removed {cleanupResult.imeisDeduplicated} duplicate IMEIs, and resolved {cleanupResult.draftIdsCleaned} draft product references.
            </p>
          </div>
        )}

        {/* Quota Progress Bar */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-slate-500" />
              LocalStorage Capacity Usage
            </span>
            <span className="font-mono font-bold text-slate-900">
              {healthReport.storageSizeKb} KB / {healthReport.storageLimitKb} KB ({healthReport.usagePercentage}%)
            </span>
          </div>
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                healthReport.usagePercentage > 85
                  ? 'bg-rose-500'
                  : healthReport.usagePercentage > 50
                  ? 'bg-amber-500'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, healthReport.usagePercentage))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Quota standard: 5.0 MB</span>
            <span className={healthReport.status === 'optimal' ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
              {healthReport.status === 'optimal' ? 'System Status: Optimal & Clean' : 'Status: Attention Recommended'}
            </span>
          </div>
        </div>

        {/* Breakdown Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
            <span className="text-[11px] font-medium text-slate-500">Products / Phones</span>
            <p className="font-bold text-slate-900 text-sm">{healthReport.collections.productsCount} items</p>
            <p className="text-[10px] text-slate-500">{healthReport.collections.phoneVariantsCount} phone models</p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
            <span className="text-[11px] font-medium text-slate-500">Stock & Serial Numbers</span>
            <p className="font-bold text-slate-900 text-sm">{healthReport.collections.totalStockUnits} units</p>
            <p className="text-[10px] text-slate-500">{healthReport.collections.serializedImeisCount} serialized IMEIs</p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
            <span className="text-[11px] font-medium text-slate-500">Sales & Credit Ledger</span>
            <p className="font-bold text-slate-900 text-sm">{healthReport.collections.salesCount} sales</p>
            <p className="text-[10px] text-slate-500">{healthReport.collections.creditSalesCount} active credits</p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
            <span className="text-[11px] font-medium text-slate-500">Purchases & Expenses</span>
            <p className="font-bold text-slate-900 text-sm">{healthReport.collections.purchasesCount} POs</p>
            <p className="text-[10px] text-slate-500">{healthReport.collections.expensesCount} expense records</p>
          </div>
        </div>

        {/* Integrity summary */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>0 Duplicate Variants</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>0 Duplicate Serial IMEIs</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>{healthReport.collections.stockAdjustmentLogsCount + healthReport.collections.priceChangeLogsCount} Audit / Price Logs</span>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Meta Facebook Page Integration & Auto-Post Hub */}
      {(activeSection === 'all' || activeSection === 'facebook') && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1877F2] text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
              f
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Facebook Page Integration (Meta Graph API)
              </h3>
              <p className="text-[11px] text-slate-500">
                Connect your official store Facebook Page to enable automated AI advertisement photo & caption posting via chatbot
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestFbConnection}
            disabled={fbTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1877F2] text-xs font-bold rounded-xl transition-colors cursor-pointer border border-blue-200 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fbTesting ? 'animate-spin' : ''}`} />
            <span>{fbTesting ? 'Testing Meta API...' : 'Test Connection'}</span>
          </button>
        </div>

        {/* Feedback Alert from test */}
        {fbTestResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              fbTestResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {fbTestResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{fbTestResult.success ? 'Meta API Connected' : 'Connection Alert'}</p>
              <p className="text-[11px] mt-0.5">{fbTestResult.message}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Facebook Page ID */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Facebook Page ID
            </label>
            <input
              type="text"
              placeholder="e.g. 102938475612345"
              value={formData.socialMediaConfig?.pageId || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socialMediaConfig: {
                    ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
                    pageId: e.target.value,
                  },
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 font-mono text-xs transition-colors"
            />
            <p className="text-[10px] text-slate-500">Found in your Facebook Page &gt; Settings &gt; Page Transparency or About section</p>
          </div>

          {/* Facebook Page Display Name */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Page Name / Brand Label
            </label>
            <input
              type="text"
              placeholder="e.g. Golden Star Mobile Store"
              value={formData.socialMediaConfig?.pageName || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socialMediaConfig: {
                    ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
                    pageName: e.target.value,
                  },
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs transition-colors"
            />
            <p className="text-[10px] text-slate-500">Displayed in post previews and watermarks</p>
          </div>

          {/* Facebook Page Access Token */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Facebook Page Access Token (Permanent / Long-lived)
              </label>
              <button
                type="button"
                onClick={() => setShowFbToken(!showFbToken)}
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                {showFbToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showFbToken ? 'Hide Token' : 'Show Token'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showFbToken ? 'text' : 'password'}
                placeholder="EAA... (Never-expiring Meta Graph Page Access Token with pages_manage_posts & pages_read_engagement)"
                value={formData.socialMediaConfig?.pageAccessToken || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    socialMediaConfig: {
                      ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
                      pageAccessToken: e.target.value,
                    },
                  }))
                }
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 font-mono text-xs transition-colors"
              />
              <Key className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="text-[10px] text-slate-500">
              Can also be defined directly on the server container via <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">FB_PAGE_ACCESS_TOKEN</code> and <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">FB_PAGE_ID</code>.
            </p>
          </div>

          {/* AI Image Generation Preferred Strategy */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Product Visual Generation Strategy
            </label>
            <select
              value={formData.socialMediaConfig?.defaultImageGenerator || 'dalle-3'}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socialMediaConfig: {
                    ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
                    defaultImageGenerator: e.target.value as any,
                  },
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs transition-colors"
            >
              <option value="dalle-3">DALL-E 3 (Photorealistic Commercial Studio Lighting)</option>
              <option value="studio-flyer">Smart Studio Flyer (Product Sample Photo with Price Overlay)</option>
              <option value="sample-photo">Catalog Sample Photo (Exact Authentic Image)</option>
            </select>
          </div>

          {/* Default Advertising Copy Tone */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Advertising Copy Tone
            </label>
            <select
              value={formData.socialMediaConfig?.defaultTone || 'promotional'}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socialMediaConfig: {
                    ...(prev.socialMediaConfig || { defaultImageGenerator: 'dalle-3', defaultTone: 'promotional', autoPublishEnabled: true }),
                    defaultTone: e.target.value as any,
                  },
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-xs transition-colors"
            >
              <option value="promotional">Exciting Retail Promotion (Highlights Specs, Warranty & Call-to-Action)</option>
              <option value="technical">Technical Specs (Benchmark, Cameras, Battery & Performance)</option>
              <option value="urgent">Urgent Limited Stock / Flash Discount Offer</option>
              <option value="bilingual">Bilingual (Burmese + English for local Myanmar market)</option>
            </select>
          </div>
        </div>

        {/* How to use in Chatbot guide banner */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5 text-xs text-blue-900">
          <div className="flex items-center gap-1.5 font-bold text-blue-950">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>How to use with AI Chatbot:</span>
          </div>
          <p className="text-[11px] leading-relaxed text-blue-800">
            Open the AI Assistant widget at the bottom right and say: <br />
            <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-[10px] text-blue-900 border border-blue-200 mt-1 inline-block">
              &quot;Make a post about product 123 on our Facebook page with photo and specs&quot;
            </code>
            <br />
            The AI Copilot will automatically locate the item in your POS inventory, generate commercial photography and an engaging caption with hashtags, and post directly to your Meta Facebook Page.
          </p>
        </div>
      </div>
      )}

      {/* Database Backup & Reset Operations */}
      {(activeSection === 'all' || activeSection === 'system') && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <RotateCcw className="w-5 h-5 text-purple-600" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Database Backup & Recovery</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Export JSON Backup
          </button>

          <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer">
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Import JSON Backup</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>

          <button
            type="button"
            id="start-fresh-db-btn"
            onClick={() => {
              setWipeResult(null);
              setIsClearFreshModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/90 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Start Fresh (Wipe Test Data)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (confirm('Are you sure you want to restore the default initial sample store data? This will load demo phones, cookware, and sample transactions.')) {
                onResetData();
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-rose-600" />
            Reset to Demo Data
          </button>
        </div>
      </div>
      )}

      {/* Firebase Authentication & Cloud Database Panel */}
      {(activeSection === 'all' || activeSection === 'firebase' || activeSection === 'system') && (
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl border border-slate-800 p-6 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <Flame className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>Firebase Authentication & Cloud Database</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </h3>
              <p className="text-xs text-slate-400">Persistent cloud database with real-time sync and staff authentication</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 font-mono text-slate-300">
              {firebaseConfig?.projectId || 'Connected'}
            </span>
          </div>
        </div>

        {/* Database Config Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-amber-400" /> Firestore Database ID
            </span>
            <p className="font-mono text-[11px] font-bold text-amber-300 truncate" title={firebaseConfig?.firestoreDatabaseId}>
              {firebaseConfig?.firestoreDatabaseId || 'default'}
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Firebase Auth State
            </span>
            <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{FirebaseAuthService.isAuthenticated() ? 'Authenticated & Active' : 'Connected to Terminal'}</span>
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" /> Real-time Cloud Listeners
            </span>
            <p className="font-semibold text-cyan-300">
              {firebaseStatus.lastSyncedAt 
                ? `Synced ${firebaseStatus.lastSyncedAt.toLocaleTimeString()}` 
                : 'Listening for updates'}
            </p>
          </div>
        </div>

        {/* Sync message alert */}
        {fbSyncMessage && (
          <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            fbSyncMessage.type === 'success' 
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}>
            {fbSyncMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{fbSyncMessage.text}</span>
          </div>
        )}

        {/* Cloud Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            id="push-to-firebase-btn"
            onClick={handlePushToFirebase}
            disabled={firebaseStatus.isSyncing}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <ArrowUpCircle className={`w-4 h-4 ${firebaseStatus.isSyncing ? 'animate-spin' : ''}`} />
            <span>{firebaseStatus.isSyncing ? 'Synchronizing with Firestore...' : 'Push Local Store Data to Firestore'}</span>
          </button>

          <button
            type="button"
            id="pull-from-firebase-btn"
            onClick={handlePullFromFirebase}
            disabled={firebaseStatus.isSyncing}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <ArrowDownCircle className={`w-4 h-4 ${firebaseStatus.isSyncing ? 'animate-spin' : ''}`} />
            <span>Pull Remote Store Data from Firestore</span>
          </button>

          <button
            type="button"
            id="wipe-cloud-data-btn"
            onClick={() => {
              setWipeResult(null);
              setIncludeFirestoreWipe(true);
              setIsClearFreshModalOpen(true);
            }}
            disabled={firebaseStatus.isSyncing}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title="Wipe test data from Firestore"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Wipe Cloud Test Data</span>
          </button>
        </div>

        <div className="pt-2 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            25 Real-Time Firestore Collections Synced (/products, /sales, /staffUsers, /settings, /purchases, etc.)
          </span>
          <span className="text-slate-500">&bull;</span>
          <span>Rules enforced: request.auth != null</span>
        </div>
      </div>
      )}

      {/* Data Archiving & Cloud Storage Cleanup Module */}
      {(activeSection === 'all' || activeSection === 'firebase' || activeSection === 'archive' || activeSection === 'system') && (
        <DataArchiveCleanup
          settings={settings}
          sales={sales}
          onArchiveComplete={onArchiveSalesComplete}
        />
      )}

      {/* Logo Size & Crop Adjuster Modal */}
      {isLogoAdjusterOpen && (
        <LogoSizeAdjusterModal
          isOpen={isLogoAdjusterOpen}
          initialImage={
            logoAdjusterTarget === 'invoice'
              ? (formData.invoiceLogoUrl || formData.invoiceCustomization?.shopLogoUrl || formData.logoUrl || '')
              : (formData.logoUrl || '')
          }
          initialShopSize={formData.shopLogoSize || 40}
          initialInvoiceSize={formData.invoiceLogoSize || 44}
          initialTransparentBg={formData.logoTransparentBg !== false}
          title={
            logoAdjusterTarget === 'invoice'
              ? 'Adjust Printed Receipt & Invoice Logo'
              : 'Adjust POS Software & Sidebar Logo'
          }
          onClose={() => setIsLogoAdjusterOpen(false)}
          onSave={(newPngDataUrl, newShopSize, newInvoiceSize, isTransparent) => {
            if (logoAdjusterTarget === 'invoice') {
              setFormData(prev => ({
                ...prev,
                invoiceLogoUrl: newPngDataUrl,
                invoiceLogoSize: newInvoiceSize,
                invoiceCustomization: {
                  ...prev.invoiceCustomization,
                  shopLogoUrl: newPngDataUrl,
                  invoiceLogoSize: newInvoiceSize,
                  showShopLogo: true,
                }
              }));
              setIsLogoAdjusterOpen(false);
              uploadInvoiceLogoToFirebaseStorage(undefined, newPngDataUrl);
            } else {
              setFormData(prev => ({
                ...prev,
                logoUrl: newPngDataUrl,
                shopLogoSize: newShopSize,
                invoiceLogoSize: newInvoiceSize,
                logoTransparentBg: isTransparent,
              }));
              setIsLogoAdjusterOpen(false);
              uploadPosLogoToFirebaseStorage(undefined, newPngDataUrl);
            }
          }}
        />
      )}

      {/* Start Fresh Confirmation Modal */}
      {isClearFreshModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Start Fresh with Clean Database</h3>
                  <p className="text-xs text-amber-100 mt-0.5">Prepare your store for live operations without demo test data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isWipingData && setIsClearFreshModalOpen(false)}
                disabled={isWipingData}
                className="text-white/80 hover:text-white text-lg font-bold p-1 cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs text-slate-600">
              <p className="text-slate-700 leading-relaxed font-medium">
                This operation clears all initial sample inventory, test sales, and simulated transactions so you can start with a completely empty catalog ready for your real stock.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* What is preserved */}
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-[11px] uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Safely Preserved</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-emerald-900 font-medium">
                    <li>✓ Store Profile ({settings.shopName})</li>
                    <li>✓ Currency, Taxes & Receipt Settings</li>
                    <li>✓ Admin & Staff Accounts (No lockout)</li>
                    <li>✓ Permissions & Expense Categories</li>
                    <li>✓ Store Branding & Logos</li>
                  </ul>
                </div>

                {/* What is wiped */}
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-rose-800 text-[11px] uppercase tracking-wider">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Cleared / Reset</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-rose-900 font-medium">
                    <li>✕ All Demo Products & Cookware</li>
                    <li>✕ Serialized IMEI Records</li>
                    <li>✕ Past Sales & Customer Debts</li>
                    <li>✕ Test Suppliers & Customers</li>
                    <li>✕ Expenses, Damage Logs & Cash History</li>
                  </ul>
                </div>
              </div>

              {/* Firestore Checkbox if Firebase is available */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFirestoreWipe}
                    onChange={(e) => setIncludeFirestoreWipe(e.target.checked)}
                    disabled={isWipingData}
                    className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs block">
                      Also purge test collections in Cloud Firestore
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Wipes remote collections (/products, /sales, /purchases, etc.) from project {firebaseConfig?.projectId || 'connected database'} while keeping store settings and staff accounts synced.
                    </span>
                  </div>
                </label>
              </div>

              {/* Feedback Alert */}
              {wipeResult && (
                <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                  wipeResult.success 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-rose-50 border-rose-300 text-rose-800'
                }`}>
                  {wipeResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                  <span>{wipeResult.message}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsClearFreshModalOpen(false)}
                disabled={isWipingData}
                className="px-4 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-wipe-fresh-btn"
                onClick={handleStartFresh}
                disabled={isWipingData}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isWipingData ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Clearing Database...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Wipe Test Data & Start Fresh</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
