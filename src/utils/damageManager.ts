import { 
  Product, 
  DamageLog, 
  ItemInventoryStatus,
  DamageReason, 
  DamagePhase,
  DamageDispositionAction,
  ExpenseRecord,
  StockAdjustment,
  ImeiPair
} from '../types';
import { StorageService } from './storage';

export interface QuarantineParams {
  productId: string;
  serialOrImei?: string; // Specific IMEI or Serial number for serialized devices
  imei2?: string;
  reporterName: string;
  notes?: string;
  quarantinedQuantity?: number; // Defaults to 1 unit
}

export interface AssessmentParams {
  logId: string;
  damageReason: DamageReason;
  photoProof?: string;
  assessmentNotes?: string;
  assessedBy: string;
}

export interface DispositionRmaParams {
  logId: string;
  vendorName: string;
  vendorContact?: string;
  rmaTrackingNumber?: string;
  rmaNotes?: string;
  resolvedBy: string;
}

export interface DispositionWriteOffParams {
  logId: string;
  scrapReason?: string;
  authorizedBy: string;
}

export interface DispositionBStockParams {
  logId: string;
  newDiscountedPrice: number;
  bStockCondition?: string; // e.g. "Open-Box/Refurbished"
  bStockNotes?: string;
  resolvedBy: string;
}

/**
 * Generates a human-readable sequential Damage Log number (e.g. DMG-2026-0001)
 */
export function generateDamageLogNumber(): string {
  const logs = StorageService.getDamageLogs();
  const year = new Date().getFullYear();
  const yearPrefix = `DMG-${year}-`;
  
  const currentNumbers = logs
    .map(l => l.logNumber)
    .filter(num => num && num.startsWith(yearPrefix))
    .map(num => parseInt(num.replace(yearPrefix, ''), 10))
    .filter(n => !isNaN(n));

  const nextNum = currentNumbers.length > 0 ? Math.max(...currentNumbers) + 1 : 1;
  return `${yearPrefix}${String(nextNum).padStart(4, '0')}`;
}

