import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ShopSettings } from '../types';
import { formatDateTime } from './formatters';

export interface PdfSummaryMetric {
  label: string;
  value: string | number;
}

export interface ExportPdfOptions {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  settings?: Partial<ShopSettings>;
  timeframeLabel?: string;
  summaryMetrics?: PdfSummaryMetric[];
  orientation?: 'portrait' | 'landscape';
}

export function exportReportToPdf({
  title,
  subtitle,
  filename,
  headers,
  rows,
  settings,
  timeframeLabel,
  summaryMetrics,
  orientation,
}: ExportPdfOptions) {
  // Determine orientation automatically if not provided (more than 6 columns benefits from landscape)
  const isLandscape = orientation === 'landscape' || (!orientation && headers.length > 6);
  
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'Point of Sale & Inventory Management';
  const shopPhone = settings?.phone || '';
  const shopAddress = settings?.address || '';
  const staffName = settings?.currentStaffName || 'Admin';

  let currentY = 14;

  // Header Banner Background
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Accent Line
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 24, pageWidth, 1.5, 'F');

  // Store Brand Name & Tagline in Header Banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(shopName.toUpperCase(), 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(shopTagline, 14, 17);

  // Right-aligned Store Contacts in Banner
  const contactText = [shopPhone ? `Tel: ${shopPhone}` : '', shopAddress].filter(Boolean).join(' | ');
  if (contactText) {
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(contactText, pageWidth - 14, 11, { align: 'right' });
  }
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())} by ${staffName}`, pageWidth - 14, 17, { align: 'right' });

  currentY = 32;

  // Report Title & Meta
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 14, currentY);

  if (timeframeLabel) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229); // indigo-600
    const periodText = `Period: ${timeframeLabel}`;
    doc.text(periodText, pageWidth - 14, currentY, { align: 'right' });
  }

  currentY += 5;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(subtitle, 14, currentY);
    currentY += 5;
  }

  // Summary Metrics Banner / Grid (if provided)
  if (summaryMetrics && summaryMetrics.length > 0) {
    const cols = Math.min(summaryMetrics.length, 4);
    const cardWidth = (pageWidth - 28 - (cols - 1) * 3) / cols;
    const cardHeight = 13;

    summaryMetrics.forEach((metric, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = 14 + col * (cardWidth + 3);
      const y = currentY + row * (cardHeight + 2.5);

      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(metric.label.toUpperCase(), x + 2.5, y + 4.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(String(metric.value), x + 2.5, y + 9.5);
    });

    const totalRows = Math.ceil(summaryMetrics.length / cols);
    currentY += totalRows * (cardHeight + 2.5) + 3;
  }

  currentY += 2;

  // Column Alignment & Format determination
  const columnStyles: Record<number, any> = {};
  headers.forEach((h, colIndex) => {
    const lower = h.toLowerCase();
    if (
      lower.includes('price') || 
      lower.includes('cost') || 
      lower.includes('revenue') || 
      lower.includes('profit') || 
      lower.includes('valuation') || 
      lower.includes('spend') || 
      lower.includes('subtotal') || 
      lower.includes('grand total') || 
      lower.includes('cogs') ||
      lower.includes('capital') ||
      lower.includes('discount') ||
      lower.includes('margin %') ||
      lower.includes('units') ||
      lower.includes('stock') ||
      lower.includes('quantity') ||
      lower.includes('qty') ||
      lower.includes('points') ||
      lower.includes('count')
    ) {
      columnStyles[colIndex] = { halign: 'right' };
    } else if (
      lower.includes('status') || 
      lower.includes('rank') || 
      lower.includes('date') || 
      lower.includes('action') ||
      lower.includes('condition') ||
      lower.includes('method')
    ) {
      columnStyles[colIndex] = { halign: 'center' };
    } else {
      columnStyles[colIndex] = { halign: 'left' };
    }
  });

  // Render Table via autoTable
  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: rows,
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: headers.length > 9 ? 6.5 : headers.length > 6 ? 7.5 : 8.5,
      cellPadding: 2,
      textColor: [30, 41, 59], // slate-800
      lineColor: [226, 232, 240], // slate-200
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: headers.length > 9 ? 6.5 : headers.length > 6 ? 7.5 : 8.5,
      halign: 'left',
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles,
    margin: { left: 14, right: 14, top: 28, bottom: 18 },
    didDrawPage: (data) => {
      // Footer on each page
      const totalPagesExp = '{total_pages_count_string}';
      const str = `Page ${data.pageNumber} of ${totalPagesExp}`;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      
      // Footer Top Border Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

      // Left Footer
      doc.text(`${shopName} • Business Intelligence & Analytics Report`, 14, pageHeight - 7);
      
      // Right Footer
      doc.text(str, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }
  });

  // Calculate actual total pages
  if (typeof (doc as any).putTotalPages === 'function') {
    (doc as any).putTotalPages('{total_pages_count_string}');
  }

  // Save / Download PDF file
  const safeFilename = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeFilename);
}
