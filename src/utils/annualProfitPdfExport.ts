import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, ExpenseRecord, ShopSettings } from '../types';
import { formatCurrency, formatDateTime } from './formatters';
import { drawDossierFooter, drawDocumentHeader } from './pdfLayoutStyles';

export interface MonthlyFinancialSummary {
  monthIndex: number;
  monthName: string;
  fullName: string;
  monthKey: string;
  ordersCount: number;
  unitsSold: number;
  grossRevenue: number;
  discountsGiven: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  netOperatingProfit: number;
  netMarginPercent: number;
  priorYearRevenue?: number;
  yoyGrowthPercent?: number | null;
}

export interface QuarterlySummary {
  quarter: string;
  name: string;
  months: string;
  grossRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  netOperatingProfit: number;
  netMarginPercent: number;
  ordersCount: number;
}

export interface AnnualCategorySummary {
  category: string;
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
  unitsSold: number;
  profitContributionPercent: number;
}

export interface AnnualTopProduct {
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
}

export interface AnnualExpenseSummary {
  category: string;
  amount: number;
  count: number;
  percentageOfTotal: number;
}

export interface AnnualFinancialData {
  selectedYear: number;
  isCurrentYear: boolean;
  totalCompletedInvoices: number;
  totalRefundedInvoices: number;
  totalUnitsSold: number;
  phoneUnitsSold: number;
  accessoryUnitsSold: number;
  grossSalesRevenue: number;
  totalDiscountsGiven: number;
  totalRefundsAmount: number;
  netSalesRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  totalOperatingExpenses: number;
  netOperatingProfit: number;
  netMarginPercent: number;
  averageOrderValue: number;
  months: MonthlyFinancialSummary[];
  quarters: QuarterlySummary[];
  categories: AnnualCategorySummary[];
  topProducts: AnnualTopProduct[];
  expensesByCategory: AnnualExpenseSummary[];
}

export interface AnnualProfitPdfOptions {
  annualData: AnnualFinancialData;
  settings: ShopSettings;
  staffName?: string;
}

/**
 * Landscape Comprehensive Annual Financial Dossier
 */
