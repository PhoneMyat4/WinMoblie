import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, ExpenseRecord, ShopSettings } from '../types';
import { formatCurrency, formatDateTime, getPaymentMethodInfo } from './formatters';
import { drawDocumentHeader, drawDocumentFooter, drawSignOffBlock } from './pdfLayoutStyles';

export interface DailyProfitPdfData {
  selectedDate: string;
  displayFormattedDate: string;
  dailyFinancials: {
    completedInvoicesCount: number;
    refundedInvoicesCount: number;
    grossRevenue: number;
    netSalesRevenue: number;
    totalDiscountsGiven: number;
    totalRefundsAmount: number;
    totalCogs: number;
    totalUnitsSold: number;
    serializedPhoneUnits: number;
    accessoryUnits: number;
    grossProfit: number;
    overallGrossMargin: number;
    overallMarkupPercent: number;
    averageProfitPerOrder: number;
    operatingExpensesTotal: number;
    writeOffScrapLosses: number;
    netOperatingProfit: number;
    netProfitMargin: number;
    cashRevenue: number;
    cashProfit: number;
    digitalRevenue: number;
    digitalProfit: number;
    invoiceRows: Array<{
      sale: Sale;
      saleRevenue: number;
      saleCogs: number;
      saleProfit: number;
      saleMargin: number;
      itemRows: any[];
    }>;
    categoryRows: Array<{
      name: string;
      revenue: number;
      cogs: number;
      profit: number;
      units: number;
      margin: number;
      contribution: number;
    }>;
    paymentRows: Array<{
      method: string;
      label: string;
      revenue: number;
      cogs: number;
      profit: number;
      count: number;
    }>;
    topProducts: Array<{
      name: string;
      category: string;
      units: number;
      revenue: number;
      cogs: number;
      profit: number;
    }>;
  };
  dailyExpenses?: ExpenseRecord[];
  settings: ShopSettings;
  staffName?: string;
  activeFilterSummary?: string;
  filteredInvoices?: Array<{
    sale: Sale;
    saleRevenue: number;
    saleCogs: number;
    saleProfit: number;
    saleMargin: number;
    itemRows: any[];
  }>;
}

/**
 * 1. COMPREHENSIVE DAILY GROSS PROFIT & P&L FINANCIAL DOSSIER (Landscape A4)
 */
