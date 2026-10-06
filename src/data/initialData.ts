import { 
  Product, 
  Sale, 
  PurchaseRecord, 
  ExpenseRecord, 
  ExpenseCategoryItem,
  Customer, 
  Supplier, 
  CashDrawerRecord, 
  ShopSettings, 
  StaffUser,
  StockAdjustment,
  StockAuditSession,
  PriceChangeRecord,
  PreOrder,
  Announcement,
  ChatChannel,
  ChatMessage,
  CreditSaleRecord,
  CreditRepaymentRecord,
  DamageLog,
  AuditLogEntry
} from '../types';

export const initialExpenseCategories: ExpenseCategoryItem[] = [
  { id: 'damaged_stock', name: 'Damaged Stock / Write-Off Loss', icon: 'Trash2', badgeColor: 'rose', description: 'Financial losses from scrapped or written-off damaged inventory', isDefault: true, isPermanent: true },
  { id: 'shop_rent', name: 'Shop Rent', icon: 'Store', badgeColor: 'rose', description: 'Monthly premises lease & shop space rent', isDefault: true },
  { id: 'utilities_electricity', name: 'Electricity / Utilities', icon: 'Zap', badgeColor: 'amber', description: 'Electricity bills, generator diesel & water utilities', isDefault: true },
  { id: 'staff_salary', name: 'Staff Salary & Commission', icon: 'Users', badgeColor: 'blue', description: 'Monthly payroll, performance bonuses & sales commissions', isDefault: true },
  { id: 'wifi_internet', name: 'WiFi & Telecom Topup', icon: 'Wifi', badgeColor: 'cyan', description: 'Store fiber broadband & staff mobile phone topups', isDefault: true },
  { id: 'marketing_ads', name: 'Facebook Ads & Marketing', icon: 'Megaphone', badgeColor: 'purple', description: 'Social media ads, banners & promotional campaigns', isDefault: true },
  { id: 'store_maintenance', name: 'Store Maintenance & Repairs', icon: 'Wrench', badgeColor: 'orange', description: 'Shop renovation, AC servicing & cabinet lighting', isDefault: true },
  { id: 'food_refreshment', name: 'Staff Meals & Snacks', icon: 'Coffee', badgeColor: 'emerald', description: 'Daily lunch allowances, tea breaks & refreshments', isDefault: true },
  { id: 'supplies_packaging', name: 'Packaging Bags & Rolls', icon: 'Package', badgeColor: 'indigo', description: 'Shopping bags, bubble wrap & thermal receipt rolls', isDefault: true },
  { id: 'transport_delivery', name: 'Transport & Stock Delivery', icon: 'Truck', badgeColor: 'teal', description: 'Highway bus gate fees, cargo shipping & messenger (System Protected)', isDefault: true, isPermanent: true, isSystem: true },
  { id: 'taxes_fees', name: 'Taxes, Licenses & Fees', icon: 'FileText', badgeColor: 'slate', description: 'Municipal business license & municipal taxes', isDefault: true },
  { id: 'other_general', name: 'General Miscellaneous', icon: 'Tag', badgeColor: 'slate', description: 'Daily petty cash & miscellaneous operational expenses', isDefault: true },
];

export const initialStaffUsers: StaffUser[] = [];

