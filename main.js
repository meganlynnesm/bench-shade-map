// =====================================================================
// Morning Coffee in the Shade — Washington Square Park
//
// Data generated: 4 months (3/6/9/12), hours 7–11, 20-minute break window.
// Regenerate bench_shade.json and benches.geojson together — the bench_id
// keys must match or the shade lookup silently returns nothing.
// =====================================================================

var map = new maplibregl.Map({
  container: 'map',
  style: 'style.json',
  center: [-73.9973, 40.7308],   // [lng, lat] — WSP
  zoom: 16
});

map.addControl(new maplibregl.NavigationControl());


map.on('load', () => {

  // ---- state ----------------------------------------------------------
  let benchData = null;
  let shadeData = null;
  let routeData = null;
  let selectedBench = null;
  let userPos = null;            // [lng, lat] once the visitor locates themselves

  let state = { month: 6, hour: 9, thresh: 0.5 };


  // ---- geolocation ----------------------------------------------------
  const geo = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserLocation: true
  });
  map.addControl(geo);

  geo.on('geolocate', (e) => {
    userPos = [e.coords.longitude, e.coords.latitude];
    refresh();
  });

  geo.on('trackuserlocationend', () => {
    userPos = null;
    refresh();
  });

  // Straight-line metres. Within one park this is a fair approximation of
  // walking distance; across the wider walkshed it would not be.
  function metresBetween(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;
    const la1 = a[1] * rad, la2 = b[1] * rad;
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }


  // ---- shade lookup ---------------------------------------------------
  function getShade(benchId, month, hour) {
    if (!shadeData) return null;
    const key = benchId + '_' + month + '_' + hour;
    const value = shadeData[key];
    return value === undefined ? null : value;
  }


  // ---- recolour every bench for the current month / hour / threshold ---
  // The rule is a filter chain, not a weighted score:
  //   1. keep benches shaded at or above the threshold
  //   2. of those, pick the nearest to the visitor — or the shadiest if
  //      we don't know where they are.
  function updateBenches() {
    if (!benchData || !shadeData) return;

    let shadedCount = 0;
    let missing = 0;

    benchData.features.forEach((f) => {
      const shade = getShade(f.properties.bench_id, state.month, state.hour);
      f.properties.isBest = false;

      if (shade === null) {
        missing++;
        f.properties.shade = -1;
        f.properties.isShaded = false;
      } else {
        f.properties.shade = shade;
        f.properties.isShaded = shade >= state.thresh;
        if (f.properties.isShaded) shadedCount++;
      }
    });

    const shaded = benchData.features.filter((f) => f.properties.isShaded);
    let winner = null;

    if (shaded.length) {
      if (userPos) {
        winner = shaded.reduce((best, f) =>
          metresBetween(userPos, f.geometry.coordinates) <
          metresBetween(userPos, best.geometry.coordinates) ? f : best);
      } else {
        winner = shaded.reduce((best, f) =>
          f.properties.shade > best.properties.shade ? f : best);
      }
      winner.properties.isBest = true;
    }

    map.getSource('benches').setData(benchData);

    // ---- panel readout ----
    const label = document.getElementById('count');
    const rule = document.getElementById('rule');

    if (missing === benchData.features.length) {
      label.textContent = 'No data for this month and hour';
      rule.textContent = '';
      return;
    }

    label.textContent = shadedCount + ' of ' +
      (benchData.features.length - missing) + ' benches shaded';

    if (!shaded.length) {
      rule.textContent = 'No bench meets the shade threshold';
    } else if (userPos) {
      const d = Math.round(metresBetween(userPos, winner.geometry.coordinates));
      rule.textContent = 'Pick: nearest shaded bench to you — ' + d + ' m away';
    } else {
      rule.textContent = 'Pick: shadiest bench · press the crosshair to use your location';
    }
  }


  // ---- draw the walk to the nearest OPEN cafe --------------------------
  function showRoute(benchId) {
    const info = document.getElementById('route-info');

    if (!routeData) { info.textContent = 'Routes still loading…'; return; }
    if (!routeData[benchId]) { info.textContent = 'No route data for this bench'; return; }

    const open = routeData[benchId].filter(
      (r) => !r.opens || Number(r.opens.split(':')[0]) <= state.hour
    );

    if (open.length === 0) {
      clearRoute();
      info.textContent = 'No cafes open at ' + state.hour + ':00';
      return;
    }

    const best = open[0];

    map.getSource('route').setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: best.coordinates }
      }]
    });

    info.textContent =
      best.name + ' — ' + best.distance_m + ' m, ' + best.walk_min + ' min';
  }

  function clearRoute() {
    map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  }


  // ---- load the data, then build the layers ---------------------------
  // Layers are added bottom-up: route underneath, then cafes, then benches.
  Promise.all([
    fetch('benches.geojson').then((r) => r.json()),
    fetch('bench_shade.json').then((r) => r.json())
  ]).then(([benches, shade]) => {
    benchData = benches;
    shadeData = shade;

    // --- route line (bottom) ---
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'route-layer',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#18486B',      // Yale Blue
        'line-width': 4,
        'line-opacity': 0.8
      }
    });

    // --- cafes (middle) ---
    map.addSource('cafes', { type: 'geojson', data: 'cafes.geojson' });

    map.addLayer({
      id: 'cafes-layer',
      type: 'circle',
      source: 'cafes',
      paint: {
        'circle-radius': 7,
        'circle-color': '#18486B',        // Yale Blue
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#F3EDDE'  // Old Lace
      }
    });

    // --- benches (top) ---
    map.addSource('benches', { type: 'geojson', data: benchData });

    map.addLayer({
      id: 'benches-layer',
      type: 'circle',
      source: 'benches',
      paint: {
        'circle-radius': [
          'case',
          ['get', 'isBest'], 9,
          6
        ],
        'circle-color': [
          'case',
          ['get', 'isBest'], '#CFD11A',    // Lemon Lime — the pick
          ['get', 'isShaded'], '#1C0103',  // Coffee Bean — in shade
          '#F3EDDE'                        // Old Lace — in sun
        ],
        'circle-stroke-width': [
          'case',
          ['get', 'isBest'], 2.5,
          1.5
        ],
        'circle-stroke-color': [
          'case',
          ['get', 'isBest'], '#1C0103',    // Coffee Bean ring
          ['get', 'isShaded'], '#F3EDDE',  // Old Lace on dark fill
          '#1C0103'                        // Coffee Bean on light fill
        ]
      }
    });

    updateBenches();
    attachInteractions();
  });

  // routes load separately — the map works without them
  fetch('routes.json')
    .then((r) => r.json())
    .then((d) => { routeData = d; })
    .catch(() => {
      document.getElementById('route-info').textContent = 'routes.json not found';
    });


  // ---- clicks and hovers (only after the layers exist) ----------------
  function attachInteractions() {

    map.on('click', 'benches-layer', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const props = e.features[0].properties;

      selectedBench = props.bench_id;
      showRoute(selectedBench);

      let html = '<strong>' + props.bench_id + '</strong><br>' +
        (props.shade < 0
          ? 'no data'
          : Math.round(props.shade * 100) + '% shaded') +
        '<br>source: ' + props.source;

      if (userPos) {
        html += '<br>' + Math.round(metresBetween(userPos, coordinates)) + ' m from you';
      }

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(html)
        .addTo(map);
    });

    map.on('click', 'cafes-layer', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const props = e.features[0].properties;

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML('<strong>' + props.name + '</strong><br>opens ' + props.opens)
        .addTo(map);
    });

    ['benches-layer', 'cafes-layer'].forEach((layerId) => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    });
  }


  // ---- panel controls -------------------------------------------------
  function refresh() {
    updateBenches();
    if (selectedBench) showRoute(selectedBench);
  }

  document.querySelectorAll('#months button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#months button')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.month = Number(btn.dataset.month);
      refresh();
    });
  });

  document.getElementById('hour').addEventListener('input', (e) => {
    state.hour = Number(e.target.value);
    document.getElementById('hour-label').textContent = state.hour + ':00';
    refresh();
  });

  document.getElementById('thresh').addEventListener('input', (e) => {
    state.thresh = Number(e.target.value) / 100;
    document.getElementById('thresh-label').textContent = e.target.value + '%';
    refresh();
  });

});