import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ShoppingCart, 
  Plus, 
  ShieldCheck, 
  ShieldAlert, 
  Tag, 
  Cpu, 
  HardDrive, 
  BatteryCharging, 
  Palette, 
  Barcode, 
  Check, 
  ExternalLink,
  Layers,
  Smartphone,
  Info,
  Maximize2
} from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';

interface PosProductHoverPreviewProps {
  product: Product | null;
  anchorRect: DOMRect | null;
  currencySymbol: string;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onOpenMobileModal?: (product: Product) => void;
}

/**
 * Desktop Floating Popover: Appears right next to the hovered product card with
 * high-res enlarged image, complete un-truncated name, and full hardware specs.
 */
export const PosProductHoverPreview: React.FC<PosProductHoverPreviewProps> = ({
  product,
  anchorRect,
  currencySymbol,
  onClose,
  onAddToCart,
  onOpenMobileModal
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'right' | 'left' } | null>(null);
  const [justAdded, setJustAdded] = useState<boolean>(false);

  useEffect(() => {
    if (!anchorRect || !product) {
      setCoords(null);
      return;
    }

    const popoverWidth = 360;
    const popoverEstimatedHeight = 440;
    const padding = 14;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorRect.right + padding;
    let placement: 'right' | 'left' = 'right';

    // If overflowing right edge of viewport, flip to left side of card
    if (left + popoverWidth > viewportWidth - padding) {
      left = anchorRect.left - popoverWidth - padding;
      placement = 'left';
    }

    // If still overflowing left edge (e.g. narrow screen), clamp to viewport
    if (left < padding) {
      left = Math.max(padding, (viewportWidth - popoverWidth) / 2);
    }

    // Vertical positioning: align with card top, clamped within viewport bounds
    let top = anchorRect.top;
    if (top + popoverEstimatedHeight > viewportHeight - padding) {
      top = Math.max(padding, viewportHeight - popoverEstimatedHeight - padding);
    }
    if (top < padding) {
      top = padding;
    }

    setCoords({ top, left, placement });
  }, [anchorRect, product]);

  if (!product || !coords) return null;

  const cond = getConditionLabel(product.condition);
  const isQuarantined = product.itemStatus === 'Quarantined' || product.itemStatus === 'Pending RMA' || product.itemStatus === 'Written-Off';
  const sellableStock = Math.max(0, product.stock - (product.quarantinedStock || 0));
  const isOutOfStock = sellableStock <= 0;
  const isUnavailable = isOutOfStock || isQuarantined;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUnavailable) return;
    onAddToCart(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <div
      ref={popoverRef}
      id={`pos-product-preview-popover-${product.id}`}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        width: '360px',
        zIndex: 9999,
      }}
      className="hidden md:block bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden select-none pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150"
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={onClose}
    >
      {/* Top Header & Badges */}
      <div className="bg-slate-900 text-white p-3.5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 px-2 py-0.5 rounded-md">
            {product.brand}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cond.badgeClass}`}>
            {product.condition === 'brand_new' ? 'Brand New' : cond.label}
          </span>
          {product.isBStock && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40 inline-flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Open-Box B-Stock
            </span>
          )}
          {isQuarantined && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-400/40 inline-flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              Quarantined
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onOpenMobileModal && (
            <button
              type="button"
              onClick={() => onOpenMobileModal(product)}
              title="Expand full details"
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close preview"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Enlarged Product Image */}
      <div className="relative w-full h-48 bg-slate-50 border-b border-slate-100 flex items-center justify-center p-3 overflow-hidden group">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-contain rounded-lg transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200">
              <Smartphone className="w-8 h-8 text-slate-400" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500">No Image Preview Available</span>
          </div>
        )}

        {/* Quick stock indicator overlay badge */}
        <div className="absolute bottom-2.5 right-2.5">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-black shadow-xs border ${
            isUnavailable
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : sellableStock <= product.minStockAlert
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {sellableStock} units sellable
          </span>
        </div>
      </div>

      {/* Product Information Body */}
      <div className="p-4 space-y-3.5 max-h-[360px] overflow-y-auto scrollbar-thin">
        {/* Full Un-truncated Product Title */}
        <div>
          <h3 className="text-sm font-black text-slate-900 leading-snug break-words">
            {product.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
            <span>{getCategoryLabel(product.category)}</span>
            {product.subCategory && (
              <>
                <span>•</span>
                <span className="font-semibold text-slate-700">{product.subCategory}</span>
              </>
            )}
            {product.model && (
              <>
                <span>•</span>
                <span className="font-mono text-slate-600">Model: {product.model}</span>
              </>
            )}
          </div>
        </div>

        {/* Key Hardware Specs Grid */}
        <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 text-xs">
          {/* RAM & Storage */}
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">RAM / Storage</span>
              <span className="font-bold text-slate-800 truncate block">
                {product.ram && product.ram !== '-' ? product.ram : 'Standard'}
                {(product.rom && product.rom !== '-') ? ` / ${product.rom}` : (product.storage ? ` / ${product.storage}` : '')}
              </span>
            </div>
          </div>

          {/* Color */}
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Color</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                {product.color && product.color.trim() ? (
                  <>
                    <span 
                      className="w-3 h-3 rounded-full border border-black/20 shrink-0" 
                      style={{ backgroundColor: getColorDotHex(product.color) }} 
                    />
                    <span className="truncate">{product.color}</span>
                  </>
                ) : (
                  <span className="text-slate-400 font-normal">Not specified</span>
                )}
              </div>
            </div>
          </div>

          {/* Battery Health */}
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Battery Health</span>
              <span className="font-bold text-slate-800 truncate block">
                {product.batteryHealth ? `${product.batteryHealth}% Maximum` : '100% / New'}
              </span>
            </div>
          </div>

          {/* Warranty */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Warranty</span>
              <span className="font-bold text-slate-800 truncate block">
                {product.warrantyMonths || 12} Months
              </span>
            </div>
          </div>
        </div>

        {/* Serialized / IMEI status & SKU */}
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500 flex items-center gap-1">
              <Barcode className="w-3.5 h-3.5 text-slate-400" />
              Barcode:
            </span>
            <span className="font-mono font-bold text-slate-700">{product.barcode || 'N/A'}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">SKU Code:</span>
            <span className="font-mono font-bold text-slate-700">{product.sku || 'N/A'}</span>
          </div>

          {(product.imeiPairs?.length || product.imeiList?.length) ? (
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Tracking:</span>
              <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 text-[10px]">
                {product.dualImei ? 'Dual IMEI Unit' : 'IMEI / Serial Serialized'}
              </span>
            </div>
          ) : null}

          {product.description && (
            <div className="pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Notes / Description:</span>
              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/80 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Pricing & Quick Add to Cart Action */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Selling Price</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-black text-slate-900">
              {formatCurrency(product.sellingPrice, currencySymbol)}
            </span>
            {product.isBStock && product.bStockDiscountedPrice && (
              <span className="text-xs text-slate-400 line-through">
                {formatCurrency(product.bStockDiscountedPrice, currencySymbol)}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={isUnavailable}
          id={`preview-add-to-cart-${product.id}`}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md ${
            isUnavailable
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : justAdded
                ? 'bg-emerald-600 text-white shadow-emerald-950/20'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-950/20 active:scale-95'
          }`}
        >
          {justAdded ? (
            <>
              <Check className="w-4 h-4" />
              <span>Added!</span>
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4" />
              <span>Add to Cart</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

interface PosProductMobileDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  currencySymbol: string;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
}

/**
 * Mobile-Optimized Product Specification Drawer / Modal:
 * For touch screens and mobile web browsers where hover does not exist.
 * Cashiers and mobile clerks can tap the quick preview button on the card
 * to view the enlarged image and complete specs cleanly without adding to cart accidentally.
 */
export const PosProductMobileDetailModal: React.FC<PosProductMobileDetailModalProps> = ({
  product,
  isOpen,
  currencySymbol,
  onClose,
  onAddToCart,
}) => {
  const [justAdded, setJustAdded] = useState<boolean>(false);

  if (!isOpen || !product) return null;

  const cond = getConditionLabel(product.condition);
  const isQuarantined = product.itemStatus === 'Quarantined' || product.itemStatus === 'Pending RMA' || product.itemStatus === 'Written-Off';
  const sellableStock = Math.max(0, product.stock - (product.quarantinedStock || 0));
  const isOutOfStock = sellableStock <= 0;
  const isUnavailable = isOutOfStock || isQuarantined;

  const handleAdd = () => {
    if (isUnavailable) return;
    onAddToCart(product);
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      onClose();
    }, 500);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 px-2 py-0.5 rounded-md">
              {product.brand}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cond.badgeClass}`}>
              {product.condition === 'brand_new' ? 'Brand New' : cond.label}
            </span>
            {product.isBStock && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40">
                Open-Box B-Stock
              </span>
            )}
          </div>

          <button
            type="button"
            id="close-mobile-preview-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Enlarged Photo Preview */}
          <div className="w-full h-56 bg-slate-100 rounded-2xl flex items-center justify-center p-3 border border-slate-200 relative overflow-hidden">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center text-slate-400 gap-2">
                <Smartphone className="w-12 h-12" />
                <span className="text-xs font-semibold">No Image Available</span>
              </div>
            )}

            <div className="absolute bottom-3 right-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs border ${
                isUnavailable
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : sellableStock <= product.minStockAlert
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                {sellableStock} sellable
              </span>
            </div>
          </div>

          {/* Full Name & Categories */}
          <div>
            <h2 className="text-base font-black text-slate-900 leading-snug break-words">
              {product.name}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
              <span>Category: {getCategoryLabel(product.category)}</span>
              {product.subCategory && <span>• {product.subCategory}</span>}
              {product.model && <span>• Model: {product.model}</span>}
            </div>
          </div>

          {/* Specs Grid */}
          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">RAM / Storage</span>
                <span className="font-bold text-slate-800">
                  {product.ram && product.ram !== '-' ? product.ram : 'Standard'}
                  {(product.rom && product.rom !== '-') ? ` / ${product.rom}` : (product.storage ? ` / ${product.storage}` : '')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-purple-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Color</span>
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  {product.color && product.color.trim() ? (
                    <>
                      <span 
                        className="w-3 h-3 rounded-full border border-black/20 shrink-0" 
                        style={{ backgroundColor: getColorDotHex(product.color) }} 
                      />
                      <span>{product.color}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 font-normal">N/A</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Battery</span>
                <span className="font-bold text-slate-800">
                  {product.batteryHealth ? `${product.batteryHealth}% Battery` : '100% / New'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Warranty</span>
                <span className="font-bold text-slate-800">
                  {product.warrantyMonths || 12} Months
                </span>
              </div>
            </div>
          </div>

          {/* Barcode & SKU */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Barcode:</span>
              <span className="font-mono font-bold text-slate-800">{product.barcode || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">SKU:</span>
              <span className="font-mono font-bold text-slate-800">{product.sku || 'N/A'}</span>
            </div>
          </div>

          {product.description && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Specifications &amp; Details:</span>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Selling Price</span>
            <span className="text-xl font-black text-slate-900">
              {formatCurrency(product.sellingPrice, currencySymbol)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={isUnavailable}
            id={`mobile-modal-add-to-cart-${product.id}`}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${
              isUnavailable
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : justAdded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-5 h-5" />
                <span>Added to Cart!</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                <span>Add to Order</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
