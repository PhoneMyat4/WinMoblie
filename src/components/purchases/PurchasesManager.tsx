import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Calendar, 
  DollarSign, 
  Package, 
  Building, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Printer, 
  X, 
  Trash2, 
  Hash,
  Barcode,
  Smartphone,
  Check,
  Sparkles,
  Camera,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  PackageCheck,
  Layers,
  Lock,
  Eye,
  Send,
  UserCheck,
  Tag,
  Filter,
  RefreshCw,
  Edit3,
  RotateCcw,
  ChevronRight,
  TrendingUp,
  Percent,
  CalendarClock,
  FileSpreadsheet,
  Boxes,
  Link2,
  FileDown,
  Download,
  ChevronDown,
  Upload,
  Image as ImageIcon,
  Paperclip,
  ExternalLink
} from 'lucide-react';
import { 
  Product, 
  ProductCategory, 
  DeviceCondition, 
  PurchaseRecord, 
  PurchaseItem, 
  PurchaseOrderStatus,
  Supplier, 
  PaymentMethod, 
  ShopSettings, 
  ImeiPair,
  StaffRole,
  StaffUser,
  RolePermissions,
  PreOrder
} from '../../types';
import { getEffectiveUserPermissions } from '../../utils/permissionUtils';
import { formatCurrency, formatDate, formatDateTime, formatImei, getPaymentMethodInfo, getCategoryLabel } from '../../utils/formatters';
import { compressImageToBase64 } from '../../utils/imageCompression';
import { 
  exportPurchaseOrderPdf, 
  exportPurchasePaymentVoucherPdf, 
  exportGoodsReceiptNotePdf, 
  exportPurchaseFullDossierPdf,
  exportPurchasesRegisterPdf 
} from '../../utils/purchasePdfExport';
import { 
  findExactVariantMatch, 
  findSisterVariants, 
  generateVariantSku, 
  formatVariantSpecsSummary,
  extractNormalizedRam,
  extractNormalizedRom,
  normalizeVariantText
} from '../../utils/variantUtils';
import { BoxScannerModal } from '../modals/BoxScannerModal';
import { PreOrderPickerModal } from '../modals/PreOrderPickerModal';
import { ExtractedBoxSpecs } from '../../utils/boxScannerService';
import { PurchasePaymentModal } from './PurchasePaymentModal';
import { PurchaseReceiveModal } from './PurchaseReceiveModal';
import { PurchaseWorkflowDetailModal } from './PurchaseWorkflowDetailModal';
import { StorageService } from '../../utils/storage';
import {
  CANONICAL_CATEGORIES,
  canonicalCategory,
  isPhoneCategory,
  getSubCategoriesForCategory,
  getBrandsForCategory,
  getModelsForBrand,
  getColorsForModel
} from '../../data/categoryTaxonomy';

const RAM_PRESETS = ['-', '4GB', '6GB', '8GB', '12GB', '14GB', '16GB', '18GB', '24GB'];
const ROM_PRESETS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

const CONDITIONS: { value: DeviceCondition; label: string; desc: string; badge: string }[] = [
  { value: 'brand_new', label: 'Brand New', desc: 'Box Pack', badge: 'bg-emerald-100 text-emerald-800' },
  { value: 'used_grade_a_plus', label: 'Used - Grade A+', desc: 'Like New (99%)', badge: 'bg-blue-100 text-blue-800' },
  { value: 'used_grade_a', label: 'Used - Grade A', desc: 'Minor Wear (95%)', badge: 'bg-cyan-100 text-cyan-800' },
  { value: 'used_grade_b', label: 'Used - Grade B', desc: 'Visible Scratches (90%)', badge: 'bg-amber-100 text-amber-800' },
  { value: 'used_grade_c', label: 'Used - Grade C', desc: 'Heavy Wear (80%)', badge: 'bg-rose-100 text-rose-800' },
];

interface PurchasesManagerProps {
  purchases: PurchaseRecord[];
  products: Product[];
  suppliers: Supplier[];
  settings: ShopSettings;
  preOrders?: PreOrder[];
  currentStaffUser?: StaffUser;
  staffUsers?: StaffUser[];
  rolePermissions?: Record<StaffRole, RolePermissions>;
  onSavePurchase: (purchase: PurchaseRecord) => void;
  onSaveSupplier: (supplier: Supplier) => void;
}

