import React, { useState, useMemo } from 'react';
import { 
  X, 
  Truck, 
  PackageCheck, 
  CheckCircle2, 
  Calculator, 
  Layers, 
  Hash, 
  AlertCircle, 
  Clock, 
  FileText,
  DollarSign,
  Smartphone,
  Tag,
  Plus,
  Trash2,
  Camera,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  User,
  Phone,
  CalendarClock,
  Link2,
  Unlink,
  Image as ImageIcon,
  Paperclip,
  Eye,
  ExternalLink,
  Lock,
  Package
} from 'lucide-react';
import { PurchaseRecord, PurchaseItem, Product, ShopSettings, StaffRole, ImeiPair, PreOrder } from '../../types';
import { formatCurrency, formatDate, formatImei } from '../../utils/formatters';
import { exportGoodsReceiptNotePdf } from '../../utils/purchasePdfExport';
import { BoxScannerModal } from '../modals/BoxScannerModal';
import { NewProductModal } from '../modals/NewProductModal';
import { ExtractedBoxSpecs } from '../../utils/boxScannerService';
import { StorageService } from '../../utils/storage';
import { isPhoneCategory, canonicalCategory } from '../../data/categoryTaxonomy';
import { findExactVariantMatch } from '../../utils/variantUtils';

export const isPhoneItem = (item: {
  category?: string;
  rom?: string;
  ram?: string;
  imeiPairs?: ImeiPair[];
  imeiList?: string[];
  dualImei?: boolean;
}): boolean => {
  if (isPhoneCategory(item.category)) return true;
  if (item.rom && item.rom !== '-') return true;
  if (item.ram && item.ram !== '-') return true;
  if (item.imeiPairs && item.imeiPairs.length > 0) return true;
  if (item.imeiList && item.imeiList.length > 0) return true;
  if (item.dualImei !== undefined && item.dualImei !== null) return true;
  return false;
};

interface PurchaseReceiveModalProps {
  purchase: PurchaseRecord;
  settings: ShopSettings;
  currentStaffName: string;
  currentRole: StaffRole;
  hasPermission?: boolean;
  onConfirmReceipt: (data: {
    deliveryCharges: number;
    receivedBy: string;
    receivingNotes?: string;
    receivedDate: string;
    updatedItems?: PurchaseItem[];
  }) => void;
  onRevertStage?: (targetStatus: 'draft' | 'pending_approval' | 'confirmed') => void;
  onClose: () => void;
}

