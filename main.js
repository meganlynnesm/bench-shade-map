// =====================================================================
// Morning Coffee in the Shade — Washington Square Park
// =====================================================================

var map = new maplibregl.Map({
  container: 'map',
  style: 'MapBaseV2.json?v=2',
  center: [-73.9973, 40.7308],   // [lng, lat] — WSP
  zoom: 16
});

map.addControl(new maplibregl.NavigationControl());

map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserLocation: true
}));


map.on('load', () => {

  // ---- state ----------------------------------------------------------
  let benchData = null;
  let shadeData = null;
  let routeData = null;
  let selectedBench = null;

  let state = { month: 6, hour: 9, thresh: 0.5 };


  // ---- shade lookup ---------------------------------------------------
  function getShade(benchId, month, hour) {
    if (!shadeData) return null;
    const key = benchId + '_' + month + '_' + hour;
    const value = shadeData[key];
    return value === undefined ? null : value;
  }


  // ---- recolour every bench for the current month / hour / threshold ---
  function updateBenches() {
    if (!benchData || !shadeData) return;

    let shadedCount = 0;
    let missing = 0;
    let bestId = null;
    let bestShade = -1;

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
        if (shade > bestShade) {
          bestShade = shade;
          bestId = f.properties.bench_id;
        }
      }
    });

    // only crown a winner if it actually clears the threshold
    if (bestId !== null && bestShade >= state.thresh) {
      benchData.features.forEach((f) => {
        if (f.properties.bench_id === bestId) f.properties.isBest = true;
      });
    }

    map.getSource('benches').setData(benchData);

    const label = document.getElementById('count');
    if (missing === benchData.features.length) {
      label.textContent = 'No data for this month and hour';
    } else {
      label.textContent = shadedCount + ' of ' +
        (benchData.features.length - missing) + ' benches shaded';
    }
  }


  // ---- draw the walk to the nearest OPEN cafe --------------------------
  function showRoute(benchId) {
    const info = document.getElementById('route-info');

    if (!routeData) {
      info.textContent = 'Routes still loading…';
      return;
    }
    if (!routeData[benchId]) {
      info.textContent = 'No route data for this bench';
      return;
    }

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
    map.getSource('route').setData({
      type: 'FeatureCollection',
      features: []
    });
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
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#CFD11A',      // Lemon Lime — walking route
        'line-width': 4,
        'line-opacity': 0.9
      }
    });

    // --- cafes (middle) ---
    map.addSource('cafes', {
      type: 'geojson',
      data: 'cafes.geojson'
    });

    map.addLayer({
      id: 'cafes-layer',
      type: 'circle',
      source: 'cafes',
      paint: {
        'circle-radius': 9,               // match the best-bench marker
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
      document.getElementById('route-info').textContent =
        'routes.json not found';
    });


  // ---- clicks and hovers (only after the layers exist) ----------------
  function attachInteractions() {

    map.on('click', 'benches-layer', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const props = e.features[0].properties;

      selectedBench = props.bench_id;
      showRoute(selectedBench);

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          '<strong>' + props.bench_id + '</strong><br>' +
          (props.shade < 0
            ? 'no data'
            : Math.round(props.shade * 100) + '% shaded') +
          '<br>source: ' + props.source
        )
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