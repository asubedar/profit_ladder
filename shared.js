// shared.js - Central Data Manager
const DB_NAME = "ProfitLadderDB";
const DB_VERSION = 4; // Updated to match charts.html

function getApiKeys() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("Settings")) {
                db.createObjectStore("Settings", { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains("Positions")) {
                db.createObjectStore("Positions", { keyPath: "symbol" });
            }
            // New store for Finnhub data
            if (!db.objectStoreNames.contains("Financials")) {
                db.createObjectStore("Financials", { keyPath: "symbol" });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(["Settings"], "readonly");
            const store = transaction.objectStore("Settings");

            const keys = { alpacaKey: null, alpacaSecret: null, finnhubKey: null };
            
            let req1 = store.get("APCA_API_KEY_ID");
            req1.onsuccess = () => {
                if (req1.result) keys.alpacaKey = req1.result.value;
            };

            let req2 = store.get("APCA_API_SECRET_KEY");
            req2.onsuccess = () => {
                if (req2.result) keys.alpacaSecret = req2.result.value;
            };

            let req3 = store.get("FINNHUB_API_KEY");
            req3.onsuccess = () => {
                if (req3.result) keys.finnhubKey = req3.result.value;
            };

            transaction.oncomplete = () => {
                // Fallback for older keys if stored differently
                resolve({
                    k: keys.alpacaKey,
                    s: keys.alpacaSecret,
                    f: keys.finnhubKey
                });
            };
        };

        request.onerror = (event) => {
            console.error("DB Error in shared.js:", event.target.error);
            reject(event.target.error);
        };
    });
}

// Helper to clear DB if needed from console
function nukeDatabase() {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
        console.log("Database deleted.");
        window.location.reload();
    };
}
