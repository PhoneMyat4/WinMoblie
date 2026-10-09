import { InvoiceCustomization, InvoiceSectionKey, InvoiceSectionStyle } from '../types';

export const DEFAULT_INVOICE_SECTION_ORDER: InvoiceSectionKey[] = [
  'logo_header',
  'customer_tx_info',
  'items_table',
  'financial_totals',
  'payment_qrs',
  'warranty_policy',
  'signatures',
  'footer_note',
];

export const DEFAULT_INVOICE_SECTION_STYLES: Record<InvoiceSectionKey, Required<InvoiceSectionStyle>> = {
  logo_header: {
    visible: true,
    alignment: 'center',
    boxStyle: 'plain',
    spacing: 'normal',
    fontSize: 'normal',
  },
  customer_tx_info: {
    visible: true,
    alignment: 'left',
    boxStyle: 'plain',
    spacing: 'compact',
    fontSize: 'normal',
  },
  items_table: {
    visible: true,
    alignment: 'left',
    boxStyle: 'plain',
    spacing: 'normal',
    fontSize: 'normal',
  },
  financial_totals: {
    visible: true,
    alignment: 'right',
    boxStyle: 'plain',
    spacing: 'normal',
    fontSize: 'normal',
  },
  payment_qrs: {
    visible: true,
    alignment: 'center',
    boxStyle: 'plain',
    spacing: 'normal',
    fontSize: 'normal',
  },
  warranty_policy: {
    visible: true,
    alignment: 'left',
    boxStyle: 'plain',
    spacing: 'compact',
    fontSize: 'small',
  },
  signatures: {
    visible: true,
    alignment: 'center',
    boxStyle: 'plain',
    spacing: 'normal',
    fontSize: 'normal',
  },
  footer_note: {
    visible: true,
    alignment: 'center',
    boxStyle: 'plain',
    spacing: 'compact',
    fontSize: 'small',
  },
};

export interface SectionMeta {
  key: InvoiceSectionKey;
  title: string;
  shortLabel: string;
  description: string;
  iconName: 'store' | 'user' | 'shopping-bag' | 'dollar-sign' | 'qr-code' | 'shield-check' | 'pen-tool' | 'sparkles';
  tag: string;
}

export const INVOICE_SECTIONS_META: Record<InvoiceSectionKey, SectionMeta> = {
  logo_header: {
    key: 'logo_header',
    title: 'Store Branding & Header',
    shortLabel: 'Header & Logo',
    description: 'Shop logo image, store title, subtitle, address, hotline & social accounts',
    iconName: 'store',
    tag: 'Branding',
  },
  customer_tx_info: {
    key: 'customer_tx_info',
    title: 'Customer & Transaction Info',
    shortLabel: 'Customer Info',
    description: 'Invoice number, date/time, customer name & phone, cashier operator & payment breakdown',
    iconName: 'user',
    tag: 'Metadata',
  },
  items_table: {
    key: 'items_table',
    title: 'Purchased Items Table',
    shortLabel: 'Items Table',
    description: 'Item descriptions, IMEI/serial badges, warranty tags, quantity, unit price & line totals',
    iconName: 'shopping-bag',
    tag: 'Products',
  },
  financial_totals: {
    key: 'financial_totals',
    title: 'Financial Breakdown & Totals',
    shortLabel: 'Totals & Payment',
    description: 'Subtotal, item savings, tax calculations, net grand total, cash received & change due',
    iconName: 'dollar-sign',
    tag: 'Finance',
  },
  payment_qrs: {
    key: 'payment_qrs',
    title: 'Banking Payment QRs (Minimalist)',
    shortLabel: 'Payment QRs',
    description: 'Direct scan-and-pay QR codes (KBZPay, WavePay, AYA, CB) with bank names below',
    iconName: 'qr-code',
    tag: 'Payment',
  },
  warranty_policy: {
    key: 'warranty_policy',
    title: 'Warranty Terms & Policy Card',
    shortLabel: 'Warranty Policy',
    description: 'Store warranty terms, return rules, service center conditions & customer notice',
    iconName: 'shield-check',
    tag: 'Terms',
  },
  signatures: {
    key: 'signatures',
    title: 'Signatures & Authorization (A5 Slip)',
    shortLabel: 'Signatures',
    description: 'Authorized store representative and customer confirmation signature lines',
    iconName: 'pen-tool',
    tag: 'Legal',
  },
  footer_note: {
    key: 'footer_note',
    title: 'Footer Thank You & Barcode',
    shortLabel: 'Footer & Barcode',
    description: 'Burmese/English customer appreciation note, barcode, hotline and return reminder',
    iconName: 'sparkles',
    tag: 'Footer',
  },
};

