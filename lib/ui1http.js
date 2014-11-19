/*
 *  ui1http.js
 *    the request/response handler.
 *
 *  2014/10/21 @jhr, extracted from ui1core.js
 *
 *  Code in this file is agnostic about the page content. That content is
 *  defined by file ui1core.js
 */

"use strict";


// Globals, initialized by exports.start( kudo_scope, ... )

var l8;
var de;
var bug;
var mand;
var trace;
var config;
var Session;
var Ephemeral;
var Persona;


/*
 *  The http REPL (Read, Eval, Print, Loop) is a very simple UI
 *  to test interactively the Vote engine.
 *
 *  The BASIC style verbs were first introduced in l8/test/input.coffee
 *
 *  In this version there is additional features so that commands can inject
 *  raw html code in responses, instead of just using the basic printnl()
 *  command that displays ASCII like on a TTY screen.
 */

require( "l8/lib/queue" );
var url         = require( "url" );
var querystring = require( "querystring" );


// Browserify compatibility
if( !querystring.escape ){
  querystring.escape = function( s ){
    return encodeURIComponent( s );
  };
}


// IO tools. BASIC style

var basic_screen = [];


var cls = function(){
  basic_screen = [];
  set_head( "" );
  set_body( "" );
};


var pn = function( msg ){
  ("" + msg).split( "\n" )
  .forEach( function( m ){
    if( m ){
      basic_screen.push( m );
      if( l8.client ){ console.log( m ); }
    }
  });
};


var printnl = function( msg ){ 
  pn( msg ); 
  pn( "\n" );
};


// Minimal tool to inject some HTML syntax

var http_head = "";
var set_head = function( x ){
  http_head = x;
};

var http_body = "";
var set_body = function( x ){
  http_body = x;
};


var http_repl_macros = {};
var last_http_repl_macro = "help";
var http_repl_history = [];
var http_repl_commands;
var last_http_repl_id;

function link_to_command( cmd ){
  return '<a href="?i=' + querystring.escape( cmd ) + '">' + cmd + '</a>';
}


// Handling of HTTP requests, one at a time...

var PendingResponse = null;


var basic_style_respond = function( question ){

  var response = PendingResponse;
  if( !response )return;
  var session = response.request.kudo_session;

  // If a redirect was required, do it
  var is_slow = false;
  var location = PendingResponse.fast_redirect;
  if( location ){
    if( location.indexOf( "page=!" ) !== -1 ){
      is_slow = true;
      location = location.replace( "page=!", "page=" );
    }
    if( location === "/" ){
      is_slow = true;
    }if( location === "?page=index" ){
      is_slow = true;
      location = "/";
    }else if( location.indexOf( "page=index" ) !== -1 ){
      is_slow = true;
      if( location.indexOf( "/" ) === -1 ){
        location = "/";
      }
    }
    // Avoid slow 302, use history.replace() instead, when appropriate
    if( !is_slow && PendingResponse.request.kudo_session.can_history ){
      HttpQueue.put( PendingResponse.request, PendingResponse );
      PendingResponse = null;
      return;
    }
    // console.log( "BUG? fast_redirect but cannot history" );
    PendingResponse.writeHead( 302, { Location: location } );
    if( l8.server && ( !session || !session.magic_loader ) ){
      PendingResponse.end();
    }else{
      // Client will do the job
      PendingResponse.end(
        '<script>window.kudo_new_location = "' + location + '";'
        + 'console.log("Redirect ", window.kudo_new_location );'
        + "location.replace(window.kudo_new_location)</script>" 
      );
    }
    PendingResponse = null;
    return;
  }

  // Response is html
  PendingResponse.writeHead( 200, { 
    'Content-Type':  'text/html',
    'Cache-Control': 'no-cache, no-store, must-revalidate' 
  } );
  
  // Use raw HTML stuff if some was provided
  var head = http_head;
  var body = http_body;
  http_head = http_body = null;
  
  // Or else build a body here
  if( !body ){
    // Provide some history for the command line
    var options = [];
    http_repl_history.forEach( function( item ){
      options.push( '<option value="' + item + '">' );
    });
    body = [
      '<div id="container" style="background-color: white;">',
      '<div class="content" id="content">',
      basic_screen.join( "<br>" ),
      '</div>',
      '<div id="footer">',
      '<form name="question" url="/" style="width:50%">',
      question,
      '<input type="text" name="i" placeholder="a command or help" autofocus list="history" style="width:99%">',
      '<datalist id="history">',
      options.join( "\n" ),
      '</datalist>',
      '<input type="submit">',
      link_to_command( "help" ), ,
      '</form>',
      //'<script type="text/javascript" language="JavaScript">',
      //'document.question.input.focus();',
      //'</script>',
      '</div>', // footer
      '</div>', // container
    ].join( "\n" );
  }
  
  // Send result
  var title;
  if( !head || head.indexOf( "<title>" ) === -1 ){
    Session.current.title
    = "Kudocracy test, liquid democracy meets twitter...";
    title = '\n<title>' + Session.current.title + '</title>\n';
    if( !head ){
      head = '\n<link rel="stylesheet" type="text/css" href="'
      + config.style
      + '">';
    }
  }
  var html_tag = "<html>";
  // Insert link to offline manifest file in index page
  if( head ){
    if( Array.isArray( head ) ){
      head = head.join( "" );
    }
    if( !head.substring ){
      trace( "BUG? bad head, not a string" );
      debugger;
      head = "";
    }
    // Insert manifest appcache in index page, for offline support
    var head_head = head.substring( 0, 200 );
    var idx_index = head_head.indexOf( "<title>index</title>" );
    if( idx_index !== -1 ){
      html_tag = '<html manifest="manifest.appcache">';
    }
  }
  if( body && Array.isArray( body ) ){
    body = body.join( "" );
  }
  PendingResponse.end( [
    '<!DOCTYPE html>',
    html_tag,
    '\n<head>',
    '\n<meta charset="utf-8">',
    '\n<meta name="viewport" content="',
     'width=device-width, initial-scale=1, maximum-scale=1.0, ',
     'user-scalable=yes, minimal-ui">',
    '\n<link rel="shortcut icon" href="', config.shortcut_icon, '" type="image/png">',
    title,
    head,
    '\n</head>\n',
    '\n<body>',
    body,
    '\n</body>',
    '\n</html>'
  ].join( '' ) );
  
  // Done
  PendingResponse = null;
};


