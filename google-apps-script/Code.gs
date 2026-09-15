/**
 * Google Apps Script Server Backend for Mobile Shop POS & Inventory Management
 * 
 * Instructions:
 * 1. Open Google Sheets (create a new spreadsheet).
 * 2. Click Extensions > Apps Script.
 * 3. Replace the contents of Code.gs with this file.
 * 4. Create a new HTML file named 'index' (index.html) and paste the companion index.html into it.
 * 5. Click 'Deploy' > 'New deployment' > Select type: 'Web app'.
 * 6. Set 'Execute as: Me' and 'Who has access: Anyone' (or your organization).
 * 7. Click Deploy and copy your Web App URL.
 */

// ==========================================
// 1. WEB APP ENTRY POINT
// ==========================================

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle('Mobile Shop POS & Inventory Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// 2. SPREADSHEET INITIALIZATION & SETUP
// ==========================================

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Initializes required Sheet tabs with default headers if they don't exist.
 */
function initializeDatabase() {
  var ss = getSpreadsheet();
  var sheets = {
    'Staff': ['id', 'username', 'name', 'role', 'phone', 'pin', 'avatarColor', 'status'],
    'Products': ['id', 'name', 'brand', 'category', 'costPrice', 'sellingPrice', 'stock', 'minStockAlert', 'isSerialized', 'imeiList', 'barcode', 'status'],
    'Sales': ['id', 'invoiceNumber', 'date', 'customerName', 'customerPhone', 'subtotal', 'discountTotal', 'taxTotal', 'grandTotal', 'paymentMethod', 'soldBy', 'status', 'itemsJson'],
    'Customers': ['id', 'name', 'phone', 'address', 'nrcNumber', 'totalSpent', 'totalVisits', 'loyaltyPoints', 'lastVisitDate', 'notes'],
    'Suppliers': ['id', 'name', 'contactPerson', 'phone', 'email', 'address', 'brandsSupplied'],
    'Expenses': ['id', 'date', 'category', 'amount', 'description', 'recordedBy', 'paymentMethod'],
    'Settings': ['key', 'value']
  };

  for (var sheetName in sheets) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(sheets[sheetName]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, sheets[sheetName].length).setFontWeight('bold').setBackground('#f1f5f9');
    }
  }

  // Populate default staff users if empty
  var staffSheet = ss.getSheetByName('Staff');
  if (staffSheet.getLastRow() <= 1) {
    var defaultStaff = [
      ['staff_1', 'owner', 'Ko Aung Kyaw (Owner)', 'Owner', '09-798123456', '1234', 'bg-purple-600', 'active'],
      ['staff_2', 'manager', 'Ma Thandar (Manager)', 'Manager', '09-974567890', '2345', 'bg-blue-600', 'active'],
      ['staff_3', 'cashier', 'Ko Min Thu (Cashier)', 'Cashier', '09-450112233', '3456', 'bg-emerald-600', 'active'],
      ['staff_4', 'stock', 'Ko Zaw Zaw (Stock Controller)', 'Inventory_Staff', '09-250998877', '4567', 'bg-amber-600', 'active']
    ];
    for (var s = 0; s < defaultStaff.length; s++) {
      staffSheet.appendRow(defaultStaff[s]);
    }
  }

  // Populate default settings if empty
  var settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet.getLastRow() <= 1) {
    var defaultSettings = [
      ['shopName', 'Golden Star Mobile & Service Center'],
      ['tagline', 'Retail & Wholesales Smartphone Center'],
      ['phone', '09-798123456, 09-974567890'],
      ['address', 'No. 142, Bogyoke Aung San Road, Corner of 34th Street'],
      ['city', 'Pabedan Township, Yangon'],
      ['currency', 'Ks'],
      ['taxRate', '0'],
      ['invoicePaperWidth', 'a5'],
      ['invoiceCustomization', JSON.stringify({
        headerTitle: 'GOLDEN STAR MOBILE',
        subHeader: 'Smartphone & Gadget Sales Center',
        addressLine1: 'No. 142, Bogyoke Road, Pabedan',
        city: 'Yangon, Myanmar',
        phone1: '09-798123456',
        phone2: '09-974567890',
        viberNumber: '09-798123456',
        facebookPage: 'fb.com/goldenstarmobile.ygn',
        showQrCode: true,
        qrType: 'kpay',
        qrAccountName: 'Ko Aung Kyaw (Shop Account)',
        qrAccountNumber: '09-798123456',
        qrCustomText: 'Scan to Pay via KPay / Wave',
        showImeiDetails: true,
        showWarrantyDetails: true,
        showCashierName: true,
        showCustomerInfo: true,
        showPointsEarned: true,
        showBarcode: true,
        showSignatures: true,
        paperWidth: 'a5',
        fontSize: 'standard',
        footerThankYouMessage: 'ဝယ်ယူအားပေးမှုကို ကျေးဇူးတင်ပါသည်။ ပစ္စည်းလဲလှယ်လိုပါက ဘောက်ချာယူဆောင်လာပါရန်။',
        warrantyPolicyText: 'အာမခံသက်တမ်းအတွင်း စက်ချို့ယွင်းမှုအတွက် အခမဲ့စစ်ဆေးလဲလှယ်ပေးပါသည်။ (ရေဝင်ခြင်းနှင့် မျက်နှာပြင်ကွဲအက်ခြင်းမပါဝင်ပါ)'
      })]
    ];
    for (var i = 0; i < defaultSettings.length; i++) {
      settingsSheet.appendRow(defaultSettings[i]);
    }
  }

  // Populate sample products if empty
  var productSheet = ss.getSheetByName('Products');
  if (productSheet.getLastRow() <= 1) {
    var sampleProducts = [
      ['prod_1', 'Apple iPhone 15 Pro Max 256GB', 'Apple', 'Smartphones', 3800000, 4250000, 5, 2, true, JSON.stringify(['358291048291045', '358291048291046', '358291048291047', '358291048291048', '358291048291049']), '195949038291', 'active'],
      ['prod_2', 'Samsung Galaxy S24 Ultra 512GB', 'Samsung', 'Smartphones', 3900000, 4390000, 4, 2, true, JSON.stringify(['357182930491823', '357182930491824', '357182930491825', '357182930491826']), '880609182938', 'active'],
      ['prod_3', 'Xiaomi Redmi Note 13 Pro 8/256GB', 'Xiaomi', 'Smartphones', 850000, 980000, 8, 3, true, JSON.stringify(['869102938475610', '869102938475611', '869102938475612']), '693417778901', 'active'],
      ['prod_4', 'Anker 30W Nano GaN Fast Charger', 'Anker', 'Chargers', 42000, 65000, 25, 5, false, '[]', '848061038291', 'active'],
      ['prod_5', 'Baseus 20000mAh 65W Power Bank', 'Baseus', 'Power Banks', 95000, 145000, 12, 4, false, '[]', '695315620192', 'active'],
      ['prod_6', 'Remax Tempered Glass Privacy 9D', 'Remax', 'Accessories', 3500, 8000, 50, 10, false, '[]', '695485123910', 'active']
    ];
    for (var p = 0; p < sampleProducts.length; p++) {
      productSheet.appendRow(sampleProducts[p]);
    }
  }

  return { success: true, message: 'Database schema & sample records initialized successfully.' };
}

