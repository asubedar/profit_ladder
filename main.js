// main.js
"use strict";

import { openDatabase, getAll, get, put, deleteItem, positionsStoreName, settingsStoreName } from './db.js';
import { debounce, calculateTimeSinceLastTrade } from './utils.js';

/**
 * Appends a message to the debug logs.
 * @param {string} message - The message to append.
 */
export function appendDebugLog(message) {
    const debugLogs = document.getElementById("debugLogs");
    if (debugLogs) {
        const timestamp = new Date().toLocaleTimeString();
        debugLogs.innerHTML += `[${timestamp}] ${message}<br>`;
        debugLogs.scrollTop = debugLogs.scrollHeight; // Auto-scroll to bottom
    }
}

/**
 * Determines which page is currently loaded.
 * @returns {string} The current page's name ('index' or 'portfolio').
 */
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.endsWith("index.html") || path === "/") return "index";
    if (path.endsWith("portfolio.html")) return "portfolio";
    return "unknown";
}

/**
 * Initializes functionalities specific to index.html.
 */
async function initializeIndexPage() {
    // Handle saving a position
    const savePositionButton = document.getElementById("savePosition");
    const profitForm = document.getElementById("profitForm");
    const resultsDiv = document.getElementById("results");
    const savedPositionsContainer = document.getElementById("savedPositionsContainer");

    /**
     * Saves a position to the IndexedDB.
     */
    async function savePosition() {
        const tickerSymbol = document.getElementById("tickerSymbol").value.trim().toUpperCase();
        const avgPrice = parseFloat(document.getElementById("averagePrice").value);
        const numShares = parseInt(document.getElementById("numShares").value);
        const priceStep = parseFloat(document.getElementById("priceStep").value) || avgPrice * 0.01;
        const levels = parseInt(document.getElementById("levels").value) || 5;

        if (!tickerSymbol || isNaN(avgPrice) || isNaN(numShares)) {
            alert("Please fill in all required fields to save the position.");
            appendDebugLog("Failed to save position: Missing or invalid fields.");
            return;
        }

        const position = { tickerSymbol, avgPrice, numShares, priceStep, levels };

        try {
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readwrite");
            const store = transaction.objectStore(positionsStoreName);

            // Check if the position already exists
            const existingRequest = store.index("tickerSymbol").getAll(tickerSymbol);
            existingRequest.onsuccess = async (event) => {
                const existingPositions = event.target.result;
                if (existingPositions.length > 0) {
                    // Update the existing position
                    const existingPosition = existingPositions[0];
                    existingPosition.avgPrice = avgPrice;
                    existingPosition.numShares = numShares;
                    existingPosition.priceStep = priceStep;
                    existingPosition.levels = levels;

                    const updateRequest = store.put(existingPosition);
                    updateRequest.onsuccess = () => {
                        appendDebugLog(`Position updated: ${JSON.stringify(existingPosition)}`);
                        alert(`Position for ${tickerSymbol} updated successfully.`);
                        loadSavedPositions();
                    };
                    updateRequest.onerror = (e) => {
                        appendDebugLog(`Failed to update position for ${tickerSymbol}: ${e.target.error}`);
                        alert("Failed to update the position. Please try again.");
                    };
                } else {
                    // Add a new position
                    const addRequest = store.add(position);
                    addRequest.onsuccess = () => {
                        appendDebugLog(`Position saved: ${JSON.stringify(position)}`);
                        alert(`Position for ${tickerSymbol} saved successfully.`);
                        loadSavedPositions();
                    };
                    addRequest.onerror = (e) => {
                        appendDebugLog(`Failed to save position for ${tickerSymbol}: ${e.target.error}`);
                        alert("Failed to save the position. Please try again.");
                    };
                }
            };
            existingRequest.onerror = (event) => {
                appendDebugLog(`Error checking existing positions: ${event.target.error}`);
                alert("An error occurred while saving the position.");
            };
        } catch (error) {
            appendDebugLog(`Error saving position: ${error}`);
            alert("An unexpected error occurred while saving the position.");
        }
    }

    /**
     * Loads all saved positions and displays them as tabs.
     */
    async function loadSavedPositions() {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readonly");
            const store = transaction.objectStore(positionsStoreName);
            const request = store.getAll();

            savedPositionsContainer.innerHTML = ""; // Clear existing tabs

            request.onsuccess = () => {
                request.result.forEach((position) => {
                    const tab = document.createElement("div");
                    tab.className = "tab";

                    const label = document.createElement("span");
                    label.textContent = position.tickerSymbol;

                    const deleteButton = document.createElement("button");
                    deleteButton.textContent = "X";
                    deleteButton.className = "btn-delete";
                    deleteButton.addEventListener("click", async (event) => {
                        event.stopPropagation();
                        await deletePosition(position.id);
                        alert(`Position ${position.tickerSymbol} deleted successfully.`);
                        loadSavedPositions();
                    });

                    tab.appendChild(label);
                    tab.appendChild(deleteButton);

                    tab.addEventListener("click", () => {
                        document.getElementById("tickerSymbol").value = position.tickerSymbol;
                        document.getElementById("averagePrice").value = position.avgPrice;
                        document.getElementById("numShares").value = position.numShares;
                        document.getElementById("priceStep").value = position.priceStep;
                        document.getElementById("levels").value = position.levels;
                        calculateResults();
                    });

                    savedPositionsContainer.appendChild(tab);
                });
            };

            request.onerror = (event) => {
                appendDebugLog(`Failed to load saved positions: ${event.target.error}`);
            };
        } catch (error) {
            appendDebugLog(`Error loading saved positions: ${error}`);
        }
    }

    /**
     * Deletes a position from the IndexedDB.
     * @param {number} id - The ID of the position to delete.
     */
    async function deletePosition(id) {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readwrite");
            const store = transaction.objectStore(positionsStoreName);
            const request = store.delete(id);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            appendDebugLog(`Error deleting position ID ${id}: ${error}`);
            throw error;
        }
    }

    /**
     * Calculates and displays the results based on the entered position data.
     */
    async function calculateResults() {
        const tickerSymbol = document.getElementById("tickerSymbol").value.trim().toUpperCase();
        const avgPrice = parseFloat(document.getElementById("averagePrice").value);
        const numShares = parseInt(document.getElementById("numShares").value);
        const priceStep = parseFloat(document.getElementById("priceStep").value) || avgPrice * 0.01;
        const levels = parseInt(document.getElementById("levels").value) || 5;

        if (!tickerSymbol || isNaN(avgPrice) || isNaN(numShares)) {
            alert("Please fill in all required fields to calculate.");
            return;
        }

        try {
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readonly");
            const store = transaction.objectStore(positionsStoreName);
            const request = store.index("tickerSymbol").get(tickerSymbol);

            request.onsuccess = (event) => {
                const position = event.target.result;
                const lastPrice = position?.lastPrice || avgPrice; // Use lastPrice if available, fallback to avgPrice

                const resultsDiv = document.getElementById("results");
                let html = '<table class="table table-dark table-bordered"><thead><tr><th>Price Level</th><th>Profit/Loss</th><th>% Gain/Loss</th></tr></thead><tbody>';

                let closestRowHtml = "";
                let smallestDifference = Infinity;
                let closestRowElement = null;

                for (let i = -levels; i <= levels; i++) {
                    const priceLevel = avgPrice + i * priceStep;
                    if (priceLevel < 0) continue;
                    const profitLoss = (priceLevel - avgPrice) * numShares;
                    const percentChange = ((priceLevel - avgPrice) / avgPrice) * 100;

                    const rowHtml = `
                        <tr data-price-level="${priceLevel}">
                            <td>${priceLevel.toFixed(2)}</td>
                            <td>${profitLoss.toFixed(2)}</td>
                            <td>${percentChange.toFixed(2)}%</td>
                        </tr>
                    `;

                    const difference = Math.abs(priceLevel - lastPrice);
                    if (difference < smallestDifference) {
                        smallestDifference = difference;
                        closestRowHtml = rowHtml;
                    }

                    html += rowHtml;
                }

                html += '</tbody></table>';
                resultsDiv.innerHTML = html;

                // Highlight the closest row
                const table = resultsDiv.querySelector("table");
                const rows = table.querySelectorAll("tr[data-price-level]");
                rows.forEach((row) => {
                    const priceLevel = parseFloat(row.getAttribute("data-price-level"));
                    const regex = /data-price-level="([\d.-]+)"/;
                    const match = closestRowHtml.match(regex);
                    if (match && priceLevel === parseFloat(match[1])) {
                        row.classList.add("highlight-row");
                        closestRowElement = row;
                    }
                });

                // Scroll to the highlighted row
                if (closestRowElement) {
                    closestRowElement.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            };

            request.onerror = (event) => {
                appendDebugLog(`Error fetching position for ${tickerSymbol}: ${event.target.error}`);
                alert("An error occurred while fetching the position data.");
            };
        } catch (error) {
            appendDebugLog(`Error calculating results: ${error}`);
            alert("An unexpected error occurred while calculating results.");
        }
    }

    /**
     * Exports all positions to a JSON file.
     */
    async function exportToFile() {
        try {
            const positions = await getAll(positionsStoreName);
            const json = JSON.stringify(positions, null, 2);

            // Create a downloadable file
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "positions.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            appendDebugLog("Positions exported successfully to JSON file.");
            alert("Positions exported successfully. You can now upload this file to any service.");
        } catch (error) {
            appendDebugLog(`Error exporting positions: ${error}`);
            alert("Failed to export positions.");
        }
    }

    /**
     * Imports positions from a JSON file URL.
     */
    async function importPositions() {
        const urlField = document.getElementById("jsonUrl");
        const enteredUrl = urlField.value.trim();

        if (!enteredUrl) {
            alert("Please enter a valid URL for JSON data.");
            appendDebugLog("Import failed: No URL provided.");
            return;
        }

        try {
            const response = await fetch(enteredUrl);
            if (!response.ok) {
                appendDebugLog(`Failed to fetch positions from URL: ${response.statusText}`);
                alert("Failed to fetch positions from the given URL.");
                return;
            }

            const positions = await response.json();
            if (!Array.isArray(positions)) {
                throw new Error("Invalid JSON format. Expected an array of positions.");
            }

            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readwrite");
            const store = transaction.objectStore(positionsStoreName);

            positions.forEach((position) => {
                store.put(position);
            });

            transaction.oncomplete = () => {
                appendDebugLog("Positions imported successfully.");
                alert("Positions imported successfully.");
                loadSavedPositions();
            };

            transaction.onerror = (event) => {
                appendDebugLog(`Failed to import positions: ${event.target.error}`);
                alert("Failed to import positions.");
            };
        } catch (error) {
            appendDebugLog(`Error importing positions: ${error.message}`);
            alert("Error importing positions. Please check the URL and try again.");
        }
    }

    // Event Listeners
    savePositionButton.addEventListener("click", savePosition);
    profitForm.addEventListener("submit", (event) => {
        event.preventDefault();
        calculateResults();
    });

    // Initialize on Page Load
    document.addEventListener("DOMContentLoaded", async () => {
        await loadSavedPositions();
    });

    // Export and Import Event Listeners
    const exportButton = document.getElementById("exportToFile");
    const importButton = document.getElementById("importButton");

    if (exportButton) {
        exportButton.addEventListener("click", exportToFile);
    }

    if (importButton) {
        importButton.addEventListener("click", importPositions);
    }
}

