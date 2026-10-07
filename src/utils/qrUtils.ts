import { InvoiceCustomization, InvoicePaymentQrItem } from '../types';

/**
 * Generates an SVG Data URI for realistic Myanmar banking payment QR codes
 */
export function generateSampleQrSvg(type: string): string {
  const normalized = (type || 'kpay').toLowerCase();
  
  if (normalized.includes('wave')) {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <rect width="200" height="200" fill="#facc15" rx="16"/>
      <rect x="15" y="15" width="170" height="170" fill="#ffffff" rx="12"/>
      <rect x="28" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="128" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="136" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="142" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="28" y="128" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="136" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="142" width="16" height="16" fill="#0f172a"/>
      <rect x="85" y="85" width="30" height="30" fill="#eab308" rx="6"/>
      <text x="100" y="105" fill="#000000" font-family="Arial, sans-serif" font-weight="900" font-size="11" text-anchor="middle">WAVE</text>
      <rect x="85" y="28" width="12" height="32" fill="#0f172a"/>
      <rect x="105" y="45" width="14" height="15" fill="#0f172a"/>
      <rect x="128" y="85" width="40" height="12" fill="#0f172a"/>
      <rect x="85" y="128" width="22" height="44" fill="#0f172a"/>
      <rect x="128" y="145" width="44" height="22" fill="#0f172a"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }

  if (normalized.includes('aya')) {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <rect width="200" height="200" fill="#dc2626" rx="16"/>
      <rect x="15" y="15" width="170" height="170" fill="#ffffff" rx="12"/>
      <rect x="28" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="128" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="136" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="142" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="28" y="128" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="136" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="142" width="16" height="16" fill="#0f172a"/>
      <rect x="85" y="85" width="30" height="30" fill="#dc2626" rx="6"/>
      <text x="100" y="105" fill="#ffffff" font-family="Arial, sans-serif" font-weight="900" font-size="12" text-anchor="middle">AYA</text>
      <rect x="85" y="32" width="12" height="32" fill="#0f172a"/>
      <rect x="128" y="88" width="38" height="14" fill="#0f172a"/>
      <rect x="85" y="130" width="24" height="40" fill="#0f172a"/>
      <rect x="130" y="142" width="40" height="24" fill="#0f172a"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }

  if (normalized.includes('cb')) {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <rect width="200" height="200" fill="#ea580c" rx="16"/>
      <rect x="15" y="15" width="170" height="170" fill="#ffffff" rx="12"/>
      <rect x="28" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="128" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="136" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="142" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="28" y="128" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="136" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="142" width="16" height="16" fill="#0f172a"/>
      <rect x="85" y="85" width="30" height="30" fill="#ea580c" rx="6"/>
      <text x="100" y="105" fill="#ffffff" font-family="Arial, sans-serif" font-weight="900" font-size="13" text-anchor="middle">CB</text>
      <rect x="88" y="30" width="12" height="30" fill="#0f172a"/>
      <rect x="125" y="88" width="40" height="12" fill="#0f172a"/>
      <rect x="88" y="128" width="20" height="40" fill="#0f172a"/>
      <rect x="128" y="145" width="40" height="20" fill="#0f172a"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }

  if (normalized.includes('yoma')) {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <rect width="200" height="200" fill="#b91c1c" rx="16"/>
      <rect x="15" y="15" width="170" height="170" fill="#ffffff" rx="12"/>
      <rect x="28" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="128" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="136" y="36" width="28" height="28" fill="#ffffff"/>
      <rect x="142" y="42" width="16" height="16" fill="#0f172a"/>
      <rect x="28" y="128" width="44" height="44" fill="#0f172a" rx="4"/>
      <rect x="36" y="136" width="28" height="28" fill="#ffffff"/>
      <rect x="42" y="142" width="16" height="16" fill="#0f172a"/>
      <rect x="85" y="85" width="30" height="30" fill="#b91c1c" rx="6"/>
      <text x="100" y="105" fill="#ffffff" font-family="Arial, sans-serif" font-weight="900" font-size="11" text-anchor="middle">YOMA</text>
      <rect x="88" y="30" width="12" height="30" fill="#0f172a"/>
      <rect x="125" y="88" width="40" height="12" fill="#0f172a"/>
      <rect x="88" y="128" width="20" height="40" fill="#0f172a"/>
      <rect x="128" y="145" width="40" height="20" fill="#0f172a"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }

  // Default: KBZPay (KPay)
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" fill="#0284c7" rx="16"/>
    <rect x="15" y="15" width="170" height="170" fill="#ffffff" rx="12"/>
    <rect x="28" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
    <rect x="36" y="36" width="28" height="28" fill="#ffffff"/>
    <rect x="42" y="42" width="16" height="16" fill="#0f172a"/>
    <rect x="128" y="28" width="44" height="44" fill="#0f172a" rx="4"/>
    <rect x="136" y="36" width="28" height="28" fill="#ffffff"/>
    <rect x="142" y="42" width="16" height="16" fill="#0f172a"/>
    <rect x="28" y="128" width="44" height="44" fill="#0f172a" rx="4"/>
    <rect x="36" y="136" width="28" height="28" fill="#ffffff"/>
    <rect x="42" y="142" width="16" height="16" fill="#0f172a"/>
    <rect x="85" y="85" width="30" height="30" fill="#0284c7" rx="6"/>
    <text x="100" y="106" fill="#ffffff" font-family="Arial, sans-serif" font-weight="900" font-size="14" text-anchor="middle">K</text>
    <rect x="85" y="32" width="10" height="30" fill="#0f172a"/>
    <rect x="105" y="55" width="15" height="15" fill="#0f172a"/>
    <rect x="125" y="90" width="40" height="10" fill="#0f172a"/>
    <rect x="88" y="128" width="20" height="40" fill="#0f172a"/>
    <rect x="125" y="145" width="40" height="20" fill="#0f172a"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

/**
 * Resolves the active list of payment QRs with fallback to legacy single QR settings
 */
export function getActivePaymentQrs(
  custom?: Partial<InvoiceCustomization>,
  fallbackShopName = 'Shop Account',
  fallbackPhone = '09-798123456'
): InvoicePaymentQrItem[] {
  if (!custom || !custom.showQrCode) return [];

  if (custom.paymentQrs && custom.paymentQrs.length > 0) {
    const active = custom.paymentQrs.filter(q => q.isActive !== false && (q.qrImageUrl || q.name));
    if (active.length > 0) return active;
  }

  // Fallback to legacy single QR if present
  if (custom.qrImageUrl || custom.qrAccountNumber || custom.qrType) {
    const channelName = custom.qrType === 'wave' 
      ? 'WavePay' 
      : custom.qrType === 'aya' 
      ? 'AYA Bank' 
      : custom.qrType === 'cb' 
      ? 'CB Bank' 
      : custom.qrType === 'yoma'
      ? 'Yoma Bank'
      : 'KBZPay';

    return [{
      id: 'legacy-1',
      name: channelName,
      qrImageUrl: custom.qrImageUrl || generateSampleQrSvg(custom.qrType || 'kpay'),
      accountName: custom.qrAccountName || fallbackShopName,
      accountNumber: custom.qrAccountNumber || fallbackPhone,
      isActive: true,
    }];
  }

  // Default initial QRs: KBZPay & WavePay
  return [
    {
      id: 'kpay-default',
      name: 'KBZPay',
      qrImageUrl: generateSampleQrSvg('kpay'),
      accountName: `${fallbackShopName} (KPay)`,
      accountNumber: fallbackPhone,
      isActive: true,
    },
    {
      id: 'wave-default',
      name: 'WavePay',
      qrImageUrl: generateSampleQrSvg('wave'),
      accountName: `${fallbackShopName} (Wave)`,
      accountNumber: '09-974567890',
      isActive: true,
    }
  ];
}
