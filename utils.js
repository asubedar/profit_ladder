// utils.js

/**
 * Creates a debounced version of a function.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The debounce delay in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, delay) {
    let debounceTimer;
    return function (...args) {
        const context = this;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * Calculates the time elapsed since the last trade.
 * @param {string} lastTradeTime - The timestamp of the last trade.
 * @returns {string} A human-readable string representing the time since the last trade.
 */
export function calculateTimeSinceLastTrade(lastTradeTime) {
    if (lastTradeTime === "N/A") return "N/A";
    const lastTradeDate = new Date(lastTradeTime);
    const now = new Date();
    const diffInSeconds = Math.round((now - lastTradeDate) / 1000);

    if (diffInSeconds < 60) {
        return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.round(diffInSeconds / 60);
        return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.round(diffInSeconds / 3600);
        return `${hours}h ago`;
    } else {
        const days = Math.round(diffInSeconds / 86400);
        return `${days}d ago`;
    }
}