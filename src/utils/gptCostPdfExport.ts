import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ShopSettings } from '../types';
import { formatDateTime } from './formatters';

export function exportGptCostComparisonPdf(settings?: Partial<ShopSettings>) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'Point of Sale & Inventory Management';
  const staffName = settings?.currentStaffName || 'Store Manager';

  let currentY = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Indigo Accent
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 24, pageWidth, 1.5, 'F');

  // Title in Banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${shopName.toUpperCase()} — AI ARCHITECTURE & AUDIT`, 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(shopTagline, 14, 17);

  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth - 14, 11, { align: 'right' });
  doc.text(`Audited by: ${staffName}`, pageWidth - 14, 17, { align: 'right' });

  currentY = 32;

  // Main Document Header
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GPT-5 / GPT-5.6 vs GPT-4 Cost & Performance Estimate', 14, currentY);

  doc.setFontSize(9);
  doc.setTextColor(79, 70, 229);
  doc.text('EXECUTIVE DOSSIER', pageWidth - 14, currentY, { align: 'right' });

  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Official cost projection, token pricing breakdown, and store monthly budget comparison.', 14, currentY);

  currentY += 8;

  // Executive Metric Highlight Cards
  const metrics = [
    { label: 'RECOMMENDED MODEL', value: 'GPT-5.6 Luna', sub: 'Hyper-fast & low cost' },
    { label: 'EST. MONTHLY OPEX', value: '$0.22 - $0.35', sub: 'For ~2,000 monthly calls' },
    { label: 'COST VS GPT-4o-MINI', value: '0.8x - 1.0x', sub: 'Cheaper or on par' },
    { label: 'REASONING TIER', value: 'o3-mini / Terra', sub: 'For deep audits' },
  ];

  const cols = 4;
  const cardWidth = (pageWidth - 28 - (cols - 1) * 3) / cols;
  const cardHeight = 16;

  metrics.forEach((m, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    const y = currentY;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, x + 2.5, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(m.value, x + 2.5, y + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(79, 70, 229);
    doc.text(m.sub, x + 2.5, y + 13.5);
  });

  currentY += cardHeight + 8;

  // Table 1: Per-Token Pricing Comparison
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Official Per-Token Pricing Comparison (Per 1 Million Tokens)', 14, currentY);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    head: [['Model Family', 'Model Identifier', 'Input / 1M Tokens', 'Output / 1M Tokens', 'Ratio vs. Baseline']],
    body: [
      ['GPT-5.6 High-Speed', 'gpt-5.6-luna (Recommended)', '$0.10 - $0.15', '$0.40 - $0.60', '0.8x - 1.0x (Cheapest)'],
      ['GPT-4 High-Speed', 'gpt-4o-mini', '$0.15', '$0.60', '1.0x (Baseline)'],
      ['GPT-5.6 Balanced', 'gpt-5.6-terra', '$0.80 - $1.20', '$3.00 - $4.50', '~5x - 8x'],
      ['Deep Reasoning (O-Series)', 'o3-mini', '$1.10', '$4.40', '~7x'],
      ['GPT-5.6 Frontier', 'gpt-5.6-sol / gpt-5.6', '$2.50 - $3.50', '$10.00 - $14.00', '~16x - 23x'],
      ['GPT-4 Flagship Omni', 'gpt-4o', '$2.50', '$10.00', '~16x'],
      ['GPT-5 Foundational', 'gpt-5', '$3.00 - $5.00', '$12.00 - $18.00', '~20x - 30x'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { fontStyle: 'bold', textColor: [79, 70, 229], cellWidth: 48 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 32 },
      4: { halign: 'center', cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Table 2: Realistic Monthly Store Usage Profile
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Estimated Monthly Store Operating Expenses (1,000 - 3,000 Operations)', 14, currentY);

  currentY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Calculated based on ~1,500 Telegram bot queries + ~500 POS Copilot actions (~1.25M Input / ~250k Output tokens).', 14, currentY);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    head: [['Model Identifier', 'Est. Monthly Cost', 'Operational Role & Best Use Case']],
    body: [
      ['gpt-5.6-luna (Top Pick)', '~$0.22 - $0.35 / mo', 'Default POS tool actions, instant Telegram alerts, stock checks, customer sales.'],
      ['gpt-4o-mini (Legacy)', '~$0.34 / mo', 'Legacy fast engine; similar cost to Luna with previous-gen intelligence.'],
      ['gpt-5.6-terra', '~$1.75 - $2.60 / mo', 'Balanced workhorse for complex customer queries & supplier purchase recommendations.'],
      ['o3-mini', '~$2.48 / mo', 'Auditing daily financial profit statements, multi-step ledger reconciliations.'],
      ['gpt-5.6-sol / gpt-5.6', '~$5.60 - $8.00 / mo', 'Annual profit forecasting, multi-factor business strategy, executive review.'],
      ['gpt-5 Flagship', '~$6.75 - $10.50 / mo', 'Comprehensive foundational multi-step reasoning & marketing strategy.'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [79, 70, 229], cellWidth: 45 },
      1: { fontStyle: 'bold', textColor: [16, 185, 129], halign: 'right', cellWidth: 38 },
      2: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Key Strategic Recommendations Box
  if (currentY + 35 > pageHeight - 15) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(238, 242, 255); // indigo-50
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.roundedRect(14, currentY, pageWidth - 28, 30, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(67, 56, 202); // indigo-700
  doc.text('STORE STRATEGY RECOMMENDATIONS', 18, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('1. Default Standard: Keep gpt-5.6-luna selected as the active model for daily POS Copilot and Telegram bot.', 18, currentY + 12);
  doc.text('   At less than $0.35/month, it provides modern GPT-5.6 accuracy with virtually negligible cost.', 18, currentY + 16);
  doc.text('2. Dynamic Switcher: Use the in-chat model switcher or Telegram /model command to temporarily invoke', 18, currentY + 21);
  doc.text('   gpt-5.6-terra, o3-mini, or gpt-5.6 whenever doing complex annual auditing or ad campaigns.', 18, currentY + 25);

  // Footer
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Golden Star Mobile POS • Confidential Strategic Cost Audit • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const filename = `GPT5_vs_GPT4_Cost_Estimate_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
