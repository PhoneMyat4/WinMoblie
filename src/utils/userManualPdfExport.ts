import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ShopSettings } from '../types';
import { formatDateTime } from './formatters';
import { USER_MANUAL_METADATA, USER_MANUAL_SECTIONS } from '../data/userManualContent';

export interface ExportManualPdfOptions {
  settings: ShopSettings;
  staffName?: string;
}

export function exportUserManualPdf({ settings, staffName = 'Store Management' }: ExportManualPdfOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const leftMargin = 14;
  const rightMargin = 14;
  const contentWidth = pageWidth - leftMargin - rightMargin; // 182mm

  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'Point of Sale & Inventory Management Suite';
  const shopPhone = settings?.phone || '';
  const shopAddress = settings?.address || '';

  let currentY = 0;

  // ==========================================
  // 1. COVER / EXECUTIVE TITLE PAGE
  // ==========================================

  // Top Dark Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 42, 'F');

  // Accent Line (Indigo)
  doc.setFillColor(99, 102, 241); // indigo-500
  doc.rect(0, 42, pageWidth, 2.5, 'F');

  // Shop Brand Header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(shopName.toUpperCase(), leftMargin, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(shopTagline, leftMargin, 23);

  // Contact on top right
  const contactText = [shopPhone ? `Tel: ${shopPhone}` : '', shopAddress].filter(Boolean).join(' | ');
  if (contactText) {
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(contactText, pageWidth - rightMargin, 16, { align: 'right' });
  }

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Official Release: ${USER_MANUAL_METADATA.lastUpdated} | Ref: ${USER_MANUAL_METADATA.documentControlId}`, pageWidth - rightMargin, 23, { align: 'right' });

  // Document Badge
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.roundedRect(leftMargin, 31, 62, 7, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('OFFICIAL STAFF TRAINING SOP', leftMargin + 31, 35.8, { align: 'center' });

  currentY = 56;

  // Title Box
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('STORE OPERATING MANUAL & TRAINING DOSSIER', leftMargin, currentY);

  currentY += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Standard Operating Procedures for Point of Sale, Inventory Logistics, RMA & Accounting', leftMargin, currentY);

  currentY += 12;

  // Document Control Metadata Block
  autoTable(doc, {
    startY: currentY,
    head: [['Document Control Metric', 'Specification / Value', 'Security & Scope']],
    body: [
      ['Document Title', USER_MANUAL_METADATA.title, 'Internal Operations Standard'],
      ['Document ID & Revision', `${USER_MANUAL_METADATA.documentControlId} (${USER_MANUAL_METADATA.version})`, 'Controlled Document'],
      ['Authorized Issuing Authority', `${shopName} Management`, 'Executive Board Approved'],
      ['Target Roles & Audience', USER_MANUAL_METADATA.targetAudience, 'Mandatory for All Staff'],
      ['Effective Date & Timestamp', formatDateTime(new Date().toISOString()), 'Live Synchronized Baseline'],
    ],
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 2.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] },
      1: { cellWidth: 77 },
      2: { cellWidth: 50, textColor: [79, 70, 229] },
    },
    margin: { left: leftMargin, right: rightMargin },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Table of Contents Summary Grid
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('OPERATIONAL CHAPTER SUMMARY & DIRECTORY', leftMargin, currentY);
  currentY += 4;

  const tocRows = USER_MANUAL_SECTIONS.map((s) => [
    s.number,
    s.title,
    s.badge,
    s.subsections.length.toString() + ' Procedures',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Chapter', 'Operational Domain & Title', 'Classification', 'Coverage']],
    body: tocRows,
    theme: 'striped',
    styles: {
      fontSize: 7.8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 20 },
      1: { fontStyle: 'bold', cellWidth: 95 },
      2: { cellWidth: 40, textColor: [71, 85, 105] },
      3: { cellWidth: 27, halign: 'right' },
    },
    margin: { left: leftMargin, right: rightMargin },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // Pro-Tip / Training Note Box
  doc.setFillColor(238, 242, 255); // indigo-50
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.roundedRect(leftMargin, currentY, contentWidth, 24, 2, 2, 'FD');

  doc.setFillColor(99, 102, 241);
  doc.rect(leftMargin, currentY, 3, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(67, 56, 202); // indigo-700
  doc.text('MANDATORY STAFF ONBOARDING DIRECTIVE:', leftMargin + 7, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85); // slate-700
  const noticeLines = doc.splitTextToSize(
    'All newly hired cashiers, store supervisors, and logistics personnel must complete this training manual before independently operating the checkout counter or inventory receiving terminals. Re-certification is recommended following major software updates.',
    contentWidth - 14
  );
  doc.text(noticeLines, leftMargin + 7, currentY + 12);

  // ==========================================
  // 2. DETAILED CHAPTERS & WORKFLOWS
  // ==========================================

  USER_MANUAL_SECTIONS.forEach((section) => {
    doc.addPage();
    currentY = 20;

    // Chapter Header Banner
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(leftMargin, currentY, contentWidth, 16, 1.5, 1.5, 'FD');

    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(leftMargin, currentY, 3, 16, 'F');

    // Section Number & Title
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${section.number} ${section.title}`, leftMargin + 6, currentY + 7);

    // Section Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(79, 70, 229);
    doc.text(`[${section.badge}]`, leftMargin + 6, currentY + 12);

    currentY += 22;

    // Summary Box
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const summaryLines = doc.splitTextToSize(section.summary, contentWidth);
    doc.text(summaryLines, leftMargin, currentY);
    currentY += summaryLines.length * 4.5 + 4;

    // Subsections
    section.subsections.forEach((sub) => {
      // Check for available vertical space
      if (currentY > pageHeight - 35) {
        doc.addPage();
        currentY = 20;
      }

      // Subtitle
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(sub.subtitle, leftMargin, currentY);
      currentY += 5;

      // Description
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(51, 65, 85); // slate-700
      const descLines = doc.splitTextToSize(sub.description, contentWidth);
      doc.text(descLines, leftMargin, currentY);
      currentY += descLines.length * 4.2 + 3;

      // Bullet Points
      if (sub.bulletPoints && sub.bulletPoints.length > 0) {
        sub.bulletPoints.forEach((point) => {
          if (currentY > pageHeight - 25) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFillColor(79, 70, 229);
          doc.circle(leftMargin + 2, currentY - 1, 0.8, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(51, 65, 85);
          const pointLines = doc.splitTextToSize(point, contentWidth - 8);
          doc.text(pointLines, leftMargin + 6, currentY);
          currentY += pointLines.length * 4.2 + 2;
        });
        currentY += 2;
      }

      // Structured Table (e.g., Permissions Matrix, IMEI states, Shortcuts)
      if (sub.tableData) {
        if (currentY > pageHeight - 45) {
          doc.addPage();
          currentY = 20;
        }

        autoTable(doc, {
          startY: currentY,
          head: [sub.tableData.headers],
          body: sub.tableData.rows,
          theme: 'striped',
          styles: {
            fontSize: 7.2,
            cellPadding: 2.2,
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
          },
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.5,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          margin: { left: leftMargin, right: rightMargin },
        });

        currentY = (doc as any).lastAutoTable.finalY + 6;
      }

      // Callout Box (Tip, Warning, Info)
      if (sub.callout) {
        if (currentY > pageHeight - 25) {
          doc.addPage();
          currentY = 20;
        }

        const isWarning = sub.callout.type === 'warning';
        const isTip = sub.callout.type === 'tip';

        const boxBg: [number, number, number] = isWarning
          ? [255, 247, 237] // amber-50
          : isTip
          ? [240, 253, 244] // emerald-50
          : [239, 246, 255]; // blue-50

        const boxBorder: [number, number, number] = isWarning
          ? [254, 215, 170]
          : isTip
          ? [187, 247, 208]
          : [191, 219, 254];

        const accentColor: [number, number, number] = isWarning
          ? [234, 88, 12] // amber-600
          : isTip
          ? [22, 163, 74] // emerald-600
          : [37, 99, 235]; // blue-600

        doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
        doc.setDrawColor(boxBorder[0], boxBorder[1], boxBorder[2]);

        const calloutLines = doc.splitTextToSize(
          `${sub.callout.type.toUpperCase()}: ${sub.callout.text}`,
          contentWidth - 12
        );
        const calloutHeight = calloutLines.length * 4.2 + 8;

        doc.roundedRect(leftMargin, currentY, contentWidth, calloutHeight, 1.5, 1.5, 'FD');

        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(leftMargin, currentY, 2.5, calloutHeight, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(30, 41, 59);
        doc.text(calloutLines, leftMargin + 6, currentY + 5.5);

        currentY += calloutHeight + 5;
      }

      currentY += 4;
    });
  });

  // ==========================================
  // 3. FINAL SIGN-OFF & RATIFICATION PAGE
  // ==========================================
  if (currentY > pageHeight - 70) {
    doc.addPage();
    currentY = 25;
  } else {
    currentY += 10;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftMargin, currentY, contentWidth, 48, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('OFFICIAL SOP ACKNOWLEDGEMENT & COMPLIANCE SIGN-OFF', leftMargin + 6, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'By signing below, the employee certifies that they have read, understood, and agreed to adhere strictly to all store operational procedures.',
    leftMargin + 6,
    currentY + 14
  );

  const halfWidth = (contentWidth - 12) / 2;

  // Left Sign-Off (Employee / Trainee)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('TRAINEE / STAFF SIGNATURE:', leftMargin + 6, currentY + 24);
  doc.line(leftMargin + 6, currentY + 36, leftMargin + 6 + halfWidth - 6, currentY + 36);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Printed Name & Date', leftMargin + 6, currentY + 41);

  // Right Sign-Off (Store Owner / Manager)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('SUPERVISOR / STORE OWNER APPROVAL:', leftMargin + 6 + halfWidth, currentY + 24);
  doc.line(leftMargin + 6 + halfWidth, currentY + 36, leftMargin + 6 + 2 * halfWidth - 6, currentY + 36);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`${shopName} Managing Director / Official Seal`, leftMargin + 6 + halfWidth, currentY + 41);

  // ==========================================
  // 4. RUNNING HEADERS & FOOTERS ACROSS ALL PAGES
  // ==========================================
  const totalPages = (doc as any).internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Skip running header on Cover Page (Page 1)
    if (i > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`${shopName.toUpperCase()} • Official Operating Manual (SOP)`, leftMargin, 10);
      doc.text(USER_MANUAL_METADATA.documentControlId, pageWidth - rightMargin, 10, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(leftMargin, 12, pageWidth - rightMargin, 12);
    }

    // Running Footer on every page
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(leftMargin, pageHeight - 11, pageWidth - rightMargin, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${shopName} • Internal Training Document • Confidential`,
      leftMargin,
      pageHeight - 6.5
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - rightMargin,
      pageHeight - 6.5,
      { align: 'right' }
    );
  }

  // ==========================================
  // 5. DOWNLOAD PDF
  // ==========================================
  const safeFilename = shopName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  doc.save(`${safeFilename}_operations_manual_${USER_MANUAL_METADATA.documentControlId}.pdf`);
}
