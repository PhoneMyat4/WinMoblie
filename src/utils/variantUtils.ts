import { Product, ProductCategory, DeviceCondition, ImeiPair } from '../types';
import { canonicalCategory, isPhoneCategory } from '../data/categoryTaxonomy';

export interface VariantSpecifications {
  id?: string;
  name?: string;
  brand?: string;
  category?: ProductCategory;
  subCategory?: string;
  childCategory?: string;
  variant?: string;
  condition?: DeviceCondition;
  ram?: string;
  rom?: string;
  storage?: string;
  color?: string;
}

/**
 * Normalizes text for comparison (trim, lowercase, removes excess spaces, treats '-' as empty)
 */
export const normalizeVariantText = (val?: string): string => {
  if (!val) return '';
  const trimmed = val.trim().toLowerCase().replace(/\s+/g, ' ');
  if (trimmed === '-' || trimmed === 'none' || trimmed === 'n/a' || trimmed === '- none / n/a -') {
    return '';
  }
  return trimmed;
};

/**
 * Extracts and normalizes RAM (e.g., "8GB", "12GB", or "")
 */
export const extractNormalizedRam = (ram?: string, storage?: string): string => {
  const normRam = normalizeVariantText(ram);
  if (normRam) return normRam.toUpperCase();

  if (storage) {
    const match = storage.match(/(\d+GB)\s*RAM/i);
    if (match) return match[1].toUpperCase();
  }
  return '';
};

/**
 * Extracts and normalizes ROM storage (e.g., "128GB", "256GB", "1TB")
 */
export const extractNormalizedRom = (rom?: string, storage?: string): string => {
  const normRom = normalizeVariantText(rom);
  if (normRom) return normRom.toUpperCase();

  if (storage) {
    const match = storage.match(/(\d+(?:GB|TB))/i);
    if (match) return match[1].toUpperCase();
  }
  return '';
};

/**
 * Normalizes device color for comparison
 */
export const extractNormalizedColor = (color?: string): string => {
  return normalizeVariantText(color);
};

/**
 * Generates a unique, deterministic composite key representing a product variant.
 * Two items match IF AND ONLY IF this composite key is identical.
 */
export const getProductVariantKey = (item: VariantSpecifications): string => {
  if (!item) return '';
  const brand = normalizeVariantText(item.brand);
  // Strip brand prefix if present in name to allow "Xiaomi n 16" and "n 16" (with brand Xiaomi) to match
  let rawName = normalizeVariantText(item.name);
  if (brand && rawName.startsWith(brand)) {
    rawName = rawName.slice(brand.length).trim();
  }
  const name = rawName;
  const category = canonicalCategory(item.category);
  const condition = item.condition || 'brand_new';
  
  const isPhone = isPhoneCategory(category);

  if (isPhone) {
    const ram = extractNormalizedRam(item.ram, item.storage);
    const rom = extractNormalizedRom(item.rom, item.storage);
    const color = extractNormalizedColor(item.color);
    return `phone|brand:${brand}|name:${name}|cat:${category}|cond:${condition}|ram:${ram}|rom:${rom}|color:${color}`;
  }

  const subCat = normalizeVariantText(item.subCategory);
  const childCat = normalizeVariantText(item.childCategory || item.variant);
  const color = extractNormalizedColor(item.color);

  // If child category is empty / unspecified:
  // - It must never match any product with an assigned child category.
  // - To prevent unintended merging of distinct products where child category was omitted,
  //   each product retains its own unique identifier via item.id (if present).
  // - If item.id is missing (e.g. prospective/unsaved form), use '__empty_unassigned__'
  //   so it cannot collide with existing persisted products.
  const childKey = childCat ? childCat : (item.id ? `__empty_${item.id}__` : '__empty_unassigned__');
  return `item|brand:${brand}|name:${name}|cat:${category}|sub:${subCat}|child:${childKey}|cond:${condition}|color:${color}`;
};

/**
 * Checks if two items or specifications refer to the EXACT same variant
 */
export const isSameProductVariant = (
  a: VariantSpecifications,
  b: VariantSpecifications
): boolean => {
  if (!a || !b) return false;
  if (canonicalCategory(a.category) !== canonicalCategory(b.category)) return false;

  // For non-phone items: if either item has empty child category/variant, they should NOT be assumed identical
  // unless they are explicitly the exact same product ID
  if (!isPhoneCategory(a.category)) {
    const aChild = normalizeVariantText(a.childCategory || a.variant);
    const bChild = normalizeVariantText(b.childCategory || b.variant);
    if (!aChild || !bChild) {
      if (a.id && b.id && a.id === b.id) return true;
      return false; // Empty child categories do not match each other or defined child categories
    }
  }

  const keyA = getProductVariantKey(a);
  const keyB = getProductVariantKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
};

/**
 * Finds an existing product from the catalog that matches the full specification set of a variant
 */
