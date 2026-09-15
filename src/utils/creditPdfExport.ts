import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CreditSaleRecord, CreditRepaymentRecord, ShopSettings } from '../types';
import { formatCurrency, formatDate, formatDateTime, formatImei, getPaymentMethodInfo } from './formatters';
import { drawExecutiveHeader, drawExecutiveFooter } from './pdfLayoutStyles';

/**
 * 1. Export Credit Sale Promissory Agreement & Legal Contract PDF
 */
export function exportCreditAgreementPdf(creditSale: CreditSaleRecord, settings: ShopSettings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  drawExecutiveHeader(
    doc,
    settings,
    'CREDIT SALE AGREEMENT & PROMISSORY NOTE',
    `Credit Contract #${creditSale.creditNumber} • Linked Invoice #${creditSale.invoiceNumber}`,
    (creditSale.status || 'active').replace(/_/g, ' ').toUpperCase(),
    [124, 58, 237]
  );

  let startY = 48;

  // Metadata 2-Column Info Card
  const boxWidth = (pageWidth - 32) / 2;

  // Box 1: Customer (Borrower) Details
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, boxWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('BORROWER / CUSTOMER INFORMATION', 18, startY + 6);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Full Name:`, 18, startY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${creditSale.customerName}`, 42, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Phone / Mobile:`, 18, startY + 17);
  doc.setFont('helvetica', 'bold');
  doc.text(`${creditSale.customerPhone || 'N/A'}`, 42, startY + 17);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`NRC / Identity:`, 18, startY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${creditSale.customerNrc || 'Not provided'}`, 42, startY + 22);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Residential Addr:`, 18, startY + 27);
  doc.setFont('helvetica', 'normal');
  doc.text(`${creditSale.customerAddress || 'Local resident'}`, 42, startY + 27, { maxWidth: boxWidth - 46 });

  // Box 2: Guarantor & Collateral Details
  const rightX = 14 + boxWidth + 4;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(rightX, startY, boxWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('GUARANTOR & COLLATERAL SECURITY', rightX + 4, startY + 6);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Guarantor Name:`, rightX + 4, startY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${creditSale.guarantorName || 'Self Guaranteed'}`, rightX + 32, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Guarantor Phone:`, rightX + 4, startY + 17);
  doc.setFont('helvetica', 'bold');
  doc.text(`${creditSale.guarantorPhone || 'N/A'}`, rightX + 32, startY + 17);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Guarantor NRC:`, rightX + 4, startY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${creditSale.guarantorNrc || 'N/A'}`, rightX + 32, startY + 22);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Collateral / Sec:`, rightX + 4, startY + 27);
  doc.setFont('helvetica', 'normal');
  doc.text(`${creditSale.collateralDescription || 'Financed Device IMEI Lien'}`, rightX + 32, startY + 27, { maxWidth: boxWidth - 36 });

  startY += 43;

  // Itemized Purchased Devices Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('1. FINANCED ITEMS & SERIALIZED HARDWARE (IMEI)', 14, startY);

  startY += 3;

  const itemsData = (creditSale.items || []).map((item, idx) => [
    idx + 1,
    `${item.name}${item.ram || item.rom ? ` (${[item.ram, item.rom].filter(Boolean).join('/')})` : ''}`,
    item.imei || (creditSale.imeis && creditSale.imeis[idx]) || 'Non-Serialized',
    item.quantity,
    formatCurrency(item.unitPrice, settings.currencySymbol),
    formatCurrency(item.finalPrice || (item.unitPrice * item.quantity), settings.currencySymbol)
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['#', 'Device Description', 'Serialized IMEI / Serial', 'Qty', 'Unit Price', 'Total']],
    body: itemsData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 40, font: 'courier' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 6;

  // Credit Financial Terms & Installments
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('2. REPAYMENT TERMS & INSTALLMENT SCHEDULE', 14, startY);

  startY += 3;

  const installmentRows = (creditSale.installments || []).map((inst) => [
    `Installment #${inst.installmentNumber}`,
    formatDate(inst.dueDate),
    formatCurrency(inst.amountDue, settings.currencySymbol),
    formatCurrency(inst.amountPaid || 0, settings.currencySymbol),
    formatCurrency(Math.max(0, inst.amountDue - (inst.amountPaid || 0)), settings.currencySymbol),
    (inst.status || 'pending').toUpperCase()
  ]);

  if (installmentRows.length === 0) {
    installmentRows.push([
      'Lump Sum Due',
      formatDate(creditSale.dueDate),
      formatCurrency(creditSale.totalPayable, settings.currencySymbol),
      formatCurrency(creditSale.totalPaid, settings.currencySymbol),
      formatCurrency(creditSale.remainingBalance, settings.currencySymbol),
      (creditSale.status || 'active').toUpperCase()
    ]);
  }

  autoTable(doc, {
    startY: startY,
    head: [['Schedule', 'Due Date', 'Installment Due', 'Amount Paid', 'Balance Due', 'Status']],
    body: installmentRows,
    theme: 'grid',
    headStyles: {
      fillColor: [79, 70, 229], // Indigo
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 28 },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 26, halign: 'center' },
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 6;

  // Financial Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(pageWidth - 94, startY, 80, 28, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Total Sale Valuation:', pageWidth - 90, startY + 5.5);
  doc.text('Upfront Down Payment:', pageWidth - 90, startY + 10.5);
  doc.text('Principal Credit Financed:', pageWidth - 90, startY + 15.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Outstanding Balance Due:', pageWidth - 90, startY + 22);

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(formatCurrency(creditSale.totalSaleAmount, settings.currencySymbol), pageWidth - 18, startY + 5.5, { align: 'right' });
  doc.setTextColor(16, 185, 129); // emerald
  doc.text(`-${formatCurrency(creditSale.downPayment || 0, settings.currencySymbol)}`, pageWidth - 18, startY + 10.5, { align: 'right' });
  doc.setTextColor(79, 70, 229); // indigo
  doc.text(formatCurrency(creditSale.principalCreditAmount, settings.currencySymbol), pageWidth - 18, startY + 15.5, { align: 'right' });
  doc.setTextColor(225, 29, 72); // rose
  doc.setFontSize(9);
  doc.text(formatCurrency(creditSale.remainingBalance, settings.currencySymbol), pageWidth - 18, startY + 22, { align: 'right' });

  // Promissory Contract Terms
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('3. LEGAL PROMISSORY OBLIGATION & TERMS', 14, startY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const termsText = [
    '• The Borrower acknowledges receipt of the above described merchandise in full working condition.',
    '• The Borrower promises to pay the balance due according to the agreed schedule on or before the due date.',
    '• Title of goods remains with the seller until full payment has been liquidated. Default empowers immediate repossession of IMEI.',
  ];
  doc.text(termsText, 14, startY + 5, { maxWidth: pageWidth - 115 });

  startY += 36;

  // Signatures Area
  const sigWidth = (pageWidth - 36) / 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);

  // Sig 1: Customer
  doc.line(14, startY + 16, 14 + sigWidth, startY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Borrower / Customer Signature', 14 + sigWidth / 2, startY + 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(creditSale.customerName, 14 + sigWidth / 2, startY + 24, { align: 'center' });

  // Sig 2: Guarantor
  const sig2X = 14 + sigWidth + 4;
  doc.line(sig2X, startY + 16, sig2X + sigWidth, startY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Guarantor Signature', sig2X + sigWidth / 2, startY + 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(creditSale.guarantorName || 'Guarantor', sig2X + sigWidth / 2, startY + 24, { align: 'center' });

  // Sig 3: Store Manager
  const sig3X = sig2X + sigWidth + 4;
  doc.line(sig3X, startY + 16, sig3X + sigWidth, startY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Authorized Shop Manager', sig3X + sigWidth / 2, startY + 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(creditSale.createdBy || settings.shopName, sig3X + sigWidth / 2, startY + 24, { align: 'center' });

  drawExecutiveFooter(doc, settings);

  const safeCustomer = creditSale.customerName.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Credit_Agreement_${creditSale.creditNumber}_${safeCustomer}.pdf`);
}

/**
 * 2. Export Debt Repayment Receipt Voucher Slip PDF
 */
export function exportCreditRepaymentReceiptPdf(
  repayment: CreditRepaymentRecord,
  creditSale: CreditSaleRecord,
  settings: ShopSettings
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  drawExecutiveHeader(
    doc,
    settings,
    'DEBT COLLECTION RECEIPT VOUCHER',
    `Receipt #${repayment.receiptVoucherNumber} • Ref Credit #${creditSale.creditNumber}`,
    'OFFICIAL RECEIPT',
    [16, 185, 129] // Emerald
  );

  let startY = 48;

  // Metadata Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, startY, pageWidth - 24, 40, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('COLLECTION & TRANSACTION PARTICULARS', 16, startY + 6);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  doc.text('Customer Name:', 16, startY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(repayment.customerName, 44, startY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Payment Date:', 16, startY + 17);
  doc.setFont('helvetica', 'bold');
  doc.text(formatDateTime(repayment.date), 44, startY + 17);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Payment Method:', 16, startY + 22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${(repayment.paymentMethod || 'cash').toUpperCase()}${repayment.paymentRef ? ` (Ref: ${repayment.paymentRef})` : ''}`, 44, startY + 22);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Collected By Staff:', 16, startY + 27);
  doc.setFont('helvetica', 'bold');
  doc.text(repayment.collectedBy, 44, startY + 27);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Linked Invoice #:', 16, startY + 32);
  doc.setFont('helvetica', 'bold');
  doc.text(repayment.invoiceNumber, 44, startY + 32);

  startY += 45;

  // Financial Breakdown Box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(12, startY, pageWidth - 24, 34, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Previous Outstanding Balance:', 16, startY + 7);
  doc.text('Amount Collected & Credited:', 16, startY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('New Remaining Debt Balance:', 16, startY + 24);

  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(repayment.previousBalance, settings.currencySymbol), pageWidth - 16, startY + 7, { align: 'right' });

  doc.setTextColor(16, 185, 129); // Emerald
  doc.setFontSize(11);
  doc.text(formatCurrency(repayment.amount, settings.currencySymbol), pageWidth - 16, startY + 14, { align: 'right' });

  doc.setTextColor(repayment.newBalance <= 0 ? 16 : 225, repayment.newBalance <= 0 ? 185 : 29, repayment.newBalance <= 0 ? 129 : 72);
  doc.setFontSize(10);
  doc.text(
    repayment.newBalance <= 0 ? 'SETTLED (0.00)' : formatCurrency(repayment.newBalance, settings.currencySymbol),
    pageWidth - 16,
    startY + 24,
    { align: 'right' }
  );

  startY += 40;

  // Notes
  if (repayment.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Collection Notes: ${repayment.notes}`, 12, startY);
    startY += 8;
  }

  // Dual signatures
  const sigColWidth = (pageWidth - 30) / 2;
  doc.line(12, startY + 16, 12 + sigColWidth, startY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Customer Signature', 12 + sigColWidth / 2, startY + 20, { align: 'center' });

  const rightSigX = 12 + sigColWidth + 6;
  doc.line(rightSigX, startY + 16, rightSigX + sigColWidth, startY + 16);
  doc.text('Cashier / Collector Signature', rightSigX + sigColWidth / 2, startY + 20, { align: 'center' });

  drawExecutiveFooter(doc, settings);

  doc.save(`Receipt_${repayment.receiptVoucherNumber}_${creditSale.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

/**
 * 3. Export Complete Accounts Receivable (AR) Register Statement PDF
 */
export function exportCreditSalesRegisterPdf(creditSales: CreditSaleRecord[], settings: ShopSettings) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  drawExecutiveHeader(
    doc,
    settings,
    'ACCOUNTS RECEIVABLE & CREDIT SALES REGISTER',
    `Active Debtors Portfolio & Outstanding Balances Summary (${creditSales.length} records)`,
    'FINANCIAL REPORT',
    [124, 58, 237]
  );

  const totalOutstanding = creditSales
    .filter(c => c.status !== 'cancelled' && c.status !== 'bad_debt')
    .reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
  const totalCollected = creditSales.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
  const totalFinanced = creditSales.reduce((sum, c) => sum + (c.totalSaleAmount || 0), 0);

  const tableRows = creditSales.map((c, idx) => [
    idx + 1,
    c.creditNumber,
    c.customerName,
    c.customerPhone || 'N/A',
    formatDate(c.startDate),
    formatDate(c.dueDate),
    formatCurrency(c.totalSaleAmount, settings.currencySymbol),
    formatCurrency(c.downPayment || 0, settings.currencySymbol),
    formatCurrency(c.totalPaid || 0, settings.currencySymbol),
    formatCurrency(c.remainingBalance || 0, settings.currencySymbol),
    (c.status || 'active').toUpperCase()
  ]);

  autoTable(doc, {
    startY: 48,
    head: [[
      '#',
      'Credit #',
      'Customer Name',
      'Phone',
      'Start Date',
      'Due Date',
      'Total Sale',
      'Down Pay',
      'Total Paid',
      'Balance Due',
      'Status'
    ]],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 22, font: 'courier' },
      2: { cellWidth: 38 },
      3: { cellWidth: 24 },
      4: { cellWidth: 20 },
      5: { cellWidth: 20 },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 24, halign: 'right' },
      9: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      10: { cellWidth: 22, halign: 'center' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;

  // Summary KPI box at bottom
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Financed: ${formatCurrency(totalFinanced, settings.currencySymbol)}   |   Total Collected: ${formatCurrency(totalCollected, settings.currencySymbol)}   |   Total Outstanding AR Balance: ${formatCurrency(totalOutstanding, settings.currencySymbol)}`, 14, finalY);

  drawExecutiveFooter(doc, settings);

  doc.save(`Accounts_Receivable_Register_${new Date().toISOString().split('T')[0]}.pdf`);
}
