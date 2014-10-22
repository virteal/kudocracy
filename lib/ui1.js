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


function start_http_repl( kudo_scope ){

  var ui1_core = require( "./ui1core.js" );

  var env = process.env;
  
  var port = env.KUDOCRACY_PORT || env.PORT || "8080";
  var host = env.KUDOCRACY_URL || env.C9_HOSTNAME;
  var node_env = env.NODE_ENV || "development";
  
  if( env.C9_HOSTNAME ){
    node_env = "development";
  }
  
  var dev_mode = node_env !== "production";

  var ui1_server = ui1_core.start( kudo_scope, port, host );

  var koa = require( "koa" );
  var app = koa();
  
  var fs = require( "fs" );
  var browserified;
  if( dev_mode ){
    browserified = fs.readFileSync( "browserified.js", "utf8" );
  }else{
    browserified = fs.readFileSync( "browserified.min.js.gz" );
  }
  
  app.use( function*( next ){
    var url = this.req.url;
    if( url.indexOf( "browserified" ) !== -1 ){
      this.res.writeHead( 200, {
        "Content-Type": "application/javascript",
        "Content-Encoding": dev_mode ? "identity" : "gzip",
        "Cache-Control": "public, max-age=3600" // one hour 
      } );
      this.res.end( browserified );
      this.respond = false;
      return;
    }
    // Direct kudocracy requests to the ui server
    if( url[1] === "?" // xxxx/?page= or xxx/?i= style
    ||  url === "/"    // index page or POST requests
    ||  url.substring( 0, 4 ) === "/csv"
    ||  url.substring( 0, 4 ) === "/api"
    ){
      ui1_server( this.req, this.res );
      this.respond = false;
      return;
    }
    yield *next;
  } );

  var http = require( "http" );
  console.log( "Starting Koa http server on port " + port );
  console.log( dev_mode ? "DEVELOPMENT MODE" : "production mode" );
  http.createServer( app.callback() ).listen( port );
  
  ui1_server.Session.start_change_dispatcher();
  
  // http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );

}

require( "./main.js" ).start( start_http_repl );
