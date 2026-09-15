import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  CalendarClock, 
  Smartphone, 
  User, 
  Phone, 
  MapPin, 
  DollarSign, 
  Calendar, 
  Tag, 
  Layers, 
  Palette, 
  Cpu, 
  HardDrive, 
  FileText, 
  Check, 
  Printer, 
  CreditCard,
  Building,
  Landmark,
  Zap,
  Sparkles,
  ShieldCheck,
  Plus,
  Minus,
  Boxes,
  Calculator,
  Search,
  Users,
  AlertTriangle
} from 'lucide-react';
import { PreOrder, Customer, Product, ShopSettings, PaymentMethod } from '../../types';
import { StorageService } from '../../utils/storage';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { getColorDotHex } from '../../utils/variantUtils';
import { isPhoneCategory } from '../../data/categoryTaxonomy';

interface PreOrderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePreOrder: (preOrder: PreOrder) => void;
  onSaveCustomer?: (customer: Customer) => void;
  existingPreOrder?: PreOrder | null;
  customers: Customer[];
  products: Product[];
  settings: ShopSettings;
}

const COMMON_BRANDS = [
  'Apple', 
  'Samsung', 
  'Xiaomi', 
  'Honor', 
  'Vivo', 
  'Oppo', 
  'Realme', 
  'Poco', 
  'Infinix', 
  'Tecno', 
  'Huawei', 
  'Google', 
  'OnePlus', 
  'Sony', 
  'Motorola', 
  'Nothing'
];
const COMMON_RAM_OPTIONS = ['4GB', '6GB', '8GB', '12GB', '16GB', '24GB', '-'];
const COMMON_ROM_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '-'];
const COMMON_COLOR_PRESETS = [
  'Desert Titanium',
  'Natural Titanium',
  'Black Titanium',
  'White Titanium',
  'Titanium Blue',
  'Titanium Gray',
  'Obsidian Black',
  'Midnight',
  'Starlight',
  'Emerald Green',
  'Gold',
  'Silver',
  'Purple'
];

