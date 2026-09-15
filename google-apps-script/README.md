# Google Apps Script Setup Guide for Mobile Shop POS

Follow these steps to deploy this Point of Sale and Inventory Management system directly on Google Sheets and Google Apps Script:

---

### Step 1: Create a Google Spreadsheet
1. Go to [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Name it: **"Mobile Shop POS & Inventory Database"**.

---

### Step 2: Open Google Apps Script Editor
1. In your Google Sheet, click on **Extensions** in the top menu bar.
2. Select **Apps Script**.

---

### Step 3: Copy `Code.gs`
1. In the Apps Script code editor, delete any code inside `Code.gs`.
2. Open `google-apps-script/Code.gs` from this project, copy its entire contents, and paste it into the Apps Script `Code.gs` editor.

---

### Step 4: Add `index.html`
1. In the Apps Script left panel, click the **+ (Add a file)** button next to "Files" and select **HTML**.
2. Name the file **`index`** (Apps Script will create `index.html`).
3. Delete any default code inside it.
4. Open `google-apps-script/index.html` from this project, copy all the HTML code, and paste it into `index.html`.

---

### Step 5: Deploy as a Web App
1. At the top-right corner of Google Apps Script, click **Deploy** > **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Configure the settings:
   - **Description**: `Mobile Shop POS v1`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` (or `Anyone within your organization`)
4. Click **Deploy**.
5. Grant permissions if prompted by Google (Click *Advanced* > *Go to (project name)* > *Allow*).
6. Copy the **Web App URL** provided and open it in your browser or bookmark it on your POS tablet/computer!

---

### Key Features Included:
- **Real-Time Google Sheets Database**: Automatically provisions `Products`, `Sales`, `Customers`, `Suppliers`, `Expenses`, and `Settings` sheets.
- **Serialized IMEI Inventory Management**: Deducts stock and removes sold serial IMEIs automatically upon sale completion.
- **A5 Voucher & Thermal Slip Printing**: Includes the updated A5 voucher slip layout (with item descriptions, dual signatures, hotline, and payment info) plus 80mm & 58mm thermal roll printing.
- **Myanmar Payment Methods**: Built-in support for KBZPay, WavePay, AYA Pay, CB Pay, and Cash.
