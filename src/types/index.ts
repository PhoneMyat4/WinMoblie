export type ProductCategory = 
  | 'brand_new_phones' 
  | 'pre_owned_phones' 
  | 'accessories_gadgets' 
  | 'cookware' 
  | 'sim_cards'
  | 'new_phones' 
  | 'used_phones' 
  | 'accessories' 
  | 'gadgets' 
  | 'sim_topup' 
  | 'spare_parts';

export interface HierarchyModel {
  id: string;
  name: string;
  colors?: string[];
  defaultWarrantyMonths?: number;
  description?: string;
}

export interface HierarchyBrand {
  id: string;
  name: string;
  models: HierarchyModel[];
}

export interface HierarchySubCategory {
  id: string;
  name: string;
  brands: HierarchyBrand[];
}

export interface HierarchyCategory {
  id: ProductCategory;
  name: string;
  iconName: string;
  description: string;
  isPhone: boolean;
  subCategories: HierarchySubCategory[];
}

export type DeviceCondition = 'brand_new' | 'used_grade_a_plus' | 'used_grade_a' | 'used_grade_b' | 'used_grade_c';

export type PaymentMethod = 
  | 'cash' 
  | 'kpay' 
  | 'wave' 
  | 'yoma' 
  | 'kbz' 
  | 'aya' 
  | 'cb' 
  | 'split'
  | 'credit';

export type StaffRole = 'Owner' | 'Manager' | 'Cashier' | 'Inventory_Staff';
export type UserRole = StaffRole;

export interface RolePermissions {
  canAccessPos: boolean;
  canGiveDiscount: boolean;
  canEditPrice: boolean;
  canManageInventory: boolean;
  canAdjustQuantity: boolean;
  canManagePurchases: boolean;
  canApprovePurchases?: boolean;
  canReceivePurchases?: boolean;
  canRecordExpenses: boolean;
  canViewReports: boolean;
  canViewCostAndProfit: boolean;
  canManageStaff: boolean;
  canRefundSale: boolean;
  canDeleteRecords: boolean;
  canCustomizeInvoice: boolean;
  canAccessCrm?: boolean;
  canManageCashDrawer?: boolean;
  canManagePreOrders?: boolean;
  canManageCreditSales?: boolean;
  canCollectCreditRepayment?: boolean;
  canApproveCreditSale?: boolean;
  canManageAnnouncements?: boolean;
  canAccessTeamChat?: boolean;
  canAccessAiCopilot?: boolean;
  canViewAuditLogs?: boolean;
  canExportAuditLogs?: boolean;
}

export interface StaffUser {
  id: string;
  username: string; // Registered login username (e.g. "owner", "cashier1", "manager")
  name: string;
  role: StaffRole;
  phone: string;
  email?: string;
  pin: string; // Security PIN for terminal switch
  password?: string; // Password for account authentication
  active: boolean;
  avatarColor?: string;
  customPermissions?: Partial<RolePermissions>;
  restrictWorkingHours?: boolean;
  workStartTime?: string; // (e.g. '07:30')
  workEndTime?: string; // (e.g. '19:00')
}

export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  type: 'add' | 'reduce' | 'set_exact';
  quantityChange: number; // positive or negative
  previousStock: number;
  newStock: number;
  reason: 'physical_audit' | 'damaged' | 'return_supplier' | 'sample' | 'restock' | 'correction' | 'other';
  reasonNotes?: string;
  timestamp: string;
  adjustedBy: string;
  auditSessionId?: string;
  imeiList?: string[];
}

export interface StockAuditItem {
  productId: string;
  productName: string;
  brand: string;
  category: ProductCategory;
  subCategory?: string;
  sku: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  bookStock: number; // system stock count at start of audit
  countedStock: number; // physically counted stock
  variance: number; // countedStock - bookStock
  varianceCost: number; // variance * costPrice
  status: 'matched' | 'surplus' | 'shortage' | 'uncounted';
  color?: string;
  ram?: string;
  rom?: string;
  scannedImeis?: string[];
  systemImeis?: string[];
  missingImeis?: string[];
  extraImeis?: string[];
  notes?: string;
}

export interface StockAuditSession {
  id: string;
  auditNumber: string; // e.g. "AUD-2026-001"
  title: string;
  scope: 'all' | 'category' | 'brand' | 'low_stock' | 'custom';
  filterValue?: string;
  createdAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  items: StockAuditItem[];
  totalBookQuantity: number;
  totalCountedQuantity: number;
  totalVarianceQuantity: number;
  totalVarianceCost: number;
  matchedItemsCount: number;
  discrepantItemsCount: number;
  conductedBy: string;
  reconciled: boolean;
  reconciledAt?: string;
  reconciledBy?: string;
  notes?: string;
}

export type PriceChangeReason = 
  | 'market_adjustment'
  | 'promo_discount'
  | 'supplier_cost_change'
  | 'clearance'
  | 'currency_fluctuation'
  | 'manual_correction'
  | 'bulk_reprice'
  | 'other';

