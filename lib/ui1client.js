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
//  responds as if the request was a genuine HTTP request coming from a remote
//  browser. In some rare cases, the ui1 core adapts it's response based on
//  local or remote origin of the request.
//
//  user -> ui server -> ui core -> user
//                           |
//                           V
//          vote log -> vote engine -> vote log
//                           |
//                           V
//                        ui core
//
// The local ui server is described here. The http server is described in
// file ui1.js. They both direct requests to the ui server described in
// ui1core. The vote engine is in file main.js. The data layer, including
// log based persistence, is in ephemeral.js

"use strict";


function start_local_server( kudo_scope ){

  console.log( "Starting the local ui server" );
  
  // Export global Ephemeral to deal with Ephemeral changes
  window.Ephemeral = kudo_scope.Ephemeral;
  window.l8        = kudo_scope.l8;
  
  var ui1core = require( "./ui1core.js" );

  // Export global UI server that can process UI changes
  var host = document.location.hostname + document.location.pathname; // no ?xxxxx
  console.log( "local ui host", host );
  if( host.indexOf( "/offline" ) !== -1 ){
    // ToDo: figure out the proper host
    host = host.replace( "/offline", "" );
    console.log( "ToDo: better host?", host, ui1core.get_config().host );
  }
  var server = ui1core.start( kudo_scope, "local", host );
  window.ui1_server = server;
  
  if( !server ){
    console.error( "BUG? Could not start the local ui server" );
    debugger;
    return;
  }
  
  // Avoid some issues with clock desync between client & server
  window.time_last_page = 0;
  
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
    if( storage ){
      pending_inject = true;
    }
    time_last_attempt = window.l8.update_now();
    function retry(){
      // Exponential backoff, randomized to avoid excess when service is back
      retry_delay = retry_delay * ( 1.5 + Math.random() );
      if( retry_delay > 5 * 60 * 1000 ){
        // 5 minutes maximal delay between attempts
        retry_delay = 5 * 60 * 1000;
      }
      pending_inject = false;
      schedule_buffered_inject();
    }
    if( kudo_ctx.session.is_offline ){
      retry();
      return;
    }
    window.$.ajax({
      type: "POST",
      url: "/api/inject",
      contentType: "application/json; charset=utf-8",
      dataType: "json",
      processData: false,
      data: JSON.stringify( {
        inject: type,
        parameters: window.Ephemeral.json_encode( parameters )
      } ),
      success: function( data ){
        console.log( "ajax worked" );
        kudo_ctx.session.is_offline = false;
        retry_delay = 10;
        pending_inject = false;
        if( storage ){
          storage.setItem( "inject_done_count", "" + ( pending_index + 1 ) );
        }
        // The response may include changes to the data layer. local replay.
        if( data && data.length ){
          var time_start = window.l8.update_now();
          console.log( "Processing ", data.length, "changes" );
          window.ui1_server.load( data );
          var duration = window.l8.update_now() - time_start;
          console.log( "Processed", data.length, "changes,", duration, "ms" );
        }
        process_buffered_inject();
      },
      error: function( data ){
        console.log( "ajax error", data, "delay", retry_delay );
        debugger;
        retry();
      }
    });
  }
  
  function process_buffered_inject(){
    var storage = window.kudo_ctx.local_storage;
    if( !storage ){
      console.log( "BUG? buffered inject, but no local storage" );
      return;
    }
    // If busy, just make sure that the queue consumer is running
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
    if( scheduled )return;
    if( !window.kudo_ctx.local_storage )return;
    if( pending_inject )return;
    setTimeout( function(){
      if( !scheduled )return;
      scheduled = false;
      process_buffered_inject();
      schedule_buffered_inject();
    }, retry_delay );
    scheduled = true;
  }
  
  server.inject = function( type, parameters ){
    
    console.log( "Send change action to server", arguments );
    if( typeof type !== "string" ){
      parameters = type;
      // Fake type to support arrays. Receiver will detect this.
      type = "Array";
    }
    
    // Make data json compatible
    parameters = window.Ephemeral.json_encode( parameters );
    
    // Send change using ajax now, unless local storage enables buffering
    var storage = window.kudo_ctx.local_storage;
    if( !storage )return ajax_inject( type, parameters );
    
    // Should old buffered stuff be cleared?
    var time_now = window.l8.update_now();
    var time_last = storage.getItem( "inject_time_last" );
    if( time_last ){
      time_last = parseInt( time_last, 10 );
      var age = time_now - time_last;
      if( age > 36 * 3600 * 1000 ){
        console.log( "Forget all previous changes, too old" );
        storage.setItem( "inject_queue_length", 0 );
        storage.setItem( "inject_done_count", 0 );
      }
    }
    
    // Add new item to queue
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
        parameters: parameters,
        time: l8.update_now()
      } )
    );
    bufsize++;
    storage.setItem( "inject_queue_length", bufsize );
    storage.setItem( "inject_time_last", time_now );
    
    // Start queue consumer (unless it is not already running)
    schedule_buffered_inject();
  };
  
  /*global l8, Ephemeral, kudo_ctx, kudo_is_offline, kudo_signal_capabilities*/
  
  server.get_stored_changes = function(){
    var storage = kudo_ctx.local_storage;
    if( !storage )return 0;
    var version = storage.getItem( "change_version" );
    // if( !version )return 0;
    var stored_count = storage.getItem( "change_count" );
    if( !stored_count )return 0;
    return parseInt( stored_count, 10 );
  };
  
  function show_progress( max, now ){
    var $ = window.$;
    var $progress = $("#progress");
    var $progress_bar = $("#progress_bar");
    $progress.val( now ).attr( "max", max );
    $progress_bar.show();
  }
  
  server.load = function( changes, done_cb ){
  // Loads changes coming from the server
    if( !changes || !changes.length )return done_cb && l8.tick( done_cb );
    var time_start = l8.update_now();
    // First, let's store these changes
    var storage = kudo_ctx.local_storage;
    if( storage ){
      var change;
      var index;
      for( var ii = 0 ; ii < changes.length ; ii++ ){
        change = changes[ ii ];
        index = storage.getItem( "change_count" ) || "0";
        index = parseInt( index, 10 );
        storage.setItem( "change_" + index, JSON.stringify( change ) );
        storage.setItem( "change_count", index + 1 );
        document.cookie = "kudo_change_count=" + ( index + 1 );
      }
    }
    // Then, let's apply these changes
    Ephemeral.restore( changes, function(){
      var duration = l8.update_now() - time_start;
      console.log( "Load ", changes.length, "changes in", duration, "ms" );
      done_cb && done_cb();
    });
  };
  
  console.log( "Kudocracy ui1 client side server is running" );
  
  var offline = false;
  
  // When run from offline index page
  if( !window.kudo_ctx ){
    offline = kudo_is_offline();
    if( offline ){
      console.log( "OFFLINE Kudocracy" );
      //document.write( "offline" );
    }
    kudo_signal_capabilities( offline );
  }
  
  // Are there stored changes to replay?
  var stored_count = server.get_stored_changes();
  if( stored_count ){
    show_progress( stored_count, 0 );
    l8.tick( function(){
      var time_start = l8.update_now();
      console.log( "Stored changes replay.", stored_count, "changes." );
      var storage = kudo_ctx.local_storage;
      var changes = [];
      for( var ii = 0 ; ii < stored_count ; ii++ ){
         changes.push( JSON.parse( storage.getItem( "change_" + ii ) ) );  
      }
      Ephemeral.restore( changes, null, function( idx, last ){
        show_progress( stored_count, idx );
        if( last ){
          // 100% Completed, don't hide it to avoid flicker
          show_progress( 100, 100 );
        }
      });
      var duration = l8.update_now() - time_start;
      console.log( "Replay", stored_count, "changes in", duration, "ms" );
    });
  }

  // When offline, change current page content using the local UI server
  if( offline && stored_count ){
    console.log( "OFFLINE index page" );
    // Ask local server to build an index page, then display it
    /*global ui1_server*/
    ui1_server({
      method: "GET",
      url: kudo_ctx.url || "/propositions",
      headers: {
        "x-forwarded-for": "127.0.0.1",
        "x-kudo-offline":  offline,
        "user-agent":      window.navigator.userAgent
      }
    },{
      writeHead: function(){},
      end: function( r ){
        document.write( r );
      }
    });
  }else if( offline ){
    document.write( kudo_ctx.session.i18n( "sorry, no 'offline' data") );
  }

}


if( !window.ui1_server ){
  try{
    var kudocracy = require( "./main.js" );
    console.log( "vote engine loaded" );
    kudocracy.start( start_local_server );
    console.log( "vote engine is starting" );
  }catch( err ){
    console.log( "Cannot start local ui server", err, err.stack );
  }
// Never init twice
}else{
  console.log( "BUG? duplicate load of ui1client.js" );
  debugger;
}