// =========================================================================
// PHASE 1: QUARANTINE (ISOLATION)
// Allows a staff member to select an item (via serial number or barcode) 
// and change its status from "Available" to "Quarantined".
// Immediately deducts this item from active sellable inventory.
// =========================================================================
export function quarantineItem(params: QuarantineParams): {
  success: boolean;
  log?: DamageLog;
  updatedProduct?: Product;
  error?: string;
} {
  const products = StorageService.getProducts();
  const productIndex = products.findIndex(p => p.id === params.productId);
  
  if (productIndex === -1) {
    return { success: false, error: 'Product not found in inventory.' };
  }

  const product = { ...products[productIndex] };

  // Validate sellable stock
  if (product.stock <= 0) {
    return { success: false, error: `Cannot quarantine: "${product.name}" has 0 sellable units remaining in stock.` };
  }

  const qtyToQuarantine = params.quarantinedQuantity || 1;
  const previousStock = product.stock;
  const newStock = Math.max(0, product.stock - qtyToQuarantine);
  const previousQuarantined = product.quarantinedStock || 0;

  // Handle Serialized Items / IMEI pairs if specified
  let matchedPair: ImeiPair | undefined;
  if (params.serialOrImei) {
    const cleanSerial = params.serialOrImei.trim();
    if (product.imeiPairs && product.imeiPairs.length > 0) {
      const pairIdx = product.imeiPairs.findIndex(
        p => p.imei1 === cleanSerial || p.imei2 === cleanSerial
      );
      if (pairIdx !== -1) {
        matchedPair = product.imeiPairs[pairIdx];
        const updatedPairs = [...product.imeiPairs];
        updatedPairs[pairIdx] = {
          ...updatedPairs[pairIdx],
          status: 'Quarantined',
        };
        product.imeiPairs = updatedPairs;
      }
    }

    // Add to product quarantinedImeis list
    const currentQuarantinedImeis = new Set(product.quarantinedImeis || []);
    currentQuarantinedImeis.add(cleanSerial);
    if (matchedPair?.imei2) {
      currentQuarantinedImeis.add(matchedPair.imei2);
    }
    product.quarantinedImeis = Array.from(currentQuarantinedImeis);
  }

  // Deduct sellable stock and increment quarantined counter
  product.stock = newStock;
  product.quarantinedStock = previousQuarantined + qtyToQuarantine;

  // If 0 units left sellable, product itemStatus reflects Quarantined
  if (product.stock === 0) {
    product.itemStatus = 'Quarantined';
  }

  // Generate new DamageLog record (Phase 1)
  const newLog: DamageLog = {
    id: `dmg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    logNumber: generateDamageLogNumber(),
    productId: product.id,
    productName: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    sku: product.sku,
    barcode: product.barcode,
    serialOrImei: params.serialOrImei || (matchedPair ? matchedPair.imei1 : undefined),
    imei2: params.imei2 || (matchedPair ? matchedPair.imei2 : undefined),
    costImpact: product.costPrice, // Read-only pulling original unit cost from database
    originalSellingPrice: product.sellingPrice,
    quarantinedQuantity: qtyToQuarantine,
    status: 'Quarantined',
    phase: 'quarantine',
    reportedAt: new Date().toISOString(),
    reportedBy: params.reporterName || 'Staff Member',
    quarantineNotes: params.notes || '',
  };

  // Log stock adjustment audit trail
  const stockAdjustment: StockAdjustment = {
    id: `adj-dmg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    productId: product.id,
    productName: product.name,
    type: 'reduce',
    quantityChange: -qtyToQuarantine,
    previousStock: previousStock,
    newStock: newStock,
    reason: 'damaged',
    reasonNotes: `Quarantined 1 unit${newLog.serialOrImei ? ` (SN/IMEI: ${newLog.serialOrImei})` : ''} by ${params.reporterName}. Deducted from active sellable inventory. Cost impact: ${product.costPrice}. Log: ${newLog.logNumber}`,
    timestamp: new Date().toISOString(),
    adjustedBy: params.reporterName || 'Staff Member',
    imeiList: newLog.serialOrImei ? [newLog.serialOrImei] : undefined,
  };

  // Persist updates
  products[productIndex] = product;
  StorageService.saveProducts(products);
  StorageService.addDamageLog(newLog);
  StorageService.recordStockAdjustment(stockAdjustment);

  return {
    success: true,
    log: newLog,
    updatedProduct: product,
  };
}

// =========================================================================
// PHASE 2: ASSESSMENT & LOGGING FORM
// Manager review form for quarantined items with:
// - "Damage Reason" (Out-of-box failure, Dropped in store, Water damage, Customer return)
// - "Photo Proof" (File upload for damage evidence)
// - "Cost Impact" (Read-only field pulling original unit cost)
// =========================================================================
export function assessDamageLog(params: AssessmentParams): {
  success: boolean;
  updatedLog?: DamageLog;
  error?: string;
} {
  const logs = StorageService.getDamageLogs();
  const logIndex = logs.findIndex(l => l.id === params.logId);

  if (logIndex === -1) {
    return { success: false, error: 'Damage log not found.' };
  }

  const log = { ...logs[logIndex] };

  // Validate damage reason
  const validReasons: DamageReason[] = [
    'Out-of-box failure',
    'Dropped in store',
    'Water damage',
    'Customer return'
  ];

  if (!validReasons.includes(params.damageReason)) {
    return { success: false, error: 'Invalid damage reason selected.' };
  }

  log.damageReason = params.damageReason;
  if (params.photoProof) {
    log.photoProof = params.photoProof;
  }
  log.assessmentNotes = params.assessmentNotes || '';
  log.assessedAt = new Date().toISOString();
  log.assessedBy = params.assessedBy || 'Store Manager';
  log.phase = 'assessment';

  logs[logIndex] = log;
  StorageService.saveDamageLogs(logs);

  return { success: true, updatedLog: log };
}

// =========================================================================
// PHASE 3: FINAL DISPOSITION ACTIONS
// 1. "Return to Vendor (RMA)": Updates status to "Pending RMA" & logs vendor details
// 2. "Write-Off (Scrap)": Permanently removes item from physical inventory counts
//    and logs a financial loss record.
// 3. "Move to B-Stock": Moves item back to "Available" status, flags it as 
//    "Open-Box/Refurbished" and requires input for a new discounted selling price.
// =========================================================================

