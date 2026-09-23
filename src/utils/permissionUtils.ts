import { StaffRole, RolePermissions, StaffUser, AppTab } from '../types';

export interface PermissionDefinition {
  key: keyof RolePermissions;
  label: string;
  category: 'pos' | 'inventory' | 'purchases' | 'financials' | 'payroll' | 'crm' | 'system';
  categoryLabel: string;
  desc: string;
  riskLevel: 'critical' | 'moderate' | 'standard';
}

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, RolePermissions> = {
  Owner: {
    canAccessPos: true,
    canGiveDiscount: true,
    canEditPrice: true,
    canManageInventory: true,
    canAdjustQuantity: true,
    canManagePurchases: true,
    canApprovePurchases: true,
    canReceivePurchases: true,
    canRecordExpenses: true,
    canViewReports: true,
    canViewCostAndProfit: true,
    canManageStaff: true,
    canRefundSale: true,
    canDeleteRecords: true,
    canCustomizeInvoice: true,
    canAccessCrm: true,
    canManageCashDrawer: true,
    canManagePreOrders: true,
    canManageCreditSales: true,
    canCollectCreditRepayment: true,
    canApproveCreditSale: true,
    canManageAnnouncements: true,
    canAccessTeamChat: true,
    canAccessAiCopilot: true,
    canViewAuditLogs: true,
    canExportAuditLogs: true,
    canManagePayroll: true,
    canManageKpiSettings: true,
    canViewPayroll: true,
  },
  Manager: {
    canAccessPos: true,
    canGiveDiscount: true,
    canEditPrice: true,
    canManageInventory: true,
    canAdjustQuantity: true,
    canManagePurchases: true,
    canApprovePurchases: true,
    canReceivePurchases: true,
    canRecordExpenses: true,
    canViewReports: true,
    canViewCostAndProfit: true,
    canManageStaff: false,
    canRefundSale: true,
    canDeleteRecords: false,
    canCustomizeInvoice: true,
    canAccessCrm: true,
    canManageCashDrawer: true,
    canManagePreOrders: true,
    canManageCreditSales: true,
    canCollectCreditRepayment: true,
    canApproveCreditSale: true,
    canManageAnnouncements: true,
    canAccessTeamChat: true,
    canAccessAiCopilot: true,
    canViewAuditLogs: true,
    canExportAuditLogs: true,
    canManagePayroll: true,
    canManageKpiSettings: true,
    canViewPayroll: true,
  },
  Cashier: {
    canAccessPos: true,
    canGiveDiscount: true,
    canEditPrice: false,
    canManageInventory: false,
    canAdjustQuantity: false,
    canManagePurchases: false,
    canApprovePurchases: false,
    canReceivePurchases: false,
    canRecordExpenses: true,
    canViewReports: false,
    canViewCostAndProfit: false,
    canManageStaff: false,
    canRefundSale: false,
    canDeleteRecords: false,
    canCustomizeInvoice: false,
    canAccessCrm: false,
    canManageCashDrawer: true,
    canManagePreOrders: true,
    canManageCreditSales: true,
    canCollectCreditRepayment: true,
    canApproveCreditSale: false,
    canManageAnnouncements: false,
    canAccessTeamChat: true,
    canAccessAiCopilot: false,
    canViewAuditLogs: false,
    canExportAuditLogs: false,
    canManagePayroll: false,
    canManageKpiSettings: false,
    canViewPayroll: false,
  },
  Inventory_Staff: {
    canAccessPos: false,
    canGiveDiscount: false,
    canEditPrice: false,
    canManageInventory: true,
    canAdjustQuantity: true,
    canManagePurchases: true,
    canApprovePurchases: false,
    canReceivePurchases: true,
    canRecordExpenses: false,
    canViewReports: false,
    canViewCostAndProfit: true,
    canManageStaff: false,
    canRefundSale: false,
    canDeleteRecords: false,
    canCustomizeInvoice: false,
    canAccessCrm: true,
    canManageCashDrawer: false,
    canManagePreOrders: true,
    canManageCreditSales: false,
    canCollectCreditRepayment: false,
    canApproveCreditSale: false,
    canManageAnnouncements: false,
    canAccessTeamChat: true,
    canAccessAiCopilot: false,
    canViewAuditLogs: false,
    canExportAuditLogs: false,
    canManagePayroll: false,
    canManageKpiSettings: false,
    canViewPayroll: false,
  },
};

