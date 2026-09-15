import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  RotateCcw,
  X,
  Search,
  Barcode,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  Phone,
  Receipt,
  Calendar,
  Truck,
  Repeat,
  Camera,
  Upload,
  Printer,
  Info,
  Layers,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Package
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Product, Customer, Sale, DamageLog, ShopSettings, StaffUser, DamageReason, Supplier } from '../../types';
import { StorageService } from '../../utils/storage';
import { processCustomerDefectiveReturn } from '../../utils/damageManager';
import { formatCurrency, formatImei } from '../../utils/formatters';
import { compressImageToBase64 } from '../../utils/imageCompression';

interface CustomerErrorReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: ShopSettings;
  currentStaffUser?: StaffUser;
  onSuccess: (newLog: DamageLog, updatedProduct: Product) => void;
}

export interface PurchasedItemRecord {
  saleId: string;
  invoiceNumber: string;
  saleDate: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  productId: string;
  productName: string;
  brand: string;
  category: string;
  subCategory?: string;
  color?: string;
  ram?: string;
  rom?: string;
  serialOrImei?: string;
  imei2?: string;
  unitPrice: number;
  costPrice: number;
  finalPrice: number;
  warrantyPeriod: string;
  currentProduct?: Product;
  availableStock: number;
}

export const CustomerErrorReturnModal: React.FC<CustomerErrorReturnModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  currentStaffUser,
  onSuccess,
}) => {
  // Navigation between Window 1 (Customer Selection) and Window 2 (Purchased Items & Resolution)
  const [currentStep, setCurrentStep] = useState<'select_customer' | 'select_item_and_resolve'>('select_customer');

  // Step 1: Customer Selection State
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomerIdDropdown, setSelectedCustomerIdDropdown] = useState<string>('');

  // Step 2: Purchased Items & Search Box
  // Search box: "Scan Barcode / Serial Number / IMEI or Search Product"
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<PurchasedItemRecord | null>(null);

  // Defect details
  const [defectReason, setDefectReason] = useState<DamageReason>('Customer return');
  const [defectNotes, setDefectNotes] = useState<string>('');
  const [photoProof, setPhotoProof] = useState<string>('');
  const [reporterName, setReporterName] = useState<string>(currentStaffUser?.name || 'Staff Member');

  // Resolution 2 Options:
  // Option 1: 'replace_from_stock'
  // Option 2: 'return_to_vendor'
  const [resolutionOption, setResolutionOption] = useState<'replace_from_stock' | 'return_to_vendor'>('replace_from_stock');
  const [replacementImei, setReplacementImei] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>('');

  // Scanning with camera
  const [isCameraScanning, setIsCameraScanning] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  // Submission & Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<{
    log: DamageLog;
    updatedProduct: Product;
    customer: Customer | { name: string; phone: string; id?: string };
    item: PurchasedItemRecord;
    actionType: 'replace_from_stock' | 'return_to_vendor';
    replacementImei?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load registered customers and extract any un-registered customers from sales
  const allCustomers: Customer[] = useMemo(() => {
    const registered = StorageService.getCustomers();
    const sales = StorageService.getSales();
    
    const map = new Map<string, Customer>();
    for (const c of registered) {
      map.set(c.id, c);
    }

    // Add customers from sales that may not be in registered list
    for (const s of sales) {
      if (s.customerName && s.customerName !== 'Walk-in Customer') {
        const id = s.customerId || `cust-${s.customerPhone || s.customerName.replace(/\s+/g, '-').toLowerCase()}`;
        if (!map.has(id)) {
          map.set(id, {
            id,
            name: s.customerName,
            phone: s.customerPhone || 'N/A',
            address: s.customerAddress || '',
            totalSpent: s.grandTotal || 0,
            totalVisits: 1,
            loyaltyPoints: 0,
            createdAt: s.date || new Date().toISOString(),
          });
        }
      }
    }

    return Array.from(map.values());
  }, [isOpen]);

  // Suppliers list for Option 2 (Vendor RMA)
  const suppliers: Supplier[] = useMemo(() => StorageService.getSuppliers(), []);

  // Filtered customer list for Window 1
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.nrcNumber && c.nrcNumber.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  }, [allCustomers, customerSearchQuery]);

  // Load all items bought by the selected customer
  const customerPurchasedItems: PurchasedItemRecord[] = useMemo(() => {
    if (!selectedCustomer) return [];
    const sales = StorageService.getSales();
    const results: PurchasedItemRecord[] = [];

    // Match sales by customerId, phone, or name
    const matchingSales = sales.filter(s =>
      (s.customerId && s.customerId === selectedCustomer.id) ||
      (s.customerPhone && selectedCustomer.phone && s.customerPhone.replace(/[^0-9]/g, '') === selectedCustomer.phone.replace(/[^0-9]/g, '') && s.customerPhone !== 'N/A') ||
      (s.customerName && selectedCustomer.name && s.customerName.toLowerCase() === selectedCustomer.name.toLowerCase())
    );

    // Map sales items to records
    for (const s of matchingSales) {
      if (!s.items) continue;
      for (const item of s.items) {
        // Find matching live product in store inventory
        const liveProd = products.find(p => p.id === item.productId || p.name === item.name);
        const availStock = liveProd ? Math.max(0, liveProd.stock) : 0;

        results.push({
          saleId: s.id,
          invoiceNumber: s.invoiceNumber,
          saleDate: s.date,
          customerId: s.customerId || selectedCustomer.id,
          customerName: s.customerName,
          customerPhone: s.customerPhone,
          productId: item.productId,
          productName: item.name,
          brand: item.brand,
          category: item.category,
          subCategory: item.subCategory,
          color: item.color,
          ram: item.ram,
          rom: item.rom,
          serialOrImei: item.imei,
          imei2: item.imei2,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice || (liveProd ? liveProd.costPrice : 0),
          finalPrice: item.finalPrice,
          warrantyPeriod: item.warrantyPeriod || '1 Year Store Warranty',
          currentProduct: liveProd,
          availableStock: availStock,
        });
      }
    }

    return results;
  }, [selectedCustomer, products]);

  // Filter purchased items based on "Scan Barcode / Serial Number / IMEI or Search Product"
  const filteredPurchasedItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return customerPurchasedItems;

    return customerPurchasedItems.filter(item => {
      const imei1Match = item.serialOrImei && item.serialOrImei.toLowerCase().includes(q);
      const imei2Match = item.imei2 && item.imei2.toLowerCase().includes(q);
      const nameMatch = item.productName && item.productName.toLowerCase().includes(q);
      const brandMatch = item.brand && item.brand.toLowerCase().includes(q);
      const invMatch = item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(q);
      const barcodeMatch = item.currentProduct?.barcode && item.currentProduct.barcode.toLowerCase().includes(q);
      const skuMatch = item.currentProduct?.sku && item.currentProduct.sku.toLowerCase().includes(q);

      return Boolean(imei1Match || imei2Match || nameMatch || brandMatch || invMatch || barcodeMatch || skuMatch);
    });
  }, [customerPurchasedItems, itemSearchQuery]);

  // Available replacement IMEIs for Option 1
  const availableReplacementImeis = useMemo(() => {
    if (!selectedItem?.currentProduct?.imeiPairs) return [];
    return selectedItem.currentProduct.imeiPairs
      .filter(p => p.status === 'Available' || !p.status || p.status === 'In Stock')
      .map(p => p.imei1);
  }, [selectedItem]);

  // Reset modal state on open/close
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('select_customer');
      setCustomerSearchQuery('');
      setSelectedCustomer(null);
      setSelectedCustomerIdDropdown('');
      setItemSearchQuery('');
      setSelectedItem(null);
      setDefectReason('Customer return');
      setDefectNotes('');
      setPhotoProof('');
      setReplacementImei('');
      setVendorName('');
      setErrorMessage(null);
      setCompletedResult(null);
      setResolutionOption('replace_from_stock');
    }
  }, [isOpen]);

  // Whenever an item is selected, initialize resolution options based on stock
  useEffect(() => {
    if (selectedItem) {
      const stock = selectedItem.availableStock;
      if (stock > 0) {
        setResolutionOption('replace_from_stock');
        // Pick first available replacement IMEI if serialized
        if (selectedItem.currentProduct?.imeiPairs) {
          const avail = selectedItem.currentProduct.imeiPairs.find(
            p => p.status === 'Available' || !p.status || p.status === 'In Stock'
          );
          if (avail) {
            setReplacementImei(avail.imei1);
          } else {
            setReplacementImei('');
          }
        } else {
          setReplacementImei('');
        }
      } else {
        // No stock left: auto-route to Option 2: Return to Vendor
        setResolutionOption('return_to_vendor');
        setReplacementImei('');
      }

      // Pre-fill vendor name if available from product or suppliers
      if (selectedItem.currentProduct?.supplierName) {
        setVendorName(selectedItem.currentProduct.supplierName);
      } else if (suppliers.length > 0) {
        setVendorName(suppliers[0].name);
      }
    }
  }, [selectedItem, suppliers]);

  // Camera Barcode/IMEI Scanner controls
  const startCameraScanner = async () => {
    setIsCameraScanning(true);
    try {
      const codeReader = new BrowserMultiFormatReader();
      codeReaderRef.current = codeReader;

      const controls = await codeReader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, err) => {
          if (result) {
            const scannedText = result.getText().trim();
            setItemSearchQuery(scannedText);
            stopCameraScanner();

            // Check if there is an exact match in customer's items
            const match = customerPurchasedItems.find(it =>
              (it.serialOrImei && it.serialOrImei === scannedText) ||
              (it.imei2 && it.imei2 === scannedText) ||
              (it.currentProduct?.barcode && it.currentProduct.barcode === scannedText)
            );
            if (match) {
              setSelectedItem(match);
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      console.warn('Unable to access camera scanner:', err);
      setIsCameraScanning(false);
    }
  };

  const stopCameraScanner = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    codeReaderRef.current = null;
    setIsCameraScanning(false);
  };

  // Handle Photo Attachment
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('Photo exceeds 8MB limit. Please choose a smaller image.');
      return;
    }

    try {
      const compressedData = await compressImageToBase64(file, { maxDimension: 1200, quality: 0.8 });
      setPhotoProof(compressedData);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to compress photo.');
    }
  };

  // Step 1: Select customer and advance to Step 2 window
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedCustomerIdDropdown(customer.id);
    setErrorMessage(null);
    setCurrentStep('select_item_and_resolve');
  };

  // Process return submission
  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedItem) {
      setErrorMessage('Please select a purchased item to process.');
      return;
    }

    if (!defectNotes.trim()) {
      setErrorMessage('Please provide a brief description of the customer reported defect.');
      return;
    }

    // Option 1 validation: requires stock
    if (resolutionOption === 'replace_from_stock' && selectedItem.availableStock <= 0) {
      setErrorMessage('Cannot replace from stock: 0 sellable units available. Please choose Option 2: Return to Vendor.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = processCustomerDefectiveReturn({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        originalInvoiceNumber: selectedItem.invoiceNumber,
        productId: selectedItem.productId,
        productName: selectedItem.productName,
        defectiveSerialOrImei: selectedItem.serialOrImei,
        defectiveImei2: selectedItem.imei2,
        defectReason: defectReason,
        defectNotes: defectNotes.trim(),
        actionType: resolutionOption,
        replacementImei: resolutionOption === 'replace_from_stock' ? replacementImei : undefined,
        vendorName: resolutionOption === 'return_to_vendor' ? vendorName : undefined,
        processedBy: reporterName.trim() || 'Staff Member',
        photoProof: photoProof || undefined,
      });

      if (!result.success || !result.log || !result.updatedProduct) {
        setErrorMessage(result.error || 'Failed to process customer return.');
        setIsSubmitting(false);
        return;
      }

      // Success!
      setCompletedResult({
        log: result.log,
        updatedProduct: result.updatedProduct,
        customer: selectedCustomer,
        item: selectedItem,
        actionType: resolutionOption,
        replacementImei: replacementImei,
      });

      onSuccess(result.log, result.updatedProduct);
      setIsSubmitting(false);
    } catch (err: any) {
      console.error('Error processing customer error return:', err);
      setErrorMessage(err?.message || 'An unexpected error occurred while processing the customer return.');
      setIsSubmitting(false);
    }
  };

  // Trigger Print Slip
  const handlePrintSlip = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div 
        id="customer-error-return-modal-container"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in duration-200"
      >
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                  Damage & Quarantine Session
                </span>
                <span className="text-xs text-indigo-300 font-medium">Customer Defective Item Return</span>
              </div>
              <h2 className="text-lg font-black text-white">
                {currentStep === 'select_customer' 
                  ? 'Select Customer for Defective Return' 
                  : `Customer Return & Exchange Intake: ${selectedCustomer?.name || 'Customer'}`}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* Error Notice */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Error Processing Request</p>
                <p className="mt-0.5 text-rose-700">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* COMPLETED SUCCESS WINDOW                                                  */}
          {/* ========================================================================= */}
          {completedResult ? (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="max-w-md mx-auto">
                <h3 className="text-xl font-black text-slate-900">
                  Customer Defective Return Processed!
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  The defective unit has been isolated and assigned to Damage Quarantine Log #{' '}
                  <span className="font-bold text-amber-700">{completedResult.log.logNumber}</span>.
                </p>
              </div>

              {/* Action Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-lg mx-auto text-left space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-800">{completedResult.customer.name} ({completedResult.customer.phone})</span>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <span className="text-slate-500">Returned Item:</span>
                  <span className="font-bold text-slate-800">{completedResult.item.productName}</span>
                </div>

                {completedResult.item.serialOrImei && (
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                    <span className="text-slate-500">Defective SN / IMEI:</span>
                    <span className="font-mono font-bold text-rose-700">{formatImei(completedResult.item.serialOrImei)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                  <span className="text-slate-500">Proceed Action:</span>
                  <span className={`px-2 py-0.5 rounded-full font-black text-[11px] ${
                    completedResult.actionType === 'replace_from_stock' 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                  }`}>
                    {completedResult.actionType === 'replace_from_stock' 
                      ? 'Option 1: Replaced with Fresh Stock' 
                      : 'Option 2: Routed for Vendor RMA'}
                  </span>
                </div>

                {completedResult.replacementImei && (
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                    <span className="text-slate-500">Issued Replacement IMEI:</span>
                    <span className="font-mono font-bold text-emerald-700">{formatImei(completedResult.replacementImei)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">Quarantine Status:</span>
                  <span className="font-bold text-amber-700">{completedResult.log.status} (Phase 1 Isolated)</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Customer Return Slip</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <span>View in Quarantine Hub</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : currentStep === 'select_customer' ? (
            /* ========================================================================= */
            /* WINDOW 1: SEARCH AND DROPDOWN BOX OF CUSTOMER LISTS                       */
            /* ========================================================================= */
            <div className="space-y-5">
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 text-xs text-indigo-950 flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-indigo-900">Step 1: Choose the Customer Returning the Item</p>
                  <p className="text-indigo-800/80 mt-0.5">
                    Select a customer from the dropdown box or use the live search below. Once chosen, the next window will automatically display all products previously purchased by that customer.
                  </p>
                </div>
              </div>

              {/* Search and Dropdown Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Search Box */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Search Customer by Name, Phone, or NRC
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="Type customer name, phone number (e.g. 09...)..."
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                      autoFocus
                    />
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown Box of Customer Lists */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Or Select from Customer Dropdown List
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCustomerIdDropdown}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCustomerIdDropdown(val);
                        const match = allCustomers.find(c => c.id === val);
                        if (match) {
                          handleSelectCustomer(match);
                        }
                      }}
                      className="w-full px-3 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs appearance-none cursor-pointer"
                    >
                      <option value="">-- Choose Customer from Dropdown ({allCustomers.length} available) --</option>
                      {allCustomers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} • {c.phone} {c.totalVisits ? `(${c.totalVisits} orders)` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      ▼
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Cards Grid / List for Quick 1-Click Selection */}
              <div>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="font-bold text-slate-700">
                    Customer List ({filteredCustomers.length} matching)
                  </span>
                  <span className="text-slate-400">Click any customer to view purchased items</span>
                </div>

                {filteredCustomers.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-600">No matching customer found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name or phone number</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto pr-1">
                    {filteredCustomers.slice(0, 18).map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer shadow-2xs group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-xs">
                                {(c.name || 'Customer').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 text-xs group-hover:text-indigo-700 transition-colors line-clamp-1">
                                  {c.name}
                                </h4>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {c.phone}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                          </div>

                          {c.address && (
                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-2">
                              {c.address}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2.5 mt-2.5 border-t border-slate-100">
                          <span>{c.totalVisits || 1} past orders</span>
                          <span className="font-bold text-slate-700">
                            {formatCurrency(c.totalSpent, settings.currencySymbol)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* WINDOW 2: ITEMS BOUGHT BY CUSTOMER, SEARCH/SCAN BOX & 2 PROCEED OPTIONS    */
            /* ========================================================================= */
            <div className="space-y-6">
              {/* Customer Banner with Switch Button */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/30 text-indigo-200 border border-indigo-400/20 flex items-center justify-center font-black text-sm">
                    {(selectedCustomer?.name || 'Customer').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/40 text-indigo-200">
                        Selected Customer
                      </span>
                      <span className="text-xs text-slate-400">
                        {customerPurchasedItems.length} purchased items recorded
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-white mt-0.5">{selectedCustomer?.name}</h3>
                    <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3.5 h-3.5" />
                      {selectedCustomer?.phone}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep('select_customer');
                    setSelectedItem(null);
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <span>← Change Customer</span>
                </button>
              </div>

              {/* SEARCH BOX: "Scan Barcode / Serial Number / IMEI or Search Product" */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Scan Barcode / Serial Number / IMEI or Search Product
                  </label>
                  <span className="text-[11px] text-slate-500">Supports barcode scan or manual typing</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      placeholder="Scan Barcode / Serial Number / IMEI or Search Product..."
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs font-mono"
                      autoFocus
                    />
                    {itemSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setItemSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (isCameraScanning) {
                        stopCameraScanner();
                      } else {
                        startCameraScanner();
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs border transition-colors cursor-pointer ${
                      isCameraScanning
                        ? 'bg-rose-500 text-white border-rose-600 hover:bg-rose-600'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-2xs'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isCameraScanning ? 'Stop Camera' : 'Scan Box Barcode'}</span>
                  </button>
                </div>

                {/* Camera Live Preview if active */}
                {isCameraScanning && (
                  <div className="mt-3 p-3 bg-slate-900 rounded-2xl border border-slate-800 text-center">
                    <p className="text-xs text-indigo-300 font-bold mb-2">
                      Align Barcode or IMEI label within camera frame
                    </p>
                    <div className="relative w-full max-w-sm mx-auto h-48 rounded-xl overflow-hidden bg-black flex items-center justify-center">
                      <video ref={videoRef} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 border-2 border-dashed border-indigo-400 pointer-events-none m-6 rounded-lg animate-pulse" />
                    </div>
                  </div>
                )}
              </div>

              {/* LIST OF PURCHASED ITEMS BY THIS CUSTOMER */}
              <div>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="font-bold text-slate-800">
                    Related Items Bought by Customer ({filteredPurchasedItems.length} found)
                  </span>
                  <span className="text-slate-500">Select the defective item to proceed</span>
                </div>

                {filteredPurchasedItems.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <Package className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-600">No matching purchases found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {customerPurchasedItems.length === 0 
                        ? 'This customer has no past recorded purchases in the sales database.'
                        : 'No items match your barcode / IMEI / product search query.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {filteredPurchasedItems.map((item, idx) => {
                      const isSelected = selectedItem?.saleId === item.saleId && 
                        selectedItem?.productId === item.productId &&
                        selectedItem?.serialOrImei === item.serialOrImei;
                      const hasStock = item.availableStock > 0;

                      return (
                        <div
                          key={`${item.saleId}-${item.productId}-${idx}`}
                          onClick={() => setSelectedItem(item)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                            isSelected
                              ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/20'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl border shrink-0 ${
                              isSelected 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              <Smartphone className="w-4 h-4" />
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-900 text-xs">{item.productName}</h4>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                  {item.brand || 'Phone'}
                                </span>
                                {(item.ram || item.rom || item.color) && (
                                  <span className="text-[10px] text-slate-500">
                                    {[item.color, item.ram, item.rom].filter(Boolean).join(' • ')}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Receipt className="w-3 h-3 text-slate-400" />
                                  <strong className="text-slate-700">{item.invoiceNumber}</strong>
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  {new Date(item.saleDate).toLocaleDateString()}
                                </span>
                                {item.serialOrImei && (
                                  <span className="flex items-center gap-1 font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    IMEI: {formatImei(item.serialOrImei)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                            <span className="font-bold text-slate-800 text-xs">
                              {formatCurrency(item.finalPrice, settings.currencySymbol)}
                            </span>
                            <div className="mt-0.5">
                              {hasStock ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Stock: {item.availableStock} available
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                  Out of Stock (0 units)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* DEFECT DETAILS & THE 2 PROCEED OPTIONS (WHEN ITEM IS SELECTED) */}
              {selectedItem && (
                <form onSubmit={handleSubmitReturn} className="space-y-5 pt-4 border-t border-slate-200">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Step 2: Enter Defect Information & Select Resolution Option</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Defect Reason */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Defect Classification *
                        </label>
                        <select
                          value={defectReason}
                          onChange={(e) => setDefectReason(e.target.value as DamageReason)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          required
                        >
                          <option value="Customer return">Customer Return Defect</option>
                          <option value="Out-of-box failure">Out-of-box failure (DOA)</option>
                          <option value="Water damage">Water / Liquid Damage</option>
                          <option value="Dropped in store">Physical Impact / Broken Screen</option>
                        </select>
                      </div>

                      {/* Staff Handling Return */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Receiving Staff Member *
                        </label>
                        <input
                          type="text"
                          value={reporterName}
                          onChange={(e) => setReporterName(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          required
                        />
                      </div>
                    </div>

                    {/* Defect Notes */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Customer Complaint & Defect Symptoms *
                      </label>
                      <textarea
                        rows={2}
                        value={defectNotes}
                        onChange={(e) => setDefectNotes(e.target.value)}
                        placeholder="Detail what is wrong with the item (e.g. Device touch screen unresponsive, won't charge, bootloop, defective camera)..."
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        required
                      />
                    </div>

                    {/* Photo Proof Attachment (Optional) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Photo Proof / Defect Inspection Attachment (Optional)
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-slate-500" />
                          <span>Attach Photo Proof</span>
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        {photoProof ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Photo Attached
                            </span>
                            <button
                              type="button"
                              onClick={() => setPhotoProof('')}
                              className="text-xs text-rose-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">JPG or PNG proof for manager review</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ========================================================================= */}
                  {/* THE 2 PROCEED OPTIONS SPECIFIED BY USER:                                  */}
                  {/* No. 1 option: Replace, exchange with same item from stock if available.   */}
                  {/* No. 2 option: Return to the vendor if there are no stock left.            */}
                  {/* ========================================================================= */}
                  <div className="space-y-3">
                    <label className="block text-xs font-black text-slate-900 uppercase tracking-wide">
                      Select Proceed Resolution Option *
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {/* OPTION 1: REPLACE / EXCHANGE WITH SAME ITEM FROM STOCK */}
                      <div
                        onClick={() => {
                          if (selectedItem.availableStock > 0) {
                            setResolutionOption('replace_from_stock');
                          }
                        }}
                        className={`p-4 rounded-2xl border transition-all relative ${
                          selectedItem.availableStock <= 0
                            ? 'opacity-60 bg-slate-50 border-slate-200 cursor-not-allowed'
                            : resolutionOption === 'replace_from_stock'
                            ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs cursor-pointer'
                            : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/20 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="proceed_option"
                            checked={resolutionOption === 'replace_from_stock'}
                            disabled={selectedItem.availableStock <= 0}
                            onChange={() => setResolutionOption('replace_from_stock')}
                            className="mt-1 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                                <Repeat className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Option 1: Replace / Exchange from Stock</span>
                              </span>
                              {selectedItem.availableStock > 0 ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                  {selectedItem.availableStock} Available
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                                  0 in Stock
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-600 mt-1">
                              Exchange immediately with the same product from store stock. 1 unit will be issued to the customer, and the defective unit will be quarantined for manager RMA disposition.
                            </p>

                            {/* Serialized replacement selection */}
                            {resolutionOption === 'replace_from_stock' && availableReplacementImeis.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-emerald-200/60">
                                <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                                  Assign Replacement IMEI to Customer:
                                </label>
                                <select
                                  value={replacementImei}
                                  onChange={(e) => setReplacementImei(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  {availableReplacementImeis.map(im => (
                                    <option key={im} value={im}>
                                      {formatImei(im)} (Available)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* OPTION 2: RETURN TO THE VENDOR (RMA) */}
                      <div
                        onClick={() => setResolutionOption('return_to_vendor')}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                          resolutionOption === 'return_to_vendor'
                            ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="proceed_option"
                            checked={resolutionOption === 'return_to_vendor'}
                            onChange={() => setResolutionOption('return_to_vendor')}
                            className="mt-1 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-blue-600" />
                                <span>Option 2: Return to Vendor (RMA Intake)</span>
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                Vendor RMA Path
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-600 mt-1">
                              Accept customer defective unit and immediately log it into Damage Quarantine under "Pending RMA". Recommended when there is no stock left to exchange or customer seeks warranty return from the manufacturer/vendor.
                            </p>

                            {/* Vendor selection */}
                            {resolutionOption === 'return_to_vendor' && (
                              <div className="mt-3 pt-3 border-t border-blue-200/60">
                                <label className="block text-[11px] font-bold text-blue-950 mb-1">
                                  Target Supplier / RMA Vendor:
                                </label>
                                <input
                                  type="text"
                                  value={vendorName}
                                  onChange={(e) => setVendorName(e.target.value)}
                                  placeholder="Vendor name (e.g. Xiaomi Authorized Service / Apple Care)..."
                                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submission Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 text-slate-600 hover:text-slate-800 font-bold text-xs rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer ${
                        resolutionOption === 'replace_from_stock'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Processing Return...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {resolutionOption === 'replace_from_stock'
                              ? 'Confirm Exchange & Quarantine Defective Unit'
                              : 'Confirm Return to Vendor (RMA Intake)'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