export interface PriceChangeRecord {
  id: string;
  productId: string;
  productName: string;
  timestamp: string;
  oldSellingPrice: number;
  newSellingPrice: number;
  oldCostPrice?: number;
  newCostPrice?: number;
  priceDelta?: number; // e.g. -100,000 or +50,000 Ks
  percentageChange?: number; // e.g. -2.3 or +5.0 (%)
  oldMarginPercent?: number;
  newMarginPercent?: number;
  reason: PriceChangeReason;
  reasonNotes?: string;
  changedBy: string;
  effectiveDate?: string;
}

export type ProductHistoryEventType = 
  | 'creation'
  | 'purchase_stock_in'
  | 'pos_sale'
  | 'sale_refund'
  | 'stock_adjustment'
  | 'physical_audit'
  | 'price_change'
  | 'imei_status_change'
  | 'spec_update';

export interface ProductHistoryEvent {
  id: string;
  productId: string;
  productName: string;
  timestamp: string;
  type: ProductHistoryEventType;
  title: string;
  details: string;
  quantityChange?: number; // e.g. +10, -1
  stockBefore?: number;
  stockAfter?: number;
  unitCost?: number;
  sellingPrice?: number;
  oldSellingPrice?: number;
  newSellingPrice?: number;
  oldCostPrice?: number;
  newCostPrice?: number;
  priceDelta?: number;
  priceChangePercent?: number;
  marginPercentBefore?: number;
  marginPercentAfter?: number;
  reasonLabel?: string;
  referenceDoc?: string; // e.g. "INV-2026-001", "PO-2026-003", "AUD-2026-001"
  performedBy: string;
  imeiAffected?: string[];
  extraMeta?: Record<string, unknown>;
}

export type ImeiStatus = 'In Stock' | 'Sold' | 'RMA' | 'Reserved' | 'Defective' | 'Quarantined' | 'Pending RMA' | 'Written-Off' | 'Available';

export interface ImeiHistoryEvent {
  id: string;
  timestamp: string;
  action: 'received' | 'price_updated' | 'status_changed' | 'sold' | 'refunded' | 'rma_initiated' | 'rma_resolved' | 'reserved' | 'stock_audit';
  details: string;
  performedBy: string;
  referenceDoc?: string; // e.g. PO-2026-001 or INV-2026-008
}

export interface SerializedDeviceItem {
  id: string;
  imei: string;
  imei2?: string;
  serialNumber?: string;
  productId: string;
  productName: string;
  brand: string;
  model: string;
  specs?: string; // e.g. "12/128GB"
  color?: string;
  condition: DeviceCondition;
  costPrice: number;
  sellingPrice: number;
  status: ImeiStatus;
  receivedDate: string; // ISO date string
  purchaseOrderNumber?: string;
  supplierId?: string;
  supplierName?: string;
  receivedBy?: string;
  soldDate?: string;
  soldInvoiceNumber?: string;
  soldCustomerId?: string;
  soldCustomerName?: string;
  soldCustomerPhone?: string;
  soldBy?: string;
  warrantyMonths?: number;
  warrantyExpiry?: string;
  rmaReason?: string;
  rmaDate?: string;
  rmaStatus?: 'pending' | 'sent_to_supplier' | 'repaired' | 'replaced' | 'refunded' | 'scrapped';
  notes?: string;
  history: ImeiHistoryEvent[];
}

export type ItemInventoryStatus = 'Available' | 'Quarantined' | 'Pending RMA' | 'Written-Off';

export type DamageReason = 
  | 'Out-of-box failure' 
  | 'Dropped in store' 
  | 'Water damage' 
  | 'Customer return';

export type DamagePhase = 'quarantine' | 'assessment' | 'disposed';

export type DamageDispositionAction = 'rma' | 'write_off' | 'b_stock';

export interface DamageLog {
  id: string;
  logNumber: string; // e.g. "DMG-2026-0001"
  productId: string;
  productName: string;
  brand: string;
  category: ProductCategory;
  subCategory?: string;
  sku: string;
  barcode: string;
  serialOrImei?: string; // Serial number or IMEI 1
  imei2?: string;
  costImpact: number; // Read-only original unit cost from database
  originalSellingPrice: number;
  quarantinedQuantity: number;
  
  // Phase 1: Quarantine (Isolation)
  status: ItemInventoryStatus; // 'Available' | 'Quarantined' | 'Pending RMA' | 'Written-Off'
  phase: DamagePhase; // 'quarantine' | 'assessment' | 'disposed'
  reportedAt: string;
  reportedBy: string;
  quarantineNotes?: string;

  // Phase 2: Assessment & Logging Form
  damageReason?: DamageReason;
  damageNotes?: string;
  assessmentNotes?: string;
  photoProof?: string; // Base64 data URL or photo proof attachment
  assessedAt?: string;
  assessedBy?: string;

  // Phase 3: Final Disposition Action
  dispositionAction?: DamageDispositionAction;
  dispositionDate?: string;
  dispositionBy?: string;
  
  // Return to Vendor (RMA) details:
  rmaVendorName?: string;
  rmaVendorContact?: string;
  rmaTrackingNumber?: string;
  rmaNotes?: string;

  // Write-Off (Scrap) details:
  scrapReason?: string;
  lossRecordedAmount?: number;
  expenseVoucherNumber?: string;
  expenseId?: string;

