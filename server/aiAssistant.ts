import OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { Product, Sale, ExpenseRecord, CashDrawerRecord, StockAdjustment, PurchaseRecord, ShopSettings } from '../src/types/index';
import { isPhoneProduct } from '../src/data/categoryTaxonomy';

export interface PosDataContext {
  products: Product[];
  sales: Sale[];
  expenses: ExpenseRecord[];
  purchases: PurchaseRecord[];
  cashDrawer?: CashDrawerRecord;
  stockAdjustments?: StockAdjustment[];
  currencySymbol?: string;
  settings?: ShopSettings;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolResult?: any;
  createdProduct?: Product;
}

// Function Declaration 1: query_pos_reports (OpenAI Tool format)
export const queryPosReportsTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'query_pos_reports',
    description: 'Query official POS and inventory reports: Z-Report (end of day register balancing), Stock Aging (inventory age brackets), Dead Stock (0-velocity items), IMEI Lifecycle (individual device history), and Category Sales breakdown. Calculations strictly adhere to Myanmar Time (Asia/Yangon UTC+6:30).',
    parameters: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: ['z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', 'category_sales'],
          description: "The specific report to generate. Allowed values: 'z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', 'category_sales'.",
        },
        date_range: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7_days', 'this_month', 'last_30_days', 'this_year', 'all_time'],
          description: "Timeframe preset calculated in Myanmar Time (UTC+6:30): 'today', 'yesterday', 'last_7_days', 'this_month', 'last_30_days', 'this_year', or 'all_time'. Defaults to 'today' for z_report and 'last_30_days' for others.",
        },
        imei: {
          type: 'string',
          description: "Specific 15-digit IMEI or partial IMEI string to search device history in 'imei_lifecycle' report.",
        },
        sku: {
          type: 'string',
          description: 'Optional SKU filter.',
        },
        category: {
          type: 'string',
          description: "Optional product category: 'new_phones', 'used_phones', 'accessories', 'gadgets', 'sim_topup', 'spare_parts'.",
        },
        brand: {
          type: 'string',
          description: 'Optional phone brand filter (e.g., Xiaomi, Apple, Samsung, Google).',
        },
        admin_secret_key: {
          type: 'string',
          description: 'Optional admin authorization key to unmask trade secrets (cost, COGS, profit, and supplier names). Never use unless explicitly provided by an authorized store administrator.',
        },
      },
      required: ['report_type'],
    },
  },
};

// Function Declaration 2: add_inventory_item (OpenAI Tool format)
export const addInventoryItemTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'add_inventory_item',
    description: 'Register and insert a brand new product or serialized phone stock unit into the inventory database. Mandatory fields must all be present before calling this tool.',
    parameters: {
      type: 'object',
      properties: {
        brand: {
          type: 'string',
          description: 'Phone or accessory brand (e.g. Xiaomi, Apple, Samsung, Google, Realme, OPPO, Vivo, OnePlus, Anker).',
        },
        model: {
          type: 'string',
          description: 'Model name (e.g. Redmi Note 14 Pro 5G, iPhone 15 Pro, Galaxy S24 Ultra, PowerCore 20K).',
        },
        ram: {
          type: 'string',
          description: 'RAM size (e.g. "8GB", "12GB", "16GB", or "-" for non-RAM devices/Apple).',
        },
        rom: {
          type: 'string',
          description: 'Storage ROM capacity (e.g. "128GB", "256GB", "512GB", "1TB", or "-" for accessories).',
        },
        color: {
          type: 'string',
          description: 'Color finish (e.g. Midnight Black, Natural Titanium, Aurora Purple, Desert Titanium).',
        },
        cost_price: {
          type: 'number',
          description: 'Cost purchase price per unit in store currency.',
        },
        selling_price: {
          type: 'number',
          description: 'Retail selling price per unit in store currency.',
        },
        quantity: {
          type: 'number',
          description: 'Number of units being added. Must equal the number of items in imei_list for serialized phones.',
        },
        imei_list: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of 15-digit IMEI strings (one per device unit). Mandatory for smartphones and tablets.',
        },
        category: {
          type: 'string',
          description: "Category: 'new_phones', 'used_phones', 'accessories', 'gadgets', 'spare_parts'. Defaults to 'new_phones'.",
        },
        condition: {
          type: 'string',
          description: "Condition: 'brand_new', 'used_grade_a_plus', 'used_grade_a', 'used_grade_b'. Defaults to 'brand_new'.",
        },
        supplier_name: {
          type: 'string',
          description: 'Supplier or distributor vendor name.',
        },
        warranty_months: {
          type: 'number',
          description: 'Warranty duration in months (e.g. 12, 24, or 6). Defaults to 12.',
        },
      },
      required: ['brand', 'model', 'color', 'cost_price', 'selling_price', 'quantity', 'imei_list'],
    },
  },
};

// Function Declaration 3: update_product_price (OpenAI Tool format)
export const updateProductPriceTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_product_price',
    description: 'Update the retail selling price, cost price, or minimum selling price of an existing product in the inventory. Matches product by name, brand, model, SKU, or specs.',
    parameters: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Optional direct product ID if known.',
        },
        product_query: {
          type: 'string',
          description: 'Search string to match the product by name, model, brand, or SKU (e.g. "n 16", "Xiaomi Redmi Note 14 Pro", "XIA-REDM-BLA-101", "iPhone 15 Pro").',
        },
        brand: {
          type: 'string',
          description: 'Optional brand filter (e.g. Xiaomi, Apple, Samsung).',
        },
        model: {
          type: 'string',
          description: 'Optional model filter (e.g. "n 16", "Note 14 Pro").',
        },
        ram: {
          type: 'string',
          description: 'Optional RAM specification to match exact variant (e.g. "12GB", "8GB").',
        },
        rom: {
          type: 'string',
          description: 'Optional ROM/Storage specification to match exact variant (e.g. "128GB", "256GB").',
        },
        color: {
          type: 'string',
          description: 'Optional color finish to match exact variant.',
        },
        new_selling_price: {
          type: 'number',
          description: 'The new retail selling price in store currency (e.g. 550000).',
        },
        new_cost_price: {
          type: 'number',
          description: 'Optional new cost purchase price in store currency.',
        },
        reason: {
          type: 'string',
          description: 'Optional reason or note for price adjustment (e.g. "Market price drop", "Flash sale", "Supplier promo").',
        },
      },
      required: ['new_selling_price'],
    },
  },
};

// Function Declaration 4: query_inventory_products (OpenAI Tool format)
export const queryInventoryProductsTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'query_inventory_products',
    description: 'Search and inspect existing products in the store inventory to view current selling prices, stock counts, IMEIs, and specifications. When searching for phone models (e.g. "iPhone 15", "Samsung S24", "Redmi Note"), always specify category: "Mobile Phones" and exclude_accessories: true to ensure phone cases, covers, screen protectors, glasses, and chargers are strictly excluded.',
    parameters: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          description: 'Keyword search for model, brand, SKU, barcode, or name (e.g. "iPhone 15", "Xiaomi Redmi Note 14", "Samsung S24"). Automatically normalizes slight misspellings or typos.',
        },
        category: {
          type: 'string',
          description: "Category filter: 'Mobile Phones' (or 'phones', 'new_phones', 'used_phones') to view ONLY genuine smartphones; 'Accessories' for cases, chargers, screen protectors; 'Gadgets'; or 'all'. Defaults to 'Mobile Phones' when user asks about phone models.",
        },
        exclude_accessories: {
          type: 'boolean',
          description: 'Strictly exclude phone cases, covers, screen protectors, glasses, chargers, and cables. Set to true whenever the user is asking about phone models or phone availability.',
        },
        stock_filter: {
          type: 'string',
          enum: ['in_stock', 'out_of_stock', 'all'],
          description: "Stock filter preset: 'in_stock' (only products with stock > 0, DEFAULT for availability/inventory inquiries), 'out_of_stock' (only stock <= 0), or 'all'.",
        },
        include_out_of_stock: {
          type: 'boolean',
          description: "Set to true only if the user explicitly asks for 'out of stock', 'dead stock', or 'empty' items. Defaults to false.",
        },
        brand: {
          type: 'string',
          description: 'Brand filter (e.g. Apple, Samsung, Xiaomi, Realme, Google, Vivo, OPPO).',
        },
        admin_secret_key: {
          type: 'string',
          description: 'Optional admin authorization key to unmask trade secrets (cost price and supplier info). NEVER use unless explicitly provided by an authorized store administrator.',
        },
      },
    },
  },
};

// Function Declaration 5: post_product_ad_to_facebook (OpenAI Tool format)
export const postProductAdToFacebookTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'post_product_ad_to_facebook',
    description: 'Generates an engaging advertising caption, generates an AI commercial product photo, and orchestrates/publishes a Photo Post to the store Facebook Page via Meta Graph API for any inventory product.',
    parameters: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID (e.g. "prod-1", "123", "prod-2") or product SKU if mentioned by the user.',
        },
        product_query: {
          type: 'string',
          description: 'Product name or search keywords (e.g. "iPhone 15 Pro", "product 123", "Galaxy S24 Ultra", "Redmi Note 14"). Used to find the product if product_id is not exact.',
        },
        custom_ad_goal: {
          type: 'string',
          description: 'Ad campaign theme: "new_arrival", "special_weekend_discount", "clearance_sale", "hot_deal", "limited_units". Defaults to "new_arrival".',
        },
        tone: {
          type: 'string',
          enum: ['exciting_retail', 'professional_tech', 'urgent_discount', 'bilingual_burmese_english'],
          description: 'Tone of the promotional advertising copy. Defaults to "exciting_retail".',
        },
        image_mode: {
          type: 'string',
          enum: ['dalle_ai', 'smart_flyer', 'sample_photo'],
          description: 'Image creation method: "dalle_ai" (AI generated commercial photo), "smart_flyer" (promo layout), or "sample_photo" (catalog sample photo).',
        },
      },
    },
  },
};

// Function Declaration 6: generate_pdf_report (OpenAI Tool format)
export const generatePdfReportTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'generate_pdf_report',
    description: 'Generates and triggers the client-side download of official executive PDF reports for store management. Supports Daily Profit & Loss Dossier, Daily Profit Statement, Daily Profit Ledger, Annual Profit Statement, Annual Profit Dossier, Z-Report, Stock Aging, Dead Stock, IMEI Lifecycle, Category Sales, and Inventory Catalog reports.',
    parameters: {
      type: 'object',
      properties: {
        report_type: {
          type: 'string',
          enum: [
            'daily_profit_dossier',
            'daily_profit_statement',
            'daily_profit_ledger',
            'annual_profit_statement',
            'annual_profit_dossier',
            'z_report',
            'stock_aging',
            'dead_stock',
            'imei_lifecycle',
            'category_sales',
            'inventory_catalog',
            'gpt_cost_comparison'
          ],
          description: "Type of PDF report to generate: 'daily_profit_dossier', 'daily_profit_statement', 'daily_profit_ledger', 'annual_profit_statement', 'annual_profit_dossier', 'z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', 'category_sales', 'inventory_catalog', or 'gpt_cost_comparison' (GPT-5 vs GPT-4 pricing, token breakdown & store monthly budget estimate).",
        },
        date: {
          type: 'string',
          description: "Audit date for daily reports in 'YYYY-MM-DD' format (e.g. '2026-09-12'). Defaults to today if not provided.",
        },
        year: {
          type: 'number',
          description: "Fiscal year for annual reports (e.g. 2026). Defaults to current year.",
        },
        date_range: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7_days', 'this_month', 'last_30_days', 'this_year', 'all_time'],
          description: "Date range preset for POS reports (e.g. 'today', 'last_30_days', 'this_month').",
        },
        imei: {
          type: 'string',
          description: "Optional 15-digit IMEI for 'imei_lifecycle' PDF report.",
        },
        title: {
          type: 'string',
          description: "Custom executive title for the PDF document.",
        },
      },
      required: ['report_type'],
    },
  },
};