export interface InvoiceLayoutPreset {
  id: 'modern_card' | 'official' | 'compact' | 'classic';
  name: string;
  description: string;
  badge: string;
  sectionOrder: InvoiceSectionKey[];
  sectionStyles: Partial<Record<InvoiceSectionKey, InvoiceSectionStyle>>;
}

export const INVOICE_LAYOUT_PRESETS: InvoiceLayoutPreset[] = [
  {
    id: 'modern_card',
    name: 'Modern Clean Voucher',
    description: 'Clean borderless header and metadata, clear item table, minimalist QR codes',
    badge: 'Popular',
    sectionOrder: [
      'logo_header',
      'customer_tx_info',
      'items_table',
      'financial_totals',
      'payment_qrs',
      'warranty_policy',
      'signatures',
      'footer_note',
    ],
    sectionStyles: {
      logo_header: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'normal', fontSize: 'normal' },
      customer_tx_info: { visible: true, alignment: 'left', boxStyle: 'plain', spacing: 'compact', fontSize: 'normal' },
      items_table: { visible: true, alignment: 'left', boxStyle: 'plain', spacing: 'normal', fontSize: 'normal' },
      financial_totals: { visible: true, alignment: 'right', boxStyle: 'plain', spacing: 'normal', fontSize: 'normal' },
      payment_qrs: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'normal', fontSize: 'normal' },
      warranty_policy: { visible: true, alignment: 'left', boxStyle: 'plain', spacing: 'compact', fontSize: 'small' },
      signatures: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'normal', fontSize: 'normal' },
      footer_note: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'compact', fontSize: 'small' },
    },
  },
  {
    id: 'official',
    name: 'Official A5 Corporate Voucher',
    description: 'Formal corporate slip with explicit signature endorsement blocks and warranty terms',
    badge: 'Formal',
    sectionOrder: [
      'logo_header',
      'customer_tx_info',
      'items_table',
      'financial_totals',
      'payment_qrs',
      'warranty_policy',
      'signatures',
      'footer_note',
    ],
    sectionStyles: {
      logo_header: { visible: true, alignment: 'left', boxStyle: 'bordered', spacing: 'relaxed', fontSize: 'normal' },
      customer_tx_info: { visible: true, alignment: 'left', boxStyle: 'bordered', spacing: 'normal', fontSize: 'normal' },
      items_table: { visible: true, alignment: 'left', boxStyle: 'bordered', spacing: 'normal', fontSize: 'normal' },
      financial_totals: { visible: true, alignment: 'right', boxStyle: 'bordered', spacing: 'normal', fontSize: 'normal' },
      payment_qrs: { visible: true, alignment: 'center', boxStyle: 'bordered', spacing: 'normal', fontSize: 'normal' },
      warranty_policy: { visible: true, alignment: 'left', boxStyle: 'bordered', spacing: 'normal', fontSize: 'normal' },
      signatures: { visible: true, alignment: 'center', boxStyle: 'bordered', spacing: 'relaxed', fontSize: 'normal' },
      footer_note: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'compact', fontSize: 'small' },
    },
  },
  {
    id: 'compact',
    name: 'High-Density Thermal POS',
    description: 'Ultra-efficient paper utilization, dashed dividers, compact margins for 80/58mm rolls',
    badge: 'Receipt Roll',
    sectionOrder: [
      'logo_header',
      'customer_tx_info',
      'items_table',
      'financial_totals',
      'payment_qrs',
      'warranty_policy',
      'footer_note',
      'signatures',
    ],
    sectionStyles: {
      logo_header: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'compact', fontSize: 'normal' },
      customer_tx_info: { visible: true, alignment: 'left', boxStyle: 'dashed', spacing: 'compact', fontSize: 'small' },
      items_table: { visible: true, alignment: 'left', boxStyle: 'dashed', spacing: 'compact', fontSize: 'small' },
      financial_totals: { visible: true, alignment: 'right', boxStyle: 'plain', spacing: 'compact', fontSize: 'small' },
      payment_qrs: { visible: true, alignment: 'center', boxStyle: 'dashed', spacing: 'compact', fontSize: 'small' },
      warranty_policy: { visible: true, alignment: 'left', boxStyle: 'dashed', spacing: 'compact', fontSize: 'small' },
      signatures: { visible: false, alignment: 'center', boxStyle: 'plain', spacing: 'compact', fontSize: 'small' },
      footer_note: { visible: true, alignment: 'center', boxStyle: 'plain', spacing: 'compact', fontSize: 'small' },
    },
  },
  {
    id: 'classic',
    name: 'Classic Retail Receipt',
    description: 'Traditional standard flow with clean divider rules and centered branding',
    badge: 'Standard',
    sectionOrder: DEFAULT_INVOICE_SECTION_ORDER,
    sectionStyles: DEFAULT_INVOICE_SECTION_STYLES,
  },
];

