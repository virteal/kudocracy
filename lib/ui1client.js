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
  window.ui1_server
  = ui1_server.start( kudo_scope, "client-side", document.domain );
  
  // Export global Ephemeral to deal with Ephemeral changes
  window.Ephemeral = kudo_scope.Ephemeral;
  
  // ToDo: listen to changes coming from the http server
  console.log( "Kudocracy client side server is running" );

}

require( "./main.js" ).start( start_local_repl, "local" );
