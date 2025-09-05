/**
 * @fileoverview Google Apps Script for H. Saban VIP System Backend
 * @version 3.0 - Integrated user's helper functions and corrected SPREADSHEET_ID.
 * @author Gemini & User Collab
 */

// --- הגדרות תצורה גלובליות ---
const SPREADSHEET_ID = '1c1HUdSgnd9ZzZ1NGg-dVXo_iKWCdF3rtZWIqFM9aYVg'; // ID מעודכן מהקוד שלך

const SHEETS = {
    USERS: "לקוחות",
    ORDERS: "הזמנות",
    PROJECTS: "פרויקטים",
    CONTAINERS: "מכולות פעילות",
    CATALOG: "קטלוג מוצרים",
    CHAT: "תקשורת-צ'אט-VIP"
};

/**
 * נקודת הכניסה הראשית לכל בקשות ה-POST מהאפליקציה.
 */
function doPost(e) {
  if (!e || !e.parameter || !e.postData) {
    return createJsonResponse({ success: false, error: "Server function was called incorrectly." });
  }
  try {
    const action = e.parameter.action;
    const params = JSON.parse(e.postData.contents);
    let result;

    Logger.log(`Action: "${action}", Params: ${JSON.stringify(params)}`);

    switch (action) {
      case 'getUserData':
        result = handleGetUserData(params);
        break;
      // הוסף כאן case-ים נוספים לפעולות POST עתידיות
      default:
        throw new Error('פעולת POST לא חוקית: ' + action);
    }
    return createJsonResponse({ success: true, ...result });
  } catch (err) {
    Logger.log("Error in doPost: " + err.stack);
    return createJsonResponse({ success: false, error: err.message });
  }
}

/**
 * פונקציית עזר גנרית לשליפת נתונים מכל גיליון.
 * @param {string} sheetName - שם הגיליון.
 * @returns {Array<Object>} - מערך של אובייקטים המייצגים את השורות.
 */
function getData(sheetName) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
    if (!sheet) {
        Logger.log(`Sheet with name "${sheetName}" not found.`);
        return [];
    }
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values.shift(); // מוציא את שורת הכותרות
    const data = values.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i];
        });
        return obj;
    });
    return data;
}

/**
 * מטפל בהתחברות משתמש - מאמת טלפון וסיסמה.
 */
function handleGetUserData(params) {
    const { phone, password } = params;
    Logger.log(`Attempting login for phone: "${phone}"`);

    const users = getData(SHEETS.USERS);
    const user = users.find(u => String(u['מספר טלפון']).trim() === String(phone).trim());

    if (!user) {
        Logger.log(`User not found for phone: ${phone}`);
        return { user: null }; // משתמש לא קיים
    }
    
    Logger.log(`User found. Comparing passwords. App: "${password}", Sheet: "${user['סיסמה']}"`);

    if (String(user['סיסמה']).trim() !== String(password).trim()) {
        Logger.log(`Password mismatch for user: ${phone}`);
        return { user: null }; // סיסמה שגויה
    }
    
    Logger.log(`Login successful for ${phone}. Fetching associated data.`);
    const customerId = user['מזהה לקוח'];
    const projects = getData(SHEETS.PROJECTS).filter(p => p['מזהה לקוח'] === customerId);
    //שים לב: בקוד שלך הכותרת היא 'מספר_לקוח', ודא שהיא תואמת
    const orders = getData(SHEETS.ORDERS).filter(o => o['מזהה לקוח'] === customerId || o['מספר_לקוח'] === customerId);

    return {
        user: user,
        projects: projects,
        orders: orders
    };
}


/**
 * יוצרת אובייקט תגובה בפורמט JSON סטנדרטי.
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ----- הפונקציות הישנות שלך נשארות כאן למקרה שתרצה להשתמש בהן ב-doGet -----
// מומלץ להעביר את הלוגיקה שלהן לתוך ה-doPost בצורה מסודרת בעתיד
function doGet(e) {
  try {
    const action = e.parameter.action;
    switch (action) {
      case 'getContainers':
        return createJsonResponse(getContainerStatus(e.parameter.phone));
      case 'getCatalog':
        return createJsonResponse(getCatalog());
      default:
        return createJsonResponse({ success: false, error: 'פעולת GET לא חוקית' });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

function getContainerStatus(phone) {
  const containers = getData(SHEETS.CONTAINERS).filter(c => c['טלפון לקוח'] === phone);
  return { success: true, containers: containers };
}

function getCatalog() {
  const catalog = getData(SHEETS.CATALOG);
  return { success: true, catalog: catalog };
}

