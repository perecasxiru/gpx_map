function getCimTemplate(template_var){
    return `<svg xmlns="https://www.w3.org/2000/svg" viewBox="0 0 500 500" class="marker">
              <path class="st0" d="M256,13c106.8,0,194,87.2,194,194c0,132.4-162.3,268.4-194,294C223.7,476.6,62,346.1,62,207     C62,100.2,148.6,13,256,13z M376.2,275.3L256,81.3l-120.8,194l20.1,12.8l52.5-84.2l25,37.2l25-29.9l25,29.3l23.2-34.2l50.6,81.1     L376.2,275.3z" style="fill: ${template_var};"></path>
            <path class="st1" d="M256,81.3l120.2,194l-19.5,12.2L306,206.4l-23.2,34.2l-25-29.3l-25,29.9l-25-37.2l-52.5,84.2l-20.1-12.8     L256,81.3z M292,184.4l-36-57.9l-34.8,54.9l13.4,20.1l22.6-26.8l23.2,26.8L292,184.4z" style="fill: rgb(255, 255, 255);"></path>
            <polygon class="st0" points="256,126.5 292,184.4 280.4,201.5 257.2,174.7 234.6,201.5 221.2,181.4" style="fill: ${template_var};"></polygon>
            </svg>`;
}

const essencialTemplate = getCimTemplate("rgb(180,26,26)");
const essencialTemplatefound = getCimTemplate("rgb(5,180,69)");
const optionalTemplate = getCimTemplate("rgb(225,141,146)");
const optionalTemplatefound = getCimTemplate("rgb(137,213,162)");

// Sostres
const sostreTemplate = getCimTemplate("rgb(201,125,167)");
const sostreTemplatefound = getCimTemplate("rgb(97,147,33)");

// GCs
const gcTradTemplate = `<img src="../images/tr1.png"">`;
const gcMulTemplate = `<img src="../images/mu1.png"">`;
const gcMysTemplate = `<img src="../images/un1.png"">`;
const gcVirtTemplate = `<img src="../images/vi1.png"">`;
const gcWebTemplate = `<img src="../images/we1.png"">`;

const gcTradTemplateFound = `<img src="../images/tr1_f.png"">`;
const gcMulTemplateFound = `<img src="../images/mu1_f.png"">`;
const gcMysTemplateFound = `<img src="../images/un1_f.png"">`;
const gcVirtTemplateFound = `<img src="../images/vi1_f.png"">`;
const gcWebTemplateFound = `<img src="../images/we1_f.png"">`;

function template2CimIcon(template){
    return L.divIcon({
        className: "marker",
        html: template,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [7, -16]
    });
}

function template2GcIcon(template){
    return L.divIcon({
        className: "marker",
        html: template,
        iconSize: [34, 34],
        iconAnchor: [4, 34],
        popupAnchor: [0, -25]
    });
}

function generateWikilocURL(lat, lon, offset_view_box = 0.04) {
    const radius = 200;

    // Calculate bounding box
    const swLat = lat - offset_view_box;
    const swLon = lon - offset_view_box;
    const neLat = lat + offset_view_box;
    const neLon = lon + offset_view_box;

    // Format numbers with enough precision
    const format = num => num.toFixed(15);

    // Encode components
    const sw = `${format(swLat)}%2C${format(swLon)}`;
    const ne = `${format(neLat)}%2C${format(neLon)}`;
    const zdp = `(${format(lon)}%2C${format(lat)}%2C${radius})`;

    // Construct the URL
    return `https://www.wikiloc.com/wikiloc/map.do?sw=${sw}&ne=${ne}&loop=1&sort=trailrank&zdp=${zdp}&page=1`;
}

function createMarkersCims(lst, essencials, assolits, addToMap = false) {
    const arrayPeaks = [];

    const iconTemplate = (essencials && assolits) ? essencialTemplatefound :
        (essencials && !assolits) ? essencialTemplate :
            (!essencials && assolits) ? optionalTemplatefound :
                optionalTemplate;

    const icon_var = template2CimIcon(iconTemplate);

    const filtered = lst.filter(entry => entry.essencial === essencials && entry.completat === assolits);

    filtered.forEach(entry => {
        const wikiURL = generateWikilocURL(entry.lat, entry.lon);

        const popup = `
            <div style="text-align: center">
                <b>${entry.nom}</b><br>
                ${entry.alt}m
            </div><br>
            <center>
                <a href="${wikiURL}" target="_blank">
                    <img src="https://sc.wklcdn.com/wikiloc/assets/styles/images/logo/wikiloc_logo.svg?v=3.0" alt="Search on Wikiloc" width="50em">
                </a>
            </center>
        `;

        const marker = L.marker([entry.lat, entry.lon], { icon: icon_var }).bindPopup(popup);
        if (addToMap) marker.addTo(map);
        arrayPeaks.push(marker);
    });

    return [L.layerGroup(arrayPeaks), arrayPeaks.length];
}

