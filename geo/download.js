var togeojson = require('./togeojson.js');
var layers = require('./cvlayers.js').layers;
var _ = require('underscore');
var exec = require('child_process').exec;

var layersToDownload = [];

_.each(layers, function(L) {
	var id = L.layer;
	if (!id) return;

	var kmlurl = L.kml;
	if (kmlurl.indexOf('http://')!=0) return;

	layersToDownload.push([id, kmlurl]);

});

function downloadNext() {
	var x = layersToDownload.pop();
	if (!x) return;

	var id = x[0];
	var kmlurl = x[1];

	if (kmlurl.indexOf('.kml')==kmlurl.length-4)
		ext = 'kml';	//safe to assume it's a kml
	else
		ext = 'kmz';

	var command = 'wget "' + kmlurl + '" -O cache/' + id + '.' + ext;
	console.log(command);

	var child = exec(command, function (error, stdout, stderr) {
		//console.log('stdout: ' + stdout);
		/*if (stderr)
			console.log('stderr: ' + stderr);*/
		if (error !== null)
		  	console.log('exec error: ' + error);

		if (ext == 'kmz') {
			//attempt extract
			var extractCommand = 'unzip -j cache/' + id + '.kmz -d cache/' + id;
			var extractChild = exec(extractCommand, function (error, stdout, stderr) {
				if (stderr) {
					//unsuccessfully extracted
					//console.log('extract stderr: ' + stderr);

					//rename to kml and remove the created subdirectory
					var renameCmd = 'mv cache/' + id + '.kmz cache/' + id + '.kml';
					var renameChild = exec(renameCmd, function (error, stdout, stderr) { 
						downloadNext(); 
					});					
				}
				else {
					//successfully extracted, move to cache root
					var mvCmd = 'mv cache/' + id + '/*.kml cache/' + id + '.kml';
					var mvCmd = exec(mvCmd, function (error, stdout, stderr) { 
						downloadNext(); 
					});
				}
			});
		}
		else {
			downloadNext();
		}
	});
}
downloadNext();
