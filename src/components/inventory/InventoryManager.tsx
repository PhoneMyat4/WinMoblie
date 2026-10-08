import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  AlertTriangle, 
  Edit3, 
  Trash2, 
  Barcode, 
  Layers, 
  Smartphone, 
  CheckCircle,
  TrendingUp,
  DollarSign,
  X,
  Zap,
  Check,
  ScanLine,
  Tag,
  Filter,
  Cpu,
  HardDrive,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  Info,
  Download,
  History,
  ClipboardCheck,
  ChevronDown,
  Palette,
  FileSpreadsheet,
  ShieldAlert,
  Gift,
  MoreHorizontal
} from 'lucide-react';
import { 
  Product, 
  ProductCategory, 
  ShopSettings, 
  DamageLog,
  Sale,
  PurchaseRecord,
  StockAdjustment,
  StockAuditSession,
  PriceChangeRecord,
  StaffUser
} from '../../types';
import { formatCurrency, formatImei, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';
import { exportToCsv } from '../../utils/reportUtils';
import { StorageService } from '../../utils/storage';
import { NewProductModal } from '../modals/NewProductModal';
import { ProductDetailModal } from '../modals/ProductDetailModal';
import { BarcodeLabelModal } from '../modals/BarcodeLabelModal';
import { BulkProductImportModal } from '../modals/BulkProductImportModal';
import { QuarantineReportModal } from './QuarantineReportModal';
import { QuarantineManagerModal } from './QuarantineManagerModal';
import { WholeInventoryLogModal } from './WholeInventoryLogModal';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';
import { SortableHeader, useTableSort } from '../common/SortableHeader';
import { canonicalCategory, isPhoneCategory, CANONICAL_CATEGORIES } from '../../data/categoryTaxonomy';

const INVENTORY_COLUMNS: ColumnDefinition[] = [
  { id: 'item_model', label: 'Item & Model', required: true },
  { id: 'category_condition', label: 'Category / Condition' },
  { id: 'cost_price', label: 'Cost Price' },
  { id: 'selling_price', label: 'Selling Price' },
  { id: 'margin', label: 'Margin %' },
  { id: 'stock_level', label: 'Stock Level' },
  { id: 'imei_serials', label: 'IMEI Serial Numbers' },
  { id: 'actions', label: 'Actions' },
];

interface InventoryManagerProps {
  products: Product[];
  settings: ShopSettings;
  sales?: Sale[];
  purchases?: PurchaseRecord[];
  stockAdjustments?: StockAdjustment[];
  stockAudits?: StockAuditSession[];
  priceChanges?: PriceChangeRecord[];
  damageLogs?: DamageLog[];
  staffUsers?: StaffUser[];
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onOpenProductHistory?: (product: Product) => void;
  onOpenStockCheck?: () => void;
  onOpenQuarantineRma?: () => void;
  onBulkSaveProducts?: (products: Product[], mergeWithExisting: boolean) => void;
  onClearAllProducts?: () => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  products,
  settings,
  sales,
  purchases,
  stockAdjustments,
  stockAudits,
  priceChanges,
  damageLogs: initialDamageLogs,
  staffUsers,
  onSaveProduct,
  onDeleteProduct,
  onOpenProductHistory,
  onOpenStockCheck,
  onOpenQuarantineRma,
  onBulkSaveProducts,
  onClearAllProducts,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedRam, setSelectedRam] = useState<string>('all');
  const [selectedRom, setSelectedRom] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
  const [focFilter, setFocFilter] = useState<'all' | 'gift_only' | 'standard_only'>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);
  const [barcodeModalTarget, setBarcodeModalTarget] = useState<{ product: Product; imei?: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);
  const [isWholeLogModalOpen, setIsWholeLogModalOpen] = useState<boolean>(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Valuation display mode ('retail' = selling price value, 'cost' = stock purchase cost value)
  const [valuationMode, setValuationMode] = useState<'retail' | 'cost'>(() => {
    try {
      const saved = localStorage.getItem('inventory_valuation_mode');
      if (saved === 'retail' || saved === 'cost') return saved;
    } catch {
      // fallback
    }
    return 'retail';
  });

  const handleValuationModeChange = (mode: 'retail' | 'cost') => {
    setValuationMode(mode);
    try {
      localStorage.setItem('inventory_valuation_mode', mode);
    } catch {
      // ignore
    }
  };

  // Quarantine & Damage Management States (3-Phase System)
  const [isQuarantineReportOpen, setIsQuarantineReportOpen] = useState<boolean>(false);
  const [selectedProductForQuarantine, setSelectedProductForQuarantine] = useState<Product | null>(null);
  const [isQuarantineManagerOpen, setIsQuarantineManagerOpen] = useState<boolean>(false);
  const [quarantineManagerTargetLogId, setQuarantineManagerTargetLogId] = useState<string | null>(null);
  
  // Count of items currently in Quarantined status awaiting manager action
  const damageLogs = useMemo(() => StorageService.getDamageLogs(), [products]);
  const quarantinedCount = useMemo(() => damageLogs.filter(l => l.status === 'Quarantined').length, [damageLogs]);
  
  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('inventory_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {
      item_model: true,
      category_condition: true,
      cost_price: true,
      selling_price: true,
      margin: true,
      stock_level: true,
      imei_serials: true,
      actions: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('inventory_visible_columns', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const activeColumnCount = useMemo(() => {
    return INVENTORY_COLUMNS.filter(col => visibleColumns[col.id] !== false).length;
  }, [visibleColumns]);

  // Adjustable Column Widths State (Persistent in localStorage)
  const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    item_model: 270,
    category_condition: 180,
    cost_price: 125,
    selling_price: 125,
    margin: 95,
    stock_level: 115,
    imei_serials: 220,
    actions: 95,
  };

  const MIN_COLUMN_WIDTHS: Record<string, number> = {
    item_model: 150,
    category_condition: 120,
    cost_price: 85,
    selling_price: 85,
    margin: 70,
    stock_level: 80,
    imei_serials: 130,
    actions: 75,
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('inventory_table_column_widths');
      if (saved) {
        return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMN_WIDTHS;
  });

  const handleResetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('inventory_table_column_widths');
    } catch {
      // ignore
    }
  };

  const resizingRef = useRef<{
    field: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleResizeStart = (field: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[field] || DEFAULT_COLUMN_WIDTHS[field] || 120;
    resizingRef.current = {
      field,
      startX: e.clientX,
      startWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const deltaX = moveEvent.clientX - resizingRef.current.startX;
      const minW = MIN_COLUMN_WIDTHS[resizingRef.current.field] || 70;
      const newWidth = Math.max(minW, Math.round(resizingRef.current.startWidth + deltaX));
      setColumnWidths(prev => {
        const updated = {
          ...prev,
          [resizingRef.current!.field]: newWidth,
        };
        try {
          localStorage.setItem('inventory_table_column_widths', JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Actions dropdown state
  const [openActionMenu, setOpenActionMenu] = useState<{
    productId: string;
    product: Product;
    top: number;
    right: number;
  } | null>(null);

  useEffect(() => {
    if (!openActionMenu) return;
    const handleScrollOrResize = () => setOpenActionMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenActionMenu(null);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenu]);
  
  // Real-time Barcode Scanner State
  const [scannedFeedback, setScannedFeedback] = useState<{
    code: string;
    matchedCount: number;
    timestamp: number;
  } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState<boolean>(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Play gentle audio feedback for scanner detection
  const playScanBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {
      // Audio context might be restricted before interaction
    }
  };

  // Real-time hardware barcode scanner detection (wedge listener)
  useEffect(() => {
    if (!isScannerActive || isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e || typeof e.key !== 'string') return;

      // If user is typing in an input element other than search, let them type
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        if (target.id !== 'inventory-search-input') {
          return;
        }
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Hardware scanners type very rapidly (< 55ms between keys)
      if (e.key === 'Enter') {
        const scanned = (barcodeBufferRef.current || '').trim();
        if (scanned && scanned.length >= 3) {
          e.preventDefault();
          // Apply scanned barcode/IMEI directly to search filter
          setSearchQuery(scanned);
          setSelectedCategory('all');
          setSelectedSubCategory('all');
          setSelectedBrand('all');
          setSelectedRam('all');
          setSelectedRom('all');
          setSelectedColor('all');
          playScanBeep();

          // Calculate matches safely
          const q = scanned.toLowerCase();
          const matches = (products || []).filter(p => {
            if (!p) return false;
            const barcode = (p.barcode || '').toLowerCase();
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            const hasImei = Array.isArray(p.imeiList) && p.imeiList.some(im => (im || '').toLowerCase() === q);
            const hasImeiPair = Array.isArray(p.imeiPairs) && p.imeiPairs.some(pair =>
              (pair?.imei1 || '').toLowerCase() === q || (pair?.imei2 || '').toLowerCase() === q
            );
            return barcode === q || sku === q || name.includes(q) || hasImei || hasImeiPair;
          });

          setScannedFeedback({
            code: scanned,
            matchedCount: matches.length,
            timestamp: Date.now(),
          });

          // Focus search input
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            searchInputRef.current.select();
          }
        }
        barcodeBufferRef.current = '';
        return;
      }

      // Ignore modifier keys or non-single characters
      if (!e.key || e.key.length !== 1) return;

      // If keys come with long delay (> 80ms) and user is not in search input, reset buffer
      if (timeDiff > 80 && (!target || target.id !== 'inventory-search-input')) {
        barcodeBufferRef.current = e.key;
      } else {
        barcodeBufferRef.current = (barcodeBufferRef.current || '') + e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isScannerActive, isModalOpen, products]);

  // Close category dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Financial Stock Valuation
  const safeProducts = useMemo(() => Array.isArray(products) ? products.filter(Boolean) : [], [products]);
  const totalUnits = safeProducts.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  const totalCostValuation = safeProducts.reduce((s, p) => s + ((Number(p.costPrice) || 0) * (Number(p.stock) || 0)), 0);
  const totalRetailValuation = safeProducts.reduce((s, p) => s + ((Number(p.sellingPrice) || 0) * (Number(p.stock) || 0)), 0);
  const projectedGrossProfit = totalRetailValuation - totalCostValuation;
  const lowStockItems = safeProducts.filter(p => {
    const min = typeof p.minStockAlert === 'number' ? p.minStockAlert : 0;
    const stock = Number(p.stock) || 0;
    return min > 0 ? stock <= min : stock <= 0;
  });
  const focGiftProducts = useMemo(() => safeProducts.filter(p => Boolean(p.isGiftItem)), [safeProducts]);
  const focGiftUnits = useMemo(() => focGiftProducts.reduce((s, p) => s + (Number(p.stock) || 0), 0), [focGiftProducts]);

  // Available Brands for current category selection (with model count & physical stock units)
  const availableBrands = useMemo(() => {
    const targetProducts = selectedCategory === 'all'
      ? safeProducts
      : safeProducts.filter(p => p && canonicalCategory(p.category) === selectedCategory);

    const brandMap = new Map<string, { count: number; stock: number }>();
    targetProducts.forEach(p => {
      if (p && p.brand && p.brand.trim()) {
        const b = p.brand.trim();
        const prev = brandMap.get(b) || { count: 0, stock: 0 };
        brandMap.set(b, {
          count: prev.count + 1,
          stock: prev.stock + (Number(p.stock) || 0)
        });
      }
    });

    return Array.from(brandMap.entries())
      .map(([name, data]) => ({ name, count: data.count, stock: data.stock }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [safeProducts, selectedCategory]);

  // Available Subcategories for current category & brand selection
  const availableSubCategories = useMemo(() => {
    const targetProducts = safeProducts.filter(p => {
      if (!p) return false;
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const subMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (p && p.subCategory && p.subCategory.trim()) {
        const sub = p.subCategory.trim();
        subMap.set(sub, (subMap.get(sub) || 0) + 1);
      }
    });

    return Array.from(subMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [safeProducts, selectedCategory, selectedBrand]);

  // Available RAM options (extracted from phone products)
  const availableRams = useMemo(() => {
    const targetProducts = safeProducts.filter(p => {
      if (!p) return false;
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const ramMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (!p) return;
      const isPhone = isPhoneCategory(p.category);
      if (p.ram && p.ram.trim() && p.ram !== '-') {
        const r = p.ram.trim().toUpperCase();
        ramMap.set(r, (ramMap.get(r) || 0) + 1);
      } else if (isPhone && p.storage && p.storage.toUpperCase().includes('RAM')) {
        const ramMatch = p.storage.match(/(\d+GB)\s*RAM/i);
        if (ramMatch) {
          const r = ramMatch[1].toUpperCase();
          ramMap.set(r, (ramMap.get(r) || 0) + 1);
        }
      }
    });

    return Array.from(ramMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const numA = parseInt(a.name) || 0;
        const numB = parseInt(b.name) || 0;
        return numA - numB;
      });
  }, [safeProducts, selectedCategory, selectedBrand]);

  // Available ROM / Storage options (extracted from phone products)
  const availableRoms = useMemo(() => {
    const targetProducts = safeProducts.filter(p => {
      if (!p) return false;
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const romMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (!p) return;
      const isPhone = isPhoneCategory(p.category);
      if (p.rom && p.rom.trim() && p.rom !== '-') {
        const r = p.rom.trim().toUpperCase();
        romMap.set(r, (romMap.get(r) || 0) + 1);
      } else if (isPhone && p.storage) {
        const match = p.storage.match(/^(\d+(?:GB|TB))/i);
        if (match) {
          const r = match[1].toUpperCase();
          romMap.set(r, (romMap.get(r) || 0) + 1);
        }
      }
    });

    return Array.from(romMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const getBytes = (s: string) => {
          const num = parseInt(s) || 0;
          if (s.includes('TB')) return num * 1024;
          return num;
        };
        return getBytes(a.name) - getBytes(b.name);
      });
  }, [safeProducts, selectedCategory, selectedBrand]);

  // Available Color options
  const availableColors = useMemo(() => {
    const targetProducts = safeProducts.filter(p => {
      if (!p) return false;
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const colorMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (p && p.color && p.color.trim()) {
        const c = p.color.trim();
        colorMap.set(c, (colorMap.get(c) || 0) + 1);
      }
    });

    return Array.from(colorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [safeProducts, selectedCategory, selectedBrand]);

  // Total count & physical quantity metrics in currently active category
  const categoryStats = useMemo(() => {
    const targetProducts = selectedCategory === 'all'
      ? safeProducts
      : safeProducts.filter(p => p && canonicalCategory(p.category) === selectedCategory);

    const modelCount = targetProducts.length;
    const totalQuantity = targetProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const inStockCount = targetProducts.filter(p => (Number(p.stock) || 0) > 0).length;
    const outOfStockCount = targetProducts.filter(p => (Number(p.stock) || 0) <= 0).length;

    return {
      modelCount,
      totalQuantity,
      inStockCount,
      outOfStockCount,
    };
  }, [safeProducts, selectedCategory]);

  const currentCategoryCount = categoryStats.modelCount;

  // Total count & physical quantity when brand filter is active
  const activeBrandStats = useMemo(() => {
    if (selectedBrand === 'all') return categoryStats;
    const targetProducts = safeProducts.filter(p => {
      if (!p) return false;
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase();
      return matchCat && matchBrand;
    });

    return {
      modelCount: targetProducts.length,
      totalQuantity: targetProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0),
      inStockCount: targetProducts.filter(p => (Number(p.stock) || 0) > 0).length,
      outOfStockCount: targetProducts.filter(p => (Number(p.stock) || 0) <= 0).length,
    };
  }, [safeProducts, selectedCategory, selectedBrand, categoryStats]);

  // Check whether current category or catalog involves phone products
  const isPhoneCategoryActive = selectedCategory === 'all' || isPhoneCategory(selectedCategory as ProductCategory);

  // Smart Multi-Token Filtering & Search
  const filteredProducts = useMemo(() => {
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return safeProducts.filter(p => {
      if (!p) return false;
      const matchesCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchesSubCat = selectedSubCategory === 'all' || 
        (p.subCategory && p.subCategory.toLowerCase() === selectedSubCategory.toLowerCase());
      const matchesBrand = selectedBrand === 'all' ||
        (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());

      // RAM match
      const pRamNormalized = (p.ram || '').toUpperCase();
      const storageRamMatch = (p.storage || '').match(/(\d+GB)\s*RAM/i);
      const extractedRam = storageRamMatch ? storageRamMatch[1].toUpperCase() : '';
      const matchesRam = selectedRam === 'all' || 
        pRamNormalized === selectedRam.toUpperCase() || 
        extractedRam === selectedRam.toUpperCase();

      // ROM match
      const pRomNormalized = (p.rom || '').toUpperCase();
      const storageRomMatch = (p.storage || '').match(/^(\d+(?:GB|TB))/i);
      const extractedRom = storageRomMatch ? storageRomMatch[1].toUpperCase() : '';
      const matchesRom = selectedRom === 'all' ||
        pRomNormalized === selectedRom.toUpperCase() ||
        extractedRom === selectedRom.toUpperCase() ||
        (p.storage && p.storage.toUpperCase().includes(selectedRom.toUpperCase()));

      // Color match
      const matchesColor = selectedColor === 'all' ||
        (p.color && p.color.toLowerCase() === selectedColor.toLowerCase());

      const minAlert = typeof p.minStockAlert === 'number' ? p.minStockAlert : 0;
      const matchesLowStock = !showLowStockOnly || (minAlert > 0 ? p.stock <= minAlert : p.stock <= 0);
      const matchesFoc = focFilter === 'all'
        ? true
        : focFilter === 'gift_only'
          ? Boolean(p.isGiftItem)
          : !p.isGiftItem;

      if (!matchesCat || !matchesSubCat || !matchesBrand || !matchesRam || !matchesRom || !matchesColor || !matchesLowStock || !matchesFoc) {
        return false;
      }

      if (tokens.length === 0) return true;

      // Searchable string containing all metadata (Name, Brand, Model, RAM, ROM, Storage, Color, Category, Subcategory, SKU, Barcode, Condition, IMEI)
      const searchableParts = [
        p.name,
        p.brand,
        p.model,
        p.category,
        p.subCategory,
        p.ram,
        p.rom,
        p.storage,
        p.color,
        p.sku,
        p.barcode,
        p.condition,
        p.description,
        p.isGiftItem ? 'foc gift free လက်ဆောင်' : '',
        ...(p.imeiList || [])
      ];

      const searchableText = searchableParts.filter(Boolean).join(' ').toLowerCase();

      // Every word typed in the search box must match at least one attribute
      return tokens.every(token => searchableText.includes(token));
    });
  }, [products, selectedCategory, selectedSubCategory, selectedBrand, selectedRam, selectedRom, selectedColor, showLowStockOnly, focFilter, searchQuery]);

  // Financial metrics for filtered / catalog listed items
  const filteredUnits = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  }, [filteredProducts]);

  const filteredRetailAmount = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + ((Number(p.sellingPrice) || 0) * (Number(p.stock) || 0)), 0);
  }, [filteredProducts]);

  const filteredCostAmount = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + ((Number(p.costPrice) || 0) * (Number(p.stock) || 0)), 0);
  }, [filteredProducts]);

  // Granular row selection state for user-selected items
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const selectedProducts = useMemo(() => {
    if (selectedProductIds.size === 0) return [];
    return safeProducts.filter(p => selectedProductIds.has(p.id));
  }, [safeProducts, selectedProductIds]);

  const selectedUnits = useMemo(() => {
    return selectedProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  }, [selectedProducts]);

  const selectedRetailAmount = useMemo(() => {
    return selectedProducts.reduce((sum, p) => sum + ((Number(p.sellingPrice) || 0) * (Number(p.stock) || 0)), 0);
  }, [selectedProducts]);

  const selectedCostAmount = useMemo(() => {
    return selectedProducts.reduce((sum, p) => sum + ((Number(p.costPrice) || 0) * (Number(p.stock) || 0)), 0);
  }, [selectedProducts]);

  // Interactive Column Sorting
  const { sortField, sortDirection, handleSort, sortItems } = useTableSort<Product>();

  const sortedProducts = useMemo(() => {
    return sortItems(filteredProducts, {
      item_model: (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }),
      category_condition: (a, b) => (a.category || '').localeCompare(b.category || ''),
      cost_price: (a, b) => (a.costPrice || 0) - (b.costPrice || 0),
      selling_price: (a, b) => (a.sellingPrice || 0) - (b.sellingPrice || 0),
      margin: (a, b) => {
        const marginA = a.sellingPrice ? ((a.sellingPrice - (a.costPrice || 0)) / a.sellingPrice) : 0;
        const marginB = b.sellingPrice ? ((b.sellingPrice - (b.costPrice || 0)) / b.sellingPrice) : 0;
        return marginA - marginB;
      },
      stock_level: (a, b) => (a.stock || 0) - (b.stock || 0),
      imei_serials: (a, b) => (a.imeiList?.length || 0) - (b.imeiList?.length || 0),
    });
  }, [filteredProducts, sortField, sortDirection]);

  // Header select-all status & handler
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const isAllSelected = useMemo(() => {
    if (sortedProducts.length === 0) return false;
    return sortedProducts.every(p => selectedProductIds.has(p.id));
  }, [sortedProducts, selectedProductIds]);

  const isSomeSelected = useMemo(() => {
    if (selectedProductIds.size === 0) return false;
    return sortedProducts.some(p => selectedProductIds.has(p.id));
  }, [sortedProducts, selectedProductIds]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isSomeSelected && !isAllSelected;
    }
  }, [isSomeSelected, isAllSelected]);

  const handleToggleSelectAll = (e?: React.ChangeEvent<HTMLInputElement> | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isAllSelected) {
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        sortedProducts.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        sortedProducts.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const handleToggleProductSelect = (productId: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleClearSelection = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedProductIds(new Set());
  };

  const categories: { id: string; label: string }[] = [
    { id: 'all', label: 'All Products' },
    ...CANONICAL_CATEGORIES.map(c => ({ id: c.id, label: c.label }))
  ];

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedSubCategory('all');
    setSelectedBrand('all');
    setSelectedRam('all');
    setSelectedRom('all');
    setSelectedColor('all');
  };

  const handleResetAllFilters = () => {
    setSelectedCategory('all');
    setSelectedSubCategory('all');
    setSelectedBrand('all');
    setSelectedRam('all');
    setSelectedRom('all');
    setSelectedColor('all');
    setShowLowStockOnly(false);
    setFocFilter('all');
    setSearchQuery('');
    setScannedFeedback(null);
    setSelectedProductIds(new Set());
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name} from inventory?`)) {
      onDeleteProduct(id);
    }
  };

  const handleExportCsv = () => {
    // Import-first, fully-ordered inventory stock list format
    // Matches bulk import schema for 100% roundtrip compatibility
    const headers = [
      'Product Name',
      'Brand',
      'Category',
      'Subcategory',
      'Condition / Child Category',
      `Cost Price (${settings.currencySymbol})`,
      `Selling Price (${settings.currencySymbol})`,
      'Stock (Units)',
      'Min Alert Level',
      'RAM',
      'ROM',
      'Color',
      'Specs / Storage / Color',
      'SKU',
      'Barcode',
      'Serialized IMEIs',
      'Warranty (Months)',
      'Is_FOC_Gift',
      'FOC_Type',
      'Margin %',
      `Profit Per Unit (${settings.currencySymbol})`,
      'Stock Status',
    ];

    const targetExportList = selectedProductIds.size > 0 ? selectedProducts : filteredProducts;
    const rows = targetExportList.map((p) => {
      const isPhone = isPhoneCategory(p.category);
      const specSummary = [
        p.ram && p.ram !== '-' ? `${p.ram} RAM` : null,
        p.rom || p.storage,
        p.color,
      ].filter(Boolean).join(' • ');

      const margin = p.sellingPrice > 0 ? (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(1) + '%' : '0.0%';
      const profit = p.sellingPrice - p.costPrice;
      const minAlert = typeof p.minStockAlert === 'number' ? p.minStockAlert : 0;
      const isLow = minAlert > 0 ? p.stock <= minAlert : false;
      const status = p.stock <= 0 ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';
      const imeis = p.imeiList && p.imeiList.length > 0 ? p.imeiList.join('; ') : '-';
      const warranty = typeof p.warrantyMonths === 'number' ? p.warrantyMonths : (isPhone ? 12 : 6);
      const isFocVal = p.isGiftItem ? 'Yes' : 'No';
      const focTypeVal = p.isGiftItem ? (p.focType || 'supplier_bonus') : '-';

      return [
        p.name,
        p.brand || '-',
        getCategoryLabel(p.category),
        p.subCategory || '-',
        isPhone ? getConditionLabel(p.condition).label : (p.childCategory || p.variant || '-'),
        p.costPrice,
        p.sellingPrice,
        p.stock,
        minAlert,
        p.ram || '-',
        p.rom || p.storage || '-',
        p.color || '-',
        specSummary || '-',
        p.sku,
        p.barcode || '-',
        imeis,
        warranty,
        isFocVal,
        focTypeVal,
        margin,
        profit,
        status,
      ];
    });

    exportToCsv('Inventory_Stock_List', headers, rows);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setScannedFeedback(null);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  return (
    <div id="inventory-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Valuation Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Units in Stock</span>
            <Package className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{totalUnits}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-500">{products.length} product lines</span>
            <button
              type="button"
              onClick={() => setIsWholeLogModalOpen(true)}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              title="Open dedicated whole inventory audit & movement log"
            >
              View Log &rarr;
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Stock Cost Valuation</span>
            <DollarSign className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(totalCostValuation, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Acquisition capital invested</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Expected Retail Value</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700">
            {formatCurrency(totalRetailValuation, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-emerald-600 mt-1 font-semibold">
            +{formatCurrency(projectedGrossProfit, settings.currencySymbol)} Profit Potential
          </p>
        </div>

        <div className={`p-4 rounded-2xl border shadow-2xs ${
          lowStockItems.length > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-xs font-semibold mb-1">
            <span className={lowStockItems.length > 0 ? 'text-amber-800' : 'text-slate-500'}>Low Stock Alerts</span>
            <AlertTriangle className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-black ${lowStockItems.length > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
            {lowStockItems.length}
          </p>
          <button
            type="button"
            onClick={() => setShowLowStockOnly(!showLowStockOnly)}
            className="text-[11px] font-bold text-amber-700 hover:underline mt-1 block"
          >
            {showLowStockOnly ? 'Show All Items' : 'Filter Low Stock Items'}
          </button>
        </div>

      </div>

      {/* Standalone Product Search & Barcode Scanner Row */}
      <div id="inventory-search-row" className="sticky top-14 sm:top-[60px] z-30 w-full bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-md shadow-slate-200/50 transition-all">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
          <div className="relative flex-1 w-full min-w-0">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400 pointer-events-none">
              <Barcode className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
            <input
              ref={searchInputRef}
              id="inventory-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (val.trim()) {
                  // Live match calculation
                  const q = val.toLowerCase().trim();
                  const matches = products.filter(p => 
                    p.barcode.toLowerCase() === q ||
                    p.sku.toLowerCase() === q ||
                    p.name.toLowerCase().includes(q) ||
                    (p.imeiList && p.imeiList.some(im => im.toLowerCase() === q))
                  );
                  if (matches.length > 0 && (q.length >= 6 || /^\d+$/.test(q))) {
                    setScannedFeedback({
                      code: val.trim(),
                      matchedCount: matches.length,
                      timestamp: Date.now(),
                    });
                  }
                } else {
                  setScannedFeedback(null);
                }
              }}
              placeholder="Scan barcode / IMEI or search SKU, model, brand..."
              className="w-full pl-10 pr-10 py-3 bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 focus:outline-hidden shadow-2xs transition-all font-mono font-medium tracking-wide"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all cursor-pointer"
                title="Clear scanner filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scanner Status Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsScannerActive(!isScannerActive)}
              className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs whitespace-nowrap w-full sm:w-auto ${
                isScannerActive 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' 
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
              title={isScannerActive ? "Real-time hardware scanner is active" : "Scanner listener paused"}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isScannerActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <ScanLine className="w-3.5 h-3.5 shrink-0" />
              <span>{isScannerActive ? 'Scanner Active' : 'Scanner Paused'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action Toolbar Row (Add Product, Damage Report, Quarantine, Bulk Import, etc.) */}
      <div id="inventory-action-toolbar" className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="open-report-damage-btn"
            type="button"
            onClick={() => {
              setSelectedProductForQuarantine(null);
              setIsQuarantineReportOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-xs rounded-xl border border-amber-200 shadow-2xs transition-all cursor-pointer"
            title="Phase 1: Report damage and immediately isolate item from sellable POS inventory"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Report Damage</span>
          </button>

          <button
            id="open-quarantine-manager-btn"
            type="button"
            onClick={() => {
              if (onOpenQuarantineRma) {
                onOpenQuarantineRma();
              } else {
                setIsQuarantineManagerOpen(true);
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer"
            title="Phase 2 & 3: Manager Assessment & Final Disposition Hub (RMA, Write-Off, B-Stock)"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Quarantine & RMA</span>
            {quarantinedCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white font-black text-[10px] rounded-full">
                {quarantinedCount}
              </span>
            )}
          </button>

          <button
            id="open-bulk-import-btn"
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold text-xs rounded-xl border border-emerald-200 shadow-2xs transition-all cursor-pointer"
            title="Bulk import products from CSV template or spreadsheet paste"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Bulk Import</span>
          </button>

          <button
            id="inventory-foc-gifts-btn"
            type="button"
            onClick={() => setFocFilter(focFilter === 'gift_only' ? 'all' : 'gift_only')}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              focFilter === 'gift_only'
                ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-200'
            }`}
            title="Filter and manage Free Of Charge (FOC) promotional gifts & bonus stock"
          >
            <Gift className={`w-4 h-4 shrink-0 ${focFilter === 'gift_only' ? 'text-white' : 'text-purple-600'}`} />
            <span>🎁 FOC Gifts</span>
            {focGiftProducts.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-black ${
                focFilter === 'gift_only' ? 'bg-white text-purple-900' : 'bg-purple-200 text-purple-900'
              }`}>
                {focGiftProducts.length}
              </span>
            )}
          </button>

          <button
            id="open-whole-inventory-log-btn"
            type="button"
            onClick={() => setIsWholeLogModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-950 font-bold text-xs rounded-xl border border-indigo-200 shadow-2xs transition-all cursor-pointer"
            title="Dedicated Window: Master chronological audit log of all inventory movements, price changes, sales, and quarantines"
          >
            <History className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Whole Inventory Log</span>
          </button>

          {onClearAllProducts && safeProducts.length > 0 && (
            <button
              id="clear-all-products-btn"
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to remove all products from inventory? This cannot be undone.')) {
                  onClearAllProducts();
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs transition-all cursor-pointer"
              title="Remove all products from inventory"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Clear Products</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {onOpenStockCheck && (
            <button
              id="open-stock-check-btn"
              type="button"
              onClick={onOpenStockCheck}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-indigo-950 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Stock Audit</span>
            </button>
          )}

          <button
            id="open-add-product-btn"
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>+ Add Item</span>
          </button>
        </div>
      </div>

      {/* Real-Time Scan Feedback Banner */}
      {scannedFeedback && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/80 rounded-2xl text-xs shadow-2xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Zap className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-950">Barcode Filter Applied:</span>
                <span className="font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-indigo-200 text-indigo-800 text-[11px]">
                  {scannedFeedback.code}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {scannedFeedback.matchedCount > 0 
                  ? `Found ${scannedFeedback.matchedCount} matching inventory product(s)` 
                  : 'No inventory items match this scanned code'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClearSearch}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 transition-all text-[11px] cursor-pointer shadow-2xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filter</span>
            </button>
          </div>
        </div>
      )}

      {/* Category Dropdown (Minimalist Design) & Quantity Summary Beside Its Box */}
      <div id="inventory-category-dropdown-container" className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative inline-block" ref={categoryDropdownRef}>
            <button
              id="inventory-category-select-btn"
              type="button"
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              className={`inline-flex items-center justify-between gap-3 px-3.5 py-2 bg-white hover:bg-slate-50/90 text-slate-800 text-xs rounded-xl border transition-all cursor-pointer min-w-[210px] shadow-2xs ${
                isCategoryDropdownOpen ? 'border-indigo-400 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'
              }`}
              aria-haspopup="listbox"
              aria-expanded={isCategoryDropdownOpen}
              title={`${categories.find(c => c.id === selectedCategory)?.label || 'All Products'}: ${categoryStats.modelCount} models, ${categoryStats.totalQuantity} total in-stock units`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-slate-400 font-medium text-[11px]">Category:</span>
                <span className="font-bold text-slate-900 truncate">
                  {categories.find(c => c.id === selectedCategory)?.label || 'All Products'}
                </span>
                <span 
                  className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold"
                  title={`${categoryStats.modelCount} Product Models • ${categoryStats.totalQuantity} Total In-Stock Units`}
                >
                  {categoryStats.modelCount} items • {categoryStats.totalQuantity} qty
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ${isCategoryDropdownOpen ? 'rotate-180 text-slate-700' : ''}`} />
            </button>

            {/* Dropdown Menu Popover */}
            {isCategoryDropdownOpen && (
              <div 
                id="inventory-category-dropdown-menu"
                className="absolute top-full left-0 mt-1.5 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-1 z-30 animate-in fade-in zoom-in-95 duration-150"
                role="listbox"
              >
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Select Category
                </div>
                <div className="space-y-0.5 max-h-72 overflow-y-auto">
                  {categories.map(cat => {
                    const isSelected = selectedCategory === cat.id;
                    const catProducts = cat.id === 'all' 
                      ? safeProducts 
                      : safeProducts.filter(p => p && canonicalCategory(p.category) === cat.id);
                    const count = catProducts.length;
                    const catStock = catProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          handleCategoryChange(cat.id);
                          setIsCategoryDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          isSelected 
                            ? 'bg-slate-100 text-slate-900 font-bold' 
                            : 'text-slate-700 hover:bg-slate-50 font-medium'
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="truncate">{cat.label}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-slate-200 text-slate-800 font-bold' : 'text-slate-500 bg-slate-50'
                          }`}>
                            {count} models • {catStock} qty
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-slate-900 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Beside its box: Total items counts & quantity badges */}
          <div 
            id="inventory-category-totals-pill"
            className="inline-flex items-center gap-2 sm:gap-3 px-3 py-1.5 bg-white border border-slate-200 shadow-2xs rounded-xl text-xs"
            title={`Current view summary: ${(selectedBrand !== 'all' ? activeBrandStats.totalQuantity : categoryStats.totalQuantity).toLocaleString()} total in-stock units across ${(selectedBrand !== 'all' ? activeBrandStats.modelCount : categoryStats.modelCount)} product models`}
          >
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[11px] font-medium text-slate-500">Total Quantity:</span>
              <span className="font-mono font-black text-indigo-700 text-sm">
                {(selectedBrand !== 'all' ? activeBrandStats.totalQuantity : categoryStats.totalQuantity).toLocaleString()}
              </span>
              <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">units</span>
            </div>

            <span className="text-slate-200">|</span>

            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-500 font-medium">Items / Models:</span>
              <span className="font-mono font-bold text-slate-800">
                {selectedBrand !== 'all' ? activeBrandStats.modelCount : categoryStats.modelCount}
              </span>
              <span className="text-slate-400 text-[10px]">models</span>
            </div>

            {selectedBrand !== 'all' && (
              <>
                <span className="text-slate-200">|</span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                  Brand: {selectedBrand}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick Reset Filter Shortcut if filtered */}
        {selectedCategory !== 'all' && (
          <button
            type="button"
            onClick={() => handleCategoryChange('all')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Reset to all categories"
          >
            <X className="w-3 h-3" />
            <span>Show All Categories</span>
          </button>
        )}
      </div>

      {/* Multi-Dimensional Filter Hub (Brand, Phone RAM/ROM Specs & Subcategories) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
        
        {/* Row 1: Brand Filtering */}
        <div id="inventory-brand-filter-bar" className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-slate-700 font-bold shrink-0 text-[11px] px-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
              <span>Brand:</span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedBrand('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                selectedBrand === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
              title={`All Brands: ${categoryStats.modelCount} models, ${categoryStats.totalQuantity} total in-stock units`}
            >
              All Brands ({categoryStats.modelCount})
              <span className={`ml-1 text-[10px] ${selectedBrand === 'all' ? 'text-indigo-200' : 'text-slate-500 font-normal'}`}>
                • {categoryStats.totalQuantity} qty
              </span>
            </button>

            {availableBrands.map(b => (
              <button
                key={b.name}
                type="button"
                onClick={() => setSelectedBrand(selectedBrand.toLowerCase() === b.name.toLowerCase() ? 'all' : b.name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  selectedBrand.toLowerCase() === b.name.toLowerCase()
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title={`${b.name}: ${b.count} model${b.count === 1 ? '' : 's'} • ${b.stock} in-stock unit${b.stock === 1 ? '' : 's'}`}
              >
                <span>{b.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  selectedBrand.toLowerCase() === b.name.toLowerCase()
                    ? 'bg-indigo-700 text-indigo-100'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {b.count} <span className="opacity-75 font-normal">({b.stock}u)</span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
            {availableBrands.length > 0 && (
              <select
                id="inventory-brand-dropdown"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-hidden cursor-pointer"
              >
                <option value="all">
                  All Brands ({categoryStats.modelCount} models • {categoryStats.totalQuantity} qty)
                </option>
                {availableBrands.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count} models • {b.stock} qty)
                  </option>
                ))}
              </select>
            )}

            {selectedBrand !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedBrand('all')}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                title="Clear brand filter"
              >
                <X className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Phone Spec Filters (RAM & ROM) - Shown for phone categories or when RAM/ROM data exists */}
        {isPhoneCategoryActive && (availableRams.length > 0 || availableRoms.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200/80">
            
            {/* RAM Filter */}
            <div className="bg-white/80 border border-slate-200 rounded-xl p-2 flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex items-center gap-1.5 text-indigo-700 font-bold shrink-0 text-[11px] px-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                <span>RAM:</span>
              </div>

              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedRam('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    selectedRam === 'all'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                {availableRams.map(r => (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => setSelectedRam(selectedRam.toLowerCase() === r.name.toLowerCase() ? 'all' : r.name)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                      selectedRam.toLowerCase() === r.name.toLowerCase()
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{r.name}</span>
                    <span className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                      selectedRam.toLowerCase() === r.name.toLowerCase()
                        ? 'bg-indigo-700 text-indigo-100'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {r.count}
                    </span>
                  </button>
                ))}
              </div>

              {selectedRam !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedRam('all')}
                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                  title="Clear RAM filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* ROM / Storage Filter */}
            <div className="bg-white/80 border border-slate-200 rounded-xl p-2 flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex items-center gap-1.5 text-purple-700 font-bold shrink-0 text-[11px] px-1">
                <HardDrive className="w-3.5 h-3.5 text-purple-600" />
                <span>ROM:</span>
              </div>

              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedRom('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    selectedRom === 'all'
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                {availableRoms.map(r => (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => setSelectedRom(selectedRom.toLowerCase() === r.name.toLowerCase() ? 'all' : r.name)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                      selectedRom.toLowerCase() === r.name.toLowerCase()
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{r.name}</span>
                    <span className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                      selectedRom.toLowerCase() === r.name.toLowerCase()
                        ? 'bg-purple-700 text-purple-100'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {r.count}
                    </span>
                  </button>
                ))}
              </div>

              {selectedRom !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedRom('all')}
                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                  title="Clear ROM filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

          </div>
        )}

        {/* Row 3: Subcategory Filter Section */}
        {availableSubCategories.length > 0 && (
          <div id="inventory-subcategory-filter-bar" className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 text-xs">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-slate-600 font-bold shrink-0 text-[11px] px-1">
                <Tag className="w-3.5 h-3.5 text-indigo-600" />
                <span>Subcategory:</span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSubCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  selectedSubCategory === 'all'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All Subcategories
              </button>

              {availableSubCategories.map(sub => (
                <button
                  key={sub.name}
                  type="button"
                  onClick={() => setSelectedSubCategory(selectedSubCategory.toLowerCase() === sub.name.toLowerCase() ? 'all' : sub.name)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    selectedSubCategory.toLowerCase() === sub.name.toLowerCase()
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{sub.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    selectedSubCategory.toLowerCase() === sub.name.toLowerCase()
                      ? 'bg-slate-900 text-slate-100'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {sub.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
              <select
                id="inventory-subcategory-dropdown"
                value={selectedSubCategory}
                onChange={(e) => setSelectedSubCategory(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Subcategories</option>
                {availableSubCategories.map(sub => (
                  <option key={sub.name} value={sub.name}>
                    {sub.name} ({sub.count})
                  </option>
                ))}
              </select>

              {selectedSubCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedSubCategory('all')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                  title="Clear subcategory filter"
                >
                  <X className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Row 4: Color Variant Filter Section */}
        {availableColors.length > 0 && (
          <div id="inventory-color-filter-bar" className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80 text-xs">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-amber-800 font-bold shrink-0 text-[11px] px-1">
                <Palette className="w-3.5 h-3.5 text-amber-600" />
                <span>Color:</span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedColor('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  selectedColor === 'all'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All Colors
              </button>

              {availableColors.map(c => {
                const isSelected = selectedColor.toLowerCase() === c.name.toLowerCase();
                const dotColor = getColorDotHex(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedColor(isSelected ? 'all' : c.name)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span>{c.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isSelected
                        ? 'bg-amber-700 text-amber-100'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {c.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
              <select
                id="inventory-color-dropdown"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Colors</option>
                {availableColors.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>

              {selectedColor !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedColor('all')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                  title="Clear color filter"
                >
                  <X className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Active Filters Summary Strip */}
      {(selectedBrand !== 'all' || selectedRam !== 'all' || selectedRom !== 'all' || selectedColor !== 'all' || selectedSubCategory !== 'all' || selectedCategory !== 'all' || searchQuery || showLowStockOnly || focFilter !== 'all') && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs flex-wrap animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 font-bold text-[11px]">Active Filters ({filteredProducts.length} results):</span>
            
            {focFilter === 'gift_only' && (
              <span className="inline-flex items-center gap-1 bg-purple-100 border border-purple-300 text-purple-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                <Gift className="w-3 h-3 text-purple-600" />
                <span>FOC Gifts Only</span>
                <button onClick={() => setFocFilter('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {focFilter === 'standard_only' && (
              <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                <span>Standard Stock Only</span>
                <button onClick={() => setFocFilter('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {selectedCategory !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                Category: {getCategoryLabel(selectedCategory as ProductCategory)}
                <button onClick={() => setSelectedCategory('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {selectedBrand !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                Brand: {selectedBrand}
                <button onClick={() => setSelectedBrand('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {selectedRam !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                RAM: {selectedRam}
                <button onClick={() => setSelectedRam('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {selectedRom !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-white border border-purple-200 text-purple-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                ROM: {selectedRom}
                <button onClick={() => setSelectedRom('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {selectedColor !== 'all' && (
              <span className="inline-flex items-center gap-1.5 bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                <span
                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                  style={{ backgroundColor: getColorDotHex(selectedColor) }}
                />
                <span>Color: {selectedColor}</span>
                <button onClick={() => setSelectedColor('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {selectedSubCategory !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                Sub: {selectedSubCategory}
                <button onClick={() => setSelectedSubCategory('all')} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {showLowStockOnly && (
              <span className="inline-flex items-center gap-1 bg-amber-100 border border-amber-300 text-amber-900 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                Low Stock Only
                <button onClick={() => setShowLowStockOnly(false)} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}

            {searchQuery && (
              <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                Search: "{searchQuery}"
                <button onClick={handleClearSearch} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleResetAllFilters}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-100/50 px-2.5 py-1 rounded-lg border border-indigo-200 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset All Filters</span>
          </button>
        </div>
      )}

      {/* Inventory Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        
        {/* Table Top Header Bar with Column Filter and Ledger Stats */}
        <div className="p-3.5 sm:px-4 sm:py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-900">
              Stock Ledger & Catalog ({filteredProducts.length} Items Listed)
            </span>
            {showLowStockOnly && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                Low Stock Filter
              </span>
            )}
            <div className="inline-flex items-center p-0.5 bg-slate-200/80 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFocFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  focFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFocFilter('gift_only')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  focFilter === 'gift_only'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50'
                }`}
                title="Filter FOC & Promotional Gift Items"
              >
                <Gift className="w-3 h-3" />
                <span>🎁 FOC Gifts ({focGiftProducts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFocFilter('standard_only')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  focFilter === 'standard_only'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Standard
              </button>
            </div>

            {/* Total Units & Valuation Amount of Selected / Listed Items (Circled in UI) */}
            {(() => {
              const activeRetail = selectedProductIds.size > 0 ? selectedRetailAmount : filteredRetailAmount;
              const activeCost = selectedProductIds.size > 0 ? selectedCostAmount : filteredCostAmount;
              const activeValuationAmount = valuationMode === 'retail' ? activeRetail : activeCost;
              const isCostMode = valuationMode === 'cost';

              return (
                <div 
                  id="selected-items-total-units-badge"
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shadow-2xs ${
                    selectedProductIds.size > 0
                      ? 'bg-indigo-600 text-white border-indigo-700 ring-2 ring-indigo-200 shadow-xs'
                      : 'bg-white text-slate-800 border-indigo-200/90 hover:border-indigo-300'
                  }`}
                  title={
                    selectedProductIds.size > 0
                      ? `${selectedProductIds.size} items individually selected. Total stock: ${selectedUnits.toLocaleString()} units. ${isCostMode ? 'Stock Value' : 'Retail Value'}: ${formatCurrency(activeValuationAmount, settings.currencySymbol)} (Alternative: ${formatCurrency(isCostMode ? activeRetail : activeCost, settings.currencySymbol)})`
                      : `Total stock of listed items: ${filteredUnits.toLocaleString()} units. ${isCostMode ? 'Stock Value' : 'Retail Value'}: ${formatCurrency(activeValuationAmount, settings.currencySymbol)} (Alternative: ${formatCurrency(isCostMode ? activeRetail : activeCost, settings.currencySymbol)})`
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {selectedProductIds.size > 0 ? (
                      <CheckCircle className="w-3.5 h-3.5 text-white shrink-0" />
                    ) : (
                      <Package className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    )}
                    <span className={`text-[11px] font-semibold ${selectedProductIds.size > 0 ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {selectedProductIds.size > 0 ? `Selected (${selectedProductIds.size}):` : 'Total Units:'}
                    </span>
                    <span className={`font-mono text-xs font-black ${selectedProductIds.size > 0 ? 'text-white' : 'text-indigo-950'}`}>
                      {(selectedProductIds.size > 0 ? selectedUnits : filteredUnits).toLocaleString()} Units
                    </span>
                  </div>

                  <span className={`h-3.5 w-px ${selectedProductIds.size > 0 ? 'bg-indigo-400' : 'bg-slate-200'}`} />

                  <div className="flex items-center gap-1.5 text-[11px]">
                    {/* Toggle Button between Retail Value and Stock Value */}
                    <div 
                      className={`inline-flex items-center p-0.5 rounded-lg border text-[10px] font-bold ${
                        selectedProductIds.size > 0 
                          ? 'bg-indigo-700/80 border-indigo-500/50 text-indigo-100' 
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                      role="group"
                      aria-label="Valuation mode toggle"
                    >
                      <button
                        type="button"
                        onClick={() => handleValuationModeChange('retail')}
                        className={`px-1.5 py-0.5 rounded-md transition-all cursor-pointer ${
                          !isCostMode
                            ? selectedProductIds.size > 0
                              ? 'bg-white text-indigo-900 shadow-2xs font-black'
                              : 'bg-white text-slate-900 shadow-2xs font-black'
                            : selectedProductIds.size > 0
                              ? 'text-indigo-200 hover:text-white'
                              : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Display Retail Value (Selling Price)"
                      >
                        Retail
                      </button>
                      <button
                        type="button"
                        onClick={() => handleValuationModeChange('cost')}
                        className={`px-1.5 py-0.5 rounded-md transition-all cursor-pointer ${
                          isCostMode
                            ? selectedProductIds.size > 0
                              ? 'bg-amber-300 text-slate-950 shadow-2xs font-black'
                              : 'bg-indigo-600 text-white shadow-2xs font-black'
                            : selectedProductIds.size > 0
                              ? 'text-indigo-200 hover:text-white'
                              : 'text-slate-500 hover:text-slate-800'
                        }`}
                        title="Display Stock Value (Purchase Cost)"
                      >
                        Stock
                      </button>
                    </div>

                    <span 
                      className={`font-mono font-bold text-xs ${
                        selectedProductIds.size > 0 
                          ? isCostMode ? 'text-amber-300' : 'text-amber-200' 
                          : isCostMode ? 'text-indigo-700 font-black' : 'text-emerald-700 font-black'
                      }`}
                      title={`${isCostMode ? 'Stock Cost Value' : 'Retail Selling Value'}: ${formatCurrency(activeValuationAmount, settings.currencySymbol)}`}
                    >
                      {formatCurrency(activeValuationAmount, settings.currencySymbol)}
                    </span>
                  </div>

                  {selectedProductIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="ml-0.5 p-0.5 hover:bg-indigo-500 text-indigo-200 hover:text-white rounded-md transition-colors cursor-pointer"
                      title="Clear item selection"
                      aria-label="Clear selection"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              id="table-bulk-import-btn"
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 shadow-2xs transition-colors cursor-pointer"
              title="Bulk import products from CSV template or spreadsheet paste"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
              title="Export complete inventory stock list in import-ready CSV format (compatible with Bulk Import)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleResetColumnWidths}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer"
              title="Reset column widths to default lengths"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Reset Widths</span>
            </button>
            <ColumnVisibilityFilter
              columns={INVENTORY_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              onReset={() => handleColumnChange({
                item_model: true,
                category_condition: true,
                cost_price: true,
                selling_price: true,
                margin: true,
                stock_level: true,
                imei_serials: true,
                actions: true,
              })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs table-fixed">
            <colgroup>
              {visibleColumns.item_model !== false && <col style={{ width: `${columnWidths.item_model || 270}px` }} />}
              {visibleColumns.category_condition !== false && <col style={{ width: `${columnWidths.category_condition || 180}px` }} />}
              {visibleColumns.cost_price !== false && <col style={{ width: `${columnWidths.cost_price || 125}px` }} />}
              {visibleColumns.selling_price !== false && <col style={{ width: `${columnWidths.selling_price || 125}px` }} />}
              {visibleColumns.margin !== false && <col style={{ width: `${columnWidths.margin || 95}px` }} />}
              {visibleColumns.stock_level !== false && <col style={{ width: `${columnWidths.stock_level || 115}px` }} />}
              {visibleColumns.imei_serials !== false && <col style={{ width: `${columnWidths.imei_serials || 220}px` }} />}
              {visibleColumns.actions !== false && <col style={{ width: `${columnWidths.actions || 95}px` }} />}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                {visibleColumns.item_model !== false && (
                  <SortableHeader
                    field="item_model"
                    label={
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          ref={selectAllCheckboxRef}
                          checked={isAllSelected}
                          onChange={handleToggleSelectAll}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          title={isAllSelected ? "Deselect all visible items" : "Select all visible items"}
                          aria-label="Select all visible items"
                        />
                        <span>Item & Model</span>
                      </div>
                    }
                    width={columnWidths.item_model}
                    minWidth={MIN_COLUMN_WIDTHS.item_model}
                    resizable
                    onResizeStart={(e) => handleResizeStart('item_model', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.category_condition !== false && (
                  <SortableHeader
                    field="category_condition"
                    label="Category / Condition"
                    width={columnWidths.category_condition}
                    minWidth={MIN_COLUMN_WIDTHS.category_condition}
                    resizable
                    onResizeStart={(e) => handleResizeStart('category_condition', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.cost_price !== false && (
                  <SortableHeader
                    field="cost_price"
                    label="Cost Price"
                    align="right"
                    numeric
                    width={columnWidths.cost_price}
                    minWidth={MIN_COLUMN_WIDTHS.cost_price}
                    resizable
                    onResizeStart={(e) => handleResizeStart('cost_price', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.selling_price !== false && (
                  <SortableHeader
                    field="selling_price"
                    label="Selling Price"
                    align="right"
                    numeric
                    width={columnWidths.selling_price}
                    minWidth={MIN_COLUMN_WIDTHS.selling_price}
                    resizable
                    onResizeStart={(e) => handleResizeStart('selling_price', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.margin !== false && (
                  <SortableHeader
                    field="margin"
                    label="Margin %"
                    align="right"
                    numeric
                    width={columnWidths.margin}
                    minWidth={MIN_COLUMN_WIDTHS.margin}
                    resizable
                    onResizeStart={(e) => handleResizeStart('margin', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.stock_level !== false && (
                  <SortableHeader
                    field="stock_level"
                    label="Stock Level"
                    align="center"
                    numeric
                    width={columnWidths.stock_level}
                    minWidth={MIN_COLUMN_WIDTHS.stock_level}
                    resizable
                    onResizeStart={(e) => handleResizeStart('stock_level', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.imei_serials !== false && (
                  <SortableHeader
                    field="imei_serials"
                    label="IMEI Serial Numbers"
                    numeric
                    width={columnWidths.imei_serials}
                    minWidth={MIN_COLUMN_WIDTHS.imei_serials}
                    resizable
                    onResizeStart={(e) => handleResizeStart('imei_serials', e)}
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                  />
                )}
                {visibleColumns.actions !== false && (
                  <th
                    style={{
                      width: columnWidths.actions ? `${columnWidths.actions}px` : '95px',
                      minWidth: '75px',
                    }}
                    className="relative py-3 px-3 text-center select-none group"
                  >
                    <span>Actions</span>
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleResizeStart('actions', e);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="Drag to resize Actions column width"
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/70 active:bg-indigo-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                    >
                      <div className="w-0.5 h-3.5 bg-slate-400 rounded-full" />
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={activeColumnCount || 8} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">No inventory items match current filter.</p>
                    <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={handleClearSearch}
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Clear search filter
                        </button>
                      )}
                      {selectedSubCategory !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setSelectedSubCategory('all')}
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Clear subcategory filter ("{selectedSubCategory}")
                        </button>
                      )}
                      {selectedCategory !== 'all' && (
                        <button
                          type="button"
                          onClick={() => handleCategoryChange('all')}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-bold hover:underline cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Show all categories
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedProducts.map(product => {
                  const isPhone = isPhoneCategory(product.category) || Boolean(product.rom && product.rom !== '-') || Boolean(product.imeiPairs?.length) || Boolean(product.imeiList?.length);
                  const cond = getConditionLabel(product.condition);
                  const marginPct = product.sellingPrice > 0 
                    ? Math.round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100)
                    : 0;
                  const minAlert = typeof product.minStockAlert === 'number' ? product.minStockAlert : 0;
                  const isLowStock = minAlert > 0 ? product.stock <= minAlert : product.stock <= 0;
                  const isExactBarcodeMatch = searchQuery && (
                    product.barcode.toLowerCase() === searchQuery.toLowerCase().trim() ||
                    product.sku.toLowerCase() === searchQuery.toLowerCase().trim() ||
                    (product.imeiList && product.imeiList.some(im => im.toLowerCase() === searchQuery.toLowerCase().trim()))
                  );

                  return (
                    <tr 
                      key={product.id} 
                      className={`transition-colors ${
                        selectedProductIds.has(product.id)
                          ? 'bg-indigo-50/70 hover:bg-indigo-50/90 ring-1 ring-inset ring-indigo-200'
                          : isExactBarcodeMatch 
                            ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-300' 
                            : 'hover:bg-slate-50/80'
                      }`}
                    >
                      
                      {/* Name, Brand & SKU */}
                      {visibleColumns.item_model !== false && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={selectedProductIds.has(product.id)}
                              onChange={(e) => handleToggleProductSelect(product.id, e)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer shrink-0"
                              title={`Select ${product.name}`}
                              aria-label={`Select ${product.name}`}
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedProductForDetails(product)}
                              className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer shadow-2xs group/thumb relative"
                              title="Click to view product photo & details"
                            >
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-200"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400 group-hover/thumb:text-indigo-600 transition-colors">
                                  {isPhone ? <Smartphone className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                                </div>
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForDetails(product)}
                                  title="Click to view full device specifications & inventory details"
                                  className="text-left font-bold text-slate-900 hover:text-indigo-600 hover:underline flex items-center gap-1.5 group cursor-pointer transition-colors"
                                >
                                  <span>{product.name}</span>
                                  <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                                </button>
                                {product.isGiftItem && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 text-[10px] font-black tracking-wide shrink-0">
                                    <Gift className="w-3 h-3 text-purple-600" />
                                    <span>FOC Gift</span>
                                    {product.focType && (
                                      <span className="text-[9px] font-semibold text-purple-700 opacity-90 hidden md:inline">
                                        • {product.focType === 'supplier_bonus' ? 'Bonus' : product.focType === 'shop_funded_asset' ? 'Shop Asset' : 'Pre-expensed'}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {isExactBarcodeMatch && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded">
                                    <Check className="w-2.5 h-2.5" /> Match
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBrand(product.brand)}
                                  title={`Filter by brand: ${product.brand}`}
                                  className="font-sans font-bold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 px-1.5 py-0.2 rounded border border-indigo-200 transition-colors cursor-pointer"
                                >
                                  {product.brand}
                                </button>
                                {product.color && product.color.trim() && (
                                  <>
                                    <span>•</span>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedColor(product.color!)}
                                      title={`Filter by color: ${product.color}`}
                                      className="font-sans font-semibold inline-flex items-center gap-1 text-amber-900 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200 transition-colors cursor-pointer"
                                    >
                                      <span
                                        className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                        style={{ backgroundColor: getColorDotHex(product.color) }}
                                      />
                                      <span>{product.color}</span>
                                    </button>
                                  </>
                                )}
                                {product.model && product.model !== product.name && (
                                  <>
                                    <span>•</span>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedProductForDetails(product)}
                                      title="Click to view model specifications"
                                      className="font-sans font-semibold text-slate-600 hover:text-indigo-600 hover:underline cursor-pointer"
                                    >
                                      Model: {product.model}
                                    </button>
                                  </>
                                )}
                                <span>•</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForDetails(product)}
                                  title="Click to view item details"
                                  className="hover:text-slate-700 hover:underline cursor-pointer"
                                >
                                  SKU: {product.sku}
                                </button>
                                <span>•</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForDetails(product)}
                                  title="Click to view item details"
                                  className="hover:text-slate-700 hover:underline cursor-pointer"
                                >
                                  Barcode: {product.barcode}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Category, Condition & Phone Specs (RAM/ROM/Color) */}
                      {visibleColumns.category_condition !== false && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1 flex-wrap">
                            {isPhone ? (
                              <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${cond.badgeClass}`}>
                                {cond.label}
                              </span>
                            ) : (product.childCategory || product.variant) ? (
                              <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                                Variant: {product.childCategory || product.variant}
                              </span>
                            ) : null}
                            {product.color && product.color.trim() && (
                              <button
                                type="button"
                                onClick={() => setSelectedColor(product.color!)}
                                title={`Filter by Color: ${product.color}`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-50/90 text-amber-900 border border-amber-200/90 hover:bg-amber-100 transition-colors cursor-pointer"
                              >
                                <span
                                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: getColorDotHex(product.color) }}
                                />
                                <span>{product.color}</span>
                              </button>
                            )}
                            {product.subCategory && (
                              <button
                                type="button"
                                onClick={() => setSelectedSubCategory(product.subCategory!)}
                                title={`Filter by subcategory: ${product.subCategory}`}
                                className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors cursor-pointer"
                              >
                                {product.subCategory}
                              </button>
                            )}
                            {product.ram && product.ram !== '-' && (
                              <button
                                type="button"
                                onClick={() => setSelectedRam(product.ram!)}
                                title={`Filter by RAM: ${product.ram}`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                              >
                                <Cpu className="w-2.5 h-2.5 text-indigo-500" />
                                <span>{product.ram}</span>
                              </button>
                            )}
                            {product.rom && product.rom !== '-' && (
                              <button
                                type="button"
                                onClick={() => setSelectedRom(product.rom!)}
                                title={`Filter by ROM: ${product.rom}`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
                              >
                                <HardDrive className="w-2.5 h-2.5 text-purple-500" />
                                <span>{product.rom}</span>
                              </button>
                            )}
                            {(!product.ram || product.ram === '-') && (!product.rom || product.rom === '-') && product.storage && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                                {product.storage}
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Cost */}
                      {visibleColumns.cost_price !== false && (
                        <td className="py-3 px-4 text-right font-semibold text-slate-600">
                          {product.isGiftItem && product.costPrice === 0 ? (
                            <div>
                              <span className="text-slate-500 font-bold">0 Ks</span>
                              <span className="block text-[9px] text-purple-600 font-semibold">
                                {product.focType === 'shop_funded_expensed' ? 'Pre-expensed' : 'Bonus (Free)'}
                              </span>
                            </div>
                          ) : product.costPrice <= 0 ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-rose-500 bg-rose-50/90 text-rose-700 font-black text-xs shadow-2xs"
                              title="Purchase cost is 0 Ks (unpriced warning)"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              {formatCurrency(0, settings.currencySymbol)}
                            </span>
                          ) : (
                            formatCurrency(product.costPrice, settings.currencySymbol)
                          )}
                        </td>
                      )}

                      {/* Selling */}
                      {visibleColumns.selling_price !== false && (
                        <td className="py-3 px-4 text-right font-black text-slate-900">
                          {product.isGiftItem && product.sellingPrice === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-xs font-black">
                              <Gift className="w-3 h-3 text-purple-600" />
                              0 Ks (FOC)
                            </span>
                          ) : product.isGiftItem && product.sellingPrice > 0 ? (
                            <div>
                              <span>{formatCurrency(product.sellingPrice, settings.currencySymbol)}</span>
                              <span className="block text-[9px] text-purple-600 font-semibold">Ref Value</span>
                            </div>
                          ) : product.sellingPrice <= 0 ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-rose-500 bg-rose-50/90 text-rose-700 font-black text-xs shadow-2xs"
                              title="Selling price is 0 Ks (unpriced item)"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              {formatCurrency(0, settings.currencySymbol)}
                            </span>
                          ) : product.costPrice > 0 && product.sellingPrice < product.costPrice ? (
                            <div className="inline-flex flex-col items-end">
                              <span 
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-rose-500 bg-rose-50/95 text-rose-700 font-black text-xs shadow-2xs"
                                title={`Warning: Selling price (${formatCurrency(product.sellingPrice, settings.currencySymbol)}) is registered lower than purchase cost (${formatCurrency(product.costPrice, settings.currencySymbol)})!`}
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                              </span>
                              <span className="text-[9px] text-rose-600 font-extrabold mt-0.5 uppercase tracking-wide">Below Cost</span>
                            </div>
                          ) : (
                            formatCurrency(product.sellingPrice, settings.currencySymbol)
                          )}
                        </td>
                      )}

                      {/* Margin */}
                      {visibleColumns.margin !== false && (
                        <td className="py-3 px-4 text-right">
                          {product.isGiftItem ? (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                              🎁 Promo FOC
                            </span>
                          ) : product.costPrice > 0 && product.sellingPrice > 0 && product.sellingPrice < product.costPrice ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border-2 border-rose-500 bg-rose-50 text-rose-700 font-black text-xs shadow-2xs"
                              title={`Negative margin: loss of ${formatCurrency(product.costPrice - product.sellingPrice, settings.currencySymbol)} per unit`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              {marginPct}% Loss
                            </span>
                          ) : product.sellingPrice <= 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-rose-300 bg-rose-50 text-rose-600 font-bold text-xs" title="No selling price set">
                              0%
                            </span>
                          ) : (
                            <span className={`font-bold ${marginPct >= 20 ? 'text-emerald-700' : marginPct < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                              {marginPct}%
                            </span>
                          )}
                        </td>
                      )}

                      {/* Stock Count */}
                      {visibleColumns.stock_level !== false && (
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedProductForDetails(product)}
                              title="Click to view stock breakdown and serialized units"
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black cursor-pointer hover:opacity-85 transition-opacity ${
                                isLowStock
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {product.stock} Units
                            </button>
                            {product.quarantinedStock && product.quarantinedStock > 0 ? (
                              <button
                                type="button"
                                onClick={() => setIsQuarantineManagerOpen(true)}
                                title="Quarantined damaged items isolated from POS"
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold rounded hover:bg-amber-200 cursor-pointer"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                                <span>{product.quarantinedStock} Quarantined</span>
                              </button>
                            ) : null}
                            {product.isBStock ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-300 text-[9px] font-bold rounded">
                                <Tag className="w-2.5 h-2.5 text-emerald-700" />
                                <span>Open-Box B-Stock</span>
                              </span>
                            ) : null}
                          </div>
                        </td>
                      )}

                      {/* IMEI Serials list (Dual IMEI Support) */}
                      {visibleColumns.imei_serials !== false && (
                        <td className="py-3 px-4">
                          {product.imeiPairs && product.imeiPairs.length > 0 ? (
                            <div className="space-y-1 max-w-[240px]">
                              {product.imeiPairs.slice(0, 2).map((pair, idx) => (
                                <div key={idx} className="flex items-center gap-1 font-mono text-[9px] flex-wrap">
                                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-semibold">
                                    #{idx + 1}: {formatImei(pair.imei1)}
                                  </span>
                                  {pair.imei2 && (
                                    <span className="bg-purple-50 border border-purple-200 text-purple-900 px-1.5 py-0.5 rounded font-semibold">
                                      SIM2: {formatImei(pair.imei2)}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {product.imeiPairs.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForDetails(product)}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline block cursor-pointer"
                                >
                                  +{product.imeiPairs.length - 2} more units (View All)
                                </button>
                              )}
                            </div>
                          ) : product.imeiList && product.imeiList.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {product.imeiList.slice(0, 2).map((imei, idx) => (
                                <span key={idx} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                                  {formatImei(imei)}
                                </span>
                              ))}
                              {product.imeiList.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductForDetails(product)}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                >
                                  +{product.imeiList.length - 2} more
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Non-serialized</span>
                          )}
                        </td>
                      )}

                      {/* Action dropdown button (Space-Saving Minimalist Design) */}
                      {visibleColumns.actions !== false && (
                        <td className="py-2.5 px-3 text-center">
                          <div className="relative inline-flex items-center justify-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setOpenActionMenu(prev => prev?.productId === product.id ? null : {
                                  productId: product.id,
                                  product,
                                  top: rect.bottom + 4,
                                  right: window.innerWidth - rect.right,
                                });
                              }}
                              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                                openActionMenu?.productId === product.id
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                              title="Open Actions Menu"
                              aria-label={`Actions for ${product.name}`}
                            >
                              <span>Actions</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openActionMenu?.productId === product.id ? 'rotate-180 text-white' : 'text-slate-400'}`} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barcode Label Modal */}
      {barcodeModalTarget && (
        <BarcodeLabelModal
          product={barcodeModalTarget.product}
          selectedImei={barcodeModalTarget.imei}
          settings={settings}
          onClose={() => setBarcodeModalTarget(null)}
        />
      )}

      {/* Product Detail / Specification Pop-up Modal */}
      {selectedProductForDetails && (
        <ProductDetailModal
          product={selectedProductForDetails}
          settings={settings}
          onClose={() => setSelectedProductForDetails(null)}
          onSaveProduct={(updated) => {
            onSaveProduct(updated);
            setSelectedProductForDetails(updated);
          }}
          onEdit={(prod) => {
            setSelectedProductForDetails(null);
            handleOpenEdit(prod);
          }}
          onViewHistory={onOpenProductHistory ? (prod) => {
            setSelectedProductForDetails(null);
            onOpenProductHistory(prod);
          } : undefined}
        />
      )}

      {/* New / Edit Product Modal */}
      {isModalOpen && (
        <NewProductModal
          settings={settings}
          products={products}
          editingProduct={editingProduct}
          onClose={() => setIsModalOpen(false)}
          onSave={(prod) => {
            onSaveProduct(prod);
            setIsModalOpen(false);
          }}
        />
      )}

      {/* Bulk Product CSV / Spreadsheet Import Modal */}
      {isBulkImportOpen && (
        <BulkProductImportModal
          settings={settings}
          products={products}
          onClose={() => setIsBulkImportOpen(false)}
          onBulkSave={(importedProducts, mergeWithExisting) => {
            if (onBulkSaveProducts) {
              onBulkSaveProducts(importedProducts, mergeWithExisting);
            } else {
              StorageService.bulkSaveProducts(importedProducts, mergeWithExisting);
            }
          }}
        />
      )}

      {/* Phase 1: Report Damage & Quarantine Modal (Immediate POS Isolation) */}
      {isQuarantineReportOpen && (
        <QuarantineReportModal
          isOpen={isQuarantineReportOpen}
          onClose={() => {
            setIsQuarantineReportOpen(false);
            setSelectedProductForQuarantine(null);
          }}
          products={products}
          settings={settings}
          preSelectedProduct={selectedProductForQuarantine}
          onSuccess={(updatedProduct) => {
            onSaveProduct(updatedProduct);
          }}
          onOpenManagerReview={(logId) => {
            setQuarantineManagerTargetLogId(logId);
            setIsQuarantineManagerOpen(true);
          }}
        />
      )}

      {/* Phase 2 & Phase 3: Quarantine Manager Assessment & Final Disposition Hub */}
      {isQuarantineManagerOpen && (
        <QuarantineManagerModal
          isOpen={isQuarantineManagerOpen}
          onClose={() => {
            setIsQuarantineManagerOpen(false);
            setQuarantineManagerTargetLogId(null);
          }}
          products={products}
          settings={settings}
          initialSelectedLogId={quarantineManagerTargetLogId}
          onDataChanged={() => {
            // Trigger products reload by calling StorageService
            const refreshed = StorageService.getProducts();
            if (refreshed.length > 0) {
              onSaveProduct(refreshed[0]); // Triggers parent state refresh
            }
          }}
        />
      )}

      {/* Whole Store Inventory Activity & Audit Trail Log Modal */}
      {isWholeLogModalOpen && (
        <WholeInventoryLogModal
          isOpen={isWholeLogModalOpen}
          onClose={() => setIsWholeLogModalOpen(false)}
          products={products}
          settings={settings}
          sales={sales}
          purchases={purchases}
          stockAdjustments={stockAdjustments}
          stockAudits={stockAudits}
          priceChanges={priceChanges}
          damageLogs={damageLogs}
          staffUsers={staffUsers}
          onOpenProductHistory={(prod) => {
            setIsWholeLogModalOpen(false);
            if (onOpenProductHistory) {
              onOpenProductHistory(prod);
            }
          }}
        />
      )}

      {/* Floating Space-Saving Actions Dropdown Popover */}
      {openActionMenu && (
        <div 
          className="fixed inset-0 z-50 cursor-default"
          onClick={() => setOpenActionMenu(null)}
        >
          <div
            style={{
              position: 'fixed',
              top: `${Math.min(openActionMenu.top, Math.max(10, window.innerHeight - 300))}px`,
              right: `${Math.max(10, openActionMenu.right)}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
              <span className="truncate max-w-[170px]" title={openActionMenu.product.name}>
                {openActionMenu.product.name}
              </span>
              <button 
                type="button"
                onClick={() => setOpenActionMenu(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedProductForDetails(openActionMenu.product);
                  setOpenActionMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition-colors cursor-pointer text-left"
              >
                <Eye className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>View Full Details & Specs</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleOpenEdit(openActionMenu.product);
                  setOpenActionMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition-colors cursor-pointer text-left"
              >
                <Edit3 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Edit Product Info</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBarcodeModalTarget({ product: openActionMenu.product });
                  setOpenActionMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition-colors cursor-pointer text-left"
              >
                <Barcode className="w-4 h-4 text-slate-600 shrink-0" />
                <span>Print Barcode Labels</span>
              </button>

              {onOpenProductHistory && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenProductHistory(openActionMenu.product);
                    setOpenActionMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition-colors cursor-pointer text-left"
                >
                  <History className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Movement History</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedProductForQuarantine(openActionMenu.product);
                  setIsQuarantineReportOpen(true);
                  setOpenActionMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-amber-700 hover:bg-amber-50 font-medium transition-colors cursor-pointer text-left"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Report Damage / Quarantine</span>
              </button>
            </div>

            <div className="border-t border-slate-100 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleDelete(openActionMenu.product.id, openActionMenu.product.name);
                  setOpenActionMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 hover:bg-rose-50 font-semibold transition-colors cursor-pointer text-left"
              >
                <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Delete Product</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
