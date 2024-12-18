// db.js
"use strict";

/**
 * Constants for store names.
 */
export const positionsStoreName = "Positions";
export const settingsStoreName = "Settings";

/**
 * Opens the IndexedDB database.
 * @returns {Promise<IDBDatabase>} The opened database instance.
 */
export function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ProfitLadderDB", 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(positionsStoreName)) {
                const positionsStore = db.createObjectStore(positionsStoreName, { keyPath: "id", autoIncrement: true });
                positionsStore.createIndex("tickerSymbol", "tickerSymbol", { unique: false });
            }
            if (!db.objectStoreNames.contains(settingsStoreName)) {
                db.createObjectStore(settingsStoreName, { keyPath: "key" });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

/**
 * Retrieves all records from a specified object store.
 * @param {string} storeName - The name of the object store.
 * @returns {Promise<Array>} An array of all records.
 */
export function getAll(storeName) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Retrieves a single record by key from a specified object store.
 * @param {string} storeName - The name of the object store.
 * @param {any} key - The key of the record to retrieve.
 * @returns {Promise<Object>} The retrieved record.
 */
export function get(storeName, key) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Adds or updates a record in a specified object store.
 * @param {string} storeName - The name of the object store.
 * @param {Object} object - The object to add or update.
 * @returns {Promise<void>}
 */
export function put(storeName, object) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(object);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Deletes a record by key from a specified object store.
 * @param {string} storeName - The name of the object store.
 * @param {any} key - The key of the record to delete.
 * @returns {Promise<void>}
 */
export function deleteItem(storeName, key) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}