export function exportAnnualProfitDossierPdf({
  annualData,
  settings,
  staffName = 'Store Management',
}: AnnualProfitPdfOptions) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm

  // Standardized executive header from shared layout styles
  drawDocumentHeader(
    doc,
    settings,
    `ANNUAL FINANCIAL & P&L DOSSIER - FY ${annualData.selectedYear}`,
    `Audited Financial Period: Jan 01, ${annualData.selectedYear} - Dec 31, ${annualData.selectedYear}`,
    `AUDITED FY ${annualData.selectedYear}`,
    [16, 185, 129]
  );

  let currentY = 46;

  // Executive KPI Summary Cards
  const kpiCards = [
    {
      label: 'Gross Sales Revenue',
      value: formatCurrency(annualData.grossSalesRevenue, settings.currencySymbol),
      sub: `${annualData.totalCompletedInvoices} Completed Orders`,
      color: [79, 70, 229], // indigo-600
    },
    {
      label: 'Cost of Goods Sold (COGS)',
      value: formatCurrency(annualData.totalCogs, settings.currencySymbol),
      sub: `${annualData.totalUnitsSold} Units Sold`,
      color: [71, 85, 105], // slate-600
    },
    {
      label: 'Annual Gross Profit',
      value: formatCurrency(annualData.grossProfit, settings.currencySymbol),
      sub: `Gross Margin: ${annualData.grossMarginPercent.toFixed(1)}%`,
      color: [16, 185, 129], // emerald-600
    },
    {
      label: 'Operating Expenses',
      value: formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol),
      sub: `${annualData.expensesByCategory.length} Cost Categories`,
      color: [225, 29, 72], // rose-600
    },
    {
      label: 'Net Operating Profit',
      value: formatCurrency(annualData.netOperatingProfit, settings.currencySymbol),
      sub: `Net Margin: ${annualData.netMarginPercent.toFixed(1)}%`,
      color: annualData.netOperatingProfit >= 0 ? [5, 150, 105] : [220, 38, 38],
    },
  ];

  const cardCols = 5;
  const cardGap = 3;
  const cardWidth = (pageWidth - 28 - (cardCols - 1) * cardGap) / cardCols;
  const cardHeight = 16;

  kpiCards.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + cardGap);
    const y = currentY;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    // Left accent vertical bar
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, y, 1.8, cardHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label.toUpperCase(), x + 3.5, y + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + 3.5, y + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.sub, x + 3.5, y + 13.5);
  });

  currentY += cardHeight + 5;

  // Section: 12-Month Financial Performance Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`12-MONTH FINANCIAL PERFORMANCE SCHEDULE (JANUARY - DECEMBER ${annualData.selectedYear})`, 14, currentY);
  currentY += 2;

  const monthRows = annualData.months.map((m) => [
    m.fullName,
    m.ordersCount.toLocaleString(),
    m.unitsSold.toLocaleString(),
    formatCurrency(m.grossRevenue, settings.currencySymbol),
    formatCurrency(m.cogs, settings.currencySymbol),
    formatCurrency(m.grossProfit, settings.currencySymbol),
    `${m.grossMarginPercent.toFixed(1)}%`,
    formatCurrency(m.operatingExpenses, settings.currencySymbol),
    formatCurrency(m.netOperatingProfit, settings.currencySymbol),
    `${m.netMarginPercent.toFixed(1)}%`,
  ]);

  // Totals Row
  monthRows.push([
    `FULL YEAR ${annualData.selectedYear} TOTAL`,
    annualData.totalCompletedInvoices.toLocaleString(),
    annualData.totalUnitsSold.toLocaleString(),
    formatCurrency(annualData.grossSalesRevenue, settings.currencySymbol),
    formatCurrency(annualData.totalCogs, settings.currencySymbol),
    formatCurrency(annualData.grossProfit, settings.currencySymbol),
    `${annualData.grossMarginPercent.toFixed(1)}%`,
    formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol),
    formatCurrency(annualData.netOperatingProfit, settings.currencySymbol),
    `${annualData.netMarginPercent.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [[
      'Month',
      'Invoices',
      'Units',
      'Gross Sales',
      'COGS Basis',
      'Gross Profit',
      'Gross Margin',
      'Op. Expenses',
      'Net Op. Profit',
      'Net Margin',
    ]],
    body: monthRows,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 16 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105], cellWidth: 28 },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
      7: { halign: 'right', textColor: [225, 29, 72], cellWidth: 28 },
      8: { halign: 'right', fontStyle: 'bold', textColor: annualData.netOperatingProfit >= 0 ? [5, 150, 105] : [220, 38, 38], cellWidth: 28 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 21 },
    },
    didParseCell: (data) => {
      // Highlight the totals row
      if (data.row.index === monthRows.length - 1) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Quarterly Summary Table & Top Categories Side-by-Side
  if (currentY + 45 > pageHeight) {
    doc.addPage();
    currentY = 20;
  }

  const splitWidth = (pageWidth - 32) / 2;

  // Left Column: Quarterly Performance
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('QUARTERLY PERFORMANCE BREAKDOWN', 14, currentY);

  const quarterRows = annualData.quarters.map((q) => [
    q.quarter,
    q.months,
    formatCurrency(q.grossRevenue, settings.currencySymbol),
    formatCurrency(q.grossProfit, settings.currencySymbol),
    `${q.grossMarginPercent.toFixed(1)}%`,
    formatCurrency(q.netOperatingProfit, settings.currencySymbol),
  ]);

  autoTable(doc, {
    startY: currentY + 2,
    head: [['Quarter', 'Months', 'Revenue', 'Gross Profit', 'Margin', 'Net Profit']],
    body: quarterRows,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 18 },
      1: { cellWidth: 24 },
      2: { halign: 'right', cellWidth: 24 },
      3: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', fontStyle: 'bold', textColor: [30, 41, 59], cellWidth: 24 },
    },
    margin: { left: 14, right: pageWidth - 14 - splitWidth },
  });

  const quarterFinalY = (doc as any).lastAutoTable.finalY;

  // Right Column: Department / Category Profitability
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('ANNUAL CATEGORY PROFIT CONTRIBUTION', 14 + splitWidth + 4, currentY);

  const categoryRows = annualData.categories.slice(0, 6).map((c) => [
    c.category,
    c.unitsSold.toLocaleString(),
    formatCurrency(c.revenue, settings.currencySymbol),
    formatCurrency(c.profit, settings.currencySymbol),
    `${c.marginPercent.toFixed(1)}%`,
    `${c.profitContributionPercent.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: currentY + 2,
    head: [['Category', 'Units', 'Revenue', 'Gross Profit', 'Margin', 'Share']],
    body: categoryRows,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { halign: 'right', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 24 },
      3: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 18 },
    },
    margin: { left: 14 + splitWidth + 4, right: 14 },
  });

  const catFinalY = (doc as any).lastAutoTable.finalY;
  currentY = Math.max(quarterFinalY, catFinalY) + 6;

  // Dual Audit Sign-off Box
  if (currentY + 25 > pageHeight) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 20, 1.5, 1.5, 'FD');

  const sigColW = (pageWidth - 28) / 3;

  // Col 1: Prepared By
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('PREPARED BY (ACCOUNTING / STAFF):', 18, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(staffName, 18, currentY + 10);
  doc.line(18, currentY + 15, 18 + sigColW - 12, currentY + 15);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Signature & Date', 18, currentY + 18);

  // Col 2: Verified By
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('CERTIFIED BY (STORE OWNER / GM):', 18 + sigColW, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(settings.shopName || 'General Management', 18 + sigColW, currentY + 10);
  doc.line(18 + sigColW, currentY + 15, 18 + 2 * sigColW - 12, currentY + 15);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Authorized Signature & Corporate Seal', 18 + sigColW, currentY + 18);

  // Col 3: System Certification
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('AUDIT CERTIFICATION:', 18 + 2 * sigColW, currentY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'This statement has been compiled directly from Point of Sale ledger records, validated against IMEI item cost bases and operational disbursement vouchers.',
    18 + 2 * sigColW,
    currentY + 9,
    { maxWidth: sigColW - 8 }
  );

  // Footer on all pages
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Official Annual Financial Dossier • ${settings.shopName || 'Mobile Store'} • Fiscal Year ${annualData.selectedYear} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 4,
      { align: 'center' }
    );
  }

  doc.save(`annual_profit_dossier_${annualData.selectedYear}.pdf`);
}

