function saveWithExpiry(key, value, ttlMs= 60*60000) { // 1 minute = 60000 ms
    const now = Date.now();
    const item = {
        value,
        expiry: now + ttlMs,
    };
    localStorage.setItem(key, JSON.stringify(item));
}

function loadWithExpiry(key, defaultValue=null) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return defaultValue;

    try {
        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
            localStorage.removeItem(key);
            return defaultValue;
        }
        return item.value;
    } catch (e) {
        console.log(e);
        localStorage.removeItem(key);
        return defaultValue;
    }
}