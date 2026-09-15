import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Truck, 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Star, 
  DollarSign, 
  Wrench, 
  CreditCard, 
  X, 
  Check,
  MessageSquare,
  Eye,
  ChevronRight,
  UserCheck,
  CalendarClock,
  Smartphone
} from 'lucide-react';
import { Customer, Supplier, ShopSettings, Sale, PreOrder } from '../../types';
import { StorageService } from '../../utils/storage';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { openWhatsAppChat } from '../../utils/whatsapp';
import { CustomerDetailsView } from './CustomerDetailsView';

interface CustomersSuppliersProps {
  customers: Customer[];
  suppliers: Supplier[];
  sales?: Sale[];
  preOrders?: PreOrder[];
  settings: ShopSettings;
  onSaveCustomer: (customer: Customer) => void;
  onSaveSupplier: (supplier: Supplier) => void;
  onViewInvoice?: (sale: Sale) => void;
  initialSelectedCustomerId?: string;
}

export const CustomersSuppliers: React.FC<CustomersSuppliersProps> = ({
  customers,
  suppliers,
  sales = [],
  preOrders,
  settings,
  onSaveCustomer,
  onSaveSupplier,
  onViewInvoice,
  initialSelectedCustomerId,
}) => {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialSelectedCustomerId || null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<'all' | 'preorders' | 'loyalty'>('all');

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);

  // Customer form
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custEmail, setCustEmail] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');

  // Supplier form
  const [supName, setSupName] = useState<string>('');
  const [supContactPerson, setSupContactPerson] = useState<string>('');
  const [supPhone, setSupPhone] = useState<string>('');
  const [supEmail, setSupEmail] = useState<string>('');
  const [supAddress, setSupAddress] = useState<string>('');
  const [supBalanceDue, setSupBalanceDue] = useState<number>(0);

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email && c.email.toLowerCase().includes(q));
  });

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    const contact = s.contactPerson || s.name || '';
    return s.name.toLowerCase().includes(q) || s.phone.includes(q) || contact.toLowerCase().includes(q);
  });

  const totalPayableToSuppliers = suppliers.reduce((sum, s) => sum + (s.balanceDue ?? s.balancePayable ?? 0), 0);
  const totalCustomerLifetimeSpend = customers.reduce((sum, c) => sum + c.totalSpent, 0);

  // Pre-orders mapping to customers
  const allPreOrders = useMemo(() => preOrders || StorageService.getPreOrders(), [preOrders]);

  const customerPreOrdersMap = useMemo(() => {
    const map = new Map<string, PreOrder[]>();
    allPreOrders.forEach(po => {
      const directKey = po.customerId ? po.customerId.toLowerCase() : null;
      const phoneKey = po.customerPhone ? po.customerPhone.replace(/\D/g, '') : null;
      const nameKey = po.customerName ? po.customerName.trim().toLowerCase() : null;

      customers.forEach(cust => {
        const matches = 
          (directKey && cust.id.toLowerCase() === directKey) ||
          (phoneKey && cust.phone && cust.phone.replace(/\D/g, '') === phoneKey) ||
          (nameKey && cust.name.trim().toLowerCase() === nameKey);
        if (matches) {
          const existing = map.get(cust.id) || [];
          if (!existing.some(p => p.id === po.id)) {
            existing.push(po);
            map.set(cust.id, existing);
          }
        }
      });
    });
    return map;
  }, [allPreOrders, customers]);

  const totalPreOrdersCount = allPreOrders.length;
  const customersWithPreOrdersCount = customerPreOrdersMap.size;

  const displayCustomers = useMemo(() => {
    return filteredCustomers.filter(c => {
      if (customerFilter === 'preorders') {
        const orders = customerPreOrdersMap.get(c.id);
        return orders && orders.length > 0;
      }
      if (customerFilter === 'loyalty') {
        return (c.loyaltyPoints || 0) > 0;
      }
      return true;
    });
  }, [filteredCustomers, customerFilter, customerPreOrdersMap]);

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName || !custPhone) return;

    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: custName,
      phone: custPhone,
      email: custEmail || undefined,
      address: custAddress || undefined,
      loyaltyPoints: 10, // welcome bonus points
      totalSpent: 0,
      totalVisits: 1,
      createdAt: new Date().toISOString().split('T')[0],
    };

    onSaveCustomer(newCust);
    setIsCustomerModalOpen(false);
    setCustName('');
    setCustPhone('');
    setCustEmail('');
    setCustAddress('');
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName || !supPhone) return;

    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      name: supName,
      contactPerson: supContactPerson || supName,
      phone: supPhone,
      email: supEmail || undefined,
      address: supAddress || undefined,
      balanceDue: supBalanceDue,
    };

    onSaveSupplier(newSup);
    setIsSupplierModalOpen(false);
    setSupName('');
    setSupContactPerson('');
    setSupPhone('');
    setSupEmail('');
    setSupAddress('');
    setSupBalanceDue(0);
  };

  // Check if a customer details view is active
  if (selectedCustomerId) {
    const activeCustomer = customers.find(c => c.id === selectedCustomerId);
    if (activeCustomer) {
      return (
        <CustomerDetailsView
          customer={activeCustomer}
          customers={customers}
          sales={sales}
          preOrders={allPreOrders}
          settings={settings}
          onBack={() => setSelectedCustomerId(null)}
          onSelectCustomer={(id) => setSelectedCustomerId(id)}
          onSaveCustomer={onSaveCustomer}
          onViewInvoice={onViewInvoice}
        />
      );
    }
  }

  return (
    <div id="crm-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Banner KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Registered Customers</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{customers.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {formatCurrency(totalCustomerLifetimeSpend, settings.currencySymbol)} Lifetime Purchases
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Pre-Order Bookings</span>
            <CalendarClock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600">{totalPreOrdersCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {customersWithPreOrdersCount} Customer{customersWithPreOrdersCount !== 1 ? 's' : ''} with Pre-Orders
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Wholesale Suppliers</span>
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{suppliers.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Phone distributors & parts vendors</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Accounts Payable</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-700">
            {formatCurrency(totalPayableToSuppliers, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-rose-600 mt-1 font-medium">Pending vendor payments</p>
        </div>
      </div>

      {/* Navigation Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'customers' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            Customers ({customers.length})
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'suppliers' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            Suppliers & Vendors ({suppliers.length})
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <button
            type="button"
            onClick={() => activeTab === 'customers' ? setIsCustomerModalOpen(true) : setIsSupplierModalOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 cursor-pointer"
          >
            + Add {activeTab === 'customers' ? 'Customer' : 'Supplier'}
          </button>
        </div>

      </div>

      {/* CRM Filter Chips (for Customers) */}
      {activeTab === 'customers' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCustomerFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              customerFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Customers ({customers.length})
          </button>

          <button
            type="button"
            onClick={() => setCustomerFilter('preorders')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              customerFilter === 'preorders'
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-slate-200 text-amber-700 hover:bg-amber-50'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            With Pre-Orders ({customersWithPreOrdersCount})
          </button>

          <button
            type="button"
            onClick={() => setCustomerFilter('loyalty')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              customerFilter === 'loyalty'
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
            With Loyalty Points
          </button>
        </div>
      )}

      {/* Main CRM Tables */}
      {activeTab === 'customers' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Phone / WhatsApp</th>
                  <th className="py-3 px-4 text-center">Pre-Orders</th>
                  <th className="py-3 px-4 text-right">Loyalty Points</th>
                  <th className="py-3 px-4 text-right">Total Spent</th>
                  <th className="py-3 px-4 text-center">Visits</th>
                  <th className="py-3 px-4 text-center">Active Repairs</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                      No customers found matching the search / filter criteria.
                    </td>
                  </tr>
                ) : (
                  displayCustomers.map(cust => {
                    const custOrders = customerPreOrdersMap.get(cust.id) || [];
                    const hasActivePreOrder = custOrders.some(po => po.status === 'Pending' || po.status === 'Stock Arrived');

                    return (
                      <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(cust.id)}
                            className="text-left font-bold text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer group flex items-center gap-1.5"
                          >
                            <span className="group-hover:underline">{cust.name}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
                          </button>
                          {cust.email && <p className="text-[10px] text-slate-400">{cust.email}</p>}
                        </td>

                        <td className="py-3 px-4 font-mono font-medium text-slate-700">
                          {cust.phone}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {custOrders.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setSelectedCustomerId(cust.id)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold cursor-pointer transition-colors ${
                                hasActivePreOrder
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              <CalendarClock className="w-3 h-3 text-amber-600" />
                              <span>{custOrders.length} Order{custOrders.length > 1 ? 's' : ''}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            {cust.loyaltyPoints} Pts
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-black text-slate-900">
                          {formatCurrency(cust.totalSpent, settings.currencySymbol)}
                        </td>

                        <td className="py-3 px-4 text-center font-semibold text-slate-600">
                          {cust.totalVisits}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {cust.activeRepairsCount > 0 ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                              {cust.activeRepairsCount} Active
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              title="View Customer Details, History & Pre-Orders"
                              onClick={() => setSelectedCustomerId(cust.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Details</span>
                            </button>

                            <button
                              type="button"
                              title="Chat on WhatsApp"
                              onClick={() => openWhatsAppChat(cust.phone, `Hello ${cust.name}, thank you for choosing ${settings.shopName}!`)}
                              className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Supplier Company</th>
                  <th className="py-3 px-4">Contact Representative</th>
                  <th className="py-3 px-4">Phone / Email</th>
                  <th className="py-3 px-4">Warehouse Address</th>
                  <th className="py-3 px-4 text-right">Account Balance Due</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map(sup => (
                  <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{sup.name}</p>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {sup.contactPerson || sup.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      <p>{sup.phone}</p>
                      {sup.email && <p className="text-[10px] text-slate-400">{sup.email}</p>}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate">
                      {sup.address || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-rose-700">
                      {formatCurrency(sup.balanceDue ?? sup.balancePayable ?? 0, settings.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        title="Chat on WhatsApp"
                        onClick={() => openWhatsAppChat(sup.phone, `Hi ${sup.contactPerson}, regarding supply orders from ${settings.shopName}.`)}
                        className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isCustomerModalOpen && (
        <div id="add-customer-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">Add New Customer</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Miller"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp / Phone *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +1 555 892 1092"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. david@example.com"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="e.g. 102 Broadway Street"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isSupplierModalOpen && (
        <div id="add-supplier-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">Add Wholesale Supplier</h3>
              <button onClick={() => setIsSupplierModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Company / Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Mobile Wholesale Distributors"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person Name</label>
                <input
                  type="text"
                  placeholder="e.g. Frank Johnson"
                  value={supContactPerson}
                  onChange={(e) => setSupContactPerson(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +1 800 555 9012"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Warehouse / Office Address</label>
                <input
                  type="text"
                  placeholder="e.g. No. 45, Industrial Zone 2, Yangon"
                  value={supAddress}
                  onChange={(e) => setSupAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Balance Payable</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={supBalanceDue === 0 ? '' : supBalanceDue}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setSupBalanceDue(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-rose-700"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
