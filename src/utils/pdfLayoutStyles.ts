import jsPDF from 'jspdf';
import { ShopSettings } from '../types';
import { formatDateTime } from './formatters';

export interface HeaderBadgeOptions {
  text: string;
  color?: [number, number, number];
}

/**
 * Common PDF layout helper to draw consistent executive headers across reports and contracts
 */
export function drawExecutiveHeader(
  doc: jsPDF,
  settings: ShopSettings,
  docTitle: string,
  docSubtype: string,
  badgeText: string,
  badgeColor: [number, number, number] = [124, 58, 237] // Purple default
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'Point of Sale & Accounts Receivable ERP';
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

  // Document Title & Subtitle
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(docTitle, 14, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(docSubtype, 14, 42);

  // Stage Badge Box
  if (badgeText) {
    const badgeWidth = doc.getTextWidth(badgeText) + 8;
    const badgeX = pageWidth - 14 - badgeWidth;
    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(badgeX, 32, badgeWidth, 7, 1.5, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(badgeText, badgeX + badgeWidth / 2, 36.8, { align: 'center' });
  }
}

/**
 * Common PDF layout helper for consistent header across standard business reports & P&L statements
 */
export function drawDocumentHeader(
  doc: jsPDF,
  settings: ShopSettings,
  docTitle: string,
  docSubtype: string,
  badgeText: string,
  badgeColor: [number, number, number] = [16, 185, 129] // Emerald default
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'Point of Sale & Inventory Management ERP';
  const shopPhone = settings?.phone || '';
  const shopAddress = settings?.address || '';

  // Top Dark Accent Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Colored Stripe
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.rect(0, 24, pageWidth, 1.8, 'F');

  // Company Brand Name & Tagline
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(shopName.toUpperCase(), 14, 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(shopTagline, 14, 16.5);

  // Address & Contacts
  const contactText = [shopPhone ? `Tel: ${shopPhone}` : '', shopAddress].filter(Boolean).join(' | ');
  if (contactText) {
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(contactText, pageWidth - 14, 10.5, { align: 'right' });
  }

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Exported: ${formatDateTime(new Date().toISOString())}`, pageWidth - 14, 16.5, { align: 'right' });

  // Document Title & Date Subtitle
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(docTitle, 14, 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(docSubtype, 14, 39);

  // Stage / Type Badge Box
  if (badgeText) {
    const badgeWidth = doc.getTextWidth(badgeText) + 8;
    const badgeX = pageWidth - 14 - badgeWidth;
    doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.roundedRect(badgeX, 29.5, badgeWidth, 6.5, 1.2, 1.2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(badgeText, badgeX + badgeWidth / 2, 34, { align: 'center' });
  }
}

/**
 * Common PDF layout helper for consistent footers and page numbering on executive reports
 */
export function drawExecutiveFooter(
  doc: jsPDF,
  settings: ShopSettings,
  subLabel = 'Credit Sale & Accounts Receivable Ledger'
): void {
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
    doc.text(`${shopName} • ${subLabel}`, 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
}

/**
 * Common PDF layout helper for standard statement and financial ledger footers
 */
export function drawDocumentFooter(
  doc: jsPDF,
  settings: ShopSettings,
  reportSubLabel: string = 'Financial Statement'
): void {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`${shopName} • ${reportSubLabel} • Confidential Financial Record`, 14, pageHeight - 6.5);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 6.5, { align: 'right' });
  }
}

/**
 * Shared multi-page footer for comprehensive dossiers and annual financial statements
 */
export function drawDossierFooter(
  doc: jsPDF,
  settings: ShopSettings,
  title: string,
  extraMeta?: string
): void {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shopName = settings?.shopName || 'Mobile Store';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    const metaStr = extraMeta ? ` • ${extraMeta}` : '';
    doc.text(
      `${title} • ${shopName}${metaStr} • Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }
}

/**
 * Draw Dual Formal Sign-Off Section for Audit & Ledger Approval
 */
export function drawSignOffBlock(doc: jsPDF, currentY: number, staffName?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const blockWidth = (pageWidth - 28 - 20) / 2;
  const leftX = 14;
  const rightX = 14 + blockWidth + 20;

  // Check if enough vertical room for signatures (requires ~30mm)
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = 25;
  }

  currentY += 8;

  // Prepared By Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('PREPARED BY (CASHIER / STAFF)', leftX, currentY);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(leftX, currentY + 12, leftX + blockWidth, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Name: ${staffName || 'Staff Representative'}`, leftX, currentY + 16.5);
  doc.text(`Date & Signature: _______________________`, leftX, currentY + 21);

  // Store Manager / Auditor Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('AUDITED & APPROVED BY (MANAGER / OWNER)', rightX, currentY);

  doc.line(rightX, currentY + 12, rightX + blockWidth, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Name: Store Manager / Proprietor', rightX, currentY + 16.5);
  doc.text(`Date & Signature: _______________________`, rightX, currentY + 21);

  return currentY + 25;
}
