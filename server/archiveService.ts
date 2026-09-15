import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, listAll, getMetadata } from 'firebase/storage';
import { Parser } from 'json2csv';
import { db, storage } from '../src/lib/firebase';
import { ensureAuth } from './posFirestoreService';
import type { Sale } from '../src/types';

export interface ArchiveRequestOptions {
  startDate?: string;
  endDate?: string;
  olderThanDate?: string;
  previewOnly?: boolean;
  fileNamePrefix?: string;
}

export interface ArchiveResult {
  success: boolean;
  message: string;
  count: number;
  storagePath?: string;
  downloadUrl?: string;
  fileSize?: number;
  deletedIds?: string[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  archivedAt?: string;
  preview?: {
    totalGrandTotal: number;
    sampleInvoices: string[];
    earliestDate: string;
    latestDate: string;
  };
}

export interface ArchiveFileInfo {
  name: string;
  fullPath: string;
  size: number;
  timeCreated: string;
  downloadUrl: string;
}

/**
 * Extracts a numeric timestamp from various Firestore date representations
 * (ISO string, Timestamp object, millisecond number).
 */
function extractTimestamp(rawDate: any): number | null {
  if (!rawDate) return null;
  if (typeof rawDate?.toDate === 'function') {
    return rawDate.toDate().getTime();
  }
  if (typeof rawDate?.seconds === 'number') {
    return rawDate.seconds * 1000;
  }
  if (typeof rawDate === 'string' || typeof rawDate === 'number') {
    const t = new Date(rawDate).getTime();
    return isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Normalizes date bounds from the request.
 */
function parseDateBounds(options: ArchiveRequestOptions): { startTime: number; endTime: number; startStr: string; endStr: string } {
  let startTime = 0;
  let endTime = Infinity;
  let startStr = '';
  let endStr = '';

  if (options.olderThanDate) {
    const parsed = new Date(options.olderThanDate);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      endTime = parsed.getTime();
      endStr = options.olderThanDate;
    }
  }

  if (options.startDate) {
    const parsedStart = new Date(options.startDate);
    if (!isNaN(parsedStart.getTime())) {
      // Midnight start of that day
      parsedStart.setHours(0, 0, 0, 0);
      startTime = parsedStart.getTime();
      startStr = options.startDate.split('T')[0];
    }
  }

  if (options.endDate) {
    const parsedEnd = new Date(options.endDate);
    if (!isNaN(parsedEnd.getTime())) {
      // End of day (23:59:59.999)
      parsedEnd.setHours(23, 59, 59, 999);
      endTime = parsedEnd.getTime();
      endStr = options.endDate.split('T')[0];
    }
  }

  if (endTime === Infinity) {
    endTime = Date.now();
    endStr = new Date().toISOString().split('T')[0];
  }

  return { startTime, endTime, startStr, endStr };
}

/**
 * Converts sales records into clean, structured CSV rows for accounting and auditing.
 */
function mapSalesToCsvRows(salesList: Sale[]) {
  return salesList.map((sale) => {
    const itemsSummary = (sale.items || [])
      .map((item) => {
        const details = [
          item.name || 'Unnamed Item',
          `Qty: ${item.quantity || 1}`,
          item.brand ? `Brand: ${item.brand}` : '',
          item.imei ? `IMEI: ${item.imei}` : '',
          `Unit Price: ${item.unitPrice || 0}`,
          `Total: ${item.finalPrice || 0}`,
        ]
          .filter(Boolean)
          .join(', ');
        return `[${details}]`;
      })
      .join('; ');

    return {
      saleId: sale.id || '',
      invoiceNumber: sale.invoiceNumber || '',
      date: sale.date || '',
      customerName: sale.customerName || 'Walk-in Customer',
      customerPhone: sale.customerPhone || '',
      customerAddress: sale.customerAddress || '',
      itemsCount: (sale.items || []).reduce((acc, item) => acc + (item.quantity || 1), 0),
      itemsDetails: itemsSummary,
      subtotal: sale.subtotal || 0,
      discountTotal: sale.discountTotal || 0,
      taxTotal: sale.taxTotal || 0,
      grandTotal: sale.grandTotal || 0,
      paymentMethod: sale.paymentMethod || 'cash',
      amountPaid: sale.amountPaid || 0,
      balanceDue: sale.balanceDue || 0,
      soldBy: (sale as any).soldBy || (sale as any).cashierName || 'Staff',
      status: (sale as any).status || 'completed',
      notes: sale.notes || '',
    };
  });
}

/**
 * Core Data Archiving & Cleanup Engine:
 * 1. Fetches sales records from Firestore matching date range criteria.
 * 2. If previewOnly = true, returns matching records summary without modifying anything.
 * 3. Serializes the records to RFC-compliant CSV format.
 * 4. Uploads CSV file to Firebase Cloud Storage under `archives/sales/archive_YYYY_MM_DD.csv`.
 * 5. ONLY after confirmed successful storage upload, deletes matching docs from Firestore via batched writes.
 * 6. Returns download URL, path, deleted IDs, and metadata.
 */
export async function archiveSalesData(options: ArchiveRequestOptions): Promise<ArchiveResult> {
  // 1. Authenticate with Firebase services
  await ensureAuth();

  const { startTime, endTime, startStr, endStr } = parseDateBounds(options);

  console.log(`[ArchiveService] Querying sales to archive from ${startStr || 'earliest'} to ${endStr}...`);

  // 2. Query all sales from Firestore
  const salesColRef = collection(db, 'sales');
  const snapshot = await getDocs(salesColRef);

  const matchingDocs: Array<{ id: string; ref: any; data: Sale; timestamp: number }> = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as Sale;
    const ts = extractTimestamp(data.date || (data as any).createdAt);
    if (ts !== null) {
      if (ts >= startTime && ts <= endTime) {
        matchingDocs.push({
          id: docSnap.id,
          ref: docSnap.ref,
          data: { ...data, id: docSnap.id },
          timestamp: ts,
        });
      }
    } else {
      // If document doesn't have valid date, check if date range is open or olderThan
      if (startTime === 0 && endTime >= Date.now()) {
        matchingDocs.push({
          id: docSnap.id,
          ref: docSnap.ref,
          data: { ...data, id: docSnap.id },
          timestamp: 0,
        });
      }
    }
  });

