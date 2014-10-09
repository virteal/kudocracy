#!/bin/bash
echo Kudocracy build script
echo browserify
browserify lib/ui1client.js -o browserified.js
ls -l browserified.js
echo uglify
uglifyjs browserified.js -o browserified.min.js
ls -l browserified.min.js
echo gzip
gzip -f browserified.min.js
ls -l browserified.min.js.gz
echo build done, ok
