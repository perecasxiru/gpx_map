// Stats panel (closed by default): per-year totals of the tracks currently shown
// (respects the tag filter and the search), peak progress, and the colour mode.

let trackStatsControl = null;

const STATS_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#333" stroke-width="2.2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>';

function fmtInt(n) {
    return Math.round(n).toLocaleString('ca');
}

L.Control.TrackStats = L.Control.extend({
    options: { position: 'topleft' },

    onAdd: function() {
        const c = L.DomUtil.create('div', 'leaflet-bar track-stats');
        c.innerHTML = `
            <a class="track-stats-toggle" href="#" title="Estadístiques i colors" role="button">${STATS_ICON}</a>
            <div class="track-stats-panel">
                <div class="track-stats-head">
                    <b>Estadístiques</b>
                    <label>Colors
                        <select class="track-stats-colors">
                            ${Object.entries(COLOR_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                        </select>
                    </label>
                    <button class="track-list-close" type="button" title="Tanca">&times;</button>
                </div>
                <div class="track-stats-legend"></div>
                <div class="track-stats-body"></div>
            </div>`;
        L.DomEvent.disableClickPropagation(c);
        L.DomEvent.disableScrollPropagation(c);

        this._container = c;
        this._body = c.querySelector('.track-stats-body');
        this._colors = c.querySelector('.track-stats-colors');

        c.querySelector('.track-stats-toggle').addEventListener('click', e => {
            e.preventDefault();
            L.DomUtil.addClass(c, 'open');
            L.DomUtil.addClass(document.body, 'stats-open');   // the panel shows the legend itself
            this._colors.value = colorMode;
            this.render();
        });
        c.querySelector('.track-list-close').addEventListener('click', () => {
            L.DomUtil.removeClass(c, 'open');
            L.DomUtil.removeClass(document.body, 'stats-open');
        });
        this._colors.addEventListener('change', () => applyColorMode(this._colors.value));
        return c;
    },

    render: function() {
        if (!L.DomUtil.hasClass(this._container, 'open')) return;
        this._container.querySelector('.track-stats-legend').innerHTML = colorLegendHtml(colorLegendItems);

        const shown = allRoutes().filter(r => r._visible !== false);
        const years = {};
        for (const r of shown) {
            const y = trackYear(r) || '—';
            const meta = r.options.meta || {};
            const row = years[y] = years[y] || { n: 0, km: 0, gain: 0 };
            row.n++;
            row.km += meta.km || 0;
            row.gain += meta.gain || 0;
        }
        const total = Object.values(years).reduce((t, r) => ({ n: t.n + r.n, km: t.km + r.km, gain: t.gain + r.gain }), { n: 0, km: 0, gain: 0 });
        const rows = Object.keys(years).sort().reverse().map(y =>
            `<tr><td>${y}</td><td>${years[y].n}</td><td>${fmtInt(years[y].km)}</td><td>${fmtInt(years[y].gain)}</td></tr>`).join('');

        const filtered = shown.length !== allRoutes().length;
        const progress = [
            ['100 Cims', json_peaks],
            ['Sostres', json_sostres],
            ['3000s', json_tresmils],
        ].map(([label, list]) => {
            const done = list.filter(p => p.completat).length;
            const pct = list.length ? Math.round(100 * done / list.length) : 0;
            return `<div class="track-stats-progress">
                <div><span>${label}</span><span>${done} / ${list.length}</span></div>
                <div class="bar"><div style="width:${pct}%"></div></div>
            </div>`;
        }).join('');

        this._body.innerHTML = `
            <table>
                <thead><tr><th>Any</th><th>Rutes</th><th>km</th><th>+m</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><td>Total</td><td>${total.n}</td><td>${fmtInt(total.km)}</td><td>${fmtInt(total.gain)}</td></tr></tfoot>
            </table>
            ${filtered ? '<div class="track-stats-note">Només les rutes que passen el filtre o la cerca.</div>' : ''}
            <div class="track-stats-section">Cims assolits</div>
            ${progress}`;
    },
});

function addTrackStats(map) {
    trackStatsControl = new L.Control.TrackStats().addTo(map);
}
