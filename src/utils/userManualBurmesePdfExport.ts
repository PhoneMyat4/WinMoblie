import { ShopSettings } from '../types';
import { formatDateTime } from './formatters';
import { 
  USER_MANUAL_BURMESE_METADATA, 
  USER_MANUAL_BURMESE_SECTIONS, 
  generateUserManualBurmeseMarkdown 
} from '../data/userManualContentBurmese';

export interface ExportBurmeseManualOptions {
  settings: ShopSettings;
  staffName?: string;
}

/**
 * Generates a complete, beautiful HTML document of the Burmese user instruction manual
 * with official corporate styling, typography, table of contents, callouts, and sign-off blocks.
 */
export function generateBurmeseManualHtml({ settings, staffName = 'ဆိုင်အုပ်ချုပ်မှုအဖွဲ့' }: ExportBurmeseManualOptions): string {
  const shopName = settings?.shopName || 'Mobile & Gadget Store';
  const shopTagline = settings?.tagline || 'မိုဘိုင်းဖုန်း အရောင်းဆိုင် POS နှင့် စတော့စီမံခန့်ခွဲမှုစနစ်';
  const shopPhone = settings?.phone || '';
  const shopAddress = settings?.address || '';
  const currentDateStr = new Date().toLocaleDateString('my-MM', { year: 'numeric', month: 'long', day: 'numeric' });

  // Generate Table of Contents
  const tocHtml = USER_MANUAL_BURMESE_SECTIONS.map((sec) => `
    <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; border-bottom: 1px dotted #cbd5e1; font-size: 13px;">
      <div>
        <strong style="color: #1e293b;">${sec.number} ${sec.title}</strong>
        <span style="font-size: 10px; background-color: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: bold;">${sec.badge}</span>
      </div>
      <span style="color: #64748b; font-size: 11px;">${sec.subsections.length} ခု</span>
    </div>
  `).join('');

  // Generate Chapters & Subsections
  const sectionsHtml = USER_MANUAL_BURMESE_SECTIONS.map((sec) => {
    const subHtml = sec.subsections.map((sub) => {
      let bullets = '';
      if (sub.bulletPoints && sub.bulletPoints.length > 0) {
        bullets = `
          <ul style="margin: 8px 0 12px 20px; padding: 0; line-height: 1.7; font-size: 12.5px; color: #334155;">
            ${sub.bulletPoints.map(bp => `<li style="margin-bottom: 5px;">${bp}</li>`).join('')}
          </ul>
        `;
      }

      let tableHtml = '';
      if (sub.tableData) {
        tableHtml = `
          <div style="margin: 12px 0; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left; background: #ffffff; border: 1px solid #cbd5e1;">
              <thead>
                <tr style="background: #1e293b; color: #ffffff;">
                  ${sub.tableData.headers.map(h => `<th style="padding: 8px 10px; border: 1px solid #334155; font-weight: bold;">${h}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${sub.tableData.rows.map((row, rIdx) => `
                  <tr style="background: ${rIdx % 2 === 0 ? '#f8fafc' : '#ffffff'};">
                    ${row.map((cell, cIdx) => `
                      <td style="padding: 7px 10px; border: 1px solid #e2e8f0; color: #1e293b; ${cIdx === 0 ? 'font-weight: bold;' : ''}">
                        ${cell}
                      </td>
                    `).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      let calloutHtml = '';
      if (sub.callout) {
        const isWarning = sub.callout.type === 'warning';
        const isTip = sub.callout.type === 'tip';
        const bg = isWarning ? '#fff1f2' : isTip ? '#ecfdf5' : '#eff6ff';
        const border = isWarning ? '#f43f5e' : isTip ? '#10b981' : '#3b82f6';
        const title = isWarning ? 'သတိပြုရန် (WARNING)' : isTip ? 'အကြံပြုချက် (TIP)' : 'သိရှိရန် (NOTE)';
        calloutHtml = `
          <div style="margin: 12px 0; padding: 10px 14px; background: ${bg}; border-left: 4px solid ${border}; border-radius: 6px; font-size: 12px; line-height: 1.6;">
            <strong style="color: ${border}; display: block; margin-bottom: 2px;">${title}</strong>
            <span style="color: #334155;">${sub.callout.text}</span>
          </div>
        `;
      }

      return `
        <div style="margin-bottom: 18px;">
          <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 6px 0; font-weight: bold; border-left: 3px solid #6366f1; padding-left: 8px;">
            ${sub.subtitle}
          </h3>
          <p style="font-size: 12.5px; color: #475569; margin: 0 0 6px 0; line-height: 1.6;">
            ${sub.description}
          </p>
          ${bullets}
          ${tableHtml}
          ${calloutHtml}
        </div>
      `;
    }).join('');

    return `
      <section style="margin-bottom: 28px; page-break-inside: avoid; border-top: 2px solid #e2e8f0; padding-top: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h2 style="font-size: 17px; color: #0f172a; margin: 0; font-weight: 800;">
            ${sec.number} ${sec.title}
          </h2>
          <span style="font-size: 10px; background: #312e81; color: #e0e7ff; padding: 3px 8px; border-radius: 4px; font-weight: bold; text-transform: uppercase;">
            ${sec.badge}
          </span>
        </div>
        <p style="font-size: 12px; color: #64748b; font-style: italic; margin: 0 0 14px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
          ${sec.summary}
        </p>
        ${subHtml}
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="my">
<head>
  <meta charset="UTF-8">
  <title>${shopName} - အသုံးပြုသူလမ်းညွှန်လက်စွဲ (Burmese User Instruction Manual)</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Pyidaungsu:wght@400;700&display=swap');
    
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Pyidaungsu', 'Myanmar Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      color: #1e293b;
      background: #f8fafc;
      line-height: 1.6;
    }

    .manual-container {
      max-width: 850px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }

    .header-banner {
      background: #0f172a;
      color: #ffffff;
      padding: 24px 30px;
      border-radius: 8px 8px 0 0;
      margin: -40px -40px 30px -40px;
      border-bottom: 4px solid #6366f1;
    }

    .action-bar {
      position: sticky;
      top: 10px;
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 20px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      padding: 10px 16px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #4f46e5;
      color: #ffffff;
    }

    .btn-primary:hover {
      background: #4338ca;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .manual-container {
        box-shadow: none;
        border: none;
        padding: 0;
        max-width: 100%;
      }
      .action-bar {
        display: none !important;
      }
      .header-banner {
        margin: 0 0 20px 0;
      }
      section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <!-- Floating Print & Export Bar (Hidden when printed) -->
  <div class="action-bar">
    <button type="button" class="btn btn-primary" onclick="window.print()">
      🖨️ PDF အဖြစ် သိမ်းမည် / Print ထုတ်မည်
    </button>
    <button type="button" class="btn btn-secondary" onclick="window.close()">
      ✕ ပိတ်မည်
    </button>
  </div>

  <div class="manual-container">
    <!-- Header Banner -->
    <div class="header-banner">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: gap-2;">
        <div>
          <span style="font-size: 10px; background: #4f46e5; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: bold; letter-spacing: 1px;">
            တရားဝင် လုပ်ငန်းခွင် စံသတ်မှတ်ချက် (OFFICIAL SOP)
          </span>
          <h1 style="margin: 8px 0 4px 0; font-size: 22px; font-weight: 800; color: #ffffff;">
            ${shopName}
          </h1>
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">
            ${shopTagline}
          </p>
        </div>
        <div style="text-align: right; font-size: 11px; color: #cbd5e1;">
          <div><strong>စာရွက်စာတမ်း အမှတ်:</strong> ${USER_MANUAL_BURMESE_METADATA.documentControlId}</div>
          <div><strong>ဗားရှင်း:</strong> ${USER_MANUAL_BURMESE_METADATA.version}</div>
          <div><strong>ထုတ်ဝေသည့်ရက်:</strong> ${USER_MANUAL_BURMESE_METADATA.lastUpdated}</div>
          ${shopPhone ? `<div><strong>ဖုန်း:</strong> ${shopPhone}</div>` : ''}
          ${shopAddress ? `<div style="font-size: 10px; color: #94a3b8;">${shopAddress}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Title Block -->
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">
        ${USER_MANUAL_BURMESE_METADATA.title}
      </h2>
      <p style="font-size: 13px; color: #475569; margin: 0 0 16px 0;">
        ${USER_MANUAL_BURMESE_METADATA.subtitle}
      </p>

      <!-- Document Control Metadata Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 24px;">
        <tr>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: bold; width: 35%; color: #334155;">ထုတ်ဝေသည့် အဖွဲ့အစည်း:</td>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; color: #0f172a;">${shopName} စီမံခန့်ခွဲမှုအဖွဲ့</td>
        </tr>
        <tr>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #334155;">ဖတ်ရှုလိုက်နာရမည့်သူများ:</td>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; color: #0f172a;">${USER_MANUAL_BURMESE_METADATA.targetAudience}</td>
        </tr>
        <tr>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #334155;">စာရင်းစစ်ဆေးအတည်ပြုသူ:</td>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; color: #0f172a;">${staffName}</td>
        </tr>
        <tr>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #334155;">ထုတ်ယူသည့် အချိန်/ရက်စွဲ:</td>
          <td style="padding: 7px 12px; border: 1px solid #e2e8f0; color: #4f46e5; font-weight: bold;">${formatDateTime(new Date().toISOString())}</td>
        </tr>
      </table>
    </div>

    <!-- Table of Contents -->
    <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0;">
      <h3 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">
        📑 မာတိကာနှင့် အခန်းကဏ္ဍ အကျဉ်းချုပ် (TABLE OF CONTENTS)
      </h3>
      ${tocHtml}
    </div>

    <!-- All Sections Content -->
    ${sectionsHtml}

    <!-- Sign-Off & Approval Block -->
    <div style="margin-top: 40px; padding-top: 24px; border-top: 2px dashed #cbd5e1; page-break-inside: avoid;">
      <h4 style="font-size: 13px; font-weight: bold; color: #1e293b; margin: 0 0 20px 0; text-align: center;">
        လုပ်ငန်းခွင် လိုက်နာဆောင်ရွက်ရန် သဘောတူညီချက်နှင့် လက်မှတ်များ (AUTHORIZATION &amp; SIGN-OFF)
      </h4>
      <div style="display: flex; justify-content: space-around; margin-top: 40px;">
        <div style="text-align: center; width: 40%;">
          <div style="border-bottom: 1px solid #475569; width: 100%; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: bold; color: #0f172a;">ဆိုင်မန်နေဂျာ / စာရင်းစစ် လက်မှတ်</p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">ရက်စွဲ: ......./......./၂၀၂၆</p>
        </div>
        <div style="text-align: center; width: 40%;">
          <div style="border-bottom: 1px solid #475569; width: 100%; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: bold; color: #0f172a;">ဆိုင်ပိုင်ရှင် / အမှုဆောင် လက်မှတ်</p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">ရက်စွဲ: ......./......./၂၀၂၆</p>
        </div>
      </div>
      <p style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 30px;">
        © ၂၀၂၆ ${shopName}။ မူပိုင်ခွင့်များအားလုံး လက်ဝယ်ရှိသည်။ ဤစာရွက်စာတမ်းသည် ဆိုင်တွင်း ဝန်ထမ်းလေ့ကျင့်ရေးအတွက်သာ ဖြစ်သည်။
      </p>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Opens the Burmese user manual in a clean, print-ready document window
 * that automatically prompts the native high-DPI PDF generator / print dialog.
 */
export function openBurmeseUserManualPrintWindow(options: ExportBurmeseManualOptions): void {
  const html = generateBurmeseManualHtml(options);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    // Allow fonts to load before triggering print
    printWindow.setTimeout(() => {
      printWindow.focus();
    }, 400);
  } else {
    // Fallback if popup blocked: create downloadable file
    downloadBurmeseManualHtmlFile(options);
  }
}

/**
 * Downloads the full Burmese instruction manual as a standalone offline HTML document
 * that can be opened in any browser and saved as PDF anytime.
 */
export function downloadBurmeseManualHtmlFile(options: ExportBurmeseManualOptions): void {
  const html = generateBurmeseManualHtml(options);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeName = (options.settings.shopName || 'Mobile_Store').replace(/\s+/g, '_').toLowerCase();
  link.setAttribute('download', `${safeName}_operations_manual_burmese.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Primary export entry point for Burmese User Instruction Manual
 */
export function exportUserManualBurmesePdf(options: ExportBurmeseManualOptions): void {
  openBurmeseUserManualPrintWindow(options);
}
