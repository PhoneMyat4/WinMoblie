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
  Image as ImageIcon,
  Check,
  ClipboardCheck,
  Package,
  ListFilter,
  CheckSquare
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Product, StockAuditSession, StockAuditItem, ShopSettings } from '../../types';
import { formatCurrency, formatImei } from '../../utils/formatters';
import { 
  lookupProductByCode, 
  detectScanCodeCategory, 
  ScanLookupResult 
} from '../../utils/scannerLookup';
import { playSuccessBeep, playWarningBeep, playErrorBeep } from '../../utils/scannerAudio';

export interface AuditScanResultItem {
  id: string;
  timestamp: string;
  code: string;
  codeType: 'imei' | 'barcode' | 'sku' | 'unknown';
  productName: string;
  productId: string;
  category: string;
  newCount: number;
  bookStock: number;
  status: 'counted' | 'already_scanned' | 'not_in_scope' | 'extra_imei';
  message: string;
}

interface StockAuditScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditSession: StockAuditSession;
  products: Product[];
  settings?: ShopSettings;
  currencySymbol?: string;
  targetProductId?: string | null; // Optional: focus on auditing a specific item
  onProcessScanCode: (code: string) => {
    success: boolean;
    productName?: string;
    productId?: string;
    newCount?: number;
    bookStock?: number;
    message: string;
    isDuplicate?: boolean;
    isImei?: boolean;
  };
  onBatchCountImeis?: (imeis: string[]) => {
    processedCount: number;
    matchedProductsCount: number;
    skippedCount: number;
  };
}