export const PreOrderFormModal: React.FC<PreOrderFormModalProps> = ({
  isOpen,
  onClose,
  onSavePreOrder,
  onSaveCustomer,
  existingPreOrder,
  customers,
  products,
  settings,
}) => {
  // Form State
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);

  // Phone Model Specs
  const [phoneModel, setPhoneModel] = useState<string>('');
  const [brand, setBrand] = useState<string>('Apple');
  const [color, setColor] = useState<string>('Desert Titanium');
  const [ram, setRam] = useState<string>('8GB');
  const [rom, setRom] = useState<string>('256GB');

  // Quantity & Pricing Financials
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [fullPrice, setFullPrice] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod>('kpay');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');

  // Dates & Notes
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expectedArrivalDate, setExpectedArrivalDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState<string>('');
  
  // Voucher view after creation
  const [savedOrderForVoucher, setSavedOrderForVoucher] = useState<PreOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-fill if editing existing
  useEffect(() => {
    setFormError(null);
    if (existingPreOrder) {
      const q = existingPreOrder.quantity && existingPreOrder.quantity > 0 ? existingPreOrder.quantity : 1;
      const fp = existingPreOrder.fullPrice || 0;
      const up = existingPreOrder.unitPrice || (q > 0 ? Math.round(fp / q) : fp);
      
      setCustomerName(existingPreOrder.customerName || '');
      setCustomerPhone(existingPreOrder.customerPhone || '');
      setCustomerAddress(existingPreOrder.customerAddress || '');
      setSelectedCustomerId(existingPreOrder.customerId || '');
      setPhoneModel(existingPreOrder.phoneModel || '');
      setBrand(existingPreOrder.brand || 'Apple');
      setColor(existingPreOrder.color || '');
      setRam(existingPreOrder.ram || '8GB');
      setRom(existingPreOrder.rom || '256GB');
      setQuantity(q);
      setUnitPrice(up);
      setFullPrice(fp);
      setDepositAmount(existingPreOrder.depositAmount || 0);
      setDepositPaymentMethod(existingPreOrder.depositPaymentMethod || 'cash');
      setTransactionRef(existingPreOrder.depositPaymentDetails?.transactionRef || '');
      setAccountName(existingPreOrder.depositPaymentDetails?.accountName || '');
      setOrderDate(existingPreOrder.orderDate || new Date().toISOString().split('T')[0]);
      setExpectedArrivalDate(existingPreOrder.expectedArrivalDate || '');
      setNotes(existingPreOrder.notes || '');
    } else {
      // Defaults
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setSelectedCustomerId('');
      setPhoneModel('');
      setBrand('Apple');
      setColor('Desert Titanium');
      setRam('8GB');
      setRom('256GB');
      setQuantity(1);
      setUnitPrice(0);
      setFullPrice(0);
      setDepositAmount(0);
      setDepositPaymentMethod('kpay');
      setTransactionRef('');
      setAccountName('');
      setOrderDate(new Date().toISOString().split('T')[0]);
      const d = new Date();
      d.setDate(d.getDate() + 5);
      setExpectedArrivalDate(d.toISOString().split('T')[0]);
      setNotes('');
      setSavedOrderForVoucher(null);
    }
  }, [existingPreOrder, isOpen]);

  // Customer search suggestions
  const handleCustomerNameChange = (val: string) => {
    setCustomerName(val);
    if (!val.trim()) {
      setCustomerSuggestions([]);
      setIsCustomerDropdownOpen(false);
      return;
    }
    const q = val.toLowerCase().trim();
    const matches = customers.filter(c => 
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    ).slice(0, 5);
    setCustomerSuggestions(matches);
    setIsCustomerDropdownOpen(matches.length > 0);
  };

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    if (c.address) setCustomerAddress(c.address);
    setIsCustomerDropdownOpen(false);
  };

  // Quick lookup from existing products to populate specs/price
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [productSuggestions, setProductSuggestions] = useState<Product[]>([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState<boolean>(false);
  const productSearchContainerRef = useRef<HTMLDivElement>(null);

  const handleProductSearchChange = (query: string) => {
    setProductSearchQuery(query);
    if (!query.trim()) {
      setProductSuggestions([]);
      setIsProductDropdownOpen(false);
      return;
    }
    const q = query.toLowerCase().trim();
    const matches = products.filter(p => {
      const isPhone = isPhoneCategory(p.category) || Boolean(p.rom && p.rom !== '-') || Boolean(p.imeiPairs?.length) || Boolean(p.imeiList?.length);
      const nameMatch = p.name.toLowerCase().includes(q);
      const modelMatch = p.model ? p.model.toLowerCase().includes(q) : false;
      const brandMatch = p.brand ? p.brand.toLowerCase().includes(q) : false;
      const colorMatch = p.color ? p.color.toLowerCase().includes(q) : false;
      const romMatch = p.rom ? p.rom.toLowerCase().includes(q) : false;
      return (isPhone || !p.category) && (nameMatch || modelMatch || brandMatch || colorMatch || romMatch);
    }).slice(0, 8);
    setProductSuggestions(matches);
    setIsProductDropdownOpen(true);
  };

  const handleSelectProductPreset = (prod: Product) => {
    setPhoneModel(prod.name);
    if (prod.brand) setBrand(prod.brand);
    if (prod.color) setColor(prod.color);
    if (prod.ram) setRam(prod.ram);
    if (prod.rom) setRom(prod.rom);
    if (prod.sellingPrice > 0) {
      setUnitPrice(prod.sellingPrice);
      const total = prod.sellingPrice * (quantity || 1);
      setFullPrice(total);
      if (depositAmount === 0) {
        // Suggest ~20-30% deposit
        setDepositAmount(Math.round((total * 0.25) / 10000) * 10000);
      }
    }
    setProductSearchQuery('');
    setProductSuggestions([]);
    setIsProductDropdownOpen(false);
  };

  // Close product search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productSearchContainerRef.current && !productSearchContainerRef.current.contains(e.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quantity updates with automatic recalculation
  const handleQuantityChange = (newQty: number) => {
    const validQty = Math.max(1, newQty);
    setQuantity(validQty);
    if (unitPrice > 0) {
      setFullPrice(unitPrice * validQty);
    } else if (fullPrice > 0) {
      setUnitPrice(Math.round(fullPrice / validQty));
    }
  };

  // Unit Price updates
  const handleUnitPriceChange = (val: number) => {
    setUnitPrice(val);
    setFullPrice(val * (quantity || 1));
  };

  // Manual total Full Price updates
  const handleFullPriceChange = (val: number) => {
    setFullPrice(val);
    if (quantity > 0) {
      setUnitPrice(Math.round(val / quantity));
    }
  };

  const remainingBalance = Math.max(0, fullPrice - depositAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!customerName.trim()) {
      setFormError('Please enter Customer Name.');
      return;
    }
    if (!customerPhone.trim()) {
      setFormError('Please enter Customer Phone Number.');
      return;
    }
    if (!phoneModel.trim()) {
      setFormError('Please enter Phone Model (e.g. iPhone 16 Pro Max).');
      return;
    }
    if (fullPrice <= 0) {
      setFormError('Please specify the agreed Full Price.');
      return;
    }

    const preOrderNumber = existingPreOrder?.preOrderNumber || `PRE-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const currentQty = Math.max(1, Number(quantity) || 1);
    const calculatedUnitPrice = unitPrice > 0 ? Number(unitPrice) : Math.round(Number(fullPrice) / currentQty);

    const trimmedCustomerName = customerName.trim();
    const trimmedCustomerPhone = customerPhone.trim();
    const cleanPhone = trimmedCustomerPhone.replace(/\D/g, '');
    const trimmedAddress = customerAddress.trim();

    // Auto-resolve or create Customer record for Customers & Suppliers CRM session
    let resolvedCustomerId = selectedCustomerId;
    let customerToSave: Customer | null = null;

    const existingCust = customers.find(c => 
      (selectedCustomerId && c.id === selectedCustomerId) ||
      (cleanPhone && c.phone.replace(/\D/g, '') === cleanPhone) ||
      c.name.toLowerCase().trim() === trimmedCustomerName.toLowerCase()
    );

    if (existingCust) {
      resolvedCustomerId = existingCust.id;
      const noteTag = `Pre-Order #${preOrderNumber}`;
      const existingNotes = existingCust.notes || '';
      const updatedNotes = existingNotes.includes(noteTag) 
        ? existingNotes 
        : existingNotes 
          ? `${existingNotes} | ${noteTag} (${phoneModel.trim()})`
          : `${noteTag} (${phoneModel.trim()})`;

      const updatedCust: Customer = {
        ...existingCust,
        name: trimmedCustomerName || existingCust.name,
        phone: trimmedCustomerPhone || existingCust.phone,
        address: trimmedAddress || existingCust.address,
        notes: updatedNotes,
      };
      customerToSave = updatedCust;
    } else {
      resolvedCustomerId = selectedCustomerId || `cust-${Date.now()}`;
      customerToSave = {
        id: resolvedCustomerId,
        name: trimmedCustomerName,
        phone: trimmedCustomerPhone,
        address: trimmedAddress || undefined,
        loyaltyPoints: 10, // Initial welcome bonus
        totalSpent: 0,
        totalVisits: 1,
        createdAt: new Date().toISOString().split('T')[0],
        notes: `Registered via Pre-Order #${preOrderNumber} (${phoneModel.trim()})`,
      };
    }

    if (customerToSave) {
      StorageService.saveCustomer(customerToSave);
      onSaveCustomer?.(customerToSave);
    }

    const newOrder: PreOrder = {
      id: existingPreOrder?.id || `pre-${Date.now()}`,
      preOrderNumber,
      customerName: trimmedCustomerName,
      customerPhone: trimmedCustomerPhone,
      customerAddress: trimmedAddress || undefined,
      customerId: resolvedCustomerId || undefined,
      phoneModel: phoneModel.trim(),
      brand: brand.trim() || undefined,
      color: color.trim() || 'Standard',
      ram: ram.trim() || '8GB',
      rom: rom.trim() || '256GB',
      quantity: currentQty,
      unitPrice: calculatedUnitPrice,
      fullPrice: Number(fullPrice),
      depositAmount: Number(depositAmount),
      remainingBalance,
      depositPaymentMethod,
      depositPaymentDetails: transactionRef || accountName ? {
        transactionRef: transactionRef.trim() || undefined,
        accountName: accountName.trim() || undefined
      } : undefined,
      orderDate,
      expectedArrivalDate: expectedArrivalDate || undefined,
      status: existingPreOrder?.status || 'Pending',
      notes: notes.trim() || undefined,
      createdBy: settings.currentStaffName || 'Cashier',
      createdAt: existingPreOrder?.createdAt || new Date().toISOString(),
    };

    onSavePreOrder(newOrder);
    setSavedOrderForVoucher(newOrder);
  };

  const handlePrintVoucher = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div id="preorder-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 my-auto animate-modal-content">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/60 border border-indigo-400/40 flex items-center justify-center text-indigo-200 shadow-md">
              <CalendarClock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {savedOrderForVoucher ? 'Pre-Order Booking Voucher' : existingPreOrder ? 'Edit Pre-Order' : 'Capture New Pre-Order & Booking'}
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Step 1: Deposit Capture
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                {savedOrderForVoucher ? `Voucher Ref: ${savedOrderForVoucher.preOrderNumber}` : 'Record customer device specifications, quantities, pre-paid deposit, and expected delivery'}
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-preorder-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If Voucher View is active after saving */}
        {savedOrderForVoucher ? (
          <div className="p-6 space-y-6">
            {/* Voucher Card for Print / Screen */}
            <div id="printable-preorder-voucher" className="p-6 bg-slate-50 border-2 border-dashed border-indigo-300 rounded-2xl space-y-4">
              
              {/* Shop Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">{settings.shopName}</h2>
                  <p className="text-xs text-slate-500">{settings.tagline}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {settings.address}, {settings.cityCountry} | Hotline: {settings.phone}
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-block px-3 py-1 bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-mono font-bold">
                    {savedOrderForVoucher.preOrderNumber}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Date: {savedOrderForVoucher.orderDate}</p>
                </div>
              </div>

              {/* Customer & Device Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Customer Details</span>
                  <div className="font-bold text-slate-900 text-sm">{savedOrderForVoucher.customerName}</div>
                  <div className="text-indigo-600 font-mono font-semibold">{savedOrderForVoucher.customerPhone}</div>
                  {savedOrderForVoucher.customerAddress && (
                    <div className="text-slate-500 text-[11px]">{savedOrderForVoucher.customerAddress}</div>
                  )}
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Booked Device Specs</span>
                  <div className="font-bold text-slate-900 text-sm">{savedOrderForVoucher.phoneModel}</div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-700">
                    <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">{savedOrderForVoucher.brand}</span>
                    <span className="bg-amber-50 text-amber-900 font-semibold px-1.5 py-0.2 rounded border border-amber-200">{savedOrderForVoucher.color}</span>
                    <span className="bg-purple-50 text-purple-700 font-mono px-1.5 py-0.2 rounded border border-purple-200">{savedOrderForVoucher.ram} / {savedOrderForVoucher.rom}</span>
                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.2 rounded border border-emerald-200">
                      Qty: {savedOrderForVoucher.quantity || 1} Unit{(savedOrderForVoucher.quantity || 1) > 1 ? 's' : ''}
                    </span>
                  </div>
                  {savedOrderForVoucher.expectedArrivalDate && (
                    <div className="text-emerald-700 font-semibold text-[11px] mt-1">
                      Expected Arrival: {savedOrderForVoucher.expectedArrivalDate}
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Box */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                {(savedOrderForVoucher.quantity || 1) > 1 && (
                  <div className="flex justify-between text-slate-500 text-[11px] pb-1 border-b border-slate-100">
                    <span>Unit Price Breakdown:</span>
                    <span className="font-mono font-semibold">
                      {savedOrderForVoucher.quantity || 1} units × {formatCurrency(savedOrderForVoucher.unitPrice || Math.round(savedOrderForVoucher.fullPrice / (savedOrderForVoucher.quantity || 1)), settings.currencySymbol)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Agreed Total Price ({savedOrderForVoucher.quantity || 1} unit{(savedOrderForVoucher.quantity || 1) > 1 ? 's' : ''}):</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {formatCurrency(savedOrderForVoucher.fullPrice, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Pre-paid Deposit Paid ({(savedOrderForVoucher.depositPaymentMethod || 'cash').toUpperCase()}):</span>
                  <span className="font-bold font-mono">
                    -{formatCurrency(savedOrderForVoucher.depositAmount, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between font-black text-indigo-900 text-sm pt-2 border-t border-slate-200">
                  <span>Remaining Balance Due at Counter (POS):</span>
                  <span className="font-mono text-indigo-600">
                    {formatCurrency(savedOrderForVoucher.remainingBalance, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              {/* Terms & Receipt Footer Note */}
              <div className="text-[10px] text-slate-500 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p>
                  Please present this Pre-Order voucher or show your registered phone number at the counter when picking up your phone. The remaining balance will be calculated and settled automatically during POS fulfillment.
                </p>
              </div>

              <div className="flex justify-between items-end pt-2 text-[10px] text-slate-400">
                <div>Cashier: <span className="font-bold text-slate-700">{savedOrderForVoucher.createdBy}</span></div>
                <div>Status: <span className="font-bold text-amber-600 uppercase">PENDING FULFILLMENT</span></div>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSavedOrderForVoucher(null);
                  onClose();
                }}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close & Return to POS
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintVoucher}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Pre-Order Voucher</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Pre-Order Input Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            
            {/* Error Banner */}
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Section 1: Customer Information */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" />
                  1. Customer Details
                </label>
                {selectedCustomerId ? (
                  <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <Check className="w-3 h-3" /> Linked to CRM Profile
                  </span>
                ) : (
                  <span className="text-[10px] text-indigo-600 font-medium flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                    <Users className="w-3 h-3" /> Auto-syncs to Customers Directory
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Customer Name with Autocomplete */}
                <div className="relative">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ko Zaw Zaw"
                      value={customerName}
                      onChange={(e) => handleCustomerNameChange(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>

                  {/* Dropdown Suggestions */}
                  {isCustomerDropdownOpen && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden divide-y divide-slate-100">
                      {customerSuggestions.map(c => (
                        <div
                          key={c.id}
                          onClick={() => handleSelectCustomer(c)}
                          className="px-3 py-2 text-xs hover:bg-indigo-50 cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{c.name}</span>
                            <span className="text-slate-500 text-[10px] ml-2 font-mono">{c.phone}</span>
                          </div>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">Select</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="09-xxxxxxxxx"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Customer Address / Township (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. Kamayut, Yangon"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                    />
                    <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Device Specifications */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  2. Device & Hardware Specifications
                </label>
                
                {/* Searchable quick preset lookup from inventory */}
                {products.length > 0 && (
                  <div ref={productSearchContainerRef} className="relative flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Search Existing:</span>
                    <div className="relative w-48 sm:w-60">
                      <input
                        type="text"
                        placeholder="Type phone name, model..."
                        value={productSearchQuery}
                        onChange={(e) => handleProductSearchChange(e.target.value)}
                        onFocus={() => {
                          if (productSearchQuery.trim()) {
                            setIsProductDropdownOpen(true);
                          } else {
                            // Show recent phones on empty focus
                            const recents = products
                              .filter(p => isPhoneCategory(p.category) || Boolean(p.rom && p.rom !== '-') || Boolean(p.imeiPairs?.length) || Boolean(p.imeiList?.length))
                              .slice(0, 6);
                            setProductSuggestions(recents);
                            setIsProductDropdownOpen(true);
                          }
                        }}
                        className="w-full pl-7 pr-6 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-indigo-500 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 transition-all placeholder:text-slate-400"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                      {productSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearchQuery('');
                            setProductSuggestions([]);
                            setIsProductDropdownOpen(false);
                          }}
                          className="absolute right-1.5 top-1.5 p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Auto-suggest Dropdown */}
                    {isProductDropdownOpen && productSuggestions.length > 0 && (
                      <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto animate-modal-content">
                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                          <span>Matching Phones in Stock / Catalog</span>
                          <span className="text-indigo-600 font-mono">{productSuggestions.length} found</span>
                        </div>
                        {productSuggestions.map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => handleSelectProductPreset(prod)}
                            className="px-3 py-2 text-xs hover:bg-indigo-50/80 cursor-pointer flex justify-between items-center transition-colors group"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="font-bold text-slate-900 truncate group-hover:text-indigo-600 flex items-center gap-1.5">
                                <span className="truncate">{prod.name}</span>
                                {prod.color && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0 inline-block"
                                    style={{ backgroundColor: getColorDotHex(prod.color) }}
                                    title={prod.color}
                                  />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                                {prod.brand && <span className="font-semibold text-slate-700">{prod.brand}</span>}
                                {prod.rom && <span className="font-mono text-purple-700 bg-purple-50 px-1 rounded">{prod.rom}</span>}
                                {prod.ram && <span className="font-mono text-indigo-700 bg-indigo-50 px-1 rounded">{prod.ram}</span>}
                                {prod.stock !== undefined && (
                                  <span className={`font-semibold ${prod.stock > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {prod.stock > 0 ? `${prod.stock} in stock` : '0 in stock'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-indigo-700 text-xs">
                                {formatCurrency(prod.sellingPrice, settings.currencySymbol)}
                              </div>
                              <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded inline-block mt-0.5">
                                Fill Specs
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Phone Model */}
                <div className="sm:col-span-8">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Phone Model Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. iPhone 16 Pro Max / Samsung Galaxy S25 Ultra"
                    value={phoneModel}
                    onChange={(e) => setPhoneModel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                {/* Brand */}
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Brand</label>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    {COMMON_BRANDS.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {/* Color */}
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Color / Finish</span>
                    {color && (
                      <span
                        className="w-3 h-3 rounded-full border border-black/20"
                        style={{ backgroundColor: getColorDotHex(color) }}
                      />
                    )}
                  </label>
                  <input
                    type="text"
                    list="color-presets-list"
                    placeholder="e.g. Desert Titanium"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                  />
                  <datalist id="color-presets-list">
                    {COMMON_COLOR_PRESETS.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* RAM */}
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">RAM</label>
                  <select
                    value={ram}
                    onChange={(e) => setRam(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-indigo-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    {COMMON_RAM_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* ROM / Storage */}
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">ROM (Storage)</label>
                  <select
                    value={rom}
                    onChange={(e) => setRom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-purple-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    {COMMON_ROM_OPTIONS.map(rm => (
                      <option key={rm} value={rm}>{rm}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Quantity, Financials & Pre-Paid Deposit */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  3. Quantity, Financials & Pre-Paid Deposit
                </label>
                {quantity > 1 && (
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                    Multi-Unit Pre-Order ({quantity} Units)
                  </span>
                )}
              </div>

              {/* Quantity Stepper & Unit Price Row */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                {/* Quantity Input with Stepper */}
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                      Pre-Order Quantity (Units) <span className="text-rose-500">*</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">Min: 1</span>
                  </label>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity - 1)}
                      disabled={quantity <= 1}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 font-bold shadow-2xs cursor-pointer transition-colors"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        required
                        value={quantity}
                        onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 text-center focus:outline-hidden focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-300 hover:bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shadow-2xs cursor-pointer transition-colors"
                      title="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-medium mr-1">Quick:</span>
                    {[1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleQuantityChange(n)}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                          quantity === n 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Unit Price Input */}
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Agreed Unit Price (Per Device)</span>
                    {quantity > 1 && (
                      <span className="text-[10px] text-indigo-600 font-semibold font-mono">
                        {quantity} × {formatCurrency(unitPrice, settings.currencySymbol)}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="0"
                      value={unitPrice === 0 ? '' : unitPrice}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => handleUnitPriceChange(parseFloat(e.target.value) || 0)}
                      className="w-full pl-3 pr-10 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 text-right"
                    />
                    <span className="text-[11px] font-bold text-slate-400 absolute right-2.5 top-1.5">
                      {settings.currencySymbol}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Price per single unit. Total price updates automatically based on quantity.
                  </p>
                </div>
              </div>

              {/* Total Financial Breakdown Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Total Full Price */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Total Agreed Price <span className="text-rose-500">*</span></span>
                    {quantity > 1 && (
                      <span className="text-[10px] font-bold text-slate-400 font-mono">({quantity} Units)</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      required
                      min={0}
                      step="any"
                      placeholder="0"
                      value={fullPrice === 0 ? '' : fullPrice}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => handleFullPriceChange(parseFloat(e.target.value) || 0)}
                      className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 text-right"
                    />
                    <span className="text-[11px] font-bold text-slate-400 absolute right-2.5 top-2">
                      {settings.currencySymbol}
                    </span>
                  </div>
                </div>

                {/* Pre-Paid Amount (Deposit) */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Pre-Paid Deposit <span className="text-rose-500">*</span></span>
                    {fullPrice > 0 && depositAmount > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600">
                        {Math.round((depositAmount / fullPrice) * 100)}%
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="0"
                      value={depositAmount === 0 ? '' : depositAmount}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-3 pr-10 py-2 bg-emerald-50/50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-200 text-right"
                    />
                    <span className="text-[11px] font-bold text-emerald-600 absolute right-2.5 top-2">
                      {settings.currencySymbol}
                    </span>
                  </div>
                </div>

                {/* Calculated Remaining Balance */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Remaining Balance Due
                  </label>
                  <div className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-black text-indigo-900 text-right font-mono flex items-center justify-between">
                    <span className="text-[10px] text-indigo-600 font-bold uppercase">To Pay at POS</span>
                    <span>{formatCurrency(remainingBalance, settings.currencySymbol)}</span>
                  </div>
                </div>
              </div>

              {/* Deposit Payment Channel */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Deposit Payment Channel
                  </label>
                  <select
                    value={depositPaymentMethod}
                    onChange={(e) => setDepositPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    <option value="cash">Cash (MMK Drawer)</option>
                    <option value="kpay">KBZPay (KPay)</option>
                    <option value="wave">WavePay</option>
                    <option value="kbz">KBZ Bank</option>
                    <option value="aya">AYA Bank / Pay</option>
                    <option value="cb">CB Bank / Pay</option>
                    <option value="yoma">Yoma Bank</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Transaction Ref / Slip No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KP-8921820"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Payer Account Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Zaw Zaw Phone"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Schedule Dates & Special Notes */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                4. Schedule & Notes
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Booking Date
                  </label>
                  <input
                    type="date"
                    required
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Expected Arrival / Delivery Date
                  </label>
                  <input
                    type="date"
                    value={expectedArrivalDate}
                    onChange={(e) => setExpectedArrivalDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Special Customer Notes & Color / Storage Preferences (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Customer requested original box seal intact, requires tempered glass freebie..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                id="save-preorder-submit-btn"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{existingPreOrder ? 'Update Pre-Order Booking' : 'Save Pre-Order & Issue Voucher'}</span>
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
