import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  Barcode,
  Camera,
  Upload,
  Sparkles,
  Share2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Trash2,
  ExternalLink,
  Tag,
  Layers,
  Smartphone,
  CheckSquare,
  Square,
  FileText,
  SlidersHorizontal,
  Code,
  Eye,
  Send,
  Plus,
  Zap,
  DollarSign,
  HelpCircle,
  Cpu,
  HardDrive,
  Clock,
  ArrowRight,
  ShieldCheck,
  Facebook,
  ImagePlus,
  RotateCcw,
  X
} from 'lucide-react';
import { 
  Product, 
  ShopSettings, 
  SocialMarketingState, 
  SocialMarketingMediaItem, 
  FacebookAdPostRecord 
} from '../../types';
import { StorageService } from '../../utils/storage';
import { lookupProductByCode, detectScanCodeCategory } from '../../utils/scannerLookup';
import { playSuccessBeep, playErrorBeep } from '../../utils/scannerAudio';
import { FacebookPostPreview } from './FacebookPostPreview';
import { PosLiveScannerModal } from '../pos/PosLiveScannerModal';
import { detectProductKind, isPhoneProduct, buildProductVisualPrompt, getCuratedCommercialPhoto } from '../../data/categoryTaxonomy';
import { authenticatedFetch } from '../../utils/apiClient';

interface SocialMediaMarketingProps {
  products: Product[];
  settings: ShopSettings;
  onNavigateTab?: (tab: string) => void;
}

// Initial default training few-shot example for competitor reference
const SAMPLE_COMPETITOR_TRAINING = `🔥 FLASH SALE ALERT! 🔥
The ultimate flagship phone is finally in stock at lowest market price!
⚡ Super AMOLED 120Hz display with razor-sharp clarity
⚡ 50MP Sony flagship camera sensor
⚡ All-day battery with 67W Turbo Flash Charging
💥 Special Promotion Price: Only this weekend!
✅ 100% Genuine with Official 1-Year Store Warranty
🚚 Free Home Delivery across Yangon & Mandalay!
📞 Hotline Order: 09-798123456
📍 Visit Our Shop: Central Mobile Hub, Strand Road
#SmartPhoneDeals #NewArrival #FlagshipStore`;

const DEFAULT_SOCIAL_STATE: SocialMarketingState = {
  // Step 1: Product Lookup
  skuOrBarcode: '',
  selectedProductId: null,
  productLookupStatus: 'idle',

  // Step 2: Media Management
  mediaGallery: [],
  aiImagePrompt: '',
  selectedImageModel: 'dall-e-3',
  isGeneratingAiImage: false,
  referenceImageUrl: null,
  referenceImageName: null,
  isAnalyzingReference: false,

  // Step 3: AI Copywriting & Training
  trainingText: '',
  trainingFileName: '',
  promptInstruction: 'Make it sound exciting and mention a Thingyan festival discount with free tempered glass and 1-year warranty.',
  aiTone: 'exciting_retail',
  selectedModel: 'gpt-4o-mini',
  isGeneratingCopy: false,

  // Step 4: Draft & Preview Console
  draftCaption: '',
  lastEditedAt: undefined,

  // Step 5: Publishing
  isPublishing: false,
  publishStatus: 'idle',
  publishedPostRecord: null,
  publishError: null,
};

