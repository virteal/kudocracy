//  ui1.js
//    First UI for Kudocracy, test/debug UI, HTTP based
//
// Jun 11 2014 by @jhr, extracted from main.js

"use strict";


// Hack to get sync traces && http REPL outputs
if( true ){ // true || de ){
  var fs = require( 'fs' );
  var old = process.stdout.write;
  process.stdout.write = function( d ){
    fs.appendFileSync( "./trace.out", d );
    //print( d );
    return old.apply( this, arguments );
  };
}


var kudocracy = require( "./main.js" );
var kudo_dir = kudocracy.module.filename.replace( "/lib/main.js", "" );


function start_http_server( kudo_scope ){

  var ui1_core = require( "./ui1core.js" );

  var env = process.env;
  
  var port = env.KUDOCRACY_PORT || env.PORT || "8080";
  var host = env.KUDOCRACY_HOST || env.C9_HOSTNAME;
  var node_env = env.NODE_ENV || "development";
  
  if( env.C9_HOSTNAME ){
    node_env = "development";
  }
  
  var dev_mode = node_env !== "production";

  var ui1_server = ui1_core.start( kudo_scope, port, host );

  // Load the browserified client side engine
  var fs = require( "fs" );
  var browserified_pathname
  var browserified;
  if( dev_mode ){
    browserified = fs.readFileSync( 
      browserified_pathname = kudo_dir + "/browserified.js",
      "utf8"
    );
  }else{
    browserified = fs.readFileSync(
      browserified_pathname = kudo_dir + "/browserified.min.js.gz"
    );
  }

  function handler( req, res ){
    var url = req.url;
    if( url.indexOf( "browserified" ) !== -1 ){
      if( !with_koa ){
        // ToDo: some caching
        res.sendFile(
          browserified_pathname,
          { headers:{
            "Content-Type": "application/javascript",
            "Content-Encoding": dev_mode ? "identity" : "gzip"
          } },
          function( err ){
            if( !err )return;
            if( err.code !== "ECONNABORT" ){
              console.log( "sendFile error", err, err.stack );
              res.status( err.status ).end();
            }
          }
        );
      }else{
        res.writeHead( 200, {
          "Content-Type": "application/javascript",
          "Content-Encoding": dev_mode ? "identity" : "gzip",
          "Cache-Control": "public, max-age=3600" // one hour 
        } );
        res.end( browserified );
      }
      return true;
    }
    // Direct kudocracy requests to the ui server
    if( true
    ||  url[1] === "?" // xxxx/?page= or xxx/?i= style
    ||  url === "/"    // index page or POST requests
    ||  url.substring( 0, 4 ) === "/csv"
    ||  url.substring( 0, 5 ) === "/api/"
    ){
      ui1_server( req, res );
      return true;
    }
    // Not handled
    return false;
  }

  var app;
  var with_koa = true;
  
  if( with_koa ){
    console.log( "No Koa yet" );
    with_koa = false;
  }

  if( with_koa ){
    // Koa uses javascript's generators, not yet standard
    throw new Error( "No Koa at the moment" );
    app = require( "koa" )();
    /*
    app.use( function*( next ){
      if( handler( this.req, this.res ) ){
        this.respond = false;
        return;
      }
      yield *next;
    });
    */
  }else{
    
    var express = require( "express" );
    var session = require( "express-session" );
    app = express();
    
    // Enable robots.txt on whole site. ToDo: more filtering?
    app.use( function( req, res, next ){
      if( "/robots.txt" === req.url ){
        res.type( "text/plain" );
        res.status( 200 ).send( "User-agent: *\n" );
      }else{
        next();
      }
    });
    
    // Offline mode
    app.use( function( req, res, next ){
      if( "/manifest.appcache" !== req.url ){
        next();
        return;
      }
      var config = ui1_core.get_config();
      var buf = [];
      buf.push(
        "CACHE MANIFEST",
        "# Version 0",
        "CACHE:",
        config.index_style,
        config.style,
        "/browserified.js",
        config.shortcut_icon,
        "FALLBACK:",
        "",
        "NETWORK:",
        "*"
      );
      res.writeHead( 200, {
        'Content-Type': 'text/cache-manifest',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Expire:': '0'
      });
      res.end( buf.join( "\n" ) );
    });
    
    app.use( session({
      name: "kudocracy_sid",
      secret: "public",
      saveUninitialized: true,
      resave: true
    }));
    
    // At this point I parse cookies myself, this may change
    // app.use( require( "cookie-parser" )() );
    
    // Serve files from public directory. ToDo: some maxAge caching
    // Note: it does no caching. In production it is better to serve
    // that public directory using a reverse proxy cache like Varnish
    // or nginx.
    app.use( "/public", express.static( kudo_dir + "/public" ) );
    
    // Ping style, just for tests
    app.get( '/hello', function( req, res ){
      res.send( 'Hello World!' );
    });
    
    // Ask kudocracy's handler
    app.use( function( req, res, next ){
      if( handler( req, res ) )return;
      next();
    } );
    
    
    app.use( function( err, req, res, next ){
     console.error( err.stack );
     res.send( 500, 'Something broke!' );
     debugger;
    });
  }
  
  var http = require( "http" );
  console.log( "Starting http server on port " + port );
  console.log( dev_mode ? "DEVELOPMENT MODE" : "production mode" );
  console.log( "kudocracy directory", kudo_dir );
  console.log( "lib sub directory (__dirname)", __dirname );  
  http.createServer( with_koa ? app.callback() : app ).listen( port );

  ui1_server.Session.start_change_dispatcher();
  
  // http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );

}

kudocracy.start( start_http_server );
