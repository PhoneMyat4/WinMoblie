import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Barcode,
  X,
  Zap,
  ZapOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Smartphone,
  Tag,
  Hash,
  Layers,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  FileText,
  Upload,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  RotateCcw,
  QrCode,
  Image as ImageIcon
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Product, ShopSettings, ImeiPair } from '../../types';
import { formatCurrency, formatImei } from '../../utils/formatters';
import { 
  lookupProductByCode, 
  detectScanCodeCategory, 
  searchProductsForScanner, 
  ScanLookupResult 
} from '../../utils/scannerLookup';
import { playSuccessBeep, playWarningBeep, playErrorBeep } from '../../utils/scannerAudio';

interface PosLiveScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: ShopSettings;
  onAddToCart: (product: Product, specificImei?: string) => boolean | void; // returns true if added, false if error
  cartItemCount: number;
}

export interface ScannedFeedItem {
  id: string;
  timestamp: string;
  code: string;
  codeType: 'imei' | 'barcode' | 'sku' | 'model' | 'unknown';
  product: Product;
  imei?: string;
  status: 'added' | 'duplicate' | 'out_of_stock' | 'not_found';
  message: string;
}

export const PosLiveScannerModal: React.FC<PosLiveScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  onAddToCart,
  cartItemCount,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'manual' | 'batch' | 'image'>('camera');
  
  // Camera state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [detectionEngine, setDetectionEngine] = useState<string>('Dual (Hardware + ZXing Code128)');

  // Manual / Hardware Gun Scan state
  const [manualCodeInput, setManualCodeInput] = useState<string>('');
  const [batchText, setBatchText] = useState<string>('');

  // Scanned Feed session history
  const [scannedFeed, setScannedFeed] = useState<ScannedFeedItem[]>([]);
  const [lastScannedResult, setLastScannedResult] = useState<{
    code: string;
    productName: string;
    type: string;
    success: boolean;
    message: string;
  } | null>(null);

  // Scanner ref controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const nativeDetectorRef = useRef<any>(null);
  const nativeAnimFrameRef = useRef<number | null>(null);
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera decoding safely
  const stopScanner = useCallback(() => {
    if (nativeAnimFrameRef.current) {
      cancelAnimationFrame(nativeAnimFrameRef.current);
      nativeAnimFrameRef.current = null;
    }
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {
        // ignore
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks?.().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
  }, []);

  // Process scanned code
  const handleProcessCode = useCallback((rawCode: string, source: 'camera' | 'manual' | 'batch' = 'camera') => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    // Cooldown check for camera (avoid scanning same barcode 20 times in 1 second)
    const now = Date.now();
    if (source === 'camera') {
      if (lastScannedCodeRef.current.code === cleanCode && (now - lastScannedCodeRef.current.time) < 1800) {
        return; // Ignore rapid duplicates from camera stream
      }
    }
    lastScannedCodeRef.current = { code: cleanCode, time: now };

    // Vibrate device if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(60);
      } catch {
        // Ignore vibration errors
      }
    }

    const lookup = lookupProductByCode(cleanCode, products);

    if (!lookup.found || !lookup.product) {
      if (soundEnabled) playErrorBeep();
      
      const feedItem: ScannedFeedItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        code: cleanCode,
        codeType: 'barcode',
        product: {
          id: 'unknown',
          name: 'Unknown Item',
          brand: '-',
          model: '-',
          category: 'accessories',
          condition: 'brand_new',
          sku: cleanCode,
          barcode: cleanCode,
          costPrice: 0,
          sellingPrice: 0,
          stock: 0,
          minStockAlert: 0,
          warrantyMonths: 0,
        },
        status: 'not_found',
        message: `No product found with code "${cleanCode}"`,
      };

      setScannedFeed(prev => [feedItem, ...prev.slice(0, 19)]);
      setLastScannedResult({
        code: cleanCode,
        productName: 'Unknown Product',
        type: 'Not Found',
        success: false,
        message: `Item not found in inventory: ${cleanCode}`,
      });
      return;
    }

    const product = lookup.product;
    const matchType = lookup.matchType || 'barcode';
    const matchedImei = lookup.matchedImei;

    // Stock verification
    if (product.stock <= 0) {
      if (soundEnabled) playErrorBeep();

      const feedItem: ScannedFeedItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        code: cleanCode,
        codeType: matchType,
        product,
        imei: matchedImei,
        status: 'out_of_stock',
        message: `${product.name} is OUT OF STOCK (0 units available)`,
      };

      setScannedFeed(prev => [feedItem, ...prev.slice(0, 19)]);
      setLastScannedResult({
        code: cleanCode,
        productName: product.name,
        type: (matchType || 'code').toUpperCase(),
        success: false,
        message: `Out of Stock: ${product.name}`,
      });
      return;
    }

    // Attempt adding to cart
    try {
      onAddToCart(product, matchedImei);
      if (soundEnabled) playSuccessBeep();

      const feedItem: ScannedFeedItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        code: cleanCode,
        codeType: matchType,
        product,
        imei: matchedImei,
        status: 'added',
        message: matchedImei 
          ? `Added with IMEI: ${matchedImei}` 
          : `Added to cart (${formatCurrency(product.sellingPrice, settings.currencySymbol)})`,
      };

      setScannedFeed(prev => [feedItem, ...prev.slice(0, 19)]);
      setLastScannedResult({
        code: cleanCode,
        productName: product.name,
        type: (matchType || 'code').toUpperCase(),
        success: true,
        message: matchedImei ? `Added with IMEI ${matchedImei}` : `Added to cart`,
      });
    } catch (err: unknown) {
      console.warn('Error adding scanned item to cart:', err);
      if (soundEnabled) playWarningBeep();
    }
  }, [products, onAddToCart, soundEnabled, settings.currencySymbol]);

  // Start live camera video and ZXing decoder + Native BarcodeDetector
  const startScanner = useCallback(async () => {
    stopScanner();
    setCameraError(null);

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: cameraFacing,
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      },
      audio: false,
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported on this device');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (!videoRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setIsCameraActive(true);

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      }

      // Hardware Native BarcodeDetector (GPU accelerated)
      let hasNativeDetector = false;
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: [
              'code_128',
              'qr_code',
              'ean_13',
              'ean_8',
              'code_39',
              'code_93',
              'upc_a',
              'upc_e',
              'data_matrix',
              'itf',
              'codabar'
            ]
          });
          nativeDetectorRef.current = barcodeDetector;
          setDetectionEngine('Hardware BarcodeDetector (GPU)');
          hasNativeDetector = true;

          let isDetecting = false;
          let lastTick = 0;
          const detectFrame = async (timestamp: number) => {
            if (timestamp - lastTick >= 90) {
              lastTick = timestamp;
              if (!isDetecting && videoRef.current && videoRef.current.readyState >= 2 && !videoRef.current.paused && videoRef.current.videoWidth > 0) {
                isDetecting = true;
                try {
                  const barcodes = await barcodeDetector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0) {
                    for (const b of barcodes) {
                      if (b.rawValue) {
                        handleProcessCode(b.rawValue, 'camera');
                        break;
                      }
                    }
                  }
                } catch {
                  // Ignore frame-by-frame errors
                }
                isDetecting = false;
              }
            }
            nativeAnimFrameRef.current = requestAnimationFrame(detectFrame);
          };

          nativeAnimFrameRef.current = requestAnimationFrame(detectFrame);
        } catch {
          nativeDetectorRef.current = null;
          hasNativeDetector = false;
        }
      }

      // Fallback: If hardware BarcodeDetector is not available, use ZXing engine
      if (!hasNativeDetector) {
        setDetectionEngine('ZXing MultiFormat Engine');
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const codeReader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 1200,
        });
        codeReaderRef.current = codeReader;

        if (videoRef.current) {
          const controls = await codeReader.decodeFromVideoElement(
            videoRef.current,
            (result, error) => {
              if (result) {
                const text = result.getText();
                if (text) {
                  handleProcessCode(text, 'camera');
                }
              }
            }
          );
          controlsRef.current = controls;
        }
      }
    } catch (err: unknown) {
      console.error('Camera scanner launch error:', err);
      const errMsg = err instanceof Error ? err.message : 'Unable to access camera';
      setCameraError(errMsg);
      setIsCameraActive(false);
    }
  }, [cameraFacing, handleProcessCode, stopScanner]);

  // Handle uploaded image scanning
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      let decoded = false;

      // Try Native BarcodeDetector first
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector();
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleProcessCode(barcodes[0].rawValue, 'camera');
            decoded = true;
          }
        } catch {
          // Fall through
        }
      }

      // Fallback to ZXing reader
      if (!decoded && codeReaderRef.current) {
        try {
          const result = await codeReaderRef.current.decodeFromImageUrl(imgUrl);
          if (result && result.getText()) {
            handleProcessCode(result.getText(), 'camera');
            decoded = true;
          }
        } catch (err) {
          console.warn('ZXing image decode error:', err);
        }
      }

      if (!decoded) {
        if (soundEnabled) playErrorBeep();
        setLastScannedResult({
          code: file.name,
          productName: 'Unrecognized Barcode',
          type: 'IMAGE',
          success: false,
          message: 'Could not detect a clear barcode in the uploaded image',
        });
      }
      URL.revokeObjectURL(imgUrl);
    };
    img.src = imgUrl;
    e.target.value = '';
  };

  // Global Clipboard Paste (Ctrl+V) listener when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && text.trim().length >= 3) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        handleProcessCode(text.trim(), 'manual');
        return;
      }

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              const imgUrl = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = async () => {
                let decoded = false;
                if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
                  try {
                    const detector = new (window as any).BarcodeDetector();
                    const barcodes = await detector.detect(img);
                    if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                      handleProcessCode(barcodes[0].rawValue, 'camera');
                      decoded = true;
                    }
                  } catch {
                    // Fall through
                  }
                }
                if (!decoded && codeReaderRef.current) {
                  try {
                    const result = await codeReaderRef.current.decodeFromImageUrl(imgUrl);
                    if (result && result.getText()) {
                      handleProcessCode(result.getText(), 'camera');
                    }
                  } catch (err) {
                    console.warn('Pasted image decode err:', err);
                  }
                }
                URL.revokeObjectURL(imgUrl);
              };
              img.src = imgUrl;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, handleProcessCode]);

  // Toggle flashlight / torch
  const handleToggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    try {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const nextTorch = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch } as MediaTrackConstraintSet]
        });
        setTorchOn(nextTorch);
      }
    } catch (e) {
      console.warn('Torch constraint error:', e);
    }
  };

  // Launch camera when modal opens or tab switched to camera
  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      const timer = setTimeout(() => {
        startScanner();
      }, 150);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, activeTab, startScanner, stopScanner]);

  // Focus manual input when on manual tab
  useEffect(() => {
    if (activeTab === 'manual' && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [activeTab]);

  // Manual submit handler
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) return;

    handleProcessCode(manualCodeInput.trim(), 'manual');
    setManualCodeInput('');
    if (manualInputRef.current) {
      manualInputRef.current.focus();
    }
  };

  // Batch intake submit handler
  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) return;

    const lines = batchText
      .split(/[\r\n,;]+/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    lines.forEach(code => {
      handleProcessCode(code, 'batch');
    });

    setBatchText('');
    setActiveTab('camera');
  };

  // Autocomplete suggestions for manual typing
  const manualSuggestions = searchProductsForScanner(manualCodeInput, products, 5);

  if (!isOpen) return null;

  return (
    <div
      id="pos-live-scanner-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-modal-backdrop"
    >
      <div className="bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-modal-content">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">POS Register Scanner</h2>
                <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md border border-indigo-400/30">
                  Dual-Engine 1D/2D
                </span>
              </div>
              <p className="text-xs text-slate-400">
                100% Offline Optical Scanner • Code 128, QR Code, EAN-13, 15-Digit IMEI & SKUs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                soundEnabled 
                  ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300' 
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
              title={soundEnabled ? 'Mute scanner beeps' : 'Enable scanner beeps'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              title="Close scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950 border-b border-slate-800 text-xs shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>1. Live Camera Scanner</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>2. Manual / Gun Keypad</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'image'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>3. Image / Screenshot</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('batch')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'batch'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>4. Batch Multi-IMEI Paste</span>
            </button>

          </div>

          {/* Cart Status Badge */}
          <div className="flex items-center gap-2 bg-indigo-950/80 px-3 py-1.5 rounded-xl border border-indigo-800/60">
            <ShoppingBag className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-200">
              Active Cart: <strong className="text-white">{cartItemCount} item(s)</strong>
            </span>
          </div>
        </div>

        {/* Content Body: Grid Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0">
          
          {/* Left / Primary Scanner Area (7 Cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto">
            
            {/* Tab 1: Live Camera Viewfinder */}
            {activeTab === 'camera' && (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                
                {/* Video Container with Laser Reticle */}
                <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border-2 border-indigo-500/40 shadow-inner flex items-center justify-center">
                  
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                    autoPlay
                  />

                  {/* Scanning Aiming Overlay & Animated Red Laser Line */}
                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                      
                      {/* Aiming Reticle Frame */}
                      <div className="relative w-4/5 h-3/5 border-2 border-dashed border-indigo-400/80 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                        {/* Laser scan animation line */}
                        <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ef4444] animate-[bounce_2s_infinite]" />
                        
                        {/* Corner markers */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-indigo-400" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-indigo-400" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-indigo-400" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-indigo-400" />
                      </div>

                      <div className="absolute bottom-3 text-center">
                        <span className="px-3 py-1 bg-black/70 backdrop-blur-xs text-[11px] font-mono text-indigo-300 rounded-full border border-indigo-500/30">
                          Align Barcode or Box IMEI inside the frame
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Camera Error or Not Active State */}
                  {cameraError && (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center">
                      <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
                      <p className="text-xs font-bold text-slate-200">{cameraError}</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                        Please check camera permissions in your browser or use the Manual / Gun Keypad tab.
                      </p>
                      <button
                        type="button"
                        onClick={startScanner}
                        className="mt-4 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Camera</span>
                      </button>
                    </div>
                  )}

                  {/* Camera Controls Floating Overlay */}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={handleToggleTorch}
                        className={`p-2 rounded-xl backdrop-blur-md border transition-all cursor-pointer ${
                          torchOn
                            ? 'bg-amber-500/80 text-white border-amber-300'
                            : 'bg-black/60 text-slate-300 border-white/20 hover:text-white'
                        }`}
                        title={torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
                      >
                        {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setCameraFacing(prev => prev === 'environment' ? 'user' : 'environment');
                      }}
                      className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-slate-300 border border-white/20 hover:text-white transition-all cursor-pointer"
                      title="Switch Rear/Front Camera"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                </div>

                {/* Engine Info Badge */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Engine: {detectionEngine}</span>
                  </span>
                  <span className="text-slate-500">
                    Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300">Ctrl+V</kbd> anytime to paste barcode
                  </span>
                </div>

                {/* Live Real-Time Match Flash Banner */}
                {lastScannedResult && (
                  <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-150 ${
                    lastScannedResult.success 
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' 
                      : 'bg-red-950/60 border-red-500/50 text-red-300'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      {lastScannedResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="text-xs font-bold truncate">
                          {lastScannedResult.productName}
                        </div>
                        <div className="text-[11px] opacity-80 truncate">
                          {lastScannedResult.message}
                        </div>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-black/40 text-[10px] font-mono uppercase font-bold shrink-0">
                      {lastScannedResult.type}
                    </span>
                  </div>
                )}

              </div>
            )}

            {/* Tab 2: Manual / USB Gun Keypad */}
            {activeTab === 'manual' && (
              <div className="space-y-4 flex-1 flex flex-col justify-start">
                
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Scan with Hardware Barcode Gun or Type Code:</span>
                    <span className="text-[11px] text-indigo-400 font-mono">
                      (Barcode, 15-digit IMEI, or SKU)
                    </span>
                  </label>

                  <div className="relative">
                    <Barcode className="w-5 h-5 text-indigo-400 absolute left-3.5 top-3.5" />
                    <input
                      ref={manualInputRef}
                      type="text"
                      value={manualCodeInput}
                      onChange={(e) => setManualCodeInput(e.target.value)}
                      placeholder="e.g. 358765123456789 or 8806091234567 or IPH-15P-256"
                      className="w-full pl-11 pr-24 py-3 bg-slate-950 border-2 border-indigo-500/60 focus:border-indigo-400 rounded-2xl text-sm font-mono text-white placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                    />

                    <button
                      type="submit"
                      disabled={!manualCodeInput.trim()}
                      className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>Add</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>

                {/* Autocomplete Suggestions Box */}
                {manualCodeInput.trim().length >= 2 && (
                  <div className="bg-slate-950 rounded-2xl border border-slate-800 p-2 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Matching Products ({manualSuggestions.length})
                    </div>
                    {manualSuggestions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">
                        No matching product found for "{manualCodeInput}"
                      </div>
                    ) : (
                      manualSuggestions.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            handleProcessCode(
                              item.matchedField === 'imei' ? item.highlightText : (item.product.barcode || item.product.sku),
                              'manual'
                            );
                            setManualCodeInput('');
                          }}
                          className="w-full p-2 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left transition-colors cursor-pointer group"
                        >
                          <div>
                            <div className="text-xs font-bold text-white group-hover:text-indigo-300">
                              {item.product.name}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-semibold text-slate-300">{item.product.brand}</span>
                              <span>•</span>
                              <span className="font-mono text-indigo-400">
                                {(item.matchedField || 'code').toUpperCase()}: {item.highlightText}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-emerald-400">
                              {formatCurrency(item.product.sellingPrice, settings.currencySymbol)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Stock: {item.product.stock}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

              </div>
            )}

            {/* Tab 3: Upload / Screenshot & Clipboard Scan */}
            {activeTab === 'image' && (
              <div className="space-y-4 flex-1 flex flex-col justify-start">
                <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-3xl p-6 text-center transition-all bg-slate-950/50 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-400 flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Upload Barcode Photo or Paste Screenshot
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mb-4">
                    Select a photo of a barcode label, sticker sheet, or press <kbd className="px-1.5 py-0.5 bg-slate-800 text-indigo-300 rounded font-mono text-[10px]">Ctrl+V</kbd> to paste a screenshot directly from clipboard.
                  </p>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Choose Image File</span>
                  </button>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-1">
                  <span className="font-bold text-white block">💡 Image Scanning Tip:</span>
                  <p className="text-[11px] text-slate-400">
                    High contrast images with clear lighting decode instantly. Works with both 1D (Code 128, EAN) and 2D (QR Code) formats.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 4: Batch Multi-IMEI Paste */}
            {activeTab === 'batch' && (
              <div className="space-y-3 flex-1 flex flex-col justify-start">
                
                <div>
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Paste Multiple IMEIs / Barcodes:</span>
                    <span className="text-[11px] text-slate-400">
                      (Separated by newlines, commas, or semicolons)
                    </span>
                  </label>
                  <textarea
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    placeholder="358765123456789&#10;358765123456790&#10;8806091234567&#10;IPH-15P-256-TI"
                    rows={6}
                    className="w-full mt-1.5 p-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-2xl text-xs font-mono text-emerald-400 placeholder:text-slate-600 focus:outline-hidden leading-relaxed resize-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-400">
                    {batchText.split(/[\r\n,;]+/).filter(l => l.trim()).length} code(s) detected
                  </span>

                  <button
                    type="button"
                    onClick={handleBatchSubmit}
                    disabled={!batchText.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Add All Scanned Items to Cart</span>
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* Right Column: Live Session Scanned Feed (5 Cols) */}
          <div className="lg:col-span-5 p-4 sm:p-5 bg-slate-950/60 flex flex-col justify-between overflow-hidden">
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Scanner Live Feed
                  </h3>
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold rounded-md">
                    {scannedFeed.length} scanned
                  </span>
                </div>

                {scannedFeed.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScannedFeed([])}
                    className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    Clear Feed
                  </button>
                )}
              </div>

              {/* Feed List */}
              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {scannedFeed.length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                    <Barcode className="w-8 h-8 text-slate-600 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-400">No items scanned yet in this session</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Point camera at a barcode or scan with handheld laser
                    </p>
                  </div>
                ) : (
                  scannedFeed.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                        item.status === 'added'
                          ? 'bg-slate-900 border-indigo-500/30'
                          : 'bg-red-950/30 border-red-500/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {item.product.name}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                            item.status === 'added' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            {item.codeType}
                          </span>
                        </div>

                        <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                          {item.imei ? `IMEI: ${item.imei}` : `Code: ${item.code}`}
                        </div>

                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {item.timestamp} • {item.message}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {item.status === 'added' && (
                          <div className="text-xs font-mono font-bold text-emerald-400">
                            {formatCurrency(item.product.sellingPrice, settings.currencySymbol)}
                          </div>
                        )}
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${
                          item.status === 'added' ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {item.status === 'added' ? 'Added ✓' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Done / Return to POS Register Button */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                Cart Total: <strong className="text-white">{cartItemCount} item(s)</strong>
              </span>

              <button
                type="button"
                onClick={() => {
                  stopScanner();
                  onClose();
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>Return to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
