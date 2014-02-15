var layers = require('./cvlayers.js').layers;
var _ = require('underscore');
var exec = require('child_process').exec;
var fs = require('fs');

var xml2js = require('xml2js');
var parser = new xml2js.Parser({strict:false});

var minifier = require('html-minifier');

//https://github.com/inh3/nPool

//var JSONH = require('../lib/jsonh/jsonh.js');
//var BSON = require('bson').pure().BSON;
var RJSON = require('rjson');

var Join = require('join').Join,
  join = Join.create();

var layerTags = [];
var dependentKML = [];

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

//var maxKMLSize = 500000;
var maxKMLSize = 11000000;

function kml2geojson(layerid, k) {
	var f = [];
	var overlays = [];

	function spaces(d) {
		var x = '';
		for (var i = 0; i < d.length; i++) x+=' ';
		return x;
	}
	var removeSpace = (/\s*/g);

	function numarray(x) {
	    for (var j = 0, o = []; j < x.length; j++) o[j] = parseFloat(x[j]);
	    return o;
	}

	function coordring(v) {
		var tuples = v.trim().split(" ");
		var c = [];
		for (var i = 0; i < tuples.length; i++) {
			var cc = coord1(tuples[i]);
			if ( isNaN(cc[0]) || isNaN(cc[1]) )
				continue;
			c.push( cc );
		}
		return c;
	}
	function coord1(v) {
		var c = numarray(v.replace(removeSpace, '').split(','));
		if (c.length > 2)
			if (c[2] == 0) {
				return [ c[0], c[1] ];
			}
		return c;
	}

	function addPlacemark(x) {

		var geoms = [];
		var p = { };

		if (x.NAME) p.name = x.NAME;
		//TODO find what is generating this and fix it
		if (Array.isArray(p.name))
			p.name = p.name[0];

		if (x.DESCRIPTION) p.description = x.DESCRIPTION;


		function addPoints(p) {
			for (var i = 0; i < p.length; i++) {
				var X = p[i];
				geoms.push({
		            type: 'Point',
		            coordinates: coord1(X.COORDINATES[0])
				});
			}
		}
		function addPolygons(p) {
			for (var i = 0; i < p.length; i++) {
				var X = p[i];

				var rings = [];				
				for (var r = 0; r < X.OUTERBOUNDARYIS[0].LINEARRING.length; r++) {
					var R = X.OUTERBOUNDARYIS[0].LINEARRING[r];
					var rc = R.COORDINATES[0];
					rings.push( coordring(rc) );
				}
				geoms.push({
                	type: 'Polygon',
                	coordinates: rings
				});
			}
		}
		function addLinestrings(p) {
			for (var i = 0; i < p.length; i++) {
				var c = p[i].COORDINATES[0];
				geoms.push({
                	type: 'LineString',
                    coordinates: coordring(c)
				});
			}
		}

		if (x.POINT) {
			addPoints(x.POINT);
			delete x.POINT;
		}

		if (x.POLYGON) {
			addPolygons(x.POLYGON);
			delete x.POLYGON;
		}

		if (x.LINESTRING) {
			addLinestrings(x.LINESTRING);
			delete x.LINESTRING;
		}

		if (x.MULTIGEOMETRY) {
			var m = x.MULTIGEOMETRY[0];
			if (m.POINT)
				addPoints(m.POINT);

			if (m.LINEARRING) {
				//IS THIS REAL?

				//var r = coordring(m.LINEARRING[0].COORDINATES[0]);
				//console.log('LINEARRING', r);
			
				/*
				var ml = m.LINEARRING;

				var rings = [];				
				for (var r = 0; r < ml.length; r++) {
					var R = X.OUTERBOUNDARYIS[0].LINEARRING[r];
					var rc = R.COORDINATES[0];
					rings.push( coordring(rc) );
				}
				geoms.push({
                	type: 'Polygon',
                	coordinates: rings
				});*/
			}

			delete x.MULTIGEOMETRY;
		}

		if (x.LOOKAT) {
			for (var i = 0; i < x.LOOKAT.length; i++) {
				var X = x.LOOKAT[i];
 				var lon = parseFloat(X.LONGITUDE[0]);
 				var lat = parseFloat(X.LATITUDE[0]);

				var c = [ lon, lat ];
				if (X.ALTITUDE) {
					c.push(parseFloat(X.ALTITUDE[0]));
				}

				geoms.push({
		            type: 'Point',
		            coordinates: c
				});
			}
			delete x.LOOKAT;
		}

		if (x.SNIPPET) {
			//var s = x.SNIPPET;
			//console.log('SNIPPET', s);
			delete x.SNIPPET;
		}

		if (x.STYLEURL) {
			p.style = x.STYLEURL[0].substring(1);
			delete x.STYLEURL;
		}
		if (x.ADDRESS) {
			p.description += '\n' + x.ADDRESS[0];
			delete x.ADDRESS;
		}
		if (x.STYLE) {
			p.style = x.STYLE[0];
			delete x.STYLE;
		}
		if (x.TIMESPAN) {
			p.timespan = x.TIMESPAN[0];
			delete x.TIMESPAN;
		}
		if (x.TIMESTAMP) {
			p.timestamp = x.TIMESTAMP[0];
			delete x.TIMESTAMP;
		}

		delete x.NAME;
		delete x.DESCRIPTION;
		delete x.OPEN;
		delete x.VISIBILITY;
		delete x.VIEW;
		delete x.CAMERA;
		delete x.EXTENDEDDATA;
		delete x.REGION;
		delete x['$'];
		delete x['_'];
		delete x['GX:BALLOONVISIBILITY'];

		if (_.keys(x).length > 0)
			console.error('PLACEMARK', x);

		
		if (p.description) {
			if (Array.isArray(p.description))
				p.description = p.description[0];

			try {
				p.description = minifier.minify(p.description, { removeComments: true });
			}
			catch (e) { }
		}

		f.push({
            type: 'Feature',
            geometry: (geoms.length === 1) ? geoms[0] : {
                type: 'GeometryCollection',
                geometries: geoms
            },
            properties: p
        });

	}
	function addOverlay(x) {

		/*
		 { NAME: [ '1990' ],
		  VISIBILITY: [ '1' ],
		  LOOKAT: 
		   [ { LONGITUDE: [Object],
			   LATITUDE: [Object],
			   ALTITUDE: [Object],
			   RANGE: [Object],
			   TILT: [Object],
			   HEADING: [Object],
			   ALTITUDEMODE: [Object] } ],
		  TIMESPAN: [ { BEGIN: [Object], END: [Object] } ],
		  DRAWORDER: [ '1990' ],
		  ICON: [ { HREF: [Object] } ],
		  LATLONBOX: 
		   [ { NORTH: [Object],
			   SOUTH: [Object],
			   EAST: [Object],
			   WEST: [Object] } ] }

		<LatLonBox>
			Specifies where the top, bottom, right, and left sides of a bounding box for the ground overlay are aligned.
			<north> Specifies the latitude of the north edge of the bounding box, in decimal degrees from 0 to ±90.
			<south> Specifies the latitude of the south edge of the bounding box, in decimal degrees from 0 to ±90.
			<east> Specifies the longitude of the east edge of the bounding box, in decimal degrees from 0 to ±180. (For overlays that overlap the meridian of 180° longitude, values can extend beyond that range.)
			<west> Specifies the longitude of the west edge of the bounding box, in decimal degrees from 0 to ±180. (For overlays that overlap the meridian of 180° longitude, values can extend beyond that range.)
			<rotation> Specifies a rotation of the overlay about its center, in degrees. Values can be ±180. The default is 0 (north). Rotations are specified in a counterclockwise direction.

		<Icon>
			  <href>http://www.google.com/intl/en/images/logo.gif</href>
			  <refreshMode>onInterval</refreshMode>
			  <refreshInterval>86400</refreshInterval>
			  <viewBoundScale>0.75</viewBoundScale>
	   </Icon>
		*/
		var p = {

		};
		if (x.NAME) p.name = x.NAME[0];
		if (x.DRAWORDER) p.drawOrder = parseInt(x.DRAWORDER[0]);
		
	
		if ((x.ICON) && (x.LATLONBOX)) {
			var i = x.ICON[0].HREF[0];
	
			//if URL is relative, it refers to a file that was originally in the .KMZ file
			if (i.indexOf('http://')!=0) {
				//remove directories leading up to the file, TODO use a safer method in case same filenames are used in subdirectories
				var lastSlash = i.lastIndexOf('/');
				if (lastSlash!=-1) {
					i = i.substring(lastSlash+1, i.length);
				}

				//prepend path to the relative cache
				i = "/geo/cache/" + layerid + "/" + i;
			}


			var B = x.LATLONBOX[0];
			var b = [ parseFloat(B.NORTH[0]), parseFloat(B.EAST[0]), parseFloat(B.SOUTH[0]), parseFloat(B.WEST[0]) ];
			 
			var ff = {
		        type: 'Feature',
		        geometry: {
					type: 'GroundOverlay',
					latlonbox: b,				
					icon: i
				},
		        properties: p
		    };
			
			if (B.ROTATION)
				ff.geometry.rotate = parseFloat(B.ROTATION[0]);

			//console.error('OVERLAY', i, b, ff.geometry.rotate);
			overlays.push(ff);
		}
	}

	function addFeatures(node) {
		if (!node) return;

		//console.log(node);

		var overlays = node.GROUNDOVERLAY;
		if (overlays) {
			//console.error('Overlays: ' + overlays.length);
			for (var i = 0; i < overlays.length; i++) {
				addOverlay(overlays[i]);
			}
		}

		var placemarks = node.PLACEMARK;
		if (placemarks) {
			//console.log(spaces(2+2*depth) + '  Placemarks: ' + placemarks.length);
			for (var i = 0; i < placemarks.length; i++) {
				addPlacemark(placemarks[i]);
			}
		}

		var styles = node.STYLE;
		if (styles) {
			console.error('  Styles: ' + styles.length);
		}

		var networklinks = node.NETWORKLINK;
		if (networklinks) {
			//console.error('  NetworkLinks: ' + networklinks.length);
			for (var i = 0; i < networklinks.length; i++) {
				var N = networklinks[i];


				var url = N.URL ? N.URL : N.LINK;
				if (url)
					url = url[0].HREF[0];

				if (!url) continue;

				var folderID = i;
				var folderName = N.NAME ? N.NAME[0] : ('#' + i);
				var folderURI = layerid + "_" + folderID;

				var ll = {
					uri: folderURI,
					kmlURL: url,
					name: folderName,
					description: url,
					geoJSON: '/geo/data/' + folderURI + '.geojson',
					tag: [ layerid ]
				};
				layerTags.push(ll);

				dependentKML.push(ll);

				//kml2geojson(folderURI, folders[i]);
			}

		}

		var folders = node.FOLDER;
		if (folders) {
			//console.log(spaces(2+2*depth) + '  Folders: ' + folders.length);

			for (var i = 0; i < folders.length; i++) {
				var F = folders[i];
				var folderID = i;
				var folderName = F.NAME ? F.NAME[0] : ('#' + i);
				var folderURI = layerid + "." + folderID;

				var ll = {
					uri: folderURI,
					name: folderName,
					geoJSON: '/geo/data/' + folderURI + '.geojson',
					tag: [ layerid ]
				};
				layerTags.push(ll);

				kml2geojson(folderURI, folders[i]);
			}
		}
	}

	
	if ((!k.KML) || (!k.KML.DOCUMENT))
		addFeatures(k);
	else
		addFeatures(k.KML.DOCUMENT[0]);

	var g = {
		"type": "FeatureCollection",
		"features": f
	};

	if (overlays.length > 0)
		g.overlays = overlays;


	var stringified = JSON.stringify(g);

	//var packed = BSON.serialize(g);
	//var packed = JSON.stringify(RJSON.pack(g));

	//console.log('  kml',kmlSize,'json',stringified.length,'rjson',packed.length);
	fs.writeFileSync('data/' + layerid + '.geojson', stringified);
	//fs.writeFileSync('data/' + id + '.rgeojson', packed);


	return g;
}

