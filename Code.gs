// --- CONFIGURATION ---
const SPREADSHEET_ID = '1_niANNPnGlXw3pg2bcT40cruFtoKMM0D8IAIYRzleYc';
const SS = SpreadsheetApp.openById(SPREADSHEET_ID);

// Admin Users (Hardcoded for security)
const ADMIN_USERS = {
  'saban@saban.co.il': '123456'
};

// Sheet Names
const SHEETS = {
  CLIENTS: 'לקוחות',
  PROJECTS: 'פרויקטים',
  ORDERS: 'הזמנות',
  CONTAINER_TRACKING: 'מעקב מכולות',
  PRODUCT_CATALOG: 'קטלוג מוצרים',
  MUNICIPAL_GUIDELINES: 'הנחיות מוניציפליות',
  PUSH_SUBSCRIPTIONS: 'רישום התראות Push',
  CHAT: 'תקשורת (צ\'אט)',
  AUDIT_LOG: 'יומן ביקורת (AuditLog)'
};
/**
 * DROP-IN PATCH for your Code.js to ensure rows are actually written
 * - Adds strong validation, locking, and header-based appends
 * - Exposes the new functions over doPost actions
 */

// ===== Required headers per sheet (adjust if your sheet headers differ) =====
const REQUIRED_CLIENT_HEADERS = [
  'מזהה לקוח',
  'שם לקוח',
  'מספר טלפון',
  'סיסמה',
  'כתובת',
  'נראה לאחרונה'
];

const REQUIRED_ORDER_HEADERS = [
  'מזהה הזמנה',
  'מספר לקוח',
  'פרויקט',
  'סוג הזמנה',
  'קטגוריית סטטוס',
  'סוג פעולה',
  'תאריך הזמנה',
  'סטטוס',
  'פריטים',
  'created_at (תאריך יצירה)',
  'updated_at (תאריך עדכון)',
  'modified_by'
];