  // Move to B-Stock details:
  bStockDiscountedPrice?: number;
  bStockCondition?: string; // "Open-Box/Refurbished"
  bStockNotes?: string;

  // Customer Defective Return details:
  isCustomerReturn?: boolean;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  originalInvoiceNumber?: string;
  returnExchangeType?: 'replace_from_stock' | 'return_to_vendor';
  replacementSerialOrImei?: string;
}

export interface ImeiPair {
  imei1: string;
  imei2?: string;
  status?: ImeiStatus | ItemInventoryStatus;
  costPrice?: number;
  sellingPrice?: number;
  receivedDate?: string;
  allocatedPreOrderId?: string;
  allocatedPreOrderNumber?: string;
  allocatedCustomerName?: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: ProductCategory;
  subCategory?: string;
  condition: DeviceCondition;
  sku: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStockAlert: number;
  itemStatus?: ItemInventoryStatus; // 'Available' | 'Quarantined' | 'Pending RMA' | 'Written-Off'
  quarantinedStock?: number; // count of units currently isolated in quarantine
  quarantinedImeis?: string[]; // list of quarantined IMEIs/serials
  isBStock?: boolean; // flags item as Open-Box / Refurbished
  bStockDiscountedPrice?: number;
  ram?: string; // e.g. "-", "4GB", "6GB", "8GB", "12GB", "14GB", "16GB", "18GB", "24GB"
  rom?: string; // e.g. "32GB", "64GB", "128GB", "256GB", "512GB", "1TB", "2TB"
  storage?: string; // e.g. "128GB", "256GB"
  color?: string; // e.g. "Natural Titanium", "Deep Blue"
  batteryHealth?: number; // e.g. 98 (%)
  imeiList?: string[]; // individual IMEI list (or formatted IMEI1 / IMEI2 strings)
  imeiPairs?: ImeiPair[]; // structured dual IMEI pair per physical device unit
  serializedItems?: SerializedDeviceItem[]; // comprehensive individual serial/IMEI item tracking
  dualImei?: boolean;
  warrantyMonths: number;
  supplierId?: string;
  supplierName?: string;
  description?: string;
  imageUrl?: string;
  lastRestockedAt?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedImei?: string;
  selectedImei2?: string;
  customPrice?: number;
  discount: number;
  warrantyPeriod: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  brand: string;
  category: ProductCategory;
  subCategory?: string;
  color?: string;
  ram?: string;
  rom?: string;
  imei?: string;
  imei2?: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discount: number;
  finalPrice: number;
  warrantyPeriod: string;
  refundedQuantity?: number;
  refundedImeis?: string[];
}

export interface RefundItem {
  productId: string;
  name: string;
  brand?: string;
  quantity: number;
  unitPrice: number;
  discountPerUnit?: number;
  finalPrice: number;
  refundAmount: number;
  imei?: string;
  imei2?: string;
  restocked: boolean;
}

export interface RefundRecord {
  id: string;
  saleId: string;
  invoiceNumber: string;
  date: string; // ISO string
  items: RefundItem[];
  reason: string;
  refundMethod: string;
  restockItems: boolean;
  totalRefundAmount: number;
  refundedBy: string;
  notes?: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  date: string; // ISO string
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  taxRate: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  balanceDue: number;
  paymentDetails?: {
    cashAmount?: number;
    kpayAmount?: number;
    waveAmount?: number;
    yomaAmount?: number;
    kbzAmount?: number;
    ayaAmount?: number;
    cbAmount?: number;
    creditAmount?: number;
    transactionRef?: string;
    accountName?: string;
    creditSaleId?: string;
    downPayment?: number;
    downPaymentMethod?: PaymentMethod;
    downPaymentTxRef?: string;
    dueDate?: string;
    termDays?: number;
    installmentCount?: number;
    guarantorName?: string;
    guarantorPhone?: string;
    guarantorNrc?: string;
  };
  notes?: string;
  creditSaleId?: string;
  creditSaleNumber?: string;
  isCreditSale?: boolean;
  pointsEarned: number;
  pointsRedeemed: number;
  soldBy: string;
  soldById?: string;
  cashierId?: string;
  cashierName?: string;
  status: 'completed' | 'refunded' | 'partially_refunded';
  refundReason?: string;
  refundedAt?: string;
  refundedBy?: string;
  totalRefundedAmount?: number;
  refundHistory?: RefundRecord[];
  preOrderId?: string;
  preOrderNumber?: string;
  depositDeducted?: number;
}

export type PreOrderStatus = 'Pending' | 'Stock Arrived' | 'Completed' | 'Cancelled';

export interface PreOrder {
  id: string; // e.g. "pre-1725100000000"
  preOrderNumber: string; // e.g. "PRE-20260831-001"
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerId?: string;
  phoneModel: string;
  brand?: string;
  color: string;
  ram: string;
  rom: string;
  quantity?: number; // Number of units ordered (default 1)
  unitPrice?: number; // Unit price per device
  fullPrice: number; // Total agreed price (quantity * unitPrice)
  depositAmount: number;
  remainingBalance: number;
  depositPaymentMethod: PaymentMethod;
  depositPaymentDetails?: {
    transactionRef?: string;
    accountName?: string;
  };
  orderDate: string; // YYYY-MM-DD
  expectedArrivalDate?: string; // YYYY-MM-DD
  status: PreOrderStatus; // 'Pending' | 'Stock Arrived' | 'Completed' | 'Cancelled'
  
