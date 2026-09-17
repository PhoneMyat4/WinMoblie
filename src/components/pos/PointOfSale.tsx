import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Search, 
  Barcode, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  Sparkles, 
  CreditCard, 
  ShieldCheck, 
  Tag, 
  Smartphone, 
  Layers, 
  Check, 
  X, 
  Printer, 
  Cpu, 
  HardDrive, 
  SlidersHorizontal, 
  RotateCcw, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Palette, 
  Camera, 
  ScanLine, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Undo2, 
  Zap, 
  ExternalLink,
  LayoutGrid,
  ArrowRight,
  CalendarClock,
  Utensils,
  ShieldAlert,
  Info
} from 'lucide-react';
import { 
  Product, 
  ProductCategory, 
  CartItem, 
  Customer, 
  Sale, 
  ShopSettings, 
  PaymentMethod, 
  ImeiPair,
  PreOrder,
  CreditSaleRecord
} from '../../types';
import { canonicalCategory, isPhoneCategory } from '../../data/categoryTaxonomy';
import { formatCurrency, formatImei, formatDualImei, getCategoryLabel, getConditionLabel } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';
import { isItemSellable } from '../../utils/damageManager';
import { PaymentModal } from '../modals/PaymentModal';
import { InvoicePrintModal } from '../modals/InvoicePrintModal';
import { PosLiveScannerModal } from './PosLiveScannerModal';
import { PosProductHoverPreview, PosProductMobileDetailModal } from './PosProductHoverPreview';
import { PreOrderSearchModal } from '../modals/PreOrderSearchModal';
import { PreOrderFormModal } from '../modals/PreOrderFormModal';
import { StorageService } from '../../utils/storage';
import { AppLink } from '../common/AppLink';
import { 
  lookupProductByCode, 
  detectScanCodeCategory, 
  searchProductsForScanner 
} from '../../utils/scannerLookup';
import { 
  playSuccessBeep, 
  playWarningBeep, 
  playErrorBeep 
} from '../../utils/scannerAudio';

interface PointOfSaleProps {
  products: Product[];
  customers: Customer[];
  settings: ShopSettings;
  activePreOrderToFulfill?: PreOrder | null;
  onClearActivePreOrder?: () => void;
  onCompleteSale: (sale: Sale, updatedProducts: Product[], updatedCustomer?: Customer) => void;
  onAddNewCustomer: (customer: Customer) => void;
}