export const PERMISSION_CATEGORIES: { id: PermissionDefinition['category']; label: string; iconName: string }[] = [
  { id: 'pos', label: 'POS & Sales Register', iconName: 'ShoppingCart' },
  { id: 'inventory', label: 'Inventory & Catalog', iconName: 'Package' },
  { id: 'purchases', label: 'Purchases & Suppliers', iconName: 'Truck' },
  { id: 'financials', label: 'Financials & Reports', iconName: 'DollarSign' },
  { id: 'payroll', label: 'Staff Payroll & KPI', iconName: 'Award' },
  { id: 'crm', label: 'CRM & Customer Database', iconName: 'Users' },
  { id: 'system', label: 'Security & Configuration', iconName: 'ShieldCheck' },
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // POS & Sales
  {
    key: 'canAccessPos',
    label: 'POS Register Terminal',
    category: 'pos',
    categoryLabel: 'POS & Sales Register',
    desc: 'Access the POS checkout terminal, ring up items, scan barcodes, and complete sales transactions.',
    riskLevel: 'standard',
  },
  {
    key: 'canGiveDiscount',
    label: 'Apply Discounts',
    category: 'pos',
    categoryLabel: 'POS & Sales Register',
    desc: 'Apply percent or cash discounts to individual items or entire customer invoices during checkout.',
    riskLevel: 'moderate',
  },
  {
    key: 'canEditPrice',
    label: 'Override Selling Price',
    category: 'pos',
    categoryLabel: 'POS & Sales Register',
    desc: 'Manually edit or override unit selling prices on the POS cart prior to checkout.',
    riskLevel: 'critical',
  },
  {
    key: 'canRefundSale',
    label: 'Process Sale Refunds',
    category: 'pos',
    categoryLabel: 'POS & Sales Register',
    desc: 'Void or refund completed sale transactions and return items/IMEIs back to store inventory.',
    riskLevel: 'critical',
  },
  {
    key: 'canManageCashDrawer',
    label: 'Cash Drawer Operations',
    category: 'pos',
    categoryLabel: 'POS & Sales Register',
    desc: 'Perform manual Cash In / Cash Out drawer adjustments and end-of-shift reconciliations.',
    riskLevel: 'moderate',
  },

  // Inventory & Stock
  {
    key: 'canManageInventory',
    label: 'Create & Edit Products',
    category: 'inventory',
    categoryLabel: 'Inventory & Catalog',
    desc: 'Add new products, upload photos, edit descriptions, adjust selling prices, and manage variants.',
    riskLevel: 'moderate',
  },
  {
    key: 'canAdjustQuantity',
    label: 'Manual Stock Adjustments',
    category: 'inventory',
    categoryLabel: 'Inventory & Catalog',
    desc: 'Perform direct inventory count additions, reductions, physical stock audits, and loss write-offs.',
    riskLevel: 'critical',
  },
  {
    key: 'canViewCostAndProfit',
    label: 'View Cost & Profit Margins',
    category: 'inventory',
    categoryLabel: 'Inventory & Catalog',
    desc: 'Display wholesale cost prices, markup margins, total inventory valuation, and profit numbers.',
    riskLevel: 'critical',
  },

  // Purchases & Supplier Procurement Workflow
  {
    key: 'canManagePurchases',
    label: 'Stage 1: Create & Draft POs',
    category: 'purchases',
    categoryLabel: 'Purchases & Suppliers',
    desc: 'Draft purchase orders, enter item specifications, attach supplier vouchers, and submit POs for approval.',
    riskLevel: 'moderate',
  },
  {
    key: 'canApprovePurchases',
    label: 'Stage 2: Approve PO & Disburse Payment',
    category: 'purchases',
    categoryLabel: 'Purchases & Suppliers',
    desc: 'Review supplier vouchers, authorize purchase orders, disburse cash/bank payment, and upload payment proof slips.',
    riskLevel: 'critical',
  },
  {
    key: 'canReceivePurchases',
    label: 'Stage 3: Receive Goods & Restock Inventory',
    category: 'purchases',
    categoryLabel: 'Purchases & Suppliers',
    desc: 'Inspect delivered merchandise, scan IMEI/serial numbers, log delivery cargo fees, and update physical store inventory.',
    riskLevel: 'moderate',
  },

  // Financials & Accounting
  {
    key: 'canRecordExpenses',
    label: 'Record Expenses',
    category: 'financials',
    categoryLabel: 'Financials & Reports',
    desc: 'Log store operational expenses, utilities, marketing costs, and petty cash disbursements.',
    riskLevel: 'standard',
  },
  {
    key: 'canManageCreditSales',
    label: 'Credit Sales & Receivables',
    category: 'financials',
    categoryLabel: 'Financials & Reports',
    desc: 'Issue sales on credit, create installment schedules, manage credit customer accounts and contracts.',
    riskLevel: 'moderate',
  },
  {
    key: 'canCollectCreditRepayment',
    label: 'Collect Credit Debt Payments',
    category: 'financials',
    categoryLabel: 'Financials & Reports',
    desc: 'Collect debt repayments from credit customers, print receipt vouchers, and reconcile cash drawer balances.',
    riskLevel: 'standard',
  },
  {
    key: 'canApproveCreditSale',
    label: 'Approve High-Value Credit Limits',
    category: 'financials',
    categoryLabel: 'Financials & Reports',
    desc: 'Approve credit limit overrides, custom interest rates, extended installment terms, or bad debt write-offs.',
    riskLevel: 'critical',
  },
  {
    key: 'canViewReports',
    label: 'Business Reports & Analytics',
    category: 'financials',
    categoryLabel: 'Financials & Reports',
    desc: 'View sales trends, profit breakdown analytics, top-selling phone statistics, and export PDF/Excel reports.',
    riskLevel: 'critical',
  },

  // Staff Payroll & KPI
  {
    key: 'canManagePayroll',
    label: 'Process Staff Payroll & Disburse Pay',
    category: 'payroll',
    categoryLabel: 'Staff Payroll & KPI',
    desc: 'Draft monthly salary records, calculate attendance bonuses, apply fines or deductions, review feedback, and mark salaries as paid.',
    riskLevel: 'critical',
  },
  {
    key: 'canManageKpiSettings',
    label: 'Configure Monthly Category KPIs',
    category: 'payroll',
    categoryLabel: 'Staff Payroll & KPI',
    desc: 'Set monthly sales target incentives, category commission rates, and activate KPI bonus criteria across inventory tiers.',
    riskLevel: 'moderate',
  },
  {
    key: 'canViewPayroll',
    label: 'View Payroll & KPI Records',
    category: 'payroll',
    categoryLabel: 'Staff Payroll & KPI',
    desc: 'Inspect monthly staff salary history, attendance records, compensation breakdowns, and performance KPI achievements.',
    riskLevel: 'standard',
  },

  // CRM
  {
    key: 'canAccessCrm',
    label: 'Customer & Supplier CRM',
    category: 'crm',
    categoryLabel: 'CRM & Customer Database',
    desc: 'View and manage customer loyalty points, purchase histories, and supplier vendor contacts.',
    riskLevel: 'standard',
  },

  // System & Security
  {
    key: 'canManageStaff',
    label: 'Staff Roles & Security',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Create staff accounts, set security PINs, and customize role permission matrices.',
    riskLevel: 'critical',
  },
  {
    key: 'canDeleteRecords',
    label: 'Delete Permanent Records',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Delete products, archived invoices, purchase orders, customer records, or audit histories.',
    riskLevel: 'critical',
  },
  {
    key: 'canCustomizeInvoice',
    label: 'Invoice & Print Settings',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Modify store receipt headers, logo upload, thermal printer width, and warranty policy text.',
    riskLevel: 'moderate',
  },
  {
    key: 'canManageAnnouncements',
    label: 'Notice Board Announcements',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Post, pin, edit, and manage high-priority store announcements on the Notice Board.',
    riskLevel: 'moderate',
  },
  {
    key: 'canAccessTeamChat',
    label: 'Team Live Chat Access',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Participate in team chat channels, direct shift notes, and device stock queries.',
    riskLevel: 'standard',
  },
  {
    key: 'canAccessAiCopilot',
    label: 'AI Copilot Assistant Access',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Access the conversational AI Copilot (Aura) for voice commands, automated inventory operations, and intelligent reports.',
    riskLevel: 'moderate',
  },
  {
    key: 'canViewAuditLogs',
    label: 'User Activity & Audit Log History',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Inspect the live staff activity feed, chronological audit trails, authentication records, and system security actions.',
    riskLevel: 'critical',
  },
  {
    key: 'canExportAuditLogs',
    label: 'Export Audit Reports & CSV',
    category: 'system',
    categoryLabel: 'Security & Configuration',
    desc: 'Download CSV compliance spreadsheets and export formal PDF audit logs with signature blocks.',
    riskLevel: 'moderate',
  },
];