  // Late-Linking Physical Inventory Data (Stage 2: Receive & Link)
  productId?: string;
  productName?: string;
  allocatedImei?: string; // Physical unit primary IMEI 1
  allocatedImei2?: string; // Physical unit secondary IMEI 2
  allocatedImeis?: string[]; // Multiple physical IMEIs if quantity > 1
  allocatedImeiPairs?: { imei1: string; imei2?: string }[];
  allocatedBarcode?: string;
  allocatedSku?: string;
  allocatedCostPrice?: number;
  allocatedPurchaseOrderId?: string;
  allocatedPurchaseOrderNumber?: string;
  allocatedAt?: string; // ISO timestamp
  allocatedBy?: string;

  // Fulfillment Data (Stage 3: POS Register)
  fulfilledDate?: string;
  fulfilledSaleId?: string;
  fulfilledInvoiceNumber?: string;
  fulfilledBy?: string;
  notes?: string;
  createdBy: string;
  createdAt: string; // ISO string
}

export interface PurchaseItem {
  productId: string;
  name: string;
  brand: string;
  model?: string;
  category: ProductCategory;
  subCategory?: string;
  condition?: DeviceCondition;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  totalCost: number;
  minStockAlert?: number;
  barcode?: string;
  sku?: string;
  warrantyMonths?: number;
  description?: string;
  ram?: string;
  rom?: string;
  storage?: string;
  color?: string;
  batteryHealth?: number;
  imeiList?: string[];
  imeiPairs?: ImeiPair[];
  dualImei?: boolean;
  landedUnitCost?: number; // Unit cost after apportioning delivery charges and landed overheads
  allocatedPreOrderId?: string; // Late-linking pre-order ID if allocated at item level
  allocatedPreOrderNumber?: string;
  allocatedCustomerName?: string;
}

export type PurchaseOrderStatus = 'draft' | 'pending_approval' | 'confirmed' | 'received' | 'cancelled';

export interface PurchaseRecord {
  id: string;
  purchaseOrderNumber: string; // e.g. PO-2026-001
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  date: string;
  items: PurchaseItem[];
  subtotal: number;
  shippingFee: number;
  deliveryCharges?: number; // Specific delivery / transport fees added during Receive stage
  otherCosts: number;
  grandTotal: number;
  totalLandedCost?: number; // subtotal + otherCosts + (deliveryCharges || shippingFee)
  paymentMethod: PaymentMethod;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  isFullyPaid?: boolean;
  amountPaid: number;
  balanceDue: number;
  referenceInvoiceNo?: string;
  notes?: string;
  receivedBy: string;

  // Enterprise ERP 3-Stage Workflow tracking
  status: PurchaseOrderStatus;
  
  // Stage 1: Draft Creation & Submission
  createdBy?: string;
  createdById?: string;
  createdByRole?: StaffRole;
  createdAt?: string;
  submittedForApprovalAt?: string;
  submittedBy?: string;
  supplierVoucherPhoto?: string; // Attached photo of voucher/bill from supplier (Stage 1)
  supplierVoucherFileName?: string;
  
  // Stage 2: Confirmation (Manager/Owner Approval & Payment)
  confirmedBy?: string;
  confirmedById?: string;
  confirmedByRole?: StaffRole;
  confirmedAt?: string;
  approvalNotes?: string;
  paymentProofUrl?: string; // Attached screenshot / slip of payment proof
  paymentProofFileName?: string;
  
  // Stage 3: Product Receiving & Landed Cost
  receivedAt?: string;
  receivedById?: string;
  receivingNotes?: string;
  inventoryUpdated?: boolean; // Whether stock was already incremented into warehouse
}

export type ExpenseCategory = string;

export interface ExpenseCategoryItem {
  id: string;
  name: string;
  icon?: string;
  badgeColor?: string; // 'rose' | 'amber' | 'blue' | 'cyan' | 'purple' | 'orange' | 'emerald' | 'indigo' | 'teal' | 'slate' | 'pink'
  description?: string;
  isDefault?: boolean;
  isPermanent?: boolean; // System protected category (non-customizable & non-deletable)
  isSystem?: boolean;
}

export interface ExpenseRecord {
  id: string;
  voucherNumber: string; // e.g. EXP-2026-001
  date: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string;
  paidTo?: string;
  recordedBy: string;
  deductFromCashDrawer: boolean;
  notes?: string;
  purchaseId?: string; // Linked purchase invoice ID if auto-generated
  purchaseOrderNumber?: string;
  isAutoGenerated?: boolean;
  sourceType?: 'purchase_delivery' | 'manual';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  nrcNumber?: string; // National Registration Card (NRC) for Myanmar
  creditLimit?: number; // Maximum allowed credit headroom (e.g. 5,000,000 MMK)
  outstandingCreditBalance?: number; // Current active unpaid credit
  creditStatus?: 'allowed' | 'warning' | 'blocked'; // Credit approval status
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorNrc?: string;
  totalSpent: number;
  totalVisits: number;
  loyaltyPoints: number;
  activeRepairsCount?: number;
  createdAt: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  company?: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  categoriesSupplied?: string[];
  totalPurchases?: number;
  balancePayable?: number;
  balanceDue?: number;
}