export function exportDailyProfitDossierPdf(data: DailyProfitPdfData) {
  const { selectedDate, displayFormattedDate, dailyFinancials, dailyExpenses, settings, staffName } = data;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = settings.currencySymbol || 'Ks';

  // 1. Executive Header
  drawDocumentHeader(
    doc,
    settings,
    `DAILY GROSS PROFIT & P&L AUDIT REPORT`,
    `Audit Date: ${displayFormattedDate} (${selectedDate}) • Closed Orders: ${dailyFinancials.completedInvoicesCount} | Units Sold: ${dailyFinancials.totalUnitsSold}`,
    'FINANCIAL AUDIT DOSSIER',
    [16, 185, 129] // Emerald
  );

  let currentY = 44;

  // 2. Executive 6 KPI Metric Summary Cards across the top
  const cardCount = 6;
  const cardSpacing = 3;
  const cardWidth = (pageWidth - 28 - (cardCount - 1) * cardSpacing) / cardCount;
  const cardHeight = 15;

  const kpis = [
    {
      label: 'GROSS SALES REVENUE',
      value: formatCurrency(dailyFinancials.grossRevenue, currency),
      sub: `${dailyFinancials.completedInvoicesCount} Invoices (Net: ${formatCurrency(dailyFinancials.netSalesRevenue, currency)})`,
      isHighlight: false,
      textColor: [15, 23, 42],
    },
    {
      label: 'COST OF GOODS (COGS)',
      value: formatCurrency(dailyFinancials.totalCogs, currency),
      sub: `${dailyFinancials.grossRevenue > 0 ? ((dailyFinancials.totalCogs / dailyFinancials.grossRevenue) * 100).toFixed(1) : 0}% of Gross Sales`,
      isHighlight: false,
      textColor: [71, 85, 105],
    },
    {
      label: 'DAILY GROSS PROFIT',
      value: formatCurrency(dailyFinancials.grossProfit, currency),
      sub: `${dailyFinancials.overallGrossMargin.toFixed(1)}% Margin (${dailyFinancials.overallMarkupPercent.toFixed(1)}% Markup)`,
      isHighlight: true,
      textColor: [5, 150, 105], // emerald-600
    },
    {
      label: 'OPERATING EXPENSES',
      value: formatCurrency(dailyFinancials.operatingExpensesTotal, currency),
      sub: `${dailyExpenses.length} Vouchers (Loss: ${formatCurrency(dailyFinancials.writeOffScrapLosses, currency)})`,
      isHighlight: false,
      textColor: [225, 29, 72], // rose-600
    },
    {
      label: 'NET OPERATING PROFIT',
      value: formatCurrency(dailyFinancials.netOperatingProfit, currency),
      sub: `${dailyFinancials.netProfitMargin.toFixed(1)}% Net Bottom Line`,
      isHighlight: dailyFinancials.netOperatingProfit >= 0,
      textColor: dailyFinancials.netOperatingProfit >= 0 ? [4, 120, 87] : [225, 29, 72],
    },
    {
      label: 'UNITS SOLD BREAKDOWN',
      value: `${dailyFinancials.totalUnitsSold} Units`,
      sub: `${dailyFinancials.serializedPhoneUnits} Phones • ${dailyFinancials.accessoryUnits} Accessories`,
      isHighlight: false,
      textColor: [79, 70, 229], // indigo-600
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + cardSpacing);
    if (kpi.isHighlight) {
      doc.setFillColor(240, 253, 244); // emerald-50
      doc.setDrawColor(187, 247, 208); // emerald-200
    } else {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
    }
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 2.5, currentY + 4);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(kpi.textColor[0], kpi.textColor[1], kpi.textColor[2]);
    doc.text(kpi.value, x + 2.5, currentY + 8.8);

    // Subtext
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 2.5, currentY + 12.8);
  });

  currentY += cardHeight + 4;

  // 3. Cash Drawer vs Digital Collections Summary Bar
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 6.5, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('CASH DRAWER RECONCILIATION:', 17, currentY + 4.3);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const cashText = `Physical Cash Revenue: ${formatCurrency(dailyFinancials.cashRevenue, currency)} (Profit: ${formatCurrency(dailyFinancials.cashProfit, currency)})`;
  const digitalText = `Digital Wallet & Bank Revenue: ${formatCurrency(dailyFinancials.digitalRevenue, currency)} (Profit: ${formatCurrency(dailyFinancials.digitalProfit, currency)})`;
  doc.text(`${cashText}   |   ${digitalText}`, 68, currentY + 4.3);

  currentY += 9;

  // 4. Two Tables Side-by-Side: Payment Channels Breakdown (Left) & Category Profitability Breakdown (Right)
  const halfWidth = (pageWidth - 28 - 4) / 2;

  // Category Profitability Table Data
  const categoryHeaders = ['Category', 'Units', 'Revenue', 'COGS', 'Gross Profit', 'Margin %', 'Contrib %'];
  const categoryRows = dailyFinancials.categoryRows.map((cat) => [
    cat.name,
    cat.units,
    formatCurrency(cat.revenue, currency),
    formatCurrency(cat.cogs, currency),
    formatCurrency(cat.profit, currency),
    `${cat.margin.toFixed(1)}%`,
    `${cat.contribution.toFixed(1)}%`,
  ]);

  // Payment Channels Table Data
  const paymentHeaders = ['Payment Method', 'Count', 'Revenue', 'COGS', 'Gross Profit', 'Share %'];
  const paymentRows = dailyFinancials.paymentRows.map((pay) => {
    const revShare = dailyFinancials.grossRevenue > 0 ? (pay.revenue / dailyFinancials.grossRevenue) * 100 : 0;
    return [
      pay.label,
      pay.count,
      formatCurrency(pay.revenue, currency),
      formatCurrency(pay.cogs, currency),
      formatCurrency(pay.profit, currency),
      `${revShare.toFixed(1)}%`,
    ];
  });

  // Render Payment Methods Table on Left
  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 + halfWidth + 4 },
    head: [paymentHeaders],
    body: paymentRows,
    foot: [[
      'TOTALS',
      dailyFinancials.completedInvoicesCount,
      formatCurrency(dailyFinancials.grossRevenue, currency),
      formatCurrency(dailyFinancials.totalCogs, currency),
      formatCurrency(dailyFinancials.grossProfit, currency),
      '100.0%',
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 1.6,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
      5: { halign: 'right' },
    },
  });

  const paymentTableEnd = (doc as any).lastAutoTable.finalY;

  // Render Category Profitability Table on Right
  autoTable(doc, {
    startY: currentY,
    margin: { left: 14 + halfWidth + 4, right: 14 },
    head: [categoryHeaders],
    body: categoryRows,
    foot: [[
      'TOTALS',
      dailyFinancials.totalUnitsSold,
      formatCurrency(dailyFinancials.grossRevenue, currency),
      formatCurrency(dailyFinancials.totalCogs, currency),
      formatCurrency(dailyFinancials.grossProfit, currency),
      `${dailyFinancials.overallGrossMargin.toFixed(1)}%`,
      '100.0%',
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 1.6,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [16, 185, 129], // Emerald
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  });

  const categoryTableEnd = (doc as any).lastAutoTable.finalY;
  currentY = Math.max(paymentTableEnd, categoryTableEnd) + 6;

  // 5. Itemized Sales Ledger Table (Full Width)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPLETED SALES TRANSACTIONS LEDGER', 14, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Every recorded transaction on ${selectedDate} with unit cost basis, gross margin, and cashier attribution.`, 14, currentY + 3.8);

  currentY += 5.5;

  const invoiceHeaders = [
    'Invoice #',
    'Time',
    'Customer',
    'Cashier',
    'Payment',
    'Items',
    'Gross Revenue',
    'COGS (Cost)',
    'Gross Profit',
    'Margin %',
  ];

  const invoiceRows = dailyFinancials.invoiceRows.map(({ sale, saleRevenue, saleCogs, saleProfit, saleMargin }) => {
    const saleTime = sale.date.includes('T') ? sale.date.split('T')[1]?.slice(0, 5) : '-';
    const payInfo = getPaymentMethodInfo(sale.paymentMethod);
    const itemsText = sale.items.map((i) => `${i.quantity}x ${i.name}`).join('; ');
    return [
      sale.invoiceNumber,
      saleTime,
      sale.customerName || 'Walk-in Customer',
      sale.soldBy || '-',
      payInfo.label,
      itemsText.length > 35 ? `${itemsText.slice(0, 32)}...` : itemsText,
      formatCurrency(saleRevenue, currency),
      formatCurrency(saleCogs, currency),
      formatCurrency(saleProfit, currency),
      `${saleMargin.toFixed(1)}%`,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [invoiceHeaders],
    body: invoiceRows,
    foot: [[
      'LEDGER TOTALS',
      '',
      `${dailyFinancials.completedInvoicesCount} Invoices`,
      '',
      '',
      `${dailyFinancials.totalUnitsSold} Units`,
      formatCurrency(dailyFinancials.grossRevenue, currency),
      formatCurrency(dailyFinancials.totalCogs, currency),
      formatCurrency(dailyFinancials.grossProfit, currency),
      `${dailyFinancials.overallGrossMargin.toFixed(1)}%`,
    ]],
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      4: { halign: 'center' },
      5: { cellWidth: 50 },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
      9: { halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // 6. Operating Expenses Breakdown (if any expenses logged today)
  if (dailyExpenses && dailyExpenses.length > 0) {
    // Check page break
    if (currentY > doc.internal.pageSize.getHeight() - 45) {
      doc.addPage();
      currentY = 25;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('DAILY OPERATIONAL EXPENSES & DISBURSEMENTS', 14, currentY);

    currentY += 4.5;

    const expenseHeaders = ['Voucher #', 'Title / Reason', 'Category', 'Paid To / Vendor', 'Payment Method', 'Amount'];
    const expenseRows = dailyExpenses.map((exp) => [
      exp.voucherNumber || '-',
      exp.title,
      (exp.category || 'general').replace('_', ' ').toUpperCase(),
      exp.paidTo || '-',
      (exp.paymentMethod || 'cash').toUpperCase(),
      formatCurrency(exp.amount, currency),
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      head: [expenseHeaders],
      body: expenseRows,
      foot: [[
        'TOTAL EXPENSES',
        '',
        '',
        '',
        '',
        formatCurrency(dailyFinancials.operatingExpensesTotal, currency),
      ]],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 6.8,
        cellPadding: 1.6,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [225, 29, 72], // Rose
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      footStyles: {
        fillColor: [254, 242, 242], // Rose-50
        textColor: [159, 18, 57],
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        4: { halign: 'center' },
        5: { halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 7. Formal Dual Sign-Off Block
  drawSignOffBlock(doc, currentY, staffName);

  // 8. Footers across all pages
  drawDocumentFooter(doc, settings, 'Daily Gross Profit & P&L Statement');

  // Save Document
  const cleanDate = selectedDate.replace(/[^0-9-]/g, '');
  doc.save(`Daily_Gross_Profit_Audit_${cleanDate}.pdf`);
}

/**
 * 2. OFFICIAL STATEMENT OF PROFIT AND LOSS (P&L) (Portrait A4)
 */
export function exportDailyProfitStatementPdf(data: DailyProfitPdfData) {
  const { selectedDate, displayFormattedDate, dailyFinancials, dailyExpenses, settings, staffName } = data;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = settings.currencySymbol || 'Ks';

  // 1. Executive Header
  drawDocumentHeader(
    doc,
    settings,
    `DAILY STATEMENT OF PROFIT AND LOSS`,
    `Reporting Date: ${displayFormattedDate} (${selectedDate}) • Prepared for Store Administration`,
    'OFFICIAL P&L STATEMENT',
    [79, 70, 229] // Indigo
  );

  let currentY = 46;

  // Summary Statement Table
  const statementRows: Array<{ label: string; amount: string; isBold?: boolean; isHeader?: boolean; isIndent?: boolean; isPositive?: boolean; isNegative?: boolean }> = [
    // 1. Revenue
    { label: '1. OPERATING SALES REVENUE', amount: '', isHeader: true },
    { label: 'Gross POS Counter Sales (Completed Invoices)', amount: formatCurrency(dailyFinancials.grossRevenue, currency), isIndent: true },
    ...(dailyFinancials.totalDiscountsGiven > 0 ? [
      { label: 'Less: Promotional & Member Discounts Given', amount: `(${formatCurrency(dailyFinancials.totalDiscountsGiven, currency)})`, isIndent: true, isNegative: true }
    ] : []),
    ...(dailyFinancials.totalRefundsAmount > 0 ? [
      { label: 'Less: Customer Returns & Refunds Issued', amount: `(${formatCurrency(dailyFinancials.totalRefundsAmount, currency)})`, isIndent: true, isNegative: true }
    ] : []),
    { label: 'NET SALES REVENUE', amount: formatCurrency(dailyFinancials.netSalesRevenue, currency), isBold: true },

    // 2. COGS
    { label: '2. COST OF GOODS SOLD (COGS)', amount: '', isHeader: true },
    { label: `Direct Inventory Acquisition Cost (${dailyFinancials.serializedPhoneUnits} phones, ${dailyFinancials.accessoryUnits} accessories)`, amount: `(${formatCurrency(dailyFinancials.totalCogs, currency)})`, isIndent: true, isNegative: true },
    { label: 'TOTAL COST OF GOODS SOLD', amount: `(${formatCurrency(dailyFinancials.totalCogs, currency)})`, isBold: true },

    // 3. Gross Profit
    { label: '3. DAILY GROSS PROFIT', amount: '', isHeader: true },
    { label: `Gross Profit Margin: ${dailyFinancials.overallGrossMargin.toFixed(1)}% | Markup: ${dailyFinancials.overallMarkupPercent.toFixed(1)}%`, amount: formatCurrency(dailyFinancials.grossProfit, currency), isBold: true, isPositive: true },

    // 4. Operating Expenses
    { label: '4. OPERATING EXPENSES & DISBURSEMENTS', amount: '', isHeader: true },
    ...(dailyExpenses.length === 0 ? [
      { label: 'No operating expenses logged for this settlement period', amount: '0 ' + currency, isIndent: true }
    ] : dailyExpenses.map(e => ({
      label: `${e.title} (${e.voucherNumber || 'Voucher'})`,
      amount: `(${formatCurrency(e.amount, currency)})`,
      isIndent: true,
      isNegative: true,
    }))),
    { label: 'TOTAL OPERATIONAL DISBURSEMENTS', amount: `(${formatCurrency(dailyFinancials.operatingExpensesTotal, currency)})`, isBold: true },

    // 5. Net Operating Profit
    { label: '5. NET DAILY OPERATING PROFIT', amount: '', isHeader: true },
    { label: `Net Profit Margin: ${dailyFinancials.netProfitMargin.toFixed(1)}% of Gross Sales`, amount: formatCurrency(dailyFinancials.netOperatingProfit, currency), isBold: true, isPositive: dailyFinancials.netOperatingProfit >= 0, isNegative: dailyFinancials.netOperatingProfit < 0 },
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['Financial Statement Line Item', 'Amount']],
    body: statementRows.map(r => [
      r.isHeader ? r.label.toUpperCase() : r.isIndent ? `    ${r.label}` : r.label,
      r.amount,
    ]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 55, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const item = statementRows[hookData.row.index];
        if (item) {
          if (item.isHeader) {
            hookData.cell.styles.fillColor = [241, 245, 249];
            hookData.cell.styles.textColor = [15, 23, 42];
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.fontSize = 8.5;
          } else if (item.isBold) {
            hookData.cell.styles.fontStyle = 'bold';
            if (item.isPositive) {
              hookData.cell.styles.textColor = [5, 150, 105];
            } else if (item.isNegative) {
              hookData.cell.styles.textColor = [225, 29, 72];
            }
          } else if (item.isNegative) {
            hookData.cell.styles.textColor = [185, 28, 28];
          }
        }
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Cash vs Digital Reconciliation Summary
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('CASH DRAWER VS DIGITAL WALLET RECONCILIATION', 18, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`• Physical Cash in Register: ${formatCurrency(dailyFinancials.cashRevenue, currency)} (${formatCurrency(dailyFinancials.cashProfit, currency)} profit)`, 18, currentY + 10);
  doc.text(`• Digital Wallets / Bank Transfers: ${formatCurrency(dailyFinancials.digitalRevenue, currency)} (${formatCurrency(dailyFinancials.digitalProfit, currency)} profit)`, 18, currentY + 14);

  currentY += 22;

  // Sign-off
  drawSignOffBlock(doc, currentY, staffName);

  // Footer
  drawDocumentFooter(doc, settings, 'Daily Statement of Profit & Loss');

  const cleanDate = selectedDate.replace(/[^0-9-]/g, '');
  doc.save(`Daily_P&L_Statement_${cleanDate}.pdf`);
}

/**
 * 3. FILTERED SALES TRANSACTIONS LEDGER (Landscape A4)
 */
export function exportDailyProfitLedgerPdf(data: DailyProfitPdfData) {
  const { selectedDate, displayFormattedDate, dailyFinancials, settings, staffName, activeFilterSummary, filteredInvoices } = data;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const currency = settings.currencySymbol || 'Ks';
  const invoicesToRender = filteredInvoices || dailyFinancials.invoiceRows;

  drawDocumentHeader(
    doc,
    settings,
    `DAILY SALES TRANSACTIONS PROFIT LEDGER`,
    `Date: ${displayFormattedDate} (${selectedDate}) • Showing ${invoicesToRender.length} Transactions ${activeFilterSummary ? `• Filters: ${activeFilterSummary}` : ''}`,
    'TRANSACTION AUDIT',
    [59, 130, 246] // Blue
  );

  let currentY = 44;

  const invoiceHeaders = [
    'Invoice #',
    'Time',
    'Customer Name',
    'Phone',
    'Cashier',
    'Payment Channel',
    'Items Sold',
    'Gross Revenue',
    'COGS',
    'Gross Profit',
    'Margin %',
  ];

  let totalRev = 0;
  let totalCost = 0;
  let totalProf = 0;
  let totalItemsCount = 0;

  const invoiceRows = invoicesToRender.map(({ sale, saleRevenue, saleCogs, saleProfit, saleMargin }) => {
    totalRev += saleRevenue;
    totalCost += saleCogs;
    totalProf += saleProfit;
    const itemsCount = sale.items.reduce((acc, i) => acc + i.quantity, 0);
    totalItemsCount += itemsCount;

    const saleTime = sale.date.includes('T') ? sale.date.split('T')[1]?.slice(0, 5) : '-';
    const payInfo = getPaymentMethodInfo(sale.paymentMethod);
    const itemsText = sale.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');

    return [
      sale.invoiceNumber,
      saleTime,
      sale.customerName || 'Walk-in',
      sale.customerPhone || '-',
      sale.soldBy || '-',
      payInfo.label,
      itemsText.length > 32 ? `${itemsText.slice(0, 30)}...` : itemsText,
      formatCurrency(saleRevenue, currency),
      formatCurrency(saleCogs, currency),
      formatCurrency(saleProfit, currency),
      `${saleMargin.toFixed(1)}%`,
    ];
  });

  const overallMargin = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [invoiceHeaders],
    body: invoiceRows,
    foot: [[
      'TOTALS',
      '',
      `${invoicesToRender.length} Invoices`,
      '',
      '',
      '',
      `${totalItemsCount} Units`,
      formatCurrency(totalRev, currency),
      formatCurrency(totalCost, currency),
      formatCurrency(totalProf, currency),
      `${overallMargin.toFixed(1)}%`,
    ]],
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      5: { halign: 'center' },
      6: { cellWidth: 50 },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
      10: { halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Sign-off
  drawSignOffBlock(doc, currentY, staffName);

  // Footers
  drawDocumentFooter(doc, settings, 'Daily Sales Transactions Profit Ledger');

  const cleanDate = selectedDate.replace(/[^0-9-]/g, '');
  doc.save(`Daily_Sales_Profit_Ledger_${cleanDate}.pdf`);
}
