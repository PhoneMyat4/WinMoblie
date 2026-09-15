/**
 * Strict 5-Level Inventory Classification Hierarchy Taxonomy
 * 
 * Level 1: Category (Brand new phones, Pre-owned Phones, Accessories & Gadgets, Cookware, Sim Cards)
 * Level 2: Sub-category (Dependent on Category)
 * Level 3: Brand (Dependent on Sub-category)
 * Level 4: Model (Dependent on Brand)
 * Level 5: Variant/Color (Dependent on Model - primarily for phones)
 */

import { HierarchyCategory, HierarchyModel, ProductCategory } from '../types';

export const CANONICAL_CATEGORIES: { id: ProductCategory; label: string; icon: string; description: string; isPhone: boolean }[] = [
  { 
    id: 'brand_new_phones', 
    label: 'Brand new phones', 
    icon: 'Smartphone', 
    description: 'Factory sealed new smartphones with official manufacturer warranty',
    isPhone: true
  },
  { 
    id: 'pre_owned_phones', 
    label: 'Pre-owned Phones', 
    icon: 'RefreshCw', 
    description: 'Inspected and certified second-hand phones with grading & battery health',
    isPhone: true
  },
  { 
    id: 'accessories_gadgets', 
    label: 'Accessories & Gadgets', 
    icon: 'Headphones', 
    description: 'Chargers, power banks, audio earbuds, cables, cases, and wearable gadgets',
    isPhone: false
  },
  { 
    id: 'cookware', 
    label: 'Cookware', 
    icon: 'Utensils', 
    description: 'Electric cookers, pressure cookers, frying pans, kettles, blenders, and kitchenware',
    isPhone: false
  },
  { 
    id: 'sim_cards', 
    label: 'Sim Cards', 
    icon: 'CreditCard', 
    description: 'Prepaid SIMs, tourist high-speed data packs, top-ups, and digital eSIM profiles',
    isPhone: false
  },
];

/**
 * Normalizes legacy category values to the 5 canonical categories
 */
export function canonicalCategory(cat?: ProductCategory | string): ProductCategory {
  if (!cat) return 'brand_new_phones';
  const c = cat.toLowerCase().trim();
  
  if (
    c === 'brand_new_phones' ||
    c === 'brand new phones' ||
    c === 'new_phones' ||
    c === 'new phones'
  ) {
    return 'brand_new_phones';
  }
  if (
    c === 'pre_owned_phones' ||
    c === 'pre-owned phones' ||
    c === 'pre owned phones' ||
    c === 'used_phones' ||
    c === 'used phones' ||
    c === 'secondhand'
  ) {
    return 'pre_owned_phones';
  }
  if (
    c === 'accessories_gadgets' ||
    c === 'accessories & gadgets' ||
    c === 'accessoreis & gadgets' ||
    c === 'accessories' ||
    c === 'accessory' ||
    c === 'gadgets' ||
    c === 'gadget' ||
    c === 'spare_parts' ||
    c.includes('accessor') ||
    c.includes('charger') ||
    c.includes('cable') ||
    c.includes('audio') ||
    c.includes('earphone') ||
    c.includes('headphone') ||
    c.includes('power_bank') ||
    c.includes('powerbank')
  ) {
    return 'accessories_gadgets';
  }
  if (
    c === 'cookware' ||
    c === 'cook wares' ||
    c === 'kitchenware' ||
    c.includes('cookware') ||
    c.includes('kitchen')
  ) {
    return 'cookware';
  }
  if (
    c === 'sim_cards' ||
    c === 'sim cards' ||
    c === 'sim_topup' ||
    c === 'sim' ||
    c.includes('sim')
  ) {
    return 'sim_cards';
  }
  return 'brand_new_phones';
}

export function isPhoneCategory(cat?: ProductCategory | string): boolean {
  const norm = canonicalCategory(cat);
  return norm === 'brand_new_phones' || norm === 'pre_owned_phones';
}

export type ProductKind = 
  | 'charger' 
  | 'cable' 
  | 'power_bank' 
  | 'audio' 
  | 'case_protector' 
  | 'smartwatch' 
  | 'tablet' 
  | 'cookware' 
  | 'sim_card' 
  | 'smartphone' 
  | 'accessory_general';

/**
 * Accurately detects whether an item is genuinely a smartphone.
 * Returns false for chargers, accessories, cookware, etc., even if miscategorized.
 */
