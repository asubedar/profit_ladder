// db.js
const dbName = "ProfitLadderDB";
const positionsStoreName = "Positions";
const settingsStoreName = "Settings";

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3); // Version 3
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(positionsStoreName)) {
                const positionsStore = db.createObjectStore(positionsStoreName, { keyPath: "id" });
                positionsStore.createIndex("tickerSymbol", "tickerSymbol", { unique: false });
                appendDebugLog("Created 'Positions' object store with 'tickerSymbol' index.");
            } else {
                const positionsStore = request.transaction.objectStore(positionsStoreName);
                if (!positionsStore.indexNames.contains("tickerSymbol")) {
                    positionsStore.createIndex("tickerSymbol", "tickerSymbol", { unique: false });
                    appendDebugLog("Added 'tickerSymbol' index to 'Positions' object store.");
                }
            }

            if (!db.objectStoreNames.contains(settingsStoreName)) {
                db.createObjectStore(settingsStoreName, { keyPath: "key" });
                appendDebugLog("Created 'Settings' object store.");
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            appendDebugLog(`Database open failed: ${event.target.error}`);
            reject(event.target.error);
        };
    });
}
