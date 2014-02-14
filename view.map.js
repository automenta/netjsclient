var MAP_MAX_ITEMS = 500;

var currentMapNow = null;

function getProxyURL(u) {
    return '/http/' + encodeURIComponent(u);
}

function renderMapMarker(x, createMarkerFunction) {
	if (!currentMapNow) {
		console.err('set currentMapNow before calling renderMapMarker');
		return;
	}

    var s = objSpacePoint(x);
	if (!s) return;
    var fill = {
		r: 0.75,
		g: 0.75,
		b: 0.75
	};

    var op = 0.5;
    var rad = null;
    var iconURL = undefined;
    
    var ww = x.modifiedAt || x.createdAt || null;
    if (ww) {
        op = 0.25 + 0.5 * Math.exp( -((currentMapNow - ww) / 1000.0 / 48.0 / 60.0 / 60.0) );
    }

    iconURL = getTagIcon(x);
	if (!iconURL)
		iconURL = defaultIcons['unknown'];
    
    var tagStyling = {
        'Earthquake' : function() {
            var mag = objFirstValue(x,'eqMagnitude',1);
            rad = 100000 + (mag - 4.0)*700000;
            op *= 0.5;                    
            //fill = '#b33';
			fill.r = 256;
			fill.g = 75;
			fill.b = 0;
        },
        'NuclearFacility' : function() {
            rad = 7000;
            op = 0.3;
            //fill = '#ff0';                    
        },
        'Human' : function() {
            rad = 200;
            op = 0.25;                    
        },
        'Message' : function() {
            //fill = '#55f';
            rad = 50;                    
        },
        'GoalCentroid' : function() {
            rad = 200;
            op = 0.3;
            //fill = '#fa3';                    
        },
        'Item' : function() {
            rad = 50;
            op = 0.2;
            //fill = '#3af';                    
        },          
    };


    var tags = objTags(x);
    for (var i = 0; i < tags.length; i++) {
        var tt = tags[i];
        if (tagStyling[tt])
            tagStyling[tt]();
    }
    
    createMarkerFunction(x.id, s.lat, s.lon, rad, op, fill, iconURL);
}



function getKMLLayer(kmlurl) {
    //use an layer cache with explicit expiration,
    //so that when this function gets here again, it doesn't need to re-fetch unless its past the explicit expiration
    //if (!window.kmlLayer) window.kmlLayer = { };
    
    //var kml = window.kmlLayer[kmlurl];
    //if (!kml) {
        var kml =new OpenLayers.Protocol.HTTP({
            //url: getProxyURL(kmlurl),
            url: kmlurl,
            format: new OpenLayers.Format.KML({
                extractStyles: true,
                extractAttributes: true,
                maxDepth: 0,
            })            
        });
        
//        window.kmlLayer[kmlurl] = kml;
//    }
    
    return new OpenLayers.Layer.Vector("KML", {
        strategies: [new OpenLayers.Strategy.Fixed()],
        protocol: kml
    });
}

var map2d = true;

function renderMap(s, o, v) {
    var mm = { };
    
    var typeSelect;
    
    function updateMap() {
        v.empty();

        if (typeSelect)
            map2d = (typeSelect.val() === '2D');
        else
            map2d = configuration.defaultMapMode2D;

        var mapControl = newDiv();
        typeSelect = $('<select/>');
        typeSelect.append('<option ' + (map2d ? 'selected' : '') + '>2D</option>');
        typeSelect.append('<option ' + (!map2d ? 'selected' : '') + '>3D</option>');
        typeSelect.change(function(x) {
            later(function() {
               updateMap();            
            });
        });

        var planetSelect = $('<select/>');
        planetSelect.append('<option>Earth</option>');
        planetSelect.append('<option>Moon</option>');
        planetSelect.append('<option>Mars</option>');

		mapControl.append('<span class="readwrite">Right click to Add</span>');
        mapControl.append(typeSelect);
        mapControl.append(planetSelect);

        mapControl.addClass('MapControl');
        
        
        if (map2d) {
            /*var m = renderOLMap(s, o, v);
            mm.onChange = m.onChange;       
            mm.location = m.location;*/

            var m = renderLeafletMap(s, o, v);
			mm.onChange = m.onChange;
        }
        else {
			var m = renderCesiumMap(o, v);
			if (m.onChange)
				mm.onChange = m.onChange;
        }
        
        v.append(mapControl);
        
    }
    updateMap();
                
    return mm;
}