/*
layerTags.push([ 
	'id', 'name', 'status', 'kmlSize', 'geojsonSize',
	'numFeature', 'numPoint', 'numLineString', 'numPolygon', 'numOverlay',
	'numStyle', 'numNetworkLink',
	'timeMS'
]);
*/
/*
join.notify(function (i, args) {
  console.log(
    'Callback #' + (i + 1) 
  + ' of ' + join.length 
  + ' completed', args
  );
});
*/

for (var i = 0; i < layers.length; i++) {
	var L = layers[i];

	if (L.section) {
		L.layer = L.section;
	}

	var id = L.layer;
	if (!id) continue;

	var name = L.name || id;

	var ll = {
		uri: id,
		name: name,
		description: (L.source || '')
	};
	if (L.tag) ll.tag = L.tag;
	if (L.icon) ll.icon = L.icon;
	if (L.defaultStrength)	ll.defaultStrength = L.defaultStrength;

	if (L.tileLayer) {
		ll.tileLayer = L.tileLayer;
		layerTags.push(ll);
	}
	else if (L.section) {
		layerTags.push(ll);
	}
	else if (L.kml) {
		var kmlurl = L.kml;
		if (kmlurl.indexOf('http://')!=0) continue;

		var filename = 'cache/' + id + '.kml';
		var r;


		try {
			r = fs.readFileSync(filename, 'utf8');
		}
		catch (e) { 
			var ll = {
				uri: id,
				name: name,
				description: 'Not Available'
			};
			if (L.tag)
				ll.tag = L.tag;
			layerTags.push(ll);
			continue; 
		}

		var kmlSize = r.length;

		if (kmlSize > maxKMLSize) {
			console.error('Too large', id, name);
			var ll = {
				uri: id,
				name: name,
				description: 'Not Available'
			};
			if (L.tag)
				ll.tag = L.tag;
			layerTags.push(ll);
			continue;
		}

		//console.log('Converting ' + id);

		console.error('Converting', id, name);
		ll.geoJSON = '/geo/data/' + id + '.geojson';

		layerTags.push(ll);

		var finished = join.add();
		(function (layerid){

			parser.parseString(r, function (err, result) {
				if (err) {
					console.error(id,err);
				}
				else if (result) {
					var g = kml2geojson(layerid, result);
				}

				finished();

				/*if (_.keys(completed) == 0) {
					writeOntology();
				}*/

				/*
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
				}*/

			});
		})(id);

	}
}

join.then(writeOntology);


function writeOntology() {
	console.log('Writing ontology..',layerTags.length,' tags');

	var ontology = {
		tags: layerTags,
		properties: []
	};
	fs.writeFileSync('../layers.json', JSON.stringify(ontology));

	console.log('Dependent KMLs to Download: ', dependentKML.length);
}