/**
 * Portrait Official Annual Statement of Profit & Loss (GAAP Standard)
 */
export function exportAnnualProfitStatementPdf({
  annualData,
  settings,
  staffName = 'Management',
}: AnnualProfitPdfOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

  // Top Dark Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setFillColor(16, 185, 129); // emerald accent
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text((settings.shopName || 'MOBILE STORE').toUpperCase(), 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    [settings.address || 'Commercial Operations', settings.phone ? `Phone: ${settings.phone}` : ''].filter(Boolean).join(' | '),
    14,
    18
  );

  // Right Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(52, 211, 153);
  doc.text('STATEMENT OF PROFIT AND LOSS', pageWidth - 14, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(203, 213, 225);
  doc.text(`For the Fiscal Year Ended December 31, ${annualData.selectedYear}`, pageWidth - 14, 18, { align: 'right' });
  doc.text(`Currency: ${settings.currencySymbol || 'MMK'} | Basis: Realized COGS`, pageWidth - 14, 23, { align: 'right' });

  let currentY = 36;

  // Title description
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('ANNUAL AUDITED INCOME STATEMENT', 14, currentY);
  currentY += 4;

  const statementRows: Array<{
    item: string;
    note?: string;
    subamount?: string;
    total: string;
    bold?: boolean;
    isHeader?: boolean;
    highlight?: 'green' | 'red' | 'blue';
  }> = [
    // 1. REVENUE
    { item: '1. TRADING & SALES REVENUE', isHeader: true, total: '' },
    {
      item: '  Gross Point of Sale Sales Revenue',
      note: `${annualData.totalCompletedInvoices.toLocaleString()} Invoices`,
      subamount: formatCurrency(annualData.grossSalesRevenue, settings.currencySymbol),
      total: '',
    },
    {
      item: '  Less: Customer Price Discounts Granted',
      note: 'Trade concessions',
      subamount: `(${formatCurrency(annualData.totalDiscountsGiven, settings.currencySymbol)})`,
      total: '',
    },
    {
      item: '  Less: Sales Returns & Customer Refunds',
      note: `${annualData.totalRefundedInvoices} Returns`,
      subamount: `(${formatCurrency(annualData.totalRefundsAmount, settings.currencySymbol)})`,
      total: '',
    },
    {
      item: 'NET OPERATING SALES REVENUE',
      bold: true,
      subamount: '',
      total: formatCurrency(annualData.netSalesRevenue, settings.currencySymbol),
      highlight: 'blue',
    },

    // 2. COGS
    { item: '2. COST OF GOODS SOLD (COGS)', isHeader: true, total: '' },
    {
      item: '  Direct Device Acquisition & Inventory Cost Basis',
      note: `${annualData.totalUnitsSold.toLocaleString()} Units Sold`,
      subamount: formatCurrency(annualData.totalCogs, settings.currencySymbol),
      total: '',
    },
    {
      item: 'TOTAL COST OF SALES (COGS)',
      bold: true,
      subamount: '',
      total: `(${formatCurrency(annualData.totalCogs, settings.currencySymbol)})`,
    },

    // 3. GROSS PROFIT
    {
      item: 'GROSS OPERATING PROFIT',
      bold: true,
      note: `Gross Margin: ${annualData.grossMarginPercent.toFixed(2)}%`,
      subamount: '',
      total: formatCurrency(annualData.grossProfit, settings.currencySymbol),
      highlight: 'green',
    },

    // 4. OPERATING EXPENSES
    { item: '3. OPERATING OVERHEAD & SHOP EXPENSES', isHeader: true, total: '' },
  ];

  // Populate itemized expenses
  if (annualData.expensesByCategory.length > 0) {
    annualData.expensesByCategory.forEach((exp) => {
      statementRows.push({
        item: `  ${exp.category}`,
        note: `${exp.percentageOfTotal.toFixed(1)}% of overhead (${exp.count} vouchers)`,
        subamount: formatCurrency(exp.amount, settings.currencySymbol),
        total: '',
      });
    });
  } else {
    statementRows.push({
      item: '  General Store Expenses & Utilities',
      subamount: formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol),
      total: '',
    });
  }

  statementRows.push({
    item: 'TOTAL OPERATING OVERHEAD EXPENSES',
    bold: true,
    subamount: '',
    total: `(${formatCurrency(annualData.totalOperatingExpenses, settings.currencySymbol)})`,
    highlight: 'red',
  });

  // 5. NET PROFIT
  statementRows.push({
    item: `NET OPERATING INCOME / PROFIT (FY ${annualData.selectedYear})`,
    bold: true,
    note: `Net Profit Margin: ${annualData.netMarginPercent.toFixed(2)}%`,
    subamount: '',
    total: formatCurrency(annualData.netOperatingProfit, settings.currencySymbol),
    highlight: 'green',
  });

  const tableBody = statementRows.map((r) => [
    r.item,
    r.note || '',
    r.subamount || '',
    r.total || '',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Financial Account Line Item', 'Accounting Notes', 'Sub-Total', 'Net Total']],
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 7.2,
      cellPadding: 2,
      lineColor: [241, 245, 249],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 35, textColor: [100, 116, 139] },
      2: { halign: 'right', cellWidth: 26, fontStyle: 'normal' },
      3: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      const rowMeta = statementRows[data.row.index];
      if (rowMeta) {
        if (rowMeta.isHeader) {
          data.cell.styles.fillColor = [248, 250, 252];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [15, 23, 42];
        }
        if (rowMeta.bold) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
        if (rowMeta.highlight === 'green') {
          data.cell.styles.fillColor = [236, 253, 245]; // emerald-50
          if (data.column.index === 3) {
            data.cell.styles.textColor = [5, 150, 105]; // emerald-600
            data.cell.styles.fontSize = 8.2;
          }
        }
        if (rowMeta.highlight === 'red') {
          if (data.column.index === 3) {
            data.cell.styles.textColor = [225, 29, 72]; // rose-600
          }
        }
        if (rowMeta.highlight === 'blue') {
          if (data.column.index === 3) {
            data.cell.styles.textColor = [79, 70, 229]; // indigo-600
          }
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Monthly Quick Reference Strip
  if (currentY + 50 > pageHeight) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('MONTHLY SUMMARY AUDIT TRAIL', 14, currentY);
  currentY += 2;

  const miniMonthRows = annualData.months.map((m) => [
    m.monthName,
    formatCurrency(m.grossRevenue, settings.currencySymbol),
    formatCurrency(m.cogs, settings.currencySymbol),
    formatCurrency(m.grossProfit, settings.currencySymbol),
    formatCurrency(m.operatingExpenses, settings.currencySymbol),
    formatCurrency(m.netOperatingProfit, settings.currencySymbol),
    `${m.netMarginPercent.toFixed(0)}%`,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Month', 'Revenue', 'COGS', 'Gross Profit', 'Expenses', 'Net Profit', 'Margin']],
    body: miniMonthRows,
    theme: 'grid',
    styles: {
      fontSize: 6.2,
      cellPadding: 1.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 16 },
      1: { halign: 'right', cellWidth: 28 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold', cellWidth: 28 },
      4: { halign: 'right', textColor: [225, 29, 72], cellWidth: 28 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 28 },
      6: { halign: 'right', cellWidth: 16 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Signature Block
  if (currentY + 28 > pageHeight) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 22, 1.5, 1.5, 'FD');

  const halfW = (pageWidth - 28) / 2;

  // Left Sign
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('PREPARED & COMPILED BY:', 18, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(staffName, 18, currentY + 10);
  doc.line(18, currentY + 16, 18 + halfW - 16, currentY + 16);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Auditor / Accounting Officer Signature', 18, currentY + 19);

  // Right Sign
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('APPROVED & RATIFIED BY:', 18 + halfW, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(settings.shopName || 'Managing Director', 18 + halfW, currentY + 10);
  doc.line(18 + halfW, currentY + 16, 18 + 2 * halfW - 16, currentY + 16);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Authorized Business Owner / Stamp', 18 + halfW, currentY + 19);

  // Footer on all pages
  drawDossierFooter(
    doc,
    settings,
    'Statement of Profit & Loss',
    `Fiscal Year ${annualData.selectedYear}`
  );

  doc.save(`annual_profit_statement_${annualData.selectedYear}.pdf`);
}

/**
 * Export 12-Month Performance Ledger as CSV
 */
export function exportAnnualProfitCsv(annualData: AnnualFinancialData, currencySymbol: string = 'MMK') {
  const headers = [
    'Month',
    'Month Code',
    'Orders Count',
    'Units Sold',
    'Gross Revenue',
    'Discounts Given',
    'Net Sales Revenue',
    'Cost of Goods Sold (COGS)',
    'Gross Profit',
    'Gross Margin %',
    'Operating Expenses',
    'Net Operating Profit',
    'Net Margin %',
  ];

  const rows = annualData.months.map((m) => [
    m.fullName,
    m.monthKey,
    m.ordersCount,
    m.unitsSold,
    m.grossRevenue,
    m.discountsGiven,
    m.netRevenue,
    m.cogs,
    m.grossProfit,
    `${m.grossMarginPercent.toFixed(2)}%`,
    m.operatingExpenses,
    m.netOperatingProfit,
    `${m.netMarginPercent.toFixed(2)}%`,
  ]);

  // Append Total Summary Row
  rows.push([
    `TOTAL FY ${annualData.selectedYear}`,
    `${annualData.selectedYear}`,
    annualData.totalCompletedInvoices,
    annualData.totalUnitsSold,
    annualData.grossSalesRevenue,
    annualData.totalDiscountsGiven,
    annualData.netSalesRevenue,
    annualData.totalCogs,
    annualData.grossProfit,
    `${annualData.grossMarginPercent.toFixed(2)}%`,
    annualData.totalOperatingExpenses,
    annualData.netOperatingProfit,
    `${annualData.netMarginPercent.toFixed(2)}%`,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((r) =>
      r
        .map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `annual_profit_performance_${annualData.selectedYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
