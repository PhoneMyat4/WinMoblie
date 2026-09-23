import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  SerializedDeviceItem, 
  ImeiStatus, 
  ImeiHistoryEvent,
  ProductCategory,
  ShiftReconciliationRecord,
  DenominationCount,
  CashDrawerRecord,
  ExpenseRecord
} from '../types';
import { canonicalCategory } from '../data/categoryTaxonomy';

/**
 * Extracts and consolidates all serialized device items across products, sales, and purchases.
 */
export function getAllSerializedDevices(
  products: Product[],
  sales: Sale[],
  purchases: PurchaseRecord[]
): SerializedDeviceItem[] {
  const map = new Map<string, SerializedDeviceItem>();

  // 1. Seed from products
  products.forEach(product => {
    // Check if product has explicitly defined serializedItems
    if (product.serializedItems && product.serializedItems.length > 0) {
      product.serializedItems.forEach(item => {
        if (item.imei) {
          map.set(item.imei.trim(), { ...item });
        }
      });
    }

    // Process imeiPairs
    if (product.imeiPairs && product.imeiPairs.length > 0) {
      product.imeiPairs.forEach((pair, idx) => {
        const imei1 = pair.imei1?.trim();
        if (!imei1) return;

        if (!map.has(imei1)) {
          const receivedDate = pair.receivedDate || product.lastRestockedAt || new Date(Date.now() - (idx + 1) * 7 * 86400000).toISOString();
          map.set(imei1, {
            id: `ser-${product.id}-${imei1}`,
            imei: imei1,
            imei2: pair.imei2?.trim(),
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            model: product.model || product.name,
            specs: product.ram && product.rom ? `${product.ram}/${product.rom}` : product.storage || undefined,
            color: product.color,
            condition: product.condition,
            costPrice: pair.costPrice ?? product.costPrice,
            sellingPrice: pair.sellingPrice ?? product.sellingPrice,
            status: pair.status || 'In Stock',
            receivedDate,
            supplierId: product.supplierId,
            supplierName: product.supplierName || 'Primary Distributor',
            warrantyMonths: product.warrantyMonths || 12,
            history: [
              {
                id: `hist-recv-${imei1}`,
                timestamp: receivedDate,
                action: 'received',
                details: `Stock received into inventory (${product.name} - ${pair.costPrice ? `${pair.costPrice} cost` : 'Initial stock'})`,
                performedBy: 'Inventory Manager',
              }
            ]
          });
        }
      });
    }

    // Process imeiList
    if (product.imeiList && product.imeiList.length > 0) {
      product.imeiList.forEach((imeiStr, idx) => {
        const imei1 = imeiStr.split('/')[0]?.trim();
        const imei2 = imeiStr.split('/')[1]?.trim();
        if (!imei1) return;

        if (!map.has(imei1)) {
          const receivedDate = product.lastRestockedAt || new Date(Date.now() - (idx + 2) * 6 * 86400000).toISOString();
          map.set(imei1, {
            id: `ser-${product.id}-${imei1}`,
            imei: imei1,
            imei2: imei2,
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            model: product.model || product.name,
            specs: product.ram && product.rom ? `${product.ram}/${product.rom}` : product.storage || undefined,
            color: product.color,
            condition: product.condition,
            costPrice: product.costPrice,
            sellingPrice: product.sellingPrice,
            status: 'In Stock',
            receivedDate,
            supplierId: product.supplierId,
            supplierName: product.supplierName || 'Primary Distributor',
            warrantyMonths: product.warrantyMonths || 12,
            history: [
              {
                id: `hist-recv-${imei1}`,
                timestamp: receivedDate,
                action: 'received',
                details: `Stock received into inventory (${product.name})`,
                performedBy: 'Inventory Manager',
              }
            ]
          });
        }
      });
    }
  });

  // 2. Cross-reference with Purchases
  purchases.forEach(po => {
    po.items.forEach(pItem => {
      const imeis = pItem.imeiPairs?.map(p => p.imei1) || pItem.imeiList || [];
      imeis.forEach(im => {
        const imeiClean = im.split('/')[0]?.trim();
        if (!imeiClean) return;

        const existing = map.get(imeiClean);
        if (existing) {
          existing.purchaseOrderNumber = po.purchaseOrderNumber;
          existing.supplierId = po.supplierId;
          existing.supplierName = po.supplierName;
          existing.receivedDate = po.date;
          existing.costPrice = pItem.unitCost || existing.costPrice;
          existing.receivedBy = po.receivedBy;
        } else {
          map.set(imeiClean, {
            id: `ser-po-${po.id}-${imeiClean}`,
            imei: imeiClean,
            imei2: im.split('/')[1]?.trim(),
            productId: pItem.productId,
            productName: pItem.name,
            brand: pItem.brand,
            model: pItem.name,
            specs: pItem.ram && pItem.rom ? `${pItem.ram}/${pItem.rom}` : undefined,
            color: pItem.color,
            condition: pItem.condition || 'brand_new',
            costPrice: pItem.unitCost,
            sellingPrice: pItem.sellingPrice,
            status: 'In Stock',
            receivedDate: po.date,
            purchaseOrderNumber: po.purchaseOrderNumber,
            supplierId: po.supplierId,
            supplierName: po.supplierName,
            receivedBy: po.receivedBy,
            warrantyMonths: pItem.warrantyMonths || 12,
            history: [
              {
                id: `hist-po-${po.id}-${imeiClean}`,
                timestamp: po.date,
                action: 'received',
                details: `Received via PO #${po.purchaseOrderNumber} from ${po.supplierName}`,
                performedBy: po.receivedBy || 'Store Manager',
                referenceDoc: po.purchaseOrderNumber,
              }
            ]
          });
        }
      });
    });
  });

  // 3. Cross-reference with Sales
  sales.forEach(sale => {
    sale.items.forEach(saleItem => {
      if (!saleItem.imei) return;
      const imeiClean = saleItem.imei.split('/')[0]?.trim();
      if (!imeiClean) return;

      let item = map.get(imeiClean);
      if (!item) {
        // Create record from sale item
        item = {
          id: `ser-sale-${sale.id}-${imeiClean}`,
          imei: imeiClean,
          imei2: saleItem.imei2 || saleItem.imei.split('/')[1]?.trim(),
          productId: saleItem.productId,
          productName: saleItem.name,
          brand: saleItem.brand,
          model: saleItem.name,
          condition: 'brand_new',
          costPrice: saleItem.costPrice || 0,
          sellingPrice: saleItem.finalPrice || saleItem.unitPrice,
          status: sale.status === 'refunded' ? 'In Stock' : 'Sold',
          receivedDate: new Date(new Date(sale.date).getTime() - 14 * 86400000).toISOString(),
          history: [],
        };
        map.set(imeiClean, item);
      }

      if (sale.status === 'completed') {
        item.status = 'Sold';
        item.soldDate = sale.date;
        item.soldInvoiceNumber = sale.invoiceNumber;
        item.soldCustomerId = sale.customerId;
        item.soldCustomerName = sale.customerName;
        item.soldCustomerPhone = sale.customerPhone;
        item.soldBy = sale.soldBy;
        item.sellingPrice = saleItem.finalPrice || saleItem.unitPrice;

        // Compute warranty expiry
        if (item.warrantyMonths) {
          const soldD = new Date(sale.date);
          soldD.setMonth(soldD.getMonth() + item.warrantyMonths);
          item.warrantyExpiry = soldD.toISOString();
        }

        // Add history event if not already present
        const hasSoldEvent = item.history.some(h => h.referenceDoc === sale.invoiceNumber);
        if (!hasSoldEvent) {
          item.history.push({
            id: `hist-sale-${sale.id}-${imeiClean}`,
            timestamp: sale.date,
            action: 'sold',
            details: `Sold to ${sale.customerName} (${sale.customerPhone}) on Invoice #${sale.invoiceNumber} for ${saleItem.finalPrice}`,
            performedBy: sale.soldBy || 'Cashier',
            referenceDoc: sale.invoiceNumber,
          });
        }
      } else if (sale.status === 'refunded') {
        item.status = 'In Stock';
        const hasRefundEvent = item.history.some(h => h.action === 'refunded' && h.referenceDoc === sale.invoiceNumber);
        if (!hasRefundEvent) {
          item.history.push({
            id: `hist-ref-${sale.id}-${imeiClean}`,
            timestamp: sale.refundedAt || new Date().toISOString(),
            action: 'refunded',
            details: `Refunded / Returned by ${sale.customerName} (Reason: ${sale.refundReason || 'Customer return'}). Restocked.`,
            performedBy: sale.refundedBy || 'Manager',
            referenceDoc: sale.invoiceNumber,
          });
        }
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => 
    new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime()
  );
}

/**
 * Find complete serialized item lifecycle by exact IMEI or Serial query
 */
export function findDeviceByImeiOrSerial(
  query: string,
  devices: SerializedDeviceItem[]
): SerializedDeviceItem | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  return devices.find(d => 
    d.imei.toLowerCase() === q ||
    (d.imei2 && d.imei2.toLowerCase() === q) ||
    (d.serialNumber && d.serialNumber.toLowerCase() === q) ||
    (d.soldInvoiceNumber && d.soldInvoiceNumber.toLowerCase() === q)
  );
}

// -------------------------------------------------------------
// INVENTORY AGING CALCULATIONS (30, 60, 90+ DAYS)
// -------------------------------------------------------------

export interface AgingBucketSummary {
  bucketKey: '0_30' | '31_60' | '61_90' | '90_plus';
  label: string;
  daysRange: string;
  color: string;
  badgeClass: string;
  productCount: number;
  unitsCount: number;
  tiedUpCost: number;
  potentialRevenue: number;
  percentageOfInventory: number;
}

export interface ProductAgingRow {
  productId: string;
  productName: string;
  brand: string;
  category: ProductCategory;
  subCategory?: string;
  sku: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  totalCostTiedUp: number;
  receivedDate: string;
  daysInStock: number;
  agingBucket: '0_30' | '31_60' | '61_90' | '90_plus';
  suggestedAction: string;
  serializedImeis: string[];
}

export function calculateInventoryAging(
  products: Product[],
  serializedDevices: SerializedDeviceItem[]
): {
  buckets: AgingBucketSummary[];
  rows: ProductAgingRow[];
  totalTiedUpCapital: number;
  totalUnsoldUnits: number;
  averageAgingDays: number;
  slowMovingCapital: number; // >60 days
  deadStockCapital: number; // >90 days
} {
  const now = Date.now();
  const rows: ProductAgingRow[] = [];

  let totalTiedUpCapital = 0;
  let totalUnsoldUnits = 0;
  let sumDaysWeighted = 0;
  let slowMovingCapital = 0;
  let deadStockCapital = 0;

  const bucketCounters = {
    '0_30': { productCount: 0, unitsCount: 0, tiedUpCost: 0, potentialRevenue: 0 },
    '31_60': { productCount: 0, unitsCount: 0, tiedUpCost: 0, potentialRevenue: 0 },
    '61_90': { productCount: 0, unitsCount: 0, tiedUpCost: 0, potentialRevenue: 0 },
    '90_plus': { productCount: 0, unitsCount: 0, tiedUpCost: 0, potentialRevenue: 0 },
  };

  products.forEach(p => {
    if (p.stock <= 0) return; // Only unsold active stock

    // Find earliest received date among serialized items or product lastRestockedAt
    const matchingImeis = serializedDevices.filter(d => d.productId === p.id && d.status === 'In Stock');
    let receivedTime = p.lastRestockedAt ? new Date(p.lastRestockedAt).getTime() : now - 15 * 86400000;

    if (matchingImeis.length > 0) {
      const earliestImeiDate = Math.min(...matchingImeis.map(m => new Date(m.receivedDate).getTime()));
      if (!isNaN(earliestImeiDate)) {
        receivedTime = earliestImeiDate;
      }
    }

    const diffDays = Math.max(0, Math.floor((now - receivedTime) / (1000 * 60 * 60 * 24)));
    const totalCost = p.costPrice * p.stock;
    const totalRev = p.sellingPrice * p.stock;

    let bucket: '0_30' | '31_60' | '61_90' | '90_plus' = '0_30';
    let suggestedAction = 'Healthy Stock - Regular Sales';

    if (diffDays <= 30) {
      bucket = '0_30';
      suggestedAction = 'Active - Keep primary shelf display';
    } else if (diffDays <= 60) {
      bucket = '31_60';
      suggestedAction = 'Normal - Monitor weekly velocity';
    } else if (diffDays <= 90) {
      bucket = '61_90';
      suggestedAction = 'Slow Moving - Offer 5-8% bundle deal / salesman spiff';
    } else {
      bucket = '90_plus';
      suggestedAction = 'Dead Stock Alert - Markdown 10-15% or Return to Supplier (RMA)';
    }

    bucketCounters[bucket].productCount += 1;
    bucketCounters[bucket].unitsCount += p.stock;
    bucketCounters[bucket].tiedUpCost += totalCost;
    bucketCounters[bucket].potentialRevenue += totalRev;

    totalTiedUpCapital += totalCost;
    totalUnsoldUnits += p.stock;
    sumDaysWeighted += (diffDays * p.stock);

    if (diffDays > 60) slowMovingCapital += totalCost;
    if (diffDays > 90) deadStockCapital += totalCost;

    rows.push({
      productId: p.id,
      productName: p.name,
      brand: p.brand,
      category: p.category,
      subCategory: p.subCategory,
      sku: p.sku,
      barcode: p.barcode,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stock: p.stock,
      totalCostTiedUp: totalCost,
      receivedDate: new Date(receivedTime).toISOString(),
      daysInStock: diffDays,
      agingBucket: bucket,
      suggestedAction,
      serializedImeis: matchingImeis.map(m => m.imei),
    });
  });

  // Sort rows: oldest stock first
  rows.sort((a, b) => b.daysInStock - a.daysInStock);

  const averageAgingDays = totalUnsoldUnits > 0 ? Math.round(sumDaysWeighted / totalUnsoldUnits) : 0;

  const buckets: AgingBucketSummary[] = [
    {
      bucketKey: '0_30',
      label: 'Fresh Stock',
      daysRange: '0 - 30 Days',
      color: 'emerald',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      productCount: bucketCounters['0_30'].productCount,
      unitsCount: bucketCounters['0_30'].unitsCount,
      tiedUpCost: bucketCounters['0_30'].tiedUpCost,
      potentialRevenue: bucketCounters['0_30'].potentialRevenue,
      percentageOfInventory: totalTiedUpCapital > 0 ? (bucketCounters['0_30'].tiedUpCost / totalTiedUpCapital) * 100 : 0,
    },
    {
      bucketKey: '31_60',
      label: 'Normal Aging',
      daysRange: '31 - 60 Days',
      color: 'blue',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      productCount: bucketCounters['31_60'].productCount,
      unitsCount: bucketCounters['31_60'].unitsCount,
      tiedUpCost: bucketCounters['31_60'].tiedUpCost,
      potentialRevenue: bucketCounters['31_60'].potentialRevenue,
      percentageOfInventory: totalTiedUpCapital > 0 ? (bucketCounters['31_60'].tiedUpCost / totalTiedUpCapital) * 100 : 0,
    },
    {
      bucketKey: '61_90',
      label: 'Slow Moving',
      daysRange: '61 - 90 Days',
      color: 'amber',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      productCount: bucketCounters['61_90'].productCount,
      unitsCount: bucketCounters['61_90'].unitsCount,
      tiedUpCost: bucketCounters['61_90'].tiedUpCost,
      potentialRevenue: bucketCounters['61_90'].potentialRevenue,
      percentageOfInventory: totalTiedUpCapital > 0 ? (bucketCounters['61_90'].tiedUpCost / totalTiedUpCapital) * 100 : 0,
    },
    {
      bucketKey: '90_plus',
      label: 'Dead Stock / Aged',
      daysRange: '90+ Days',
      color: 'rose',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-200 animate-pulse',
      productCount: bucketCounters['90_plus'].productCount,
      unitsCount: bucketCounters['90_plus'].unitsCount,
      tiedUpCost: bucketCounters['90_plus'].tiedUpCost,
      potentialRevenue: bucketCounters['90_plus'].potentialRevenue,
      percentageOfInventory: totalTiedUpCapital > 0 ? (bucketCounters['90_plus'].tiedUpCost / totalTiedUpCapital) * 100 : 0,
    },
  ];

  return {
    buckets,
    rows,
    totalTiedUpCapital,
    totalUnsoldUnits,
    averageAgingDays,
    slowMovingCapital,
    deadStockCapital,
  };
}

// -------------------------------------------------------------
// CATEGORY PROFITABILITY (SALES REVENUE - COGS)
// -------------------------------------------------------------

export interface CategoryProfitabilityRow {
  category: ProductCategory;
  categoryLabel: string;
  totalUnitsSold: number;
  totalSalesRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPercent: number; // (grossProfit / totalSalesRevenue) * 100
  profitContributionPercent: number; // % of store total profit
  revenueContributionPercent: number; // % of store total revenue
  averageOrderValue: number;
  invoicesCount: number;
  subCategoryBreakdown?: {
    name: string;
    units: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPercent: number;
  }[];
}

export function calculateCategoryProfitability(
  sales: Sale[],
  products: Product[]
): {
  rows: CategoryProfitabilityRow[];
  totalStoreRevenue: number;
  totalStoreCogs: number;
  totalStoreGrossProfit: number;
  overallGrossMarginPercent: number;
  totalUnitsSold: number;
} {
  const categoryStats: Record<string, {
    units: number;
    revenue: number;
    cogs: number;
    invoices: Set<string>;
    subCategories: Record<string, { units: number; revenue: number; cogs: number; profit: number }>;
  }> = {
    brand_new_phones: { units: 0, revenue: 0, cogs: 0, invoices: new Set(), subCategories: {} },
    pre_owned_phones: { units: 0, revenue: 0, cogs: 0, invoices: new Set(), subCategories: {} },
    accessories_gadgets: { units: 0, revenue: 0, cogs: 0, invoices: new Set(), subCategories: {} },
    cookware: { units: 0, revenue: 0, cogs: 0, invoices: new Set(), subCategories: {} },
    sim_cards: { units: 0, revenue: 0, cogs: 0, invoices: new Set(), subCategories: {} },
  };

  let totalStoreRevenue = 0;
  let totalStoreCogs = 0;
  let totalUnitsSold = 0;

  // Build product lookup map for fallback cost prices
  const productCostMap = new Map<string, number>();
  products.forEach(p => productCostMap.set(p.id, p.costPrice));

  sales.forEach(sale => {
    if (sale.status !== 'completed') return;

    sale.items.forEach(item => {
      const cat = canonicalCategory(item.category || 'brand_new_phones');
      if (!categoryStats[cat]) return;

      const itemQty = item.quantity || 1;
      const itemRev = (item.finalPrice !== undefined ? item.finalPrice : item.unitPrice * itemQty);
      const unitCost = item.costPrice !== undefined && item.costPrice > 0 
        ? item.costPrice 
        : (productCostMap.get(item.productId) || 0);
      const itemCogs = unitCost * itemQty;

      categoryStats[cat].units += itemQty;
      categoryStats[cat].revenue += itemRev;
      categoryStats[cat].cogs += itemCogs;
      categoryStats[cat].invoices.add(sale.id);

      // Subcategory tracking
      const subCat = item.subCategory || item.brand || 'Standard';
      if (!categoryStats[cat].subCategories[subCat]) {
        categoryStats[cat].subCategories[subCat] = { units: 0, revenue: 0, cogs: 0, profit: 0 };
      }
      categoryStats[cat].subCategories[subCat].units += itemQty;
      categoryStats[cat].subCategories[subCat].revenue += itemRev;
      categoryStats[cat].subCategories[subCat].cogs += itemCogs;
      categoryStats[cat].subCategories[subCat].profit += (itemRev - itemCogs);

      totalStoreRevenue += itemRev;
      totalStoreCogs += itemCogs;
      totalUnitsSold += itemQty;
    });
  });

  const totalStoreGrossProfit = totalStoreRevenue - totalStoreCogs;
  const overallGrossMarginPercent = totalStoreRevenue > 0 
    ? (totalStoreGrossProfit / totalStoreRevenue) * 100 
    : 0;

  const categoryLabelMap: Record<string, string> = {
    brand_new_phones: 'Brand new phones',
    pre_owned_phones: 'Pre-owned Phones',
    accessories_gadgets: 'Accessories & Gadgets',
    cookware: 'Cookware',
    sim_cards: 'Sim Cards',
  };

  const rows: CategoryProfitabilityRow[] = (Object.keys(categoryStats) as ProductCategory[]).map(cat => {
    const data = categoryStats[cat];
    const grossProfit = data.revenue - data.cogs;
    const grossMarginPercent = data.revenue > 0 ? (grossProfit / data.revenue) * 100 : 0;
    const profitContributionPercent = totalStoreGrossProfit > 0 ? (grossProfit / totalStoreGrossProfit) * 100 : 0;
    const revenueContributionPercent = totalStoreRevenue > 0 ? (data.revenue / totalStoreRevenue) * 100 : 0;
    const invoicesCount = data.invoices.size;
    const averageOrderValue = invoicesCount > 0 ? data.revenue / invoicesCount : 0;

    const subCategoryBreakdown = Object.entries(data.subCategories).map(([name, s]) => ({
      name,
      units: s.units,
      revenue: s.revenue,
      cogs: s.cogs,
      profit: s.profit,
      marginPercent: s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    return {
      category: cat,
      categoryLabel: categoryLabelMap[cat] || cat,
      totalUnitsSold: data.units,
      totalSalesRevenue: data.revenue,
      totalCogs: data.cogs,
      grossProfit,
      grossMarginPercent,
      profitContributionPercent,
      revenueContributionPercent,
      averageOrderValue,
      invoicesCount,
      subCategoryBreakdown,
    };
  });

  // Sort by highest revenue
  rows.sort((a, b) => b.totalSalesRevenue - a.totalSalesRevenue);

  return {
    rows,
    totalStoreRevenue,
    totalStoreCogs,
    totalStoreGrossProfit,
    overallGrossMarginPercent,
    totalUnitsSold,
  };
}

// -------------------------------------------------------------
// END-OF-DAY SHIFT RECONCILIATION CALCULATOR
// -------------------------------------------------------------

export function calculateShiftReconciliation(
  shiftDateStr: string, // YYYY-MM-DD
  sales: Sale[],
  cashDrawer: CashDrawerRecord,
  expenses: ExpenseRecord[],
  actualCountedInput?: number,
  denominationsInput?: DenominationCount[]
): ShiftReconciliationRecord {
  const targetDate = shiftDateStr.slice(0, 10);

  // 1. Filter completed sales for that date
  const daySales = sales.filter(s => s.date.slice(0, 10) === targetDate && s.status === 'completed');
  const dayRefunds = sales.filter(s => s.refundedAt && s.refundedAt.slice(0, 10) === targetDate);

  let cashSalesTotal = 0;
  let cashSalesCount = 0;
  let totalGrossRevenue = 0;

  const digitalSales = {
    kpay: 0,
    wave: 0,
    kbz: 0,
    yoma: 0,
    aya: 0,
    cb: 0,
    split: 0,
    totalDigital: 0,
  };

  daySales.forEach(s => {
    totalGrossRevenue += s.grandTotal;

    if (s.paymentMethod === 'cash') {
      cashSalesTotal += s.amountPaid;
      cashSalesCount++;
    } else if (s.paymentMethod === 'kpay') {
      digitalSales.kpay += s.amountPaid;
      digitalSales.totalDigital += s.amountPaid;
    } else if (s.paymentMethod === 'wave') {
      digitalSales.wave += s.amountPaid;
      digitalSales.totalDigital += s.amountPaid;
    } else if (s.paymentMethod === 'kbz') {
      digitalSales.kbz += s.amountPaid;
      digitalSales.totalDigital += s.amountPaid;
    } else if (s.paymentMethod === 'yoma') {
      digitalSales.yoma += s.amountPaid;
      digitalSales.totalDigital += s.amountPaid;
    } else if (s.paymentMethod === 'aya') {
      digitalSales.aya += s.amountPaid;
      digitalSales.totalDigital += s.amountPaid;
    } else if (s.paymentMethod === 'cb') {
      digitalSales.cb += s.amountPaid;
      digitalSales.totalDigital += s.amountPaid;
    } else if (s.paymentMethod === 'split') {
      const details = s.paymentDetails;
      if (details) {
        if (details.cashAmount) {
          cashSalesTotal += details.cashAmount;
          cashSalesCount++;
        }
        if (details.kpayAmount) {
          digitalSales.kpay += details.kpayAmount;
          digitalSales.totalDigital += details.kpayAmount;
        }
        if (details.waveAmount) {
          digitalSales.wave += details.waveAmount;
          digitalSales.totalDigital += details.waveAmount;
        }
        if (details.kbzAmount) {
          digitalSales.kbz += details.kbzAmount;
          digitalSales.totalDigital += details.kbzAmount;
        }
      } else {
        digitalSales.split += s.amountPaid;
        digitalSales.totalDigital += s.amountPaid;
      }
    }
  });

  // 2. Cash In / Cash Out from manual vouchers on that date
  let manualCashInTotal = 0;
  cashDrawer.cashInManual.forEach(tx => {
    if (tx.time.slice(0, 10) === targetDate) {
      manualCashInTotal += tx.amount;
    }
  });

  let manualCashOutTotal = 0;
  cashDrawer.cashOutManual.forEach(tx => {
    if (tx.time.slice(0, 10) === targetDate) {
      manualCashOutTotal += tx.amount;
    }
  });

  // 3. Cash Expenses on that date (only from Cash Drawer, not Revenue Cash reserves)
  let expensesCashTotal = 0;
  expenses.forEach(exp => {
    const isDrawerExpense = exp.fundingSource === 'cash_drawer' || 
      (exp.fundingSource !== 'revenue_cash' && (exp.paymentMethod === 'cash' || exp.deductFromCashDrawer));

    if (exp.date.slice(0, 10) === targetDate && isDrawerExpense) {
      expensesCashTotal += exp.amount;
    }
  });

  // 4. Cash Refunds on that date
  let refundsCashTotal = 0;
  dayRefunds.forEach(ref => {
    if (ref.paymentMethod === 'cash' || ref.paymentDetails?.cashAmount) {
      refundsCashTotal += (ref.paymentDetails?.cashAmount || ref.amountPaid);
    }
  });

  const openingFloat = cashDrawer.openingBalance || 200000;
  const expectedCashTotal = Math.max(0, 
    openingFloat + cashSalesTotal + manualCashInTotal - manualCashOutTotal - expensesCashTotal - refundsCashTotal
  );

  // Calculate actual counted from denominations or direct input
  let actualCashCounted = actualCountedInput !== undefined 
    ? actualCountedInput 
    : (cashDrawer.actualCounted || expectedCashTotal);

  if (denominationsInput && denominationsInput.length > 0) {
    const denomSum = denominationsInput.reduce((acc, d) => acc + d.total, 0);
    if (denomSum > 0) {
      actualCashCounted = denomSum;
    }
  }

  const variance = Number((actualCashCounted - expectedCashTotal).toFixed(2));
  let varianceStatus: 'balanced' | 'overage' | 'shortage' = 'balanced';
  if (variance > 0) varianceStatus = 'overage';
  if (variance < 0) varianceStatus = 'shortage';

  return {
    id: `rec-${targetDate.replace(/-/g, '')}-01`,
    reconciliationNumber: `REC-${targetDate.replace(/-/g, '')}-01`,
    shiftDate: targetDate,
    openedAt: `${targetDate}T08:30:00.000Z`,
    closedAt: new Date().toISOString(),
    cashierId: 'staff-cashier-1',
    cashierName: 'Aung Kyaw (Terminal 1)',
    managerName: 'Daw Khin Htwe (Store Owner)',
    openingFloat,
    cashSalesTotal,
    cashSalesCount,
    manualCashInTotal,
    manualCashOutTotal,
    expensesCashTotal,
    refundsCashTotal,
    expectedCashTotal,
    digitalSales,
    totalGrossRevenue,
    totalInvoicesCount: daySales.length,
    actualCashCounted,
    denominations: denominationsInput,
    variance,
    varianceStatus,
    status: 'draft',
  };
}
