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
  ShieldAlert
} from 'lucide-react';
import { Product, ProductCategory, ShopSettings, DamageLog } from '../../types';
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
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);
  const [barcodeModalTarget, setBarcodeModalTarget] = useState<{ product: Product; imei?: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

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
      // If user is typing in an input element other than search, let them type
      const target = e.target as HTMLElement;
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
        const scanned = barcodeBufferRef.current.trim();
        if (scanned.length >= 3) {
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

          // Calculate matches
          const q = scanned.toLowerCase();
          const matches = products.filter(p => 
            p.barcode.toLowerCase() === q ||
            p.sku.toLowerCase() === q ||
            p.name.toLowerCase().includes(q) ||
            (p.imeiList && p.imeiList.some(im => im.toLowerCase() === q))
          );

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

      // Ignore modifier keys
      if (e.key.length !== 1) return;

      // If keys come with long delay (> 80ms) and user is not in search input, reset buffer
      if (timeDiff > 80 && target.id !== 'inventory-search-input') {
        barcodeBufferRef.current = e.key;
      } else {
        barcodeBufferRef.current += e.key;
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
  const lowStockItems = safeProducts.filter(p => (Number(p.stock) || 0) <= (Number(p.minStockAlert) || 0));

  // Available Brands for current category selection
  const availableBrands = useMemo(() => {
    const targetProducts = selectedCategory === 'all'
      ? safeProducts
      : safeProducts.filter(p => p && canonicalCategory(p.category) === selectedCategory);

    const brandMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (p && p.brand && p.brand.trim()) {
        const b = p.brand.trim();
        brandMap.set(b, (brandMap.get(b) || 0) + 1);
      }
    });

    return Array.from(brandMap.entries())
      .map(([name, count]) => ({ name, count }))
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

  // Total count in currently active category
  const currentCategoryCount = useMemo(() => {
    return selectedCategory === 'all'
      ? safeProducts.length
      : safeProducts.filter(p => p && canonicalCategory(p.category) === selectedCategory).length;
  }, [safeProducts, selectedCategory]);

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

      const matchesLowStock = !showLowStockOnly || p.stock <= p.minStockAlert;

      if (!matchesCat || !matchesSubCat || !matchesBrand || !matchesRam || !matchesRom || !matchesColor || !matchesLowStock) {
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
        ...(p.imeiList || [])
      ];

      const searchableText = searchableParts.filter(Boolean).join(' ').toLowerCase();

      // Every word typed in the search box must match at least one attribute
      return tokens.every(token => searchableText.includes(token));
    });
  }, [products, selectedCategory, selectedSubCategory, selectedBrand, selectedRam, selectedRom, selectedColor, showLowStockOnly, searchQuery]);

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
    setSearchQuery('');
    setScannedFeedback(null);
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
    const headers: string[] = [];

    if (visibleColumns.item_model !== false) {
      headers.push('Product Name', 'SKU', 'Brand', 'Barcode', 'Specs / Storage / Color');
    }
    if (visibleColumns.category_condition !== false) {
      headers.push('Category', 'Subcategory', 'Condition');
    }
    if (visibleColumns.cost_price !== false) {
      headers.push(`Cost Price (${settings.currencySymbol})`);
    }
    if (visibleColumns.selling_price !== false) {
      headers.push(`Selling Price (${settings.currencySymbol})`);
    }
    if (visibleColumns.margin !== false) {
      headers.push('Margin %', `Profit Per Unit (${settings.currencySymbol})`);
    }
    if (visibleColumns.stock_level !== false) {
      headers.push('Stock (Units)', 'Min Alert Level', 'Stock Status');
    }
    if (visibleColumns.imei_serials !== false) {
      headers.push('IMEI Count', 'Serialized IMEIs');
    }

    const rows = filteredProducts.map((p) => {
      const row: (string | number)[] = [];

      if (visibleColumns.item_model !== false) {
        const specSummary = [
          p.ram ? `${p.ram} RAM` : null,
          p.rom || p.storage,
          p.color,
        ].filter(Boolean).join(' • ');

        row.push(p.name, p.sku, p.brand || '-', p.barcode || '-', specSummary || '-');
      }
      if (visibleColumns.category_condition !== false) {
        row.push(getCategoryLabel(p.category), p.subCategory || '-', getConditionLabel(p.condition).label);
      }
      if (visibleColumns.cost_price !== false) {
        row.push(p.costPrice);
      }
      if (visibleColumns.selling_price !== false) {
        row.push(p.sellingPrice);
      }
      if (visibleColumns.margin !== false) {
        const margin = p.sellingPrice > 0 ? (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(1) + '%' : '0.0%';
        const profit = p.sellingPrice - p.costPrice;
        row.push(margin, profit);
      }
      if (visibleColumns.stock_level !== false) {
        const status = p.stock <= 0 ? 'Out of Stock' : p.stock <= p.minStockAlert ? 'Low Stock' : 'In Stock';
        row.push(p.stock, p.minStockAlert, status);
      }
      if (visibleColumns.imei_serials !== false) {
        row.push(
          p.imeiList ? p.imeiList.length : 0,
          p.imeiList && p.imeiList.length > 0 ? p.imeiList.join('; ') : '-'
        );
      }

      return row;
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
          <p className="text-[11px] text-slate-500 mt-1">{products.length} distinct product lines</p>
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

      {/* Action Bar & Search Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        
        {/* Search & Barcode Scanner Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400 pointer-events-none">
              <Barcode className="w-4 h-4 text-indigo-600" />
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
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 focus:outline-hidden shadow-2xs transition-all font-medium"
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsScannerActive(!isScannerActive)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs whitespace-nowrap ${
                isScannerActive 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' 
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
              title={isScannerActive ? "Real-time hardware scanner is active" : "Scanner listener paused"}
            >
              <span className={`w-2 h-2 rounded-full ${isScannerActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <ScanLine className="w-3.5 h-3.5" />
              <span>{isScannerActive ? 'Scanner Active' : 'Scanner Paused'}</span>
            </button>
          </div>
        </div>

        {/* Add Product & Stock Check Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            id="open-report-damage-btn"
            type="button"
            onClick={() => {
              setSelectedProductForQuarantine(null);
              setIsQuarantineReportOpen(true);
            }}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-xs rounded-xl border border-amber-200 shadow-2xs transition-all cursor-pointer"
            title="Phase 1: Report damage and immediately isolate item from sellable POS inventory"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
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
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer"
            title="Phase 2 & 3: Manager Assessment & Final Disposition Hub (RMA, Write-Off, B-Stock)"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
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
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold text-xs rounded-xl border border-emerald-200 shadow-2xs transition-all cursor-pointer"
            title="Bulk import products from CSV template or spreadsheet paste"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Bulk Import</span>
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
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs transition-all cursor-pointer"
              title="Remove all products from inventory"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Clear Products</span>
            </button>
          )}

          {onOpenStockCheck && (
            <button
              id="open-stock-check-btn"
              type="button"
              onClick={onOpenStockCheck}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-indigo-950 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4 text-indigo-600" />
              <span>Stock Audit</span>
            </button>
          )}

          <button
            id="open-add-product-btn"
            type="button"
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
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

      {/* Category Dropdown (Minimalist Design) */}
      <div id="inventory-category-dropdown-container" className="flex items-center justify-between flex-wrap gap-2.5">
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
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-slate-400 font-medium text-[11px]">Category:</span>
              <span className="font-bold text-slate-900 truncate">
                {categories.find(c => c.id === selectedCategory)?.label || 'All Products'}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                {selectedCategory === 'all' 
                  ? safeProducts.length 
                  : safeProducts.filter(p => p && canonicalCategory(p.category) === selectedCategory).length}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ${isCategoryDropdownOpen ? 'rotate-180 text-slate-700' : ''}`} />
          </button>

          {/* Dropdown Menu Popover */}
          {isCategoryDropdownOpen && (
            <div 
              id="inventory-category-dropdown-menu"
              className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-1 z-30 animate-in fade-in zoom-in-95 duration-150"
              role="listbox"
            >
              <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Select Category
              </div>
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {categories.map(cat => {
                  const isSelected = selectedCategory === cat.id;
                  const count = cat.id === 'all' 
                    ? safeProducts.length 
                    : safeProducts.filter(p => p && canonicalCategory(p.category) === cat.id).length;

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
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-slate-200 text-slate-800 font-bold' : 'text-slate-400'
                        }`}>
                          {count}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-slate-900" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
            >
              All Brands ({currentCategoryCount})
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
              >
                <span>{b.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  selectedBrand.toLowerCase() === b.name.toLowerCase()
                    ? 'bg-indigo-700 text-indigo-100'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {b.count}
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
                <option value="all">All Brands ({currentCategoryCount})</option>
                {availableBrands.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
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
      {(selectedBrand !== 'all' || selectedRam !== 'all' || selectedRom !== 'all' || selectedColor !== 'all' || selectedSubCategory !== 'all' || selectedCategory !== 'all' || searchQuery || showLowStockOnly) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs flex-wrap animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 font-bold text-[11px]">Active Filters ({filteredProducts.length} results):</span>
            
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
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-900">
              Stock Ledger & Catalog ({filteredProducts.length} Items Listed)
            </span>
            {showLowStockOnly && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                Low Stock Filter
              </span>
            )}
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
              title="Export filtered items with visible columns to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
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
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                {visibleColumns.item_model !== false && <th className="py-3 px-4">Item & Model</th>}
                {visibleColumns.category_condition !== false && <th className="py-3 px-4">Category / Condition</th>}
                {visibleColumns.cost_price !== false && <th className="py-3 px-4 text-right">Cost Price</th>}
                {visibleColumns.selling_price !== false && <th className="py-3 px-4 text-right">Selling Price</th>}
                {visibleColumns.margin !== false && <th className="py-3 px-4 text-right">Margin %</th>}
                {visibleColumns.stock_level !== false && <th className="py-3 px-4 text-center">Stock Level</th>}
                {visibleColumns.imei_serials !== false && <th className="py-3 px-4">IMEI Serial Numbers</th>}
                {visibleColumns.actions !== false && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
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
                filteredProducts.map(product => {
                  const isPhone = isPhoneCategory(product.category) || Boolean(product.rom && product.rom !== '-') || Boolean(product.imeiPairs?.length) || Boolean(product.imeiList?.length);
                  const cond = getConditionLabel(product.condition);
                  const marginPct = product.sellingPrice > 0 
                    ? Math.round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100)
                    : 0;
                  const isLowStock = product.stock <= product.minStockAlert;
                  const isExactBarcodeMatch = searchQuery && (
                    product.barcode.toLowerCase() === searchQuery.toLowerCase().trim() ||
                    product.sku.toLowerCase() === searchQuery.toLowerCase().trim() ||
                    (product.imeiList && product.imeiList.some(im => im.toLowerCase() === searchQuery.toLowerCase().trim()))
                  );

                  return (
                    <tr 
                      key={product.id} 
                      className={`transition-colors ${
                        isExactBarcodeMatch 
                          ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-300' 
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      
                      {/* Name, Brand & SKU */}
                      {visibleColumns.item_model !== false && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
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
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${cond.badgeClass}`}>
                              {cond.label}
                            </span>
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
                          {formatCurrency(product.costPrice, settings.currencySymbol)}
                        </td>
                      )}

                      {/* Selling */}
                      {visibleColumns.selling_price !== false && (
                        <td className="py-3 px-4 text-right font-black text-slate-900">
                          {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                        </td>
                      )}

                      {/* Margin */}
                      {visibleColumns.margin !== false && (
                        <td className="py-3 px-4 text-right">
                          <span className={`font-bold ${marginPct >= 20 ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {marginPct}%
                          </span>
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

                      {/* Action buttons */}
                      {visibleColumns.actions !== false && (
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {onOpenProductHistory && (
                              <button
                                type="button"
                                title="View Product Movement History & Lifecycle"
                                onClick={() => onOpenProductHistory(product)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <History className="w-4 h-4 text-indigo-600" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Print Barcode Labels (Laser & Thermal)"
                              onClick={() => setBarcodeModalTarget({ product })}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Barcode className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="View Full Item Details & Specs"
                              onClick={() => setSelectedProductForDetails(product)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Report Damage & Quarantine (Phase 1 Isolation)"
                              onClick={() => {
                                setSelectedProductForQuarantine(product);
                                setIsQuarantineReportOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            </button>
                            <button
                              type="button"
                              title="Edit Product"
                              onClick={() => handleOpenEdit(product)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Delete Product"
                              onClick={() => handleDelete(product.id, product.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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

    </div>
  );
};