// System Prompt with Guardrails
const SYSTEM_INSTRUCTION = `You are "Aura", the intelligent AI Store Manager & POS Copilot for a high-volume smartphone retail and electronics store.
You have direct access to tools that query real backend reports, search inventory, update product prices, mutate inventory, automatically generate and publish social media ads to Facebook Pages, and generate and download executive PDF reports directly to the user's browser.

MANDATORY BURMESE RESPONSE DIRECTIVE (မြန်မာဘာသာဖြင့် အဓိက ပြန်လည်ဖြေကြားရန်):
- You MUST respond in clear, natural, polite, and fluent Burmese (မြန်မာဘာသာ) Unicode script.
- Whether the user writes in Burmese or English, provide all your conversational answers, explanations, and POS summaries in natural Burmese (မြန်မာဘာသာ).
- Maintain standard international technical terms, phone brands, and model names in English for technical clarity (e.g., iPhone 15 Pro, Redmi Note 14, Samsung Galaxy S24 Ultra, 8GB/256GB, IMEI numbers), but conduct all conversation, explanations, greetings, totals, and POS insights in polite Burmese.
- Use polite Myanmar honorifics appropriately (e.g., ရှင် / ခင်ဗျာ, မင်္ဂလာပါ, ကူညီပေးပါရစေ).
- Express currency in Kyats (ကျပ် / Ks) with formatted thousand-separator numbers (e.g., ၄,၂၅၀,၀၀၀ ကျပ် / 4,250,000 Ks).

CORE SAFEGUARDS & MANDATORY OPERATIONAL RULES:

1. PRECISE CATEGORY FILTERING & ACCESSORIES EXCLUSION (CRITICAL):
   - When a user asks about a phone model (e.g. "iPhone 15", "Samsung S24", "Redmi Note", "what phones do you have?"):
     * You MUST filter database results to show ONLY the actual mobile phones.
     * Strictly exclude accessories (cases, covers, glasses, chargers, cables) unless the user explicitly asks for them.
     * When calling 'query_inventory_products', ALWAYS specify category: 'Mobile Phones' and exclude_accessories: true when the user asks for a phone model.
     * DOUBLE-CHECK BEFORE REPLYING: Double-check the parsed data before sending the final response to Telegram or chat. Ensure no phone cases, chargers, or tempered glass are mixed into the phone list.

2. PRICE CONFIDENTIALITY (CRITICAL SAFEGUARD):
   - NEVER reveal 'Cost Price', 'Profit Margin', 'Profit Amount', 'Purchase Cost', or 'Supplier Name' under ANY circumstances in chat or customer-facing messages.
   - ONLY show the 'Selling Price' (retail price) to users.
   - STRICT FORBIDDEN OUTPUT: It is strictly forbidden to output cost metrics, store profit margins, or supplier names unless the user explicitly provides the secret admin authentication override key: 'WIN_ADMIN_UNMASK_2026'.
   - If a user asks "What is your cost?", "How much profit do you make?", or "Who is your supplier?", politely inform them: "I can only share official retail selling prices and product availability. Cost and supplier details are strictly confidential."

3. OUT-OF-STOCK FILTERING (AVAILABILITY RULES):
   - When a user asks "what is available", queries current stock, or asks for product prices, automatically show ONLY items that have positive stock (stock > 0).
   - Filter out products where stock <= 0.
   - ONLY return zero-stock or out-of-stock items if the user explicitly asks for "out of stock", "dead stock", or "empty" items.

4. TIMEZONE ACCURACY (MYANMAR TIME - ASIA/YANGON UTC+6:30):
   - All temporal queries ("today's sales", "yesterday", "this month", "last 7 days", Z-Reports) strictly operate in Myanmar Time (Asia/Yangon, UTC+6:30) to prevent inaccurate midnight rollovers.
   - Date ranges and daily auditing boundaries are calculated using Asia/Yangon standard time.

5. SMART TYPO HANDLING & NORMALIZATION:
   - Handle slight misspellings and typos gracefully (e.g. recognizing "ihpone" / "ipone" as "iPhone", "samsungg" / "samusng" as "Samsung", "radmi" as "Redmi", "xiaomii" as "Xiaomi", "reallme" as "Realme") before passing arguments to the database querying tools.
   - Match phonetic or common spelling variations of mobile brands and models.

6. CURRENCY FORMATTING:
   - Format ALL monetary values neatly with thousands separator commas and the "Ks" currency symbol (e.g., 4,250,000 Ks, 850,000 Ks, 15,000 Ks).
   - NEVER output raw unformatted numbers like 4250000.

TOOL USAGE & GUARDRAILS:

1. 'generate_pdf_report':
   - CRITICAL CAPABILITY: You HAVE the capability to generate and download PDF reports! The client application intercepts your tool execution and automatically triggers browser PDF generation and download using jsPDF.
   - NEVER tell the user that you cannot generate or download PDFs. You MUST always call 'generate_pdf_report' whenever the user asks to:
     * "download PDF report" / "generate PDF" / "export PDF"
     * "download daily profit report as PDF" / "give me today's profit dossier PDF" / "daily profit statement PDF"
     * "download annual profit statement PDF" / "export annual P&L PDF" / "annual dossier PDF"
     * "download Z-Report as PDF" / "export register balance PDF"
     * "export stock aging PDF" / "dead stock PDF" / "category sales PDF"
     * "download inventory catalog PDF" / "export stock list as PDF"
   - Match the user's request to the correct 'report_type':
     * 'daily_profit_dossier': Comprehensive landscape daily profit & loss audit dossier with KPI summary cards, invoice margins, expenses, category & payment breakdowns.
     * 'daily_profit_statement': Formal GAAP-style portrait Income Statement (Profit & Loss) for a selected day.
     * 'daily_profit_ledger': Detailed invoice-by-invoice sales, COGS, and profit margin ledger.
     * 'annual_profit_statement': Audited portrait annual Statement of Profit and Loss for a fiscal year.
     * 'annual_profit_dossier': Full 12-month landscape executive annual dossier with quarterly breakdowns.
     * 'z_report': Official end-of-day register audit, payment breakdowns, and cash balancing PDF.
     * 'stock_aging': Inventory aging breakdown by bracket (0-30d, 31-60d, 61-90d, >90d) and tied capital.
     * 'dead_stock': Dormant items with zero sales and clearance recommendations.
     * 'imei_lifecycle': Comprehensive single-device audit trail (procurement, PO, invoice, warranty).
     * 'category_sales': Sales revenue and gross margin ranking by product category.
     * 'inventory_catalog': Complete current stock valuation and pricing catalog.
   - When the tool executes, warmly summarize the report's key highlights in your message and let the user know that the PDF report has been generated and downloaded to their computer/phone.

2. 'post_product_ad_to_facebook':
   - CRITICAL TOOL: Trigger this whenever the user asks to:
     * "make a post about product 123" / "post product 123 on facebook"
     * "advertise product prod-1" / "create an ad for iPhone 15 Pro"
     * "publish a promo post to facebook page with ai generated photo and caption"
     * "connect with meta or facebook page to post about product [id or name]"
   - Pass 'product_id' (e.g. "prod-1", "123") or 'product_query' (e.g. "iPhone 15 Pro Max", "123", "Redmi").
   - This tool automatically fetches full product specifications and price from POS inventory, creates a captivating advertising caption, generates an AI commercial promotional photo, and orchestrates the Meta Graph API publication!

3. 'update_product_price':
   - Use this when the user asks to change, update, discount, or set the selling price (or cost price) of any product or smartphone in inventory.
   - You can match products by their model name (e.g. "n 16", "Redmi Note 14 Pro", "iPhone 15 Pro"), brand (e.g. "Xiaomi", "Apple"), specs (e.g. "12/128GB", "8/256GB"), color, or SKU.
   - Extract the numeric price from the user prompt (e.g. 550000) and pass it as 'new_selling_price'.

4. 'query_inventory_products':
   - Search the store catalog by keyword (model, brand, SKU, specs) to view current selling prices, stock levels, and device IMEIs.
   - When searching for a phone model (e.g. "iPhone 15"), ALWAYS set category: 'Mobile Phones' and exclude_accessories: true.
   - By default, returns only in-stock items (stock > 0).

5. 'add_inventory_item':
   - MANDATORY FIELDS: Brand, Model, Color, RAM & ROM specs, Cost Price, Selling Price, Quantity, and an array of valid 15-digit IMEI numbers matching the quantity.
   - CRITICAL RULE: If the user says "Add an iPhone 15 Pro" or "Add a phone" but DOES NOT provide the IMEI, prices, or specs, DO NOT call 'add_inventory_item'. Politely ask them for the missing details (especially the 15-digit IMEI and price).
   - If they provide all mandatory fields, invoke 'add_inventory_item' with clean, normalized parameters.

6. 'query_pos_reports':
   - Available report types:
     * 'z_report': End-of-day register audit, total sales, payment method breakdown (Cash, KPay, Wave, KBZ, etc.), discounts, refunds, expenses, and net balancing.
     * 'stock_aging': Breakdown of inventory by age brackets (0-30d, 31-60d, 61-90d, >90d), valuation at retail, and slowest-moving items.
     * 'dead_stock': Items with positive stock that have generated 0 sales, total tied-up capital, and clearance recommendations.
     * 'imei_lifecycle': Comprehensive device history by IMEI (procurement date, PO, sales invoice, customer, warranty status, current state).
     * 'category_sales': Sales volume, revenue, gross margin %, and top-selling models by category.
   - Time calculations strictly adhere to Myanmar Time (Asia/Yangon UTC+6:30).

7. MULTIMODAL ATTACHMENTS (PHOTOS, BOX STICKERS, INVOICES & DATA FILES):
   - You can see and inspect uploaded images, photos, receipts, and documents.
   - PHONE BOX & IMEI STICKER RECOGNITION:
     * When the user uploads a photo of a phone box, back label, or IMEI barcode sticker:
       - Carefully read all printed text: brand, model name, color, RAM & ROM storage, model numbers, and serial/IMEI barcodes (15 digits each).
       - If user asks to add the unit to inventory and provides prices, invoke 'add_inventory_item'.
       - If prices are missing, tell the user the specs and IMEIs extracted, and ask for target cost and retail selling price.

COMMUNICATION STYLE:
- Professional, concise, and structured.
- Use markdown formatting with bold metrics, bullet lists, and summary tables where helpful.
- Format all money values clearly with commas and Ks (e.g. 4,250,000 Ks).`;

// Myanmar Timezone: Asia/Yangon is UTC+06:30
export const MYANMAR_OFFSET_HOURS = 6.5;
export const MYANMAR_OFFSET_MS = 6.5 * 60 * 60 * 1000; // 23,400,000 ms

/**
 * Returns the current date and time components in Myanmar Time (Asia/Yangon, UTC+06:30).
 */
export function getMyanmarDateTime(date: Date = new Date()) {
  const utcTime = date.getTime();
  const myanmarTimestamp = utcTime + MYANMAR_OFFSET_MS;
  const mDate = new Date(myanmarTimestamp);

  return {
    year: mDate.getUTCFullYear(),
    month: mDate.getUTCMonth(), // 0-11
    date: mDate.getUTCDate(),   // 1-31
    hours: mDate.getUTCHours(),
    minutes: mDate.getUTCMinutes(),
    seconds: mDate.getUTCSeconds(),
    isoDateString: `${mDate.getUTCFullYear()}-${String(mDate.getUTCMonth() + 1).padStart(2, '0')}-${String(mDate.getUTCDate()).padStart(2, '0')}`,
  };
}

