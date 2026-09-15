import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  StockAdjustment, 
  StockAuditSession,
  PriceChangeRecord,
  ProductHistoryEvent 
} from '../types';

/**
 * Aggregates all chronological events for a specific product across sales,
 * purchases, refunds, stock adjustments, price changes, physical stock audits, and IMEI logs.
 */
export function getProductHistoryTimeline(
  product: Product,
  allSales: Sale[] = [],
  allPurchases: PurchaseRecord[] = [],
  allAdjustments: StockAdjustment[] = [],
  allAudits: StockAuditSession[] = [],
  allPriceChanges: PriceChangeRecord[] = []
): ProductHistoryEvent[] {
  const events: ProductHistoryEvent[] = [];

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