  // Sort chronological
  matchingDocs.sort((a, b) => a.timestamp - b.timestamp);

  const count = matchingDocs.length;
  console.log(`[ArchiveService] Found ${count} matching sales records for archiving.`);

  if (count === 0) {
    return {
      success: true,
      message: `No sales records found within the selected date range (${startStr || 'Beginning'} to ${endStr}).`,
      count: 0,
      dateRange: {
        startDate: startStr || 'Beginning',
        endDate: endStr,
      },
    };
  }

  const totalGrandTotal = matchingDocs.reduce((sum, item) => sum + (item.data.grandTotal || 0), 0);
  const earliestDate = matchingDocs[0]?.data.date || '';
  const latestDate = matchingDocs[matchingDocs.length - 1]?.data.date || '';

  // 3. Handle preview-only requests
  if (options.previewOnly) {
    return {
      success: true,
      message: `Found ${count} sales records ready for archiving and cleanup.`,
      count,
      dateRange: {
        startDate: startStr || earliestDate.split('T')[0] || 'Beginning',
        endDate: endStr || latestDate.split('T')[0] || 'Present',
      },
      preview: {
        totalGrandTotal,
        sampleInvoices: matchingDocs.slice(0, 5).map((m) => m.data.invoiceNumber || m.id),
        earliestDate,
        latestDate,
      },
    };
  }

  // 4. Convert sales data into structured CSV format using json2csv
  const csvRows = mapSalesToCsvRows(matchingDocs.map((m) => m.data));

  const csvFields = [
    { label: 'Sale ID', value: 'saleId' },
    { label: 'Invoice Number', value: 'invoiceNumber' },
    { label: 'Date', value: 'date' },
    { label: 'Customer Name', value: 'customerName' },
    { label: 'Customer Phone', value: 'customerPhone' },
    { label: 'Customer Address', value: 'customerAddress' },
    { label: 'Items Count', value: 'itemsCount' },
    { label: 'Item Details', value: 'itemsDetails' },
    { label: 'Subtotal (Ks)', value: 'subtotal' },
    { label: 'Discount Total (Ks)', value: 'discountTotal' },
    { label: 'Tax Total (Ks)', value: 'taxTotal' },
    { label: 'Grand Total (Ks)', value: 'grandTotal' },
    { label: 'Payment Method', value: 'paymentMethod' },
    { label: 'Amount Paid (Ks)', value: 'amountPaid' },
    { label: 'Balance Due (Ks)', value: 'balanceDue' },
    { label: 'Cashier / Staff', value: 'soldBy' },
    { label: 'Status', value: 'status' },
    { label: 'Notes', value: 'notes' },
  ];