/**
 * Resolves the final section order, ensuring all valid section keys are included
 */
export function resolveSectionOrder(custom?: Partial<InvoiceCustomization>): InvoiceSectionKey[] {
  const current = custom?.sectionOrder || DEFAULT_INVOICE_SECTION_ORDER;
  const filtered = current.filter((k) => DEFAULT_INVOICE_SECTION_ORDER.includes(k));
  // Append any missing keys that were added in updates
  for (const key of DEFAULT_INVOICE_SECTION_ORDER) {
    if (!filtered.includes(key)) {
      filtered.push(key);
    }
  }
  return filtered;
}

/**
 * Resolves styling for a particular section with default fallback
 */
export function resolveSectionStyle(
  key: InvoiceSectionKey,
  custom?: Partial<InvoiceCustomization>
): Required<InvoiceSectionStyle> {
  const defaultStyle = DEFAULT_INVOICE_SECTION_STYLES[key] || {
    visible: true,
    alignment: 'left',
    boxStyle: 'plain',
    spacing: 'normal',
    fontSize: 'normal',
  };

  const customStyle = custom?.sectionStyles?.[key];
  if (!customStyle) return defaultStyle;

  return {
    visible: customStyle.visible ?? defaultStyle.visible,
    alignment: customStyle.alignment ?? defaultStyle.alignment,
    boxStyle: customStyle.boxStyle ?? defaultStyle.boxStyle,
    spacing: customStyle.spacing ?? defaultStyle.spacing,
    fontSize: customStyle.fontSize ?? defaultStyle.fontSize,
  };
}

/**
 * Generates Tailwind container classes based on section styling
 */
export function getSectionBoxClasses(
  style: Required<InvoiceSectionStyle>,
  options?: { isSelected?: boolean; isHovered?: boolean; isThermal?: boolean }
): string {
  const classes: string[] = ['relative transition-all duration-150'];

  // Box styles
  switch (style.boxStyle) {
    case 'card':
      classes.push(
        options?.isThermal
          ? 'p-2 bg-slate-50/70 rounded-lg border border-slate-300'
          : 'p-3 bg-slate-50 rounded-xl border border-slate-200'
      );
      break;
    case 'dashed':
      classes.push(
        options?.isThermal
          ? 'py-2 px-1 border-y border-dashed border-slate-400 bg-transparent'
          : 'p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50'
      );
      break;
    case 'bordered':
      classes.push(
        options?.isThermal
          ? 'p-1.5 border border-slate-400 rounded'
          : 'p-3 rounded-xl border-2 border-slate-300 bg-white'
      );
      break;
    case 'plain':
    default:
      classes.push('bg-transparent');
      break;
  }

  // Spacing / Margins
  switch (style.spacing) {
    case 'compact':
      classes.push('my-1 space-y-1');
      break;
    case 'relaxed':
      classes.push('my-3 space-y-3');
      break;
    case 'normal':
    default:
      classes.push('my-2 space-y-2');
      break;
  }

  // Alignment
  switch (style.alignment) {
    case 'center':
      classes.push('text-center');
      break;
    case 'right':
      classes.push('text-right');
      break;
    case 'left':
    default:
      classes.push('text-left');
      break;
  }

  // Selection outline in Figma designer canvas mode
  if (options?.isSelected) {
    classes.push('ring-2 ring-blue-500 ring-offset-2 rounded-xl shadow-xs');
  }

  return classes.join(' ');
}
