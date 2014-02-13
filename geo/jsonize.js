var togeojson = require('./togeojson.js');
var layers = require('./cvlayers.js').layers;
var _ = require('underscore');
var exec = require('child_process').exec;
var fs = require('fs');
var jsdom = require('jsdom').jsdom;
var xml2js = require('xml2js');
var parser = new xml2js.Parser({strict:false});


var layerTags = [];
/*
	(for CSV output:)

	id
	status
	kml file size
	geojson file size
	num features
	num ground overlays

	num points
	num line strings
	num polygons

	num included files (read from subdirectory, if exists)
		list of included files?
	num network links
		list of network links?

	num styles
	processing time
	lat/lon bounds?
*/

var maxKMLSize = 1400000;

/*
layerTags.push([ 
	'id', 'name', 'status', 'kmlSize', 'geojsonSize',
	'numFeature', 'numPoint', 'numLineString', 'numPolygon', 'numOverlay',
	'numStyle', 'numNetworkLink',
	'timeMS'
]);
*/

_.each(layers, function(L) {
	if (L.section) {
		layerTags.push({
			uri: L.section,
			name: L.section
		});
		return;
	}


	var id = L.layer;
	if (!id) return;

	var name = L.name;

	var kmlurl = L.kml;
	if (kmlurl.indexOf('http://')!=0) return;

	var filename = 'cache/' + id + '.kml';
	var r;

	var start = Date.now();

	try {
		r = fs.readFileSync(filename, 'utf8');
	}
	catch (e) { 
		var ll = {
			uri: id,
			name: name,
			description: 'Not found'
		};
		if (L.tag)
			ll.tag = L.tag;
		layerTags.push(ll);
		return; 
	}

	var kmlSize = r.length;

	if (kmlSize > maxKMLSize) {
		var ll = {
			uri: id,
			name: name,
			description: 'Too Large (' + kmlSize + ')'
		};
		if (L.tag)
			ll.tag = L.tag;
		layerTags.push(ll);
		return;
	}

	console.log('Converting ' + id);

	parser.parseString(r, function (err, result) {
		fs.writeFileSync('cache/' + id + '.json', JSON.stringify(result));
	});

	var kml = jsdom(r);

	var g = togeojson.kml(kml, { styles: true });
	
	var json = JSON.stringify(g);
	fs.writeFileSync('data/' + id + '.geojson', json);

	var end = Date.now();


	var numFeature = g.features  ? g.features.length : 0;
	var numOverlay = g.overlays ? g.overlays.length : 0;
	var numPoint = 0, numLineString = 0, numPolygon = 0;
	var numStyle = g.styles ? g.styles.length : 0;
	var numNetworkLink = g.links ? g.links.length : 0;

	if (g.features) {
		for (var i = 0; i < g.features.length; i++) {
			var f = g.features[i];
			if (f.geometry) {
				var type = f.geometry.type;
				if (type == 'Point') numPoint++;
				if (type == 'LineString') numLineString++;
				if (type == 'Polygon') numPolygon++;
			}
		}
	}

	var time = (end - start);

	var ll = {
		uri: id,
		name: name,
		include: '/geo/data/' + id + '.geojson',
		description: JSON.stringify([ 
		'OK', kmlSize, json.length,
		numFeature, numPoint, numLineString, numPolygon, numOverlay,
		numStyle, numNetworkLink,
		time
		])
	};
	if (L.tag)
		ll.tag = L.tag;

	layerTags.push(ll);
});

var ontology = {
	tags: layerTags,
	properties: []
};
fs.writeFileSync('../layers.json', JSON.stringify(ontology));
