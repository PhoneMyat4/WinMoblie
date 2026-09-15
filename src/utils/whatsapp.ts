import { Sale, ShopSettings } from '../types';
import { formatCurrency, formatDate, formatImei, formatSalePaymentBreakdown } from './formatters';

export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

export function generateWhatsAppSaleMessage(sale: Sale, settings: ShopSettings): string {
  const itemsText = sale.items.map((item, idx) => {
    let line = `${idx + 1}. *${item.name}* (x${item.quantity}) - ${formatCurrency(item.finalPrice, settings.currencySymbol)}`;
    if (item.imei) {
      line += `\n   📱 IMEI: \`${item.imei}\``;
      if (item.imei2) line += ` | IMEI2: \`${item.imei2}\``;
    }
    if (item.warrantyPeriod && item.warrantyPeriod !== 'No Warranty') {
      line += `\n   🛡️ Warranty: ${item.warrantyPeriod}`;
    }
    return line;
  }).join('\n');

  const paymentDesc = formatSalePaymentBreakdown(sale, settings.currencySymbol);

  return `🧾 *RECEIPT: ${sale.invoiceNumber}*
🏪 *${settings.shopName}*
📍 ${settings.address}, ${settings.cityCountry}
📞 Tel: ${settings.phone} ${settings.viberNumber ? `| Viber: ${settings.viberNumber}` : ''}
━━━━━━━━━━━━━━━━━━
👤 *Customer:* ${sale.customerName} (${sale.customerPhone || 'Walk-in'})
📅 *Date:* ${formatDate(sale.date)}
━━━━━━━━━━━━━━━━━━
🛍️ *PURCHASED ITEMS:*
${itemsText}
━━━━━━━━━━━━━━━━━━
Subtotal: ${formatCurrency(sale.subtotal, settings.currencySymbol)}
${sale.discountTotal > 0 ? `Discount: -${formatCurrency(sale.discountTotal, settings.currencySymbol)}\n` : ''}${sale.taxTotal > 0 ? `Tax (${sale.taxRate}%): ${formatCurrency(sale.taxTotal, settings.currencySymbol)}\n` : ''}💰 *TOTAL PAID: ${formatCurrency(sale.amountPaid, settings.currencySymbol)}* (${paymentDesc})
${sale.balanceDue > 0 ? `⚠️ Balance Due: ${formatCurrency(sale.balanceDue, settings.currencySymbol)}\n` : ''}
${settings.warrantyPolicy ? `🛡️ *Warranty Policy:* ${settings.warrantyPolicy}\n` : ''}
🙏 ${settings.receiptFooterMessage || 'Thank you for shopping with us!'}`;
}

export function openWhatsAppChat(phone: string, text: string) {
  let cleanPhone = cleanPhoneNumber(phone);
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.replace(/^0/, '');
  }
  const encodedText = encodeURIComponent(text);
  const url = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  window.open(url, '_blank');
}
