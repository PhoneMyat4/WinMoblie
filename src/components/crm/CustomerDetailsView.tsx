import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Download, 
  FileText, 
  Receipt, 
  ShoppingBag, 
  DollarSign, 
  Calendar, 
  Phone, 
  Mail, 
  MapPin, 
  Star, 
  Eye, 
  Smartphone, 
  ShieldCheck, 
  Clock, 
  CreditCard, 
  Edit3, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  ArrowUpDown, 
  ChevronRight,
  TrendingUp,
  Award,
  IdCard,
  User,
  Package,
  Layers,
  Filter,
  Check,
  X,
  CalendarClock,
  PackageCheck,
  Boxes
} from 'lucide-react';
import { Customer, Sale, SaleItem, ShopSettings, PaymentMethod, PreOrder } from '../../types';
import { StorageService } from '../../utils/storage';
import { formatCurrency, formatDateTime, formatDate, formatImei, formatDualImei, getCategoryLabel, getPaymentMethodInfo } from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { openWhatsAppChat } from '../../utils/whatsapp';
import { isPhoneCategory } from '../../data/categoryTaxonomy';

interface CustomerDetailsViewProps {
  customer: Customer;
  customers: Customer[];
  sales: Sale[];
  preOrders?: PreOrder[];
  settings: ShopSettings;
  onBack: () => void;
  onSelectCustomer: (customerId: string) => void;
  onSaveCustomer: (customer: Customer) => void;
  onViewInvoice?: (sale: Sale) => void;
}

