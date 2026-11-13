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
    'Staff': ['id', 'username', 'name', 'role', 'phone', 'pin', 'avatarColor', 'status', 'mustChangePin'],
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

  // R11.1: Do NOT hardcode seed PINs in source code. Generate random one-time PINs at setup, log them once, and set mustChangePin = TRUE.
  var staffSheet = ss.getSheetByName('Staff');
  if (staffSheet.getLastRow() <= 1) {
    var seedProfiles = [
      ['staff_1', 'owner', 'Ko Aung Kyaw (Owner)', 'Owner', '09-798123456', 'bg-purple-600'],
      ['staff_2', 'manager', 'Ma Thandar (Manager)', 'Manager', '09-974567890', 'bg-blue-600'],
      ['staff_3', 'cashier', 'Ko Min Thu (Cashier)', 'Cashier', '09-450112233', 'bg-emerald-600'],
      ['staff_4', 'stock', 'Ko Zaw Zaw (Stock Controller)', 'Inventory_Staff', '09-250998877', 'bg-amber-600']
    ];
    for (var s = 0; s < seedProfiles.length; s++) {
      var p = seedProfiles[s];
      var randomPin = String(Math.floor(100000 + Math.random() * 900000));
      var randomSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      var stretchedHash = hashPinV2(randomPin, randomSalt);
      Logger.log('[INITIAL SETUP] One-time seed PIN for ' + p[1] + ' (' + p[3] + '): ' + randomPin + ' (mustChangePin=TRUE)');
      staffSheet.appendRow([p[0], p[1], p[2], p[3], p[4], 'v2:' + randomSalt + ':' + stretchedHash, p[5], 'active', true]);
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
        avatarColor: String(row[6] || 'bg-purple-600'),
        status: String(row[7] || 'active')
      };
    }),
    settings: getSettingsMap(ss.getSheetByName('Settings'))
  };
}

// R11.2: Per-user salt + 20,000-round key stretching (stored as 'v2:<salt>:<hash>' in the PIN column)
function hashPinV2(pin, salt) {
  var h = String(salt || '') + ':' + String(pin || '').trim();
  for (var i = 0; i < 20000; i++) {
    var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8);
    h = Utilities.base64Encode(d);
  }
  return h;
}

function hashStaffPin(rawPin) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return 'v2:' + salt + ':' + hashPinV2(rawPin, salt);
}

function hashStaffPinLegacy_(rawPin) {
  var raw = 'winmobile_gas_v1:' + String(rawPin || '').trim();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var b = (digest[i] + 256) % 256;
    var h = b.toString(16);
    hex += (h.length === 1 ? '0' : '') + h;
  }
  return 'sha256:' + hex;
}

function canOverridePrice(role) {
  var r = String(role || '').trim();
  return r === 'Owner' || r === 'Manager';
}

/**
 * Validates staff authentication by Username and PIN:
 * - Enforces 5-attempt / 5-minute lockout via CacheService (R11.2)
 * - Rejects retired insecure seed PINs (8492, 7381, 6274, 5163) or forces PIN rotation (R11.1)
 * - Auto-upgrades legacy hashes to 'v2:<salt>:<hash>' with 20,000 SHA-256 rounds
 * - Issues a server-cached session token binding the authenticated user's role
 */