export const StockAuditScannerModal: React.FC<StockAuditScannerModalProps> = ({
  isOpen,
  onClose,
  auditSession,
  products,
  settings,
  currencySymbol = 'Ks',
  targetProductId,
  onProcessScanCode,
  onBatchCountImeis,
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
  const [scannedFeed, setScannedFeed] = useState<AuditScanResultItem[]>([]);
  const [lastScannedBanner, setLastScannedBanner] = useState<{
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

  // Target item if restricted
  const targetItem = targetProductId 
    ? auditSession.items.find(i => i.productId === targetProductId) 
    : null;

  // Cleanup scanner stream
  const stopCamera = useCallback(() => {
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
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks?.().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
  }, []);

  // Dispatch and execute scan code matching in audit session
  const executeScan = useCallback((rawCode: string) => {
    if (!rawCode || !rawCode.trim()) return;
    const cleanCode = rawCode.trim();

    // Prevent immediate repeated scanning jitter within 1.2s
    const now = Date.now();
    if (
      lastScannedCodeRef.current.code === cleanCode &&
      now - lastScannedCodeRef.current.time < 1200
    ) {
      return;
    }
    lastScannedCodeRef.current = { code: cleanCode, time: now };

    const detectedInfo = detectScanCodeCategory(cleanCode);
    const result = onProcessScanCode(cleanCode);

    if (result.success) {
      if (soundEnabled) playSuccessBeep();
      setLastScannedBanner({
        code: cleanCode,
        productName: result.productName || 'Stock Item',
        type: detectedInfo.label,
        success: true,
        message: result.message,
      });

      const feedItem: AuditScanResultItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString(),
        code: cleanCode,
        codeType: detectedInfo.type === 'general' ? 'unknown' : detectedInfo.type,
        productName: result.productName || 'Counted Item',
        productId: result.productId || '',
        category: detectedInfo.label,
        newCount: result.newCount || 1,
        bookStock: result.bookStock || 0,
        status: 'counted',
        message: result.message,
      };

      setScannedFeed((prev) => [feedItem, ...prev.slice(0, 49)]);
    } else {
      if (result.isDuplicate) {
        if (soundEnabled) playWarningBeep();
      } else {
        if (soundEnabled) playErrorBeep();
      }

      setLastScannedBanner({
        code: cleanCode,
        productName: result.productName || 'Scan Warning',
        type: detectedInfo.label,
        success: false,
        message: result.message,
      });

      const feedItem: AuditScanResultItem = {
        id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString(),
        code: cleanCode,
        codeType: detectedInfo.type === 'general' ? 'unknown' : detectedInfo.type,
        productName: result.productName || 'Unknown Code',
        productId: result.productId || '',
        category: detectedInfo.label,
        newCount: result.newCount || 0,
        bookStock: result.bookStock || 0,
        status: result.isDuplicate ? 'already_scanned' : 'not_in_scope',
        message: result.message,
      };

      setScannedFeed((prev) => [feedItem, ...prev.slice(0, 49)]);
    }
  }, [onProcessScanCode, soundEnabled]);

  // Native BarcodeDetector loop (Throttled & Non-blocking)
  const startNativeDetectionLoop = useCallback((videoElem: HTMLVideoElement) => {
    if (!nativeDetectorRef.current) return;
    let isDetecting = false;
    let lastScanTick = 0;

    const detectFrame = async (timestamp: number) => {
      if (timestamp - lastScanTick >= 90) {
        lastScanTick = timestamp;
        if (!isDetecting && videoElem.readyState >= 2 && !videoElem.paused && videoElem.videoWidth > 0) {
          isDetecting = true;
          try {
            const barcodes = await nativeDetectorRef.current.detect(videoElem);
            if (barcodes && barcodes.length > 0) {
              for (const b of barcodes) {
                if (b.rawValue) {
                  executeScan(b.rawValue);
                  break;
                }
              }
            }
          } catch {}
          isDetecting = false;
        }
      }
      nativeAnimFrameRef.current = requestAnimationFrame(detectFrame);
    };

    nativeAnimFrameRef.current = requestAnimationFrame(detectFrame);
  }, [executeScan]);

  // Initialize camera stream cleanly
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: cameraFacing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported on this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setIsCameraActive(true);

      // Check flashlight torch availability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        const capabilities = videoTrack.getCapabilities() as any;
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }

      // Check for Native Hardware BarcodeDetector (GPU acceleration)
      let hasNativeDetector = false;
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const supportedFormats = await (window as any).BarcodeDetector.getSupportedFormats();
          nativeDetectorRef.current = new (window as any).BarcodeDetector({
            formats: supportedFormats && supportedFormats.length > 0 ? supportedFormats : ['code_128', 'qr_code', 'ean_13', 'ean_8'],
          });
          setDetectionEngine('Hardware BarcodeDetector (GPU)');
          hasNativeDetector = true;
          if (videoRef.current) {
            startNativeDetectionLoop(videoRef.current);
          }
        } catch {
          nativeDetectorRef.current = null;
          hasNativeDetector = false;
        }
      }

      // Fallback: If hardware BarcodeDetector not available, use ZXing engine
      if (!hasNativeDetector) {
        setDetectionEngine('ZXing MultiFormat (Code 128 / QR)');
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
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
        ]);

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
                executeScan(result.getText());
              }
            }
          );
          controlsRef.current = controls;
        }
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : err.message || 'Failed to access camera stream.'
      );
      setIsCameraActive(false);
    }
  }, [cameraFacing, executeScan, startNativeDetectionLoop, stopCamera]);

  // Toggle Torch Light
  const toggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    try {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const newTorch = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: newTorch } as any],
        });
        setTorchOn(newTorch);
      }
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  // Flip Camera
  const flipCamera = () => {
    setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Start / Stop camera based on open state and active tab
  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, cameraFacing, startCamera, stopCamera]);

  // Auto-focus manual input on tab switch
  useEffect(() => {
    if (isOpen && activeTab === 'manual') {
      setTimeout(() => {
        manualInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, activeTab]);

  // Global paste listener (Ctrl+V) for image screenshots
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            decodeImageBlob(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen]);

  // Image upload and decoding
  const decodeImageBlob = async (blob: Blob) => {
    try {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      
      const imageUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.src = imageUrl;
      
      img.onload = async () => {
        try {
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const detector = new (window as any).BarcodeDetector();
              const barcodes = await detector.detect(img);
              if (barcodes && barcodes.length > 0) {
                for (const b of barcodes) {
                  executeScan(b.rawValue);
                }
                URL.revokeObjectURL(imageUrl);
                return;
              }
            } catch {}
          }

          const result = await reader.decodeFromImageElement(img);
          if (result) {
            executeScan(result.getText());
          }
        } catch (decodeErr) {
          if (soundEnabled) playErrorBeep();
          setLastScannedBanner({
            code: 'Image Decode',
            productName: 'Scan Failed',
            type: 'Image File',
            success: false,
            message: 'Could not detect a clear barcode in the provided image.',
          });
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
      };
    } catch (e) {
      console.error('Image decode error:', e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      decodeImageBlob(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Process Batch Multi-IMEI Paste
  const handleProcessBatch = () => {
    if (!batchText.trim()) return;

    // Split by newlines, commas, spaces, semicolons
    const rawTokens = batchText
      .split(/[\r\n,;\t]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);

    if (rawTokens.length === 0) {
      alert('Please enter at least one valid IMEI or Barcode.');
      return;
    }

    if (onBatchCountImeis) {
      const summary = onBatchCountImeis(rawTokens);
      if (soundEnabled) playSuccessBeep();
      setBatchText('');
      setLastScannedBanner({
        code: `${rawTokens.length} Codes`,
        productName: 'Batch Stock Count',
        type: 'Multi-IMEI / Barcodes',
        success: true,
        message: `Successfully processed ${summary.processedCount} items across ${summary.matchedProductsCount} products (${summary.skippedCount} duplicates/skipped).`,
      });
    } else {
      // Fallback: sequential scan
      rawTokens.forEach((code) => executeScan(code));
      setBatchText('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="stock-audit-scanner-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-modal-backdrop"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-content">
        
        {/* Header Strip */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <ScanLineIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Stock Audit Scanner</h2>
                <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md border border-indigo-400/30">
                  {auditSession.auditNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {targetItem 
                  ? `Counting: ${targetItem.productName} (Current Count: ${targetItem.countedStock}/${targetItem.bookStock})` 
                  : 'Scan Barcodes & 15-Digit IMEIs to count physical stock in real time'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Disable Beep Sound' : 'Enable Beep Sound'}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                soundEnabled
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs">
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
              <span>2. Laser Gun / Manual</span>
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

          <div className="text-[11px] text-slate-400 font-mono hidden md:block">
            Audit Total: <strong className="text-emerald-400">{auditSession.totalCountedQuantity}</strong> / {auditSession.totalBookQuantity} Units
          </div>
        </div>

        {/* Modal Main Body: Scanner Viewport (Left) + Live Scan Audit Feed (Right) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[380px]">
          
          {/* Left Column: Scanner Interactive Viewport (7 Cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60 overflow-y-auto">
            
            {/* Tab 1: Live Camera Viewfinder */}
            {activeTab === 'camera' && (
              <div className="space-y-3 flex-1 flex flex-col justify-between">
                
                {/* Viewfinder Canvas Card */}
                <div className="relative rounded-3xl overflow-hidden bg-black aspect-video sm:aspect-4/3 flex items-center justify-center border-2 border-slate-800 shadow-inner group">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Optical Crosshair Laser Guide */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                    <div className="relative w-64 sm:w-80 h-36 sm:h-44 border-2 border-indigo-400/80 rounded-2xl bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.25)] flex items-center justify-center">
                      {/* Corner Accents */}
                      <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                      <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                      <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />

                      {/* Moving Red Scanning Laser Line */}
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_12px_#f43f5e] animate-bounce" />
                    </div>

                    <p className="mt-3 text-[11px] font-bold text-white bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-700 shadow-md">
                      Align Barcode / Phone IMEI Box in viewfinder
                    </p>
                  </div>

                  {/* Floating Action Controls */}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2 rounded-xl backdrop-blur-md border transition-all cursor-pointer ${
                          torchOn
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30'
                            : 'bg-slate-900/80 text-white border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={flipCamera}
                      title="Switch Front/Back Camera"
                      className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 backdrop-blur-md transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Camera Error Message */}
                  {cameraError && (
                    <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <AlertTriangle className="w-10 h-10 text-amber-500" />
                      <p className="text-sm font-bold text-white max-w-sm">{cameraError}</p>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Retry Camera
                      </button>
                    </div>
                  )}
                </div>

                {/* Engine Info Badge */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Engine: {detectionEngine}</span>
                  </span>
                  <span className="text-slate-500">
                    Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300">Ctrl+V</kbd> to paste screenshot
                  </span>
                </div>

                {/* Live Match Notification Banner */}
                {lastScannedBanner && (
                  <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-150 ${
                    lastScannedBanner.success
                      ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
                  }`}>
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {lastScannedBanner.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {lastScannedBanner.productName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-800/80 rounded text-slate-300 font-mono">
                            {lastScannedBanner.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 truncate font-mono mt-0.5">
                          {lastScannedBanner.message} ({lastScannedBanner.code})
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setLastScannedBanner(null)}
                      className="text-slate-400 hover:text-white shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* Tab 2: Laser Gun / Manual Code Input */}
            {activeTab === 'manual' && (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Hardware Laser Scanner / Manual Entry
                    </label>
                    <p className="text-xs text-slate-400">
                      Connect any USB/Bluetooth wireless barcode scanner gun. Pull the trigger on any product barcode or 15-digit IMEI.
                    </p>
                    <div className="relative pt-2">
                      <input
                        ref={manualInputRef}
                        type="text"
                        value={manualCodeInput}
                        onChange={(e) => setManualCodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && manualCodeInput.trim()) {
                            executeScan(manualCodeInput);
                            setManualCodeInput('');
                          }
                        }}
                        placeholder="Scan or type Barcode / 15-Digit IMEI..."
                        className="w-full pl-4 pr-24 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (manualCodeInput.trim()) {
                            executeScan(manualCodeInput);
                            setManualCodeInput('');
                          }
                        }}
                        className="absolute right-1.5 top-3.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                      >
                        Count Item
                      </button>
                    </div>
                  </div>

                  {/* Keyboard Shortcuts Hint */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Enter</kbd> to submit</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Supports 1D, 2D QR & IMEIs</span>
                    </div>
                  </div>
                </div>

                {/* Last scan notification */}
                {lastScannedBanner && (
                  <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                    lastScannedBanner.success
                      ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
                  }`}>
                    <div className="truncate">
                      <p className="text-xs font-bold text-white">{lastScannedBanner.productName}</p>
                      <p className="text-[11px] text-slate-300 font-mono">{lastScannedBanner.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastScannedBanner(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
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
              <div className="space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Batch Paste IMEI Serial List
                    </label>
                    <span className="text-[10px] text-slate-400">Separate by line or comma</span>
                  </div>
                  <textarea
                    rows={6}
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    placeholder="354892019283741&#10;354892019283742&#10;354892019283743&#10;BARCODE-123456"
                    className="w-full p-3 bg-slate-950 border border-slate-700 rounded-2xl text-white font-mono text-xs focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  />
                  <p className="text-[11px] text-slate-400">
                    Paste dozens of serialized IMEIs exported from a supplier invoice or warehouse spreadsheet to count all matched items at once.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleProcessBatch}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Batch Process & Count Items</span>
                </button>
              </div>
            )}

          </div>

          {/* Right Column: Live Audit Timeline Feed (5 Cols) */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between bg-slate-950/70 overflow-hidden">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Audit Scan Stream ({scannedFeed.length})
                </h3>
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

            {/* Stream Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-2 py-3 pr-1 max-h-[340px]">
              {scannedFeed.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                  <ScanLineIcon className="w-8 h-8 opacity-20" />
                  <p className="text-xs font-bold text-slate-400">Awaiting Barcodes & IMEIs</p>
                  <p className="text-[11px] text-slate-600 max-w-[200px]">
                    Scanned items and physical count updates will appear here in real time.
                  </p>
                </div>
              ) : (
                scannedFeed.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border transition-all text-xs flex items-center justify-between gap-2 ${
                      item.status === 'counted'
                        ? 'bg-slate-900 border-slate-800 text-white'
                        : item.status === 'already_scanned'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                        : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                    }`}
                  >
                    <div className="truncate flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-bold text-white truncate">{item.productName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.timestamp}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-mono text-indigo-300 truncate">{item.code}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400">{item.category}</span>
                      </div>

                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {item.message}
                      </p>
                    </div>

                    {item.status === 'counted' && (
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px] rounded-lg border border-emerald-500/30 shrink-0">
                        Count: {item.newCount}/{item.bookStock}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer Summary & Close */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400 font-mono">
                Physical: <strong className="text-white">{auditSession.totalCountedQuantity}</strong> / {auditSession.totalBookQuantity}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                Done Scanning
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

function ScanLineIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M3 17v2a2 2 0 0 0 2 2h2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
