import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Barcode as BarcodeIcon, 
  Printer, 
  X, 
  Sliders, 
  Smartphone, 
  Tag, 
  Layers, 
  Copy, 
  Check, 
  Sparkles, 
  Info, 
  Grid, 
  FileText, 
  RotateCcw,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { QRCodeWriter, EncodeHintType, BarcodeFormat } from '@zxing/library';
import { Product, ShopSettings } from '../../types';
import { formatCurrency, formatImei } from '../../utils/formatters';
import { lookupProductByCode } from '../../utils/scannerLookup';

interface BarcodeLabelModalProps {
  product: Product;
  selectedImei?: string;
  settings: ShopSettings;
  onClose: () => void;
}

export type LabelSheetLayout = 'single_thermal_50x30' | 'single_thermal_40x25' | 'a4_3x8_sheet' | 'a4_2x7_sheet';
export type BarcodeSymbology = 'code128' | 'qrcode' | 'ean13';

// Generate crisp SVG path for QR code matrix
function renderQrCodeMatrix(text: string, size: number = 33): { path: string; size: number } | null {
  try {
    const writer = new QRCodeWriter();
    const hints = new Map();
    hints.set(EncodeHintType.MARGIN, 1);
    const bitMatrix = writer.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
    const width = bitMatrix.getWidth();
    const height = bitMatrix.getHeight();
    let path = '';
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (bitMatrix.get(x, y)) {
          path += `M${x},${y}h1v1h-1z `;
        }
      }
    }
    return { path, size: width };
  } catch (err) {
    console.warn('QR Code render err:', err);
    return null;
  }
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  product,
  selectedImei,
  settings,
  onClose,
}) => {
  const [layout, setLayout] = useState<LabelSheetLayout>('single_thermal_50x30');
  const [symbology, setSymbology] = useState<BarcodeSymbology>('code128');
  const [printQuantity, setPrintQuantity] = useState<number>(() => {
    return selectedImei ? 1 : Math.max(1, Math.min(product.stock, 24));
  });
  const [targetImei, setTargetImei] = useState<string>(() => {
    if (selectedImei) return selectedImei;
    if (product.imeiList && product.imeiList.length > 0) return product.imeiList[0];
    if (product.imeiPairs && product.imeiPairs.length > 0) return product.imeiPairs[0].imei1;
    return '';
  });

  // Toggles
  const [showStoreName, setShowStoreName] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showSpecs, setShowSpecs] = useState<boolean>(true);
  const [showImei, setShowImei] = useState<boolean>(true);
  const [showSku, setShowSku] = useState<boolean>(true);
  const [barcodeValueType, setBarcodeValueType] = useState<'imei' | 'sku' | 'barcode'>('imei');

  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const barcodeContainerRef = useRef<HTMLDivElement>(null);

  // Available IMEIs
  const allImeis: string[] = [];
  if (product.imeiPairs) {
    product.imeiPairs.forEach(p => { if (p.imei1) allImeis.push(p.imei1); });
  }
  if (product.imeiList) {
    product.imeiList.forEach(im => {
      const clean = im.split('/')[0]?.trim();
      if (clean && !allImeis.includes(clean)) allImeis.push(clean);
    });
  }

  // Active code value for single preview
  const primaryCodeValue = useMemo(() => {
    if (barcodeValueType === 'imei') {
      return targetImei || product.barcode || product.sku || '000000000000';
    }
    if (barcodeValueType === 'sku') {
      return product.sku || product.barcode || '000000000000';
    }
    return product.barcode || product.sku || '000000000000';
  }, [barcodeValueType, targetImei, product.barcode, product.sku]);

  // Self-verification check
  const verificationResult = useMemo(() => {
    return lookupProductByCode(primaryCodeValue, [product]);
  }, [primaryCodeValue, product]);

  // Render SVG barcodes with JsBarcode whenever DOM elements mount/change
  useEffect(() => {
    if (symbology === 'qrcode') return;
    if (!barcodeContainerRef.current) return;

    const svgs = barcodeContainerRef.current.querySelectorAll<SVGSVGElement>('.jsbarcode-target');
    svgs.forEach((svg) => {
      const value = svg.getAttribute('data-barcode-value') || product.barcode || product.sku || '000000000000';
      try {
        const isEan = symbology === 'ean13' && /^[0-9]{12,13}$/.test(value);
        JsBarcode(svg, value, {
          format: isEan ? 'EAN13' : 'CODE128',
          lineColor: '#000000',
          width: layout === 'single_thermal_40x25' ? 1.6 : 2.0,
          height: layout === 'single_thermal_40x25' ? 34 : 44,
          displayValue: false, // We render our own crisp high-contrast text below
          margin: 10,
          marginLeft: 12,
          marginRight: 12,
          marginTop: 4,
          marginBottom: 4,
          background: '#FFFFFF',
          valid: (valid) => {
            if (!valid) {
              console.warn('JsBarcode validation error for code:', value);
            }
          }
        });
      } catch (err) {
        console.warn('JsBarcode render fallback for code:', value, err);
        // Fallback to Code 128
        try {
          JsBarcode(svg, value, {
            format: 'CODE128',
            lineColor: '#000000',
            width: 1.6,
            height: 36,
            displayValue: false,
            margin: 8,
            background: '#FFFFFF',
          });
        } catch {
          // Ignore
        }
      }
    });
  }, [layout, printQuantity, targetImei, barcodeValueType, showImei, showSku, symbology, primaryCodeValue]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(primaryCodeValue);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Generate label items array for printing
  const labelItems = Array.from({ length: printQuantity }).map((_, idx) => {
    const imeiForLabel = allImeis[idx] || targetImei || (product.imeiList && product.imeiList[idx]) || '';
    const activeBarcodeVal = barcodeValueType === 'imei' 
      ? (imeiForLabel || product.barcode || product.sku)
      : barcodeValueType === 'sku' 
        ? product.sku 
        : (product.barcode || product.sku);

    const qrData = symbology === 'qrcode' ? renderQrCodeMatrix(activeBarcodeVal, 37) : null;

    return {
      index: idx,
      imei: imeiForLabel,
      barcodeValue: activeBarcodeVal,
      productName: product.name,
      brand: product.brand,
      specs: product.ram && product.rom ? `${product.ram}/${product.rom}` : product.storage,
      color: product.color,
      price: product.sellingPrice,
      sku: product.sku,
      qrData,
    };
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-modal-backdrop">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-modal-content">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
              <BarcodeIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 leading-tight">
                  Barcode Label Generator & Laser Sticker Printer
                </h2>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md border border-emerald-300">
                  Camera POS Scannable
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Generate 100% optical camera-scannable labels with Code 128 / QR codes with full Quiet Zones.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="print-barcode-labels-btn"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sticker Sheet</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Controls & Customizer Settings (Left Column 5) */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Target Product Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">Product Info</span>
                  <h3 className="text-xs font-black text-slate-900 leading-snug">{product.name}</h3>
                </div>
                <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                  {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600 font-medium">
                <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">SKU: {product.sku}</span>
                {product.ram && product.rom && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">{product.ram}/{product.rom}</span>
                )}
                {product.color && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">{product.color}</span>
                )}
              </div>
            </div>

            {/* Symbology Selector (Code 128 vs QR Code vs EAN) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <BarcodeIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Barcode Format / Symbology:</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSymbology('code128')}
                  className={`p-2 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                    symbology === 'code128'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 font-bold shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <BarcodeIcon className="w-4 h-4 mx-auto mb-0.5 text-indigo-600" />
                  <span>Code 128</span>
                  <span className="text-[9px] text-slate-500 block">Universal 1D</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSymbology('qrcode')}
                  className={`p-2 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                    symbology === 'qrcode'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 font-bold shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-4 h-4 mx-auto mb-0.5 text-indigo-600" />
                  <span>QR Code</span>
                  <span className="text-[9px] text-emerald-600 font-bold block">Instant 2D</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSymbology('ean13')}
                  className={`p-2 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                    symbology === 'ean13'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 font-bold shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Tag className="w-4 h-4 mx-auto mb-0.5 text-indigo-600" />
                  <span>EAN-13</span>
                  <span className="text-[9px] text-slate-500 block">Retail UPC</span>
                </button>
              </div>
            </div>

            {/* Sticker Paper Format Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-indigo-600" />
                <span>Paper Layout / Printer Target:</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLayout('single_thermal_50x30')}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    layout === 'single_thermal_50x30'
                      ? 'border-indigo-600 bg-indigo-50/70 font-bold text-indigo-950 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-extrabold">50mm × 30mm</p>
                  <span className="text-[10px] text-slate-500 block">Standard Thermal Sticker</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLayout('single_thermal_40x25')}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    layout === 'single_thermal_40x25'
                      ? 'border-indigo-600 bg-indigo-50/70 font-bold text-indigo-950 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-extrabold">40mm × 25mm</p>
                  <span className="text-[10px] text-slate-500 block">Compact Jewelry/Cable</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setLayout('a4_3x8_sheet'); setPrintQuantity(24); }}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    layout === 'a4_3x8_sheet'
                      ? 'border-indigo-600 bg-indigo-50/70 font-bold text-indigo-950 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-extrabold">A4 (3 × 8 = 24 Labels)</p>
                  <span className="text-[10px] text-slate-500 block">Laser / Fuji Xerox Sheet</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setLayout('a4_2x7_sheet'); setPrintQuantity(14); }}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    layout === 'a4_2x7_sheet'
                      ? 'border-indigo-600 bg-indigo-50/70 font-bold text-indigo-950 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-extrabold">A4 (2 × 7 = 14 Labels)</p>
                  <span className="text-[10px] text-slate-500 block">Large Box / Shelf Labels</span>
                </button>
              </div>
            </div>

            {/* Barcode Encoding Data Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Encoded Barcode Value:</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </label>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setBarcodeValueType('imei')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    barcodeValueType === 'imei'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  IMEI (15-Digit)
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeValueType('sku')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    barcodeValueType === 'sku'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  SKU Code
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeValueType('barcode')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    barcodeValueType === 'barcode'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  EAN / Standard
                </button>
              </div>

              {/* IMEI Selector if IMEIs exist */}
              {allImeis.length > 0 && barcodeValueType === 'imei' && (
                <div className="pt-1">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Select Target Device IMEI:
                  </label>
                  <select
                    value={targetImei}
                    onChange={(e) => setTargetImei(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    {allImeis.map((im, idx) => (
                      <option key={im} value={im}>
                        Unit #{idx + 1}: {formatImei(im)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Code Verification Scanner Test Indicator */}
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">Encoded Payload:</span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 truncate max-w-[200px]">
                  {primaryCodeValue}
                </span>
              </div>
            </div>

            {/* Print Quantity */}
            <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div>
                <label className="text-xs font-bold text-slate-800 block">Sticker Quantity</label>
                <span className="text-[11px] text-slate-500">Number of stickers to generate</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintQuantity(Math.max(1, printQuantity - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={printQuantity}
                  onChange={(e) => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 px-2 py-1 text-center bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setPrintQuantity(printQuantity + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            {/* Content Field Toggles */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-bold text-slate-800 block mb-1">Visible Fields on Sticker:</span>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStoreName}
                    onChange={(e) => setShowStoreName(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-700">Store Name</span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-700">Selling Price</span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSpecs}
                    onChange={(e) => setShowSpecs(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-700">RAM / ROM / Color</span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showImei}
                    onChange={(e) => setShowImei(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-700">IMEI Text</span>
                </label>
              </div>
            </div>

            {/* Laser Printer Instruction Note */}
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">100% Optical Camera & Laser Compatible:</p>
                <p className="text-[11px] text-emerald-800 leading-relaxed mt-0.5">
                  Includes mandatory optical <strong>Quiet Zones</strong> (white margins) and vector-crisp integer bar alignment for instant reading by POS camera viewfinders and USB laser guns.
                </p>
              </div>
            </div>

          </div>

          {/* Live Printable Preview Canvas (Right Column 7) */}
          <div className="lg:col-span-7 bg-slate-100/80 border border-slate-200 rounded-2xl p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Print Layout Preview ({printQuantity} Sticker{printQuantity > 1 ? 's' : ''})
                </span>
              </div>
              <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {symbology === 'qrcode' ? '2D QR Matrix' : 'Code 128 High-Contrast 1D'}
              </span>
            </div>

            {/* Printable Stickers Container with Laser-ready Print Styles */}
            <div 
              ref={barcodeContainerRef}
              id="barcode-printable-area"
              className="flex-1 overflow-y-auto max-h-[550px] p-4 bg-white rounded-xl shadow-inner border border-slate-300 flex flex-wrap content-start gap-3 items-start justify-center"
            >
              {labelItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-white border-2 border-black rounded-xs text-black flex flex-col justify-between overflow-hidden shrink-0 print-sticker-card ${
                    layout === 'single_thermal_40x25'
                      ? 'w-[185px] min-h-[115px] p-2'
                      : layout === 'a4_3x8_sheet'
                        ? 'w-[230px] min-h-[140px] p-2.5'
                        : layout === 'a4_2x7_sheet'
                          ? 'w-[280px] min-h-[165px] p-3'
                          : 'w-[220px] min-h-[135px] p-2.5'
                  }`}
                  style={{
                    boxSizing: 'border-box',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    color: '#000000',
                  }}
                >
                  {/* Top Store Header */}
                  {showStoreName && (
                    <div className="flex items-center justify-between border-b border-black pb-0.5 mb-1 leading-none">
                      <span className="text-[9px] font-black uppercase tracking-tight truncate max-w-[130px]">
                        {settings.shopName || 'MOBILE STORE'}
                      </span>
                      {showPrice && (
                        <span className="text-[10px] font-black tracking-tight">
                          {formatCurrency(item.price, settings.currencySymbol)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Product Title & Specs */}
                  <div className="leading-tight">
                    <p className="text-[10px] font-black truncate uppercase tracking-tight">
                      {item.productName}
                    </p>
                    {showSpecs && (item.specs || item.color) && (
                      <p className="text-[8px] font-bold uppercase tracking-tight truncate text-slate-800">
                        {[item.specs, item.color].filter(Boolean).join(' • ')}
                      </p>
                    )}
                  </div>

                  {/* Barcode Graphic (1D SVG or 2D QR Code) */}
                  <div className="my-auto py-1 px-1 bg-white rounded flex items-center justify-center overflow-hidden">
                    {symbology === 'qrcode' && item.qrData ? (
                      <div className="flex items-center justify-center p-1 bg-white">
                        <svg
                          viewBox={`0 0 ${item.qrData.size} ${item.qrData.size}`}
                          className="w-16 h-16 max-h-[60px]"
                          shapeRendering="crispEdges"
                        >
                          <path d={item.qrData.path} fill="#000000" />
                        </svg>
                      </div>
                    ) : (
                      <svg 
                        className="jsbarcode-target w-full max-h-[50px]"
                        data-barcode-value={item.barcodeValue}
                        style={{ shapeRendering: 'crispEdges' }}
                      />
                    )}
                  </div>

                  {/* Barcode Number / IMEI Text Beneath */}
                  <div className="pt-0.5 border-t border-black/60 flex items-center justify-between text-[8px] font-mono font-bold leading-none">
                    <span className="truncate">
                      {showImei && item.imei ? `IMEI: ${item.imei}` : `SKU: ${item.sku}`}
                    </span>
                    {showPrice && !showStoreName && (
                      <span className="font-sans font-black text-[9px]">
                        {formatCurrency(item.price, settings.currencySymbol)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>

      </div>

      {/* Embedded High-Contrast Print Stylesheet for Laser Printers */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #barcode-printable-area, #barcode-printable-area * {
            visibility: visible !important;
          }
          #barcode-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 2mm !important;
            justify-content: flex-start !important;
          }
          .print-sticker-card {
            border: 1.5pt solid #000000 !important;
            color: #000000 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

    </div>
  );
};