export interface CashDrawerRecord {
  id: string;
  date: string; // YYYY-MM-DD
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  closedBy?: string;
  status: 'open' | 'closed';
  
  openingFloat: number;
  openingBalance?: number;
  cashSales: number;
  cashInManual: { reason: string; amount: number; time: string }[];
  cashOutManual: { reason: string; amount: number; time: string }[];
  
  totalCashIn?: number;
  totalCashOut?: number;
  transactions?: { id: string; timestamp: string; type: string; description: string; amount: number }[];

  expectedInDrawer: number;
  actualCounted?: number;
  variance?: number; // positive = overage, negative = shortage
  closingNotes?: string;
}

export interface InvoiceCustomization {
  headerTitle: string; // e.g. "MYANMAR MOBILE ZONE"
  subHeader: string; // e.g. "Retail & Wholesales Smartphone Center"
  shopLogoUrl?: string;
  showShopLogo?: boolean;
  shopLogoSize?: number; // Custom display size in px for logo (e.g. 40, range 20 - 120)
  invoiceLogoSize?: number; // Custom height in px for invoice logo (e.g. 44, range 20 - 120)
  logoTransparentBg?: boolean; // Whether logo keeps transparent background (true = no forced white background box)
  addressLine1: string;
  addressLine2?: string;
  city: string;
  phone1: string;
  phone2?: string;
  viberNumber?: string;
  telegramUsername?: string;
  facebookPage?: string;
  
  // QR Code payment support
  showQrCode: boolean;
  qrType: 'kpay' | 'wave' | 'kbz' | 'aya' | 'cb' | 'yoma' | 'custom' | 'upload';
  qrAccountName?: string;
  qrAccountNumber?: string;
  qrCustomText?: string;
  qrImageUrl?: string; // Uploaded Banking Payment QR Photo (Base64 data URI or image URL)

  // Invoice display toggles
  showImeiDetails: boolean;
  showWarrantyDetails: boolean;
  showCashierName: boolean;
  showCustomerInfo: boolean;
  showPointsEarned: boolean;
  showBarcode: boolean;
  showSignatures?: boolean;
  
  // Paper formatting
  paperWidth: '80mm' | '58mm' | 'a5';
  fontSize: 'compact' | 'standard' | 'large';

  // Custom text
  footerThankYouMessage: string;
  warrantyPolicyText: string;
}

export interface DenominationCount {
  denomination: number; // e.g. 50000, 20000, 10000, 5000, 1000, 500, 200, 100, 50
  count: number;
  total: number;
}

export interface ShiftReconciliationRecord {
  id: string;
  reconciliationNumber: string; // e.g. REC-20260823-01
  shiftDate: string; // YYYY-MM-DD
  openedAt: string;
  closedAt: string;
  cashierId: string;
  cashierName: string;
  managerName?: string;
  
  // Starting Cash
  openingFloat: number;

  // Expected from System Invoices
  cashSalesTotal: number;
  cashSalesCount: number;
  manualCashInTotal: number;
  manualCashOutTotal: number;
  expensesCashTotal: number;
  refundsCashTotal: number;
  expectedCashTotal: number;

  // Digital Payment Totals
  digitalSales: {
    kpay: number;
    wave: number;
    kbz: number;
    yoma: number;
    aya: number;
    cb: number;
    split: number;
    totalDigital: number;
  };

  // Grand Sales Revenue of Shift
  totalGrossRevenue: number;
  totalInvoicesCount: number;

  // Actual Physical Count
  actualCashCounted: number;
  denominations?: DenominationCount[];
  
  // Discrepancy / Variance
  variance: number; // actualCashCounted - expectedCashTotal (negative = shortage, positive = overage)
  varianceStatus: 'balanced' | 'overage' | 'shortage';
  
  notes?: string;
  status: 'draft' | 'verified_by_manager' | 'settled';
}

export interface FacebookPageConfig {
  pageId?: string;
  pageAccessToken?: string;
  pageName?: string;
  autoPostEnabled?: boolean;
  autoPublishEnabled?: boolean;
  defaultTone?: 'exciting_retail' | 'professional_tech' | 'urgent_discount' | 'bilingual_burmese_english' | 'promotional' | 'technical' | 'urgent' | 'bilingual';
  imageMode?: 'dalle_ai' | 'smart_flyer' | 'sample_photo';
  defaultImageGenerator?: string;
}

export interface FacebookAdPostRecord {
  id: string;
  productId: string;
  productName: string;
  brand?: string;
  model?: string;
  postId?: string;
  photoId?: string;
  postUrl?: string;
  caption: string;
  imageUrl: string;
  sampleImageUrl?: string;
  pageId?: string;
  pageName?: string;
  status: 'published_live' | 'preview_ready' | 'failed';
  sellingPrice?: number;
  specsSummary?: string;
  publishedAt: string;
  errorMessage?: string;
  isMockOrTest?: boolean;
}

export interface SocialMarketingMediaItem {
  id: string;
  url: string;
  source: 'local' | 'ai_generated' | 'catalog';
  title?: string;
  isSelected: boolean;
  fileSize?: number;
  addedAt: string;
}