/**
 * Resolution 1: Return to Vendor (RMA)
 */
export function executeDispositionRma(params: DispositionRmaParams): {
  success: boolean;
  updatedLog?: DamageLog;
  updatedProduct?: Product;
  error?: string;
} {
  const logs = StorageService.getDamageLogs();
  const logIndex = logs.findIndex(l => l.id === params.logId);
  if (logIndex === -1) return { success: false, error: 'Damage log not found.' };

  const log = { ...logs[logIndex] };
  const products = StorageService.getProducts();
  const prodIndex = products.findIndex(p => p.id === log.productId);

  if (!params.vendorName.trim()) {
    return { success: false, error: 'Vendor name is required for RMA return.' };
  }

  // Update DamageLog
  log.status = 'Pending RMA';
  log.phase = 'disposed';
  log.dispositionAction = 'rma';
  log.dispositionDate = new Date().toISOString();
  log.dispositionBy = params.resolvedBy || 'Store Manager';
  log.rmaVendorName = params.vendorName.trim();
  log.rmaVendorContact = params.vendorContact?.trim() || '';
  log.rmaTrackingNumber = params.rmaTrackingNumber?.trim() || '';
  log.rmaNotes = params.rmaNotes?.trim() || '';

  // Update Product status for serialized item
  let updatedProduct: Product | undefined;
  if (prodIndex !== -1) {
    const prod = { ...products[prodIndex] };
    if (log.serialOrImei && prod.imeiPairs) {
      const pairIdx = prod.imeiPairs.findIndex(
        p => p.imei1 === log.serialOrImei || p.imei2 === log.serialOrImei
      );
      if (pairIdx !== -1) {
        const updatedPairs = [...prod.imeiPairs];
        updatedPairs[pairIdx] = {
          ...updatedPairs[pairIdx],
          status: 'Pending RMA',
        };
        prod.imeiPairs = updatedPairs;
      }
    }
    products[prodIndex] = prod;
    StorageService.saveProducts(products);
    updatedProduct = prod;
  }

  logs[logIndex] = log;
  StorageService.saveDamageLogs(logs);

  return { success: true, updatedLog: log, updatedProduct };
}

/**
 * Resolution 2: Write-Off (Scrap)
 * Permanently removes item from physical inventory counts and logs a financial loss record.
 */