// ===== Helpers =====
function ensureSheet(sheetName) {
  const sh = SS.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet not found: ${sheetName}`);
  return sh;
}

function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (!lastCol) throw new Error(`Sheet ${sheet.getName()} has no header row`);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function assertHeaders(headers, required, sheetName) {
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    throw new Error(`Missing headers in sheet "${sheetName}": ${missing.join(', ')}`);
  }
}

function headersMap(headers) {
  const map = {};
  headers.forEach((h, i) => map[h] = i);
  return map;
}

function appendByHeaderObject(sheet, headers, obj) {
  const row = headers.map(h => (h in obj ? obj[h] : ''));
  sheet.appendRow(row);
  SpreadsheetApp.flush();
}

// ===== Public API: Create customer =====
function createClient(clientData) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const clientsSheet = ensureSheet(SHEETS.CLIENTS);
    const headers = getHeaders(clientsSheet);
    assertHeaders(headers, REQUIRED_CLIENT_HEADERS, SHEETS.CLIENTS);

    const newClientId = `CLT-${Utilities.getUuid().slice(0, 8)}`;
    const now = new Date();

    const rowObj = {
      'מזהה לקוח': newClientId,
      'שם לקוח': clientData.name || '',
      'מספר טלפון': clientData.phone ? String(clientData.phone) : '',
      'סיסמה': clientData.password || '1234',
      'כתובת': clientData.address || '',
      'נראה לאחרונה': now
    };

    appendByHeaderObject(clientsSheet, headers, rowObj);
    logAction(newClientId, 'createClient', { name: clientData.name, phone: clientData.phone });
    return { success: true, clientId: newClientId };
  } catch (err) {
    logAction('system', 'createClient failed', { error: err.message, clientData });
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

// ===== Public API: Create order (generic) =====
function createOrderForClient(orderData) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    if (!orderData || !orderData.clientId) throw new Error('orderData.clientId is required');

    const ordersSheet = ensureSheet(SHEETS.ORDERS);
    const headers = getHeaders(ordersSheet);
    assertHeaders(headers, REQUIRED_ORDER_HEADERS, SHEETS.ORDERS);

    const newOrderId = `ORD-${Utilities.getUuid().slice(0, 8)}`;
    const now = new Date();

    const rowObj = {
      'מזהה הזמנה': newOrderId,
      'מספר לקוח': orderData.clientId,
      'פרויקט': orderData.projectId || '',
      'סוג הזמנה': orderData.orderType || 'כללי',
      'קטגוריית סטטוס': orderData.statusCategory || 'backlog',
      'סוג פעולה': orderData.actionType || '',
      'תאריך הזמנה': orderData.preferredDate || now,
      'סטטוס': orderData.status || 'ממתין לאישור',
      'פריטים': JSON.stringify(orderData.items || []),
      'created_at (תאריך יצירה)': now,
      'updated_at (תאריך עדכון)': now,
      'modified_by': orderData.clientName || ''
    };

    appendByHeaderObject(ordersSheet, headers, rowObj);
    logAction(orderData.clientId, 'createOrderForClient', { orderId: newOrderId, type: rowObj['סוג הזמנה'] });
    return { success: true, orderId: newOrderId };
  } catch (err) {
    logAction(orderData && orderData.clientId ? orderData.clientId : 'system', 'createOrderForClient failed', { error: err.message, orderData });
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

// ===== Convenience wrappers =====
function createActiveOrder(clientId, clientName, projectId) {
  return createOrderForClient({
    clientId: clientId,
    clientName: clientName,
    projectId: projectId || '',
    orderType: 'הזמנה פעילה',
    status: 'בביצוע',
    statusCategory: 'in_progress'
  });
}

function createBuildingMaterialsOrder(clientId, clientName, items) {
  return createOrderForClient({
    clientId: clientId,
    clientName: clientName,
    orderType: 'חומרי בניין',
    items: items || [],
    status: 'ממתין לאישור',
    statusCategory: 'backlog'
  });
}


// --- ROUTING ---
function doGet(e) {
  try {
    const response = { success: true, message: "Apps Script endpoint active" };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

// Handle preflight OPTIONS requests for CORS
function doOptions(e) {
  return ContentService.createTextOutput()
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const payload = request.payload;
    let responseData;

    switch (action) {
      case 'authenticateUser':
        responseData = authenticateUser(payload.phone, payload.password);
        break;
      case 'authenticateAdmin':
        responseData = authenticateAdmin(payload.email, payload.password);
        break;
      case 'getInitialData':
        responseData = getInitialData(payload.userId);
        break;
      case 'createOrder':
        responseData = createOrder(payload.orderData);
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }
    
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');

  } catch (error) {
    logAction('system', 'error -> doPost', { error: error.message, requestBody: e.postData.contents });
    const errorResponse = { success: false, error: error.message };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

// --- UTILITY FUNCTIONS ---
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-9);
}

// --- AUTHENTICATION & DATA FETCHING ---
function authenticateUser(phone, password) {
  const clientsSheet = SS.getSheetByName(SHEETS.CLIENTS);
  const data = clientsSheet.getDataRange().getValues();
  const headers = data.shift();
  
  const phoneIndex = headers.indexOf('מספר טלפון');
  const passwordIndex = headers.indexOf('סיסמה');
  const normalizedPhoneToFind = normalizePhoneNumber(phone);

  for (const row of data) {
    const normalizedSheetPhone = normalizePhoneNumber(row[phoneIndex]);
    if (normalizedSheetPhone === normalizedPhoneToFind && String(row[passwordIndex]).trim() === String(password).trim()) {
      const user = headers.reduce((obj, header, i) => {
        obj[header] = row[i];
        return obj;
      }, {});
      delete user.סיסמה;
      logAction(user['מזהה לקוח'], 'login', { success: true });
      updateLastSeen(user['מזהה לקוח']);
      return { success: true, user: user };
    }
  }
  logAction(phone, 'login failed', {});
  return { success: false, error: 'Invalid credentials' };
}

function authenticateAdmin(email, password) {
  if (ADMIN_USERS[email] && ADMIN_USERS[email].trim() === password.trim()) {
    const adminName = email.split('@')[0];
    logAction(email, 'admin login success', {});
    return { success: true, user: { name: adminName, email: email } };
  } else {
    logAction(email, 'admin login failed', {});
    return { success: false, error: 'Invalid admin credentials' };
  }
}

function getInitialData(userId) {
  try {
    updateLastSeen(userId);
    const projectsSheet = SS.getSheetByName(SHEETS.PROJECTS);
    const ordersSheet = SS.getSheetByName(SHEETS.ORDERS);
    
    const projects = sheetToObjects(projectsSheet).filter(p => String(p['מזהה לקוח']).trim() == String(userId).trim());
    const orders = sheetToObjects(ordersSheet).filter(o => String(o['מספר לקוח']).trim() == String(userId).trim());

    return { success: true, data: { projects, orders } };
  } catch (error) {
    logAction(userId, 'getInitialData failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// --- ORDER MANAGEMENT ---
function createOrder(orderData) {
  try {
    const ordersSheet = SS.getSheetByName(SHEETS.ORDERS);
    const headers = ordersSheet.getRange(1, 1, 1, ordersSheet.getLastColumn()).getValues()[0];
    const newOrderId = `ORD-${Utilities.getUuid().slice(0, 8)}`;
    const now = new Date();

    const newRow = headers.map(header => {
      switch(header) {
        case 'מזהה הזמנה': return newOrderId;
        case 'מספר לקוח': return orderData.clientId;
        case 'פרויקט': return orderData.projectId;
        case 'סוג הזמנה': return orderData.orderType;
        case 'קטגוריית סטטוס': return 'backlog';
        case 'סוג פעולה': return orderData.actionType || '';
        case 'תאריך הזמנה': return orderData.preferredDate;
        case 'סטטוס': return 'ממתין לאישור';
        case 'פריטים': return JSON.stringify(orderData.items || []);
        case 'created_at (תאריך יצירה)': return now;
        case 'updated_at (תאריך עדכון)': return now;
        case 'modified_by': return orderData.clientName;
        default: return '';
      }
    });

    ordersSheet.appendRow(newRow);
    logAction(orderData.clientId, 'createOrder', { orderId: newOrderId, type: orderData.orderType });
    return { success: true, orderId: newOrderId };

  } catch(error) {
    logAction(orderData.clientId, 'createOrder failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// --- DATA CONVERSION UTILITY ---
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

// --- OTHER FUNCTIONS ---
function updateLastSeen(userId) {
  try {
    const clientsSheet = SS.getSheetByName(SHEETS.CLIENTS);
    const data = clientsSheet.getDataRange().getValues();
    const headers = data.shift();
    const idIndex = headers.indexOf('מזהה לקוח');
    const lastSeenIndex = headers.indexOf('נראה לאחרונה');

    if (idIndex === -1 || lastSeenIndex === -1) return;

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][idIndex]).trim() === String(userId).trim()) {
        clientsSheet.getRange(i + 2, lastSeenIndex + 1).setValue(new Date());
        return;
      }
    }
  } catch(e) {
    console.error("Failed to update last seen status: " + e.message);
    logAction(userId, 'updateLastSeen failed', { error: e.message });
  }
}

// --- ADD NEW CUSTOMER ---
function createClient(clientData) {
  try {
    const clientsSheet = SS.getSheetByName(SHEETS.CLIENTS);
    const headers = clientsSheet.getRange(1, 1, 1, clientsSheet.getLastColumn()).getValues()[0];
    const newClientId = `CLT-${Utilities.getUuid().slice(0, 8)}`;
    const now = new Date();

    const newRow = headers.map(header => {
      switch(header) {
        case 'מזהה לקוח': return newClientId;
        case 'שם לקוח': return clientData.name;
        case 'מספר טלפון': return clientData.phone;
        case 'סיסמה': return clientData.password || '1234';
        case 'כתובת': return clientData.address || '';
        case 'נראה לאחרונה': return now;
        default: return '';
      }
    });

    clientsSheet.appendRow(newRow);
    logAction(newClientId, 'createClient', { name: clientData.name, phone: clientData.phone });
    return { success: true, clientId: newClientId };

  } catch (error) {
    logAction('system', 'createClient failed', { error: error.message });
    return { success: false, error: error.message };
  }
}



function logAction(user, action, details) {
  try {
    const logSheet = SS.getSheetByName(SHEETS.AUDIT_LOG);
    const timestamp = new Date();
    const detailsString = JSON.stringify(details);
    logSheet.appendRow([timestamp, user, action, details.orderId || '', detailsString]);
  } catch (e) {
    console.error("Failed to write to Audit Log: " + e.message);
  }
}
