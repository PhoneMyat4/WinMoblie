import React, { useState, useMemo } from 'react';
import { 
  X, 
  Gift, 
  Search, 
  Smartphone, 
  Tag, 
  User, 
  Phone, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  FileText,
  DollarSign,
  Sparkles,
  Info,
  Layers
} from 'lucide-react';
import { Product, StaffUser, ShopSettings, StoreLocation, FocDistributionRecord, ExpenseRecord } from '../../types';
import { formatCurrency, formatImei } from '../../utils/formatters';
import { isPhoneCategory } from '../../data/categoryTaxonomy';
import { StorageService } from '../../utils/storage';
import { AuditLogger } from '../../utils/auditLogger';

interface FocDistributionModalProps {
  products: Product[];
  settings: ShopSettings;
  currentStaffUser?: StaffUser | null;
  onClose: () => void;
  onSuccess: (updatedProduct: Product) => void;
}

const FOC_PRESET_REASONS = [
  { id: 'promo_bundle', labelMm: 'ပရိုမိုးရှင်း လက်ဆောင် (Promotion Bundle)', labelEn: 'Promotional Bundle Gift' },
  { id: 'vip_reward', labelMm: 'VIP ဝယ်လက် အထူးလက်ဆောင် (VIP Customer Reward)', labelEn: 'VIP Customer Reward' },
  { id: 'lucky_draw', labelMm: 'ကံစမ်းမဲ / ဆုလက်ဆောင် (Lucky Draw / Prize)', labelEn: 'Lucky Draw / Contest Prize' },
  { id: 'defect_comp', labelMm: 'ချို့ယွင်းချက် လျော်ကြေး (Defect Compensation)', labelEn: 'Defect Compensation / Warranty' },
  { id: 'sample_review', labelMm: 'မိတ်ဆက်နမူနာ (Product Sample / Review Unit)', labelEn: 'Product Sample / Review' },
  { id: 'staff_gift', labelMm: 'ဝန်ထမ်းဆုကြေး လက်ဆောင် (Staff Incentive)', labelEn: 'Staff Reward / Internal' },
  { id: 'custom', labelMm: 'အခြား အကြောင်းပြချက် (Custom Reason)', labelEn: 'Other Custom Reason' },
];