function renderLeafletMap(s, o, v) {
    var e = uuid();
	var mapdiv = $('<div style="width: 100%; height: 100%"/>').attr('id', e).appendTo(v);

	var tooltip = $('<div class="lltooltip"/>');
	tooltip.appendTo(mapdiv);
	tooltip.hide();

	var map = L.map(e).setView( configuration.mapDefaultLocation || [0,0], 11);

	/*L.tileLayer('http://{s}.tile.cloudmade.com/{key}/22677/256/{z}/{x}/{y}.png', {
		attribution: 'Map data &copy; 2011 OpenStreetMap contributors, Imagery &copy; 2012 CloudMade',
		key: 'BC9A493B41014CAABB98F0471D759707'
	}).addTo(map);*/

	//http://leaflet-extras.github.io/leaflet-providers/preview/index.htmlfile
	var OpenStreetMap_HOT = L.tileLayer('http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Tiles courtesy of <a href="http://hot.openstreetmap.org/" target="_blank">Humanitarian OpenStreetMap Team</a>'
	});
	OpenStreetMap_HOT.addTo(map);
	

	var testIcon = L.icon({
		iconUrl: 'icon/emoticon/happy.svg',
		iconSize: [32, 37],
		iconAnchor: [16, 37],
		popupAnchor: [0, -28]
	});

	function onEachFeature(feature, layer) {
		var popupContent = "";

		if (feature.properties) {
			var name = feature.properties.name || '';
			var desc = feature.properties.description || '';

			popupContent = '<b>' + name + '</b><br/>' + desc;
		}

		layer.bindPopup(popupContent);
	}

	map.layers = { };

	function addLayer(tag, strength, onAdded) {
		var T = $N.getTag(tag);

		if (T.geoJSON) {
			$.getJSON(T.geoJSON, function(x) {
				var g = L.geoJson(x, {

					/*style: function (feature) {
						return feature.properties && feature.properties.style;
					},*/

					onEachFeature: onEachFeature,

					pointToLayer: function (feature, latlng) {
						/*var m = L.circleMarker(latlng, {
							radius: 8,
							fillColor: "#ff7800",
							color: "#000",
							weight: 1,
							opacity: 1,
							fillOpacity: 0.8
						});*/

						var m = L.marker(latlng, {
							icon: testIcon
						});

						if (feature.properties) {
							var name = feature.properties.name;							
							if (name) {
								m.on('mouseover', function(e) {
									later(function() {
										tooltip.css('left', e.originalEvent.clientX);
										tooltip.css('top', e.originalEvent.clientY);

										tooltip.html(name.substring(0, 40));
										tooltip.show();
									});
								});
								m.on('mouseout', function(e) {
									later(function() {
										tooltip.hide();
									});
								});
							}
						}

						return m;
					}
				});

				g.baseAdd = g.onAdd;
				g.baseRemove = g.onRemove;
				g.imageOverlays = [];

				g.onAdd = function(map) {
					var result = g.baseAdd(map);
					if (x.overlays) {
						for (var i = 0; i < x.overlays.length; i++) {
							var O = x.overlays[i];
							var iconurl = O.geometry.icon;
							var latlonbox = O.geometry.latlonbox;  //n,e,s,w
							var rotate = O.geometry.rotate;

							var io = L.imageOverlay(iconurl, [ [ latlonbox[2], latlonbox[3] ], [ latlonbox[0], latlonbox[1] ] ]);
							g.imageOverlays.push(io);
							io.addTo(map);
						}
					}
					return result;
				};
				g.onRemove = function(map) {
					var result = g.baseRemove(map);
					for (var i = 0; i < g.imageOverlays.length; i++)
						map.removeLayer(g.imageOverlays[i]);
					return result;
				};

				g.addTo(map);
				onAdded(g);
			});


		}
		else if (T.tileLayer) {
			var tl = L.tileLayer(T.tileLayer, {
				attribution: ''
			});
			tl.setOpacity(strength);
			tl.addTo(map);
			onAdded(tl);
		}
		else {
		}

		return null;
	}

	function removeLayer(S) {
		var rm = map.layers[S];
		if (rm) {
			map.removeLayer(rm);
		}
		delete map.layers[S];			
	}

	function updateMap() {
		var newLayersArray = $N.get('focus').value;

		if (!newLayersArray) newLayersArray = [ ];

		var newlayers = { };

		for (var i = 0; i < newLayersArray.length; i++) {
			var A = newLayersArray[i];
			newlayers[A.id] = A.strength;
		}

		var subtracting = _.difference( _.keys(map.layers), _.keys(newlayers) );
		var adding = _.difference( _.keys(newlayers), _.keys(map.layers) );
		var same = _.union( _.keys(newlayers), _.keys(map.layers) );

		for (var i = 0; i < subtracting.length; i++) {
			var S = subtracting[i];
			removeLayer(S);
		}
		for (var i = 0; i < adding.length; i++) {
			var A = adding[i];
			addLayer(A, newlayers[A], function(added) {
				map.layers[A] = added;
			});			
		}

		//update opacities
		for (var i = 0; i < same.length; i++) {
			var S = same[i];
			var SL = map.layers[S];
			if (SL) {
				if (SL.setOpacity)
					SL.setOpacity(newlayers[S]);
				//TODO setZIndex(..)
			}
		}

	}

	updateMap();

	map.onChange = function() {
	    updateMap();
	};

	return map;
}