export const PurchasesManager: React.FC<PurchasesManagerProps> = ({
  purchases: initialPurchases,
  products,
  suppliers,
  settings,
  preOrders: propPreOrders,
  currentStaffUser,
  staffUsers,
  rolePermissions: propRolePermissions,
  onSavePurchase,
  onSaveSupplier,
}) => {
  // Sync state with storage
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(initialPurchases);
  const [preOrdersList, setPreOrdersList] = useState<PreOrder[]>(propPreOrders || StorageService.getPreOrders());

  // Update local state whenever parent purchases or preOrders changes
  React.useEffect(() => {
    setPurchases(initialPurchases);
  }, [initialPurchases]);

  React.useEffect(() => {
    if (propPreOrders) {
      setPreOrdersList(propPreOrders);
    } else {
      setPreOrdersList(StorageService.getPreOrders());
    }
  }, [propPreOrders]);

  // Active Simulated Staff Role (defaults to currentStaffUser?.role || settings.currentStaffRole)
  const [activeRole, setActiveRole] = useState<StaffRole>(currentStaffUser?.role || settings.currentStaffRole || 'Cashier');
  const [activeStaffName, setActiveStaffName] = useState<string>(currentStaffUser?.name || settings.currentStaffName || 'Ma Su Su');

  // Keep simulated active role aligned if logged-in staff user changes
  React.useEffect(() => {
    if (currentStaffUser) {
      setActiveRole(currentStaffUser.role);
      setActiveStaffName(currentStaffUser.name);
    }
  }, [currentStaffUser]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  
  // Modals state
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [workflowPurchase, setWorkflowPurchase] = useState<PurchaseRecord | null>(null);
  const [paymentModalPurchase, setPaymentModalPurchase] = useState<PurchaseRecord | null>(null);
  const [receiveModalPurchase, setReceiveModalPurchase] = useState<PurchaseRecord | null>(null);

  // Form state inside New Purchase Modal (Draft Stage)
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [supplierName, setSupplierName] = useState<string>(suppliers[0]?.name || '');
  const [supplierPhone, setSupplierPhone] = useState<string>(suppliers[0]?.phone || '');
  const [refInvoiceNo, setRefInvoiceNo] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('kbz');
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  
  // Stage 1 Supplier Voucher Photo State (Visible in Stage 2 and Stage 3)
  const [supplierVoucherPhoto, setSupplierVoucherPhoto] = useState<string | null>(null);
  const [supplierVoucherFileName, setSupplierVoucherFileName] = useState<string>('');
  const [isVoucherZoomed, setIsVoucherZoomed] = useState<boolean>(false);
  
  // Cart of items in draft PO
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  
  // Item entry sub-form (exact match to NewProductModal)
  const [selectedExistingProdId, setSelectedExistingProdId] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [itemBrand, setItemBrand] = useState<string>('');
  const [itemModel, setItemModel] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<ProductCategory>('brand_new_phones');
  const [itemSubCategory, setItemSubCategory] = useState<string>('');
  const [itemCondition, setItemCondition] = useState<DeviceCondition>('brand_new');
  const [itemRam, setItemRam] = useState<string>('-');
  const [itemRom, setItemRom] = useState<string>('128GB');
  const [itemColor, setItemColor] = useState<string>('Black');
  const [itemBatteryHealth, setItemBatteryHealth] = useState<number>(100);
  const [itemBarcode, setItemBarcode] = useState<string>(`${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  const [itemSku, setItemSku] = useState<string>(`SKU-${Date.now().toString().slice(-6)}`);
  const [itemWarrantyMonths, setItemWarrantyMonths] = useState<number>(12);
  const [itemMinStockAlert, setItemMinStockAlert] = useState<number>(0);
  const [itemDescription, setItemDescription] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemUnitCost, setItemUnitCost] = useState<number>(0);
  const [itemSellingPrice, setItemSellingPrice] = useState<number>(0);

  // Phone IMEI pairs & dual SIM state
  const isPhone = isPhoneCategory(itemCategory);
  const [itemDualImei, setItemDualImei] = useState<boolean>(true);
  const [itemImeiPairs, setItemImeiPairs] = useState<ImeiPair[]>([]);
  const [newImei1Input, setNewImei1Input] = useState<string>('');
  const [newImei2Input, setNewImei2Input] = useState<string>('');
  const [isBoxScannerOpen, setIsBoxScannerOpen] = useState<boolean>(false);
  const [isPreOrderPickerOpen, setIsPreOrderPickerOpen] = useState<boolean>(false);
  const [activeImportedPreOrder, setActiveImportedPreOrder] = useState<PreOrder | null>(null);
  const [openRowPdfMenuId, setOpenRowPdfMenuId] = useState<string | null>(null);
  const [isItemModelDropdownOpen, setIsItemModelDropdownOpen] = useState<boolean>(false);
  const itemModelInputRef = useRef<HTMLInputElement>(null);
  const itemModelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        itemModelDropdownRef.current &&
        !itemModelDropdownRef.current.contains(e.target as Node) &&
        itemModelInputRef.current &&
        !itemModelInputRef.current.contains(e.target as Node)
      ) {
        setIsItemModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pre-Orders pending count helper
  const pendingPreOrdersCount = useMemo(() => {
    return preOrdersList.filter(o => o.status === 'Pending').length;
  }, [preOrdersList]);

  // Active Staff User for permission resolution
  const activeStaffObj = useMemo<StaffUser>(() => {
    if (currentStaffUser && (currentStaffUser.role === activeRole || currentStaffUser.name === activeStaffName || currentStaffUser.id === settings.currentStaffId)) {
      return currentStaffUser;
    }
    const matchingStaff = staffUsers?.find(u => u.role === activeRole && u.name === activeStaffName)
      || staffUsers?.find(u => u.role === activeRole);
    if (matchingStaff) return matchingStaff;

    return {
      id: `sim-${activeRole.toLowerCase()}`,
      username: activeRole.toLowerCase(),
      name: activeStaffName,
      role: activeRole,
      phone: '09-12345678',
      pin: '1234',
      active: true,
    };
  }, [currentStaffUser, staffUsers, activeRole, activeStaffName, settings.currentStaffId]);

  // Derived effective permissions from matrix + custom overrides
  const effectivePermissions = useMemo<RolePermissions>(() => {
    const matrix = propRolePermissions || StorageService.getRolePermissions();
    return getEffectiveUserPermissions(activeStaffObj, matrix);
  }, [activeStaffObj, propRolePermissions]);

  // Granular purchase permissions
  const canManageDrafts = Boolean(effectivePermissions.canManagePurchases);
  const canApprovePurchases = Boolean(effectivePermissions.canApprovePurchases ?? (activeRole === 'Owner' || activeRole === 'Manager'));
  const canReceivePurchases = Boolean(effectivePermissions.canReceivePurchases ?? (activeRole === 'Owner' || activeRole === 'Manager' || activeRole === 'Inventory_Staff'));
  const isManagerOrOwner = canApprovePurchases;

  // Available Subcategories strictly for itemCategory (Level 2)
  const availableSubCategories = useMemo(() => {
    const subSet = new Set<string>();
    const taxSubs = getSubCategoriesForCategory(itemCategory);
    taxSubs.forEach(s => subSet.add(s));

    products.forEach(p => {
      if (canonicalCategory(p.category) === itemCategory && p.subCategory && p.subCategory.trim()) {
        subSet.add(p.subCategory.trim());
      }
    });

    return Array.from(subSet).sort((a, b) => a.localeCompare(b));
  }, [itemCategory, products]);

  // Available Brands strictly isolated to current category and subcategory
  // Data Hierarchy: Category (Parent above all) -> Subcategory (Child of Category, Sub-Parent of Brand) -> Brand
  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();

    // 1. Taxonomy brands strictly for this Category and optional Subcategory (guarantees zero category leakage)
    const taxBrands = getBrandsForCategory(itemCategory, itemSubCategory);
    taxBrands.forEach(b => brandSet.add(b));
    if (brandSet.size === 0) {
      getBrandsForCategory(itemCategory).forEach(b => brandSet.add(b));
    }

    // 2. Catalog products: STRICTLY filter by parent Category!
    // Cookware, accessories, sim cards, etc. can NEVER leak into phone categories or vice-versa.
    // Even if a product didn't have a subcategory chosen when registered, it strictly belongs to its parent Category.
    products.forEach((p) => {
      if (canonicalCategory(p.category) === canonicalCategory(itemCategory)) {
        if (!itemSubCategory || !p.subCategory || p.subCategory.trim().toLowerCase() === itemSubCategory.trim().toLowerCase()) {
          if (p.brand && p.brand.trim()) {
            brandSet.add(p.brand.trim());
          }
        }
      }
    });

    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [itemCategory, itemSubCategory, products]);

  // Existing catalog products strictly isolated to current brand under parent Category
  const existingBrandProducts = useMemo(() => {
    const cleanBrand = itemBrand ? itemBrand.trim().toLowerCase() : '';
    return products.filter((p) => {
      // Level 1: Category MUST match (Parent Category above all)
      if (canonicalCategory(p.category) !== canonicalCategory(itemCategory)) {
        return false;
      }
      // Level 2: If Subcategory is specified, match subcategory or products registered without a subcategory
      if (itemSubCategory && p.subCategory && p.subCategory.trim().toLowerCase() !== itemSubCategory.trim().toLowerCase()) {
        return false;
      }
      // Level 3: If Brand is specified, strictly match brand
      if (cleanBrand && (!p.brand || p.brand.trim().toLowerCase() !== cleanBrand)) {
        return false;
      }
      return true;
    });
  }, [itemBrand, itemCategory, itemSubCategory, products]);

  // Available Models strictly isolated to existing catalog items under current brand
  const availableModels = useMemo(() => {
    const modelSet = new Set<string>();
    existingBrandProducts.forEach((p) => {
      if (p.model && p.model.trim()) modelSet.add(p.model.trim());
      else if (p.name && p.name.trim()) modelSet.add(p.name.trim());
    });

    return Array.from(modelSet).sort((a, b) => a.localeCompare(b));
  }, [existingBrandProducts]);

  // Filtered existing products suggestions for the search box
  const filteredExistingProducts = useMemo(() => {
    if (!itemName || !itemName.trim()) {
      return existingBrandProducts;
    }
    const q = itemName.toLowerCase().trim();
    return existingBrandProducts.filter(p => {
      const matchName = p.name && p.name.toLowerCase().includes(q);
      const matchModel = p.model && p.model.toLowerCase().includes(q);
      const matchBarcode = p.barcode && p.barcode.includes(q);
      const matchSku = p.sku && p.sku.toLowerCase().includes(q);
      const matchRom = (p.rom || p.storage || '').toLowerCase().includes(q);
      const matchColor = (p.color || '').toLowerCase().includes(q);
      return matchName || matchModel || matchBarcode || matchSku || matchRom || matchColor;
    });
  }, [existingBrandProducts, itemName]);

  // Filtered model name suggestions for backwards compatibility
  const filteredItemModelSuggestions = useMemo(() => {
    if (!itemName || !itemName.trim()) {
      return availableModels;
    }
    const q = itemName.toLowerCase().trim();
    return availableModels.filter(m => m.toLowerCase().includes(q));
  }, [availableModels, itemName]);

  // Available Colors strictly isolated to current category, brand, and model
  const availableColors = useMemo(() => {
    const colorSet = new Set<string>();
    const taxColors = getColorsForModel(itemCategory, itemBrand, itemModel || itemName);
    taxColors.forEach(c => colorSet.add(c));

    products.forEach((p) => {
      if (canonicalCategory(p.category) === itemCategory) {
        if (itemBrand && p.brand && p.brand.toLowerCase() === itemBrand.toLowerCase()) {
          const matchModel = (p.model || p.name || '').toLowerCase();
          const target = (itemModel || itemName || '').toLowerCase();
          if (target && (matchModel.includes(target) || target.includes(matchModel))) {
            if (p.color && p.color.trim()) colorSet.add(p.color.trim());
          }
        }
      }
    });

    return Array.from(colorSet).sort((a, b) => a.localeCompare(b));
  }, [itemCategory, itemBrand, itemModel, itemName, products]);

  // Registered product names filtered strictly by category
  const registeredProductNames = useMemo(() => {
    const nameSet = new Set<string>();
    availableModels.forEach(m => nameSet.add(m));

    products.forEach((p) => {
      if (canonicalCategory(p.category) === itemCategory) {
        if (!itemBrand || (p.brand && p.brand.toLowerCase() === itemBrand.toLowerCase())) {
          if (p.name && p.name.trim()) nameSet.add(p.name.trim());
        }
      }
    });
    return Array.from(nameSet).sort((a, b) => a.localeCompare(b));
  }, [availableModels, products, itemCategory, itemBrand]);

  // Category Change Handler: resets fields when switching to another category
  const handleCategoryChange = (newCat: ProductCategory) => {
    setItemCategory(newCat);
    setItemSubCategory('');
    setItemBrand('');
    setItemModel('');
    setItemName('');
    setItemColor('');
    setSelectedExistingProdId('');
  };

  // Subcategory Change Handler (create-able and search-able text box)
  const handleSubCategoryChange = (newSub: string) => {
    setItemSubCategory(newSub);
    // If brand is set, check if brand is valid under new subcategory
    if (itemBrand && newSub && newSub.trim()) {
      const validBrandsForSub = getBrandsForCategory(itemCategory, newSub);
      const hasCatalogProduct = products.some(
        p => canonicalCategory(p.category) === canonicalCategory(itemCategory) &&
             p.brand && p.brand.trim().toLowerCase() === itemBrand.trim().toLowerCase() &&
             (!p.subCategory || p.subCategory.trim().toLowerCase() === newSub.trim().toLowerCase())
      );
      if (validBrandsForSub.length > 0 && !validBrandsForSub.some(b => b.toLowerCase() === itemBrand.trim().toLowerCase()) && !hasCatalogProduct) {
        setItemBrand('');
        setItemModel('');
        setItemName('');
        setSelectedExistingProdId('');
      }
    }
  };

  // Brand Change Handler (create-able and search-able text box)
  const handleBrandChange = (newBrand: string) => {
    setItemBrand(newBrand);
    if (selectedExistingProdId) {
      const existing = products.find(p => p.id === selectedExistingProdId);
      if (existing && existing.brand.toLowerCase() !== newBrand.trim().toLowerCase()) {
        setSelectedExistingProdId('');
      }
    }
  };

  // Handler: Level 4 Model Select
  const handleModelSelect = (selectedModelName: string) => {
    setItemModel(selectedModelName);
    const cleanBrand = itemBrand.trim().toLowerCase();
    const cleanModel = selectedModelName.trim().toLowerCase();

    // Check if an existing product in catalog matches this model under current brand and parent category
    const matchedExisting = products.find(p => {
      const matchCat = canonicalCategory(p.category) === canonicalCategory(itemCategory);
      const matchBrand = !cleanBrand || (p.brand && p.brand.trim().toLowerCase() === cleanBrand);
      const matchModelName = p.name.trim().toLowerCase() === cleanModel ||
                             (p.model && p.model.trim().toLowerCase() === cleanModel);
      return matchCat && matchBrand && matchModelName;
    });

    if (matchedExisting) {
      handleSelectExistingProduct(matchedExisting.id);
      return;
    }

    // If new model not in catalog, do not arbitrarily prepend brand if already present
    setSelectedExistingProdId('');
    setItemName(selectedModelName);

    const colors = getColorsForModel(itemCategory, itemBrand, selectedModelName);
    if (colors.length > 0 && (!itemColor || itemColor === 'Black')) {
      setItemColor(colors[0]);
    }
  };

  // Variant matching state
  const currentFormSpecs = useMemo(() => ({
    name: itemName,
    brand: itemBrand,
    category: itemCategory,
    subCategory: itemSubCategory,
    condition: itemCondition,
    ram: isPhone ? itemRam : undefined,
    rom: isPhone ? itemRom : undefined,
    color: isPhone ? itemColor : undefined,
  }), [itemName, itemBrand, itemCategory, itemSubCategory, itemCondition, itemRam, itemRom, itemColor, isPhone]);

  const matchedExactVariant = useMemo(() => {
    if (selectedExistingProdId) {
      const found = products.find(p => p.id === selectedExistingProdId);
      if (found) return found;
    }
    return findExactVariantMatch(products, currentFormSpecs);
  }, [selectedExistingProdId, products, currentFormSpecs]);

  const sisterVariants = useMemo(() => {
    if (!itemName.trim()) return [];
    return findSisterVariants(products, itemName, itemBrand);
  }, [products, itemName, itemBrand]);

  // Apply AI Box Scanner Specs
  const handleApplyBoxSpecs = (specs: ExtractedBoxSpecs) => {
    setSelectedExistingProdId('');
    if (specs.brand) setItemBrand(specs.brand);
    if (specs.model) {
      const trimmedModel = specs.model.trim();
      const trimmedBrand = (specs.brand || itemBrand).trim();
      const formattedName = trimmedBrand && !trimmedModel.toLowerCase().startsWith(trimmedBrand.toLowerCase())
        ? `${trimmedBrand} ${trimmedModel}`
        : trimmedModel;
      setItemName(formattedName);
    }
    if (specs.color) setItemColor(specs.color);
    if (specs.ram && specs.ram !== '-') {
      const normRam = extractNormalizedRam(specs.ram) || specs.ram;
      setItemRam(normRam);
    }
    if (specs.rom) {
      const normRom = extractNormalizedRom(specs.rom) || specs.rom;
      setItemRom(normRom);
    }
    if (specs.barcode) {
      setItemBarcode(specs.barcode);
    }
    if (specs.imei1) {
      const newPair: ImeiPair = {
        imei1: specs.imei1,
        imei2: specs.imei2 || undefined,
      };
      setItemImeiPairs((prev) => {
        const exists = prev.some((p) => p.imei1 === specs.imei1);
        if (exists) return prev;
        const updated = [...prev, newPair];
        setItemQty(updated.length);
        return updated;
      });
    }

    const freshSku = generateVariantSku(
      specs.brand || itemBrand,
      specs.model || itemName,
      specs.ram && specs.ram !== '-' ? specs.ram : undefined,
      specs.rom || itemRom,
      specs.color || itemColor
    );
    setItemSku(freshSku);
  };

  // Draw & Import Pre-Order Specifications into PO Item
  const handleImportPreOrderSpecs = (order: PreOrder) => {
    setSelectedExistingProdId('');
    setItemName(order.phoneModel);
    if (order.brand) {
      setItemBrand(order.brand);
    } else {
      // Auto-detect brand
      const trimmed = order.phoneModel.trim();
      const detectedBrand = availableBrands.find(
        (b) =>
          trimmed.toLowerCase().startsWith(b.toLowerCase() + ' ') ||
          trimmed.toLowerCase() === b.toLowerCase()
      );
      if (detectedBrand) setItemBrand(detectedBrand);
    }
    
    setItemCategory('brand_new_phones');
    setItemCondition('brand_new');
    if (order.color) setItemColor(order.color);
    if (order.ram && order.ram !== '-') {
      const normRam = extractNormalizedRam(order.ram) || order.ram;
      setItemRam(normRam);
    }
    if (order.rom) {
      const normRom = extractNormalizedRom(order.rom) || order.rom;
      setItemRom(normRom);
    }

    const orderQty = Math.max(1, order.quantity || 1);
    setItemQty(orderQty);

    const unitSelling = order.unitPrice || Math.round(order.fullPrice / orderQty);
    setItemSellingPrice(unitSelling);

    // Approximate unit cost (e.g. 85% of selling price) if current cost is empty
    const estimatedCost = Math.round((unitSelling * 0.85) / 1000) * 1000;
    setItemUnitCost(estimatedCost > 0 ? estimatedCost : 0);

    setItemDescription(`Pre-Order #${order.preOrderNumber} for ${order.customerName} (${order.customerPhone})`);
    
    if (order.allocatedBarcode) {
      setItemBarcode(order.allocatedBarcode);
    }

    const freshSku = generateVariantSku(
      order.brand || itemBrand,
      order.phoneModel,
      order.ram && order.ram !== '-' ? order.ram : undefined,
      order.rom,
      order.color
    );
    setItemSku(freshSku);

    setActiveImportedPreOrder(order);
  };

  const handleSupplierSelect = (id: string) => {
    setSupplierId(id);
    const supp = suppliers.find(s => s.id === id);
    if (supp) {
      setSupplierName(supp.name);
      setSupplierPhone(supp.phone || '');
    }
  };

  const handleNameChange = (val: string) => {
    setItemName(val);
    setItemModel(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setSelectedExistingProdId('');
      return;
    }

    // Auto-detect brand from name prefix
    const detectedBrand = availableBrands.find(
      (b) =>
        trimmed.toLowerCase().startsWith(b.toLowerCase() + ' ') ||
        trimmed.toLowerCase() === b.toLowerCase()
    );
    if (detectedBrand && !itemBrand) {
      setItemBrand(detectedBrand);
    } else if (
      !itemBrand &&
      (trimmed.toLowerCase().startsWith('iphone') ||
       trimmed.toLowerCase().startsWith('ipad') ||
       trimmed.toLowerCase().startsWith('macbook') ||
       trimmed.toLowerCase().startsWith('airpods'))
    ) {
      setItemBrand('Apple');
    }

    // Check if the typed value exactly matches an existing product in the catalog under this category
    const effectiveBrand = (detectedBrand || itemBrand || '').trim().toLowerCase();
    const exactMatch = products.find(p => {
      const catMatch = canonicalCategory(p.category) === canonicalCategory(itemCategory);
      const brandMatch = !effectiveBrand || (p.brand && p.brand.trim().toLowerCase() === effectiveBrand);
      const nameMatch = p.name.trim().toLowerCase() === trimmed.toLowerCase() ||
                        (p.model && p.model.trim().toLowerCase() === trimmed.toLowerCase());
      return catMatch && brandMatch && nameMatch;
    });

    if (exactMatch) {
      setSelectedExistingProdId(exactMatch.id);
      if (!itemBrand && exactMatch.brand) setItemBrand(exactMatch.brand);
      setItemCategory(canonicalCategory(exactMatch.category));
      if (exactMatch.subCategory) setItemSubCategory(exactMatch.subCategory);
      if (exactMatch.condition) setItemCondition(exactMatch.condition);
      if (exactMatch.ram) setItemRam(exactMatch.ram);
      if (exactMatch.rom || exactMatch.storage) setItemRom(exactMatch.rom || exactMatch.storage || '128GB');
      if (exactMatch.color) setItemColor(exactMatch.color);
      if (exactMatch.barcode) setItemBarcode(exactMatch.barcode);
      if (exactMatch.sku) setItemSku(exactMatch.sku);
      if (exactMatch.costPrice) setItemUnitCost(exactMatch.costPrice);
      if (exactMatch.sellingPrice) setItemSellingPrice(exactMatch.sellingPrice);
      if (exactMatch.warrantyMonths !== undefined) setItemWarrantyMonths(exactMatch.warrantyMonths);
      if (exactMatch.minStockAlert !== undefined) setItemMinStockAlert(exactMatch.minStockAlert);
    } else {
      setSelectedExistingProdId('');
    }
  };

  const handleSelectSisterVariant = (v: Product) => {
    setSelectedExistingProdId(v.id);
    setItemName(v.name);
    setItemModel(v.model || v.name);
    setItemBrand(v.brand || '');
    setItemCategory(canonicalCategory(v.category));
    setItemSubCategory(v.subCategory || '');
    setItemCondition(v.condition || 'brand_new');
    if (v.ram) setItemRam(v.ram);
    if (v.rom || v.storage) setItemRom(v.rom || v.storage || '128GB');
    if (v.color) setItemColor(v.color);
    if (v.barcode) setItemBarcode(v.barcode);
    if (v.sku) setItemSku(v.sku);
    if (v.costPrice) setItemUnitCost(v.costPrice);
    if (v.sellingPrice) setItemSellingPrice(v.sellingPrice);
    if (v.warrantyMonths !== undefined) setItemWarrantyMonths(v.warrantyMonths);
    if (v.minStockAlert !== undefined) setItemMinStockAlert(v.minStockAlert);
    if (v.dualImei !== undefined) setItemDualImei(v.dualImei);
  };

  const handleSelectExistingProduct = (prodId: string) => {
    setSelectedExistingProdId(prodId);
    if (!prodId) return;

    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setItemName(prod.name);
      setItemModel(prod.model || prod.name);
      setItemBrand(prod.brand);
      setItemCategory(canonicalCategory(prod.category));
      setItemSubCategory(prod.subCategory || '');
      setItemCondition(prod.condition || 'brand_new');
      setItemRam(prod.ram || '-');
      setItemRom(prod.rom || prod.storage || '128GB');
      setItemColor(prod.color || 'Black');
      setItemBatteryHealth(prod.batteryHealth || 100);
      setItemBarcode(prod.barcode);
      setItemSku(prod.sku);
      setItemWarrantyMonths(prod.warrantyMonths !== undefined ? prod.warrantyMonths : 12);
      setItemMinStockAlert(prod.minStockAlert !== undefined ? prod.minStockAlert : 0);
      setItemDescription(prod.description || '');
      setItemUnitCost(prod.costPrice);
      setItemSellingPrice(prod.sellingPrice);
      setItemDualImei(prod.dualImei ?? true);
      setItemImeiPairs([]);
    }
  };

  const handleAddImeiPair = () => {
    if (!newImei1Input.trim()) return;
    const clean1 = newImei1Input.trim().replace(/\D/g, '');
    const clean2 = newImei2Input.trim().replace(/\D/g, '');

    if (itemImeiPairs.some(p => p.imei1 === clean1)) {
      alert('IMEI 1 is already added to this purchase item.');
      return;
    }

    const newPair: ImeiPair = {
      imei1: clean1,
      imei2: clean2 ? clean2 : undefined,
    };

    const updated = [...itemImeiPairs, newPair];
    setItemImeiPairs(updated);
    setItemQty(updated.length);
    setNewImei1Input('');
    setNewImei2Input('');
  };

  const handleRemoveImeiPair = (index: number) => {
    const updated = itemImeiPairs.filter((_, idx) => idx !== index);
    setItemImeiPairs(updated);
    setItemQty(Math.max(1, updated.length));
  };

  const handleAutoGenerateTestImeis = () => {
    const countNeeded = Math.max(1, itemQty - itemImeiPairs.length);
    const generated: ImeiPair[] = [];
    for (let i = 0; i < countNeeded; i++) {
      const rand1 = `86${Math.floor(1000000000000 + Math.random() * 9000000000000)}`;
      const rand2 = itemDualImei ? `86${Math.floor(1000000000000 + Math.random() * 9000000000000)}` : undefined;
      generated.push({ imei1: rand1, imei2: rand2 });
    }
    const updated = [...itemImeiPairs, ...generated];
    setItemImeiPairs(updated);
    setItemQty(updated.length);
  };

  const handleResetItemForm = () => {
    setSelectedExistingProdId('');
    setItemName('');
    setItemBrand('');
    setItemModel('');
    setItemCategory('brand_new_phones');
    setItemSubCategory('');
    setItemCondition('brand_new');
    setItemRam('-');
    setItemRom('128GB');
    setItemColor('Black');
    setItemBatteryHealth(100);
    setItemUnitCost(0);
    setItemSellingPrice(0);
    setItemQty(1);
    setItemImeiPairs([]);
    setNewImei1Input('');
    setNewImei2Input('');
    setItemBarcode(`${Math.floor(100000000000 + Math.random() * 900000000000)}`);
    setItemSku(`SKU-${Date.now().toString().slice(-6)}`);
    setActiveImportedPreOrder(null);
  };

  const handleAddItemToPurchase = () => {
    if (!itemName.trim()) {
      alert('Please enter or select a product item name.');
      return;
    }
    if (itemUnitCost <= 0) {
      alert('Please enter a valid purchase unit cost.');
      return;
    }

    // Check if matching existing product in catalog exists by id, sister variant, or name/brand/cat
    const existingMatch = selectedExistingProdId
      ? products.find(p => p.id === selectedExistingProdId)
      : (matchedExactVariant || products.find(p => 
          canonicalCategory(p.category) === canonicalCategory(itemCategory) &&
          (p.brand.toLowerCase() === itemBrand.trim().toLowerCase() || !itemBrand.trim()) &&
          (p.name.toLowerCase() === itemName.trim().toLowerCase() || 
           (p.model && p.model.toLowerCase() === itemName.trim().toLowerCase()))
        ));

    const finalProductId = existingMatch
      ? existingMatch.id
      : (selectedExistingProdId || `prod-draft-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`);

    const flatImeiList = itemImeiPairs.map(p => p.imei1);

    const newItem: PurchaseItem = {
      productId: finalProductId,
      name: itemName.trim(),
      brand: itemBrand.trim() || 'General',
      category: itemCategory,
      subCategory: itemSubCategory || existingMatch?.subCategory || undefined,
      condition: itemCondition || existingMatch?.condition || 'brand_new',
      ram: isPhone && itemRam !== '-' ? itemRam : (existingMatch?.ram || undefined),
      rom: isPhone ? itemRom : (existingMatch?.rom || existingMatch?.storage || undefined),
      storage: isPhone ? itemRom : (existingMatch?.storage || existingMatch?.rom || undefined),
      color: isPhone ? itemColor : (existingMatch?.color || undefined),
      batteryHealth: isPhone ? itemBatteryHealth : (existingMatch?.batteryHealth || undefined),
      barcode: itemBarcode || existingMatch?.barcode,
      sku: itemSku || existingMatch?.sku,
      warrantyMonths: itemWarrantyMonths !== undefined ? itemWarrantyMonths : existingMatch?.warrantyMonths,
      minStockAlert: itemMinStockAlert !== undefined ? itemMinStockAlert : existingMatch?.minStockAlert,
      description: itemDescription || existingMatch?.description,
      quantity: Number(itemQty),
      unitCost: Number(itemUnitCost),
      sellingPrice: Number(itemSellingPrice) || (existingMatch ? existingMatch.sellingPrice : Number(itemUnitCost) * 1.2),
      totalCost: Number(itemQty) * Number(itemUnitCost),
      imeiPairs: itemImeiPairs.length > 0 ? itemImeiPairs : undefined,
      dualImei: itemDualImei,
      imeiList: flatImeiList.length > 0 ? flatImeiList : undefined,
      allocatedPreOrderId: activeImportedPreOrder?.id,
      allocatedPreOrderNumber: activeImportedPreOrder?.preOrderNumber,
      allocatedCustomerName: activeImportedPreOrder?.customerName,
    };

    setPurchaseItems(prev => [...prev, newItem]);
    handleResetItemForm();
  };

  const handleRemovePurchaseItem = (index: number) => {
    setPurchaseItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    const validQty = Math.max(1, Math.floor(newQty || 1));
    setPurchaseItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const totalCost = validQty * item.unitCost;
      let updatedImeiPairs = item.imeiPairs;
      let updatedImeiList = item.imeiList;
      if (item.imeiPairs && item.imeiPairs.length > validQty) {
        updatedImeiPairs = item.imeiPairs.slice(0, validQty);
        updatedImeiList = updatedImeiPairs.map(p => p.imei1);
      }
      return {
        ...item,
        quantity: validQty,
        totalCost,
        imeiPairs: updatedImeiPairs,
        imeiList: updatedImeiList,
      };
    }));
  };

  const handleUpdateItemCost = (index: number, newUnitCost: number) => {
    const validCost = Math.max(0, newUnitCost || 0);
    setPurchaseItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const totalCost = item.quantity * validCost;
      const updatedSellingPrice = item.sellingPrice < validCost ? Math.round(validCost * 1.15) : item.sellingPrice;
      return {
        ...item,
        unitCost: validCost,
        sellingPrice: updatedSellingPrice,
        totalCost,
      };
    }));
  };

  const handleUpdateItemSellingPrice = (index: number, newSellingPrice: number) => {
    const validPrice = Math.max(0, newSellingPrice || 0);
    setPurchaseItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        sellingPrice: validPrice,
      };
    }));
  };

  const calculateSubtotal = () => purchaseItems.reduce((s, i) => s + i.totalCost, 0);
  const calculateGrandTotal = () => calculateSubtotal() + shippingFee;

  // Voucher upload & simulation handlers
  const handleVoucherFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        alert('Voucher image size should be less than 8MB.');
        return;
      }
      setSupplierVoucherFileName(file.name);
      try {
        const compressed = await compressImageToBase64(file, { maxDimension: 1200, quality: 0.8 });
        setSupplierVoucherPhoto(compressed);
      } catch (err: any) {
        alert(err?.message || 'Failed to compress voucher image.');
      }
    }
  };

  const handleSimulateSupplierVoucher = () => {
    const grandTotal = calculateGrandTotal();
    const supName = supplierName || 'Wholesale Supplier';
    const invoiceNum = refInvoiceNo || `INV-${Date.now().toString().slice(-6)}`;
    const dateStr = purchaseDate || new Date().toISOString().split('T')[0];
    
    const svgVoucher = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="320" viewBox="0 0 500 320">` +
      `<rect width="100%" height="100%" fill="%23ffffff" rx="8"/>` +
      `<rect width="100%" height="45" fill="%231e293b"/>` +
      `<text x="20" y="28" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="15">${supName.toUpperCase()} - COMMERCIAL INVOICE</text>` +
      `<text x="480" y="28" fill="%2338bdf8" font-family="sans-serif" font-weight="bold" font-size="12" text-anchor="end">${invoiceNum}</text>` +
      `<text x="20" y="68" fill="%2364748b" font-family="sans-serif" font-size="11">DATE: ${dateStr}</text>` +
      `<text x="20" y="85" fill="%2364748b" font-family="sans-serif" font-size="11">PHONE: ${supplierPhone || '+95 9 123 456 789'}</text>` +
      `<line x1="20" y1="98" x2="480" y2="98" stroke="%23e2e8f0" stroke-width="1.5"/>` +
      `<text x="20" y="118" fill="%230f172a" font-family="sans-serif" font-weight="bold" font-size="12">ITEMS SUMMARY (${purchaseItems.length} lines, ${purchaseItems.reduce((s,i) => s + i.quantity, 0)} units)</text>` +
      (purchaseItems.length === 0 ? `<text x="20" y="145" fill="%2394a3b8" font-family="sans-serif" font-size="11">1x Bulk Mobile Stock Order</text>` : '') +
      purchaseItems.slice(0, 3).map((item, idx) => 
        `<text x="20" y="${142 + idx * 22}" fill="%23334155" font-family="sans-serif" font-size="11">${item.quantity}x ${item.name.slice(0, 32)}</text>` +
        `<text x="480" y="${142 + idx * 22}" fill="%230f172a" font-family="monospace" font-weight="bold" font-size="11" text-anchor="end">${formatCurrency(item.totalCost, settings.currencySymbol)}</text>`
      ).join('') +
      (purchaseItems.length > 3 ? `<text x="20" y="212" fill="%2394a3b8" font-family="sans-serif" font-size="10">+ ${purchaseItems.length - 3} more items...</text>` : '') +
      `<line x1="20" y1="226" x2="480" y2="226" stroke="%23cbd5e1" stroke-dasharray="4"/>` +
      `<text x="300" y="250" fill="%2364748b" font-family="sans-serif" font-size="12">GRAND TOTAL:</text>` +
      `<text x="480" y="250" fill="%2316a34a" font-family="monospace" font-weight="bold" font-size="14" text-anchor="end">${formatCurrency(grandTotal, settings.currencySymbol)}</text>` +
      `<rect x="20" y="258" width="130" height="42" rx="4" fill="%23f1f5f9" stroke="%2394a3b8" stroke-dasharray="2"/>` +
      `<text x="85" y="276" fill="%230f766e" font-family="sans-serif" font-weight="bold" font-size="10" text-anchor="middle">SUPPLIER STAMP</text>` +
      `<text x="85" y="290" fill="%230f766e" font-family="sans-serif" font-size="9" text-anchor="middle">AUTHORIZED &amp; VERIFIED</text>` +
    `</svg>`;
    setSupplierVoucherPhoto(svgVoucher);
    setSupplierVoucherFileName(`supplier_voucher_${invoiceNum.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`);
  };

  // Open Draft for Editing
  const handleOpenEditDraft = (po: PurchaseRecord) => {
    if (!canManageDrafts && !canApprovePurchases) {
      alert('Permission restricted: Your staff account does not have Stage 1 permission to edit Purchase Order drafts.');
      return;
    }
    setEditingPoId(po.id);
    setSupplierId(po.supplierId);
    setSupplierName(po.supplierName);
    setSupplierPhone(po.supplierPhone || '');
    setRefInvoiceNo(po.referenceInvoiceNo || '');
    setPurchaseDate(po.date ? po.date.split('T')[0] : new Date().toISOString().split('T')[0]);
    setPaymentMethod(po.paymentMethod);
    setShippingFee(po.shippingFee || 0);
    setNotes(po.notes || '');
    setPurchaseItems(po.items || []);
    setSupplierVoucherPhoto(po.supplierVoucherPhoto || null);
    setSupplierVoucherFileName(po.supplierVoucherFileName || '');
    setIsVoucherZoomed(false);
    setIsNewPurchaseModalOpen(true);
  };

  // Open New Draft Creation Modal
  const handleOpenNewDraft = () => {
    if (!canManageDrafts && !canApprovePurchases) {
      alert('Permission restricted: Your staff account does not have Stage 1 permission to create Purchase Order drafts.');
      return;
    }
    setEditingPoId(null);
    setSupplierId(suppliers[0]?.id || '');
    setSupplierName(suppliers[0]?.name || '');
    setSupplierPhone(suppliers[0]?.phone || '');
    setRefInvoiceNo('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('kbz');
    setShippingFee(0);
    setNotes('');
    setPurchaseItems([]);
    setSupplierVoucherPhoto(null);
    setSupplierVoucherFileName('');
    setIsVoucherZoomed(false);
    handleResetItemForm();
    setIsNewPurchaseModalOpen(true);
  };

  // Save Draft or Submit for Approval
  const handleSavePurchaseOrder = (targetStatus: 'draft' | 'pending_approval') => {
    if (!canManageDrafts && !canApprovePurchases) {
      alert('Permission restricted: You do not have permission to save or submit Purchase Orders.');
      return;
    }

    if (purchaseItems.length === 0) {
      alert('Please add at least one item to this purchase invoice.');
      return;
    }

    const subtotal = calculateSubtotal();
    const grandTotal = calculateGrandTotal();

    if (editingPoId) {
      // Update existing draft
      const existing = purchases.find(p => p.id === editingPoId);
      const updatedPO: PurchaseRecord = {
        ...(existing || {} as PurchaseRecord),
        id: editingPoId,
        purchaseOrderNumber: existing?.purchaseOrderNumber || `${settings.purchasePrefix || 'PO-'}${Date.now().toString().slice(-6)}`,
        supplierId: supplierId || `sup-${Date.now()}`,
        supplierName: supplierName || 'Wholesale Supplier',
        supplierPhone: supplierPhone,
        date: new Date(purchaseDate).toISOString(),
        items: purchaseItems,
        subtotal,
        shippingFee,
        otherCosts: existing?.otherCosts || 0,
        grandTotal,
        totalLandedCost: grandTotal,
        paymentMethod,
        paymentStatus: existing?.paymentStatus || 'unpaid',
        amountPaid: existing?.amountPaid || 0,
        balanceDue: grandTotal,
        referenceInvoiceNo: refInvoiceNo,
        notes,
        status: targetStatus,
        submittedForApprovalAt: targetStatus === 'pending_approval' ? new Date().toISOString() : existing?.submittedForApprovalAt,
        submittedBy: targetStatus === 'pending_approval' ? activeStaffName : existing?.submittedBy,
        supplierVoucherPhoto: supplierVoucherPhoto || undefined,
        supplierVoucherFileName: supplierVoucherFileName || undefined,
      };

      StorageService.updatePurchaseRecord(updatedPO);
      onSavePurchase(updatedPO);
    } else {
      const newPO: PurchaseRecord = {
        id: `po-${Date.now()}`,
        purchaseOrderNumber: `${settings.purchasePrefix || 'PO-'}${Date.now().toString().slice(-6)}`,
        supplierId: supplierId || `sup-${Date.now()}`,
        supplierName: supplierName || 'Wholesale Supplier',
        supplierPhone: supplierPhone,
        date: new Date(purchaseDate).toISOString(),
        items: purchaseItems,
        subtotal,
        shippingFee,
        otherCosts: 0,
        grandTotal,
        totalLandedCost: grandTotal,
        paymentMethod,
        paymentStatus: 'unpaid',
        amountPaid: 0,
        balanceDue: grandTotal,
        referenceInvoiceNo: refInvoiceNo,
        notes,
        receivedBy: '',

        // 3-Stage ERP Workflow Fields
        status: targetStatus,
        createdBy: activeStaffName,
        createdById: `staff-${activeRole.toLowerCase()}`,
        createdByRole: activeRole,
        createdAt: new Date().toISOString(),
        submittedForApprovalAt: targetStatus === 'pending_approval' ? new Date().toISOString() : undefined,
        submittedBy: targetStatus === 'pending_approval' ? activeStaffName : undefined,
        supplierVoucherPhoto: supplierVoucherPhoto || undefined,
        supplierVoucherFileName: supplierVoucherFileName || undefined,
      };

      onSavePurchase(newPO);
    }

    // When re-purchasing an existing product and modifying its price in the purchase invoice,
    // ensure the catalog product's prices are updated and bound to avoid creating a duplicate entry
    const currentProducts = StorageService.getProducts();
    let productsUpdated = false;
    purchaseItems.forEach(item => {
      let targetProd: Product | undefined;
      if (item.productId && !item.productId.startsWith('prod-draft-')) {
        targetProd = currentProducts.find(p => p.id === item.productId);
      }
      if (!targetProd) {
        targetProd = currentProducts.find(p => 
          canonicalCategory(p.category) === canonicalCategory(item.category) &&
          normalizeVariantText(p.brand) === normalizeVariantText(item.brand) &&
          (normalizeVariantText(p.name) === normalizeVariantText(item.name) ||
           (p.model && normalizeVariantText(p.model) === normalizeVariantText(item.name)))
        );
      }
      if (targetProd) {
        item.productId = targetProd.id;
        if (item.unitCost > 0 && targetProd.costPrice !== item.unitCost) {
          targetProd.costPrice = item.unitCost;
          productsUpdated = true;
        }
        if (item.sellingPrice > 0 && targetProd.sellingPrice !== item.sellingPrice) {
          targetProd.sellingPrice = item.sellingPrice;
          productsUpdated = true;
        }
      }
    });
    if (productsUpdated) {
      StorageService.saveProducts(currentProducts);
    }

    setIsNewPurchaseModalOpen(false);
    setEditingPoId(null);
    setPurchaseItems([]);
    setSupplierVoucherPhoto(null);
    setSupplierVoucherFileName('');
  };

  // Submit Draft for Manager Approval
  const handleSubmitForApproval = (poId: string) => {
    StorageService.submitPurchaseForApproval(poId, activeStaffName);
    const updated = StorageService.getPurchases();
    setPurchases(updated);
    const target = updated.find(p => p.id === poId);
    if (target) onSavePurchase(target);
  };

  // Stage 2 Confirmation Handler
  const handleConfirmPayment = (data: {
    paymentMethod: PaymentMethod;
    isFullyPaid: boolean;
    amountPaid: number;
    paymentProofUrl?: string;
    paymentProofFileName?: string;
    approvalNotes?: string;
    confirmedBy: string;
    confirmedByRole: StaffRole;
  }) => {
    if (!paymentModalPurchase) return;
    StorageService.confirmPurchaseOrder(paymentModalPurchase.id, data);
    const updated = StorageService.getPurchases();
    setPurchases(updated);
    const target = updated.find(p => p.id === paymentModalPurchase.id);
    if (target) onSavePurchase(target);
    setPaymentModalPurchase(null);
  };

  // Stage 3 Receive Goods Handler
  const handleConfirmReceipt = (data: {
    deliveryCharges: number;
    receivedBy: string;
    receivingNotes?: string;
    receivedDate: string;
    updatedItems?: PurchaseItem[];
  }) => {
    if (!receiveModalPurchase) return;
    StorageService.receivePurchaseOrder(receiveModalPurchase.id, data);
    const updated = StorageService.getPurchases();
    setPurchases(updated);
    const target = updated.find(p => p.id === receiveModalPurchase.id);
    if (target) onSavePurchase(target);
    setReceiveModalPurchase(null);
  };

  // Stage Reversal / Backward Navigation Handler
  const handleRevertStage = (purchaseId: string, targetStatus: 'draft' | 'pending_approval' | 'confirmed') => {
    if (targetStatus === 'draft') {
      StorageService.revertPurchaseToDraft(purchaseId);
    } else if (targetStatus === 'pending_approval') {
      StorageService.revertPurchaseToPendingApproval(purchaseId);
    } else if (targetStatus === 'confirmed') {
      StorageService.revertPurchaseToConfirmed(purchaseId);
    }

    const updated = StorageService.getPurchases();
    setPurchases(updated);
    const target = updated.find(p => p.id === purchaseId);
    if (target) onSavePurchase(target);
  };

  // Delete Purchase Handler
  const handleDeletePurchase = (id: string) => {
    if (confirm('Are you sure you want to delete this purchase record? If it was received, inventory may need manual adjustment.')) {
      StorageService.deletePurchase(id);
      const updated = StorageService.getPurchases();
      setPurchases(updated);
    }
  };

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const matchesSearch = 
        p.purchaseOrderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.referenceInvoiceNo && p.referenceInvoiceNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.items.some(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSupplier = selectedSupplierFilter === 'all' || p.supplierId === selectedSupplierFilter;
      
      const matchesStage = selectedStageFilter === 'all' 
        ? true 
        : selectedStageFilter === 'draft' 
        ? (p.status === 'draft')
        : selectedStageFilter === 'pending_approval'
        ? (p.status === 'pending_approval')
        : selectedStageFilter === 'confirmed'
        ? (p.status === 'confirmed')
        : selectedStageFilter === 'received'
        ? (p.status === 'received')
        : true;

      return matchesSearch && matchesSupplier && matchesStage;
    });
  }, [purchases, searchQuery, selectedSupplierFilter, selectedStageFilter]);

  // Stage counts
  const stageCounts = useMemo(() => {
    return {
      all: purchases.length,
      draft: purchases.filter(p => p.status === 'draft').length,
      pending_approval: purchases.filter(p => p.status === 'pending_approval').length,
      confirmed: purchases.filter(p => p.status === 'confirmed').length,
      received: purchases.filter(p => p.status === 'received').length,
    };
  }, [purchases]);

  // Profit margin calculation for item sub-form
  const calculatedProfitPerUnit = Math.max(0, itemSellingPrice - itemUnitCost);
  const calculatedMarkupPct = itemUnitCost > 0 ? ((calculatedProfitPerUnit / itemUnitCost) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Bar: Title, Staff Role Switcher & New PO Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Purchase Orders & Workflow ERP</h2>
              <p className="text-xs text-slate-500">
                Enterprise 3-Stage Procurement: <strong>Draft Creation ➔ Executive Confirmation & Payment ➔ Physical Goods Receipt</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Permission Indicators & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Granular Permission Access Status Badges */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] shadow-2xs">
            <span className="text-slate-400 font-semibold">Stage Access:</span>
            <span 
              className={`px-2 py-0.5 rounded font-bold transition-all ${canManageDrafts ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-400 line-through'}`}
              title={canManageDrafts ? 'Stage 1: Create & Edit Draft POs (Allowed)' : 'Stage 1: Draft POs (Restricted)'}
            >
              S1 Draft
            </span>
            <span className="text-slate-300">➔</span>
            <span 
              className={`px-2 py-0.5 rounded font-bold transition-all ${canApprovePurchases ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-400 line-through'}`}
              title={canApprovePurchases ? 'Stage 2: Approve & Execute Payment (Allowed)' : 'Stage 2: Payment Approval Restricted'}
            >
              S2 Approve & Pay
            </span>
            <span className="text-slate-300">➔</span>
            <span 
              className={`px-2 py-0.5 rounded font-bold transition-all ${canReceivePurchases ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-400 line-through'}`}
              title={canReceivePurchases ? 'Stage 3: Receive Goods & Restock IMEIs (Allowed)' : 'Stage 3: Goods Intake Restricted'}
            >
              S3 Receive
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="export-purchases-register-pdf-btn"
              onClick={() => {
                const filterLabel = selectedStageFilter === 'all' 
                  ? 'All Stages' 
                  : selectedStageFilter === 'draft' 
                  ? 'Stage 1 (Drafts)' 
                  : selectedStageFilter === 'pending_approval'
                  ? 'Stage 1 (Pending Approval)'
                  : selectedStageFilter === 'confirmed'
                  ? 'Stage 2 (Confirmed & Paid)'
                  : 'Stage 3 (Received & Restocked)';
                exportPurchasesRegisterPdf(filteredPurchases, settings, filterLabel);
              }}
              className="px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-indigo-50/50 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Export filtered purchases register as Executive PDF report"
            >
              <FileDown className="w-4 h-4 text-indigo-600" />
              <span>Export PDF Register</span>
            </button>

            <button
              type="button"
              id="create-purchase-order-btn"
              onClick={handleOpenNewDraft}
              disabled={!canManageDrafts && !canApprovePurchases}
              className={`px-4 py-2.5 font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-all ring-2 ${
                canManageDrafts || canApprovePurchases
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer ring-indigo-500/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed ring-transparent'
              }`}
              title={canManageDrafts || canApprovePurchases ? 'Create new Stage 1 Purchase Order' : 'Stage 1 draft creation restricted for your role'}
            >
              {canManageDrafts || canApprovePurchases ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span>Create Purchase Invoice (Stage 1)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Workflow Process Visual Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 flex items-start space-x-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
            1
          </div>
          <div>
            <h4 className="font-bold text-amber-900 text-xs">Stage 1: Draft Invoice</h4>
            <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
              Cashier builds supplier invoice with items, prices, quantities, and optional box scans. Submit for manager approval.
            </p>
          </div>
        </div>

        <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 flex items-start space-x-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
            2
          </div>
          <div>
            <h4 className="font-bold text-indigo-900 text-xs">Stage 2: Confirmation & Payment</h4>
            <p className="text-[11px] text-indigo-800 leading-snug mt-0.5">
              Manager or Owner approves the order, selects payment method (KBZ Pay / AYA / Cash), and attaches bank payment slip.
            </p>
          </div>
        </div>

        <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-start space-x-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
            3
          </div>
          <div>
            <h4 className="font-bold text-emerald-900 text-xs">Stage 3: Receive Products & IMEIs</h4>
            <p className="text-[11px] text-emerald-800 leading-snug mt-0.5">
              Unlocks after confirmation. Scan serialized phone IMEIs, enter delivery charges, and restock live shop inventory.
            </p>
          </div>
        </div>
      </div>

      {/* Stage Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Stage Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All Orders', count: stageCounts.all, color: 'slate' },
              { id: 'draft', label: '1. Drafts', count: stageCounts.draft, color: 'amber' },
              { id: 'pending_approval', label: 'Pending Approval', count: stageCounts.pending_approval, color: 'indigo' },
              { id: 'confirmed', label: '2. Confirmed & Paid', count: stageCounts.confirmed, color: 'blue' },
              { id: 'received', label: '3. Received & Restocked', count: stageCounts.received, color: 'emerald' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStageFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
                  selectedStageFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedStageFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Supplier Dropdown Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-semibold"
            >
              <option value="all">All Suppliers ({suppliers.length})</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search by PO #, Supplier name, Ref Invoice #, or item description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-hidden"
          />
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">PO & Ref Invoice</th>
                <th className="py-3 px-4">Supplier & Date</th>
                <th className="py-3 px-4">Items / Total Qty</th>
                <th className="py-3 px-4">Stage Status</th>
                <th className="py-3 px-4">Payment Info</th>
                <th className="py-3 px-4 text-right">Landed Grand Total</th>
                <th className="py-3 px-4 text-center">Workflow & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold">No purchase orders found matching this filter.</p>
                    <button
                      type="button"
                      onClick={handleOpenNewDraft}
                      className="mt-3 px-4 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100"
                    >
                      + Create First Purchase Invoice
                    </button>
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((po) => {
                  const payInfo = getPaymentMethodInfo(po.paymentMethod);
                  const totalUnits = po.items.reduce((sum, item) => sum + item.quantity, 0);

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* PO Number & Reference */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            #{po.purchaseOrderNumber}
                          </span>
                        </div>
                        {po.referenceInvoiceNo && (
                          <span className="text-[10px] text-slate-500 block font-mono">
                            Ref: {po.referenceInvoiceNo}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 block">
                          Created by: {po.createdBy || 'Staff'} ({po.createdByRole || 'Cashier'})
                        </span>
                      </td>

                      {/* Supplier & Date */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{po.supplierName}</span>
                        <span className="text-[10px] text-slate-500 block">{formatDate(po.date)}</span>
                      </td>

                      {/* Items / Quantity */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">
                          {totalUnits} units <span className="font-normal text-slate-500">({po.items.length} items)</span>
                        </span>
                        <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                          {po.items.map(i => i.name).join(', ')}
                        </div>
                      </td>

                      {/* Workflow Stage Badge */}
                      <td className="py-3 px-4">
                        {po.status === 'draft' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <FileText className="w-3 h-3 mr-1" />
                            Stage 1: Draft
                          </span>
                        )}
                        {po.status === 'pending_approval' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending Approval
                          </span>
                        )}
                        {po.status === 'confirmed' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Stage 2: Approved & Paid
                          </span>
                        )}
                        {po.status === 'received' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <PackageCheck className="w-3 h-3 mr-1" />
                            Stage 3: Received
                          </span>
                        )}
                      </td>

                      {/* Payment */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${payInfo.badgeBg}`}>
                            {payInfo.shortLabel}
                          </span>
                          <span className="font-semibold text-slate-700 capitalize">{po.paymentMethod}</span>
                        </div>
                        {po.paymentProofUrl && (
                          <span className="text-[10px] text-indigo-600 font-medium flex items-center space-x-0.5 mt-0.5">
                            <Camera className="w-3 h-3 mr-0.5" /> Proof Attached
                          </span>
                        )}
                      </td>

                      {/* Grand Total & Landed Costs */}
                      <td className="py-3 px-4 text-right font-black font-mono text-slate-900">
                        {formatCurrency(po.totalLandedCost || po.grandTotal, settings.currencySymbol)}
                        {po.deliveryCharges ? (
                          <p className="text-[10px] text-teal-600 font-normal">
                            +{formatCurrency(po.deliveryCharges, settings.currencySymbol)} Delivery
                          </p>
                        ) : null}
                      </td>

                      {/* Stage-Adaptive Action Controls with Forward & Backward Navigation */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5 flex-wrap gap-y-1">
                          {/* DRAFT ACTIONS */}
                          {po.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditDraft(po)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                                title="Edit items & prices in this draft"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSubmitForApproval(po.id)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                                title="Submit draft to Manager for confirmation"
                              >
                                <Send className="w-3 h-3" />
                                <span>Submit (➔ Stage 2)</span>
                              </button>

                              {canApprovePurchases && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentModalPurchase(po)}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                                  title="Approve & Pay (Stage 2 Action)"
                                >
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeletePurchase(po.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                title="Delete Draft"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* PENDING APPROVAL ACTIONS */}
                          {po.status === 'pending_approval' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRevertStage(po.id, 'draft')}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                                title="Return to Stage 1 Draft for edits"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>⬅ Draft</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPaymentModalPurchase(po)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                                  canApprovePurchases
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                }`}
                                title={canApprovePurchases ? 'Executive Approval & Payment' : 'Approval restricted (Requires Stage 2 permission)'}
                              >
                                {canApprovePurchases ? (
                                  <>
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Approve & Pay (➔ Stage 2)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span>Stage 2 Restricted</span>
                                  </>
                                )}
                              </button>
                            </>
                          )}

                          {/* CONFIRMED ACTIONS */}
                          {po.status === 'confirmed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm('Revert this confirmed Purchase Order back to Draft status?')) {
                                    handleRevertStage(po.id, 'draft');
                                  }
                                }}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                                title="Revert to Stage 1 Draft"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>⬅ Draft</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setReceiveModalPurchase(po)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center space-x-1 ${
                                  canReceivePurchases
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                }`}
                                title={canReceivePurchases ? 'Open goods receipt and serialized IMEI intake' : 'Goods intake restricted (Requires Stage 3 permission)'}
                              >
                                {canReceivePurchases ? (
                                  <>
                                    <PackageCheck className="w-3 h-3" />
                                    <span>Receive & IMEIs (➔ Stage 3)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span>Stage 3 Restricted</span>
                                  </>
                                )}
                              </button>
                            </>
                          )}

                          {/* RECEIVED ACTIONS */}
                          {po.status === 'received' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm('Rollback inventory receipt? This will deduct the restocked units and IMEIs from inventory and return order to Confirmed status.')) {
                                    handleRevertStage(po.id, 'confirmed');
                                  }
                                }}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                                title="Rollback stock and return to Confirmed status"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>⬅ Rollback</span>
                              </button>
                            </>
                          )}

                          {/* Workflow Dialog Button */}
                          <button
                            type="button"
                            onClick={() => setWorkflowPurchase(po)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                            title="View 3-Stage Workflow Tracker & Audit Trail"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Workflow</span>
                          </button>

                          {/* Quick Row-Level PDF Export Menu */}
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRowPdfMenuId(openRowPdfMenuId === po.id ? null : po.id);
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-0.5"
                              title="Export Stage Documents (PDF)"
                            >
                              <FileDown className="w-3 h-3 text-emerald-600 mr-0.5" />
                              <span>PDF</span>
                              <ChevronDown className="w-2.5 h-2.5 text-emerald-600" />
                            </button>

                            {openRowPdfMenuId === po.id && (
                              <div 
                                className="origin-top-right absolute right-0 mt-1 w-56 rounded-xl shadow-xl bg-white ring-1 ring-black/10 focus:outline-hidden z-40 p-1 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="py-1">
                                  <div className="px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    Stage PDF Exports
                                  </div>

                                  {/* 1. Stage 1: PO PDF */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      exportPurchaseOrderPdf(po, settings);
                                      setOpenRowPdfMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-900 rounded-lg flex items-center space-x-2 font-semibold transition-colors"
                                  >
                                    <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[9px] font-black shrink-0">1</div>
                                    <span className="truncate">Stage 1: Purchase Order</span>
                                  </button>

                                  {/* 2. Stage 2: Payment Voucher */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      exportPurchasePaymentVoucherPdf(po, settings);
                                      setOpenRowPdfMenuId(null);
                                    }}
                                    disabled={po.status === 'draft' || po.status === 'pending_approval'}
                                    className={`w-full text-left px-3 py-1.5 text-xs rounded-lg flex items-center space-x-2 font-semibold transition-colors ${
                                      po.status === 'draft' || po.status === 'pending_approval'
                                        ? 'text-slate-300 cursor-not-allowed'
                                        : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-900'
                                    }`}
                                  >
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                                      po.status === 'draft' || po.status === 'pending_approval'
                                        ? 'bg-slate-100 text-slate-400'
                                        : 'bg-indigo-100 text-indigo-800'
                                    }`}>2</div>
                                    <span className="truncate">Stage 2: Payment Voucher</span>
                                  </button>

                                  {/* 3. Stage 3: Goods Receipt Note (GRN) */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      exportGoodsReceiptNotePdf(po, settings);
                                      setOpenRowPdfMenuId(null);
                                    }}
                                    disabled={po.status !== 'received'}
                                    className={`w-full text-left px-3 py-1.5 text-xs rounded-lg flex items-center space-x-2 font-semibold transition-colors ${
                                      po.status !== 'received'
                                        ? 'text-slate-300 cursor-not-allowed'
                                        : 'text-slate-700 hover:bg-teal-50 hover:text-teal-900'
                                    }`}
                                  >
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                                      po.status !== 'received'
                                        ? 'bg-slate-100 text-slate-400'
                                        : 'bg-teal-100 text-teal-800'
                                    }`}>3</div>
                                    <span className="truncate">Stage 3: Goods Receipt (GRN)</span>
                                  </button>
                                </div>

                                {/* Full Dossier */}
                                <div className="py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      exportPurchaseFullDossierPdf(po, settings);
                                      setOpenRowPdfMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-100 rounded-lg flex items-center space-x-2 font-bold transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span className="truncate">Complete Audit Dossier</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stage 1: New / Edit Purchase Order Modal (Draft Creation with complete NewProductModal-style Item Entry) */}
      {isNewPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      Stage 1: Draft Invoice Creation
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {editingPoId ? 'Edit Purchase Invoice' : 'Create Purchase Invoice'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Draft order with supplier selection, sister variants, AI box scanner, and serialized item specifications
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPurchaseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              {/* 1. Supplier / Vendor Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Select Supplier / Vendor *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => handleSupplierSelect(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone || 'No phone'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Supplier Bill / Invoice Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. MW-INV-2026-991"
                    value={refInvoiceNo}
                    onChange={(e) => setRefInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Purchase Invoice Date</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Delivery / Cargo Fee ({settings.currencySymbol})</label>
                  <input
                    id="po-shipping-fee-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={shippingFee === 0 ? '' : shippingFee}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      setShippingFee(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  />
                </div>
              </div>

              {/* 2. Add Item Section (Exact Match to NewProductModal UI & Architecture) */}
              <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-300/80 space-y-5 shadow-2xs">
                
                {/* Quick Intake Actions: Box Photo Scanner & Pre-Order Data Importer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  
                  {/* Action 1: Pre-Order Device Specification Importer (Prevent Device Mismatches) */}
                  <div className="flex flex-col justify-between gap-3 p-3.5 bg-gradient-to-r from-amber-900 via-amber-950 to-slate-900 text-white rounded-xl shadow-xs border border-amber-500/30">
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/30 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-white text-xs">Import from Pre-Order</h4>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/40 text-amber-200 uppercase tracking-wide">
                            {pendingPreOrdersCount} Awaiting
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-200 mt-0.5">
                          Draw customer pre-order specs (Model, Color, RAM/ROM, Qty) to match purchase invoice exactly.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPreOrderPickerOpen(true)}
                      className="w-full sm:w-auto self-end px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Select Pre-Order Data</span>
                    </button>
                  </div>

                  {/* Action 2: AI Phone Box Scanner */}
                  <div className="flex flex-col justify-between gap-3 p-3.5 bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-xl shadow-xs border border-indigo-500/30">
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs">AI Phone Box & IMEI Scanner</h4>
                        <p className="text-[11px] text-indigo-200 mt-0.5">
                          Photograph retail phone box back sticker to auto-extract Model, Color, RAM/ROM & IMEIs.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsBoxScannerOpen(true)}
                      className="w-full sm:w-auto self-end px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan Box Photo</span>
                    </button>
                  </div>

                </div>

                {/* Imported Pre-Order Active Banner */}
                {activeImportedPreOrder && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between gap-3 text-xs animate-fade-in shadow-2xs">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-emerald-900">
                            Specs Drawn from Pre-Order {activeImportedPreOrder.preOrderNumber}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.2 bg-emerald-200 text-emerald-900 rounded-full">
                            Customer: {activeImportedPreOrder.customerName}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 truncate mt-0.5">
                          Model: <b>{activeImportedPreOrder.phoneModel}</b> &bull; Color: <b>{activeImportedPreOrder.color || 'Standard'}</b> &bull; RAM/ROM: <b>{activeImportedPreOrder.ram || '-'}/{activeImportedPreOrder.rom || '-'}</b> &bull; Qty: <b>{activeImportedPreOrder.quantity || 1} Unit(s)</b>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsPreOrderPickerOpen(true)}
                        className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded text-[11px] transition-colors cursor-pointer"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveImportedPreOrder(null)}
                        className="p-1 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-100 rounded transition-colors cursor-pointer"
                        title="Clear link"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Section Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-bold text-slate-900 text-sm">Add Item to Purchase Order</h4>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPreOrderPickerOpen(true)}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 rounded-lg text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Select Pre-Order Specs ({pendingPreOrdersCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetItemForm}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1"
                    >
                      Reset Form
                    </button>
                  </div>
                </div>

                {/* Category, Subcategory & Condition Grade */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">Category *</label>
                    <select
                      value={itemCategory}
                      onChange={(e) => handleCategoryChange(e.target.value as ProductCategory)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {CANONICAL_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-800">Subcategory</label>
                      {availableSubCategories.length > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium">({availableSubCategories.length} suggestions)</span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        autoComplete="off"
                        list="po-subcategories-list"
                        placeholder="Type or select subcategory..."
                        value={itemSubCategory}
                        onChange={(e) => handleSubCategoryChange(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      />
                      {itemSubCategory && (
                        <button
                          type="button"
                          onClick={() => handleSubCategoryChange('')}
                          title="Clear Subcategory"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <datalist id="po-subcategories-list">
                        {availableSubCategories.map((sub, idx) => (
                          <option key={idx} value={sub} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">Condition Grade</label>
                    <select
                      value={itemCondition}
                      onChange={(e) => setItemCondition(e.target.value as DeviceCondition)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 cursor-pointer"
                    >
                      {CONDITIONS.map(c => (
                        <option key={c.value} value={c.value}>{c.label} ({c.desc})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Brand & Product Name Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-800">Brand *</label>
                      {availableBrands.length > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium">({availableBrands.length} suggestions)</span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        autoComplete="off"
                        list="po-brands-list"
                        placeholder="Type or select brand..."
                        value={itemBrand}
                        onChange={(e) => handleBrandChange(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      />
                      {itemBrand && (
                        <button
                          type="button"
                          onClick={() => handleBrandChange('')}
                          title="Clear Brand"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <datalist id="po-brands-list">
                        {availableBrands.map((b, idx) => (
                          <option key={idx} value={b} />
                        ))}
                      </datalist>
                    </div>
                    {availableBrands.length > 0 && !itemBrand && (
                      <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                        {availableBrands.slice(0, 6).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => handleBrandChange(b)}
                            className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded text-[10px] font-medium text-slate-600"
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-slate-800">Product Title / Model *</label>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {existingBrandProducts.length > 0 ? `${existingBrandProducts.length} existing in catalog` : 'Type or search model'}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        ref={itemModelInputRef}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={itemBrand ? `Search existing ${itemBrand} models...` : 'Type or search product model / title'}
                        value={itemName}
                        onFocus={() => setIsItemModelDropdownOpen(true)}
                        onChange={(e) => {
                          handleNameChange(e.target.value);
                          setIsItemModelDropdownOpen(true);
                        }}
                        className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      />
                      {itemName && (
                        <button
                          type="button"
                          onClick={() => {
                            handleNameChange('');
                            setIsItemModelDropdownOpen(true);
                          }}
                          title="Clear Product Title"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Dropdown showing existing models strictly under parent category of Brand */}
                      {isItemModelDropdownOpen && (
                        <div
                          ref={itemModelDropdownRef}
                          className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto z-50 p-1 divide-y divide-slate-100"
                        >
                          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 rounded-md flex items-center justify-between mb-1">
                            <span>
                              {itemBrand ? `Existing ${itemBrand} Models` : 'Existing Models in Catalog'} ({filteredExistingProducts.length})
                            </span>
                            <span className="text-[9px] text-slate-400 font-normal">Click to link existing item</span>
                          </div>

                          {filteredExistingProducts.length > 0 ? (
                            filteredExistingProducts.map((p) => {
                              const specsSummary = [
                                p.ram && p.ram !== '-' ? p.ram : '',
                                p.rom || p.storage,
                                p.color,
                                p.condition && p.condition !== 'brand_new' ? p.condition.replace('_', ' ') : ''
                              ].filter(Boolean).join(' • ');

                              const isSelected = selectedExistingProdId === p.id;

                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectExistingProduct(p.id);
                                    setIsItemModelDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors group cursor-pointer ${
                                    isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-slate-900 group-hover:text-indigo-700">{p.name}</span>
                                      {p.brand && (
                                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                                          {p.brand}
                                        </span>
                                      )}
                                      {isSelected && (
                                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-bold">
                                          Selected
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-semibold text-emerald-600">
                                      Stock: {p.stock} units
                                    </span>
                                  </div>
                                  {(specsSummary || p.costPrice > 0 || p.barcode) && (
                                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                                      <span>{specsSummary || p.barcode}</span>
                                      {p.costPrice > 0 && (
                                        <span>Cost: {formatCurrency(p.costPrice, settings.currencySymbol)}</span>
                                      )}
                                    </div>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-3 text-center text-xs text-slate-500">
                              <p className="font-medium">No existing models found in inventory for {itemBrand || 'this selection'}.</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">Type above to configure a new product.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sister Variants Quick-Chips */}
                {sisterVariants.length > 0 && (
                  <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-2xs space-y-1.5">
                    <span className="text-[11px] font-bold text-indigo-900 block">
                      Sister Variants in Catalog for "{itemName}" ({sisterVariants.length} registered):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {sisterVariants.map(v => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleSelectSisterVariant(v)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg text-[11px] font-medium border border-indigo-200 transition-colors flex items-center space-x-1 cursor-pointer"
                        >
                          <span>{v.rom || v.storage || ''} {v.color || ''}</span>
                          <span className="px-1 py-0.2 bg-indigo-200 text-indigo-900 rounded-full text-[9px] font-bold">
                            Stock: {v.stock}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exact Variant Match Banner */}
                {matchedExactVariant ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>Exact Catalog Match:</strong> {matchedExactVariant.name} ({matchedExactVariant.brand}) - Current Stock: <strong>{matchedExactVariant.stock} units</strong> | Cost: <strong>{formatCurrency(matchedExactVariant.costPrice, settings.currencySymbol)}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectSisterVariant(matchedExactVariant)}
                      className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[11px] hover:bg-emerald-700"
                    >
                      Fill Existing Pricing
                    </button>
                  </div>
                ) : itemName.trim() ? (
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center space-x-2">
                    <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Configuring a new variant/item line for purchase.</span>
                  </div>
                ) : null}

                {/* Phone Hardware Specifications Card (RAM, ROM, Color, Battery) */}
                {isPhone && (
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Smartphone className="w-4 h-4 text-indigo-600" />
                      <h5 className="font-bold text-slate-900 text-xs">Phone Variant Specifications</h5>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">RAM Capacity</label>
                        <select
                          value={itemRam}
                          onChange={(e) => setItemRam(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                        >
                          {RAM_PRESETS.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">ROM Storage *</label>
                        <select
                          value={itemRom}
                          onChange={(e) => setItemRom(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-indigo-700"
                        >
                          {ROM_PRESETS.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700">Color Variant</label>
                          {availableColors.length > 0 && (
                            <span className="text-[10px] text-slate-400 font-medium">({availableColors.length})</span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            list="po-colors-datalist"
                            placeholder="e.g. Natural Titanium"
                            value={itemColor}
                            onChange={(e) => setItemColor(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                          />
                          <datalist id="po-colors-datalist">
                            {availableColors.map((c, idx) => (
                              <option key={idx} value={c} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Battery Health %</label>
                        <input
                          type="number"
                          min="50"
                          max="100"
                          placeholder="100"
                          value={itemBatteryHealth === 0 ? '' : itemBatteryHealth}
                          onFocus={(e) => e.target.select()}
                          onClick={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItemBatteryHealth(val === '' ? 0 : parseInt(val) || 0);
                          }}
                          onBlur={() => {
                            if (itemBatteryHealth === 0 || itemBatteryHealth > 100 || itemBatteryHealth < 50) {
                              setItemBatteryHealth(Math.min(100, Math.max(50, itemBatteryHealth || 100)));
                            }
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-hidden"
                        />
                      </div>
                    </div>

                    {/* Serialized Stock Manager with Dual SIM Toggle */}
                    <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-3">
                          <span className="font-bold text-indigo-900 text-xs">
                            Serialized Phone IMEI Numbers (Optional during draft, finalized at goods receipt)
                          </span>
                          <label className="flex items-center space-x-1 text-[11px] text-slate-600 font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={itemDualImei}
                              onChange={(e) => setItemDualImei(e.target.checked)}
                              className="w-3.5 h-3.5 text-indigo-600 rounded"
                            />
                            <span>Dual SIM</span>
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={handleAutoGenerateTestImeis}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Auto-Generate Test IMEIs</span>
                        </button>
                      </div>

                      <div className={`grid gap-2 ${itemDualImei ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={15}
                            placeholder="IMEI 1 (15 digits numeric)..."
                            value={newImei1Input}
                            onChange={(e) => setNewImei1Input(e.target.value.replace(/\D/g, '').slice(0, 15))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (!itemDualImei || !newImei2Input)) {
                                e.preventDefault();
                                handleAddImeiPair();
                              } else if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                e.preventDefault();
                              }
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                              const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                              setNewImei1Input(paste);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                          />
                        </div>
                        {itemDualImei && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={15}
                              placeholder="IMEI 2 (15 digits numeric)..."
                              value={newImei2Input}
                              onChange={(e) => setNewImei2Input(e.target.value.replace(/\D/g, '').slice(0, 15))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddImeiPair();
                                } else if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                }
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                                setNewImei2Input(paste);
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                            />
                            <button
                              type="button"
                              onClick={handleAddImeiPair}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                            >
                              + Add
                            </button>
                          </div>
                        )}
                      </div>

                      {itemImeiPairs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {itemImeiPairs.map((p, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 font-mono text-[10px] border border-indigo-200">
                              <span>#{idx + 1}: {p.imei1}{p.imei2 ? ` / ${p.imei2}` : ''}</span>
                              <button type="button" onClick={() => handleRemoveImeiPair(idx)} className="ml-1.5 text-rose-500 hover:text-rose-700 font-bold">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SKU, Barcode, Warranty & Min Stock */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Barcode</label>
                    <input
                      type="text"
                      value={itemBarcode}
                      onChange={(e) => setItemBarcode(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">SKU Code</label>
                    <input
                      type="text"
                      value={itemSku}
                      onChange={(e) => setItemSku(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Warranty (Months)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="12"
                      value={itemWarrantyMonths === 0 ? '' : itemWarrantyMonths}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemWarrantyMonths(val === '' ? 0 : Math.max(0, parseInt(val) || 0));
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Min Stock Alert</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={itemMinStockAlert}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemMinStockAlert(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-hidden"
                    />
                  </div>
                </div>

                {/* Quantities, Unit Prices & Live Margin Preview */}
                <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-200">Pricing, Margins & Line Total</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      Line Total: {formatCurrency(itemQty * itemUnitCost, settings.currencySymbol)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Order Quantity *</label>
                      <input
                        id="po-item-qty-input"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        placeholder="1"
                        value={itemQty === 0 ? '' : itemQty}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemQty(val === '' ? 0 : Math.max(0, parseInt(val) || 0));
                        }}
                        onBlur={() => {
                          if (!itemQty || itemQty < 1) setItemQty(1);
                        }}
                        className="w-full px-3 py-2 bg-white text-slate-900 rounded-lg font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Supplier Unit Cost ({settings.currencySymbol}) *
                      </label>
                      <input
                        id="po-item-unit-cost-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={itemUnitCost === 0 ? '' : itemUnitCost}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (['e', 'E', '+', '-'].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemUnitCost(val === '' ? 0 : Math.max(0, parseFloat(val) || 0));
                        }}
                        className="w-full px-3 py-2 bg-white text-slate-900 rounded-lg font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Stage 1 Helper & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[11px] space-y-0.5">
                      <div className="text-slate-300 flex items-center space-x-2">
                        <span>Line Total: <strong className="font-mono text-white text-xs">{formatCurrency((itemQty || 1) * itemUnitCost, settings.currencySymbol)}</strong></span>
                        {matchedExactVariant && itemUnitCost > 0 && itemUnitCost !== matchedExactVariant.costPrice && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-semibold">
                            Cost revised from {formatCurrency(matchedExactVariant.costPrice, settings.currencySymbol)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Target Retail Price is set at Stage 3 (Physical Intake & Restock).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddItemToPurchase}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Item to PO Invoice</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Items in Draft Order Table */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 text-xs">
                    Items in Draft Purchase Order ({purchaseItems.length})
                  </h4>
                  <div className="flex items-center space-x-3 text-xs">
                    <span className="font-bold text-slate-700 font-mono">
                      Subtotal: {formatCurrency(calculateSubtotal(), settings.currencySymbol)}
                    </span>
                    {shippingFee > 0 && (
                      <span className="font-bold text-teal-700 font-mono">
                        +Delivery: {formatCurrency(shippingFee, settings.currencySymbol)}
                      </span>
                    )}
                    <span className="font-bold text-indigo-900 font-mono bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200">
                      Grand Total: {formatCurrency(calculateGrandTotal(), settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {purchaseItems.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-400">
                    No items added yet. Configure item specifications above and click "+ Add Item to PO Invoice".
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Item & Specs</th>
                          <th className="p-2.5 text-center w-32">Qty</th>
                          <th className="p-2.5 text-right w-36">Buy Cost ({settings.currencySymbol})</th>
                          <th className="p-2.5 text-right w-40">Retail Price ({settings.currencySymbol})</th>
                          <th className="p-2.5 text-right w-32">Line Total</th>
                          <th className="p-2.5 text-center w-14">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {purchaseItems.map((item, idx) => {
                          const profitPerUnit = item.sellingPrice - item.unitCost;
                          const marginPercent = item.sellingPrice > 0 
                            ? Math.round(((item.sellingPrice - item.unitCost) / item.sellingPrice) * 100) 
                            : 0;

                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2.5">
                                <span className="font-bold text-slate-900">{item.name}</span>
                                <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                  <span>Brand: <strong>{item.brand}</strong></span>
                                  {item.rom && <span>• {item.ram && item.ram !== '-' ? `${item.ram}/` : ''}{item.rom}</span>}
                                  {item.color && <span>• {item.color}</span>}
                                  {item.imeiPairs && item.imeiPairs.length > 0 && (
                                    <span className={`font-semibold ${item.imeiPairs.length === item.quantity ? 'text-indigo-600' : 'text-amber-600'}`}>
                                      • {item.imeiPairs.length} of {item.quantity} IMEIs logged
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Adjustable Qty with - / + and numeric input */}
                              <td className="p-2.5 text-center">
                                <div className="inline-flex items-center justify-center space-x-1 bg-slate-50 p-1 rounded-lg border border-slate-200 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(idx, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                                    title="Decrease quantity (-1)"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity === 0 ? '' : item.quantity}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '') {
                                        handleUpdateItemQuantity(idx, 1);
                                      } else {
                                        const val = parseInt(raw, 10);
                                        if (!isNaN(val)) handleUpdateItemQuantity(idx, Math.max(1, val));
                                      }
                                    }}
                                    className="w-12 px-1 py-0.5 text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden transition-all text-slate-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(idx, item.quantity + 1)}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                                    title="Increase quantity (+1)"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              {/* Adjustable Unit Cost */}
                              <td className="p-2.5 text-right">
                                <div className="inline-flex items-center justify-end space-x-1 bg-slate-50 p-1 rounded-lg border border-slate-200 shadow-2xs">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1000"
                                    value={item.unitCost === 0 ? '' : item.unitCost}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const val = raw === '' ? 0 : parseFloat(raw);
                                      handleUpdateItemCost(idx, isNaN(val) ? 0 : val);
                                    }}
                                    className="w-24 sm:w-28 px-2 py-0.5 text-right font-mono font-bold text-xs bg-white border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden transition-all text-slate-900"
                                    title="Edit Buy / Cost Price per unit"
                                  />
                                  <span className="text-[10px] text-slate-500 font-bold pr-1 shrink-0">{settings.currencySymbol}</span>
                                </div>
                              </td>

                              {/* Adjustable Retail Selling Price & Profit Margin */}
                              <td className="p-2.5 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <div className="inline-flex items-center justify-end space-x-1 bg-slate-50 p-1 rounded-lg border border-slate-200 shadow-2xs">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1000"
                                      value={item.sellingPrice === 0 ? '' : item.sellingPrice}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const val = raw === '' ? 0 : parseFloat(raw);
                                        handleUpdateItemSellingPrice(idx, isNaN(val) ? 0 : val);
                                      }}
                                      className="w-24 sm:w-28 px-2 py-0.5 text-right font-mono font-bold text-xs bg-white border border-slate-200 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-hidden transition-all text-slate-900"
                                      title="Edit Retail Selling Price"
                                    />
                                    <span className="text-[10px] text-slate-500 font-bold pr-1 shrink-0">{settings.currencySymbol}</span>
                                  </div>
                                  <div className="text-[9px] flex items-center gap-1 font-semibold pr-1">
                                    {profitPerUnit >= 0 ? (
                                      <span className="text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                        +{formatCurrency(profitPerUnit, settings.currencySymbol)} ({marginPercent}%)
                                      </span>
                                    ) : (
                                      <span className="text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                        Loss: {formatCurrency(profitPerUnit, settings.currencySymbol)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Line Total */}
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                {formatCurrency(item.totalCost, settings.currencySymbol)}
                              </td>

                              {/* Action: Remove */}
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePurchaseItem(idx)}
                                  className="text-rose-600 hover:text-rose-800 p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Remove item from order"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Draft Notes */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">Draft PO Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Special wholesale terms agreed for 10 units of iPhone 15 Pro..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Voucher from Supplier Photo Upload (Stage 1) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                      <ImageIcon className="w-4 h-4 text-indigo-600" />
                      <span>Voucher from Supplier (Optional Photo / Slip Attachment)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Attach wholesale invoice, handwritten bill, or paper voucher photo from the supplier. This voucher will be displayed for verification in Stage 2 (Manager Approval) and Stage 3 (Goods Intake).
                    </p>
                  </div>
                  {!supplierVoucherPhoto && (
                    <button
                      type="button"
                      onClick={handleSimulateSupplierVoucher}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span>Attach Simulated Supplier Voucher</span>
                    </button>
                  )}
                </div>

                {supplierVoucherPhoto ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                      <div className="flex items-center space-x-2 truncate">
                        <Paperclip className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="truncate">
                          <span className="font-bold text-emerald-950 block truncate">
                            {supplierVoucherFileName || 'supplier_voucher_attached.png'}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-medium">
                            Voucher attached • Forwarded to Stage 2 (Payment) &amp; Stage 3 (Intake)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsVoucherZoomed(!isVoucherZoomed)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>{isVoucherZoomed ? 'Collapse' : 'Expand'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSupplierVoucherPhoto(null);
                            setSupplierVoucherFileName('');
                          }}
                          className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold flex items-center space-x-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    <div 
                      onClick={() => setIsVoucherZoomed(!isVoucherZoomed)}
                      className="rounded-xl overflow-hidden border border-slate-300 bg-slate-900 cursor-pointer hover:opacity-95 transition-opacity"
                    >
                      <img
                        src={supplierVoucherPhoto}
                        alt="Voucher from Supplier"
                        className={`w-full object-contain ${isVoucherZoomed ? 'max-h-96' : 'max-h-40'}`}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/20 rounded-xl cursor-pointer transition-all group">
                      <div className="flex items-center space-x-2 text-slate-600 group-hover:text-indigo-600">
                        <Upload className="w-5 h-5" />
                        <span className="font-bold text-xs">Click or drag &amp; drop to upload Supplier Voucher Photo</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1">
                        Supports PNG, JPG, JPEG, WebP (up to 8MB) • Camera photo / Mobile capture supported
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleVoucherFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer with Multi-Stage Action Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>

                {purchaseItems.length > 0 && (
                  <button
                    type="button"
                    id="export-draft-po-pdf-btn"
                    onClick={() => {
                      const subtotal = calculateSubtotal();
                      const grandTotal = calculateGrandTotal();
                      const draftRecord: PurchaseRecord = {
                        id: editingPoId || `draft-${Date.now()}`,
                        purchaseOrderNumber: editingPoId ? (purchases.find(p => p.id === editingPoId)?.purchaseOrderNumber || 'PO-DRAFT') : `${settings.purchasePrefix || 'PO-'}${Date.now().toString().slice(-6)}`,
                        supplierId,
                        supplierName: supplierName || 'Wholesale Supplier',
                        supplierPhone,
                        date: new Date(purchaseDate).toISOString(),
                        items: purchaseItems,
                        subtotal,
                        shippingFee,
                        otherCosts: 0,
                        grandTotal,
                        totalLandedCost: grandTotal,
                        paymentMethod,
                        paymentStatus: 'unpaid',
                        amountPaid: 0,
                        balanceDue: grandTotal,
                        referenceInvoiceNo: refInvoiceNo,
                        notes,
                        receivedBy: '',
                        status: 'draft',
                        createdBy: activeStaffName,
                        createdByRole: activeRole,
                        supplierVoucherPhoto: supplierVoucherPhoto || undefined,
                        supplierVoucherFileName: supplierVoucherFileName || undefined,
                      };
                      exportPurchaseOrderPdf(draftRecord, settings);
                    }}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
                    title="Export Draft Purchase Order PDF"
                  >
                    <FileDown className="w-3.5 h-3.5 text-amber-600" />
                    <span>Export PO PDF</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* 1. Save as Draft */}
                <button
                  type="button"
                  id="save-draft-po-btn"
                  onClick={() => handleSavePurchaseOrder('draft')}
                  className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingPoId ? 'Update Draft' : 'Save as Draft (Stage 1)'}
                </button>

                {/* 2. Submit for Approval (Moves to Stage 2) */}
                <button
                  type="button"
                  id="submit-for-approval-btn"
                  onClick={() => handleSavePurchaseOrder('pending_approval')}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer ring-2 ring-indigo-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit for Approval (➔ Stage 2)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 2 Confirmation Modal (Executive Approval & Payment) */}
      {paymentModalPurchase && (
        <PurchasePaymentModal
          purchase={paymentModalPurchase}
          settings={settings}
          currentRole={activeRole}
          currentStaffName={activeStaffName}
          hasPermission={canApprovePurchases}
          onConfirmPayment={handleConfirmPayment}
          onRevertToDraft={(id) => handleRevertStage(id, 'draft')}
          onClose={() => setPaymentModalPurchase(null)}
        />
      )}

      {/* Stage 3 Receiving Goods & Serialized IMEI Intake Modal */}
      {receiveModalPurchase && (
        <PurchaseReceiveModal
          purchase={receiveModalPurchase}
          settings={settings}
          currentRole={activeRole}
          currentStaffName={activeStaffName}
          hasPermission={canReceivePurchases}
          onConfirmReceipt={handleConfirmReceipt}
          onRevertStage={(stage) => handleRevertStage(receiveModalPurchase.id, stage)}
          onClose={() => setReceiveModalPurchase(null)}
        />
      )}

      {/* 3-Stage Workflow Tracker & Audit Trail Modal */}
      {workflowPurchase && (
        <PurchaseWorkflowDetailModal
          purchase={workflowPurchase}
          settings={settings}
          currentRole={activeRole}
          currentStaffName={activeStaffName}
          canApprovePurchases={canApprovePurchases}
          canReceivePurchases={canReceivePurchases}
          onSubmitForApproval={handleSubmitForApproval}
          onOpenPaymentModal={(po) => {
            setWorkflowPurchase(null);
            setPaymentModalPurchase(po);
          }}
          onOpenReceiveModal={(po) => {
            setWorkflowPurchase(null);
            setReceiveModalPurchase(po);
          }}
          onRevertStage={handleRevertStage}
          onClose={() => setWorkflowPurchase(null)}
        />
      )}

      {/* AI Box Scanner Modal */}
      <BoxScannerModal
        isOpen={isBoxScannerOpen}
        onClose={() => setIsBoxScannerOpen(false)}
        onApplySpecs={handleApplyBoxSpecs}
      />

      {/* Customer Pre-Order Specifications Importer Modal */}
      <PreOrderPickerModal
        isOpen={isPreOrderPickerOpen}
        onClose={() => setIsPreOrderPickerOpen(false)}
        preOrders={preOrdersList}
        settings={settings}
        onSelectPreOrder={handleImportPreOrderSpecs}
      />
    </div>
  );
};
