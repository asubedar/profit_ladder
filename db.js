// db.js
const dbName = "ProfitLadderDB";
const positionsStoreName = "Positions";
const settingsStoreName = "Settings";

/**
 * Opens the IndexedDB database, creating object stores and indexes if needed.
 * @returns {Promise<IDBDatabase>} The opened IndexedDB database instance.
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3); // Version 3

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create Positions store with tickerSymbol index
            if (!db.objectStoreNames.contains(positionsStoreName)) {
                const positionsStore = db.createObjectStore(positionsStoreName, { keyPath: "id", autoIncrement: true });
                positionsStore.createIndex("tickerSymbol", "tickerSymbol", { unique: false });
                appendDebugLog("Created 'Positions' object store with 'tickerSymbol' index.");
            } else {
                const positionsStore = request.transaction.objectStore(positionsStoreName);
                if (!positionsStore.indexNames.contains("tickerSymbol")) {
                    positionsStore.createIndex("tickerSymbol", "tickerSymbol", { unique: false });
                    appendDebugLog("Added 'tickerSymbol' index to 'Positions' object store.");
                }
            }

            // Create Settings store
            if (!db.objectStoreNames.contains(settingsStoreName)) {
                db.createObjectStore(settingsStoreName, { keyPath: "key" });
                appendDebugLog("Created 'Settings' object store.");
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            appendDebugLog("Database opened successfully.");
            resolve(db);
        };

        request.onerror = (event) => {
            appendDebugLog(`Database open failed: ${event.target.error}`);
            reject(event.target.error);
        };
    });
}

/**
 * Appends a message to the debug logs.
 * @param {string} message - The message to append.
 */
function appendDebugLog(message) {
    const debugLogs = document.getElementById("debugLogs");
    if (debugLogs) {
        const logEntry = document.createElement("div");
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        debugLogs.appendChild(logEntry);
    } else {
        console.log(message); // Fallback to console if debugLogs element doesn't exist
    }
}