function verifyStaffCredentials(inputUsername, enteredPin, newPinIfChanging) {
  var ss = getSpreadsheet();
  var staffSheet = ss.getSheetByName('Staff');
  if (!staffSheet) return { success: false, message: 'Staff database not found.' };

  var cleanUser = String(inputUsername || '').trim().toLowerCase();
  var enteredStr = String(enteredPin || '').trim();
  if (!cleanUser || !enteredStr) {
    return { success: false, message: 'Username and PIN are required.' };
  }

  // R11.2: Lockout — 5 wrong PINs = 5 minutes (300 seconds)
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + cleanUser;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) {
    return { success: false, message: 'Too many attempts. Try again in 5 minutes.' };
  }

  var RETIRED_SEED_PINS = { '8492': true, '7381': true, '6274': true, '5163': true };
  var data = staffSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var storedId = String(data[i][0]).toLowerCase();
    var storedUsername = String(data[i][1]).toLowerCase();
    var storedName = String(data[i][2]).toLowerCase();
    var storedPin = String(data[i][5] || '').trim();
    var status = String(data[i][7] || 'active');
    var mustChangePin = Boolean(data[i][8] === true || data[i][8] === 'TRUE' || data[i][8] === 'true' || RETIRED_SEED_PINS[enteredStr]);

    if (status === 'active' && (storedUsername === cleanUser || storedName === cleanUser || storedId === cleanUser)) {
      var isMatch = false;
      if (storedPin.indexOf('v2:') === 0) {
        var parts = storedPin.split(':');
        var salt = parts[1] || '';
        var expectedHash = parts.slice(2).join(':');
        isMatch = (hashPinV2(enteredStr, salt) === expectedHash);
      } else if (storedPin.indexOf('sha256:') === 0) {
        isMatch = (storedPin === hashStaffPinLegacy_(enteredStr));
      } else {
        isMatch = (storedPin === enteredStr);
      }

      if (!isMatch) {
        cache.put(failKey, String(fails + 1), 300);
        return { success: false, message: 'Incorrect PIN for user "' + inputUsername + '". Please try again.' };
      }

      cache.remove(failKey);

      // R11.1: Force PIN change on first login or if account still uses a retired seed PIN
      if (mustChangePin) {
        var cleanNewPin = String(newPinIfChanging || '').trim();
        if (!cleanNewPin || cleanNewPin.length < 4 || RETIRED_SEED_PINS[cleanNewPin] || cleanNewPin === enteredStr) {
          return {
            success: false,
            mustChangePin: true,
            message: 'Security policy: You must set a new personal PIN (cannot use default seed PINs).'
          };
        }
        var newSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
        var newStretched = 'v2:' + newSalt + ':' + hashPinV2(cleanNewPin, newSalt);
        staffSheet.getRange(i + 1, 6).setValue(newStretched);
        staffSheet.getRange(i + 1, 9).setValue(false);
      } else if (storedPin.indexOf('v2:') !== 0) {
        // Upgrade legacy hash to v2 per-user salted 20,000-round hash
        var upgradeSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
        staffSheet.getRange(i + 1, 6).setValue('v2:' + upgradeSalt + ':' + hashPinV2(enteredStr, upgradeSalt));
      }

      var sessionToken = Utilities.getUuid();
      var role = String(data[i][3] || 'Cashier');
      cache.put('sess_' + sessionToken, JSON.stringify({
        id: String(data[i][0]),
        username: String(data[i][1]),
        role: role
      }), 21600);

      return {
        success: true,
        sessionToken: sessionToken,
        user: {
          id: String(data[i][0]),
          username: String(data[i][1]),
          name: String(data[i][2]),
          role: role,
          phone: String(data[i][4] || ''),
          avatarColor: String(data[i][6] || 'bg-purple-600')
        }
      };
    }
  }
  cache.put(failKey, String(fails + 1), 300);
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
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Server busy with another transaction. Please try again in a few seconds.');
  }

  try {
    var ss = getSpreadsheet();
    var salesSheet = ss.getSheetByName('Sales');
    var productsSheet = ss.getSheetByName('Products');
    var customersSheet = ss.getSheetByName('Customers');
    var settingsSheet = ss.getSheetByName('Settings');

    var saleId = saleData.id || 'sale_' + new Date().getTime();
    var dateStr = saleData.date || new Date().toISOString();

    if (!saleData.items || saleData.items.length === 0) {
      throw new Error('Cannot record an empty sale transaction.');
    }

    // Resolve callerRole from server session token cache (R11.3: never trust role sent in request body)
    var callerRole = 'Cashier';
    if (saleData.sessionToken) {
      var rawSess = CacheService.getScriptCache().get('sess_' + String(saleData.sessionToken));
      if (rawSess) {
        var parsedSess = parseJsonSafely(rawSess, null);
        if (parsedSess && parsedSess.role) {
          callerRole = String(parsedSess.role);
        }
      }
    }

    // 1. PHASE 1 (READ & VALIDATE ALL ITEMS FIRST): Never mutate sheet rows until every line item passes stock, IMEI, and price checks
    var pData = productsSheet.getDataRange().getValues();
    var validatedItems = [];
    var recomputedSubtotal = 0;
    var rowStockMap = {};
    var rowImeiMap = {};
    var touchedRows = {};

    for (var i = 0; i < saleData.items.length; i++) {
      var item = saleData.items[i];
      var matchedRow = -1;
      for (var r = 1; r < pData.length; r++) {
        if (String(pData[r][0]) === String(item.productId)) {
          matchedRow = r;
          break;
        }
      }
      if (matchedRow === -1) {
        throw new Error('Product "' + (item.name || item.productId) + '" not found in Products sheet.');
      }

      if (rowStockMap[matchedRow] === undefined) {
        rowStockMap[matchedRow] = Number(pData[matchedRow][6]) || 0;
        rowImeiMap[matchedRow] = parseJsonSafely(pData[matchedRow][9], []);
      }

      var currentStock = rowStockMap[matchedRow];
      var reqQty = Math.max(1, Math.round(Number(item.quantity) || 1));
      if (currentStock < reqQty) {
        throw new Error('Insufficient stock for "' + pData[matchedRow][1] + '" (Available: ' + currentStock + ', Requested: ' + reqQty + ').');
      }

      var isSerialized = Boolean(pData[matchedRow][8] === true || pData[matchedRow][8] === 'TRUE' || pData[matchedRow][8] === 'true');
      // R11.4: Enforce one unit per serialized line so stock and IMEI list never drift apart
      if (isSerialized && reqQty !== 1) {
        throw new Error('Serialized items must be sold one unit per line.');
      }
      var availableImeis = rowImeiMap[matchedRow];
      if (item.imei) {
        var imeiIdx = availableImeis.indexOf(String(item.imei));
        if (imeiIdx === -1) {
          throw new Error('IMEI "' + item.imei + '" for "' + pData[matchedRow][1] + '" is not in stock (already sold or invalid).');
        }
        availableImeis.splice(imeiIdx, 1);
      } else if (isSerialized) {
        throw new Error('Product "' + pData[matchedRow][1] + '" requires a valid in-stock IMEI selection.');
      }

      if (item.imei2) {
        var imei2Idx = availableImeis.indexOf(String(item.imei2));
        if (imei2Idx !== -1) {
          availableImeis.splice(imei2Idx, 1);
        }
      }

      var sheetCostPrice = Math.round(Number(pData[matchedRow][4]) || 0);
      var sheetSellingPrice = Math.round(Number(pData[matchedRow][5]) || 0);
      // R11.3: Only Owner/Manager (verified via sessionToken) can override catalog selling price
      var submittedPrice = Number(item.unitPrice);
      var unitPrice = (canOverridePrice(callerRole) && !isNaN(submittedPrice) && submittedPrice > 0)
        ? Math.round(submittedPrice)
        : sheetSellingPrice;
      var discount = Math.max(0, Math.round(Number(item.discount) || 0));
      var finalPrice = Math.round(unitPrice * reqQty - discount);
      if (sheetCostPrice > 0 && finalPrice < sheetCostPrice * reqQty && !canOverridePrice(callerRole)) {
        throw new Error('Price below cost floor rejected for "' + pData[matchedRow][1] + '".');
      }

      recomputedSubtotal += finalPrice;
      rowStockMap[matchedRow] = currentStock - reqQty;
      touchedRows[matchedRow] = true;

      validatedItems.push({
        productId: String(item.productId),
        name: String(pData[matchedRow][1] || item.name),
        costPrice: sheetCostPrice,
        unitPrice: unitPrice,
        quantity: reqQty,
        discount: discount,
        finalPrice: finalPrice,
        imei: item.imei || '',
        warrantyPeriod: item.warrantyPeriod || ''
      });
    }

    // 2. PHASE 2 (COMMIT INVENTORY WRITES): All items validated; now persist stock & IMEI updates
    for (var rowKey in touchedRows) {
      if (Object.prototype.hasOwnProperty.call(touchedRows, rowKey)) {
        var rIdx = Number(rowKey);
        productsSheet.getRange(rIdx + 1, 7).setValue(rowStockMap[rIdx]);
        productsSheet.getRange(rIdx + 1, 10).setValue(JSON.stringify(rowImeiMap[rIdx]));
      }
    }

    // 3. Allocate sequential invoice number under script lock (refuses if Settings sheet is missing)
    var invoiceNumber = allocateSequentialInvoiceNumber(settingsSheet);

    var discountTotal = Math.max(0, Math.round(Number(saleData.discountTotal) || 0));
    var taxTotal = Math.max(0, Math.round(Number(saleData.taxTotal) || 0));
    var grandTotal = Math.max(0, Math.round(recomputedSubtotal - discountTotal + taxTotal));
    var normalizedCustomerPhone = normalizeMyanmarPhone(saleData.customerPhone || '');

    // 4. Append Sale
    salesSheet.appendRow([
      saleId,
      invoiceNumber,
      dateStr,
      saleData.customerName || 'Walk-in Customer',
      normalizedCustomerPhone,
      recomputedSubtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      saleData.paymentMethod || 'kpay',
      saleData.soldBy || 'Staff',
      'completed',
      JSON.stringify(validatedItems)
    ]);

    // 5. Update Customer Record with server-recomputed grandTotal
    if (normalizedCustomerPhone && normalizedCustomerPhone.length > 3) {
      updateOrAddCustomerRecord(customersSheet, {
        customerName: saleData.customerName,
        customerPhone: normalizedCustomerPhone,
        customerAddress: saleData.customerAddress,
        grandTotal: grandTotal,
        date: dateStr
      });
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      invoiceNumber: invoiceNumber,
      saleId: saleId,
      subtotal: recomputedSubtotal,
      grandTotal: grandTotal,
      items: validatedItems,
      message: 'Sale recorded and inventory updated successfully'
    };
  } finally {
    lock.releaseLock();
  }
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

