// Shareable links: …/gpx_map/#ruta=<gpx file name without .gpx>
// Opening such a link selects the track, zooms to it and shows its elevation chart.
// Selecting a track updates the address bar, so it can be copied at any time.

function routeSlug(route) {
    return route.options.filename || '';
}

function shareUrl(route) {
    return location.origin + location.pathname + '#ruta=' + encodeURIComponent(routeSlug(route));
}

function routeFromHash() {
    const m = location.hash.match(/[#&]ruta=([^&]+)/);
    if (!m) return null;
    const wanted = decodeURIComponent(m[1]).toLowerCase();
    return allRoutes().find(r => routeSlug(r).toLowerCase() === wanted) || null;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'map-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

async function shareRoute(route) {
    if (!route || !route.isSelected()) return;
    const url = shareUrl(route);
    if (navigator.share) {
        try {
            await navigator.share({ title: route.options.name, url });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;   // the user closed the share sheet
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        showToast('Enllaç copiat');
    } catch (e) {
        window.prompt("Copia l'enllaç:", url);
    }
}

function initShareLinks(routes) {
    const openFromHash = () => {
        const route = routeFromHash();
        if (route) selectRoute(route);
    };

    routes.on('selection_changed', () => {
        const sel = routes.getSelection();
        const url = sel && sel.isSelected()
            ? '#ruta=' + encodeURIComponent(routeSlug(sel))
            : location.pathname + location.search;
        history.replaceState(null, '', url);
    });

    document.addEventListener('click', e => {
        if (e.target.closest('.share-gpx-btn')) shareRoute(routes.getSelection());
    });

    window.addEventListener('hashchange', openFromHash);
    openFromHash();
}
