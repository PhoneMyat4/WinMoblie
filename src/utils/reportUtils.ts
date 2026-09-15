import { Sale, Product, Customer, ProductCategory, PaymentMethod } from '../types';
import { canonicalCategory } from '../data/categoryTaxonomy';

export type TimeframePreset = 
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_month'
  | 'last_30_days'
  | 'last_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

export function getDateRangeBounds(
  preset: TimeframePreset,
  customStartStr?: string,
  customEndStr?: string
): DateRange {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today': {
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(now),
        label: 'Today',
      };
    }
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return {
        startDate: startOfDay(yesterday),
        endDate: endOfDay(yesterday),
        label: 'Yesterday',
      };
    }
    case 'last_7_days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return {
        startDate: startOfDay(start),
        endDate: endOfDay(now),
        label: 'Last 7 Days',
      };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {
        startDate: start,
        endDate: endOfDay(now),
        label: 'This Month',
      };
    }
    case 'last_30_days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return {
        startDate: startOfDay(start),
        endDate: endOfDay(now),
        label: 'Last 30 Days',
      };
    }
    case 'last_month': {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        startDate: firstDayLastMonth,
        endDate: lastDayLastMonth,
        label: 'Last Month',
      };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return {
        startDate: start,
        endDate: endOfDay(now),
        label: 'This Year (YTD)',
      };
    }
    case 'all_time': {
      return {
        startDate: new Date(2020, 0, 1, 0, 0, 0, 0),
        endDate: new Date(2030, 11, 31, 23, 59, 59, 999),
        label: 'All Time History',
      };
    }
    case 'custom': {
      if (customStartStr && customEndStr) {
        const start = new Date(customStartStr);
        const end = new Date(customEndStr);
        return {
          startDate: startOfDay(start),
          endDate: endOfDay(end),
          label: `${customStartStr} to ${customEndStr}`,
        };
      }
      // default to last 30 days if not set
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return {
        startDate: startOfDay(start),
        endDate: endOfDay(now),
        label: 'Custom Range',
      };
    }
    default:
      return {
        startDate: startOfDay(now),
        endDate: endOfDay(now),
        label: 'Today',
      };
  }
}

export function filterSalesByTimeframe(
  sales: Sale[],
  startDate: Date,
  endDate: Date
): Sale[] {
  return sales.filter((sale) => {
    const saleDate = new Date(sale.date);
    return saleDate >= startDate && saleDate <= endDate;
  });
}

export interface SoldItemAggregate {
  productId: string;
  name: string;
  brand: string;
  category: ProductCategory;
  unitsSold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMarginPercent: number;
  averagePrice: number;
  currentStock: number;
  minStockAlert: number;
  condition: string;
  hasImei: boolean;
  orderCount: number;
}

export function computeMostSoldItems(
  sales: Sale[],
  products: Product[],
  categoryFilter: string = 'all'
): SoldItemAggregate[] {
  const itemMap = new Map<string, {
    productId: string;
    name: string;
    brand: string;
    category: ProductCategory;
    unitsSold: number;
    totalRevenue: number;
    totalCost: number;
    orderCount: number;
  }>();

  sales.forEach((sale) => {
    // Only completed sales count for best sellers (or reduce for refunds)
    if (sale.status === 'completed') {
      sale.items.forEach((item) => {
        const itemCanonical = canonicalCategory(item.category);
        if (categoryFilter !== 'all' && itemCanonical !== canonicalCategory(categoryFilter)) {
          return;
        }

        const key = item.productId || item.name;
        const existing = itemMap.get(key);
        const rev = item.finalPrice || (item.unitPrice * item.quantity - item.discount);
        const cost = (item.costPrice || 0) * item.quantity;

        if (existing) {
          existing.unitsSold += item.quantity;
          existing.totalRevenue += rev;
          existing.totalCost += cost;
          existing.orderCount += 1;
        } else {
          itemMap.set(key, {
            productId: item.productId,
            name: item.name,
            brand: item.brand,
            category: itemCanonical,
            unitsSold: item.quantity,
            totalRevenue: rev,
            totalCost: cost,
            orderCount: 1,
          });
        }
      });
    }
  });

  const results: SoldItemAggregate[] = [];
  const prodMap = new Map<string, Product>();
  products.forEach(p => prodMap.set(p.id, p));

  itemMap.forEach((val) => {
    const matchedProduct = prodMap.get(val.productId) || products.find(p => p.name.toLowerCase() === val.name.toLowerCase());
    const grossProfit = val.totalRevenue - val.totalCost;
    const profitMarginPercent = val.totalRevenue > 0 ? (grossProfit / val.totalRevenue) * 100 : 0;
    const averagePrice = val.unitsSold > 0 ? val.totalRevenue / val.unitsSold : 0;

    results.push({
      productId: val.productId,
      name: val.name,
      brand: val.brand || matchedProduct?.brand || 'Unknown',
      category: val.category || matchedProduct?.category || 'accessories',
      unitsSold: val.unitsSold,
      totalRevenue: val.totalRevenue,
      totalCost: val.totalCost,
      grossProfit,
      profitMarginPercent,
      averagePrice,
      currentStock: matchedProduct ? matchedProduct.stock : 0,
      minStockAlert: matchedProduct ? matchedProduct.minStockAlert : 0,
      condition: matchedProduct ? matchedProduct.condition : 'brand_new',
      hasImei: matchedProduct ? Boolean(matchedProduct.imeiList && matchedProduct.imeiList.length > 0) : false,
      orderCount: val.orderCount,
    });
  });

  // Default sort by units sold descending
  return results.sort((a, b) => b.unitsSold - a.unitsSold);
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCsv = (str: string | number) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