export const initialSettings: ShopSettings = {
  shopName: 'Win Mobile & Gadgets',
  tagline: 'Smartphones, Original Accessories & Wholesale Gadgets',
  logoUrl: '',
  invoiceLogoUrl: '',
  faviconUrl: '',
  address: 'No. (124), Anawrahta Road, Kyauktada Township',
  cityCountry: 'Yangon, Myanmar',
  phone: '09-798123456',
  whatsappNumber: '+959798123456',
  viberNumber: '09-798123456',
  telegramContact: '@winmobile',
  email: 'sales@winmobile.com',
  taxRegistrationNumber: 'MM-YGN-884920',
  currencySymbol: 'Ks',
  currencyCode: 'MMK',
  taxRatePercent: 0,
  invoicePrefix: 'INV-',
  purchasePrefix: 'PO-',
  expensePrefix: 'EXP-',
  warrantyPolicy: '• 1 Year Official Brand Warranty for Brand New phones\n• 7 Days Checking Warranty for Used / Secondhand phones\n• 6 Months Warranty for Original Chargers & Power Banks\n• No warranty for physical drop damage or water ingress.',
  receiptFooterMessage: 'ဝယ်ယူအားပေးမှုအတွက် အထူးကျေးဇူးတင်ရှိပါသည်။ (Thank You for Shopping with Us!)',
  loyaltyPointsPerDollar: 0.001, // 1 pt per 1,000 Ks
  currentStaffName: '',
  currentStaffRole: 'Cashier',
  currentStaffId: '',
  enableSoundEffects: true,
  systemLanguage: 'my',
  invoiceCustomization: {
    headerTitle: 'WIN MOBILE',
    subHeader: 'Smartphones & Genuine Gadgets Retail',
    addressLine1: 'No. (124), Anawrahta Road, Kyauktada Township',
    addressLine2: 'Near Sule Pagoda',
    city: 'Yangon, Myanmar',
    phone1: '09-798123456',
    phone2: '09-974567890',
    viberNumber: '09-798123456',
    telegramUsername: '@winmobile',
    facebookPage: 'facebook.com/winmobile.ygn',
    showQrCode: true,
    qrType: 'kpay',
    qrAccountName: 'Shop Account (Win Mobile)',
    qrAccountNumber: '09-798123456',
    qrCustomText: 'Scan to Pay via KPay / Wave',
    showImeiDetails: true,
    showWarrantyDetails: true,
    showCashierName: true,
    showCustomerInfo: true,
    showPointsEarned: true,
    showBarcode: true,
    paperWidth: '80mm',
    fontSize: 'standard',
    footerThankYouMessage: 'ဝယ်ယူအားပေးမှုကို ကျေးဇူးတင်ပါသည်။ ပစ္စည်းလဲလှယ်လိုပါက ဘောက်ချာယူဆောင်လာပါရန်။',
    warrantyPolicyText: 'အာမခံရယူရန် ဤဘောက်ချာပြသပေးပါရန်။ (Show this receipt for warranty claim)',
  },
  expenseCategories: initialExpenseCategories,
  secrets: {
    openAiApiKey: '',
    geminiApiKey: '',
    fbPageId: '100196205116864',
    fbPageAccessToken: '',
    telegramBotToken: '',
    telegramChatId: '',
    telegramBotModel: 'gpt-5.6-luna',
    chatAssistantModel: 'gpt-5.6-luna',
    customWebhookUrl: '',
    customWebhookSecret: '',
    customSecrets: [],
  },
};

export const initialProducts: Product[] = [];
export const initialCustomers: Customer[] = [];
export const initialSuppliers: Supplier[] = [];
export const initialPurchases: PurchaseRecord[] = [];
export const initialSales: Sale[] = [];
export const initialExpenses: ExpenseRecord[] = [];
export const initialStockAdjustments: StockAdjustment[] = [];
export const initialPriceChanges: PriceChangeRecord[] = [];
export const initialStockAudits: StockAuditSession[] = [];

export const initialCashDrawer: CashDrawerRecord = {
  id: 'shift-101',
  date: new Date().toISOString().split('T')[0],
  openedAt: new Date().toISOString(),
  openedBy: 'Store Staff',
  status: 'open',
  openingFloat: 0,
  openingBalance: 0,
  cashSales: 0,
  cashInManual: [],
  cashOutManual: [],
  totalCashIn: 0,
  totalCashOut: 0,
  expectedInDrawer: 0,
  transactions: []
};

export const initialPreOrders: PreOrder[] = [];
export const initialAnnouncements: Announcement[] = [];

export const initialChatChannels: ChatChannel[] = [
  {
    id: 'general',
    name: 'general',
    description: 'Main store channel for daily updates & staff coordination',
    iconName: 'MessageSquare',
    type: 'public',
    isDefault: true,
    createdAt: new Date().toISOString(),
  }
];

export const initialChatMessages: ChatMessage[] = [];
export const initialCreditSales: CreditSaleRecord[] = [];
export const initialDamageLogs: DamageLog[] = [];
export const initialAuditLogs: AuditLogEntry[] = [];