export interface SocialMarketingState {
  // 1. Product Lookup
  skuOrBarcode: string;
  selectedProductId: string | null;
  productLookupStatus: 'idle' | 'searching' | 'found' | 'not_found';
  
  // 2. Media Management
  mediaGallery: SocialMarketingMediaItem[];
  aiImagePrompt: string;
  selectedImageModel?: string;
  isGeneratingAiImage: boolean;
  referenceImageUrl?: string | null;
  referenceImageName?: string | null;
  isAnalyzingReference?: boolean;
  
  // 3. AI Copywriting & Training
  trainingText: string;
  trainingFileName: string;
  promptInstruction: string;
  aiTone: 'exciting_retail' | 'professional_tech' | 'urgent_discount' | 'bilingual_burmese_english';
  selectedModel?: string;
  isGeneratingCopy: boolean;
  
  // 4. Draft & Preview Console
  draftCaption: string;
  lastEditedAt?: string;
  
  // 5. Publishing
  isPublishing: boolean;
  publishStatus: 'idle' | 'publishing' | 'published' | 'error';
  publishedPostRecord: FacebookAdPostRecord | null;
  publishError: string | null;
}

export type SecretCategory = 'ai' | 'social' | 'payment' | 'messaging' | 'cloud' | 'other';

export interface CustomSecretItem {
  id: string;
  name: string; // e.g. "WavePay Merchant Key"
  key: string;  // e.g. "WAVEPAY_MERCHANT_KEY"
  value: string; // secret token/key
  category: SecretCategory;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ShopSecretsConfig {
  openAiApiKey?: string;
  geminiApiKey?: string;
  fbPageId?: string;
  fbPageAccessToken?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  customWebhookUrl?: string;
  customWebhookSecret?: string;
  customSecrets?: CustomSecretItem[];
}

export interface ShopSettings {
  shopName: string;
  tagline: string;
  logoUrl?: string; // Uploaded custom store & POS app logo (Base64 data URI or image URL)
  invoiceLogoUrl?: string; // Dedicated Invoice & Receipt logo for printed bills and receipts
  faviconUrl?: string; // Custom browser tab favicon image (ICO, PNG, SVG, or WebP)
  shopLogoSize?: number; // Custom display size in px for app/navigation logo (default 40, range 24 - 80)
  invoiceLogoSize?: number; // Custom height in px for printed invoice logo (default 44, range 24 - 120)
  logoTransparentBg?: boolean; // Keep transparent PNG background (no forced white background box, default true)
  address: string;
  cityCountry: string;
  phone: string;
  whatsappNumber: string;
  viberNumber?: string;
  telegramContact?: string;
  email: string;
  taxRegistrationNumber: string;
  currencySymbol: string; // e.g. "Ks" or "MMK"
  currencyCode: string; // e.g. "MMK"
  taxRatePercent: number;
  invoicePrefix: string;
  purchasePrefix: string;
  expensePrefix: string;
  repairPrefix?: string;
  warrantyPolicy: string;
  termsAndConditions?: string;
  receiptFooterMessage: string;
  loyaltyPointsPerDollar: number;
  currentStaffName: string;
  currentStaffRole: StaffRole;
  currentStaffId: string;
  enableSoundEffects: boolean;
  invoiceCustomization: InvoiceCustomization;
  expenseCategories?: ExpenseCategoryItem[];
  socialMediaConfig?: FacebookPageConfig;
  secrets?: ShopSecretsConfig;
  isFreshDatabase?: boolean; // When true, database is fresh clean across all synced devices, forbidding demo data fallbacks
}

export type AppTab = 
  | 'dashboard'
  | 'pos' 
  | 'daily_profit'
  | 'credit_sales'
  | 'personal_finance'
  | 'pre_orders'
  | 'team_chat'
  | 'reports'
  | 'inventory'
  | 'quarantine_rma'
  | 'stock_check'
  | 'purchases'
  | 'expenses'
  | 'sales_history'
  | 'crm' 
  | 'roles'
  | 'invoice_customizer'
  | 'cash_drawer' 
  | 'settings'
  | 'social_marketing'
  | 'staff_payroll'
  | 'audit_logs';

// ==========================================
// Team Chat & Notice Board Announcement Models
// ==========================================

export type AnnouncementCategory = 
  | 'urgent_alert' 
  | 'promotional_campaign' 
  | 'policy_update' 
  | 'shift_handover' 
  | 'stock_alert' 
  | 'operational_notice'
  | 'general';

export type AnnouncementPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface AnnouncementAcknowledgment {
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  acknowledgedAt: string; // ISO date string
}

export interface AnnouncementReaction {
  emoji: string;
  staffIds: string[];
}

export interface AnnouncementAttachment {
  type: 'product' | 'preorder' | 'link' | 'note';
  refId?: string;
  title: string;
  subtitle?: string;
  badge?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  isPinned: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
  authorId: string;
  authorName: string;
  authorRole: StaffRole;
  targetRoles?: StaffRole[]; // Empty or omitted = all roles
  createdAt: string; // ISO date string
  updatedAt?: string;
  expiresAt?: string;
  acknowledgedBy: AnnouncementAcknowledgment[];
  reactions?: AnnouncementReaction[];
  tags?: string[];
  attachments?: AnnouncementAttachment[];
}

export type ChatChannelType = 'public' | 'role_restricted' | 'direct_message';

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  iconName: string;
  type: ChatChannelType;
  allowedRoles?: StaffRole[];
  memberIds?: string[]; // IDs of participants for private 1-on-1 DMs
  recipientUser?: {
    id: string;
    name: string;
    role: StaffRole;
    email?: string;
    avatarColor?: string;
  };
  unreadCount?: number;
  lastMessage?: {
    content: string;
    senderName: string;
    timestamp: string;
  };
  isDefault?: boolean;
  createdAt: string;
}