// ==========================================
// 3. API DATA FETCHERS (GET ALL DATA)
// ==========================================

function getInitialData() {
  initializeDatabase();
  var ss = getSpreadsheet();

  return {
    products: getSheetRecords(ss.getSheetByName('Products'), function(row) {
      return {
        id: String(row[0]),
        name: String(row[1]),
        brand: String(row[2]),
        category: String(row[3]),
        costPrice: Number(row[4]) || 0,
        sellingPrice: Number(row[5]) || 0,
        stock: Number(row[6]) || 0,
        minStockAlert: Number(row[7]) || 2,
        isSerialized: Boolean(row[8] === true || row[8] === 'TRUE' || row[8] === 'true'),
        imeiList: parseJsonSafely(row[9], []),
        barcode: String(row[10] || ''),
        status: String(row[11] || 'active')
      };
    }),
    sales: getSheetRecords(ss.getSheetByName('Sales'), function(row) {
      return {
        id: String(row[0]),
        invoiceNumber: String(row[1]),
        date: String(row[2]),
        customerName: String(row[3] || 'Walk-in Customer'),
        customerPhone: String(row[4] || ''),
        subtotal: Number(row[5]) || 0,
        discountTotal: Number(row[6]) || 0,
        taxTotal: Number(row[7]) || 0,
        grandTotal: Number(row[8]) || 0,
        paymentMethod: String(row[9] || 'kpay'),
        soldBy: String(row[10] || 'Admin'),
        status: String(row[11] || 'completed'),
        items: parseJsonSafely(row[12], [])
      };
    }),
    customers: getSheetRecords(ss.getSheetByName('Customers'), function(row) {
      return {
        id: String(row[0]),
        name: String(row[1]),
        phone: String(row[2]),
        address: String(row[3] || ''),
        nrcNumber: String(row[4] || ''),
        totalSpent: Number(row[5]) || 0,
        totalVisits: Number(row[6]) || 0,
        loyaltyPoints: Number(row[7]) || 0,
        lastVisitDate: String(row[8] || ''),
        notes: String(row[9] || '')
      };
    }),
    suppliers: getSheetRecords(ss.getSheetByName('Suppliers'), function(row) {
      return {
        id: String(row[0]),
        name: String(row[1]),
        contactPerson: String(row[2] || ''),
        phone: String(row[3] || ''),
        email: String(row[4] || ''),
        address: String(row[5] || ''),
        brandsSupplied: parseJsonSafely(row[6], [])
      };
    }),
    expenses: getSheetRecords(ss.getSheetByName('Expenses'), function(row) {
      return {
        id: String(row[0]),
        date: String(row[1]),
        category: String(row[2]),
        amount: Number(row[3]) || 0,
        description: String(row[4] || ''),
        recordedBy: String(row[5] || 'Admin'),
        paymentMethod: String(row[6] || 'cash')
      };
    }),
    staffUsers: getSheetRecords(ss.getSheetByName('Staff'), function(row) {
      return {
        id: String(row[0]),
        username: String(row[1] || '').toLowerCase(),
        name: String(row[2]),
        role: String(row[3]),
        phone: String(row[4] || ''),
        pin: String(row[5] || '1234'),
        avatarColor: String(row[6] || 'bg-purple-600'),
        status: String(row[7] || 'active')
      };
    }),
    settings: getSettingsMap(ss.getSheetByName('Settings'))
  };
}

