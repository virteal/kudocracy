//  ui1client.js
//    First UI for Kudocracy, test/debug UI, when running client side
//
//  Sep 25 2014 by @jhr
//
//  watchify lib/ui1client.js -o browserified.js
//  The build.sh file builds a browserified.js file that requires this
//  file together with all the other files it depends on. When this
//  file is loaded, some code runs that calls the "main.js" start() function
//  and then injects changes into the ephemeral machine. That logic is
//  defined inside ui1core.js in function onload().
//
//  The client side basically redirects some HTTP requests to a local pseudo
//  HTTP server and then use the body of the response to update the DOM. The
//  pseudo HTTP server sends requests to the ui1 core in such a way that it
//  responds as the request was a genuine HTTP request coming from a remote
//  browser. In some rare case, the ui1 core adapts it's response based on
//  local or remote origin of the request.

"use strict";


function start_local_repl( kudo_scope ){

  // Export global Ephemeral to deal with Ephemeral changes
  window.Ephemeral = kudo_scope.Ephemeral;
  
  var ui1_core = require( "./ui1core.js" );

  // Export global UI server that can process UI changes
  window.ui1_server = ui1_core.start(
    kudo_scope,
    "local",
    document.location.hostname + document.location.pathname // no ?xxxxx
  );
  
  // Signal changes to server
  window.Ephemeral.Change.fluid.tap( function( change ){
    console.log( "Ephemeral change", change );
  });
  
  // ToDo: listen to changes coming from the http server
  console.log( "Kudocracy client side server is running" );

}

// Never init twice
if( !window.ui1_server ){
  require( "./main.js" ).start( start_local_repl );
}else{
  console.log( "BUG? duplicate load of ui1client.js" );
  debugger;
}