export const FocDistributionModal: React.FC<FocDistributionModalProps> = ({
  products,
  settings,
  currentStaffUser,
  onClose,
  onSuccess,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedImei, setSelectedImei] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [selectedReasonId, setSelectedReasonId] = useState('promo_bundle');
  const [customReasonText, setCustomReasonText] = useState('');
  const [notes, setNotes] = useState('');
  
  // Double-Deduction Prevention Accounting Option
  const [recordAsExpense, setRecordAsExpense] = useState(true);

  // Success Voucher Slip state
  const [generatedVoucher, setGeneratedVoucher] = useState<FocDistributionRecord | null>(null);

  // Locations
  const locations: StoreLocation[] = useMemo(() => StorageService.getLocations(), []);
  const activeLocationId = StorageService.getActiveLocationId();
  const [selectedLocationId, setSelectedLocationId] = useState(activeLocationId || locations[0]?.id || 'loc_main');

  // Filter products that have stock > 0
  const availableProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchQuery)) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSearch;
    });
  }, [products, searchQuery]);

  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  const isPhone = selectedProduct ? isPhoneCategory(selectedProduct.category) : false;

  const totalCost = (selectedProduct?.costPrice || 0) * quantity;
  const totalRetailValue = (selectedProduct?.sellingPrice || 0) * quantity;

  // Selected final reason text
  const finalReason = useMemo(() => {
    if (selectedReasonId === 'custom') return customReasonText.trim() || 'Custom Gift Giveaway';
    const found = FOC_PRESET_REASONS.find(r => r.id === selectedReasonId);
    return found ? `${found.labelMm} (${found.labelEn})` : 'Promotional Gift';
  }, [selectedReasonId, customReasonText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      alert('လက်ဆောင်ထုတ်ပေးမည့် ပစ္စည်းကို ရွေးချယ်ပေးပါ (Please select a product).');
      return;
    }
    if (quantity <= 0) {
      alert('ထုတ်ပေးမည့် အရေအတွက်ကို မှန်ကန်စွာ ထည့်ပါ (Invalid quantity).');
      return;
    }
    if (selectedProduct.stock < quantity) {
      alert(`လက်ကျန်ပစ္စည်း မလုံလောက်ပါ (Insufficient stock: only ${selectedProduct.stock} available).`);
      return;
    }
    if (!recipientName.trim()) {
      alert('လက်ဆောင်လက်ခံသူ အမည်ကို ထည့်သွင်းပေးပါ (Recipient name is required).');
      return;
    }
    if (isPhone && !selectedImei && selectedProduct.imeiList && selectedProduct.imeiList.length > 0) {
      alert('ဖုန်းအတွက် သက်ဆိုင်ရာ IMEI ကို ရွေးချယ်ပေးပါ (Please select an IMEI).');
      return;
    }

    const voucherNumber = StorageService.generateNextGiftVoucherNumber();
    const activeStaffName = currentStaffUser?.name || settings.currentStaffName || 'Authorized Staff';
    const locationObj = locations.find(l => l.id === selectedLocationId);

    // 1. Create FOC Distribution Record
    const distributionRecord: FocDistributionRecord = {
      id: `foc-dist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      voucherNumber,
      date: new Date().toISOString(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      brand: selectedProduct.brand,
      category: selectedProduct.category,
      quantity,
      unitCost: selectedProduct.costPrice || 0,
      originalPrice: selectedProduct.sellingPrice || 0,
      totalCost,
      totalRetailValue,
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim() || undefined,
      reason: finalReason,
      issuedBy: activeStaffName,
      locationId: selectedLocationId,
      locationName: locationObj?.name || 'Main Store',
      imei: selectedImei || undefined,
      notes: notes.trim() || undefined,
      expensedInAccounting: recordAsExpense && totalCost > 0,
    };

    // 2. Decrement Product Stock & remove IMEI if present
    const updatedProd: Product = {
      ...selectedProduct,
      stock: Math.max(0, selectedProduct.stock - quantity),
      updatedAt: new Date().toISOString(),
    };

    if (selectedImei) {
      if (updatedProd.imeiList) {
        updatedProd.imeiList = updatedProd.imeiList.filter(im => im !== selectedImei);
      }
      if (updatedProd.imeiPairs) {
        updatedProd.imeiPairs = updatedProd.imeiPairs.filter(p => p.imei1 !== selectedImei && p.imei2 !== selectedImei);
      }
    }

    // Save updated product
    StorageService.saveProduct(updatedProd, activeStaffName, true);

    // Also atomically decrement branch inventory
    StorageService.updateBranchStock(selectedProduct.id, selectedLocationId, -quantity, 0, true);

    // 3. Record Stock Movement Adjustment
    StorageService.recordStockAdjustment({
      id: `adj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      type: 'reduce',
      quantityChange: -quantity,
      previousStock: selectedProduct.stock,
      newStock: updatedProd.stock,
      reason: 'foc_gift',
      reasonNotes: `[FOC_GIFT] Issued ${quantity} unit(s) to ${recipientName.trim()} (#${voucherNumber} | ${finalReason})`,
      adjustedBy: activeStaffName,
      imeiList: selectedImei ? [selectedImei] : undefined,
    });

    // 4. Record as Shop Operating Expense if requested & cost > 0 (Double-deduction prevention check!)
    if (recordAsExpense && totalCost > 0) {
      const expenseItem: ExpenseRecord = {
        id: `exp-foc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        voucherNumber: `${settings.expensePrefix || 'EXP-'}${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        category: 'Promotions & Marketing',
        title: `FOC Gift: ${selectedProduct.name} x${quantity} to ${recipientName.trim()}`,
        amount: totalCost,
        paymentMethod: 'cash',
        paidTo: recipientName.trim(),
        recordedBy: activeStaffName,
        deductFromCashDrawer: false,
        notes: `Standalone Gift Voucher #${voucherNumber} (${finalReason}). Item retail value: ${totalRetailValue.toLocaleString()} Ks.`,
      };
      StorageService.saveExpense(expenseItem);
    }

    // 5. Save FOC distribution record
    StorageService.saveFocDistribution(distributionRecord);

    // 6. Log Audit Trail
    AuditLogger.logInventory(
      'STOCK_ADJUSTED',
      `[FOC_GIFT] Standalone Gift Issued: ${quantity}x "${selectedProduct.name}" to ${recipientName.trim()} (Voucher: #${voucherNumber} | Value: ${totalRetailValue.toLocaleString()} Ks)`,
      currentStaffUser || null,
      {
        targetId: selectedProduct.id,
        targetName: selectedProduct.name,
        amount: totalCost,
        reason: finalReason,
        notes: `Recipient: ${recipientName.trim()} | Expense Recorded: ${recordAsExpense ? 'Yes' : 'No (Already Expensed/0-Cost)'}`,
      }
    );

    // Set generated voucher to show printable slip
    setGeneratedVoucher(distributionRecord);
    onSuccess(updatedProd);
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-modal-backdrop">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-content">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <Gift className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base tracking-wide">
                  Standalone Gift Distribution Hub
                </h3>
                <span className="text-[10px] bg-amber-400 text-slate-900 font-black px-2 py-0.5 rounded-full uppercase">
                  FOC Issue
                </span>
              </div>
              <p className="text-xs text-purple-200">
                သီးသန့် ပရိုမိုးရှင်းလက်ဆောင် ထုတ်ပေးခြင်း & စာရင်းကိုင် ထိန်းချုပ်မှု
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {generatedVoucher ? (
            /* ================= Success Voucher Slip View ================= */
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-emerald-900 text-sm">
                    လက်ဆောင် ထုတ်ပေးခြင်း အောင်မြင်ပါသည် (FOC Gift Issued Successfully!)
                  </h4>
                  <p className="text-xs text-emerald-700">
                    Voucher #{generatedVoucher.voucherNumber} has been recorded and stock was decremented.
                  </p>
                </div>
              </div>

              {/* Printable Gift Slip */}
              <div id="printable-foc-slip" className="border-2 border-dashed border-slate-300 rounded-2xl p-5 bg-slate-50 space-y-3 font-sans">
                <div className="text-center border-b border-slate-200 pb-3">
                  <div className="inline-flex items-center gap-1.5 text-xs font-black text-purple-900 uppercase tracking-widest bg-purple-100 px-3 py-0.5 rounded-full mb-1">
                    <Gift className="w-3.5 h-3.5 text-purple-700" />
                    OFFICIAL GIFT ISSUE SLIP (FOC)
                  </div>
                  <h2 className="text-base font-black text-slate-900 uppercase">{settings.shopName}</h2>
                  <p className="text-[11px] text-slate-500 font-mono">Voucher No: {generatedVoucher.voucherNumber}</p>
                  <p className="text-[10px] text-slate-400">Date: {new Date(generatedVoucher.date).toLocaleString()}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Recipient (လက်ခံသူ)</span>
                    <p className="font-bold text-slate-900">{generatedVoucher.recipientName}</p>
                    {generatedVoucher.recipientPhone && (
                      <p className="text-slate-600 font-mono text-[11px]">Tel: {generatedVoucher.recipientPhone}</p>
                    )}
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Issued By (ထုတ်ပေးသူ)</span>
                    <p className="font-bold text-slate-900">{generatedVoucher.issuedBy}</p>
                    <p className="text-slate-600 text-[11px]">Location: {generatedVoucher.locationName}</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="py-2 px-3 text-left">Item Description</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Retail Value</th>
                        <th className="py-2 px-3 text-right">Charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-100">
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{generatedVoucher.productName}</p>
                          {generatedVoucher.imei && (
                            <p className="font-mono text-[10px] text-blue-700">IMEI: {formatImei(generatedVoucher.imei)}</p>
                          )}
                          <p className="text-[10px] text-purple-700 italic">Purpose: {generatedVoucher.reason}</p>
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold">{generatedVoucher.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono line-through text-slate-400">
                          {formatCurrency(generatedVoucher.totalRetailValue, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700 font-mono">
                          0 Ks (FOC)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-purple-900 block">Total Customer Benefit</span>
                    <span className="text-[10px] text-purple-700">Promotional Gift / အခမဲ့လက်ဆောင်</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-sm text-purple-900 font-mono">
                      {formatCurrency(generatedVoucher.totalRetailValue, settings.currencySymbol)} (100% Free)
                    </span>
                  </div>
                </div>

                {generatedVoucher.notes && (
                  <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                    <strong>Note:</strong> {generatedVoucher.notes}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4 pt-4 text-center text-[10px] text-slate-400">
                  <div className="border-t border-slate-300 pt-1">Recipient Signature</div>
                  <div className="border-t border-slate-300 pt-1">Authorized Store Manager</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Gift Slip (ဘောင်ချာထုတ်မည်)</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Close (ပိတ်မည်)
                </button>
              </div>
            </div>
          ) : (
            /* ================= New Distribution Form ================= */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Product Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  1. လက်ဆောင်ထုတ်ပေးမည့် ပစ္စည်း ရွေးချယ်ပါ (Select Product Item) <span className="text-rose-500">*</span>
                </label>
                
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by name, model, barcode or SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-500 outline-hidden"
                  />
                </div>

                {/* Product Dropdown Selector */}
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const prod = products.find(p => p.id === e.target.value);
                    if (prod && prod.imeiList && prod.imeiList.length > 0) {
                      setSelectedImei(prod.imeiList[0]);
                    } else {
                      setSelectedImei('');
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500 outline-hidden cursor-pointer"
                >
                  <option value="">-- Choose Item from Inventory ({availableProducts.length} items) --</option>
                  {availableProducts.map(p => (
                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                      {p.name} {p.color ? `(${p.color})` : ''} - Stock: {p.stock} | Cost: {formatCurrency(p.costPrice || 0, settings.currencySymbol)} | Retail: {formatCurrency(p.sellingPrice || 0, settings.currencySymbol)}
                    </option>
                  ))}
                </select>

                {/* Selected Product Card Preview */}
                {selectedProduct && (
                  <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-purple-950 block">{selectedProduct.name}</span>
                      <div className="flex items-center gap-2 text-[11px] text-purple-700 mt-0.5">
                        <span>Brand: <strong>{selectedProduct.brand}</strong></span>
                        <span>•</span>
                        <span>Available Stock: <strong className="text-emerald-700">{selectedProduct.stock} units</strong></span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Unit Cost / Retail:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {formatCurrency(selectedProduct.costPrice || 0, settings.currencySymbol)} / {formatCurrency(selectedProduct.sellingPrice || 0, settings.currencySymbol)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity & Serial / IMEI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. အရေအတွက် (Quantity) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedProduct ? selectedProduct.stock : 999}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 outline-hidden font-mono"
                  />
                  {selectedProduct && (
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Max available: {selectedProduct.stock}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ဆိုင်ခွဲ / နေရာ (Store Location)
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-purple-500 outline-hidden"
                  >
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.isDefault ? '(Main)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Serial / IMEI Selector for phones */}
              {isPhone && selectedProduct && selectedProduct.imeiList && selectedProduct.imeiList.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-1">
                  <label className="block text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                    Device IMEI / Serial (ထုတ်ပေးမည့် ဖုန်း အမှတ်စဉ်)
                  </label>
                  <select
                    value={selectedImei}
                    onChange={(e) => setSelectedImei(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  >
                    <option value="">-- Choose IMEI unit ({selectedProduct.imeiList.length} units available) --</option>
                    {selectedProduct.imeiList.map(im => (
                      <option key={im} value={im}>
                        {formatImei(im)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Recipient Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. လက်ခံသူ အမည် (Recipient Name) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="e.g. Ko Aung / VIP Customer / Winner"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ဖုန်းနံပါတ် (Phone Number - Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="09..."
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:ring-2 focus:ring-purple-500 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Reason / Purpose */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  4. လက်ဆောင်ပေးရသည့် အကြောင်းပြချက် (FOC Purpose & Category) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {FOC_PRESET_REASONS.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReasonId(r.id)}
                      className={`text-left p-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                        selectedReasonId === r.id
                          ? 'bg-purple-100 border-purple-500 text-purple-950 font-bold shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="truncate">{r.labelMm}</div>
                      <div className="text-[10px] text-slate-500">{r.labelEn}</div>
                    </button>
                  ))}
                </div>

                {selectedReasonId === 'custom' && (
                  <input
                    type="text"
                    placeholder="Enter custom gift reason..."
                    value={customReasonText}
                    onChange={(e) => setCustomReasonText(e.target.value)}
                    className="w-full mt-2 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-purple-500 outline-hidden"
                  />
                )}
              </div>

              {/* Accounting Treatment: Double Deduction Prevention (Crucial User Requirement!) */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <span className="font-bold text-amber-950 block">
                      စာရင်းကိုင် အသုံးစရိတ် စီမံခန့်ခွဲမှု (Double-Deduction Prevention)
                    </span>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      ပစ္စည်းတန်ဖိုး စုစုပေါင်း: <strong>{formatCurrency(totalCost, settings.currencySymbol)}</strong> (လက်လီတန်ဖိုး: {formatCurrency(totalRetailValue, settings.currencySymbol)})
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-amber-200 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={recordAsExpense}
                    onChange={(e) => setRecordAsExpense(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">
                      ဆိုင်အသုံးစရိတ် (Marketing & Promotional Gift Expense) သို့ အလိုအလျောက် သွင်းမည်
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {recordAsExpense
                        ? `(အသုံးစရိတ် ${formatCurrency(totalCost, settings.currencySymbol)} နုတ်ပါမည်။ ဤပစ္စည်းကို ဝယ်ယူစဉ်က အသုံးစရိတ် မသွင်းရသေးသည့်အခါ သုံးပါ)`
                        : `(အသုံးစရိတ် မနုတ်ပါ - ဝယ်ယူစဉ်ကတည်းက Expense သွင်းထားပြီးဖြစ်၍ ၂ ခါ နုတ်ယူခြင်း မဖြစ်စေရန်)`}
                    </span>
                  </div>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  မှတ်ချက် (Internal Notes - Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional campaign details or approval info..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-hidden"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  Authorized Staff: <strong className="text-slate-800">{currentStaffUser?.name || settings.currentStaffName}</strong>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
                  >
                    Cancel (မလုပ်တော့ပါ)
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-purple-500/20"
                  >
                    <Gift className="w-4 h-4 text-amber-300" />
                    <span>Issue Gift Now (လက်ဆောင် ထုတ်ပေးမည်)</span>
                  </button>
                </div>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