/**
 * Calculates effective permissions for a staff user by combining
 * the customized role permissions matrix with any user-specific overrides.
 */
export function getEffectiveUserPermissions(
  user: StaffUser | null | undefined,
  rolePermissionsMap: Record<StaffRole, RolePermissions> = DEFAULT_ROLE_PERMISSIONS
): RolePermissions {
  const role = user?.role || 'Cashier';
  const baseRolePermissions = rolePermissionsMap[role] || DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.Cashier;

  if (!user || !user.customPermissions) {
    return { ...baseRolePermissions };
  }

  // Merge custom user overrides
  const effective: RolePermissions = { ...baseRolePermissions };
  const custom = user.customPermissions;

  (Object.keys(custom) as (keyof RolePermissions)[]).forEach((key) => {
    if (custom[key] !== undefined) {
      effective[key] = Boolean(custom[key]);
    }
  });

  return effective;
}

/**
 * Checks if a user has a specific permission.
 */
export function checkUserPermission(
  user: StaffUser | null | undefined,
  permissionKey: keyof RolePermissions,
  rolePermissionsMap: Record<StaffRole, RolePermissions> = DEFAULT_ROLE_PERMISSIONS
): boolean {
  if (!user) return false;
  // Owner always retains access if no explicit custom override restricts it
  const effective = getEffectiveUserPermissions(user, rolePermissionsMap);
  return Boolean(effective[permissionKey]);
}

