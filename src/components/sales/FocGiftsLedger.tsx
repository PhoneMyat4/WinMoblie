import React, { useState, useMemo } from 'react';
import { 
  Gift, 
  Search, 
  Calendar, 
  Download, 
  FileText, 
  Printer, 
  ExternalLink, 
  Tag, 
  DollarSign, 
  ShoppingBag, 
  Sparkles, 
  Plus, 
  Filter,
  CheckCircle2,
  Building2,
  Smartphone
} from 'lucide-react';
import { Sale, ShopSettings, FocDistributionRecord, StoreLocation } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { StorageService } from '../../utils/storage';

export interface UnifiedGiftRecord {
  id: string;
  sourceType: 'invoice_bundle' | 'standalone_giveaway';
  referenceNumber: string;
  date: string;
  productId?: string;
  productName: string;
  brand?: string;
  category?: string;
  quantity: number;
  unitCost: number;
  retailPrice: number;
  totalCost: number;
  totalRetailValue: number;
  reason: string;
  recipientName: string;
  recipientPhone?: string;
  issuedBy: string;
  imei?: string;
  notes?: string;
  accountingTreatment: string;
  originalSale?: Sale;
}

interface FocGiftsLedgerProps {
  sales: Sale[];
  settings: ShopSettings;
  onViewInvoice: (sale: Sale) => void;
  onOpenIssueGiftModal: () => void;
}

