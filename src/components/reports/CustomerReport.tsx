import React, { useState, useMemo } from 'react';
import { 
  Users, 
  DollarSign, 
  Award, 
  Search, 
  Download, 
  Star, 
  Calendar, 
  ShoppingBag, 
  Eye, 
  X, 
  Phone, 
  MapPin, 
  ArrowUpDown, 
  TrendingUp,
  UserCheck,
  FileText
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { Customer, Sale, ShopSettings } from '../../types';
import { exportToCsv } from '../../utils/reportUtils';
import { exportReportToPdf } from '../../utils/pdfExportUtils';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { ColumnVisibilityFilter, ColumnDefinition } from '../common/ColumnVisibilityFilter';

const CUSTOMER_REPORT_COLUMNS: ColumnDefinition[] = [
  { id: 'customer_name', label: 'Customer Name', required: true },
  { id: 'contact_location', label: 'Contact & Location' },
  { id: 'orders', label: 'Orders in Period' },
  { id: 'period_spent', label: 'Spent in Period' },
  { id: 'lifetime_spend', label: 'Lifetime Spend' },
  { id: 'loyalty_points', label: 'Loyalty Points' },
  { id: 'last_purchase', label: 'Last Purchase' },
  { id: 'invoices', label: 'Invoices Action' },
];

interface CustomerReportProps {
  customers: Customer[];
  sales: Sale[];
  settings: ShopSettings;
  timeframeLabel: string;
}

export const CustomerReport: React.FC<CustomerReportProps> = ({
  customers,
  sales,
  settings,
  timeframeLabel,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<(Customer & { invoices?: Sale[] }) | null>(null);
  const [sortField, setSortField] = useState<'periodSpent' | 'periodOrders' | 'totalSpent' | 'loyaltyPoints'>('periodSpent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Column Visibility Filter State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('cust_report_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      customer_name: true,
      contact_location: true,
      orders: true,
      period_spent: true,
      lifetime_spend: true,
      loyalty_points: true,
      last_purchase: true,
      invoices: true,
    };
  });

  const handleColumnChange = (updated: Record<string, boolean>) => {
    setVisibleColumns(updated);
    try {
      localStorage.setItem('cust_report_visible_columns', JSON.stringify(updated));
    } catch {}
  };

  const activeColumnCount = useMemo(() => {
    return CUSTOMER_REPORT_COLUMNS.filter(c => visibleColumns[c.id] !== false).length;
  }, [visibleColumns]);

  // Customer activity aggregated for this specific timeframe
  const customerActivity = useMemo(() => {
    const map = new Map<string, {
      customerId?: string;
      name: string;
      phone: string;
      periodSpent: number;
      periodOrders: number;
      lastDate: string;
      invoices: Sale[];
    }>();

    sales.forEach((s) => {
      if (s.status === 'completed') {
        const key = s.customerId || s.customerPhone || s.customerName;
        const existing = map.get(key) || {
          customerId: s.customerId,
          name: s.customerName,
          phone: s.customerPhone,
          periodSpent: 0,
          periodOrders: 0,
          lastDate: s.date,
          invoices: [],
        };

        existing.periodSpent += s.grandTotal;
        existing.periodOrders += 1;
        existing.invoices.push(s);
        if (new Date(s.date) > new Date(existing.lastDate)) {
          existing.lastDate = s.date;
        }
        map.set(key, existing);
      }
    });

    // Merge with known customer records
    const list = Array.from(map.values()).map((act) => {
      const known = customers.find(c => (act.customerId && c.id === act.customerId) || c.phone === act.phone);
      return {
        id: known?.id || act.customerId || act.phone,
        name: known?.name || act.name,
        phone: known?.phone || act.phone,
        address: known?.address || '-',
        nrcNumber: known?.nrcNumber || '-',
        periodSpent: act.periodSpent,
        periodOrders: act.periodOrders,
        totalSpent: known?.totalSpent || act.periodSpent,
        totalVisits: known?.totalVisits || act.periodOrders,
        loyaltyPoints: known?.loyaltyPoints || Math.floor(act.periodSpent / 1000),
        lastVisitDate: act.lastDate,
        invoices: act.invoices,
        notes: known?.notes,
      };
    });

    return list;
  }, [sales, customers]);

  // Filter & sort
  const filteredCustomers = useMemo(() => {
    return customerActivity
      .filter((c) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.nrcNumber.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        return sortOrder === 'desc' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
      });
  }, [customerActivity, searchQuery, sortField, sortOrder]);

  // Overview metrics
  const stats = useMemo(() => {
    const totalActive = customerActivity.length;
    const totalPeriodSpend = customerActivity.reduce((acc, c) => acc + c.periodSpent, 0);
    const repeatBuyers = customerActivity.filter(c => c.periodOrders > 1 || c.totalVisits > 1).length;
    const repeatRate = totalActive > 0 ? (repeatBuyers / totalActive) * 100 : 0;
    const avgSpendPerCustomer = totalActive > 0 ? totalPeriodSpend / totalActive : 0;
    const totalPoints = customerActivity.reduce((acc, c) => acc + c.loyaltyPoints, 0);

    return {
      totalActive,
      totalPeriodSpend,
      repeatBuyers,
      repeatRate,
      avgSpendPerCustomer,
      totalPoints,
      topCustomer: customerActivity.length > 0 ? [...customerActivity].sort((a, b) => b.periodSpent - a.periodSpent)[0] : null,
    };
  }, [customerActivity]);

  // Chart data: Top 7 Spenders
  const topSpendersChartData = useMemo(() => {
    return [...customerActivity]
      .sort((a, b) => b.periodSpent - a.periodSpent)
      .slice(0, 6)
      .map(c => ({
        name: c.name.length > 15 ? c.name.substring(0, 13) + '…' : c.name,
        spent: c.periodSpent,
        orders: c.periodOrders,
      }));
  }, [customerActivity]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getExportData = () => {
    const headers: string[] = [];

    if (visibleColumns.customer_name !== false) {
      headers.push('Customer Name', 'NRC Number');
    }
    if (visibleColumns.contact_location !== false) {
      headers.push('Phone Number', 'Address');
    }
    if (visibleColumns.orders !== false) {
      headers.push('Orders in Period', 'Lifetime Total Visits');
    }
    if (visibleColumns.period_spent !== false) {
      headers.push(`Period Spend (${settings.currencySymbol})`);
    }
    if (visibleColumns.lifetime_spend !== false) {
      headers.push(`Lifetime Spend (${settings.currencySymbol})`);
    }
    if (visibleColumns.loyalty_points !== false) {
      headers.push('Loyalty Points');
    }
    if (visibleColumns.last_purchase !== false) {
      headers.push('Last Purchase Date');
    }

    const rows = filteredCustomers.map((c) => {
      const row: (string | number)[] = [];

      if (visibleColumns.customer_name !== false) {
        row.push(c.name, c.nrcNumber || '-');
      }
      if (visibleColumns.contact_location !== false) {
        row.push(c.phone, c.address || '-');
      }
      if (visibleColumns.orders !== false) {
        row.push(c.periodOrders, c.totalVisits);
      }
      if (visibleColumns.period_spent !== false) {
        row.push(c.periodSpent);
      }
      if (visibleColumns.lifetime_spend !== false) {
        row.push(c.totalSpent);
      }
      if (visibleColumns.loyalty_points !== false) {
        row.push(c.loyaltyPoints);
      }
      if (visibleColumns.last_purchase !== false) {
        row.push(formatDateTime(c.lastVisitDate));
      }

      return row;
    });

    return { headers, rows };
  };

  const handleExportCsv = () => {
    const { headers, rows } = getExportData();
    exportToCsv(`Customer_Report_${timeframeLabel.replace(/\s+/g, '_')}`, headers, rows);
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    exportReportToPdf({
      title: 'Customer Purchase & CRM Activity Report',
      subtitle: `Shopper transaction history, lifetime value, and loyalty performance`,
      timeframeLabel,
      filename: `Customer_Report_${timeframeLabel.replace(/\s+/g, '_')}`,
      headers,
      rows,
      settings,
      summaryMetrics: [
        { label: 'Active Customers', value: `${stats.totalActive} Shoppers` },
        { label: 'Period Spend', value: formatCurrency(stats.totalPeriodSpend, settings.currencySymbol) },
        { label: 'Repeat Shoppers', value: `${stats.repeatBuyers} (${stats.repeatRate.toFixed(1)}%)` },
        { label: 'Avg Spend/Customer', value: formatCurrency(stats.avgSpendPerCustomer, settings.currencySymbol) },
      ],
    });
  };

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1'];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Executive CRM Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Customers</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {stats.totalActive} <span className="text-sm font-semibold text-slate-500">Shoppers</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Transacted in {timeframeLabel}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Repeat Shopper Rate</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-purple-700 tracking-tight">
              {stats.repeatRate.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {stats.repeatBuyers} Returning loyal customers
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg Spend / Customer</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {formatCurrency(stats.avgSpendPerCustomer, settings.currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Average basket value in timeframe
            </p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">#1 Top Spender</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            {stats.topCustomer ? (
              <>
                <div className="text-base font-black text-slate-900 truncate">
                  {stats.topCustomer.name}
                </div>
                <p className="text-xs text-emerald-700 font-bold mt-1">
                  Spent {formatCurrency(stats.topCustomer.periodSpent, settings.currencySymbol)} ({stats.topCustomer.periodOrders} orders)
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-400">No transactions in this period</p>
            )}
          </div>
        </div>

      </div>

      {/* Visual Top Spenders Bar Chart */}
      {topSpendersChartData.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Top Spending Customers Leaderboard ({timeframeLabel})
              </h3>
              <p className="text-xs text-slate-500">Highest gross expenditure by customer profile</p>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSpendersChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                  formatter={(val: any) => [formatCurrency(Number(val), settings.currencySymbol), 'Spend in Period']}
                />
                <Bar dataKey="spent" radius={[6, 6, 0, 0]}>
                  {topSpendersChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Control Bar: Search & Export */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name, phone, address, NRC..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            title="Export to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
            title="Export to PDF document"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>

      </div>

      {/* Main Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Customer Purchase Ledger ({filteredCustomers.length} Shoppers)
            </h3>
            <p className="text-xs text-slate-500">Transaction volume, spending, loyalty points, and purchase history</p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <ColumnVisibilityFilter
              columns={CUSTOMER_REPORT_COLUMNS}
              visibleColumns={visibleColumns}
              onChange={handleColumnChange}
              onReset={() => handleColumnChange({
                customer_name: true,
                contact_location: true,
                orders: true,
                period_spent: true,
                lifetime_spend: true,
                loyalty_points: true,
                last_purchase: true,
                invoices: true,
              })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 text-slate-700 uppercase font-extrabold text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                {visibleColumns.customer_name !== false && <th className="py-3 px-4">Customer Name</th>}
                {visibleColumns.contact_location !== false && <th className="py-3 px-4">Contact & Location</th>}
                {visibleColumns.orders !== false && (
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('periodOrders')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Orders in Period</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.period_spent !== false && (
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('periodSpent')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Spent in Period</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.lifetime_spend !== false && (
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('totalSpent')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Lifetime Spend</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.loyalty_points !== false && (
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors"
                    onClick={() => handleSort('loyaltyPoints')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Loyalty Points</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}
                {visibleColumns.last_purchase !== false && <th className="py-3 px-4 text-center">Last Purchase</th>}
                {visibleColumns.invoices !== false && <th className="py-3 px-4 text-center">Invoices</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={activeColumnCount || 8} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Name */}
                    {visibleColumns.customer_name !== false && (
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{cust.name}</div>
                        {cust.nrcNumber !== '-' && (
                          <div className="text-[10px] text-slate-400 mt-0.5">NRC: {cust.nrcNumber}</div>
                        )}
                      </td>
                    )}

                    {/* Contact & Location */}
                    {visibleColumns.contact_location !== false && (
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {cust.phone}
                        </div>
                        {cust.address !== '-' && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[160px]">{cust.address}</span>
                          </div>
                        )}
                      </td>
                    )}

                    {/* Orders in Period */}
                    {visibleColumns.orders !== false && (
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-black text-sm text-slate-900">{cust.periodOrders}</span>
                        <div className="text-[10px] text-slate-400">Lifetime: {cust.totalVisits}</div>
                      </td>
                    )}

                    {/* Period Spend */}
                    {visibleColumns.period_spent !== false && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-black text-sm text-emerald-700">
                          {formatCurrency(cust.periodSpent, settings.currencySymbol)}
                        </div>
                      </td>
                    )}

                    {/* Lifetime Spend */}
                    {visibleColumns.lifetime_spend !== false && (
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                        {formatCurrency(cust.totalSpent, settings.currencySymbol)}
                      </td>
                    )}

                    {/* Loyalty Points */}
                    {visibleColumns.loyalty_points !== false && (
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-xs border border-amber-200">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                          {cust.loyaltyPoints.toLocaleString()}
                        </span>
                      </td>
                    )}

                    {/* Last Purchase */}
                    {visibleColumns.last_purchase !== false && (
                      <td className="py-3.5 px-4 text-center font-mono text-[11px] text-slate-500">
                        {formatDateTime(cust.lastVisitDate)}
                      </td>
                    )}

                    {/* Action */}
                    {visibleColumns.invoices !== false && (
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomer(cust as any)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="View customer invoices"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    )}

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-modal-content">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-black text-slate-900">{selectedCustomer.name}</h4>
                <p className="text-xs text-slate-500">{selectedCustomer.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              
              {/* Profile summary */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 font-bold">Lifetime Expenditure</span>
                  <div className="font-black text-slate-900 text-sm">{formatCurrency(selectedCustomer.totalSpent, settings.currencySymbol)}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">Loyalty Points Balance</span>
                  <div className="font-black text-amber-600 text-sm">{selectedCustomer.loyaltyPoints} Points</div>
                </div>
              </div>

              {/* Transactions in Period */}
              <div>
                <span className="text-xs font-bold text-slate-700 mb-2 block">
                  Purchases in Selected Period ({selectedCustomer.invoices?.length || 0}):
                </span>
                <div className="space-y-2">
                  {selectedCustomer.invoices?.map((inv: Sale) => (
                    <div key={inv.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className="font-mono text-slate-900">{inv.invoiceNumber}</span>
                        <span className="text-emerald-700">{formatCurrency(inv.grandTotal, settings.currencySymbol)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {inv.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5 pt-1 border-t border-slate-200/60">
                        <span>{formatDateTime(inv.date)}</span>
                        <span className="uppercase font-semibold text-slate-600">{inv.paymentMethod}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="w-full py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
