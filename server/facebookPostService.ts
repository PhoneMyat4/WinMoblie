import type OpenAI from 'openai';
import type { GoogleGenAI } from '@google/genai';
import type { Product, ShopSettings, FacebookAdPostRecord } from '../src/types/index';
import { detectProductKind, isPhoneProduct, buildProductVisualPrompt } from '../src/data/categoryTaxonomy';
import { generateTextWithAiFallback } from './aiFallbackWrapper';

export interface PostAdOptions {
  product_id?: string;
  product_query?: string;
  custom_ad_goal?: string;
  override_caption?: string;
  tone?: 'exciting_retail' | 'professional_tech' | 'urgent_discount' | 'bilingual_burmese_english';
  image_mode?: 'dalle_ai' | 'smart_flyer' | 'sample_photo';
}

/**
 * 1. Locates the targeted product in store inventory by ID, SKU, or search query.
 */
export function findProductForAd(
  options: { productId?: string; query?: string },
  products: Product[]
): Product | null {
  if (!products || products.length === 0) return null;

  const rawId = (options.productId || '').trim();
  const rawQuery = (options.query || '').trim();

  // 1. Direct ID match
  if (rawId) {
    const directMatch = products.find(
      (p) =>
        p.id.toLowerCase() === rawId.toLowerCase() ||
        p.id.toLowerCase() === `prod-${rawId.toLowerCase()}` ||
        p.sku.toLowerCase() === rawId.toLowerCase()
    );
    if (directMatch) return directMatch;
  }

  // 2. Query search
  const searchQuery = (rawQuery || rawId).toLowerCase();
  if (!searchQuery) {
    // Return the first flagship / in-stock product if no specific query
    return products.find((p) => p.stock > 0) || products[0];
  }

  // Score candidate products
  const scored = products.map((prod) => {
    let score = 0;
    const name = (prod.name || '').toLowerCase();
    const brand = (prod.brand || '').toLowerCase();
    const model = (prod.model || '').toLowerCase();
    const sku = (prod.sku || '').toLowerCase();
    const id = (prod.id || '').toLowerCase();

    if (id === searchQuery) score += 100;
    if (sku === searchQuery) score += 90;
    if (name === searchQuery) score += 80;
    if (name.includes(searchQuery)) score += 50;
    if (model.includes(searchQuery)) score += 40;
    if (brand.includes(searchQuery)) score += 30;
    if (sku.includes(searchQuery)) score += 35;

    // Check individual tokens
    const tokens = searchQuery.split(/\s+/).filter(Boolean);
    tokens.forEach((token) => {
      if (name.includes(token)) score += 15;
      if (brand.includes(token)) score += 10;
      if (model.includes(token)) score += 10;
      if (sku.includes(token)) score += 10;
      if (id.includes(token)) score += 10;
    });

    return { product: prod, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.length > 0 && scored[0].score > 0 ? scored[0].product : null;
}

/**
 * 2. Generates an engaging, high-converting social media advertising caption with AI.
 */
export async function generateSocialAdCaption(params: {
  product: Product;
  settings?: ShopSettings;
  goal?: string;
  tone?: string;
  openai?: OpenAI | null;
  genai?: GoogleGenAI | null;
}): Promise<string> {
  const { product, settings, goal = 'new_arrival', tone = 'exciting_retail', openai, genai } = params;

  const storeName = settings?.shopName || 'Win Mobile & Gadgets';
  const currency = settings?.currencySymbol || 'MMK';
  const hotline = settings?.phone || settings?.whatsappNumber || '09-798123456';
  const address = settings?.address ? `${settings.address}, ${settings.cityCountry || ''}` : 'Yangon, Myanmar';
  const formattedPrice = `${product.sellingPrice.toLocaleString()} ${currency}`;
  const kind = detectProductKind(product);

  let specsList: string[] = [];
  let categoryLabel = 'Electronics / Gadget';
  let featureGuidance = '';
  let negativeRule = '';
  let headlineEmoji = '🔥';

  switch (kind) {
    case 'charger':
      categoryLabel = 'Fast Charger & Power Adapter (Accessory)';
      headlineEmoji = '⚡';
      specsList = [
        product.model ? `Power / Output: ${product.model}` : null,
        'High-Speed Fast Charging Protocol (PD / QC)',
        'Intelligent Multi-Protection (Overvoltage, Short Circuit, Heat Control)',
        product.color && product.color !== '-' && product.color.toLowerCase() !== 'standard' ? `Color: ${product.color}` : null,
        product.condition ? `Condition: ${product.condition.replace(/_/g, ' ')}` : 'Brand New Sealed',
        product.warrantyMonths ? `Warranty: ${product.warrantyMonths} Months Official Store Warranty` : 'Official Warranty Included',
      ].filter(Boolean) as string[];
      featureGuidance = `
- Emphasize rapid charging speed, compact GaN/travel-friendly design, high wattage efficiency, and safety chip protection.
- Highlight universal compatibility across smartphones (iPhone, Samsung, Xiaomi), tablets, and other USB devices.`;
      negativeRule = `
CRITICAL CATEGORY ACCURACY RULE:
THIS PRODUCT IS A FAST CHARGER / ACCESSORY! IT IS NOT A SMARTPHONE!
You are STRICTLY FORBIDDEN from mentioning RAM, Storage/ROM, camera megapixels, zoom, selfie cameras, or smartphone screen displays! Focus strictly on charging speed, wattage, safety, and durability.`;
      break;

    case 'cable':
      categoryLabel = 'High-Speed Charging Cable';
      headlineEmoji = '🔌';
      specsList = [
        'Fast Power Delivery & High-Speed Data Sync',
        'Reinforced Braided Durability & Bend-Tested',
        product.color && product.color !== '-' ? `Color: ${product.color}` : null,
        product.condition ? `Condition: ${product.condition.replace(/_/g, ' ')}` : 'Brand New',
        product.warrantyMonths ? `Warranty: ${product.warrantyMonths} Months Warranty` : 'Store Warranty Included',
      ].filter(Boolean) as string[];
      featureGuidance = '- Emphasize bend resistance, fast data transfer, and strong connectors.';
      negativeRule = 'CRITICAL: THIS IS A CABLE! DO NOT mention RAM, ROM, phone cameras, or screens!';
      break;

    case 'power_bank':
      categoryLabel = 'Portable Power Bank / External Battery';
      headlineEmoji = '🔋';
      specsList = [
        'High-Capacity Portable Battery Backup',
        'Multiple Output Ports & Fast Dual-Way Recharging',
        'Smart Safety Multi-Protection & LED Battery Display',
        product.color && product.color !== '-' ? `Color: ${product.color}` : null,
        product.warrantyMonths ? `Warranty: ${product.warrantyMonths} Months Warranty` : 'Store Warranty Included',
      ].filter(Boolean) as string[];
      featureGuidance = '- Emphasize battery capacity, portable convenience for travel, and flight-approved safety.';
      negativeRule = 'CRITICAL: THIS IS A POWER BANK! DO NOT mention RAM, ROM, phone cameras, or screens!';
      break;

    case 'audio':
      categoryLabel = 'Wireless Audio / Headphones / Earbuds';
      headlineEmoji = '🎵';
      specsList = [
        'Acoustic Hi-Fi Sound & Deep Punchy Bass',
        'Long Playtime Battery Life with Charging Case',
        'Ergonomic Comfort Fit & Crystal Clear Calling Mic',
        product.color && product.color !== '-' ? `Color: ${product.color}` : null,
        product.warrantyMonths ? `Warranty: ${product.warrantyMonths} Months Warranty` : 'Store Warranty Included',
      ].filter(Boolean) as string[];
      featureGuidance = '- Emphasize sound quality, bass, battery life, and noise reduction.';
      negativeRule = 'CRITICAL: THIS IS AN AUDIO ACCESSORY! DO NOT mention phone RAM, ROM, or phone cameras!';
      break;

    case 'case_protector':
      categoryLabel = 'Protective Case / Screen Armor';
      headlineEmoji = '🛡️';
      specsList = [
        'Military-Grade Drop Shock Protection',
        'Raised Bezel Screen & Camera Lens Protection',
        'Slim Lightweight Ergonomic Grip',
      ];
      featureGuidance = '- Emphasize shock absorption, scratch resistance, and perfect fit.';
      negativeRule = 'CRITICAL: THIS IS A CASE / PROTECTOR! DO NOT mention RAM, ROM, or phone internals!';
      break;

    case 'cookware':
      categoryLabel = 'Kitchen & Home Appliance';
      headlineEmoji = '🍳';
      specsList = [
        'Food-Grade Non-Stick Coating & Durable Heating',
        'Energy Efficient & Easy to Clean',
        product.warrantyMonths ? `Warranty: ${product.warrantyMonths} Months Official Warranty` : null,
      ].filter(Boolean) as string[];
      featureGuidance = '- Emphasize convenience, healthy non-stick cooking, and kitchen durability.';
      negativeRule = 'CRITICAL: THIS IS COOKWARE! DO NOT mention smartphone specs!';
      break;

    case 'smartphone':
    default:
      categoryLabel = 'Flagship Smartphone / Mobile Device';
      headlineEmoji = '📱';
      specsList = [
        product.ram && product.ram !== '-' ? `RAM: ${product.ram}` : null,
        (product.rom || product.storage) && (product.rom !== '-' && product.storage !== '-') ? `Storage: ${product.rom || product.storage}` : null,
        product.color && product.color !== '-' && product.color.toLowerCase() !== 'standard' ? `Color: ${product.color}` : null,
        product.condition ? `Condition: ${product.condition.replace(/_/g, ' ')}` : 'Brand New',
        product.warrantyMonths ? `Warranty: ${product.warrantyMonths} Months Official Warranty` : 'Store Warranty Included',
      ].filter(Boolean) as string[];
      featureGuidance = '- Highlight processing performance, RAM/Storage, camera system, vivid display, and battery.';
      negativeRule = '';
      break;
  }

  const specsText = specsList.join(' | ');

  const prompt = `
You are an expert social media advertising copywriter for "${storeName}".
Write a high-converting, professional Facebook promotional advertisement post for the following product:

Product Name: ${product.name}
Brand: ${product.brand}
Model: ${product.model}
Product Category: ${categoryLabel}
Key Verified Specs: ${specsText}
Selling Price: ${formattedPrice}
Stock Status: In Stock (Available for immediate purchase/pickup)
Store Name: ${storeName}
Hotline / Contact: ${hotline}
Store Location: ${address}
Ad Campaign Goal: ${goal.replace(/_/g, ' ')}
Copywriting Tone: ${tone.replace(/_/g, ' ')}

FEATURE EMPHASIS:
${featureGuidance}
${negativeRule}

Requirements:
1. Hook the reader immediately with an irresistible headline and attention-grabbing emojis (${headlineEmoji}, ✨, 🚀).
2. Highlight 3-4 key product advantages using clean bullet points strictly matching the verified specs.
3. Clearly state the retail price (${formattedPrice}) and genuine warranty protection.
4. Add a strong Call to Action (e.g. "📩 Send us a Direct Message to reserve now or call ${hotline}! Fast delivery available nationwide.").
5. Include store visit info and operating address.
6. End with 4 to 6 relevant trending hashtags (#${product.brand.replace(/\s+/g, '')} #${product.model.replace(/[^a-zA-Z0-9]/g, '')} #MyanmarShop).
7. Keep spacing pleasant for mobile Facebook feed reading.
`;

  const deterministicFallback = () => {
    if (kind === 'charger') {
      return `⚡ SPECIAL PROMOTION: ${product.brand} ${product.model}! ⚡

Looking for fast, safe, and reliable charging? The ${product.name} (${product.brand} ${product.model}) is in stock at ${storeName}!

⚡ HIGHLIGHT ADVANTAGES:
• High-Speed Fast Charging Performance
• Multi-Layer Intelligent Safety & Thermal Protection
• Compact, travel-friendly durable design
• Universal compatibility across all smartphones & tablets

💰 Special Retail Price: ${formattedPrice}
🛡️ Warranty: ${product.warrantyMonths || 12} Months Official Protection

🚀 Limited stock available!
📩 Send us a message on Facebook to reserve yours today, or contact our hotline at ${hotline}.
📍 Visit our store: ${address}

#${product.brand.replace(/\s+/g, '')} #FastCharger #${product.model.replace(/[^a-zA-Z0-9]/g, '')} #TechAccessories #MobileStore`;
    }

    return `🔥 SPECIAL PROMOTION: ${product.name}! 🔥

Looking for genuine quality? The ${product.name} is officially available at ${storeName}!

✨ HIGHLIGHT ADVANTAGES:
• ${specsText || 'High-performance official retail unit with verified reliability'}
• Genuine official unit with complete warranty coverage
• Pristine condition, tested & verified by store technicians

💰 Special Retail Price: ${formattedPrice}
🛡️ Warranty: ${product.warrantyMonths || 12} Months Official Protection

🚀 Limited units in stock!
📩 Send us a message on Facebook to reserve yours today, or contact our hotline at ${hotline}.
📍 Visit our store: ${address}

#${product.brand.replace(/\s+/g, '')} #${product.model.replace(/[^a-zA-Z0-9]/g, '')} #SmartphoneDeals #MobileStore #Gadgets`;
  };

  try {
    const aiResult = await generateTextWithAiFallback({
      userPrompt: prompt,
      systemPrompt:
        'You are a professional bilingual (Burmese & English) retail tech marketing specialist and senior copywriter. You write viral, high-converting social media promotional product posts for retail tech electronics stores. You never hallucinate phone specs on accessory items.',
      preferProvider: 'openai',
      enableWebSearch: true,
      temperature: 0.7,
      fallbackGenerator: deterministicFallback,
    });
    return aiResult.text;
  } catch (err) {
    return deterministicFallback();
  }
}

// Track whether DALL-E image generation is available on the current OpenAI key
let isDallEAvailable: boolean = false;

/**
 * Returns a high-resolution commercial studio photo tailored to the brand and product category.
 */
function getCuratedCommercialPhoto(product: Product): string {
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
 * 3. Generates a commercial promotional visual, prioritizing authentic inventory photos
 * and high-resolution studio photography, with graceful AI fallback.
 */
export async function generateSocialAdImage(params: {
  product: Product;
  openai?: OpenAI | null;
  imageMode?: 'dalle_ai' | 'smart_flyer' | 'sample_photo' | 'dalle-3' | 'studio-flyer' | 'sample-photo';
}): Promise<{ imageUrl: string; source: 'dalle_3' | 'sample_photo' | 'curated_mockup'; engine?: string }> {
  const { product, openai, imageMode = 'smart_flyer' } = params;

  // 1. If sample photo mode was requested and authentic product photo exists
  if ((imageMode === 'sample_photo' || imageMode === 'sample-photo') && product.imageUrl) {
    return { imageUrl: product.imageUrl, source: 'sample_photo', engine: 'Catalog Photo' };
  }

  // 2. AI visual generation (DALL-E 3 -> DALL-E 2 -> Flux AI Studio)
  if (imageMode === 'dalle_ai' || imageMode === 'dalle-3') {
    const imagePrompt = buildProductVisualPrompt(product);

    if (openai && isDallEAvailable) {
      try {
        const imageResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        });

        const generatedUrl = imageResponse.data?.[0]?.url;
        if (generatedUrl) {
          return { imageUrl: generatedUrl, source: 'dalle_3', engine: 'DALL-E 3' };
        }
      } catch (err: any) {
        if (err?.status === 400 || (err?.message && err.message.includes('does not exist'))) {
          isDallEAvailable = false;
        }
        // Graceful fallback to DALL-E 2
        try {
          const imgRes2 = await openai.images.generate({
            model: 'dall-e-2',
            prompt: imagePrompt.slice(0, 950),
            n: 1,
            size: '1024x1024',
          });
          if (imgRes2.data?.[0]?.url) {
            return { imageUrl: imgRes2.data[0].url, source: 'dalle_3', engine: 'DALL-E 2' };
          }
        } catch {}
      }
    }
  }

  // 3. Fallback to product's authentic photo if available
  if (product.imageUrl && (product.imageUrl.startsWith('http://') || product.imageUrl.startsWith('https://')) && !product.imageUrl.includes('pollinations.ai')) {
    return { imageUrl: product.imageUrl, source: 'sample_photo', engine: 'Catalog Photo' };
  }

  // 4. Return curated commercial studio photography tailored to brand and category
  return {
    imageUrl: getCuratedCommercialPhoto(product),
    source: 'curated_mockup',
    engine: 'Curated Studio',
  };
}

/**
 * Automatically resolves a genuine Page Access Token from either a User Access Token or an existing Page Access Token.
 * When users supply a User Token with 'pages_manage_posts', Meta Graph API requires resolving the specific Page Token.
 */
export async function resolvePageAccessToken(
  pageId: string,
  inputToken: string
): Promise<{ token: string; pageName?: string; pageId?: string; isResolvedFromUserToken?: boolean }> {
  if (!pageId || !inputToken) {
    return { token: inputToken };
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}?fields=access_token,name,id,link&access_token=${encodeURIComponent(inputToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.access_token) {
      return {
        token: data.access_token,
        pageName: data.name,
        pageId: data.id,
        isResolvedFromUserToken: true,
      };
    }
    if (data && data.name) {
      return {
        token: inputToken,
        pageName: data.name,
        pageId: data.id,
        isResolvedFromUserToken: false,
      };
    }
  } catch {
    // Network or parsing issue; safely proceed with original token
  }

  return { token: inputToken };
}

/**
 * 4. Publishes a Photo Post to Facebook Page using Meta Graph API with automatic Page Token resolution.
 */
export async function publishPhotoToFacebook(params: {
  pageId: string;
  pageAccessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{
  success: boolean;
  postId?: string;
  photoId?: string;
  postUrl?: string;
  pageName?: string;
  error?: string;
}> {
  const { pageId, pageAccessToken, imageUrl, caption } = params;

  try {
    // 1. Resolve genuine Page Access Token (in case a User Access Token was provided)
    const resolved = await resolvePageAccessToken(pageId, pageAccessToken);
    const activeToken = resolved.token;

    const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/photos`;
    let response: Response;

    // Check if imageUrl is a base64 data URL
    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const blob = new Blob([buffer], { type: mimeType });
        const formData = new FormData();
        formData.append('source', blob, 'product_ad_visual.jpg');
        formData.append('caption', caption);
        formData.append('access_token', activeToken);

        response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        });
      } else {
        const bodyParams = new URLSearchParams({
          url: imageUrl,
          caption: caption,
          access_token: activeToken,
        });
        response = await fetch(`${endpoint}?${bodyParams.toString()}`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
      }
    } else {
      const bodyParams = new URLSearchParams({
        url: imageUrl,
        caption: caption,
        access_token: activeToken,
      });
      response = await fetch(`${endpoint}?${bodyParams.toString()}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
    }

    const data = await response.json();

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `Meta Graph API responded with status ${response.status}`;
      return {
        success: false,
        error: errMsg,
      };
    }

    const photoId = data.id;
    const postId = data.post_id || data.id;
    const postUrl = `https://www.facebook.com/${postId}`;

    return {
      success: true,
      photoId,
      postId,
      postUrl,
      pageName: resolved.pageName,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error communicating with Meta Graph API.',
    };
  }
}

/**
 * 5. Tests Facebook Page ID & Access Token connection with automatic token resolution.
 */
export async function testFacebookConnection(params: {
  pageId: string;
  pageAccessToken: string;
}): Promise<{
  success: boolean;
  pageName?: string;
  pageId?: string;
  pageAccessToken?: string;
  link?: string;
  error?: string;
}> {
  const { pageId, pageAccessToken } = params;
  if (!pageId || !pageAccessToken) {
    return { success: false, error: 'Both Facebook Page ID and Page Access Token are required.' };
  }

  try {
    const resolved = await resolvePageAccessToken(pageId, pageAccessToken);
    const activeToken = resolved.token;

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}?fields=id,name,link,category&access_token=${encodeURIComponent(activeToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error?.message || 'Failed to authenticate with Meta Graph API.',
      };
    }

    return {
      success: true,
      pageId: data.id,
      pageName: data.name,
      pageAccessToken: resolved.token,
      link: data.link || `https://facebook.com/${data.id}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error verifying Meta credentials.',
    };
  }
}

/**
 * 6. Master Orchestration Handler executed by the AI Chatbot Copilot.
 */
export async function executePostProductAdToFacebook(
  args: PostAdOptions,
  context: {
    products: Product[];
    settings?: ShopSettings;
    currencySymbol?: string;
  },
  openai: OpenAI | null,
  getGenAI: () => GoogleGenAI
): Promise<{
  success: boolean;
  message: string;
  facebookPost?: FacebookAdPostRecord;
  error?: string;
}> {
  const products = context.products || [];
  const settings = context.settings;

  // 1. Locate product
  const targetProduct = findProductForAd(
    { productId: args.product_id, query: args.product_query },
    products
  );

  if (!targetProduct) {
    return {
      success: false,
      error: `Could not find any product matching "${args.product_id || args.product_query || 'query'}" in your inventory. Available products: ${products
        .slice(0, 5)
        .map((p) => p.name)
        .join(', ')}.`,
      message: 'Product not found in POS database.',
    };
  }

  console.log(`[FacebookPostService] Preparing social media ad post for: "${targetProduct.name}" (ID: ${targetProduct.id})`);

  // 2. Generate Caption
  let caption = args.override_caption;
  if (!caption) {
    let genAiClient: GoogleGenAI | null = null;
    try {
      genAiClient = getGenAI();
    } catch {}
    caption = await generateSocialAdCaption({
      product: targetProduct,
      settings,
      goal: args.custom_ad_goal || 'new_arrival',
      tone: args.tone || (settings?.socialMediaConfig?.defaultTone || 'exciting_retail'),
      openai,
      genai: genAiClient,
    });
  }

  // 3. Generate Image
  const preferredImageMode = (args.image_mode ||
    settings?.socialMediaConfig?.imageMode ||
    (settings?.socialMediaConfig as any)?.defaultImageGenerator ||
    'smart_flyer') as any;

  const { imageUrl } = await generateSocialAdImage({
    product: targetProduct,
    openai,
    imageMode: preferredImageMode,
  });

  // 4. Determine Facebook Page credentials
  const envPageId = process.env.FB_PAGE_ID;
  const envToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const settingsPageId = settings?.socialMediaConfig?.pageId;
  const settingsToken = settings?.socialMediaConfig?.pageAccessToken;

  const pageId = envPageId || settingsPageId || '';
  const pageAccessToken = envToken || settingsToken || '';
  let pageName = settings?.socialMediaConfig?.pageName || settings?.shopName || 'Facebook Store Page';

  const specsSummary = `${targetProduct.ram ? `${targetProduct.ram}/` : ''}${targetProduct.rom || targetProduct.storage || ''} ${targetProduct.color || ''}`.trim();

  // 5. If credentials exist, perform real Meta Graph API publish
  if (pageId && pageAccessToken) {
    const publishRes = await publishPhotoToFacebook({
      pageId,
      pageAccessToken,
      imageUrl,
      caption,
    });

    const activePageName = publishRes.pageName || pageName;

    if (publishRes.success) {
      const fbRecord: FacebookAdPostRecord = {
        id: `fb_post_${Date.now()}`,
        productId: targetProduct.id,
        productName: targetProduct.name,
        brand: targetProduct.brand,
        model: targetProduct.model,
        postId: publishRes.postId,
        photoId: publishRes.photoId,
        postUrl: publishRes.postUrl,
        caption,
        imageUrl,
        sampleImageUrl: targetProduct.imageUrl,
        pageId,
        pageName: activePageName,
        status: 'published_live',
        sellingPrice: targetProduct.sellingPrice,
        specsSummary,
        publishedAt: new Date().toISOString(),
        isMockOrTest: false,
      };

      return {
        success: true,
        message: `Successfully generated AI advertising creative and published photo post to Facebook Page "${activePageName}"! Post ID: ${publishRes.postId}.`,
        facebookPost: fbRecord,
      };
    } else {
      // If Meta returned an error, return formatted details with preview
      const fbRecord: FacebookAdPostRecord = {
        id: `fb_post_${Date.now()}`,
        productId: targetProduct.id,
        productName: targetProduct.name,
        brand: targetProduct.brand,
        model: targetProduct.model,
        caption,
        imageUrl,
        sampleImageUrl: targetProduct.imageUrl,
        pageId,
        pageName: activePageName,
        status: 'failed',
        errorMessage: publishRes.error,
        sellingPrice: targetProduct.sellingPrice,
        specsSummary,
        publishedAt: new Date().toISOString(),
        isMockOrTest: false,
      };

      return {
        success: false,
        error: `Meta Graph API publication notice: ${publishRes.error}. Caption & image were generated successfully.`,
        message: `Meta notice: ${publishRes.error}`,
        facebookPost: fbRecord,
      };
    }
  }

  // 6. If credentials are not yet configured: generate verified Draft / Preview Mode!
  const simulatedPostId = `fb_preview_${Date.now()}`;
  const fbRecord: FacebookAdPostRecord = {
    id: simulatedPostId,
    productId: targetProduct.id,
    productName: targetProduct.name,
    brand: targetProduct.brand,
    model: targetProduct.model,
    postId: simulatedPostId,
    postUrl: `https://www.facebook.com/${simulatedPostId}`,
    caption,
    imageUrl,
    sampleImageUrl: targetProduct.imageUrl,
    pageId: pageId || 'FB-PAGE-DEMO',
    pageName: pageName || settings?.shopName || 'Win Mobile Official',
    status: 'preview_ready',
    sellingPrice: targetProduct.sellingPrice,
    specsSummary,
    publishedAt: new Date().toISOString(),
    isMockOrTest: true,
  };

  return {
    success: true,
    message: `Generated AI advertising creative (caption & promotional photo) for "${targetProduct.name}". Ready in Preview Mode! (Configure your Meta Page Access Token in Settings > Facebook Page Integration to publish directly live).`,
    facebookPost: fbRecord,
  };
}
