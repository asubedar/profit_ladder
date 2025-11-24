/**
 * shared.js
 * Common logic for Profit Ladder Suite
 * Handles: IndexedDB, API Key Management, and Logging
 */

// --- Constants ---
const DB_NAME = "ProfitLadderDB";
const POSITIONS_STORE_NAME = "Positions";
const SETTINGS_STORE_NAME = "Settings";
const DB_VERSION = 3;

// --- Debug Logging ---
function appendDebugLog(message) {
    const debugLogs = document.getElementById("debugLogs");
    if (debugLogs) {
        const logEntry = document.createElement("div");
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `[${timestamp}] ${message}`;
        logEntry.style.borderBottom = "1px solid #333";
        debugLogs.appendChild(logEntry);
        debugLogs.scrollTop = debugLogs.scrollHeight;
    } else {
        console.log(`[DEBUG]: ${message}`);
    }
}

// --- Database Connection ---
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Create Positions Store
            if (!db.objectStoreNames.contains(POSITIONS_STORE_NAME)) {
                const positionsStore = db.createObjectStore(POSITIONS_STORE_NAME, { keyPath: "id" });
                positionsStore.createIndex("tickerSymbol", "tickerSymbol", { unique: false });
            }
            // Create Settings Store
            if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
                db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: "key" });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// --- API Key Helper ---
async function getApiKeys() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction(SETTINGS_STORE_NAME, "readonly");
        const store = transaction.objectStore(SETTINGS_STORE_NAME);

        const getKey = (keyName) => new Promise((resolve) => {
            const req = store.get(keyName);
            req.onsuccess = (e) => resolve(e.target.result?.value || null);
            req.onerror = () => resolve(null);
        });

        const [alpacaKey, alpacaSecret, finnhubKey] = await Promise.all([
            getKey("APCA_API_KEY_ID"),
            getKey("APCA_API_SECRET_KEY"),
            getKey("finnhubApiKey")
        ]);

        return { alpacaKey, alpacaSecret, finnhubKey };
    } catch (error) {
        console.error("Error fetching keys:", error);
        return { alpacaKey: null, alpacaSecret: null, finnhubKey: null };
    }
}

// --- Common UI: Settings Toggle ---
function initializeSettingsToggle() {
    const icon = document.getElementById("settingsIcon");
    const panel = document.getElementById("settings");
    if(icon && panel) {
        icon.addEventListener("click", () => {
            panel.classList.toggle("d-none");
        });
    }
}