export function executeDispositionWriteOff(params: DispositionWriteOffParams): {
  success: boolean;
  updatedLog?: DamageLog;
  updatedProduct?: Product;
  expenseRecord?: ExpenseRecord;
  error?: string;
} {
  const logs = StorageService.getDamageLogs();
  const logIndex = logs.findIndex(l => l.id === params.logId);
  if (logIndex === -1) return { success: false, error: 'Damage log not found.' };

  const log = { ...logs[logIndex] };
  const products = StorageService.getProducts();
  const prodIndex = products.findIndex(p => p.id === log.productId);

  // 1. Create a Financial Loss Record in Expense Ledger
  const voucherNumber = `EXP-SCRAP-${Date.now().toString().slice(-6)}`;
  const financialLossExpense: ExpenseRecord = {
    id: `exp-scrap-${Date.now()}`,
    voucherNumber,
    date: new Date().toISOString().split('T')[0],
    title: `Damaged Stock Write-Off (Scrap): ${log.productName} [${log.logNumber}]`,
    category: 'damage_loss',
    amount: log.costImpact, // The original unit cost pulled from database!
    paymentMethod: 'cash',
    fundingSource: 'revenue_cash',
    paidTo: 'Inventory Scrap Write-Off',
    recordedBy: params.authorizedBy || 'Store Manager',
    paymentRef: log.logNumber,
    deductFromCashDrawer: false,
    notes: `Scrap write-off loss for damaged product: ${log.productName}. Serial/IMEI: ${log.serialOrImei || 'N/A'}. Reason: ${params.scrapReason || log.damageReason || 'Unrepairable damage'}`,
    isAutoGenerated: true,
    isInventoryAssetLoss: true,
  };

  StorageService.saveExpense(financialLossExpense);

  // 2. Permanently remove the item from physical inventory counts
  let updatedProduct: Product | undefined;
  if (prodIndex !== -1) {
    const prod = { ...products[prodIndex] };
    
    // Decrement quarantined stock
    prod.quarantinedStock = Math.max(0, (prod.quarantinedStock || 1) - 1);

    // If serialized, permanently remove or mark written-off in IMEI list & pairs
    if (log.serialOrImei) {
      if (prod.imeiList) {
        prod.imeiList = prod.imeiList.filter(im => im !== log.serialOrImei);
      }
      if (prod.imeiPairs) {
        prod.imeiPairs = prod.imeiPairs.filter(
          p => p.imei1 !== log.serialOrImei && p.imei2 !== log.serialOrImei
        );
      }
      if (prod.quarantinedImeis) {
        prod.quarantinedImeis = prod.quarantinedImeis.filter(im => im !== log.serialOrImei);
      }
    }

    if (prod.stock > 0) {
      prod.itemStatus = 'Available';
    } else {
      prod.itemStatus = 'Written-Off';
    }

    products[prodIndex] = prod;
    StorageService.saveProducts(products);
    updatedProduct = prod;
  }

  // 3. Update DamageLog
  log.status = 'Written-Off';
  log.phase = 'disposed';
  log.dispositionAction = 'write_off';
  log.dispositionDate = new Date().toISOString();
  log.dispositionBy = params.authorizedBy || 'Store Manager';
  log.scrapReason = params.scrapReason || 'Unrepairable damage / scrap disposal';
  log.lossRecordedAmount = log.costImpact;
  log.expenseVoucherNumber = voucherNumber;
  log.expenseId = financialLossExpense.id;

  logs[logIndex] = log;
  StorageService.saveDamageLogs(logs);

  return {
    success: true,
    updatedLog: log,
    updatedProduct,
    expenseRecord: financialLossExpense,
  };
}

/**
 * Resolution 3: Move to B-Stock
 * Moves item back to "Available" status but flags it as "Open-Box/Refurbished"
 * and requires input for a new discounted selling price.
 */