function renderOLMap(s, o, v) {
    
    var e = uuid();
    $('<div style="width: 100%; height: 100%"/>').attr('id', e).appendTo(v);
            
    var target = e;
    var location = objSpacePointLatLng(s.myself());

    if (!location)  {
		//swap lat,lng
        location = configuration.mapDefaultLocation || [0,0];
	}
    
    var fromProjection = new OpenLayers.Projection("EPSG:4326"); // Transform from WGS 1984
    var toProjection = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection


    var m = new OpenLayers.Map({
        div: target,
        projection: fromProjection,
        displayProjection: toProjection
        //numZoomLevels: 12
    });


	document.getElementById(e).oncontextmenu = function(e){
	 e = e?e:window.event;
	 if (e.preventDefault) e.preventDefault(); // For non-IE browsers.
	 else return false; // For IE browsers.
	};

    
    
    var mapnik = new OpenLayers.Layer.OSM();
    var aerial = new OpenLayers.Layer.OSM("Open Aerial", ["http://otile1.mqcdn.com/tiles/1.0.0/sat/${z}/${x}/${y}.jpg",
                        "http://otile2.mqcdn.com/tiles/1.0.0/sat/${z}/${x}/${y}.jpg",
                        "http://otile3.mqcdn.com/tiles/1.0.0/sat/${z}/${x}/${y}.jpg",
                        "http://otile4.mqcdn.com/tiles/1.0.0/sat/${z}/${x}/${y}.jpg"]);


    var vector = new OpenLayers.Layer.Vector("Vectors", {
	});
    /*var markers =  new OpenLayers.Layer.Markers( "Markers",{
	} );*/
    
    m.vector = vector;
    
    m.addLayers([
        mapnik, aerial, vector //, gphy, gmap, gsat, ghyb, /*veroad, veaer, vehyb,*/ 
    ]);

	var oClick = new OpenLayers.Control.Click({eventMethods:{
	 'rightclick': function(e) {
		//		  alert('rightclick at '+e.xy.x+','+e.xy.y);
		var pixel = new OpenLayers.Pixel(e.xy.x,e.xy.y);
		var lonlat = unproject(m.getLonLatFromPixel(pixel));
		var n = objAddGeoLocation(objNew(), lonlat.lat, lonlat.lon);

		$.pnotify( { title: 'New Object', text: ('@ ' + _n(lonlat.lat) + ',' + _n(lonlat.lon)) } );
		newPopupObjectEdit( n );
		
	    //alert("Lat: " + lonlat.lat + " (Pixel.x:" + pixel.x + ")" + "\n" + "Lon: " + lonlat.lon + " (Pixel.y:" + pixel.y + ")" );
	 },

	 /*'dblclick': function(e) {
	  alert('dblclick at '+e.xy.x+','+e.xy.y);
	 },*/

	 'click': function(e) {
		//alert('click at '+e.xy.x+','+e.xy.y);
		//http://dev.openlayers.org/docs/files/OpenLayers/Feature/Vector-js.html#OpenLayers.Feature.Vector.atPoint
		// to select all coincident map icons on click
		var dx = 10;
		var dy = 10;
		var pixel = new OpenLayers.Pixel(e.xy.x,e.xy.y);
		var lonlat = m.getLonLatFromPixel(pixel);
		var dlonlat = m.getLonLatFromPixel(new OpenLayers.Pixel(e.xy.x+dx,e.xy.y+dy));
		var dlonlat = Math.max(Math.abs(lonlat.lon-dlonlat.lon), Math.abs(lonlat.lat-dlonlat.lat));
		//console.log(dlonlat);
		var f = vector.features;
		var clicked = [];
		for (var i = 0; i < f.length; i++) {
			var F = f[i];
			if (F.onScreen(true)) {
				if (F.atPoint(lonlat,dlonlat,dlonlat)) {
					if (F.uri)
						clicked.push(F.uri);
				}
			}
		}
		clicked = _.unique(clicked);
		newPopupObjectViews(clicked);
	 },
	/*
	 'dblrightclick': function(e) {
	  alert('dblrightclick at '+e.xy.x+','+e.xy.y);
	 }*/
	}});
	m.addControl(oClick);
	oClick.activate();

    
    function saveBounds() {
        /*later(function() {
            s.set('mapExtent', m.getExtent());            
        });*/
    }
    
    //m.events.register("moveend", m, saveBounds);
    //m.events.register("zoomend", m, saveBounds);
    
    var exm = s.get('mapExtent');
    if (exm) {
        //m.zoomToExtent(exm, true);
        m.zoomToMaxExtent();
    }
    else {
        var hh = project(new OpenLayers.LonLat(location[1], location[0]));    
        center(hh);
    }
    
    m.targetLocation = m.getCenter();

    m.addControl( new OpenLayers.Control.LayerSwitcher() );

    var select;

    
	/*
    vector.events.on({
        featureselected: function(event) {
            var feature = event.feature;
            var area = feature.geometry.getArea();
            var id = feature.attributes.key;
            //var output = "Item: " + id;// + " Area: " + area.toFixed(2);
            //console.log(feature, area, id, output);
            newPopupObjectView(feature.uri);
            //document.getElementById("output-id").innerHTML = output;

        }
    });
	*/
    
/*
    var df = new OpenLayers.Control.DragFeature(vector);
    m.addControl(df);
    df.activate();*/

    function center(oll) {
        m.setCenter(oll, 12, false, true);        
    }

    
    function unproject(x) {
        x.transform(toProjection, fromProjection);
        return x;
    }
    function project(x) {
        x.transform(fromProjection, toProjection);
        return x;
    }

    function createMarker(uri, lat, lon, rad, opacity, fill, iconURL) {
        var p = project(new OpenLayers.LonLat(lon, lat));
        var t = new OpenLayers.Geometry.Point(p.lon, p.lat /*location[1],location[0]*/);
        

		if (rad) {
			function fillString(f) {
				return 'rgb(' + (f.r * 256.0) + ', ' + (f.g * 256.0) + ', ' + (f.b * 256.0) + ')';
			}
			var style = {
			    fillColor: fillString(fill),
			    //strokeColor: '#fff',
			    fillOpacity: opacity,
			    //strokeOpacity: opacity,
			    strokeWidth: 0,
			    //view-source:http://openlayers.org/dev/examples/vector-features-with-text.html
		    };
		    var radMarker = new OpenLayers.Feature.Vector(
				OpenLayers.Geometry.Polygon.createRegularPolygon(
				t,
				rad,
				6,
				0), {}, style);
		    radMarker.uri = uri;
		    m.vector.addFeatures([radMarker]);
		}

        if (iconURL) {
			var style = {
				graphicWidth: 32,
				graphicHeight: 32,
				externalGraphic: iconURL
			}
		    var iconMarker = new OpenLayers.Feature.Vector(
				t /*OpenLayers.Geometry.Polygon.createRegularPolygon(
				t,
				rad,
				6,
				0)*/, {}, style);
		    iconMarker.uri = uri;
		    m.vector.addFeatures([iconMarker]);
        }

    }

    m.location = function() {
        return unproject(m.getCenter());  
    };
    
    // Register the function for the animatio
    /*var interval = window.setInterval(function(){
        animate(tg);
    },150);*/
    
    var isVisible = function() {
        return $('#' + e).is(':visible');
    };
    
    var animate = function(feature) {
        feature.data.size += 1;
    
        var x = feature.data.size;
        
        /*feature.style = {
            pointRadius: Math.random()*10.0, //feature.data.size,  // I will change only the size of the feature
            fillColor: "#ffcc66",
            fillOpacity: Math.sin(x/10.0),
            strokeColor: "#ff9933",
            strokeWidth: Math.random()*10.0,
            graphicZIndex: 1
        };*/
        
        feature.style.strokeWidth = Math.random()*10.0; 
        
    
       feature.layer.redraw();
    
        if (!isVisible()) {
            window.clearInterval(interval);
        }
    };

    var kmllayers = [];
    
    function addKMLLayer(url) {
        
        var kml = getKMLLayer(url);
        m.addLayer(kml);      
        
        kmllayers.push(kml);
        
        
        kml.events.on({
            featureselected: function(event) {
                var feature = event.feature;
                var area = feature.geometry.getArea();
                var id = feature.attributes.key;                
                
                newPopupObjectView({
                    uri: uuid(),
                    name: feature.attributes.name,
                    text: feature.attributes.description
                });
              //feature.geometry.getBounds().getCenterLonLat(),
              //'<div class="markerContent">'+feature.attributes.description+'</div>',
            }
        });
        
        return kml;
    }
    
    
    function renderMapFeature(x, r) {
        var k = x.id;
        
        if (objHasTag(x, 'web.KML')) {
            addKMLLayer(x.kmlURL);
            return;    
        }

		renderMapMarker(x, createMarker);

    }
    
    function updateMap() {
        if (select) {
            select.deactivate();
            m.removeControl(select);
            select.destroy();
        }

        m.vector.removeAllFeatures();
        
        for (var i = 0; i < kmllayers.length; i++) {
            kmllayers[i].destroy();
        }
        kmllayers = [];
        
        var ollayers  = [vector];
                         
        var layer = s.layer();                
        if (layer.kml) {
            for (var i = 0; i < layer.kml.length; i++) {
                var l = addKMLLayer(layer.kml[i]);                
                ollayers.push(l);
            }
        }

	    currentMapNow = Date.now();        
        
        renderItems(o, v, MAP_MAX_ITEMS, function(s, v, xxrr) {
            for (var i = 0; i < xxrr.length; i++) {
                var x = xxrr[i][0];
                var r = xxrr[i][1];
                renderMapFeature(x, r);
            }        
        });
        
        /*select = new OpenLayers.Control.SelectFeature(ollayers, {
            toggle: true,
            clickout: true
        });
        m.addControl(select);    
        select.activate();*/

		m.onChange = function() {
		    updateMap();
		};
    }

    updateMap();    
    
    return m;
}

// A control class for capturing click events...
OpenLayers.Control.Click = OpenLayers.Class(OpenLayers.Control, {                

defaultHandlerOptions: {
'single': true,
'double': true,
'pixelTolerance': 0,
'stopSingle': false,
'stopDouble': false
},
handleRightClicks:true,
initialize: function(options) {
this.handlerOptions = OpenLayers.Util.extend(
{}, this.defaultHandlerOptions
);
OpenLayers.Control.prototype.initialize.apply(
this, arguments
); 
this.handler = new OpenLayers.Handler.Click(
this, this.eventMethods, this.handlerOptions
);
},
CLASS_NAME: "OpenLayers.Control.Click"

});