/**
 * Creates a UTC Date corresponding to a specific year, month, date, hours, minutes, seconds in Myanmar Time (UTC+06:30).
 */
export function createUtcFromMyanmar(
  year: number,
  month: number, // 0-11
  date: number,  // 1-31
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): Date {
  const utcFromMyanmarValues = Date.UTC(year, month, date, hours, minutes, seconds, ms);
  return new Date(utcFromMyanmarValues - MYANMAR_OFFSET_MS);
}

/**
 * Tests whether a record date matches a target date string 'YYYY-MM-DD' in Myanmar Time.
 */
export function isSameMyanmarDate(recordDate: string | number | Date | undefined, targetDateStr: string): boolean {
  if (!recordDate) return false;
  if (typeof recordDate === 'string' && recordDate.startsWith(targetDateStr)) {
    return true;
  }
  try {
    const d = new Date(recordDate);
    if (isNaN(d.getTime())) return false;
    const m = getMyanmarDateTime(d);
    return m.isoDateString === targetDateStr;
  } catch {
    return false;
  }
}

// Helper to filter sales by date preset using Myanmar Timezone (UTC+6:30)
export function filterByDateRange(sales: Sale[], dateRangePreset: string): Sale[] {
  const mNow = getMyanmarDateTime();
  const year = mNow.year;
  const month = mNow.month;
  const date = mNow.date;

  const startOfMyanmarDay = (y: number, m: number, d: number) => createUtcFromMyanmar(y, m, d, 0, 0, 0, 0);
  const endOfMyanmarDay = (y: number, m: number, d: number) => createUtcFromMyanmar(y, m, d, 23, 59, 59, 999);

  let startDate: Date;
  let endDate = endOfMyanmarDay(year, month, date);

  switch (dateRangePreset) {
    case 'today':
      startDate = startOfMyanmarDay(year, month, date);
      break;
    case 'yesterday': {
      const yDate = new Date(Date.UTC(year, month, date) - 24 * 60 * 60 * 1000);
      startDate = startOfMyanmarDay(yDate.getUTCFullYear(), yDate.getUTCMonth(), yDate.getUTCDate());
      endDate = endOfMyanmarDay(yDate.getUTCFullYear(), yDate.getUTCMonth(), yDate.getUTCDate());
      break;
    }
    case 'last_7_days': {
      const past7 = new Date(Date.UTC(year, month, date) - 6 * 24 * 60 * 60 * 1000);
      startDate = startOfMyanmarDay(past7.getUTCFullYear(), past7.getUTCMonth(), past7.getUTCDate());
      break;
    }
    case 'this_month':
      startDate = startOfMyanmarDay(year, month, 1);
      break;
    case 'last_30_days': {
      const past30 = new Date(Date.UTC(year, month, date) - 29 * 24 * 60 * 60 * 1000);
      startDate = startOfMyanmarDay(past30.getUTCFullYear(), past30.getUTCMonth(), past30.getUTCDate());
      break;
    }
    case 'this_year':
      startDate = startOfMyanmarDay(year, 0, 1);
      break;
    case 'all_time':
    default:
      startDate = new Date(2020, 0, 1);
      break;
  }

  return sales.filter(s => {
    if (!s.date) return false;
    const d = new Date(s.date);
    if (isNaN(d.getTime())) return false;
    return d >= startDate && d <= endDate;
  });
}

