// EVENT: Each time a route is loaded...
function handleRouteLoaded(e, uniqueTagsRef, tracks){
    const route = e.route;
    const routeName = (route.options && route.options.filename || '').toLowerCase();

    const matchingTrack = tracks.find(track =>
        track.file.split('/').pop().replace(/\.[^/.]+$/, '').toLowerCase() === routeName
    );

    if (!matchingTrack) {
        console.warn('No matching track for route:', routeName);
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
        console.log(label, savedLabels);
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
            console.log(selectedLabels)
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