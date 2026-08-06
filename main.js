var map = new maplibregl.Map({
  container: 'map',                                    // the div's id
  style: 'style.json',  
  center: [-73.9973, 40.7308],                         // [lng, lat] — WSP
  zoom: 16
});

map.addControl(new maplibregl.NavigationControl());

map.on('load', () => {

  // ---- benches ----
  map.addSource('benches', {
    type: 'geojson',
    data: 'benches.geojson'
  });

  map.addLayer({
    id: 'benches-layer',
    type: 'circle',
    source: 'benches',
    paint: {
      'circle-radius': 6,
      'circle-color': '#CFD11A',        // Lemon Lime
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#1C0103'  // Coffee Bean
    }
  });

  // ---- cafes ----
  map.addSource('cafes', {
    type: 'geojson',
    data: 'cafes.geojson'
  });

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

  map.on('click', 'benches-layer', (e) => {
    const coordinates = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;

    new maplibregl.Popup()
      .setLngLat(coordinates)
      .setHTML('<strong>' + props.bench_id + '</strong><br>source: ' + props.source)
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

});