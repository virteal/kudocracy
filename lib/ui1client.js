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
//  defined inside ui1core.js in function kudo_magic().
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
  
  // Export some global stuff
  window.Ephemeral = kudo_scope.Ephemeral;
  window.l8        = kudo_scope.l8;
  
  // Load the application code, the UI
  var ui1core = require( "./ui1core.js" );

  // Let's figure out what the server address is
  var host = document.location.host + document.location.pathname; // no ?xxxxx
  
  // Get rid of potential extra / when accessing the index page
  if( host[ host.length - 1 ] === "/" ){
    host = host.substring( 0, host.length - 1 );
  }
  var online_host;
  console.log( "local ui host", host );

  // In offline mode I must adjust the value of the configuration's host
  // or else I may not be able to access ressources
  var idx_offline = host.indexOf( "/offline" );
  if( idx_offline !== -1 ){
    // ToDo: figure out the proper host
    online_host = host.substring( 0, idx_offline );
    console.log( "ToDo: better host?", online_host, ui1core.get_config().host );
  }
  idx_offline = document.location.search.indexOf( "?page=offline" );
  if( idx_offline !== -1 ){
    // ToDo: figure out the proper host
    online_host = host;
    console.log( "ToDo: better host?", online_host, ui1core.get_config().host );
  }
  
  if( online_host ){
    host = online_host;
    // Patch config so that resources are loaded from proper host
    ui1core.get_config().host = host;
  }
  
  // Start UI server & export global object that can process UI changes
  var server = ui1core.start( kudo_scope, "local", host );
  
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
  
  // Change injection management. Including offline/online resync logic
  
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
    
    // Wait until not offline
    if( kudo_ctx.session.is_offline ){
      console.info( "Offline, retry later", retry_delay );
      retry();
      return;
    }
    
    // Wait until authenticated
    if( !kudo_ctx.authentic ){
      console.info( "Online but not authenticated, keep waiting", retry_delay );
      retry();
      return;
    }
    
    // OK. Ready to send change. On response, process next change in queue
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
        // ToDo: ask user about resync
        if( kudo_ctx.session.is_offline ){
          console.warn( "ToDo: back online. User confirmation required." );
        }
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
        // Process next queued change, if any
        process_buffered_inject();
      },
      
      error: function( data ){
        console.warn( "ajax error (inject)", data, "delay", retry_delay );
        debugger;
        retry();
      }
    });
  }
  
  function process_buffered_inject(){
    var storage = window.kudo_ctx.local_storage;
    if( !storage ){
      console.wrn( "BUG? buffered inject, but no local storage" );
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
        console.warn( "BUG? more done than queued" );
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
      console.warn( "Don't inject old change", item );
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
    
    if( !window.kudo_ctx.authentic ){
      console.warn( "Change injection from not authentic visitor" );
    }
    
    console.debug( "Queue change to send to server", arguments );
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
        console.warn( "Forget all previous changes, too old" );
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
    
    // Start queue consumer (unless it is already running)
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
  
  var restore_in_progress = false;
  var queued_load = null;
  
  server.load = function( changes, done_cb ){
  // Loads changes coming from the server, then call callback
  
    // Defensive
    if( changes === "offline" ){
      if( !window.kudo_offline_loader ){
        console.warn( "BUG? offline change yet no window.kudo_offline_loader" );
        debugger;
        window.kudo_offline_loader = true;
        return;
      }
    }
    
    // Don't interfere with initital restore
    if( restore_in_progress ){
      console.log( "Defer loading, restore in progress" );
      if( queued_load ){
        console.warn( "BUG? invalid multiple calls to load()" );
        return;
      }
      queued_load = arguments;
      return;
    }
    
    // When no change (as always when both side runs in the client)
    if( !changes || !changes.length )return done_cb && l8.tick( done_cb );
    
    var time_start = l8.update_now();
    
    // First, let's store these changes in local storage
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
    
    // Then, let's apply these changes to the "in memory" ephemeral database
    show_progress( 0, changes.length );
    Ephemeral.restore(
      changes,
      function(){
        var duration = l8.update_now() - time_start;
        console.info( "Load ", changes.length, "changes in", duration, "ms" );
        show_progress( 100, 100 );
        done_cb && done_cb();
      }
    );
  };
  
  console.log( "Kudocracy ui1 client side server is running" );
  if( !server.load ){
    console.warn( "BUG? ui1_server.load() is undefined" );
    debugger;
  }
  window.ui1_server = server;
  
  var offline = false;
  
  // When loaded from /offline home page, start a local UI
  if( window.kudo_offline_loader
  ||  window.kudo_ctx && window.kudo_ctx.changes === "offline"
  ){
    console.warn( "Switching to 'offline' loader mode" );
    if( window.kudo_offline_loader ){
      console.log( "Due to kudo_offline loader" );
    }else{
      console.log( "Due to 'offline' change" );
    }
    window.kudo_offline_loader = true;
    if( window.kudo_ctx && window.kudo_ctx.changes === "offline" ){
      window.kudo_ctx.changes = null;
    }
    offline = true;
    // Going back to online mode will require a user confirmation
    kudo_is_offline( offline );
  }

  // When run from offline index page
  if( !window.kudo_ctx || window.kudo_offline_loader ){
    if( !offline ){
      offline = kudo_is_offline();
      if( offline ){
        console.warn( "OFFLINE Kudocracy" );
        //document.write( "offline" );
      }
    }
    kudo_signal_capabilities( offline );
  }
  
  function when_data_ready(){
  // This callback is called once ephemeral database is restored
    
    // When offline, change current page content using the local UI server
    if( offline && stored_count ){
      console.info( "OFFLINE entry page" );
      // Ask local server to build an entry page, then display it
      /*global ui1_server*/
      var url = kudo_ctx.url || "/propositions";
      ui1_server({
        method: "GET",
        url: "/proposition",
        headers: {
          "x-forwarded-for": "127.0.0.1",
          "x-kudo-offline":  offline,
          "user-agent":      window.navigator.userAgent
        }
      },{
        writeHead: function(){},
        end: function( r ){
          var $ = window.$;
          console.log( "Got content of first offline page", url );
          var html = r.substring( r.indexOf( "<html>" ) );

          var scripts = "";
          
          // Clear the new body for the page, to avoid any flicker
          $('body').html( "" );
          
          // Collect scripts that in the head and body, will run in new body
          var body = "";
          scripts = "";
          html = html.replace( /<script[\s\S]*?<\/script>/g, function( s ){
            var front = s.substring( 0, 300 );
            // console.log( "script: " + front );
            var idx_src = front.indexOf( 'src="http' );
            // Avoid src="http://...", to benefit from what was already loaded
            if( idx_src >= 0 )return "";
            console.log( "script:" + front );
            if( front.indexOf( "kudo_ready" ) != -1 ){
              console.log( "About to run magic script" );
            }
            scripts += s;
            return "";
          });

          // Replace meta in head by meta from new content
          $('meta').remove();
          html = html.replace( /<meta[\s\S]*?>/g, function( m ){
            $('head').append( m );
            return "";
          });
         
          // Collect links in head & body of new content, moved to current head
          $("link").remove();
          html = html.replace( /<link[\s\S]*?>/g, function( s ){
            $('head').append( s);
            return "";
          });
         
          // Collect styles in head & body of new content, moved to current head
          $("style").remove();
          html = html.replace( /<style[\s\S]*?<\/style>/g, function( s ){
            $('head').append( s);
            return "";
          });
         
          // Collect title in head & body of new content, moved to current head
          $("title").remove();
          html = html.replace( /<title[\s\S]*?<\/title>/g, function( s ){
            $('head').append( s);
            return "";
          });

          // Add what remains of the body (with all scripts moved to the end)
          html = html.replace( /(<body[\s\S]*)(<\/body>)/, function( _, b, eb ){
            body = b + scripts + eb;
          });
          if( !body ){ body = scripts; }
          
          // Set body (also runs scripts, thanks to jQuery)
          try{
            console.log( "Set initial body of OFFLINE mode" );
            $('body').empty().html( body ); // not [0].innerHTML = body;
          }catch( err ){
            console.warn( "BUG? error when setting new 'body' element", err );
            debugger;
          }
          
          // Invoke what is normally bound to $('document').ready()
          window.kudo_when_ready();
        }
      });
    
    // Offline without any data is not very usefull...
    }else if( offline ){
      if( kudo_ctx && kudo_ctx.session ){
        document.write( kudo_ctx.session.i18n( "sorry, no 'offline' data") );
      }else{
        document.write( "data :(" );
        console.warn( "BUG? missing session" );
      }
    
    // Online version does not need anything special
    }else{}
  }
  
  // Are there stored changes to replay?
  var stored_count = server.get_stored_changes();
  if( !stored_count ){
    when_data_ready();
  }else{
    show_progress( stored_count, 0 );
    restore_in_progress = true;
    l8.tick( function(){
      var time_start = l8.update_now();
      console.log( "Stored changes replay.", stored_count, "changes." );
      var storage = kudo_ctx.local_storage;
      var changes = [];
      for( var ii = 0 ; ii < stored_count ; ii++ ){
         changes.push( JSON.parse( storage.getItem( "change_" + ii ) ) );  
      }
      Ephemeral.restore(
        changes,
        function(){
          restore_in_progress = false;
          var duration = l8.update_now() - time_start;
          console.info(
            "Replay", stored_count, "changes in", duration, "ms"
          );
          if( queued_load ){
            time_start = l8.update_now();
            console.log( "Process queued changes loading" );
            var queued_changes = queued_load[0];
            var queued_cb = queued_load[1];
            queued_load = false;
            server.load(
              queued_changes,
              function(){
                duration = l8.update_now() - time_start;
                console.info(
                  "Load", queued_changes.length, "changes in", duration, "ms"
                );
                queued_cb();
                when_data_ready();
              }
            );
          }else{
            when_data_ready();
          }
        },
        function( idx, last ){
          show_progress( stored_count, idx );
          if( last ){
            // 100% Completed, don't hide it to avoid flicker
            show_progress( 100, 100 );
          }
        }
      );
    });
  }
}

console.log( "ui1client.js included" );
if( !window.ui1_server ){
  try{
    // When loaded from /?page=offline home page, start a local UI
    if( window.kudo_offline_loader ){
      console.warn( "This is the offline version starting..." );
      if( false ){
        document.write( "Kudocracy " );
        document.write(
          '<div id="progress_bar"><progress id="progress"/></div>'
        );
      }
    }
    console.log( "Starting local vote engine & UI server" );
    var kudocracy = require( "./main.js" );
    console.log( "Vote engine is starting" );
    kudocracy.start( start_local_server );
  }catch( err ){
    console.error( "Cannot start local UI server", err, err.stack );
  }
// Never init twice
}else{
  console.warn( "BUG? duplicate load of ui1client.js" );
  debugger;
}