/**
 * Initializes functionalities specific to portfolio.html.
 */
async function initializePortfolioPage() {
    // Define state variables
    let refreshIntervalId;
    let sortColumn = null;
    let sortDirection = 'asc';
    let allPositions = [];
    let visibleColumns = [
        "tickerSymbol",
        "avgPrice",
        "numShares",
        "lastPrice",
        "costBasis",
        "totalValue",
        "profit",
        "profitPct",
        "changeToday",
        "changePctToday",
        "gapPct",
        "lastTime"
    ];

    // Define the available columns
    const availableColumns = [
        { key: "tickerSymbol", name: "Ticker" },
        { key: "avgPrice", name: "Average Price" },
        { key: "numShares", name: "Shares" },
        { key: "lastPrice", name: "Current Price" },
        { key: "costBasis", name: "Cost Basis" },
        { key: "totalValue", name: "Total Value" },
        { key: "profit", name: "Profit" },
        { key: "profitPct", name: "Profit %" },
        { key: "changeToday", name: "Change Today" },
        { key: "changePctToday", name: "Change % Today" },
        { key: "gapPct", name: "Gap %" },
        { key: "lastTime", name: "Time Since Last Trade" }
    ];

    /**
     * Populates the sortable columns list in the settings section.
     */
    function populateSortableColumns() {
        const sortableColumns = document.getElementById("sortableColumns");
        sortableColumns.innerHTML = ""; // Clear existing list items

        // First, add columns in the order of visibleColumns
        visibleColumns.forEach(columnKey => {
            const column = availableColumns.find(col => col.key === columnKey);
            if (column) {
                const li = createColumnListItem(column);
                sortableColumns.appendChild(li);
            }
        });

        // Then, add the remaining columns not in visibleColumns
        availableColumns.forEach(column => {
            if (!visibleColumns.includes(column.key)) {
                const li = createColumnListItem(column);
                sortableColumns.appendChild(li);
            }
        });

        // Initialize Drag-and-Drop Functionality
        initializeDragAndDrop();

        console.log("Sortable columns populated successfully.");
        appendDebugLog("Sortable columns populated successfully.");
    }

    /**
     * Creates a list item for a column in the sortable columns list.
     * @param {Object} column - The column object containing key and name.
     * @returns {HTMLElement} The created list item element.
     */
    function createColumnListItem(column) {
        const li = document.createElement("li");
        li.className = "column-item list-group-item d-flex align-items-center";
        li.setAttribute("data-column", column.key);
        li.setAttribute("draggable", "true");

        li.innerHTML = `
            <span class="drag-handle me-2"><i class="fas fa-grip-vertical"></i></span>
            <div class="form-check">
                <input class="form-check-input column-checkbox me-2" type="checkbox" id="checkbox-${column.key}" value="${column.key}" ${visibleColumns.includes(column.key) ? "checked" : ""}>
                <label class="form-check-label text-light" for="checkbox-${column.key}">${column.name}</label>
            </div>
        `;

        // Add Event Listener for Checkbox Change
        li.querySelector('.column-checkbox').addEventListener('change', () => {
            updateVisibleColumns();
            renderPortfolio();
        });

        return li;
    }

    /**
     * Initializes drag-and-drop functionality for sortable columns.
     */
    function initializeDragAndDrop() {
        const sortableColumns = document.getElementById("sortableColumns");
        let dragSrcEl = null;

        function handleDragStart(e) {
            dragSrcEl = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', null); // For Firefox compatibility
            this.classList.add('dragging');
        }

        function handleDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault(); // Necessary to allow drop
            }
            e.dataTransfer.dropEffect = 'move'; // Show move cursor
            return false;
        }

        function handleDragEnter(e) {
            this.classList.add('over');
        }

        function handleDragLeave(e) {
            this.classList.remove('over');
        }

        function handleDrop(e) {
            if (e.stopPropagation) {
                e.stopPropagation(); // Stops the browser from redirecting.
            }

            if (dragSrcEl !== this) {
                // Reorder the DOM elements by inserting the dragged element before the drop target
                sortableColumns.insertBefore(dragSrcEl, this);

                // Update visibleColumns based on new order
                updateVisibleColumns();
                renderPortfolio();
            }
            return false;
        }

        function handleDragEnd(e) {
            this.classList.remove('dragging');
            const items = sortableColumns.querySelectorAll('.column-item');
            items.forEach(function (item) {
                item.classList.remove('over');
            });
        }

        function addDnDHandlers(elem) {
            elem.addEventListener('dragstart', handleDragStart, false);
            elem.addEventListener('dragenter', handleDragEnter, false);
            elem.addEventListener('dragover', handleDragOver, false);
            elem.addEventListener('dragleave', handleDragLeave, false);
            elem.addEventListener('drop', handleDrop, false);
            elem.addEventListener('dragend', handleDragEnd, false);
        }

        const items = sortableColumns.querySelectorAll('.column-item');
        items.forEach(function(item) {
            addDnDHandlers(item);
        });
    }

    /**
     * Updates the visibleColumns array based on the current settings and saves it to IndexedDB.
     */
    async function updateVisibleColumns() {
        const sortableColumns = document.getElementById("sortableColumns");
        const columnItems = sortableColumns.querySelectorAll('.column-item');
        visibleColumns = Array.from(columnItems)
            .filter(item => item.querySelector('.column-checkbox').checked)
            .map(item => item.getAttribute('data-column'));

        // Ensure uniqueness to prevent duplicate columns
        visibleColumns = [...new Set(visibleColumns)];

        console.log("Updated visibleColumns:", visibleColumns);
        appendDebugLog("Updated visibleColumns.");

        // Save visibleColumns to IndexedDB
        try {
            await put(settingsStoreName, { key: "visibleColumns", value: visibleColumns });
            appendDebugLog("Visible columns saved to settings.");
        } catch (error) {
            console.error("Error saving visible columns:", error);
            appendDebugLog(`Error saving visible columns: ${error}`);
        }
    }

    /**
     * Fetches all visible positions from IndexedDB.
     * @returns {Promise<Array>} An array of visible positions.
     */
    async function fetchVisiblePositions() {
        try {
            const all = await getAll(positionsStoreName);
            // Filter out positions where hide is true
            const visible = all.filter(position => !position.hide);
            return visible;
        } catch (error) {
            console.error("Error fetching visible positions:", error);
            appendDebugLog(`Error fetching visible positions: ${error}`);
            return [];
        }
    }

    /**
     * Fetches all unique tickers from IndexedDB.
     * @returns {Promise<Array>} An array of unique ticker symbols.
     */
    async function fetchAllTickers() {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readonly");
            const store = transaction.objectStore(positionsStoreName);
            const index = store.index("tickerSymbol");

            return new Promise((resolve, reject) => {
                const request = index.openCursor(null, "nextunique");
                const tickers = [];
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        tickers.push(cursor.key);
                        cursor.continue();
                    } else {
                        resolve(tickers);
                    }
                };
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error("Error fetching all tickers:", error);
            appendDebugLog(`Error fetching all tickers: ${error}`);
            return [];
        }
    }

    /**
     * Generates filter checkboxes based on unique tickers.
     * @param {Array} uniqueTickers - An array of unique ticker symbols.
     */
    async function generateFilterCheckboxes(uniqueTickers) {
        const filterCheckboxes = document.getElementById("filterCheckboxes");
        filterCheckboxes.innerHTML = "";

        try {
            const db = await openDatabase();
            const store = db.transaction(positionsStoreName, "readonly").objectStore(positionsStoreName);

            for (const ticker of uniqueTickers) {
                const checkbox = document.createElement("div");
                checkbox.className = "form-check form-check-inline filter-checkbox";
                checkbox.innerHTML = `
                    <input class="form-check-input" type="checkbox" id="checkbox-${ticker}" value="${ticker}" checked>
                    <label class="form-check-label text-light" for="checkbox-${ticker}">${ticker}</label>
                `;

                // Determine the initial checked state based on positions' hide attribute
                const request = store.index("tickerSymbol").getAll(ticker);
                request.onsuccess = (event) => {
                    const positions = event.target.result;
                    const isHidden = positions.every(pos => pos.hide); // Use 'every' for correct logic
                    if (isHidden) {
                        checkbox.querySelector('input').checked = false;
                    } else {
                        checkbox.querySelector('input').checked = true;
                    }
                };
                request.onerror = (event) => {
                    console.error(`Error fetching positions for ${ticker}:`, event.target.error);
                };

                // Add Event Listener for Checkbox Change
                checkbox.querySelector('input').addEventListener("change", async () => {
                    const ticker = checkbox.querySelector("input").value;
                    const isChecked = checkbox.querySelector("input").checked;
                    const hide = !isChecked;

                    // Update the 'hide' attribute for all positions with this tickerSymbol
                    try {
                        await setHideForTickerSymbol(ticker, hide);
                        console.log(`Set hide=${hide} for tickerSymbol=${ticker}`);
                        appendDebugLog(`Set hide=${hide} for tickerSymbol=${ticker}`);

                        // Reload portfolio after updating hide status
                        await loadPortfolio();
                    } catch (error) {
                        console.error(`Error setting hide for tickerSymbol=${ticker}:`, error);
                        appendDebugLog(`Error setting hide for tickerSymbol=${ticker}: ${error}`);
                    }
                });

                filterCheckboxes.appendChild(checkbox);
            }
        } catch (error) {
            console.error("Error generating filter checkboxes:", error);
            appendDebugLog(`Error generating filter checkboxes: ${error}`);
        }
    }

    /**
     * Sets the 'hide' attribute for all positions with a specific ticker symbol.
     * @param {string} tickerSymbol - The ticker symbol.
     * @param {boolean} hide - Whether to hide the positions.
     */
    async function setHideForTickerSymbol(tickerSymbol, hide) {
        try {
            const all = await getAll(positionsStoreName);
            const positionsToUpdate = all.filter(pos => pos.tickerSymbol === tickerSymbol);
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readwrite");
            const store = transaction.objectStore(positionsStoreName);

            for (const position of positionsToUpdate) {
                position.hide = hide;
                await new Promise((resolve, reject) => {
                    const request = store.put(position);
                    request.onsuccess = () => resolve();
                    request.onerror = (event) => reject(event.target.error);
                });
            }
        } catch (error) {
            console.error(`Error setting hide for tickerSymbol=${tickerSymbol}:`, error);
            appendDebugLog(`Error setting hide for tickerSymbol=${tickerSymbol}: ${error}`);
            throw error;
        }
    }

    /**
     * Fetches current prices from Alpaca or Finnhub.
     * @param {Array} tickers - An array of ticker symbols.
     * @returns {Promise<Object>} An object mapping ticker symbols to their price data.
     */
    async function fetchCurrentPrices(tickers) {
        if (!tickers || tickers.length === 0) {
            return {};
        }

        try {
            const alpacaCredentials = await get(settingsStoreName, "APCA_API_KEY_ID");
            const alpacaSecret = await get(settingsStoreName, "APCA_API_SECRET_KEY");

            if (alpacaCredentials && alpacaCredentials.value && alpacaSecret && alpacaSecret.value) {
                return await fetchPricesFromAlpaca(tickers, alpacaCredentials.value, alpacaSecret.value);
            }

            console.warn("Alpaca credentials not available, falling back to Finnhub.");
            appendDebugLog("Alpaca credentials not available, falling back to Finnhub.");
            const finnhubKey = await get(settingsStoreName, "finnhubApiKey");

            if (!finnhubKey || !finnhubKey.value) {
                console.error("Finnhub API Key is not set. Please configure it in the settings.");
                appendDebugLog("Finnhub API Key is not set. Please configure it in the settings.");
                return {};
            }

            return await fetchPricesFromFinnhub(tickers, finnhubKey.value);
        } catch (error) {
            console.error("Error fetching current prices:", error);
            appendDebugLog(`Error fetching current prices: ${error}`);
            return {};
        }
    }

    /**
     * Fetches prices from Alpaca API.
     * @param {Array} tickers - An array of ticker symbols.
     * @param {string} apiKey - Alpaca API Key.
     * @param {string} apiSecret - Alpaca API Secret.
     * @returns {Promise<Object>} An object mapping ticker symbols to their price data.
     */
    async function fetchPricesFromAlpaca(tickers, apiKey, apiSecret) {
        const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${tickers.join(",")}`;
        try {
            const response = await fetch(url, {
                headers: {
                    "APCA-API-KEY-ID": apiKey,
                    "APCA-API-SECRET-KEY": apiSecret,
                },
            });

            if (!response.ok) {
                console.error("Failed to fetch snapshots from Alpaca:", response.statusText);
                appendDebugLog(`Failed to fetch snapshots from Alpaca: ${response.statusText}`);
                return {};
            }

            const data = await response.json();
            const prices = {};

            for (const [symbol, snapshot] of Object.entries(data)) {
                prices[symbol] = {
                    price: snapshot.latestTrade?.p || 0,
                    time: snapshot.latestTrade?.t ? new Date(snapshot.latestTrade.t).toLocaleString() : "N/A",
                    open: snapshot.dailyBar?.o || 0,
                    prevClose: snapshot.prevDailyBar?.c || 0,
                };
            }

            console.log("Fetched prices from Alpaca:", prices);
            appendDebugLog("Fetched prices from Alpaca.");
            return prices;
        } catch (error) {
            console.error("Error fetching snapshots from Alpaca:", error);
            appendDebugLog(`Error fetching snapshots from Alpaca: ${error}`);
            return {};
        }
    }

    /**
     * Fetches prices from Finnhub API.
     * @param {Array} tickers - An array of ticker symbols.
     * @param {string} apiKey - Finnhub API Key.
     * @returns {Promise<Object>} An object mapping ticker symbols to their price data.
     */
    async function fetchPricesFromFinnhub(tickers, apiKey) {
        try {
            const responses = await Promise.all(
                tickers.map(async (ticker) => {
                    const [quoteResponse, prevCloseResponse] = await Promise.all([
                        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`),
                        fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&count=2&token=${apiKey}`)
                    ]);

                    if (!quoteResponse.ok) {
                        console.error(`Failed to fetch quote data for ${ticker} from Finnhub:`, quoteResponse.statusText);
                        appendDebugLog(`Failed to fetch quote data for ${ticker} from Finnhub: ${quoteResponse.statusText}`);
                        return { ticker, price: 0, time: "N/A", open: 0, prevClose: 0 };
                    }
                    const quoteData = await quoteResponse.json();

                    let prevClose = 0;
                    if (!prevCloseResponse.ok) {
                        console.warn(`Failed to fetch previous close data for ${ticker} from Finnhub:`, prevCloseResponse.statusText);
                        appendDebugLog(`Failed to fetch previous close data for ${ticker} from Finnhub: ${prevCloseResponse.statusText}`);
                    } else {
                        const prevCloseData = await prevCloseResponse.json();
                        prevClose = prevCloseData.c && prevCloseData.c.length > 1 ? prevCloseData.c[prevCloseData.c.length - 2] : 0;
                    }

                    return { ticker, price: quoteData.c || 0, time: new Date().toLocaleString(), open: quoteData.o || 0, prevClose: prevClose };
                })
            );

            const prices = {};
            responses.forEach((res) => {
                if (res.ticker) {
                    prices[res.ticker] = { price: res.price, time: res.time, open: res.open, prevClose: res.prevClose };
                }
            });
            console.log("Fetched prices from Finnhub:", prices);
            appendDebugLog("Fetched prices from Finnhub.");
            return prices;
        } catch (error) {
            console.error("Error fetching prices from Finnhub:", error);
            appendDebugLog(`Error fetching prices from Finnhub: ${error}`);
            return {};
        }
    }

    /**
     * Renders the portfolio table based on visibleColumns and allPositions.
     */
    async function renderPortfolio() {
        const portfolioBody = document.getElementById("portfolioBody");
        portfolioBody.innerHTML = "";

        // Render Table Headers Dynamically
        const portfolioHeaders = document.getElementById("portfolioHeaders");
        portfolioHeaders.innerHTML = ""; // Clear existing headers

        visibleColumns.forEach(columnKey => {
            const header = document.createElement("th");
            header.setAttribute("data-column", columnKey);
            header.setAttribute("data-sort-type", getSortType(columnKey));
            header.setAttribute("data-sort-key", columnKey);
            header.setAttribute("data-col-index", visibleColumns.indexOf(columnKey));

            const thName = document.createElement("span");
            thName.className = "th-name";
            thName.textContent = getColumnDisplayName(columnKey);

            const sortArrowAsc = document.createElement("span");
            sortArrowAsc.className = "sort-arrow asc";
            sortArrowAsc.textContent = "▲";

            const sortArrowDesc = document.createElement("span");
            sortArrowDesc.className = "sort-arrow desc";
            sortArrowDesc.textContent = "▼";

            header.appendChild(thName);
            header.appendChild(sortArrowAsc);
            header.appendChild(sortArrowDesc);

            // Add Event Listener for Sorting
            header.addEventListener('click', async () => {
                if (sortColumn === columnKey) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = columnKey;
                    sortDirection = 'asc';
                }
                sortPositions();
                renderPortfolio();

                // Save sort settings to IndexedDB
                try {
                    await put(settingsStoreName, { key: "sortColumn", value: sortColumn });
                    await put(settingsStoreName, { key: "sortDirection", value: sortDirection });
                    appendDebugLog("Sort settings saved.");
                } catch (error) {
                    console.error("Error saving sort settings:", error);
                    appendDebugLog(`Error saving sort settings: ${error}`);
                }
            });

            // Update sorted class
            if (sortColumn === columnKey) {
                header.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
            } else {
                header.classList.remove('sorted-asc', 'sorted-desc');
            }

            portfolioHeaders.appendChild(header);
        });

        if (allPositions.length === 0) {
            portfolioBody.innerHTML = `<tr><td colspan="${visibleColumns.length}" class="text-center">No positions to display.</td></tr>`;
            // Also clear the totals row
            const totalsRow = document.getElementById("totalsRow");
            totalsRow.innerHTML = ``; // We'll handle it dynamically
            return;
        }

        // Fetch batched prices for all symbols
        const uniqueTickers = [...new Set(allPositions.map((p) => p.tickerSymbol))];
        const priceData = await fetchCurrentPrices(uniqueTickers);
        console.log("Price Data:", priceData); // Debug log

        let totals = {
            costBasis: 0,
            totalValue: 0,
            profit: 0,
            profitPct: 0,
            changeToday: 0,
            changePctToday: 0,
            gapPct: 0
        };

        allPositions.forEach((position) => {
            const priceInfo = priceData[position.tickerSymbol] || {};
            const currentPrice = priceInfo.price || position.lastPrice || 0;
            const lastTime = priceInfo.time || "N/A";
            const openPrice = priceInfo.open || position.openPrice || 0;
            const prevClosePrice = priceInfo.prevClose || position.prevClosePrice || 0;

            // Update calculated fields
            position.costBasis = position.avgPrice * position.numShares;
            position.totalValue = currentPrice * position.numShares;
            position.profit = position.totalValue - position.costBasis;
            position.profitPct = position.costBasis !== 0 ? (position.profit / position.costBasis) * 100 : 0;
            position.changeToday = currentPrice - prevClosePrice;
            position.changePctToday = prevClosePrice !== 0 ? (position.changeToday / prevClosePrice) * 100 : 0;
            position.gapPct = prevClosePrice !== 0 ? ((currentPrice - openPrice) / prevClosePrice) * 100 : 0;
            position.timeSinceLastTrade = calculateTimeSinceLastTrade(lastTime);

            // Accumulate totals
            totals.costBasis += position.costBasis;
            totals.totalValue += position.totalValue;
            totals.profit += position.profit;
            totals.profitPct += position.profitPct;
            totals.changeToday += position.changeToday;
            totals.changePctToday += position.changePctToday;
            totals.gapPct += position.gapPct;

            const profitClass = position.profit >= 0 ? "profit-positive" : "profit-negative";

            // Generate table row based on visibleColumns order
            let row = `<tr>`;
            visibleColumns.forEach((columnKey) => {
                let cellContent = "";
                switch (columnKey) {
                    case "tickerSymbol":
                        cellContent = position.tickerSymbol;
                        break;
                    case "avgPrice":
                        cellContent = position.avgPrice.toFixed(2);
                        break;
                    case "numShares":
                        cellContent = position.numShares;
                        break;
                    case "lastPrice":
                        cellContent = currentPrice.toFixed(2);
                        break;
                    case "costBasis":
                        cellContent = position.costBasis.toFixed(2);
                        break;
                    case "totalValue":
                        cellContent = position.totalValue.toFixed(2);
                        break;
                    case "profit":
                        cellContent = `<span class="${profitClass}">${position.profit.toFixed(2)}</span>`;
                        break;
                    case "profitPct":
                        cellContent = `${position.profitPct.toFixed(2)}%`;
                        break;
                    case "changeToday":
                        cellContent = position.changeToday.toFixed(2);
                        break;
                    case "changePctToday":
                        cellContent = `${position.changePctToday.toFixed(2)}%`;
                        break;
                    case "gapPct":
                        cellContent = `${position.gapPct.toFixed(2)}%`;
                        break;
                    case "lastTime":
                        cellContent = position.timeSinceLastTrade;
                        break;
                    default:
                        cellContent = "";
                }
                row += `<td>${cellContent}</td>`;
            });
            row += `</tr>`;
            portfolioBody.innerHTML += row;
        });

        // Calculate total profit percentage based on total cost basis
        const totalProfitPct = totals.costBasis !== 0 ? (totals.profit / totals.costBasis) * 100 : 0;

        // Update totals in the footer based on visibleColumns
        const totalsRow = document.getElementById("totalsRow");
        totalsRow.innerHTML = ""; // Clear existing cells

        visibleColumns.forEach(columnKey => {
            if (columnKey === "tickerSymbol") {
                totalsRow.innerHTML += `<td>Totals</td>`;
            } else {
                let footerContent = "";
                switch (columnKey) {
                    case "costBasis":
                        footerContent = totals.costBasis.toFixed(2);
                        break;
                    case "totalValue":
                        footerContent = totals.totalValue.toFixed(2);
                        break;
                    case "profit":
                        footerContent = totals.profit.toFixed(2);
                        break;
                    case "profitPct":
                        footerContent = totalProfitPct.toFixed(2) + "%";
                        break;
                    case "changeToday":
                        footerContent = totals.changeToday.toFixed(2);
                        break;
                    case "changePctToday":
                        footerContent = totals.changePctToday.toFixed(2) + "%";
                        break;
                    case "gapPct":
                        footerContent = totals.gapPct.toFixed(2) + "%";
                        break;
                    default:
                        footerContent = ""; // Empty for other columns
                }
                totalsRow.innerHTML += `<td>${footerContent}</td>`;
            }
        });
    }

    /**
     * Determines the sort type based on the column key.
     * @param {string} columnKey - The key of the column.
     * @returns {string} The sort type ('string' or 'number').
     */
    function getSortType(columnKey) {
        const stringColumns = ["tickerSymbol", "lastTime"];
        if (stringColumns.includes(columnKey)) {
            return "string";
        }
        return "number";
    }

    /**
     * Returns the display name for a given column key.
     * @param {string} columnKey - The key of the column.
     * @returns {string} The display name of the column.
     */
    function getColumnDisplayName(columnKey) {
        const mapping = {
            "tickerSymbol": "Ticker",
            "avgPrice": "Average Price",
            "numShares": "Shares",
            "lastPrice": "Current Price",
            "costBasis": "Cost Basis",
            "totalValue": "Total Value",
            "profit": "Profit",
            "profitPct": "Profit %",
            "changeToday": "Change Today",
            "changePctToday": "Change % Today",
            "gapPct": "Gap %",
            "lastTime": "Time Since Last Trade"
        };
        return mapping[columnKey] || columnKey;
    }

    /**
     * Initializes visible columns and sort settings from IndexedDB.
     */
    async function initializeVisibleColumnsAndSortSettings() {
        try {
            const savedColumns = await get(settingsStoreName, "visibleColumns");
            if (savedColumns && savedColumns.value.length > 0) {
                visibleColumns = savedColumns.value;
                // Ensure uniqueness
                visibleColumns = [...new Set(visibleColumns)];

                console.log("Loaded visibleColumns from settings:", visibleColumns);
                appendDebugLog("Loaded visibleColumns from settings.");
            }

            // Load sort settings
            const savedSortColumn = await get(settingsStoreName, "sortColumn");
            const savedSortDirection = await get(settingsStoreName, "sortDirection");

            if (savedSortColumn && savedSortColumn.value) {
                sortColumn = savedSortColumn.value;
            }
            if (savedSortDirection && savedSortDirection.value) {
                sortDirection = savedSortDirection.value;
            }

            console.log("Loaded sort settings:", sortColumn, sortDirection);
            appendDebugLog("Loaded sort settings.");
        } catch (error) {
            console.error("Error initializing columns and sort settings:", error);
            appendDebugLog(`Error initializing columns and sort settings: ${error}`);
        }
    }

    /**
     * Populates and initializes everything on DOMContentLoaded.
     */
    document.addEventListener("DOMContentLoaded", async () => {
        const currentPage = getCurrentPage();
        if (currentPage === "index") {
            initializeIndexPage();
        } else if (currentPage === "portfolio") {
            await initializePortfolioPage();
        } else {
            console.warn("Unknown page. No initialization performed.");
        }
    });

    /**
     * Initializes functionalities specific to portfolio.html.
     */
    async function initializePortfolioPage() {
        // Handle additional functionalities for portfolio.html
        // This includes column customization, sorting, filtering, exporting, importing, and auto-refresh

        // Existing functionalities like sorting, filtering, exporting, and importing are handled within the shared script

        // Additional functions and event listeners specific to portfolio.html can be added here
        // For example, handling settings toggle, column customization drag-and-drop, etc.

        // Initialize visible columns and sort settings
        await initializeVisibleColumnsAndSortSettings();

        // Populate sortable columns
        populateSortableColumns();

        // Load portfolio data
        await loadPortfolio();

        // Initialize filter checkboxes
        await initializeFilterCheckboxes();

        // Initialize auto-refresh interval buttons
        await initializeRefreshIntervalButtons();

        // Initialize filter input with debounce
        const filterInput = document.getElementById("filterInput");
        if (filterInput) {
            filterInput.addEventListener("input", debounce(() => {
                renderPortfolio();
            }, 300));
        }

        // Handle export and import buttons
        const exportButton = document.getElementById("exportToFile");
        const importButton = document.getElementById("importButton");

        if (exportButton) {
            exportButton.addEventListener("click", exportToFile);
        }

        if (importButton) {
            importButton.addEventListener("click", importPositions);
        }

        // Handle settings toggle
        const settingsToggle = document.getElementById("settingsIcon");
        const settingsSection = document.getElementById("settings");

        if (settingsToggle && settingsSection) {
            settingsToggle.addEventListener("click", () => {
                settingsSection.classList.toggle("d-none");
            });
        }

        // Handle save settings button
        const saveKeysButton = document.getElementById("saveKeys");
        if (saveKeysButton) {
            saveKeysButton.addEventListener("click", async () => {
                const alpacaApiKey = document.getElementById("alpacaApiKey").value.trim();
                const alpacaApiSecret = document.getElementById("alpacaApiSecret").value.trim();
                const finnhubApiKey = document.getElementById("finnhubApiKey").value.trim();

                try {
                    if (alpacaApiKey) {
                        await put(settingsStoreName, { key: "APCA_API_KEY_ID", value: alpacaApiKey });
                        appendDebugLog("Alpaca API Key saved.");
                    }

                    if (alpacaApiSecret) {
                        await put(settingsStoreName, { key: "APCA_API_SECRET_KEY", value: alpacaApiSecret });
                        appendDebugLog("Alpaca API Secret saved.");
                    }

                    if (finnhubApiKey) {
                        await put(settingsStoreName, { key: "finnhubApiKey", value: finnhubApiKey });
                        appendDebugLog("Finnhub API Key saved.");
                    }

                    // Provide user feedback
                    const feedback = document.getElementById("settingsFeedback");
                    if (feedback) {
                        feedback.textContent = "Settings saved successfully!";
                        feedback.style.display = "block";
                        setTimeout(() => {
                            feedback.style.display = "none";
                        }, 3000);
                    }
                } catch (error) {
                    console.error("Error saving API keys:", error);
                    appendDebugLog(`Error saving API keys: ${error}`);
                    alert("Failed to save settings. Please try again.");
                }
            });
        }

        // Handle reset settings button
        const resetSettingsButton = document.getElementById("resetSettings");
        if (resetSettingsButton) {
            resetSettingsButton.addEventListener("click", async () => {
                // Reset visibleColumns to default
                visibleColumns = availableColumns.map(col => col.key);

                // Save to IndexedDB
                try {
                    await put(settingsStoreName, { key: "visibleColumns", value: visibleColumns });
                    appendDebugLog("Visible columns reset to default in settings.");
                } catch (error) {
                    console.error("Error resetting visible columns:", error);
                    appendDebugLog(`Error resetting visible columns: ${error}`);
                }

                // Reset sort settings
                try {
                    await put(settingsStoreName, { key: "sortColumn", value: null });
                    await put(settingsStoreName, { key: "sortDirection", value: 'asc' });
                    appendDebugLog("Sort settings reset to default in settings.");
                } catch (error) {
                    console.error("Error resetting sort settings:", error);
                    appendDebugLog(`Error resetting sort settings: ${error}`);
                }

                // Reset hide attribute for all positions
                try {
                    const all = await getAll(positionsStoreName);
                    const db = await openDatabase();
                    const transaction = db.transaction(positionsStoreName, "readwrite");
                    const store = transaction.objectStore(positionsStoreName);
                    for (const position of all) {
                        position.hide = false;
                        await new Promise((resolve, reject) => {
                            const request = store.put(position);
                            request.onsuccess = () => resolve();
                            request.onerror = (event) => reject(event.target.error);
                        });
                    }
                    appendDebugLog("All positions set to visible.");
                    await loadPortfolio();
                } catch (error) {
                    console.error("Error resetting positions' hide attributes:", error);
                    appendDebugLog(`Error resetting positions' hide attributes: ${error}`);
                }

                // Update UI
                populateSortableColumns();
                const uniqueTickers = await fetchAllTickers();
                await generateFilterCheckboxes(uniqueTickers);

                // Provide user feedback
                const feedback = document.getElementById("settingsFeedback");
                if (feedback) {
                    feedback.textContent = "Settings reset to default.";
                    feedback.style.display = "block";
                    setTimeout(() => {
                        feedback.style.display = "none";
                    }, 3000);
                }
            });
        }

        /**
         * Starts the auto-refresh interval based on settings.
         */
        async function startAutoRefresh() {
            try {
                const interval = await getRefreshInterval();
                if (refreshIntervalId) {
                    clearInterval(refreshIntervalId);
                }

                if (interval > 0) {
                    refreshIntervalId = setInterval(async () => {
                        console.log("Auto-refreshing prices...");
                        appendDebugLog("Auto-refreshing prices...");
                        await loadPortfolio();
                    }, interval * 1000);
                    console.log(`Auto-refresh set to every ${interval} seconds.`);
                    appendDebugLog(`Auto-refresh set to every ${interval} seconds.`);
                } else {
                    console.log("Auto-refresh stopped.");
                    appendDebugLog("Auto-refresh stopped.");
                }
            } catch (error) {
                console.error("Error starting auto-refresh:", error);
                appendDebugLog(`Error starting auto-refresh: ${error}`);
            }
        }

        /**
         * Retrieves the current refresh interval from IndexedDB.
         * @returns {Promise<number>} The refresh interval in seconds.
         */
        async function getRefreshInterval() {
            try {
                const refreshIntervalObj = await get(settingsStoreName, "refreshInterval");
                return refreshIntervalObj && refreshIntervalObj.value ? refreshIntervalObj.value : 0;
            } catch (error) {
                console.error("Error getting refresh interval:", error);
                appendDebugLog(`Error getting refresh interval: ${error}`);
                return 0;
            }
        }

        /**
         * Sorts the allPositions array based on sortColumn and sortDirection.
         */
        function sortPositions() {
            if (!sortColumn) return; // No sorting applied

            allPositions.sort((a, b) => {
                let valA = a[sortColumn];
                let valB = b[sortColumn];

                // Handle undefined or null values
                valA = valA !== undefined && valA !== null ? valA : "";
                valB = valB !== undefined && valB !== null ? valB : "";

                if (typeof valA === "string") {
                    valA = valA.toLowerCase();
                }
                if (typeof valB === "string") {
                    valB = valB.toLowerCase();
                }

                if (valA < valB) {
                    return sortDirection === 'asc' ? -1 : 1;
                }
                if (valA > valB) {
                    return sortDirection === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        /**
         * Sorts the allPositions array based on sortColumn and sortDirection.
         * (Duplicate function removed)
         */

        /**
         * Exports all positions as a JSON file.
         * (Handled in shared functions)
         */

        /**
         * Import positions from a provided JSON URL.
         * (Handled in shared functions)
         */

        /**
         * Defines and initializes other necessary functions and event listeners as needed.
         */

        /**
         * Fetches and loads all positions into the portfolio table.
         */
        async function loadPortfolio() {
            try {
                allPositions = await fetchVisiblePositions();
                // Calculate and append additional fields to each position
                allPositions = allPositions.map(position => {
                    const currentPrice = position.lastPrice || 0;
                    const costBasis = position.avgPrice * position.numShares;
                    const totalValue = currentPrice * position.numShares;
                    const profit = totalValue - costBasis;
                    const profitPct = costBasis !== 0 ? (profit / costBasis) * 100 : 0;
                    const changeToday = position.changeToday || 0;
                    const changePctToday = position.changePctToday || 0;
                    const gapPct = position.gapPct || 0;
                    const timeSinceLastTrade = position.lastTime || "N/A";

                    return {
                        ...position,
                        costBasis,
                        totalValue,
                        profit,
                        profitPct,
                        changeToday,
                        changePctToday,
                        gapPct,
                        timeSinceLastTrade
                    };
                });

                sortPositions(); // Sort after adding calculated fields
                renderPortfolio();
            } catch (error) {
                console.error("Error loading portfolio:", error);
                appendDebugLog(`Error loading portfolio: ${error}`);
            }
        }

        /**
         * Populates the portfolio table with current data.
         */
        async function renderPortfolio() {
            const portfolioBody = document.getElementById("portfolioBody");
            portfolioBody.innerHTML = "";

            // Render Table Headers Dynamically
            const portfolioHeaders = document.getElementById("portfolioHeaders");
            portfolioHeaders.innerHTML = ""; // Clear existing headers

            visibleColumns.forEach(columnKey => {
                const header = document.createElement("th");
                header.setAttribute("data-column", columnKey);
                header.setAttribute("data-sort-type", getSortType(columnKey));
                header.setAttribute("data-sort-key", columnKey);
                header.setAttribute("data-col-index", visibleColumns.indexOf(columnKey));

                const thName = document.createElement("span");
                thName.className = "th-name";
                thName.textContent = getColumnDisplayName(columnKey);

                const sortArrowAsc = document.createElement("span");
                sortArrowAsc.className = "sort-arrow asc";
                sortArrowAsc.textContent = "▲";

                const sortArrowDesc = document.createElement("span");
                sortArrowDesc.className = "sort-arrow desc";
                sortArrowDesc.textContent = "▼";

                header.appendChild(thName);
                header.appendChild(sortArrowAsc);
                header.appendChild(sortArrowDesc);

                // Add Event Listener for Sorting
                header.addEventListener('click', async () => {
                    if (sortColumn === columnKey) {
                        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortColumn = columnKey;
                        sortDirection = 'asc';
                    }
                    sortPositions();
                    renderPortfolio();

                    // Save sort settings to IndexedDB
                    try {
                        await put(settingsStoreName, { key: "sortColumn", value: sortColumn });
                        await put(settingsStoreName, { key: "sortDirection", value: sortDirection });
                        appendDebugLog("Sort settings saved.");
                    } catch (error) {
                        console.error("Error saving sort settings:", error);
                        appendDebugLog(`Error saving sort settings: ${error}`);
                    }
                });

                // Update sorted class
                if (sortColumn === columnKey) {
                    header.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                } else {
                    header.classList.remove('sorted-asc', 'sorted-desc');
                }

                portfolioHeaders.appendChild(header);
            });

            if (allPositions.length === 0) {
                portfolioBody.innerHTML = `<tr><td colspan="${visibleColumns.length}" class="text-center">No positions to display.</td></tr>`;
                // Also clear the totals row
                const totalsRow = document.getElementById("totalsRow");
                totalsRow.innerHTML = ``; // We'll handle it dynamically
                return;
            }

            // Fetch batched prices for all symbols
            const uniqueTickers = [...new Set(allPositions.map((p) => p.tickerSymbol))];
            const priceData = await fetchCurrentPrices(uniqueTickers);
            console.log("Price Data:", priceData); // Debug log

            let totals = {
                costBasis: 0,
                totalValue: 0,
                profit: 0,
                profitPct: 0,
                changeToday: 0,
                changePctToday: 0,
                gapPct: 0
            };

            allPositions.forEach((position) => {
                const priceInfo = priceData[position.tickerSymbol] || {};
                const currentPrice = priceInfo.price || position.lastPrice || 0;
                const lastTime = priceInfo.time || "N/A";
                const openPrice = priceInfo.open || position.openPrice || 0;
                const prevClosePrice = priceInfo.prevClose || position.prevClosePrice || 0;

                // Update calculated fields
                position.costBasis = position.avgPrice * position.numShares;
                position.totalValue = currentPrice * position.numShares;
                position.profit = position.totalValue - position.costBasis;
                position.profitPct = position.costBasis !== 0 ? (position.profit / position.costBasis) * 100 : 0;
                position.changeToday = currentPrice - prevClosePrice;
                position.changePctToday = prevClosePrice !== 0 ? (position.changeToday / prevClosePrice) * 100 : 0;
                position.gapPct = prevClosePrice !== 0 ? ((currentPrice - openPrice) / prevClosePrice) * 100 : 0;
                position.timeSinceLastTrade = calculateTimeSinceLastTrade(lastTime);

                // Accumulate totals
                totals.costBasis += position.costBasis;
                totals.totalValue += position.totalValue;
                totals.profit += position.profit;
                totals.profitPct += position.profitPct;
                totals.changeToday += position.changeToday;
                totals.changePctToday += position.changePctToday;
                totals.gapPct += position.gapPct;

                const profitClass = position.profit >= 0 ? "profit-positive" : "profit-negative";

                // Generate table row based on visibleColumns order
                let row = `<tr>`;
                visibleColumns.forEach((columnKey) => {
                    let cellContent = "";
                    switch (columnKey) {
                        case "tickerSymbol":
                            cellContent = position.tickerSymbol;
                            break;
                        case "avgPrice":
                            cellContent = position.avgPrice.toFixed(2);
                            break;
                        case "numShares":
                            cellContent = position.numShares;
                            break;
                        case "lastPrice":
                            cellContent = currentPrice.toFixed(2);
                            break;
                        case "costBasis":
                            cellContent = position.costBasis.toFixed(2);
                            break;
                        case "totalValue":
                            cellContent = position.totalValue.toFixed(2);
                            break;
                        case "profit":
                            cellContent = `<span class="${profitClass}">${position.profit.toFixed(2)}</span>`;
                            break;
                        case "profitPct":
                            cellContent = `${position.profitPct.toFixed(2)}%`;
                            break;
                        case "changeToday":
                            cellContent = position.changeToday.toFixed(2);
                            break;
                        case "changePctToday":
                            cellContent = `${position.changePctToday.toFixed(2)}%`;
                            break;
                        case "gapPct":
                            cellContent = `${position.gapPct.toFixed(2)}%`;
                            break;
                        case "lastTime":
                            cellContent = position.timeSinceLastTrade;
                            break;
                        default:
                            cellContent = "";
                    }
                    row += `<td>${cellContent}</td>`;
                });
                row += `</tr>`;
                portfolioBody.innerHTML += row;
            });

            // Calculate total profit percentage based on total cost basis
            const totalProfitPct = totals.costBasis !== 0 ? (totals.profit / totals.costBasis) * 100 : 0;

            // Update totals in the footer based on visibleColumns
            const totalsRow = document.getElementById("totalsRow");
            totalsRow.innerHTML = ""; // Clear existing cells

            visibleColumns.forEach(columnKey => {
                if (columnKey === "tickerSymbol") {
                    totalsRow.innerHTML += `<td>Totals</td>`;
                } else {
                    let footerContent = "";
                    switch (columnKey) {
                        case "costBasis":
                            footerContent = totals.costBasis.toFixed(2);
                            break;
                        case "totalValue":
                            footerContent = totals.totalValue.toFixed(2);
                            break;
                        case "profit":
                            footerContent = totals.profit.toFixed(2);
                            break;
                        case "profitPct":
                            footerContent = totalProfitPct.toFixed(2) + "%";
                            break;
                        case "changeToday":
                            footerContent = totals.changeToday.toFixed(2);
                            break;
                        case "changePctToday":
                            footerContent = totals.changePctToday.toFixed(2) + "%";
                            break;
                        case "gapPct":
                            footerContent = totals.gapPct.toFixed(2) + "%";
                            break;
                        default:
                            footerContent = ""; // Empty for other columns
                    }
                    totalsRow.innerHTML += `<td>${footerContent}</td>`;
                }
            });
        }

    /**
     * Determines the sort type based on the column key.
     * @param {string} columnKey - The key of the column.
     * @returns {string} The sort type ('string' or 'number').
     */
    function getSortType(columnKey) {
        const stringColumns = ["tickerSymbol", "lastTime"];
        if (stringColumns.includes(columnKey)) {
            return "string";
        }
        return "number";
    }

    /**
     * Returns the display name for a given column key.
     * @param {string} columnKey - The key of the column.
     * @returns {string} The display name of the column.
     */
    function getColumnDisplayName(columnKey) {
        const mapping = {
            "tickerSymbol": "Ticker",
            "avgPrice": "Average Price",
            "numShares": "Shares",
            "lastPrice": "Current Price",
            "costBasis": "Cost Basis",
            "totalValue": "Total Value",
            "profit": "Profit",
            "profitPct": "Profit %",
            "changeToday": "Change Today",
            "changePctToday": "Change % Today",
            "gapPct": "Gap %",
            "lastTime": "Time Since Last Trade"
        };
        return mapping[columnKey] || columnKey;
    }

    /**
     * Initializes visible columns and sort settings from IndexedDB.
     */
    async function initializeVisibleColumnsAndSortSettings() {
        try {
            const savedColumns = await get(settingsStoreName, "visibleColumns");
            if (savedColumns && savedColumns.value.length > 0) {
                visibleColumns = savedColumns.value;
                // Ensure uniqueness
                visibleColumns = [...new Set(visibleColumns)];

                console.log("Loaded visibleColumns from settings:", visibleColumns);
                appendDebugLog("Loaded visibleColumns from settings.");
            }

            // Load sort settings
            const savedSortColumn = await get(settingsStoreName, "sortColumn");
            const savedSortDirection = await get(settingsStoreName, "sortDirection");

            if (savedSortColumn && savedSortColumn.value) {
                sortColumn = savedSortColumn.value;
            }
            if (savedSortDirection && savedSortDirection.value) {
                sortDirection = savedSortDirection.value;
            }

            console.log("Loaded sort settings:", sortColumn, sortDirection);
            appendDebugLog("Loaded sort settings.");
        } catch (error) {
            console.error("Error initializing columns and sort settings:", error);
            appendDebugLog(`Error initializing columns and sort settings: ${error}`);
        }
    }

    /**
     * Populates and initializes everything on DOMContentLoaded.
     */
    document.addEventListener("DOMContentLoaded", async () => {
        const currentPage = getCurrentPage();
        if (currentPage === "index") {
            initializeIndexPage();
        } else if (currentPage === "portfolio") {
            await initializePortfolioPage();
        } else {
            console.warn("Unknown page. No initialization performed.");
        }
    });

    /**
     * Initializes filter checkboxes.
     */
    async function initializeFilterCheckboxes() {
        const uniqueTickers = await fetchAllTickers();
        await generateFilterCheckboxes(uniqueTickers);
    }

    /**
     * Resets all settings to default.
     */
    async function resetSettings() {
        // Reset visibleColumns to default
        visibleColumns = availableColumns.map(col => col.key);

        // Save to IndexedDB
        try {
            await put(settingsStoreName, { key: "visibleColumns", value: visibleColumns });
            appendDebugLog("Visible columns reset to default in settings.");
        } catch (error) {
            console.error("Error resetting visible columns:", error);
            appendDebugLog(`Error resetting visible columns: ${error}`);
        }

        // Reset sort settings
        try {
            await put(settingsStoreName, { key: "sortColumn", value: null });
            await put(settingsStoreName, { key: "sortDirection", value: 'asc' });
            appendDebugLog("Sort settings reset to default in settings.");
        } catch (error) {
            console.error("Error resetting sort settings:", error);
            appendDebugLog(`Error resetting sort settings: ${error}`);
        }

        // Reset hide attribute for all positions
        try {
            const all = await getAll(positionsStoreName);
            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readwrite");
            const store = transaction.objectStore(positionsStoreName);
            for (const position of all) {
                position.hide = false;
                await new Promise((resolve, reject) => {
                    const request = store.put(position);
                    request.onsuccess = () => resolve();
                    request.onerror = (event) => reject(event.target.error);
                });
            }
            appendDebugLog("All positions set to visible.");
            await loadPortfolio();
        } catch (error) {
            console.error("Error resetting positions' hide attributes:", error);
            appendDebugLog(`Error resetting positions' hide attributes: ${error}`);
        }

        // Update UI
        populateSortableColumns();
        const uniqueTickers = await fetchAllTickers();
        await generateFilterCheckboxes(uniqueTickers);

        // Provide user feedback
        const feedback = document.getElementById("settingsFeedback");
        if (feedback) {
            feedback.textContent = "Settings reset to default.";
            feedback.style.display = "block";
            setTimeout(() => {
                feedback.style.display = "none";
            }, 3000);
        }
    }

    /**
     * Saves API keys and refresh interval settings.
     */
    async function saveSettings() {
        const alpacaApiKey = document.getElementById("alpacaApiKey").value.trim();
        const alpacaApiSecret = document.getElementById("alpacaApiSecret").value.trim();
        const finnhubApiKey = document.getElementById("finnhubApiKey").value.trim();

        try {
            if (alpacaApiKey) {
                await put(settingsStoreName, { key: "APCA_API_KEY_ID", value: alpacaApiKey });
                appendDebugLog("Alpaca API Key saved.");
            }

            if (alpacaApiSecret) {
                await put(settingsStoreName, { key: "APCA_API_SECRET_KEY", value: alpacaApiSecret });
                appendDebugLog("Alpaca API Secret saved.");
            }

            if (finnhubApiKey) {
                await put(settingsStoreName, { key: "finnhubApiKey", value: finnhubApiKey });
                appendDebugLog("Finnhub API Key saved.");
            }

            // Provide user feedback
            const feedback = document.getElementById("settingsFeedback");
            if (feedback) {
                feedback.textContent = "Settings saved successfully!";
                feedback.style.display = "block";
                setTimeout(() => {
                    feedback.style.display = "none";
                }, 3000);
            }
        } catch (error) {
            console.error("Error saving API keys:", error);
            appendDebugLog(`Error saving API keys: ${error}`);
            alert("Failed to save settings. Please try again.");
        }
    }

    /**
     * Handles input filtering with debounce to optimize performance.
     */
    // Already handled in initializePortfolioPage

    /**
     * Initializes auto-refresh interval buttons.
     */
    async function initializeRefreshIntervalButtons() {
        const buttons = document.querySelectorAll('.refresh-interval-button');
        try {
            const currentIntervalObj = await get(settingsStoreName, "refreshInterval");
            const currentInterval = currentIntervalObj && currentIntervalObj.value ? currentIntervalObj.value : 0;

            buttons.forEach(button => {
                if (parseInt(button.getAttribute('data-interval')) === currentInterval) {
                    button.classList.add('active');
                }

                button.addEventListener('click', async () => {
                    try {
                        const interval = parseInt(button.getAttribute('data-interval'));

                        // Save refreshInterval to IndexedDB
                        await put(settingsStoreName, { key: "refreshInterval", value: interval });
                        appendDebugLog(`Auto-refresh interval set to ${interval} seconds.`);

                        // Update button styles
                        buttons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');

                        // Restart auto-refresh with the new interval
                        await startAutoRefresh();

                        // Provide user feedback
                        const feedback = document.getElementById("settingsFeedback");
                        if (feedback) {
                            feedback.textContent = interval === 0 ? "Auto-refresh stopped." : `Auto-refresh interval set to ${interval} seconds.`;
                            feedback.style.display = "block";
                            setTimeout(() => {
                                feedback.style.display = "none";
                            }, 3000);
                        }
                    } catch (error) {
                        console.error("Error setting refresh interval:", error);
                        appendDebugLog(`Error setting refresh interval: ${error}`);
                        alert("Failed to set refresh interval.");
                    }
                });
            });

            console.log("Refresh interval buttons initialized.");
            appendDebugLog("Refresh interval buttons initialized.");
        } catch (error) {
            console.error("Error initializing refresh interval buttons:", error);
            appendDebugLog(`Error initializing refresh interval buttons: ${error}`);
        }
    }

    /**
     * Starts the auto-refresh interval based on settings.
     */
    async function startAutoRefresh() {
        try {
            const interval = await getRefreshInterval();
            if (refreshIntervalId) {
                clearInterval(refreshIntervalId);
            }

            if (interval > 0) {
                refreshIntervalId = setInterval(async () => {
                    console.log("Auto-refreshing prices...");
                    appendDebugLog("Auto-refreshing prices...");
                    await loadPortfolio();
                }, interval * 1000);
                console.log(`Auto-refresh set to every ${interval} seconds.`);
                appendDebugLog(`Auto-refresh set to every ${interval} seconds.`);
            } else {
                console.log("Auto-refresh stopped.");
                appendDebugLog("Auto-refresh stopped.");
            }
        } catch (error) {
            console.error("Error starting auto-refresh:", error);
            appendDebugLog(`Error starting auto-refresh: ${error}`);
        }
    }

    /**
     * Retrieves the current refresh interval from IndexedDB.
     * @returns {Promise<number>} The refresh interval in seconds.
     */
    async function getRefreshInterval() {
        try {
            const refreshIntervalObj = await get(settingsStoreName, "refreshInterval");
            return refreshIntervalObj && refreshIntervalObj.value ? refreshIntervalObj.value : 0;
        } catch (error) {
            console.error("Error getting refresh interval:", error);
            appendDebugLog(`Error getting refresh interval: ${error}`);
            return 0;
        }
    }

    /**
     * Sorts the allPositions array based on sortColumn and sortDirection.
     */
    function sortPositions() {
        if (!sortColumn) return; // No sorting applied

        allPositions.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            // Handle undefined or null values
            valA = valA !== undefined && valA !== null ? valA : "";
            valB = valB !== undefined && valB !== null ? valB : "";

            if (typeof valA === "string") {
                valA = valA.toLowerCase();
            }
            if (typeof valB === "string") {
                valB = valB.toLowerCase();
            }

            if (valA < valB) {
                return sortDirection === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return sortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    /**
     * Exports all positions as a JSON file.
     */
    async function exportToFile() {
        try {
            const positions = await getAll(positionsStoreName);
            const json = JSON.stringify(positions, null, 2);

            // Create a downloadable file
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "positions.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            appendDebugLog("Positions exported successfully to JSON file.");
            alert("Positions exported successfully. You can now upload this file to any service.");
        } catch (error) {
            appendDebugLog(`Error exporting positions: ${error}`);
            alert("Failed to export positions.");
        }
    }

    /**
     * Imports positions from a JSON file URL.
     */
    async function importPositions() {
        const urlField = document.getElementById("jsonUrl");
        const enteredUrl = urlField.value.trim();

        if (!enteredUrl) {
            alert("Please enter a valid URL for JSON data.");
            appendDebugLog("Import failed: No URL provided.");
            return;
        }

        try {
            const response = await fetch(enteredUrl);
            if (!response.ok) {
                appendDebugLog(`Failed to fetch positions from URL: ${response.statusText}`);
                alert("Failed to fetch positions from the given URL.");
                return;
            }

            const positions = await response.json();
            if (!Array.isArray(positions)) {
                throw new Error("Invalid JSON format. Expected an array of positions.");
            }

            const db = await openDatabase();
            const transaction = db.transaction(positionsStoreName, "readwrite");
            const store = transaction.objectStore(positionsStoreName);

            positions.forEach((position) => {
                store.put(position);
            });

            transaction.oncomplete = () => {
                appendDebugLog("Positions imported successfully.");
                alert("Positions imported successfully.");
                loadSavedPositions();
            };

            transaction.onerror = (event) => {
                appendDebugLog(`Failed to import positions: ${event.target.error}`);
                alert("Failed to import positions.");
            };
        } catch (error) {
            console.error("Error importing positions:", error);
            appendDebugLog(`Error importing positions: ${error.message}`);
            alert("Error importing positions. Please check the URL and try again.");
        }
    }

    /**
     * Initializes auto-refresh interval buttons.
     */
    async function initializeRefreshIntervalButtons() {
        const buttons = document.querySelectorAll('.refresh-interval-button');
        try {
            const currentIntervalObj = await get(settingsStoreName, "refreshInterval");
            const currentInterval = currentIntervalObj && currentIntervalObj.value ? currentIntervalObj.value : 0;

            buttons.forEach(button => {
                if (parseInt(button.getAttribute('data-interval')) === currentInterval) {
                    button.classList.add('active');
                }

                button.addEventListener('click', async () => {
                    try {
                        const interval = parseInt(button.getAttribute('data-interval'));

                        // Save refreshInterval to IndexedDB
                        await put(settingsStoreName, { key: "refreshInterval", value: interval });
                        appendDebugLog(`Auto-refresh interval set to ${interval} seconds.`);

                        // Update button styles
                        buttons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');

                        // Restart auto-refresh with the new interval
                        await startAutoRefresh();

                        // Provide user feedback
                        const feedback = document.getElementById("settingsFeedback");
                        if (feedback) {
                            feedback.textContent = interval === 0 ? "Auto-refresh stopped." : `Auto-refresh interval set to ${interval} seconds.`;
                            feedback.style.display = "block";
                            setTimeout(() => {
                                feedback.style.display = "none";
                            }, 3000);
                        }
                    } catch (error) {
                        console.error("Error setting refresh interval:", error);
                        appendDebugLog(`Error setting refresh interval: ${error}`);
                        alert("Failed to set refresh interval.");
                    }
                });
            });

            console.log("Refresh interval buttons initialized.");
            appendDebugLog("Refresh interval buttons initialized.");
        } catch (error) {
            console.error("Error initializing refresh interval buttons:", error);
            appendDebugLog(`Error initializing refresh interval buttons: ${error}`);
        }
    }

    /**
     * Sorts the allPositions array based on sortColumn and sortDirection.
     */
    function sortPositions() {
        if (!sortColumn) return; // No sorting applied

        allPositions.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            // Handle undefined or null values
            valA = valA !== undefined && valA !== null ? valA : "";
            valB = valB !== undefined && valB !== null ? valB : "";

            if (typeof valA === "string") {
                valA = valA.toLowerCase();
            }
            if (typeof valB === "string") {
                valB = valB.toLowerCase();
            }

            if (valA < valB) {
                return sortDirection === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return sortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    /**
     * Populates the portfolio table with current data.
     */
    async function loadPortfolio() {
        try {
            allPositions = await fetchVisiblePositions();
            // Calculate and append additional fields to each position
            allPositions = allPositions.map(position => {
                const currentPrice = position.lastPrice || 0;
                const costBasis = position.avgPrice * position.numShares;
                const totalValue = currentPrice * position.numShares;
                const profit = totalValue - costBasis;
                const profitPct = costBasis !== 0 ? (profit / costBasis) * 100 : 0;
                const changeToday = position.changeToday || 0;
                const changePctToday = position.changePctToday || 0;
                const gapPct = position.gapPct || 0;
                const timeSinceLastTrade = position.lastTime || "N/A";

                return {
                    ...position,
                    costBasis,
                    totalValue,
                    profit,
                    profitPct,
                    changeToday,
                    changePctToday,
                    gapPct,
                    timeSinceLastTrade
                };
            });

            sortPositions(); // Sort after adding calculated fields
            renderPortfolio();
        } catch (error) {
            console.error("Error loading portfolio:", error);
            appendDebugLog(`Error loading portfolio: ${error}`);
        }
    }

    /**
     * Initializes auto-refresh interval buttons.
     */
    // Already handled in initializePortfolioPage
}}