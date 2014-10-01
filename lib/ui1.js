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

  var ui1_server = require( "./ui1core.js" );

  var port = process.env.PORT || process.env.KUDOCRACY_PORT || "8080";
  var host = process.env.C9_HOSTNAME || process.env.KUDOCRACY_URL;

  ui1_server.start( kudo_scope, port, host );

  var koa = require( "koa" );
  var app = koa();
  
  var browserified = require( "fs" ).readFileSync( "browserified.js", "utf8" );
  
  app.use( function*( next ){
    var url = this.req.url;
    if( url === "/?browserify" ){
      this.res.writeHead( 200, { "Content-Type": "application/javascript" } );
      this.res.end( browserified );
      this.respond = false;
      return;
    }
    // Direct kudocracy requests to the ui server
    if( url[1] === "?" // xxxx/?page= or xxx/?i= style
    ||  url === "/"    // index page or POST requests
    ){
      ui1_server.request( this.req, this.res );
      this.respond = false;
      return;
    }
    yield *next;
  } );

  var http = require( "http" );
  console.log( "Starting Koa http server on port " + port );
  http.createServer( app.callback() ).listen( port );
  
  // http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );

}

require( "./main.js" ).start( start_http_repl );
