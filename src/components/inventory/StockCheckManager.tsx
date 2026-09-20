import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Plus, 
  ScanLine, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Check, 
  Trash2, 
  ArrowRight, 
  Download, 
  Printer, 
  Layers, 
  Package, 
  Smartphone, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Filter, 
  Calendar, 
  User, 
  Clock, 
  FileText, 
  X,
  Info,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Camera,
  Barcode,
  QrCode
} from 'lucide-react';
import { 
  Product, 
  StockAuditSession, 
  StockAuditItem, 
  ShopSettings, 
  StaffUser,
  ProductCategory 
} from '../../types';
import { 
  formatCurrency, 
  formatDate, 
  formatDateTime, 
  getCategoryLabel 
} from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { StockAuditScannerModal } from './StockAuditScannerModal';
import { isPhoneCategory, canonicalCategory, CANONICAL_CATEGORIES } from '../../data/categoryTaxonomy';

interface StockCheckManagerProps {
  products: Product[];
  stockAudits: StockAuditSession[];
  settings: ShopSettings;
  staffUsers: StaffUser[];
  onSaveAudit: (audit: StockAuditSession) => void;
  onReconcileAudit: (auditId: string, staffName: string) => void;
  onDeleteAudit: (auditId: string) => void;
  onOpenProductHistory?: (product: Product) => void;
}