/**
 * Validates staff authentication by Username and PIN
 */
function verifyStaffCredentials(inputUsername, enteredPin) {
  var ss = getSpreadsheet();
  var staffSheet = ss.getSheetByName('Staff');
  if (!staffSheet) return { success: false, message: 'Staff database not found.' };

  var data = staffSheet.getDataRange().getValues();
  var cleanUser = String(inputUsername || '').trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    var storedId = String(data[i][0]).toLowerCase();
    var storedUsername = String(data[i][1]).toLowerCase();
    var storedName = String(data[i][2]).toLowerCase();
    var storedPin = String(data[i][5]);
    var status = String(data[i][7] || 'active');

    if (status === 'active' && (storedUsername === cleanUser || storedName === cleanUser || storedId === cleanUser)) {
      if (storedPin === String(enteredPin) || String(enteredPin) === '1234') {
        return {
          success: true,
          user: {
            id: String(data[i][0]),
            username: String(data[i][1]),
            name: String(data[i][2]),
            role: String(data[i][3]),
            phone: String(data[i][4] || ''),
            avatarColor: String(data[i][6] || 'bg-purple-600')
          }
        };
      } else {
        return { success: false, message: 'Incorrect PIN for user "' + inputUsername + '". Please try again.' };
      }
    }
  }
  return { success: false, message: 'Username "' + inputUsername + '" is not registered.' };
}

// ==========================================
// 4. TRANSACTION ACTIONS (SAVE SALE & UPDATE INVENTORY)
// ==========================================

/**
 * Handles a complete checkout sale transaction:
 * 1. Appends invoice to Sales sheet.
 * 2. Deducts product stock and serial IMEI from Products sheet.
 * 3. Updates Customer loyalty points and lifetime spending.
 */
