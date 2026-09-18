import { Product, ProductCategory, DeviceCondition, ImeiPair, ShopSettings } from '../types';
import { 
  extractNormalizedRam, 
  extractNormalizedRom, 
  extractNormalizedColor, 
  generateVariantSku 
} from './variantUtils';

export interface ParsedCsvProductRow {
  rowNumber: number;
  rawText: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  product: Product;
  parsedImeis: ImeiPair[];
  isExistingVariantMatch?: boolean;
}

export interface CsvTemplatePreset {
  id: string;
  name: string;
  description: string;
  csvContent: string;
}

/**
 * Robust CSV/TSV tokenizer that handles double quotes, escaped quotes, and multiple delimiters
 */
export function tokenizeCsvLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped double quote inside quotes
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Detects the most probable delimiter for tabular text (comma, tab, semicolon, pipe)
 */
export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 5);
  if (firstLines.length === 0) return ',';

  const counts: Record<string, number> = { '\t': 0, ',': 0, ';': 0, '|': 0 };

  firstLines.forEach(line => {
    Object.keys(counts).forEach(del => {
      counts[del] += (line.split(del).length - 1);
    });
  });

  let bestDelimiter = ',';
  let maxCount = -1;

  // Prefer tabs for TSV (Excel/Google Sheets copy paste) if prevalent
  for (const [del, count] of Object.entries(counts)) {
    if (count > maxCount && count > 0) {
      maxCount = count;
      bestDelimiter = del;
    }
  }

  return bestDelimiter;
}

/**
 * Normalizes category string to valid ProductCategory enum value
 */
export function normalizeCategory(input?: string, contextName?: string): ProductCategory {
  if (!input) {
    if (contextName) {
      const lower = contextName.toLowerCase();
      if (lower.includes('cook') || lower.includes('pot') || lower.includes('pan') || lower.includes('kettle') || lower.includes('blender') || lower.includes('fryer') || lower.includes('wok') || lower.includes('rice cooker')) {
        return 'cookware';
      }
      if (lower.includes('case') || lower.includes('cover') || lower.includes('charger') || lower.includes('cable') || lower.includes('power bank') || lower.includes('watch') || lower.includes('earbuds') || lower.includes('audio')) {
        return 'accessories_gadgets';
      }
      if (lower.includes('sim') || lower.includes('esim') || lower.includes('topup') || lower.includes('top-up')) {
        return 'sim_cards';
      }
      if (lower.includes('used') || lower.includes('secondhand') || lower.includes('preowned')) {
        return 'pre_owned_phones';
      }
    }
    return 'brand_new_phones';
  }

  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (clean.includes('cook') || clean.includes('kitchen') || clean.includes('kettle') || clean.includes('blender') || clean.includes('fryer') || clean.includes('pan') || clean.includes('pot') || clean.includes('wok')) {
    return 'cookware';
  }
  if (clean.includes('used') || clean.includes('secondhand') || clean.includes('preowned') || clean.includes('2nd') || clean.includes('pre_owned')) {
    return 'pre_owned_phones';
  }
  if (clean.includes('sim') || clean.includes('esim') || clean.includes('topup') || clean.includes('recharge')) {
    return 'sim_cards';
  }
  if (clean.includes('access') || clean.includes('case') || clean.includes('charger') || clean.includes('cable') || clean.includes('powerbank') || clean.includes('gadget') || clean.includes('watch') || clean.includes('wearable') || clean.includes('audio') || clean.includes('earbuds') || clean.includes('part') || clean.includes('lcd')) {
    return 'accessories_gadgets';
  }
  if (clean.includes('phone') || clean.includes('mobile') || clean.includes('smartphone') || clean.includes('device') || clean.includes('brandnew')) {
    return 'brand_new_phones';
  }

  return 'brand_new_phones';
}

/**
 * Normalizes condition string to DeviceCondition enum value
 */
