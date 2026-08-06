var map = new maplibregl.Map({
  container: 'map',                                    // the div's id
  style: 'style.json',  // temporary basemap
  center: [-73.9973, 40.7308],                         // [lng, lat] — WSP
  zoom: 16
});

map.addControl(new maplibregl.NavigationControl());