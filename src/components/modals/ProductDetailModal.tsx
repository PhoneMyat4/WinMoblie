import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  Package, 
  Edit3, 
  Copy, 
  Check, 
  Barcode, 
  Cpu, 
  HardDrive, 
  ShieldCheck, 
  BatteryCharging, 
  Tag, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  Layers, 
  Calendar, 
  Building2, 
  Hash, 
  FileText,
  Search,
  ExternalLink,
  Share2,
  History,
  Palette,
  Camera,
  Image as ImageIcon,
  Upload,
  ZoomIn,
  Eye
} from 'lucide-react';
import { Product, ShopSettings } from '../../types';
import { formatCurrency, formatDate, formatDateTime, formatImei, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';
import { ProductPhotoUploader } from '../common/ProductPhotoUploader';
import { isPhoneCategory } from '../../data/categoryTaxonomy';

interface ProductDetailModalProps {
  product: Product;
  settings: ShopSettings;
  onClose: () => void;
  onEdit?: (product: Product) => void;
  onViewHistory?: (product: Product) => void;
  onSaveProduct?: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product: initialProduct,
  settings,
  onClose,
  onEdit,
  onViewHistory,
  onSaveProduct,
}) => {
  const [product, setProduct] = useState<Product>(initialProduct);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [imeiSearchQuery, setImeiSearchQuery] = useState<string>('');
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState<boolean>(false);
  const [tempPhotoUrl, setTempPhotoUrl] = useState<string | undefined>(product.imageUrl);
  const [isZoomOpen, setIsZoomOpen] = useState<boolean>(false);

  const cond = getConditionLabel(product.condition);
  const isPhone = isPhoneCategory(product.category) || Boolean(product.rom && product.rom !== '-') || Boolean(product.imeiPairs?.length) || Boolean(product.imeiList?.length);
  const marginAmt = Math.max(0, product.sellingPrice - product.costPrice);
  const marginPct = product.sellingPrice > 0 
    ? Math.round((marginAmt / product.sellingPrice) * 100) 
    : 0;
  
  const isLowStock = product.minStockAlert > 0 ? product.stock <= product.minStockAlert : product.stock <= 0;
  const totalStockCostValuation = product.costPrice * product.stock;
  const totalStockRetailValuation = product.sellingPrice * product.stock;

  const handleSavePhoto = () => {
    const updated: Product = {
      ...product,
      imageUrl: tempPhotoUrl,
    };
    setProduct(updated);
    if (onSaveProduct) {
      onSaveProduct(updated);
    }
    setIsPhotoModalOpen(false);
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleCopyAllSpecs = () => {
    const specs = [
      `📱 ${product.name}`,
      `Brand: ${product.brand}${product.model ? ` | Model: ${product.model}` : ''}`,
      `Category: ${getCategoryLabel(product.category)}${product.subCategory ? ` (${product.subCategory})` : ''}`,
      `Condition: ${cond.label}`,
      product.ram && product.ram !== '-' ? `RAM: ${product.ram}` : null,
      product.rom && product.rom !== '-' ? `Storage: ${product.rom}` : product.storage ? `Storage: ${product.storage}` : null,
      product.color ? `Color: ${product.color}` : null,
      product.batteryHealth ? `Battery Health: ${product.batteryHealth}%` : null,
      `Warranty: ${product.warrantyMonths > 0 ? `${product.warrantyMonths} Months` : 'No Warranty'}`,
      `Price: ${formatCurrency(product.sellingPrice, settings.currencySymbol)}`,
      `SKU: ${product.sku} | Barcode: ${product.barcode}`,
      product.description ? `Notes: ${product.description}` : null,
    ].filter(Boolean).join('\n');

    handleCopy(specs, 'all-specs');
  };

  // Compile full serialized IMEI units
  const imeiPairsList = product.imeiPairs && product.imeiPairs.length > 0 
    ? product.imeiPairs 
    : (product.imeiList || []).map(im => {
        if (im.includes('|')) {
          const [i1, i2] = im.split('|').map(s => s.trim());
          return { imei1: i1, imei2: i2 };
        }
        return { imei1: im };
      });

  const filteredImeis = imeiPairsList.filter(pair => {
    if (!imeiSearchQuery.trim()) return true;
    const q = imeiSearchQuery.toLowerCase().trim();
    return pair.imei1.toLowerCase().includes(q) || (pair.imei2 && pair.imei2.toLowerCase().includes(q));
  });

  return (
    <div 
      id="product-detail-modal-backdrop" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="product-detail-modal-container"
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content my-auto"
      >
        {/* Header Strip */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-50">
          <div className="flex items-start gap-3 min-w-0 pr-2">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-200 mt-0.5">
              {isPhone ? <Smartphone className="w-6 h-6" /> : <Package className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-100/80 text-indigo-800 text-xs font-bold font-mono uppercase tracking-wider">
                  {product.brand}
                </span>
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${cond.badgeClass}`}>
                  {cond.label}
                </span>
                {product.subCategory && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                    {product.subCategory}
                  </span>
                )}
              </div>
              <h3 className="font-black text-slate-900 text-xl tracking-tight mt-1 leading-snug break-words">
                {product.name}
              </h3>
              {product.model && product.model !== product.name && (
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Model: <span className="font-semibold text-slate-700">{product.model}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyAllSpecs}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all cursor-pointer"
              title="Copy product summary"
            >
              {copiedKey === 'all-specs' ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-800 text-xs sm:text-sm">
          
          {/* Product Media & Quick Actions Showcase Card */}
          <div className="p-4 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 border border-slate-200 rounded-3xl flex flex-col sm:flex-row items-center gap-4">
            
            {/* Product Image Frame */}
            <div className="relative group shrink-0">
              <div 
                className={`w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border-2 bg-white flex items-center justify-center shadow-md transition-all ${
                  product.imageUrl ? 'border-indigo-200' : 'border-dashed border-slate-300'
                }`}
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                    onClick={() => setIsZoomOpen(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                    <ImageIcon className="w-8 h-8 text-slate-300 mb-1" />
                    <span className="text-[10px] font-semibold text-slate-400">No Photo</span>
                  </div>
                )}
              </div>

              {/* Hover overlay actions */}
              <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-2xs">
                {product.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setIsZoomOpen(true)}
                    className="p-2 rounded-xl bg-white/90 text-slate-900 hover:bg-white shadow-md transition-transform active:scale-95"
                    title="View full size photo"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTempPhotoUrl(product.imageUrl);
                    setIsPhotoModalOpen(true);
                  }}
                  className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-md transition-transform active:scale-95"
                  title="Upload or change product photo"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Photo details & Quick Photo Button */}
            <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch text-center sm:text-left">
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100/70 text-indigo-900 font-bold text-xs">
                    {product.brand}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800 font-semibold text-xs">
                    {product.sku}
                  </span>
                  {product.color && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/70 text-xs font-semibold">
                      <span
                        className="w-2 h-2 rounded-full border border-black/20"
                        style={{ backgroundColor: getColorDotHex(product.color) }}
                      />
                      <span>{product.color}</span>
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-slate-900 text-base sm:text-lg leading-tight">
                  {product.name}
                </h4>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  Barcode: <span className="font-bold text-slate-700">{product.barcode}</span>
                  {product.warrantyMonths > 0 && (
                    <span className="ml-2 font-sans font-medium text-emerald-700">
                      • {product.warrantyMonths} Months Warranty
                    </span>
                  )}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <button
                  type="button"
                  id="detail-upload-photo-btn"
                  onClick={() => {
                    setTempPhotoUrl(product.imageUrl);
                    setIsPhotoModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{product.imageUrl ? 'Change Photo' : 'Upload Product Photo'}</span>
                </button>
                {product.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setIsZoomOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View High-Res</span>
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Key Metrics / Pricing & Inventory Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            {/* Selling Price */}
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                <span>Retail Selling Price</span>
                <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <p className="text-lg sm:text-xl font-black text-indigo-950">
                {formatCurrency(product.sellingPrice, settings.currencySymbol)}
              </p>
              <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                +{formatCurrency(marginAmt, settings.currencySymbol)} profit ({marginPct}%)
              </p>
            </div>

            {/* Cost Price */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                <span>Unit Cost Price</span>
                <Tag className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-800">
                {formatCurrency(product.costPrice, settings.currencySymbol)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Acquisition cost</p>
            </div>

            {/* In-Stock Quantity */}
            <div className={`p-3.5 rounded-2xl border ${
              isLowStock ? 'bg-rose-50/70 border-rose-200' : 'bg-emerald-50/60 border-emerald-200'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className={isLowStock ? 'text-rose-800' : 'text-emerald-800'}>Current Stock</span>
                {isLowStock ? <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> : <Package className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <p className={`text-lg sm:text-xl font-black ${isLowStock ? 'text-rose-900' : 'text-emerald-950'}`}>
                {product.stock} Units
              </p>
              <p className={`text-[10px] font-semibold mt-0.5 ${isLowStock ? 'text-rose-600' : 'text-emerald-700'}`}>
                {product.minStockAlert === 0
                  ? (product.stock <= 0 ? '⚠️ Out of stock! (Alert: 0)' : 'Healthy stock (Alert: 0 / Disabled)')
                  : (isLowStock ? `⚠️ Low stock! (Min: ${product.minStockAlert})` : `Healthy stock (Alert: ${product.minStockAlert})`)}
              </p>
            </div>

            {/* Total Stock Value */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                <span>Total Retail Valuation</span>
                <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900">
                {formatCurrency(totalStockRetailValuation, settings.currencySymbol)}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                Cost: {formatCurrency(totalStockCostValuation, settings.currencySymbol)}
              </p>
            </div>

          </div>

          {/* Phone Hardware Specifications */}
          {isPhone && (
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Device Hardware Specifications</h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* RAM */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">RAM Memory</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 mt-0.5 text-xs sm:text-sm">
                    <Cpu className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{product.ram && product.ram !== '-' ? product.ram : 'Standard'}</span>
                  </div>
                </div>

                {/* Storage / ROM */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Internal Storage (ROM)</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 mt-0.5 text-xs sm:text-sm">
                    <HardDrive className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>{product.rom && product.rom !== '-' ? product.rom : product.storage || '128GB'}</span>
                  </div>
                </div>

                {/* Color */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Color Variant</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 mt-0.5 text-xs sm:text-sm">
                    {product.color && product.color.trim() ? (
                      <>
                        <span
                          className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: getColorDotHex(product.color) }}
                        />
                        <span className="truncate">{product.color}</span>
                      </>
                    ) : (
                      <span className="text-slate-400 font-normal text-xs">Standard / Unspecified</span>
                    )}
                  </div>
                </div>

                {/* Battery Health */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Battery Health</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 mt-0.5 text-xs sm:text-sm">
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{product.batteryHealth ? `${product.batteryHealth}%` : '100% (New)'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Barcode, SKU & Tracking Identifiers */}
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Barcode className="w-4 h-4 text-indigo-600" />
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Stock & Tracking Identifiers</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* SKU */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">SKU / Item Code</span>
                  <p className="font-mono font-bold text-slate-900 text-xs sm:text-sm mt-0.5">{product.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(product.sku, 'sku')}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                  title="Copy SKU"
                >
                  {copiedKey === 'sku' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Barcode */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Barcode / UPC</span>
                  <p className="font-mono font-bold text-slate-900 text-xs sm:text-sm mt-0.5">{product.barcode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(product.barcode, 'barcode')}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                  title="Copy Barcode"
                >
                  {copiedKey === 'barcode' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Warranty */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Shop Warranty Period</span>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 mt-0.5 text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{product.warrantyMonths > 0 ? `${product.warrantyMonths} Months Warranty` : 'No Warranty / As-is'}</span>
                </div>
              </div>

            </div>
          </div>

          {/* Serialized Device IMEIs Section (if phone / serialized) */}
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Serialized Device Units ({imeiPairsList.length} Units Registered)
                </h4>
              </div>

              {imeiPairsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allImeis = imeiPairsList.map(p => p.imei2 ? `${p.imei1} / ${p.imei2}` : p.imei1).join('\n');
                    handleCopy(allImeis, 'all-imeis');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                >
                  {copiedKey === 'all-imeis' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy All IMEIs</span>
                </button>
              )}
            </div>

            {imeiPairsList.length > 0 ? (
              <div className="space-y-2">
                {imeiPairsList.length > 4 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filter device units by IMEI..."
                      value={imeiSearchQuery}
                      onChange={(e) => setImeiSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {filteredImeis.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
                      No serialized unit matches "{imeiSearchQuery}"
                    </div>
                  ) : (
                    filteredImeis.map((pair, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/80 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-[10px] shrink-0 font-sans">
                            #{idx + 1}
                          </span>
                          
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900">
                              SIM 1: <span className="text-indigo-900">{formatImei(pair.imei1)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(pair.imei1, `imei1-${idx}`)}
                              className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Copy IMEI 1"
                            >
                              {copiedKey === `imei1-${idx}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>

                            {pair.imei2 && (
                              <>
                                <span className="text-slate-300">|</span>
                                <span className="font-semibold text-slate-700">
                                  SIM 2: <span className="text-purple-900">{formatImei(pair.imei2)}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(pair.imei2!, `imei2-${idx}`)}
                                  className="p-0.5 text-slate-400 hover:text-purple-600 transition-colors"
                                  title="Copy IMEI 2"
                                >
                                  {copiedKey === `imei2-${idx}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 text-center text-slate-500 text-xs bg-white rounded-xl border border-slate-200">
                <p className="italic">Non-serialized product. Inventory is tracked by barcode / quantity.</p>
              </div>
            )}
          </div>

          {/* Supplier & Restock Information */}
          {(product.supplierName || product.lastRestockedAt) && (
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Supplier & Supply History</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {product.supplierName && (
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Supplier: <strong className="text-slate-900">{product.supplierName}</strong></span>
                  </div>
                )}
                {product.lastRestockedAt && (
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Last Inflow: <strong className="text-slate-900">{formatDateTime(product.lastRestockedAt)}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description / Notes */}
          {product.description && (
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Product Notes & Details</h4>
              </div>
              <p className="text-slate-700 leading-relaxed whitespace-pre-line text-xs">
                {product.description}
              </p>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleCopyAllSpecs}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 transition-colors text-xs cursor-pointer shadow-2xs"
          >
            {copiedKey === 'all-specs' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiedKey === 'all-specs' ? 'Specs Copied!' : 'Copy Specs'}</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {onViewHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewHistory(product);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-xl border border-indigo-200 transition-colors text-xs cursor-pointer"
              >
                <History className="w-4 h-4" />
                <span>Product History & Audits</span>
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(product);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl border border-slate-200 transition-colors text-xs cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Item</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs transition-colors text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>

      {/* Quick Photo Upload Sub-modal */}
      {isPhotoModalOpen && (
        <div 
          id="photo-upload-submodal"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPhotoModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 flex flex-col space-y-4 animate-modal-content">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Update Product Photo</h4>
                  <p className="text-xs text-slate-500">{product.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ProductPhotoUploader
              currentImageUrl={tempPhotoUrl}
              onImageChange={setTempPhotoUrl}
              productName={product.name}
              category={product.category}
              brand={product.brand}
            />

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePhoto}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                Save Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-Res Zoom Lightbox */}
      {isZoomOpen && product.imageUrl && (
        <div 
          id="photo-zoom-lightbox"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-modal-backdrop"
          onClick={() => setIsZoomOpen(false)}
        >
          <div className="relative max-w-2xl max-h-[85vh] flex flex-col items-center animate-modal-content">
            <button
              onClick={() => setIsZoomOpen(false)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={product.imageUrl}
              alt={product.name}
              className="max-h-[80vh] w-auto max-w-full rounded-2xl shadow-2xl object-contain border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-3 text-center text-white/80 text-xs font-medium">
              <span>{product.brand} - {product.name}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