export const PointOfSale: React.FC<PointOfSaleProps> = ({
  products,
  customers,
  settings,
  activePreOrderToFulfill,
  onClearActivePreOrder,
  onCompleteSale,
  onAddNewCustomer,
}) => {
  // Pre-Orders State
  const [preOrders, setPreOrders] = useState<PreOrder[]>(() => StorageService.getPreOrders());
  const [isPreOrderSearchModalOpen, setIsPreOrderSearchModalOpen] = useState<boolean>(false);
  const [isPreOrderCaptureModalOpen, setIsPreOrderCaptureModalOpen] = useState<boolean>(false);
  const [activePreOrderFulfillment, setActivePreOrderFulfillment] = useState<PreOrder | null>(activePreOrderToFulfill || null);
  const lastFulfilledPreOrderIdRef = useRef<string | null>(null);

  // Sync preOrders from storage periodically or on modal events
  const refreshPreOrdersFromStorage = useCallback(() => {
    setPreOrders(StorageService.getPreOrders());
  }, []);

  // Catalog State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedRam, setSelectedRam] = useState<string>('all');
  const [selectedRom, setSelectedRom] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [isScanDropdownOpen, setIsScanDropdownOpen] = useState<boolean>(false);
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState<boolean>(false);
  const [scannerSoundEnabled, setScannerSoundEnabled] = useState<boolean>(true);
  const [scanToast, setScanToast] = useState<{
    text: string;
    subtext?: string;
    type: 'success' | 'error' | 'warning';
    lastAddedIndex?: number;
    canUndoClear?: boolean;
  } | null>(null);
  const [clearedCartBackup, setClearedCartBackup] = useState<{ cart: CartItem[]; orderDiscount: number } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerDropdownRef = useRef<HTMLDivElement>(null);
  const keyStrokeBufferRef = useRef<{ buffer: string; lastTime: number }>({ buffer: '', lastTime: 0 });

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mobileActiveView, setMobileActiveView] = useState<'catalog' | 'cart'>('catalog');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [taxEnabled, setTaxEnabled] = useState<boolean>(true);

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState<boolean>(false);

  // Product Hover Pop-Up (Desktop) & Mobile Detail Modal State
  const [hoveredProduct, setHoveredProduct] = useState<Product | null>(null);
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null);
  const [mobilePreviewProduct, setMobilePreviewProduct] = useState<Product | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProductMouseEnter = (product: Product, event: React.MouseEvent<HTMLDivElement>) => {
    // Only activate hover preview on desktop screens (>= 768px)
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredProduct(product);
    setHoverAnchorRect(rect);
  };

  const handleProductMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredProduct(null);
      setHoverAnchorRect(null);
    }, 150);
  };

  const handleCloseHoverPreview = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredProduct(null);
    setHoverAnchorRect(null);
  };

  // Quick Customer Form
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustAddress, setNewCustAddress] = useState<string>('');

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null;

  // Available Brands in current category
  const availableBrands = React.useMemo(() => {
    const targetProducts = selectedCategory === 'all'
      ? products
      : products.filter(p => canonicalCategory(p.category) === selectedCategory);

    const brandMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (p.brand && p.brand.trim()) {
        const b = p.brand.trim();
        brandMap.set(b, (brandMap.get(b) || 0) + 1);
      }
    });

    return Array.from(brandMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedCategory]);

  // Available Subcategories in current category & brand
  const availableSubCategories = React.useMemo(() => {
    const targetProducts = products.filter(p => {
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const subMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (p.subCategory && p.subCategory.trim()) {
        const sub = p.subCategory.trim();
        subMap.set(sub, (subMap.get(sub) || 0) + 1);
      }
    });

    return Array.from(subMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedCategory, selectedBrand]);

  // Available RAM options
  const availableRams = React.useMemo(() => {
    const targetProducts = products.filter(p => {
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const ramMap = new Map<string, number>();
    targetProducts.forEach(p => {
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
      .sort((a, b) => (parseInt(a.name) || 0) - (parseInt(b.name) || 0));
  }, [products, selectedCategory, selectedBrand]);

  // Available ROM options
  const availableRoms = React.useMemo(() => {
    const targetProducts = products.filter(p => {
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const romMap = new Map<string, number>();
    targetProducts.forEach(p => {
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
  }, [products, selectedCategory, selectedBrand]);

  // Available Color options
  const availableColors = React.useMemo(() => {
    const targetProducts = products.filter(p => {
      const matchCat = selectedCategory === 'all' || canonicalCategory(p.category) === selectedCategory;
      const matchBrand = selectedBrand === 'all' || (p.brand && p.brand.toLowerCase() === selectedBrand.toLowerCase());
      return matchCat && matchBrand;
    });

    const colorMap = new Map<string, number>();
    targetProducts.forEach(p => {
      if (p.color && p.color.trim()) {
        const c = p.color.trim();
        colorMap.set(c, (colorMap.get(c) || 0) + 1);
      }
    });

    return Array.from(colorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [products, selectedCategory, selectedBrand]);

  const isPhoneCategoryActive = selectedCategory === 'all' || isPhoneCategory(selectedCategory);

  // Smart Multi-Token Filter products
  const filteredProducts = React.useMemo(() => {
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return products.filter(p => {
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

      if (!matchesCat || !matchesSubCat || !matchesBrand || !matchesRam || !matchesRom || !matchesColor) {
        return false;
      }

      if (tokens.length === 0) return true;

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
        ...(p.imeiList || [])
      ];

      const searchableText = searchableParts.filter(Boolean).join(' ').toLowerCase();
      return tokens.every(token => searchableText.includes(token));
    });
  }, [products, selectedCategory, selectedSubCategory, selectedBrand, selectedRam, selectedRom, selectedColor, searchQuery]);

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedSubCategory('all');
    setSelectedBrand('all');
    setSelectedRam('all');
    setSelectedRom('all');
    setSelectedColor('all');
  };

  const handleResetCatalogFilters = () => {
    setSelectedCategory('all');
    setSelectedSubCategory('all');
    setSelectedBrand('all');
    setSelectedRam('all');
    setSelectedRom('all');
    setSelectedColor('all');
    setSearchQuery('');
  };

  // Code Category detector for real-time badge
  const detectedCodeCategory = useMemo(() => {
    if (!barcodeInput.trim()) return null;
    return detectScanCodeCategory(barcodeInput);
  }, [barcodeInput]);

  // Autocomplete suggestions for top scanner input
  const scannerSuggestions = useMemo(() => {
    if (!barcodeInput.trim() || barcodeInput.trim().length < 2) return [];
    return searchProductsForScanner(barcodeInput, products, 6);
  }, [barcodeInput, products]);

  const addToCart = useCallback((product: Product, specificImei?: string): boolean => {
    // Phase 1 Quarantine Check: Validate product status and specific IMEI sellability
    const sellableCheck = isItemSellable(product, specificImei);
    if (!sellableCheck.sellable) {
      if (scannerSoundEnabled) playErrorBeep();
      setScanToast({
        type: 'error',
        text: `Quarantined Item: ${product.name}`,
        subtext: sellableCheck.reason || 'This unit has been isolated for damage inspection and cannot be sold.',
      });
      return false;
    }

    const sellableStock = Math.max(0, product.stock - (product.quarantinedStock || 0));
    if (sellableStock <= 0) {
      if (scannerSoundEnabled) playErrorBeep();
      setScanToast({
        type: 'error',
        text: `No Sellable Stock: ${product.name}`,
        subtext: product.quarantinedStock && product.quarantinedStock > 0 
          ? `All ${product.quarantinedStock} unit(s) are quarantined for damage assessment.`
          : '0 units remaining in current store inventory',
      });
      return false;
    }

    const isPhone = isPhoneCategory(product.category);
    
    // If serialized phone, handle paired Dual IMEIs
    if (isPhone) {
      let selectedPair: ImeiPair | undefined;

      const isPairQuarantined = (p: ImeiPair) => 
        p.status === 'Quarantined' || 
        p.status === 'Pending RMA' || 
        p.status === 'Written-Off' || 
        Boolean(product.quarantinedImeis?.includes(p.imei1));
      
      if (product.imeiPairs && product.imeiPairs.length > 0) {
        if (specificImei) {
          selectedPair = product.imeiPairs.find(
            p => (p.imei1 === specificImei || p.imei2 === specificImei) && !isPairQuarantined(p)
          );
          if (!selectedPair) {
            if (scannerSoundEnabled) playErrorBeep();
            setScanToast({
              type: 'error',
              text: `Quarantined Unit: IMEI ${specificImei}`,
              subtext: 'This specific serial is quarantined for damage and cannot be checked out.',
            });
            return false;
          }
        }
        if (!selectedPair) {
          // Pick first available pair not currently in cart and not quarantined
          const usedImei1s = cart
            .filter(i => i.product.id === product.id && i.selectedImei)
            .map(i => i.selectedImei);
          selectedPair = product.imeiPairs.find(p => !usedImei1s.includes(p.imei1) && !isPairQuarantined(p));
        }

        if (!selectedPair) {
          if (scannerSoundEnabled) playErrorBeep();
          setScanToast({
            type: 'error',
            text: `No Sellable Units: ${product.name}`,
            subtext: 'All available units are currently in active cart or quarantined for damage.',
          });
          return false;
        }
      }

      let assignedImei1 = specificImei || (selectedPair ? selectedPair.imei1 : undefined);
      let assignedImei2 = selectedPair ? selectedPair.imei2 : undefined;

      // Fallback for legacy imeiList
      if (!assignedImei1 && product.imeiList && product.imeiList.length > 0) {
        const usedImeis = cart.filter(i => i.product.id === product.id && i.selectedImei).map(i => i.selectedImei);
        const availableImei = product.imeiList.find(im => !usedImeis.includes(im) && !product.quarantinedImeis?.includes(im));
        assignedImei1 = availableImei;
      }

      if (!assignedImei1 && (product.imeiPairs?.length || product.imeiList?.length)) {
        if (scannerSoundEnabled) playErrorBeep();
        setScanToast({
          type: 'error',
          text: `No Available Serial Units: ${product.name}`,
          subtext: 'All remaining units are currently isolated in quarantine.',
        });
        return false;
      }

      if (assignedImei1) {
        const existingSameImei = cart.find(i => i.selectedImei === assignedImei1);
        if (existingSameImei) {
          if (scannerSoundEnabled) playWarningBeep();
          setScanToast({
            type: 'warning',
            text: `Already in Cart: IMEI ${assignedImei1}`,
            subtext: `${product.name} (Unit is already staged in active ticket)`,
          });
          return false;
        }
      }

      setCart(prev => [
        ...prev,
        {
          product,
          quantity: 1,
          selectedImei: assignedImei1,
          selectedImei2: assignedImei2,
          discount: 0,
          warrantyPeriod: product.warrantyMonths > 0 ? `${product.warrantyMonths} Months Warranty` : 'No Warranty',
        }
      ]);
      return true;
    } else {
      // Accessories / spare parts can increase quantity up to sellableStock
      let success = true;
      setCart(prev => {
        const existingIndex = prev.findIndex(i => i.product.id === product.id);
        if (existingIndex > -1) {
          const currentQty = prev[existingIndex].quantity;
          if (currentQty >= sellableStock) {
            if (scannerSoundEnabled) playErrorBeep();
            setScanToast({
              type: 'error',
              text: `Max Sellable Limit: ${product.name}`,
              subtext: product.quarantinedStock && product.quarantinedStock > 0
                ? `${sellableStock} units sellable (${product.quarantinedStock} quarantined)`
                : `Only ${product.stock} units available in inventory`,
            });
            success = false;
            return prev;
          }
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + 1,
          };
          return updated;
        } else {
          return [
            ...prev,
            {
              product,
              quantity: 1,
              discount: 0,
              warrantyPeriod: product.warrantyMonths > 0 ? `${product.warrantyMonths} Months` : 'Standard Checking',
            }
          ];
        }
      });
      return success;
    }
  }, [cart, scannerSoundEnabled]);

  // Unified barcode, IMEI, and SKU scan processor
  const handleProcessScanCode = useCallback((rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    const lookup = lookupProductByCode(cleanCode, products);

    if (!lookup.found || !lookup.product) {
      if (scannerSoundEnabled) playErrorBeep();
      setScanToast({
        type: 'error',
        text: `No Match Found: "${cleanCode}"`,
        subtext: 'Code does not match any Barcode, IMEI, or SKU records',
      });
      return;
    }

    const product = lookup.product;
    const matchType = lookup.matchType || 'barcode';
    const matchedImei = lookup.matchedImei;

    const added = addToCart(product, matchedImei);
    if (added) {
      if (scannerSoundEnabled) playSuccessBeep();
      setScanToast({
        type: 'success',
        text: `✓ Added: ${product.name}`,
        subtext: matchedImei
          ? `[IMEI MATCH] ${formatImei(matchedImei)} • ${formatCurrency(product.sellingPrice, settings.currencySymbol)}`
          : `[${(matchType || 'barcode').toUpperCase()} MATCH] ${formatCurrency(product.sellingPrice, settings.currencySymbol)}`,
      });
    }
  }, [products, addToCart, scannerSoundEnabled, settings.currencySymbol]);

  // Handle barcode / IMEI scanner form submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    handleProcessScanCode(barcodeInput.trim());
    setBarcodeInput('');
    setIsScanDropdownOpen(false);
  };

  // Hardware barcode wedge listener & keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Hotkey F2 or Alt+S opens Camera Scanner
      if (e.key === 'F2' || (e.altKey && e.key.toLowerCase() === 's')) {
        e.preventDefault();
        setIsLiveScannerOpen(prev => !prev);
        return;
      }

      // Check if typing rapidly from a barcode laser gun
      const now = Date.now();
      const timeDiff = now - keyStrokeBufferRef.current.lastTime;
      keyStrokeBufferRef.current.lastTime = now;

      if (e.key === 'Enter') {
        if (keyStrokeBufferRef.current.buffer.length >= 3 && timeDiff < 120) {
          // Scanner gun pressed enter!
          e.preventDefault();
          const scanned = keyStrokeBufferRef.current.buffer;
          keyStrokeBufferRef.current.buffer = '';
          handleProcessScanCode(scanned);
          setBarcodeInput('');
          setIsScanDropdownOpen(false);
          return;
        }
        keyStrokeBufferRef.current.buffer = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff > 130) {
          // Reset buffer if standard human typing speed
          keyStrokeBufferRef.current.buffer = e.key;
        } else {
          keyStrokeBufferRef.current.buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleProcessScanCode]);

  // Auto-dismiss scan toast after 4.5 seconds
  useEffect(() => {
    if (scanToast) {
      const timer = setTimeout(() => {
        setScanToast(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [scanToast]);

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    const item = cart[index];
    if (newQty > item.product.stock) {
      alert(`Max stock available is ${item.product.stock}.`);
      return;
    }
    const updated = [...cart];
    updated[index].quantity = newQty;
    setCart(updated);
  };

  const updateItemDiscount = (index: number, discount: number) => {
    const updated = [...cart];
    updated[index].discount = Math.max(0, discount);
    setCart(updated);
  };

  const updateItemImeiPair = (index: number, imei1: string, imei2?: string) => {
    const updated = [...cart];
    updated[index].selectedImei = imei1;
    updated[index].selectedImei2 = imei2;
    setCart(updated);
  };

  const updateItemImei = (index: number, imei: string) => {
    const updated = [...cart];
    updated[index].selectedImei = imei.replace(/\D/g, '').slice(0, 15);
    setCart(updated);
  };

  const updateItemImei2 = (index: number, imei2: string) => {
    const updated = [...cart];
    updated[index].selectedImei2 = imei2.replace(/\D/g, '').slice(0, 15);
    setCart(updated);
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    const backupItems = [...cart];
    const backupDiscount = orderDiscount;
    const totalItemsCount = backupItems.reduce((s, i) => s + i.quantity, 0);
    setCart([]);
    setOrderDiscount(0);
    setClearedCartBackup({ cart: backupItems, orderDiscount: backupDiscount });
    setScanToast({
      type: 'warning',
      text: 'Cart has been cleared',
      subtext: `${totalItemsCount} item${totalItemsCount > 1 ? 's' : ''} removed`,
      canUndoClear: true
    });
  };

  // Pending pre-orders count (Pending or Stock Arrived)
  const pendingPreOrdersCount = useMemo(() => {
    return preOrders.filter(p => p.status === 'Pending' || p.status === 'Stock Arrived').length;
  }, [preOrders]);

  // Handle selecting pre-order for fulfillment
  const handleSelectPreOrderForFulfillment = useCallback((order: PreOrder) => {
    setActivePreOrderFulfillment(order);
    setIsPreOrderSearchModalOpen(false);

    // 1. Associate customer
    if (order.customerId) {
      setSelectedCustomerId(order.customerId);
    } else if (order.customerPhone) {
      const matchedCust = customers.find(
        c => c.phone === order.customerPhone || 
        c.name.toLowerCase() === order.customerName.toLowerCase()
      );
      if (matchedCust) {
        setSelectedCustomerId(matchedCust.id);
      }
    }

    // 2. Look for product in catalog or create virtual preorder item
    const matchedProd = products.find(p => 
      p.name.toLowerCase() === order.phoneModel.toLowerCase() ||
      (order.brand && p.brand.toLowerCase() === order.brand.toLowerCase() && p.model.toLowerCase() === order.phoneModel.toLowerCase())
    );

    const orderQty = Math.max(1, order.quantity || 1);
    const itemUnitPrice = order.unitPrice && order.unitPrice > 0 
      ? order.unitPrice 
      : Math.round(order.fullPrice / orderQty);

    const productToAdd: Product = matchedProd ? {
      ...matchedProd,
      color: order.color || matchedProd.color,
      ram: order.ram || matchedProd.ram,
      rom: order.rom || matchedProd.rom,
      sellingPrice: itemUnitPrice,
    } : {
      id: `pre-prod-${Date.now()}`,
      name: `${order.brand ? order.brand + ' ' : ''}${order.phoneModel}`,
      brand: order.brand || 'Device',
      model: order.phoneModel,
      category: 'new_phones',
      condition: 'brand_new',
      sku: order.preOrderNumber,
      barcode: order.allocatedBarcode || order.preOrderNumber,
      costPrice: Math.round((itemUnitPrice || (order.depositAmount / orderQty) * 2) * 0.82),
      sellingPrice: itemUnitPrice,
      stock: orderQty,
      minStockAlert: 1,
      ram: order.ram,
      rom: order.rom,
      color: order.color,
      imeiList: order.allocatedImeis || (order.allocatedImei ? [order.allocatedImei] : []),
      imeiPairs: order.allocatedImeiPairs || (order.allocatedImei ? [{ imei1: order.allocatedImei, imei2: order.allocatedImei2 }] : []),
      warrantyMonths: 12,
      description: `Pre-order for ${order.customerName} (${order.preOrderNumber}) - Qty: ${orderQty}`,
    };

    // Load exactly the requested quantity of pre-order units into cart without repeated stacking
    const newCartItems: CartItem[] = [];
    if (order.allocatedImeis && order.allocatedImeis.length > 0) {
      order.allocatedImeis.forEach((im, idx) => {
        const pair = order.allocatedImeiPairs?.[idx];
        newCartItems.push({
          product: productToAdd,
          quantity: 1,
          selectedImei: im,
          selectedImei2: pair?.imei2,
          discount: 0,
          warrantyPeriod: productToAdd.warrantyMonths > 0 ? `${productToAdd.warrantyMonths} Months Warranty` : 'No Warranty',
        });
      });
    } else {
      for (let i = 0; i < orderQty; i++) {
        let assignedImei1 = (i === 0 ? order.allocatedImei : undefined);
        let assignedImei2 = (i === 0 ? order.allocatedImei2 : undefined);

        if (!assignedImei1 && productToAdd.imeiList && productToAdd.imeiList.length > 0) {
          const usedImeis = newCartItems.map(item => item.selectedImei).filter(Boolean);
          const avail = productToAdd.imeiList.find(im => !usedImeis.includes(im));
          if (avail) {
            assignedImei1 = avail;
            const pairMatch = productToAdd.imeiPairs?.find(p => p.imei1 === avail || p.imei2 === avail);
            if (pairMatch) {
              assignedImei2 = pairMatch.imei1 === avail ? pairMatch.imei2 : pairMatch.imei1;
            }
          }
        }

        newCartItems.push({
          product: productToAdd,
          quantity: 1,
          selectedImei: assignedImei1,
          selectedImei2: assignedImei2,
          discount: 0,
          warrantyPeriod: productToAdd.warrantyMonths > 0 ? `${productToAdd.warrantyMonths} Months Warranty` : 'No Warranty',
        });
      }
    }

    setCart(newCartItems);

    if (scannerSoundEnabled) playSuccessBeep();
    setScanToast({
      type: 'success',
      text: `Pre-Order #${order.preOrderNumber} Loaded! (${orderQty} Unit${orderQty > 1 ? 's' : ''})`,
      subtext: `Deposit of ${formatCurrency(order.depositAmount, settings.currencySymbol)} credited. Balance to pay: ${formatCurrency(order.remainingBalance, settings.currencySymbol)}`,
    });
  }, [customers, products, scannerSoundEnabled, settings.currencySymbol]);

  // Sync external pre-order prop when opened from Pre-Orders manager
  useEffect(() => {
    if (activePreOrderToFulfill && activePreOrderToFulfill.id !== lastFulfilledPreOrderIdRef.current) {
      lastFulfilledPreOrderIdRef.current = activePreOrderToFulfill.id;
      handleSelectPreOrderForFulfillment(activePreOrderToFulfill);
      if (onClearActivePreOrder) {
        onClearActivePreOrder();
      }
    }
  }, [activePreOrderToFulfill, handleSelectPreOrderForFulfillment, onClearActivePreOrder]);

  // Calculations
  const subtotal = cart.reduce((sum, item) => {
    const price = item.customPrice ?? item.product.sellingPrice;
    return sum + (price * item.quantity);
  }, 0);

  const itemDiscounts = cart.reduce((sum, item) => sum + item.discount, 0);
  const globalDiscountAmount = discountType === 'percent' 
    ? (subtotal * (orderDiscount / 100)) 
    : orderDiscount;
  const totalDiscount = Number((itemDiscounts + globalDiscountAmount).toFixed(2));

  const taxableSubtotal = Math.max(0, subtotal - totalDiscount);
  const taxRate = taxEnabled ? settings.taxRatePercent : 0;
  const taxAmount = Number(((taxableSubtotal * taxRate) / 100).toFixed(2));
  
  // Pre-Order Deposit Deduction
  const preOrderDepositDeduction = activePreOrderFulfillment ? activePreOrderFulfillment.depositAmount : 0;
  const grandTotal = Number(Math.max(0, taxableSubtotal + taxAmount - preOrderDepositDeduction).toFixed(2));

  const handleCreateQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) return;
    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim() || undefined,
      totalSpent: 0,
      totalVisits: 1,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    onAddNewCustomer(newCust);
    setSelectedCustomerId(newCust.id);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setIsQuickCustomerOpen(false);
  };

  const handleSalePaymentConfirmed = (paymentInfo: {
    paymentMethod: PaymentMethod;
    amountPaid: number;
    balanceDue: number;
    paymentDetails?: any;
    pointsEarned: number;
    pointsRedeemed: number;
  }) => {
    const invoiceNumber = `${settings.invoicePrefix}${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const saleItems = cart.map(item => ({
      productId: item.product.id,
      name: item.product.name,
      brand: item.product.brand,
      category: item.product.category,
      subCategory: item.product.subCategory,
      color: item.product.color,
      ram: item.product.ram,
      rom: item.product.rom,
      imei: item.selectedImei,
      imei2: item.selectedImei2,
      quantity: item.quantity,
      unitPrice: item.customPrice ?? item.product.sellingPrice,
      costPrice: item.product.costPrice,
      discount: item.discount,
      finalPrice: Number(((item.customPrice ?? item.product.sellingPrice) * item.quantity - item.discount).toFixed(2)),
      warrantyPeriod: item.warrantyPeriod,
    }));

    const newSale: Sale = {
      id: `sale-${Date.now()}`,
      invoiceNumber,
      date: new Date().toISOString(),
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer ? selectedCustomer.name : 'Walk-in Customer',
      customerPhone: selectedCustomer ? selectedCustomer.phone : '',
      customerAddress: selectedCustomer?.address,
      items: saleItems,
      subtotal,
      discountTotal: totalDiscount,
      taxTotal: taxAmount,
      taxRate,
      grandTotal,
      paymentMethod: paymentInfo.paymentMethod,
      amountPaid: paymentInfo.amountPaid,
      balanceDue: paymentInfo.balanceDue,
      paymentDetails: paymentInfo.paymentDetails,
      pointsEarned: paymentInfo.pointsEarned,
      pointsRedeemed: paymentInfo.pointsRedeemed,
      soldBy: settings.currentStaffName,
      status: 'completed',
      preOrderId: activePreOrderFulfillment?.id,
      preOrderNumber: activePreOrderFulfillment?.preOrderNumber,
      depositDeducted: activePreOrderFulfillment?.depositAmount,
    };

    // Fulfill pre-order in storage if active
    if (activePreOrderFulfillment) {
      StorageService.updatePreOrderStatus(activePreOrderFulfillment.id, 'Completed', {
        fulfilledSaleId: newSale.id,
        fulfilledInvoiceNumber: newSale.invoiceNumber,
        fulfilledBy: settings.currentStaffName || 'Cashier',
      });
      refreshPreOrdersFromStorage();
      if (onClearActivePreOrder) {
        onClearActivePreOrder();
      }
    }

    // If Credit Sale (Accounts Receivable), generate and store CreditSaleRecord
    if (paymentInfo.paymentMethod === 'credit') {
      const downPayment = paymentInfo.paymentDetails?.downPayment || 0;
      const principalCredit = Math.max(0, grandTotal - downPayment);
      const creditNumber = `CR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const dueDate = paymentInfo.paymentDetails?.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const creditRecord: CreditSaleRecord = {
        id: `credit-${Date.now()}`,
        creditNumber,
        saleId: newSale.id,
        invoiceNumber: newSale.invoiceNumber,
        customerId: selectedCustomer?.id || '',
        customerName: selectedCustomer ? selectedCustomer.name : 'Walk-in Credit Customer',
        customerPhone: selectedCustomer?.phone || '',
        customerAddress: selectedCustomer?.address,
        customerNrc: selectedCustomer?.nrcNumber,
        totalSaleAmount: grandTotal,
        downPayment,
        downPaymentMethod: paymentInfo.paymentDetails?.downPaymentMethod || 'cash',
        downPaymentDetails: {
          transactionRef: paymentInfo.paymentDetails?.transactionRef,
          accountName: paymentInfo.paymentDetails?.accountName,
        },
        principalCreditAmount: principalCredit,
        interestRatePercent: paymentInfo.paymentDetails?.interestRatePercent || 0,
        interestAmount: paymentInfo.paymentDetails?.interestAmount || 0,
        totalPayable: principalCredit + (paymentInfo.paymentDetails?.interestAmount || 0),
        totalPaid: downPayment,
        remainingBalance: principalCredit + (paymentInfo.paymentDetails?.interestAmount || 0),
        startDate: new Date().toISOString(),
        dueDate,
        termDays: paymentInfo.paymentDetails?.termDays || 30,
        installmentCount: paymentInfo.paymentDetails?.installmentCount || 1,
        installmentFrequency: paymentInfo.paymentDetails?.installmentFrequency || 'monthly',
        installments: paymentInfo.paymentDetails?.installments || [{
          installmentNumber: 1,
          dueDate,
          amountDue: principalCredit,
          amountPaid: 0,
          status: 'pending'
        }],
        status: downPayment > 0 ? 'partially_paid' : 'active',
        repayments: [],
        guarantorName: paymentInfo.paymentDetails?.guarantorName || selectedCustomer?.guarantorName,
        guarantorPhone: paymentInfo.paymentDetails?.guarantorPhone || selectedCustomer?.guarantorPhone,
        guarantorNrc: paymentInfo.paymentDetails?.guarantorNrc || selectedCustomer?.guarantorNrc,
        collateralDescription: paymentInfo.paymentDetails?.collateralDescription,
        itemsSummary: saleItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
        items: saleItems,
        imeis: saleItems.map(i => i.imei).filter(Boolean) as string[],
        createdBy: settings.currentStaffName,
        createdAt: new Date().toISOString(),
        notes: paymentInfo.paymentDetails?.notes,
        promissoryAgreementTerms: paymentInfo.paymentDetails?.promissoryAgreementTerms,
      };

      StorageService.saveCreditSale(creditRecord);
    }

    // Deduct stock and remove used IMEIs from products
    const updatedProducts = products.map(prod => {
      const soldItemsOfProd = cart.filter(c => c.product.id === prod.id);
      if (soldItemsOfProd.length === 0) return prod;

      const totalQtySold = soldItemsOfProd.reduce((s, i) => s + i.quantity, 0);
      const usedImeis = soldItemsOfProd.map(i => i.selectedImei).filter(Boolean) as string[];
      const usedImei2s = soldItemsOfProd.map(i => i.selectedImei2).filter(Boolean) as string[];
      const allUsedImeis = [...usedImeis, ...usedImei2s];

      const updatedImeiList = prod.imeiList ? prod.imeiList.filter(im => !allUsedImeis.includes(im)) : undefined;
      const updatedImeiPairs = prod.imeiPairs 
        ? prod.imeiPairs.filter(p => !usedImeis.includes(p.imei1) && (!p.imei2 || !usedImei2s.includes(p.imei2))) 
        : undefined;

      return {
        ...prod,
        stock: Math.max(0, prod.stock - totalQtySold),
        imeiList: updatedImeiList,
        imeiPairs: updatedImeiPairs,
      };
    });

    // Update customer stats
    let updatedCust: Customer | undefined;
    if (selectedCustomer) {
      updatedCust = {
        ...selectedCustomer,
        totalSpent: Number((selectedCustomer.totalSpent + grandTotal).toFixed(2)),
        totalVisits: selectedCustomer.totalVisits + 1,
        loyaltyPoints: Math.max(0, selectedCustomer.loyaltyPoints - paymentInfo.pointsRedeemed + paymentInfo.pointsEarned),
      };
    }

    onCompleteSale(newSale, updatedProducts, updatedCust);
    setIsPaymentModalOpen(false);
    setCompletedSale(newSale);
    setActivePreOrderFulfillment(null);
    lastFulfilledPreOrderIdRef.current = null;
    setCart([]);
    setOrderDiscount(0);
  };

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState<boolean>(false);
  const [isSubCategoryDropdownOpen, setIsSubCategoryDropdownOpen] = useState<boolean>(false);
  const [isRamDropdownOpen, setIsRamDropdownOpen] = useState<boolean>(false);
  const [isRomDropdownOpen, setIsRomDropdownOpen] = useState<boolean>(false);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState<boolean>(false);

  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  const subCategoryDropdownRef = useRef<HTMLDivElement>(null);
  const ramDropdownRef = useRef<HTMLDivElement>(null);
  const romDropdownRef = useRef<HTMLDivElement>(null);
  const colorDropdownRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => [
    { id: 'all', label: 'All Items', icon: Layers, count: products.length },
    { id: 'brand_new_phones', label: 'Brand new phones', icon: Smartphone, count: products.filter(p => canonicalCategory(p.category) === 'brand_new_phones').length },
    { id: 'pre_owned_phones', label: 'Pre-owned Phones', icon: Smartphone, count: products.filter(p => canonicalCategory(p.category) === 'pre_owned_phones').length },
    { id: 'accessories_gadgets', label: 'Accessories & Gadgets', icon: Sparkles, count: products.filter(p => canonicalCategory(p.category) === 'accessories_gadgets').length },
    { id: 'cookware', label: 'Cookware', icon: Utensils, count: products.filter(p => canonicalCategory(p.category) === 'cookware').length },
    { id: 'sim_cards', label: 'Sim Cards', icon: CreditCard, count: products.filter(p => canonicalCategory(p.category) === 'sim_cards').length },
  ], [products]);

  const activeCategoryOption = useMemo(() => {
    return categories.find(c => c.id === selectedCategory) || categories[0];
  }, [categories, selectedCategory]);

  const activeCategoryIndex = useMemo(() => {
    return categories.findIndex(c => c.id === selectedCategory);
  }, [categories, selectedCategory]);

  const handlePrevCategory = () => {
    const prev = activeCategoryIndex > 0 ? activeCategoryIndex - 1 : categories.length - 1;
    handleCategoryChange(categories[prev].id);
  };

  const handleNextCategory = () => {
    const next = activeCategoryIndex < categories.length - 1 ? activeCategoryIndex + 1 : 0;
    handleCategoryChange(categories[next].id);
  };

  // Close all dropdowns on outside click or Esc
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(target)) {
        setIsCategoryDropdownOpen(false);
      }
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(target)) {
        setIsBrandDropdownOpen(false);
      }
      if (subCategoryDropdownRef.current && !subCategoryDropdownRef.current.contains(target)) {
        setIsSubCategoryDropdownOpen(false);
      }
      if (ramDropdownRef.current && !ramDropdownRef.current.contains(target)) {
        setIsRamDropdownOpen(false);
      }
      if (romDropdownRef.current && !romDropdownRef.current.contains(target)) {
        setIsRomDropdownOpen(false);
      }
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(target)) {
        setIsColorDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCategoryDropdownOpen(false);
        setIsBrandDropdownOpen(false);
        setIsSubCategoryDropdownOpen(false);
        setIsRamDropdownOpen(false);
        setIsRomDropdownOpen(false);
        setIsColorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div id="pos-screen" className="max-w-7xl mx-auto p-2.5 sm:p-6 lg:p-8 w-full min-w-0 overflow-x-hidden">
      
      {/* Top Bar: Barcode, IMEI & SKU Scanner Bar with Camera & Sound controls */}
      <div className="space-y-2 mb-4 sm:mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 items-center">
          
          {/* Fast Barcode / IMEI / SKU Scanner Input */}
          <div className="lg:col-span-8 relative min-w-0" ref={scannerDropdownRef}>
            <form onSubmit={handleBarcodeSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="relative flex-1 min-w-0">
                  {detectedCodeCategory?.type === 'imei' ? (
                    <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 absolute left-3 top-2.5 sm:top-3 animate-pulse" />
                  ) : detectedCodeCategory?.type === 'sku' ? (
                    <Tag className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 absolute left-3 top-2.5 sm:top-3" />
                  ) : (
                    <Barcode className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 absolute left-3 top-2.5 sm:top-3" />
                  )}

                  <input
                    ref={barcodeInputRef}
                    id="pos-barcode-scanner-input"
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => {
                      setBarcodeInput(e.target.value);
                      setIsScanDropdownOpen(true);
                    }}
                    onFocus={() => setIsScanDropdownOpen(true)}
                    placeholder="⚡ Scan Barcode, 15-digit IMEI, or SKU..."
                    autoComplete="off"
                    spellCheck={false}
                    style={{ color: '#000000', backgroundColor: '#ffffff' }}
                    className="w-full pl-9 sm:pl-11 pr-20 sm:pr-28 py-2 sm:py-2.5 bg-white border-2 border-indigo-200 focus:border-indigo-600 rounded-xl text-xs sm:text-sm font-mono font-medium text-black shadow-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-400"
                  />

                  {/* Detected Code Tag / Indicator */}
                  {detectedCodeCategory && (
                    <div className="absolute right-2 top-1.5 sm:top-2">
                      <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md shadow-2xs ${
                        detectedCodeCategory.type === 'imei'
                          ? 'bg-indigo-600 text-white animate-pulse'
                          : detectedCodeCategory.type === 'barcode'
                          ? 'bg-emerald-600 text-white'
                          : detectedCodeCategory.type === 'sku'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-white'
                      }`}>
                        <Zap className="w-2.5 h-2.5" />
                        {detectedCodeCategory.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Scan Add Button */}
                <button
                  type="submit"
                  id="pos-scan-submit-btn"
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Barcode className="w-4 h-4 shrink-0" />
                  <span className="hidden xs:inline">Scan Add</span>
                  <span className="xs:hidden">Add</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-end">
                {/* Camera Scanner Trigger (F2) */}
                <button
                  type="button"
                  id="pos-camera-scanner-btn"
                  onClick={() => setIsLiveScannerOpen(true)}
                  title="Open Camera Viewfinder & Gun Scanner (F2)"
                  className="flex-1 sm:flex-none justify-center px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer relative group"
                >
                  <Camera className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="text-xs">Camera</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono border border-slate-700 hidden sm:inline">F2</span>
                </button>

                {/* Pre-Order Fulfillment Lookup Button */}
                <button
                  type="button"
                  id="pos-pre-order-btn"
                  onClick={() => {
                    refreshPreOrdersFromStorage();
                    setIsPreOrderSearchModalOpen(true);
                  }}
                  title="Fulfill customer pre-orders, search pending deposits and pre-booked models"
                  className="flex-1 sm:flex-none justify-center px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 shadow-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <CalendarClock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-xs">Pre-Order</span>
                  {pendingPreOrdersCount > 0 && (
                    <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-4 text-center">
                      {pendingPreOrdersCount}
                    </span>
                  )}
                </button>

                {/* Sound Feedback Toggle */}
                <button
                  type="button"
                  onClick={() => setScannerSoundEnabled(!scannerSoundEnabled)}
                  title={scannerSoundEnabled ? "Scanner Beep Audio: ENABLED (Click to mute)" : "Scanner Beep Audio: MUTED (Click to enable)"}
                  className={`p-2 sm:p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                    scannerSoundEnabled 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                      : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {scannerSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {/* Pop-out POS in dedicated new browser tab (desktop only) */}
                <AppLink
                  tab="pos"
                  openInNewTab={true}
                  title="Pop out POS Register into a standalone window or new browser tab (Right click for full browser menu)"
                  className="hidden md:flex p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer shrink-0 items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4 text-slate-600" />
                  <span className="hidden xl:inline text-xs font-semibold">Pop-out</span>
                </AppLink>
              </div>
            </form>

            {/* Autocomplete Dropdown */}
            {isScanDropdownOpen && scannerSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-bold text-slate-500 flex justify-between items-center">
                  <span>Matching Products ({scannerSuggestions.length})</span>
                  <span className="text-[10px] text-slate-400">Click to add to cart</span>
                </div>
                {scannerSuggestions.map((item) => {
                  const prod = item.product;
                  return (
                    <div
                      key={prod.id}
                      onClick={() => {
                        addToCart(prod);
                        setBarcodeInput('');
                        setIsScanDropdownOpen(false);
                      }}
                      className="p-2.5 hover:bg-indigo-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span>{prod.name}</span>
                          {prod.brand && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                              {prod.brand}
                            </span>
                          )}
                          <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.2 bg-indigo-50 text-indigo-700 font-semibold rounded">
                            {item.matchedField}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                          {prod.sku && <span className="font-mono">SKU: {prod.sku}</span>}
                          {prod.barcode && <span className="font-mono">Barcode: {prod.barcode}</span>}
                          {prod.imeiPairs && prod.imeiPairs.length > 0 && (
                            <span className="text-indigo-600 font-bold">{prod.imeiPairs.length} Serial Units Available</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-slate-900">
                          {formatCurrency(prod.sellingPrice, settings.currencySymbol)}
                        </div>
                        <div className={`text-[10px] font-semibold ${prod.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {prod.stock > 0 ? `${prod.stock} in stock` : 'Out of Stock'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product Keyword Filter */}
          <div className="lg:col-span-4 min-w-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5 sm:top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter catalog by name, spec..."
                autoComplete="off"
                spellCheck={false}
                style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

        </div>

        {/* Scan Status Toast Banner */}
        {scanToast && (
          <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all animate-in fade-in slide-in-from-top-1 ${
            scanToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : scanToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {scanToast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : scanToast.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <div className="min-w-0 truncate">
                <span className="font-bold mr-1.5">{scanToast.text}</span>
                {scanToast.subtext && <span className="opacity-80 text-[11px] truncate">{scanToast.subtext}</span>}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {scanToast.canUndoClear && clearedCartBackup && (
                <button
                  type="button"
                  onClick={() => {
                    setCart(clearedCartBackup.cart);
                    setOrderDiscount(clearedCartBackup.orderDiscount);
                    setClearedCartBackup(null);
                    setScanToast({
                      type: 'success',
                      text: 'Cart restored',
                      subtext: `${clearedCartBackup.cart.length} item(s) restored`
                    });
                  }}
                  className="px-2.5 py-0.5 bg-amber-200/80 hover:bg-amber-300 text-amber-950 rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Undo2 className="w-3 h-3" />
                  Undo Clear
                </button>
              )}
              {!scanToast.canUndoClear && scanToast.type === 'success' && cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    removeFromCart(cart.length - 1);
                    setScanToast(null);
                  }}
                  className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Undo2 className="w-3 h-3" />
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={() => setScanToast(null)}
                className="p-1 hover:bg-black/5 rounded text-current opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Catalog vs Cart Toggle (Visible on screens < lg) */}
      <div className="lg:hidden flex items-center bg-slate-200/80 p-1 rounded-2xl shadow-2xs mb-3 w-full">
        <button
          type="button"
          id="pos-mobile-view-catalog-btn"
          onClick={() => setMobileActiveView('catalog')}
          className={`flex-1 py-2 px-2 sm:px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer min-w-0 ${
            mobileActiveView === 'catalog'
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-300'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutGrid className="w-4 h-4 shrink-0" />
          <span className="truncate">Catalog ({filteredProducts.length})</span>
        </button>
        <button
          type="button"
          id="pos-mobile-view-cart-btn"
          onClick={() => setMobileActiveView('cart')}
          className={`flex-1 py-2 px-2 sm:px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer min-w-0 ${
            mobileActiveView === 'cart'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingCart className="w-4 h-4 shrink-0" />
          <span className="truncate">Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
          {cart.length > 0 && (
            <span className={`font-mono text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.2 rounded-md shrink-0 ${
              mobileActiveView === 'cart' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
            }`}>
              {formatCurrency(grandTotal, settings.currencySymbol)}
            </span>
          )}
        </button>
      </div>

      {/* Main Grid: Catalog (Left) + Cart & Checkout (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Category Pills, Filters & Product Catalog Grid */}
        <div className={`lg:col-span-7 space-y-3 ${mobileActiveView === 'cart' ? 'hidden lg:block' : 'block'}`}>
          
          {/* Category Dropdown (Minimalist Design) */}
          <div ref={categoryDropdownRef} className={`relative ${isCategoryDropdownOpen ? 'z-30' : 'z-10'}`}>
            <div className="flex items-center justify-between gap-2.5 bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              
              {/* Dropdown Button */}
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  id="pos-category-dropdown-trigger"
                  onClick={() => setIsCategoryDropdownOpen(prev => !prev)}
                  aria-expanded={isCategoryDropdownOpen}
                  className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-indigo-600 shrink-0 shadow-2xs">
                      <activeCategoryOption.icon className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-black text-slate-900 truncate">
                        {activeCategoryOption.label}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 hidden sm:inline">
                        {activeCategoryOption.count} items
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-slate-400 group-hover:text-slate-700">
                    <span className="text-[11px] font-bold hidden md:inline text-slate-500">Category</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
                  </div>
                </button>

                {/* Popover Menu */}
                {isCategoryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-full sm:w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150 max-h-80 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <span>Filter by Category</span>
                      <span>{categories.length} categories</span>
                    </div>
                    <div className="space-y-1">
                      {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id;
                        const CatIcon = cat.icon;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              handleCategoryChange(cat.id);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 text-white shadow-2xs'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <CatIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-300' : 'text-slate-500'}`} />
                              <span className="truncate">{cat.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {cat.count}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-300 shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Reset or Stepper Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {selectedCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('all')}
                    title="Reset to all categories"
                    className="px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    All
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrevCategory}
                  title="Previous category"
                  className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-bold text-slate-500 px-1 select-none hidden xs:inline">
                  {activeCategoryIndex + 1} / {categories.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextCategory}
                  title="Next category"
                  className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          </div>

          {/* Quick POS Filter Bar (Brand, Subcategory & Specs Dropdowns) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs">
            <div className="flex items-center flex-wrap gap-2">
              
              {/* Brand Dropdown */}
              <div ref={brandDropdownRef} className="relative">
                <button
                  id="pos-brand-filter-dropdown-btn"
                  type="button"
                  onClick={() => {
                    setIsBrandDropdownOpen(prev => !prev);
                    setIsSubCategoryDropdownOpen(false);
                    setIsRamDropdownOpen(false);
                    setIsRomDropdownOpen(false);
                  }}
                  className={`inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                    selectedBrand !== 'all'
                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700'
                  }`}
                  aria-expanded={isBrandDropdownOpen}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[11px] font-medium text-slate-400">Brand:</span>
                    <span className="truncate max-w-[110px]">
                      {selectedBrand === 'all' ? 'All Brands' : selectedBrand}
                    </span>
                    {selectedBrand !== 'all' && (
                      <span className="px-1.5 py-0.2 rounded-md bg-indigo-200/60 text-indigo-900 text-[10px] font-mono font-bold">
                        {availableBrands.find(b => b.name.toLowerCase() === selectedBrand.toLowerCase())?.count || ''}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ${isBrandDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
                </button>

                {isBrandDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl border border-slate-200 shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-extrabold tracking-wider text-slate-400 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <span>Select Brand</span>
                      <span>{availableBrands.length} Brands</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBrand('all');
                          setIsBrandDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          selectedBrand === 'all'
                            ? 'bg-slate-100 text-slate-900 font-bold'
                            : 'text-slate-700 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <span>All Brands</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400">
                            {availableBrands.reduce((s, b) => s + b.count, 0)}
                          </span>
                          {selectedBrand === 'all' && <Check className="w-3.5 h-3.5 text-slate-900 shrink-0" />}
                        </div>
                      </button>
                      {availableBrands.map(b => {
                        const isSelected = selectedBrand.toLowerCase() === b.name.toLowerCase();
                        return (
                          <button
                            key={b.name}
                            type="button"
                            onClick={() => {
                              setSelectedBrand(isSelected ? 'all' : b.name);
                              setIsBrandDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                              isSelected
                                ? 'bg-indigo-50 text-indigo-900 font-bold'
                                : 'text-slate-700 hover:bg-slate-50 font-medium'
                            }`}
                          >
                            <span className="truncate">{b.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                isSelected ? 'bg-indigo-100 text-indigo-800' : 'text-slate-400'
                              }`}>
                                {b.count}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sub Category Dropdown */}
              {availableSubCategories.length > 0 && (
                <div ref={subCategoryDropdownRef} className="relative">
                  <button
                    id="pos-subcategory-filter-dropdown-btn"
                    type="button"
                    onClick={() => {
                      setIsSubCategoryDropdownOpen(prev => !prev);
                      setIsBrandDropdownOpen(false);
                      setIsRamDropdownOpen(false);
                      setIsRomDropdownOpen(false);
                    }}
                    className={`inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      selectedSubCategory !== 'all'
                        ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700'
                    }`}
                    aria-expanded={isSubCategoryDropdownOpen}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Tag className="w-3 h-3 text-indigo-600" />
                      <span className="text-[11px] font-medium text-slate-400">Sub:</span>
                      <span className="truncate max-w-[110px]">
                        {selectedSubCategory === 'all' ? 'All Subcategories' : selectedSubCategory}
                      </span>
                      {selectedSubCategory !== 'all' && (
                        <span className="px-1.5 py-0.2 rounded-md bg-indigo-200/60 text-indigo-900 text-[10px] font-mono font-bold">
                          {availableSubCategories.find(s => s.name.toLowerCase() === selectedSubCategory.toLowerCase())?.count || ''}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0 ${isSubCategoryDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
                  </button>

                  {isSubCategoryDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl border border-slate-200 shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2.5 py-1 text-[10px] uppercase font-extrabold tracking-wider text-slate-400 border-b border-slate-100 mb-1 flex items-center justify-between">
                        <span>Select Subcategory</span>
                        <span>{availableSubCategories.length}</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSubCategory('all');
                            setIsSubCategoryDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            selectedSubCategory === 'all'
                              ? 'bg-slate-100 text-slate-900 font-bold'
                              : 'text-slate-700 hover:bg-slate-50 font-medium'
                          }`}
                        >
                          <span>All Subcategories</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-400">
                              {availableSubCategories.reduce((s, sub) => s + sub.count, 0)}
                            </span>
                            {selectedSubCategory === 'all' && <Check className="w-3.5 h-3.5 text-slate-900 shrink-0" />}
                          </div>
                        </button>
                        {availableSubCategories.map(s => {
                          const isSelected = selectedSubCategory.toLowerCase() === s.name.toLowerCase();
                          return (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => {
                                setSelectedSubCategory(isSelected ? 'all' : s.name);
                                setIsSubCategoryDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                isSelected
                                  ? 'bg-indigo-50 text-indigo-900 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <span className="truncate">{s.name}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                  isSelected ? 'bg-indigo-100 text-indigo-800' : 'text-slate-400'
                                }`}>
                                  {s.count}
                                </span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RAM Dropdown (Phone Categories) */}
              {isPhoneCategoryActive && availableRams.length > 0 && (
                <div ref={ramDropdownRef} className="relative">
                  <button
                    id="pos-ram-filter-dropdown-btn"
                    type="button"
                    onClick={() => {
                      setIsRamDropdownOpen(prev => !prev);
                      setIsBrandDropdownOpen(false);
                      setIsSubCategoryDropdownOpen(false);
                      setIsRomDropdownOpen(false);
                    }}
                    className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      selectedRam !== 'all'
                        ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700'
                    }`}
                    aria-expanded={isRamDropdownOpen}
                  >
                    <Cpu className="w-3 h-3 text-indigo-600 shrink-0" />
                    <span className="text-[11px] font-medium text-slate-400">RAM:</span>
                    <span className="truncate">{selectedRam === 'all' ? 'All' : selectedRam}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isRamDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isRamDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-40 bg-white rounded-xl border border-slate-200 shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 text-[10px] uppercase font-extrabold text-slate-400 border-b border-slate-100 mb-1">
                        RAM Size
                      </div>
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRam('all');
                            setIsRamDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                            selectedRam === 'all' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>All RAM</span>
                          {selectedRam === 'all' && <Check className="w-3.5 h-3.5 text-slate-900" />}
                        </button>
                        {availableRams.map(r => (
                          <button
                            key={r.name}
                            type="button"
                            onClick={() => {
                              setSelectedRam(selectedRam.toLowerCase() === r.name.toLowerCase() ? 'all' : r.name);
                              setIsRamDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                              selectedRam.toLowerCase() === r.name.toLowerCase()
                                ? 'bg-indigo-50 text-indigo-900 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{r.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({r.count})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ROM Dropdown (Phone Categories) */}
              {isPhoneCategoryActive && availableRoms.length > 0 && (
                <div ref={romDropdownRef} className="relative">
                  <button
                    id="pos-rom-filter-dropdown-btn"
                    type="button"
                    onClick={() => {
                      setIsRomDropdownOpen(prev => !prev);
                      setIsBrandDropdownOpen(false);
                      setIsSubCategoryDropdownOpen(false);
                      setIsRamDropdownOpen(false);
                    }}
                    className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      selectedRom !== 'all'
                        ? 'bg-purple-50/80 border-purple-300 text-purple-900 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700'
                    }`}
                    aria-expanded={isRomDropdownOpen}
                  >
                    <HardDrive className="w-3 h-3 text-purple-600 shrink-0" />
                    <span className="text-[11px] font-medium text-slate-400">ROM:</span>
                    <span className="truncate">{selectedRom === 'all' ? 'All' : selectedRom}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isRomDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isRomDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-40 bg-white rounded-xl border border-slate-200 shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 text-[10px] uppercase font-extrabold text-slate-400 border-b border-slate-100 mb-1">
                        Storage ROM
                      </div>
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRom('all');
                            setIsRomDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                            selectedRom === 'all' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>All ROM</span>
                          {selectedRom === 'all' && <Check className="w-3.5 h-3.5 text-slate-900" />}
                        </button>
                        {availableRoms.map(r => (
                          <button
                            key={r.name}
                            type="button"
                            onClick={() => {
                              setSelectedRom(selectedRom.toLowerCase() === r.name.toLowerCase() ? 'all' : r.name);
                              setIsRomDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                              selectedRom.toLowerCase() === r.name.toLowerCase()
                                ? 'bg-purple-50 text-purple-900 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{r.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({r.count})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Color Dropdown Filter */}
              {availableColors.length > 0 && (
                <div ref={colorDropdownRef} className="relative">
                  <button
                    id="pos-color-filter-dropdown-btn"
                    type="button"
                    onClick={() => {
                      setIsColorDropdownOpen(prev => !prev);
                      setIsBrandDropdownOpen(false);
                      setIsSubCategoryDropdownOpen(false);
                      setIsRamDropdownOpen(false);
                      setIsRomDropdownOpen(false);
                    }}
                    className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      selectedColor !== 'all'
                        ? 'bg-amber-50/80 border-amber-300 text-amber-900 font-bold'
                        : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700'
                    }`}
                    aria-expanded={isColorDropdownOpen}
                  >
                    {selectedColor !== 'all' ? (
                      <span
                        className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                        style={{ backgroundColor: getColorDotHex(selectedColor) }}
                      />
                    ) : (
                      <Palette className="w-3 h-3 text-amber-600 shrink-0" />
                    )}
                    <span className="text-[11px] font-medium text-slate-400">Color:</span>
                    <span className="truncate max-w-[80px]">{selectedColor === 'all' ? 'All' : selectedColor}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isColorDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isColorDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-48 bg-white rounded-xl border border-slate-200 shadow-xl p-1 z-30 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto">
                      <div className="px-2 py-1 text-[10px] uppercase font-extrabold text-slate-400 border-b border-slate-100 mb-1">
                        Color Variant
                      </div>
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedColor('all');
                            setIsColorDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                            selectedColor === 'all' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>All Colors</span>
                          {selectedColor === 'all' && <Check className="w-3.5 h-3.5 text-slate-900" />}
                        </button>
                        {availableColors.map(c => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => {
                              setSelectedColor(selectedColor.toLowerCase() === c.name.toLowerCase() ? 'all' : c.name);
                              setIsColorDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                              selectedColor.toLowerCase() === c.name.toLowerCase()
                                ? 'bg-amber-50 text-amber-900 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                                style={{ backgroundColor: getColorDotHex(c.name) }}
                              />
                              <span className="truncate">{c.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">({c.count})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reset Active Filters Shortcut */}
              {(selectedBrand !== 'all' || selectedSubCategory !== 'all' || selectedRam !== 'all' || selectedRom !== 'all' || selectedColor !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBrand('all');
                    setSelectedSubCategory('all');
                    setSelectedRam('all');
                    setSelectedRom('all');
                    setSelectedColor('all');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer ml-auto"
                  title="Reset secondary filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              )}

            </div>
          </div>

          {/* Active POS Filters Bar */}
          {(selectedBrand !== 'all' || selectedRam !== 'all' || selectedRom !== 'all' || selectedColor !== 'all' || selectedSubCategory !== 'all' || selectedCategory !== 'all' || searchQuery) && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-xs flex-wrap">
              <span className="text-indigo-900 font-bold text-[11px]">
                Showing {filteredProducts.length} items
              </span>
              <button
                type="button"
                onClick={handleResetCatalogFilters}
                className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset Filters
              </button>
            </div>
          )}

          {/* Product Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                <p className="font-semibold text-xs">No catalog items match your search or filter.</p>
                <button
                  type="button"
                  onClick={handleResetCatalogFilters}
                  className="mt-2 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredProducts.map(product => {
                const cond = getConditionLabel(product.condition);
                const isQuarantined = product.itemStatus === 'Quarantined' || product.itemStatus === 'Pending RMA' || product.itemStatus === 'Written-Off';
                const sellableStock = Math.max(0, product.stock - (product.quarantinedStock || 0));
                const isOutOfStock = sellableStock <= 0;
                const isUnavailable = isOutOfStock || isQuarantined;

                return (
                  <div
                    key={product.id}
                    id={`product-card-${product.id}`}
                    onClick={() => !isUnavailable && addToCart(product)}
                    onMouseEnter={(e) => handleProductMouseEnter(product, e)}
                    onMouseLeave={handleProductMouseLeave}
                    className={`bg-white rounded-xl border p-3 flex flex-col justify-between transition-all cursor-pointer select-none group relative ${
                      isUnavailable
                        ? 'opacity-60 border-slate-200 bg-slate-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-indigo-400 hover:shadow-md active:scale-98'
                    }`}
                  >
                    <div>
                      {/* Top Badges & Photo Preview */}
                      <div className="flex items-center justify-between gap-1 mb-1.5 flex-wrap">
                        {isQuarantined ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border bg-amber-100 text-amber-900 border-amber-300 truncate inline-flex items-center gap-0.5">
                            <ShieldAlert className="w-2.5 h-2.5 text-amber-700" />
                            {product.itemStatus || 'Quarantined'}
                          </span>
                        ) : product.isBStock ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded border bg-emerald-100 text-emerald-900 border-emerald-300 truncate inline-flex items-center gap-0.5">
                            <Tag className="w-2.5 h-2.5 text-emerald-700" />
                            Open-Box B-Stock
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${cond.badgeClass} truncate`}>
                            {product.condition === 'brand_new' ? 'New' : 'Used'}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1 text-[10px] font-bold">
                            <span className={(product.minStockAlert > 0 ? sellableStock <= product.minStockAlert : sellableStock <= 0) ? 'text-rose-600' : 'text-slate-500'}>
                              {sellableStock} sellable
                            </span>
                            {product.quarantinedStock && product.quarantinedStock > 0 ? (
                              <span className="text-[9px] text-amber-700 font-normal">
                                ({product.quarantinedStock} quarantined)
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            id={`pos-preview-btn-${product.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseHoverPreview();
                              setMobilePreviewProduct(product);
                            }}
                            title="View enlarged photo & full specifications"
                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center"
                          >
                            <Info 
                              style={{ width: '20px', height: '21px' }} 
                              className="shrink-0" 
                            />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 mb-1">
                        {product.imageUrl && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-2xs">
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 line-clamp-2 transition-colors flex-1">
                          {product.name}
                        </h4>
                      </div>

                      <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-200">
                          {product.brand}
                        </span>
                        {product.subCategory && (
                          <span className="bg-slate-100 text-slate-700 font-medium px-1 py-0.2 rounded border border-slate-200">
                            {product.subCategory}
                          </span>
                        )}
                        {product.color && product.color.trim() && (
                          <span className="inline-flex items-center gap-1 bg-amber-50/70 text-amber-900 font-semibold px-1.5 py-0.2 rounded border border-amber-200/80">
                            <span
                              className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: getColorDotHex(product.color) }}
                            />
                            <span>{product.color}</span>
                          </span>
                        )}
                        {product.ram && product.ram !== '-' && (
                          <span className="bg-indigo-50 text-indigo-700 font-mono px-1 py-0.2 rounded border border-indigo-200">
                            {product.ram}
                          </span>
                        )}
                        {product.rom && product.rom !== '-' && (
                          <span className="bg-purple-50 text-purple-700 font-mono px-1 py-0.2 rounded border border-purple-200">
                            {product.rom}
                          </span>
                        )}
                        {(!product.ram || product.ram === '-') && (!product.rom || product.rom === '-') && product.storage && (
                          <span className="bg-slate-100 px-1 py-0.2 rounded">{product.storage}</span>
                        )}
                        {product.batteryHealth && (
                          <span className="text-emerald-700 font-semibold">{product.batteryHealth}% Battery</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-900">
                          {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          id={`pos-mobile-specs-btn-${product.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseHoverPreview();
                            setMobilePreviewProduct(product);
                          }}
                          title="View Specs & Photo"
                          className="sm:hidden text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-1 rounded-lg transition-colors flex items-center gap-0.5"
                        >
                          <Info className="w-3 h-3" />
                          <span>Specs</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUnavailable}
                          title={isUnavailable ? (isQuarantined ? 'Item quarantined' : 'Out of stock') : 'Add to cart'}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            isUnavailable 
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-50 group-hover:bg-indigo-600 text-indigo-700 group-hover:text-white'
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Right Column: Active Cart & Billing Station */}
        <div className={`lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${mobileActiveView === 'catalog' ? 'hidden lg:flex' : 'flex'}`}>
          
          {/* Cart Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Current Sale Order</h3>
              <span className="px-2 py-0.2 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-full">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            </div>

            {/* Switch back to catalog on mobile */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileActiveView('catalog')}
                className="lg:hidden text-xs text-indigo-600 hover:text-indigo-800 font-bold px-2 py-1 bg-indigo-50 rounded-lg flex items-center gap-1"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>+ Add Items</span>
              </button>

              {cart.length > 0 && (
                <button
                  type="button"
                  id="pos-clear-cart-btn"
                  onClick={clearCart}
                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-transparent hover:border-rose-200"
                  title="Clear all items from current cart"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear Cart</span>
                </button>
              )}
            </div>
          </div>

          {/* Customer Selection Row */}
          <div className="p-3 bg-slate-50/70 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <select
                id="pos-customer-select"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-medium"
              >
                <option value="">Walk-in Customer (Guest)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone}) - {c.loyaltyPoints} pts
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsQuickCustomerOpen(!isQuickCustomerOpen)}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors"
              >
                + New
              </button>
            </div>

            {/* Quick Customer Add Modal Accordion */}
            {isQuickCustomerOpen && (
              <form onSubmit={handleCreateQuickCustomer} className="mt-2.5 p-3 bg-white border border-indigo-200 rounded-xl space-y-2 shadow-xs">
                <div className="flex justify-between items-center">
                  <h4 className="text-[11px] font-bold text-indigo-900 uppercase">Quick Add Customer</h4>
                  <button type="button" onClick={() => setIsQuickCustomerOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Full Name *"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Phone / WhatsApp *"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Address / Delivery Location (Optional)"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Save & Select Customer
                </button>
              </form>
            )}

            {selectedCustomer && (
              <div className="mt-2 text-[11px] text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg space-y-0.5">
                <div className="flex items-center justify-between">
                  <span>Loyalty Balance: <strong>{selectedCustomer.loyaltyPoints} Points</strong></span>
                  <span>Visits: {selectedCustomer.totalVisits}</span>
                </div>
                {selectedCustomer.address && (
                  <div className="text-[10px] text-slate-600 truncate flex items-center gap-1 pt-1 border-t border-indigo-100/80">
                    <span className="font-semibold text-slate-700">Address:</span>
                    <span className="truncate">{selectedCustomer.address}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Pre-Order Fulfillment Banner */}
          {activePreOrderFulfillment && (
            <div className="p-3 bg-gradient-to-r from-indigo-900 to-slate-900 text-white border-b border-indigo-700/50 space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-bold text-indigo-200">Fulfilling Pre-Order:</span>
                  <span className="font-mono font-black text-amber-300">#{activePreOrderFulfillment.preOrderNumber}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivePreOrderFulfillment(null);
                    lastFulfilledPreOrderIdRef.current = null;
                    if (onClearActivePreOrder) onClearActivePreOrder();
                  }}
                  className="text-[10px] text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-colors"
                >
                  Cancel Pre-Order Link
                </button>
              </div>
              <div className="text-[11px] text-slate-300 grid grid-cols-2 gap-1 bg-black/30 p-2 rounded-lg border border-white/10">
                <div>Model: <strong className="text-white">{activePreOrderFulfillment.phoneModel}</strong> ({activePreOrderFulfillment.ram}/{activePreOrderFulfillment.rom})</div>
                <div className="text-right">Color: <strong className="text-white">{activePreOrderFulfillment.color}</strong></div>
                <div>Agreed Price: <strong className="text-white">{formatCurrency(activePreOrderFulfillment.fullPrice, settings.currencySymbol)}</strong></div>
                <div className="text-right">Deposit Paid: <strong className="text-emerald-400">-{formatCurrency(activePreOrderFulfillment.depositAmount, settings.currencySymbol)}</strong></div>
              </div>
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex-1 max-h-[300px] overflow-y-auto divide-y divide-slate-100 p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold">Cart is empty</p>
                <p className="text-[11px]">Click items from catalog or scan barcodes to begin.</p>
              </div>
            ) : (
              cart.map((item, index) => {
                const isPhone = isPhoneCategory(item.product.category);
                const unitPrice = item.customPrice ?? item.product.sellingPrice;
                const itemTotal = unitPrice * item.quantity - item.discount;

                return (
                  <div key={index} className="pt-2 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{item.product.name}</h4>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{formatCurrency(unitPrice, settings.currencySymbol)} each</span>
                          {item.product.color && item.product.color.trim() && (
                            <span className="inline-flex items-center gap-1 bg-amber-50/80 text-amber-900 font-semibold px-1.5 py-0.2 rounded border border-amber-200/80">
                              <span
                                className="w-1.5 h-1.5 rounded-full border border-black/20 shrink-0"
                                style={{ backgroundColor: getColorDotHex(item.product.color) }}
                              />
                              <span>{item.product.color}</span>
                            </span>
                          )}
                          {item.product.ram && item.product.ram !== '-' && (
                            <span className="bg-indigo-50 text-indigo-700 font-mono px-1 py-0.2 rounded border border-indigo-200">
                              {item.product.ram}
                            </span>
                          )}
                          {item.product.rom && item.product.rom !== '-' && (
                            <span className="bg-purple-50 text-purple-700 font-mono px-1 py-0.2 rounded border border-purple-200">
                              {item.product.rom}
                            </span>
                          )}
                          {item.discount > 0 && (
                            <span className="text-rose-600 font-medium">(-{formatCurrency(item.discount, settings.currencySymbol)} discount)</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-slate-900">
                          {formatCurrency(itemTotal, settings.currencySymbol)}
                        </span>
                      </div>
                    </div>

                    {/* Dual IMEI Selector & Manager for serialized devices */}
                    {isPhone && (
                      <div className="mt-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1.5">
                        {/* If product has imeiPairs, allow choosing from preset pairs */}
                        {item.product.imeiPairs && item.product.imeiPairs.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                              <span className="flex items-center gap-1 font-mono">
                                <Smartphone className="w-3 h-3 text-indigo-600" />
                                Assigned Device Pair:
                              </span>
                              <span className="text-[9px] text-slate-400 font-normal">
                                ({item.product.imeiPairs.length} available)
                              </span>
                            </div>
                            <select
                              value={item.selectedImei || ''}
                              onChange={(e) => {
                                const selected = item.product.imeiPairs?.find(p => p.imei1 === e.target.value);
                                if (selected) {
                                  updateItemImeiPair(index, selected.imei1, selected.imei2);
                                } else {
                                  updateItemImei(index, e.target.value);
                                }
                              }}
                              className="w-full text-[11px] font-mono bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 cursor-pointer font-medium"
                            >
                              {item.product.imeiPairs.map((pair, pIdx) => (
                                <option key={pIdx} value={pair.imei1}>
                                  Unit #{pIdx + 1}: {formatImei(pair.imei1)} {pair.imei2 ? `(IMEI 2: ${formatImei(pair.imei2)})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : item.product.imeiList && item.product.imeiList.length > 0 ? (
                          <div>
                            <div className="text-[10px] font-bold text-slate-600 mb-0.5 font-mono">
                              IMEI 1 (Primary):
                            </div>
                            <select
                              value={item.selectedImei || ''}
                              onChange={(e) => updateItemImei(index, e.target.value)}
                              className="w-full text-[11px] font-mono bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
                            >
                              {item.product.imeiList.map(im => (
                                <option key={im} value={im}>{formatImei(im)}</option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {/* Individual IMEI 1 & IMEI 2 confirmation / custom manual input badges */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-indigo-200">
                            <span className="text-[9px] font-bold text-indigo-700 uppercase">IMEI 1:</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={15}
                              value={item.selectedImei || ''}
                              placeholder="15-digit numeric IMEI..."
                              onChange={(e) => updateItemImei(index, e.target.value)}
                              onKeyDown={(e) => {
                                if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                }
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                                updateItemImei(index, paste);
                              }}
                              className="w-full text-[10px] font-mono font-bold text-slate-800 bg-transparent border-0 p-0 focus:ring-0 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200">
                            <span className="text-[9px] font-bold text-purple-700 uppercase">IMEI 2:</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={15}
                              value={item.selectedImei2 || ''}
                              placeholder="15-digit numeric IMEI 2..."
                              onChange={(e) => updateItemImei2(index, e.target.value)}
                              onKeyDown={(e) => {
                                if (!/^[0-9]$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                }
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 15);
                                updateItemImei2(index, paste);
                              }}
                              className="w-full text-[10px] font-mono font-bold text-slate-800 bg-transparent border-0 p-0 focus:ring-0 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quantity controls & item discount */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {!isPhone ? (
                        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="p-1 hover:bg-slate-200 text-slate-600"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-800">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="p-1 hover:bg-slate-200 text-slate-600"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          1 Unit (Serialized)
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">Disc:</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={item.discount === 0 ? '' : item.discount}
                          onFocus={(e) => e.target.select()}
                          onClick={(e) => e.currentTarget.select()}
                          onChange={(e) => updateItemDiscount(index, e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-300 rounded text-right font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => removeFromCart(index)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Cart Summary & Checkout Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2 text-xs">
            
            {/* Global Discount & Tax Toggles */}
            <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-200">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Order Discount</label>
                <div className="flex mt-0.5">
                  <input
                    type="number"
                    placeholder="0"
                    value={orderDiscount === 0 ? '' : orderDiscount}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onChange={(e) => setOrderDiscount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-l-lg bg-white font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setDiscountType(discountType === 'flat' ? 'percent' : 'flat')}
                    className="px-2 py-1 bg-slate-200 border-y border-r border-slate-300 rounded-r-lg font-bold text-[10px]"
                  >
                    {discountType === 'flat' ? settings.currencySymbol : '%'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Tax ({settings.taxRatePercent}%)</label>
                <button
                  type="button"
                  onClick={() => setTaxEnabled(!taxEnabled)}
                  className={`w-full mt-0.5 py-1 px-2 text-xs font-bold rounded-lg border transition-colors ${
                    taxEnabled
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-500 border-slate-300'
                  }`}
                >
                  {taxEnabled ? `Active (+${formatCurrency(taxAmount, settings.currencySymbol)})` : 'Tax Exempt (0%)'}
                </button>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatCurrency(subtotal, settings.currencySymbol)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Total Discount:</span>
                  <span className="font-semibold">-{formatCurrency(totalDiscount, settings.currencySymbol)}</span>
                </div>
              )}
              {taxEnabled && taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Tax ({settings.taxRatePercent}%):</span>
                  <span>{formatCurrency(taxAmount, settings.currencySymbol)}</span>
                </div>
              )}
              {activePreOrderFulfillment && activePreOrderFulfillment.depositAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                  <span>Pre-Paid Deposit Deduction:</span>
                  <span>-{formatCurrency(activePreOrderFulfillment.depositAmount, settings.currencySymbol)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 pt-1.5 border-t border-slate-200">
                <span>Net Total:</span>
                <span className="text-emerald-700">{formatCurrency(grandTotal, settings.currencySymbol)}</span>
              </div>
            </div>

            {/* Checkout Action Button */}
            <button
              id="pos-checkout-btn"
              type="button"
              disabled={cart.length === 0}
              onClick={() => setIsPaymentModalOpen(true)}
              className="w-full mt-3 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CreditCard className="w-5 h-5" />
              Charge {formatCurrency(grandTotal, settings.currencySymbol)}
            </button>
          </div>

        </div>

      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <PaymentModal
          subtotal={subtotal}
          discount={totalDiscount}
          tax={taxAmount}
          grandTotal={grandTotal}
          customer={selectedCustomer}
          settings={settings}
          preOrderFulfillment={activePreOrderFulfillment ? {
            preOrderNumber: activePreOrderFulfillment.preOrderNumber,
            depositAmount: activePreOrderFulfillment.depositAmount,
            fullPrice: activePreOrderFulfillment.fullPrice,
          } : null}
          onClose={() => setIsPaymentModalOpen(false)}
          onConfirmSale={handleSalePaymentConfirmed}
        />
      )}

      {/* Pre-Order Search & Fulfillment Modal */}
      {isPreOrderSearchModalOpen && (
        <PreOrderSearchModal
          isOpen={isPreOrderSearchModalOpen}
          onClose={() => setIsPreOrderSearchModalOpen(false)}
          preOrders={preOrders}
          settings={settings}
          onSelectPreOrder={handleSelectPreOrderForFulfillment}
          onOpenNewPreOrderForm={() => {
            setIsPreOrderSearchModalOpen(false);
            setIsPreOrderCaptureModalOpen(true);
          }}
        />
      )}

      {/* Pre-Order Capture Modal */}
      {isPreOrderCaptureModalOpen && (
        <PreOrderFormModal
          isOpen={isPreOrderCaptureModalOpen}
          onClose={() => setIsPreOrderCaptureModalOpen(false)}
          onSavePreOrder={(savedPreOrder) => {
            StorageService.savePreOrder(savedPreOrder);
            refreshPreOrdersFromStorage();
            setIsPreOrderCaptureModalOpen(false);
            setScanToast({
              type: 'success',
              text: `Pre-Order #${savedPreOrder.preOrderNumber} Created!`,
              subtext: `Deposit of ${formatCurrency(savedPreOrder.depositAmount, settings.currencySymbol)} recorded. Customer added/synced to CRM.`,
            });
          }}
          onSaveCustomer={onAddNewCustomer}
          products={products}
          customers={customers}
          settings={settings}
        />
      )}

      {/* Invoice Printing & WhatsApp Modal */}
      {completedSale && (
        <InvoicePrintModal
          sale={completedSale}
          settings={settings}
          onClose={() => setCompletedSale(null)}
        />
      )}

      {/* POS Live Camera, Barcode, IMEI & SKU Scanner Modal */}
      {isLiveScannerOpen && (
        <PosLiveScannerModal
          isOpen={isLiveScannerOpen}
          products={products}
          settings={settings}
          cartItemCount={cart.length}
          onClose={() => setIsLiveScannerOpen(false)}
          onAddToCart={addToCart}
        />
      )}

      {/* Mobile Sticky Floating Cart Summary Bar (Visible only when in Catalog view on small screens) */}
      {cart.length > 0 && mobileActiveView === 'catalog' && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 z-30 p-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="min-w-0 pl-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white">{cart.reduce((s, i) => s + i.quantity, 0)} Items in Cart</span>
            </div>
            <div className="text-sm font-black text-emerald-400 font-mono">
              {formatCurrency(grandTotal, settings.currencySymbol)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileActiveView('cart')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
          >
            <span>View Cart & Pay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Product Hover Pop-Up Preview Window (Desktop) */}
      <PosProductHoverPreview
        product={hoveredProduct}
        anchorRect={hoverAnchorRect}
        currencySymbol={settings.currencySymbol}
        onClose={handleCloseHoverPreview}
        onAddToCart={addToCart}
        onOpenMobileModal={(product) => {
          handleCloseHoverPreview();
          setMobilePreviewProduct(product);
        }}
      />

      {/* Product Specification & Enlarged Photo Modal / Bottom Sheet (Mobile & Expanded View) */}
      <PosProductMobileDetailModal
        product={mobilePreviewProduct}
        isOpen={Boolean(mobilePreviewProduct)}
        currencySymbol={settings.currencySymbol}
        onClose={() => setMobilePreviewProduct(null)}
        onAddToCart={addToCart}
      />

    </div>
  );
};