/**
 * Checks if a role has a specific permission based on the role permissions matrix.
 */
export function checkRolePermission(
  role: StaffRole,
  permissionKey: keyof RolePermissions,
  rolePermissionsMap: Record<StaffRole, RolePermissions> = DEFAULT_ROLE_PERMISSIONS
): boolean {
  const rolePerms = rolePermissionsMap[role] || DEFAULT_ROLE_PERMISSIONS[role];
  return Boolean(rolePerms?.[permissionKey]);
}

/**
 * Determines whether an application tab is accessible based on effective permissions.
 */
export function isTabAccessibleForUser(
  tab: AppTab,
  user: StaffUser | null | undefined,
  rolePermissionsMap: Record<StaffRole, RolePermissions> = DEFAULT_ROLE_PERMISSIONS
): boolean {
  if (!user) return false;
  const perms = getEffectiveUserPermissions(user, rolePermissionsMap);

  switch (tab) {
    case 'dashboard':
      return true; // Dashboard overview is accessible to all logged-in staff
    case 'pos':
      return Boolean(perms.canAccessPos);
    case 'daily_profit':
    case 'monthly_profit':
      return Boolean(perms.canViewCostAndProfit || perms.canViewReports || user.role === 'Owner' || user.role === 'Manager');
    case 'personal_finance':
      return Boolean(user.role === 'Owner' || user.role === 'Manager' || perms.canViewCostAndProfit || perms.canRecordExpenses || perms.canViewReports);
    case 'credit_sales':
      return Boolean(perms.canManageCreditSales || perms.canCollectCreditRepayment || perms.canAccessPos || perms.canViewReports);
    case 'sales_history':
      return Boolean(perms.canAccessPos || perms.canViewReports || perms.canRefundSale);
    case 'inventory':
      return Boolean(perms.canManageInventory || perms.canAdjustQuantity || perms.canViewCostAndProfit);
    case 'quarantine_rma':
      return Boolean(perms.canManageInventory || perms.canAdjustQuantity || user.role === 'Owner' || user.role === 'Manager');
    case 'stock_check':
      return Boolean(perms.canAdjustQuantity || perms.canManageInventory);
    case 'purchases':
      return Boolean(perms.canManagePurchases || perms.canApprovePurchases || perms.canReceivePurchases);
    case 'expenses':
      return Boolean(perms.canRecordExpenses || perms.canViewReports);
    case 'cash_drawer':
      return Boolean(perms.canManageCashDrawer || perms.canAccessPos);
    case 'reports':
      return Boolean(perms.canViewReports);
    case 'crm':
      return Boolean(perms.canAccessCrm);
    case 'pre_orders':
      return Boolean(perms.canAccessPos || perms.canAccessCrm || perms.canManageStaff);
    case 'team_chat':
      return Boolean(perms.canAccessTeamChat ?? true);
    case 'roles':
      return Boolean(perms.canManageStaff);
    case 'invoice_customizer':
      return Boolean(perms.canCustomizeInvoice);
    case 'settings':
      return Boolean(user.role === 'Owner' || perms.canManageStaff || perms.canCustomizeInvoice);
    case 'social_marketing':
      return Boolean(user.role === 'Owner' || user.role === 'Manager' || perms.canAccessAiCopilot || perms.canAccessPos);
    case 'audit_logs':
      return Boolean(user.role === 'Owner' || user.role === 'Manager' || perms.canViewAuditLogs);
    case 'staff_payroll':
      return Boolean(
        perms.canManagePayroll ||
        perms.canViewPayroll ||
        perms.canManageKpiSettings ||
        perms.canManageStaff ||
        user.role === 'Owner' ||
        user.role === 'Manager'
      );
    default:
      return true;
  }
}

