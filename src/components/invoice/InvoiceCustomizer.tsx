import React, { useState, useRef, useMemo } from 'react';
import { 
  FileText, 
  Settings, 
  Eye, 
  Printer, 
  Save, 
  Smartphone, 
  Phone, 
  QrCode, 
  ShieldCheck, 
  Check, 
  RefreshCw, 
  Store, 
  MapPin, 
  Barcode, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Sparkles, 
  FileSpreadsheet, 
  Layers,
  HelpCircle,
  Sliders,
  Plus,
  CreditCard
} from 'lucide-react';
import { InvoiceCustomization, InvoicePaymentQrItem, ShopSettings } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { compressImageToBase64, processLogoImage } from '../../utils/imageCompression';
import { LogoSizeAdjusterModal } from '../settings/LogoSizeAdjusterModal';
import { generateSampleQrSvg, getActivePaymentQrs } from '../../utils/qrUtils';

interface InvoiceCustomizerProps {
  settings: ShopSettings;
  onSaveSettings: (settings: ShopSettings) => void;
}

export const InvoiceCustomizer: React.FC<InvoiceCustomizerProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [customization, setCustomization] = useState<InvoiceCustomization>(() => ({
    headerTitle: settings.shopName || 'MYANMAR MOBILE STORE',
    subHeader: settings.tagline || 'Smartphones & Accessories Retail Center',
    addressLine1: settings.address || 'No. 124, Anawrahta Road',
    addressLine2: 'Kyauktada Township',
    city: settings.cityCountry || 'Yangon, Myanmar',
    phone1: settings.phone || '09-798123456',
    phone2: '09-974567890',
    viberNumber: settings.viberNumber || '09-798123456',
    telegramUsername: settings.telegramContact || '@shopmobile',
    facebookPage: 'facebook.com/mobilezone',
    showQrCode: true,
    qrAccountName: 'Store Account',
    qrAccountNumber: '09-798123456',
    qrCustomText: 'Scan to Pay via KPay / Wave',
    qrImageUrl: undefined,
    showImeiDetails: true,
    showWarrantyDetails: true,
    showCashierName: true,
    showCustomerInfo: true,
    showPointsEarned: true,
    showBarcode: true,
    showSignatures: true,
    paperWidth: '80mm',
    fontSize: 'standard',
    maxItemsPerA5Page: settings.invoiceCustomization?.maxItemsPerA5Page || 3,
    footerThankYouMessage: 'ဝယ်ယူအားပေးမှုကို ကျေးဇူးတင်ပါသည်။ ပစ္စည်းလဲလှယ်လိုပါက ဘောက်ချာယူဆောင်လာပါရန်။',
    warrantyPolicyText: 'အာမခံရယူရန် ဤဘောက်ချာပြသပေးပါရန်။ (Show this receipt for warranty claim)',
    ...(settings.invoiceCustomization || {}),
    qrType: settings.invoiceCustomization?.qrType || 'kpay',
    paymentQrs: (settings.invoiceCustomization?.paymentQrs && settings.invoiceCustomization.paymentQrs.length > 0)
      ? settings.invoiceCustomization.paymentQrs
      : getActivePaymentQrs(settings.invoiceCustomization || {}, settings.shopName, settings.phone),
    qrLayoutMode: settings.invoiceCustomization?.qrLayoutMode || 'minimalist',
    showQrAccountDetails: settings.invoiceCustomization?.showQrAccountDetails ?? false,
  }));

  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isDraggingQr, setIsDraggingQr] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isLogoAdjusterOpen, setIsLogoAdjusterOpen] = useState(false);
  const [activeUploadQrId, setActiveUploadQrId] = useState<string | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const multiQrFileInputRef = useRef<HTMLInputElement>(null);

  // Active payment QRs for preview and printing
  const activePaymentQrs = useMemo(() => {
    return getActivePaymentQrs(customization, settings.shopName, settings.phone);
  }, [customization, settings.shopName, settings.phone]);

  // Sample items for realistic preview and multi-sheet A5 voucher testing
  const [sampleItemCount, setSampleItemCount] = useState<number>(6);

  const sampleItemsList = [
    {
      name: 'Apple iPhone 15 Pro Max (256GB Natural Titanium)',
      imei: '35829 10482 91045',
      imei2: '35829 10482 91046',
      warranty: '1 Year Brand Official Warranty',
      qty: 1,
      price: 4250000,
    },
    {
      name: 'Anker 30W Nano Fast Charger Type-C',
      warranty: '18 Months Replacement Warranty',
      qty: 1,
      price: 65000,
    },
    {
      name: 'Spigen Ultra Hybrid Clear Case (iPhone 15)',
      warranty: '6 Months Case Warranty',
      qty: 1,
      price: 45000,
    },
    {
      name: 'Samsung Galaxy S24 Ultra (512GB Titanium Black)',
      imei: '35914 88204 11290',
      imei2: '35914 88204 11291',
      warranty: '1 Year Brand Official Warranty',
      qty: 1,
      price: 4650000,
    },
    {
      name: 'Baseus 20000mAh 65W Fast Power Bank',
      warranty: '1 Year Replacement Warranty',
      qty: 1,
      price: 115000,
    },
    {
      name: 'Remax King Kong 9D Screen Protector Glass',
      warranty: 'Official Application Warranty',
      qty: 2,
      price: 25000,
    },
  ];

  const maxItemsPerPage = customization.maxItemsPerA5Page || 3;
  const activeSampleItems = sampleItemsList.slice(0, sampleItemCount);

  const a5Pages = useMemo(() => {
    if (customization.paperWidth !== 'a5' || activeSampleItems.length === 0) {
      return [activeSampleItems];
    }
    const chunks: typeof activeSampleItems[] = [];
    for (let i = 0; i < activeSampleItems.length; i += maxItemsPerPage) {
      chunks.push(activeSampleItems.slice(i, i + maxItemsPerPage));
    }
    return chunks;
  }, [customization.paperWidth, activeSampleItems, maxItemsPerPage]);

  // Helper to compress and convert image to lightweight Data URL via centralized imageCompression
  const processImageFile = async (file: File, callback: (dataUrl: string) => void) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }
    try {
      const compressed = await compressImageToBase64(file, { maxDimension: 600, quality: 0.85 });
      callback(compressed);
    } catch (err: any) {
      alert(err?.message || 'Failed to compress image.');
    }
  };

  const handleQrUpload = (file: File) => {
    processImageFile(file, (dataUrl) => {
      setCustomization(prev => ({
        ...prev,
        qrImageUrl: dataUrl,
        showQrCode: true,
      }));
    });
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }
    try {
      // Guarantee pure PNG export with full alpha transparency
      const pngDataUrl = await processLogoImage(file, {
        maxDimension: 600,
        backgroundColor: 'transparent',
      });
      setCustomization(prev => ({
        ...prev,
        shopLogoUrl: pngDataUrl,
        showShopLogo: true,
        invoiceLogoSize: prev.invoiceLogoSize || 44,
        logoTransparentBg: true,
      }));
      setIsLogoAdjusterOpen(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to process logo image.');
    }
  };

  const handleRemoveQrImage = () => {
    setCustomization(prev => ({
      ...prev,
      qrImageUrl: undefined,
    }));
    if (qrFileInputRef.current) qrFileInputRef.current.value = '';
  };

  const handleRemoveLogoImage = () => {
    setCustomization(prev => ({
      ...prev,
      shopLogoUrl: undefined,
      showShopLogo: false,
    }));
    if (logoFileInputRef.current) logoFileInputRef.current.value = '';
  };

  // Handlers for Multiple Banking Payment QRs (Minimalist Design)
  const handleAddPaymentQr = (type: 'kpay' | 'wave' | 'aya' | 'cb' | 'yoma' | 'custom' = 'custom') => {
    const defaultNames: Record<string, string> = {
      kpay: 'KBZPay',
      wave: 'WavePay',
      aya: 'AYA Bank',
      cb: 'CB Bank',
      yoma: 'Yoma Bank',
      custom: 'Bank Pay',
    };
    const name = defaultNames[type] || 'Bank Pay';
    const newQr: InvoicePaymentQrItem = {
      id: `qr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      qrImageUrl: type !== 'custom' ? generateSampleQrSvg(type) : undefined,
      accountName: `${settings.shopName || 'Shop Account'} (${name})`,
      accountNumber: settings.phone || '09-798123456',
      isActive: true,
    };
    setCustomization(prev => ({
      ...prev,
      showQrCode: true,
      paymentQrs: [...(prev.paymentQrs || []), newQr],
    }));
  };

  const handleTogglePaymentQr = (id: string) => {
    setCustomization(prev => ({
      ...prev,
      paymentQrs: (prev.paymentQrs || []).map(q => q.id === id ? { ...q, isActive: q.isActive === false ? true : false } : q),
    }));
  };

  const handleRemovePaymentQr = (id: string) => {
    setCustomization(prev => ({
      ...prev,
      paymentQrs: (prev.paymentQrs || []).filter(q => q.id !== id),
    }));
  };

  const handleUpdatePaymentQr = (id: string, updates: Partial<InvoicePaymentQrItem>) => {
    setCustomization(prev => ({
      ...prev,
      paymentQrs: (prev.paymentQrs || []).map(q => q.id === id ? { ...q, ...updates } : q),
    }));
  };

  const handleMultiQrUpload = (qrId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }
    processImageFile(file, (dataUrl) => {
      setCustomization(prev => ({
        ...prev,
        showQrCode: true,
        paymentQrs: (prev.paymentQrs || []).map(q => q.id === qrId ? { ...q, qrImageUrl: dataUrl } : q),
      }));
    });
  };

  const handleSetSampleQrForId = (qrId: string, typeName: string) => {
    const sampleDataUri = generateSampleQrSvg(typeName);
    setCustomization(prev => ({
      ...prev,
      paymentQrs: (prev.paymentQrs || []).map(q => q.id === qrId ? { ...q, qrImageUrl: sampleDataUri } : q),
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedSettings: ShopSettings = {
      ...settings,
      logoUrl: customization.shopLogoUrl !== undefined ? customization.shopLogoUrl : settings.logoUrl,
      invoiceLogoSize: customization.invoiceLogoSize || settings.invoiceLogoSize || 44,
      logoTransparentBg: customization.logoTransparentBg ?? settings.logoTransparentBg ?? true,
      invoiceCustomization: customization,
      receiptFooterMessage: customization.footerThankYouMessage,
      warrantyPolicy: customization.warrantyPolicyText,
    };
    onSaveSettings(updatedSettings);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  return (
    <div id="invoice-customizer-screen" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header Banner */}
      <div 
        id="invoice-customizer-banner"
        data-print-hidden="true"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs print:hidden"
      >
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Receipt & Invoice Customizer</h2>
            <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Thermal 80/58mm & A5 Slip Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Upload banking payment QR photos (KPay/Wave/Bank), configure A5 voucher layouts, thermal rolls, shop branding, and warranty policies.
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden" data-print-hidden="true">
          {isSavedToast && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-in fade-in">
              <Check className="w-4 h-4" /> Settings Saved!
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const originalTitle = document.title;
              document.title = ' ';
              document.body.classList.add('printing-customizer-active');
              window.print();
              setTimeout(() => {
                document.title = originalTitle;
                document.body.classList.remove('printing-customizer-active');
              }, 500);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Test Print
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Main Split Grid: Editor (Left) & Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Form: Customization Controls (7 cols) */}
        <form 
          id="invoice-customizer-form"
          data-print-hidden="true"
          onSubmit={handleSave} 
          className="lg:col-span-7 space-y-6 print:hidden"
        >
          
          {/* Section 1: Paper Format & Size Selection */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                1. Invoice Format & Paper Size
              </h3>
              <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                Active: {customization.paperWidth === 'a5' ? 'A5 Half-Sheet' : customization.paperWidth}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* 80mm Thermal */}
              <button
                type="button"
                onClick={() => setCustomization({ ...customization, paperWidth: '80mm' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  customization.paperWidth === '80mm'
                    ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-slate-900">80mm Thermal</span>
                    {customization.paperWidth === '80mm' && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Standard POS Receipt Roll</p>
                </div>
                <div className="text-[9px] font-mono font-bold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded-md mt-2 inline-block w-fit">
                  Width: ~80mm (3.15 in)
                </div>
              </button>

              {/* 58mm Thermal */}
              <button
                type="button"
                onClick={() => setCustomization({ ...customization, paperWidth: '58mm' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  customization.paperWidth === '58mm'
                    ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-slate-900">58mm Thermal</span>
                    {customization.paperWidth === '58mm' && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Compact Mobile Mini Slip</p>
                </div>
                <div className="text-[9px] font-mono font-bold text-purple-700 bg-purple-100/60 px-2 py-0.5 rounded-md mt-2 inline-block w-fit">
                  Width: ~58mm (2.28 in)
                </div>
              </button>

              {/* A5 Size */}
              <button
                type="button"
                onClick={() => setCustomization({ ...customization, paperWidth: 'a5' })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  customization.paperWidth === 'a5'
                    ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-emerald-950 flex items-center gap-1">
                      <span>A5 Voucher Slip</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[8px] font-bold">New</span>
                    </span>
                    {customization.paperWidth === 'a5' && <Check className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">148 × 210 mm Computerized Invoice</p>
                </div>
                <div className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-md mt-2 inline-block w-fit">
                  A5 Half-Sheet (Detailed)
                </div>
              </button>

            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Typography / Font Scale</label>
                <select
                  value={customization.fontSize}
                  onChange={(e) => setCustomization({ ...customization, fontSize: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="compact">Compact (High Information Density)</option>
                  <option value="standard">Standard (Recommended)</option>
                  <option value="large">Large (High Legibility)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Signature Blocks (A5 only)</label>
                <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={customization.showSignatures ?? true}
                    onChange={(e) => setCustomization({ ...customization, showSignatures: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">Customer & Store Signatures</span>
                </label>
              </div>
            </div>

            {/* A5 Multi-Page Pagination Setting */}
            {customization.paperWidth === 'a5' && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    A5 Multi-Page Slip Pagination
                  </label>
                  <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                    Max {customization.maxItemsPerA5Page || 3} items per voucher slip
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  When a customer purchases many items, the POS automatically divides them into consecutive A5 voucher slips (Sheet 1 of 2, Sheet 2 of 2) while keeping the exact same customer information, date, cashier, and invoice number.
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {[2, 3, 4, 5, 6].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setCustomization({ ...customization, maxItemsPerA5Page: cnt })}
                      className={`py-2 px-1 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                        (customization.maxItemsPerA5Page || 3) === cnt
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div>{cnt} Items</div>
                      <div className="text-[9px] font-normal opacity-80">{cnt === 3 ? 'Standard' : cnt === 2 ? 'Spacious' : 'Compact'}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Banking Payment QRs (Multiple with Minimalist Design) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-purple-600" />
                  2. Multiple Banking Payment QRs (Minimalist Design)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Configure multiple banking payment QRs (e.g. KBZPay, WavePay, AYA, CB). Invoices display a clean minimalist layout: only QR and bank name below.
                </p>
              </div>
              <input
                type="checkbox"
                id="showQrToggle"
                checked={customization.showQrCode}
                onChange={(e) => setCustomization({ ...customization, showQrCode: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
              />
            </div>

            {customization.showQrCode && (
              <div className="space-y-4 pt-1">
                {/* Minimalist Design Style Banner */}
                <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                      <span className="text-xs font-bold text-purple-950">Invoice Layout Style</span>
                    </div>
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-200/90 text-purple-800">
                      Minimalist Design (Active)
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-900/80">
                    Displays clean compact QR code squares with the bank/payment channel name in bold text directly below.
                  </p>
                  
                  <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between">
                    <label htmlFor="showQrAccountDetailsToggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Show Account Number under Bank Name (Optional)
                    </label>
                    <input
                      type="checkbox"
                      id="showQrAccountDetailsToggle"
                      checked={customization.showQrAccountDetails ?? false}
                      onChange={(e) => setCustomization({ ...customization, showQrAccountDetails: e.target.checked })}
                      className="w-4 h-4 rounded text-purple-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Multiple Payment QRs List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      Configured Payment QRs ({customization.paymentQrs?.length || 0})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Check box to show/hide on invoice
                    </span>
                  </div>

                  {(!customization.paymentQrs || customization.paymentQrs.length === 0) ? (
                    <div className="text-center py-6 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-2">
                      <QrCode className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-600">No Payment QRs added yet</p>
                      <p className="text-[11px] text-slate-400">Add common Myanmar payment QRs with 1 click below:</p>
                      <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleAddPaymentQr('kpay')}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 cursor-pointer transition-colors"
                        >
                          + Add KBZPay
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddPaymentQr('wave')}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 cursor-pointer transition-colors"
                        >
                          + Add WavePay
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customization.paymentQrs.map((qr, index) => {
                        const isActive = qr.isActive !== false;
                        return (
                          <div
                            key={qr.id || index}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              isActive
                                ? 'bg-white border-slate-200 shadow-2xs'
                                : 'bg-slate-50 border-slate-200/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* QR Code Preview Thumbnail */}
                              <div className="relative group shrink-0">
                                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white p-1 rounded-xl border border-slate-300 shadow-2xs flex items-center justify-center overflow-hidden">
                                  {qr.qrImageUrl ? (
                                    <img
                                      src={qr.qrImageUrl}
                                      alt={qr.name}
                                      className="w-full h-full object-contain"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <QrCode className="w-10 h-10 text-slate-300" />
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveUploadQrId(qr.id);
                                    multiQrFileInputRef.current?.click();
                                  }}
                                  className="absolute inset-0 bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center rounded-xl text-[9px] font-bold transition-opacity cursor-pointer p-1 text-center"
                                >
                                  <Upload className="w-3.5 h-3.5 mb-0.5" />
                                  Upload Photo
                                </button>
                              </div>

                              {/* Form Fields for this QR */}
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isActive}
                                      onChange={() => handleTogglePaymentQr(qr.id)}
                                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                                      title={isActive ? 'Enabled on invoice' : 'Disabled on invoice'}
                                    />
                                    <span className="text-[11px] font-bold text-slate-900">
                                      {isActive ? 'Active on Invoice' : 'Disabled (Hidden)'}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePaymentQr(qr.id)}
                                    className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Delete this QR"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                      Bank / Provider Name
                                    </label>
                                    <input
                                      type="text"
                                      value={qr.name}
                                      onChange={(e) => handleUpdatePaymentQr(qr.id, { name: e.target.value })}
                                      placeholder="e.g. KBZPay, WavePay, AYA Bank"
                                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                      Account / Phone (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      value={qr.accountNumber || ''}
                                      onChange={(e) => handleUpdatePaymentQr(qr.id, { accountNumber: e.target.value })}
                                      placeholder="e.g. 09-798123456"
                                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                                    />
                                  </div>
                                </div>

                                {/* QR Photo Action Buttons */}
                                <div className="flex items-center gap-2 pt-1 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveUploadQrId(qr.id);
                                      multiQrFileInputRef.current?.click();
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                  >
                                    <Upload className="w-3 h-3 text-purple-600" />
                                    {qr.qrImageUrl ? 'Replace Photo' : 'Upload QR Photo'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetSampleQrForId(qr.id, qr.name)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-bold rounded-lg border border-purple-200 transition-colors cursor-pointer"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Generate Sample QR
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add New QR Buttons & Presets */}
                  <div className="pt-2 border-t border-slate-100">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      + Add Banking QR Code:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleAddPaymentQr('kpay')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold rounded-xl border border-sky-200 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3 h-3" /> KBZPay
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPaymentQr('wave')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3 h-3" /> WavePay
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPaymentQr('aya')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold rounded-xl border border-rose-200 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3 h-3" /> AYA Bank
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPaymentQr('cb')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs font-bold rounded-xl border border-orange-200 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3 h-3" /> CB Bank
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPaymentQr('yoma')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-800 text-xs font-bold rounded-xl border border-red-200 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3 h-3" /> Yoma Bank
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPaymentQr('custom')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Plus className="w-3 h-3" /> Custom Bank
                      </button>
                    </div>
                  </div>
                </div>

                {/* Hidden File Input for Multiple QR Image Upload */}
                <input
                  ref={multiQrFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0] && activeUploadQrId) {
                      handleMultiQrUpload(activeUploadQrId, e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Section 3: Shop Header, Logo & Address */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-600" />
              3. Shop Branding & Header Info
            </h3>

            {/* Optional Shop Logo */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                  Shop Logo (Invoice & Receipts)
                </span>
                {customization.shopLogoUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLogoAdjusterOpen(true)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200"
                    >
                      <Sliders className="w-3 h-3" /> Adjust Size &amp; Crop
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogoImage}
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                )}
              </div>

              {customization.shopLogoUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden p-1 relative"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                        backgroundSize: '10px 10px',
                        backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <img
                        src={customization.shopLogoUrl}
                        alt="Shop Logo"
                        className="w-full h-full object-contain bg-transparent"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">Pure PNG Transparent Logo</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                          image/png
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        No background box added. Transparent areas float cleanly on any paper or theme.
                      </p>
                    </div>
                  </div>

                  {/* Invoice Logo Height Slider */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Sliders className="w-3 h-3 text-slate-500" />
                        Invoice Printed Logo Height
                      </span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {customization.invoiceLogoSize || 44}px
                      </span>
                    </div>

                    <input
                      type="range"
                      min="24"
                      max="120"
                      step="2"
                      value={customization.invoiceLogoSize || 44}
                      onChange={(e) =>
                        setCustomization((prev) => ({
                          ...prev,
                          invoiceLogoSize: parseInt(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                    />

                    <div className="flex items-center gap-1.5">
                      {[32, 44, 60, 80].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setCustomization((prev) => ({
                              ...prev,
                              invoiceLogoSize: size,
                            }))
                          }
                          className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            (customization.invoiceLogoSize || 44) === size
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {size}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => logoFileInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer hover:bg-slate-100/60"
                >
                  <p className="text-xs font-bold text-slate-700">+ Upload Shop Logo Image (PNG / JPG / WebP)</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Outputs high-resolution PNG with full transparency</p>
                </div>
              )}
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleLogoUpload(e.target.files[0]);
                  }
                }}
              />
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Invoice Header Title *</label>
                <input
                  type="text"
                  value={customization.headerTitle}
                  onChange={(e) => setCustomization({ ...customization, headerTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tagline / Sub-Header</label>
                <input
                  type="text"
                  value={customization.subHeader}
                  onChange={(e) => setCustomization({ ...customization, subHeader: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Address Line 1</label>
                  <input
                    type="text"
                    value={customization.addressLine1}
                    onChange={(e) => setCustomization({ ...customization, addressLine1: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City / Country</label>
                  <input
                    type="text"
                    value={customization.city}
                    onChange={(e) => setCustomization({ ...customization, city: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Contact & Social Links */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              4. Phone Numbers & Social Handles
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Primary Phone</label>
                <input
                  type="text"
                  value={customization.phone1}
                  onChange={(e) => setCustomization({ ...customization, phone1: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Secondary Phone</label>
                <input
                  type="text"
                  value={customization.phone2 || ''}
                  onChange={(e) => setCustomization({ ...customization, phone2: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Viber Number</label>
                <input
                  type="text"
                  value={customization.viberNumber || ''}
                  onChange={(e) => setCustomization({ ...customization, viberNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Facebook Page / Handle</label>
                <input
                  type="text"
                  value={customization.facebookPage || ''}
                  onChange={(e) => setCustomization({ ...customization, facebookPage: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Field Toggles */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-600" />
              5. Field Display Toggles
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {[
                { key: 'showImeiDetails', label: 'Serialized IMEI(s)' },
                { key: 'showWarrantyDetails', label: 'Warranty Badges' },
                { key: 'showCashierName', label: 'Cashier Operator' },
                { key: 'showCustomerInfo', label: 'Customer Info' },
                { key: 'showPointsEarned', label: 'Loyalty Points' },
                { key: 'showBarcode', label: 'Receipt Barcode' },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={(customization as any)[item.key]}
                    onChange={(e) => setCustomization({ ...customization, [item.key]: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="font-semibold text-slate-700 text-xs">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 6: Policy & Thank You Message */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              6. Warranty Terms & Footer Notes
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Warranty Policy Text</label>
                <textarea
                  rows={2}
                  value={customization.warrantyPolicyText}
                  onChange={(e) => setCustomization({ ...customization, warrantyPolicyText: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Thank You Note (Burmese / English)</label>
                <textarea
                  rows={2}
                  value={customization.footerThankYouMessage}
                  onChange={(e) => setCustomization({ ...customization, footerThankYouMessage: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

        </form>

        {/* Right Form: Live Interactive Preview (5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center print:w-full print:block print:max-w-none">
          <div className="sticky top-20 w-full print:static print:w-full">
            
            {/* Preview Top Control Bar */}
            <div 
              id="invoice-customizer-preview-header"
              data-print-hidden="true"
              className="bg-slate-900 text-white px-4 py-3 rounded-t-3xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-md print:hidden"
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span className="font-bold">
                  Live Preview ({customization.paperWidth === 'a5' ? 'A5 Voucher Slip' : `${customization.paperWidth} Thermal`})
                </span>
                {customization.paperWidth === 'a5' && a5Pages.length > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                    {a5Pages.length} Voucher Sheets
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {customization.paperWidth === 'a5' && (
                  <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setSampleItemCount(2)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                        sampleItemCount === 2 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      2 Items (Single)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSampleItemCount(6)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                        sampleItemCount === 6 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      6 Items (Multi-Sheet)
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-slate-400 font-mono">INV-2026-001</span>
              </div>
            </div>

            {/* DYNAMIC PREVIEW CONTAINER */}
            {customization.paperWidth === 'a5' ? (
              /* ================== A5 INVOICE PREVIEW (MULTI-SHEET SPLIT SUPPORT) ================== */
              <div className="space-y-4 print:space-y-0 w-full">
                {a5Pages.map((pageItems, pageIdx) => {
                  const totalPages = a5Pages.length;
                  const pageNumber = pageIdx + 1;
                  const isFinalPage = pageNumber === totalPages;
                  const pageSubtotal = pageItems.reduce((acc, i) => acc + (i.price * i.qty), 0);
                  const grandTotal = activeSampleItems.reduce((acc, i) => acc + (i.price * i.qty), 0);

                  return (
                    <React.Fragment key={pageIdx}>
                      {pageIdx > 0 && (
                        <div className="flex items-center justify-center gap-3 py-1 print:hidden" data-print-hidden="true">
                          <div className="h-px bg-slate-300 flex-1"></div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-200 px-3 py-0.5 rounded-full shadow-2xs">
                            Sheet {pageNumber} of {totalPages} (Page Break)
                          </span>
                          <div className="h-px bg-slate-300 flex-1"></div>
                        </div>
                      )}
                      <div 
                        id={pageIdx === 0 ? "printable-a5-invoice" : undefined}
                        className="a5-voucher-sheet bg-white p-5 sm:p-6 rounded-b-3xl sm:rounded-3xl border border-slate-300 shadow-xl text-slate-900 font-sans text-xs space-y-4 print:border-none print:shadow-none print:p-0 print:rounded-none"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                          <div className="space-y-1">
                            {customization.shopLogoUrl && (
                              <img
                                src={customization.shopLogoUrl}
                                alt="Logo"
                                style={{ height: `${customization.invoiceLogoSize || 44}px` }}
                                className="object-contain mb-1 bg-transparent transition-all"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <h4 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900">
                              {customization.headerTitle}
                            </h4>
                            {customization.subHeader && (
                              <p className="text-[11px] font-semibold text-slate-600">{customization.subHeader}</p>
                            )}
                            <p className="text-[10px] text-slate-500">
                              {customization.addressLine1}, {customization.city}
                            </p>
                          </div>

                          <div className="text-right space-y-0.5 text-[10px] text-slate-600">
                            <div className="font-mono font-bold text-slate-900 text-xs flex items-center justify-end gap-1.5">
                              <span>INV-2026-001</span>
                              {totalPages > 1 && (
                                <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded font-sans font-bold">
                                  Page {pageNumber} of {totalPages}
                                </span>
                              )}
                            </div>
                            <p>{formatDateTime(new Date().toISOString())}</p>
                            <p className="font-bold text-slate-800">Hotline: {customization.phone1}</p>
                            {customization.viberNumber && <p>Viber: {customization.viberNumber}</p>}
                          </div>
                        </div>

                        {/* Customer & Cashier Info */}
                        <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px]">
                          <div>
                            <span className="text-slate-400 font-bold text-[9px] uppercase">Customer Information:</span>
                            <div className="font-bold text-slate-900">U Thura Min</div>
                            <div className="text-slate-600">09-771234567 • Kyauktada, Yangon</div>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 font-bold text-[9px] uppercase">Transaction Details:</span>
                            <div className="font-bold text-slate-900">Operator: {settings.currentStaffName}</div>
                            <div className="text-slate-700 font-medium">Payment: <span className="font-semibold text-slate-900">KBZPay</span></div>
                          </div>
                        </div>

                        {/* Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3">Item Description</th>
                                <th className="py-2 px-2 text-center w-12">Qty</th>
                                <th className="py-2 px-2 text-right">Price</th>
                                <th className="py-2 px-3 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {pageItems.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="py-2 px-3">
                                    <div className="font-bold text-slate-900">{item.name}</div>
                                    {customization.showImeiDetails && item.imei && (
                                      <div className="text-[10px] text-blue-800 font-mono font-semibold flex flex-wrap gap-2">
                                        <span>IMEI1: {item.imei}</span>
                                        {item.imei2 && <span>| IMEI2: {item.imei2}</span>}
                                      </div>
                                    )}
                                    {customization.showWarrantyDetails && item.warranty && (
                                      <div className="text-[9px] text-emerald-700 flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3 text-emerald-600 inline" />
                                        <span>{item.warranty}</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 text-center font-bold">{item.qty}</td>
                                  <td className="py-2 px-2 text-right font-mono">{formatCurrency(item.price, 'Ks')}</td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(item.price * item.qty, 'Ks')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Non-final page continuation banner */}
                        {!isFinalPage && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px]">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-bold uppercase text-[10px]">Page {pageNumber} Subtotal:</span>
                                <span className="font-mono font-bold text-slate-900">{formatCurrency(pageSubtotal, 'Ks')}</span>
                              </div>
                              <div className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                                Continued on Page {pageNumber + 1} of {totalPages} ➔
                              </div>
                            </div>
                            <div className="text-center text-[10px] text-slate-400 italic">
                              * This is Sheet {pageNumber} of {totalPages}. Total balance, payment QR, and signatures are on Sheet {totalPages}.
                            </div>
                          </div>
                        )}

                        {/* Final page: Full financial summary, QR code, signatures, and footer */}
                        {isFinalPage && (
                          <>
                            {/* Bottom Row: QR & Policy (Left) + Totals (Right) */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                              {/* Left: Banking QR & Terms */}
                              <div className="sm:col-span-7 space-y-2">
                                {/* Multiple Minimalist Banking QRs */}
                                {customization.showQrCode && activePaymentQrs.length > 0 && (
                                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                      <QrCode className="w-3 h-3 text-slate-700" />
                                      <span>Scan to Pay (Banking QR)</span>
                                    </div>
                                    <div className="flex items-start gap-4 flex-wrap">
                                      {activePaymentQrs.map((qr) => (
                                        <div key={qr.id} className="flex flex-col items-center text-center">
                                          <div className="w-16 h-16 sm:w-18 sm:h-18 bg-white p-1 rounded-xl border border-slate-300 shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
                                            {qr.qrImageUrl ? (
                                              <img 
                                                src={qr.qrImageUrl} 
                                                alt={qr.name} 
                                                className="w-full h-full object-contain"
                                                referrerPolicy="no-referrer"
                                              />
                                            ) : (
                                              <QrCode className="w-12 h-12 text-slate-900" />
                                            )}
                                          </div>
                                          <span className="text-[10px] font-black uppercase text-slate-900 tracking-wide mt-1 font-sans">
                                            {qr.name}
                                          </span>
                                          {customization.showQrAccountDetails && qr.accountNumber && (
                                            <span className="text-[9px] font-mono font-bold text-slate-600">
                                              {qr.accountNumber}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="text-[9px] text-slate-500 space-y-0.5">
                                  <p className="font-bold text-slate-700">Warranty & Exchange Terms:</p>
                                  <p>{customization.warrantyPolicyText}</p>
                                </div>
                              </div>

                              {/* Right: Totals */}
                              <div className="sm:col-span-5 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                                <div className="flex justify-between text-slate-600">
                                  <span>Subtotal:</span>
                                  <span>{formatCurrency(grandTotal, 'Ks')}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                  <span>Discount:</span>
                                  <span>0 Ks</span>
                                </div>
                                <div className="flex justify-between font-black text-sm text-slate-900 border-t border-slate-300 pt-1">
                                  <span>NET TOTAL:</span>
                                  <span className="text-emerald-700">{formatCurrency(grandTotal, 'Ks')}</span>
                                </div>
                                <div className="flex justify-between text-slate-700 pt-0.5 text-[10px]">
                                  <span>Amount Paid:</span>
                                  <span className="font-bold">{formatCurrency(grandTotal, 'Ks')}</span>
                                </div>
                                <div className="flex justify-between text-slate-500 text-[10px]">
                                  <span>Balance Due:</span>
                                  <span>0 Ks</span>
                                </div>
                              </div>
                            </div>

                            {/* Signatures */}
                            {customization.showSignatures && (
                              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200 text-center text-[10px]">
                                <div>
                                  <div className="border-b border-slate-400 pb-1 mb-1 font-mono text-slate-400">................................................</div>
                                  <span className="font-bold text-slate-700">Customer's Signature</span>
                                </div>
                                <div>
                                  <div className="border-b border-slate-400 pb-1 mb-1 font-mono text-slate-400">................................................</div>
                                  <span className="font-bold text-slate-700">Authorized Store Signature & Stamp</span>
                                </div>
                              </div>
                            )}

                            {/* Thank You Note */}
                            <div className="text-center pt-2 text-[10px] font-bold text-slate-700">
                              {customization.footerThankYouMessage}
                            </div>
                          </>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              /* ================== THERMAL ROLL (80mm / 58mm) ================== */
              <div id="printable-thermal-receipt" className="bg-white p-5 rounded-b-3xl sm:rounded-3xl border border-slate-300 shadow-xl text-slate-900 font-mono text-[11px] leading-tight space-y-3 max-w-sm mx-auto print:border-none print:shadow-none print:p-0 print:rounded-none">
                
                {/* Header */}
                <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                  {customization.shopLogoUrl && (
                    <img
                      src={customization.shopLogoUrl}
                      alt="Logo"
                      style={{ height: `${Math.min(customization.invoiceLogoSize || 36, 64)}px` }}
                      className="mx-auto object-contain mb-1 bg-transparent transition-all"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <h4 className="text-base font-black uppercase tracking-wider">{customization.headerTitle}</h4>
                  {customization.subHeader && <p className="text-[10px] text-slate-600">{customization.subHeader}</p>}
                  <p className="text-[10px] text-slate-600">{customization.addressLine1}, {customization.city}</p>
                  <p className="text-[10px] font-bold">Tel: {customization.phone1} {customization.phone2 && `| ${customization.phone2}`}</p>
                  {customization.viberNumber && <p className="text-[9px] text-slate-500">Viber: {customization.viberNumber}</p>}
                  {customization.facebookPage && <p className="text-[9px] text-slate-500">{customization.facebookPage}</p>}
                </div>

                {/* Invoice Metadata */}
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span>INVOICE: #INV-2026-001</span>
                    <span>{formatDateTime(new Date().toISOString())}</span>
                  </div>
                  {customization.showCustomerInfo && (
                    <div className="flex justify-between">
                      <span>CUST: U Thura Min</span>
                      <span>09-771234567</span>
                    </div>
                  )}
                  {customization.showCashierName && (
                    <div className="flex justify-between text-slate-500">
                      <span>OPERATOR: {settings.currentStaffName}</span>
                      <span>TERM: #01</span>
                    </div>
                  )}
                </div>

                {/* Items List */}
                <div className="border-t border-b border-dashed border-slate-300 py-2 space-y-2">
                  <div>
                    <div className="flex justify-between font-bold">
                      <span>Apple iPhone 15 Pro Max</span>
                      <span>4,250,000 Ks</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>1 x 4,250,000 Ks</span>
                      <span>4,250,000 Ks</span>
                    </div>
                    {customization.showImeiDetails && (
                      <p className="text-[9px] text-blue-900 font-bold">IMEI: 35829 10482 91045</p>
                    )}
                    {customization.showWarrantyDetails && (
                      <p className="text-[9px] text-slate-600">🛡️ 1 Year Brand Official Warranty</p>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between font-bold">
                      <span>Anker 30W Fast Charger</span>
                      <span>65,000 Ks</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>1 x 65,000 Ks</span>
                      <span>65,000 Ks</span>
                    </div>
                    {customization.showWarrantyDetails && (
                      <p className="text-[9px] text-slate-600">🛡️ 18 Months Replacement Warranty</p>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-1 text-[11px] font-bold">
                  <div className="flex justify-between">
                    <span>SUBTOTAL:</span>
                    <span>4,315,000 Ks</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>DISCOUNT:</span>
                    <span>0 Ks</span>
                  </div>
                  <div className="flex justify-between text-sm font-black border-t border-slate-300 pt-1">
                    <span>GRAND TOTAL:</span>
                    <span>4,315,000 Ks</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 text-[10px]">
                    <span>PAID (KBZPay):</span>
                    <span>4,315,000 Ks</span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-[10px]">
                    <span>CHANGE DUE:</span>
                    <span>0 Ks</span>
                  </div>
                </div>

                {/* Loyalty points */}
                {customization.showPointsEarned && (
                  <div className="p-1.5 bg-slate-100 rounded text-center text-[10px] font-bold">
                    ★ Points Earned: +4,315 pts | Balance: 8,630 pts
                  </div>
                )}

                {/* Multiple Minimalist QR Codes Section */}
                {customization.showQrCode && activePaymentQrs.length > 0 && (
                  <div className="py-2.5 text-center border-b border-dashed border-slate-400 space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Scan to Pay (QR)</p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      {activePaymentQrs.map((qr) => (
                        <div key={qr.id} className="flex flex-col items-center text-center">
                          <div className="w-16 h-16 bg-white p-1 border border-slate-300 flex items-center justify-center rounded overflow-hidden">
                            {qr.qrImageUrl ? (
                              <img 
                                src={qr.qrImageUrl} 
                                alt={qr.name} 
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <QrCode className="w-12 h-12 text-slate-900" />
                            )}
                          </div>
                          <span className="text-[9px] font-black uppercase text-slate-900 mt-0.5">
                            {qr.name}
                          </span>
                          {customization.showQrAccountDetails && qr.accountNumber && (
                            <span className="text-[8px] font-mono text-slate-600">
                              {qr.accountNumber}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Barcode Mock */}
                {customization.showBarcode && (
                  <div className="text-center pt-2">
                    <div className="h-7 bg-slate-800 w-3/4 mx-auto flex items-center justify-center text-white text-[9px] tracking-widest">
                      ||||| ||| |||| || |||||||
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5">INV-2026-001</p>
                  </div>
                )}

                {/* Policies & Thank You */}
                <div className="text-center pt-2 border-t border-dashed border-slate-300 space-y-1 text-[9px] text-slate-600">
                  <p className="font-bold text-slate-900">{customization.footerThankYouMessage}</p>
                  <p>{customization.warrantyPolicyText}</p>
                </div>

              </div>
            )}

          </div>
        </div>

      </div>

      {/* Logo Adjuster Modal */}
      {isLogoAdjusterOpen && customization.shopLogoUrl && (
        <LogoSizeAdjusterModal
          isOpen={isLogoAdjusterOpen}
          initialImage={customization.shopLogoUrl}
          initialShopSize={settings.shopLogoSize || 40}
          initialInvoiceSize={customization.invoiceLogoSize || 44}
          initialTransparentBg={customization.logoTransparentBg ?? true}
          title="Adjust Invoice Logo Photo Size & Transparency"
          onClose={() => setIsLogoAdjusterOpen(false)}
          onSave={(newPngDataUrl, _newShopSize, newInvoiceSize, isTransparent) => {
            setCustomization((prev) => ({
              ...prev,
              shopLogoUrl: newPngDataUrl,
              invoiceLogoSize: newInvoiceSize,
              showShopLogo: true,
              logoTransparentBg: isTransparent,
            }));
            setIsLogoAdjusterOpen(false);
          }}
        />
      )}

    </div>
  );
};
