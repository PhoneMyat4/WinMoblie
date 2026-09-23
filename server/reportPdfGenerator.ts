import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PosDataContext } from './aiAssistant';
import type { ShopSettings } from '../src/types';

export interface GeneratePdfResult {
  buffer: Buffer;
  filename: string;
  reportName: string;
}

function formatNumber(num: number): string {
  return (num || 0).toLocaleString('en-US');
}

function formatCurrency(amount: number, currency = 'Ks'): string {
  return `${formatNumber(Math.round(amount))} ${currency}`;
}

/**
 * Draws the professional executive header onto the jsPDF document.
 */
function drawHeader(
  doc: jsPDF,
  settings: ShopSettings | undefined,
  title: string,
  subtitle: string,
  badgeText: string,
  badgeColor: [number, number, number] = [79, 70, 229]
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const shopName = settings?.shopName || 'Win Mobile & Gadgets';
  const shopTagline = settings?.tagline || 'Point of Sale & Inventory Management ERP';
  const phone = settings?.phone || '';

  // Top Dark Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Colored Stripe
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.rect(0, 24, pageWidth, 2, 'F');

  // Brand Name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(shopName.toUpperCase(), 14, 10);

  // Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(shopTagline, 14, 16);

  // Right-aligned contact & date
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  if (phone) {
    doc.text(`Tel: ${phone}`, pageWidth - 14, 10, { align: 'right' });
  }
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  doc.text(`Generated: ${nowStr}`, pageWidth - 14, 16, { align: 'right' });

  // Document Title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 34);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 40);

  // Badge pill on the right
  const badgeWidth = doc.getTextWidth(badgeText) + 8;
  const badgeX = pageWidth - 14 - badgeWidth;
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.roundedRect(badgeX, 30, badgeWidth, 6.5, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(badgeText, badgeX + 4, 34.5);
}

/**
 * Draws running footer and page numbers
 */
function drawFooter(doc: jsPDF, settings: ShopSettings | undefined, docTitle: string) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shopName = settings?.shopName || 'Win Mobile & Gadgets';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${shopName} • ${docTitle} • Confidential Internal Record`, 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
}

/**
 * Generates Daily Statement of Profit & Loss PDF Buffer
 */
export function generateDailyProfitStatementPdf(reportResult: any): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { data, reportName = 'Daily Statement of Profit and Loss' } = reportResult;
  const selectedDate = data?.selectedDate || new Date().toISOString().slice(0, 10);
  const displayFormattedDate = data?.displayFormattedDate || selectedDate;
  const financials = data?.dailyFinancials || {};
  const expenses: any[] = data?.dailyExpenses || [];
  const settings = data?.settings;
  const currency = settings?.currencySymbol || 'Ks';
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(
    doc,
    settings,
    'DAILY STATEMENT OF PROFIT & LOSS',
    `Settlement Date: ${displayFormattedDate} (${selectedDate}) • Store Management Report`,
    'OFFICIAL P&L AUDIT',
    [16, 185, 129] // Emerald
  );

  let currentY = 46;

  // 4 Top KPI Stat Cards
  const cardWidth = (pageWidth - 28 - 9) / 4;
  const kpis = [
    { label: 'GROSS REVENUE', value: formatCurrency(financials.grossRevenue || 0, currency), color: [16, 185, 129] },
    { label: 'COGS (STOCK COST)', value: formatCurrency(financials.totalCogs || 0, currency), color: [239, 68, 68] },
    { label: 'GROSS PROFIT', value: formatCurrency(financials.grossProfit || 0, currency), color: [59, 130, 246] },
    { label: 'NET PROFIT', value: formatCurrency(financials.netOperatingProfit || 0, currency), color: [147, 51, 234] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardWidth, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, currentY + 4.5);

    doc.setFontSize(9);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, currentY + 10.5);
  });

  currentY += 18;

  // Statement Line Items Table
  const statementRows: Array<[string, string]> = [
    ['1. OPERATING SALES REVENUE', ''],
    ['    Gross POS Counter Sales (Completed Invoices)', formatCurrency(financials.grossRevenue || 0, currency)],
    ['    Less: Promotional & Store Discounts Given', `(${formatCurrency(financials.totalDiscountsGiven || 0, currency)})`],
    ['    Less: Customer Refunds & Returns', `(${formatCurrency(financials.totalRefundsAmount || 0, currency)})`],
    ['    NET SALES REVENUE', formatCurrency(financials.netSalesRevenue || 0, currency)],
    ['2. COST OF GOODS SOLD (COGS)', ''],
    [`    Direct Inventory Acquisition Cost (${financials.serializedPhoneUnits || 0} phones, ${financials.accessoryUnits || 0} accessories)`, `(${formatCurrency(financials.totalCogs || 0, currency)})`],
    ['    TOTAL COST OF GOODS SOLD', `(${formatCurrency(financials.totalCogs || 0, currency)})`],
    ['3. DAILY GROSS PROFIT', ''],
    [`    Gross Margin: ${(financials.overallGrossMargin || 0).toFixed(1)}% | Markup: ${(financials.overallMarkupPercent || 0).toFixed(1)}%`, formatCurrency(financials.grossProfit || 0, currency)],
    ['4. OPERATING EXPENSES & DISBURSEMENTS', ''],
  ];

  if (expenses.length === 0) {
    statementRows.push(['    No operating expenses logged for this settlement period', `0 ${currency}`]);
  } else {
    expenses.forEach((e) => {
      statementRows.push([`    ${e.title || 'Expense'} (${e.voucherNumber || 'Voucher'})`, `(${formatCurrency(e.amount || 0, currency)})`]);
    });
  }

  statementRows.push([
    '    TOTAL OPERATIONAL DISBURSEMENTS',
    `(${formatCurrency(financials.operatingExpensesTotal || 0, currency)})`,
  ]);

  statementRows.push([
    '5. NET DAILY OPERATING PROFIT',
    formatCurrency(financials.netOperatingProfit || 0, currency),
  ]);

  const applyAutoTable = (autoTable as any).default || autoTable;
  applyAutoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['Financial Statement Line Item', 'Amount']],
    body: statementRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 125 },
      1: { cellWidth: 57, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (hookData: any) => {
      const rawText = String(hookData.cell.raw || '');
      if (
        rawText.startsWith('1.') ||
        rawText.startsWith('2.') ||
        rawText.startsWith('3.') ||
        rawText.startsWith('4.') ||
        rawText.startsWith('5.')
      ) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [241, 245, 249];
        hookData.cell.styles.textColor = [15, 23, 42];
      }
      if (rawText.includes('NET DAILY OPERATING PROFIT')) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [220, 252, 231]; // light green
        hookData.cell.styles.textColor = [22, 101, 52];
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Category Breakdown Table if available
  const categoryRows = financials.categoryRows || [];
  if (categoryRows.length > 0 && currentY < 230) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('CATEGORY PERFORMANCE BREAKDOWN', 14, currentY);
    currentY += 3;

    applyAutoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      head: [['Category', 'Units', 'Revenue', 'Stock Cost', 'Gross Profit', 'Margin %']],
      body: categoryRows.map((c: any) => [
        c.name || 'General',
        c.units || 0,
        formatCurrency(c.revenue || 0, currency),
        formatCurrency(c.cogs || 0, currency),
        formatCurrency(c.profit || 0, currency),
        `${(c.margin || 0).toFixed(1)}%`,
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 1.8,
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 17, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Sign-off verification block
  if (currentY > 240) {
    doc.addPage();
    currentY = 30;
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(14, currentY + 12, 70, currentY + 12);
  doc.line(pageWidth - 70, currentY + 12, pageWidth - 14, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Prepared By (Aura Copilot / Cashier)', 14, currentY + 16);
  doc.text('Store Owner / Executive Sign-off', pageWidth - 70, currentY + 16);

  drawFooter(doc, settings, reportName);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Generates Annual Profit Statement PDF Buffer
 */
export function generateAnnualProfitStatementPdf(reportResult: any): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { data, reportName = 'Annual Statement of Profit and Loss' } = reportResult;
  const selectedYear = data?.selectedYear || new Date().getFullYear();
  const summary = data?.annualSummary || {};
  const months: any[] = data?.months || [];
  const settings = data?.settings;
  const currency = settings?.currencySymbol || 'Ks';
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(
    doc,
    settings,
    `ANNUAL STATEMENT OF PROFIT & LOSS (${selectedYear})`,
    `Fiscal Year Performance & Multi-Month Audit • Store Management Report`,
    'ANNUAL AUDIT',
    [79, 70, 229] // Indigo
  );

  let currentY = 46;

  // 4 Top KPI Stat Cards
  const cardWidth = (pageWidth - 28 - 9) / 4;
  const kpis = [
    { label: 'ANNUAL REVENUE', value: formatCurrency(summary.grossSalesRevenue || 0, currency), color: [16, 185, 129] },
    { label: 'TOTAL COGS', value: formatCurrency(summary.totalCogs || 0, currency), color: [239, 68, 68] },
    { label: 'GROSS PROFIT', value: formatCurrency(summary.grossProfit || 0, currency), color: [59, 130, 246] },
    { label: 'NET PROFIT', value: formatCurrency(summary.netOperatingProfit || 0, currency), color: [147, 51, 234] },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, currentY, cardWidth, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, currentY + 4.5);

    doc.setFontSize(9);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, currentY + 10.5);
  });

  currentY += 18;

  // Monthly breakdown table
  const applyAutoTable = (autoTable as any).default || autoTable;
  applyAutoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['Month', 'Orders', 'Units', 'Revenue', 'Stock Cost', 'Gross Profit', 'Expenses', 'Net Profit']],
    body: months.map((m: any) => [
      m.monthName || '',
      m.ordersCount || 0,
      m.unitsSold || 0,
      formatCurrency(m.grossRevenue || 0, currency),
      formatCurrency(m.cogs || 0, currency),
      formatCurrency(m.grossProfit || 0, currency),
      formatCurrency(m.operatingExpenses || 0, currency),
      formatCurrency(m.netOperatingProfit || 0, currency),
    ]),
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
      7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
  });

  drawFooter(doc, settings, reportName);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Generates Tabular POS Audit Report (Z-Report, Stock Aging, Dead Stock, etc.)
 */
export function generateGenericAuditPdf(reportResult: any): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const opt = reportResult.exportPdfOptions || {};
  const settings = reportResult.data?.settings;
  const title = opt.title || reportResult.reportName || 'POS AUDIT REPORT';
  const subtitle = opt.subtitle || `Generated: ${new Date().toISOString().slice(0, 10)}`;

  drawHeader(doc, settings, title, subtitle, 'OFFICIAL AUDIT', [59, 130, 246]);

  let currentY = 46;

  if (opt.summaryMetrics && Array.isArray(opt.summaryMetrics) && opt.summaryMetrics.length > 0) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const count = opt.summaryMetrics.length;
    const cardWidth = Math.min(42, (pageWidth - 28 - (count - 1) * 3) / count);

    opt.summaryMetrics.forEach((m: any, idx: number) => {
      const x = 14 + idx * (cardWidth + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, currentY, cardWidth, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(String(m.label || '').toUpperCase(), x + 3, currentY + 4.5);

      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(String(m.value || ''), x + 3, currentY + 10.5);
    });

    currentY += 18;
  }

  if (opt.headers && opt.rows && Array.isArray(opt.rows)) {
    autoTable(doc, {
      startY: currentY,
      head: [opt.headers],
      body: opt.rows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        font: 'helvetica',
      },
      margin: { left: 14, right: 14 },
    });
  }

  drawFooter(doc, settings, title);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Main dispatcher to render any report into a PDF Buffer
 */
export function generateServerReportPdf(reportResult: any): GeneratePdfResult {
  const reportType = reportResult.reportType || 'daily_profit_statement';
  const rawDate =
    reportResult.date ||
    reportResult.data?.selectedDate ||
    reportResult.data?.selectedYear ||
    new Date().toISOString().slice(0, 10);
  const cleanDate = String(rawDate).replace(/[^0-9-]/g, '');
  const reportName = reportResult.reportName || 'POS Financial Report';
  const filename = `${reportType}_${cleanDate}.pdf`;

  let buffer: Buffer;
  if (reportResult.exportPdfOptions) {
    buffer = generateGenericAuditPdf(reportResult);
  } else if (reportType.startsWith('annual_')) {
    buffer = generateAnnualProfitStatementPdf(reportResult);
  } else {
    buffer = generateDailyProfitStatementPdf(reportResult);
  }

  return {
    buffer,
    filename,
    reportName,
  };
}