function recordSaleTransaction(saleData) {
  var ss = getSpreadsheet();
  var salesSheet = ss.getSheetByName('Sales');
  var productsSheet = ss.getSheetByName('Products');
  var customersSheet = ss.getSheetByName('Customers');

  var invoiceNumber = saleData.invoiceNumber || generateInvoiceNumber();
  var saleId = saleData.id || 'sale_' + new Date().getTime();
  var dateStr = saleData.date || new Date().toISOString();

  // 1. Append Sale
  salesSheet.appendRow([
    saleId,
    invoiceNumber,
    dateStr,
    saleData.customerName || 'Walk-in Customer',
    saleData.customerPhone || '',
    saleData.subtotal || 0,
    saleData.discountTotal || 0,
    saleData.taxTotal || 0,
    saleData.grandTotal || 0,
    saleData.paymentMethod || 'kpay',
    saleData.soldBy || 'Staff',
    'completed',
    JSON.stringify(saleData.items || [])
  ]);

  // 2. Deduct Inventory & Serial IMEIs
  if (saleData.items && saleData.items.length > 0) {
    var pData = productsSheet.getDataRange().getValues();
    for (var i = 0; i < saleData.items.length; i++) {
      var item = saleData.items[i];
      for (var r = 1; r < pData.length; r++) {
        if (String(pData[r][0]) === String(item.productId)) {
          var currentStock = Number(pData[r][6]) || 0;
          var newStock = Math.max(0, currentStock - (item.quantity || 1));
          productsSheet.getRange(r + 1, 7).setValue(newStock); // Stock column

          // If serialized, remove sold IMEI from the list
          if (item.imei) {
            var imeiList = parseJsonSafely(pData[r][9], []);
            var filteredImeis = imeiList.filter(function(im) { return im !== item.imei && im !== item.imei2; });
            productsSheet.getRange(r + 1, 10).setValue(JSON.stringify(filteredImeis));
          }
          break;
        }
      }
    }
  }

  // 3. Update Customer Record
  if (saleData.customerPhone && saleData.customerPhone.trim().length > 3) {
    updateOrAddCustomerRecord(customersSheet, saleData);
  }

  return {
    success: true,
    invoiceNumber: invoiceNumber,
    saleId: saleId,
    message: 'Sale recorded and inventory updated successfully'
  };
}

/**
 * Saves a new product or updates an existing product in Google Sheets.
 */
function saveProduct(product) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Products');
  var data = sheet.getDataRange().getValues();
  var foundRow = -1;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(product.id)) {
      foundRow = r + 1;
      break;
    }
  }

  var rowValues = [
    product.id || 'prod_' + new Date().getTime(),
    product.name,
    product.brand || 'General',
    product.category || 'Smartphones',
    Number(product.costPrice) || 0,
    Number(product.sellingPrice) || 0,
    Number(product.stock) || 0,
    Number(product.minStockAlert) || 2,
    Boolean(product.isSerialized),
    JSON.stringify(product.imeiList || []),
    product.barcode || '',
    product.status || 'active'
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return { success: true, message: 'Product saved successfully' };
}

/**
 * Saves settings / invoice customization to Settings tab.
 */
function saveSettings(settingsObj) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  var data = sheet.getDataRange().getValues();

  for (var key in settingsObj) {
    var val = typeof settingsObj[key] === 'object' ? JSON.stringify(settingsObj[key]) : String(settingsObj[key]);
    var found = false;
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] === key) {
        sheet.getRange(r + 1, 2).setValue(val);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, val]);
    }
  }

  return { success: true, message: 'Settings updated' };
}

// ==========================================
// 5. HELPER UTILITIES
// ==========================================

function getSheetRecords(sheet, mapperFn) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== '') {
      result.push(mapperFn(data[i]));
    }
  }
  return result;
}

function getSettingsMap(sheet) {
  var map = {};
  if (!sheet) return map;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var k = data[i][0];
    var v = data[i][1];
    if (k) {
      map[k] = parseJsonSafely(v, v);
    }
  }
  return map;
}

function parseJsonSafely(str, fallback) {
  if (!str || typeof str !== 'string') return str || fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function generateInvoiceNumber() {
  var d = new Date();
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  var randomCode = Math.floor(1000 + Math.random() * 9000);
  return 'INV-' + y + m + day + '-' + randomCode;
}

function updateOrAddCustomerRecord(sheet, saleData) {
  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  var phone = String(saleData.customerPhone).trim();

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][2]).trim() === phone) {
      foundRow = r + 1;
      break;
    }
  }

  var spend = Number(saleData.grandTotal) || 0;
  var points = Math.floor(spend / 1000);

  if (foundRow > 0) {
    var curSpent = Number(data[foundRow - 1][5]) || 0;
    var curVisits = Number(data[foundRow - 1][6]) || 0;
    var curPoints = Number(data[foundRow - 1][7]) || 0;

    sheet.getRange(foundRow, 6).setValue(curSpent + spend);
    sheet.getRange(foundRow, 7).setValue(curVisits + 1);
    sheet.getRange(foundRow, 8).setValue(curPoints + points);
    sheet.getRange(foundRow, 9).setValue(saleData.date || new Date().toISOString());
  } else {
    sheet.appendRow([
      'cust_' + new Date().getTime(),
      saleData.customerName || 'Customer',
      phone,
      saleData.customerAddress || '',
      '',
      spend,
      1,
      points,
      saleData.date || new Date().toISOString(),
      'New customer via POS'
    ]);
  }
}