function allocateSequentialInvoiceNumber(settingsSheet) {
  // R11.5: Refuse to sell when Settings sheet is missing instead of falling back to duplicate INV-yyyymmdd-0001
  if (!settingsSheet) {
    throw new Error('Settings sheet missing; cannot allocate invoice number.');
  }

  var yyyymmdd = Utilities.formatDate(new Date(), 'Asia/Yangon', 'yyyyMMdd');
  var counterKey = 'invoiceSeq_' + yyyymmdd;

  var data = settingsSheet.getDataRange().getValues();
  var foundRow = -1;
  var currentSeq = 0;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === counterKey) {
      foundRow = r + 1;
      currentSeq = parseInt(String(data[r][1]), 10) || 0;
      break;
    }
  }

  var nextSeq = currentSeq + 1;
  if (foundRow > 0) {
    settingsSheet.getRange(foundRow, 2).setValue(String(nextSeq));
  } else {
    settingsSheet.appendRow([counterKey, String(nextSeq)]);
  }

  var padded = ('0000' + nextSeq).slice(-4);
  return 'INV-' + yyyymmdd + '-' + padded;
}

// R11.5: Private helper (trailing underscore) so browser google.script.run cannot invoke it outside the script lock
function generateInvoiceNumber_() {
  var ss = getSpreadsheet();
  return allocateSequentialInvoiceNumber(ss ? ss.getSheetByName('Settings') : null);
}

function normalizeMyanmarPhone(rawPhone) {
  var digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.indexOf('959') === 0) {
    digits = '0' + digits.slice(2);
  } else if (digits.indexOf('9') === 0 && digits.length >= 8) {
    digits = '0' + digits;
  }
  return digits;
}

function updateOrAddCustomerRecord(sheet, saleData) {
  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  var phone = normalizeMyanmarPhone(saleData.customerPhone);

  for (var r = 1; r < data.length; r++) {
    if (normalizeMyanmarPhone(data[r][2]) === phone) {
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