function createMarkersSostres(lst, assolits, addToMap = false) {
    const icon_var = template2CimIcon(assolits ? sostreTemplatefound : sostreTemplate);
    const arrayPeaks = [];

    const filtered = lst.filter(entry => entry.completat === assolits);

    filtered.forEach(entry => {
        const wikiURL = `https://www.wikiloc.com/wikiloc/map.do?sw=-89.9992887%2C-179.999&ne=89.999%2C179.999&act=1&sort=trailrank&q=${entry.nom}&fitMapToTrails=1&page=1`;

        const popup = `
            <div style="text-align: center">
                <b>${entry.nom}</b><br>
                ${entry.alt}m<br>
                <i>${entry.comarca}</i>
            </div>
            <br>
            <center>
                <a href="${wikiURL}" target="_blank">
                    <img src="https://sc.wklcdn.com/wikiloc/assets/styles/images/logo/wikiloc_logo.svg?v=3.0" alt="Search on Wikiloc" width="50em">
                </a>
            </center>
        `;

        const marker = L.marker([entry.lat, entry.lon], { icon: icon_var }).bindPopup(popup);
        if (addToMap) marker.addTo(map);
        arrayPeaks.push(marker);
    });

    return [L.layerGroup(arrayPeaks), arrayPeaks.length];
}

function createMarkersGcs(lst, found, addToMap = false) {
    const iconTemplates = {
        Traditional: [gcTradTemplate, gcTradTemplateFound],
        Multicache: [gcMulTemplate, gcMulTemplateFound],
        Unknown: [gcMysTemplate, gcMysTemplateFound],
        Virtual: [gcVirtTemplate, gcVirtTemplateFound],
        Webcam: [gcWebTemplate, gcWebTemplateFound]
    };

    const isFound = entry => entry.Found_by_me.includes('/');
    const matchesFoundFilter = entry => isFound(entry) === found;

    const arrayGC = [];

    lst.filter(matchesFoundFilter).forEach(entry => {
        const foundStatus = isFound(entry) ? 1 : 0;

        const type = Object.keys(iconTemplates).find(t => entry.Cache_type.includes(t));
        if (!type) return; // Skip unknown types

        const icon_var = template2GcIcon(iconTemplates[type][foundStatus]);

        const foundInfo = isFound(entry) ? `<br><br><i>Found on ${entry.Found_by_me}</i>` : "";

        const popup = `
            <div style="text-align: center">
                <b><a href="https://coord.info/${entry.Code}" target="_blank">${entry.Code}</a><br>${entry.Waypoint_Name}</b>
                <br>by: ${entry.Placed_By}
                <br><br>Placed: ${entry.Placed}
                <br>Difficulty: ${entry.Diff}, Terrain: ${entry.Tern}
                <br>Size: ${entry.Container}
                ${foundInfo}
            </div>
        `;

        const marker = L.marker([entry.Latitude, entry.Longitude], { icon: icon_var }).bindPopup(popup);
        if (addToMap) marker.addTo(map);
        arrayGC.push(marker);
    });

    return [L.layerGroup(arrayGC), arrayGC.length];
}

function createMarkers(json_peaks, json_sostres, json_gc_olds, showGC=true) {
    var [peaks_essencials_assolits, len1] = createMarkersCims(json_peaks, essencials=true, assolits=true, addToMap=false);
    var [peaks_essencials_restants, len2] = createMarkersCims(json_peaks, essencials=true, assolits=false, addToMap=false);
    var [peaks_opcionals_assolits, len3] = createMarkersCims(json_peaks, essencials=false, assolits=true, addToMap=false);
    var [peaks_opcionals_restants, len4] = createMarkersCims(json_peaks, essencials=false, assolits=false, addToMap=false);

    var [sostres_assolits, len7] = createMarkersSostres(json_sostres, assolits=true, addToMap=false);
    var [sostres_restants, len8] = createMarkersSostres(json_sostres, assolits=false, addToMap=false);

    var [gc_olds_found, len5] = createMarkersGcs(json_gc_olds, found=true, addToMap=false);
    var [gc_olds_miss, len6] = createMarkersGcs(json_gc_olds, found=false, addToMap=false);

    const total_100cims_assolits = len1 + len3;
    const total_100cims = len1 + len2 + len3 + len4;
    const total_sostres_assolits = len7;
    const total_sostres = len7 + len8;
    const total_gcs_assolits = len5;
    const total_gcs = len5 + len6;

    const layers = {
        [`100Cims-HEADER (${total_100cims_assolits} / ${total_100cims})`]: L.layerGroup(), // Placeholder
        [`<span>${essencialTemplatefound}</span> Essencials Assolits (${len1})`]: peaks_essencials_assolits,
        [`<span>${essencialTemplate}</span> Essencials No Assolits (${len2})`]: peaks_essencials_restants,
        [`<span>${optionalTemplatefound}</span> No Essencials Assolits (${len3})`]: peaks_opcionals_assolits,
        [`<span>${optionalTemplate}</span> No Essencials No Assolits (${len4})`]: peaks_opcionals_restants,

        [`Sostres-HEADER (${total_sostres_assolits} / ${total_sostres})`]: L.layerGroup(), // Placeholder
        [`<span>${sostreTemplatefound}</span> Sostres Assolits (${len7})`]: sostres_assolits,
        [`<span>${sostreTemplate}</span> Sostres No Assolits (${len8})`]: sostres_restants,
    };
    if (showGC) {
        Object.assign(layers, {
            [`GCs-HEADER (${total_gcs_assolits} / ${total_gcs})`]: L.layerGroup(), // Placeholder
            [`<img src="../images/tr1_f.png" height="16"> GCs 103 Antics Trobats (${len5})`]: gc_olds_found,
            [`<img src="../images/tr1.png" height="16"> GCs 103 Antics No Trobats (${len6})`]: gc_olds_miss,
        });
    }
    return layers;
}