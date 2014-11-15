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

  console.log( "Starting the ui1 local server" );
  
  // Export global Ephemeral to deal with Ephemeral changes
  window.Ephemeral = kudo_scope.Ephemeral;
  window.l8        = kudo_scope.l8;
  
  var ui1_core = require( "./ui1core.js" );

  // Export global UI server that can process UI changes
  window.ui1_server = ui1_core.start(
    kudo_scope,
    "local",
    document.location.hostname + document.location.pathname // no ?xxxxx
  );
  
  if( !window.ui1_server ){
    console.error( "Could not start the ui1 local server" );
    return;
  }
  
  // ToDo: listen to changes coming from the http server
  // Typically by using trap directed polling, ie injecting a void action in
  // order to get pulled changes for the session
  console.log( "ToDo: start some websocket connection with server" );
  
  var pending_inject = false;
  var pending_index;
  var time_last_attempt = window.l8.update_now();
  var retry_delay = 10;
  
  function ajax_inject( type, parameters ){
    var ctx = window.kudo_ctx;
    var storage = ctx.local_storage;
    var $ = window.$;
    if( storage ){
      pending_inject = true;
    }
    time_last_attempt = window.l8.update_now();
    debugger;
    $.ajax({
      type: "POST",
      url: "/api/inject",
      contentType: "application/json; charset=utf-8",
      dataType: "json",
      processData: false,
      data: JSON.stringify( {
        inject: type,
        parameters: window.Ephemeral.json_encode( parameters ),
        changes: window.Ephemeral.Machine.current.changes.length
      } ),
      success: function( data ){
        console.log( "ajax worked" );
        retry_delay = 10;
        pending_inject = false;
        if( storage ){
          storage.setItem( "inject_done_count", "" + ( pending_index + 1 ) );
        }
        window.Ephemeral.restore( data );
        process_buffered_inject();
      },
      error: function( data ){
        console.log( "ajax error", data );
        debugger;
        // Exponential backoff, randomized to avoid excess when service is back
        retry_delay = retry_delay * ( 1.5 + Math.random() );
        if( retry_delay > 5 * 60 * 1000 ){
          retry_delay = 5 * 60 * 1000;
        }
        pending_inject = false;
        process_buffered_inject();
      }
    });
  }
  
  function process_buffered_inject(){
    // debugger;
    var storage = window.kudo_ctx.local_storage;
    if( !storage )return;
    if( pending_inject ){
      schedule_buffered_inject();
      return;
    }
    var done_count = storage.getItem( "inject_done_count" );
    if( !done_count ){
      done_count = 0;
    }else{
      done_count = parseInt( done_count, 10 );
    }
    var queue_len = storage.getItem( "inject_queue_length" );
    if( !queue_len )return;
    queue_len = parseInt( queue_len, 10 );
    if( done_count >= queue_len ){
      if( done_count > queue_len ){
        console.log( "BUG? more done than queued" );
        debugger;
      }
      return;
    }
    var item = storage.getItem( "inject_queue_" + done_count );
    item = JSON.parse( item );
    pending_index = done_count;
    // Don't inject changes that are too old
    var age = window.l8.now - item.time;
    if( age > 36 * 3600 * 1000 ){
      console.log( "Don't inject old change", item );
      schedule_buffered_inject();
      return;
    }
    ajax_inject( item.type, item.parameters );
  }
  
  var scheduled = false;
  
  function schedule_buffered_inject(){
    // debugger;
    if( scheduled )return;
    if( !window.kudo_ctx.local_storage )return;
    if( pending_inject )return;
    setTimeout( function(){
      // debugger;
      if( !scheduled )return;
      scheduled = false;
      process_buffered_inject();
      schedule_buffered_inject();
    }, retry_delay );
    scheduled = true;
  }
  
  window.ui1_server.inject = function( type, parameters ){
    console.log( "Send change action to server", arguments );
    // debugger;
    if( typeof type !== "string" ){
      parameters = type;
      type = "Array";
    }
    var storage = window.kudo_ctx.local_storage;
    if( !storage )return ajax_inject( type, parameters );
    var time_now = window.l8.now;
    var time_last = storage.getItem( "inject_time_last" );
    if( time_last ){
      time_last = parseInt( time_last, 10 );
      var age = time_now - time_last;
      if( age > 36 * 3600 * 1000 ){
        console.log( "Forget all previous changes, too old" );
        storage.setItem( "inject_queue_length", "0" );
      }
    }
    var bufsize = storage.getItem( "inject_queue_length" );
    if( !bufsize ){
      bufsize = 0;
    }else{
      bufsize = parseInt( bufsize, 10 );
    }
    storage.setItem(
      "inject_queue_" + bufsize,
      JSON.stringify( { 
        type: type,
        parameters: window.Ephemeral.json_encode( parameters ),
        time: window.l8.update_now()
      } )
    );
    bufsize++;
    storage.setItem( "inject_queue_length", bufsize.toString() );
    storage.setItem( "inject_time_last", "" + time_now );
    schedule_buffered_inject();
  };
  
  console.log( "Kudocracy ui1 client side server is running" );

}


if( !window.ui1_server ){
  try{
    var main = require( "./main.js" );
    console.log( "main engine loaded" );
    main.start( start_local_repl );
    console.log( "vote engine is starting" );
  }catch( err ){
    console.log( "Cannot start client", err, err.stack );
  }
// Never init twice
}else{
  console.log( "BUG? duplicate load of ui1client.js" );
  debugger;
}
