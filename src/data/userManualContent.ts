export interface ManualSection {
  id: string;
  number: string;
  title: string;
  badge: string;
  summary: string;
  subsections: {
    subtitle: string;
    description: string;
    bulletPoints?: string[];
    tableData?: {
      headers: string[];
      rows: string[][];
    };
    callout?: {
      type: 'tip' | 'warning' | 'info';
      text: string;
    };
  }[];
}

export const USER_MANUAL_METADATA = {
  title: 'Official Operating Manual & Staff Training Guide',
  subtitle: 'Mobile Shop POS, Inventory, & Multi-Channel Accounting Suite',
  version: 'v4.5 Enterprise Edition',
  lastUpdated: 'September 2026',
  targetAudience: 'Business Owners, Store Managers, Retail Cashiers, Inventory Staff',
  documentControlId: 'SOP-POS-2026-REV4',
};

export const USER_MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'system-overview',
    number: '1.0',
    title: 'System Overview & Core Architecture',
    badge: 'ARCHITECTURE',
    summary: 'High-availability retail POS & inventory management engineered for mobile phone dealerships, multi-channel accessories shops, and repair centers.',
    subsections: [
      {
        subtitle: '1.1 System Capabilities & Architecture',
        description: 'The platform is an enterprise-grade Single Page Application (SPA) designed with an offline-first architecture combined with Google Cloud Firestore real-time synchronization. It guarantees non-stop retail counter operations even during internet dropouts.',
        bulletPoints: [
          'Offline-First Redundancy: Local cache storage handles all sales, stock adjustments, and cash drawer movements without network latency.',
          'Bi-Directional Cloud Sync: Automatically syncs to Google Firestore with conflict resolution when online.',
          'Dual-SIM & Serialized IMEI Tracking: Hardware-level device identification across sales, stock, and warranties.',
          'Multi-Account Financial Ledger: Separates store cash, digital wallets (KBZPay, WavePay, CB Pay), and personal finance.',
          'Security Vault: Stores encrypted API keys for Gemini AI, Facebook Graph API, and Cloudinary.',
        ],
      },
      {
        subtitle: '1.2 Top Navigation & Browser History Navigation',
        description: 'The application supports browser history controls and in-app navigation:',
        bulletPoints: [
          'Browser Back (<-) & Forward (->) buttons seamlessly navigate between tabs without reloading the app state.',
          'In-app navigation bar contains active tab highlights, quick search (Ctrl+K), and responsive mobile drawer.',
          'Dynamic URL parameter synchronization (?tab=pos, ?tab=inventory, etc.) allows bookmarking specific operational views.',
        ],
      },
    ],
  },
  {
    id: 'role-based-access',
    number: '2.0',
    title: 'Role-Based Access Control (RBAC) & PIN Security Guide',
    badge: 'SECURITY & ROLES',
    summary: 'Defines four specialized operational roles to protect sensitive margins, financial records, and critical stock configurations.',
    subsections: [
      {
        subtitle: '2.1 Four Operational Roles Overview',
        description: 'Every user in the system is assigned one of four distinct roles, with optional fine-grained permission overrides per staff profile:',
        bulletPoints: [
          'Owner: Unrestricted global access to all financial reports, margins, staff PINs, secrets vault, and data purging tools.',
          'Manager: Operational supervisor who oversees daily inventory, approves credit sales, handles staff payroll, processes customer refunds, and manages daily P&L.',
          'Cashier: Front-counter sales specialist focused on cart checkout, processing payments, opening/closing cash drawer shifts, and booking pre-orders.',
          'Inventory Staff: Warehouse and stock specialist responsible for stock intake, barcode printing, serial number audits, and RMA quarantine workflows.',
        ],
      },
      {
        subtitle: '2.2 Permission Matrix by Staff Role',
        description: 'The operational scope of each role is strictly enforced by the permission engine:',
        tableData: {
          headers: ['Functional Scope / Permission', 'Owner', 'Manager', 'Cashier', 'Inventory Staff'],
          rows: [
            ['POS Counter Checkout (canAccessPos)', 'Full Access', 'Full Access', 'Full Access', 'Restricted'],
            ['Give Line Item / Cart Discount', 'Allowed', 'Allowed', 'Allowed', 'Restricted'],
            ['Edit Unit Selling Price in Cart', 'Allowed', 'Allowed', 'Restricted', 'Restricted'],
            ['Process Customer Return & Refund', 'Allowed', 'Allowed', 'Restricted (Needs Mgr)', 'Restricted'],
            ['Manage & Adjust Inventory Quantities', 'Allowed', 'Allowed', 'Restricted', 'Full Access'],
            ['Purchase Orders & Supplier Receiving', 'Full Access', 'Full Access', 'Restricted', 'Receive Only'],
            ['View Daily & Annual Profit / COGS', 'Full Access', 'Full Access', 'Hidden', 'Cost Only'],
            ['Executive Business Reports', 'Full Access', 'Full Access', 'Restricted', 'Restricted'],
            ['Cash Drawer Shift Open & Close', 'Allowed', 'Allowed', 'Full Access', 'Restricted'],
            ['Approve Credit Sales & Terms', 'Allowed', 'Allowed', 'Restricted', 'Restricted'],
            ['Collect Credit Repayments', 'Allowed', 'Allowed', 'Allowed', 'Restricted'],
            ['3-Phase RMA & Damage Quarantine', 'Full Access', 'Full Access', 'Intake Only', 'Full Access'],
            ['Staff Management & PIN Configuration', 'Full Access', 'Restricted', 'Restricted', 'Restricted'],
            ['Secrets Vault & API Configuration', 'Full Access', 'Restricted', 'Restricted', 'Restricted'],
            ['Data Wipe & Database Archiving', 'Full Access', 'Restricted', 'Restricted', 'Restricted'],
          ],
        },
      },
      {
        subtitle: '2.3 Quick-Switch Security PIN System',
        description: 'To ensure rapid terminal handovers between retail shifts, staff members switch accounts using a 4-to-6 digit security PIN without logging out entirely.',
        bulletPoints: [
          'Click the Staff Profile pill in the top navigation bar to open the Quick-Switch PIN pad.',
          'Entering the PIN immediately loads the permissions, custom avatar, and sales attribution for that staff member.',
          'Cashiers attempting unauthorized actions (e.g., Price Edit or Item Refund) trigger a Manager/Owner PIN override modal on-screen.',
        ],
        callout: {
          type: 'warning',
          text: 'Never share Owner or Manager PINs with front-counter cashiers. Store managers should personally authorize refunds on the physical terminal.',
        },
      },
    ],
  },
  {
    id: 'core-pos-workflows',
    number: '3.0',
    title: 'Core Point of Sale (POS) Workflows',
    badge: 'SALES & COUNTER',
    summary: 'Standard operating procedures for counter sales, IMEI assignments, item returns, credit sales, and advance customer pre-orders.',
    subsections: [
      {
        subtitle: '3.1 Standard Retail Sale (Cash, Mobile Wallet, Card, Split)',
        description: 'Step-by-step workflow for ringing up products and generating receipts:',
        bulletPoints: [
          'Step 1 - Add Items to Cart: Scan barcode via USB/Bluetooth scanner, click product cards, or search by name/SKU in the product search bar (Ctrl+K).',
          'Step 2 - Quantity & Variant Selection: Adjust quantity for general accessories. For serialized phones, select the exact available IMEI from the dropdown list.',
          'Step 3 - Attach Customer Record: Select an existing customer from CRM or click "+ New Customer" to capture Name, Phone, and Address.',
          'Step 4 - Apply Discounts & Tax: Enter line-item percentage or total invoice discount (validated against cashier discount limits).',
          'Step 5 - Select Payment Method: Choose Cash, KBZPay, WavePay, CB Pay, AYA Pay, Credit Card, or Split Tender.',
          'Step 6 - Complete Sale: Enter customer tender amount to calculate change, click "Complete Sale", and print 80mm thermal receipt or A4 invoice.',
        ],
      },
      {
        subtitle: '3.2 Serialized Mobile Phone Sale & Dual-IMEI Tracking',
        description: 'Handling high-value smartphones requiring manufacturer warranty and IMEI tracking:',
        bulletPoints: [
          'When a smartphone is added to the cart, the system enforces selecting an available serial number.',
          'Both Primary IMEI (IMEI 1) and Secondary IMEI (IMEI 2) are printed on the invoice for regulatory and warranty verification.',
          'The selected IMEI status is immediately updated to "sold", attaching the invoice number, date, and customer ID to the device history.',
          'A Warranty Certificate is automatically formatted with device condition (Brand New / Used Grade A) and warranty period.',
        ],
        callout: {
          type: 'tip',
          text: 'Always verify the printed IMEI on the phone box matches the physical device screen (*#06#) before finalizing the sale.',
        },
      },
      {
        subtitle: '3.3 Processing Item-Level Partial & Full Refunds with Restocking',
        description: 'Handling customer returns with granular control over inventory restocking:',
        bulletPoints: [
          'Step 1 - Locate Original Sale: Open Sales History tab and search by Invoice Number or scan the receipt barcode.',
          'Step 2 - Select Items to Return: Click "Process Refund" and select the specific line items and quantities being returned.',
          'Step 3 - Determine Restock Destination:',
          '  * Return to Active Stock: For unopened, tested, or flawless items, the system automatically returns the quantity and IMEI to "in_stock".',
          '  * Route to Damage Quarantine (RMA): For defective or faulty devices, the item is routed directly to the 3-Phase Quarantine section.',
          'Step 4 - Refund Tender: Issue refund via Cash, digital refund, or store credit balance.',
          'Step 5 - Generate Credit Note / Refund Receipt: Print the formal refund voucher for store records and customer signature.',
        ],
      },
      {
        subtitle: '3.4 Credit Sales (Pay Later) & Installment Repayment Schedule',
        description: 'Managing deferred customer payments with contractual tracking and interest/fee schedules:',
        bulletPoints: [
          'Step 1 - Initiate Credit Checkout: Select "Credit / Pay Later" as the payment method on the POS checkout screen.',
          'Step 2 - Credit Customer Verification: Customer must be selected from CRM with an approved credit limit.',
          'Step 3 - Terms & Down Payment: Specify the Down Payment received today, total installments, due date, and payment frequency (Weekly/Monthly).',
          'Step 4 - Manager Approval: If the amount exceeds standard limits, a Manager/Owner PIN override is required.',
          'Step 5 - Collecting Repayments: Open Credit & Installments tab, find customer account, click "Collect Payment", specify amount and payment wallet, and print repayment receipt.',
        ],
      },
      {
        subtitle: '3.5 Advance Customer Pre-Orders Management',
        description: 'Handling incoming flagship releases and custom gadget orders with advance deposits:',
        bulletPoints: [
          'Step 1 - Create Pre-Order: Navigate to Pre-Orders tab and click "+ New Pre-Order".',
          'Step 2 - Customer & Model Details: Select customer, device model, color, storage configuration, and estimated arrival date.',
          'Step 3 - Collect Advance Deposit: Record deposit amount paid (Cash/KPay) to secure the unit reservation.',
          'Step 4 - Status Tracking: Update status from "Pending" to "Arrived / Ready for Pickup" when stock arrives.',
          'Step 5 - Convert to POS Sale: Click "Convert to Sale" to automatically populate the POS cart with the pre-order details, deduct the advance deposit, and collect remaining balance.',
        ],
      },
    ],
  },
  {
    id: 'inventory-logistics',
    number: '4.0',
    title: 'Inventory & Serialized Logistics',
    badge: 'LOGISTICS & RMA',
    summary: 'Complete guide to product master cataloging, dual-IMEI tracking, bulk CSV imports, physical stock reconciliation, and 3-phase RMA quarantine.',
    subsections: [
      {
        subtitle: '4.1 Stock Intake & Product Master Setup',
        description: 'Standard protocol for adding products and managing cost/selling margins:',
        bulletPoints: [
          'Product Category Taxonomy: Assign to Brand New Phones, Used Phones, Accessories, Spare Parts, Cookware, or SIM Topup.',
          'Cost Price (COGS) vs Retail Price: Enforce minimum markup policies to safeguard gross margins.',
          'Low Stock Warning Threshold: Set custom alerts (e.g., minimum 3 units) to trigger automatic reorder notifications.',
          'Barcode Generation: Automatically generate unique Code-128 or EAN barcodes for fast scanning at the counter.',
        ],
      },
      {
        subtitle: '4.2 Serialized IMEI Lifecycle & Status Progression',
        description: 'High-value serialized items follow an audited state transition throughout their lifecycle in the shop:',
        tableData: {
          headers: ['IMEI Status', 'Inventory Availability', 'Description & System Behavior'],
          rows: [
            ['in_stock', 'Available for Sale', 'Device is physically in shop showcase; selectable in POS cart.'],
            ['sold', 'Unavailable (Sold)', 'Linked to customer invoice; warranty countdown is active.'],
            ['returned', 'Under Evaluation', 'Item returned by customer; awaiting inspection or restocking.'],
            ['quarantine_intake', 'Quarantine Isolated', 'Defective unit removed from active inventory; Phase 1 active.'],
            ['quarantine_vendor', 'At Service Center', 'Dispatched to supplier or official warranty center; Phase 2 active.'],
            ['quarantine_resolved', 'Resolved / Restocked', 'Repaired, replaced by vendor, or written off; Phase 3 complete.'],
          ],
        },
      },
      {
        subtitle: '4.3 Bulk CSV Imports & Exports',
        description: 'Efficiently import thousands of SKUs and serial numbers from supplier spreadsheets:',
        bulletPoints: [
          'Download the official CSV template from Inventory -> Import / Export.',
          'Required columns: name, category, costPrice, sellingPrice, stock, minStockAlert, barcode, imeis (comma-separated).',
          'Data validation pre-checks each row for duplicate barcodes, existing IMEIs, and invalid numeric values.',
          'Export full inventory to CSV anytime for insurance audits, accounting backups, or tax reporting.',
        ],
      },
      {
        subtitle: '4.4 Physical Stock Audits & Cycle Counting',
        description: 'Performing structured physical audits without interrupting store sales:',
        bulletPoints: [
          'Step 1 - Initiate Audit Session: Open Inventory -> Stock Audit, select target category or all products, and start counting.',
          'Step 2 - Scan or Enter Physical Counts: Use barcode scanner to tally physical items on the shelf.',
          'Step 3 - Discrepancy Reconciliation: The system compares physical count against system expected count, highlighting Overages (positive variance) and Shortages (shrinkage).',
          'Step 4 - Commit Audit Adjustments: Provide reason notes (e.g., "Monthly Cycle Count Audit") and commit. The system creates permanent audit adjustment records and adjusts live stock balances.',
        ],
      },
      {
        subtitle: '4.5 The 3-Phase Damage Quarantine & Vendor RMA Process',
        description: 'Standardized workflow for managing customer defects, broken screens, and warranty claims:',
        bulletPoints: [
          'Phase 1 - Intake & Quarantine Isolation: Isolate defective phone or accessory. Document fault description (e.g., "Screen flickering, Motherboard reboot"). Item is locked from POS sales.',
          'Phase 2 - Vendor / Service Center RMA Dispatch: Record RMA Ticket ID, supplier name, courier dispatch date, and estimated return date.',
          'Phase 3 - Resolution & Disposition:',
          '  * Vendor Replacement: Intake brand-new replacement device with new serial number.',
          '  * Repaired & Restocked: Return repaired unit to active stock with verified QA checklist.',
          '  * Supplier Credit / Write-Off: Supplier issues credit note or cash refund; device is written off inventory with financial adjustment.',
        ],
      },
    ],
  },
  {
    id: 'financials-reporting',
    number: '5.0',
    title: 'Financials, Profit Calculations & Reporting',
    badge: 'FINANCIAL LEDGER',
    summary: 'Comprehensive breakdown of daily and annual profit calculations, expense tracking, cash drawer closures, and multi-wallet management.',
    subsections: [
      {
        subtitle: '5.1 Daily Profit Calculation Formula',
        description: 'How the real-time daily profit engine computes counter profitability:',
        bulletPoints: [
          'Gross Revenue = Total invoiced sales (Cash + Digital Payments + Down Payments received).',
          'Cost of Goods Sold (COGS) = Sum of exact purchase cost of all sold units (FIFO / Serial-tracked cost).',
          'Gross Profit = Gross Revenue - COGS - Invoice Discounts.',
          'Gross Margin % = (Gross Profit / Gross Revenue) * 100.',
          'Operating Expenses = Sum of shift operating costs recorded today (Staff Meals, Transport, Utilities, etc.).',
          'Net Daily Operating Profit = Gross Profit - Operating Expenses.',
        ],
        callout: {
          type: 'info',
          text: 'Serial-tracked COGS ensures exact cost accuracy even when the same phone model was purchased at different supplier prices.',
        },
      },
      {
        subtitle: '5.2 Annual Profit & Loss (P&L) Dossier',
        description: 'High-level executive financial statements for fiscal year analysis and tax compliance:',
        bulletPoints: [
          '12-Month Financial Ledger: Aggregates monthly revenue, COGS, gross margins, operating expenses, and net margins.',
          'Quarterly Performance Cards (Q1-Q4): Identifies seasonal sales peaks, holiday demand spikes, and slow quarters.',
          'Category Contribution Breakdown: Analyzes profit margins across Phones vs Accessories vs Spare Parts.',
          'Executive PDF Export: Generates audited landscape annual financial dossiers with dual sign-off blocks for auditors and business owners.',
        ],
      },
      {
        subtitle: '5.3 Cash Drawer Shift Management & Day Closure',
        description: 'Strict protocol for balancing cash registers and preventing cashier shrinkage:',
        bulletPoints: [
          'Step 1 - Shift Opening Float: Cashier counts and records opening drawer cash (e.g., 100,000 MMK change fund).',
          'Step 2 - Cash In / Cash Out Movements: Record non-sale cash movements (e.g., adding petty cash or paying delivery courier).',
          'Step 3 - Shift End Physical Count: Cashier physically counts bills and coins in the drawer and inputs the total into the Shift Closure screen.',
          'Step 4 - System Expected Balance Calculation:',
          '  Expected Cash = Opening Float + Cash Sales - Cash Refunds + Cash In - Cash Out.',
          'Step 5 - Variance Analysis (Over / Short): System calculates variance. Any discrepancy exceeding acceptable limits requires managerial explanation.',
          'Step 6 - Generate Shift Closure Report: Print shift summary with cash, KBZPay, WavePay, card totals, and staff signatures.',
        ],
      },
      {
        subtitle: '5.4 Multi-Account Wallets & Personal Finance',
        description: 'Separating business operating capital from owner personal funds:',
        bulletPoints: [
          'Store Operating Account: Receives counter cash, digital retail wallets, and customer credit repayments.',
          'Owner Personal Wallet: Managed in the Personal Finance tab for tracking owner equity, personal withdrawals, and capital contributions.',
          'Inter-Account Transfers: Log transfers between KBZPay merchant account and bank accounts with zero ledger leakage.',
        ],
      },
    ],
  },
  {
    id: 'system-tools-shortcuts',
    number: '6.0',
    title: 'System Utilities, Secrets Vault & Keyboard Shortcuts',
    badge: 'TOOLS & SHORTCUTS',
    summary: 'Advanced utilities, API secrets vault, automated Facebook marketing, cloud backup sync, and rapid keyboard shortcuts.',
    subsections: [
      {
        subtitle: '6.1 Secrets Vault & External API Integration',
        description: 'Secure credential storage for modern cloud integrations:',
        bulletPoints: [
          'Google Gemini API Key: Powers the AI Product Description Generator and AI Sales Advisor.',
          'Facebook Page Token & Page ID: Enables automated social media marketing post publishing directly from the shop catalog.',
          'Cloudinary & Firebase Storage: High-speed cloud image hosting for product photos and store logos.',
        ],
      },
      {
        subtitle: '6.2 Automated Social Media & AI Product Descriptions',
        description: 'Boost store sales with automated marketing tooling:',
        bulletPoints: [
          'AI Copywriter: Generate engaging promotional copy with technical specs for smartphones with 1-click.',
          'Facebook Page Publisher: Push new arrivals and promotional discounts to the official store Facebook page automatically.',
        ],
      },
      {
        subtitle: '6.3 Essential Keyboard Shortcuts Guide',
        description: 'Master these shortcuts for rapid counter checkout operations:',
        tableData: {
          headers: ['Shortcut Key', 'Action / Function', 'Operational Context'],
          rows: [
            ['Ctrl + K', 'Universal Search Bar', 'Quickly search products, customers, invoices, or tabs.'],
            ['F1', 'Navigate to POS Counter', 'Switches active view to checkout counter instantly.'],
            ['F2', 'Navigate to Inventory', 'Switches to stock list and serial number lookup.'],
            ['F3', 'Navigate to Sales History', 'Lookup past invoices, reprint receipts, or process returns.'],
            ['F4', 'Open Cash Drawer Modal', 'Quick view of current shift balance and cash in/out.'],
            ['Ctrl + Enter', 'Complete Sale & Tender', 'Finalizes checkout and initiates print dialog.'],
            ['Esc', 'Close Active Modal', 'Dismisses open dialogs, barcode previews, or popups.'],
            ['Alt + Left (<-)', 'Browser Back Navigation', 'Transitions back to previous tab or operational view.'],
            ['Alt + Right (->)', 'Browser Forward Navigation', 'Transitions forward in app navigation history.'],
          ],
        },
      },
    ],
  },
  {
    id: 'troubleshooting-faq',
    number: '7.0',
    title: 'Troubleshooting & Operational FAQ',
    badge: 'SUPPORT',
    summary: 'Immediate solutions for common store operations questions and troubleshooting scenarios.',
    subsections: [
      {
        subtitle: '7.1 Common Counter Issues & Quick Resolutions',
        description: 'Step-by-step guidance for resolving day-to-day hiccups:',
        bulletPoints: [
          'Problem: "The phone model shows in stock, but POS says no available serial numbers."',
          '  -> Solution: The stock quantity may have been increased manually without adding individual IMEIs, or the IMEI is locked in Quarantine. Go to Inventory -> Edit Product -> Serial Numbers, and verify that active IMEIs exist.',
          'Problem: "Cashier receives Access Denied when attempting to edit a price or refund."',
          '  -> Solution: This is by design to protect store revenue. Have a Store Manager enter their 4-digit PIN in the override prompt to authorize the transaction.',
          'Problem: "Barcode scanner inputs numbers slowly or adds unwanted spaces."',
          '  -> Solution: Ensure the physical scanner is configured to USB HID Keyboard mode with standard CR/LF suffix.',
          'Problem: "Shift closure shows a cash variance (shortage). What is the protocol?"',
          '  -> Solution: Review the Cash In / Cash Out movements for unrecorded petty cash expenses, double-check manual cash counting, and record the variance with a written note on the physical shift slip.',
        ],
      },
    ],
  },
];