export function normalizeCondition(input?: string): DeviceCondition {
  if (!input) return 'brand_new';
  const clean = input.toLowerCase().replace(/[^a-z0-9+]/g, '');

  if (clean.includes('aplus') || clean.includes('a+') || clean.includes('gradeaplus')) return 'used_grade_a_plus';
  if (clean.includes('gradea') || clean.includes('useda') || clean.includes('likenew')) return 'used_grade_a';
  if (clean.includes('gradeb') || clean.includes('usedb') || clean.includes('good')) return 'used_grade_b';
  if (clean.includes('gradec') || clean.includes('usedc') || clean.includes('fair')) return 'used_grade_c';
  if (clean.includes('used') || clean.includes('second') || clean.includes('preowned')) return 'used_grade_a';

  return 'brand_new';
}

/**
 * Cleans currency/number strings (e.g. "3,500,000 Ks" -> 3500000)
 */
export function parseCleanNumber(val?: string | number, fallback: number = 0): number {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

/**
 * Brand detection from name if brand column omitted
 */
export function detectBrandFromName(name: string): string {
  const lower = name.toLowerCase();
  const KNOWN_BRANDS = [
    'Apple', 'Samsung', 'Xiaomi', 'Redmi', 'POCO', 'Google', 'OPPO', 
    'Vivo', 'Realme', 'OnePlus', 'Honor', 'Huawei', 'Sony', 'Motorola',
    'Asus', 'Infinix', 'Tecno', 'Nothing', 'Anker', 'Baseus', 'Remax',
    'Hoco', 'Joyroom', 'Ugreen', 'JBL', 'Marshall', 'Sony', 'Haylou', 'Mibro'
  ];

  for (const b of KNOWN_BRANDS) {
    if (lower.startsWith(b.toLowerCase() + ' ') || lower.startsWith(b.toLowerCase() + '-') || lower.includes(` ${b.toLowerCase()} `)) {
      return b;
    }
  }

  // Check starts with iPhone, iPad, AirPods, Galaxy
  if (lower.startsWith('iphone') || lower.startsWith('ipad') || lower.startsWith('airpods') || lower.startsWith('macbook')) {
    return 'Apple';
  }
  if (lower.startsWith('galaxy')) {
    return 'Samsung';
  }
  if (lower.startsWith('redmi') || lower.startsWith('poco')) {
    return 'Xiaomi';
  }

  return '';
}

/**
 * Parses IMEI string into structured ImeiPair array.
 * Supports delimiters: commas, semicolons, slashes, pipes, spaces.
 * Example: "861234567890123 / 861234567890124; 869876543210123"
 */
export function parseImeiListString(rawImeis?: string): ImeiPair[] {
  if (!rawImeis || !rawImeis.trim()) return [];

  const pairs: ImeiPair[] = [];
  // Split multiple units by semicolons, newlines, or commas if they look like separate units
  const units = rawImeis
    .split(/[;\n]+/)
    .map(u => u.trim())
    .filter(Boolean);

  units.forEach(unit => {
    // Check if unit has dual IMEI separated by / or | or comma
    if (unit.includes('/') || unit.includes('|')) {
      const parts = unit.split(/[/|]+/).map(p => p.replace(/[^0-9]/g, '')).filter(Boolean);
      if (parts[0]) {
        pairs.push({
          imei1: parts[0],
          imei2: parts[1] || undefined,
          status: 'In Stock'
        });
      }
    } else {
      // Single IMEI or space-separated list
      const digitsOnly = unit.replace(/[^0-9]/g, '');
      // If exactly 14-16 digits, standard single IMEI
      if (digitsOnly.length >= 14 && digitsOnly.length <= 16) {
        pairs.push({
          imei1: digitsOnly,
          status: 'In Stock'
        });
      } else if (digitsOnly.length >= 28 && digitsOnly.length <= 32) {
        // Dual IMEI concatenated (15 + 15 digits)
        pairs.push({
          imei1: digitsOnly.slice(0, 15),
          imei2: digitsOnly.slice(15, 30),
          status: 'In Stock'
        });
      } else {
        // Try splitting by comma
        const subItems = unit.split(',').map(s => s.replace(/[^0-9]/g, '')).filter(s => s.length >= 14 && s.length <= 16);
        if (subItems.length > 0) {
          subItems.forEach(im => {
            pairs.push({ imei1: im, status: 'In Stock' });
          });
        } else if (digitsOnly.length > 0) {
          pairs.push({ imei1: digitsOnly, status: 'In Stock' });
        }
      }
    }
  });

  return pairs;
}

/**
 * Main parser function to convert raw CSV / TSV text to structured Product records
 */
export function parseBulkCsvProducts(
  rawText: string,
  existingProducts: Product[] = [],
  settings?: ShopSettings
): {
  rows: ParsedCsvProductRow[];
  totalValid: number;
  totalErrors: number;
  totalUnits: number;
  totalValuationCost: number;
  totalValuationSelling: number;
  delimiter: string;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      rows: [],
      totalValid: 0,
      totalErrors: 0,
      totalUnits: 0,
      totalValuationCost: 0,
      totalValuationSelling: 0,
      delimiter: ','
    };
  }

  const delimiter = detectDelimiter(trimmed);
  const rawLines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (rawLines.length === 0) {
    return {
      rows: [],
      totalValid: 0,
      totalErrors: 0,
      totalUnits: 0,
      totalValuationCost: 0,
      totalValuationSelling: 0,
      delimiter
    };
  }

  // Header detection
  const firstRowTokens = tokenizeCsvLine(rawLines[0], delimiter).map(t => t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  
  const hasHeaderRow = firstRowTokens.some(tok => 
    ['name', 'product', 'item', 'title', 'brand', 'price', 'cost', 'sku', 'stock', 'imei', 'rom', 'ram', 'category'].includes(tok)
  );

  // Column index mappings
  const colMap: Record<string, number> = {
    name: -1,
    brand: -1,
    category: -1,
    subCategory: -1,
    condition: -1,
    costPrice: -1,
    sellingPrice: -1,
    stock: -1,
    minStockAlert: -1,
    ram: -1,
    rom: -1,
    color: -1,
    sku: -1,
    barcode: -1,
    imeis: -1,
    warranty: -1,
    description: -1,
  };

  let dataLines: string[] = [];

  if (hasHeaderRow) {
    firstRowTokens.forEach((header, idx) => {
      if (['name', 'product_name', 'product', 'item', 'title', 'item_name', 'model_name'].includes(header)) colMap.name = idx;
      else if (['brand', 'make', 'manufacturer', 'brand_name'].includes(header)) colMap.brand = idx;
      else if (['category', 'type', 'cat', 'product_type', 'product_category'].includes(header)) colMap.category = idx;
      else if (['subcategory', 'sub_category', 'subcat', 'sub_cat', 'segment'].includes(header)) colMap.subCategory = idx;
      else if (['condition', 'state', 'grade', 'device_condition', 'quality'].includes(header)) colMap.condition = idx;
      else if (['cost', 'cost_price', 'costprice', 'buy_price', 'buying_price', 'purchase_price', 'purchase_cost'].includes(header)) colMap.costPrice = idx;
      else if (['price', 'selling_price', 'sellingprice', 'sale_price', 'retail_price', 'sell_price'].includes(header)) colMap.sellingPrice = idx;
      else if (['stock', 'qty', 'quantity', 'count', 'units', 'stock_quantity', 'inventory'].includes(header)) colMap.stock = idx;
      else if (['min_stock', 'min_stock_alert', 'min_alert', 'alert_level', 'reorder_level', 'min'].includes(header)) colMap.minStockAlert = idx;
      else if (['ram', 'memory', 'ram_size'].includes(header)) colMap.ram = idx;
      else if (['rom', 'storage', 'internal_storage', 'capacity', 'disk'].includes(header)) colMap.rom = idx;
      else if (['color', 'colour', 'color_name', 'finish'].includes(header)) colMap.color = idx;
      else if (['sku', 'item_code', 'code', 'product_code'].includes(header)) colMap.sku = idx;
      else if (['barcode', 'upc', 'ean', 'barcode_number'].includes(header)) colMap.barcode = idx;
      else if (['imei', 'imeis', 'imei_list', 'serials', 'serial_number', 'imei1', 'imei2'].includes(header)) colMap.imeis = idx;
      else if (['warranty', 'warranty_months', 'warranty_period'].includes(header)) colMap.warranty = idx;
      else if (['description', 'notes', 'details', 'memo'].includes(header)) colMap.description = idx;
    });

    dataLines = rawLines.slice(1);
  } else {
    // Default standard positional column mapping
    // Name, Brand, Category, SubCategory, Condition, CostPrice, SellingPrice, Stock, RAM, ROM, Color, SKU, Barcode, IMEIs, Warranty, Description
    colMap.name = 0;
    colMap.brand = 1;
    colMap.category = 2;
    colMap.subCategory = 3;
    colMap.condition = 4;
    colMap.costPrice = 5;
    colMap.sellingPrice = 6;
    colMap.stock = 7;
    colMap.ram = 8;
    colMap.rom = 9;
    colMap.color = 10;
    colMap.sku = 11;
    colMap.barcode = 12;
    colMap.imeis = 13;
    colMap.warranty = 14;
    colMap.description = 15;

    dataLines = rawLines;
  }

  const parsedRows: ParsedCsvProductRow[] = [];
  let totalValid = 0;
  let totalErrors = 0;
  let totalUnits = 0;
  let totalValuationCost = 0;
  let totalValuationSelling = 0;

  dataLines.forEach((line, lineIndex) => {
    const rowNumber = hasHeaderRow ? lineIndex + 2 : lineIndex + 1;
    const tokens = tokenizeCsvLine(line, delimiter);

    // Skip empty lines
    if (tokens.length === 0 || tokens.every(t => !t.trim())) {
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const getVal = (key: string): string => {
      const idx = colMap[key];
      return idx >= 0 && idx < tokens.length ? tokens[idx].trim() : '';
    };

    const rawName = getVal('name') || (colMap.name === -1 && tokens.length > 0 ? tokens[0].trim() : '');
    if (!rawName) {
      errors.push('Product name is required');
    }

    let brand = getVal('brand');
    if (!brand && rawName) {
      const autoBrand = detectBrandFromName(rawName);
      if (autoBrand) {
        brand = autoBrand;
      } else {
        warnings.push('Brand was not specified');
      }
    }

    const rawCategory = getVal('category');
    const category = normalizeCategory(rawCategory, rawName);
    const isPhone = category === 'brand_new_phones' || category === 'pre_owned_phones' || category === 'new_phones' || category === 'used_phones';

    const rawCondition = getVal('condition');
    const condition = isPhone && (category === 'pre_owned_phones' || category === 'used_phones') && !rawCondition
      ? 'used_grade_a'
      : normalizeCondition(rawCondition);

    const subCategory = getVal('subCategory') || undefined;

    // RAM & ROM extraction
    let ram = extractNormalizedRam(getVal('ram'));
    let rom = extractNormalizedRom(getVal('rom'));

    // If RAM or ROM not in dedicated columns, attempt to parse from Name
    if (isPhone && !ram) {
      const nameRam = extractNormalizedRam('', rawName);
      if (nameRam) ram = nameRam;
    }
    if (isPhone && !rom) {
      const nameRom = extractNormalizedRom('', rawName);
      if (nameRom) rom = nameRom;
    }

    const color = extractNormalizedColor(getVal('color')) || (isPhone ? 'Standard' : undefined);

    const rawCost = getVal('costPrice');
    const costPrice = parseCleanNumber(rawCost, 0);

    const rawSelling = getVal('sellingPrice');
    const sellingPrice = parseCleanNumber(rawSelling, 0);

    if (sellingPrice <= 0) {
      errors.push('Selling price must be greater than 0');
    }
    if (costPrice > sellingPrice && sellingPrice > 0) {
      warnings.push(`Cost price (${costPrice.toLocaleString()}) is higher than selling price (${sellingPrice.toLocaleString()})`);
    }

    // Parse IMEIs
    const rawImeis = getVal('imeis');
    const parsedImeis = isPhone ? parseImeiListString(rawImeis) : [];

    // Calculate Stock
    const rawStock = getVal('stock');
    let stock = parseCleanNumber(rawStock, isPhone && parsedImeis.length > 0 ? parsedImeis.length : 1);
    if (isPhone && parsedImeis.length > 0) {
      stock = parsedImeis.length;
    }
    if (stock < 0) {
      stock = 0;
    }

    const minStockAlert = parseCleanNumber(getVal('minStockAlert'), 0);
    const warrantyMonths = parseCleanNumber(getVal('warranty'), isPhone ? (category === 'new_phones' ? 12 : 1) : 6);
    const description = getVal('description') || undefined;

    // SKU & Barcode
    let sku = getVal('sku');
    if (!sku) {
      sku = generateVariantSku(brand || 'ITEM', rawName, ram, rom, color);
    }

    let barcode = getVal('barcode');
    if (!barcode) {
      barcode = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    }

    const storageStr = isPhone
      ? (ram && ram !== '-' ? `${ram} / ${rom || 'Standard'}` : (rom || undefined))
      : undefined;

    const flattenedImeiList = parsedImeis.map(p => p.imei1).concat(parsedImeis.filter(p => p.imei2).map(p => p.imei2!));

    // Construct Product Object
    const product: Product = {
      id: `prod-bulk-${Date.now()}-${lineIndex}-${Math.random().toString(36).substr(2, 4)}`,
      name: rawName,
      brand: brand || 'Generic',
      model: rawName,
      category,
      subCategory,
      condition,
      sku,
      barcode,
      costPrice,
      sellingPrice,
      stock,
      minStockAlert,
      ram: isPhone ? (ram || '-') : undefined,
      rom: isPhone ? (rom || '128GB') : undefined,
      storage: storageStr,
      color: isPhone ? (color || 'Black') : color,
      batteryHealth: (category === 'pre_owned_phones' || category === 'used_phones') ? 100 : undefined,
      imeiPairs: isPhone && parsedImeis.length > 0 ? parsedImeis : undefined,
      imeiList: isPhone && flattenedImeiList.length > 0 ? flattenedImeiList : undefined,
      dualImei: isPhone ? parsedImeis.some(p => !!p.imei2) : undefined,
      warrantyMonths,
      description,
      lastRestockedAt: new Date().toISOString(),
    };

    // Check if variant matches an existing catalog product
    const isExistingMatch = existingProducts.some(p => 
      p.name.toLowerCase() === rawName.toLowerCase() &&
      (!brand || (p.brand || '').toLowerCase() === brand.toLowerCase()) &&
      (!ram || (p.ram || '').toLowerCase() === ram.toLowerCase()) &&
      (!rom || (p.rom || '').toLowerCase() === rom.toLowerCase()) &&
      (!color || (p.color || '').toLowerCase() === color.toLowerCase())
    );

    const isValid = errors.length === 0;
    if (isValid) {
      totalValid++;
      totalUnits += stock;
      totalValuationCost += (costPrice * stock);
      totalValuationSelling += (sellingPrice * stock);
    } else {
      totalErrors++;
    }

    parsedRows.push({
      rowNumber,
      rawText: line,
      isValid,
      errors,
      warnings,
      product,
      parsedImeis,
      isExistingVariantMatch: isExistingMatch
    });
  });

  return {
    rows: parsedRows,
    totalValid,
    totalErrors,
    totalUnits,
    totalValuationCost,
    totalValuationSelling,
    delimiter
  };
}

/**
 * Built-in Sample CSV Templates for quick copying and reference
 */
export const SAMPLE_CSV_TEMPLATES: CsvTemplatePreset[] = [
  {
    id: 'smartphones_imei',
    name: 'Smartphones with Dual IMEIs (Recommended)',
    description: 'Complete phone catalogue template with Brand, RAM, ROM, Color, Cost, Selling Price and Serialized Dual IMEIs.',
    csvContent: `Name,Brand,Category,Condition,CostPrice,SellingPrice,Stock,RAM,ROM,Color,IMEIs,Warranty
Apple iPhone 15 Pro,Apple,new_phones,brand_new,3400000,3750000,2,8GB,256GB,Natural Titanium,358765123456789 / 358765123456790; 358765123456791 / 358765123456792,12
Samsung Galaxy S24 Ultra,Samsung,new_phones,brand_new,3800000,4200000,2,12GB,512GB,Titanium Gray,351234098765432 / 351234098765433; 351234098765434 / 351234098765435,12
Xiaomi Redmi Note 13 Pro 5G,Xiaomi,new_phones,brand_new,950000,1050000,3,8GB,256GB,Midnight Black,861234567890123 / 861234567890124; 861234567890125 / 861234567890126; 861234567890127 / 861234567890128,12
Apple iPhone 13 Pro Max (Pre-Owned),Apple,used_phones,used_grade_a,1950000,2250000,1,6GB,128GB,Sierra Blue,359998877665544,1`
  },
  {
    id: 'accessories_gadgets',
    name: 'Accessories & Smart Gadgets (Non-IMEI)',
    description: 'Bulk accessories, original fast chargers, earbuds, cables, power banks and screen protectors.',
    csvContent: `Name,Brand,Category,SubCategory,Condition,CostPrice,SellingPrice,Stock,MinAlert,Warranty,Description
Apple 20W USB-C Fast Power Adapter,Apple,accessories,Fast Chargers & Adapters,brand_new,65000,85000,25,5,6,Original Apple 20W Power Adapter with official seal
Anker 737 Power Bank (PowerCore 24K),Anker,accessories,Power Banks,brand_new,260000,320000,10,2,12,140W fast output 24000mAh portable charger with smart digital display
Baseus 100W PD 5A Type-C Cable 1.5m,Baseus,accessories,Cables & Connectors,brand_new,12000,18000,40,10,3,High durability braided fast charging cable
Samsung Galaxy Buds2 Pro,Samsung,gadgets,Wireless Earbuds,brand_new,380000,450000,8,2,6,Active Noise Cancelling 24-bit Hi-Fi sound earbuds
Remax 9D King Kong Tempered Glass (iPhone 15),Remax,accessories,Screen Protectors,brand_new,6000,12000,50,15,0,Full coverage privacy screen protector`
  },
  {
    id: 'simple_quick',
    name: 'Simple Fast Inventory (Minimal Columns)',
    description: 'Quickest copy-paste format: Name, Brand, SellingPrice, CostPrice, Stock, Color.',
    csvContent: `Name,Brand,SellingPrice,CostPrice,Stock,Color
Apple iPhone 14 128GB Midnight,Apple,2100000,1850000,4,Midnight
Xiaomi Redmi 13C 6/128GB Navy Blue,Xiaomi,450000,390000,8,Navy Blue
OPPO Reno 11 5G 12/256GB Wave Green,OPPO,1250000,1100000,3,Wave Green
Remax RPP-296 20000mAh Power Bank,Remax,45000,32000,20,White
Joyroom JR-T03S Pro TWS Earbuds,Joyroom,65000,45000,15,White`
  }
];
