import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  StockAdjustment, 
  StockAuditSession, 
  PriceChangeRecord, 
  ProductHistoryEvent,
  DamageLog
} from '../types';
import { StorageService } from './storage';

/**
 * Aggregates all chronological events for a specific product across sales,
 * purchases, refunds, stock adjustments, price changes, physical stock audits,
 * damage/quarantine isolations, and catalog registration.
 */
export function getProductHistoryTimeline(
  product: Product,
  allSales: Sale[] = [],
  allPurchases: PurchaseRecord[] = [],
  allAdjustments: StockAdjustment[] = [],
  allAudits: StockAuditSession[] = [],
  allPriceChanges: PriceChangeRecord[] = [],
  allDamageLogs: DamageLog[] = []
): ProductHistoryEvent[] {
  const events: ProductHistoryEvent[] = [];

  const damageLogs = allDamageLogs.length > 0 ? allDamageLogs : StorageService.getDamageLogs();

  // 1. Purchase Orders / Stock-In
  allPurchases.forEach(po => {
    po.items.forEach(item => {
      if (item.productId === product.id || (item.name === product.name && item.brand === product.brand)) {
        events.push({
          id: `po-${po.id}-${item.productId}`,
          productId: product.id,
          productName: product.name,
          timestamp: po.date,
          type: 'purchase_stock_in',
          title: `Stock Received from Supplier (${po.supplierName})`,
          details: `Received +${item.quantity} units via PO #${po.purchaseOrderNumber}. Batch Unit Cost: ${item.unitCost.toLocaleString()} Ks.`,
          quantityChange: item.quantity,
          unitCost: item.unitCost,
          sellingPrice: item.sellingPrice || product.sellingPrice,
          referenceDoc: po.purchaseOrderNumber,
          performedBy: po.receivedBy || 'Stock Controller',
          imeiAffected: item.imeiPairs?.map(p => p.imei1) || item.imeiList,
          extraMeta: {
            supplierId: po.supplierId,
            supplierName: po.supplierName,
            paymentStatus: po.paymentStatus,
          }
        });
      }
    });
  });

  // 2. POS Sales
  allSales.forEach(sale => {
    sale.items.forEach(item => {
      if (item.productId === product.id || (item.name === product.name && item.brand === product.brand)) {
        const hasRefund = (item.refundedQuantity || 0) > 0;
        events.push({
          id: `sale-${sale.id}-${item.productId}`,
          productId: product.id,
          productName: product.name,
          timestamp: sale.date,
          type: 'pos_sale',
          title: `Sold at POS to ${sale.customerName || 'Walk-in Customer'}`,
          details: `Sold ${item.quantity} unit(s) at ${item.unitPrice.toLocaleString()} Ks (Final Line Total: ${item.finalPrice.toLocaleString()} Ks). Payment: ${(sale.paymentMethod || 'cash').toUpperCase()}${hasRefund ? ` (${item.refundedQuantity} unit returned)` : ''}.`,
          quantityChange: -item.quantity,
          sellingPrice: item.unitPrice,
          unitCost: item.costPrice,
          referenceDoc: sale.invoiceNumber,
          performedBy: sale.soldBy || 'Cashier',
          imeiAffected: item.imei ? [item.imei] : undefined,
          extraMeta: {
            customerId: sale.customerId,
            customerPhone: sale.customerPhone,
            invoiceStatus: sale.status,
            warrantyPeriod: item.warrantyPeriod,
          }
        });
      }
    });

    // 3. Sales Refunds & Customer Returns
    if (sale.refundHistory && sale.refundHistory.length > 0) {
      sale.refundHistory.forEach(ref => {
        ref.items.forEach(refItem => {
          if (refItem.productId === product.id || refItem.name === product.name) {
            events.push({
              id: `ref-${ref.id}-${refItem.productId}`,
              productId: product.id,
              productName: product.name,
              timestamp: ref.date,
              type: 'sale_refund',
              title: `Customer Return / Refund (Inv #${ref.invoiceNumber})`,
              details: `Returned ${refItem.quantity} unit(s) for ${refItem.refundAmount.toLocaleString()} Ks. Reason: "${ref.reason}". Restocked to shelf: ${ref.restockItems ? 'Yes (+1 stock)' : 'No (Damaged/Defective)'}.`,
              quantityChange: ref.restockItems ? refItem.quantity : 0,
              sellingPrice: refItem.unitPrice,
              referenceDoc: ref.invoiceNumber,
              performedBy: ref.refundedBy || 'Manager',
              imeiAffected: refItem.imei ? [refItem.imei] : undefined,
              extraMeta: {
                refundMethod: ref.refundMethod,
                restocked: ref.restockItems,
                notes: ref.notes,
              }
            });
          }
        });
      });
    }
  });

  // 4. Stock Adjustments (Manual, Damage Write-off, Samples, Supplier Returns, Corrections)
  allAdjustments.forEach(adj => {
    if (adj.productId === product.id || adj.productName === product.name) {
      const reasonLabel = 
        adj.reason === 'physical_audit' ? 'Physical Stocktake Count' :
        adj.reason === 'damaged' ? 'Damaged / Defective Write-off' :
        adj.reason === 'return_supplier' ? 'Returned to Supplier RMA' :
        adj.reason === 'sample' ? 'Showroom / Display Sample' :
        adj.reason === 'restock' ? 'Manual Restock / Replenishment' :
        adj.reason === 'correction' ? 'Inventory Recount Correction' : 'Stock Adjustment';

      events.push({
        id: `adj-${adj.id}`,
        productId: product.id,
        productName: product.name,
        timestamp: adj.timestamp,
        type: adj.reason === 'physical_audit' ? 'physical_audit' : 'stock_adjustment',
        title: `Stock Adjustment: ${reasonLabel}`,
        details: `Stock level adjusted: ${adj.previousStock} ➔ ${adj.newStock} units (${adj.quantityChange >= 0 ? '+' : ''}${adj.quantityChange}). ${adj.reasonNotes ? `Notes: "${adj.reasonNotes}"` : `Reason: ${reasonLabel}`}.`,
        quantityChange: adj.quantityChange,
        stockBefore: adj.previousStock,
        stockAfter: adj.newStock,
        referenceDoc: adj.auditSessionId ? `AUD-${(adj.auditSessionId || '').slice(-6).toUpperCase()}` : undefined,
        performedBy: adj.adjustedBy || 'Inventory Staff',
        imeiAffected: adj.imeiList && adj.imeiList.length > 0 ? adj.imeiList : undefined,
        reasonLabel,
        extraMeta: {
          reason: adj.reason,
          notes: adj.reasonNotes,
          type: adj.type
        }
      });
    }
  });

  // 5. Price Changes (Selling & Cost Price Revisions, Markups, Markdowns, Promos)
  allPriceChanges.forEach(pc => {
    if (pc.productId === product.id || pc.productName === product.name) {
      const delta = pc.priceDelta !== undefined 
        ? pc.priceDelta 
        : (pc.newSellingPrice - pc.oldSellingPrice);
      const pct = pc.percentageChange !== undefined 
        ? pc.percentageChange 
        : (pc.oldSellingPrice > 0 ? ((delta / pc.oldSellingPrice) * 100) : 0);

      const reasonLabel = 
        pc.reason === 'market_adjustment' ? 'Market Rate Adjustment' :
        pc.reason === 'promo_discount' ? 'Promotional Markdown' :
        pc.reason === 'supplier_cost_change' ? 'Supplier Cost Shift' :
        pc.reason === 'clearance' ? 'Stock Clearance' :
        pc.reason === 'currency_fluctuation' ? 'Currency Rate Fluctuation' :
        pc.reason === 'manual_correction' ? 'Price Correction' :
        pc.reason === 'bulk_reprice' ? 'Bulk Batch Reprice' : 'Price Revision';

      const hasCostChange = pc.oldCostPrice !== undefined && pc.newCostPrice !== undefined && pc.oldCostPrice !== pc.newCostPrice;

      events.push({
        id: `pc-${pc.id}`,
        productId: product.id,
        productName: product.name,
        timestamp: pc.timestamp,
        type: 'price_change',
        title: `Price Changed: ${reasonLabel} (${delta >= 0 ? '+' : ''}${delta.toLocaleString()} Ks)`,
        details: `Retail price changed from ${pc.oldSellingPrice.toLocaleString()} Ks to ${pc.newSellingPrice.toLocaleString()} Ks (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).${hasCostChange ? ` Cost changed: ${pc.oldCostPrice?.toLocaleString()} Ks ➔ ${pc.newCostPrice?.toLocaleString()} Ks.` : ''}${pc.reasonNotes ? ` Notes: "${pc.reasonNotes}".` : ''}`,
        oldSellingPrice: pc.oldSellingPrice,
        newSellingPrice: pc.newSellingPrice,
        oldCostPrice: pc.oldCostPrice,
        newCostPrice: pc.newCostPrice,
        priceDelta: delta,
        priceChangePercent: Number(pct.toFixed(1)),
        marginPercentBefore: pc.oldMarginPercent,
        marginPercentAfter: pc.newMarginPercent,
        sellingPrice: pc.newSellingPrice,
        unitCost: pc.newCostPrice ?? pc.oldCostPrice ?? product.costPrice,
        reasonLabel,
        performedBy: pc.changedBy || 'Authorized Staff',
        extraMeta: {
          reason: pc.reason,
          notes: pc.reasonNotes,
          effectiveDate: pc.effectiveDate
        }
      });
    }
  });

  // 6. Stock Audit Session Reconciliations
  allAudits.forEach(aud => {
    if (aud.reconciled && aud.items) {
      const audItem = aud.items.find(i => i.productId === product.id || i.productName === product.name);
      if (audItem && audItem.variance !== 0) {
        const hasMatchingAdj = allAdjustments.some(a => a.auditSessionId === aud.id && a.productId === product.id);
        if (!hasMatchingAdj) {
          events.push({
            id: `aud-${aud.id}-${product.id}`,
            productId: product.id,
            productName: product.name,
            timestamp: aud.reconciledAt || aud.completedAt || aud.createdAt,
            type: 'physical_audit',
            title: `Physical Audit Reconciliation (${aud.auditNumber})`,
            details: `Book Count: ${audItem.bookStock} vs Physical Count: ${audItem.countedStock}. Variance: ${audItem.variance > 0 ? '+' : ''}${audItem.variance} units (${audItem.status}).`,
            quantityChange: audItem.variance,
            stockBefore: audItem.bookStock,
            stockAfter: audItem.countedStock,
            referenceDoc: aud.auditNumber,
            performedBy: aud.conductedBy || 'Auditor',
            reasonLabel: 'Physical Audit Discrepancy'
          });
        }
      }
    }
  });

  // 7. Damage & Loss Quarantine Records
  damageLogs.forEach(dmg => {
    if (dmg.productId === product.id || (dmg.productName === product.name && dmg.brand === product.brand)) {
      const isRma = dmg.dispositionAction === 'rma' || dmg.status === 'Pending RMA';
      const isWriteOff = dmg.dispositionAction === 'write_off' || dmg.status === 'Written-Off';
      const isBStock = dmg.dispositionAction === 'b_stock';

      let statusDesc = 'Quarantined & Isolated from sellable stock';
      if (isRma) statusDesc = `Dispatched to Vendor RMA (${dmg.rmaVendorName || 'Supplier'})`;
      else if (isWriteOff) statusDesc = `Written-off / Scrapped (${dmg.scrapReason || 'Total loss'})`;
      else if (isBStock) statusDesc = 'Discounted and transferred to B-Stock inventory';

      events.push({
        id: `dmg-${dmg.id}`,
        productId: product.id,
        productName: product.name,
        timestamp: dmg.dispositionDate || dmg.reportedAt,
        type: 'quarantine_damage',
        title: `Quarantine: ${dmg.damageReason || 'Damaged / Lost Unit'} (${dmg.logNumber})`,
        details: `${statusDesc}. Qty: ${dmg.quarantinedQuantity || 1} unit(s). Phase: ${dmg.phase.toUpperCase()}. ${dmg.quarantineNotes ? `Report notes: "${dmg.quarantineNotes}".` : ''}${dmg.assessmentNotes ? ` Assessment: "${dmg.assessmentNotes}".` : ''}${dmg.serialOrImei ? ` Serial/IMEI: ${dmg.serialOrImei}.` : ''}`,
        quantityChange: -(dmg.quarantinedQuantity || 1),
        sellingPrice: dmg.originalSellingPrice,
        unitCost: dmg.costImpact,
        referenceDoc: dmg.logNumber,
        performedBy: dmg.dispositionBy || dmg.assessedBy || dmg.reportedBy || 'Staff',
        imeiAffected: dmg.serialOrImei ? [dmg.serialOrImei] : undefined,
        reasonLabel: dmg.damageReason || 'Damaged / Loss Quarantine',
        extraMeta: {
          phase: dmg.phase,
          status: dmg.status,
          damageReason: dmg.damageReason,
          dispositionAction: dmg.dispositionAction,
          rmaVendorName: dmg.rmaVendorName,
          scrapReason: dmg.scrapReason,
          photoProof: dmg.photoProof,
          notes: dmg.quarantineNotes,
        }
      });
    }
  });

  // 8. Item Creation / Catalog Added Event
  const itemCreatedTimestamp = product.createdAt || product.lastRestockedAt;
  if (itemCreatedTimestamp) {
    events.push({
      id: `create-${product.id}`,
      productId: product.id,
      productName: product.name,
      timestamp: itemCreatedTimestamp,
      type: 'creation',
      title: 'Item Created / Added to Catalog',
      details: `Product "${product.name}" was registered in the inventory catalog under "${product.brand}" (${product.category}). Initial stock: ${product.stock} units at ${product.sellingPrice.toLocaleString()} Ks.`,
      quantityChange: product.stock,
      sellingPrice: product.sellingPrice,
      unitCost: product.costPrice,
      referenceDoc: product.sku || product.barcode,
      performedBy: 'System / Catalog Setup',
      reasonLabel: 'Initial Catalog Entry'
    });
  }

  // Sort descending by timestamp (latest events first)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}

/**
 * Aggregates all chronological events across the ENTIRE inventory catalog
 * across sales, purchases, refunds, stock adjustments, price changes, physical stock audits,
 * damage/quarantine isolations, and catalog additions.
 */
export function getAllInventoryHistoryTimeline(
  products: Product[],
  allSales: Sale[] = [],
  allPurchases: PurchaseRecord[] = [],
  allAdjustments: StockAdjustment[] = [],
  allAudits: StockAuditSession[] = [],
  allPriceChanges: PriceChangeRecord[] = [],
  allDamageLogs: DamageLog[] = []
): ProductHistoryEvent[] {
  const events: ProductHistoryEvent[] = [];

  const damageLogs = allDamageLogs.length > 0 ? allDamageLogs : StorageService.getDamageLogs();

  // Index products for rapid lookup
  const productById = new Map<string, Product>();
  const productByName = new Map<string, Product>();

  products.forEach(p => {
    productById.set(p.id, p);
    productByName.set(p.name.toLowerCase().trim(), p);
  });

  const getProduct = (id?: string, name?: string): Product | undefined => {
    if (id && productById.has(id)) return productById.get(id);
    if (name && productByName.has(name.toLowerCase().trim())) return productByName.get(name.toLowerCase().trim());
    return undefined;
  };

  // 1. Purchase Orders / Stock-In
  allPurchases.forEach(po => {
    po.items.forEach(item => {
      const prod = getProduct(item.productId, item.name);
      const prodId = prod?.id || item.productId || `prod-${item.name}`;
      const prodName = prod?.name || item.name;

      events.push({
        id: `po-${po.id}-${item.productId || item.name}`,
        productId: prodId,
        productName: prodName,
        productBrand: prod?.brand,
        productCategory: prod?.category,
        productSku: prod?.sku,
        productBarcode: prod?.barcode,
        timestamp: po.date,
        type: 'purchase_stock_in',
        title: `Stock Received: ${prodName} (+${item.quantity})`,
        details: `Received +${item.quantity} units from supplier "${po.supplierName}" via PO #${po.purchaseOrderNumber}. Batch Unit Cost: ${item.unitCost.toLocaleString()} Ks.`,
        quantityChange: item.quantity,
        unitCost: item.unitCost,
        sellingPrice: item.sellingPrice || prod?.sellingPrice,
        referenceDoc: po.purchaseOrderNumber,
        performedBy: po.receivedBy || 'Stock Controller',
        imeiAffected: item.imeiPairs?.map(p => p.imei1) || item.imeiList,
        extraMeta: {
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          paymentStatus: po.paymentStatus,
        }
      });
    });
  });

  // 2. POS Sales
  allSales.forEach(sale => {
    sale.items.forEach(item => {
      const prod = getProduct(item.productId, item.name);
      const prodId = prod?.id || item.productId || `prod-${item.name}`;
      const prodName = prod?.name || item.name;
      const hasRefund = (item.refundedQuantity || 0) > 0;

      events.push({
        id: `sale-${sale.id}-${item.productId || item.name}`,
        productId: prodId,
        productName: prodName,
        productBrand: prod?.brand,
        productCategory: prod?.category,
        productSku: prod?.sku,
        productBarcode: prod?.barcode,
        timestamp: sale.date,
        type: 'pos_sale',
        title: `POS Sale: ${prodName} (-${item.quantity})`,
        details: `Sold ${item.quantity} unit(s) at ${item.unitPrice.toLocaleString()} Ks to ${sale.customerName || 'Walk-in Customer'} (Inv #${sale.invoiceNumber}). Payment: ${(sale.paymentMethod || 'cash').toUpperCase()}${hasRefund ? ` (${item.refundedQuantity} unit returned)` : ''}.`,
        quantityChange: -item.quantity,
        sellingPrice: item.unitPrice,
        unitCost: item.costPrice || prod?.costPrice,
        referenceDoc: sale.invoiceNumber,
        performedBy: sale.soldBy || 'Cashier',
        imeiAffected: item.imei ? [item.imei] : undefined,
        extraMeta: {
          customerId: sale.customerId,
          customerPhone: sale.customerPhone,
          invoiceStatus: sale.status,
          warrantyPeriod: item.warrantyPeriod,
        }
      });
    });

    // 3. Sales Refunds & Customer Returns
    if (sale.refundHistory && sale.refundHistory.length > 0) {
      sale.refundHistory.forEach(ref => {
        ref.items.forEach(refItem => {
          const prod = getProduct(refItem.productId, refItem.name);
          const prodId = prod?.id || refItem.productId || `prod-${refItem.name}`;
          const prodName = prod?.name || refItem.name;

          events.push({
            id: `ref-${ref.id}-${refItem.productId || refItem.name}`,
            productId: prodId,
            productName: prodName,
            productBrand: prod?.brand,
            productCategory: prod?.category,
            productSku: prod?.sku,
            productBarcode: prod?.barcode,
            timestamp: ref.date,
            type: 'sale_refund',
            title: `Customer Return: ${prodName}`,
            details: `Returned ${refItem.quantity} unit(s) for ${refItem.refundAmount.toLocaleString()} Ks (Inv #${ref.invoiceNumber}). Reason: "${ref.reason}". Restocked to shelf: ${ref.restockItems ? 'Yes (+1 stock)' : 'No (Damaged/Defective)'}.`,
            quantityChange: ref.restockItems ? refItem.quantity : 0,
            sellingPrice: refItem.unitPrice,
            referenceDoc: ref.invoiceNumber,
            performedBy: ref.refundedBy || 'Manager',
            imeiAffected: refItem.imei ? [refItem.imei] : undefined,
            extraMeta: {
              refundMethod: ref.refundMethod,
              restocked: ref.restockItems,
              notes: ref.notes,
            }
          });
        });
      });
    }
  });

  // 4. Stock Adjustments (Manual, Damage Write-off, Samples, Supplier Returns, Corrections)
  allAdjustments.forEach(adj => {
    const prod = getProduct(adj.productId, adj.productName);
    const prodId = prod?.id || adj.productId || `prod-${adj.productName}`;
    const prodName = prod?.name || adj.productName;

    const reasonLabel = 
      adj.reason === 'physical_audit' ? 'Physical Stocktake Count' :
      adj.reason === 'damaged' ? 'Damaged / Defective Write-off' :
      adj.reason === 'return_supplier' ? 'Returned to Supplier RMA' :
      adj.reason === 'sample' ? 'Showroom / Display Sample' :
      adj.reason === 'restock' ? 'Manual Restock / Replenishment' :
      adj.reason === 'correction' ? 'Inventory Recount Correction' : 'Stock Adjustment';

    events.push({
      id: `adj-${adj.id}`,
      productId: prodId,
      productName: prodName,
      productBrand: prod?.brand,
      productCategory: prod?.category,
      productSku: prod?.sku,
      productBarcode: prod?.barcode,
      timestamp: adj.timestamp,
      type: adj.reason === 'physical_audit' ? 'physical_audit' : 'stock_adjustment',
      title: `Adjustment: ${prodName} (${reasonLabel})`,
      details: `Stock level adjusted: ${adj.previousStock} ➔ ${adj.newStock} units (${adj.quantityChange >= 0 ? '+' : ''}${adj.quantityChange}). ${adj.reasonNotes ? `Notes: "${adj.reasonNotes}"` : `Reason: ${reasonLabel}`}.`,
      quantityChange: adj.quantityChange,
      stockBefore: adj.previousStock,
      stockAfter: adj.newStock,
      referenceDoc: adj.auditSessionId ? `AUD-${(adj.auditSessionId || '').slice(-6).toUpperCase()}` : undefined,
      performedBy: adj.adjustedBy || 'Inventory Staff',
      imeiAffected: adj.imeiList && adj.imeiList.length > 0 ? adj.imeiList : undefined,
      reasonLabel,
      extraMeta: {
        reason: adj.reason,
        notes: adj.reasonNotes,
        type: adj.type
      }
    });
  });

  // 5. Price Changes
  allPriceChanges.forEach(pc => {
    const prod = getProduct(pc.productId, pc.productName);
    const prodId = prod?.id || pc.productId || `prod-${pc.productName}`;
    const prodName = prod?.name || pc.productName;

    const delta = pc.priceDelta !== undefined 
      ? pc.priceDelta 
      : (pc.newSellingPrice - pc.oldSellingPrice);
    const pct = pc.percentageChange !== undefined 
      ? pc.percentageChange 
      : (pc.oldSellingPrice > 0 ? ((delta / pc.oldSellingPrice) * 100) : 0);

    const reasonLabel = 
      pc.reason === 'market_adjustment' ? 'Market Rate Adjustment' :
      pc.reason === 'promo_discount' ? 'Promotional Markdown' :
      pc.reason === 'supplier_cost_change' ? 'Supplier Cost Shift' :
      pc.reason === 'clearance' ? 'Stock Clearance' :
      pc.reason === 'currency_fluctuation' ? 'Currency Rate Fluctuation' :
      pc.reason === 'manual_correction' ? 'Price Correction' :
      pc.reason === 'bulk_reprice' ? 'Bulk Batch Reprice' : 'Price Revision';

    const hasCostChange = pc.oldCostPrice !== undefined && pc.newCostPrice !== undefined && pc.oldCostPrice !== pc.newCostPrice;

    events.push({
      id: `pc-${pc.id}`,
      productId: prodId,
      productName: prodName,
      productBrand: prod?.brand,
      productCategory: prod?.category,
      productSku: prod?.sku,
      productBarcode: prod?.barcode,
      timestamp: pc.timestamp,
      type: 'price_change',
      title: `Price Change: ${prodName} (${delta >= 0 ? '+' : ''}${delta.toLocaleString()} Ks)`,
      details: `Retail price changed: ${pc.oldSellingPrice.toLocaleString()} Ks ➔ ${pc.newSellingPrice.toLocaleString()} Ks (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).${hasCostChange ? ` Cost: ${pc.oldCostPrice?.toLocaleString()} Ks ➔ ${pc.newCostPrice?.toLocaleString()} Ks.` : ''}${pc.reasonNotes ? ` Notes: "${pc.reasonNotes}".` : ''}`,
      oldSellingPrice: pc.oldSellingPrice,
      newSellingPrice: pc.newSellingPrice,
      oldCostPrice: pc.oldCostPrice,
      newCostPrice: pc.newCostPrice,
      priceDelta: delta,
      priceChangePercent: Number(pct.toFixed(1)),
      marginPercentBefore: pc.oldMarginPercent,
      marginPercentAfter: pc.newMarginPercent,
      sellingPrice: pc.newSellingPrice,
      unitCost: pc.newCostPrice ?? pc.oldCostPrice ?? prod?.costPrice,
      reasonLabel,
      performedBy: pc.changedBy || 'Authorized Staff',
      extraMeta: {
        reason: pc.reason,
        notes: pc.reasonNotes,
        effectiveDate: pc.effectiveDate
      }
    });
  });

  // 6. Stock Audit Session Reconciliations
  allAudits.forEach(aud => {
    if (aud.reconciled && aud.items) {
      aud.items.forEach(audItem => {
        if (audItem.variance !== 0) {
          const prod = getProduct(audItem.productId, audItem.productName);
          const prodId = prod?.id || audItem.productId || `prod-${audItem.productName}`;
          const prodName = prod?.name || audItem.productName;

          const hasMatchingAdj = allAdjustments.some(a => a.auditSessionId === aud.id && (a.productId === prodId || a.productName === prodName));
          if (!hasMatchingAdj) {
            events.push({
              id: `aud-${aud.id}-${prodId}`,
              productId: prodId,
              productName: prodName,
              productBrand: prod?.brand,
              productCategory: prod?.category,
              productSku: prod?.sku,
              productBarcode: prod?.barcode,
              timestamp: aud.reconciledAt || aud.completedAt || aud.createdAt,
              type: 'physical_audit',
              title: `Physical Audit: ${prodName} (${audItem.variance > 0 ? '+' : ''}${audItem.variance})`,
              details: `Book Count: ${audItem.bookStock} vs Physical Count: ${audItem.countedStock}. Variance: ${audItem.variance > 0 ? '+' : ''}${audItem.variance} units (${audItem.status}). Session: ${aud.auditNumber}.`,
              quantityChange: audItem.variance,
              stockBefore: audItem.bookStock,
              stockAfter: audItem.countedStock,
              referenceDoc: aud.auditNumber,
              performedBy: aud.conductedBy || 'Auditor',
              reasonLabel: 'Physical Audit Discrepancy'
            });
          }
        }
      });
    }
  });

  // 7. Damage & Loss Quarantine Records
  damageLogs.forEach(dmg => {
    const prod = getProduct(dmg.productId, dmg.productName);
    const prodId = prod?.id || dmg.productId || `prod-${dmg.productName}`;
    const prodName = prod?.name || dmg.productName;

    const isRma = dmg.dispositionAction === 'rma' || dmg.status === 'Pending RMA';
    const isWriteOff = dmg.dispositionAction === 'write_off' || dmg.status === 'Written-Off';
    const isBStock = dmg.dispositionAction === 'b_stock';

    let statusDesc = 'Quarantined & Isolated from sellable stock';
    if (isRma) statusDesc = `Dispatched to Vendor RMA (${dmg.rmaVendorName || 'Supplier'})`;
    else if (isWriteOff) statusDesc = `Written-off / Scrapped (${dmg.scrapReason || 'Total loss'})`;
    else if (isBStock) statusDesc = 'Discounted and transferred to B-Stock inventory';

    events.push({
      id: `dmg-${dmg.id}`,
      productId: prodId,
      productName: prodName,
      productBrand: prod?.brand,
      productCategory: prod?.category,
      productSku: prod?.sku,
      productBarcode: prod?.barcode,
      timestamp: dmg.dispositionDate || dmg.reportedAt,
      type: 'quarantine_damage',
      title: `Quarantine: ${prodName} (${dmg.damageReason || 'Damaged / Loss'})`,
      details: `${statusDesc}. Qty: ${dmg.quarantinedQuantity || 1} unit(s). Phase: ${dmg.phase.toUpperCase()}. Log: ${dmg.logNumber}.${dmg.quarantineNotes ? ` Notes: "${dmg.quarantineNotes}".` : ''}${dmg.serialOrImei ? ` Serial/IMEI: ${dmg.serialOrImei}.` : ''}`,
      quantityChange: -(dmg.quarantinedQuantity || 1),
      sellingPrice: dmg.originalSellingPrice,
      unitCost: dmg.costImpact,
      referenceDoc: dmg.logNumber,
      performedBy: dmg.dispositionBy || dmg.assessedBy || dmg.reportedBy || 'Staff',
      imeiAffected: dmg.serialOrImei ? [dmg.serialOrImei] : undefined,
      reasonLabel: dmg.damageReason || 'Damaged / Loss Quarantine',
      extraMeta: {
        phase: dmg.phase,
        status: dmg.status,
        damageReason: dmg.damageReason,
        dispositionAction: dmg.dispositionAction,
        rmaVendorName: dmg.rmaVendorName,
        scrapReason: dmg.scrapReason,
        photoProof: dmg.photoProof,
        notes: dmg.quarantineNotes,
      }
    });
  });

  // 8. Catalog Registrations (Created / Added Date)
  products.forEach(p => {
    const itemCreatedTimestamp = p.createdAt || p.lastRestockedAt;
    if (itemCreatedTimestamp) {
      events.push({
        id: `create-${p.id}`,
        productId: p.id,
        productName: p.name,
        productBrand: p.brand,
        productCategory: p.category,
        productSku: p.sku,
        productBarcode: p.barcode,
        timestamp: itemCreatedTimestamp,
        type: 'creation',
        title: `Catalog Added: ${p.name}`,
        details: `Product "${p.name}" registered in catalog under "${p.brand || 'Unbranded'}" (${p.category}). Initial stock: ${p.stock} units at ${p.sellingPrice.toLocaleString()} Ks.`,
        quantityChange: p.stock,
        sellingPrice: p.sellingPrice,
        unitCost: p.costPrice,
        referenceDoc: p.sku || p.barcode,
        performedBy: 'System / Catalog Setup',
        reasonLabel: 'Initial Catalog Entry'
      });
    }
  });

  // Sort descending by timestamp (latest events first)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}

/**
 * Calculates aggregate lifecycle performance summary for a product
 */
export function getProductLifecycleMetrics(
  product: Product,
  timeline: ProductHistoryEvent[]
) {
  let totalPurchasedQty = 0;
  let totalSoldQty = 0;
  let totalSoldRevenue = 0;
  let totalRefundQty = 0;
  let totalRefundAmount = 0;
  let totalAdjustedQty = 0;
  let totalAdjustmentsCount = 0;
  let totalPriceChangesCount = 0;

  // Track price history progression
  const priceChangeEvents = timeline
    .filter(ev => ev.type === 'price_change')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  totalPriceChangesCount = priceChangeEvents.length;

  const initialSellingPrice = priceChangeEvents.length > 0 && priceChangeEvents[0].oldSellingPrice !== undefined
    ? priceChangeEvents[0].oldSellingPrice
    : product.sellingPrice;

  const lifetimePriceDelta = product.sellingPrice - initialSellingPrice;

  timeline.forEach(ev => {
    if (ev.type === 'purchase_stock_in' && ev.quantityChange) {
      totalPurchasedQty += ev.quantityChange;
    } else if (ev.type === 'pos_sale' && ev.quantityChange) {
      const sold = Math.abs(ev.quantityChange);
      totalSoldQty += sold;
      if (ev.sellingPrice) {
        totalSoldRevenue += sold * ev.sellingPrice;
      }
    } else if (ev.type === 'sale_refund') {
      if (ev.quantityChange) totalRefundQty += Math.abs(ev.quantityChange);
    } else if (ev.type === 'stock_adjustment' || ev.type === 'physical_audit') {
      totalAdjustmentsCount++;
      if (ev.quantityChange) totalAdjustedQty += ev.quantityChange;
    }
  });

  const currentStock = product.stock;
  const currentValuation = product.costPrice * currentStock;
  const retailValuation = product.sellingPrice * currentStock;
  const grossProfitGenerated = totalSoldRevenue - (totalSoldQty * product.costPrice);

  return {
    totalPurchasedQty,
    totalSoldQty,
    totalSoldRevenue,
    totalRefundQty,
    totalRefundAmount,
    totalAdjustedQty,
    totalAdjustmentsCount,
    totalPriceChangesCount,
    initialSellingPrice,
    currentSellingPrice: product.sellingPrice,
    lifetimePriceDelta,
    currentStock,
    currentValuation,
    retailValuation,
    grossProfitGenerated,
  };
}