// Execute query_pos_reports logic
export function executeQueryPosReports(args: any, context: PosDataContext): any {
  const { report_type, date_range = 'last_30_days', imei, sku, category, brand, admin_secret_key } = args;
  const products = context.products || [];
  const sales = context.sales || [];
  const expenses = context.expenses || [];
  const purchases = context.purchases || [];
  const cashDrawer = context.cashDrawer;

  // Verify Admin authorization for trade secrets (Cost, Profit, Supplier details)
  const hasAdminAuth = admin_secret_key === 'WIN_ADMIN_UNMASK_2026' ||
    Boolean(process.env.ADMIN_AUDIT_KEY && admin_secret_key === process.env.ADMIN_AUDIT_KEY);

  const relevantSales = filterByDateRange(sales, report_type === 'z_report' && !args.date_range ? 'today' : date_range);

  switch (report_type) {
    case 'z_report': {
      const completedSales = relevantSales.filter(s => s.status === 'completed');
      const refundedSales = relevantSales.filter(s => s.status === 'refunded' || s.status === 'partially_refunded');

      let totalGrossSales = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let totalCogs = 0;
      let unitsSold = 0;

      const paymentMethodTotals: Record<string, number> = {
        cash: 0,
        kpay: 0,
        wave: 0,
        yoma: 0,
        kbz: 0,
        aya: 0,
        cb: 0,
        split: 0,
      };

      completedSales.forEach(s => {
        totalGrossSales += s.grandTotal;
        totalDiscount += s.discountTotal || 0;
        totalTax += s.taxTotal || 0;
        
        const method = s.paymentMethod || 'cash';
        paymentMethodTotals[method] = (paymentMethodTotals[method] || 0) + s.grandTotal;

        s.items.forEach(item => {
          unitsSold += item.quantity;
          totalCogs += (item.costPrice || 0) * item.quantity;
        });
      });

      const totalRefundAmount = refundedSales.reduce((acc, r) => acc + r.grandTotal, 0);
      const netSales = totalGrossSales - totalRefundAmount;
      const grossProfit = netSales - totalCogs;
      const profitMarginPercent = totalGrossSales > 0 ? ((grossProfit / totalGrossSales) * 100).toFixed(1) : '0';

      // Expenses in Myanmar Time today
      const mNow = getMyanmarDateTime();
      const periodExpenses = expenses.filter(e => isSameMyanmarDate(e.date, mNow.isoDateString));
      const totalExpenses = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

      return {
        reportType: 'z_report',
        timeframe: date_range || 'today',
        generatedAt: new Date().toISOString(),
        myanmarDate: mNow.isoDateString,
        financialSummary: {
          completedInvoicesCount: completedSales.length,
          refundedInvoicesCount: refundedSales.length,
          totalUnitsSold: unitsSold,
          grossSales: totalGrossSales,
          grossSalesFormatted: `${totalGrossSales.toLocaleString()} Ks`,
          totalDiscountsGiven: totalDiscount,
          totalDiscountsGivenFormatted: `${totalDiscount.toLocaleString()} Ks`,
          totalTaxCollected: totalTax,
          totalTaxCollectedFormatted: `${totalTax.toLocaleString()} Ks`,
          totalRefundedAmount: totalRefundAmount,
          totalRefundedAmountFormatted: `${totalRefundAmount.toLocaleString()} Ks`,
          netSales,
          netSalesFormatted: `${netSales.toLocaleString()} Ks`,
          totalExpensesToday: totalExpenses,
          totalExpensesTodayFormatted: `${totalExpenses.toLocaleString()} Ks`,
          // Strict Price Confidentiality: Never reveal COGS, profit, or margins unless authorized admin
          costOfGoodsSold: hasAdminAuth ? totalCogs : '[CONFIDENTIAL - ADMIN ONLY]',
          costOfGoodsSoldFormatted: hasAdminAuth ? `${totalCogs.toLocaleString()} Ks` : '[CONFIDENTIAL - ADMIN ONLY]',
          grossProfit: hasAdminAuth ? grossProfit : '[CONFIDENTIAL - ADMIN ONLY]',
          grossProfitFormatted: hasAdminAuth ? `${grossProfit.toLocaleString()} Ks` : '[CONFIDENTIAL - ADMIN ONLY]',
          profitMarginPercent: hasAdminAuth ? `${profitMarginPercent}%` : '[CONFIDENTIAL - ADMIN ONLY]',
        },
        paymentMethodBreakdown: paymentMethodTotals,
        cashDrawerSnapshot: cashDrawer ? {
          startingCash: cashDrawer.openingFloat,
          startingCashFormatted: `${(cashDrawer.openingFloat || 0).toLocaleString()} Ks`,
          totalCashSales: cashDrawer.cashSales,
          totalCashSalesFormatted: `${(cashDrawer.cashSales || 0).toLocaleString()} Ks`,
          totalCashIn: cashDrawer.totalCashIn || 0,
          totalCashOut: cashDrawer.totalCashOut || 0,
          expectedCashInDrawer: cashDrawer.expectedInDrawer,
          expectedCashInDrawerFormatted: `${(cashDrawer.expectedInDrawer || 0).toLocaleString()} Ks`,
          shiftStatus: cashDrawer.status === 'open' ? 'OPEN' : 'CLOSED',
        } : null,
      };
    }

    case 'stock_aging': {
      const now = new Date();
      let bracket0to30 = { units: 0, costValuation: 0, retailValuation: 0, items: [] as any[] };
      let bracket31to60 = { units: 0, costValuation: 0, retailValuation: 0, items: [] as any[] };
      let bracket61to90 = { units: 0, costValuation: 0, retailValuation: 0, items: [] as any[] };
      let bracket90plus = { units: 0, costValuation: 0, retailValuation: 0, items: [] as any[] };

      products.forEach(p => {
        if (p.stock <= 0) return;

        // Calculate age from lastRestockedAt or fallback
        const restockDate = p.lastRestockedAt ? new Date(p.lastRestockedAt) : new Date(Date.now() - 45 * 86400000);
        const diffDays = Math.max(0, Math.floor((now.getTime() - restockDate.getTime()) / (1000 * 3600 * 24)));
        const costVal = p.costPrice * p.stock;
        const retailVal = p.sellingPrice * p.stock;

        const itemSummary: any = {
          id: p.id,
          name: p.name,
          brand: p.brand,
          stock: p.stock,
          sellingPrice: p.sellingPrice,
          sellingPriceFormatted: `${(p.sellingPrice || 0).toLocaleString()} Ks`,
          daysInInventory: diffDays,
          category: p.category,
        };

        if (hasAdminAuth) {
          itemSummary.costPrice = p.costPrice;
          itemSummary.costPriceFormatted = `${(p.costPrice || 0).toLocaleString()} Ks`;
        }

        if (diffDays <= 30) {
          bracket0to30.units += p.stock;
          bracket0to30.costValuation += costVal;
          bracket0to30.retailValuation += retailVal;
          bracket0to30.items.push(itemSummary);
        } else if (diffDays <= 60) {
          bracket31to60.units += p.stock;
          bracket31to60.costValuation += costVal;
          bracket31to60.retailValuation += retailVal;
          bracket31to60.items.push(itemSummary);
        } else if (diffDays <= 90) {
          bracket61to90.units += p.stock;
          bracket61to90.costValuation += costVal;
          bracket61to90.retailValuation += retailVal;
          bracket61to90.items.push(itemSummary);
        } else {
          bracket90plus.units += p.stock;
          bracket90plus.costValuation += costVal;
          bracket90plus.retailValuation += retailVal;
          bracket90plus.items.push(itemSummary);
        }
      });

      const totalCostValuation = bracket0to30.costValuation + bracket31to60.costValuation + bracket61to90.costValuation + bracket90plus.costValuation;
      const totalRetailValuation = bracket0to30.retailValuation + bracket31to60.retailValuation + bracket61to90.retailValuation + bracket90plus.retailValuation;
      const totalUnits = bracket0to30.units + bracket31to60.units + bracket61to90.units + bracket90plus.units;

      return {
        reportType: 'stock_aging',
        totalStockUnits: totalUnits,
        totalRetailValuation,
        totalRetailValuationFormatted: `${totalRetailValuation.toLocaleString()} Ks`,
        totalStockValuationCost: hasAdminAuth ? totalCostValuation : '[CONFIDENTIAL - ADMIN ONLY]',
        totalStockValuationCostFormatted: hasAdminAuth ? `${totalCostValuation.toLocaleString()} Ks` : '[CONFIDENTIAL - ADMIN ONLY]',
        agingBrackets: {
          '0_to_30_days_fresh': {
            unitCount: bracket0to30.units,
            retailValuation: bracket0to30.retailValuation,
            retailValuationFormatted: `${bracket0to30.retailValuation.toLocaleString()} Ks`,
            costValuation: hasAdminAuth ? bracket0to30.costValuation : '[CONFIDENTIAL]',
            percentageOfInventory: totalUnits > 0 ? ((bracket0to30.units / totalUnits) * 100).toFixed(1) + '%' : '0%',
          },
          '31_to_60_days_medium': {
            unitCount: bracket31to60.units,
            retailValuation: bracket31to60.retailValuation,
            retailValuationFormatted: `${bracket31to60.retailValuation.toLocaleString()} Ks`,
            costValuation: hasAdminAuth ? bracket31to60.costValuation : '[CONFIDENTIAL]',
            percentageOfInventory: totalUnits > 0 ? ((bracket31to60.units / totalUnits) * 100).toFixed(1) + '%' : '0%',
          },
          '61_to_90_days_aging': {
            unitCount: bracket61to90.units,
            retailValuation: bracket61to90.retailValuation,
            retailValuationFormatted: `${bracket61to90.retailValuation.toLocaleString()} Ks`,
            costValuation: hasAdminAuth ? bracket61to90.costValuation : '[CONFIDENTIAL]',
            percentageOfInventory: totalUnits > 0 ? ((bracket61to90.units / totalUnits) * 100).toFixed(1) + '%' : '0%',
          },
          'over_90_days_high_risk': {
            unitCount: bracket90plus.units,
            retailValuation: bracket90plus.retailValuation,
            retailValuationFormatted: `${bracket90plus.retailValuation.toLocaleString()} Ks`,
            costValuation: hasAdminAuth ? bracket90plus.costValuation : '[CONFIDENTIAL]',
            percentageOfInventory: totalUnits > 0 ? ((bracket90plus.units / totalUnits) * 100).toFixed(1) + '%' : '0%',
            criticalItems: bracket90plus.items.slice(0, 5),
          },
        },
      };
    }

    case 'dead_stock': {
      // Find products that have stock > 0 but ZERO units sold in sales history
      const soldProductIds = new Set<string>();
      sales.forEach(s => {
        if (s.status === 'completed') {
          s.items.forEach(i => soldProductIds.add(i.productId));
        }
      });

      const deadStockItems = products
        .filter(p => p.stock > 0 && !soldProductIds.has(p.id))
        .map(p => {
          const item: any = {
            id: p.id,
            name: p.name,
            brand: p.brand,
            category: p.category,
            stock: p.stock,
            sellingPrice: p.sellingPrice,
            sellingPriceFormatted: `${(p.sellingPrice || 0).toLocaleString()} Ks`,
            totalTiedRetailCapital: p.sellingPrice * p.stock,
            totalTiedRetailCapitalFormatted: `${(p.sellingPrice * p.stock).toLocaleString()} Ks`,
            daysSinceRestock: p.lastRestockedAt ? Math.floor((Date.now() - new Date(p.lastRestockedAt).getTime()) / (1000 * 3600 * 24)) : 60,
          };

          if (hasAdminAuth) {
            item.costPrice = p.costPrice;
            item.costPriceFormatted = `${(p.costPrice || 0).toLocaleString()} Ks`;
            item.totalTiedCapital = p.costPrice * p.stock;
            item.totalTiedCapitalFormatted = `${(p.costPrice * p.stock).toLocaleString()} Ks`;
          }

          return item;
        });

      const totalTiedRetailCapital = deadStockItems.reduce((sum, item) => sum + item.totalTiedRetailCapital, 0);
      const totalTiedCostCapital = hasAdminAuth ? deadStockItems.reduce((sum, item) => sum + (item.totalTiedCapital || 0), 0) : 0;
      const totalDeadUnits = deadStockItems.reduce((sum, item) => sum + item.stock, 0);

      return {
        reportType: 'dead_stock',
        deadStockItemCount: deadStockItems.length,
        totalDeadUnits,
        totalTiedRetailCapital,
        totalTiedRetailCapitalFormatted: `${totalTiedRetailCapital.toLocaleString()} Ks`,
        totalTiedCapitalAtCost: hasAdminAuth ? totalTiedCostCapital : '[CONFIDENTIAL - ADMIN ONLY]',
        totalTiedCapitalAtCostFormatted: hasAdminAuth ? `${totalTiedCostCapital.toLocaleString()} Ks` : '[CONFIDENTIAL - ADMIN ONLY]',
        recommendation: 'Consider introducing a 10%-15% promotional clearance discount or bundled accessory giveaway to liquidate stagnant inventory.',
        items: deadStockItems,
      };
    }

    case 'imei_lifecycle': {
      const cleanImei = (imei || '').replace(/[^0-9]/g, '');
      if (!cleanImei) {
        return {
          reportType: 'imei_lifecycle',
          error: 'Please provide a valid 15-digit IMEI number to track its lifecycle.',
        };
      }

      // Search across products
      let foundProduct: Product | undefined;
      let inStock = false;
      for (const p of products) {
        const hasImei = (p.imeiList || []).some(im => im.includes(cleanImei)) ||
          (p.imeiPairs || []).some(pair => (pair.imei1 && pair.imei1.includes(cleanImei)) || (pair.imei2 && pair.imei2.includes(cleanImei)));
        if (hasImei) {
          foundProduct = p;
          inStock = true;
          break;
        }
      }

      // Search in sales invoices
      let saleRecord: any = null;
      for (const s of sales) {
        for (const item of s.items) {
          if ((item.imei && item.imei.includes(cleanImei)) || (item.imei2 && item.imei2.includes(cleanImei))) {
            saleRecord = {
              invoiceNumber: s.invoiceNumber,
              saleDate: s.date,
              customerName: s.customerName,
              customerPhone: s.customerPhone,
              soldPrice: item.finalPrice,
              soldPriceFormatted: `${(item.finalPrice || 0).toLocaleString()} Ks`,
              warrantyPeriod: item.warrantyPeriod,
              status: s.status,
              soldBy: s.soldBy,
            };
            break;
          }
        }
        if (saleRecord) break;
      }

      // Search in purchase records
      let purchaseRecord: any = null;
      for (const po of purchases) {
        for (const item of po.items) {
          if ((item.imeiList || []).some(im => im.includes(cleanImei)) ||
              (item.imeiPairs || []).some(pr => (pr.imei1 && pr.imei1.includes(cleanImei)) || (pr.imei2 && pr.imei2.includes(cleanImei)))) {
            purchaseRecord = {
              purchaseOrderNumber: po.purchaseOrderNumber,
              supplierName: hasAdminAuth ? po.supplierName : '[CONFIDENTIAL]',
              dateReceived: po.date,
              unitCost: hasAdminAuth ? item.unitCost : '[CONFIDENTIAL]',
              unitCostFormatted: hasAdminAuth ? `${(item.unitCost || 0).toLocaleString()} Ks` : '[CONFIDENTIAL]',
              receivedBy: po.receivedBy,
            };
            break;
          }
        }
        if (purchaseRecord) break;
      }

      return {
        reportType: 'imei_lifecycle',
        searchedImei: cleanImei,
        currentStatus: saleRecord ? (saleRecord.status === 'refunded' ? 'REFUNDED_IN_STORE' : 'SOLD_TO_CUSTOMER') : (inStock ? 'IN_STOCK' : 'NOT_FOUND'),
        productDetails: foundProduct ? {
          name: foundProduct.name,
          brand: foundProduct.brand,
          model: foundProduct.model,
          ram: foundProduct.ram,
          rom: foundProduct.rom,
          color: foundProduct.color,
          condition: foundProduct.condition,
          sku: foundProduct.sku,
          sellingPrice: foundProduct.sellingPrice,
          sellingPriceFormatted: `${(foundProduct.sellingPrice || 0).toLocaleString()} Ks`,
        } : null,
        procurement: purchaseRecord,
        saleTransaction: saleRecord,
      };
    }

    case 'category_sales': {
      const categoryMap: Record<string, { units: number; revenue: number; cogs: number; profit: number; orderCount: number; topModels: Record<string, number> }> = {
        new_phones: { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} },
        used_phones: { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} },
        accessories: { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} },
        gadgets: { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} },
        sim_topup: { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} },
        spare_parts: { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} },
      };

      relevantSales.forEach(s => {
        if (s.status === 'completed') {
          s.items.forEach(item => {
            const cat = item.category || 'new_phones';
            if (!categoryMap[cat]) {
              categoryMap[cat] = { units: 0, revenue: 0, cogs: 0, profit: 0, orderCount: 0, topModels: {} };
            }
            const itemRev = item.finalPrice * item.quantity;
            const itemCost = (item.costPrice || 0) * item.quantity;
            categoryMap[cat].units += item.quantity;
            categoryMap[cat].revenue += itemRev;
            categoryMap[cat].cogs += itemCost;
            categoryMap[cat].profit += (itemRev - itemCost);
            categoryMap[cat].orderCount += 1;
            categoryMap[cat].topModels[item.name] = (categoryMap[cat].topModels[item.name] || 0) + item.quantity;
          });
        }
      });

      const formattedCategories = Object.entries(categoryMap).map(([catKey, data]) => {
        const margin = data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) + '%' : '0%';
        const sortedTopModels = Object.entries(data.topModels)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, count]) => `${name} (${count} sold)`);

        return {
          category: catKey,
          unitsSold: data.units,
          totalRevenue: data.revenue,
          totalRevenueFormatted: `${data.revenue.toLocaleString()} Ks`,
          grossProfit: hasAdminAuth ? data.profit : '[CONFIDENTIAL]',
          grossProfitFormatted: hasAdminAuth ? `${data.profit.toLocaleString()} Ks` : '[CONFIDENTIAL]',
          profitMargin: hasAdminAuth ? margin : '[CONFIDENTIAL]',
          topSellingModels: sortedTopModels,
        };
      });

      return {
        reportType: 'category_sales',
        timeframe: date_range,
        categories: formattedCategories,
      };
    }

    default:
      return {
        error: `Unknown report_type: ${report_type}. Available: z_report, stock_aging, dead_stock, imei_lifecycle, category_sales.`,
      };
  }
}

