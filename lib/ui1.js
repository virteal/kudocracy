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

  var c9 = env.C9_HOSTNAME;  // Cloud9 IDE
  
  if( c9 ){
    node_env = "development";
    console.log( "Development on", c9 );
    // Hum... since december 3 2014 this is not true, c9 bug I guess
    if( c9 === "kudocracy-jhr.c9.io" ){
      // Dec 22 2014, this works ok. Both are ok in fact
      // c9 = "kudocracy-c9-jhr.c9.io";
    }
  }
  
  var domain = env.KUDOCRACY_DOMAIN;
  var firebase = env.KUDOCRACY_FIREBASE;
  var port = env.KUDOCRACY_PORT || env.PORT || "8080";
  var host = env.KUDOCRACY_HOST || c9;
  
  var node_env = env.NODE_ENV || "development";

  var ui1_server = ui1_core.start( kudo_scope, port, host );
  var config = ui1_server.get_config();
  
  // Set dev_mode according to config and env variables
  var dev_mode = config.dev_mode;
  if( node_env === "production" ){
    dev_mode = false;
  }
  if( node_env === "development" ){
    dev_mode = true;
    // Also use the development version of simpliwiki
    if( c9 ){
      config.wiki = "http://simpli-jhr.c9.io/";
    }
  }
  config.dev_mode = dev_mode;
  
  if( domain ){
    config.domain = domain;
  }
  
  if( firebase ){
    config.firebase = firebase;
  }
  
  var Session = kudo_scope.Session;

  // Load the browserified client side engine
  var fs = require( "fs" );
  var browserified_pathname;
  var browserified;
  if( dev_mode || c9 ){
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
    // Convenient
    if( !res.request  ){ res.request = req;  }
    if( !req.response ){ req.response = res; }
    // Get sessions. Also check integrity
    var express_session = req.session;
    var kudo_session    = req.kudo_session;
    if( kudo_session && express_session ){
      if( kudo_session.express_session !== express_session ){
        console.log( "BUG? session mismatch, kudo side" );
      }
      if( Session.find_by_id( express_session.id ) !== kudo_session ){
        console.log( "BUG? session mismatch, express side" );
      }
      express_session.kudo_session = kudo_session;
    }else if( express_session ){
      req.kudo_session = kudo_session = Session.find_for_request( req );
    }
    if( express_session ){
      // console.log( "express session", express_session.id );
    }else{
      console.log( "no express session" );
    }
    if( kudo_session ){
      kudo_session.request  = req;
      kudo_session.response = res;
      // console.log( "kudo session", kudo_session.id );
    }else{
      console.log( "no kudo session" );
    }
    if( kudo_session && express_session ){
      if( kudo_session.express_session !== express_session ){
        console.log( "BUG? still session mismatch, kudo side" );
      }
      if( Session.find_by_id( express_session.id ) !== kudo_session ){
        console.log( "BUG? still session mismatch, express side" );
      }
    }
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
    
    // Fill the .age of the request, when available
    var idx = url.indexOf( "time=" );
    if( idx !== -1 ){
      var time_str = url.substring( idx + "time=".length );
      var time = parseInt( time_str, 10 );
      var age = (new Date()).getTime() - time;
      req.age = age;
      // If there is a kudo session, check to detect old request
      if( req.kudo_session
      && req.kudo_session.time_mark > time
      ){
        // The url used to issue the request is older that the last one used
        var how_old = req.kudo_session.time_mark - time;
        console.log( "Older. ?Reject 410 for", url, "age late:", how_old );
        if( false ){ // ToDo: This code does work well, it fires offline mode
          res.status( 410, "Old" ).send();
          return true;
        }
      }  
      if( !req.kudo_session ){
        // Humm, some caching proxy (or offline appcache) do not honor
        // "no-store" cache controls.
        var fresh_url = url.substring( 0, idx - 1 );
        console.log( "No kudo_session, refresh, ", fresh_url );
        res.type( "text/html" ).send(
          '<script>console.log("refresh at", "' + fresh_url + '"); '
          + 'window.kudo_new_location="' + fresh_url + '"; '
          + 'window.location.replace("' + fresh_url + '");</script>'
        );
        // console.log( "Out of session. Reject 410 for", url );
        // res.status( 410, "Out of session" ).send();
        return true;
      }
      // Only ?page= urls can be bookmarked, ie get old 
      if( url.indexOf( "?page=") === -1 ){
        console.log( "Bad bookmark. Reject 410 for", url );
        res.status( 410, "Bad bookmark" ).send(); // 410 - Gone
        return true;
      }
    // When no &time in request, assume it's a bookmarked page
    }else{
    }

    // Direct kudocracy requests to the ui server (in ui1core.js)
    ui1_server( req, res );
    return true;
    
  }
  
  function kudocracy_middleware( req, res, next ){
    if( handler( req, res ) )return;
    next();
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
    
    if( config.dev_mode ){
      app.use( function( req, res, next ){
        console.log( "Serving", req.url );
        next();
      });
    }
    
    // Serve some special files
    var manifest_unique_signature = "0." + kudo_scope.l8.now;
    app.use( function( req, res, next ){
      var url = req.url;
      var buf = [];
      // console.log( "serving ", url );
      
      // Filter out favicon.ico
      if( url === "/favicon.ico" ){
        res.status( 404 ).send();
        return;
      }
      
      // Enable robots.txt on whole site. ToDo: more filtering?
      if( url === "/robots.txt" ){
        res.type( "text/plain" );
        res.status( 200 ).send( "User-agent: *\n" );
        return;
      }
      
      // Offline mode manifest
      if( url === "/manifest.appcache" ){
        buf.push(
          "CACHE MANIFEST",
          "# Version " + manifest_unique_signature,
          "CACHE:",
          config.style,
          config.index_style,
          "/?page=offline&i2=%23offline", // store resources for all pages
          "/browserified.js",
          "/modernizr.min.js",
          config.shortcut_icon,
          // "/favicon.ico",
          // "SETTINGS:",
          // "prefer-online",
          "FALLBACK:",
          "/ /offline",
          "NETWORK:",
          "*",
          "" // final \n
        );
        res.writeHead( 200, {
          'Content-Type': 'text/cache-manifest',
          'Cache-Control': 'no-cache, must-revalidate',
          'Expire:': '0'
        });
        res.end( buf.join( "\n" ) );
        return;
      }
      
      // "offline" pseudo page, for appcache manifest style offline solution
      if( url === "/offline" ){
        buf.push(
          '<html><head><title>Offline Kudocracy</title>',
          '\n<meta charset="utf-8">',
          '\n<meta http-equiv="X-UA-Compatible" content="IE=edge">',
          '\n<meta name="viewport" content="',
           'width=device-width, initial-scale=1, maximum-scale=1.0, ',
           'user-scalable=yes, minimal-ui">',
          '\n<link rel="icon" href="', config.shortcut_icon, '" type="image/png">',
          '\n<link rel="stylesheet" href="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.1/css/bootstrap.min.css">',
          '\n<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.1/css/bootstrap-theme.min.css">',
          '\n<link rel="stylesheet" href="', config.style, '>',
          '</head><body>',
          '\n</head><body><br><br><br><br><h1>Loading...</h1>',
          '\n<script src="http://code.jquery.com/jquery-2.1.1.min.js"></script>',
          '\n<script src="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.1/js/bootstrap.min.js"></script>',
          '\n<script src="http://platform.twitter.com/widgets.js"></script>',
          // ToDo: google dynamic loader interferes with my own
          // '\n<script type="text/javascript" src="https://www.google.com/jsapi"></script>',
          '\n<script>',
          '\nwindow.kudo_offline_loader = true;',
          '\nwindow.kudo_offline_confirmed = false;',
          '\n</script>',
          '\n<script type="text/javascript" src="/browserified.js"></script>',
          '</body>'
        );
        res.writeHead( 200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Expire:': '0'
        });
        res.end( buf.join( "" ) );
        return;
      }
      
      // csp_report is for report about XSS attacks & Content-Security-Policy
      if( url === "/csp_report" && req.method === "POST" ){
        req.on( "data", function( data ){
          console.warn( "CSP REPORT!!! " + data );
          req.connection.destroy();
        });
        return false;
      }
      next();
    });
    
    // Serve files from public directory. ToDo: some maxAge caching
    // Note: it does no caching. In production it is better to serve
    // that public directory using a reverse proxy cache like Varnish
    // or nginx.
    app.use( "/public", express.static(
      kudo_dir + "/public", { maxAge: 24 * 3600 * 1000 }
    ) );
    
    // Ping style, just for tests
    app.get( '/hello', function( req, res ){
      res.send( 'Hello World!' );
    });
    
     // Alpha version sometimes does not work well, remote reboot solution
    app.get( '/exit1', function( req, res ){
      res.send( 'Exit 1  in 1 second' );
      setTimeout( function(){
        console.log( "exit(1), http initiated" );
        process.exit( 1 );
      }, 1000 );
    });
   
    // At this point I parse cookies myself, this may change
    // app.use( require( "cookie-parser" )() );
    // I do use a session cookie
    app.use( session({
      name: "kudocracy_sid",
      secret: "public",
      saveUninitialized: true,
      resave: true
    }));
    
    // Ask kudocracy
    app.use( kudocracy_middleware );
    
    // Some basic error handling
    app.use( function( err, req, res, next ){
      console.error( err.stack );
      res.status( 500 ).send( "Something broke!" );
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
  
  // Start the Twitter based UI
  var ui1twit = require( "./ui1twit.js" );
  ui1twit.start( ui1_server );
  
  // http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );

}

process.on( "uncaughtException", function( err ){
  // This happens right now due to Twit npm module error 401 on bad credentials
  console.log( "BUG? Uncaught exception: " + err, err.stack );
});

kudocracy.start( start_http_server );
