import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  Sparkles,
  FileText,
  Store,
  Layers,
  ShieldCheck,
  Move
} from 'lucide-react';
import { processLogoImage } from '../../utils/imageCompression';

interface LogoSizeAdjusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImage: string;
  initialShopSize?: number;
  initialInvoiceSize?: number;
  initialTransparentBg?: boolean;
  onSave: (
    resultPngDataUrl: string,
    shopLogoSize: number,
    invoiceLogoSize: number,
    transparentBg: boolean
  ) => void;
  title?: string;
}

export const LogoSizeAdjusterModal: React.FC<LogoSizeAdjusterModalProps> = ({
  isOpen,
  onClose,
  initialImage,
  initialShopSize = 40,
  initialInvoiceSize = 44,
  initialTransparentBg = true,
  onSave,
  title = 'Adjust Logo Size & Transparency'
}) => {
  const [scale, setScale] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [bgMode, setBgMode] = useState<'transparent' | 'white' | 'dark'>(
    initialTransparentBg ? 'transparent' : 'white'
  );
  const [shopLogoSize, setShopLogoSize] = useState<number>(initialShopSize);
  const [invoiceLogoSize, setInvoiceLogoSize] = useState<number>(initialInvoiceSize);
  const [previewTab, setPreviewTab] = useState<'checkerboard' | 'sidebar' | 'invoice'>('checkerboard');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Load image object whenever initialImage changes
  useEffect(() => {
    if (!initialImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageObjRef.current = img;
      setNaturalDimensions({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      });
      drawPreview();
    };
    img.src = initialImage;
  }, [initialImage]);

  // Redraw preview whenever adjustments change
  useEffect(() => {
    drawPreview();
  }, [scale, offsetX, offsetY, bgMode, naturalDimensions]);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img || img.naturalWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Completely clear canvas to maintain true alpha transparency
    ctx.clearRect(0, 0, width, height);

    // If background mode is not transparent, fill background
    if (bgMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    } else if (bgMode === 'dark') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Calculate aspect ratio fit
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let baseW = width * 0.85;
    let baseH = baseW / imgAspect;

    if (baseH > height * 0.85) {
      baseH = height * 0.85;
      baseW = baseH * imgAspect;
    }

    const drawW = baseW * scale;
    const drawH = baseH * scale;
    const drawX = (width - drawW) / 2 + offsetX;
    const drawY = (height - drawH) / 2 + offsetY;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  };

  const handleReset = () => {
    setScale(1.0);
    setOffsetX(0);
    setOffsetY(0);
    setBgMode('transparent');
  };

  const handleSave = async () => {
    if (!initialImage) return;
    setIsProcessing(true);
    try {
      // Export high-resolution pure PNG strictly preserving alpha channel
      const pngOutput = await processLogoImage(initialImage, {
        maxDimension: 600,
        scale,
        offsetX,
        offsetY,
        backgroundColor: bgMode === 'transparent' ? 'transparent' : bgMode === 'white' ? '#ffffff' : '#0f172a'
      });

      onSave(pngOutput, shopLogoSize, invoiceLogoSize, bgMode === 'transparent');
      onClose();
    } catch (err) {
      console.error('Failed to export logo image as PNG:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="logo-size-adjuster-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop"
    >
      <div
        id="logo-size-adjuster-modal-card"
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-slate-200 animate-modal-content max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{title}</h2>
              <p className="text-[11px] text-slate-500">
                Adjust sizing, zoom, and guarantee pure transparent PNG output
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Format & Transparency Guarantee Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Pure PNG Output</strong>: Saved as high-fidelity PNG (
                <code className="text-[10px] bg-emerald-100/80 px-1 py-0.5 rounded font-mono">
                  image/png
                </code>
                ) with true alpha transparency and no forced background.
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-200/80 text-emerald-800 font-bold rounded-full uppercase tracking-wider shrink-0">
              No Background Box
            </span>
          </div>

          {/* Interactive Live Canvas & Preview Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Live Canvas & Appearance Preview
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-[11px] font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => setPreviewTab('checkerboard')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    previewTab === 'checkerboard'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'hover:text-slate-900'
                  }`}
                >
                  Transparency Check
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('sidebar')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    previewTab === 'sidebar'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'hover:text-slate-900'
                  }`}
                >
                  Sidebar (Dark)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('invoice')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    previewTab === 'invoice'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'hover:text-slate-900'
                  }`}
                >
                  Invoice (Paper)
                </button>
              </div>
            </div>

            {/* Stage Viewport */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden flex flex-col items-center justify-center p-4 relative min-h-[220px]">
              {previewTab === 'checkerboard' && (
                <div
                  className="w-full h-56 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200 relative"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    backgroundColor: '#f8fafc'
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={400}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}

              {previewTab === 'sidebar' && (
                <div className="w-full h-56 bg-slate-900 rounded-xl p-6 flex flex-col justify-center border border-slate-800 text-white space-y-4">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    App Sidebar Header Mockup
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: `${shopLogoSize}px`,
                        height: `${shopLogoSize}px`
                      }}
                      className="shrink-0 flex items-center justify-center"
                    >
                      {initialImage ? (
                        <img
                          src={initialImage}
                          alt="Sidebar Logo"
                          className="w-full h-full object-contain"
                          style={{
                            transform: `scale(${scale}) translate(${offsetX / 4}px, ${offsetY / 4}px)`
                          }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Store className="w-6 h-6 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white leading-tight">Mobile Shop POS</h4>
                      <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                        Sidebar Size: {shopLogoSize}px
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {previewTab === 'invoice' && (
                <div className="w-full h-56 bg-white rounded-xl p-5 flex flex-col justify-center border border-slate-300 shadow-inner text-slate-900 space-y-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 text-center">
                    Printed Bill / Receipt Header Mockup
                  </div>
                  <div className="flex flex-col items-center justify-center text-center">
                    <div
                      style={{
                        height: `${invoiceLogoSize}px`
                      }}
                      className="flex items-center justify-center mb-1"
                    >
                      {initialImage ? (
                        <img
                          src={initialImage}
                          alt="Invoice Logo"
                          className="h-full object-contain"
                          style={{
                            transform: `scale(${scale}) translate(${offsetX / 4}px, ${offsetY / 4}px)`
                          }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Store className="w-6 h-6 text-slate-800" />
                      )}
                    </div>
                    <h4 className="text-sm font-black uppercase text-slate-900 leading-tight">
                      Store Name Voucher
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Invoice Logo Height: {invoiceLogoSize}px
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between w-full text-[11px] text-slate-500">
                <span>
                  Original Photo: {naturalDimensions.width} &times; {naturalDimensions.height} px
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Scale & Position
                </button>
              </div>
            </div>
          </div>

          {/* Photo Adjustments: Zoom & Pan */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-slate-500" />
              Photo Zoom & Positioning
            </h3>

            {/* Scale / Zoom Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Photo Zoom / Scale</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  {Math.round(scale * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.max(0.3, Number((s - 0.05).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min="0.3"
                  max="2.5"
                  step="0.01"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="flex-1 accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.05).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pan Offset Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-600">Horizontal Pan (X)</span>
                  <span className="font-mono text-slate-500">{offsetX}px</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="2"
                  value={offsetX}
                  onChange={(e) => setOffsetX(parseInt(e.target.value))}
                  className="w-full accent-slate-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-600">Vertical Pan (Y)</span>
                  <span className="font-mono text-slate-500">{offsetY}px</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="2"
                  value={offsetY}
                  onChange={(e) => setOffsetY(parseInt(e.target.value))}
                  className="w-full accent-slate-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Background Style Option */}
            <div className="pt-2 border-t border-slate-200">
              <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
                Output Background:
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBgMode('transparent')}
                  className={`p-2 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                    bgMode === 'transparent'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Transparent (PNG)
                </button>
                <button
                  type="button"
                  onClick={() => setBgMode('white')}
                  className={`p-2 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                    bgMode === 'white'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Solid White
                </button>
                <button
                  type="button"
                  onClick={() => setBgMode('dark')}
                  className={`p-2 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                    bgMode === 'dark'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Solid Dark
                </button>
              </div>
            </div>
          </div>

          {/* Size Adjusters: Shop Logo & Invoice Logo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Shop Logo Display Size */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                    <Store className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Shop Logo Size</h4>
                    <p className="text-[10px] text-slate-500">App Sidebar & Navbar</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-xs font-bold text-slate-800">
                  {shopLogoSize}px
                </span>
              </div>

              <input
                type="range"
                min="24"
                max="80"
                step="2"
                value={shopLogoSize}
                onChange={(e) => setShopLogoSize(parseInt(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
              />

              <div className="flex items-center gap-1.5">
                {[28, 40, 52, 64].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setShopLogoSize(size)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                      shopLogoSize === size
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>

            {/* Invoice Logo Display Size */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                    <FileText className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Invoice Logo Size</h4>
                    <p className="text-[10px] text-slate-500">Printed Vouchers & Bills</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-xs font-bold text-slate-800">
                  {invoiceLogoSize}px
                </span>
              </div>

              <input
                type="range"
                min="24"
                max="120"
                step="2"
                value={invoiceLogoSize}
                onChange={(e) => setInvoiceLogoSize(parseInt(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
              />

              <div className="flex items-center gap-1.5">
                {[32, 44, 60, 80].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setInvoiceLogoSize(size)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                      invoiceLogoSize === size
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Output format guaranteed: <span className="font-bold text-slate-700">PNG</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="save-logo-adjustments-btn"
              onClick={handleSave}
              disabled={isProcessing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-950/20 flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-60"
            >
              {isProcessing ? (
                <span>Exporting PNG...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Apply &amp; Save PNG Logo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