// Execute add_inventory_item mutation
export function executeAddInventoryItem(args: any, context: PosDataContext): { success: boolean; message: string; createdProduct?: Product } {
  const {
    brand,
    model,
    ram = '-',
    rom = '256GB',
    color = 'Black',
    cost_price,
    selling_price,
    quantity = 1,
    imei_list = [],
    category = 'new_phones',
    condition = 'brand_new',
    supplier_name = 'Official Distributor',
    warranty_months = 12,
  } = args;

  if (!brand || !model || !color || cost_price === undefined || selling_price === undefined) {
    return {
      success: false,
      message: 'Missing mandatory fields: brand, model, color, cost_price, selling_price, quantity, or imei_list.',
    };
  }

  // Clean and sanitize IMEI strings
  const cleanedImeis: string[] = (Array.isArray(imei_list) ? imei_list : [imei_list])
    .map((im: any) => String(im).replace(/[^0-9]/g, ''))
    .filter((im: string) => im.length >= 14 && im.length <= 16);

  if (category === 'new_phones' || category === 'used_phones') {
    if (cleanedImeis.length === 0) {
      return {
        success: false,
        message: 'No valid 15-digit IMEI provided. Every phone unit must have a 15-digit IMEI number.',
      };
    }
  }

  const finalQty = Math.max(1, Number(quantity) || cleanedImeis.length || 1);
  const now = new Date();
  const timestamp = Date.now();
  const cleanBrand = String(brand).trim();
  const cleanModel = String(model).trim();
  const cleanColor = String(color).trim();

  // Generate unique SKU & Barcode
  const brandCode = cleanBrand.slice(0, 3).toUpperCase();
  const modelCode = cleanModel.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  const colorCode = cleanColor.slice(0, 3).toUpperCase();
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const sku = `${brandCode}-${modelCode}-${colorCode}-${randomSuffix}`;
  const barcode = `893${Math.floor(1000000000 + Math.random() * 9000000000)}`;

  const specLabel = ram && ram !== '-' ? `${ram}/${rom}` : (rom ? `${rom}` : '');
  const productName = `${cleanBrand} ${cleanModel} ${specLabel ? `(${specLabel})` : ''} - ${cleanColor}`.replace(/\s+/g, ' ').trim();

  const newProduct: Product = {
    id: `prod_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
    name: productName,
    brand: cleanBrand,
    model: cleanModel,
    category: category as any,
    condition: condition as any,
    sku,
    barcode,
    costPrice: Number(cost_price),
    sellingPrice: Number(selling_price),
    stock: finalQty,
    minStockAlert: 2,
    ram: ram || '-',
    rom: rom || '-',
    storage: rom || '-',
    color: cleanColor,
    imeiList: cleanedImeis,
    imeiPairs: cleanedImeis.map(im => ({ imei1: im })),
    dualImei: false,
    warrantyMonths: Number(warranty_months) || 12,
    supplierName: supplier_name || 'Direct Procurement',
    lastRestockedAt: now.toISOString(),
  };

  return {
    success: true,
    message: `Successfully added ${finalQty} unit(s) of "${newProduct.name}" (SKU: ${newProduct.sku}) into store inventory with ${cleanedImeis.length} registered IMEI(s).`,
    createdProduct: newProduct,
  };
}

// Tool Execution Handler 3: Update Product Price
export function executeUpdateProductPrice(args: any, context: PosDataContext) {
  const products = context.products || [];
  if (products.length === 0) {
    return {
      success: false,
      error: 'Store inventory is empty. No products available to update.',
    };
  }

  const newSellingPrice = Number(args.new_selling_price);
  if (isNaN(newSellingPrice) || newSellingPrice < 0) {
    return {
      success: false,
      error: 'Invalid new_selling_price provided. Price must be a positive number.',
    };
  }

  const query = (args.product_query || args.model || args.name || '').toLowerCase().trim();
  const brand = (args.brand || '').toLowerCase().trim();
  const ram = (args.ram || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rom = (args.rom || args.storage || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const color = (args.color || '').toLowerCase().trim();
  const productId = args.product_id;

  // 1. Direct ID match
  let targetProduct: Product | undefined = productId ? products.find(p => p.id === productId) : undefined;

  // 2. Exact or fuzzy match across products
  if (!targetProduct) {
    // Score matches
    const scored = products.map(prod => {
      let score = 0;
      const pName = (prod.name || '').toLowerCase();
      const pModel = (prod.model || '').toLowerCase();
      const pBrand = (prod.brand || '').toLowerCase();
      const pSku = (prod.sku || '').toLowerCase();
      const pRam = (prod.ram || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const pRom = (prod.rom || prod.storage || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const pColor = (prod.color || '').toLowerCase();

      if (query) {
        if (pName === query || pModel === query || pSku === query) score += 100;
        else if (pName.includes(query) || pModel.includes(query)) score += 50;
        else {
          // Token matches
          const tokens = query.split(/\s+/).filter(Boolean);
          for (const token of tokens) {
            if (pName.includes(token) || pModel.includes(token) || pSku.includes(token)) score += 15;
          }
        }
      }

      if (brand && (pBrand.includes(brand) || pName.includes(brand))) score += 30;
      if (ram && (pRam.includes(ram) || pName.replace(/[^a-z0-9]/g, '').includes(ram))) score += 20;
      if (rom && (pRom.includes(rom) || pName.replace(/[^a-z0-9]/g, '').includes(rom))) score += 20;
      if (color && (pColor.includes(color) || pName.includes(color))) score += 15;

      return { product: prod, score };
    });

    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 0 && scored[0].score > 0) {
      targetProduct = scored[0].product;
    }
  }

  if (!targetProduct) {
    return {
      success: false,
      error: `Could not locate product matching "${args.product_query || args.model || 'given query'}" in store inventory. Try querying products first or provide more specific model/brand info.`,
      availableProductsPreview: products.slice(0, 5).map(p => ({ id: p.id, name: p.name, currentPrice: p.sellingPrice, sku: p.sku })),
    };
  }

  const oldSellingPrice = targetProduct.sellingPrice;
  const oldCostPrice = targetProduct.costPrice;

  // Create updated product clone
  const updatedProduct: Product = {
    ...targetProduct,
    sellingPrice: newSellingPrice,
    costPrice: args.new_cost_price !== undefined ? Number(args.new_cost_price) : targetProduct.costPrice,
  };

  return {
    success: true,
    message: `Updated price for "${updatedProduct.name}" (SKU: ${updatedProduct.sku}) from ${oldSellingPrice.toLocaleString()} to ${newSellingPrice.toLocaleString()}.`,
    productId: updatedProduct.id,
    productName: updatedProduct.name,
    sku: updatedProduct.sku,
    oldSellingPrice,
    newSellingPrice,
    oldCostPrice,
    newCostPrice: updatedProduct.costPrice,
    updatedProduct,
  };
}

// Helper to normalize common retail search typos for smartphones
function normalizeRetailQuery(query: string): string {
  let q = (query || '').toLowerCase().trim();
  const typoMap: [RegExp, string][] = [
    [/\b(ihpone|ipone|iphon)\b/g, 'iphone'],
    [/\b(samsungg|samusng|samsug)\b/g, 'samsung'],
    [/\b(radmi|redmii)\b/g, 'redmi'],
    [/\b(xiaomii|xiomi|xaomi)\b/g, 'xiaomi'],
    [/\b(reallme|relame)\b/g, 'realme'],
    [/\b(opo)\b/g, 'oppo'],
    [/\b(vivvo)\b/g, 'vivo'],
    [/\b(huaweii)\b/g, 'huawei'],
    [/\b(pixle)\b/g, 'pixel'],
    [/\b(1plus)\b/g, 'oneplus'],
    [/\b(infnix|infinx)\b/g, 'infinix'],
    [/\b(tekno)\b/g, 'tecno'],
  ];

  for (const [pattern, fix] of typoMap) {
    q = q.replace(pattern, fix);
  }
  return q;
}

// Helper to determine if a product is an accessory (case, cover, glass, charger, etc.)
function isAccessoryItem(p: Product): boolean {
  const cat = (p.category || '').toLowerCase();
  if (cat === 'accessories' || cat === 'accessory') return true;

  const text = `${p.name || ''} ${p.model || ''} ${p.subCategory || ''} ${cat}`.toLowerCase();
  const accessoryKeywords = [
    'case', 'cover', 'tempered', 'glass', 'screen protector', 'protector',
    'charger', 'cable', 'adapter', 'power bank', 'powerbank', 'earphone',
    'headphone', 'airpod', 'earbud', 'strap', 'holder', 'mount', 'stand',
    'pouch', 'film', 'hydrogel', 'lens protector'
  ];

  return accessoryKeywords.some(kw => text.includes(kw));
}

// Tool Execution Handler 4: Query Inventory Products
export function executeQueryInventoryProducts(args: any, context: PosDataContext) {
  const products = context.products || [];
  const rawQuery = (args.search_query || '').trim();
  const query = normalizeRetailQuery(rawQuery);
  const rawCategory = (args.category || '').toLowerCase().trim();
  const brand = normalizeRetailQuery(args.brand || '');
  const excludeAccessories = args.exclude_accessories === true;

  // Verify Admin authorization for trade secrets (Cost Price & Supplier Name)
  const hasAdminAuth = args.admin_secret_key === 'WIN_ADMIN_UNMASK_2026' ||
    Boolean(process.env.ADMIN_AUDIT_KEY && args.admin_secret_key === process.env.ADMIN_AUDIT_KEY);

  let matched = products;

  // 1. Category Filtering & Accessory Safeguard
  const isPhoneCategoryFilter =
    rawCategory === 'mobile phones' ||
    rawCategory === 'phones' ||
    rawCategory === 'new_phones' ||
    rawCategory === 'used_phones' ||
    rawCategory === 'phone';

  const isAccessoryCategoryFilter =
    rawCategory === 'accessories' ||
    rawCategory === 'accessory';

  // Check if query explicitly asks for phone models
  const phoneModelKeywords = ['iphone', 'samsung', 'galaxy', 'redmi', 'xiaomi', 'pixel', 'realme', 'oppo', 'vivo', 'oneplus', 'infinix', 'tecno', 'honor', 'phone'];
  const mentionsPhone = phoneModelKeywords.some(kw => query.includes(kw));
  const mentionsAccessory = ['case', 'cover', 'glass', 'charger', 'cable', 'protector', 'accessory', 'accessories', 'earphone', 'power bank'].some(kw => query.includes(kw));

  if (isPhoneCategoryFilter || excludeAccessories || (mentionsPhone && !mentionsAccessory)) {
    // Strictly isolate actual smartphones: must be classified as phone product AND must not be an accessory
    matched = matched.filter(p => isPhoneProduct(p) && !isAccessoryItem(p));
  } else if (isAccessoryCategoryFilter || (mentionsAccessory && !mentionsPhone)) {
    matched = matched.filter(p => isAccessoryItem(p));
  } else if (rawCategory && rawCategory !== 'all') {
    matched = matched.filter(p => (p.category || '').toLowerCase() === rawCategory);
  }

  // 2. Brand Filtering
  if (brand) {
    matched = matched.filter(p => (p.brand || '').toLowerCase().includes(brand));
  }

  // 3. Search Query Matching (with normalized typos)
  if (query) {
    const queryTokens = query.split(/\s+/).filter(Boolean);
    matched = matched.filter(p => {
      const full = `${p.name} ${p.brand} ${p.model} ${p.sku} ${p.barcode} ${p.ram} ${p.rom} ${p.color}`.toLowerCase();
      // Match all query tokens or full substring
      return queryTokens.every(tok => full.includes(tok));
    });
  }

  // 4. Out-of-Stock Filtering
  const explicitlyWantsOutOfStock =
    args.include_out_of_stock === true ||
    args.stock_filter === 'out_of_stock' ||
    query.includes('out of stock') ||
    query.includes('dead stock') ||
    query.includes('zero stock') ||
    query.includes('empty stock');

  const wantsAllStock = args.stock_filter === 'all' || query.includes('all stock');

  if (!explicitlyWantsOutOfStock && !wantsAllStock) {
    // Default safeguard: Only show products with positive stock (stock > 0)
    matched = matched.filter(p => (Number(p.stock) || 0) > 0);
  } else if (explicitlyWantsOutOfStock && !wantsAllStock) {
    matched = matched.filter(p => (Number(p.stock) || 0) <= 0);
  }

  // 5. Output Formatting with Strict Price Confidentiality
  const formatted = matched.slice(0, 15).map(p => {
    const item: any = {
      id: p.id,
      name: p.name,
      brand: p.brand,
      model: p.model,
      specs: `${p.ram || '-'}/${p.rom || p.storage || '-'} ${p.color || ''}`.trim(),
      sellingPrice: p.sellingPrice,
      sellingPriceFormatted: `${(p.sellingPrice || 0).toLocaleString()} Ks`,
      stock: p.stock,
      availabilityStatus: (p.stock || 0) > 0 ? 'In Stock' : 'Out of Stock',
      sku: p.sku,
      barcode: p.barcode,
      category: p.category,
      isPhone: isPhoneProduct(p),
      imeiCount: (p.imeiList || []).length,
      sampleImeis: (p.imeiList || []).slice(0, 3),
    };

    // Strict Price Confidentiality: NEVER expose cost price or supplier unless authorized admin
    if (hasAdminAuth) {
      item.costPrice = p.costPrice;
      item.costPriceFormatted = `${(p.costPrice || 0).toLocaleString()} Ks`;
      item.supplier = (p as any).supplier || p.supplierId || 'Internal Stock';
    }

    return item;
  });

  return {
    totalMatches: matched.length,
    shownCount: formatted.length,
    stockFilterApplied: explicitlyWantsOutOfStock ? 'out_of_stock_only' : (wantsAllStock ? 'all_inventory' : 'in_stock_only'),
    products: formatted,
  };
}

// Tool Execution Handler 5: Generate & Trigger PDF Report Download
export function executeGeneratePdfReport(args: any, context: PosDataContext) {
  const { report_type = 'daily_profit_dossier', date, year, date_range, imei, title } = args;
  const products = context.products || [];
  const sales = context.sales || [];
  const expenses = context.expenses || [];
  const settings = context.settings || { shopName: 'Mobile Store', currencySymbol: 'MMK' };
  const currency = settings.currencySymbol || 'Ks';

  const productCostMap = new Map<string, number>();
  products.forEach((p) => {
    if (p.id) productCostMap.set(p.id, p.costPrice || 0);
  });

  // 1. Daily Profit Reports (Dossier, Statement, Ledger)
  if (
    report_type === 'daily_profit_dossier' ||
    report_type === 'daily_profit_statement' ||
    report_type === 'daily_profit_ledger'
  ) {
    const selectedDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
      ? date
      : getMyanmarDateTime().isoDateString;

    let displayFormattedDate = selectedDate;
    try {
      displayFormattedDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {}

    const daySales = sales.filter((s) => isSameMyanmarDate(s.date, selectedDate));
    const dayExpenses = expenses.filter((e) => isSameMyanmarDate(e.date, selectedDate));

    const completedSales = daySales.filter((s) => s.status === 'completed');
    const refundedSales = daySales.filter((s) => s.status === 'refunded' || s.status === 'partially_refunded');

    let grossRevenue = 0;
    let totalCogs = 0;
    let totalUnitsSold = 0;
    let serializedPhoneUnits = 0;
    let accessoryUnits = 0;
    let totalDiscountsGiven = 0;
    let cashRevenue = 0;
    let cashProfit = 0;
    let digitalRevenue = 0;
    let digitalProfit = 0;

    const categoryStats: Record<string, { revenue: number; cogs: number; profit: number; units: number }> = {};
    const paymentStats: Record<string, { revenue: number; cogs: number; profit: number; count: number; label: string }> = {};
    const productStats: Record<string, { name: string; category: string; units: number; revenue: number; cogs: number; profit: number }> = {};

    const invoiceRows = completedSales.map((sale) => {
      let saleRevenue = 0;
      let saleCogs = 0;
      let saleUnits = 0;

      const itemRows = (sale.items || []).map((item) => {
        const qty = item.quantity || 1;
        saleUnits += qty;

        const catLower = (item.category || '').toLowerCase();
        if (catLower.includes('phone') || item.imei || item.imei2) {
          serializedPhoneUnits += qty;
        } else {
          accessoryUnits += qty;
        }

        const unitCost = item.costPrice !== undefined ? item.costPrice : (productCostMap.get(item.productId) || 0);
        const lineRevenue = item.finalPrice !== undefined ? item.finalPrice : (item.unitPrice * qty);
        const lineCogs = unitCost * qty;
        const lineProfit = lineRevenue - lineCogs;
        const lineMargin = lineRevenue > 0 ? (lineProfit / lineRevenue) * 100 : 0;

        saleRevenue += lineRevenue;
        saleCogs += lineCogs;

        const catKey = item.category || 'General';
        if (!categoryStats[catKey]) {
          categoryStats[catKey] = { revenue: 0, cogs: 0, profit: 0, units: 0 };
        }
        categoryStats[catKey].revenue += lineRevenue;
        categoryStats[catKey].cogs += lineCogs;
        categoryStats[catKey].profit += lineProfit;
        categoryStats[catKey].units += qty;

        const prodKey = item.productId || item.name;
        if (!productStats[prodKey]) {
          productStats[prodKey] = {
            name: item.name,
            category: item.category || 'General',
            units: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
          };
        }
        productStats[prodKey].units += qty;
        productStats[prodKey].revenue += lineRevenue;
        productStats[prodKey].cogs += lineCogs;
        productStats[prodKey].profit += lineProfit;

        return {
          ...item,
          unitCost,
          lineRevenue,
          lineCogs,
          lineProfit,
          lineMargin,
        };
      });

      const saleProfit = saleRevenue - saleCogs;
      const saleMargin = saleRevenue > 0 ? (saleProfit / saleRevenue) * 100 : 0;

      grossRevenue += saleRevenue;
      totalCogs += saleCogs;
      totalUnitsSold += saleUnits;
      totalDiscountsGiven += (sale.discountTotal || 0);

      const methodKey = (sale.paymentMethod || 'cash').toLowerCase();
      const isCash = methodKey === 'cash';
      if (isCash) {
        cashRevenue += saleRevenue;
        cashProfit += saleProfit;
      } else {
        digitalRevenue += saleRevenue;
        digitalProfit += saleProfit;
      }

      if (!paymentStats[methodKey]) {
        paymentStats[methodKey] = {
          revenue: 0,
          cogs: 0,
          profit: 0,
          count: 0,
          label: methodKey.toUpperCase(),
        };
      }
      paymentStats[methodKey].revenue += saleRevenue;
      paymentStats[methodKey].cogs += saleCogs;
      paymentStats[methodKey].profit += saleProfit;
      paymentStats[methodKey].count += 1;

      return {
        sale,
        saleRevenue,
        saleCogs,
        saleProfit,
        saleMargin,
        itemRows,
      };
    });

    const totalRefundsAmount = refundedSales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
    const netSalesRevenue = Math.max(0, grossRevenue - totalRefundsAmount);
    const grossProfit = grossRevenue - totalCogs;
    const overallGrossMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    const overallMarkupPercent = totalCogs > 0 ? (grossProfit / totalCogs) * 100 : 0;
    const averageProfitPerOrder = completedSales.length > 0 ? grossProfit / completedSales.length : 0;

    const operatingExpensesTotal = dayExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const writeOffScrapLosses = dayExpenses
      .filter((e) => e.category === 'damage_loss' || e.paidTo?.includes('Scrap') || e.isAutoGenerated)
      .reduce((acc, e) => acc + (e.amount || 0), 0);

    const netOperatingProfit = grossProfit - operatingExpensesTotal;
    const netProfitMargin = grossRevenue > 0 ? (netOperatingProfit / grossRevenue) * 100 : 0;

    const categoryRows = Object.entries(categoryStats).map(([catName, data]) => {
      const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
      const contribution = grossProfit > 0 ? (data.profit / grossProfit) * 100 : 0;
      return {
        name: catName,
        revenue: data.revenue,
        cogs: data.cogs,
        profit: data.profit,
        units: data.units,
        margin,
        contribution,
      };
    });

    const paymentRows = Object.entries(paymentStats).map(([method, data]) => ({
      method,
      label: data.label,
      revenue: data.revenue,
      cogs: data.cogs,
      profit: data.profit,
      count: data.count,
    }));

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    const dailyFinancials = {
      completedInvoicesCount: completedSales.length,
      refundedInvoicesCount: refundedSales.length,
      grossRevenue,
      netSalesRevenue,
      totalDiscountsGiven,
      totalRefundsAmount,
      totalCogs,
      totalUnitsSold,
      serializedPhoneUnits,
      accessoryUnits,
      grossProfit,
      overallGrossMargin,
      overallMarkupPercent,
      averageProfitPerOrder,
      operatingExpensesTotal,
      writeOffScrapLosses,
      netOperatingProfit,
      netProfitMargin,
      cashRevenue,
      cashProfit,
      digitalRevenue,
      digitalProfit,
      invoiceRows,
      categoryRows,
      paymentRows,
      topProducts,
    };

    const reportLabels: Record<string, string> = {
      daily_profit_dossier: 'Daily Gross Profit & P&L Audit Dossier',
      daily_profit_statement: 'Daily Statement of Profit & Loss',
      daily_profit_ledger: 'Daily Gross Profit Transaction Ledger',
    };

    const reportName = reportLabels[report_type] || 'Daily Profit Report';
    const filename = `${report_type}_${selectedDate}.pdf`;

    return {
      success: true,
      reportType: report_type,
      reportName,
      filename,
      date: selectedDate,
      data: {
        selectedDate,
        displayFormattedDate,
        dailyFinancials,
        dailyExpenses: dayExpenses,
        settings,
        staffName: 'Aura AI Copilot / Store Manager',
      },
      summary: {
        date: selectedDate,
        invoices: completedSales.length,
        grossRevenue,
        netSalesRevenue,
        cogs: totalCogs,
        grossProfit,
        marginPercent: `${overallGrossMargin.toFixed(1)}%`,
        operatingExpenses: operatingExpensesTotal,
        netProfit: netOperatingProfit,
      },
      message: `Successfully prepared ${reportName} for ${selectedDate}. PDF report document generated.`,
    };
  }

  // 2. Annual Profit Reports (Statement, Dossier)
  if (report_type === 'annual_profit_statement' || report_type === 'annual_profit_dossier') {
    const selectedYear = Number(year) || new Date().getFullYear();
    const isCurrentYear = selectedYear === new Date().getFullYear();
    const yearStr = String(selectedYear);

    const yearSales = sales.filter((s) => s.date && s.date.startsWith(yearStr));
    const yearExpenses = expenses.filter((e) => e.date && e.date.startsWith(yearStr));

    const completedSales = yearSales.filter((s) => s.status === 'completed');
    const refundedSales = yearSales.filter((s) => s.status === 'refunded' || s.status === 'partially_refunded');

    let grossSalesRevenue = 0;
    let totalDiscountsGiven = 0;
    let totalCogs = 0;
    let totalUnitsSold = 0;
    let phoneUnitsSold = 0;
    let accessoryUnitsSold = 0;

    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const FULL_MONTHS = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const monthlyStats = Array.from({ length: 12 }, () => ({
      ordersCount: 0,
      unitsSold: 0,
      grossRevenue: 0,
      discountsGiven: 0,
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      operatingExpenses: 0,
    }));

    const categoryMap = new Map<string, { revenue: number; cogs: number; profit: number; units: number }>();
    const productMap = new Map<string, { name: string; category: string; units: number; revenue: number; cogs: number; profit: number }>();

    completedSales.forEach((sale) => {
      grossSalesRevenue += (sale.grandTotal || 0);
      const saleDiscount = sale.discountTotal || 0;
      totalDiscountsGiven += saleDiscount;

      let saleMonth = 0;
      try {
        const m = parseInt(sale.date.slice(5, 7), 10) - 1;
        if (m >= 0 && m <= 11) saleMonth = m;
      } catch {}

      monthlyStats[saleMonth].ordersCount += 1;
      monthlyStats[saleMonth].grossRevenue += (sale.grandTotal || 0);
      monthlyStats[saleMonth].discountsGiven += saleDiscount;
      monthlyStats[saleMonth].netRevenue += (sale.grandTotal || 0);

      (sale.items || []).forEach((item) => {
        const qty = item.quantity || 1;
        totalUnitsSold += qty;
        monthlyStats[saleMonth].unitsSold += qty;

        const unitCost = item.costPrice !== undefined ? item.costPrice : (productCostMap.get(item.productId) || 0);
        const itemCogs = qty * unitCost;
        const itemRevenue = item.finalPrice !== undefined ? item.finalPrice : (item.unitPrice * qty);
        const itemProfit = itemRevenue - itemCogs;

        monthlyStats[saleMonth].cogs += itemCogs;
        monthlyStats[saleMonth].grossProfit += itemProfit;

        totalCogs += itemCogs;

        const catLower = (item.category || '').toLowerCase();
        if (catLower.includes('phone') || item.imei || item.imei2) {
          phoneUnitsSold += qty;
        } else {
          accessoryUnitsSold += qty;
        }

        const catKey = item.category || 'General';
        const currentCat = categoryMap.get(catKey) || { revenue: 0, cogs: 0, profit: 0, units: 0 };
        currentCat.revenue += itemRevenue;
        currentCat.cogs += itemCogs;
        currentCat.profit += itemProfit;
        currentCat.units += qty;
        categoryMap.set(catKey, currentCat);

        const prodKey = item.productId || item.name;
        const currentProd = productMap.get(prodKey) || {
          name: item.name,
          category: item.category || 'General',
          units: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
        };
        currentProd.units += qty;
        currentProd.revenue += itemRevenue;
        currentProd.cogs += itemCogs;
        currentProd.profit += itemProfit;
        productMap.set(prodKey, currentProd);
      });
    });

    let totalOperatingExpenses = 0;
    const expenseCategoryMap = new Map<string, { amount: number; count: number }>();

    yearExpenses.forEach((exp) => {
      const amt = exp.amount || 0;
      totalOperatingExpenses += amt;

      let expMonth = 0;
      try {
        const m = parseInt(exp.date.slice(5, 7), 10) - 1;
        if (m >= 0 && m <= 11) expMonth = m;
      } catch {}
      monthlyStats[expMonth].operatingExpenses += amt;

      const cat = exp.category || 'General Operations';
      const cur = expenseCategoryMap.get(cat) || { amount: 0, count: 0 };
      cur.amount += amt;
      cur.count += 1;
      expenseCategoryMap.set(cat, cur);
    });

    const totalRefundsAmount = refundedSales.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
    const netSalesRevenue = Math.max(0, grossSalesRevenue - totalRefundsAmount);
    const grossProfit = grossSalesRevenue - totalCogs;
    const grossMarginPercent = grossSalesRevenue > 0 ? (grossProfit / grossSalesRevenue) * 100 : 0;
    const netOperatingProfit = grossProfit - totalOperatingExpenses;
    const netMarginPercent = grossSalesRevenue > 0 ? (netOperatingProfit / grossSalesRevenue) * 100 : 0;
    const averageOrderValue = completedSales.length > 0 ? grossSalesRevenue / completedSales.length : 0;

    const months = monthlyStats.map((m, idx) => {
      const grossMargin = m.grossRevenue > 0 ? (m.grossProfit / m.grossRevenue) * 100 : 0;
      const netProfit = m.grossProfit - m.operatingExpenses;
      const netMargin = m.grossRevenue > 0 ? (netProfit / m.grossRevenue) * 100 : 0;
      return {
        monthIndex: idx,
        monthName: MONTH_NAMES[idx],
        fullName: FULL_MONTHS[idx],
        monthKey: `${selectedYear}-${String(idx + 1).padStart(2, '0')}`,
        ordersCount: m.ordersCount,
        unitsSold: m.unitsSold,
        grossRevenue: m.grossRevenue,
        discountsGiven: m.discountsGiven,
        netRevenue: m.netRevenue,
        cogs: m.cogs,
        grossProfit: m.grossProfit,
        grossMarginPercent: grossMargin,
        operatingExpenses: m.operatingExpenses,
        netOperatingProfit: netProfit,
        netMarginPercent: netMargin,
      };
    });

    const quarters = [
      { quarter: 'Q1', name: 'First Quarter', months: 'Jan - Mar', mStart: 0, mEnd: 2 },
      { quarter: 'Q2', name: 'Second Quarter', months: 'Apr - Jun', mStart: 3, mEnd: 5 },
      { quarter: 'Q3', name: 'Third Quarter', months: 'Jul - Sep', mStart: 6, mEnd: 8 },
      { quarter: 'Q4', name: 'Fourth Quarter', months: 'Oct - Dec', mStart: 9, mEnd: 11 },
    ].map((q) => {
      const qMonths = months.slice(q.mStart, q.mEnd + 1);
      const rev = qMonths.reduce((acc, m) => acc + m.grossRevenue, 0);
      const c = qMonths.reduce((acc, m) => acc + m.cogs, 0);
      const p = rev - c;
      const exp = qMonths.reduce((acc, m) => acc + m.operatingExpenses, 0);
      const net = p - exp;
      const margin = rev > 0 ? (p / rev) * 100 : 0;
      const netMargin = rev > 0 ? (net / rev) * 100 : 0;
      const orders = qMonths.reduce((acc, m) => acc + m.ordersCount, 0);

      return {
        quarter: q.quarter,
        name: q.name,
        months: q.months,
        grossRevenue: rev,
        cogs: c,
        grossProfit: p,
        grossMarginPercent: margin,
        operatingExpenses: exp,
        netOperatingProfit: net,
        netMarginPercent: netMargin,
        ordersCount: orders,
      };
    });

    const categories = Array.from(categoryMap.entries())
      .map(([catName, data]) => {
        const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
        const contrib = grossProfit > 0 ? (data.profit / grossProfit) * 100 : 0;
        return {
          category: catName,
          revenue: data.revenue,
          cogs: data.cogs,
          profit: data.profit,
          marginPercent: margin,
          unitsSold: data.units,
          profitContributionPercent: contrib,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    const topProducts = Array.from(productMap.values())
      .map((prod) => {
        const margin = prod.revenue > 0 ? (prod.profit / prod.revenue) * 100 : 0;
        return {
          name: prod.name,
          category: prod.category,
          unitsSold: prod.units,
          revenue: prod.revenue,
          cogs: prod.cogs,
          profit: prod.profit,
          marginPercent: margin,
        };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    const expensesByCategory = Array.from(expenseCategoryMap.entries()).map(([cat, val]) => ({
      category: cat,
      amount: val.amount,
      count: val.count,
      percentageOfTotal: totalOperatingExpenses > 0 ? (val.amount / totalOperatingExpenses) * 100 : 0,
    }));

    const annualData = {
      selectedYear,
      isCurrentYear,
      totalCompletedInvoices: completedSales.length,
      totalRefundedInvoices: refundedSales.length,
      totalUnitsSold,
      phoneUnitsSold,
      accessoryUnitsSold,
      grossSalesRevenue,
      totalDiscountsGiven,
      totalRefundsAmount,
      netSalesRevenue,
      totalCogs,
      grossProfit,
      grossMarginPercent,
      totalOperatingExpenses,
      netOperatingProfit,
      netMarginPercent,
      averageOrderValue,
      months,
      quarters,
      categories,
      topProducts,
      expensesByCategory,
    };

    const reportName =
      report_type === 'annual_profit_statement'
        ? `Annual Statement of Profit & Loss FY ${selectedYear}`
        : `Annual Financial & P&L Dossier FY ${selectedYear}`;

    const filename = `${report_type}_FY${selectedYear}.pdf`;

    return {
      success: true,
      reportType: report_type,
      reportName,
      filename,
      year: selectedYear,
      data: {
        annualData,
        settings,
        staffName: 'Aura AI Copilot / Store Management',
      },
      summary: {
        fiscalYear: selectedYear,
        orders: completedSales.length,
        grossRevenue: grossSalesRevenue,
        cogs: totalCogs,
        grossProfit,
        margin: `${grossMarginPercent.toFixed(1)}%`,
        netOperatingProfit,
      },
      message: `Successfully generated ${reportName}. PDF report document generated.`,
    };
  }

  // 3. POS Reports (Z-Report, Stock Aging, Dead Stock, IMEI Lifecycle, Category Sales)
  if (['z_report', 'stock_aging', 'dead_stock', 'imei_lifecycle', 'category_sales'].includes(report_type)) {
    const posReport = executeQueryPosReports(args, context);
    let exportPdfOptions: any = null;
    let reportName = 'POS Audit Report';
    const todayStr = new Date().toISOString().slice(0, 10);

    if (report_type === 'z_report') {
      reportName = 'End-of-Day Register Z-Report';
      const fin = posReport.financialSummary || {};
      const pay = posReport.paymentMethodBreakdown || {};

      exportPdfOptions = {
        title: title || 'OFFICIAL REGISTER Z-REPORT & AUDIT',
        subtitle: `Audit Date: ${todayStr} • Register Balance & Cash Clearance`,
        filename: `z_report_${todayStr}.pdf`,
        headers: ['Financial Audit Metric', 'Order Count / Units', 'Total Balance'],
        rows: [
          ['Gross POS Sales Revenue', `${fin.completedInvoicesCount || 0} Orders`, `${(fin.grossSales || 0).toLocaleString()} ${currency}`],
          ['Price Discounts Granted', '-', `-${(fin.totalDiscountsGiven || 0).toLocaleString()} ${currency}`],
          ['Returns & Customer Refunds', `${fin.refundedInvoicesCount || 0} Refunds`, `-${(fin.totalRefundedAmount || 0).toLocaleString()} ${currency}`],
          ['Net Realized Sales Revenue', `${fin.totalUnitsSold || 0} Units Sold`, `${(fin.netSales || 0).toLocaleString()} ${currency}`],
          ['Cost of Goods Sold (COGS)', 'Acquisition Basis', `(${ (fin.costOfGoodsSold || 0).toLocaleString() }) ${currency}`],
          ['GROSS REGISTER PROFIT', `Margin: ${fin.profitMarginPercent || '0%'}`, `${(fin.grossProfit || 0).toLocaleString()} ${currency}`],
          ['Operating Expenses Today', 'Vouchers Cleared', `-${(fin.totalExpensesToday || 0).toLocaleString()} ${currency}`],
          ['Cash Inflows (Cash Sales)', 'Register Tray', `${(pay.cash || 0).toLocaleString()} ${currency}`],
          ['Digital Pay Inflows (KPay/Wave/Banking)', 'Mobile Wallets', `${Object.entries(pay).filter(([k]) => k !== 'cash').reduce((acc, [, v]) => acc + Number(v), 0).toLocaleString()} ${currency}`],
        ],
        summaryMetrics: [
          { label: 'Gross Sales', value: `${(fin.grossSales || 0).toLocaleString()} ${currency}` },
          { label: 'Net Profit', value: `${(fin.grossProfit || 0).toLocaleString()} ${currency}` },
          { label: 'Profit Margin', value: fin.profitMarginPercent || '0%' },
          { label: 'Units Sold', value: fin.totalUnitsSold || 0 },
        ],
      };
    } else if (report_type === 'stock_aging') {
      reportName = 'Inventory Stock Aging Report';
      const b = posReport.agingBrackets || {};
      exportPdfOptions = {
        title: title || 'INVENTORY AGING & TURNOVER REPORT',
        subtitle: `Generated: ${todayStr} • Stock Valuation & Aging Brackets`,
        filename: `stock_aging_${todayStr}.pdf`,
        headers: ['Aging Bracket', 'Stock Units', '% of Inventory', 'Cost Basis Valuation', 'Retail Valuation'],
        rows: [
          ['0 - 30 Days (Fresh Velocity)', b['0_to_30_days_fresh']?.unitCount || 0, b['0_to_30_days_fresh']?.percentageOfInventory || '0%', `${(b['0_to_30_days_fresh']?.costValuation || 0).toLocaleString()} ${currency}`, `${(b['0_to_30_days_fresh']?.retailValuation || 0).toLocaleString()} ${currency}`],
          ['31 - 60 Days (Medium Age)', b['31_to_60_days_medium']?.unitCount || 0, b['31_to_60_days_medium']?.percentageOfInventory || '0%', `${(b['31_to_60_days_medium']?.costValuation || 0).toLocaleString()} ${currency}`, `${(b['31_to_60_days_medium']?.retailValuation || 0).toLocaleString()} ${currency}`],
          ['61 - 90 Days (Aging Stock)', b['61_to_90_days_aging']?.unitCount || 0, b['61_to_90_days_aging']?.percentageOfInventory || '0%', `${(b['61_to_90_days_aging']?.costValuation || 0).toLocaleString()} ${currency}`, `${(b['61_to_90_days_aging']?.retailValuation || 0).toLocaleString()} ${currency}`],
          ['90+ Days (High Risk Dormant)', b['over_90_days_high_risk']?.unitCount || 0, b['over_90_days_high_risk']?.percentageOfInventory || '0%', `${(b['over_90_days_high_risk']?.costValuation || 0).toLocaleString()} ${currency}`, `${(b['over_90_days_high_risk']?.retailValuation || 0).toLocaleString()} ${currency}`],
        ],
        summaryMetrics: [
          { label: 'Total Stock Units', value: posReport.totalStockUnits || 0 },
          { label: 'Total Cost Value', value: `${(posReport.totalStockValuationCost || 0).toLocaleString()} ${currency}` },
          { label: 'Over 90d Units', value: b['over_90_days_high_risk']?.unitCount || 0 },
        ],
      };
    } else if (report_type === 'dead_stock') {
      reportName = 'Dead Stock & Clearance Report';
      const items = posReport.deadStockItems || [];
      exportPdfOptions = {
        title: title || 'DEAD STOCK & DORMANT INVENTORY AUDIT',
        subtitle: `Items with positive stock but 0 sales • Date: ${todayStr}`,
        filename: `dead_stock_${todayStr}.pdf`,
        headers: ['Product Name', 'Brand', 'Category', 'Stock Units', 'Unit Cost', 'Tied Capital'],
        rows: items.map((it: any) => [
          it.name,
          it.brand,
          it.category,
          it.stock,
          `${(it.costPrice || 0).toLocaleString()} ${currency}`,
          `${(it.totalTiedCapital || 0).toLocaleString()} ${currency}`,
        ]),
        summaryMetrics: [
          { label: 'Dead Stock Items', value: posReport.totalDeadStockItemsCount || 0 },
          { label: 'Total Units', value: posReport.totalDeadStockUnits || 0 },
          { label: 'Tied Capital', value: `${(posReport.totalTiedUpCapitalCost || 0).toLocaleString()} ${currency}` },
        ],
      };
    } else if (report_type === 'category_sales') {
      reportName = 'Category Sales & Margins Report';
      const cats = posReport.categories || [];
      exportPdfOptions = {
        title: title || 'CATEGORY SALES & PROFIT MARGIN PERFORMANCE',
        subtitle: `Timeframe: ${date_range || 'Last 30 Days'} • Date: ${todayStr}`,
        filename: `category_sales_${todayStr}.pdf`,
        headers: ['Category', 'Units Sold', 'Gross Revenue', 'Gross Profit', 'Margin %'],
        rows: cats.map((c: any) => [
          c.category,
          c.unitsSold,
          `${(c.revenue || 0).toLocaleString()} ${currency}`,
          `${(c.profit || 0).toLocaleString()} ${currency}`,
          c.profitMargin,
        ]),
        summaryMetrics: [
          { label: 'Top Category', value: posReport.topCategoryByRevenue?.category || '-' },
          { label: 'Top Margin Category', value: posReport.highestMarginCategory?.category || '-' },
        ],
      };
    } else if (report_type === 'imei_lifecycle') {
      reportName = 'IMEI Device Lifecycle Report';
      const d = posReport.device || {};
      const po = posReport.procurement || {};
      const sl = posReport.sale || {};
      exportPdfOptions = {
        title: title || 'DEVICE IMEI AUDIT & LIFECYCLE CERTIFICATE',
        subtitle: `IMEI: ${posReport.searchedImei || imei || '-'} • Audited: ${todayStr}`,
        filename: `imei_lifecycle_${posReport.searchedImei || 'device'}.pdf`,
        headers: ['Audit Field', 'Lifecycle Details'],
        rows: [
          ['Device IMEI', posReport.searchedImei || '-'],
          ['Product Model', d.name || '-'],
          ['Brand & Category', `${d.brand || '-'} / ${d.category || '-'}`],
          ['Hardware Specs', `${d.ram || '-'}/${d.rom || '-'} ${d.color || ''}`],
          ['Current Status', posReport.status || '-'],
          ['Procured PO Number', po.poNumber || 'N/A'],
          ['Procurement Date', po.date || 'N/A'],
          ['Supplier Name', po.supplier || 'N/A'],
          ['Unit Purchase Cost', `${(po.costPrice || 0).toLocaleString()} ${currency}`],
          ['Sales Invoice #', sl.invoiceNumber || 'In Stock (Unsold)'],
          ['Sold On Date', sl.date || 'N/A'],
          ['Customer Name', sl.customer || 'N/A'],
          ['Selling Price', sl.sellingPrice ? `${sl.sellingPrice.toLocaleString()} ${currency}` : 'N/A'],
          ['Realized Gross Profit', sl.grossProfit ? `${sl.grossProfit.toLocaleString()} ${currency}` : 'N/A'],
        ],
      };
    }

    return {
      success: true,
      reportType: report_type,
      reportName,
      filename: exportPdfOptions?.filename || `${report_type}_report.pdf`,
      exportPdfOptions,
      data: posReport,
      message: `Generated ${reportName}. PDF downloading now.`,
    };
  }

  // 4. Full Inventory Catalog Report
  if (report_type === 'inventory_catalog') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const reportName = 'Inventory Stock & Valuation Catalog';
    const rows = products.map((p) => [
      p.sku || p.barcode || '-',
      p.name,
      p.brand,
      p.category,
      `${p.ram || '-'}/${p.rom || p.storage || '-'} ${p.color || ''}`.trim(),
      p.stock,
      `${(p.sellingPrice || 0).toLocaleString()} ${currency}`,
      `${(p.costPrice || 0).toLocaleString()} ${currency}`,
      `${((p.costPrice || 0) * (p.stock || 0)).toLocaleString()} ${currency}`,
    ]);

    const totalStock = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const totalCostVal = products.reduce((acc, p) => acc + (p.costPrice || 0) * (p.stock || 0), 0);
    const totalRetailVal = products.reduce((acc, p) => acc + (p.sellingPrice || 0) * (p.stock || 0), 0);

    const exportPdfOptions = {
      title: title || 'INVENTORY STOCK CATALOG & VALUATION REPORT',
      subtitle: `Store Inventory as of ${todayStr} • Comprehensive Stock Register`,
      filename: `inventory_catalog_${todayStr}.pdf`,
      headers: ['SKU / Code', 'Product Name', 'Brand', 'Category', 'Specs / Color', 'Stock', 'Selling Price', 'Cost Price', 'Total Cost Valuation'],
      rows,
      summaryMetrics: [
        { label: 'Active SKUs', value: products.length },
        { label: 'Stock Units', value: totalStock },
        { label: 'Cost Basis Valuation', value: `${totalCostVal.toLocaleString()} ${currency}` },
        { label: 'Retail Valuation', value: `${totalRetailVal.toLocaleString()} ${currency}` },
      ],
      orientation: 'landscape' as const,
    };

    return {
      success: true,
      reportType: 'inventory_catalog',
      reportName,
      filename: exportPdfOptions.filename,
      exportPdfOptions,
      data: { totalSkus: products.length, totalStock, totalCostVal, totalRetailVal },
      message: `Generated ${reportName}. PDF downloading now.`,
    };
  }

  // 5. GPT-5 vs GPT-4 Cost & Performance Comparison Report
  if (report_type === 'gpt_cost_comparison' || report_type === 'ai_model_pricing') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const reportName = 'GPT-5 vs GPT-4 Cost & Performance Comparison';
    return {
      success: true,
      reportType: 'gpt_cost_comparison',
      reportName,
      filename: `GPT5_vs_GPT4_Cost_Estimate_${todayStr}.pdf`,
      data: {
        timestamp: new Date().toISOString(),
        modelsCompared: ['gpt-5.6-luna', 'gpt-4o-mini', 'gpt-5.6-terra', 'o3-mini', 'gpt-5.6-sol', 'gpt-4o', 'gpt-5'],
        recommendedModel: 'gpt-5.6-luna',
        monthlyEstimate: '$0.22 - $0.35 / month',
      },
      message: `Generated ${reportName} PDF report. Browser download initiated.`,
    };
  }

  return {
    success: false,
    error: `Unknown report_type: ${report_type}`,
  };
}

export const openAiAssistantTools: ChatCompletionTool[] = [
  queryPosReportsTool, 
  addInventoryItemTool, 
  updateProductPriceTool, 
  queryInventoryProductsTool,
  postProductAdToFacebookTool,
  generatePdfReportTool
];
export const aiAssistantDeclarations = openAiAssistantTools;
export const AI_SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION;

/**
 * Detects if a model ID represents an OpenAI reasoning model (e.g. gpt-5.6-luna, gpt-5.6-terra, gpt-5.6, o1, o3-mini, etc.).
 */
export function isReasoningModel(modelName?: string): boolean {
  const m = (modelName || '').toLowerCase().trim();
  return (
    m.includes('gpt-5') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4')
  );
}

/**
 * Executes an OpenAI chat completion with tools safely across all models.
 * For reasoning models (gpt-5.6-luna, gpt-5.6-terra, gpt-5.6-sol, gpt-5.6, o3-mini, etc.) in /v1/chat/completions,
 * OpenAI requires `reasoning_effort: 'none'` when function tools are declared.
 * Conversely, standard non-reasoning models (gpt-4o, gpt-4o-mini) reject `reasoning_effort` with a 400 error.
 * This helper dynamically sets `reasoning_effort: 'none'` when needed and provides automated recovery.
 */
export async function executeOpenAiChatCompletionWithTools(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const modelName = params.model || '';
  const hasTools = Boolean(params.tools && params.tools.length > 0);
  const reasoning = isReasoningModel(modelName);

  const callParams: any = { ...params };

  // For reasoning models with tools in /v1/chat/completions, OpenAI requires reasoning_effort: 'none'
  if (hasTools && reasoning) {
    callParams.reasoning_effort = 'none';
  } else if (!reasoning && 'reasoning_effort' in callParams) {
    delete callParams.reasoning_effort;
  }

  try {
    return await openai.chat.completions.create(callParams);
  } catch (err: any) {
    const errMsg = String(err?.message || '');

    // Error recovery 1: "Function tools with reasoning_effort are not supported for ... set reasoning_effort to 'none'"
    if (
      errMsg.includes('reasoning_effort') &&
      (errMsg.includes("set reasoning_effort to 'none'") || errMsg.includes('not supported'))
    ) {
      console.warn(`[AI Tool Engine] Applying reasoning_effort='none' auto-recovery for model: ${modelName}`);
      return await openai.chat.completions.create({
        ...callParams,
        reasoning_effort: 'none',
      });
    }

    // Error recovery 2: "Unrecognized request argument supplied: reasoning_effort"
    if (errMsg.includes('Unrecognized request argument') && errMsg.includes('reasoning_effort')) {
      console.warn(`[AI Tool Engine] Removing reasoning_effort auto-recovery for model: ${modelName}`);
      const fallbackParams = { ...callParams };
      delete fallbackParams.reasoning_effort;
      return await openai.chat.completions.create(fallbackParams);
    }

    // Error recovery 3: Temperature restrictions on reasoning models
    if (errMsg.includes('temperature') && errMsg.includes('not supported')) {
      console.warn(`[AI Tool Engine] Removing temperature auto-recovery for model: ${modelName}`);
      const fallbackParams = { ...callParams };
      delete fallbackParams.temperature;
      return await openai.chat.completions.create(fallbackParams);
    }

    throw err;
  }
}