/**
 * Generate full clean Markdown documentation from the structured sections
 */
export function generateUserManualMarkdown(): string {
  let md = `# ${USER_MANUAL_METADATA.title}\n`;
  md += `## ${USER_MANUAL_METADATA.subtitle}\n\n`;
  md += `* **Version:** ${USER_MANUAL_METADATA.version}\n`;
  md += `* **Document Control ID:** ${USER_MANUAL_METADATA.documentControlId}\n`;
  md += `* **Last Revision:** ${USER_MANUAL_METADATA.lastUpdated}\n`;
  md += `* **Target Audience:** ${USER_MANUAL_METADATA.targetAudience}\n\n`;
  md += `---\n\n`;

  USER_MANUAL_SECTIONS.forEach((sec) => {
    md += `## ${sec.number} ${sec.title} [${sec.badge}]\n\n`;
    md += `*${sec.summary}*\n\n`;

    sec.subsections.forEach((sub) => {
      md += `### ${sub.subtitle}\n\n`;
      md += `${sub.description}\n\n`;

      if (sub.bulletPoints && sub.bulletPoints.length > 0) {
        sub.bulletPoints.forEach((bp) => {
          md += `* ${bp}\n`;
        });
        md += `\n`;
      }

      if (sub.tableData) {
        md += `| ${sub.tableData.headers.join(' | ')} |\n`;
        md += `| ${sub.tableData.headers.map(() => '---').join(' | ')} |\n`;
        sub.tableData.rows.forEach((r) => {
          md += `| ${r.join(' | ')} |\n`;
        });
        md += `\n`;
      }

      if (sub.callout) {
        md += `> **${sub.callout.type.toUpperCase()}:** ${sub.callout.text}\n\n`;
      }
    });

    md += `---\n\n`;
  });

  md += `*Official Operational Training Manual - Mobile Shop POS & Inventory Suite*\n`;
  return md;
}

/**
 * Helper to download the markdown representation directly
 */
export function downloadUserManualMarkdownFile(shopName: string = 'Mobile_Store') {
  const md = generateUserManualMarkdown();
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeName = shopName.replace(/\s+/g, '_').toLowerCase();
  link.setAttribute('download', `${safeName}_operations_manual_${USER_MANUAL_METADATA.documentControlId}.md`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
