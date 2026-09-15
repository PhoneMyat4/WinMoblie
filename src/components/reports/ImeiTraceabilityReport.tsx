import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Smartphone, 
  Truck, 
  ShoppingCart, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  User, 
  DollarSign, 
  Tag, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw, 
  FileText, 
  Printer, 
  ExternalLink,
  Barcode,
  Layers,
  Sparkles,
  ArrowRight,
  Check,
  Download
} from 'lucide-react';
import { Product, Sale, PurchaseRecord, ShopSettings, SerializedDeviceItem, ImeiStatus } from '../../types';
import { getAllSerializedDevices, findDeviceByImeiOrSerial } from '../../utils/serializedUtils';
import { formatCurrency, formatImei, getConditionLabel } from '../../utils/formatters';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';

interface ImeiTraceabilityReportProps {
  products: Product[];
  sales: Sale[];
  purchases: PurchaseRecord[];
  settings: ShopSettings;
  onViewInvoice?: (sale: Sale) => void;
  onOpenBarcodeModal?: (product: Product, imei: string) => void;
}

export const ImeiTraceabilityReport: React.FC<ImeiTraceabilityReportProps> = ({
  products,
  sales,
  purchases,
  settings,
  onViewInvoice,
  onOpenBarcodeModal,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedImei, setSelectedImei] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Consolidate all serialized devices from products, purchases, and sales
  const allDevices = useMemo(() => {
    return getAllSerializedDevices(products, sales, purchases);
  }, [products, sales, purchases]);

  // Filtered devices list for quick selection table
  const filteredDevices = useMemo(() => {
    return allDevices.filter(device => {
      if (statusFilter !== 'all' && device.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        device.imei.toLowerCase().includes(q) ||
        (device.imei2 && device.imei2.toLowerCase().includes(q)) ||
        device.productName.toLowerCase().includes(q) ||
        device.brand.toLowerCase().includes(q) ||
        (device.soldCustomerName && device.soldCustomerName.toLowerCase().includes(q)) ||
        (device.soldCustomerPhone && device.soldCustomerPhone.includes(q)) ||
        (device.soldInvoiceNumber && device.soldInvoiceNumber.toLowerCase().includes(q)) ||
        (device.purchaseOrderNumber && device.purchaseOrderNumber.toLowerCase().includes(q)) ||
        (device.supplierName && device.supplierName.toLowerCase().includes(q))
      );
    });
  }, [allDevices, statusFilter, searchQuery]);

  // Selected Active Device for Full Traceability Lifecycle View
  const activeDevice = useMemo(() => {
    if (selectedImei) {
      return findDeviceByImeiOrSerial(selectedImei, allDevices);
    }
    // Default to the first filtered device if available
    return filteredDevices[0];
  }, [selectedImei, allDevices, filteredDevices]);

  // Corresponding matched sales object if sold
  const matchedSale = useMemo(() => {
    if (!activeDevice || !activeDevice.soldInvoiceNumber) return undefined;
    return sales.find(s => s.invoiceNumber === activeDevice.soldInvoiceNumber);
  }, [activeDevice, sales]);

  // Corresponding product object
  const matchedProduct = useMemo(() => {
    if (!activeDevice) return undefined;
    return products.find(p => p.id === activeDevice.productId || p.name === activeDevice.productName);
  }, [activeDevice, products]);

  // Status Badge Helper
  const getStatusBadge = (status: ImeiStatus) => {
    switch (status) {
      case 'In Stock':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> In Stock</span>;
      case 'Sold':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200"><ShoppingCart className="w-3.5 h-3.5" /> Sold to Customer</span>;
      case 'RMA':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 border border-purple-200"><RotateCcw className="w-3.5 h-3.5" /> In RMA / Service</span>;
      case 'Defective':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200"><AlertTriangle className="w-3.5 h-3.5" /> Defective / Damaged</span>;
      case 'Reserved':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Reserved Hold</span>;
    }
  };

  const handlePrintCertificate = () => {
    window.print();
  };

  const handleExportListCsv = () => {
    const headers = [
      'IMEI 1',
      'IMEI 2',
      'Serial Number',
      'Product Name',
      'Brand',
      'Condition',
      'Color',
      'Storage',
      'Status',
      `Cost Price (${settings.currencySymbol})`,
      `Selling Price (${settings.currencySymbol})`,
      'PO Number',
      'Supplier',
      'Received Date',
      'Invoice Number',
      'Customer Name',
      'Sold Date'
    ];

    const rows = filteredDevices.map(d => [
      d.imei,
      d.imei2 || '-',
      d.serialNumber || '-',
      d.productName,
      d.brand,
      getConditionLabel(d.condition).label,
      d.color || '-',
      d.specs || '-',
      d.status,
      d.costPrice,
      d.sellingPrice,
      d.purchaseOrderNumber || '-',
      d.supplierName || '-',
      d.receivedDate?.slice(0, 10) || '-',
      d.soldInvoiceNumber || '-',
      d.soldCustomerName || '-',
      d.soldDate?.slice(0, 10) || '-'
    ]);

    exportToCsv(`IMEI_Traceability_List_${statusFilter}`, headers, rows);
  };

  const handleExportListPdf = () => {
    const headers = [
      'IMEI / Serial',
      'Product & Specs',
      'Status',
      'Cost',
      'Price',
      'Supplier / PO',
      'Customer / Invoice'
    ];

    const rows = filteredDevices.map(d => [
      d.imei + (d.imei2 ? `\nIMEI2: ${d.imei2}` : ''),
      `${d.productName}\n${d.brand} | ${getConditionLabel(d.condition).label} ${d.specs || ''}`,
      d.status,
      formatCurrency(d.costPrice, settings.currencySymbol),
      formatCurrency(d.sellingPrice, settings.currencySymbol),
      d.supplierName ? `${d.supplierName}\nPO: ${d.purchaseOrderNumber || '-'}` : (d.purchaseOrderNumber || '-'),
      d.soldCustomerName ? `${d.soldCustomerName}\nInv: ${d.soldInvoiceNumber || '-'}` : (d.soldInvoiceNumber || '-')
    ]);

    exportReportToPdf({
      title: 'IMEI & Serialized Inventory Traceability Report',
      subtitle: `Serialized unit registry, current status, supplier provenance, and customer allocation`,
      filename: `IMEI_Traceability_${statusFilter}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Total Units', value: `${filteredDevices.length} Devices` },
        { label: 'In Stock', value: `${filteredDevices.filter(d => d.status === 'In Stock').length} Units` },
        { label: 'Sold', value: `${filteredDevices.filter(d => d.status === 'Sold').length} Units` },
        { label: 'RMA / Issues', value: `${filteredDevices.filter(d => d.status === 'RMA' || d.status === 'Defective').length} Units` },
      ],
    });
  };

  const handleExportSingleDevicePdf = () => {
    if (!activeDevice) return;

    const headers = ['Lifecycle Attribute', 'Details & Audit Value'];
    const rows = [
      ['Product Name', activeDevice.productName],
      ['Brand & Condition', `${activeDevice.brand} (${getConditionLabel(activeDevice.condition).label})`],
      ['IMEI 1', activeDevice.imei],
      ['IMEI 2', activeDevice.imei2 || 'N/A'],
      ['Serial Number', activeDevice.serialNumber || 'N/A'],
      ['Current Status', activeDevice.status],
      ['Purchase Cost', formatCurrency(activeDevice.costPrice, settings.currencySymbol)],
      ['Target / Sold Price', formatCurrency(activeDevice.sellingPrice, settings.currencySymbol)],
      ['Supplier Name', activeDevice.supplierName || 'Direct / Unknown'],
      ['Purchase Order Ref', activeDevice.purchaseOrderNumber || 'N/A'],
      ['Received Date', activeDevice.receivedDate ? activeDevice.receivedDate.slice(0, 10) : 'N/A'],
      ['Sold Customer', activeDevice.soldCustomerName || (activeDevice.status === 'Sold' ? 'Walk-in Customer' : 'Unsold')],
      ['Sales Invoice #', activeDevice.soldInvoiceNumber || 'N/A'],
      ['Sold Date', activeDevice.soldDate ? activeDevice.soldDate.slice(0, 10) : 'N/A'],
      ['RMA / Notes', activeDevice.notes || 'None recorded']
    ];

    exportReportToPdf({
      title: `IMEI Traceability Certificate - ${activeDevice.imei}`,
      subtitle: `${activeDevice.productName} [${activeDevice.brand}] - Lifecycle History Audit`,
      filename: `IMEI_Audit_${activeDevice.imei}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Status', value: activeDevice.status },
        { label: 'Cost Price', value: formatCurrency(activeDevice.costPrice, settings.currencySymbol) },
        { label: 'Selling Price', value: formatCurrency(activeDevice.sellingPrice, settings.currencySymbol) },
        { label: 'Gross Margin', value: formatCurrency(activeDevice.sellingPrice - activeDevice.costPrice, settings.currencySymbol) },
      ],
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Search & Filter Bar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                IMEI Traceability & Lifecycle Audit
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              End-to-end serialized unit tracking: Supplier PO, Cost, Stock aging, Sale Invoice, Customer & RMA history
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="imei-traceability-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 15-digit IMEI, Customer, PO, Invoice..."
              className="w-full pl-9.5 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-mono"
            />
          </div>
        </div>

        {/* Status Filters, Quick Counts & List Exports */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All IMEIs', count: allDevices.length },
              { id: 'In Stock', label: 'In Stock', count: allDevices.filter(d => d.status === 'In Stock').length },
              { id: 'Sold', label: 'Sold Units', count: allDevices.filter(d => d.status === 'Sold').length },
              { id: 'RMA', label: 'RMA & Returns', count: allDevices.filter(d => d.status === 'RMA').length },
              { id: 'Defective', label: 'Defective', count: allDevices.filter(d => d.status === 'Defective').length },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === f.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{f.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                  statusFilter === f.id ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleExportListCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              title="Export filtered IMEIs to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportListPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Export filtered IMEIs to PDF document"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Device Explorer List (Left 4) + Full Lifecycle Audit Timeline (Right 8) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Serialized Device Directory */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs flex flex-col h-[640px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 px-1">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Serialized Devices ({filteredDevices.length})
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Click to inspect</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 mt-1">
              {filteredDevices.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-bold">No serialized devices match query</p>
                  <p className="text-[11px] mt-1">Try another search term or clear filters</p>
                </div>
              ) : (
                filteredDevices.map((device) => {
                  const isSelected = activeDevice?.imei === device.imei;
                  return (
                    <div
                      key={device.imei}
                      onClick={() => setSelectedImei(device.imei)}
                      className={`p-3 rounded-2xl cursor-pointer transition-all my-1 ${
                        isSelected 
                          ? 'bg-indigo-50 border-2 border-indigo-500 shadow-2xs' 
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-slate-900 leading-snug truncate max-w-[210px]">
                            {device.productName}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] font-extrabold text-indigo-700">
                              {formatImei(device.imei)}
                            </span>
                            {device.specs && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                                {device.specs}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-black">
                          {device.status === 'In Stock' && <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">In Stock</span>}
                          {device.status === 'Sold' && <span className="text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">Sold</span>}
                          {device.status === 'RMA' && <span className="text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">RMA</span>}
                          {device.status === 'Defective' && <span className="text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">Defective</span>}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/80 text-[10px] text-slate-500">
                        <span>Cost: {formatCurrency(device.costPrice, settings.currencySymbol)}</span>
                        <span>{device.status === 'Sold' ? `Sold: ${device.soldDate?.slice(0, 10)}` : `Recv: ${device.receivedDate?.slice(0, 10)}`}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Full Complete Lifecycle Audit */}
        <div className="lg:col-span-7 space-y-4">
          {activeDevice ? (
            <div id="imei-lifecycle-printable-card" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-6">
              
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                      {activeDevice.brand}
                    </span>
                    {getStatusBadge(activeDevice.status)}
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 leading-tight">
                    {activeDevice.productName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600 font-mono">
                    <span className="font-bold text-indigo-700">IMEI 1: {activeDevice.imei}</span>
                    {activeDevice.imei2 && (
                      <span className="text-slate-500">| IMEI 2: {activeDevice.imei2}</span>
                    )}
                  </div>
                </div>

                {/* Quick Print, PDF & Barcode Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                  {matchedProduct && onOpenBarcodeModal && (
                    <button
                      type="button"
                      onClick={() => onOpenBarcodeModal(matchedProduct, activeDevice.imei)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-colors cursor-pointer border border-indigo-200"
                    >
                      <Barcode className="w-3.5 h-3.5" />
                      <span>Print Label</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportSingleDevicePdf}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                    title="Export single unit lifecycle certificate to PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>PDF Cert</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintCertificate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Audit</span>
                  </button>
                </div>
              </div>

              {/* Financial & Valuation Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Purchase Cost</span>
                  <p className="text-sm font-black text-slate-900 mt-0.5">
                    {formatCurrency(activeDevice.costPrice, settings.currencySymbol)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Selling Price</span>
                  <p className="text-sm font-black text-indigo-700 mt-0.5">
                    {formatCurrency(activeDevice.sellingPrice, settings.currencySymbol)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Gross Margin</span>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">
                    {formatCurrency(activeDevice.sellingPrice - activeDevice.costPrice, settings.currencySymbol)}
                    <span className="text-[10px] font-bold ml-1">
                      ({activeDevice.sellingPrice > 0 ? (((activeDevice.sellingPrice - activeDevice.costPrice) / activeDevice.sellingPrice) * 100).toFixed(0) : 0}%)
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Condition / Specs</span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                    {[getConditionLabel(activeDevice.condition), activeDevice.specs].filter(Boolean).join(' • ')}
                  </p>
                </div>
              </div>

              {/* Sequential Lifecycle Stages */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Device Traceability Lifecycle Flow</span>
                </h4>

                {/* Stage 1: Received from Supplier */}
                <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">1. Received / Inward Stock</span>
                      <span className="text-[11px] font-bold text-slate-500 font-mono">
                        {activeDevice.receivedDate ? new Date(activeDevice.receivedDate).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-bold uppercase">Supplier</span>
                        <span className="font-semibold text-slate-800">{activeDevice.supplierName || 'Authorized Distributor'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-bold uppercase">PO / Batch Ref</span>
                        <span className="font-mono font-bold text-indigo-700">{activeDevice.purchaseOrderNumber || 'PO-INITIAL-STOCK'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stage 2: Inventory Status & Storage */}
                <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">2. Inventory Status</span>
                      <span className="text-[11px] font-bold text-slate-600">
                        {activeDevice.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {activeDevice.status === 'In Stock' && 'Currently stored in retail glass display counter ready for immediate POS sale.'}
                      {activeDevice.status === 'Sold' && `Transferred from inventory to customer upon invoice #${activeDevice.soldInvoiceNumber} completion.`}
                      {activeDevice.status === 'RMA' && 'Device sent for warranty service / return to supplier due to reported technical defect.'}
                      {activeDevice.status === 'Defective' && 'Flagged as damaged during audit; isolated from sellable inventory.'}
                    </p>
                  </div>
                </div>

                {/* Stage 3: Customer Sale Out & Invoice */}
                <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs text-white ${
                    activeDevice.status === 'Sold' ? 'bg-blue-600' : 'bg-slate-300'
                  }`}>
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">3. Sale Out / Customer Record</span>
                      {activeDevice.soldDate && (
                        <span className="text-[11px] font-bold text-slate-500 font-mono">
                          {new Date(activeDevice.soldDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {activeDevice.status === 'Sold' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold uppercase">Customer</span>
                          <span className="font-semibold text-slate-900">{activeDevice.soldCustomerName || 'Walk-in Retail Buyer'}</span>
                          {activeDevice.soldCustomerPhone && (
                            <span className="block text-[11px] text-slate-500 font-mono">{activeDevice.soldCustomerPhone}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold uppercase">Sales Invoice</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-blue-700">{activeDevice.soldInvoiceNumber}</span>
                            {matchedSale && onViewInvoice && (
                              <button
                                type="button"
                                onClick={() => onViewInvoice(matchedSale)}
                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <span className="block text-[10px] text-slate-400">Handled by: {activeDevice.soldBy || 'Cashier'}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic mt-1">
                        Not yet sold. Device remains in store inventory.
                      </p>
                    )}
                  </div>
                </div>

                {/* Stage 4: Warranty & Service Record */}
                <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">4. Official Warranty Coverage</span>
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                        {activeDevice.warrantyMonths || 12} Months Official
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {activeDevice.warrantyExpiry ? (
                        <p>
                          Warranty valid until: <strong className="font-mono text-slate-900">{new Date(activeDevice.warrantyExpiry).toLocaleDateString()}</strong>
                          {' '}({new Date(activeDevice.warrantyExpiry) > new Date() ? '🟢 Active' : '🔴 Expired'})
                        </p>
                      ) : (
                        <p>Warranty activates upon retail sale invoice issue date.</p>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Event Audit Log */}
              {activeDevice.history && activeDevice.history.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                    Historical Audit Trail Log
                  </h4>
                  <div className="space-y-1.5">
                    {activeDevice.history.map((ev, i) => (
                      <div key={ev.id || i} className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800 capitalize mr-2">[{ev.action.replace(/_/g, ' ')}]</span>
                          <span className="text-slate-600">{ev.details}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {new Date(ev.timestamp).toLocaleDateString()} by {ev.performedBy}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center text-slate-400">
              <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-25" />
              <h3 className="text-sm font-black text-slate-700">No Device Selected</h3>
              <p className="text-xs text-slate-400 mt-1">Select an IMEI from the left table to inspect its full journey.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