export const SocialMediaMarketing: React.FC<SocialMediaMarketingProps> = ({
  products,
  settings,
  onNavigateTab,
}) => {
  // Quick Toast Helper
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // =========================================================================
  // CORE JSON STATE OBJECT (Tracking all inputs across Steps 1 to 5)
  // =========================================================================
  const [socialState, setSocialState] = useState<SocialMarketingState>(() => {
    // Try to load persisted draft from StorageService
    const saved = StorageService.getSocialMarketingState();
    if (saved) {
      // If the saved state was already finished/published, don't lock the UI on yesterday's completed post
      if (saved.publishStatus === 'published') {
        StorageService.clearSocialMarketingState();
        return { ...DEFAULT_SOCIAL_STATE };
      }
      if (Array.isArray(saved.mediaGallery)) {
        const prod = saved.selectedProductId ? products.find(p => p.id === saved.selectedProductId) : null;
        saved.mediaGallery = saved.mediaGallery.map(item => {
          if (item.url && item.url.includes('image.pollinations.ai')) {
            const healedUrl = getCuratedCommercialPhoto(prod || { brand: 'Anker', model: 'Nano II 30W', category: 'Accessories' } as any);
            return {
              ...item,
              url: healedUrl,
              title: item.title?.replace(/Flux AI Studio|Pollinations/i, 'Commercial Studio') || 'Commercial Studio Visual',
            };
          }
          return item;
        });
      }
      return saved;
    }

    return { ...DEFAULT_SOCIAL_STATE };
  });

  // UI Helper States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDragOverMedia, setIsDragOverMedia] = useState(false);
  const [isDragOverTraining, setIsDragOverTraining] = useState(false);
  const [showJsonInspector, setShowJsonInspector] = useState(false);
  const [activeTabSubView, setActiveTabSubView] = useState<'workflow' | 'history'>('workflow');
  const [publishedHistory, setPublishedHistory] = useState<FacebookAdPostRecord[]>(() => {
    return StorageService.getFacebookPosts();
  });

  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const trainingFileInputRef = useRef<HTMLInputElement | null>(null);
  const referencePhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-persist state changes to StorageService or clear if empty
  useEffect(() => {
    const isCleanDefault = 
      !socialState.selectedProductId &&
      !socialState.skuOrBarcode &&
      !socialState.draftCaption &&
      socialState.mediaGallery.length === 0 &&
      socialState.publishStatus === 'idle';

    if (isCleanDefault) {
      StorageService.clearSocialMarketingState();
    } else {
      StorageService.saveSocialMarketingState(socialState);
    }
  }, [socialState]);

  // Reset all workflow inputs and remove saved draft
  const handleResetWorkflow = useCallback((askConfirmation = true) => {
    const hasData = Boolean(
      socialState.selectedProductId || 
      socialState.skuOrBarcode ||
      socialState.draftCaption || 
      (socialState.mediaGallery && socialState.mediaGallery.length > 0)
    );

    if (askConfirmation && hasData && socialState.publishStatus !== 'published') {
      if (!window.confirm('Start a new marketing post? This will clear the current product, photos, and draft caption.')) {
        return;
      }
    }

    setSocialState({ ...DEFAULT_SOCIAL_STATE });
    StorageService.clearSocialMarketingState();
    showToast('info', 'Marketing pipeline reset. Ready for a new campaign!');
  }, [socialState, showToast]);

  // Whether an in-progress draft is currently active
  const hasActiveDraft = useMemo(() => {
    return Boolean(
      socialState.selectedProductId ||
      socialState.skuOrBarcode ||
      (socialState.draftCaption && socialState.draftCaption.trim().length > 0) ||
      (socialState.mediaGallery && socialState.mediaGallery.length > 0)
    ) && socialState.publishStatus !== 'published';
  }, [socialState]);

  // Currently resolved Product
  const selectedProduct = useMemo(() => {
    if (!socialState.selectedProductId) return null;
    return products.find(p => p.id === socialState.selectedProductId) || null;
  }, [products, socialState.selectedProductId]);

  // Selected media items for the final post
  const selectedMediaItems = useMemo(() => {
    return socialState.mediaGallery.filter(item => item.isSelected);
  }, [socialState.mediaGallery]);

  // =========================================================================
  // STEP 1: PRODUCT LOOKUP & SCANNER LOGIC
  // =========================================================================
  const handleBarcodeChange = (val: string) => {
    setSocialState(prev => ({
      ...prev,
      skuOrBarcode: val,
      productLookupStatus: val.trim() ? 'searching' : 'idle',
    }));

    // Trigger instant lookup if length >= 3
    if (val.trim().length >= 3) {
      triggerProductLookup(val.trim());
    } else if (!val.trim()) {
      setSocialState(prev => ({
        ...prev,
        selectedProductId: null,
        productLookupStatus: 'idle',
      }));
    }
  };

  const triggerProductLookup = (query: string) => {
    const clean = query.trim();
    if (!clean) return;

    // Use unified barcode/IMEI/SKU lookup utility
    const match = lookupProductByCode(clean, products);
    if (match.found && match.product) {
      playSuccessBeep();
      setSocialState(prev => {
        // If product has a catalog image, make sure it's available in media gallery
        let updatedGallery = [...prev.mediaGallery];
        if (match.product?.imageUrl && !updatedGallery.some(m => m.url === match.product?.imageUrl)) {
          updatedGallery.unshift({
            id: `catalog-${Date.now()}`,
            url: match.product.imageUrl,
            source: 'catalog',
            title: `${match.product.brand} ${match.product.model} Catalog Photo`,
            isSelected: true,
            addedAt: new Date().toISOString(),
          });
        }

        // Set default AI image prompt based on product details and archetype
        const visualPrompt = buildProductVisualPrompt(match.product!);

        return {
          ...prev,
          selectedProductId: match.product!.id,
          skuOrBarcode: clean,
          productLookupStatus: 'found',
          mediaGallery: updatedGallery,
          aiImagePrompt: visualPrompt,
        };
      });
      showToast('success', `Found product: ${match.product.name}`);
    } else {
      setSocialState(prev => ({
        ...prev,
        selectedProductId: null,
        productLookupStatus: 'not_found',
      }));
    }
  };

  const handleSelectProductDirectly = (product: Product) => {
    playSuccessBeep();
    setSocialState(prev => {
      let updatedGallery = [...prev.mediaGallery];
      if (product.imageUrl && !updatedGallery.some(m => m.url === product.imageUrl)) {
        updatedGallery.unshift({
          id: `catalog-${Date.now()}`,
          url: product.imageUrl,
          source: 'catalog',
          title: `${product.brand} ${product.model} Catalog Photo`,
          isSelected: true,
          addedAt: new Date().toISOString(),
        });
      }

      const visualPrompt = buildProductVisualPrompt(product);

      return {
        ...prev,
        selectedProductId: product.id,
        skuOrBarcode: product.barcode || product.sku || product.name,
        productLookupStatus: 'found',
        mediaGallery: updatedGallery,
        aiImagePrompt: visualPrompt,
      };
    });
    showToast('success', `Selected: ${product.name}`);
  };

  // Barcode scanner event listener placeholder
  const handleOpenBarcodeScanner = () => {
    setIsScannerOpen(true);
  };

  const handleBarcodeScanned = (scannedCode: string) => {
    setIsScannerOpen(false);
    handleBarcodeChange(scannedCode);
  };

  // =========================================================================
  // STEP 2: MEDIA MANAGEMENT (LOCAL & AI)
  // =========================================================================
  const processImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        showToast('error', `Skipped "${file.name}": Only image files are allowed.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          const newItem: SocialMarketingMediaItem = {
            id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            url: dataUrl,
            source: 'local',
            title: file.name,
            fileSize: file.size,
            isSelected: true, // Default to checked
            addedAt: new Date().toISOString(),
          };

          setSocialState(prev => ({
            ...prev,
            mediaGallery: [newItem, ...prev.mediaGallery],
          }));
          showToast('success', `Uploaded "${file.name}" to media gallery.`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleLocalFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverMedia(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleMediaCheckboxToggle = (id: string) => {
    setSocialState(prev => ({
      ...prev,
      mediaGallery: prev.mediaGallery.map(item => 
        item.id === id ? { ...item, isSelected: !item.isSelected } : item
      ),
    }));
  };

  const handleSelectAllMedia = (select: boolean) => {
    setSocialState(prev => ({
      ...prev,
      mediaGallery: prev.mediaGallery.map(item => ({ ...item, isSelected: select })),
    }));
  };

  const handleDeleteMediaItem = (id: string) => {
    setSocialState(prev => ({
      ...prev,
      mediaGallery: prev.mediaGallery.filter(item => item.id !== id),
    }));
  };

  // Reference Photo for AI Image Generation Handlers
  const handleReferencePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setSocialState(prev => ({
          ...prev,
          referenceImageUrl: dataUrl,
          referenceImageName: file.name,
        }));
        showToast('success', `Reference photo "${file.name}" uploaded. Ready for AI image generation.`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveReferencePhoto = () => {
    setSocialState(prev => ({
      ...prev,
      referenceImageUrl: null,
      referenceImageName: null,
    }));
    showToast('info', 'Reference photo removed.');
  };

  const handleAnalyzeReferencePhoto = async () => {
    if (!socialState.referenceImageUrl) return;

    setSocialState(prev => ({ ...prev, isAnalyzingReference: true }));
    showToast('info', 'Analyzing reference photo attributes with AI...');

    try {
      const res = await authenticatedFetch('/api/social-marketing/analyze-reference-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: socialState.referenceImageUrl,
          product: selectedProduct,
          settings,
        }),
      });
      const data = await res.json();
      if (data.success && data.suggestedPrompt) {
        setSocialState(prev => ({
          ...prev,
          aiImagePrompt: data.suggestedPrompt,
          isAnalyzingReference: false,
        }));
        showToast('success', 'AI prompt refined with authentic reference photo details!');
      } else {
        setSocialState(prev => ({ ...prev, isAnalyzingReference: false }));
      }
    } catch (err: any) {
      setSocialState(prev => ({ ...prev, isAnalyzingReference: false }));
      showToast('error', 'Could not analyze reference photo.');
    }
  };

  const handleAddReferenceToGallery = () => {
    if (!socialState.referenceImageUrl) return;

    const newItem: SocialMarketingMediaItem = {
      id: `ref-${Date.now()}`,
      url: socialState.referenceImageUrl,
      source: 'local',
      title: socialState.referenceImageName || `${selectedProduct?.model || 'Product'} Reference Photo`,
      isSelected: true,
      addedAt: new Date().toISOString(),
    };

    setSocialState(prev => ({
      ...prev,
      mediaGallery: [newItem, ...prev.mediaGallery],
    }));
    showToast('success', 'Reference photo added to Media Gallery for publishing.');
  };

  // Generate AI Image (DALL-E / Studio API)
  const handleGenerateAiImage = async () => {
    if (!selectedProduct) {
      showToast('error', 'Please lookup and select a product first in Step 1.');
      return;
    }

    setSocialState(prev => ({ ...prev, isGeneratingAiImage: true }));

    try {
      const response = await authenticatedFetch('/api/social-marketing/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: selectedProduct,
          prompt: socialState.aiImagePrompt,
          model: socialState.selectedImageModel || 'dall-e-3',
          settings,
          referenceImageUrl: socialState.referenceImageUrl,
        }),
      });

      const data = await response.json();
      if (data.success && data.imageUrl) {
        const newItem: SocialMarketingMediaItem = {
          id: `ai-${Date.now()}`,
          url: data.imageUrl,
          source: 'ai_generated',
          title: `AI Visual: ${selectedProduct.model}${data.engine ? ` (${data.engine})` : ''}`,
          isSelected: true,
          addedAt: new Date().toISOString(),
        };

        setSocialState(prev => ({
          ...prev,
          isGeneratingAiImage: false,
          mediaGallery: [newItem, ...prev.mediaGallery],
        }));
        playSuccessBeep();
        showToast(
          'success', 
          data.referenceUsed 
            ? `Generated visual referencing your uploaded photo using ${data.model || data.engine || socialState.selectedImageModel || 'DALL-E 3'}!` 
            : `Generated commercial studio visual with ${data.model || data.engine || socialState.selectedImageModel || 'DALL-E 3'}!`
        );
      } else {
        throw new Error(data.error || 'Failed to generate AI visual.');
      }
    } catch (err: any) {
      console.error('Error generating AI visual:', err);
      setSocialState(prev => ({ ...prev, isGeneratingAiImage: false }));
      showToast('error', err.message || 'AI image service unavailable.');
    }
  };

  // =========================================================================
  // STEP 3: AI COPYWRITING & TRAINING
  // =========================================================================
  const handleTrainingFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      showToast('error', 'Please upload a plain text (.txt) file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSocialState(prev => ({
        ...prev,
        trainingText: content || '',
        trainingFileName: file.name,
      }));
      showToast('success', `Loaded competitor training reference: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleLoadSampleCompetitorTraining = () => {
    setSocialState(prev => ({
      ...prev,
      trainingText: SAMPLE_COMPETITOR_TRAINING,
      trainingFileName: 'competitor_viral_ad_reference.txt',
    }));
    showToast('info', 'Loaded sample competitor few-shot training ad copy.');
  };

  // Generate Ad Copy using LLM (Gemini/OpenAI)
  const handleGenerateAdCopy = async () => {
    if (!selectedProduct) {
      showToast('error', 'Please select a product first in Step 1.');
      return;
    }

    setSocialState(prev => ({ ...prev, isGeneratingCopy: true }));

    try {
      const response = await authenticatedFetch('/api/social-marketing/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: selectedProduct,
          trainingText: socialState.trainingText,
          promptInstruction: socialState.promptInstruction,
          tone: socialState.aiTone,
          model: socialState.selectedModel || 'gpt-4o-mini',
          settings,
        }),
      });

      const data = await response.json();
      if (data.success && data.caption) {
        playSuccessBeep();
        setSocialState(prev => ({
          ...prev,
          isGeneratingCopy: false,
          draftCaption: data.caption,
          lastEditedAt: new Date().toISOString(),
        }));
        showToast('success', `Generated high-converting ad copy with ${data.model || socialState.selectedModel || 'gpt-4o-mini'}!`);
      } else {
        throw new Error(data.error || 'Failed to generate ad copy.');
      }
    } catch (err: any) {
      console.error('Error generating copy:', err);
      setSocialState(prev => ({ ...prev, isGeneratingCopy: false }));
      showToast('error', err.message || 'Copywriting service unavailable.');
    }
  };

  // =========================================================================
  // STEP 4: DRAFT & PREVIEW CONSOLE LOGIC
  // =========================================================================
  const handleDraftTextChange = (newText: string) => {
    setSocialState(prev => ({
      ...prev,
      draftCaption: newText,
      lastEditedAt: new Date().toISOString(),
    }));
  };

  const handleAppendDraftSnippet = (snippet: string) => {
    setSocialState(prev => ({
      ...prev,
      draftCaption: prev.draftCaption ? `${prev.draftCaption}\n${snippet}` : snippet,
      lastEditedAt: new Date().toISOString(),
    }));
  };

  // =========================================================================
  // STEP 5: PUBLISHING TO FACEBOOK
  // =========================================================================
  const handlePublishToFacebook = async () => {
    if (!socialState.draftCaption.trim()) {
      showToast('error', 'Draft caption cannot be empty before publishing.');
      return;
    }

    if (selectedMediaItems.length === 0) {
      showToast('error', 'Please select at least 1 image from the Media Gallery to include in the Facebook post.');
      return;
    }

    setSocialState(prev => ({
      ...prev,
      isPublishing: true,
      publishStatus: 'publishing',
      publishError: null,
    }));

    try {
      const response = await authenticatedFetch('/api/social-marketing/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: selectedProduct,
          caption: socialState.draftCaption,
          selectedImages: selectedMediaItems.map(m => m.url),
          pageId: settings.socialMediaConfig?.pageId,
          pageAccessToken: settings.socialMediaConfig?.pageAccessToken,
          settings,
        }),
      });

      const data = await response.json();
      if (data.success && data.post) {
        playSuccessBeep();
        // Persist to Facebook posts history
        StorageService.saveFacebookPost(data.post);
        setPublishedHistory(StorageService.getFacebookPosts());

        setSocialState(prev => ({
          ...prev,
          isPublishing: false,
          publishStatus: 'published',
          publishedPostRecord: data.post,
          publishError: null,
        }));
        showToast('success', data.message || 'Post published successfully to Facebook!');
      } else {
        throw new Error(data.error || 'Failed to publish post.');
      }
    } catch (err: any) {
      console.error('Publish error:', err);
      playErrorBeep();
      setSocialState(prev => ({
        ...prev,
        isPublishing: false,
        publishStatus: 'error',
        publishError: err.message || 'Publishing to Facebook failed.',
      }));
      showToast('error', err.message || 'Failed to publish to Facebook.');
    }
  };

  // =========================================================================
  // RENDER UI: 5 SECTIONS IN CLEAN DASHBOARD GRID
  // =========================================================================
  return (
    <div id="social-media-marketing-module" className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Module Header Bar */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Automated Social Media Marketing
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                  Operations • AI Engine
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                5-Step Automated Pipeline: Barcode Trigger &rarr; Media Manager &rarr; Competitor Training Copy &rarr; Live Draft &rarr; Meta Graph Publishing
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher & JSON State Inspector Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1 border border-slate-300/60 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTabSubView('workflow')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTabSubView === 'workflow'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Pipeline Workflow
            </button>
            <button
              type="button"
              onClick={() => setActiveTabSubView('history')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTabSubView === 'history'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>History</span>
              {publishedHistory.length > 0 && (
                <span className="px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] rounded-full font-bold">
                  {publishedHistory.length}
                </span>
              )}
            </button>
          </div>

          {/* Start New Campaign / Clear Form Button */}
          <button
            type="button"
            onClick={() => handleResetWorkflow(true)}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            title="Clear all inputs and start a brand new post"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Start New Post</span>
          </button>

          <button
            type="button"
            onClick={() => setShowJsonInspector(!showJsonInspector)}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
              showJsonInspector
                ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Code className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">JSON State</span>
          </button>
        </div>
      </div>

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 animate-in slide-in-from-bottom-3 duration-200 text-sm font-medium ${
          toastMessage.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          toastMessage.type === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          'bg-slate-800 text-white border-slate-700'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
           toastMessage.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
           <AlertTriangle className="w-5 h-5" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Collapsible JSON State Object Inspector */}
      {showJsonInspector && (
        <div className="max-w-7xl mx-auto mb-6 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 shadow-xl overflow-hidden animate-in fade-in duration-200">
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
              <Code className="w-4 h-4" />
              <span>LIVE STATE OBJECT (SocialMarketingState)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(socialState, null, 2));
                showToast('info', 'Copied state JSON to clipboard');
              }}
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white flex items-center gap-1 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy JSON</span>
            </button>
          </div>
          <div className="p-4 max-h-72 overflow-auto font-mono text-xs text-emerald-300/90 leading-relaxed bg-slate-950/80 select-all">
            <pre>{JSON.stringify(socialState, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: CAMPAIGN HISTORY */}
      {activeTabSubView === 'history' && (
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-600" />
                <span>Published Ad Campaigns & Logs</span>
              </h2>
              <span className="text-xs text-slate-500">
                {publishedHistory.length} total campaign records
              </span>
            </div>

            {publishedHistory.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Facebook className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No campaigns published yet.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Complete the 5-step pipeline on the Workflow tab to launch your first social media campaign.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTabSubView('workflow')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  Start New Campaign
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {publishedHistory.map(post => (
                  <div key={post.id} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${
                          post.status === 'published_live' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                          post.status === 'preview_ready' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                          'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {post.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className="text-slate-400">
                          {new Date(post.publishedAt).toLocaleDateString()}
                        </span>
                      </div>

                      {post.imageUrl && (
                        <div className="aspect-video w-full rounded-lg overflow-hidden mb-3 bg-slate-900">
                          <img src={post.imageUrl} alt={post.productName} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1 mb-1">
                        {post.productName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 whitespace-pre-line mb-3">
                        {post.caption}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">
                        Page: {post.pageName || 'Store Page'}
                      </span>
                      {post.postUrl && (
                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                        >
                          <span>View Post</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 1: THE 5-STEP PIPELINE WORKFLOW */}
      {activeTabSubView === 'workflow' && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">

          {/* Quick Interactive Step Progress & Anchor Navigator (Mobile & Desktop) */}
          <div className="lg:col-span-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 sm:p-2.5 shadow-2xs">
            <div className="flex items-center justify-between overflow-x-auto scrollbar-none gap-1 sm:gap-2 text-xs py-0.5">
              {[
                { step: 1, id: 'section-1-product-lookup', label: '1. Product', done: Boolean(selectedProduct) },
                { step: 2, id: 'section-2-media-management', label: '2. Media', done: selectedMediaItems.length > 0 },
                { step: 3, id: 'section-3-ai-copywriting', label: '3. Copywriting', done: Boolean(socialState.draftCaption.trim()) },
                { step: 4, id: 'section-4-draft-preview', label: '4. Preview', done: Boolean(socialState.draftCaption.trim()) && selectedMediaItems.length > 0 },
                { step: 5, id: 'section-5-publishing', label: '5. Publish', done: socialState.publishStatus === 'published' }
              ].map((item) => (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(item.id);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all shrink-0 text-[11px] sm:text-xs cursor-pointer ${
                    item.done
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    item.done ? 'bg-emerald-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}>
                    {item.done ? '✓' : item.step}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Active Auto-Saved Draft Alert Banner */}
          {hasActiveDraft && (
            <div className="lg:col-span-12 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-center gap-2.5 text-blue-900 dark:text-blue-200 font-medium">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>
                  <strong>Draft auto-saved:</strong> Resumed previous marketing draft
                  {selectedProduct ? ` for "${selectedProduct.name}"` : ''}
                  {socialState.lastEditedAt && (
                    <span className="text-blue-700/70 dark:text-blue-300/70 ml-1">
                      (edited {new Date(socialState.lastEditedAt).toLocaleDateString()} {new Date(socialState.lastEditedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleResetWorkflow(true)}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400 text-slate-700 dark:text-slate-200 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ml-auto"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" />
                <span>Clear Draft & Start Fresh</span>
              </button>
            </div>
          )}

          {/* =========================================================================
              LEFT COLUMN: SECTIONS 1, 2, 3 (INPUTS, MEDIA, COPYWRITING)
              ========================================================================= */}
          <div className="lg:col-span-6 space-y-6">

            {/* SECTION 1: PRODUCT LOOKUP (TRIGGER) */}
            <div id="section-1-product-lookup" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    1
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    Product Lookup (Trigger)
                  </h2>
                </div>
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                  Barcode / SKU Scanner
                </span>
              </div>

              {/* Barcode / SKU Input & Scan Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Barcode className="w-4 h-4 shrink-0" />
                  </div>
                  <input
                    id="sku-barcode-input"
                    type="text"
                    value={socialState.skuOrBarcode}
                    onChange={(e) => handleBarcodeChange(e.target.value)}
                    placeholder="Enter SKU / Barcode (e.g. 194253123456 or iPhone)"
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  {socialState.skuOrBarcode && (
                    <button
                      type="button"
                      onClick={() => handleBarcodeChange('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label="Clear code"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Scan Barcode Button with event listener placeholder / Camera Scanner */}
                <button
                  id="scan-barcode-button"
                  type="button"
                  onClick={handleOpenBarcodeScanner}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 font-medium text-sm flex items-center justify-center gap-2 transition-colors shrink-0 whitespace-nowrap"
                >
                  <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Scan Barcode</span>
                </button>
              </div>

              {/* Quick Sample Barcode Pills for Instant Testing */}
              {products.length > 0 && !selectedProduct && (
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-400">Quick stock samples:</span>
                  {products.slice(0, 4).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProductDirectly(p)}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-600 rounded text-xs text-slate-600 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700/60"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {/* READ-ONLY PRODUCT DETAILS CONTEXT (When found) */}
              {selectedProduct ? (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {selectedProduct.imageUrl ? (
                        <img 
                          src={selectedProduct.imageUrl} 
                          alt={selectedProduct.name}
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700" 
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                          <Smartphone className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                            {selectedProduct.name}
                          </h3>
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Found in POS
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {selectedProduct.brand} • {selectedProduct.model} • SKU: {selectedProduct.sku || selectedProduct.barcode || 'N/A'}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {Number(selectedProduct.sellingPrice).toLocaleString()} {settings.currencySymbol || 'MMK'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            Stock: {selectedProduct.stock} units
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleBarcodeChange('')}
                      className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Product Specs Chips (Read-Only) - Archetype Aware */}
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {isPhoneProduct(selectedProduct) ? (
                      <>
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">RAM</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.ram || 'Standard'}</span>
                        </div>
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Storage / ROM</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.rom || selectedProduct.storage || 'Standard'}</span>
                        </div>
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Color</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.color || 'Assorted'}</span>
                        </div>
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Condition</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">{(selectedProduct.condition || 'brand_new').replace(/_/g, ' ')}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Product Type</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                            {detectProductKind(selectedProduct).replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Model / Power</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.model || selectedProduct.name}</span>
                        </div>
                        {selectedProduct.color && selectedProduct.color !== '-' && selectedProduct.color.toLowerCase() !== 'standard' ? (
                          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Color</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{selectedProduct.color}</span>
                          </div>
                        ) : (
                          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Condition</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">{(selectedProduct.condition || 'brand_new').replace(/_/g, ' ')}</span>
                          </div>
                        )}
                        <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Warranty</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {selectedProduct.warrantyMonths ? `${selectedProduct.warrantyMonths} Months` : 'Store Warranty'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : socialState.productLookupStatus === 'not_found' ? (
                <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>No product matching barcode or SKU "{socialState.skuOrBarcode}". Please check the code or pick from stock samples above.</span>
                </div>
              ) : null}
            </div>

            {/* SECTION 2: MEDIA MANAGEMENT (LOCAL & AI) */}
            <div id="section-2-media-management" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    2
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    Media Management (Local & AI)
                  </h2>
                </div>
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md whitespace-nowrap">
                  {selectedMediaItems.length} of {socialState.mediaGallery.length} selected
                </span>
              </div>

              {/* A. Local Upload Drag-and-Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOverMedia(true); }}
                onDragLeave={() => setIsDragOverMedia(false)}
                onDrop={handleLocalFileDrop}
                onClick={() => mediaFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  isDragOverMedia 
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30' 
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/30'
                }`}
              >
                <input
                  ref={mediaFileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={(e) => e.target.files && processImageFiles(e.target.files)}
                />
                <Upload className="w-6 h-6 mx-auto mb-1.5 text-slate-400" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Drag and drop local product photos here, or <span className="text-blue-600 dark:text-blue-400 underline">browse files</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Supports PNG, JPG, JPEG, WEBP</p>
              </div>

              {/* B. AI Generation with Reference Photo Support */}
              <div id="ai-commercial-visual-generator" className="mt-4 p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
                {/* Hidden File Input for Reference Photo */}
                <input
                  ref={referencePhotoInputRef}
                  id="ai-reference-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={handleReferencePhotoUpload}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>AI Commercial Visual Generator</span>
                  </div>

                  {/* Upload Reference Photo Button */}
                  <button
                    type="button"
                    id="btn-upload-reference-photo"
                    onClick={() => referencePhotoInputRef.current?.click()}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                      socialState.referenceImageUrl
                        ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700'
                        : 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/50'
                    }`}
                    title={socialState.referenceImageUrl ? "Change reference photo" : "Upload a real product photo to guide AI generation"}
                  >
                    <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                    <span>{socialState.referenceImageUrl ? 'Change Reference Photo' : 'Upload Reference Photo'}</span>
                  </button>
                </div>

                {/* AI Model Selection for Media Management */}
                <div className="mb-3 p-3 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-indigo-200/80 dark:border-indigo-800/70 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="ai-image-model-select" className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>AI Model Selection</span>
                    </label>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-indigo-100/80 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                      Images API
                    </span>
                  </div>

                  {/* Radio Cards for Models */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                    <label
                      htmlFor="image-model-radio-dalle3"
                      className={`relative p-2.5 rounded-xl border cursor-pointer transition-all ${
                        (socialState.selectedImageModel || 'dall-e-3') === 'dall-e-3'
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 shadow-xs ring-1 ring-indigo-500/50'
                          : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <input
                            id="image-model-radio-dalle3"
                            type="radio"
                            name="ai-image-model-selection"
                            value="dall-e-3"
                            checked={(socialState.selectedImageModel || 'dall-e-3') === 'dall-e-3'}
                            onChange={() => setSocialState(prev => ({ ...prev, selectedImageModel: 'dall-e-3' }))}
                            className="w-3.5 h-3.5 text-indigo-600 border-slate-300 focus:ring-indigo-500 shrink-0"
                          />
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1 shrink-0 whitespace-nowrap">
                            <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                            dall-e-3
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0 whitespace-nowrap">
                          Pro / High-Quality
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-5 leading-tight">
                        Ultra-detailed studio rendering, HD textures & photorealistic lighting.
                      </p>
                    </label>

                    <label
                      htmlFor="image-model-radio-dalle2"
                      className={`relative p-2.5 rounded-xl border cursor-pointer transition-all ${
                        socialState.selectedImageModel === 'dall-e-2'
                          ? 'bg-blue-50/90 dark:bg-blue-950/60 border-blue-500 shadow-xs ring-1 ring-blue-500/50'
                          : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <input
                            id="image-model-radio-dalle2"
                            type="radio"
                            name="ai-image-model-selection"
                            value="dall-e-2"
                            checked={socialState.selectedImageModel === 'dall-e-2'}
                            onChange={() => setSocialState(prev => ({ ...prev, selectedImageModel: 'dall-e-2' }))}
                            className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0"
                          />
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1 shrink-0 whitespace-nowrap">
                            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                            dall-e-2
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0 whitespace-nowrap">
                          Fast / Budget
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-5 leading-tight">
                        Rapid visual generation, lower latency & cost-efficient commercial ads.
                      </p>
                    </label>
                  </div>

                  {/* Dropdown Select Option */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Dropdown Select:</span>
                    <select
                      id="ai-image-model-select"
                      value={socialState.selectedImageModel || 'dall-e-3'}
                      onChange={(e) => setSocialState(prev => ({ ...prev, selectedImageModel: e.target.value }))}
                      className="w-full sm:flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="dall-e-3">dall-e-3 — Pro / High-Quality (Ultra-detailed 1024x1024 Commercial)</option>
                      <option value="dall-e-2">dall-e-2 — Fast / Budget (Standard 1024x1024 Commercial)</option>
                      <option value="flux-turbo">flux-turbo — Real-Time / Instant (Ultra-Fast Studio Photography)</option>
                    </select>
                  </div>
                </div>

                {/* Prompt Row */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    id="input-ai-image-prompt"
                    type="text"
                    value={socialState.aiImagePrompt}
                    onChange={(e) => setSocialState(prev => ({ ...prev, aiImagePrompt: e.target.value }))}
                    placeholder={
                      socialState.referenceImageUrl
                        ? "Custom prompt (or leave blank to auto-synthesize from reference photo)..."
                        : "Enter prompt: e.g. Studio dark pedestal with dramatic rim lighting..."
                    }
                    className="w-full sm:flex-1 min-w-0 px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    id="btn-generate-ai-image"
                    onClick={handleGenerateAiImage}
                    disabled={socialState.isGeneratingAiImage}
                    className="w-full sm:w-auto px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs shrink-0"
                  >
                    {socialState.isGeneratingAiImage ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>Rendering...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Generate AI Image</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Reference Photo Active Preview Card */}
                {socialState.referenceImageUrl && (
                  <div id="ai-reference-photo-card" className="mt-2.5 p-2 bg-white dark:bg-slate-900/90 rounded-lg border border-indigo-200/80 dark:border-indigo-800/70 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={socialState.referenceImageUrl}
                          alt="AI Reference Preview"
                          className="w-11 h-11 rounded-md object-cover border border-indigo-200 dark:border-indigo-700 bg-slate-100 dark:bg-slate-800"
                        />
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white dark:border-slate-900" title="Reference Photo Active" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {socialState.referenceImageName || 'Product Reference Photo'}
                          </span>
                          <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold rounded whitespace-nowrap">
                            AI Reference Active
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          AI uses this authentic photo to capture colors, shape, ports & design
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                      <button
                        type="button"
                        id="btn-refine-prompt-from-ref"
                        onClick={handleAnalyzeReferencePhoto}
                        disabled={socialState.isAnalyzingReference}
                        className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                        title="Analyze image with AI to refine prompt"
                      >
                        {socialState.isAnalyzingReference ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-indigo-600" />
                            <span>Refine Prompt</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        id="btn-add-ref-to-gallery"
                        onClick={handleAddReferenceToGallery}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                        title="Add this reference photo to your post media gallery"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add to Gallery</span>
                      </button>

                      <button
                        type="button"
                        id="btn-remove-reference-photo"
                        onClick={handleRemoveReferencePhoto}
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="Remove reference photo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* C. Media Gallery Grid with Multi-select Checkboxes */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Media Gallery ({socialState.mediaGallery.length})</span>
                  {socialState.mediaGallery.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllMedia(true)}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <button
                        type="button"
                        onClick={() => handleSelectAllMedia(false)}
                        className="text-slate-500 hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  )}
                </div>

                {socialState.mediaGallery.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    No images added yet. Upload local photos or generate AI images above.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                    {socialState.mediaGallery.map((item) => (
                      <div
                        key={item.id}
                        className={`relative group rounded-lg overflow-hidden border transition-all ${
                          item.isSelected 
                            ? 'border-blue-500 ring-2 ring-blue-500/30' 
                            : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="aspect-square w-full bg-slate-900 relative">
                          <img 
                            src={item.url} 
                            alt={item.title || 'Product visual'} 
                            className="w-full h-full object-cover" 
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const fallbackUrl = getCuratedCommercialPhoto(selectedProduct || { brand: 'Anker', model: 'Nano II 30W', category: 'Accessories' } as any);
                              if ((e.currentTarget as HTMLImageElement).src !== fallbackUrl) {
                                (e.currentTarget as HTMLImageElement).src = fallbackUrl;
                                setSocialState(prev => ({
                                  ...prev,
                                  mediaGallery: prev.mediaGallery.map(m => m.id === item.id ? { ...m, url: fallbackUrl } : m),
                                }));
                              }
                            }}
                          />
                        </div>

                        {/* Checkbox Trigger Overlay */}
                        <div 
                          onClick={() => handleMediaCheckboxToggle(item.id)}
                          className="absolute inset-0 cursor-pointer" 
                          title="Click to toggle selection for final post"
                        />

                        {/* Top Control Bar: Checkbox & Source Tag */}
                        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                          <div className="pointer-events-auto">
                            <input
                              type="checkbox"
                              checked={item.isSelected}
                              onChange={() => handleMediaCheckboxToggle(item.id)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
                            />
                          </div>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white/90 backdrop-blur-xs capitalize">
                            {item.source.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Bottom Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMediaItem(item.id);
                          }}
                          className="absolute bottom-1.5 right-1.5 p-1 bg-black/60 hover:bg-rose-600 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: AI COPYWRITING & TRAINING */}
            <div id="section-3-ai-copywriting" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    3
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    AI Copywriting & Training
                  </h2>
                </div>
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                  Few-Shot Tone Conditioning
                </span>
              </div>

              {/* Training Data Upload (.txt specifically) */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="training-file-input" className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
                    <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Training Data (.txt Competitor Reference)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadSampleCompetitorTraining}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                  >
                    Load Sample Few-Shot
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    ref={trainingFileInputRef}
                    id="training-file-input"
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleTrainingFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => trainingFileInputRef.current?.click()}
                    className="w-full sm:w-auto px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Upload .txt File</span>
                  </button>

                  <div className="w-full flex-1 min-w-0 truncate text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700/60">
                    {socialState.trainingFileName ? (
                      <span className="font-mono text-blue-600 dark:text-blue-400 font-medium">
                        ✓ {socialState.trainingFileName} ({socialState.trainingText.length} chars)
                      </span>
                    ) : (
                      'No .txt reference loaded yet (optional)'
                    )}
                  </div>
                </div>
              </div>

              {/* AI Model Selection */}
              <div className="mb-3.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70">
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="ai-model-select" className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>AI Model Selection</span>
                  </label>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-100/80 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                    Responses API
                  </span>
                </div>

                {/* Radio Cards for Models */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <label
                    htmlFor="model-radio-gpt-4o-mini"
                    className={`relative p-2.5 rounded-xl border cursor-pointer transition-all ${
                      (socialState.selectedModel || 'gpt-4o-mini') === 'gpt-4o-mini'
                        ? 'bg-blue-50/90 dark:bg-blue-950/60 border-blue-500 shadow-xs ring-1 ring-blue-500/50'
                        : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          id="model-radio-gpt-4o-mini"
                          type="radio"
                          name="ai-model-selection"
                          value="gpt-4o-mini"
                          checked={(socialState.selectedModel || 'gpt-4o-mini') === 'gpt-4o-mini'}
                          onChange={() => setSocialState(prev => ({ ...prev, selectedModel: 'gpt-4o-mini' }))}
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0"
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1 shrink-0 whitespace-nowrap">
                          <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                          gpt-4o-mini
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0 whitespace-nowrap">
                        Fast / Budget
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-5 leading-tight">
                      Instant response, budget-friendly, built-in live web search.
                    </p>
                  </label>

                  <label
                    htmlFor="model-radio-gpt-5"
                    className={`relative p-2.5 rounded-xl border cursor-pointer transition-all ${
                      socialState.selectedModel === 'gpt-5'
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 shadow-xs ring-1 ring-indigo-500/50'
                        : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          id="model-radio-gpt-5"
                          type="radio"
                          name="ai-model-selection"
                          value="gpt-5"
                          checked={socialState.selectedModel === 'gpt-5'}
                          onChange={() => setSocialState(prev => ({ ...prev, selectedModel: 'gpt-5' }))}
                          className="w-3.5 h-3.5 text-indigo-600 border-slate-300 focus:ring-indigo-500 shrink-0"
                        />
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1 shrink-0 whitespace-nowrap">
                          <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                          gpt-5
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0 whitespace-nowrap">
                        Pro / High-Quality
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-5 leading-tight">
                      Deep reasoning, high-converting persuasive hooks & viral phrasing.
                    </p>
                  </label>
                </div>

                {/* Dropdown Select Option */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">Dropdown Select:</span>
                  <select
                    id="ai-model-select"
                    value={socialState.selectedModel || 'gpt-4o-mini'}
                    onChange={(e) => setSocialState(prev => ({ ...prev, selectedModel: e.target.value }))}
                    className="w-full sm:flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini — Fast / Budget (Speed & High Volume)</option>
                    <option value="gpt-5">gpt-5 — Pro / High-Quality (Deep Reasoning & Copywriting)</option>
                    <option value="gpt-4o">gpt-4o — Balanced Flagship (Creative Vision)</option>
                  </select>
                </div>
              </div>

              {/* Tone Selection */}
              <div className="mb-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Ad Tone & Style
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'exciting_retail', label: 'Exciting Retail & Deals' },
                    { id: 'bilingual_burmese_english', label: 'Bilingual (Burmese + Eng)' },
                    { id: 'urgent_discount', label: 'Urgent Limited Stock' },
                    { id: 'professional_tech', label: 'Tech Specs Deep-Dive' },
                  ].map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => setSocialState(prev => ({ ...prev, aiTone: tone.id as any }))}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium border text-left transition-all min-h-[40px] flex items-center ${
                        socialState.aiTone === tone.id
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 shadow-2xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Input Textarea */}
              <div className="mb-4">
                <label htmlFor="prompt-instruction-input" className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Specific AI Instructions (Prompt)
                </label>
                <textarea
                  id="prompt-instruction-input"
                  rows={2}
                  value={socialState.promptInstruction}
                  onChange={(e) => setSocialState(prev => ({ ...prev, promptInstruction: e.target.value }))}
                  placeholder="e.g. Make it sound exciting and mention a Thingyan festival discount with free tempered glass..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Generate Ad Copy Button */}
              <button
                id="generate-ad-copy-button"
                type="button"
                onClick={handleGenerateAdCopy}
                disabled={socialState.isGeneratingCopy || !selectedProduct}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                {socialState.isGeneratingCopy ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Synthesizing Copy with LLM (Few-Shot Trained)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Ad Copy</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* =========================================================================
              RIGHT COLUMN: SECTIONS 4 & 5 (DRAFT CONSOLE, LIVE PREVIEW, PUBLISHING)
              ========================================================================= */}
          <div className="lg:col-span-6 space-y-6 lg:sticky lg:top-4 lg:self-start">

            {/* SECTION 4: DRAFT & PREVIEW CONSOLE */}
            <div id="section-4-draft-preview" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    4
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    Draft & Preview Console
                  </h2>
                </div>
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                  Editable Live Preview
                </span>
              </div>

              {/* Editable Text Area for Tweaking Ad Text */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="editable-draft-caption" className="font-medium text-slate-700 dark:text-slate-300">
                    Editable Ad Copy (Directly tweak caption & fix typos):
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {socialState.draftCaption.length} characters
                  </span>
                </div>

                <textarea
                  id="editable-draft-caption"
                  rows={6}
                  value={socialState.draftCaption}
                  onChange={(e) => handleDraftTextChange(e.target.value)}
                  placeholder="The generated ad copy will appear here. You can freely edit, format, or type your own custom wording before publishing..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-sans focus:outline-hidden focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                />

                {/* Quick Insert Snippet Buttons */}
                <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-[11px] text-slate-400">Insert tag:</span>
                  <button
                    type="button"
                    onClick={() => handleAppendDraftSnippet(`📞 Hotline: ${settings.phone || '09-798123456'}`)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[11px]"
                  >
                    + Hotline
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppendDraftSnippet(`📍 Store: ${settings.address || 'Strand Road, Yangon'}`)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[11px]"
                  >
                    + Address
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppendDraftSnippet(`🛡️ 100% Genuine with Store Warranty Guarantee`)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[11px]"
                  >
                    + Warranty
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppendDraftSnippet(`🔥 LIMITED STOCK AVAILABLE! INQUIRE NOW! 🔥`)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[11px]"
                  >
                    + Urgency
                  </button>
                </div>
              </div>

              {/* Visual Facebook Feed Post Preview Card */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Facebook Newsfeed Feed Preview</span>
                </div>

                <FacebookPostPreview
                  pageName={settings.socialMediaConfig?.pageName || settings.shopName || 'Golden Star Mobile'}
                  caption={socialState.draftCaption}
                  selectedMedia={selectedMediaItems}
                  settings={settings}
                />
              </div>
            </div>

            {/* SECTION 5: PUBLISHING */}
            <div id="section-5-publishing" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    5
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                    Publishing (Meta Graph API)
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    settings.socialMediaConfig?.pageId ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} />
                  <span className="text-slate-500 dark:text-slate-400">
                    {settings.socialMediaConfig?.pageId ? 'Page Connected' : 'Sandbox Preview Mode'}
                  </span>
                </div>
              </div>

              {/* Publishing Readiness Checklist */}
              <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Target Facebook Page:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {settings.socialMediaConfig?.pageName || settings.shopName || 'Facebook Store Page'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Images to Publish:</span>
                  <span className={`font-semibold ${selectedMediaItems.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    {selectedMediaItems.length} selected
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Caption Status:</span>
                  <span className={`font-semibold ${socialState.draftCaption.trim() ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    {socialState.draftCaption.trim() ? 'Ready' : 'Missing'}
                  </span>
                </div>
              </div>

              {/* Final Publish Button */}
              <button
                id="publish-to-facebook-button"
                type="button"
                onClick={handlePublishToFacebook}
                disabled={socialState.isPublishing || !socialState.draftCaption.trim() || selectedMediaItems.length === 0}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
              >
                {socialState.isPublishing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Publishing to Facebook Graph API...</span>
                  </>
                ) : (
                  <>
                    <Facebook className="w-5 h-5 fill-white" />
                    <span>Publish to Facebook</span>
                  </>
                )}
              </button>

              {/* Success / Publication Details Banner */}
              {socialState.publishStatus === 'published' && socialState.publishedPostRecord && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Successfully Published!</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetWorkflow(false)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Start New Post</span>
                    </button>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 mb-3">
                    Post record created for "{socialState.publishedPostRecord.productName}". The post is permanently saved in Campaign History.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {socialState.publishedPostRecord.postUrl && (
                      <a
                        href={socialState.publishedPostRecord.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-1 transition-colors"
                      >
                        <span>Open on Facebook</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTabSubView('history')}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded-lg font-medium transition-colors"
                    >
                      View Campaign Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetWorkflow(false)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium border border-slate-300 dark:border-slate-600 transition-colors ml-auto flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                      <span>Clear Form</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {socialState.publishStatus === 'error' && socialState.publishError && (
                <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <span className="font-semibold block">Publishing Notice</span>
                    <span>{socialState.publishError}</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* POS LIVE SCANNER MODAL (Reusing store barcode camera reader) */}
      {isScannerOpen && (
        <PosLiveScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          products={products}
          onAddToCart={(p) => {
            setIsScannerOpen(false);
            handleSelectProductDirectly(p);
            return true;
          }}
          cartItemCount={selectedProduct ? 1 : 0}
          settings={settings}
        />
      )}
    </div>
  );
};
