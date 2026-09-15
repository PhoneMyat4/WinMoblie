import { Product, ImeiPair } from '../types';

export type ScanMatchType = 'imei' | 'barcode' | 'sku' | 'model' | 'unknown';

export interface ScanLookupResult {
  found: boolean;
  product?: Product;
  matchType?: ScanMatchType;
  matchedImei?: string;
  matchedImeiPair?: ImeiPair;
  error?: string;
}

/**
 * Clean and normalize a raw scanned barcode / IMEI / SKU string
 */
export function normalizeScanCode(input: string): string {
  if (!input) return '';
  // Trim spaces and standard scanner termination characters
  return input.trim().replace(/[\r\n]/g, '');
}

/**
 * Determines the probable type of scanned identifier
 */
export function detectScanCodeCategory(code: string): {
  type: 'imei' | 'barcode' | 'sku' | 'general';
  label: string;
} {
  const clean = normalizeScanCode(code);
  const digitsOnly = clean.replace(/[^0-9]/g, '');

  // 14-16 digits is standard IMEI
  if (digitsOnly.length >= 14 && digitsOnly.length <= 16 && clean.length <= 17) {
    return { type: 'imei', label: '15-Digit IMEI' };
  }

  // 8, 12, 13, 14 digits are standard UPC-A, EAN-13, EAN-8, ITF
  if (digitsOnly.length >= 8 && digitsOnly.length <= 13 && digitsOnly === clean) {
    return { type: 'barcode', label: 'Barcode / EAN / UPC' };
  }

  // Has hyphens or underscores and letters+numbers -> likely SKU
  if (/^[A-Z0-9_-]{3,25}$/i.test(clean) && /[A-Z]/i.test(clean) && /[0-9]/.test(clean)) {
    return { type: 'sku', label: 'Product SKU' };
  }

  return { type: 'general', label: 'Code / Keyword' };
}

/**
 * Searches product catalogue for an exact match against IMEI, Barcode, or SKU
 */
export function lookupProductByCode(
  rawCode: string,
  products: Product[]
): ScanLookupResult {
  const code = normalizeScanCode(rawCode);
  if (!code) {
    return { found: false, error: 'Empty scan code' };
  }

  const cleanLower = code.toLowerCase();
  const digitsOnly = code.replace(/[^0-9]/g, '');

  // 1. Check IMEI match in imeiPairs (Dual IMEI pairs)
  for (const p of products) {
    if (p.imeiPairs && p.imeiPairs.length > 0) {
      const pairMatch = p.imeiPairs.find(
        pair => pair.imei1 === code || pair.imei2 === code ||
                (digitsOnly.length >= 14 && (pair.imei1 === digitsOnly || pair.imei2 === digitsOnly))
      );
      if (pairMatch) {
        return {
          found: true,
          product: p,
          matchType: 'imei',
          matchedImei: pairMatch.imei1 === code || pairMatch.imei1 === digitsOnly ? pairMatch.imei1 : pairMatch.imei2,
          matchedImeiPair: pairMatch,
        };
      }
    }
  }

  // 2. Check IMEI match in imeiList (serialized arrays)
  for (const p of products) {
    if (p.imeiList && p.imeiList.length > 0) {
      const imeiMatch = p.imeiList.find(
        im => im === code || (digitsOnly.length >= 14 && im === digitsOnly)
      );
      if (imeiMatch) {
        return {
          found: true,
          product: p,
          matchType: 'imei',
          matchedImei: imeiMatch,
        };
      }
    }
  }

  // 3. Check Exact Barcode match
  for (const p of products) {
    if (p.barcode && p.barcode.trim() === code) {
      return {
        found: true,
        product: p,
        matchType: 'barcode',
      };
    }
  }

  // 4. Check Exact SKU match (case-insensitive)
  for (const p of products) {
    if (p.sku && p.sku.trim().toLowerCase() === cleanLower) {
      return {
        found: true,
        product: p,
        matchType: 'sku',
      };
    }
  }

  // 5. Check Exact Model or Name match
  for (const p of products) {
    if (p.model && p.model.trim().toLowerCase() === cleanLower) {
      return {
        found: true,
        product: p,
        matchType: 'model',
      };
    }
    if (p.name.trim().toLowerCase() === cleanLower) {
      return {
        found: true,
        product: p,
        matchType: 'model',
      };
    }
  }

  return {
    found: false,
    error: `No product found matching Barcode, IMEI, or SKU "${code}"`,
  };
}

/**
 * Live search filter for autocomplete suggestion dropdown during scanning
 */
export function searchProductsForScanner(
  query: string,
  products: Product[],
  maxResults: number = 6
): Array<{
  product: Product;
  matchedField: 'imei' | 'barcode' | 'sku' | 'name';
  highlightText: string;
}> {
  const clean = normalizeScanCode(query).toLowerCase();
  if (!clean || clean.length < 2) return [];

  const results: Array<{
    product: Product;
    matchedField: 'imei' | 'barcode' | 'sku' | 'name';
    highlightText: string;
  }> = [];

  for (const p of products) {
    if (results.length >= maxResults) break;

    // Check IMEI match
    const matchingImei = p.imeiPairs?.find(pair => 
      pair.imei1.toLowerCase().includes(clean) || (pair.imei2 && pair.imei2.toLowerCase().includes(clean))
    );
    if (matchingImei) {
      results.push({
        product: p,
        matchedField: 'imei',
        highlightText: matchingImei.imei1.toLowerCase().includes(clean) ? matchingImei.imei1 : matchingImei.imei2!,
      });
      continue;
    }

    if (p.imeiList?.some(im => im.toLowerCase().includes(clean))) {
      const im = p.imeiList.find(i => i.toLowerCase().includes(clean))!;
      results.push({
        product: p,
        matchedField: 'imei',
        highlightText: im,
      });
      continue;
    }

    // Check Barcode match
    if (p.barcode && p.barcode.toLowerCase().includes(clean)) {
      results.push({
        product: p,
        matchedField: 'barcode',
        highlightText: p.barcode,
      });
      continue;
    }

    // Check SKU match
    if (p.sku && p.sku.toLowerCase().includes(clean)) {
      results.push({
        product: p,
        matchedField: 'sku',
        highlightText: p.sku,
      });
      continue;
    }

    // Check Name / Model match
    if (p.name.toLowerCase().includes(clean) || (p.model && p.model.toLowerCase().includes(clean))) {
      results.push({
        product: p,
        matchedField: 'name',
        highlightText: p.name,
      });
    }
  }

  return results;
}
