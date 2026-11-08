// Track filtering (tag filter + text search) and the searchable track list panel.
// Both the map and the list use the same state, so they always show the same tracks.

const trackFilterState = { tags: [], query: '' };
let trackListControl = null;

const LIST_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#333" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';

const TRACK_SORTS = {
    recent: { label: 'Més recents', cmp: (a, b) => (b.meta.date || '').localeCompare(a.meta.date || '') },
    oldest: { label: 'Més antigues', cmp: (a, b) => (a.meta.date || '9').localeCompare(b.meta.date || '9') },
    longest: { label: 'Més llargues', cmp: (a, b) => (b.meta.km || 0) - (a.meta.km || 0) },
    gain: { label: 'Més desnivell', cmp: (a, b) => (b.meta.gain || 0) - (a.meta.gain || 0) },
    name: { label: 'Nom', cmp: (a, b) => a.name.localeCompare(b.name, 'ca') },
};

function normalizeText(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(iso) {
    return iso ? iso.split('-').reverse().join('/') : '';
}

// OR inside a tag group (Caminada or Travessa), AND across groups (... and 100Cims-Essencials).
function matchesTags(trackTags, selectedTags) {
    const byType = {};
    for (const tag of selectedTags) {
        const type = tag.split('-')[0];
        (byType[type] = byType[type] || []).push(tag);
    }
    return Object.values(byType).every(group => group.some(tag => trackTags.includes(tag)));
}

// Every word must appear in the name, date (yyyy-mm-dd), tags or reached peaks. Accents are ignored.
function matchesQuery(route, words) {
    if (!words.length) return true;
    const meta = route.options.meta || {};
    const haystack = normalizeText([route.options.name, meta.date, (route.tags || []).join(' '), peakNames(meta).join(' ')].join(' '));
    return words.every(word => haystack.includes(word));
}

function allRoutes() {
    return routes ? Object.values(routes._layers._layers) : [];
}

function applyTrackFilters() {
    const words = normalizeText(trackFilterState.query).split(/\s+/).filter(Boolean);
    for (const route of allRoutes()) {
        route._visible = matchesTags(route.tags || [], trackFilterState.tags) && matchesQuery(route, words);
        route.eachLayer(layer => {
            if (layer._path) layer._path.style.display = route._visible ? '' : 'none';
        });
    }
    if (trackListControl) trackListControl.render();
}

function selectRoute(route) {
    if (!route.isSelected()) routes.setSelection(route);
    route.eachLayer(layer => routes.highlight(route, layer));
    map.flyToBounds(route.getBounds(), { padding: [40, 40], maxZoom: 15, duration: 0.6 });
}

function loadPref(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
}

function savePref(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}

L.Control.TrackList = L.Control.extend({
    options: { position: 'topleft' },

    onAdd: function(map) {
        const c = L.DomUtil.create('div', 'leaflet-bar track-list');
        const sort = loadPref('trackListSort', 'recent');
        c.innerHTML = `
            <a class="track-list-toggle" href="#" title="Llista de rutes" role="button">${LIST_ICON}</a>
            <div class="track-list-panel">
                <div class="track-list-head">
                    <input type="search" class="track-list-search" placeholder="Cerca: nom, any, cim…" autocomplete="off">
                    <select class="track-list-sort" title="Ordena">
                        ${Object.entries(TRACK_SORTS).map(([k, s]) =>
                            `<option value="${k}"${k === sort ? ' selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                    <button class="track-list-close" type="button" title="Tanca">&times;</button>
                </div>
                <div class="track-list-summary"></div>
                <ul class="track-list-items"></ul>
            </div>`;

        L.DomEvent.disableClickPropagation(c);
        L.DomEvent.disableScrollPropagation(c);

        this._container = c;
        this._search = c.querySelector('.track-list-search');
        this._sort = c.querySelector('.track-list-sort');
        this._summary = c.querySelector('.track-list-summary');
        this._list = c.querySelector('.track-list-items');

        c.querySelector('.track-list-toggle').addEventListener('click', e => { e.preventDefault(); this.open(); });
        c.querySelector('.track-list-close').addEventListener('click', () => this.close());

        this._search.addEventListener('input', () => {
            trackFilterState.query = this._search.value;
            applyTrackFilters();
        });
        this._search.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this._search.value = '';
                trackFilterState.query = '';
                applyTrackFilters();
            }
        });
        this._sort.addEventListener('change', () => {
            savePref('trackListSort', this._sort.value);
            this.render();
        });

        this._list.addEventListener('click', e => {
            const route = this._routeFromEvent(e);
            if (!route) return;
            selectRoute(route);
            if (window.innerWidth < 600) this.close();   // give the map back on phones
        });
        this._list.addEventListener('mouseover', e => this._hover(e, true));
        this._list.addEventListener('mouseout', e => this._hover(e, false));

        routes.on('selection_changed', () => this._markActive());
        return c;
    },

    open: function() {
        L.DomUtil.addClass(this._container, 'open');
        this.render();
        if (window.innerWidth >= 600) this._search.focus();
    },

    close: function() {
        L.DomUtil.removeClass(this._container, 'open');
    },

    _routeFromEvent: function(e) {
        const li = e.target.closest('li[data-id]');
        return li ? routes._layers.getLayer(+li.dataset.id) : null;
    },

    _hover: function(e, entering) {
        const li = e.target.closest('li[data-id]');
        if (!li || li.contains(e.relatedTarget)) return;
        const route = routes._layers.getLayer(+li.dataset.id);
        if (!route || route.isSelected()) return;
        route.eachLayer(layer => entering ? routes.highlight(route, layer) : routes.unhighlight(route, layer));
    },

    _markActive: function() {
        const selected = routes.getSelection();
        this._list.querySelectorAll('li.active').forEach(li => li.classList.remove('active'));
        if (!selected || !selected.isSelected()) return;
        const li = this._list.querySelector(`li[data-id="${L.stamp(selected)}"]`);
        if (li) {
            li.classList.add('active');
            li.scrollIntoView({ block: 'nearest' });
        }
    },

    render: function() {
        if (!L.DomUtil.hasClass(this._container, 'open')) return;

        const items = allRoutes()
            .filter(r => r._visible !== false)
            .map(r => ({ route: r, name: r.options.name || '', meta: r.options.meta || {} }))
            .sort((TRACK_SORTS[this._sort.value] || TRACK_SORTS.recent).cmp);

        const km = items.reduce((s, i) => s + (i.meta.km || 0), 0);
        const gain = items.reduce((s, i) => s + (i.meta.gain || 0), 0);
        this._summary.textContent =
            `${items.length} ${items.length === 1 ? 'ruta' : 'rutes'} ·${Math.round(km).toLocaleString('ca')} km · +${gain.toLocaleString('ca')} m`;

        this._list.innerHTML = items.length ? items.map(({ route, name, meta }) => {
            const facts = [
                meta.km != null ? `${meta.km.toFixed(1)} km` : '',
                meta.gain != null ? `+${meta.gain} m` : '',
                formatDate(meta.date),
            ].filter(Boolean).join(' · ');
            const peaks = peakNames(meta);
            const peaksHtml = peaks.length ? `<div class="track-list-peaks">▲ ${escapeHtml(peaks.join(', '))}</div>` : '';
            return `<li data-id="${L.stamp(route)}">
                <span class="track-list-swatch" style="background:${route.options.originalStyle.color}"></span>
                <div><div class="track-list-name">${escapeHtml(name)}</div><div class="track-list-meta">${facts}</div>${peaksHtml}</div>
            </li>`;
        }).join('') : '<li class="track-list-empty">Cap ruta coincideix amb el filtre.</li>';

        this._markActive();
    },
});

// Track links inside peak popups ("Rutes: ...")
document.addEventListener('click', e => {
    const link = e.target.closest('.peak-track');
    if (!link) return;
    e.preventDefault();
    const route = allRoutes().find(r => r.options.file === link.dataset.file);
    if (!route) return;
    map.closePopup();
    selectRoute(route);
});

function addTrackList(map) {
    trackListControl = new L.Control.TrackList().addTo(map);
    applyTrackFilters();
}
