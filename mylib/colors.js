// Track colouring. Modes:
//   route: every track gets a colour different from the tracks around it (default)
//   year:  by the year of the track's date
//   type:  by its Tipus tag (Caminada, Travessa...)
// No greens (the map is green) and no yellows (yellow = selected track).

const ROUTE_PALETTE = [
    '#e41a1c', '#377eb8', '#ff7f00', '#984ea3', '#00a0b0',
    '#e7298a', '#a65628', '#1a237e', '#7f0000', '#455a64',
];
const TYPE_COLORS = { Caminada: '#377eb8', Travessa: '#e41a1c', Bicicleta: '#ff7f00', 'Via Ferrada': '#984ea3' };
const NO_DATA_COLOR = '#8c8c8c';
const COLOR_MODES = { route: 'Per ruta', year: 'Per any', type: 'Per tipus' };

let colorMode = 'route';
let distinctColorCache = null;
let colorLegendControl = null;
let colorLegendItems = [];

function colorLegendHtml(items) {
    return items.map(([label, color]) =>
        `<span class="color-chip"><i style="background:${color}"></i>${escapeHtml(label)}</span>`).join('');
}

function trackType(route) {
    const tag = (route.tags || []).find(t => t.startsWith('Tipus-'));
    return tag ? tag.slice('Tipus-'.length) : 'Altres';
}

function trackYear(route) {
    const date = (route.options.meta || {}).date;
    return date ? date.slice(0, 4) : null;
}

// Graph colouring: tracks whose bounding boxes are within ~1 km are neighbours and get
// different colours when possible. Most-connected tracks are coloured first; ties go to
// the least used colour. Deterministic, so colours are stable between visits.
function computeDistinctColors(routes) {
    const PAD_LAT = 0.01, PAD_LON = 0.013;   // ~1 km
    const boxes = routes.map(r => {
        const b = r.getBounds();
        return [b.getSouth() - PAD_LAT, b.getWest() - PAD_LON, b.getNorth() + PAD_LAT, b.getEast() + PAD_LON];
    });
    const near = routes.map(() => []);
    for (let i = 0; i < routes.length; i++) {
        for (let j = i + 1; j < routes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]) {
                near[i].push(j);
                near[j].push(i);
            }
        }
    }
    const file = i => routes[i].options.file || '';
    const order = routes.map((_, i) => i)
        .sort((a, b) => near[b].length - near[a].length || file(a).localeCompare(file(b)));

    const P = ROUTE_PALETTE.length;
    const color = new Array(routes.length);
    const usage = new Array(P).fill(0);
    for (const i of order) {
        const clash = new Array(P).fill(0);
        for (const j of near[i]) if (color[j] !== undefined) clash[color[j]]++;
        let best = 0;
        for (let c = 1; c < P; c++) {
            if (clash[c] < clash[best] || (clash[c] === clash[best] && usage[c] < usage[best])) best = c;
        }
        color[i] = best;
        usage[best]++;
    }
    return color.map(c => ROUTE_PALETTE[c]);
}

// Blue (oldest) -> purple -> red -> orange (most recent); skips greens and yellows.
function yearRamp(index, count) {
    const t = count <= 1 ? 1 : index / (count - 1);
    const hue = (220 + t * 170) % 360;
    return `hsl(${Math.round(hue)}, 75%, ${Math.round(42 + 6 * t)}%)`;
}

function applyColorMode(mode) {
    colorMode = COLOR_MODES[mode] ? mode : 'route';
    savePref('colorMode', colorMode);

    const rs = allRoutes();
    let colors, legend = [];
    if (colorMode === 'year') {
        const years = [...new Set(rs.map(trackYear).filter(Boolean))].sort();
        const byYear = Object.fromEntries(years.map((y, i) => [y, yearRamp(i, years.length)]));
        colors = rs.map(r => byYear[trackYear(r)] || NO_DATA_COLOR);
        legend = years.slice().reverse().map(y => [y, byYear[y]]);
        if (rs.some(r => !trackYear(r))) legend.push(['Sense data', NO_DATA_COLOR]);
    } else if (colorMode === 'type') {
        const types = [...new Set(rs.map(trackType))]
            .sort((a, b) => rs.filter(r => trackType(r) === b).length - rs.filter(r => trackType(r) === a).length);
        const extra = ROUTE_PALETTE.filter(c => !Object.values(TYPE_COLORS).includes(c));
        const byType = {};
        types.forEach(t => byType[t] = TYPE_COLORS[t] || extra.shift() || NO_DATA_COLOR);
        colors = rs.map(r => byType[trackType(r)]);
        legend = types.map(t => [t, byType[t]]);
    } else {
        distinctColorCache = distinctColorCache || computeDistinctColors(rs);
        colors = distinctColorCache;
    }

    rs.forEach((route, i) => {
        route.options.originalStyle.color = colors[i];
        if (!route.isSelected()) route.setStyle({ color: colors[i] });
    });

    colorLegendItems = legend;
    if (colorLegendControl) colorLegendControl.update(legend);
    refreshTrackPanels();
}

L.Control.ColorLegend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function() {
        this._div = L.DomUtil.create('div', 'color-legend');
        L.DomEvent.disableClickPropagation(this._div);
        L.DomEvent.disableScrollPropagation(this._div);
        return this._div;
    },
    update: function(items) {
        this._div.style.display = items.length ? '' : 'none';
        this._div.innerHTML = colorLegendHtml(items);
    },
});

function initColors(map) {
    colorLegendControl = new L.Control.ColorLegend().addTo(map);
    applyColorMode(loadPref('colorMode', 'route'));
}
