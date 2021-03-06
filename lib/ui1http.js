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
var Config;
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
      if( false && l8.client ){ console.log( m ); }
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
  var wants_slow_302 = false;
  var location = response.fast_redirect;
  if( location ){
    if( location.indexOf( "page=!" ) !== -1 ){
      wants_slow_302 = true;
      location = location.replace( "page=!", "page=" );
    }
    if( location === "/" ){
      wants_slow_302 = true;
    }else if( location.indexOf( "page=index" ) !== -1 ){
      wants_slow_302 = true;
      if( location.indexOf( "/" ) === -1 ){
        location = "/";
      }
    }
    // Avoid slow 302, use history.replace() instead, when appropriate
    if( !wants_slow_302 && response.request.kudo_session.can_history ){
      HttpQueue.put( response.request, response );
      PendingResponse = null;
      return;
    }
    if( response.kudo_seen_answer ){
      trace( "Bug? already seen request answered" );
      debugger;
      PendingResponse = null;
      return false;
    }
    response.kudo_seen_answer = true;
    // console.log( "BUG? fast_redirect but cannot history" );
    response.writeHead( 302, { Location: location } );
    if( l8.server && ( !session || !session.magic_loader ) ){
      response.end();
    }else{
      // Client will do the job
      response.end(
        '<script>window.kudo_new_location = "' + location + '";'
        + 'console.log("Redirect ", window.kudo_new_location );'
        + "location.replace(window.kudo_new_location)</script>" 
      );
    }
    PendingResponse = null;
    return;
  }

  if( response.kudo_seen_answer ){
    trace( "Bug? already seen request answered" );
    debugger;
    return false;
  }
  response.kudo_seen_answer = true;

  // Use raw HTML stuff if some was provided
  var body = http_body || "";
  if( body && Array.isArray( body ) ){
    body = body.join( "" );
  }
  var head = http_head || "";
  if( head && Array.isArray( head ) ){
    head = head.join( "" );
  }
  http_head = http_body = null;

  var magic_sign = "<!-- magic -->";
  var magic = head.substring( 0, magic_sign.length ) === magic_sign ;

  if( magic ){
    response.writeHead( 
      200, { "Content-Type": "text/html", "x-magic": "true", "Expires": "0" }
    );
    PendingResponse.end( head + body );
    return;
  }

  // Response is html
  // Add some XSS script injection protection
  // See http://www.html5rocks.com/en/tutorials/security/content-security-policy/
  response.writeHead( 200, { 
    "Content-Type":  "text/html",
    "X-UA-Compatible": "IE=edge",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Expires": "0",
    "Content-Security-Policy":
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    + " *." + Config.host
    + " https://*." + Config.host
    + " *.googleapis.com"
    + " https://*.googleapis.com"
    + " *.bootstrapcdn.com"
    + " *.google.com"
    + " https://*.google.com"
    + " https://rawgit.com" // For https://raw.github.com/ngryman/jquery.finger/master/dist/jquery.finger.min.js
    + " *.twitter.com"
    + " https://*.twitter.com"
    + " *.twimg.com"
    + " https://*.twimg.com"
    + " *.firebase.com"
    + " https://*.firebase.com"
    + " *.firebaseio.com"
    + " https://*.firebaseio.com"
    + ";report-uri /csp_report"
  } );

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
    Session.current.title = "Kudocracy";
    title = '\n<title>' + Session.current.title + '</title>\n';
    if( !head ){
      head = '\n<link rel="stylesheet" type="text/css" href="'
      + Config.style
      + '">'
      + '\n<script src="/public/modernizr.min.js"></script>\n';
    }
    head = title + head;
  }
  var html_tag = "<html ";
  // Insert link to offline manifest file in index page
  if( head ){
    if( Config.offline_support ){
      // Insert manifest appcache in index page, for offline support
      var head_head = head.substring( 0, 200 );
      var idx_index = head_head.indexOf( "<title>@Kudocracy</title>" );
      // ToDo: only in dev mode at this point
      if( idx_index !== -1 && Config.dev_mode ){
        // ToDo: manifest.json 
        // See https://developer.mozilla.org/fr/Apps/Manifeste
        // See https://developer.chrome.com/multidevice/android/installtohomescreen
        html_tag += ' manifest="manifest.appcache"';
      }
    }
  }
  // <html lang=xxxx> stuff
  html_tag += ' lang="' + Session.current.lang + '"';

  PendingResponse.end( [
    '<!DOCTYPE html>',
    html_tag, '>',
    '\n<head>',
    '\n<meta charset="utf-8">',
    '\n<meta http-equiv="cleartype" content="on" />',
    '\n<meta name="MobileOptimized" content="width" />',
    '\n<meta name="HandheldFriendly" content="true" />',
    '\n<meta name="viewport" content="',
      'width=device-width, initial-scale=1">', 
      // , maximum-scale=1.0, 'user-scalable=no, minimal-ui">',
    '\n<link rel="icon" href="', Config.icon, '" type="image/png">',
    // Bootstrap & Fontawesome
    '\n<link href="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.2/css/bootstrap.min.css" rel="stylesheet">',
    '\n<link rel="stylesheet" href="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.2/css/bootstrap-theme.min.css">',
    '\n<link rel="stylesheet" href="http://maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css">',
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
    // When running "offline", the id is going to be 172.0.0.1
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

  // If a pushState style redirect lead us here
  var redir = res.fast_redirect;
  if( redir ){
    res.fast_redirect = null;
    Session.set_current( session );
    PendingResponse = res;
    Session.current.pushState = redir;
    redir = redir.substring( 1 ); // Remove leading ?
    // Rebuild the kudo_query to match what a normal request delivers
    var rquery = querystring.parse( redir );
    req.kudo_query = rquery;
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
    if( !req.kudo_post_data_collected ){
      req.kudo_post_query_data = "";
      req.on( "data", function( data ) {
        req.kudo_post_query_data += data;
        if( req.kudo_post_query_data.length > 100000 ) {
          req.kudo_post_query_data = "";
          res.writeHead( 413, { "Content-Type": "text/plain" } ).end();
          req.connection.destroy();
        }
      });
      req.on( "end", function() {
        req.kudo_post_query_data
        = querystring.parse( req.kudo_post_query_data );
        req.kudo_post_data_collected = true;
        // Requeue request, now ready for further processing
        HttpQueue.put( req, res );
      });
      return false;
    }
  }else if( req.method !== "GET" ){
    res.writeHead( 404, { "Content-Type": "text/plain" } );
    res.end( "404 Not Found\n" ); // ToDo: better error code
    return false;
  }

  if( req.kudo_seen ){
    trace( "Bug? already seen request" );
    // debugger;
    // return false;
  }
  req.kudo_seen = true;

  // Process some elements of request, unless resquest got requeued
  var query;
  var magic_msg = "";
  if( session ){
    query = req.kudo_query;
  }  
  if( !query ){

    var parsed_url = url.parse( req.url, true );
    query = req.kudo_post_query_data || parsed_url.query;

    // If no page=xxxx nor i=xxx in query, build a fake one from the url
    if( !query.page && !query.i ){
      var page = parsed_url.pathname.substring( 1 )
      .replace( /%23/g, "#" )
      .replace( /%2B/g, "+" )
      .replace( /%20/g, " " );
      query.page = page || "index";
    }
    req.kudo_query = query;

    if( !session ){
      session = attach_session( req );
    }
    session.timestamp = l8.update_now();
    session.response = res;
    session.request  = req;

    // Some browser and robot detection for new sessions
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

      var ua = req.headers[ "user-agent" ] || "";
      session.ua = ua || "none";

      // Robots detection
      if( ua.indexOf( "Googlebot") !== -1 ){
        session.bot = "google";
      }else if( ua.indexOf( "Baiduspider") !== -1 ){
        session.bot = "baidu";
      }else if( ua.indexOf( "AhrefsBot") !== -1 ){
        session.bot = "ahrefs";
      }else if( ua.indexOf( "Yahoo! Slurp") !== -1 ){
        session.bot = "yahoo";
      }else if( ua.indexOf( "bingbot/" ) !== -1 ){
        session.bot = "bing";
      }else if( ua.indexOf( "facebookexternalhit" ) !== -1 ){
        session.bot = "facebook";
      }else if( ua.indexOf( "Mail.RU_Bot/" ) !== -1 ){
        session.bot = "mail.ru";
      }else if( ua.indexOf( "DomainSigmaCrawler/" ) !== -1 ){
        session.bot = "domainsigma";
      }else if( ua.indexOf( "YandexBot/" ) !== -1 ){
        session.bot = "yandex";
      }else if( ua.indexOf( "Twitterbot/" ) !== -1 ){
        session.bot = "twitter";
      }else if( ua.indexOf( "AdvBot/" ) !== -1 ){
        session.bot = "advbot";
      }else if( ua.indexOf( "SeznamBot/") !== -1 ){
        session.bot = "seznam";
      }else if( ua.indexOf( "TweetmemeBot/" ) !== -1 ){
        session.bot = "datasift";
      }else if( ua.indexOf( "SemrushBot/" ) !== -1 ){
        session.bot = "semrush";
      }else if( ua.indexOf( "CCBot/" ) !== -1 ){
        session.bot = "commoncrowl";
      }else if( ua.indexOf( "MJ12bot/" ) !== -1 ){
        session.bot = "majestic";
      }

      // Detect Safari & Chrome, special emojis (none, actually)
      // console.log( "User Agent", ua );
      if( ua.indexOf( "Safari" ) !== -1 ){
        if( ua.indexOf( "Chrome" ) !== -1 ){
          session.is_chrome = true;
          // trace( "CHROME" );
        }else{
          session.is_safari = true;
          // trace( "SAFARI" );
        }
      }else if( ua.indexOf( "rv:" ) !== -1
      && ( ua.indexOf( "Gecko" ) !== -1 || ua.indexOf( "Mozilla" ) !== -1 )
      ){
        session.is_firefox = true;
      }

      // Detect "old" browsers, before ie9. This forces the "slim" mode.
      session.is_old_browser = false;
      if( ua.indexOf( " MSIE " ) !== -1 ){
        session.is_ie = true;
        if( ua.indexOf( "11,") !== -1 ){
          // This is IE11
        }else if( ua.indexOf( "10.0") !== -1 || ua.indexOf( "10.6") !== -1 ){
          // This is IE10
        }else if( ua.indexOf( "9.0") !== -1 ){
          // This is IE9
        }else{
          // This is before IE9
          session.is_old_browser = true;
        }
      }else if( session.is_chrome ){
      }else if( session.is_safari ){
      }else if( session.is_firefox ){
        if( ua.indexOf( "Mozilla/5" ) === -1 
        &&  ua.indexOf( "Mozilla/4" ) === -1
        ){
          // This is before firefox 4
          session.is_old_browser = true;
        }
      }else if( !session.bot ){
        trace( "BUG? Weird UA, force slim mode", ua );
        session.is_old_browser = true;
      }

      // Detect involved host, ie how the server was reached
      session.set_host( req.headers[ "host" ] );

      // Expect a javascript client activity, if none... noscript browser
      if( l8.server && !session.bot ){
        setTimeout( function(){
          if( session.can_script === "init" ){
            trace( "Can't script", ua, req.url );
            session.can_script = false;
          }
        }, 60 * 1000 );
      }else{
        session.can_script = true;
      }

    } // if new

    if( session.bot ){
      session.can_script = false;
      session.is_slim    = true;
      session.is_novice  = true;
    }

    // Detect mode for low resources clients
    if( query.slim ){
      console.log( "SLIM mode, from ?query" );
      session.is_slim   = true;
      session.is_novice = true;
    }else if( session.is_old_browser && !session.is_slim ){
      console.log( "SLIM mode, old browser", ua );
      session.is_slim   = true;
      session.is_novice = true;
    }
    if( query.fast ){
      session.is_slim = false;
    }

    var json_capa = query.capabilities;
    if( json_capa ){
      try{
        session.set_capabilities( JSON.parse( query.capabilities ) );
      }catch( err ){
        trace( "Bad query/capabilities" );
      }
    }

    // Detect "magic loader" to assert !noscript mode
    var magic = !!req.headers[ "x-magic-loader"];
    if( !magic ){
      session.page_init_done = false;
    }

    // Detect offline local session
    if( req.headers[ "x-kudo-offline" ] ){
      console.log( magic_msg + "OFFLINE fallback detected" );
      // The requester is a local cached file, ?page=offline
      debugger;
      session.is_offline = true;
      //session.host = "local";
      session.can_script = true;
      session.is_app = true;
      // Browserified is already there, it is the current requester
      session.app_init_done = true;
      // But magicScript is not
      session.page_init_done = false;
      session.is_slim = false;
      session.magic_loader = true;
      magic = true;
    }

    magic_msg = magic ? "magic, " : "";
    if( !magic || l8.client ){
      // trace( "LOCAL URL: " + req.url, "script", session.can_script );
    }else{
      var referer = req.headers[ "referer" ];
      if( session.can_script === true ){
        trace( magic_msg + "URL(script): " + req.url, "ua", session.ua );
      }else if( session.can_script === false ){
        if( !session.bot ){
          trace( magic_msg + "URL(noscript): " + req.url, "ua", session.ua );
          referer && trace( "Referer: " + referer );
        }
      }else if( session.can_script === "init" ){
        trace( magic_msg + "URL(init-script): " + req.url, "ua", session.ua );
        referer && trace( "Referer: " + referer );
      }else{
        trace( magic_msg + "BUG? bad script flag state, URL: " + req.url );
        referer && trace( "Referer: " + referer );
      }
    }

    // Detect can_script cookie
    if( session.get_cookie( "can_script" ) ){
      if( session.can_script === "init" ){
        session.can_script = true;
      }else if( session.can_script === false ){
        console.warn( magic_msg + "BUG? noscript client set 'can_script' cookie" );
        session.can_script = true;
      }
    }

    // Remember that content was ajax/magic loaded
    session.magic_loader = magic;

    // Detect 2 "magic loader" in a row to start client side application
    // var was_magic = session.magic_loader;

    // But only after a login and never in "slim" mode.
    session.is_app
    = true // = was_magic 
    && magic 
    && session.can_script 
    && !session.is_slim 
    && session.visitor
    && Config.dev_mode; // ToDo: it needs more debugging to go into production

    if( !session.is_app ){
      // console.log( "Server mode" );
      session.app_init_done = false;
      session.changes       = 0;
    }else{
      // l8.client && console.log( "Switching to client mode / app mode" );
    }

    // Detect cookie normally set by some script in all pages, unless noscript
    if( session.can_script === "init" ){
      if( session.get_cookie( "can_script" ) ){
        session.can_script = true;
      }
    }

  }

  // Switch to proper Ephemeral Machine, can be asynchronous
  var domain;
  if( !req.kudo_query ){
    trace( magic_msg + "Attempt to extract domain from not parsed query" );
    debugger;
    domain = null;
  }else{
    domain = req.kudo_query.kudo;
    if( domain ){
      domain = domain.toLowerCase();
    }
  }

  if( !domain
  || domain === "domain"
  || domain === "domaine"
  // ToDo: avoid this:
  || domain === session.i18n( "domain" ).toLowerCase()
  ){
    domain = session.domain;

  // Special "search" keyword is to explore #domain tagged proposition in main
  }else if( domain === "search" ){
    domain = null;
    session.set_filter( "#domain" );

  }else{
    // trace( magic_msg + "Domain", domain );
  }
  session.set_domain( domain );

  if( session.boxon ){
    // ToDo: what if multiple requests *before* machine init is completed?
    // Right now, the user must "refresh". This should not happen often.
    if( l8.client )debugger;
    // trace( "Ephemeral machine", domain, "is starting, requeue request" );
    session.boxon( function(){ HttpQueue.put( req, res ); } );
    return false;
  }

  // When entering a domain, current visitor needs to be logged in again
  if( session.delayed_login ){
    // Visitor is authentic
    http_repl_commands.login( session.delayed_login, "cli" );
    session.visitor = Persona.find( session.delayed_login );
    session.delayed_login = null;
  }

  if( session.visitor
  && session.visitor.machine !== Ephemeral.Machine.current
  ){
    trace( magic_msg + "BUG? bad machine for session visitor " + session.visitor
    + ", domain: " + req.kudo_query.kudo
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

  // When there is a ?xxxx, the path is not relevant and shall be ignored
  if( data ){
    req.url = req.url.replace( /.*\?/, "?" );
  }

  var more = query.i2;
  if( more ){ data += " " + more; }
  more = query.i3;
  if( more ){ data += " " + more; }
  more = query.i4;
  if( more ){ data += " " + more; }
  more = query.i5;
  if( more ){ data += " " + more; }
  more = query.i6;
  if( more ){ data += " " + more; }
  more = query.i7;
  if( more ){ data += " " + more; }
  more = query.i8;
  if( more ){ data += " " + more; }
  more = query.i9;
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
  l8 = require( "l8/lib/queue.js" );
  HttpQueue = l8.queue( 1000 );
  if( !HttpQueue ){
    console.error( "BUG, bad l8.queue()" );
    return false;
  }
  if( host ){
    Config.host = host;
  }
  Session.start_change_dispatcher();
  basic_style_http_server( port, handle_repl_input );
  return true;
}

function handle_repl_input( session, r ){

  if( !r ){
    console.log( "Invalid input in handle_repl_input" );
    debugger;
    return;
  }
  // printnl( link_to_command( r ) );
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

    }); // each arg

    var code = http_repl_commands[ cmd ];

    if( !code ){
      printnl( "Enter 'help'" );

    }else{
      // When running a command, assume that current page will need a refresh
      if( cmd !== "page" && Session.current ){
        Session.current.redirect_back();
      }

      var result;
      try{
        result = code.apply( cmd, args2 );
      }catch( err ){

        // If err is a boxon or a promise then request will be rescheduled
        if( err.boxon || err.then ){
          ( err.boxon || err.then )( 
            function(){
              HttpQueue.put( PendingResponse.request, PendingResponse );
            }
          );
          result = null;
        }

        // Else, exception is rethrown
        throw err;
      }

      if( false && cmd !== "page" ){
        http_repl_history.unshift( r );
      }
      return result;
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
    'Expires': '0'
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
  Config    = cfg;
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
  kudo_scope.get_query   = function(){
    return PendingResponse.request.kudo_query;
  };
  kudo_scope.cls         = cls;
  kudo_scope.pn          = pn;
  kudo_scope.printnl     = printnl;
  if( !start_http_repl( kudo_scope, port, host ) ){
    console.error( "ui1http.js - !!! Could not start." );
    return null;
  }
  // ui1server is a f( req, res ) type of function
  return ui1server;
};
