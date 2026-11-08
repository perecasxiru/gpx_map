// Convert one entry of tracks_data.json into the GeoJSON object L.GpxGroup accepts.
function trackToGeoJSON(t) {
    return {
        type: 'FeatureCollection',
        name: t.name,
        _fileName: t.file.split('/').pop().replace(/\.[^/.]+$/, ''),
        _file: t.file,
        _meta: t,
        features: t.lines.map(coordinates => ({
            type: 'Feature',
            properties: { name: t.name },
            geometry: { type: 'LineString', coordinates },
        })),
    };
}

// Stable color per track: same file, same color on every load.
function trackColor(key, value = 0.7) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return L.GpxGroup.prototype._hsvToHex((h % 360) / 360, 1, value);
}

// All tracks share one canvas. Unlike SVG, a canvas renderer has a click "tolerance":
// taps up to this many pixels away from a line still hit it (5 px lines are hard to tap).
// "pointer: coarse" = the main input is a finger (L.Browser.touch is true even with a mouse).
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
const trackRenderer = L.canvas({ tolerance: isCoarsePointer ? 14 : 5 });

function overrideLeafletGpxGroup(){

    // The elevation plugin adds chart data asynchronously while clear() is immediate, so
    // quick selections (e.g. a double tap, or select A / deselect / select B) mixed several
    // tracks into one chart ("12845 km"). Only the latest selection may add its data.
    L.extend(L.GpxGroup.prototype, {
        _onSelectionChanged: function() {
            const elevation = this._elevation;
            const route = this.getSelection();
            const token = this._eleToken = (this._eleToken || 0) + 1;

            elevation.clear();
            if (!(route && route.isSelected())) {
                if (elevation.getContainer()) elevation.remove();
                return;
            }
            if (!elevation.getContainer()) elevation.addTo(this._map);

            const show = () => {
                if (token !== this._eleToken) return;   // a newer selection replaced this one
                elevation.clear();
                route.getLayers().forEach(layer => {
                    if (layer instanceof L.Polyline) {
                        elevation.addData(layer, false);
                        layer.bringToFront();
                    }
                });
            };
            elevation.import(elevation.__D3).then(() =>
                elevation._modulesLoaded ? show() : elevation.once('modules_loaded', show));
        }
    });

    // Change GeoJSON name
    L.extend(L.GpxGroup.prototype, {
        _loadGeoJSON: function(geojson, fallbackName) {
            if (geojson) {
                const cleanName = fallbackName?.split('/').pop().replace(/\.[^/.]+$/, ''); // Remove extension

                geojson.name = geojson.name || (geojson[0] && geojson[0].properties.name) || cleanName;
                geojson._fileName = geojson._fileName || cleanName;

                this._loadRoute(geojson);
            }
        }
    });
    L.extend(L.GpxGroup.prototype, {
        _loadRoute: function(data) {
            if (!data) return;

            const routeName = data.name || data._fileName || `route-${this._count}`;
            this._count++;

            const line_style = {
                color: trackColor(data._file || routeName),
                opacity: 0.75,
                weight: 5,
                distanceMarkers: this.options.distanceMarkers_options,
            };

            const route = L.geoJson(data, {
                name: routeName,
                filename: data._fileName,
                file: data._file,       // original GPX, used by the download button
                meta: data._meta,       // km, gain, date... from tracks_data.json
                renderer: trackRenderer,
                style: (feature) => line_style,
                distanceMarkers: line_style.distanceMarkers,
                originalStyle: line_style,
                filter: feature => feature.geometry.type != "Point",
            });

            this._elevation.import(this._elevation.__LGEOMUTIL).then(() => {
                route.addTo(this._layers);
                route.eachLayer((layer) => this._onEachRouteLayer(route, layer));
                this._onEachRouteLoaded(route);
            });
        }
    });
}