export const findExactVariantMatch = (
  products: Product[],
  specs: VariantSpecifications,
  excludeId?: string
): Product | undefined => {
  if (!specs.name || !specs.name.trim()) return undefined;

  // For non-phone items: if specs has empty child category, it should never match an existing product
  // because an unassigned child category cannot be definitively matched to any existing variant
  if (!isPhoneCategory(specs.category)) {
    const specsChild = normalizeVariantText(specs.childCategory || specs.variant);
    if (!specsChild) {
      return undefined;
    }
  }

  const targetKey = getProductVariantKey(specs);

  return products.find((p) => {
    if (excludeId && p.id === excludeId) return false;
    return getProductVariantKey(p) === targetKey;
  });
};

/**
 * Finds other variants of the same product name/model (e.g. sister RAM/ROM/Color variants)
 */
export const findSisterVariants = (
  products: Product[],
  name: string,
  brand?: string,
  excludeId?: string
): Product[] => {
  let normName = normalizeVariantText(name);
  const normBrand = normalizeVariantText(brand);
  if (normBrand && normName.startsWith(normBrand)) {
    normName = normName.slice(normBrand.length).trim();
  }
  if (!normName) return [];

  return products.filter((p) => {
    if (excludeId && p.id === excludeId) return false;
    let pName = normalizeVariantText(p.name);
    const pBrand = normalizeVariantText(p.brand);
    if (pBrand && pName.startsWith(pBrand)) {
      pName = pName.slice(pBrand.length).trim();
    }
    const nameMatches = pName === normName;
    const brandMatches = !normBrand || !p.brand || normalizeVariantText(p.brand) === normBrand;
    return nameMatches && brandMatches;
  });
};

/**
 * Generates a clean, readable SKU for a variant
 */
export const generateVariantSku = (
  brand: string,
  name: string,
  ram?: string,
  rom?: string,
  color?: string
): string => {
  const cleanBrand = brand ? brand.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) : 'VAR';
  const cleanName = name ? name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) : 'ITEM';
  const cleanRam = ram && ram !== '-' ? ram.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
  const cleanRom = rom ? rom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
  const cleanColor = color ? color.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3) : '';
  
  const rand = Math.floor(1000 + Math.random() * 9000);
  const parts = [cleanBrand, cleanName, cleanRam, cleanRom, cleanColor, rand].filter(Boolean);
  return `SKU-${parts.join('-')}`;
};

/**
 * Formats a clean variant subtitle (e.g. "8GB / 256GB • Black • Brand New")
 */
export const formatVariantSpecsSummary = (item: VariantSpecifications): string => {
  const parts: string[] = [];
  const ram = extractNormalizedRam(item.ram, item.storage);
  const rom = extractNormalizedRom(item.rom, item.storage);
  
  if (ram && rom) {
    parts.push(`${ram} / ${rom}`);
  } else if (rom) {
    parts.push(rom);
  }

  if (item.color && item.color.trim()) {
    parts.push(item.color.trim());
  }

  return parts.join(' • ');
};

/**
 * Returns a hex color for rendering a realistic swatch dot for phone and accessory colors
 */
export const getColorDotHex = (colorName?: string): string => {
  if (!colorName) return '#94a3b8';
  const c = colorName.toLowerCase().trim();
  
  if (c.includes('natural titanium') || c.includes('desert titanium') || c.includes('sand') || c.includes('champagne') || c.includes('amber') || c.includes('bronze')) return '#c2b092';
  if (c.includes('titanium gray') || c.includes('space gray') || c.includes('space grey') || c.includes('graphite') || c.includes('shadow') || c.includes('charcoal')) return '#64748b';
  if (c.includes('black titanium') || c.includes('space black') || c.includes('midnight black') || c.includes('phantom black') || c.includes('obsidian') || c.includes('black') || c.includes('dark')) return '#1e293b';
  if (c.includes('white titanium') || c.includes('pure white') || c.includes('starlight') || c.includes('pearl') || c.includes('cream') || c.includes('silver') || c.includes('white')) return '#e2e8f0';
  if (c.includes('ice blue') || c.includes('sierra blue') || c.includes('sky blue') || c.includes('awesome ice') || c.includes('cyan') || c.includes('teal')) return '#38bdf8';
  if (c.includes('deep blue') || c.includes('midnight blue') || c.includes('navy') || c.includes('pacific blue') || c.includes('cobalt') || c.includes('blue')) return '#2563eb';
  if (c.includes('alpine green') || c.includes('forest green') || c.includes('emerald') || c.includes('olive') || c.includes('mint') || c.includes('green')) return '#10b981';
  if (c.includes('deep purple') || c.includes('bora purple') || c.includes('violet') || c.includes('lavender') || c.includes('lilac') || c.includes('purple')) return '#8b5cf6';
  if (c.includes('product red') || c.includes('crimson') || c.includes('burgundy') || c.includes('coral') || c.includes('red')) return '#ef4444';
  if (c.includes('rose gold') || c.includes('rose') || c.includes('pink') || c.includes('blush')) return '#f472b6';
  if (c.includes('gold') || c.includes('yellow') || c.includes('orange') || c.includes('sunset') || c.includes('peach')) return '#f59e0b';
  
  return '#6366f1';
};
