function overrideLeafletGpxGroup(){

    const colorIntensity = 0.7;

    // Change track colors
    L.extend(L.GpxGroup.prototype, {
        _uniqueColors: function(count) {
            return new Array(count).fill(null).map((_,i) =>
                this._hsvToHex((Math.random()), 1, colorIntensity));
        }
    });

    // Change GeoJSON name
    L.extend(L.GpxGroup.prototype, {
        _loadGeoJSON: function(geojson, fallbackName) {
            if (geojson) {
                const cleanName = fallbackName?.split('/').pop().replace(/\.[^/.]+$/, ''); // Remove extension

                geojson.name = geojson.name || (geojson[0] && geojson[0].properties.name) || cleanName;

                // 💡 Store the fallback name directly to pass it forward
                geojson._fileName = cleanName;

                this._loadRoute(geojson);
            }
        }
    });
    L.extend(L.GpxGroup.prototype, {
        _loadRoute: function(data) {
            if (!data) return;

            const routeName = data.name || data._fileName || `route-${this._count}`;

            const line_style = {
                color: this._uniqueColors(this._tracks.length)[this._count++],
                opacity: 0.75,
                weight: 5,
                distanceMarkers: this.options.distanceMarkers_options,
            };

            const route = L.geoJson(data, {
                name: routeName,
                filename: data._fileName,
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