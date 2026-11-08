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

function overrideLeafletGpxGroup(){

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