function attach_session( req ){
  
  if( !req ){
    console.log( "null req in attach_session')" );
    debugger;
    return null;
  }
  
  var session = req.kudo_session;
  if( session ){
    if( session.id === "cleared" ){
      trace( "BUG? find cleared session still attached" );
      debugger;
      return null;
    }
    return session;
  }
  var id;
  var express_session = req.session;
  if( express_session ){
    id = express_session.id;
  }else{
    if( l8.server ){
      trace( "BUG? missing express session" );
      debugger;
    }
    id = req.headers[ "x-forwarded-for" ]
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;
  }
  // ToDo: detect simpliwiki login credentials
  session = req.kudo_session = Session.login( id );
  if( express_session ){
    session.express_session = express_session;
    // Cannot setup the opposite relation: json circular
    // Use Session.find_for_request() instead.
    // express_session.kudo_session = session;
  }
  return session;
}


function handle_basic_style_request_input( req, res ){
  
  var session = req.kudo_session;
  
  // Convenient
  if( !res.request  ){ res.request = req;  }
  if( !req.response ){ req.response = res; }
  
  // If pushState style redirect
  var redir = res.fast_redirect;
  if( redir ){
    Session.set_current( session );
    PendingResponse = res;
    Session.current.pushState = redir;
    res.fast_redirect = null;
    redir = redir.substring( 1 ); // Remove leading ?
    var rquery = querystring.parse( redir );
    req.query = rquery;
    if( rquery.page ){
      rquery.page = rquery.page.replace( /\//g, " " ).trim();
      return "page " + rquery.page;
    }else{
      rquery.i = rquery.i.replace( /\//g, " " ).trim();
      return rquery.i;
    }
  }
  
  //this.trace( "Handling new http request, " + req.method + ", " + req.url );
  if( req.method === "POST" && ( req.url === "/" || req.url[1] == "?" ) ){
    if( !req.post_data_collected ){
      req.post_query_data = "";
      req.on( "data", function( data ) {
        req.post_query_data += data;
        if( req.post_query_data.length > 100000 ) {
          req.post_query_data = "";
          res.writeHead( 413, { "Content-Type": "text/plain" }) .end();
          req.connection.destroy();
        }
      });
      req.on( "end", function() {
        req.post_query_data = querystring.parse( req.post_query_data );
        req.post_data_collected = true;
        // Requeue request, now ready for further processing
        HttpQueue.put( req, res );
      });
      return false;
    }
  }else
  
  if( req.method !== "GET" ){
    res.writeHead( 404, { "Content-Type": "text/plain" } );
    res.end( "404 Not Found\n" ); // ToDo: better error code
    return false;
  }
  
  // Process some elements of request, unless resquest got requeued
  var query;
  if( session ){
    query = res.query;
  }  
  if( !query ){
    
    var parsed_url = url.parse( req.url, true );
    query = req.post_query_data || parsed_url.query;
    
    // If no ?page=xxxx nor ?i=xxx in query, build a fake one from the url itself
    if( !query.page && !query.i ){
      var page = parsed_url.pathname.substring( 1 )
      .replace( /%23/g, "#" )
      .replace( /%2B/g, "+" )
      .replace( /%20/g, " " );
      query.page = page || "index";
    }
    res.query = query;
  
    if( !session ){
      session = attach_session( req );
    }
    session.timestamp = l8.update_now();
    session.response = res;
    session.request  = req;

    // Detect "magic loader" to assert !noscript mode
    var magic = !!req.headers[ "x-magic-loader"];
    if( magic ){
      if( session.can_script === "init" ){
        session.can_script = true;
      }else if( session.can_script === false ){
        console.log( "BUG? noscript client use magic loader" );
        session.can_script = true;
      }
    }else{
      session.page_init_done = false;
    }
    
    var magic_msg = magic ? "magic, " : "";
    if( l8.client ){
      trace( "LOCAL URL: " + req.url, "script", session.can_script );
    }else{
      var referer = req.headers[ "referer" ];
      if( session.can_script === true ){
        trace( magic_msg + "URL(script): " + req.url );
      }else if( session.can_script === false ){
        trace( magic_msg + "URL(noscript): " + req.url );
        referer && trace( "Referer: " + referer );
      }else if( session.can_script === "init" ){
        trace( magic_msg + "URL(init-script): " + req.url );
        referer && trace( "Referer: " + referer );
      }else{
        trace( magic_msg + "BUG? bad script flag state, URL: " + req.url );
        referer && trace( "Referer: " + referer );
      }
    }

    // Detect offline local session
    if( req.headers[ "x-kudo-offline" ] ){
      console.log( magic_msg + "OFFLINE header detected" );
      session.is_offline = true;
      session.host = "local";
      session.can_script = true;
      session.magic_loader = true;
      session.is_app = true;
      magic = true;
    }
    
    // Detect can_script cookie
    if( session.get_cookie( "can_script" ) ){
      if( session.can_script === "init" ){
        session.can_script = true;
      }else if( session.can_script === false ){
        console.log( magic_msg + "BUG? noscript client set 'can_script' cookie" );
        session.can_script = true;
      }
    }
    
    // Detect 2 "magic loader" in a row to start client side application
    var was_magic = session.magic_loader;
    session.magic_loader = magic;
    session.is_app = was_magic && magic && !session.is_slim;
    if( !session.is_app ){
      // console.log( "Server mode" );
      session.app_init_done = false;
      session.changes       = 0;
    }else{
      // console.log( "Switching to client mode" );
    }
    
    // Some browser detection for new sessions
    if( session.is_new ){

      session.is_new = false;
      
      // Auto-detect language, unless language was set by visitor first
      if( session.auto_lang ){
        var langs = req.headers[ "accept-language" ];
        if( langs ){
          if( langs.indexOf( ",fr" ) !== -1 ){
            session.set_lang( "fr" );
          }else if( langs.indexOf( ",es" ) !== -1 ){
            session.set_lang( "es" );
          }else if( langs.indexOf( ",de" ) !== -1 ){
            session.set_lang( "de" );
          }else if( langs.indexOf( ",it" ) !== -1 ){
            session.set_lang( "it" );
          }
        }
      }
      
      // Detect Safari, special emojis
      var ua = req.headers[ "user-agent" ];
      session.ua = ua || "none";
      // console.log( "User Agent", ua );
      if( ua.indexOf( "Safari" ) !== -1 ){
        if( ua.indexOf( "Chrome" ) !== -1 ){
          session.is_chrome = true;
          // trace( "CHROME" );
        }else{
          session.is_safari = true;
          // trace( "SAFARI" );
        }
      }
      
      // Detect involved host, ie how the server was reached
      session.set_host( req.headers[ "host" ] );
      
      // Detect mode for low resources clients
      if( query.slim ){
        console.log( "SLIM mode, from ?query")
        session.is_slim   = true;
        session.is_novice = true;
      }
      if( query.fast ){
        session.is_slim = false;
      }
      
      // Expect a javascript client activity, if none... noscript browser
      if( l8.server ){
        setTimeout( function(){
          if( session.can_script === "init" ){
            trace( "Can't script", ua, req.url );
            session.can_script = false;
          }
        }, 60 * 1000 );
      }else{
        session.can_script = true;
      }
    }
  
  }
  
  // Detect cookie normally set by some script in all pages, unless noscript
  if( session.can_script === "init" ){
    if( session.get_cookie( "can_script" ) ){
      session.can_script = true;
    }
  }

  // Switch to proper Ephemeral Machine, can be asynchronous
  var domain;
  if( !res.query ){
    trace( magic_msg + "Attempt to extract domain from not parsed query" );
    debugger;
    domain = null;
  }else{
    domain = res.query.domain;
  }
  if( !domain
  || domain === "Domain"
  || domain === "Domaine"
  // ToDo: avoid this:|| domain === i18n( "Domain" )
  ){
    domain = session.domain;
  }else{
    trace( magic_msg + "Domain", domain );
  }
  session.set_domain( domain );
  if( session.boxon ){
    // ToDo: what if multiple requests *before* machine init is completed?
    session.boxon( function(){ HttpQueue.put( req, res ); } );
    return false;
  }
  
  // When entering a domain, current visitor needs to be logged in again
  if( session.delayed_login ){
    http_repl_commands.login( session.delayed_login );
    session.visitor = Persona.find( session.delayed_login );
    session.delayed_login = null;
  }
  
  if( session.visitor
  && session.visitor.machine !== Ephemeral.Machine.current
  ){
    trace( magic_msg + "BUG? bad machine for session visitor " + session.visitor
    + ", domain: " + res.query.domain
    + ", machine: " + session.visitor.machine.id
    + ", current machine: " + Ephemeral.Machine.current.id 
    );
    de&&mand( !session.visitor || session.visitor.machine === Ephemeral.Machine.current );
  }

  PendingResponse = res;
  PendingResponse.request =  req;
  
  // Collect ?i=...&i2=...&i3... into space separated command + arg list
  var data = query.i;
  // ?page= is valid alternative for ?i=page&...
  if( !data && query.page ){
    data = "page " + query.page;
  }

  // Default to page index if no command was provided at all
  if( !data )return "page index";

  var more = query.i2;
  if( more ){ data += " " + more; }
  more = query.i3;
  if( more ){ data += " " + more; }
  more = query.i4;
  if( more ){ data += " " + more; }
  more = query.i5;
  if( more ){ data += " " + more; }
  // / separator is normalized into a space, that's the repl style
  if( req.method === "GET" ){
    data = data.replace( /\//g, " " ).trim();
  // In POST requests, cr/lf and duplicate spaces are replaced into spaces
  }else{
    data = data.replace( /\r\n/g, " " ).replace( /  /g, " " ).trim();
  }
  
  return data.substring( 0, 100000 );

}


var HttpQueue;


function basic_style_http_server( port, input_handler ){

  var basic_style_input = l8.Task( function( question ){
  
    l8.step( function(){
      basic_style_respond( question );
      HttpQueue.get() } );
  
    l8.step( function( req, res ){
      var result = handle_basic_style_request_input( req, res );
      return result || basic_style_input( question );
    });
  
  } );

  // The main loop
  l8.task( function(){
    
    l8.step( function(){ trace( "Web test UI is running on port " + port ); });
    
    l8.repeat( function(){
      l8.step( function call_basic_style_input(){   
        basic_style_input( "" ); });
      l8.step( function( r ){ return input_handler( Session.current, r ); });
    });
    
    //debugger;
    
  });

}


function start_http_repl( kudo_scope, port, host ){
  HttpQueue = l8.queue( 1000 );
  if( host ){
    config.host = host;
  }
  Session.start_change_dispatcher();
  basic_style_http_server( port, handle_repl_input );
}


function handle_repl_input( session, r ){
  if( !r ){
    console.log( "Invalid input in handle_repl_input" );
    debugger;
    return;
  }
  printnl( link_to_command( r ) );
  var input = r;
  // Handle !macros
  if( input[0] === "!" ){
    var idx_space = input.indexOf( " " );
    // !macro -- run it
    if( idx_space === -1 ){
      if( input === "!" ){
        input = last_http_repl_macro;
      }else{
        input = http_repl_macros[ input ];
      }
      if( !input ){ input = "help"; }
      last_http_repl_macro = input;
    }else{
      http_repl_macros[ input.substring( 0, idx_space - 1 ) ]
      = input.substring( idx_space + 1 );
      input = input.substring( idx_space + 1 );
    }
  }
  try{
    // Parse command line, space delimits tokens
    var tokens = input.trim().split( " " );
    // First token is command name
    var cmd = tokens[0];
    // Other tokens describe the arguments
    var args = tokens.slice( 1 );
    var args2 = [];
    var obj = null;
    args.forEach( function( v, idx ){
      var front = v[0];
      var need_push = false;
      // >something means something is added to an array or an object
      if( front === ">" ){
        need_push = true;
        v = v.substring( 1 );
      }else{
        obj = null;
      }
      var sep = v.indexOf( ":" );
      var key = ( sep === -1 ) && v.substring( 0, sep - 1 );
      var val = ( sep === -1 ) && v.substring( sep + 1 );
      if( val === "true"  ){ val = true; }
      if( val === "false" ){ val = false; }
      if( val === "_"     ){ val = undefined; }
      if( val === "null"  ){ val = null; }
      // &something is the id of an entity, & alone is last id
      if( front === "&" ){
        var id;
        if( v.length === 1 ){
          id = last_http_repl_id;
        }else{
          id = v.substring( 1 );
          if( parseInt( id, 10 ) ){
            id = parseInt( id, 10 );
          }
          if( id < 10000 ){
            id += 10000;
          }
          last_http_repl_id = id;
        }
        v = Ephemeral.get_entity( id );
      }
      // Handle +
      if( need_push ){
        // If neither [] nor {} so far, start it
        if( !obj ){
          // start with { n: v } when +something:something is found
          if( key ){
            obj = {};
            obj[ key ] = val;
            v = obj;
          // start with [ v ] if no : was found
          }else{
            v = obj = [ v ];
          }
        // If previous [] or {}
        }else{
          if( !key ){
            obj.push( v );
          }else{
            obj[ key ] = val;
          }
          v = null;
        }
      }
      // If [] or {} then add to that new object from now on
      if( v === "[]" ){
        v = obj = [];
      }else if( v === "{}" ){
        v = obj = {};
      }else if( v === "," ){
        v = obj = null;
      }
      if( v ){ args2.push( v ) }
    });
    var code = http_repl_commands[ cmd ];
    if( code ){
      if( cmd !== "page" && Session.current ){
        Session.current.redirect_back();
      }
      var result = code.apply( cmd, args2 );
      http_repl_history.unshift( r );
      return result;
    }else{
      printnl( "Enter 'help'" );
    }
  }catch( err ){
    printnl( "Error " + err );
    trace( "Http REPL error: ", err, err.stack );
  }
}


function process_csv_request( req, res ){
  // Extract optional user name from url
  var url = req.url;
  var voter_name = "";
  if( url.length > 4 ){
    voter_name = url.substring( 5 );
  }
  var content = http_repl_commands.csv( voter_name );
  res.writeHeader( 200, {
    'Content-Disposition': 'attachment; filename="kudocracy.csv"',
    'Content-Type': 'text/csv',
    'Expire:': '0'
  });
  res.end( content );
}


function process_api_request( req, res ){
  attach_session( req );
  http_repl_commands.api( req, res );
}


/*
 *  Export stuff when core runs client side as a UI server
 */
 
var ui1server = function( req, res ){
  var url = req.url;
  if( url.substring( 0, 4 ) === "/csv" ){
    return process_csv_request( req, res );
  }
  if( url.substring( 0, 5 ) === "/api/" ){
    return process_api_request( req, res );
  }
  // Basic http repl style of requests
  // Some http_repl_commands[] will be called.
  HttpQueue.put( [ req, res ] );
  return true;
};


ui1server.login = function( label ){
  var session = Session.login( "127.0.0.1" );
  session.set_visitor( label );
};


exports.start = function( kudo_scope, cfg, cmds, port, host ){
// Starts the ui server. It behave like an http requests processor.
// Note: port & host are "local" and document.domain on the client side.
// debugger;
  config    = cfg;
  http_repl_commands = cmds;
  Ephemeral = kudo_scope.Ephemeral;
  Session   = kudo_scope.Session;
  Session.find_for_request = attach_session;
  Persona   = kudo_scope.Persona;
  l8        = kudo_scope.l8;
  de        = kudo_scope.de;
  bug       = kudo_scope.bug;
  trace     = kudo_scope.trace;
  // Some exports
  ui1server.Session = Session;
  // More export, using global scope
  // ToDo: avoid this somehow
  kudo_scope.querystring = querystring;
  kudo_scope.printnl     = printnl;
  kudo_scope.set_head    = set_head;
  kudo_scope.set_body    = set_body;
  kudo_scope.get_query   = function(){ return PendingResponse.query; };
  kudo_scope.cls         = cls;
  kudo_scope.pn          = pn;
  kudo_scope.printnl     = printnl;
  start_http_repl( kudo_scope, port, host );
  // ui1server is a f( req, res ) type of function
  return ui1server;
};
