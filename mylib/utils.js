// EVENT: Each time a route is loaded...
function handleRouteLoaded(e, uniqueTagsRef, tracks){
    const route = e.route;
    const routeName = (route.options && route.options.filename || '').toLowerCase();

    const matchingTrack = tracks.find(track =>
        track.file.split('/').pop().replace(/\.[^/.]+$/, '').toLowerCase() === routeName
    );

    if (!matchingTrack) {
        console.warn('No matching track for route:', routeName, tracks);
        return;
    }

    route.tags = matchingTrack.tags;

    Object.values(route._layers).forEach(layer => {
        if (!layer._path) return;

        layer._path.setAttribute('data-tags', matchingTrack.tags.join(','));
        layer._path.setAttribute('title', route.options.name);
        layer._path.dataset.gpx = matchingTrack.file;

        for (let tag of matchingTrack.tags) {
            const [type, value] = tag.split('-');
            if (!uniqueTagsRef[type]) uniqueTagsRef[type] = new Set();
            uniqueTagsRef[type].add(value);
        }
    });
}

function filterPathsByTags(selectedTags) {
    // console.log('Selected tags:', selectedTags);
    const allPaths = document.querySelectorAll('path.leaflet-interactive');

    allPaths.forEach(path => {
        const tagsAttr = path.getAttribute('data-tags');
        const tags = tagsAttr ? tagsAttr.split(',') : [];
        const matches = selectedTags.length === 0 || selectedTags.every(tag => tags.includes(tag));
        path.style.display = matches ? 'inline' : 'none';
    });
}

function updateTagFilterFromMap(tagLayers) {
    const selectedTags = [];

    if (typeof tagLayers === 'object' && tagLayers !== null) {
        for (const [tag, layer] of Object.entries(tagLayers)) {
            if (map.hasLayer(layer)) {
                selectedTags.push(tag);
            }
        }
    }

    filterPathsByTags(selectedTags);
}

function getLabelText(checkbox) {
    const fullText = checkbox.parentElement.textContent.trim();
    return fullText.replace(/\s*\(.*?\)\s*$/, '').trim();
}
function customCheckoxes(checkboxes, label, defaultValue='[]') {
    const savedLabels = loadWithExpiry(label, defaultValue);
    for (let i = 0; i < checkboxes.length; i++) {
        const label = getLabelText(checkboxes[i]);
        // console.log(label, savedLabels);
        if (!savedLabels.includes(label)) {
            checkboxes[i].checked = false;
        } else {
            if (!checkboxes[i].checked) checkboxes[i].click(); // Ensure event is triggered
        }
    }
    for (let i = 0; i < checkboxes.length; i++) {
        checkboxes[i].addEventListener("change", () => {
            const selectedLabels = [];
            for (let j = 0; j < checkboxes.length; j++) {
                if (checkboxes[j].checked) {
                    const label = getLabelText(checkboxes[j]);
                    selectedLabels.push(label);
                }
            }
            saveWithExpiry(label, selectedLabels);
            // console.log(selectedLabels)
        });
    }
}