  const parser = new Parser({ fields: csvFields });
  const csvContent = parser.parse(csvRows);
  const fileSizeBytes = Buffer.byteLength(csvContent, 'utf8');

  // 5. Build Cloud Storage file path: `archives/sales/archive_YYYY_MM_DD.csv`
  const now = new Date();
  const dateSuffix = now.toISOString().slice(0, 10).replace(/-/g, '_'); // e.g. 2026_09_14
  const timestampSuffix = Date.now();
  
  // Format requested: archives/sales/archive_YYYY_MM_DD.csv (append timestamp to prevent accidental collision)
  const storagePath = `archives/sales/archive_${dateSuffix}_${timestampSuffix}.csv`;
  const storageRef = ref(storage, storagePath);

  console.log(`[ArchiveService] Uploading CSV archive (${(fileSizeBytes / 1024).toFixed(1)} KB) to ${storagePath}...`);

  let downloadUrl = '';
  try {
    const uploadResult = await uploadString(storageRef, csvContent, 'raw', {
      contentType: 'text/csv; charset=utf-8',
      customMetadata: {
        archivedCount: String(count),
        dateRangeStart: startStr || 'Beginning',
        dateRangeEnd: endStr,
        totalRevenue: String(totalGrandTotal),
        archivedAt: now.toISOString(),
      },
    });

    downloadUrl = await getDownloadURL(uploadResult.ref);
    console.log(`[ArchiveService] CSV archive successfully uploaded to Cloud Storage! Download URL: ${downloadUrl}`);
  } catch (uploadError: any) {
    console.error(`[ArchiveService] CRITICAL: Failed to upload CSV archive to Firebase Cloud Storage.`, uploadError);
    // CRITICAL SAFETY INVARIANT: Abort immediately, NEVER delete Firestore documents if upload fails!
    throw new Error(
      `Failed to upload CSV archive to Firebase Cloud Storage (${uploadError?.message || 'Upload error'}). ` +
      `Firestore database documents were NOT deleted to protect your data.`
    );
  }

  // 6. ONLY AFTER SUCCESSFUL STORAGE UPLOAD: Batch delete documents from Firestore
  console.log(`[ArchiveService] Storage upload verified. Starting batched deletion of ${count} records from Firestore...`);

  const BATCH_SIZE = 400; // Safe threshold under Firestore's 500 limit
  const deletedIds: string[] = [];

  for (let i = 0; i < matchingDocs.length; i += BATCH_SIZE) {
    const batchChunk = matchingDocs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    batchChunk.forEach((item) => {
      batch.delete(item.ref);
      deletedIds.push(item.id);
    });

    await batch.commit();
    console.log(`[ArchiveService] Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchChunk.length} docs). Total so far: ${deletedIds.length}/${count}`);
  }

  console.log(`[ArchiveService] Archiving and cleanup completed successfully! Purged ${deletedIds.length} sales from Firestore.`);

  return {
    success: true,
    message: `Successfully archived ${count} sales records to Cloud Storage and purged them from Firestore.`,
    count,
    storagePath,
    downloadUrl,
    fileSize: fileSizeBytes,
    deletedIds,
    dateRange: {
      startDate: startStr || earliestDate.split('T')[0] || 'Beginning',
      endDate: endStr || latestDate.split('T')[0] || 'Present',
    },
    archivedAt: now.toISOString(),
  };
}

/**
 * Retrieves list of past archive files stored in Firebase Cloud Storage.
 */
export async function listArchivedFiles(): Promise<ArchiveFileInfo[]> {
  try {
    await ensureAuth();
    const folderRef = ref(storage, 'archives/sales');
    const res = await listAll(folderRef);

    const filePromises = res.items.map(async (itemRef) => {
      try {
        const [meta, url] = await Promise.all([
          getMetadata(itemRef),
          getDownloadURL(itemRef),
        ]);
        return {
          name: itemRef.name,
          fullPath: itemRef.fullPath,
          size: meta.size || 0,
          timeCreated: meta.timeCreated || new Date().toISOString(),
          downloadUrl: url,
        };
      } catch (e) {
        console.warn(`[ArchiveService] Could not fetch metadata for ${itemRef.name}:`, e);
        return null;
      }
    });

    const results = await Promise.all(filePromises);
    const valid = results.filter((f): f is ArchiveFileInfo => f !== null);
    // Sort newest created first
    valid.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());
    return valid;
  } catch (err: any) {
    console.error('[ArchiveService] Failed to list archived files from Cloud Storage:', err);
    return [];
  }
}