export const CustomerDetailsView: React.FC<CustomerDetailsViewProps> = ({
  customer,
  customers,
  sales,
  preOrders,
  settings,
  onBack,
  onSelectCustomer,
  onSaveCustomer,
  onViewInvoice,
}) => {
  const [activeTab, setActiveTab] = useState<'sales' | 'devices' | 'insights' | 'preorders'>('sales');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'date' | 'grandTotal' | 'itemsCount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Edit Customer Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>(customer.name);
  const [editPhone, setEditPhone] = useState<string>(customer.phone);
  const [editEmail, setEditEmail] = useState<string>(customer.email || '');
  const [editAddress, setEditAddress] = useState<string>(customer.address || '');
  const [editNrc, setEditNrc] = useState<string>(customer.nrcNumber || '');
  const [editLoyaltyPoints, setEditLoyaltyPoints] = useState<number>(customer.loyaltyPoints || 0);
  const [editNotes, setEditNotes] = useState<string>(customer.notes || '');

  // Reset edit form when customer changes
  React.useEffect(() => {
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditEmail(customer.email || '');
    setEditAddress(customer.address || '');
    setEditNrc(customer.nrcNumber || '');
    setEditLoyaltyPoints(customer.loyaltyPoints || 0);
    setEditNotes(customer.notes || '');
  }, [customer]);

  // Find all past sales for this customer
  const customerSales = useMemo(() => {
    const custId = customer.id.toLowerCase();
    const custPhone = customer.phone ? customer.phone.replace(/\D/g, '') : '';
    const custName = customer.name.toLowerCase().trim();

    return sales.filter(s => {
      // 1. Direct ID match
      if (s.customerId && s.customerId.toLowerCase() === custId) return true;
      
      // 2. Phone match
      if (custPhone && s.customerPhone) {
        const salePhoneClean = s.customerPhone.replace(/\D/g, '');
        if (salePhoneClean && salePhoneClean === custPhone) return true;
      }

      // 3. Name match
      if (s.customerName && s.customerName.toLowerCase().trim() === custName) return true;

      return false;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, customer]);

  // Find all pre-orders for this customer
  const customerPreOrders = useMemo(() => {
    const allPreOrders = preOrders || StorageService.getPreOrders();
    const custId = customer.id.toLowerCase();
    const custPhone = customer.phone ? customer.phone.replace(/\D/g, '') : '';
    const custName = customer.name.toLowerCase().trim();

    return allPreOrders.filter(po => {
      // 1. Direct ID match
      if (po.customerId && po.customerId.toLowerCase() === custId) return true;

      // 2. Phone match
      if (custPhone && po.customerPhone) {
        const poPhoneClean = po.customerPhone.replace(/\D/g, '');
        if (poPhoneClean && poPhoneClean === custPhone) return true;
      }

      // 3. Name match
      if (po.customerName && po.customerName.toLowerCase().trim() === custName) return true;

      return false;
    }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [preOrders, customer]);

  // Financial & Transaction Totals Calculations
  const metrics = useMemo(() => {
    let completedSpent = 0;
    let refundedAmount = 0;
    let completedCount = 0;
    let refundedCount = 0;
    let totalUnits = 0;
    let totalBalanceDue = 0;
    let totalDiscountReceived = 0;
    let lastPurchaseDate: string | null = null;

    const paymentCounts: Record<string, number> = {};
    const categoryTotals: Record<string, { revenue: number; units: number }> = {};

    customerSales.forEach(sale => {
      const isCompleted = sale.status === 'completed';
      const isRefunded = sale.status === 'refunded';

      if (isCompleted) {
        completedSpent += sale.grandTotal;
        completedCount++;
        totalBalanceDue += sale.balanceDue || 0;
        totalDiscountReceived += sale.discountTotal || 0;

        if (!lastPurchaseDate || new Date(sale.date) > new Date(lastPurchaseDate)) {
          lastPurchaseDate = sale.date;
        }

        // Payment count
        const method = sale.paymentMethod || 'cash';
        paymentCounts[method] = (paymentCounts[method] || 0) + sale.grandTotal;

        // Categories
        sale.items.forEach(item => {
          totalUnits += item.quantity || 1;
          const cat = item.category || 'accessories';
          if (!categoryTotals[cat]) {
            categoryTotals[cat] = { revenue: 0, units: 0 };
          }
          categoryTotals[cat].revenue += item.finalPrice || (item.unitPrice * item.quantity);
          categoryTotals[cat].units += item.quantity || 1;
        });
      } else if (isRefunded) {
        refundedAmount += sale.grandTotal;
        refundedCount++;
      }
    });

    const netSpent = completedSpent;
    const avgOrderValue = completedCount > 0 ? completedSpent / completedCount : 0;

    return {
      totalSalesCount: customerSales.length,
      completedCount,
      refundedCount,
      completedSpent,
      refundedAmount,
      netSpent,
      avgOrderValue,
      totalUnits,
      totalBalanceDue,
      totalDiscountReceived,
      lastPurchaseDate,
      paymentCounts,
      categoryTotals,
    };
  }, [customerSales]);

  // Serialized Devices & Phone Purchases
  const purchasedDevices = useMemo(() => {
    const list: Array<{
      id: string;
      item: SaleItem;
      sale: Sale;
      purchaseDate: string;
      invoiceNumber: string;
      warrantyExpiry?: string;
      isWarrantyActive: boolean;
    }> = [];

    customerSales.forEach(sale => {
      if (sale.status === 'refunded') return;
      sale.items.forEach((item, idx) => {
        const hasImei = Boolean(item.imei || item.imei2);
        const isDeviceCategory = isPhoneCategory(item.category) || item.category === 'gadgets';
        
        if (hasImei || isDeviceCategory) {
          // Calculate warranty validity if specified
          let isWarrantyActive = false;
          let warrantyExpiry: string | undefined = undefined;

          if (item.warrantyPeriod) {
            const monthsMatch = item.warrantyPeriod.match(/(\d+)\s*month/i);
            const daysMatch = item.warrantyPeriod.match(/(\d+)\s*day/i);
            const yearsMatch = item.warrantyPeriod.match(/(\d+)\s*year/i);
            
            const saleD = new Date(sale.date);
            if (monthsMatch) {
              saleD.setMonth(saleD.getMonth() + parseInt(monthsMatch[1]));
              warrantyExpiry = saleD.toISOString().slice(0, 10);
            } else if (daysMatch) {
              saleD.setDate(saleD.getDate() + parseInt(daysMatch[1]));
              warrantyExpiry = saleD.toISOString().slice(0, 10);
            } else if (yearsMatch) {
              saleD.setFullYear(saleD.getFullYear() + parseInt(yearsMatch[1]));
              warrantyExpiry = saleD.toISOString().slice(0, 10);
            }

            if (warrantyExpiry) {
              isWarrantyActive = new Date(warrantyExpiry) >= new Date();
            }
          }

          list.push({
            id: `${sale.id}-${idx}`,
            item,
            sale,
            purchaseDate: sale.date,
            invoiceNumber: sale.invoiceNumber,
            warrantyExpiry,
            isWarrantyActive,
          });
        }
      });
    });

    return list;
  }, [customerSales]);

  // Filtered & Sorted Sales for Table
  const filteredSales = useMemo(() => {
    return customerSales.filter(sale => {
      // Status filter
      if (statusFilter !== 'all' && sale.status !== statusFilter) {
        return false;
      }

      // Payment filter
      if (paymentFilter !== 'all' && sale.paymentMethod !== paymentFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesInvoice = sale.invoiceNumber.toLowerCase().includes(q);
        const matchesCashier = sale.soldBy.toLowerCase().includes(q);
        const matchesItems = sale.items.some(it => 
          it.name.toLowerCase().includes(q) || 
          (it.brand && it.brand.toLowerCase().includes(q)) ||
          (it.imei && it.imei.includes(q)) ||
          (it.imei2 && it.imei2.includes(q))
        );
        const matchesNotes = sale.notes ? sale.notes.toLowerCase().includes(q) : false;

        if (!matchesInvoice && !matchesCashier && !matchesItems && !matchesNotes) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let valA: number;
      let valB: number;

      if (sortField === 'date') {
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
      } else if (sortField === 'grandTotal') {
        valA = a.grandTotal;
        valB = b.grandTotal;
      } else {
        valA = a.items.reduce((sum, i) => sum + i.quantity, 0);
        valB = b.items.reduce((sum, i) => sum + i.quantity, 0);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [customerSales, statusFilter, paymentFilter, searchQuery, sortField, sortOrder]);

  // Export handlers
  const handleExportPdf = () => {
    const headers = ['Date & Time', 'Invoice #', 'Status', 'Items Purchased', 'Payment', 'Cashier', 'Grand Total'];
    const rows = filteredSales.map(sale => [
      formatDateTime(sale.date),
      sale.invoiceNumber,
      (sale.status || 'completed').toUpperCase(),
      (sale.items || []).map(i => `${i.name} (x${i.quantity})`).join(', '),
      (sale.paymentMethod || 'cash').toUpperCase(),
      sale.soldBy || 'Cashier',
      formatCurrency(sale.grandTotal, settings.currencySymbol)
    ]);

    exportReportToPdf({
      title: `Customer Statement: ${customer.name}`,
      subtitle: `Phone: ${customer.phone} | Lifetime Spend: ${formatCurrency(metrics.completedSpent, settings.currencySymbol)} | Invoices: ${metrics.completedCount}`,
      filename: `customer_statement_${customer.name.replace(/\s+/g, '_')}`,
      headers,
      rows,
      settings,
      orientation: 'landscape',
    });
  };

  const handleExportCsv = () => {
    const headers = ['Date', 'Invoice Number', 'Status', 'Items', 'Quantity', 'Payment Method', 'Sold By', 'Discount', 'Grand Total', 'Amount Paid', 'Balance Due'];
    const rows = filteredSales.map(sale => [
      sale.date,
      sale.invoiceNumber,
      sale.status,
      sale.items.map(i => i.name).join('; '),
      sale.items.reduce((s, i) => s + i.quantity, 0),
      sale.paymentMethod,
      sale.soldBy,
      sale.discountTotal,
      sale.grandTotal,
      sale.amountPaid,
      sale.balanceDue
    ]);

    exportToCsv(`customer_${customer.name.replace(/\s+/g, '_')}_sales`, headers, rows);
  };

  const handleSaveEditForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editPhone) return;

    const updatedCustomer: Customer = {
      ...customer,
      name: editName,
      phone: editPhone,
      email: editEmail || undefined,
      address: editAddress || undefined,
      nrcNumber: editNrc || undefined,
      loyaltyPoints: editLoyaltyPoints,
      notes: editNotes || undefined,
    };

    onSaveCustomer(updatedCustomer);
    setIsEditModalOpen(false);
  };

  return (
    <div id="customer-details-container" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Customers</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900">{customer.name}</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px]">
                <User className="w-3 h-3" />
                Customer Details
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Client ID: <span className="font-mono text-slate-700">{customer.id}</span> • Member since {formatDate(customer.createdAt)}
            </p>
          </div>
        </div>

        {/* Action Controls & Customer Quick Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Switcher */}
          <div className="relative">
            <select
              value={customer.id}
              onChange={(e) => onSelectCustomer(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>

          {/* WhatsApp Button */}
          <button
            type="button"
            onClick={() => openWhatsAppChat(customer.phone, `Hello ${customer.name}, greeting from ${settings.shopName}! How can we assist you today?`)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            title="Chat on WhatsApp"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>

          {/* Edit Profile Button */}
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            title="Export Statement PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF Statement</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Customer Profile Card & Contact Info */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* Avatar & Core Profile */}
          <div className="md:col-span-4 flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1 min-w-0">
              <h2 className="text-base font-black text-slate-900 truncate">{customer.name}</h2>
              
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a href={`tel:${customer.phone}`} className="font-mono font-bold hover:text-indigo-600 transition-colors">
                  {customer.phone}
                </a>
              </div>

              {customer.email && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <a href={`mailto:${customer.email}`} className="truncate hover:text-indigo-600 transition-colors">
                    {customer.email}
                  </a>
                </div>
              )}

              {customer.address && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{customer.address}</span>
                </div>
              )}

              {customer.nrcNumber && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <IdCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono font-medium">NRC: {customer.nrcNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Loyalty & Badges */}
          <div className="md:col-span-4 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Loyalty Rewards</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                {customer.loyaltyPoints || 0} Points
              </span>
            </div>
            
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Earned across {metrics.completedCount} successful transactions. Points can be redeemed at checkout for instant order discounts.
            </p>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/80">
              <span className="text-slate-500">Member Status:</span>
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {metrics.completedSpent > 2000000 ? 'VIP Gold Customer' : metrics.completedSpent > 500000 ? 'Silver Regular' : 'Standard Member'}
              </span>
            </div>
          </div>

          {/* Notes & Preferences */}
          <div className="md:col-span-4 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                <span>Customer Notes & Preferences</span>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold"
                >
                  Edit Note
                </button>
              </div>
              <p className="text-xs text-slate-600 italic line-clamp-3">
                {customer.notes ? `"${customer.notes}"` : 'No specific customer notes added yet. Click edit to record customer preferences, preferred brands, or credit terms.'}
              </p>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-200/80 flex items-center justify-between">
              <span>Last Purchase:</span>
              <span className="font-semibold text-slate-700">
                {metrics.lastPurchaseDate ? formatDateTime(metrics.lastPurchaseDate) : 'No purchases yet'}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* KPI Financial & Transaction Totals Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        
        {/* Total Lifetime Spend */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Spent</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {formatCurrency(metrics.completedSpent, settings.currencySymbol)}
          </p>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">
            Lifetime Net Purchases
          </p>
        </div>

        {/* Total Invoices */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Invoices</span>
            <Receipt className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {metrics.completedCount}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {metrics.refundedCount > 0 ? `${metrics.refundedCount} refunded orders` : 'All sales active'}
          </p>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Avg Order Value</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900">
            {formatCurrency(metrics.avgOrderValue, settings.currencySymbol)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Per completed sale
          </p>
        </div>

        {/* Total Units Purchased */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Items Bought</span>
            <Package className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {metrics.totalUnits} Units
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {purchasedDevices.length} Phones / Devices
          </p>
        </div>

        {/* Discounts Received */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Saved Discounts</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900">
            {formatCurrency(metrics.totalDiscountReceived, settings.currencySymbol)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Promotional savings
          </p>
        </div>

        {/* Balance Due / Outstanding Credit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Balance Due</span>
            <AlertCircle className={`w-4 h-4 ${metrics.totalBalanceDue > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-lg sm:text-xl font-black ${metrics.totalBalanceDue > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {formatCurrency(metrics.totalBalanceDue, settings.currencySymbol)}
          </p>
          <p className={`text-[10px] font-bold mt-1 ${metrics.totalBalanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {metrics.totalBalanceDue > 0 ? 'Pending Payment' : 'Fully Paid Up'}
          </p>
        </div>

      </div>

      {/* Sub Tabs Navigation (Sales Invoices / Purchased Devices / Spend Analytics) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
              activeTab === 'sales'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Past Sales & Invoices ({customerSales.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('devices')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
              activeTab === 'devices'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Purchased Devices & Warranty ({purchasedDevices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('insights')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
              activeTab === 'insights'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Category & Payment Breakdown</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preorders')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
              activeTab === 'preorders'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CalendarClock className="w-4 h-4 text-amber-500" />
            <span>Pre-Orders & Bookings ({customerPreOrders.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PAST SALES & TRANSACTIONS TABLE */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          
          {/* Search and Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
            
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search invoice #, product, IMEI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              
              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  All ({customerSales.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('completed')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    statusFilter === 'completed' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Completed ({metrics.completedCount})
                </button>
                {metrics.refundedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('refunded')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      statusFilter === 'refunded' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Refunded ({metrics.refundedCount})
                  </button>
                )}
              </div>

              {/* Payment Filter */}
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="all">All Payment Methods</option>
                <option value="cash">Cash</option>
                <option value="kpay">KBZPay (KPay)</option>
                <option value="wave">Wave Money</option>
                <option value="kbz">KBZ Direct</option>
                <option value="aya">AYA Pay / Bank</option>
                <option value="cb">CB Pay</option>
                <option value="yoma">Yoma Bank</option>
                <option value="split">Split Payment</option>
              </select>

              {/* Sort By */}
              <select
                value={`${sortField}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortField(field as any);
                  setSortOrder(order as any);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="date-desc">Newest Date First</option>
                <option value="date-asc">Oldest Date First</option>
                <option value="grandTotal-desc">Amount: High to Low</option>
                <option value="grandTotal-asc">Amount: Low to High</option>
                <option value="itemsCount-desc">Most Items First</option>
              </select>

            </div>

          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {filteredSales.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-sm font-black text-slate-800">No Transactions Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery || statusFilter !== 'all' || paymentFilter !== 'all'
                    ? 'No sales matched your active filters. Try resetting the search or filter.'
                    : 'This customer has no past sales records registered yet. Any completed POS sales will appear here automatically.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Purchased Items</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4 text-center">Cashier</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map(sale => {
                      const payInfo = getPaymentMethodInfo(sale.paymentMethod);
                      const isRefunded = sale.status === 'refunded';

                      return (
                        <tr 
                          key={sale.id} 
                          className={`hover:bg-slate-50/80 transition-colors ${isRefunded ? 'bg-rose-50/30 opacity-80' : ''}`}
                        >
                          {/* Invoice # */}
                          <td className="py-3 px-4 align-top">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-indigo-600">{sale.invoiceNumber}</span>
                              {isRefunded ? (
                                <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">
                                  REFUNDED
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                                  PAID
                                </span>
                              )}
                            </div>
                            {sale.notes && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-[140px]">
                                Note: {sale.notes}
                              </p>
                            )}
                          </td>

                          {/* Date & Time */}
                          <td className="py-3 px-4 align-top whitespace-nowrap text-slate-600">
                            <div className="font-semibold text-slate-900">{formatDate(sale.date)}</div>
                            <div className="text-[10px] text-slate-400">{formatDateTime(sale.date).split(',')[1] || ''}</div>
                          </td>

                          {/* Purchased Items List */}
                          <td className="py-3 px-4 align-top min-w-[240px]">
                            <div className="space-y-1.5">
                              {sale.items.map((it, idx) => (
                                <div key={idx} className="flex flex-col text-slate-800">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold truncate">
                                      {it.name} <span className="text-slate-500 font-normal">x{it.quantity}</span>
                                    </span>
                                    <span className="font-mono font-semibold text-slate-600 shrink-0">
                                      {formatCurrency(it.finalPrice || (it.unitPrice * it.quantity), settings.currencySymbol)}
                                    </span>
                                  </div>

                                  {/* Serial / IMEI tag */}
                                  {(it.imei || it.imei2) && (
                                    <div className="flex items-center gap-1 text-[10px] font-mono text-indigo-700 bg-indigo-50/80 px-1.5 py-0.5 rounded-md w-fit mt-0.5">
                                      <Smartphone className="w-2.5 h-2.5 text-indigo-600" />
                                      <span>{formatDualImei(it.imei || '', it.imei2)}</span>
                                    </div>
                                  )}

                                  {/* Warranty Tag */}
                                  {it.warrantyPeriod && (
                                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                                      <span>Warranty: {it.warrantyPeriod}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Payment Method */}
                          <td className="py-3 px-4 align-top whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${payInfo.badgeBg}`}>
                              {payInfo.label}
                            </span>
                            {sale.pointsEarned > 0 && (
                              <div className="text-[10px] text-amber-700 font-medium mt-1">
                                +{sale.pointsEarned} Pts Earned
                              </div>
                            )}
                          </td>

                          {/* Cashier */}
                          <td className="py-3 px-4 align-top text-center text-slate-600 whitespace-nowrap">
                            <span className="font-semibold">{sale.soldBy || 'Cashier'}</span>
                          </td>

                          {/* Grand Total & Balances */}
                          <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                            <p className={`font-black text-sm ${isRefunded ? 'text-rose-600 line-through' : 'text-slate-900'}`}>
                              {formatCurrency(sale.grandTotal, settings.currencySymbol)}
                            </p>
                            {sale.discountTotal > 0 && (
                              <p className="text-[10px] text-emerald-600 font-semibold">
                                Disc: -{formatCurrency(sale.discountTotal, settings.currencySymbol)}
                              </p>
                            )}
                            {sale.balanceDue > 0 && (
                              <p className="text-[10px] text-rose-600 font-bold">
                                Due: {formatCurrency(sale.balanceDue, settings.currencySymbol)}
                              </p>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-3 px-4 align-top text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              {onViewInvoice && (
                                <button
                                  type="button"
                                  title="View / Print Invoice"
                                  onClick={() => onViewInvoice(sale)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </button>
                              )}

                              <button
                                type="button"
                                title="Share Invoice on WhatsApp"
                                onClick={() => {
                                  const text = `Hello ${customer.name}, here is your purchase summary for Invoice ${sale.invoiceNumber} from ${settings.shopName}.\nTotal: ${formatCurrency(sale.grandTotal, settings.currencySymbol)}\nDate: ${formatDateTime(sale.date)}\nThank you for choosing us!`;
                                  openWhatsAppChat(customer.phone, text);
                                }}
                                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: PURCHASED DEVICES & SERIALIZED INVENTORY TRACKER */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Registered Devices & Serialized Purchases</h3>
                <p className="text-xs text-slate-500">
                  Track physical IMEI / Serial Numbers and warranty validity for customer device history & repair validation.
                </p>
              </div>

              <div className="text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                Total Devices Bought: <span className="text-indigo-600">{purchasedDevices.length}</span>
              </div>
            </div>

            {purchasedDevices.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Smartphone className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No serialized devices recorded for this customer yet.</p>
                <p className="text-[11px] text-slate-400">Smartphones and serialized items bought will appear here with IMEI and warranty tracking.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {purchasedDevices.map((dev) => (
                  <div key={dev.id} className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          {getCategoryLabel(dev.item.category)}
                        </span>
                        <h4 className="text-sm font-black text-slate-900 mt-1">{dev.item.name}</h4>
                        <p className="text-xs text-slate-500">{dev.item.brand || 'Original Brand'}</p>
                      </div>

                      {dev.warrantyExpiry ? (
                        dev.isWarrantyActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Warranty Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                            <Clock className="w-3 h-3 text-slate-500" />
                            Warranty Expired
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">Standard Retail</span>
                      )}
                    </div>

                    {/* IMEI / Serial Info */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 flex items-center gap-1 font-medium">
                          <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                          IMEI / Serial:
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {dev.item.imei ? formatImei(dev.item.imei) : 'N/A'}
                        </span>
                      </div>

                      {dev.item.imei2 && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                          <span className="text-slate-500 font-medium">IMEI 2 (Dual SIM):</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatImei(dev.item.imei2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Meta info & Invoice link */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <div>
                        Purchased: <span className="font-semibold text-slate-800">{formatDate(dev.purchaseDate)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600">Inv: {dev.invoiceNumber}</span>
                        {onViewInvoice && (
                          <button
                            type="button"
                            onClick={() => onViewInvoice(dev.sale)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORY & PAYMENT INSIGHTS */}
      {activeTab === 'insights' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Category Distribution Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Purchases by Product Category</h3>
              <p className="text-xs text-slate-500">Distribution of customer spend across inventory departments</p>
            </div>

            <div className="space-y-3">
              {Object.keys(metrics.categoryTotals).length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No category data recorded yet.</p>
              ) : (
                Object.entries(metrics.categoryTotals).map(([catKey, data]) => {
                  const pct = metrics.completedSpent > 0 ? (data.revenue / metrics.completedSpent) * 100 : 0;
                  return (
                    <div key={catKey} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{getCategoryLabel(catKey)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">({data.units} units)</span>
                          <span className="font-black text-slate-900">
                            {formatCurrency(data.revenue, settings.currencySymbol)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-right text-slate-400 font-mono font-medium">
                        {pct.toFixed(1)}% of lifetime purchases
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Payment Method Distribution Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Payment Channel Preferences</h3>
              <p className="text-xs text-slate-500">Breakdown of payment methods used by {customer.name}</p>
            </div>

            <div className="space-y-3">
              {Object.keys(metrics.paymentCounts).length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No payment data recorded yet.</p>
              ) : (
                Object.entries(metrics.paymentCounts).map(([method, amount]) => {
                  const payInfo = getPaymentMethodInfo(method as PaymentMethod);
                  const pct = metrics.completedSpent > 0 ? (amount / metrics.completedSpent) * 100 : 0;
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{payInfo.label}</span>
                        <span className="font-black text-slate-900">
                          {formatCurrency(amount, settings.currencySymbol)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-emerald-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-right text-slate-400 font-mono font-medium">
                        {pct.toFixed(1)}% of total paid volume
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* TAB 4: PRE-ORDERS & ADVANCE BOOKINGS */}
      {activeTab === 'preorders' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-indigo-600" />
                Pre-Order Bookings & Advance Reservations
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                All pre-orders, specifications, and deposit status recorded for {customer.name}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-xl">
                {customerPreOrders.length} Total Pre-Order{customerPreOrders.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {customerPreOrders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-700">No Pre-Orders for this Customer</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                When you create a pre-order in the Pre-Orders session with this customer's name or phone number, it will automatically link and appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {customerPreOrders.map((order) => {
                const isPending = order.status === 'Pending';
                const isStockArrived = order.status === 'Stock Arrived';
                const isCompleted = order.status === 'Completed';
                const isCancelled = order.status === 'Cancelled';

                const statusColor = isCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isStockArrived
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : isPending
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';

                return (
                  <div 
                    key={order.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {order.preOrderNumber}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${statusColor}`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Booked on {order.orderDate}
                            {order.expectedArrivalDate && (
                              <span> • Expected Arrival: <strong className="text-slate-700">{order.expectedArrivalDate}</strong></span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* WhatsApp / Voucher action */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const msg = `Hello ${customer.name}, regarding your Pre-Order #${order.preOrderNumber} for ${order.phoneModel} (${order.color}, ${order.ram}/${order.rom}). Status: ${order.status}. Deposit paid: ${formatCurrency(order.depositAmount, settings.currencySymbol)}, Balance due: ${formatCurrency(order.remainingBalance, settings.currencySymbol)}.`;
                            openWhatsAppChat(customer.phone, msg);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp Update</span>
                        </button>
                      </div>
                    </div>

                    {/* Order Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 my-4 text-xs">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Phone Model</span>
                        <p className="font-bold text-slate-900 text-sm mt-0.5">{order.phoneModel}</p>
                        <p className="text-[11px] text-slate-500">{order.brand || 'Device'}</p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Configuration</span>
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-slate-700 text-[11px]">
                            {order.color}
                          </span>
                          <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-purple-700 text-[11px]">
                            {order.ram} / {order.rom}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Quantity: <strong className="text-slate-800">{order.quantity || 1} Unit</strong></p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Pre-paid Deposit</span>
                        <p className="font-black text-emerald-700 text-sm mt-0.5 font-mono">
                          {formatCurrency(order.depositAmount, settings.currencySymbol)}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">
                          Via {order.depositPaymentMethod}
                        </p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Balance Due at Counter</span>
                        <p className="font-black text-indigo-700 text-sm mt-0.5 font-mono">
                          {formatCurrency(order.remainingBalance, settings.currencySymbol)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Total Price: {formatCurrency(order.fullPrice, settings.currencySymbol)}
                        </p>
                      </div>
                    </div>

                    {/* Allocated Stock / Late-Linking info */}
                    {(order.allocatedImei || order.allocatedImeis) && (
                      <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-emerald-900 font-semibold">
                            Inventory Allocated: 
                          </span>
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            IMEI: {order.allocatedImei || order.allocatedImeis?.join(', ')}
                          </span>
                        </div>
                        {order.allocatedPurchaseOrderNumber && (
                          <span className="text-[11px] text-emerald-700 font-medium">
                            Linked Purchase PO: #{order.allocatedPurchaseOrderNumber}
                          </span>
                        )}
                      </div>
                    )}

                    {order.notes && (
                      <p className="text-xs text-slate-500 italic mt-2">
                        Note: "{order.notes}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Customer Profile Modal */}
      {isEditModalOpen && (
        <div id="edit-customer-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">Edit Customer Profile</h3>
              <button 
                type="button" 
                onClick={() => setIsEditModalOpen(false)} 
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditForm} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">NRC / ID Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 12/DAGAMA(N)123456"
                    value={editNrc}
                    onChange={(e) => setEditNrc(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Address</label>
                <input
                  type="text"
                  placeholder="Street, Township, City"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Loyalty Points Balance</label>
                <input
                  type="number"
                  value={editLoyaltyPoints === 0 ? '' : editLoyaltyPoints}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setEditLoyaltyPoints(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-amber-700 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Notes / Preferences</label>
                <textarea
                  rows={3}
                  placeholder="Special requests, favorite phone models, wholesale VIP terms..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