export function isPhoneProduct(product?: {
  name?: string;
  brand?: string;
  model?: string;
  category?: ProductCategory | string;
  subCategory?: string;
  ram?: string;
  rom?: string;
  imeiList?: string[];
  imeiPairs?: any[];
} | null): boolean {
  if (!product) return false;
  
  const cat = canonicalCategory(product.category);
  if (cat === 'accessories_gadgets' || cat === 'cookware' || cat === 'sim_cards') {
    return false;
  }

  const name = (product.name || '').toLowerCase();
  const model = (product.model || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  const subCategory = (product.subCategory || '').toLowerCase();
  const combined = `${brand} ${model} ${name} ${subCategory}`;

  // Explicit accessory keywords
  const accessoryKeywords = [
    'charger', 'adapter', 'gan', 'watt', 'power bank', 'powerbank', 'cable', 
    'cord', 'earbud', 'headphone', 'airpod', 'buds', 'tws', 'case', 'cover',
    'tempered glass', 'screen protector', 'holder', 'stand', 'mount', 'cooker', 
    'pot', 'pan', 'kettle', 'speaker', 'soundbar'
  ];
  if (accessoryKeywords.some(kw => combined.includes(kw))) {
    return false;
  }
  
  // Wattage pattern like "55w", "65w", "100w", "20w", etc.
  if (/\b\d+\s*w\b/i.test(combined)) {
    return false;
  }

  // Dedicated accessory brands
  if (['ugreen', 'anker', 'baseus', 'belkin', 'aukey', 'joyroom', 'remax', 'ldnio', 'essager'].includes(brand.trim())) {
    return false;
  }

  // If category is phone or has genuine phone serialized identifiers
  if (cat === 'brand_new_phones' || cat === 'pre_owned_phones') {
    return true;
  }

  return Boolean((product.ram && product.ram !== '-') || (product.rom && product.rom !== '-'));
}

/**
 * Deep classifier to identify the exact archetype of the product
 */
export function detectProductKind(product?: {
  name?: string;
  brand?: string;
  model?: string;
  category?: ProductCategory | string;
  subCategory?: string;
} | null): ProductKind {
  if (!product) return 'accessory_general';
  
  const brand = (product.brand || '').toLowerCase().trim();
  const model = (product.model || '').toLowerCase().trim();
  const name = (product.name || '').toLowerCase().trim();
  const subCategory = (product.subCategory || '').toLowerCase().trim();
  const category = (product.category || '').toLowerCase().trim();
  const combined = `${brand} ${model} ${name} ${subCategory} ${category}`;

  // 1. Chargers & Power Adapters
  if (
    /\b\d+\s*w\b/i.test(combined) ||
    combined.includes('charger') ||
    combined.includes('adapter') ||
    combined.includes('gan') ||
    combined.includes('fast charge') ||
    combined.includes('quick charge') ||
    combined.includes('power delivery') ||
    combined.includes('plug') ||
    (['ugreen', 'anker', 'baseus', 'belkin', 'aukey', 'ldnio'].includes(brand) && (model.includes('w') || name.includes('w') || subCategory.includes('charge') || combined.includes('55')))
  ) {
    return 'charger';
  }

  // 2. Cables
  if (
    combined.includes('cable') ||
    combined.includes('cord') ||
    combined.includes('type-c to') ||
    combined.includes('lightning to') ||
    combined.includes('usb-c to')
  ) {
    return 'cable';
  }

  // 3. Power Banks
  if (
    combined.includes('power bank') ||
    combined.includes('powerbank') ||
    combined.includes('battery pack') ||
    combined.includes('mah')
  ) {
    return 'power_bank';
  }

  // 4. Audio
  if (
    combined.includes('earbud') ||
    combined.includes('headphone') ||
    combined.includes('earphone') ||
    combined.includes('airpod') ||
    combined.includes('buds') ||
    combined.includes('tws') ||
    combined.includes('speaker') ||
    combined.includes('soundbar')
  ) {
    return 'audio';
  }

  // 5. Cases & Screen Protectors
  if (
    combined.includes('case') ||
    combined.includes('cover') ||
    combined.includes('protector') ||
    combined.includes('tempered glass') ||
    combined.includes('skin')
  ) {
    return 'case_protector';
  }

  // 6. Smartwatch
  if (combined.includes('watch') || combined.includes('band') || combined.includes('tracker')) {
    return 'smartwatch';
  }

  // 7. Tablet
  if (combined.includes('ipad') || combined.includes('tablet') || combined.includes('tab')) {
    return 'tablet';
  }

  // 8. Cookware
  if (
    combined.includes('cookware') ||
    combined.includes('pan') ||
    combined.includes('pot') ||
    combined.includes('kettle') ||
    combined.includes('cooker')
  ) {
    return 'cookware';
  }

  // 9. SIM Cards
  if (combined.includes('sim') || combined.includes('esim') || combined.includes('topup')) {
    return 'sim_card';
  }

  // 10. Smartphone
  if (isPhoneProduct(product)) {
    return 'smartphone';
  }

  return 'accessory_general';
}

/**
 * Builds an accurate, archetype-specific visual generation prompt.
 * Avoids generating a phone for chargers or accessories!
 */
export function buildProductVisualPrompt(product: {
  brand?: string;
  model?: string;
  name?: string;
  color?: string;
  category?: ProductCategory | string;
  subCategory?: string;
}): string {
  const kind = detectProductKind(product);
  const brand = product.brand || 'Premium';
  const model = product.model || product.name || 'Device';
  const colorSpec = product.color && product.color !== '-' && product.color.toLowerCase() !== 'standard' ? ` in ${product.color}` : '';

  switch (kind) {
    case 'charger':
      return `Commercial studio advertisement photography of ${brand} ${model} Fast Wall Charger power adapter${colorSpec}, compact high-speed GaN charging brick resting on sleek dark obsidian pedestal with subtle LED glow, pristine commercial electronics studio lighting, 8k resolution.`;
    case 'cable':
      return `Commercial studio advertisement photography of ${brand} ${model} high-durability braided charging cable${colorSpec}, neatly coiled on minimalist luxury surface, 8k commercial photo.`;
    case 'power_bank':
      return `Commercial studio advertisement photography of ${brand} ${model} portable power bank${colorSpec}, modern textured matte casing with digital battery display, sleek studio lighting, 8k photo.`;
    case 'audio':
      return `Commercial studio advertisement photography of ${brand} ${model} premium wireless earbuds in sleek charging case${colorSpec}, floating acoustic presentation, studio rim lighting, 8k photo.`;
    case 'case_protector':
      return `Commercial studio advertisement photography of ${brand} ${model} shockproof protective case${colorSpec}, precision cutout showcase, dark luxury backdrop, 8k photo.`;
    case 'smartwatch':
      return `Commercial studio advertisement photography of ${brand} ${model} smartwatch${colorSpec}, crisp AMOLED screen display, premium strap, elegant pedestal, 8k photo.`;
    case 'cookware':
      return `Commercial studio advertisement photography of ${brand} ${model} premium modern kitchen appliance${colorSpec}, spotless culinary countertop setting, warm inviting studio lighting, 8k photo.`;
    case 'smartphone':
    default:
      return `Commercial studio advertisement photography of ${brand} ${model}${colorSpec}, flagship mobile device resting on luxury pedestal with dramatic studio rim lighting, 8k commercial photo.`;
  }
}

/**
 * Returns a high-resolution, verified commercial studio photo tailored to the brand and category archetype.
 */
export function getCuratedCommercialPhoto(product: {
  brand?: string;
  model?: string;
  name?: string;
  category?: ProductCategory | string;
  subCategory?: string;
  imageUrl?: string;
}): string {
  // If product already has an authentic valid image, prefer it
  if (product.imageUrl && (product.imageUrl.startsWith('http://') || product.imageUrl.startsWith('https://')) && !product.imageUrl.includes('pollinations.ai')) {
    return product.imageUrl;
  }

  const kind = detectProductKind(product);

  // 1. Chargers & Power Adapters
  if (kind === 'charger') {
    return 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=1200&auto=format&fit=crop&q=80';
  }

  // 2. Cables
  if (kind === 'cable') {
    return 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=1200&auto=format&fit=crop&q=80';
  }

  // 3. Power Banks
  if (kind === 'power_bank') {
    return 'https://images.unsplash.com/photo-1594818379496-da1e345b0ded?w=1200&auto=format&fit=crop&q=80';
  }

  // 4. Audio Gear
  if (kind === 'audio') {
    return 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=1200&auto=format&fit=crop&q=80';
  }

  // 5. Smartwatches
  if (kind === 'smartwatch') {
    return 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1200&auto=format&fit=crop&q=80';
  }

  // 6. Tablets
  if (kind === 'tablet') {
    return 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=1200&auto=format&fit=crop&q=80';
  }

  // 7. Cases & Screen Protectors
  if (kind === 'case_protector' || kind === 'accessory_general') {
    return 'https://images.unsplash.com/photo-1601593346740-925612772716?w=1200&auto=format&fit=crop&q=80';
  }

  // 8. Cookware
  if (kind === 'cookware') {
    return 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=1200&auto=format&fit=crop&q=80';
  }

  // 9. Smartphones by brand
  const brandLower = (product.brand || '').toLowerCase();
  if (brandLower.includes('apple') || brandLower.includes('iphone')) {
    return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=1200&auto=format&fit=crop&q=80';
  }
  if (brandLower.includes('samsung')) {
    return 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=1200&auto=format&fit=crop&q=80';
  }
  if (brandLower.includes('xiaomi') || brandLower.includes('redmi') || brandLower.includes('poco')) {
    return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1200&auto=format&fit=crop&q=80';
  }
  if (brandLower.includes('pixel') || brandLower.includes('google')) {
    return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1200&auto=format&fit=crop&q=80';
  }

  // Default flagship smartphone studio photo
  return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&auto=format&fit=crop&q=80';
}

/**
 * Master Data Taxonomy adhering strictly to the mind map
 */
export const CATEGORY_TAXONOMY: HierarchyCategory[] = [
  // ==========================================
  // LEVEL 1: BRAND NEW PHONES
  // ==========================================
  {
    id: 'brand_new_phones',
    name: 'Brand new phones',
    iconName: 'Smartphone',
    description: 'Sealed box new smartphones with manufacturer warranty',
    isPhone: true,
    subCategories: [
      {
        id: 'flagship_phones',
        name: 'Flagship Phones',
        brands: [
          {
            id: 'apple_new',
            name: 'Apple',
            models: [
              { id: 'iph-16-pm', name: 'iPhone 16 Pro Max', colors: ['Desert Titanium', 'Natural Titanium', 'White Titanium', 'Black Titanium'], defaultWarrantyMonths: 12 },
              { id: 'iph-16-p', name: 'iPhone 16 Pro', colors: ['Desert Titanium', 'Natural Titanium', 'White Titanium', 'Black Titanium'], defaultWarrantyMonths: 12 },
              { id: 'iph-16-plus', name: 'iPhone 16 Plus', colors: ['Ultramarine', 'Teal', 'Pink', 'White', 'Black'], defaultWarrantyMonths: 12 },
              { id: 'iph-16', name: 'iPhone 16', colors: ['Ultramarine', 'Teal', 'Pink', 'White', 'Black'], defaultWarrantyMonths: 12 },
              { id: 'iph-15-pm', name: 'iPhone 15 Pro Max', colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'], defaultWarrantyMonths: 12 },
              { id: 'iph-15-p', name: 'iPhone 15 Pro', colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'], defaultWarrantyMonths: 12 },
              { id: 'iph-15', name: 'iPhone 15', colors: ['Blue', 'Pink', 'Yellow', 'Green', 'Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'samsung_flagship',
            name: 'Samsung',
            models: [
              { id: 'sam-s24u', name: 'Galaxy S24 Ultra', colors: ['Titanium Gray', 'Titanium Black', 'Titanium Violet', 'Titanium Yellow'], defaultWarrantyMonths: 12 },
              { id: 'sam-s24p', name: 'Galaxy S24+', colors: ['Onyx Black', 'Marble Gray', 'Cobalt Violet', 'Amber Yellow'], defaultWarrantyMonths: 12 },
              { id: 'sam-s24', name: 'Galaxy S24', colors: ['Onyx Black', 'Marble Gray', 'Cobalt Violet', 'Amber Yellow'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'xiaomi_flagship',
            name: 'Xiaomi',
            models: [
              { id: 'mi-14u', name: 'Xiaomi 14 Ultra', colors: ['Black Ceramic', 'White Ceramic', 'Titanium'], defaultWarrantyMonths: 12 },
              { id: 'mi-14', name: 'Xiaomi 14', colors: ['Black', 'White', 'Jade Green'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'google_flagship',
            name: 'Google Pixel',
            models: [
              { id: 'pix-9pxl', name: 'Pixel 9 Pro XL', colors: ['Obsidian', 'Porcelain', 'Hazel', 'Rose Quartz'], defaultWarrantyMonths: 12 },
              { id: 'pix-9p', name: 'Pixel 9 Pro', colors: ['Obsidian', 'Porcelain', 'Hazel', 'Rose Quartz'], defaultWarrantyMonths: 12 },
              { id: 'pix-9', name: 'Pixel 9', colors: ['Obsidian', 'Porcelain', 'Wintergreen', 'Peony'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'vivo_flagship',
            name: 'Vivo',
            models: [
              { id: 'vivo-x100p', name: 'Vivo X100 Pro', colors: ['Asteroid Black', 'Sunset Orange', 'Startrail Blue'], defaultWarrantyMonths: 12 },
              { id: 'vivo-x100', name: 'Vivo X100', colors: ['Asteroid Black', 'Startrail Blue'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'honor_flagship',
            name: 'Honor',
            models: [
              { id: 'honor-m6p', name: 'Magic 6 Pro', colors: ['Epi Green', 'Black'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
      {
        id: 'mid_range_phones',
        name: 'Mid-Range Phones',
        brands: [
          {
            id: 'samsung_mid',
            name: 'Samsung',
            models: [
              { id: 'sam-a55', name: 'Galaxy A55 5G', colors: ['Awesome Ice Blue', 'Awesome Navy', 'Awesome Lilac', 'Awesome Lemon'], defaultWarrantyMonths: 12 },
              { id: 'sam-a35', name: 'Galaxy A35 5G', colors: ['Awesome Ice Blue', 'Awesome Navy', 'Awesome Lilac'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'xiaomi_mid',
            name: 'Xiaomi',
            models: [
              { id: 'mi-rn13p-plus', name: 'Redmi Note 13 Pro+ 5G', colors: ['Midnight Black', 'Moonlight White', 'Aurora Purple'], defaultWarrantyMonths: 12 },
              { id: 'mi-rn13p', name: 'Redmi Note 13 Pro 5G', colors: ['Midnight Black', 'Ocean Teal', 'Aurora Purple'], defaultWarrantyMonths: 12 },
              { id: 'mi-rn13', name: 'Redmi Note 13', colors: ['Midnight Black', 'Mint Green', 'Ice Blue'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'vivo_mid',
            name: 'Vivo',
            models: [
              { id: 'vivo-v30', name: 'Vivo V30 5G', colors: ['Waving Aqua', 'Lush Green', 'Noble Black'], defaultWarrantyMonths: 12 },
              { id: 'vivo-v30e', name: 'Vivo V30e', colors: ['Coco Brown', 'Velvet Red'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'oppo_mid',
            name: 'Oppo',
            models: [
              { id: 'oppo-reno12p', name: 'Reno 12 Pro 5G', colors: ['Nebula Silver', 'Space Brown'], defaultWarrantyMonths: 12 },
              { id: 'oppo-reno12', name: 'Reno 12 5G', colors: ['Astro Silver', 'Sunset Pink', 'Matte Brown'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'realme_mid',
            name: 'Realme',
            models: [
              { id: 'realme-12p', name: 'Realme 12 Pro+ 5G', colors: ['Submarine Blue', 'Navigator Beige'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
      {
        id: 'budget_entry_phones',
        name: 'Budget Entry Phones',
        brands: [
          {
            id: 'xiaomi_budget',
            name: 'Xiaomi',
            models: [
              { id: 'redmi-13c', name: 'Redmi 13C', colors: ['Midnight Black', 'Navy Blue', 'Glacier White', 'Clover Green'], defaultWarrantyMonths: 12 },
              { id: 'redmi-a3', name: 'Redmi A3', colors: ['Midnight Black', 'Forest Green', 'Star Blue'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'samsung_budget',
            name: 'Samsung',
            models: [
              { id: 'sam-a15', name: 'Galaxy A15', colors: ['Blue Black', 'Light Blue', 'Yellow'], defaultWarrantyMonths: 12 },
              { id: 'sam-a05s', name: 'Galaxy A05s', colors: ['Black', 'Silver', 'Light Green'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'tecno_budget',
            name: 'Tecno',
            models: [
              { id: 'tecno-spark20', name: 'Spark 20', colors: ['Gravity Black', 'Cyber White', 'Neon Gold'], defaultWarrantyMonths: 12 },
              { id: 'tecno-pop8', name: 'Pop 8', colors: ['Mystery White', 'Alpenglow Gold', 'Gravity Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'infinix_budget',
            name: 'Infinix',
            models: [
              { id: 'inf-hot40', name: 'Hot 40 Pro', colors: ['Horizon Gold', 'Starlit Black', 'Palm Blue'], defaultWarrantyMonths: 12 },
              { id: 'inf-smart8', name: 'Smart 8', colors: ['Timber Black', 'Shiny Gold', 'Crystal Green'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
      {
        id: 'foldable_flip_phones',
        name: 'Foldable & Flip Phones',
        brands: [
          {
            id: 'samsung_fold',
            name: 'Samsung',
            models: [
              { id: 'sam-zfold6', name: 'Galaxy Z Fold 6', colors: ['Silver Shadow', 'Navy', 'Pink'], defaultWarrantyMonths: 12 },
              { id: 'sam-zflip6', name: 'Galaxy Z Flip 6', colors: ['Blue', 'Yellow', 'Mint', 'Silver Shadow'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'honor_fold',
            name: 'Honor',
            models: [
              { id: 'honor-v3', name: 'Magic V3 Slim Fold', colors: ['Black', 'Green', 'Silk Brown'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'oppo_fold',
            name: 'Oppo',
            models: [
              { id: 'oppo-findn3', name: 'Find N3 Fold', colors: ['Classic Black', 'Champagne Gold'], defaultWarrantyMonths: 12 },
              { id: 'oppo-findn3flip', name: 'Find N3 Flip', colors: ['Cream Gold', 'Sleek Black', 'Misty Pink'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
      {
        id: 'gaming_phones',
        name: 'Gaming Phones',
        brands: [
          {
            id: 'asus_rog',
            name: 'Asus ROG',
            models: [
              { id: 'rog-8pro', name: 'ROG Phone 8 Pro', colors: ['Phantom Black'], defaultWarrantyMonths: 12 },
              { id: 'rog-8', name: 'ROG Phone 8', colors: ['Rebel Grey', 'Phantom Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'redmagic',
            name: 'Nubia RedMagic',
            models: [
              { id: 'rm-9pro', name: 'RedMagic 9 Pro', colors: ['Sleet', 'Snowfall', 'Cyclone'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'poco_gaming',
            name: 'Poco',
            models: [
              { id: 'poco-f6p', name: 'Poco F6 Pro', colors: ['Black', 'White'], defaultWarrantyMonths: 12 },
              { id: 'poco-x6p', name: 'Poco X6 Pro', colors: ['Black', 'Yellow', 'Grey'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // LEVEL 1: PRE-OWNED PHONES
  // ==========================================
  {
    id: 'pre_owned_phones',
    name: 'Pre-owned Phones',
    iconName: 'RefreshCw',
    description: 'Second-hand smartphones with condition grading and battery health rating',
    isPhone: true,
    subCategories: [
      {
        id: 'used_flagship_a_plus',
        name: 'Grade A+ (Like New 99%)',
        brands: [
          {
            id: 'apple_used_a_plus',
            name: 'Apple',
            models: [
              { id: 'used-iph-15-pm', name: 'iPhone 15 Pro Max', colors: ['Natural Titanium', 'Blue Titanium', 'Black Titanium'], defaultWarrantyMonths: 3 },
              { id: 'used-iph-15-p', name: 'iPhone 15 Pro', colors: ['Natural Titanium', 'White Titanium', 'Black Titanium'], defaultWarrantyMonths: 3 },
              { id: 'used-iph-14-pm', name: 'iPhone 14 Pro Max', colors: ['Deep Purple', 'Space Black', 'Gold', 'Silver'], defaultWarrantyMonths: 3 },
              { id: 'used-iph-14-p', name: 'iPhone 14 Pro', colors: ['Deep Purple', 'Space Black', 'Silver'], defaultWarrantyMonths: 3 },
              { id: 'used-iph-13-pm', name: 'iPhone 13 Pro Max', colors: ['Sierra Blue', 'Graphite', 'Gold', 'Alpine Green'], defaultWarrantyMonths: 3 },
              { id: 'used-iph-13', name: 'iPhone 13', colors: ['Midnight Blue', 'Starlight', 'Pink', 'Green'], defaultWarrantyMonths: 3 },
            ],
          },
          {
            id: 'samsung_used_a_plus',
            name: 'Samsung',
            models: [
              { id: 'used-sam-s23u', name: 'Galaxy S23 Ultra', colors: ['Phantom Black', 'Cream', 'Green', 'Lavender'], defaultWarrantyMonths: 3 },
              { id: 'used-sam-s22u', name: 'Galaxy S22 Ultra', colors: ['Phantom Black', 'Burgundy', 'Green', 'White'], defaultWarrantyMonths: 3 },
            ],
          },
          {
            id: 'google_used_a_plus',
            name: 'Google Pixel',
            models: [
              { id: 'used-pix-8p', name: 'Pixel 8 Pro', colors: ['Obsidian', 'Porcelain', 'Bay Blue'], defaultWarrantyMonths: 3 },
              { id: 'used-pix-7p', name: 'Pixel 7 Pro', colors: ['Obsidian', 'Snow', 'Hazel'], defaultWarrantyMonths: 3 },
            ],
          },
        ],
      },
      {
        id: 'used_mid_grade_a',
        name: 'Grade A (Excellent 95%)',
        brands: [
          {
            id: 'apple_used_a',
            name: 'Apple',
            models: [
              { id: 'used-iph-12-pm', name: 'iPhone 12 Pro Max', colors: ['Pacific Blue', 'Graphite', 'Gold', 'Silver'], defaultWarrantyMonths: 1 },
              { id: 'used-iph-12', name: 'iPhone 12', colors: ['Black', 'White', 'Blue', 'Purple'], defaultWarrantyMonths: 1 },
              { id: 'used-iph-11-pm', name: 'iPhone 11 Pro Max', colors: ['Midnight Green', 'Space Gray', 'Gold'], defaultWarrantyMonths: 1 },
              { id: 'used-iph-11', name: 'iPhone 11', colors: ['Black', 'White', 'Purple', 'Yellow'], defaultWarrantyMonths: 1 },
            ],
          },
          {
            id: 'samsung_used_a',
            name: 'Samsung',
            models: [
              { id: 'used-sam-s21fe', name: 'Galaxy S21 FE 5G', colors: ['Graphite', 'Olive', 'Lavender', 'White'], defaultWarrantyMonths: 1 },
              { id: 'used-sam-note20u', name: 'Galaxy Note 20 Ultra', colors: ['Mystic Bronze', 'Mystic Black'], defaultWarrantyMonths: 1 },
            ],
          },
          {
            id: 'xiaomi_used_a',
            name: 'Xiaomi',
            models: [
              { id: 'used-mi-13p', name: 'Xiaomi 13 Pro', colors: ['Ceramic Black', 'Ceramic White'], defaultWarrantyMonths: 1 },
              { id: 'used-mi-12t', name: 'Xiaomi 12T Pro', colors: ['Black', 'Silver', 'Blue'], defaultWarrantyMonths: 1 },
            ],
          },
        ],
      },
      {
        id: 'used_budget_grade_b',
        name: 'Grade B (Good 90%)',
        brands: [
          {
            id: 'apple_used_b',
            name: 'Apple',
            models: [
              { id: 'used-iph-xs-max', name: 'iPhone XS Max', colors: ['Space Gray', 'Gold', 'Silver'], defaultWarrantyMonths: 1 },
              { id: 'used-iph-xr', name: 'iPhone XR', colors: ['Black', 'White', 'Red', 'Coral', 'Blue'], defaultWarrantyMonths: 1 },
            ],
          },
          {
            id: 'samsung_used_b',
            name: 'Samsung',
            models: [
              { id: 'used-sam-s20p', name: 'Galaxy S20+', colors: ['Cosmic Black', 'Cloud Blue'], defaultWarrantyMonths: 1 },
              { id: 'used-sam-a52s', name: 'Galaxy A52s 5G', colors: ['Awesome Black', 'Awesome Violet'], defaultWarrantyMonths: 1 },
            ],
          },
        ],
      },
      {
        id: 'refurbished_phones',
        name: 'Certified Refurbished',
        brands: [
          {
            id: 'apple_refurb',
            name: 'Apple',
            models: [
              { id: 'refurb-iph-13', name: 'iPhone 13 (Refurbished)', colors: ['Midnight', 'Starlight'], defaultWarrantyMonths: 6 },
              { id: 'refurb-iph-12', name: 'iPhone 12 (Refurbished)', colors: ['Black', 'White'], defaultWarrantyMonths: 6 },
            ],
          },
          {
            id: 'samsung_refurb',
            name: 'Samsung',
            models: [
              { id: 'refurb-sam-s22', name: 'Galaxy S22 (Refurbished)', colors: ['Phantom Black', 'Green'], defaultWarrantyMonths: 6 },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // LEVEL 1: ACCESSORIES & GADGETS
  // ==========================================
  {
    id: 'accessories_gadgets',
    name: 'Accessories & Gadgets',
    iconName: 'Headphones',
    description: 'Fast chargers, high-capacity power banks, audio gear, protective cases, and cables',
    isPhone: false,
    subCategories: [
      {
        id: 'chargers_adapters',
        name: 'Fast Chargers & Adapters',
        brands: [
          {
            id: 'anker_chargers',
            name: 'Anker',
            models: [
              { id: 'ank-nano-30w', name: 'Nano II 30W GaN Fast Charger', colors: ['White', 'Black'], defaultWarrantyMonths: 18 },
              { id: 'ank-735-65w', name: '735 Charger (GaNPrime 65W 3-Port)', colors: ['Black', 'Silver'], defaultWarrantyMonths: 18 },
              { id: 'ank-prime-100w', name: 'Prime 100W GaN Wall Charger', colors: ['Space Gray'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'baseus_chargers',
            name: 'Baseus',
            models: [
              { id: 'bas-gan5-65w', name: 'GaN5 Pro 65W Fast Charger (2C+1A)', colors: ['White', 'Black'], defaultWarrantyMonths: 12 },
              { id: 'bas-super-si-30w', name: 'Super Si 30W Compact Charger', colors: ['White', 'Black', 'Blue'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'ugreen_chargers',
            name: 'Ugreen',
            models: [
              { id: 'ugr-nexode-65w', name: 'Nexode 65W GaN Fast Charger', colors: ['Space Gray'], defaultWarrantyMonths: 12 },
              { id: 'ugr-nexode-100w', name: 'Nexode 100W 4-Port Desktop Charger', colors: ['Space Gray'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'apple_chargers',
            name: 'Apple',
            models: [
              { id: 'app-20w-adapter', name: '20W USB-C Power Adapter', colors: ['White'], defaultWarrantyMonths: 12 },
              { id: 'app-35w-dual', name: '35W Dual USB-C Port Compact Adapter', colors: ['White'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'samsung_chargers',
            name: 'Samsung',
            models: [
              { id: 'sam-45w-adapter', name: '45W Power Adapter with USB-C Cable', colors: ['Black', 'White'], defaultWarrantyMonths: 12 },
              { id: 'sam-25w-adapter', name: '25W Super Fast Charger Type-C', colors: ['Black', 'White'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'remax_chargers',
            name: 'Remax',
            models: [
              { id: 'rmx-rp-u123', name: 'RP-U123 65W Multi-Port GaN Adapter', colors: ['Yellow', 'Black'], defaultWarrantyMonths: 6 },
            ],
          },
        ],
      },
      {
        id: 'power_banks',
        name: 'Power Banks',
        brands: [
          {
            id: 'joyroom_power',
            name: 'Joyroom',
            models: [
              { id: 'joy-t014-20k', name: 'JR-T014 20,000mAh 22.5W Fast Power Bank', colors: ['Black', 'White'], defaultWarrantyMonths: 6 },
              { id: 'joy-w020-10k', name: 'JR-W020 10,000mAh 20W MagSafe Wireless Bank', colors: ['Purple', 'Black', 'White'], defaultWarrantyMonths: 6 },
              { id: 'joy-t015-30k', name: 'JR-T015 30,000mAh Heavy Duty Power Bank', colors: ['Black'], defaultWarrantyMonths: 6 },
            ],
          },
          {
            id: 'anker_power',
            name: 'Anker',
            models: [
              { id: 'ank-pc-20k', name: 'PowerCore 20,000mAh PD 20W', colors: ['Black', 'White'], defaultWarrantyMonths: 18 },
              { id: 'ank-prime-20k', name: 'Prime 20,000mAh 200W Output Bank', colors: ['Black'], defaultWarrantyMonths: 24 },
              { id: 'ank-maggo-10k', name: 'MagGo 10,000mAh Qi2 Foldable Stand Bank', colors: ['Shell White', 'Black'], defaultWarrantyMonths: 18 },
            ],
          },
          {
            id: 'baseus_power',
            name: 'Baseus',
            models: [
              { id: 'bas-blade-100w', name: 'Blade 100W Ultra-Thin Laptop Power Bank', colors: ['Black'], defaultWarrantyMonths: 12 },
              { id: 'bas-adaman-20k', name: 'Adaman 20,000mAh Metal Digital Display 65W', colors: ['Black', 'Teal'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'remax_power',
            name: 'Remax',
            models: [
              { id: 'rmx-rpp-522', name: 'RPP-522 30,000mAh Fast Power Bank', colors: ['White', 'Blue'], defaultWarrantyMonths: 6 },
              { id: 'rmx-rpp-291', name: 'RPP-291 80,000mAh Mega Outdoor Station', colors: ['Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'xiaomi_power',
            name: 'Xiaomi',
            models: [
              { id: 'mi-pb-20k-50w', name: 'Mi 50W 20,000mAh Fast Power Bank', colors: ['Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'hoco_power',
            name: 'Hoco',
            models: [
              { id: 'hoco-b35e-30k', name: 'B35E 30,000mAh LED Screen Power Bank', colors: ['Black', 'White'], defaultWarrantyMonths: 6 },
            ],
          },
        ],
      },
      {
        id: 'earbuds_audio',
        name: 'Wireless Earbuds & Audio',
        brands: [
          {
            id: 'apple_audio',
            name: 'Apple',
            models: [
              { id: 'app-airp-pro2', name: 'AirPods Pro 2 (USB-C Case)', colors: ['White'], defaultWarrantyMonths: 12 },
              { id: 'app-airp-4', name: 'AirPods 4 with Active Noise Cancellation', colors: ['White'], defaultWarrantyMonths: 12 },
              { id: 'app-airp-max', name: 'AirPods Max (USB-C)', colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Orange'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'samsung_audio',
            name: 'Samsung',
            models: [
              { id: 'sam-buds-3pro', name: 'Galaxy Buds 3 Pro', colors: ['Silver', 'White'], defaultWarrantyMonths: 12 },
              { id: 'sam-buds-2pro', name: 'Galaxy Buds 2 Pro', colors: ['Graphite', 'White', 'Bora Purple'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'sony_audio',
            name: 'Sony',
            models: [
              { id: 'sony-wf1000xm5', name: 'WF-1000XM5 Industry Leading ANC Earbuds', colors: ['Black', 'Silver'], defaultWarrantyMonths: 12 },
              { id: 'sony-wh1000xm5', name: 'WH-1000XM5 Wireless Noise Canceling Headphones', colors: ['Black', 'Silver', 'Midnight Blue'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'soundcore_audio',
            name: 'Anker Soundcore',
            models: [
              { id: 'ank-liberty-4nc', name: 'Soundcore Liberty 4 NC', colors: ['Velvet Black', 'Clear White', 'Light Blue', 'Pastel Pink'], defaultWarrantyMonths: 12 },
              { id: 'ank-space-one', name: 'Soundcore Space One ANC Headphones', colors: ['Jet Black', 'Sky Blue', 'Latte Cream'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'hoco_audio',
            name: 'Hoco',
            models: [
              { id: 'hoco-ew51', name: 'EW51 ANC True Wireless Earbuds', colors: ['Glossy White'], defaultWarrantyMonths: 6 },
            ],
          },
          {
            id: 'jbl_audio',
            name: 'JBL',
            models: [
              { id: 'jbl-flip6', name: 'Flip 6 Waterproof Portable Bluetooth Speaker', colors: ['Black', 'Blue', 'Red', 'Squad Camo'], defaultWarrantyMonths: 12 },
              { id: 'jbl-charge5', name: 'Charge 5 Bluetooth Speaker with Powerbank', colors: ['Black', 'Blue', 'Grey'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
      {
        id: 'cables_connectors',
        name: 'Cables & Connectors',
        brands: [
          {
            id: 'ugreen_cables',
            name: 'Ugreen',
            models: [
              { id: 'ugr-us286-60w', name: 'US286 Braided 60W USB-C to USB-C Cable (1.5m)', colors: ['Space Gray', 'Silver'], defaultWarrantyMonths: 12 },
              { id: 'ugr-100w-braided', name: '100W 5A E-Marker Braided USB-C Cable (2m)', colors: ['Space Gray'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'anker_cables',
            name: 'Anker',
            models: [
              { id: 'ank-powerline-flow', name: 'PowerLine III Flow Silicone USB-C (1.8m)', colors: ['Cloud White', 'Midnight Black', 'Misty Blue'], defaultWarrantyMonths: 18 },
            ],
          },
          {
            id: 'baseus_cables',
            name: 'Baseus',
            models: [
              { id: 'bas-cafule-100w', name: 'Cafule Series 100W PD Fast Charging Cable', colors: ['Black & Red', 'Dark Gray'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'remax_cables',
            name: 'Remax',
            models: [
              { id: 'rmx-rc-190', name: 'RC-190 Multifunction Cable Storage Box 60W', colors: ['Black', 'White'], defaultWarrantyMonths: 6 },
            ],
          },
        ],
      },
      {
        id: 'cases_covers',
        name: 'Cases & Covers',
        brands: [
          {
            id: 'baseus_cases',
            name: 'Baseus',
            models: [
              { id: 'bas-cs-silicone', name: 'MagSafe Liquid Silicone Protective Case', colors: ['Midnight Black', 'Pine Green', 'Navy Blue', 'Pink'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'spigen_cases',
            name: 'Spigen',
            models: [
              { id: 'spg-ultra-hybrid', name: 'Ultra Hybrid MagFit Clear Case', colors: ['Crystal Clear', 'Matte Black Rim', 'Zero One'], defaultWarrantyMonths: 0 },
              { id: 'spg-tough-armor', name: 'Tough Armor Kickstand Case', colors: ['Gunmetal', 'Black', 'Abyss Green'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'nillkin_cases',
            name: 'Nillkin',
            models: [
              { id: 'nil-camshield-prop', name: 'CamShield Prop Magnetic Case with Camera Stand', colors: ['Black', 'Blue', 'Green'], defaultWarrantyMonths: 0 },
            ],
          },
        ],
      },
      {
        id: 'screen_protectors',
        name: 'Screen Protectors',
        brands: [
          {
            id: 'remax_glass',
            name: 'Remax',
            models: [
              { id: 'rmx-9d-glass', name: 'King Kong 9D Full Cover Tempered Glass', colors: ['Clear HD', 'Privacy Anti-Spy', 'Matte Gaming'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'nillkin_glass',
            name: 'Nillkin',
            models: [
              { id: 'nil-h-plus-pro', name: 'Amazing H+ Pro 0.2mm 9H Tempered Glass', colors: ['Clear HD'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'hoco_glass',
            name: 'Hoco',
            models: [
              { id: 'hoco-g1-glass', name: 'G1 Gorilla Glass High-Alumina Shield', colors: ['Clear HD'], defaultWarrantyMonths: 0 },
            ],
          },
        ],
      },
      {
        id: 'car_mounts',
        name: 'Car Mounts & Holders',
        brands: [
          {
            id: 'joyroom_mounts',
            name: 'Joyroom',
            models: [
              { id: 'joy-zs291-mount', name: 'JR-ZS291 MagSafe Auto-Clamping Car Mount', colors: ['Carbon Black'], defaultWarrantyMonths: 6 },
            ],
          },
          {
            id: 'baseus_mounts',
            name: 'Baseus',
            models: [
              { id: 'bas-metal-age', name: 'Metal Age 3 Gravity Air Vent Phone Mount', colors: ['Dark Space Gray', 'Silver'], defaultWarrantyMonths: 6 },
            ],
          },
        ],
      },
      {
        id: 'smartwatches_wearables',
        name: 'Smartwatches & Fitness Bands',
        brands: [
          {
            id: 'apple_watch',
            name: 'Apple',
            models: [
              { id: 'app-w-ultra2', name: 'Apple Watch Ultra 2 (49mm Titanium)', colors: ['Natural Titanium', 'Black Titanium'], defaultWarrantyMonths: 12 },
              { id: 'app-w-s10', name: 'Apple Watch Series 10 (46mm / 42mm)', colors: ['Jet Black', 'Rose Gold', 'Silver Aluminum'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'samsung_watch',
            name: 'Samsung',
            models: [
              { id: 'sam-w-ultra', name: 'Galaxy Watch Ultra (47mm Titanium)', colors: ['Titanium Gray', 'Titanium White', 'Titanium Silver'], defaultWarrantyMonths: 12 },
              { id: 'sam-w-6classic', name: 'Galaxy Watch 6 Classic with Rotating Bezel', colors: ['Black', 'Silver'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'xiaomi_watch',
            name: 'Xiaomi',
            models: [
              { id: 'mi-band-9', name: 'Smart Band 9 AMOLED Fitness Tracker', colors: ['Midnight Black', 'Glacier Silver', 'Mystic Rose', 'Arctic Blue'], defaultWarrantyMonths: 12 },
              { id: 'mi-watch-s3', name: 'Watch S3 with Interchangeable Bezel', colors: ['Black', 'Silver'], defaultWarrantyMonths: 12 },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // LEVEL 1: COOKWARE
  // ==========================================
  {
    id: 'cookware',
    name: 'Cookware',
    iconName: 'Utensils',
    description: 'Electric pressure cookers, smart multicookers, non-stick cookware, kettles, and blenders',
    isPhone: false,
    subCategories: [
      {
        id: 'electric_multicookers',
        name: 'Electric Cookers & Multicookers',
        brands: [
          {
            id: 'philips_cook',
            name: 'Philips',
            models: [
              { id: 'phi-hd2137', name: 'HD2137 All-in-One Multicooker 6L (1000W)', colors: ['Stainless Steel Silver', 'Matte Black'], defaultWarrantyMonths: 24 },
              { id: 'phi-hd4515', name: 'HD4515 Fuzzy Logic Smart Rice Cooker 1.8L', colors: ['Glossy White', 'Nordic Green'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'midea_cook',
            name: 'Midea',
            models: [
              { id: 'mid-fs5017', name: 'MB-FS5017 Smart Microcomputer Rice Cooker 1.8L', colors: ['Brushed Champagne Gold', 'White'], defaultWarrantyMonths: 12 },
              { id: 'mid-my-ss5062', name: 'MY-SS5062 Electric Pressure Cooker 5L', colors: ['Stainless Steel Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'xiaomi_mijia_cook',
            name: 'Xiaomi Mijia',
            models: [
              { id: 'mijia-rice-cooker-3l', name: 'Smart Rice Cooker 3L (App Controlled)', colors: ['Minimalist White'], defaultWarrantyMonths: 12 },
              { id: 'mijia-cooking-pot', name: 'Smart Multi-Function Electric Hot Pot 4L', colors: ['White'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'panasonic_cook',
            name: 'Panasonic',
            models: [
              { id: 'pan-sr-df181', name: 'SR-DF181 Fuzzy Logic Electronic Rice Cooker 1.8L', colors: ['White'], defaultWarrantyMonths: 12 },
              { id: 'pan-sr-jn185', name: 'SR-JN185 Jar Rice Cooker 1.8L', colors: ['Silver Floral', 'Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'tefal_cook',
            name: 'Tefal',
            models: [
              { id: 'tef-spherical-cooker', name: 'Spherical Bowl Smart Rice Cooker 1.8L RK7321', colors: ['White & Silver'], defaultWarrantyMonths: 24 },
            ],
          },
        ],
      },
      {
        id: 'pressure_cookers',
        name: 'Pressure Cookers',
        brands: [
          {
            id: 'tefal_pressure',
            name: 'Tefal',
            models: [
              { id: 'tef-secure5-6l', name: 'Secure 5 Neo Stainless Steel Pressure Cooker 6L', colors: ['Stainless Steel Mirror Finish'], defaultWarrantyMonths: 60 },
              { id: 'tef-clipso-plus', name: 'Clipso Minut Easy Pressure Cooker 7.5L', colors: ['Brushed Steel & Red Lid'], defaultWarrantyMonths: 60 },
            ],
          },
          {
            id: 'philips_pressure',
            name: 'Philips',
            models: [
              { id: 'phi-hd2151', name: 'HD2151 All-in-One High Pressure Cooker 5L', colors: ['Midnight Black & Copper Trim'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'prestige_pressure',
            name: 'Prestige',
            models: [
              { id: 'prs-deluxe-alpha', name: 'Deluxe Alpha Hard Anodized Pressure Cooker 5.5L', colors: ['Hard Anodized Matte Black'], defaultWarrantyMonths: 60 },
            ],
          },
        ],
      },
      {
        id: 'frying_pans_skillets',
        name: 'Frying Pans & Skillets',
        brands: [
          {
            id: 'tefal_pans',
            name: 'Tefal',
            models: [
              { id: 'tef-ingenio-28', name: 'Ingenio Titanium Non-Stick Frying Pan 28cm', colors: ['Charcoal Black'], defaultWarrantyMonths: 24 },
              { id: 'tef-daily-cook-24', name: 'Daily Cook Stainless Steel Induction Frypan 24cm', colors: ['Stainless Steel'], defaultWarrantyMonths: 24 },
              { id: 'tef-unlimited-wok-28', name: 'Unlimited Anti-Scratch Deep Wok Pan 28cm', colors: ['Matte Black with Thermo-Signal'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'lock_n_lock_pans',
            name: 'Lock&Lock',
            models: [
              { id: 'lnl-hard-light-30', name: 'Hard & Light Induction Wok 30cm', colors: ['Dark Gray Non-Stick'], defaultWarrantyMonths: 12 },
              { id: 'lnl-deco-pan-26', name: 'Deco Ceramic Non-Stick Frying Pan 26cm', colors: ['Sage Mint Green', 'Pastel Pink', 'Cream'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'zwilling_pans',
            name: 'Zwilling',
            models: [
              { id: 'zwl-madura-plus-28', name: 'Madura Plus Duraslide Granite Fry Pan 28cm', colors: ['Granite Slate Gray'], defaultWarrantyMonths: 36 },
            ],
          },
          {
            id: 'supor_pans',
            name: 'Supor',
            models: [
              { id: 'sup-honeycomb-wok', name: '316L Stainless Steel Honeycomb Non-Stick Wok 32cm', colors: ['Laser Honeycomb Silver'], defaultWarrantyMonths: 24 },
            ],
          },
        ],
      },
      {
        id: 'kettles_tea_makers',
        name: 'Electric Kettles & Tea Makers',
        brands: [
          {
            id: 'philips_kettles',
            name: 'Philips',
            models: [
              { id: 'phi-hd9306', name: 'HD9306 Food-Grade Stainless Steel Kettle 1.5L', colors: ['Brushed Stainless Steel'], defaultWarrantyMonths: 24 },
              { id: 'phi-hd9350', name: 'HD9350 Daily Collection Metal Kettle 1.7L', colors: ['Stainless Steel Silver'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'xiaomi_mijia_kettles',
            name: 'Xiaomi Mijia',
            models: [
              { id: 'mijia-kettle-2', name: 'Electric Kettle 2 Double Wall Anti-Scald 1.7L', colors: ['Pure White'], defaultWarrantyMonths: 12 },
              { id: 'mijia-smart-temp-kettle', name: 'Smart Temperature Control Kettle Pro 1.5L', colors: ['Pure White with OLED Screen'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'midea_kettles',
            name: 'Midea',
            models: [
              { id: 'mid-mk-17s26c', name: 'MK-17S26C Fast Boil Cool-Touch Kettle 1.7L', colors: ['Matte Black', 'Light Blue'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'kenwood_kettles',
            name: 'Kenwood',
            models: [
              { id: 'ken-k-mix-kettle', name: 'kMix Boutique Design Stainless Kettle 1.0L', colors: ['Spicy Red', 'Rich Black', 'Cool White'], defaultWarrantyMonths: 24 },
            ],
          },
        ],
      },
      {
        id: 'blenders_processors',
        name: 'Blenders & Food Processors',
        brands: [
          {
            id: 'philips_blenders',
            name: 'Philips',
            models: [
              { id: 'phi-hr2221', name: 'HR2221 5000 Series 4-Star Blade Blender 2L', colors: ['Lavender White', 'Desert Green'], defaultWarrantyMonths: 24 },
              { id: 'phi-hr3652', name: 'HR3652 Avance Collection 1400W High Speed Blender', colors: ['Metallic Titanium Glass'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'panasonic_blenders',
            name: 'Panasonic',
            models: [
              { id: 'pan-mx-mg5421', name: 'MX-MG5421 Heavy-Duty Glass Jug Blender 2.0L', colors: ['Brushed Stainless & Black'], defaultWarrantyMonths: 12 },
              { id: 'pan-mx-ex1011', name: 'MX-EX1011 Daily Personal Blender 1.35L', colors: ['White'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'midea_blenders',
            name: 'Midea',
            models: [
              { id: 'mid-mj-bl1001a', name: 'MJ-BL1001A 800W Ice-Crushing Blender', colors: ['Stainless Steel'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'braun_blenders',
            name: 'Braun',
            models: [
              { id: 'brn-multiquick-9', name: 'MultiQuick 9 Hand Immersion Blender 1200W', colors: ['Black & Stainless Steel'], defaultWarrantyMonths: 24 },
            ],
          },
        ],
      },
      {
        id: 'air_fryers_ovens',
        name: 'Air Fryers & Ovens',
        brands: [
          {
            id: 'philips_airfryers',
            name: 'Philips',
            models: [
              { id: 'phi-hd9252', name: 'HD9252 Essential Airfryer Touchscreen 4.1L', colors: ['Glossy Black', 'White with Rose Gold'], defaultWarrantyMonths: 24 },
              { id: 'phi-hd9280', name: 'HD9280 Connected XL Airfryer 6.2L (WiFi App)', colors: ['Deep Black'], defaultWarrantyMonths: 24 },
            ],
          },
          {
            id: 'xiaomi_mijia_airfryers',
            name: 'Xiaomi Mijia',
            models: [
              { id: 'mijia-airfryer-pro-4l', name: 'Smart Air Fryer Pro 4L with Window', colors: ['Glossy White'], defaultWarrantyMonths: 12 },
              { id: 'mijia-airfryer-65l', name: 'Smart Air Fryer 6.5L Large Capacity', colors: ['Midnight Black'], defaultWarrantyMonths: 12 },
            ],
          },
          {
            id: 'tefal_airfryers',
            name: 'Tefal',
            models: [
              { id: 'tef-easyfry-precision', name: 'Easy Fry & Grill Precision 2-in-1 Air Fryer 4.2L', colors: ['Brushed Stainless Steel Black'], defaultWarrantyMonths: 24 },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // LEVEL 1: SIM CARDS
  // ==========================================
  {
    id: 'sim_cards',
    name: 'Sim Cards',
    iconName: 'CreditCard',
    description: 'Prepaid SIM starter cards, high-speed 5G tourist data packs, and eSIM digital profiles',
    isPhone: false,
    subCategories: [
      {
        id: 'tourist_data_sim',
        name: 'Tourist 5G Data SIM',
        brands: [
          {
            id: 'atom_tourist',
            name: 'ATOM',
            models: [
              { id: 'atom-tourist-10gb', name: 'ATOM 5G Tourist SIM + 10GB Data Pack', colors: ['Triple-Cut Physical SIM Card', 'eSIM QR Profile'], defaultWarrantyMonths: 0 },
              { id: 'atom-tourist-30gb', name: 'ATOM Super Tourist 30GB (30-Day Pass)', colors: ['Triple-Cut Physical SIM Card', 'eSIM QR Profile'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'mpt_tourist',
            name: 'MPT',
            models: [
              { id: 'mpt-tourist-15d', name: 'MPT Swe Thahar Tourist Pack 15-Day (15GB)', colors: ['Triple-Cut Physical SIM Card', 'eSIM QR Profile'], defaultWarrantyMonths: 0 },
              { id: 'mpt-tourist-30d', name: 'MPT Unlimited Tourist 30-Day Pass', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'ooredoo_tourist',
            name: 'Ooredoo',
            models: [
              { id: 'oor-tourist-15gb', name: 'Ooredoo Aww Ah Khaw Tourist 15GB + Calling', colors: ['Triple-Cut Physical SIM Card', 'eSIM QR Profile'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'mytel_tourist',
            name: 'Mytel',
            models: [
              { id: 'myt-tourist-20gb', name: 'Mytel 4G High-Speed Tourist 20GB Data Pack', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
            ],
          },
        ],
      },
      {
        id: 'prepaid_starter_sim',
        name: 'Prepaid Voice & Data SIM',
        brands: [
          {
            id: 'atom_prepaid',
            name: 'ATOM',
            models: [
              { id: 'atom-standard-starter', name: 'ATOM Standard 4G/5G Starter SIM (Preloaded 2,000 Ks)', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
              { id: 'atom-super-data-pass', name: 'ATOM Super Data 30-Day SIM Bundle', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'mpt_prepaid',
            name: 'MPT',
            models: [
              { id: 'mpt-swe-thahar-sim', name: 'MPT Swe Thahar 5G Standard Prepaid SIM', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
              { id: 'mpt-shal-sub-sim', name: 'MPT Shal Sub High Value Voice & Data SIM', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'ooredoo_prepaid',
            name: 'Ooredoo',
            models: [
              { id: 'oor-supernet-sim', name: 'Ooredoo Supernet 5G Starter SIM', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'mytel_prepaid',
            name: 'Mytel',
            models: [
              { id: 'myt-myid-starter', name: 'Mytel MyID 4G Standard Prepaid SIM', colors: ['Triple-Cut Physical SIM Card'], defaultWarrantyMonths: 0 },
            ],
          },
        ],
      },
      {
        id: 'esim_digital',
        name: 'eSIM Digital Profile',
        brands: [
          {
            id: 'atom_esim',
            name: 'ATOM',
            models: [
              { id: 'atom-esim-qr', name: 'ATOM Digital eSIM Instant QR Download', colors: ['Digital QR Activation Slip'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'mpt_esim',
            name: 'MPT',
            models: [
              { id: 'mpt-esim-qr', name: 'MPT Digital 5G eSIM Voucher Profile', colors: ['Digital QR Activation Slip'], defaultWarrantyMonths: 0 },
            ],
          },
          {
            id: 'ooredoo_esim',
            name: 'Ooredoo',
            models: [
              { id: 'oor-esim-qr', name: 'Ooredoo Instant 5G eSIM Profile Voucher', colors: ['Digital QR Activation Slip'], defaultWarrantyMonths: 0 },
            ],
          },
        ],
      },
    ],
  },
];

// Helper Query Functions with Strict Category Isolation

/**
 * Returns the HierarchyCategory node for a given category id or legacy alias
 */
export function getCategoryNode(categoryId: ProductCategory | string): HierarchyCategory | undefined {
  const norm = canonicalCategory(categoryId);
  return CATEGORY_TAXONOMY.find(c => c.id === norm);
}

/**
 * Returns available subcategories strictly belonging to the specified category
 */
export function getSubCategoriesForCategory(categoryId: ProductCategory | string): string[] {
  const node = getCategoryNode(categoryId);
  if (!node) return [];
  return node.subCategories.map(s => s.name);
}

/**
 * Returns available brands strictly belonging to the specified category and optional subcategory.
 * Zero data leakage: cookware brands will NEVER be returned for phone categories!
 */
export function getBrandsForCategory(
  categoryId: ProductCategory | string, 
  subCategoryName?: string
): string[] {
  const node = getCategoryNode(categoryId);
  if (!node) return [];

  const brandSet = new Set<string>();

  if (subCategoryName && subCategoryName !== 'all' && subCategoryName.trim()) {
    const sub = node.subCategories.find(
      s => s.name.toLowerCase() === subCategoryName.toLowerCase() || s.id === subCategoryName
    );
    if (sub) {
      sub.brands.forEach(b => brandSet.add(b.name));
      return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
    }
  }

  // If no subcategory specified or 'all', collect all brands that belong to this category's subcategories
  node.subCategories.forEach(sub => {
    sub.brands.forEach(b => brandSet.add(b.name));
  });

  return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns available models strictly belonging to the specified category, brand, and optional subcategory
 */
export function getModelsForBrand(
  categoryId: ProductCategory | string,
  brandName: string,
  subCategoryName?: string
): HierarchyModel[] {
  const node = getCategoryNode(categoryId);
  if (!node || !brandName || brandName === 'all') return [];

  const models: HierarchyModel[] = [];
  const cleanBrand = brandName.toLowerCase().trim();

  node.subCategories.forEach(sub => {
    if (subCategoryName && subCategoryName !== 'all' && subCategoryName.trim()) {
      if (sub.name.toLowerCase() !== subCategoryName.toLowerCase() && sub.id !== subCategoryName) {
        return;
      }
    }

    sub.brands.forEach(b => {
      if (b.name.toLowerCase() === cleanBrand) {
        b.models.forEach(m => {
          if (!models.some(existing => existing.name.toLowerCase() === m.name.toLowerCase())) {
            models.push(m);
          }
        });
      }
    });
  });

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns available colors/variants for a specific model under a category and brand
 */
export function getColorsForModel(
  categoryId: ProductCategory | string,
  brandName: string,
  modelName: string
): string[] {
  const models = getModelsForBrand(categoryId, brandName);
  const cleanModel = modelName.toLowerCase().trim();
  const matched = models.find(m => m.name.toLowerCase() === cleanModel || cleanModel.includes(m.name.toLowerCase()));
  if (matched && matched.colors && matched.colors.length > 0) {
    return matched.colors;
  }
  return [];
}

/**
 * Checks if a brand name legitimately belongs to a category
 */
export function isValidBrandForCategory(brandName: string, categoryId: ProductCategory | string): boolean {
  if (!brandName || !categoryId) return false;
  const validBrands = getBrandsForCategory(categoryId);
  const clean = brandName.toLowerCase().trim();
  return validBrands.some(b => b.toLowerCase() === clean);
}

/**
 * Human readable label for a category
 */
export function getTaxonomyCategoryLabel(categoryId: ProductCategory | string): string {
  const norm = canonicalCategory(categoryId);
  const found = CANONICAL_CATEGORIES.find(c => c.id === norm);
  return found ? found.label : categoryId;
}