export const FocGiftsLedger: React.FC<FocGiftsLedgerProps> = ({
  sales,
  settings,
  onViewInvoice,
  onOpenIssueGiftModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'invoice_bundle' | 'standalone_giveaway'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState<FocDistributionRecord | null>(null);

  // Retrieve standalone distributions
  const standaloneRecords = useMemo(() => {
    return StorageService.getFocDistributions();
  }, [sales]);

  // Build unified gifts list
  const unifiedGifts: UnifiedGiftRecord[] = useMemo(() => {
    const list: UnifiedGiftRecord[] = [];

    // 1. From completed sales invoices
    sales
      .filter(s => s.status === 'completed')
      .forEach(sale => {
        sale.items.forEach((item, idx) => {
          if (item.isFoc) {
            const retailVal = item.originalPrice ?? (item.unitPrice || 0);
            const cost = item.costPrice || 0;
            list.push({
              id: `sale-foc-${sale.id}-${idx}`,
              sourceType: 'invoice_bundle',
              referenceNumber: sale.invoiceNumber,
              date: sale.date,
              productId: item.productId,
              productName: item.name,
              brand: item.brand,
              category: item.category,
              quantity: item.quantity,
              unitCost: cost,
              retailPrice: retailVal,
              totalCost: cost * item.quantity,
              totalRetailValue: retailVal * item.quantity,
              reason: item.focReason || 'Customer Promotional Gift',
              recipientName: sale.customerName || 'Walk-in Customer',
              recipientPhone: sale.customerPhone,
              issuedBy: sale.soldBy || 'Cashier',
              imei: item.imei,
              notes: `Included with Invoice #${sale.invoiceNumber}`,
              accountingTreatment: cost === 0 ? 'Supplier Bonus (0 Cost)' : 'Sales Incentive COGS',
              originalSale: sale,
            });
          }
        });
      });

    // 2. From standalone giveaways
    standaloneRecords.forEach(record => {
      list.push({
        id: record.id,
        sourceType: 'standalone_giveaway',
        referenceNumber: record.voucherNumber,
        date: record.date,
        productId: record.productId,
        productName: record.productName,
        brand: record.brand,
        category: record.category,
        quantity: record.quantity,
        unitCost: record.unitCost,
        retailPrice: record.originalPrice,
        totalCost: record.totalCost,
        totalRetailValue: record.totalRetailValue,
        reason: record.reason,
        recipientName: record.recipientName,
        recipientPhone: record.recipientPhone,
        issuedBy: record.issuedBy,
        imei: record.imei,
        notes: record.notes,
        accountingTreatment: record.expensedInAccounting 
          ? 'Expensed to Marketing' 
          : (record.unitCost === 0 ? 'Bonus Stock (0 Cost)' : 'Inventory Discharged'),
      });
    });

    // Sort by latest first
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, standaloneRecords]);

  // Date filtering helper
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const filteredGifts = useMemo(() => {
    return unifiedGifts.filter(gift => {
      // Search
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        !q ||
        gift.productName.toLowerCase().includes(q) ||
        gift.referenceNumber.toLowerCase().includes(q) ||
        gift.recipientName.toLowerCase().includes(q) ||
        (gift.recipientPhone && gift.recipientPhone.includes(q)) ||
        gift.reason.toLowerCase().includes(q) ||
        (gift.imei && gift.imei.includes(q));

      // Source Filter
      const matchesSource = sourceFilter === 'all' || gift.sourceType === sourceFilter;

      // Date Filter
      let matchesDate = true;
      if (dateFilter === 'today') {
        matchesDate = gift.date.startsWith(todayStr);
      } else if (dateFilter === 'yesterday') {
        matchesDate = gift.date.startsWith(yesterdayStr);
      } else if (dateFilter === 'week') {
        const giftTime = new Date(gift.date).getTime();
        matchesDate = (now.getTime() - giftTime) <= 7 * 86400000;
      } else if (dateFilter === 'month') {
        const gDate = new Date(gift.date);
        matchesDate = gDate.getMonth() === now.getMonth() && gDate.getFullYear() === now.getFullYear();
      }

      return matchesSearch && matchesSource && matchesDate;
    });
  }, [unifiedGifts, searchQuery, sourceFilter, dateFilter, todayStr, yesterdayStr]);

  // Metric Aggregations
  const totalUnitsGiven = filteredGifts.reduce((acc, g) => acc + g.quantity, 0);
  const totalCustomerSavings = filteredGifts.reduce((acc, g) => acc + g.totalRetailValue, 0);
  const totalShopCost = filteredGifts.reduce((acc, g) => acc + g.totalCost, 0);
  const invoiceGiftsCount = filteredGifts.filter(g => g.sourceType === 'invoice_bundle').length;
  const standaloneGiftsCount = filteredGifts.filter(g => g.sourceType === 'standalone_giveaway').length;

  const handleExportCsv = () => {
    const headers = [
      'Type',
      'Reference / Voucher #',
      'Date & Time',
      'Item Name',
      'Brand',
      'Category',
      'Quantity',
      'Normal Retail Price',
      'Store Cost Price',
      'Total Gift Retail Value',
      'Total Store Cost',
      'Reason / Campaign',
      'Recipient Name',
      'Recipient Phone',
      'Issued By',
      'IMEI / Serial',
      'Accounting Treatment'
    ];

    const rows = filteredGifts.map(g => [
      g.sourceType === 'invoice_bundle' ? 'Invoice Bundle' : 'Standalone Giveaway',
      g.referenceNumber,
      formatDateTime(g.date),
      `"${g.productName.replace(/"/g, '""')}"`,
      g.brand || '',
      g.category || '',
      g.quantity,
      g.retailPrice,
      g.unitCost,
      g.totalRetailValue,
      g.totalCost,
      `"${g.reason.replace(/"/g, '""')}"`,
      `"${g.recipientName.replace(/"/g, '""')}"`,
      g.recipientPhone || '',
      `"${g.issuedBy.replace(/"/g, '""')}"`,
      g.imei || '',
      `"${g.accountingTreatment}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `foc_gifts_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Action Bar */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-purple-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
              <Gift className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">
                  FOC &amp; Promotional Gifts Ledger
                </h2>
                <span className="text-[10px] bg-purple-500/30 text-purple-200 border border-purple-400/40 font-bold px-2 py-0.5 rounded-full">
                  လက်ဆောင်စာရင်း
                </span>
              </div>
              <p className="text-xs text-purple-200/80 mt-0.5">
                Audit trail for invoice bundle freebies, customer loyalty rewards, and standalone promotional giveaways.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-purple-300" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onOpenIssueGiftModal}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Issue New Gift</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gift Units Given */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Gifts Given</span>
            <Gift className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {totalUnitsGiven.toLocaleString()} <span className="text-xs font-bold text-slate-500">Units</span>
          </p>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
            <span className="text-indigo-600 font-bold">{invoiceGiftsCount} bundle</span>
            <span>•</span>
            <span className="text-purple-600 font-bold">{standaloneGiftsCount} standalone</span>
          </div>
        </div>

        {/* Total Customer Retail Value Saved */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Customer Value Saved</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono">
            {formatCurrency(totalCustomerSavings, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Retail value given to customers free</p>
        </div>

        {/* Total Cost to Store */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total Shop Cost (COGS/Exp)</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-700 font-mono">
            {formatCurrency(totalShopCost, settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Direct store procurement cost</p>
        </div>

        {/* Net Customer Benefit Ratio */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Customer Benefit Spread</span>
            <Tag className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-700 font-mono">
            +{formatCurrency(Math.max(0, totalCustomerSavings - totalShopCost), settings.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Perceived marketing goodwill bonus</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full lg:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Item, Voucher #, Recipient, IMEI, or Reason..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto justify-end">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-hidden"
          >
            <option value="all">All Gift Sources</option>
            <option value="invoice_bundle">Invoice Bundle Freebies</option>
            <option value="standalone_giveaway">Standalone Giveaways</option>
          </select>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(['all', 'today', 'yesterday', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDateFilter(range)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                  dateFilter === range
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gifts Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredGifts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-30 text-purple-600" />
            <p className="text-sm font-bold text-slate-600">No FOC gift transactions found</p>
            <p className="text-xs text-slate-400 mt-1">
              Items given away free at checkout or through standalone giveaways will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Ref / Voucher</th>
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Gift Product</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Normal Value</th>
                  <th className="py-3 px-4 text-right">Store Cost</th>
                  <th className="py-3 px-4">Reason / Campaign</th>
                  <th className="py-3 px-4">Recipient / Customer</th>
                  <th className="py-3 px-4">Issued By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGifts.map((gift) => (
                  <tr key={gift.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Voucher / Invoice # */}
                    <td className="py-3 px-4 font-mono font-bold">
                      {gift.sourceType === 'invoice_bundle' && gift.originalSale ? (
                        <button
                          type="button"
                          onClick={() => onViewInvoice(gift.originalSale!)}
                          className="text-indigo-600 hover:text-indigo-900 underline flex items-center gap-1 cursor-pointer"
                          title="Click to view sales invoice"
                        >
                          <FileText className="w-3 h-3" />
                          <span>{gift.referenceNumber}</span>
                        </button>
                      ) : (
                        <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1">
                          <Gift className="w-3 h-3 text-purple-600" />
                          <span>{gift.referenceNumber}</span>
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {formatDateTime(gift.date)}
                    </td>

                    {/* Source */}
                    <td className="py-3 px-4">
                      {gift.sourceType === 'invoice_bundle' ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded-full font-bold text-[10px] border border-blue-200">
                          Sale Bundle
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-800 rounded-full font-bold text-[10px] border border-purple-200">
                          Standalone PR
                        </span>
                      )}
                    </td>

                    {/* Product Name */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{gift.productName}</div>
                      {gift.imei && (
                        <span className="text-[10px] font-mono text-indigo-600 block mt-0.5">
                          IMEI: {gift.imei}
                        </span>
                      )}
                      {gift.brand && (
                        <span className="text-[10px] text-slate-400 block">{gift.brand}</span>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="py-3 px-4 text-center font-bold text-slate-800">
                      {gift.quantity}
                    </td>

                    {/* Normal Value */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(gift.totalRetailValue, settings.currencySymbol)}
                    </td>

                    {/* Store Cost */}
                    <td className="py-3 px-4 text-right font-mono text-slate-500">
                      {gift.totalCost > 0 ? (
                        <span>{formatCurrency(gift.totalCost, settings.currencySymbol)}</span>
                      ) : (
                        <span className="text-slate-400 italic">0 Ks (Bonus)</span>
                      )}
                    </td>

                    {/* Reason */}
                    <td className="py-3 px-4">
                      <span className="text-slate-800 font-medium block max-w-xs">{gift.reason}</span>
                      <span className="text-[10px] text-slate-400 italic block mt-0.5">
                        {gift.accountingTreatment}
                      </span>
                    </td>

                    {/* Recipient */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{gift.recipientName}</div>
                      {gift.recipientPhone && (
                        <div className="text-[10px] font-mono text-slate-500">{gift.recipientPhone}</div>
                      )}
                    </td>

                    {/* Issued By */}
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-medium">{gift.issuedBy}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