/**
 * Returns user-facing metadata and required permissions for restricted tabs.
 */
export function getTabRequiredPermissionInfo(tab: AppTab): {
  permissionKey?: keyof RolePermissions;
  title: string;
  requiredPermissionLabel: string;
  description: string;
} {
  switch (tab) {
    case 'pos':
      return {
        permissionKey: 'canAccessPos',
        title: 'POS Register Terminal',
        requiredPermissionLabel: 'POS Register Access (canAccessPos)',
        description: 'Your staff account is restricted from opening the Point of Sale terminal and completing sales transactions.',
      };
    case 'daily_profit':
    case 'monthly_profit':
      return {
        permissionKey: 'canViewCostAndProfit',
        title: 'Daily & Monthly Financial Analysis',
        requiredPermissionLabel: 'Cost & Profit Visibility (canViewCostAndProfit / canViewReports)',
        description: 'Viewing store daily and monthly gross profit, capital matching, and operating margins requires cost and profit permissions.',
      };
    case 'personal_finance':
      return {
        permissionKey: 'canViewCostAndProfit',
        title: 'Personal Finance & Wealth Management',
        requiredPermissionLabel: 'Cost & Profit Visibility (canViewCostAndProfit / Owner / Manager)',
        description: 'Personal Finance contains personal income, expense records, wallets, and savings accounts reserved for owner and management.',
      };
    case 'credit_sales':
      return {
        permissionKey: 'canManageCreditSales',
        title: 'Credit Sales & Receivables Ledger',
        requiredPermissionLabel: 'Manage Credit Sales (canManageCreditSales / canCollectCreditRepayment)',
        description: 'Accessing customer credit accounts, installment schedules, and debt collection ledgers is restricted for your role.',
      };
    case 'sales_history':
      return {
        permissionKey: 'canAccessPos',
        title: 'Sales & Invoice History',
        requiredPermissionLabel: 'Sales Records Access (canAccessPos / canViewReports)',
        description: 'Viewing past transaction history and invoices requires POS or Report viewing permissions.',
      };
    case 'inventory':
      return {
        permissionKey: 'canManageInventory',
        title: 'Inventory & Stock Management',
        requiredPermissionLabel: 'Manage Inventory (canManageInventory)',
        description: 'Adding, editing, or managing products in the store inventory catalog is restricted for your role.',
      };
    case 'quarantine_rma':
      return {
        permissionKey: 'canManageInventory',
        title: 'Damage Quarantine & RMA Disposition Hub',
        requiredPermissionLabel: 'Manage Inventory (canManageInventory / canAdjustQuantity)',
        description: 'Reporting item damages, managing quarantine isolation, and executing RMA or scrap dispositions is restricted for your role.',
      };
    case 'stock_check':
      return {
        permissionKey: 'canAdjustQuantity',
        title: 'Physical Stock Audits & Discrepancies',
        requiredPermissionLabel: 'Manual Stock Adjustments (canAdjustQuantity)',
        description: 'Conducting physical audits, reconciling inventory counts, and writing off discrepancies is restricted.',
      };
    case 'purchases':
      return {
        permissionKey: 'canManagePurchases',
        title: 'Purchases & Supplier Stock-In',
        requiredPermissionLabel: 'Manage Purchases (canManagePurchases)',
        description: 'Creating purchase orders and receiving wholesale stock-in shipments is restricted for your role.',
      };
    case 'expenses':
      return {
        permissionKey: 'canRecordExpenses',
        title: 'Shop Expenses & Disbursements',
        requiredPermissionLabel: 'Record Expenses (canRecordExpenses)',
        description: 'Logging operational expenses, petty cash disbursements, and store bills is restricted for your role.',
      };
    case 'cash_drawer':
      return {
        permissionKey: 'canManageCashDrawer',
        title: 'Cash Drawer & Shift Settlement',
        requiredPermissionLabel: 'Cash Drawer Operations (canManageCashDrawer)',
        description: 'Manual cash in/out float adjustments and end-of-shift reconciliations are restricted for your role.',
      };
    case 'reports':
      return {
        permissionKey: 'canViewReports',
        title: 'Business Reports & Profit Analytics',
        requiredPermissionLabel: 'Business Reports & Analytics (canViewReports)',
        description: 'Accessing sales revenue charts, profit margin analytics, and exportable financial reports is restricted.',
      };
    case 'crm':
      return {
        permissionKey: 'canAccessCrm',
        title: 'Customer & Supplier Database',
        requiredPermissionLabel: 'Customer & Supplier CRM (canAccessCrm)',
        description: 'Accessing the customer contact directory, store credit ledgers, and vendor accounts is restricted.',
      };
    case 'roles':
      return {
        permissionKey: 'canManageStaff',
        title: 'Staff Roles & Security Permissions',
        requiredPermissionLabel: 'Staff Roles & Security (canManageStaff)',
        description: 'Configuring user roles, terminal security PINs, and access matrices is restricted to store owners/managers.',
      };
    case 'invoice_customizer':
      return {
        permissionKey: 'canCustomizeInvoice',
        title: 'Receipt & Invoice Customizer',
        requiredPermissionLabel: 'Invoice & Print Settings (canCustomizeInvoice)',
        description: 'Modifying store receipt headers, thermal printer width, and warranty policy text is restricted.',
      };
    case 'settings':
      return {
        permissionKey: 'canManageStaff',
        title: 'Shop Configuration & System Settings',
        requiredPermissionLabel: 'Store Administration',
        description: 'Modifying store profile, currency, tax rates, and database resets is restricted to store administrators.',
      };
    case 'audit_logs':
      return {
        permissionKey: 'canViewAuditLogs',
        title: 'User Activity & Audit Log History',
        requiredPermissionLabel: 'Audit Log & Security History (canViewAuditLogs)',
        description: 'Inspecting live staff activity, transaction history, and chronological audit trails is restricted to store owners and managers.',
      };
    case 'staff_payroll':
      return {
        permissionKey: 'canManagePayroll',
        title: 'Staff Payroll & KPI Management',
        requiredPermissionLabel: 'Staff Payroll & KPI (canManagePayroll / canViewPayroll)',
        description: 'Your staff account is restricted from viewing or processing staff compensation, monthly KPI bonuses, and payroll records.',
      };
    default:
      return {
        title: 'Restricted Session',
        requiredPermissionLabel: 'Security Authorization Required',
        description: 'You do not have sufficient permissions to access this screen under your current role.',
      };
  }
}