export interface ChatProductTag {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
}

export interface ChatPreOrderTag {
  preOrderId: string;
  preOrderNumber: string;
  customerName: string;
  phoneModel: string;
  status: string;
  depositAmount: number;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: StaffRole;
  senderAvatarColor?: string;
  recipientId?: string;
  recipientName?: string;
  isPrivate?: boolean;
  content: string;
  timestamp: string; // ISO date string
  isUrgent?: boolean;
  isSystem?: boolean;
  productTag?: ChatProductTag;
  preOrderTag?: ChatPreOrderTag;
  reactions?: { [emoji: string]: string[] }; // emoji -> array of staffIds
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  status?: 'sent' | 'delivered' | 'synced';
}

export interface FirebaseSyncConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
  isEnabled: boolean;
  autoSyncIntervalSeconds: number;
  lastSyncedAt?: string;
}

// ==========================================
// Credit Sales & Accounts Receivable Models
// ==========================================

export type CreditSaleStatus = 
  | 'active' 
  | 'partially_paid' 
  | 'paid' 
  | 'overdue' 
  | 'bad_debt' 
  | 'cancelled';

export interface CreditRepaymentRecord {
  id: string;
  creditSaleId: string;
  creditSaleNumber: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  date: string; // ISO date string
  amount: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string;
  accountName?: string;
  collectedBy: string;
  collectedById?: string;
  receiptVoucherNumber: string; // e.g. "CR-REC-2026-001"
  notes?: string;
  installmentIndex?: number;
  recordedInCashDrawer: boolean;
  previousBalance: number;
  newBalance: number;
}

export interface CreditInstallmentPlan {
  installmentNumber: number; // 1, 2, 3, etc.
  dueDate: string; // YYYY-MM-DD
  amountDue: number;
  amountPaid: number;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue';
  paidDate?: string;
  paidAmount?: number;
}

export interface CreditSaleRecord {
  id: string; // Unique ID (e.g. "credit-1725100000000")
  creditNumber: string; // e.g. "CR-2026-001"
  saleId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerNrc?: string;
  
  // Financials
  totalSaleAmount: number; // Grand total of sale
  downPayment: number; // Initial amount paid upfront
  downPaymentMethod?: PaymentMethod;
  downPaymentDetails?: {
    transactionRef?: string;
    accountName?: string;
  };
  principalCreditAmount: number; // totalSaleAmount - downPayment
  interestRatePercent: number; // e.g. 0% or 3%
  interestAmount: number;
  totalPayable: number; // principalCreditAmount + interestAmount
  totalPaid: number; // downPayment + sum of repayments
  remainingBalance: number; // totalPayable - sum of repayments
  
  // Dates & Terms
  startDate: string; // ISO date string
  dueDate: string; // YYYY-MM-DD
  termDays: number; // e.g. 7, 15, 30, 60, 90, 180
  installmentCount: number; // 1 for single lump sum, or N for multiple
  installmentFrequency: 'lump_sum' | 'weekly' | 'biweekly' | 'monthly';
  installments: CreditInstallmentPlan[];
  
  // Status & Tracking
  status: CreditSaleStatus;
  repayments: CreditRepaymentRecord[];
  
  // Guarantor & Collateral
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorNrc?: string;
  guarantorAddress?: string;
  guarantorRelationship?: string;
  collateralDescription?: string;
  
  // Items & Device Serial numbers snapshot
  itemsSummary: string;
  items: SaleItem[];
  imeis: string[];
  
  // Staff metadata & contract notes
  createdBy: string;
  createdById?: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  promissoryAgreementTerms?: string;
  lastReminderSentAt?: string;
  lastReminderMethod?: 'whatsapp' | 'viber' | 'sms' | 'phone';
  settledAt?: string;
}

export interface SystemHealthReport {
  storageSizeKb: number;
  storageLimitKb: number;
  usagePercentage: number;
  collections: {
    productsCount: number;
    phoneVariantsCount: number;
    totalStockUnits: number;
    serializedImeisCount: number;
    purchasesCount: number;
    salesCount: number;
    creditSalesCount: number;
    expensesCount: number;
    customersCount: number;
    suppliersCount: number;
    priceChangeLogsCount: number;
    stockAdjustmentLogsCount: number;
    chatMessagesCount: number;
  };
  integrity: {
    duplicateVariantsFound: number;
    duplicateImeisFound: number;
    excessLogsCount: number;
    orphanedDraftsCount: number;
  };
  status: 'optimal' | 'attention_needed';
}

