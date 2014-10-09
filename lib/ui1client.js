//  ui1client.js
//    First UI for Kudocracy, test/debug UI, when running client side
//
// Sep 25 2014 by @jhr

"use strict";


function start_local_repl( kudo_scope ){

  // Export global Ephemeral to deal with Ephemeral changes
  window.Ephemeral = kudo_scope.Ephemeral;
  
  var ui1_server = require( "./ui1core.js" );

  // Export global UI server that can process UI changes
  window.ui1_server = ui1_server.start(
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