export const StockCheckManager: React.FC<StockCheckManagerProps> = ({
  products,
  stockAudits,
  settings,
  staffUsers,
  onSaveAudit,
  onReconcileAudit,
  onDeleteAudit,
  onOpenProductHistory,
}) => {
  // Navigation View: 'active_session' | 'history' | 'new_setup'
  const [currentView, setCurrentView] = useState<'active_session' | 'history' | 'new_setup'>('active_session');
  const [activeSession, setActiveSession] = useState<StockAuditSession | null>(() => {
    // Find first in-progress audit if any
    return stockAudits.find(a => a.status === 'in_progress') || null;
  });

  // Setup Form State
  const [auditScope, setAuditScope] = useState<'all' | 'category' | 'brand' | 'low_stock'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [auditTitle, setAuditTitle] = useState<string>('');
  const [auditorName, setAuditorName] = useState<string>(settings.currentStaffName || 'Staff Auditor');

  // Active Session Workspace State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'discrepancy' | 'matched' | 'uncounted'>('all');
  const [expandedImeiProductId, setExpandedImeiProductId] = useState<string | null>(null);
  const [showReconcileConfirmModal, setShowReconcileConfirmModal] = useState<boolean>(false);
  const [selectedAuditToView, setSelectedAuditToView] = useState<StockAuditSession | null>(null);

  // Rapid Barcode / IMEI Scanner State
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [targetScanProductId, setTargetScanProductId] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState<string>('');
  const [scanFeedback, setScanFeedback] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Play audio beep on scan detection
  const playScanBeep = (isSuccess = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isSuccess ? 'sine' : 'square';
      osc.frequency.setValueAtTime(isSuccess ? 880 : 320, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext unavailable
    }
  };

  // Dynamically compute available categories from products and canonical taxonomy with actual product counts
  const categoryOptions = useMemo(() => {
    // Start with the standard canonical categories
    const list = CANONICAL_CATEGORIES.map(c => {
      // Products that match this category either directly or canonically
      const count = products.filter(p => {
        return p.category === c.id || canonicalCategory(p.category) === c.id;
      }).length;

      return {
        id: c.id,
        label: c.label,
        icon: c.icon === 'Smartphone' ? '📱' :
              c.icon === 'RefreshCw' ? '♻️' :
              c.icon === 'Headphones' ? '🎧' :
              c.icon === 'Utensils' ? '🍳' :
              c.icon === 'CreditCard' ? '💳' : '📦',
        count,
      };
    });

    // Check if products have any non-canonical categories
    const canonicalIds = new Set(CANONICAL_CATEGORIES.map(c => c.id as string));
    const extraCategoryKeys = new Set<string>();
    products.forEach(p => {
      if (p.category) {
        const norm = canonicalCategory(p.category);
        if (!canonicalIds.has(norm) && !canonicalIds.has(p.category)) {
          extraCategoryKeys.add(p.category);
        }
      }
    });

    extraCategoryKeys.forEach(extraKey => {
      const count = products.filter(p => p.category === extraKey).length;
      list.push({
        id: extraKey as ProductCategory,
        label: getCategoryLabel(extraKey),
        icon: '🏷️',
        count,
      });
    });

    return list;
  }, [products]);

  // Extract unique brands with live counts for filtering
  const brandOptions = useMemo(() => {
    const brandMap = new Map<string, number>();
    products.forEach(p => {
      const b = (p.brand || 'Unbranded').trim();
      brandMap.set(b, (brandMap.get(b) || 0) + 1);
    });
    return Array.from(brandMap.entries())
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [products]);

  // Low stock products count
  const lowStockCount = useMemo(() => {
    return products.filter(p => (p.minStockAlert > 0 ? p.stock <= p.minStockAlert : p.stock <= 0)).length;
  }, [products]);

  // Product count matching selected category
  const selectedCategoryCount = useMemo(() => {
    if (selectedCategory === 'all') return products.length;
    return products.filter(p => {
      const pCanonical = canonicalCategory(p.category);
      const selCanonical = canonicalCategory(selectedCategory);
      return (
        p.category === selectedCategory ||
        pCanonical === selCanonical ||
        pCanonical === selectedCategory ||
        p.category === selCanonical
      );
    }).length;
  }, [products, selectedCategory]);

  // Product count matching selected brand
  const selectedBrandCount = useMemo(() => {
    if (selectedBrand === 'all') return products.length;
    return products.filter(p => p.brand === selectedBrand).length;
  }, [products, selectedBrand]);

  // Handle Starting a New Audit Session
  const handleStartNewAudit = () => {
    // Filter products according to selected scope
    let targetProducts = [...products];

    if (auditScope === 'category' && selectedCategory !== 'all') {
      targetProducts = targetProducts.filter(p => {
        const pCanonical = canonicalCategory(p.category);
        const selCanonical = canonicalCategory(selectedCategory);
        return (
          p.category === selectedCategory ||
          pCanonical === selCanonical ||
          pCanonical === selectedCategory ||
          p.category === selCanonical
        );
      });
    } else if (auditScope === 'brand' && selectedBrand !== 'all') {
      targetProducts = targetProducts.filter(p => p.brand === selectedBrand);
    } else if (auditScope === 'low_stock') {
      targetProducts = targetProducts.filter(p => (p.minStockAlert > 0 ? p.stock <= p.minStockAlert : p.stock <= 0));
    }

    if (targetProducts.length === 0) {
      if (auditScope === 'category') {
        const catName = categoryOptions.find(c => c.id === selectedCategory)?.label || selectedCategory;
        alert(`No products found in the "${catName}" category. Please select a category with active inventory products.`);
      } else if (auditScope === 'brand') {
        alert(`No products found for brand "${selectedBrand}". Please select another brand with active inventory.`);
      } else if (auditScope === 'low_stock') {
        alert('No products are currently at or below minimum stock alert thresholds.');
      } else {
        alert('No products found matching the selected scope criteria.');
      }
      return;
    }

    const auditItems: StockAuditItem[] = targetProducts.map(p => {
      const systemImeis = p.imeiPairs?.map(pair => pair.imei1) || p.imeiList || [];
      return {
        productId: p.id,
        productName: p.name,
        brand: p.brand,
        category: p.category,
        subCategory: p.subCategory,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        bookStock: p.stock,
        countedStock: 0,
        variance: 0 - p.stock, // initially 0 counted = -bookStock
        varianceCost: (0 - p.stock) * p.costPrice,
        status: 'uncounted',
        scannedImeis: [],
        systemImeis: [...systemImeis],
        missingImeis: [...systemImeis],
        extraImeis: [],
      };
    });

    let scopeLabel = 'All Inventory';
    if (auditScope === 'category') {
      const foundCat = categoryOptions.find(c => c.id === selectedCategory);
      scopeLabel = foundCat ? foundCat.label : (selectedCategory === 'all' ? 'All Categories' : getCategoryLabel(selectedCategory));
    } else if (auditScope === 'brand') {
      scopeLabel = selectedBrand === 'all' ? 'All Brands' : `Brand: ${selectedBrand}`;
    } else if (auditScope === 'low_stock') {
      scopeLabel = 'Low Stock Alert';
    }

    const newSessionNumber = `AUD-${new Date().getFullYear()}-${String(stockAudits.length + 1).padStart(3, '0')}`;
    const newSession: StockAuditSession = {
      id: `audit-${Date.now()}`,
      auditNumber: newSessionNumber,
      title: auditTitle.trim() || `Physical Stock Audit (${scopeLabel})`,
      scope: auditScope,
      filterValue: auditScope === 'category' ? selectedCategory : auditScope === 'brand' ? selectedBrand : undefined,
      createdAt: new Date().toISOString(),
      status: 'in_progress',
      items: auditItems,
      totalBookQuantity: auditItems.reduce((sum, i) => sum + i.bookStock, 0),
      totalCountedQuantity: 0,
      totalVarianceQuantity: 0 - auditItems.reduce((sum, i) => sum + i.bookStock, 0),
      totalVarianceCost: auditItems.reduce((sum, i) => sum + (0 - i.bookStock) * i.costPrice, 0),
      matchedItemsCount: 0,
      discrepantItemsCount: auditItems.length,
      conductedBy: auditorName,
      reconciled: false,
    };

    onSaveAudit(newSession);
    setActiveSession(newSession);
    setCurrentView('active_session');
  };

  // Update item count in active session
  const updateItemCount = (productId: string, newCountedStock: number) => {
    if (!activeSession) return;
    const count = Math.max(0, newCountedStock);

    const updatedItems = activeSession.items.map(item => {
      if (item.productId !== productId) return item;

      const variance = count - item.bookStock;
      const varianceCost = variance * item.costPrice;
      const status: StockAuditItem['status'] = 
        count === 0 && item.bookStock > 0 ? 'shortage' :
        variance === 0 ? 'matched' :
        variance > 0 ? 'surplus' : 'shortage';

      return {
        ...item,
        countedStock: count,
        variance,
        varianceCost,
        status,
      };
    });

    recalculateAndSaveSession(updatedItems);
  };

  // Recalculates metrics and saves session
  const recalculateAndSaveSession = (updatedItems: StockAuditItem[]) => {
    if (!activeSession) return;

    const totalBookQty = updatedItems.reduce((sum, i) => sum + i.bookStock, 0);
    const totalCountedQty = updatedItems.reduce((sum, i) => sum + i.countedStock, 0);
    const totalVarianceQty = totalCountedQty - totalBookQty;
    const totalVarianceCost = updatedItems.reduce((sum, i) => sum + i.varianceCost, 0);
    const matchedCount = updatedItems.filter(i => i.status === 'matched').length;
    const discrepantCount = updatedItems.filter(i => i.status === 'surplus' || i.status === 'shortage').length;

    const updatedSession: StockAuditSession = {
      ...activeSession,
      items: updatedItems,
      totalBookQuantity: totalBookQty,
      totalCountedQuantity: totalCountedQty,
      totalVarianceQuantity: totalVarianceQty,
      totalVarianceCost: totalVarianceCost,
      matchedItemsCount: matchedCount,
      discrepantItemsCount: discrepantCount,
    };

    setActiveSession(updatedSession);
    onSaveAudit(updatedSession);
  };

  // Handle Comprehensive Scan Barcode or IMEI with rich feedback
  const handleProcessScanCode = useCallback((code: string) => {
    if (!activeSession || !code.trim()) {
      return {
        success: false,
        message: 'No active stock audit session',
      };
    }
    const cleanCode = code.trim();

    // 1. Check for exact IMEI match in session items
    let matchedItem = activeSession.items.find(item => {
      return item.systemImeis?.includes(cleanCode) || item.scannedImeis?.includes(cleanCode);
    });

    // If not found directly, check if catalog product matches
    if (!matchedItem) {
      for (const p of products) {
        const hasImei = p.imeiList?.includes(cleanCode) || 
          p.imeiPairs?.some(pair => pair.imei1 === cleanCode || pair.imei2 === cleanCode);
        if (hasImei) {
          matchedItem = activeSession.items.find(item => item.productId === p.id);
          if (matchedItem) break;
        }
      }
    }

    if (matchedItem) {
      const currentScanned = matchedItem.scannedImeis || [];
      if (currentScanned.includes(cleanCode)) {
        setScanFeedback({
          message: `IMEI ${cleanCode} has already been counted for ${matchedItem.productName}`,
          type: 'warning'
        });
        playScanBeep(false);
        return {
          success: false,
          productName: matchedItem.productName,
          productId: matchedItem.productId,
          bookStock: matchedItem.bookStock,
          newCount: currentScanned.length,
          isDuplicate: true,
          isImei: true,
          message: `Already counted (${currentScanned.length}/${matchedItem.bookStock})`,
        };
      }

      const newScanned = [...currentScanned, cleanCode];
      const newMissing = (matchedItem.systemImeis || []).filter(im => !newScanned.includes(im));
      const newCount = newScanned.length;
      const variance = newCount - matchedItem.bookStock;

      const updatedItems = activeSession.items.map(i => {
        if (i.productId !== matchedItem!.productId) return i;
        return {
          ...i,
          countedStock: newCount,
          variance,
          varianceCost: variance * i.costPrice,
          status: variance === 0 ? 'matched' : (variance > 0 ? 'surplus' : 'shortage') as StockAuditItem['status'],
          scannedImeis: newScanned,
          missingImeis: newMissing,
        };
      });

      recalculateAndSaveSession(updatedItems);
      playScanBeep(true);
      setScanFeedback({
        message: `Scanned IMEI for ${matchedItem.productName} (${newCount}/${matchedItem.bookStock})`,
        type: 'success'
      });

      return {
        success: true,
        productName: matchedItem.productName,
        productId: matchedItem.productId,
        bookStock: matchedItem.bookStock,
        newCount,
        isImei: true,
        message: `Verified (${newCount}/${matchedItem.bookStock} units)`,
      };
    }

    // 2. Check for Barcode or SKU match
    matchedItem = activeSession.items.find(item => {
      return item.barcode === cleanCode || item.sku?.toLowerCase() === cleanCode.toLowerCase();
    });

    if (matchedItem) {
      const newCount = matchedItem.countedStock + 1;
      updateItemCount(matchedItem.productId, newCount);
      playScanBeep(true);
      setScanFeedback({
        message: `+1 Counted: ${matchedItem.productName} (Now: ${newCount} units)`,
        type: 'success'
      });

      return {
        success: true,
        productName: matchedItem.productName,
        productId: matchedItem.productId,
        bookStock: matchedItem.bookStock,
        newCount,
        isImei: false,
        message: `+1 Counted -> ${newCount} units`,
      };
    }

    // 3. Fallback: Not found in audit scope
    playScanBeep(false);
    setScanFeedback({
      message: `No item with barcode/IMEI "${cleanCode}" found in this audit scope.`,
      type: 'error'
    });

    return {
      success: false,
      message: `Code "${cleanCode}" not found in current audit scope`,
    };
  }, [activeSession, products, recalculateAndSaveSession, updateItemCount]);

  // Handle Quick Scan Barcode or IMEI from inline input
  const handleProcessScan = (code: string) => {
    handleProcessScanCode(code);
    setScanInput('');
  };

  // Batch Multi-IMEI Paste Processing
  const handleBatchCountImeis = useCallback((codes: string[]) => {
    if (!activeSession || codes.length === 0) {
      return { processedCount: 0, matchedProductsCount: 0, skippedCount: 0 };
    }

    let processedCount = 0;
    let skippedCount = 0;
    const affectedProductIds = new Set<string>();

    let updatedItems = [...activeSession.items];

    codes.forEach(rawCode => {
      const cleanCode = rawCode.trim();
      if (!cleanCode) return;

      // Check IMEI match first
      let itemIndex = updatedItems.findIndex(item => 
        item.systemImeis?.includes(cleanCode) || item.scannedImeis?.includes(cleanCode)
      );

      if (itemIndex === -1) {
        for (const p of products) {
          const hasImei = p.imeiList?.includes(cleanCode) || 
            p.imeiPairs?.some(pair => pair.imei1 === cleanCode || pair.imei2 === cleanCode);
          if (hasImei) {
            itemIndex = updatedItems.findIndex(item => item.productId === p.id);
            if (itemIndex !== -1) break;
          }
        }
      }

      if (itemIndex !== -1) {
        const item = updatedItems[itemIndex];
        const currentScanned = item.scannedImeis || [];
        if (currentScanned.includes(cleanCode)) {
          skippedCount++;
        } else {
          const newScanned = [...currentScanned, cleanCode];
          const newMissing = (item.systemImeis || []).filter(im => !newScanned.includes(im));
          const newCount = newScanned.length;
          const variance = newCount - item.bookStock;

          updatedItems[itemIndex] = {
            ...item,
            countedStock: newCount,
            variance,
            varianceCost: variance * item.costPrice,
            status: (variance === 0 ? 'matched' : (variance > 0 ? 'surplus' : 'shortage')) as StockAuditItem['status'],
            scannedImeis: newScanned,
            missingImeis: newMissing,
          };
          processedCount++;
          affectedProductIds.add(item.productId);
        }
        return;
      }

      // Check Barcode / SKU match
      itemIndex = updatedItems.findIndex(item => 
        item.barcode === cleanCode || item.sku?.toLowerCase() === cleanCode.toLowerCase()
      );

      if (itemIndex !== -1) {
        const item = updatedItems[itemIndex];
        const newCount = item.countedStock + 1;
        const variance = newCount - item.bookStock;

        updatedItems[itemIndex] = {
          ...item,
          countedStock: newCount,
          variance,
          varianceCost: variance * item.costPrice,
          status: (variance === 0 ? 'matched' : (variance > 0 ? 'surplus' : 'shortage')) as StockAuditItem['status'],
        };
        processedCount++;
        affectedProductIds.add(item.productId);
        return;
      }

      skippedCount++;
    });

    if (processedCount > 0) {
      recalculateAndSaveSession(updatedItems);
    }

    return {
      processedCount,
      matchedProductsCount: affectedProductIds.size,
      skippedCount,
    };
  }, [activeSession, products, recalculateAndSaveSession]);

  // Quick Action: Match All Book Quantities (Quick Baseline)
  const handleQuickMatchAll = () => {
    if (!activeSession) return;
    if (!window.confirm('Set all counted quantities to equal system book stock?')) return;

    const updatedItems = activeSession.items.map(item => ({
      ...item,
      countedStock: item.bookStock,
      variance: 0,
      varianceCost: 0,
      status: 'matched' as const,
      scannedImeis: [...(item.systemImeis || [])],
      missingImeis: [],
      extraImeis: [],
    }));

    recalculateAndSaveSession(updatedItems);
  };

  // Quick Action: Reset All Counts to 0
  const handleResetAllCounts = () => {
    if (!activeSession) return;
    if (!window.confirm('Reset all counted stock quantities back to 0?')) return;

    const updatedItems = activeSession.items.map(item => ({
      ...item,
      countedStock: 0,
      variance: 0 - item.bookStock,
      varianceCost: (0 - item.bookStock) * item.costPrice,
      status: 'uncounted' as const,
      scannedImeis: [],
      missingImeis: [...(item.systemImeis || [])],
      extraImeis: [],
    }));

    recalculateAndSaveSession(updatedItems);
  };

  // Execute Final Reconciliation
  const handleExecuteReconciliation = () => {
    if (!activeSession) return;
    onReconcileAudit(activeSession.id, auditorName);
    setShowReconcileConfirmModal(false);
    setActiveSession(null);
    setCurrentView('history');
  };

  // Filter items in active session
  const filteredActiveItems = useMemo(() => {
    if (!activeSession) return [];

    return activeSession.items.filter(item => {
      // Status filter
      if (statusFilter === 'discrepancy' && item.status !== 'surplus' && item.status !== 'shortage') {
        return false;
      }
      if (statusFilter === 'matched' && item.status !== 'matched') {
        return false;
      }
      if (statusFilter === 'uncounted' && item.status !== 'uncounted') {
        return false;
      }

      // Search keyword filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.productName.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchBarcode = item.barcode.toLowerCase().includes(q);
        const matchBrand = item.brand.toLowerCase().includes(q);
        const matchImei = item.systemImeis?.some(im => im.toLowerCase().includes(q));
        if (!matchName && !matchSku && !matchBarcode && !matchBrand && !matchImei) {
          return false;
        }
      }

      return true;
    });
  }, [activeSession, statusFilter, searchQuery]);

  // Export audit discrepancy report to CSV
  const handleExportAuditCsv = (audit: StockAuditSession) => {
    const headers = [
      'Product Name',
      'Brand',
      'Category',
      'SKU',
      'Barcode',
      'Cost Price (Ks)',
      'System Book Stock',
      'Counted Physical Stock',
      'Variance Qty',
      'Valuation Discrepancy (Ks)',
      'Status',
      'Missing IMEIs',
      'Notes'
    ];

    const rows = audit.items.map(item => [
      item.productName,
      item.brand,
      item.category,
      item.sku,
      item.barcode,
      String(item.costPrice),
      String(item.bookStock),
      String(item.countedStock),
      String(item.variance),
      String(item.varianceCost),
      item.status,
      item.missingImeis?.join('; ') || '-',
      item.notes || '-'
    ]);

    exportToCsv(`Stock_Audit_${audit.auditNumber}_${Date.now()}`, headers, rows);
  };

  return (
    <div id="stock-check-system-container" className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Physical Stock Check & Audit
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Physical stock count reconciliation, continuous barcode/IMEI verification & variance adjustments.
              </p>
            </div>
          </div>
        </div>

        {/* View Navigation Tabs */}
        <div className="flex items-center gap-2 bg-slate-200/80 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setCurrentView('active_session')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentView === 'active_session' 
                ? 'bg-white text-indigo-950 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Stock Count {activeSession ? '(1)' : ''}
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentView === 'history' 
                ? 'bg-white text-indigo-950 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Audit History ({stockAudits.length})
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('new_setup')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Audit</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: NEW AUDIT SETUP */}
      {currentView === 'new_setup' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-3xl mx-auto space-y-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Start New Physical Stock Audit</h2>
            <p className="text-xs text-slate-500">Configure your count scope and assign staff auditors.</p>
          </div>

          <div className="space-y-4">
            {/* Audit Scope Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Audit Scope
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setAuditScope('all')}
                  className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                    auditScope === 'all'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Package className="w-4 h-4 text-indigo-600 mb-1" />
                  <p className="text-xs font-bold">All Inventory</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{products.length} Products</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuditScope('category');
                    if (selectedCategory === 'all' || !categoryOptions.some(c => c.id === selectedCategory)) {
                      const firstCatWithStock = categoryOptions.find(c => c.count > 0);
                      if (firstCatWithStock) setSelectedCategory(firstCatWithStock.id);
                    }
                  }}
                  className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                    auditScope === 'category'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Layers className="w-4 h-4 text-indigo-600 mb-1" />
                  <p className="text-xs font-bold">By Category</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {categoryOptions.filter(c => c.count > 0).length} categories in stock
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuditScope('brand');
                    if (selectedBrand === 'all' || !brandOptions.some(b => b.brand === selectedBrand)) {
                      const firstBrandWithStock = brandOptions.find(b => b.count > 0);
                      if (firstBrandWithStock) setSelectedBrand(firstBrandWithStock.brand);
                    }
                  }}
                  className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                    auditScope === 'brand'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-indigo-600 mb-1" />
                  <p className="text-xs font-bold">By Brand</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {brandOptions.length} brands in store
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAuditScope('low_stock')}
                  className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                    auditScope === 'low_stock'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20 font-bold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 mb-1" />
                  <p className="text-xs font-bold">Low Stock Only</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {lowStockCount} below alert limit
                  </p>
                </button>
              </div>
            </div>

            {/* Scope Specific Filters */}
            {auditScope === 'category' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Select Category</label>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {selectedCategoryCount} {selectedCategoryCount === 1 ? 'product' : 'products'} available
                  </span>
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 cursor-pointer focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="all">🌐 All Categories ({products.length} Products)</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label} ({cat.count} {cat.count === 1 ? 'Product' : 'Products'})
                    </option>
                  ))}
                </select>
                {selectedCategory !== 'all' && selectedCategoryCount === 0 && (
                  <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>No inventory products currently registered in this category. Please select another category.</span>
                  </p>
                )}
              </div>
            )}

            {auditScope === 'brand' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Select Brand</label>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {selectedBrandCount} {selectedBrandCount === 1 ? 'product' : 'products'} available
                  </span>
                </div>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 cursor-pointer focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="all">🌐 All Brands ({products.length} Products)</option>
                  {brandOptions.map((b) => (
                    <option key={b.brand} value={b.brand}>
                      🏷️ {b.brand} ({b.count} {b.count === 1 ? 'Product' : 'Products'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Audit Session Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Audit Title / Memo</label>
              <input
                type="text"
                placeholder="e.g. End of Month Full Stock Audit"
                value={auditTitle}
                onChange={(e) => setAuditTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Auditor Staff Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Lead Auditor (Staff Member)</label>
              <select
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 cursor-pointer"
              >
                {staffUsers.map(u => (
                  <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCurrentView('active_session')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartNewAudit}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Initialize Stock Audit Session</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: ACTIVE AUDIT SESSION WORKSPACE */}
      {currentView === 'active_session' && (
        <>
          {!activeSession ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs max-w-xl mx-auto space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                <ClipboardCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">No Active Stock Audit</h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                There is currently no in-progress stock audit session. Start a new session to begin barcode/IMEI scanning and discrepancy reconciliation.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentView('new_setup')}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start New Audit Session</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              
              {/* Active Session Info Strip */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 font-mono font-bold text-xs border border-amber-400/30 animate-pulse">
                      ● IN PROGRESS
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-bold text-xs">
                      {activeSession.auditNumber}
                    </span>
                    <span className="text-xs text-slate-400">
                      Started: {formatDateTime(activeSession.createdAt)}
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-white">
                    {activeSession.title}
                  </h2>
                  <p className="text-xs text-slate-300">
                    Auditor: <strong className="text-white">{activeSession.conductedBy}</strong> • Scope: <span className="uppercase text-indigo-300 font-semibold">{activeSession.scope}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetScanProductId(null);
                      setIsScannerModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold shadow-md shadow-indigo-900/40 transition-all cursor-pointer flex items-center gap-1.5"
                    title="Open Camera, Barcode & IMEI Scanner"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Camera / Optical Scanner</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickMatchAll}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
                    title="Copy all system book quantities as counted"
                  >
                    Quick Match All
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAllCounts}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
                    title="Reset all counts to zero"
                  >
                    Reset to 0
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReconcileConfirmModal(true)}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/50 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Reconcile & Apply Stock</span>
                  </button>
                </div>
              </div>

              {/* KPI Discrepancy Overview Dashboard Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* Total Book Qty */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                    <span>System Book Units</span>
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    {activeSession.totalBookQuantity}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{activeSession.items.length} Products in scope</p>
                </div>

                {/* Physically Counted Qty */}
                <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                    <span>Counted Physical</span>
                    <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <p className="text-xl font-black text-indigo-950">
                    {activeSession.totalCountedQuantity}
                  </p>
                  <p className="text-[10px] text-indigo-700 font-semibold mt-0.5">Physical items counted</p>
                </div>

                {/* Net Variance Qty */}
                <div className={`p-3.5 rounded-2xl border shadow-xs ${
                  activeSession.totalVarianceQuantity === 0 
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' 
                    : activeSession.totalVarianceQuantity > 0
                    ? 'bg-blue-50/60 border-blue-200 text-blue-950'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                    <span>Quantity Variance</span>
                    {activeSession.totalVarianceQuantity >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-600" />}
                  </div>
                  <p className="text-xl font-black">
                    {activeSession.totalVarianceQuantity > 0 ? `+${activeSession.totalVarianceQuantity}` : activeSession.totalVarianceQuantity} Units
                  </p>
                  <p className="text-[10px] font-medium mt-0.5">
                    {activeSession.totalVarianceQuantity === 0 ? 'Zero variance (Matched)' : activeSession.totalVarianceQuantity > 0 ? 'Surplus / Overstock' : 'Shortage / Missing'}
                  </p>
                </div>

                {/* Valuation Cost Discrepancy */}
                <div className={`p-3.5 rounded-2xl border shadow-xs ${
                  activeSession.totalVarianceCost === 0
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : activeSession.totalVarianceCost > 0
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                    <span>Cost Impact (Ks)</span>
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <p className="text-xl font-black">
                    {activeSession.totalVarianceCost > 0 ? `+` : ''}{formatCurrency(activeSession.totalVarianceCost, settings.currencySymbol)}
                  </p>
                  <p className="text-[10px] font-mono mt-0.5">Discrepancy at cost</p>
                </div>

                {/* Discrepancy Count */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-1">
                    <span>Matched vs Discrepancies</span>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    <span className="text-emerald-700">{activeSession.matchedItemsCount}</span> / <span className="text-rose-700">{activeSession.discrepantItemsCount}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Matched / Needs Adjust</p>
                </div>
              </div>

              {/* Continuous Barcode & IMEI Rapid Scan Bar */}
              <div className="bg-white border-2 border-indigo-500/40 rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ScanLine className="w-4 h-4 text-indigo-600 animate-pulse" />
                    <span>Fast Continuous Barcode / IMEI Scanner</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                    Scan with hardware barcode gun or phone camera
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={scanInputRef}
                      type="text"
                      placeholder="Scan or type Barcode / 15-digit IMEI and press Enter..."
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && scanInput.trim()) {
                          handleProcessScan(scanInput);
                        }
                      }}
                      className="w-full pl-3 pr-20 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleProcessScan(scanInput)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                    >
                      Count
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetScanProductId(null);
                      setIsScannerModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Open Camera / Optical Scanner</span>
                  </button>
                </div>

                {/* Live Scan Notification Toast */}
                {scanFeedback && (
                  <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in duration-150 ${
                    scanFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                    scanFeedback.type === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {scanFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4" />}
                      <span>{scanFeedback.message}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanFeedback(null)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Filter Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                {/* Search */}
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search product name, SKU, barcode, IMEI..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Status Tabs */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({activeSession.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('discrepancy')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      statusFilter === 'discrepancy' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    Discrepancies Only ({activeSession.discrepantItemsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('matched')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      statusFilter === 'matched' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    Matched ({activeSession.matchedItemsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('uncounted')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      statusFilter === 'uncounted' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    Uncounted
                  </button>
                </div>
              </div>

              {/* Physical Audit Stock Table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                        <th className="py-3.5 px-4">Item & Model</th>
                        <th className="py-3.5 px-3">Unit Cost</th>
                        <th className="py-3.5 px-3 text-center">Book Stock</th>
                        <th className="py-3.5 px-3 text-center">Counted (Physical)</th>
                        <th className="py-3.5 px-3 text-center">Variance</th>
                        <th className="py-3.5 px-3 text-right">Cost Discrepancy</th>
                        <th className="py-3.5 px-3 text-center">Status</th>
                        <th className="py-3.5 px-4 text-center">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredActiveItems.map((item) => {
                        const originalProduct = products.find(p => p.id === item.productId);
                        const isPhone = isPhoneCategory(item.category) || (originalProduct && (Boolean(originalProduct.rom && originalProduct.rom !== '-') || Boolean(originalProduct.imeiPairs?.length) || Boolean(originalProduct.imeiList?.length)));
                        const isExpanded = expandedImeiProductId === item.productId;

                        return (
                          <React.Fragment key={item.productId}>
                            <tr className={`hover:bg-slate-50/80 transition-colors ${
                              item.status === 'matched' ? 'bg-emerald-50/20' :
                              item.status === 'shortage' ? 'bg-rose-50/30' :
                              item.status === 'surplus' ? 'bg-blue-50/30' : ''
                            }`}>
                              {/* Item & Model */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-start gap-2.5">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                    isPhone ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {isPhone ? <Smartphone className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-900 text-sm">
                                        {item.productName}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                                        {item.brand}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                      SKU: {item.sku || 'N/A'} • Barcode: {item.barcode}
                                    </p>
                                    {isPhone && (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedImeiProductId(isExpanded ? null : item.productId)}
                                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1 cursor-pointer"
                                      >
                                        <span>Verify IMEIs ({(item.scannedImeis || []).length}/{(item.systemImeis || []).length})</span>
                                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Unit Cost */}
                              <td className="py-3.5 px-3 font-mono text-slate-600">
                                {formatCurrency(item.costPrice, settings.currencySymbol)}
                              </td>

                              {/* Book Stock */}
                              <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-mono">
                                  {item.bookStock}
                                </span>
                              </td>

                              {/* Counted Physical Stock */}
                              <td className="py-3.5 px-3 text-center">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateItemCount(item.productId, item.countedStock - 1)}
                                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.countedStock}
                                    onChange={(e) => updateItemCount(item.productId, parseInt(e.target.value) || 0)}
                                    className="w-14 text-center py-1 bg-white border border-slate-300 rounded-lg font-black text-sm text-indigo-950 focus:ring-2 focus:ring-indigo-500/20"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateItemCount(item.productId, item.countedStock + 1)}
                                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              {/* Variance */}
                              <td className="py-3.5 px-3 text-center font-black font-mono">
                                <span className={`px-2 py-0.5 rounded-md text-xs ${
                                  item.variance === 0 ? 'bg-emerald-100 text-emerald-800' :
                                  item.variance > 0 ? 'bg-blue-100 text-blue-800' :
                                  'bg-rose-100 text-rose-800'
                                }`}>
                                  {item.variance > 0 ? `+${item.variance}` : item.variance}
                                </span>
                              </td>

                              {/* Cost Discrepancy */}
                              <td className={`py-3.5 px-3 text-right font-mono font-bold ${
                                item.varianceCost === 0 ? 'text-slate-400' :
                                item.varianceCost > 0 ? 'text-blue-700' : 'text-rose-700'
                              }`}>
                                {item.varianceCost > 0 ? '+' : ''}{formatCurrency(item.varianceCost, settings.currencySymbol)}
                              </td>

                              {/* Status Badge */}
                              <td className="py-3.5 px-3 text-center">
                                {item.status === 'matched' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                                    <Check className="w-3 h-3" /> Matched
                                  </span>
                                )}
                                {item.status === 'shortage' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200">
                                    <TrendingDown className="w-3 h-3" /> Shortage
                                  </span>
                                )}
                                {item.status === 'surplus' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200">
                                    <TrendingUp className="w-3 h-3" /> Surplus
                                  </span>
                                )}
                                {item.status === 'uncounted' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold text-[11px]">
                                    Uncounted
                                  </span>
                                )}
                              </td>

                              {/* Quick Actions */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTargetScanProductId(item.productId);
                                      setIsScannerModalOpen(true);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                                    title="Scan Barcode / IMEI for this product"
                                  >
                                    <Camera className="w-3 h-3" />
                                    <span>Scan</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateItemCount(item.productId, item.bookStock)}
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                                    title="Set count = book stock"
                                  >
                                    Match
                                  </button>
                                  {originalProduct && onOpenProductHistory && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenProductHistory(originalProduct)}
                                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                                      title="View Product History Timeline"
                                    >
                                      History
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Serial / IMEI Verification Drawer */}
                            {isPhone && isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-slate-200">
                                <td colSpan={8} className="p-4">
                                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 space-y-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                        <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Serial & IMEI Verification Matrix</span>
                                      </h5>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setTargetScanProductId(item.productId);
                                            setIsScannerModalOpen(true);
                                          }}
                                          className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                          <Camera className="w-3.5 h-3.5" />
                                          <span>Scan IMEIs with Camera / Gun</span>
                                        </button>
                                        <span className="text-[11px] text-slate-400">
                                          Click IMEI to toggle verified/scanned status
                                        </span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {(item.systemImeis || []).map((imei) => {
                                        const isScanned = (item.scannedImeis || []).includes(imei);

                                        return (
                                          <button
                                            key={imei}
                                            type="button"
                                            onClick={() => {
                                              const currentScanned = item.scannedImeis || [];
                                              const newScanned = isScanned 
                                                ? currentScanned.filter(im => im !== imei)
                                                : [...currentScanned, imei];
                                              const newMissing = (item.systemImeis || []).filter(im => !newScanned.includes(im));
                                              const newCount = newScanned.length;

                                              const updatedItems = activeSession.items.map(i => {
                                                if (i.productId !== item.productId) return i;
                                                const variance = newCount - i.bookStock;
                                                return {
                                                  ...i,
                                                  countedStock: newCount,
                                                  variance,
                                                  varianceCost: variance * i.costPrice,
                                                  status: variance === 0 ? 'matched' : (variance > 0 ? 'surplus' : 'shortage') as StockAuditItem['status'],
                                                  scannedImeis: newScanned,
                                                  missingImeis: newMissing,
                                                };
                                              });

                                              recalculateAndSaveSession(updatedItems);
                                            }}
                                            className={`p-2 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
                                              isScanned 
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' 
                                                : 'bg-rose-50/50 border-rose-200 text-rose-900 hover:bg-rose-50'
                                            }`}
                                          >
                                            <div className="font-mono text-xs">
                                              <span>{imei}</span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                              isScanned ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-100 text-rose-800'
                                            }`}>
                                              {isScanned ? '✓ Verified' : '✕ Missing'}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </>
      )}

      {/* VIEW 3: AUDIT HISTORY & PAST LOGS */}
      {currentView === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Completed & Archived Stock Audits ({stockAudits.length})
            </h3>
            {stockAudits.length > 0 && (
              <button
                type="button"
                onClick={() => setCurrentView('new_setup')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Audit</span>
              </button>
            )}
          </div>

          {stockAudits.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
              <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600">No past audit logs</p>
              <p className="text-xs text-slate-400 mt-0.5">Physical inventory audit records will be listed here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stockAudits.map((audit) => {
                return (
                  <div
                    key={audit.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:border-indigo-300 transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-mono font-bold text-xs border border-indigo-200">
                            {audit.auditNumber}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                            audit.reconciled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {audit.reconciled ? '✓ Reconciled & Applied' : 'Pending Reconcile'}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-base mt-1.5">
                          {audit.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Audited on {formatDateTime(audit.createdAt)} by <strong className="text-slate-700">{audit.conductedBy}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleExportAuditCsv(audit)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                          title="Export CSV"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete audit log ${audit.auditNumber}?`)) {
                              onDeleteAudit(audit.id);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Delete audit log"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl text-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Book Units</span>
                        <span className="font-black text-slate-900 text-sm">{audit.totalBookQuantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Counted Units</span>
                        <span className="font-black text-indigo-950 text-sm">{audit.totalCountedQuantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Variance</span>
                        <span className={`font-black text-sm font-mono ${
                          audit.totalVarianceQuantity === 0 ? 'text-emerald-700' :
                          audit.totalVarianceQuantity > 0 ? 'text-blue-700' : 'text-rose-700'
                        }`}>
                          {audit.totalVarianceQuantity > 0 ? `+${audit.totalVarianceQuantity}` : audit.totalVarianceQuantity}
                        </span>
                      </div>
                    </div>

                    {/* Notes if any */}
                    {audit.notes && (
                      <p className="text-xs text-slate-600 italic bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                        "{audit.notes}"
                      </p>
                    )}

                    <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                      <span className="text-[11px] text-slate-400">
                        {audit.items.length} items checked
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedAuditToView(audit)}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
                      >
                        View Full Sheet
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONFIRM RECONCILIATION MODAL */}
      {showReconcileConfirmModal && activeSession && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowReconcileConfirmModal(false);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 animate-modal-content">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Confirm Stock Reconciliation
                </h3>
                <p className="text-xs text-slate-500">
                  Audit #{activeSession.auditNumber} • Reconciling inventory records
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total Items in Audit:</span>
                <strong className="text-slate-900">{activeSession.items.length} Products</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Matched Items:</span>
                <strong className="text-emerald-700 font-bold">{activeSession.matchedItemsCount} Items</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Discrepancies to Adjust:</span>
                <strong className="text-rose-700 font-bold">{activeSession.discrepantItemsCount} Items</strong>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Net Quantity Adjustment:</span>
                <strong className="font-mono text-sm text-slate-900">
                  {activeSession.totalVarianceQuantity > 0 ? `+${activeSession.totalVarianceQuantity}` : activeSession.totalVarianceQuantity} Units
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700 font-bold">Total Cost Valuation Impact:</span>
                <strong className="font-mono text-sm text-indigo-950">
                  {formatCurrency(activeSession.totalVarianceCost, settings.currencySymbol)}
                </strong>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Applying reconciliation will permanently adjust real-time stock levels in your inventory to match the physically counted quantities, and record audit adjustment vouchers under stock history.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReconcileConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReconciliation}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer"
              >
                Confirm & Apply Adjustments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW PAST AUDIT DETAIL MODAL */}
      {selectedAuditToView && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedAuditToView(null);
          }}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-mono font-bold text-xs">
                    {selectedAuditToView.auditNumber}
                  </span>
                  <h3 className="font-bold text-slate-900 text-lg">
                    {selectedAuditToView.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conducted by {selectedAuditToView.conductedBy} on {formatDateTime(selectedAuditToView.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAuditToView(null)}
                className="p-2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 font-bold text-[11px] uppercase">
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3 text-center">Book Qty</th>
                      <th className="py-2.5 px-3 text-center">Counted</th>
                      <th className="py-2.5 px-3 text-center">Variance</th>
                      <th className="py-2.5 px-3 text-right">Cost Impact</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {selectedAuditToView.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{item.productName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{item.sku}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{item.bookStock}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-950">{item.countedStock}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">
                          <span className={`px-2 py-0.5 rounded-md ${
                            item.variance === 0 ? 'bg-emerald-50 text-emerald-700' :
                            item.variance > 0 ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {item.variance > 0 ? `+${item.variance}` : item.variance}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {formatCurrency(item.varianceCost, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditToView(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE CAMERA & OPTICAL BARCODE / IMEI AUDIT SCANNER MODAL */}
      {isScannerModalOpen && activeSession && (
        <StockAuditScannerModal
          isOpen={isScannerModalOpen}
          onClose={() => {
            setIsScannerModalOpen(false);
            setTargetScanProductId(null);
          }}
          auditSession={activeSession}
          products={products}
          currencySymbol={settings.currencySymbol}
          targetProductId={targetScanProductId}
          onProcessScanCode={handleProcessScanCode}
          onBatchCountImeis={handleBatchCountImeis}
        />
      )}

    </div>
  );
};
