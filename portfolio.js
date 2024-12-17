// portfolio.js

import { openDatabase, getAll, get, put, deleteItem, positionsStoreName, settingsStoreName } from './db.js';
import { debounce, calculateTimeSinceLastTrade } from './utils.js';

/**
 * Appends a message to the debug logs.
 * @param {string} message - The message to append.
 */
function appendDebugLog(message) {
    const debugLogs = document.getElementById("debugLogs");
    const timestamp = new Date().toLocaleTimeString();
    debugLogs.innerHTML += `[${timestamp}] ${message}<br>`;
    debugLogs.scrollTop = debugLogs.scrollHeight; // Auto-scroll to bottom
}

// State Variables
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
 * Initializes filter checkboxes.
 * (Already handled via generateFilterCheckboxes)
 */

/**
 * Opens the portfolio page by loading positions and initializing UI components.
 * (Already handled in loadPortfolio)
 */

/**
 * Sorts the allPositions array based on sortColumn and sortDirection.
 * (Already implemented in sortPositions function)
 */

/**
 * Initializes everything on DOMContentLoaded.
 */
document.addEventListener("DOMContentLoaded", async () => {
    await initializeVisibleColumnsAndSortSettings(); // Load saved column order and sort settings first
    populateSortableColumns();                      // Then populate the "Customize Columns" list based on saved order
    await loadPortfolio();
    await initializeRefreshIntervalButtons();
    await initializeFilterCheckboxes();
    await startAutoRefresh();
});

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
        const refreshInterval = await get(settingsStoreName, "refreshInterval");
        return refreshInterval && refreshInterval.value ? refreshInterval.value : 0;
    } catch (error) {
        console.error("Error getting refresh interval:", error);
        appendDebugLog(`Error getting refresh interval: ${error}`);
        return 0;
    }
}

/**
 * Export all positions as a JSON file.
 */
document.getElementById("exportPositions").addEventListener("click", async () => {
    try {
        const positions = await getAll(positionsStoreName);
        const dataStr = JSON.stringify(positions, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "positions_export.json";
        a.click();
        URL.revokeObjectURL(url);
        appendDebugLog("Positions exported successfully.");
    } catch (error) {
        console.error("Error exporting positions:", error);
        appendDebugLog(`Error exporting positions: ${error}`);
    }
});

/**
 * Import positions from a provided JSON URL.
 */
document.getElementById("importPositions").addEventListener("click", async () => {
    const importUrl = prompt("Enter the URL of the JSON file to import:");
    if (!importUrl) return;

    try {
        const response = await fetch(importUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch import file: ${response.statusText}`);
        }
        const importedPositions = await response.json();
        if (!Array.isArray(importedPositions)) {
            throw new Error("Invalid import file format.");
        }

        const db = await openDatabase();
        const transaction = db.transaction(positionsStoreName, "readwrite");
        const store = transaction.objectStore(positionsStoreName);

        importedPositions.forEach(position => {
            store.put(position);
        });

        transaction.oncomplete = () => {
            appendDebugLog("Positions imported successfully.");
            loadPortfolio();
        };

        transaction.onerror = (event) => {
            console.error("Error importing positions:", event.target.error);
            appendDebugLog(`Error importing positions: ${event.target.error}`);
        };
    } catch (error) {
        console.error("Error importing positions:", error);
        appendDebugLog(`Error importing positions: ${error}`);
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
 * Toggles the visibility of the settings section.
 */
document.getElementById("settingsIcon").addEventListener("click", () => {
    const settings = document.getElementById("settings");
    settings.classList.toggle("d-none");
});

/**
 * Resets all settings to default.
 */
document.getElementById("resetSettings").addEventListener("click", async () => {
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
    feedback.textContent = "Settings reset to default.";
    feedback.style.display = "block";
    setTimeout(() => {
        feedback.style.display = "none";
    }, 3000);
});

/**
 * Saves API keys and refresh interval settings.
 */
document.getElementById("saveKeys").addEventListener("click", async () => {
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
        feedback.textContent = "Settings saved successfully!";
        feedback.style.display = "block";
        setTimeout(() => {
            feedback.style.display = "none";
        }, 3000);
    } catch (error) {
        console.error("Error saving API keys:", error);
        appendDebugLog(`Error saving API keys: ${error}`);
        alert("Failed to save settings. Please try again.");
    }
});

/**
 * Handles input filtering with debounce to optimize performance.
 */
const filterInput = document.getElementById("filterInput");
filterInput.addEventListener("input", debounce(() => {
    renderPortfolio();
}, 300));

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
                    feedback.textContent = interval === 0 ? "Auto-refresh stopped." : `Auto-refresh interval set to ${interval} seconds.`;
                    feedback.style.display = "block";
                    setTimeout(() => {
                        feedback.style.display = "none";
                    }, 3000);
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
 * Opens the portfolio page by loading positions and initializing UI components.
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
 * Toggles the visibility of the settings section.
 */
document.getElementById("settingsIcon").addEventListener("click", () => {
    const settings = document.getElementById("settings");
    settings.classList.toggle("d-none");
});