export function executeDispositionBStock(params: DispositionBStockParams): {
  success: boolean;
  updatedLog?: DamageLog;
  updatedProduct?: Product;
  error?: string;
} {
  const logs = StorageService.getDamageLogs();
  const logIndex = logs.findIndex(l => l.id === params.logId);
  if (logIndex === -1) return { success: false, error: 'Damage log not found.' };

  const log = { ...logs[logIndex] };
  const products = StorageService.getProducts();
  const prodIndex = products.findIndex(p => p.id === log.productId);

  if (typeof params.newDiscountedPrice !== 'number' || params.newDiscountedPrice <= 0) {
    return { success: false, error: 'A valid discounted selling price greater than 0 is required.' };
  }

  // 1. Update Product: restore to Available sellable inventory, flag as Open-Box/Refurbished
  let updatedProduct: Product | undefined;
  if (prodIndex !== -1) {
    const prod = { ...products[prodIndex] };
    
    // Add 1 back to sellable stock
    prod.stock = prod.stock + 1;
    // Deduct from quarantined stock
    prod.quarantinedStock = Math.max(0, (prod.quarantinedStock || 1) - 1);

    // Flag as B-Stock
    prod.isBStock = true;
    prod.bStockDiscountedPrice = params.newDiscountedPrice;
    prod.sellingPrice = params.newDiscountedPrice; // Apply new discounted selling price
    prod.condition = 'used_grade_a'; // Open-Box / Refurbished
    prod.itemStatus = 'Available';

    // If serialized, mark pair as Available / In Stock with new selling price
    if (log.serialOrImei) {
      if (prod.imeiPairs) {
        const pairIdx = prod.imeiPairs.findIndex(
          p => p.imei1 === log.serialOrImei || p.imei2 === log.serialOrImei
        );
        if (pairIdx !== -1) {
          const updatedPairs = [...prod.imeiPairs];
          updatedPairs[pairIdx] = {
            ...updatedPairs[pairIdx],
            status: 'In Stock',
            sellingPrice: params.newDiscountedPrice,
          };
          prod.imeiPairs = updatedPairs;
        }
      }
      if (prod.quarantinedImeis) {
        prod.quarantinedImeis = prod.quarantinedImeis.filter(im => im !== log.serialOrImei);
      }
    }

    products[prodIndex] = prod;
    StorageService.saveProducts(products);
    updatedProduct = prod;
  }

  // 2. Update DamageLog
  log.status = 'Available';
  log.phase = 'disposed';
  log.dispositionAction = 'b_stock';
  log.dispositionDate = new Date().toISOString();
  log.dispositionBy = params.resolvedBy || 'Store Manager';
  log.bStockDiscountedPrice = params.newDiscountedPrice;
  log.bStockCondition = params.bStockCondition || 'Open-Box/Refurbished';
  log.bStockNotes = params.bStockNotes || '';

  // 3. Audit Log
  if (updatedProduct) {
    StorageService.recordStockAdjustment({
      id: `adj-bstk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: log.productId,
      productName: log.productName,
      type: 'add',
      quantityChange: 1,
      previousStock: Math.max(0, updatedProduct.stock - 1),
      newStock: updatedProduct.stock,
      reason: 'restock',
      reasonNotes: `Item reinstated to Available stock as Open-Box B-Stock at discounted price ${params.newDiscountedPrice}. Log: ${log.logNumber}`,
      timestamp: new Date().toISOString(),
      adjustedBy: params.resolvedBy || 'Store Manager',
      imeiList: log.serialOrImei ? [log.serialOrImei] : undefined,
    });
  }

  logs[logIndex] = log;
  StorageService.saveDamageLogs(logs);

  return { success: true, updatedLog: log, updatedProduct };
}

/**
 * Validation check for POS Register checkout:
 * Ensures quarantined, pending RMA, or written-off items cannot be sold.
 */
export function isItemSellable(
  product: Product,
  specificImei?: string
): { sellable: boolean; reason?: string } {
  if (product.itemStatus === 'Quarantined') {
    return { sellable: false, reason: `"${product.name}" is currently Quarantined due to damage.` };
  }

  if (product.itemStatus === 'Pending RMA') {
    return { sellable: false, reason: `"${product.name}" is marked as Pending RMA (Vendor Return).` };
  }

  if (product.itemStatus === 'Written-Off') {
    return { sellable: false, reason: `"${product.name}" has been Written-Off (Scrapped).` };
  }

  if (product.stock <= 0) {
    return { sellable: false, reason: `"${product.name}" has 0 units available in stock.` };
  }

  if (specificImei) {
    const clean = specificImei.trim();
    if (product.quarantinedImeis?.includes(clean)) {
      return { 
        sellable: false, 
        reason: `IMEI ${clean} is currently Quarantined due to reported damage. Cannot check out at POS.` 
      };
    }
    const pair = product.imeiPairs?.find(p => p.imei1 === clean || p.imei2 === clean);
    if (pair && (pair.status === 'Quarantined' || pair.status === 'Pending RMA' || pair.status === 'Written-Off')) {
      return { 
        sellable: false, 
        reason: `IMEI ${clean} is marked as "${pair.status}". Cannot check out at POS.` 
      };
    }
  }

  return { sellable: true };
}

/**
 * Helper to search items for Quarantine Selection (by Barcode, Serial/IMEI, SKU, or Name)
 */
export function searchItemsForQuarantine(
  query: string,
  products: Product[]
): Array<{
  product: Product;
  matchedField: 'barcode' | 'imei' | 'sku' | 'name';
  matchedValue: string;
  matchedImeiPair?: ImeiPair;
}> {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const results: Array<{
    product: Product;
    matchedField: 'barcode' | 'imei' | 'sku' | 'name';
    matchedValue: string;
    matchedImeiPair?: ImeiPair;
  }> = [];

  for (const p of products) {
    // Check barcode match
    if (p.barcode && p.barcode.toLowerCase() === clean) {
      results.push({ product: p, matchedField: 'barcode', matchedValue: p.barcode });
      continue;
    }

    // Check serial / IMEI match
    if (p.imeiPairs && p.imeiPairs.length > 0) {
      const pair = p.imeiPairs.find(
        pr => pr.imei1.toLowerCase() === clean || (pr.imei2 && pr.imei2.toLowerCase() === clean)
      );
      if (pair) {
        results.push({
          product: p,
          matchedField: 'imei',
          matchedValue: pair.imei1.toLowerCase() === clean ? pair.imei1 : pair.imei2!,
          matchedImeiPair: pair,
        });
        continue;
      }
    }

    if (p.imeiList && p.imeiList.some(im => im.toLowerCase() === clean)) {
      const im = p.imeiList.find(i => i.toLowerCase() === clean)!;
      results.push({ product: p, matchedField: 'imei', matchedValue: im });
      continue;
    }

    // Check SKU match
    if (p.sku && p.sku.toLowerCase() === clean) {
      results.push({ product: p, matchedField: 'sku', matchedValue: p.sku });
      continue;
    }

    // Partial name/model match
    if (p.name.toLowerCase().includes(clean) || p.model.toLowerCase().includes(clean)) {
      results.push({ product: p, matchedField: 'name', matchedValue: p.name });
    }
  }

  return results;
}

// =========================================================================
// CUSTOMER ERROR ITEM RETURN & EXCHANGE / VENDOR RMA INTAKE
// Handles customer returns for defective/error items:
// Option 1: Replace/exchange with same item from stock if available
// Option 2: Return to vendor (RMA intake) if no stock left
// Seamlessly enters into Quarantine & RMA lifecycle
// =========================================================================
export interface CustomerReturnParams {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  originalInvoiceNumber: string;
  productId: string;
  productName: string;
  defectiveSerialOrImei?: string;
  defectiveImei2?: string;
  defectReason: DamageReason;
  defectNotes: string;
  actionType: 'replace_from_stock' | 'return_to_vendor';
  replacementImei?: string; // If replace_from_stock and serialized
  vendorName?: string; // If return_to_vendor
  processedBy: string;
  photoProof?: string;
}

export function processCustomerDefectiveReturn(params: CustomerReturnParams): {
  success: boolean;
  log?: DamageLog;
  updatedProduct?: Product;
  error?: string;
} {
  const products = StorageService.getProducts();
  const productIndex = products.findIndex(p => p.id === params.productId);

  if (productIndex === -1) {
    return { success: false, error: 'Product not found in store inventory database.' };
  }

  const product = { ...products[productIndex] };
  const previousStock = product.stock;
  const previousQuarantined = product.quarantinedStock || 0;

  if (params.actionType === 'replace_from_stock') {
    // Must have sellable stock available
    if (product.stock <= 0) {
      return { 
        success: false, 
        error: `Cannot replace from stock: "${product.name}" has 0 sellable units remaining in stock. Please select Option 2 (Return to Vendor).` 
      };
    }

    // Deduct 1 unit from stock for the replacement given to customer
    product.stock = Math.max(0, product.stock - 1);
    // Increase quarantined stock for the defective item returned by customer
    product.quarantinedStock = previousQuarantined + 1;

    // Handle serialized IMEI assignment for replacement unit
    if (params.replacementImei && product.imeiPairs && product.imeiPairs.length > 0) {
      const repIdx = product.imeiPairs.findIndex(
        p => p.imei1 === params.replacementImei || p.imei2 === params.replacementImei
      );
      if (repIdx !== -1) {
        const updatedPairs = [...product.imeiPairs];
        updatedPairs[repIdx] = {
          ...updatedPairs[repIdx],
          status: 'Sold',
        };
        product.imeiPairs = updatedPairs;
      }
    }

    // Add defective IMEI to quarantined list
    if (params.defectiveSerialOrImei) {
      const cleanSerial = params.defectiveSerialOrImei.trim();
      const currentQuarantinedImeis = new Set(product.quarantinedImeis || []);
      currentQuarantinedImeis.add(cleanSerial);
      if (params.defectiveImei2) {
        currentQuarantinedImeis.add(params.defectiveImei2.trim());
      }
      product.quarantinedImeis = Array.from(currentQuarantinedImeis);

      // If defective IMEI existed in imeiPairs, mark it as Quarantined
      if (product.imeiPairs) {
        const defIdx = product.imeiPairs.findIndex(
          p => p.imei1 === cleanSerial || p.imei2 === cleanSerial
        );
        if (defIdx !== -1) {
          const updatedPairs = [...product.imeiPairs];
          updatedPairs[defIdx] = {
            ...updatedPairs[defIdx],
            status: 'Quarantined',
          };
          product.imeiPairs = updatedPairs;
        }
      }
    }
  } else {
    // 'return_to_vendor'
    // Defective unit is quarantined directly for vendor RMA
    product.quarantinedStock = previousQuarantined + 1;

    if (params.defectiveSerialOrImei) {
      const cleanSerial = params.defectiveSerialOrImei.trim();
      const currentQuarantinedImeis = new Set(product.quarantinedImeis || []);
      currentQuarantinedImeis.add(cleanSerial);
      if (params.defectiveImei2) {
        currentQuarantinedImeis.add(params.defectiveImei2.trim());
      }
      product.quarantinedImeis = Array.from(currentQuarantinedImeis);
    }
  }

  // Create standard DamageLog (Phase 1 / Pending RMA)
  const isVendorRma = params.actionType === 'return_to_vendor';
  const newLog: DamageLog = {
    id: `dmg-ret-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    logNumber: generateDamageLogNumber(),
    productId: product.id,
    productName: product.name,
    brand: product.brand,
    category: product.category,
    subCategory: product.subCategory,
    sku: product.sku,
    barcode: product.barcode,
    serialOrImei: params.defectiveSerialOrImei,
    imei2: params.defectiveImei2,
    costImpact: product.costPrice,
    originalSellingPrice: product.sellingPrice,
    quarantinedQuantity: 1,
    status: isVendorRma ? 'Pending RMA' : 'Quarantined',
    phase: 'quarantine',
    damageReason: params.defectReason || 'Customer return',
    reportedAt: new Date().toISOString(),
    reportedBy: params.processedBy || 'Staff Member',
    quarantineNotes: isVendorRma 
      ? `Customer Defective Return (Vendor RMA Intake): No sellable stock for exchange or customer opted for Vendor RMA. Defect: ${params.defectNotes}`
      : `Customer Defective Return (Stock Exchange): Replaced with unit from stock${params.replacementImei ? ` (SN/IMEI: ${params.replacementImei})` : ''}. Defective unit isolated. Defect: ${params.defectNotes}`,
    photoProof: params.photoProof,
    rmaVendorName: isVendorRma ? (params.vendorName || product.supplierName || 'Default Vendor') : undefined,
    isCustomerReturn: true,
    customerId: params.customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    originalInvoiceNumber: params.originalInvoiceNumber,
    returnExchangeType: params.actionType,
    replacementSerialOrImei: params.replacementImei,
  };

  // Record StockAdjustment
  const stockAdjustment: StockAdjustment = {
    id: `adj-ret-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    productId: product.id,
    productName: product.name,
    type: params.actionType === 'replace_from_stock' ? 'reduce' : 'set_exact',
    quantityChange: params.actionType === 'replace_from_stock' ? -1 : 0,
    previousStock: previousStock,
    newStock: product.stock,
    reason: 'damaged',
    reasonNotes: isVendorRma
      ? `Customer return for ${product.name} received into Quarantine / Pending Vendor RMA. Customer: ${params.customerName} (Inv: ${params.originalInvoiceNumber}). Log: ${newLog.logNumber}`
      : `Customer exchange for ${product.name}: Issued replacement unit${params.replacementImei ? ` (SN: ${params.replacementImei})` : ''}. Quarantined defective unit ${params.defectiveSerialOrImei || ''}. Log: ${newLog.logNumber}`,
    timestamp: new Date().toISOString(),
    adjustedBy: params.processedBy || 'Staff Member',
    imeiList: params.defectiveSerialOrImei ? [params.defectiveSerialOrImei] : undefined,
  };

  products[productIndex] = product;
  StorageService.saveProducts(products);
  StorageService.addDamageLog(newLog);
  StorageService.recordStockAdjustment(stockAdjustment);

  return {
    success: true,
    log: newLog,
    updatedProduct: product,
  };
}