function styleOverlayLabels(labels) {
    labels.forEach(label => {
        const text = label.textContent;
        if (!text.includes('-HEADER')) return;

        const match = text.match(/^(.*)-HEADER\s*\((\d+\s*\/\s*\d+)\)$/);
        const title = match ? match[1] : text.replace('-HEADER', '');
        const count = match ? match[2] : null;

        label.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%;">
        <b>${title}</b>
        ${count ? `<span style="font-weight: normal; font-size: 11px; line-height: 1;">${count}</span>` : ''}
      </div>
    `;

        Object.assign(label.style, {
            pointerEvents: 'none',
            cursor: 'default',
            fontSize: '15px',
            marginTop: '8px',
            borderBottom: '1px solid #ccc',
            paddingBottom: '2px',
        });

        const input = label.querySelector('input');
        if (input) input.style.display = 'none';
    });
}


function createFilters(map, mapFilterLayerControl, uniqueTags){
    const tagLayers = {};  // { [fullTag]: LayerGroup }
    const groupedLayerControl = {}; // { [type]: { [value]: LayerGroup } }

    // 1. Create one layer per tag, grouped by type
    for (const [type, values] of Object.entries(uniqueTags)) {
        groupedLayerControl[type] = {};
        values.forEach(value => {
            const fullTag = `${type}-${value}`;
            const layer = L.layerGroup();
            tagLayers[fullTag] = layer;
            groupedLayerControl[type][value] = layer;
        });
    }

    for (const [type, group] of Object.entries(groupedLayerControl)) {
        mapFilterLayerControl._addLayer(L.layerGroup(), `${type}-HEADER`, true);  // or change label format
        for (const [value, layer] of Object.entries(group)) {
            mapFilterLayerControl._addLayer(layer, `${value}`, true);  // or change label format
        }
    }

    map.on('overlayadd', () => updateTagFilterFromMap(tagLayers));
    map.on('overlayremove', () => updateTagFilterFromMap(tagLayers));
}

const styleToggleButton = btn => {
    Object.assign(btn.style, {
        backgroundSize: '80% 80%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        width: '30px',
        height: '30px',
    });
};


function uploadGPX(map, routes){
    let layer;
        // FileLayer
    L.Control.FileLayerLoad.TITLE = 'Load local GPX file';
    L.Control.FileLayerLoad.LABEL =
        '<svg title="upload a gpx file" style="width: 20px;height: 100%;" version="1.1" id="folder" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="30px" height="30px" viewBox="0 0 450.583 450.584" style="enable-background:new 0 0 450.583 450.584;" xml:space="preserve"><g fill="#000000"><path d="M448.21,188.658c-1.897-2.242-4.688-3.535-7.629-3.535H9.999c-2.938,0-5.729,1.293-7.629,3.535c-1.898,2.242-2.717,5.207-2.234,8.106l29.547,177.704c1.838,11.158,11.379,19.256,22.688,19.256h345.842c11.31,0,20.851-8.098,22.687-19.24l29.549-177.72C450.929,193.864,450.111,190.899,448.21,188.658z"/><path d="M413.984,104.678c0-7.661-6.211-13.874-13.875-13.874H194.212V70.735c0-7.664-6.211-13.875-13.873-13.875H50.472c-7.662,0-13.873,6.211-13.873,13.875v82.418h377.386L413.984,104.678L413.984,104.678z"/></g></svg>'
        + '<p class="help"></p>';

    let fileLayer = L.Control.fileLayerLoad({
        formats: ['.gpx'],
        position: "topleft",
        fitBounds: true,
        layerOptions: {
            style: function (geoJsonFeature) {
                return {
                    color: '#3366cc',
                    opacity: 0.85,
                    weight: 4,
                    clickable: false
                };
            },
            onEachFeature: function(d, layer) {
                routes._elevation.addData(d, layer);
            },
            pointToLayer: function(data, latlng) {
             	// return L.circleMarker(latlng, {});
             }
        },
    });

    fileLayer.addTo(map);

    fileLayer.loader.on('data:error', function(e) {
        console.error(e);
    });

    fileLayer.loader.on('data:loading', function(e) {
        document.querySelector('.help').style.display = 'none';
        // console.info(e);
        routes._elevation.clear();
    });

    fileLayer.loader.on('data:loaded', function(e) {
        console.info(e);
        // layersControl.addOverlay(e.layer, e.filename);
        if (layer) layer.remove();
        layer = e.layer;
        if (!routes._elevation._map)
            routes._elevation.addTo(map);
        // else routes._elevation.redraw();
    });
}

function downloadGPX(map, routes) {
    let currentGpxLayer = null;

    // Function to create and insert button
    function insertButton() {
        const summaryDiv = document.querySelector('.elevation-control .elevation-summary');
        if (!summaryDiv) return;

        // Avoid duplicates if elevation-summary already has our button
        if (summaryDiv.querySelector('.download-gpx-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'download-gpx-btn';
        btn.innerHTML = '⬇️';
        btn.title = 'Download current GPX';
        btn.style.background = 'white';
        btn.style.border = '1px solid #ccc';
        btn.style.cursor = 'pointer';
        btn.style.marginRight = '6px';
        btn.style.padding = '2px 6px';
        btn.style.borderRadius = '4px';
        btn.style.fontSize = '14px';

        btn.addEventListener('click', function () {
            if (!currentGpxLayer) {
                alert('No track selected!');
                return;
            }

            const geojson = currentGpxLayer.toGeoJSON();
            const gpxData = togpx(geojson, { creator: "MyLeafletApp" });
            const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = (
                currentGpxLayer.options.filename ||
                geojson?.features?.[0]?.properties?.name ||
                'track'
            ) + '.gpx';
            a.click();

            URL.revokeObjectURL(url);
        });

        summaryDiv.insertBefore(btn, summaryDiv.firstChild);
    }

    // On selection change: update GPX layer & insert button
    routes.on('selection_changed', function () {
        currentGpxLayer = routes._selected || null;
        setTimeout(insertButton, 50); // small delay to allow DOM update
    });
}

function addRightClickPopup(map) {
    map.on('contextmenu', function (e) {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);

        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

        const popupContent = `
            <div style="font-size:14px;">
                <b>Coordinates:</b><br>
                ${lat}, ${lng}<br><br>
                <a href="${googleMapsUrl}" target="_blank">🌍 Open in Google Maps</a><br>
                <a href="${streetViewUrl}" target="_blank">🚶 Open in Street View</a>
            </div>
        `;

        L.popup()
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(map);
    });
}