export const PurchaseReceiveModal: React.FC<PurchaseReceiveModalProps> = ({
  purchase,
  settings,
  currentStaffName,
  currentRole,
  hasPermission,
  onConfirmReceipt,
  onRevertStage,
  onClose,
}) => {
  // Is stage unlocked? Unlocks only if status is 'confirmed' (or already 'received')
  const isUnlocked = purchase.status === 'confirmed' || purchase.status === 'received';
  // Permission verification: checks if user has Stage 3 Receive permission
  const isAuthorized = hasPermission !== undefined ? hasPermission : true;

  const [deliveryCharges, setDeliveryCharges] = useState<number>(
    purchase.deliveryCharges !== undefined ? purchase.deliveryCharges : (purchase.shippingFee || 0)
  );
  const [receivedBy, setReceivedBy] = useState<string>(currentStaffName || purchase.receivedBy || 'Store Owner');
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receivingNotes, setReceivingNotes] = useState<string>(purchase.receivingNotes || '');
  const [inspectionAcknowledged, setInspectionAcknowledged] = useState<boolean>(true);

  // Editable items state to capture Target Retail Prices & IMEIs during physical goods intake
  const [items, setItems] = useState<PurchaseItem[]>(() => {
    const prods = StorageService.getProducts();
    return purchase.items.map(item => {
      // Find matching catalog product if any to default sellingPrice if not present
      const matched = prods.find(p => p.id === item.productId) ||
                      prods.find(p => 
                        canonicalCategory(p.category) === canonicalCategory(item.category) &&
                        p.brand.toLowerCase() === item.brand.toLowerCase() &&
                        (p.name.toLowerCase() === item.name.toLowerCase() || (p.model && p.model.toLowerCase() === item.name.toLowerCase()))
                      );
      const targetSellPrice = item.sellingPrice > 0 
        ? item.sellingPrice 
        : (matched && matched.sellingPrice > 0 ? matched.sellingPrice : Math.round(item.unitCost * 1.2));

      // Normalize imeiPairs if item only had imeiList
      let initialPairs = item.imeiPairs ? [...item.imeiPairs] : [];
      if (initialPairs.length === 0 && item.imeiList && item.imeiList.length > 0) {
        initialPairs = item.imeiList.map(im => {
          if (im.includes('|')) {
            const [i1, i2] = im.split('|').map(s => s.trim());
            return { imei1: i1, imei2: i2 || undefined };
          }
          return { imei1: im };
        });
      }
      return {
        ...item,
        sellingPrice: targetSellPrice,
        imeiPairs: initialPairs,
        dualImei: item.dualImei ?? true,
      };
    });
  });

  // Track manual override for serialized intake (phones default to serialized)
  const [overrideSerialized, setOverrideSerialized] = useState<{ [itemIdx: number]: boolean }>({});

  // Track expanded item index for IMEI entry accordion
  const [expandedItemIndex, setExpandedItemIndex] = useState<number | null>(0);

  // Per-item active inputs for adding IMEIs
  const [activeImei1, setActiveImei1] = useState<{ [itemIdx: number]: string }>({});
  const [activeImei2, setActiveImei2] = useState<{ [itemIdx: number]: string }>({});
  
  // Late-Linking Pre-Orders State
  const [pendingPreOrders, setPendingPreOrders] = useState<PreOrder[]>(() => {
    return StorageService.getPendingPreOrders();
  });
  const [isAllocateChecked, setIsAllocateChecked] = useState<{ [itemIdx: number]: boolean }>({});
  const [preOrderSearchQueries, setPreOrderSearchQueries] = useState<{ [itemIdx: number]: string }>({});
  const [selectedPreOrderForIntake, setSelectedPreOrderForIntake] = useState<{ [itemIdx: number]: PreOrder | null }>({});
  const [linkingUnitTarget, setLinkingUnitTarget] = useState<{ itemIdx: number; pairIdx: number; query: string } | null>(null);

  // Voucher zoom state in Stage 3
  const [isSupplierVoucherZoomed, setIsSupplierVoucherZoomed] = useState<boolean>(false);

  // AI Box Scanner state for receiving stage
  const [scanningItemIdx, setScanningItemIdx] = useState<number | null>(null);

  // Catalog products for linking and editing in product form
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(() => StorageService.getProducts());
  // Active item index for opening product form modal to complete details
  const [activeProductFormItemIndex, setActiveProductFormItemIndex] = useState<number | null>(null);
  const [productDetailsSavedFeedback, setProductDetailsSavedFeedback] = useState<string | null>(null);

  // Memoized product object to pass to NewProductModal for the selected item
  const productForModal = useMemo<Product | null>(() => {
    if (activeProductFormItemIndex === null) return null;
    const targetItem = items[activeProductFormItemIndex];
    if (!targetItem) return null;

    // 1. Direct match by productId or exact variant in catalog
    const existing = catalogProducts.find(p => p.id === targetItem.productId) ||
                     findExactVariantMatch(catalogProducts, targetItem) ||
                     catalogProducts.find(p => 
                       canonicalCategory(p.category) === canonicalCategory(targetItem.category) &&
                       p.brand.toLowerCase() === (targetItem.brand || '').toLowerCase() &&
                       (p.name.toLowerCase() === targetItem.name.toLowerCase() || (p.model && p.model.toLowerCase() === targetItem.name.toLowerCase()))
                     );

    if (existing) {
      return {
        ...existing,
        name: targetItem.name || existing.name,
        brand: targetItem.brand || existing.brand,
        model: targetItem.model || existing.model || targetItem.name,
        category: canonicalCategory(targetItem.category || existing.category),
        subCategory: targetItem.subCategory !== undefined ? targetItem.subCategory : existing.subCategory,
        condition: targetItem.condition || existing.condition || 'brand_new',
        ram: targetItem.ram !== undefined ? targetItem.ram : existing.ram,
        rom: targetItem.rom !== undefined ? targetItem.rom : existing.rom,
        color: targetItem.color !== undefined ? targetItem.color : existing.color,
        costPrice: targetItem.unitCost > 0 ? targetItem.unitCost : existing.costPrice,
        sellingPrice: targetItem.sellingPrice > 0 ? targetItem.sellingPrice : existing.sellingPrice,
        stock: existing.stock,
        warrantyMonths: targetItem.warrantyMonths !== undefined ? targetItem.warrantyMonths : (existing.warrantyMonths ?? 12),
        description: targetItem.description !== undefined ? targetItem.description : (existing.description || ''),
        barcode: targetItem.barcode || existing.barcode,
        sku: targetItem.sku || existing.sku,
        minStockAlert: targetItem.minStockAlert !== undefined ? targetItem.minStockAlert : (existing.minStockAlert !== undefined ? existing.minStockAlert : 0),
        imeiPairs: (targetItem.imeiPairs && targetItem.imeiPairs.length > 0) ? targetItem.imeiPairs : existing.imeiPairs,
        dualImei: targetItem.dualImei ?? existing.dualImei ?? true,
        supplierId: purchase.supplierId || existing.supplierId,
        supplierName: purchase.supplierName || existing.supplierName,
      };
    }

    // 2. Fresh product specification crafted from PurchaseItem
    return {
      id: targetItem.productId && !targetItem.productId.startsWith('prod-draft-')
        ? targetItem.productId
        : `prod-${Date.now()}-${activeProductFormItemIndex}`,
      name: targetItem.name,
      brand: targetItem.brand,
      model: targetItem.model || targetItem.name,
      category: canonicalCategory(targetItem.category || 'brand_new_phones'),
      subCategory: targetItem.subCategory || '',
      condition: targetItem.condition || 'brand_new',
      sku: targetItem.sku || '',
      barcode: targetItem.barcode || '',
      costPrice: targetItem.unitCost || 0,
      sellingPrice: targetItem.sellingPrice > 0 ? targetItem.sellingPrice : Math.round((targetItem.unitCost || 0) * 1.2),
      stock: targetItem.quantity || 1,
      minStockAlert: targetItem.minStockAlert !== undefined ? targetItem.minStockAlert : 0,
      warrantyMonths: targetItem.warrantyMonths ?? 12,
      ram: targetItem.ram,
      rom: targetItem.rom,
      color: targetItem.color,
      description: targetItem.description || '',
      imeiPairs: targetItem.imeiPairs || [],
      dualImei: targetItem.dualImei ?? true,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierName,
    };
  }, [activeProductFormItemIndex, items, catalogProducts, purchase.supplierId, purchase.supplierName]);

  // Handle saving completed product details from NewProductModal
  const handleSaveProductFromModal = (savedProduct: Product) => {
    if (activeProductFormItemIndex === null) return;
    const targetIdx = activeProductFormItemIndex;

    // Save product to inventory catalog
    StorageService.saveProduct(savedProduct);
    const freshProducts = StorageService.getProducts();
    setCatalogProducts(freshProducts);

    // Update purchase item in Stage 3 intake
    setItems(prev => {
      const next = [...prev];
      const cur = next[targetIdx];
      const newUnitCost = savedProduct.costPrice > 0 ? savedProduct.costPrice : cur.unitCost;
      const newSellingPrice = savedProduct.sellingPrice > 0 ? savedProduct.sellingPrice : cur.sellingPrice;

      next[targetIdx] = {
        ...cur,
        productId: savedProduct.id,
        name: savedProduct.name,
        brand: savedProduct.brand,
        model: savedProduct.model || savedProduct.name,
        category: savedProduct.category,
        subCategory: savedProduct.subCategory,
        condition: savedProduct.condition,
        ram: savedProduct.ram,
        rom: savedProduct.rom,
        color: savedProduct.color,
        warrantyMonths: savedProduct.warrantyMonths,
        description: savedProduct.description,
        barcode: savedProduct.barcode,
        sku: savedProduct.sku,
        minStockAlert: savedProduct.minStockAlert,
        unitCost: newUnitCost,
        totalCost: newUnitCost * cur.quantity,
        sellingPrice: newSellingPrice,
        imeiPairs: (savedProduct.imeiPairs && savedProduct.imeiPairs.length > 0) ? savedProduct.imeiPairs : cur.imeiPairs,
        dualImei: savedProduct.dualImei ?? cur.dualImei ?? true,
      };
      return next;
    });

    setProductDetailsSavedFeedback(`Product "${savedProduct.name}" details completed & linked.`);
    setTimeout(() => {
      setProductDetailsSavedFeedback(null);
    }, 4000);

    setActiveProductFormItemIndex(null);
  };

  // Landed Cost Calculations
  const baseSubtotal = items.reduce((acc, item) => acc + item.totalCost, 0);
  const otherCosts = purchase.otherCosts || 0;
  const totalLandedCost = baseSubtotal + otherCosts + Number(deliveryCharges || 0);

  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
  const deliveryPerUnit = totalQuantity > 0 ? Math.round(Number(deliveryCharges || 0) / totalQuantity) : 0;

  // Total units allocated to customer pre-orders
  const totalAllocatedUnitsCount = items.reduce((sum, itm) => {
    const pairCount = (itm.imeiPairs || []).filter(p => p.allocatedPreOrderId).length;
    const itemLevel = itm.allocatedPreOrderId ? 1 : 0;
    return sum + pairCount + itemLevel;
  }, 0);

  // Add IMEI Pair to an item with optional pre-order late-linking
  const handleAddImeiToItem = (itemIdx: number) => {
    const i1 = (activeImei1[itemIdx] || '').trim().replace(/\D/g, '');
    const i2 = (activeImei2[itemIdx] || '').trim().replace(/\D/g, '');

    if (!i1) return;

    const allocatedPreOrder = selectedPreOrderForIntake[itemIdx];

    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[itemIdx] };
      const currentPairs = target.imeiPairs ? [...target.imeiPairs] : [];

      if (currentPairs.some(p => p.imei1 === i1)) {
        alert('This IMEI is already captured for this item.');
        return prev;
      }

      const newPair: ImeiPair = {
        imei1: i1,
        imei2: i2 ? i2 : undefined,
        allocatedPreOrderId: allocatedPreOrder?.id || target.allocatedPreOrderId,
        allocatedPreOrderNumber: allocatedPreOrder?.preOrderNumber || target.allocatedPreOrderNumber,
        allocatedCustomerName: allocatedPreOrder?.customerName || target.allocatedCustomerName,
      };

      const updatedPairs = [...currentPairs, newPair];
      target.imeiPairs = updatedPairs;
      target.imeiList = updatedPairs.map(p => p.imei1);
      
      // Auto-update quantity if more IMEIs are scanned than original qty
      if (updatedPairs.length > target.quantity) {
        target.quantity = updatedPairs.length;
        target.totalCost = target.quantity * target.unitCost;
      }

      copy[itemIdx] = target;
      return copy;
    });

    // Reset input fields and allocation state for this item
    setActiveImei1(prev => ({ ...prev, [itemIdx]: '' }));
    setActiveImei2(prev => ({ ...prev, [itemIdx]: '' }));
    setSelectedPreOrderForIntake(prev => ({ ...prev, [itemIdx]: null }));
    setIsAllocateChecked(prev => ({ ...prev, [itemIdx]: false }));
    setPreOrderSearchQueries(prev => ({ ...prev, [itemIdx]: '' }));
  };

  // Link existing captured IMEI unit to a pre-order
  const handleLinkPreOrderToUnit = (itemIdx: number, pairIdx: number, preOrder: PreOrder) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[itemIdx] };
      const currentPairs = target.imeiPairs ? [...target.imeiPairs] : [];
      if (currentPairs[pairIdx]) {
        currentPairs[pairIdx] = {
          ...currentPairs[pairIdx],
          allocatedPreOrderId: preOrder.id,
          allocatedPreOrderNumber: preOrder.preOrderNumber,
          allocatedCustomerName: preOrder.customerName,
        };
        target.imeiPairs = currentPairs;
        copy[itemIdx] = target;
      }
      return copy;
    });
    setLinkingUnitTarget(null);
  };

  // Unlink pre-order from a specific unit
  const handleUnlinkPreOrderFromUnit = (itemIdx: number, pairIdx: number) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[itemIdx] };
      const currentPairs = target.imeiPairs ? [...target.imeiPairs] : [];
      if (currentPairs[pairIdx]) {
        currentPairs[pairIdx] = {
          ...currentPairs[pairIdx],
          allocatedPreOrderId: undefined,
          allocatedPreOrderNumber: undefined,
          allocatedCustomerName: undefined,
        };
        target.imeiPairs = currentPairs;
        copy[itemIdx] = target;
      }
      return copy;
    });
  };

  // Link line item (for non-serialized item) to pre-order
  const handleToggleItemPreOrderAllocation = (itemIdx: number, preOrder: PreOrder | null) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[itemIdx] };
      target.allocatedPreOrderId = preOrder ? preOrder.id : undefined;
      target.allocatedPreOrderNumber = preOrder ? preOrder.preOrderNumber : undefined;
      target.allocatedCustomerName = preOrder ? preOrder.customerName : undefined;
      copy[itemIdx] = target;
      return copy;
    });
  };

  // Remove IMEI Pair from an item
  const handleRemoveImeiFromItem = (itemIdx: number, imeiPairIdx: number) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[itemIdx] };
      const currentPairs = target.imeiPairs ? [...target.imeiPairs] : [];
      const updatedPairs = currentPairs.filter((_, idx) => idx !== imeiPairIdx);
      target.imeiPairs = updatedPairs;
      target.imeiList = updatedPairs.map(p => p.imei1);
      copy[itemIdx] = target;
      return copy;
    });
  };

  // Generate test IMEIs for remaining un-serialized units
  const handleAutoGenerateMissingImeis = (itemIdx: number) => {
    setItems(prev => {
      const copy = [...prev];
      const target = { ...copy[itemIdx] };
      const currentPairs = target.imeiPairs ? [...target.imeiPairs] : [];
      const needed = Math.max(0, target.quantity - currentPairs.length);

      const generated: ImeiPair[] = [];
      for (let i = 0; i < needed; i++) {
        const randImei1 = `86${Math.floor(1000000000000 + Math.random() * 9000000000000)}`;
        const randImei2 = target.dualImei ? `86${Math.floor(1000000000000 + Math.random() * 9000000000000)}` : undefined;
        generated.push({ imei1: randImei1, imei2: randImei2 });
      }

      const updatedPairs = [...currentPairs, ...generated];
      target.imeiPairs = updatedPairs;
      target.imeiList = updatedPairs.map(p => p.imei1);
      copy[itemIdx] = target;
      return copy;
    });
  };

  // Handle Box Scanner Spec applied at Receive stage
  const handleApplyBoxSpecsToItem = (specs: ExtractedBoxSpecs) => {
    if (scanningItemIdx === null) return;
    const itemIdx = scanningItemIdx;

    if (specs.imei1) {
      setItems(prev => {
        const copy = [...prev];
        const target = { ...copy[itemIdx] };
        const currentPairs = target.imeiPairs ? [...target.imeiPairs] : [];

        if (!currentPairs.some(p => p.imei1 === specs.imei1)) {
          const newPair: ImeiPair = {
            imei1: specs.imei1!,
            imei2: specs.imei2 || undefined,
          };
          const updatedPairs = [...currentPairs, newPair];
          target.imeiPairs = updatedPairs;
          target.imeiList = updatedPairs.map(p => p.imei1);

          if (updatedPairs.length > target.quantity) {
            target.quantity = updatedPairs.length;
            target.totalCost = target.quantity * target.unitCost;
          }

          copy[itemIdx] = target;
        }
        return copy;
      });
    }

    setScanningItemIdx(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) {
      alert('Access Denied: You do not have permission to receive physical goods and restock inventory (Stage 3 permission required).');
      return;
    }
    if (!isUnlocked) return;

    onConfirmReceipt({
      deliveryCharges: Number(deliveryCharges || 0),
      receivedBy: receivedBy.trim(),
      receivingNotes: receivingNotes.trim() || undefined,
      receivedDate: new Date(receivedDate).toISOString(),
      updatedItems: items,
    });
  };

  return (
    <div id="purchase-receive-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-content">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <PackageCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                  Stage 3: Receive Products & Landed Cost
                </span>
                <span className="text-xs text-slate-300 font-mono font-bold">
                  #{purchase.purchaseOrderNumber}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Physical Goods Receipt, IMEI Intake & Inventory Restock
              </h3>
            </div>
          </div>
          <button 
            id="close-receive-modal-btn"
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RBAC Permission Banner */}
        <div className={`px-6 py-3 border-b text-xs flex items-center justify-between ${
          isAuthorized 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <div className="flex items-center space-x-2">
            {isAuthorized ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              <strong>RBAC Permission Check:</strong> Current User: <strong>{currentStaffName}</strong> (Role: <span className="font-mono underline">{currentRole}</span>).
              {isAuthorized ? ' Authorized for Stage 3 Goods Intake & Stock-In.' : ' Insufficient permission (Requires Stage 3 Receive Goods permission).'}
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            isAuthorized ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
          }`}>
            {isAuthorized ? 'Access Granted' : 'Intake Restricted'}
          </span>
        </div>

        {/* Product Details Saved Feedback Banner */}
        {productDetailsSavedFeedback && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-2xs animate-fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{productDetailsSavedFeedback}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setProductDetailsSavedFeedback(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Lock Warning if not yet confirmed */}
        {!isUnlocked && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Stage Locked:</strong> This Purchase Order is currently in <strong>{(purchase.status || 'draft').toUpperCase()}</strong> status. It must first be Approved & Paid by a Manager/Owner in Stage 2 before goods can be received into inventory.
            </span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-xs">
          {/* Supplier & Approval Recap */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="text-[11px] text-slate-400 block font-bold uppercase">Supplier</span>
              <strong className="text-xs text-slate-900">{purchase.supplierName}</strong>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-bold uppercase">Approval & Payment</span>
              <span className="inline-flex items-center text-emerald-700 font-bold text-xs mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Approved & Paid ({(purchase.paymentMethod || 'cash').toUpperCase()})
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-bold uppercase">Total Units to Restock</span>
              <strong className="text-xs text-indigo-700 font-bold">{totalQuantity} units ({items.length} Line Items)</strong>
            </div>
          </div>

          {/* Stage 1 Uploaded Voucher from Supplier Reference Card */}
          <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 text-xs">Voucher from Supplier (Stage 1 Reference)</h4>
              </div>
              {purchase.supplierVoucherPhoto ? (
                <div className="flex items-center space-x-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Voucher Attached
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSupplierVoucherZoomed(!isSupplierVoucherZoomed)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium underline flex items-center space-x-0.5 cursor-pointer"
                  >
                    <span>{isSupplierVoucherZoomed ? 'Collapse' : 'Expand Voucher'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                  No Voucher Attached
                </span>
              )}
            </div>

            {purchase.supplierVoucherPhoto ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-600">
                  Warehouse staff can cross-verify physical phone models, quantities, and supplier stamps directly against the uploaded supplier voucher.
                </p>
                <div 
                  onClick={() => setIsSupplierVoucherZoomed(!isSupplierVoucherZoomed)}
                  className="rounded-xl overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer hover:opacity-95 transition-opacity"
                >
                  <img 
                    src={purchase.supplierVoucherPhoto} 
                    alt="Voucher from Supplier" 
                    className={`w-full object-contain ${isSupplierVoucherZoomed ? 'max-h-96' : 'max-h-36'}`} 
                  />
                </div>
                {purchase.supplierVoucherFileName && (
                  <div className="flex items-center space-x-1 text-[10px] text-slate-500 truncate">
                    <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{purchase.supplierVoucherFileName}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
                No supplier voucher photo was attached to this purchase order during creation.
              </div>
            )}
          </div>

          {/* 1. Item Verification & IMEI Intake Accordion */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>1. Physical Unboxing & Serial IMEI Intake</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Scan or record IMEI 1 & IMEI 2 for every phone unit being physically received into shop stock.
                </p>
              </div>
              {(() => {
                const phoneItems = items.filter((item, i) => overrideSerialized[i] !== undefined ? overrideSerialized[i] : isPhoneItem(item));
                const totalPhoneUnits = phoneItems.reduce((acc, item) => acc + item.quantity, 0);
                const loggedImeisCount = items.reduce((acc, i) => acc + (i.imeiPairs?.length || 0), 0);
                return totalPhoneUnits > 0 ? (
                  <span className="text-xs text-emerald-700 font-mono font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {loggedImeisCount} / {totalPhoneUnits} IMEIs Logged
                  </span>
                ) : (
                  <span className="text-xs text-slate-600 font-mono font-bold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                    Bulk Non-Serialized ({totalQuantity} Units)
                  </span>
                );
              })()}
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const isPhone = overrideSerialized[idx] !== undefined ? overrideSerialized[idx] : isPhoneItem(item);
                const capturedCount = item.imeiPairs?.length || 0;
                const isFullyCaptured = capturedCount >= item.quantity;
                const isExpanded = expandedItemIndex === idx;

                return (
                  <div 
                    key={idx} 
                    className={`border rounded-xl transition-all overflow-hidden ${
                      isExpanded ? 'border-emerald-300 shadow-sm bg-white' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    {/* Item Card Header */}
                    <div 
                      onClick={() => setExpandedItemIndex(isExpanded ? null : idx)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isFullyCaptured 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-xs">{item.name}</span>
                            <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold">
                              {item.brand}
                            </span>
                            {item.rom && (
                              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">
                                {item.ram && item.ram !== '-' ? `${item.ram}/` : ''}{item.rom}
                              </span>
                            )}
                            {item.color && (
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-slate-700 rounded text-[10px]">
                                {item.color}
                              </span>
                            )}
                            {item.warrantyMonths !== undefined && (
                              <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-[10px] font-semibold">
                                {item.warrantyMonths}M Warranty
                              </span>
                            )}
                            {item.condition && item.condition !== 'brand_new' && (
                              <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded text-[10px] font-semibold capitalize">
                                {item.condition.replace(/_/g, ' ')}
                              </span>
                            )}
                            {item.barcode && (
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[10px] font-mono">
                                Barcode: {item.barcode}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-3">
                            <span>Ordered Qty: <strong>{item.quantity} units</strong></span>
                            <span>Invoice Cost: <strong className="font-mono">{formatCurrency(item.unitCost, settings.currencySymbol)}</strong></span>
                            <span>Landed: <strong className="font-mono text-emerald-700">+{formatCurrency(item.unitCost + deliveryPerUnit, settings.currencySymbol)}</strong></span>
                          </div>

                          {/* Stage 3: Target Retail Price Configuration */}
                          <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center space-x-2">
                              <label htmlFor={`stage3-retail-price-${idx}`} className="text-[11px] font-bold text-slate-800 flex items-center space-x-1">
                                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Target Retail Price ({settings.currencySymbol}) *</span>
                              </label>
                              <input
                                id={`stage3-retail-price-${idx}`}
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                placeholder="0"
                                value={item.sellingPrice === 0 ? '' : item.sellingPrice}
                                onFocus={(e) => e.target.select()}
                                onClick={(e) => e.currentTarget.select()}
                                onKeyDown={(e) => {
                                  if (['e', 'E', '+', '-'].includes(e.key)) {
                                    e.preventDefault();
                                  }
                                }}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                                  setItems(prev => {
                                    const next = [...prev];
                                    next[idx] = { ...next[idx], sellingPrice: val };
                                    return next;
                                  });
                                }}
                                className="w-36 px-2.5 py-1 bg-white border border-emerald-400 focus:border-emerald-600 rounded-lg font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 outline-hidden shadow-2xs"
                              />
                            </div>

                            {item.sellingPrice > 0 && (
                              <div className="flex items-center space-x-2 text-[11px]">
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 text-[10px]">
                                  +{((((item.sellingPrice - (item.unitCost + deliveryPerUnit)) / Math.max(1, (item.unitCost + deliveryPerUnit)))) * 100).toFixed(1)}% Markup
                                </span>
                                <span className="text-slate-600">
                                  Est. Unit Profit: <strong className="font-mono text-emerald-700 font-bold">
                                    {formatCurrency(Math.max(0, item.sellingPrice - (item.unitCost + deliveryPerUnit)), settings.currencySymbol)}
                                  </strong>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2.5">
                        {/* Complete Product Details button to open NewProductModal */}
                        <button
                          type="button"
                          id={`stage3-open-product-form-btn-${idx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveProductFormItemIndex(idx);
                          }}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-300 hover:border-emerald-400 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer group"
                          title="Open product form to complete catalog specifications, warranty, barcode, description, and margins upon receiving"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform shrink-0" />
                          <span>Complete Product Details</span>
                        </button>

                        {isPhone ? (
                          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center space-x-1 ${
                              isFullyCaptured
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                            }`}>
                              {isFullyCaptured ? <Check className="w-3.5 h-3.5 mr-0.5" /> : <AlertCircle className="w-3.5 h-3.5 mr-0.5" />}
                              <span>{capturedCount} of {item.quantity} Units Serialized</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setOverrideSerialized(prev => ({ ...prev, [idx]: false }))}
                              className="text-[10px] text-slate-500 hover:text-slate-800 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 transition-colors cursor-pointer"
                              title="Switch this item to bulk non-serialized mode"
                            >
                              Bulk
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold border border-slate-200">
                              Bulk Non-Serialized
                            </span>
                            <button
                              type="button"
                              onClick={() => setOverrideSerialized(prev => ({ ...prev, [idx]: true }))}
                              className="text-[10px] text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 font-bold transition-colors cursor-pointer"
                              title="Switch this item to serialized IMEI intake mode"
                            >
                              + Track IMEIs
                            </button>
                          </div>
                        )}

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable IMEI Intake Body */}
                    {isExpanded && isPhone && (
                      <div className="p-4 border-t border-slate-200 bg-emerald-50/20 space-y-3">
                        {/* Complete product details callout bar */}
                        <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-emerald-200 text-xs">
                          <div className="flex items-center space-x-2 text-slate-700">
                            <Package className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              Catalog Specifications: <strong className="text-slate-900">{item.name}</strong> ({item.brand})
                              {item.warrantyMonths !== undefined ? ` • ${item.warrantyMonths}M Warranty` : ''}
                              {item.barcode ? ` • Barcode: ${item.barcode}` : ''}
                              {item.condition ? ` • ${item.condition.replace(/_/g, ' ')}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveProductFormItemIndex(idx)}
                            className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer ml-2 shrink-0"
                          >
                            <span>Edit in Product Form</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-800 text-xs">
                              Record Phone IMEIs for {item.name}
                            </span>
                            <label className="flex items-center space-x-1 text-[11px] text-slate-600 font-semibold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.dualImei ?? true}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setItems(prev => {
                                    const c = [...prev];
                                    c[idx] = { ...c[idx], dualImei: checked };
                                    return c;
                                  });
                                }}
                                className="w-3.5 h-3.5 text-emerald-600 rounded"
                              />
                              <span>Dual SIM (2 IMEIs)</span>
                            </label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => setScanningItemIdx(idx)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>AI Box Photo Scan</span>
                            </button>

                            {capturedCount < item.quantity && (
                              <button
                                type="button"
                                onClick={() => handleAutoGenerateMissingImeis(idx)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Fill Missing ({item.quantity - capturedCount} test IMEIs)</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Direct IMEI 1 & IMEI 2 input bar with Pre-Order Allocation */}
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                          <div className={`grid gap-2 ${item.dualImei ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                                Primary IMEI 1 (15 Digits) *
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={15}
                                placeholder="Scan barcode or type 15-digit IMEI..."
                                value={activeImei1[idx] || ''}
                                onChange={(e) => {
                                  const sanitized = e.target.value.replace(/\D/g, '').slice(0, 15);
                                  setActiveImei1(prev => ({ ...prev, [idx]: sanitized }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (!item.dualImei || !activeImei2[idx])) {
                                    e.preventDefault();
                                    handleAddImeiToItem(idx);
                                  } else if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                    e.preventDefault();
                                  }
                                }}
                                onPaste={(e) => {
                                  e.preventDefault();
                                  const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                                  setActiveImei1(prev => ({ ...prev, [idx]: paste }));
                                }}
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
                              />
                            </div>

                            {item.dualImei && (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                                  Secondary IMEI 2 (Optional)
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={15}
                                  placeholder="Secondary 15-digit IMEI 2..."
                                  value={activeImei2[idx] || ''}
                                  onChange={(e) => {
                                    const sanitized = e.target.value.replace(/\D/g, '').slice(0, 15);
                                    setActiveImei2(prev => ({ ...prev, [idx]: sanitized }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddImeiToItem(idx);
                                    } else if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                      e.preventDefault();
                                    }
                                  }}
                                  onPaste={(e) => {
                                    e.preventDefault();
                                    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                                    setActiveImei2(prev => ({ ...prev, [idx]: paste }));
                                  }}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
                                />
                              </div>
                            )}
                          </div>

                          {/* Stage 2 Late-Linking: Allocate to Pre-Order Toggle */}
                          <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center space-x-2 text-xs font-bold text-indigo-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isAllocateChecked[idx] || false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setIsAllocateChecked(prev => ({ ...prev, [idx]: checked }));
                                    if (!checked) {
                                      setSelectedPreOrderForIntake(prev => ({ ...prev, [idx]: null }));
                                    }
                                  }}
                                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                />
                                <span className="flex items-center gap-1.5">
                                  <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Allocate to Pre-Order</span>
                                </span>
                              </label>

                              {selectedPreOrderForIntake[idx] && (
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  Pre-Order Selected
                                </span>
                              )}
                            </div>

                            {/* Pre-Order Search & Select Dropdown */}
                            {isAllocateChecked[idx] && (
                              <div className="mt-2.5 p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2">
                                {!selectedPreOrderForIntake[idx] ? (
                                  <>
                                    <div className="relative">
                                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                      <input
                                        type="text"
                                        placeholder="Search Pending Pre-Orders by customer name, phone, or model..."
                                        value={preOrderSearchQueries[idx] || ''}
                                        onChange={(e) => {
                                          const q = e.target.value;
                                          setPreOrderSearchQueries(prev => ({ ...prev, [idx]: q }));
                                        }}
                                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden"
                                      />
                                    </div>

                                    {/* Matched Pre-Orders List */}
                                    <div className="max-h-36 overflow-y-auto space-y-1.5">
                                      {pendingPreOrders
                                        .filter(po => {
                                          const q = (preOrderSearchQueries[idx] || '').toLowerCase().trim();
                                          if (!q) return true;
                                          return (
                                            po.customerName.toLowerCase().includes(q) ||
                                            po.customerPhone.toLowerCase().includes(q) ||
                                            po.preOrderNumber.toLowerCase().includes(q) ||
                                            po.phoneModel.toLowerCase().includes(q)
                                          );
                                        })
                                        .map(po => {
                                          const isModelMatch = item.name.toLowerCase().includes(po.phoneModel.toLowerCase()) ||
                                            po.phoneModel.toLowerCase().includes(item.name.toLowerCase());

                                          return (
                                            <div
                                              key={po.id}
                                              onClick={() => setSelectedPreOrderForIntake(prev => ({ ...prev, [idx]: po }))}
                                              className="p-2 bg-white hover:bg-indigo-50 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer flex items-center justify-between gap-2"
                                            >
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                                                    {po.preOrderNumber}
                                                  </span>
                                                  <span className="font-bold text-xs text-slate-900">{po.customerName}</span>
                                                  <span className="font-mono text-[11px] text-slate-500">({po.customerPhone})</span>
                                                  {isModelMatch && (
                                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                                                      Spec Match
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                                                  Model: <span className="font-semibold text-slate-800">{po.phoneModel}</span>
                                                  {po.color && ` • ${po.color}`}
                                                  {(po.ram || po.rom) && ` • ${po.ram}/${po.rom}`}
                                                </div>
                                              </div>

                                              <div className="text-right shrink-0">
                                                <span className="text-[10px] text-emerald-600 font-bold block">
                                                  Deposit: {formatCurrency(po.depositAmount, settings.currencySymbol)}
                                                </span>
                                                <span className="text-[9px] text-indigo-600 font-bold underline">
                                                  Select Pre-Order
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}

                                      {pendingPreOrders.length === 0 && (
                                        <p className="text-[11px] text-slate-500 italic p-2 text-center">
                                          No pending pre-orders available to allocate.
                                        </p>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  /* Selected Pre-Order Card */
                                  <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                                        ✓
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-bold text-xs text-emerald-950">
                                            {selectedPreOrderForIntake[idx]!.customerName}
                                          </span>
                                          <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                                            {selectedPreOrderForIntake[idx]!.preOrderNumber}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-emerald-800">
                                          {selectedPreOrderForIntake[idx]!.phoneModel} ({selectedPreOrderForIntake[idx]!.color}) • Deposit: {formatCurrency(selectedPreOrderForIntake[idx]!.depositAmount, settings.currencySymbol)}
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => setSelectedPreOrderForIntake(prev => ({ ...prev, [idx]: null }))}
                                      className="text-rose-600 hover:text-rose-800 text-[11px] font-bold px-2 py-1 rounded hover:bg-rose-50 cursor-pointer"
                                    >
                                      Change
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleAddImeiToItem(idx)}
                              disabled={!(activeImei1[idx] || '').trim()}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>
                                {selectedPreOrderForIntake[idx] ? '+ Add Unit & Allocate Pre-Order' : '+ Add Phone Unit IMEI'}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Captured IMEI Cards List */}
                        {item.imeiPairs && item.imeiPairs.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                              Logged Physical Units ({item.imeiPairs.length}):
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {item.imeiPairs.map((p, pIdx) => (
                                <div 
                                  key={pIdx} 
                                  className={`p-2.5 bg-white rounded-xl border shadow-2xs flex flex-col justify-between gap-1.5 ${
                                    p.allocatedPreOrderId ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded">
                                        Unit #{pIdx + 1}
                                      </span>
                                      <span className="font-mono font-bold text-slate-800 text-[11px]">
                                        {p.imei1}
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImeiFromItem(idx, pIdx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Remove this IMEI unit"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {p.imei2 && (
                                    <span className="font-mono text-slate-500 text-[10px] block">
                                      SIM 2: {p.imei2}
                                    </span>
                                  )}

                                  {/* Pre-Order Allocated Badge or Link Button */}
                                  {p.allocatedPreOrderId ? (
                                    <div className="mt-1 pt-1.5 border-t border-emerald-100 flex items-center justify-between bg-emerald-50/70 p-1.5 rounded-lg">
                                      <div className="flex items-center gap-1 text-[10px] text-emerald-900 font-bold truncate">
                                        <Link2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span className="truncate">
                                          {p.allocatedCustomerName || 'Pre-Order'} ({p.allocatedPreOrderNumber})
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleUnlinkPreOrderFromUnit(idx, pIdx)}
                                        className="text-[9px] font-bold text-rose-600 hover:text-rose-800 underline shrink-0 cursor-pointer ml-1"
                                        title="Unlink pre-order from this unit"
                                      >
                                        Unlink
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="mt-1 pt-1 border-t border-slate-100 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => setLinkingUnitTarget({ itemIdx: idx, pairIdx: pIdx, query: '' })}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
                                      >
                                        <CalendarClock className="w-3 h-3" />
                                        <span>+ Allocate Pre-Order</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-xs">
                            No physical IMEIs scanned yet for this line item. Type IMEI above or use AI Box Photo Scan.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Non-Phone Items Pre-Order Allocation */}
                    {isExpanded && !isPhone && (
                      <div className="p-4 border-t border-slate-200 bg-slate-50/50 space-y-3">
                        {/* Complete product details callout bar */}
                        <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 text-xs">
                          <div className="flex items-center space-x-2 text-slate-700">
                            <Package className="w-4 h-4 text-slate-600 shrink-0" />
                            <span>
                              Catalog Specifications: <strong className="text-slate-900">{item.name}</strong> ({item.brand})
                              {item.category ? ` • ${item.category}` : ''}
                              {item.barcode ? ` • Barcode: ${item.barcode}` : ''}
                              {item.warrantyMonths !== undefined ? ` • ${item.warrantyMonths}M Warranty` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveProductFormItemIndex(idx)}
                            className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer ml-2 shrink-0"
                          >
                            <span>Edit in Product Form</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            Allocate Batch to Pre-Order (Optional)
                          </span>
                          {item.allocatedPreOrderId && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              Linked to {item.allocatedCustomerName}
                            </span>
                          )}
                        </div>

                        {item.allocatedPreOrderId ? (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <CalendarClock className="w-4 h-4 text-emerald-600" />
                              <div>
                                <span className="font-bold text-emerald-950">{item.allocatedCustomerName}</span>
                                <span className="text-emerald-700 ml-2 font-mono">({item.allocatedPreOrderNumber})</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleItemPreOrderAllocation(idx, null)}
                              className="text-rose-600 hover:text-rose-800 font-bold text-[11px] cursor-pointer"
                            >
                              Unlink
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const matched = pendingPreOrders.find(p => p.id === selectedId) || null;
                                handleToggleItemPreOrderAllocation(idx, matched);
                              }}
                              className="w-full sm:w-80 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                              defaultValue=""
                            >
                              <option value="" disabled>Select a Pending Customer Pre-Order to Link...</option>
                              {pendingPreOrders.map(po => (
                                <option key={po.id} value={po.id}>
                                  {po.customerName} - {po.phoneModel} (#{po.preOrderNumber})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expandable Intake Body for Bulk Non-Serialized Items */}
                    {isExpanded && !isPhone && (
                      <div className="p-4 border-t border-slate-200 bg-slate-50/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-700">
                            Bulk Stock Intake: <strong className="text-slate-900">{item.quantity} units</strong> will be added directly into inventory with retail price of <strong className="font-mono text-emerald-800 font-bold">{formatCurrency(item.sellingPrice || 0, settings.currencySymbol)}</strong>.
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                            SKU: {item.sku || 'Auto-generated'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Delivery Charges & Landed Cost Computation */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 via-teal-50/30 to-slate-50 rounded-xl border border-emerald-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    2. Specific Delivery & Landed Freight Charges
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Log gate cargo fees, express courier, or transport charges added to inventory valuation
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-bold">Apportioned Fee</span>
                <span className="text-xs font-mono font-bold text-emerald-700">
                  +{formatCurrency(deliveryPerUnit, settings.currencySymbol)} / unit
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-emerald-200/60">
              <div>
                <label className="block font-bold text-slate-800 text-xs mb-1">
                  Delivery / Cargo Fee ({settings.currencySymbol}) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="delivery-charges-input"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={deliveryCharges === 0 ? '' : deliveryCharges}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDeliveryCharges(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                    }}
                    className="w-full pl-3 pr-12 py-2 border border-emerald-300 rounded-xl bg-white font-mono font-bold text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-hidden shadow-xs"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">
                    {settings.currencySymbol}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Delivery costs are logged separately as operational expenses and do not alter the Stage 1 selling price or supplier unit cost.
                </p>
                <p className="text-[10px] text-teal-800 bg-teal-50/80 p-1.5 rounded-md border border-teal-200 mt-1.5 flex items-center gap-1.5 font-semibold">
                  <Truck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Auto-Expense: Delivery charges automatically save under <strong>Shop Expenses &gt; Transport &amp; Stock Delivery</strong> with date.</span>
                </p>
              </div>

              {/* Landed Cost Breakdown Box */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs shadow-2xs">
                <div className="flex justify-between text-slate-600">
                  <span>Product Invoice Subtotal:</span>
                  <span className="font-mono font-bold">{formatCurrency(baseSubtotal, settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>+ Delivery Charges:</span>
                  <span className="font-mono">+{formatCurrency(Number(deliveryCharges || 0), settings.currencySymbol)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold">
                  <span className="text-slate-900">Total Purchase Invoice:</span>
                  <span className="text-sm font-extrabold text-emerald-700 font-mono">
                    {formatCurrency(totalLandedCost, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Receiving Metadata & Staff Sign-off */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-800 text-xs mb-1">
                Received By (Storekeeper / Staff) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden bg-white font-medium"
                placeholder="Staff name"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-800 text-xs mb-1">
                Receipt Date
              </label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden bg-white"
              />
            </div>
          </div>

          {/* 4. Receiving & Inspection Notes */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800 text-xs">
              Inspection Notes / Box Condition (Optional)
            </label>
            <input
              type="text"
              value={receivingNotes}
              onChange={(e) => setReceivingNotes(e.target.value)}
              placeholder="e.g. All cartons received sealed. Serial numbers verified against supplier invoice."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden bg-white"
            />
          </div>

          {/* Late-Linking Pre-Order Summary Notice */}
          {totalAllocatedUnitsCount > 0 && (
            <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-indigo-50 border border-emerald-300 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-emerald-950 block">
                    {totalAllocatedUnitsCount} Physical Unit(s) Allocated to Pre-Orders (Late-Linking Stage 2)
                  </span>
                  <p className="text-emerald-800 text-[11px]">
                    Confirming receipt binds IMEI serials to pending orders and auto-transitions them to <strong>"Stock Arrived"</strong> for instant POS checkout.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-600 text-white shrink-0 shadow-2xs">
                Ready for POS Fulfillment
              </span>
            </div>
          )}

          {/* Acknowledge Checkbox */}
          <label className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={inspectionAcknowledged}
              onChange={(e) => setInspectionAcknowledged(e.target.checked)}
              className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-slate-700 text-xs leading-relaxed">
              I certify that physical goods and serialized IMEIs have been checked, quantities match the delivery, and stock should immediately be <strong>credited to live shop inventory</strong> with the Stage 1 supplier unit cost and selling price.
            </span>
          </label>
        </form>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              id="export-grn-pdf-modal-btn"
              onClick={() => {
                const calculatedLanded = (purchase.grandTotal || purchase.subtotal) + Number(deliveryCharges || 0);
                const tempPurchase: PurchaseRecord = {
                  ...purchase,
                  items: items,
                  deliveryCharges: Number(deliveryCharges || 0),
                  shippingFee: purchase.shippingFee || 0,
                  totalLandedCost: calculatedLanded,
                  receivedBy: receivedBy || currentStaffName || 'Staff',
                  receivingNotes,
                  receivedAt: receivedDate,
                };
                exportGoodsReceiptNotePdf(tempPurchase, settings, {
                  deliveryCharges: Number(deliveryCharges || 0),
                  receivedBy: receivedBy || currentStaffName || 'Staff',
                  receivingNotes,
                  receivedDate,
                });
              }}
              className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-300 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Export Stage 3 Official Goods Receipt Note (GRN) & Serialized Intake PDF"
            >
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              <span>Export GRN PDF</span>
            </button>

            {onRevertStage && (
              <button
                type="button"
                onClick={() => onRevertStage('confirmed')}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                title="Revert back to Confirmed / Payment stage"
              >
                ⬅ Revert to Stage 2
              </button>
            )}
          </div>

          <button
            type="button"
            id="confirm-goods-receipt-btn"
            disabled={!isAuthorized || !isUnlocked || !inspectionAcknowledged}
            onClick={handleSubmit}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 shadow-sm transition-all ${
              isAuthorized && isUnlocked && inspectionAcknowledged
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/20 active:scale-98 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isAuthorized ? (
              <>
                <PackageCheck className="w-4 h-4" />
                <span>Confirm Receipt & Update Inventory ({totalQuantity} Units)</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Receive Permission Required</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal for Linking an already captured IMEI unit to a pre-order */}
      {linkingUnitTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Allocate Unit to Pending Pre-Order</h4>
                  <p className="text-[11px] text-slate-500">
                    Unit IMEI: <span className="font-mono font-bold text-slate-800">{items[linkingUnitTarget.itemIdx]?.imeiPairs?.[linkingUnitTarget.pairIdx]?.imei1}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinkingUnitTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                autoFocus
                placeholder="Search pending pre-orders by customer or model..."
                value={linkingUnitTarget.query}
                onChange={(e) => setLinkingUnitTarget(prev => prev ? { ...prev, query: e.target.value } : null)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {pendingPreOrders
                .filter(po => {
                  const q = linkingUnitTarget.query.toLowerCase().trim();
                  if (!q) return true;
                  return (
                    po.customerName.toLowerCase().includes(q) ||
                    po.customerPhone.toLowerCase().includes(q) ||
                    po.preOrderNumber.toLowerCase().includes(q) ||
                    po.phoneModel.toLowerCase().includes(q)
                  );
                })
                .map(po => (
                  <div
                    key={po.id}
                    onClick={() => handleLinkPreOrderToUnit(linkingUnitTarget.itemIdx, linkingUnitTarget.pairIdx, po)}
                    className="p-3 bg-white hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                          {po.preOrderNumber}
                        </span>
                        <span className="font-bold text-xs text-slate-900">{po.customerName}</span>
                        <span className="font-mono text-[11px] text-slate-500">({po.customerPhone})</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        Requested: <span className="font-semibold text-slate-800">{po.phoneModel}</span>
                        {po.color && ` • ${po.color}`}
                        {(po.ram || po.rom) && ` • ${po.ram}/${po.rom}`}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-emerald-600 font-bold block">
                        Deposit: {formatCurrency(po.depositAmount, settings.currencySymbol)}
                      </span>
                      <button
                        type="button"
                        className="mt-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg shadow-2xs"
                      >
                        Link Unit
                      </button>
                    </div>
                  </div>
                ))}

              {pendingPreOrders.length === 0 && (
                <p className="text-xs text-slate-500 italic text-center py-6">
                  No pending pre-orders found.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLinkingUnitTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Box Scanner Modal */}
      {scanningItemIdx !== null && (
        <BoxScannerModal
          isOpen={true}
          onClose={() => setScanningItemIdx(null)}
          onApplySpecs={handleApplyBoxSpecsToItem}
        />
      )}

      {/* Product Form Modal to Complete / Edit Product Details Upon Receiving */}
      {activeProductFormItemIndex !== null && productForModal && (
        <NewProductModal
          settings={settings}
          editingProduct={productForModal}
          products={catalogProducts}
          zIndexClass="z-[70]"
          modalTitle={`Complete Product Details: ${items[activeProductFormItemIndex]?.name || 'Item'}`}
          modalSubtitle="Specify warranty, barcode, category, condition, specs, and retail margins for this received product"
          onClose={() => setActiveProductFormItemIndex(null)}
          onSave={handleSaveProductFromModal}
        />
      )}
    </div>
  );
};
