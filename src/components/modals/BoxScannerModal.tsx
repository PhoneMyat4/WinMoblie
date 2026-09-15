import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  RefreshCw,
  Zap,
  ZapOff,
  Sparkles,
  Check,
  AlertTriangle,
  X,
  Smartphone,
  Hash,
  Barcode,
  Layers,
  Maximize2,
  Palette,
  Languages
} from 'lucide-react';
import {
  ExtractedBoxSpecs,
  compressImageForOcr,
  captureVideoFrame,
  requestBoxSpecsExtraction,
  normalizeChineseColor,
  hasChineseCharacters,
  POPULAR_PHONE_COLORS
} from '../../utils/boxScannerService';

interface BoxScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySpecs: (specs: ExtractedBoxSpecs) => void;
  targetContextName?: string; // e.g. "Add Inventory Item" or "Stock Purchase Intake"
}

export const BoxScannerModal: React.FC<BoxScannerModalProps> = ({
  isOpen,
  onClose,
  onApplySpecs,
  targetContextName = 'Form Intake',
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted specs state for review & edit
  const [extractedSpecs, setExtractedSpecs] = useState<ExtractedBoxSpecs | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera tracks safely without triggering re-renders
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop error:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setIsCameraStarting(false);
    setTorchOn(false);
  }, []);

  // Start live camera stream
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Clean up existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop error:', e);
        }
      });
      streamRef.current = null;
    }

    setCameraError(null);
    setIsCameraStarting(true);
    setIsCameraReady(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser.');
      }

      let stream: MediaStream | null = null;

      // Strategy 1: Ideal rear-facing environment camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
          audio: false,
        });
      } catch (e1) {
        console.warn('Tier 1 camera constraints failed, attempting relaxed mode:', e1);
        try {
          // Strategy 2: Relaxed facing mode without resolution limits
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facing,
            },
            audio: false,
          });
        } catch (e2) {
          console.warn('Tier 2 camera constraints failed, attempting standard video:', e2);
          // Strategy 3: Pure basic fallback
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('No camera stream received.');
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');

        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video auto-playback delayed:', playErr);
        }
        setIsCameraReady(true);
        setIsCameraStarting(false);
      }

      // Check if torch / flashlight is supported
      try {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as any;
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.error('Camera startup error:', err);
      let msg = 'Could not access camera viewfinder.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera permissions or use "Direct Phone Camera" below.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device found on this system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is in use by another application. Please close other camera tabs or use "Direct Phone Camera".';
      } else if (err.message) {
        msg = err.message;
      }
      setCameraError(msg);
      setIsCameraStarting(false);
      setIsCameraReady(false);
    }
  }, []);

  // Manage modal lifecycle & camera start/stop
  useEffect(() => {
    if (isOpen) {
      setCapturedImageBase64(null);
      setExtractedSpecs(null);
      setErrorMessage(null);
      if (activeTab === 'camera') {
        startCamera(cameraFacingMode);
      }
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, activeTab, cameraFacingMode, startCamera, stopCameraStream]);

  // Toggle torch / flash
  const handleToggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch constraint error:', err);
    }
  };

  // Flip camera (environment <-> user)
  const handleFlipCamera = () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Process image with Gemini API
  const processImageForSpecs = async (base64Data: string, mimeType = 'image/jpeg') => {
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessStatus('Optimizing photo compression for high-accuracy OCR...');

    try {
      setProcessStatus('AI Vision OCR analyzing packaging typography, RAM/ROM labels & 15-digit IMEIs...');
      const specs = await requestBoxSpecsExtraction(base64Data, mimeType);
      
      setExtractedSpecs(specs);
      setProcessStatus('');
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMessage(
        err.message || 'Failed to extract specifications. Please ensure the phone packaging label or barcode is sharp and clear.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Capture frame from active camera
  const handleCaptureSnapshot = async () => {
    if (!videoRef.current) return;
    try {
      setProcessStatus('Capturing camera snapshot...');
      const { base64, mimeType } = await captureVideoFrame(videoRef.current, 1600, 0.88);
      setCapturedImageBase64(base64);
      stopCameraStream();
      await processImageForSpecs(base64, mimeType);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to capture frame from camera.');
    }
  };

  // Handle file upload or native device camera capture
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WEBP, etc.).');
      return;
    }

    try {
      setProcessStatus('Compressing photo for instant AI OCR...');
      const { base64, mimeType } = await compressImageForOcr(file, 1600, 0.85);
      setCapturedImageBase64(base64);
      stopCameraStream();
      await processImageForSpecs(base64, mimeType);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process selected image file.');
    }
  };

  // Retake or pick another photo
  const handleResetScanner = () => {
    setCapturedImageBase64(null);
    setExtractedSpecs(null);
    setErrorMessage(null);
    setProcessStatus('');
    if (activeTab === 'camera') {
      startCamera(cameraFacingMode);
    }
  };

  // Apply specs and close
  const handleConfirmApply = () => {
    if (!extractedSpecs) return;
    onApplySpecs(extractedSpecs);
    stopCameraStream();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 my-auto flex flex-col max-h-[94vh] animate-modal-content">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2 text-white">
                <span>AI Phone Box & IMEI Scanner</span>
                <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-200 text-[10px] font-mono uppercase tracking-wider rounded-full border border-indigo-400/30">
                  AI Multimodal OCR
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Auto-extract Model, RAM, ROM, Color & 15-digit IMEIs for {targetContextName}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Mode Switcher (if not currently displaying results) */}
          {!extractedSpecs && !capturedImageBase64 && (
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('camera');
                  startCamera(cameraFacingMode);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'camera'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-4 h-4 text-indigo-600" />
                Live Camera (Viewfinder)
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  setActiveTab('upload');
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-4 h-4 text-blue-600" />
                Upload / Device Camera Photo
              </button>
            </div>
          )}

          {/* Error Message Box */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <span className="font-bold">Extraction Notice: </span>
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={handleResetScanner}
                className="px-2.5 py-1 bg-rose-200/80 hover:bg-rose-200 text-rose-900 font-bold rounded-lg text-[11px] transition-colors cursor-pointer shrink-0"
              >
                Try Again
              </button>
            </div>
          )}

          {/* 1. Camera View Mode */}
          {activeTab === 'camera' && !capturedImageBase64 && !extractedSpecs && (
            <div className="space-y-3">
              <div className="relative bg-slate-950 rounded-2xl overflow-hidden min-h-[260px] aspect-[4/3] sm:aspect-[16/10] flex items-center justify-center border border-slate-800 shadow-inner">
                {cameraError ? (
                  <div className="p-6 text-center space-y-3 max-w-md">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-200 leading-relaxed">{cameraError}</p>
                    <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => directCameraInputRef.current?.click()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Camera className="w-4 h-4" />
                        Take Photo (Direct Camera App)
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Upload className="w-4 h-4" />
                        Upload File
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      onLoadedMetadata={() => {
                        setIsCameraStarting(false);
                        setIsCameraReady(true);
                      }}
                      className="w-full h-full object-cover"
                    />

                    {isCameraStarting && (
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-2 text-white z-10">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-xs text-slate-300 font-medium">Opening camera lens...</span>
                      </div>
                    )}

                    {/* Viewfinder Target Frame Overlay */}
                    {isCameraReady && (
                      <div className="absolute inset-4 sm:inset-6 border-2 border-indigo-400/70 rounded-2xl pointer-events-none flex flex-col justify-between p-3 bg-indigo-950/10">
                        <div className="flex justify-between items-start">
                          <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-md text-[10px] text-white font-medium flex items-center gap-1.5">
                            <Maximize2 className="w-3 h-3 text-indigo-300" />
                            Align phone retail box label or IMEI sticker
                          </span>
                          <div className="w-4 h-4 border-t-2 border-r-2 border-indigo-400" />
                        </div>
                        <div className="flex justify-between items-end">
                          <div className="w-4 h-4 border-b-2 border-l-2 border-indigo-400" />
                          <div className="w-4 h-4 border-b-2 border-r-2 border-indigo-400" />
                        </div>
                      </div>
                    )}

                    {/* Camera Control Overlays */}
                    {isCameraReady && (
                      <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                        {hasTorch && (
                          <button
                            type="button"
                            onClick={handleToggleTorch}
                            className={`p-2.5 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                              torchOn ? 'bg-amber-400 text-black' : 'bg-black/60 text-white hover:bg-black/80'
                            }`}
                            title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                          >
                            {torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleFlipCamera}
                          className="p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors cursor-pointer"
                          title="Flip Front / Rear Camera"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons below Camera */}
              {!cameraError && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    disabled={isProcessing || isCameraStarting}
                    className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all transform active:scale-98 cursor-pointer text-xs sm:text-sm disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    Snap Live Viewfinder
                  </button>

                  <button
                    type="button"
                    onClick={() => directCameraInputRef.current?.click()}
                    className="w-full sm:w-auto px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl border border-slate-300 flex items-center justify-center gap-2 transition-all cursor-pointer text-xs sm:text-sm"
                  >
                    <Camera className="w-4 h-4 text-indigo-600" />
                    Direct Phone Camera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. File Upload Mode */}
          {activeTab === 'upload' && !capturedImageBase64 && !extractedSpecs && (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50/80 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3"
              >
                <div className="p-3 bg-white shadow-xs rounded-2xl text-indigo-600 border border-indigo-100">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    Click to select or drag & drop box photo
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Supports high-resolution camera photos, packaging box back/side stickers, or retail receipts.
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1.5 bg-white text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 shadow-2xs">
                    Browse Photo Gallery
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Hidden File / Camera Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <input
            ref={directCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />

          {/* 3. Processing State */}
          {isProcessing && (
            <div className="p-8 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                <Sparkles className="w-7 h-7 text-indigo-600 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">AI Multimodal Processing</h3>
                <p className="text-xs text-indigo-700 font-medium animate-pulse">
                  {processStatus || 'Analyzing image and extracting specifications...'}
                </p>
              </div>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Gemini 3.7 Vision is reading the packaging model typography, memory configurations, and 15-digit IMEI barcodes.
              </p>
            </div>
          )}

          {/* 4. Extracted Results Review & Edit Form */}
          {extractedSpecs && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Thumbnail & Confidence Header */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {capturedImageBase64 && (
                    <img
                      src={capturedImageBase64}
                      alt="Scanned Box"
                      className="w-12 h-12 object-cover rounded-lg border border-slate-300 shadow-2xs"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Extracted Device Details</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          extractedSpecs.confidence === 'high'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : extractedSpecs.confidence === 'medium'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {extractedSpecs.confidence} Confidence
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Verify or edit the extracted values below before applying to the form.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetScanner}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retake Photo
                </button>
              </div>

              {/* AI Detection Notes / Warnings */}
              {extractedSpecs.detectionNotes && (
                <div className="p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs text-indigo-900 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold">AI Detection Notes: </span>
                    <span>{extractedSpecs.detectionNotes}</span>
                  </div>
                </div>
              )}

              {/* Editable Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Brand */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={extractedSpecs.brand}
                    onChange={(e) =>
                      setExtractedSpecs({ ...extractedSpecs, brand: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Xiaomi, Apple, Samsung"
                  />
                </div>

                {/* Model Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={extractedSpecs.model}
                    onChange={(e) =>
                      setExtractedSpecs({ ...extractedSpecs, model: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Redmi Note 14 Pro 5G"
                  />
                </div>

                {/* RAM */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    RAM Capacity
                  </label>
                  <input
                    type="text"
                    value={extractedSpecs.ram}
                    onChange={(e) =>
                      setExtractedSpecs({ ...extractedSpecs, ram: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 8GB, 12GB (or '-' for iPhone)"
                  />
                </div>

                {/* ROM / Storage */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    ROM / Storage
                  </label>
                  <input
                    type="text"
                    value={extractedSpecs.rom}
                    onChange={(e) =>
                      setExtractedSpecs({ ...extractedSpecs, rom: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 128GB, 256GB, 512GB"
                  />
                </div>

                {/* Color */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-pink-600" />
                      Color Finish
                    </label>
                    {extractedSpecs.color && hasChineseCharacters(extractedSpecs.color) && (
                      <button
                        type="button"
                        onClick={() => {
                          const translated = normalizeChineseColor(extractedSpecs.color);
                          setExtractedSpecs({ ...extractedSpecs, color: translated });
                        }}
                        className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded flex items-center gap-1 transition-colors cursor-pointer"
                        title="Click to translate Chinese color text to standard English"
                      >
                        <Languages className="w-3 h-3 text-amber-700" />
                        Translate: {normalizeChineseColor(extractedSpecs.color)}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={extractedSpecs.color}
                    onChange={(e) =>
                      setExtractedSpecs({ ...extractedSpecs, color: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Midnight Black, Natural Titanium, Aurora Purple"
                  />
                  
                  {/* Quick Color Presets */}
                  <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-slate-400 font-medium">Quick:</span>
                    {POPULAR_PHONE_COLORS.slice(0, 6).map((cName) => (
                      <button
                        key={cName}
                        type="button"
                        onClick={() => setExtractedSpecs({ ...extractedSpecs, color: cName })}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                          extractedSpecs.color === cName
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {cName}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barcode / UPC */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-slate-600" />
                    Barcode / EAN (Optional)
                  </label>
                  <input
                    type="text"
                    value={extractedSpecs.barcode}
                    onChange={(e) =>
                      setExtractedSpecs({ ...extractedSpecs, barcode: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 6934177700123"
                  />
                </div>

                {/* Primary IMEI 1 */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-emerald-600" />
                      Primary IMEI 1 (15 Digits)
                    </label>
                    {extractedSpecs.imei1 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          extractedSpecs.imei1.length === 15
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {extractedSpecs.imei1.length === 15
                          ? 'Valid 15-Digit IMEI'
                          : `${extractedSpecs.imei1.length} digits detected`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={extractedSpecs.imei1}
                    onChange={(e) =>
                      setExtractedSpecs({
                        ...extractedSpecs,
                        imei1: e.target.value.replace(/[^0-9]/g, ''),
                      })
                    }
                    maxLength={16}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold tracking-wider text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 864201061234567"
                  />
                </div>

                {/* Secondary IMEI 2 */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-teal-600" />
                      Secondary IMEI 2 / eSIM (Optional)
                    </label>
                    {extractedSpecs.imei2 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          extractedSpecs.imei2.length === 15
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {extractedSpecs.imei2.length === 15
                          ? 'Valid 15-Digit IMEI'
                          : `${extractedSpecs.imei2.length} digits`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={extractedSpecs.imei2}
                    onChange={(e) =>
                      setExtractedSpecs({
                        ...extractedSpecs,
                        imei2: e.target.value.replace(/[^0-9]/g, ''),
                      })
                    }
                    maxLength={16}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono tracking-wider text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 864201061234568 (Dual SIM / eSIM)"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {extractedSpecs ? (
            <button
              type="button"
              onClick={handleConfirmApply}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Apply & Autofill Form
            </button>
          ) : (
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Use Viewfinder or Direct Phone Camera for instant OCR</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
