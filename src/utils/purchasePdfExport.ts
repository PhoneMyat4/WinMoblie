import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PurchaseRecord, ShopSettings } from '../types';
import { formatCurrency, formatDate, formatDateTime, formatImei, getPaymentMethodInfo } from './formatters';

/**
 * Common PDF layout helper to draw consistent executive headers and footers
 */
function drawDocumentHeader(
  doc: jsPDF,
  settings: ShopSettings,
  docTitle: string,
  docSubtype: string,
  badgeText: string,
  badgeColor: [number, number, number] = [79, 70, 229] // Indigo
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'Point of Sale & Inventory Management ERP';
  const shopPhone = settings?.phone || '';
  const shopAddress = settings?.address || '';

  // Top Accent Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Colored Stripe
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.rect(0, 26, pageWidth, 2, 'F');

  // Company Brand Name & Tagline
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(shopName.toUpperCase(), 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(shopTagline, 14, 17);

  // Address & Contacts
  const contactText = [shopPhone ? `Tel: ${shopPhone}` : '', shopAddress].filter(Boolean).join(' | ');
  if (contactText) {
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(contactText, pageWidth - 14, 11, { align: 'right' });
  }

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth - 14, 17, { align: 'right' });

  // Document Title & Stage Banner
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(docTitle, 14, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(docSubtype, 14, 42);

  // Stage Badge Box
  const badgeWidth = doc.getTextWidth(badgeText) + 8;
  const badgeX = pageWidth - 14 - badgeWidth;
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.roundedRect(badgeX, 32, badgeWidth, 7, 1.5, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(badgeText, badgeX + badgeWidth / 2, 36.8, { align: 'center' });
}

function drawDocumentFooter(doc: jsPDF, settings: ShopSettings) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${shopName} • Enterprise Procurement & ERP Workflow System`, 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
}

// Helper to draw clean metadata 2-column info cards
function drawInfoBoxes(
  doc: jsPDF,
  startY: number,
  leftTitle: string,
  leftRows: [string, string][],
  rightTitle: string,
  rightRows: [string, string][]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const boxWidth = (pageWidth - 28 - 6) / 2;
  const leftX = 14;
  const rightX = leftX + boxWidth + 6;

  const boxHeight = Math.max(leftRows.length, rightRows.length) * 4.5 + 8;

  // Left Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftX, startY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(leftTitle.toUpperCase(), leftX + 4, startY + 5.5);

  let currentY = startY + 10;
  leftRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, leftX + 4, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(value, leftX + 28, currentY);
    currentY += 4.5;
  });

  // Right Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightX, startY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(rightTitle.toUpperCase(), rightX + 4, startY + 5.5);

  currentY = startY + 10;
  rightRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, rightX + 4, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(value, rightX + 30, currentY);
    currentY += 4.5;
  });

  return startY + boxHeight + 5;
}

// Helper to draw authorized signatures
function drawSignatureBlock(doc: jsPDF, startY: number, titles: [string, string, string]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const colWidth = (pageWidth - 28 - 12) / 3;

  // Check if we have enough space, else don't overlap footer
  const targetY = Math.min(startY, pageHeight - 32);

  titles.forEach((title, idx) => {
    const x = 14 + idx * (colWidth + 6);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(x, targetY + 14, x + colWidth, targetY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(title, x + colWidth / 2, targetY + 18, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Signature & Date Stamp', x + colWidth / 2, targetY + 21.5, { align: 'center' });
  });
}

/**
 * ============================================================================
 * STAGE 1: OFFICIAL PURCHASE ORDER (PO) PDF EXPORT
 * ============================================================================
 */
export function exportPurchaseOrderPdf(purchase: PurchaseRecord, settings: ShopSettings) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const isDraft = purchase.status === 'draft';
  const badgeText = isDraft
    ? 'STAGE 1: DRAFT ORDER'
    : purchase.status === 'pending_approval'
    ? 'STAGE 1: PENDING APPROVAL'
    : 'STAGE 1: CONFIRMED PO';

  const badgeColor: [number, number, number] = isDraft
    ? [217, 119, 6] // Amber
    : purchase.status === 'pending_approval'
    ? [99, 102, 241] // Indigo
    : [16, 185, 129]; // Emerald

  drawDocumentHeader(
    doc,
    settings,
    `PURCHASE ORDER #${purchase.purchaseOrderNumber}`,
    'Official Procurement & Supplier Order Quotation',
    badgeText,
    badgeColor
  );

  let currentY = 48;

  // Metadata cards
  const supplierRows: [string, string][] = [
    ['Supplier Name', purchase.supplierName || '-'],
    ['Phone Contact', purchase.supplierPhone || 'Not specified'],
    ['Ref Invoice No', purchase.referenceInvoiceNo || 'N/A'],
    ['Payment Terms', (purchase.paymentMethod || 'cash').toUpperCase()],
  ];

  const orderRows: [string, string][] = [
    ['Order Date', formatDate(purchase.date)],
    ['Created By', `${purchase.createdBy || 'Staff'} (${purchase.createdByRole || 'Cashier'})`],
    ['Workflow Status', (purchase.status || 'draft').toUpperCase().replace('_', ' ')],
    ['Target Delivery', 'Standard Warehouse Transit'],
  ];

  currentY = drawInfoBoxes(doc, currentY, 'Supplier / Vendor Details', supplierRows, 'Order & Dispatch Meta', orderRows);

  // Table of Items
  const headers = ['#', 'Item Description & Model', 'Specs / Variant', 'Qty', `Unit Cost (${settings.currencySymbol})`, `Total (${settings.currencySymbol})`];
  const rows = purchase.items.map((item, idx) => {
    const specs = [
      item.ram && item.ram !== '-' ? item.ram : '',
      item.rom && item.rom !== '-' ? item.rom : '',
      item.color && item.color !== '-' ? item.color : '',
      item.condition === 'used_grade_a' ? 'Used' : '',
    ].filter(Boolean).join(' • ') || item.category.replace('_', ' ');

    return [
      idx + 1,
      item.name,
      specs,
      item.quantity,
      formatCurrency(item.unitCost, '').trim(),
      formatCurrency(item.totalCost || item.unitCost * item.quantity, '').trim(),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 60 },
      2: { halign: 'left', cellWidth: 42 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 4;

  // Financial Totals Summary Box
  const summaryBoxWidth = 80;
  const summaryX = pageWidth - 14 - summaryBoxWidth;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(summaryX, finalY, summaryBoxWidth, 26, 1.5, 1.5, 'FD');

  const totalUnits = purchase.items.reduce((sum, item) => sum + item.quantity, 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Subtotal (${totalUnits} units):`, summaryX + 4, finalY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(purchase.subtotal, settings.currencySymbol), summaryX + summaryBoxWidth - 4, finalY + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Shipping / Delivery Fee:', summaryX + 4, finalY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(purchase.shippingFee || 0, settings.currencySymbol), summaryX + summaryBoxWidth - 4, finalY + 12, { align: 'right' });

  // Grand Total Line
  doc.setFillColor(79, 70, 229);
  doc.rect(summaryX, finalY + 16, summaryBoxWidth, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('GRAND TOTAL:', summaryX + 4, finalY + 22.5);
  doc.setFontSize(10);
  doc.text(formatCurrency(purchase.grandTotal, settings.currencySymbol), summaryX + summaryBoxWidth - 4, finalY + 22.5, { align: 'right' });

  // Notes area if any
  if (purchase.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('ORDER NOTES & INSTRUCTIONS:', 14, finalY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(purchase.notes, 14, finalY + 11, { maxWidth: summaryX - 20 });
  }

  // Signatures
  drawSignatureBlock(doc, finalY + 34, [
    `Purchaser: ${purchase.createdBy || 'Staff'}`,
    'Store / Procurement Manager',
    'Supplier Acceptance',
  ]);

  drawDocumentFooter(doc, settings);
  doc.save(`Purchase_Order_${purchase.purchaseOrderNumber}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * ============================================================================
 * STAGE 2: PURCHASE PAYMENT VOUCHER & CONFIRMATION PDF EXPORT
 * ============================================================================
 */
export function exportPurchasePaymentVoucherPdf(
  purchase: PurchaseRecord,
  settings: ShopSettings,
  overridePayment?: {
    paymentMethod: string;
    amountPaid: number;
    confirmedBy: string;
    confirmedByRole: string;
    approvalNotes?: string;
  }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const confirmedBy = overridePayment?.confirmedBy || purchase.confirmedBy || settings.currentStaffName || 'Finance Officer';
  const confirmedRole = overridePayment?.confirmedByRole || purchase.confirmedByRole || 'Manager';
  const payMethod = overridePayment?.paymentMethod || purchase.paymentMethod;
  const payMethodInfo = getPaymentMethodInfo(payMethod as any);
  const amountPaid = overridePayment?.amountPaid ?? purchase.amountPaid ?? purchase.grandTotal;
  const balanceDue = Math.max(0, purchase.grandTotal - amountPaid);
  const isFullyPaid = balanceDue === 0;

  drawDocumentHeader(
    doc,
    settings,
    `PAYMENT VOUCHER #${purchase.purchaseOrderNumber}`,
    'Stage 2: Official Cash/Bank Disbursement & Executive Approval Slip',
    isFullyPaid ? 'STAGE 2: FULLY PAID' : 'STAGE 2: PARTIAL PAYMENT',
    [16, 185, 129] // Emerald
  );

  let currentY = 48;

  // Info Cards
  const beneficiaryRows: [string, string][] = [
    ['Payee / Supplier', purchase.supplierName],
    ['Phone / Contact', purchase.supplierPhone || 'N/A'],
    ['PO Reference', `#${purchase.purchaseOrderNumber}`],
    ['Supplier Ref Invoice', purchase.referenceInvoiceNo || 'N/A'],
  ];

  const paymentMetaRows: [string, string][] = [
    ['Payment Date', formatDate(purchase.confirmedAt || purchase.date)],
    ['Payment Channel', `${(payMethod || 'cash').toUpperCase()} (${payMethodInfo.label})`],
    ['Authorized By', `${confirmedBy} (${confirmedRole})`],
    ['Payment Status', isFullyPaid ? 'FULLY DISBURSED (PAID)' : 'PARTIALLY PAID'],
  ];

  currentY = drawInfoBoxes(doc, currentY, 'Beneficiary & Supplier Info', beneficiaryRows, 'Disbursement & Authorization', paymentMetaRows);

  // Financial Settlement Breakdown
  const headers = ['Financial Account Line', 'Detail / Reference', `Amount (${settings.currencySymbol})`];
  const rows = [
    ['Purchase Order Subtotal', `${purchase.items.length} product lines (${purchase.items.reduce((s, i) => s + i.quantity, 0)} total units)`, formatCurrency(purchase.subtotal, '').trim()],
    ['Freight & Shipping Charges', 'Supplier dispatch / transport fee', formatCurrency(purchase.shippingFee || 0, '').trim()],
    ['Other Incidental Charges', 'Customs / supplier handling fees', formatCurrency(purchase.otherCosts || 0, '').trim()],
    ['Total Invoice Payable', `Grand total commitment for PO #${purchase.purchaseOrderNumber}`, formatCurrency(purchase.grandTotal, '').trim()],
    ['Amount Paid / Disbursed', `Settled via ${(payMethod || 'cash').toUpperCase()}`, formatCurrency(amountPaid, '').trim()],
    ['Remaining Balance Due', balanceDue === 0 ? 'Clear / Nil' : 'Pending subsequent settlement', formatCurrency(balanceDue, '').trim()],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [16, 185, 129], // Emerald
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 50 },
      1: { halign: 'left', cellWidth: 84 },
      2: { halign: 'right', fontStyle: 'bold', cellWidth: 48 },
    },
    margin: { left: 14, right: 14 },
  });

  let nextY = (doc as any).lastAutoTable.finalY + 4;

  // Executive Approval Notes Box
  const notesText = overridePayment?.approvalNotes || purchase.approvalNotes || 'Executive confirmation granted. Approved for warehouse receiving.';
  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(187, 247, 208); // emerald-200
  doc.roundedRect(14, nextY, pageWidth - 28, 16, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text('EXECUTIVE APPROVAL & AUDIT REMARKS:', 18, nextY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(21, 128, 61);
  doc.text(notesText, 18, nextY + 10, { maxWidth: pageWidth - 36 });

  nextY += 22;

  // Purchased items overview
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Covered Inventory Line Items:', 14, nextY);
  nextY += 3;

  const itemHeaders = ['#', 'Item Name & Model', 'Qty', `Unit Cost (${settings.currencySymbol})`, `Line Total (${settings.currencySymbol})`];
  const itemRows = purchase.items.map((it, idx) => [
    idx + 1,
    it.name,
    it.quantity,
    formatCurrency(it.unitCost, '').trim(),
    formatCurrency(it.totalCost || it.unitCost * it.quantity, '').trim(),
  ]);

  autoTable(doc, {
    startY: nextY,
    head: [itemHeaders],
    body: itemRows,
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 92 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 32 },
      4: { halign: 'right', cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;

  // Signatures
  drawSignatureBlock(doc, finalY + 4, [
    `Authorized By: ${confirmedBy}`,
    'Finance / Cashier Verification',
    'Supplier / Payee Signature',
  ]);

  drawDocumentFooter(doc, settings);
  doc.save(`Payment_Voucher_${purchase.purchaseOrderNumber}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * ============================================================================
 * STAGE 3: GOODS RECEIPT NOTE (GRN) & SERIALIZED IMEI INTAKE PDF EXPORT
 * ============================================================================
 */
export function exportGoodsReceiptNotePdf(
  purchase: PurchaseRecord,
  settings: ShopSettings,
  overrideReceiptData?: {
    deliveryCharges: number;
    receivedBy: string;
    receivingNotes?: string;
    receivedDate?: string;
  }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const totalQuantity = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = (overrideReceiptData?.deliveryCharges !== undefined ? overrideReceiptData.deliveryCharges : (purchase.deliveryCharges !== undefined ? purchase.deliveryCharges : purchase.shippingFee)) || 0;
  const landedOverheadPerUnit = totalQuantity > 0 ? Math.round(deliveryFee / totalQuantity) : 0;
  const totalLandedValuation = purchase.subtotal + (purchase.otherCosts || 0) + deliveryFee;
  const receivedBy = overrideReceiptData?.receivedBy || purchase.receivedBy || settings.currentStaffName || 'Warehouse Receiving Officer';
  const receivedDate = overrideReceiptData?.receivedDate || purchase.receivedAt || purchase.date;

  drawDocumentHeader(
    doc,
    settings,
    `GOODS RECEIPT NOTE (GRN) #${purchase.purchaseOrderNumber}`,
    'Stage 3: Warehouse Intake, Serialized IMEI Verification & Landed Cost Valuation',
    'STAGE 3: RECEIVED & STOCKED',
    [13, 148, 136] // Teal
  );

  let currentY = 48;

  // Info Cards
  const intakeRows: [string, string][] = [
    ['Receiving Date', formatDate(receivedDate)],
    ['Received By', receivedBy],
    ['Supplier Name', purchase.supplierName],
    ['Invoice / Delivery Ref', purchase.referenceInvoiceNo || 'N/A'],
  ];

  const valuationRows: [string, string][] = [
    ['Total Units Received', `${totalQuantity} units`],
    ['Freight & Delivery Fee', formatCurrency(deliveryFee, settings.currencySymbol)],
    ['Landed Overhead / Unit', `+${formatCurrency(landedOverheadPerUnit, settings.currencySymbol)} per unit`],
    ['Total Landed Valuation', formatCurrency(totalLandedValuation, settings.currencySymbol)],
  ];

  currentY = drawInfoBoxes(doc, currentY, 'Intake & Inspection Meta', intakeRows, 'Landed Cost Accounting', valuationRows);

  // Items Summary Table with Landed Cost Apportionment
  const itemHeaders = [
    '#',
    'Product / Model Name',
    'Qty',
    `Base Cost (${settings.currencySymbol})`,
    `Landed Unit Cost (${settings.currencySymbol})`,
    `Retail Price (${settings.currencySymbol})`,
    `Total Landed (${settings.currencySymbol})`,
  ];

  const itemRows = purchase.items.map((item, idx) => {
    const landedCost = item.landedUnitCost || (item.unitCost + landedOverheadPerUnit);
    return [
      idx + 1,
      item.name,
      item.quantity,
      formatCurrency(item.unitCost, '').trim(),
      formatCurrency(landedCost, '').trim(),
      formatCurrency(item.sellingPrice, '').trim(),
      formatCurrency(landedCost * item.quantity, '').trim(),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [itemHeaders],
    body: itemRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [13, 148, 136], // Teal
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 54 },
      2: { halign: 'center', cellWidth: 12 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 26 },
      6: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  let nextY = (doc as any).lastAutoTable.finalY + 5;

  // Serialized IMEI Ledger Table
  const allSerializedUnits: {
    productName: string;
    unitNum: number;
    imei1: string;
    imei2?: string;
    dualImei?: boolean;
    allocatedTo?: string;
  }[] = [];

  purchase.items.forEach((item) => {
    if (item.imeiPairs && item.imeiPairs.length > 0) {
      item.imeiPairs.forEach((pair, pIdx) => {
        allSerializedUnits.push({
          productName: item.name,
          unitNum: pIdx + 1,
          imei1: pair.imei1 || '-',
          imei2: pair.imei2 || '-',
          dualImei: !!pair.imei2,
          allocatedTo: pair.allocatedCustomerName ? `Allocated: ${pair.allocatedCustomerName} (#${pair.allocatedPreOrderNumber})` : 'Warehouse Inventory',
        });
      });
    } else if (item.imeiList && item.imeiList.length > 0) {
      item.imeiList.forEach((imei, iIdx) => {
        allSerializedUnits.push({
          productName: item.name,
          unitNum: iIdx + 1,
          imei1: imei,
          dualImei: false,
          allocatedTo: 'Warehouse Inventory',
        });
      });
    }
  });

  if (allSerializedUnits.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Serialized IMEI Ledger (${allSerializedUnits.length} Registered Units):`, 14, nextY);
    nextY += 3;

    const imeiHeaders = ['#', 'Device / Model Name', 'Unit #', 'Primary IMEI 1 (15-Digits)', 'Secondary IMEI 2 / Allocation', 'Allocation Status'];
    const imeiRows = allSerializedUnits.map((u, idx) => [
      idx + 1,
      u.productName,
      `Unit ${u.unitNum}`,
      formatImei(u.imei1),
      u.imei2 && u.imei2 !== '-' ? formatImei(u.imei2) : 'Single SIM',
      u.allocatedTo || 'Stocked',
    ]);

    autoTable(doc, {
      startY: nextY,
      head: [imeiHeaders],
      body: imeiRows,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 1.8,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'left', cellWidth: 44 },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'left', fontStyle: 'bold', cellWidth: 40 },
        4: { halign: 'left', cellWidth: 38 },
        5: { halign: 'left', cellWidth: 38 },
      },
      margin: { left: 14, right: 14 },
    });

    nextY = (doc as any).lastAutoTable.finalY + 5;
  }

  // Receiving Notes
  const recNotes = overrideReceiptData?.receivingNotes || purchase.receivingNotes;
  if (recNotes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('INTAKE INSPECTION NOTES:', 14, nextY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(recNotes, 14, nextY + 4.5, { maxWidth: pageWidth - 28 });
    nextY += 12;
  }

  // Quality Assurance Verification Stamp
  doc.setFillColor(240, 253, 250); // teal-50
  doc.setDrawColor(204, 251, 241); // teal-200
  doc.roundedRect(14, nextY, pageWidth - 28, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110);
  doc.text('QUALITY ASSURANCE & BARCODE VERIFICATION CERTIFICATE:', 18, nextY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(17, 94, 89);
  doc.text('All received boxes inspected for manufacturer seal integrity, dual IMEI validity, and entered into active warehouse inventory.', 18, nextY + 8.5);

  nextY += 16;

  // Signatures
  drawSignatureBlock(doc, nextY + 2, [
    `Receiving Officer: ${receivedBy}`,
    'Quality & Inventory Inspector',
    'Store Manager Approval',
  ]);

  drawDocumentFooter(doc, settings);
  doc.save(`Goods_Receipt_Note_${purchase.purchaseOrderNumber}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * ============================================================================
 * FULL 3-STAGE ERP AUDIT DOSSIER PDF EXPORT
 * ============================================================================
 */
export function exportPurchaseFullDossierPdf(purchase: PurchaseRecord, settings: ShopSettings) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawDocumentHeader(
    doc,
    settings,
    `ERP PROCUREMENT AUDIT DOSSIER #${purchase.purchaseOrderNumber}`,
    'Complete Multi-Stage Lifecycle: Order ➔ Executive Payment ➔ Goods Intake',
    `STATUS: ${(purchase.status || 'draft').toUpperCase()}`,
    [79, 70, 229]
  );

  let currentY = 48;

  // Stage 1: Order Information
  const s1Left: [string, string][] = [
    ['Supplier Name', purchase.supplierName],
    ['Phone', purchase.supplierPhone || 'N/A'],
    ['Reference Invoice', purchase.referenceInvoiceNo || 'N/A'],
  ];
  const s1Right: [string, string][] = [
    ['PO Date', formatDate(purchase.date)],
    ['Created By', `${purchase.createdBy || 'Staff'} (${purchase.createdByRole || 'Cashier'})`],
    ['Created At', purchase.createdAt ? formatDateTime(purchase.createdAt) : 'N/A'],
  ];
  currentY = drawInfoBoxes(doc, currentY, 'Stage 1: Supplier & Order Draft', s1Left, 'Creation Timeline', s1Right);

  // Stage 2: Payment Information
  const s2Left: [string, string][] = [
    ['Payment Channel', (purchase.paymentMethod || 'cash').toUpperCase()],
    ['Amount Paid', formatCurrency(purchase.amountPaid || purchase.grandTotal, settings.currencySymbol)],
    ['Balance Due', formatCurrency(purchase.balanceDue || 0, settings.currencySymbol)],
  ];
  const s2Right: [string, string][] = [
    ['Confirmed By', `${purchase.confirmedBy || 'Pending'} (${purchase.confirmedByRole || 'Manager'})`],
    ['Confirmed At', purchase.confirmedAt ? formatDateTime(purchase.confirmedAt) : 'N/A'],
    ['Proof Attached', purchase.paymentProofUrl ? 'Yes (Verified)' : 'No / Cash'],
  ];
  currentY = drawInfoBoxes(doc, currentY, 'Stage 2: Payment & Authorization', s2Left, 'Approval Signature', s2Right);

  // Stage 3: Receiving Information
  const s3Left: [string, string][] = [
    ['Received Date', formatDate(purchase.receivedAt || purchase.date)],
    ['Received By', purchase.receivedBy || 'Staff'],
    ['Inventory Restocked', purchase.inventoryUpdated ? 'Yes (Live)' : 'Pending'],
  ];
  const totalQuantity = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryFee = (purchase.deliveryCharges !== undefined ? purchase.deliveryCharges : purchase.shippingFee) || 0;
  const s3Right: [string, string][] = [
    ['Units Received', `${totalQuantity} total units`],
    ['Delivery Charges', formatCurrency(deliveryFee, settings.currencySymbol)],
    ['Total Landed Cost', formatCurrency(purchase.totalLandedCost || purchase.grandTotal, settings.currencySymbol)],
  ];
  currentY = drawInfoBoxes(doc, currentY, 'Stage 3: Goods Intake & Warehouse', s3Left, 'Landed Accounting', s3Right);

  // Items and IMEIs
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Procured Items & Serialized Unit Records:', 14, currentY + 1);
  currentY += 4;

  const headers = ['#', 'Product Name', 'Specs / Variant', 'Qty', `Unit Cost (${settings.currencySymbol})`, `Total (${settings.currencySymbol})`];
  const rows = purchase.items.map((item, idx) => [
    idx + 1,
    item.name,
    [item.ram, item.rom, item.color].filter(Boolean).join(' • ') || item.category,
    item.quantity,
    formatCurrency(item.unitCost, '').trim(),
    formatCurrency(item.totalCost || item.unitCost * item.quantity, '').trim(),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;

  drawSignatureBlock(doc, finalY + 4, [
    `Stage 1: ${purchase.createdBy || 'Staff'}`,
    `Stage 2: ${purchase.confirmedBy || 'Manager'}`,
    `Stage 3: ${purchase.receivedBy || 'Warehouse'}`,
  ]);

  drawDocumentFooter(doc, settings);
  doc.save(`ERP_Procurement_Dossier_${purchase.purchaseOrderNumber}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * ============================================================================
 * MULTI-ROW PURCHASES REGISTER / PROCUREMENT REPORT PDF EXPORT
 * ============================================================================
 */
export function exportPurchasesRegisterPdf(
  purchases: PurchaseRecord[],
  settings: ShopSettings,
  filterName: string = 'All Purchases'
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawDocumentHeader(
    doc,
    settings,
    'PURCHASE ORDERS & PROCUREMENT REGISTER',
    `Executive Procurement Summary • Category: ${filterName}`,
    `${purchases.length} ORDERS`,
    [79, 70, 229]
  );

  const totalSpend = purchases.reduce((sum, p) => sum + (p.totalLandedCost || p.grandTotal), 0);
  const totalUnits = purchases.reduce((sum, p) => sum + p.items.reduce((iSum, it) => iSum + it.quantity, 0), 0);
  const paidOrders = purchases.filter((p) => p.paymentStatus === 'paid' || p.status === 'confirmed' || p.status === 'received').length;

  // Summary Metrics Banner
  let currentY = 48;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

  const metricColWidth = (pageWidth - 28) / 4;
  const metrics = [
    { label: 'Total Purchase Orders', val: purchases.length.toString() },
    { label: 'Total Units Procured', val: `${totalUnits} units` },
    { label: 'Paid & Disbursed Orders', val: `${paidOrders} / ${purchases.length}` },
    { label: 'Total Landed Spend', val: formatCurrency(totalSpend, settings.currencySymbol) },
  ];

  metrics.forEach((m, idx) => {
    const x = 14 + idx * metricColWidth;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, x + 4, currentY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(m.val, x + 4, currentY + 10.5);
  });

  currentY += 18;

  const headers = [
    'PO #',
    'Date',
    'Supplier Name',
    'Items Summary',
    'Total Units',
    'Stage Status',
    'Payment Method',
    `Landed Grand Total (${settings.currencySymbol})`,
  ];

  const rows = purchases.map((po) => {
    const units = po.items.reduce((sum, it) => sum + it.quantity, 0);
    const itemSummary = po.items.map((i) => i.name).slice(0, 2).join(', ') + (po.items.length > 2 ? ` (+${po.items.length - 2} more)` : '');

    return [
      `#${po.purchaseOrderNumber}`,
      formatDate(po.date),
      po.supplierName,
      itemSummary,
      units,
      (po.status || 'draft').toUpperCase().replace('_', ' '),
      (po.paymentMethod || 'cash').toUpperCase(),
      formatCurrency(po.totalLandedCost || po.grandTotal, '').trim(),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 24 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'left', fontStyle: 'bold', cellWidth: 44 },
      3: { halign: 'left', cellWidth: 70 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 30 },
      6: { halign: 'center', cellWidth: 24 },
      7: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
    },
    margin: { left: 14, right: 14 },
  });

  drawDocumentFooter(doc, settings);
  doc.save(`Procurement_Register_${filterName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