export interface CleanupResult {
  variantsMerged: number;
  imeisDeduplicated: number;
  logsPruned: number;
  draftIdsCleaned: number;
  freedBytes: number;
  newStorageSizeKb: number;
}

// ==========================================
// Personal Finance Module Models
// ==========================================

export type PersonalWalletType = 
  | 'cash' 
  | 'mobile_wallet' 
  | 'bank_account' 
  | 'savings' 
  | 'investment' 
  | 'other';

export interface PersonalWallet {
  id: string;
  name: string;
  type: PersonalWalletType;
  balance: number;
  currency: string;
  accountNumber?: string;
  color?: string; // hex or tailwind badge color
  isDefault?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PersonalTransactionType = 
  | 'expense' 
  | 'income' 
  | 'transfer' 
  | 'drawing_from_business' 
  | 'injection_to_business';

export interface PersonalTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  type: PersonalTransactionType;
  amount: number;
  walletId: string; // Source wallet or affected wallet
  toWalletId?: string; // Target wallet for inter-wallet transfers
  category: string;
  title: string;
  notes?: string;
  recipientOrPayer?: string;
  tags?: string[];
  receiptPhotoUrl?: string;
  // Business link flags
  syncWithBusiness?: boolean;
  linkedShopExpenseId?: string;
  linkedCashDrawerRecord?: boolean;
  createdAt: string;
}

export interface PersonalBudget {
  id: string;
  category: string;
  monthlyLimit: number;
  period: string; // e.g., '2026-09' or 'monthly_default'
  color?: string;
  notes?: string;
}

export interface PersonalSavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  category?: string;
  color?: string;
  isCompleted: boolean;
  notes?: string;
  createdAt: string;
  contributions?: {
    id: string;
    date: string;
    amount: number;
    walletId?: string;
    notes?: string;
  }[];
}

export interface PersonalDebtPayment {
  id: string;
  date: string;
  amount: number;
  walletId?: string;
  notes?: string;
}

export interface PersonalDebtIOU {
  id: string;
  type: 'lent' | 'borrowed'; // lent: Someone owes me | borrowed: I owe someone
  personName: string;
  contactPhone?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate?: string;
  status: 'active' | 'settled' | 'overdue';
  category?: string;
  notes?: string;
  createdAt: string;
  payments: PersonalDebtPayment[];
}

// ==========================================
// User Activity & Audit Log History Models
// ==========================================

export type AuditActionType =
  // Auth & Access Control
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'TERMINAL_LOCK'
  | 'TERMINAL_UNLOCK'
  | 'OPERATOR_SWITCH'
  | 'STAFF_CREATED'
  | 'STAFF_UPDATED'
  | 'STAFF_DELETED'
  | 'ROLE_PERMISSIONS_UPDATED'
  | 'ROLE_PERMISSIONS_RESET'
  // POS Register & Transactions
  | 'SALE_CREATED'
  | 'SALE_REFUNDED'
  | 'CREDIT_SALE_CREATED'
  | 'CREDIT_SALE_UPDATED'
  | 'CREDIT_STATUS_CHANGED'
  | 'CREDIT_REPAYMENT_COLLECTED'
  | 'DISCOUNT_APPLIED'
  | 'PRE_ORDER_CREATED'
  | 'PRE_ORDER_COMPLETED'
  | 'PRE_ORDER_CANCELLED'
  // Inventory & Stock
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'STOCK_ADJUSTED'
  | 'PRICE_CHANGED'
  | 'BULK_IMPORT'
  | 'STOCK_AUDIT_RECONCILED'
  | 'DAMAGE_QUARANTINED'
  | 'DAMAGE_RESOLVED'
  // Purchases
  | 'PURCHASE_CREATED'
  | 'PURCHASE_RECEIVED'
  | 'PURCHASE_DELETED'
  // Cash Drawer & Operational Expenses
  | 'CASH_DRAWER_IN'
  | 'CASH_DRAWER_OUT'
  | 'CASH_SHIFT_CLOSED'
  | 'EXPENSE_RECORDED'
  | 'EXPENSE_DELETED'
  // System & Settings
  | 'SETTINGS_UPDATED'
  | 'DATA_RESET'
  | 'BACKUP_EXPORTED'
  | 'BACKUP_RESTORED'
  | 'ANNOUNCEMENT_POSTED';

export type AuditCategory = 
  | 'auth'
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'cash_drawer'
  | 'expenses'
  | 'staff_roles'
  | 'settings'
  | 'system';

export type AuditSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface AuditLogDetails {
  targetId?: string;
  targetName?: string;
  targetType?: string;
  amount?: number;
  currency?: string;
  previousValue?: string | number | boolean | Record<string, unknown>;
  newValue?: string | number | boolean | Record<string, unknown>;
  quantityChange?: number;
  reason?: string;
  customerName?: string;
  supplierName?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  variance?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601 string
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  actionType: AuditActionType;
  category: AuditCategory;
  severity: AuditSeverity;
  summary: string;
  details?: AuditLogDetails;
  clientDevice?: string; // Terminal identifier or browser environment
  ipAddress?: string;
  expireAt?: string; // ISO 8601 string for Firestore Time-to-Live (TTL) auto-purging (180 days)
}



