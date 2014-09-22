//  ui1.js
//    First UI for Kudocracy, test/debug UI, HTTP based
//
// Jun 11 2014 by @jhr, extracted from main.js

"use strict";


var config = {
  
  url:            "http://simpliwiki.com/vote",

  src:            "http://simpliwiki.com/",

  wiki:           "http://simpliwiki.com/kudocracy/",

  style:          "http://simpliwiki.com/simpliwiki.css",

  index_style:    "http://simpliwiki.com/style.css", // Specific for index page

  shortcut_icon:  "http://simpliwiki.com/yanugred16.png",

  icon:           '<img src="http://simpliwiki.com/yanugred16.png" type="image/png" height="16" width="16"/>',

  // The UEB icon (Universal Edit Button, a 'standard')
  ueb_icon:       '<img src="http://simpliwiki.com/ueb16.png" type="image/png" height="16" width="16"/>'

  
};


var Kudo = {}; // start_http_repl() actualy initializes it

var l8;        // = Kudo.l8; after call to start_http_repl
var Ephemeral; // = Kudo.Ephemeral;
var Topic;     // ...
var Vote;
var Persona;
var Delegation;
var Comment;

// My de&&bug() and de&&mand() darlings. process_kudo_imports() inits those
var de;
var trace;
var bug;
var mand;
var assert;

// More imports
var value;
var pretty;
var _;

// ease dealing with "arguments" pseudo array

function slice( an_array_like, start ){
  var len = an_array_like.length;
  var another_array = [];
  var jj = 0;
  for( var ii = start || 0 ; ii < len ; ii++ ){
    another_array[ jj++ ] = an_array_like[ ii ];
  }
  return another_array;
}


var as_array = slice;


function slice1( an_array_like ){
  return slice( an_array_like, 1 );
}


// Better hashmap for sets. It avoid issues with x.__proto__ for example.

var obj_create = Object.create;

function set(){ return obj_create.call( null, {} ); }


/* ---------------------------------------------------------------------------
 *  Minimal HTTP session management
 *    Session is associated to source ip address
 *    ToDo: use a cookie, a secure one
 *    Note: that session cookie must be 'shared' with simpliwiki to enable
 *    a unified login whereby login in kudocracy means login in simpliwiki and
 *    vice-versa.
 */

function Session( id ){
// Constructor, called by .login() only (except for default local session)
  // Return existing obj with same id if any
  var session = Session.all[ id ];
  if( session )return session;
  // Or init a new object
  this.id = id;
  this.clear();
  Session.all[ id ]  = this;
  return this;
}


Session.all = {};


Session.login = function( id ){
  if( !Session.current || id !== Session.current.id ){
    Session.set_current( new Session( id ) );
  }
  return Session.current;
};


Session.prototype.clear = function(){
  this.can_script      = true;
  this.lang            = "en";
  this.is_safari       = false; // emoji handling, poor
  this.is_chrome       = false; // idem
  this.page_builder    = null;
  this.boxon           = null;
  this.delayed_login   = null;
  this.auto_lang       = true;
  this.domain          = "";
  this.machine         = Ephemeral.Machine.main;
  this.visitor         = null;
  this.expert          = true;
  this.novice          = false;
  this.url             = "";
  this.title           = "";
  this.current_page    = []; // tokens, input was space separated
  this.previous_page   = [];
  this.can_pushState   = true;
  this.pushState       = "";
  this.needs_twitter   = false;  // <script> include of twitter intent lib
  this.filter_query    = "";
  this.filter          = "";
  this.filter_tag_entities = [];
  this.filter_tag_labels   = []; // As strings, includes "computed" tags
  this.sort_criterias  = [];
  this.proposition     = null;
  this.agent           = null;
  this.tag_set         = null;
  return this;
};


Session.prototype.is_local = function(){
  return this.ip === "127.0.0.1";
};


var i18n_table = require( "./ui1i18n.js" );


Session.prototype.set_lang = function( lang ){
  if( lang ){
    this.lang = lang;
    this.auto_lang = false;
  }
  return this;
};


Session.prototype._set_domain = function( domain ){
  
  if( !domain ){
    Ephemeral.Machine.main.activate();
    return this;
  }
  
  // If machine is started, switch to it and return
  //domain = "@" + domain;
  var machine = Ephemeral.Machine.find( domain.toLowerCase() );
  if( machine ){
    // ToDo: deal with machine beeing initialized
    this.machine = machine;
    this.domain  = machine.label;
    machine.activate();
    return this;
  }
  
  // Need to start a new machine, from main machine
  Ephemeral.Machine.main.activate();
  
  // Only if a valid persona exists, with a #domain tag
  var domain_persona = Persona.find( "@" + domain );
  if( !domain_persona )return this;
  if( !domain_persona.is_domain() )return this;
  
  machine = new Ephemeral.Machine( {
    owner: domain
  } );
  machine.activate();
  
  // Signal caller that machine will be available later
  this.machine = machine;
  this.domain = machine.label;
  this.boxon = Kudo.boxon();
  
  // When machine init is done, some more work remains
  var that = this;
  Ephemeral.start( null /* bootstrap() */, function( err ){
    // Done
    var box = that.boxon;
    that.boxon = null;
    box( true );
  });
  
  return this;
  
};


Session.prototype.set_domain = function( domain ){
  var current = Ephemeral.Machine.current;
  this._set_domain( domain );
  if( Ephemeral.Machine.current === current )return this;
  trace( "Changed domain", current );
  // When machine is ready, log current visitor if any
  this.proposition = this.agent = this.tag_set = null;
  if( this.visitor ){
    this.delayed_login = this.visitor.label;
  }
  this.visitor = null;
  return this;
};


Session.prototype.set_current_page = function( parts ){
  this.current_page = parts;
  this.url = config.url + "/?page=" 
  + querystring.escape( parts.join( " " ) ).replace( /%20/g, "/" );
  if( this.domain ){
    this.url += "&domain=" + this.domain;
  }
  this.title = parts[ 0 ];
};


Session.prototype.i18n = function( msg ){
// Returns the i18n version of the msg.
// "msg" is usually the "en" version of the message, with the translated
// version in "per language" tables.
// Sometimes "msg" is a "fake" msg that is not needed in english but is
// needed in some other languages. "il y a" is an example of such messages.
  var lang = this.lang;
  if( !i18n_table[ lang ] ){
    console.log( "newLanguage:", lang );
    i18n_table[ lang ] = {};
  }
  // Lang specific msg, or default "en" msg, or msg itself if no translation
  return i18n_table[ lang ][ msg ]
  || i18n_table[ "en" ][ msg ]
  || msg;
};


Session.prototype.novice_mode = function(){
  this.expert = false;
  this.novice = true;
  return this;
};


Session.prototype.expert_mode = function(){
  this.expert = true;
  this.novice = false;
  return this;
};


Session.prototype.has_filter = function(){
  return !!this.filter.length;
};


Session.prototype.has_delegateable_filter = function(){
  return !!this.filter_tag_entities.length;
};


Session.prototype.has_enough_filter = function(){
// Predicates to command display of propositions
  if( this.filter_query )return true;
  if( this.filter_tag_entities.length )return true;
  if( !this.filter )return false;
  if( this.filter_tag_labels.indexOf( "#draft" ) !== -1 )return true;
  if( this.filter_tag_labels.indexOf( "#abuse" ) !== -1 )return true;
  if( this.filter_tag_labels.indexOf( "#tag"   ) !== -1 )return true;
  // Look for a persona tag
  var list = this.filter_tag_entities;
  var len  = list.len;
  var tag;
  for( var ii = 0 ; ii < len ; ii++ ){
    tag = list[ ii ];
    if( tag.get_persona() )return true;
  }
  return false;
};


Session.prototype.filter_label = function( separator ){
// Return separated list of tags and keywords extracted from filter, trimmed
// Return "" if no filter
  var text = this.filter;
  if( this.filter_query ){
    text += " " + this.filter_query;
  }
  if( !text )return "";
  // Trim & remove sort criterias
  text = text
  .trim()
  .replace( /[+\-][a-z_]*/g, "" );
  // Change spaces into specified separator
  if( separator ){
    text = text.replace( / /g, separator );
  }
  // Remove #s
  return text; // .replace( /#/g, "" );
};


Session.prototype.delegateable_filter = function(){
  var buf = [];
  Ephemeral.each( this.filter_tag_entities, function( tag ){
    buf.push( tag.label );  
  } );
  return buf.join( " " );
};


Session.prototype.set_filter = function( text ){
// Parse text and extract valid tags and sort criterias, space separated.
//   Sort criterias are words prefixed by either + or -
// Return filter, with " " prefix and " " postfix, to ease indexOf() tests.
// Return "" if nothing useful was found.
// Abusive tags are removed, unless #abuse is found first
// Side effect:
//   Collect detected tag entities into session.filter_tag_entities array.
//     Abusive tags are skipped, unless "abuse" tag is specified first.
//   Collect sort criterias into session.sort_criterias array.

  // Filter out null, undefined, etc
  if( typeof text !== "string" )return "";
  
  text = text.trim();
  var old_criterias = this.proposition && this.sort_criterias.join( " " );
  if( text ){

    var with_abuses = false;
    var tags = [];
    var tag_entity;
    var sort_criterias = [];
    var query = "";

    // Sanitize, filter out weird stuff
    this.filter = text.replace( /[^+\-#A-Za-z0-9_ ]/g, "" );
    
    // Handle "all" pseudo filter
    if( this.filter === "all" ){
      this.filter = "";
    
    // Handle normal stuff, if anything remains, ie space separated things
    }else if( this.filter ){ 

      var buf = [];
      var tag_buf = [];
      this.filter.split( " " ).forEach( function( tag ){

        // Remove too short stuff, or empty stuff, unless valid reserved tag
        if( tag.length <  2 && !Topic.reserved( tag ) )return;

        // +xxx sort criterias
        if( tag[0] === "+" ){
          if( sort_criterias.indexOf( tag ) === -1 ){
            sort_criterias.push( tag );
          }
        
        // -xxx descending sort criterias
        }else if( tag[0] === "-" ){
          if( sort_criterias.indexOf( tag ) === -1 ){
            sort_criterias.push( tag );
          }
          
        // Tags
        }else if( tag[0] === "#" ){
          
          // Existing tags
          if( tag_entity = Topic.find( tag ) ){
            if( with_abuses || !tag_entity.is_abuse() ){
              if( tags.indexOf( tag_entity ) === -1 ){
                buf.push( tag );
                tag_buf.push( tag );
                tags.push( tag_entity );
              }
            }
  
          // Computed tags
          }else if( Topic.reserved( tag.substring( 1 ) ) ){
            if( buf.indexOf( tag ) === -1 ){
              buf.push( tag );
              tag_buf.push( tag );
              if( tag === "#abuse" ){
                with_abuses = true;
              }
            }
          }
        // Keyword
        }else{
          if( buf.indexOf( tag ) === -1 ){
            buf.push( tag );
            query += " " + tag;
          }
        }
      });
      if( tag_buf.length ){
        this.filter = ( " " + tag_buf.join( " " ) + " " ).replace( /  /g, " " );
      }else{
        this.filter = "";
      }
      this.filter_query = query.trim().toLowerCase();
      this.with_abuses = with_abuses;
      this.filter_tag_labels = tag_buf;
      this.filter_tag_entities = tags;
      this.sort_criterias = sort_criterias;
      return this.filter;
    }
  }else{
    this.filter = "";
  }
  if( !this.filter ){
    this.filter = "";
    this.filter_query  = "";
    this.filter_tag_labels = [];
    this.filter_tag_entities = [];
    this.sort_criterias = [];
    this.with_abuses = false;
  }
  // When sort criterias change, don't display current proposition first
  if( this.proposition && old_criterias != this.sort_criterias.join( " " ) ){
    this.proposition = null;
  }
  return this.filter;
};


Session.prototype.query = function(){
  return ( this.filter + " " + this.filter_query + " " + this.sort_criterias.join( " " ) )
  .replace( /  /g, " " )
  .trim(); 
};


Session.prototype.without_filter_stuff = function( text ){
// Remove all tags that look like something coming from the current filter.
// Note: remove both xxx and #xxx, # is optional
// Note: does not deal with +/- stuff or other weird stuff, only tags
// Result is trimmed.
  if( this.has_filter() ){
    Ephemeral.each( this.filter_tag_entities, function( tag ){
      var name = tag.name;
      if( name[0] === "#" ){ name = name.substring( 1 ); }
      text = text.replace( /[#A-Za-z_0-9]+/g, function( match ){
        if( match.toLowerCase() === name )return "";
        if( match.toLowerCase() === "#" + name )return "";
        return match;
      });
    });
  }
  text = text.trim();
  return text;
};


Session.prototype.remove_confusing_new_filter = function(){
// In some pages, the #new filter makes no senses
  if( this.filter.indexOf( " #new " ) !== -1 ){
    this.set_filter( this.filter.replace( " #new ", "" ) );
  }
  return this;
};


Session.prototype.strict_new_filter_removed = function( count ){
// In some pages, #new, when alone, it too strict because nothing is new
  if( count )return false;
  if( this.filter.indexOf( " #new ") !== -1 )return false;
  if( this.filter_tag_labels.length !== 1 )return false;
  this.remove_configusing_new_filter();
  return true;
};


Session.set_current = function( session ){
  if( !session )return this;
  if( session === Session.current )return this;
  Session.current = session;
  session.machine.activate();
  if( session.page_builder ){
    PageBuilder.current = session.page_builder;
  }
  return this;
};

// Defaults to no session
Session.current = null; // new Session( "127.0.0.1" );


/*
 *  The http REPL (Read, Eval, Print, Loop) is a very simple UI
 *  to test interactively the Vote engine.
 *
 *  The BASIC style verbs were first introduced in l8/test/input.coffee
 */

l8 = require( "l8/lib/queue" ).l8;
var http        = require( "http" );
var url         = require( "url" );
var querystring = require( "querystring" );

// IO tools. BASIC style

var screen = [];

var cls = function(){
  screen = [];
  set_head( "" );
  set_body( "" );
};

var print = function( msg ){
  ("" + msg).split( "\n" ).forEach( function( m ){ if( m ){ screen.push( m ); } } );
};

var printnl   = function( msg ){ print( msg ); print( "\n" ); };

// Minimal tool to inject some HTML syntax

var http_head = "";
var set_head = function( x ){
  http_head = x;
};

var http_body = "";
var set_body = function( x ){
  http_body = x;
};


// Handling of HTTP requests, one at a time...

var PendingResponse = null;


var basic_style_respond = function( question ){

  if( !PendingResponse )return;

  // If a redirect was required, do it
  if( PendingResponse.redirect ){
    if( PendingResponse.request.session.can_pushState ){
      HttpQueue.put( PendingResponse.request, PendingResponse );
      PendingResponse = null;
      return;
    }
    PendingResponse.writeHead( 302, { Location: PendingResponse.redirect } );
    PendingResponse.end();
    PendingResponse = null;
    return;
  }

  // Response is html
  PendingResponse.writeHead( 200, { 
    'Content-Type':  'text/html',
    'Cache-Control': 'no-cache, no-store, must-revalidate' 
  } );
  
  // Provide some history for the command line
  var options = [];
  http_repl_history.forEach( function( item ){
    options.push( '<option value="' + item + '">' );
  });
  
  // Use registered HTML stuff if some was provided
  var head = http_head;
  var body = http_body;
  http_head = http_body = null;
  
  // Or else build a body here
  if( !body ){
    body = [
      '<div id="container" style="background-color: white;">',
      '<div class="content" id="content">',
      screen.join( "<br>" ),
      '</div>',
      '<div id="footer">',
      '<form name="question" url="/" style="width:50%">',
      question,
      '<input type="text" name="i" placeholder="a command or help" autofocus list="history" style="width:99%">',
      '<datalist id="history">',
      options.join( "\n" ),
      '</datalist>',
      '<input type="submit">',
      link_to_command( "help" ), link_to_page( "index" ),
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
    title = '\n<title>Kudocracy test, liquid democracy meets twitter...</title>\n';
    if( !head ){
      head = '\n<link rel="stylesheet" type="text/css" href="'
      + config.style
      + '">';
    }
  }

  PendingResponse.end( [
    '<!DOCTYPE html>\n<html>',
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


var HttpQueue = l8.queue( 1000 );


var basic_style_input = l8.Task( function( question ){

  l8.step( function(){
    basic_style_respond( question );
    HttpQueue.get() } );

  l8.step( function( req, res ){
    var result = handle_basic_style_request_input( req, res );
    return result || basic_style_input( question );
  });

} );


function handle_basic_style_request_input( req, res ){
  
  var session = req.session;
  
  // If pushState style redirect
  var redir = res.redirect;
  if( redir ){
    Session.set_current( session );
    PendingResponse = res;
    Session.current.pushState = redir;
    res.redirect = null;
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
  if( !session ){
  
    trace( "URL: " + req.url );
    
    // Detect change in source ip address, when change, logout
    // ToDo: some session management
    var ip = req.headers[ "x-forwarded-for" ]
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;
    // ToDo: detect simpliwiki login credentials
    session = req.session = Session.login( ip );
    session.timestamp = l8.now;

    // Detect french language, unless language was set by visitor first
    if( session.auto_lang ){
      de&&mand( req );
      var langs = req.headers[ "accept-language" ];
      if( langs && langs.indexOf( ",fr" ) !== -1 ){
        session.set_lang( "fr" );
      }
    }
    
    // Detect Safari, special emojis
    var ua = req.headers[ "user-agent" ];
    session.ua = ua;
    console.log( "User Agent", ua );
    if( ua.indexOf( "Safari" ) !== -1 ){
      if( ua.indexOf( "Chrome" ) !== -1 ){
        session.is_chrome = true;
        trace( "CHROME" );
      }else{
        session.is_safari = true;
        trace( "SAFARI" );
      }
    }
  
    var parsed_url = url.parse( req.url, true );
    query = req.post_query_data || parsed_url.query;
    res.query = query;
  }else{
    query = res.query;
  }

  // Switch to proper Ephemeral Machine, can be asynchronous
  var domain = res.query.domain;
  if( !domain
  || domain === "Domain"
  || domain === "Domaine"
  || domain === i18n( "Domain" )
  ){
    domain = session.domain;
  }else{
    trace( "Domain", domain );
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
    trace( "BUG? bad machine for session visitor " + session.visitor
    + ", domain: " + res.query.domain
    + ", machine: " + session.visitor.machine.id
    + ", current machine: " + Ephemeral.Machine.current.id 
    );
    de&&mand( !session.visitor || session.visitor.machine === Ephemeral.Machine.current );
  }

  session.response = PendingResponse = res;
  session.request  = PendingResponse.request =  req;
  
  // Collect ?i=...&i2=...&i3... into space separated command + arg list
  var data = query.i;
  // ?page= is valid alternative for ?i=page&...
  if( !data && query.page ){
    data = "page " + query.page;
  }
  // ?api= is valid alternative for ?i=api&....
  if( !data && query.api ){
    data = "api " + query.api;
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


function basic_style_http_server( port, input_handler ){
  
  var koa = require( "koa" );
  var app = koa();
  
  app.use( function*( next ){
    HttpQueue.put( [ this.req, this.res ] );
    this.respond = false;
    //yield *next;
  });

  http.createServer( app.callback() ).listen( port );
  
  // http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );

  // The main loop
  l8.task( function(){
    
    l8.step( function(){ trace( "Web test UI is running on port " + port ); });
    
    l8.repeat( function(){
      l8.step( function(){    basic_style_input( "" ); });
      l8.step( function( r ){ return input_handler( Session.current, r ); });
    });
    
  });

}


/*
 *  Page builder, use fast concat of array items
 */

function PageBuilder(){
  this.session = null;
  this.expert  = true;
  this.novice  = false;
  this._head = [];
  this._body = arguments.length ? as_array( arguments ) : [ "" ];
  this.length = this._body.length;
}


PageBuilder.prototype.set_session = function( session ){
  this.session = session;
  session.page_builder = this;
  this.expert  = session.expert;
  this.novice  = session.novice;
  return this;
};


PageBuilder.prototype.toString = function(){
  return this.body();
};


PageBuilder.prototype.set = function( head /* , ...body */ ){
  this._head = head || [];
  this._body = arguments.length > 1 ? slice1( arguments ) : [ "" ];
  this.length = this._body.length;
};


PageBuilder.prototype.error = function( /* ...body */ ){
  this._head = page_style( "error" );
  this._body = as_array( arguments );
  this.length = this._body.length;
  return;
};


PageBuilder.prototype.push = function(){
  Array.prototype.push.apply( this._body, arguments );
  this.length = this._body.length;
};


PageBuilder.prototype.concat = function( a ){
  Array.prototype.push.apply( this._body, a );
  this.length = this._body.length;
};


PageBuilder.prototype.join = function( sep ){
  var body = sep ? this._body.join( sep ) : this._body.join( "" );
  this._body = [ body ];
  this.length = this._body.length;
  return body;
};


PageBuilder.prototype.head = function( set ){
  if( set ){ this._head = set; }
  return this._head;
};


PageBuilder.prototype.body = function( set ){
  if( set ){ this._body = as_array( arguments ); }
  var body = this._body;
  if( body.length === 1 )return body[0].toString();
  this._body = [ body = body.join( "" ) ];
  this.length = this._body.length;
  return body;
};


/*
 *  Test UI is made of pages.
 *
 *  Each page is a function that returns an array of two elements. The
 *  first element is to become the "head" of the HTML response, the second
 *  element is the body.
 *  Note: this is currently purely sync but moving to async will be simple to
 *  do when required.
 */

var http_repl_pages = {
  index:        page_index,
  help:         page_help,
  login:        page_login,
  visitor:      page_visitor,
  persona:      page_persona,
  delegations:  page_delegations,
  leaders:      page_leaders,
  groups:       page_groups,
  proposition:  page_proposition,
  propositions: page_propositions,
  tags:         page_propositions,
  votes:        page_votes,
  ballot:       page_ballot,
  ballot2:      page_ballot2
};


function page( name ){
  var f = name && http_repl_pages[ name ];
  // No name => list names
  if( !f ){
    for( name in http_repl_pages ){
      printnl( name );
    }
    return;
  }
  var result = new PageBuilder();
  PageBuilder.current = result;
  result.set_session( Session.current );
  // Parse filter from extra parameters
  var params = as_array( arguments );
  if( f.length && params.length > f.length ){
    result.session.set_filter( params.slice( f.length ).join( " " ) );
    params = params.slice( 0, f.length );
  }
  result.session.previous_page = result.session.current_page;
  result.session.set_current_page( as_array( arguments ) );
  try{
    f.apply( result, params );
  }catch( err  ){
    result.push( trace( "Page error", name, err, err.stack ) );
  }
  set_head( result.head() );
  // Handle history.pushState() style of redirect
  var redir = result.session.pushState;
  if( !redir && result.session.can_pushState ){
    var state = result.session.query();
    if( state ){
      redir = "?page=" 
      + querystring.escape( params.join( " " ) + " " + state )
      .replace( /%20/g, "/" );
      if( result.session.domain ){
        redir += "&domain=" + result.session.domain;
      }
    }
  }
  if( redir ){
    trace( "Redir", redir, "Session's url", Session.current.url );
    false && result.push(
      '\n<script>history.replaceState( ',
      json_encode( redir ), ", ",
      json_encode( Session.current.title ), ", ",
      json_encode( redir ),
      ');</script>'
    );
    result.session.pushState = null;
  }
  var body = result.body();
  set_body( body );
}


function encode_ref( ref ){
  var index_query = ref.indexOf( "?" );
  var path;
  var query;
  if( index_query !== -1 ){
    path = ref.substring( 0, index_query -1 );
    query = ref.substring( index_query + 1 );
    query = querystring.escape( query );
  }else{
    path = ref;
  }
  // Change spaces into / separator in path
  path = path.replace( / /g, "/" );
  // Encode each part of path
  path = path.replace( /[^\/]+/, function( match ){
    return encodeURIComponent( match );
  });
  return query ? path + "?" + query : path;
}


PageBuilder.prototype.redirect = function( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !this.session.response )return;
  var r;
  if( !page ){
    r = "?i=/";
  }else{
    // Note: / does not need encoding, and it's ugly when encoded
    r = "?page=" 
    + querystring.escape( page )
    .replace( /%2F/g, "/" )
    .replace( /%20/g, "/" );
  } 
  if( this.session.domain ){
    r += "&domain=" + this.session.domain;
  }
  this.session.response.redirect = r;
};


PageBuilder.prototype.redirect_back = function( n, text ){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  var page = this.session.current_page;
  if( !page || !page.length )return this.redirect( "propositions" );
  page = page.slice();
  // When going back to page "leaders" keep the optional focused proposition
  if( page[0] === "leaders" && n === 1 ){ n = 2; }
  var target;
  if( n < 0 ){
    n = page.length + n;
  }
  if( n ){
    target = page.slice( 0, n );
  }else{
    target = page;
  }
  // When going back to page persona, add the name
  if( n === 1
  && ( target[0] === "persona" )
  ){
    target.splice( 1, 0, this.session.current_page[1] );
  }
  if( text ){ target.push( text ); }
  this.redirect( target.join( "/" ) );
};


/*
 *  <a href="...">links</a>
 */

function link_to_command( cmd, title, html_title ){
  var url_code = querystring.escape( cmd );
  var r = '<a href="?i=' + url_code;
  if( html_title ){
    r += '" title="' + html_title;
  }
  r += '">' + ( title || cmd ) + '</a>';
  return r;
}


function link_to_wiki( page, title ){
  if( !config.wiki )return "";
  var domain = Session.current.domain;
  if( domain ){
    domain += "/";
  }
  var img = config.ueb_icon;
  var encoded_page;
  // #tags are inside the domain local wiki, #xxx becomes on_xxxx
  // ToDo: change on_ into tag_
  if( page[ 0 ] === "#" ){
    encoded_page = domain + "on_" + page.substring( 1 );
  // @user are inside the global wiki
  }else if( page[ 0 ] === "@" ){
    encoded_page = page;
  // words are inside the domain local wiki
  }else{
    encoded_page = page;
    if( SW.wikiword.test( encoded_page ) ){
      // Kudoxxxx word are, however, inside the global wiki
      if( "Kudo" === encoded_page.substring( 0, 3 ) ){
        encoded_page = page;
      }else{
        encoded_page = domain + page;
      }
    // Not a wiki word? turn it into one, using [xxx] syntax
    }else{
      encoded_page = "[" + page + "]";
      if( !SW.wikiword.test( encoded_page ) ){
        // Humm... should not happen
        trace( "BUG? cannot wikinamize", page );
        // Get rid of invalid characters, slightly brutal...
        encoded_page = page.replace( /[A-Za-z_0-9]/g, "" );
        // If nothing remain, use [x] where x is number of char in inital name
        if( !encoded_page ){
          encoded_page = "[" + page.length + "]";
        // Or else, use [xxx] where xxx are non problematic chars
        }else{
          encoded_page = "[" + encoded_page + "]";
        }
      }
      encoded_page = domain + encoded_page;
    }
  }
  var href = config.wiki + encodeURI( encoded_page );
  // Add the current authenticated user id, encrypted, valid 10 seconds
  // ToDo: share authentication with simpliwiki
  if( false && Session.current.visitor ){
    href += "&kudocracy="
    + Kudo.now() + "_" + encodeURI( Session.current.visitor.label );
  }
  if( !title ){
    return '<a href="' + href + '">' + img + '</a>';
  }else{
    return '<a href="' + href + '">' + title + img + '</a>';
  }
}


function link_to_page( page, value, title ){
  
  var url_code;
  
  var is_index = page === "index";
  if( is_index ){
    title = '<strong>Kudo<em>c</em>racy</strong>';
    if( Session.current.domain ){
      title
      += " <em>"
      + link_to_wiki( "HomePage", Session.current.domain )
      + "</em>"; 
    }
  }
  
  if( page[0] === "@" ){
    url_code = querystring.escape( page );
    if( !value ){ value = page; }
    page = value;
  }else{
   url_code = querystring.escape( value || "" );
  }
  if( !value ){ value = page; }
  if( !title ){ title = value; }
  
  if( title[0] === "#" ){
    title = title.replace( /#a-z/g, function( tag ){
      return i18n( tag );
    });
  }else{
    title = i18n( title );
  }
  
  page = encode_ref( page );
  
  if( Session.current.domain && !is_index ){
    url_code += "&domain=" + Session.current.domain;
  }
  
  return '<a href="?page=' + page + "/" + url_code + '">'
  + title
  + '</a>';
  
}


function link_to_proposition_page( proposition ){
  if( !proposition )return;
  if( typeof proposition === "string" ){
    return link_to_page( "proposition", proposition );
  }
  var title = proposition.label;
  return link_to_page( "proposition", title, title );
}


function link_to_persona_page( persona, title ){
  if( !persona )return "";
  if( typeof persona === "string" ){
    return link_to_page( "persona", persona, title );
  }else{
    persona = persona.label;
  }
  if( !title ){
    title = persona;
  }
  return link_to_page( "persona", persona, title );
}


function link_to_twitter_user( user, title ){
  if( !user )return "";
  return '<a href="https://twitter.com/' + user + '">' 
  + ( title ||  user )
  + '</a>';
}


function link_to_twitter_tags( tags, title ){
  if( tags.indexOf( " " ) !== -1 ){
    var buf = [];
    tags.split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_twitter_tags( tag ) );
    });
    return buf.join( " " );
  }
  return '<a href="https://twitter.com/search?f=realtime&q=%23'
  + tags.substring( 1 )
  + '">' + ( title || tags ) + '</a>';
}


function link_to_twitter_filter( query, title ){
  return '<a href="https://twitter.com/search?f=realtime&q='
  + querystring.escape( query )
  + '">' + ( title || query ) + '</a>';
}


/*
 *  Page common elements/parts
 */
 
var json_encode = function( value ){
  // Like JSON.stringify() but safe to XSS regarding </script> & co
  // See http://stackoverflow.com/questions/4176511/embedding-json-objects-in-script-tags
  var txt = JSON.stringify( value );
  return txt.replace( /</g, "\\u003c").replace( /-->/g, "--\\>" );
};

  
Session.prototype.configScript = function( title, url ){
// Client side setup, dynamic, different for each page

  // ToDo: should use sw_ctx.xxxx instead of sw_xxxx
  var ctx = {
    // System level
    domain:      this.domain,
    visitor:     ( this.visitor && this.visitor.label ),
    twid:        this.twid,
    can_script:  this.can_script,
    lang:        this.lang,
    // Page level
    title:       this.title,
    url:         this.url
  };
  
  return [
    //this.htmlScript( this.getCookieScript, true), // true => sync
    '\n<script type="text/javascript">',
    //this.getCookieScript,
    'var sw_ctx = '          + json_encode( ctx ),
    //'var sw_previous_content_displayed = false',
    // Helper to detect "back" button, don't apply to Do pages
    'var sw_time_built = '   + (new Date()).getTime(),
    'var sw_time_offset = 0',
    // Browser local time is unreliable, need to evaluate offset
    'var sw_touch_device = !!("createTouch" in document)',
    'var de  = ' + !!de,
    'var nde = false',
    'var bugC = (window.console && console.log '
    + '&& function bug( m ){ '
    +   'console.log( "kudocracy: " + m);'
    +   'if( ("" + m).toLowerCase().indexOf( "err" ) !== -1 )debugger;'
    +   '})'
    + ' || (de = false)',
    'de&&bugC( "loading " + sw_ctx.url + "[" + sw_ctx.title + "]" );',
    'if( window.history ){ history.replaceState( sw_ctx.url, sw_ctx.title, sw_ctx.url ); }',
    'var sw_ready = true',
    //'/* ]]> */',
    '</' + 'script>\n'
  ].join( "\n");
  
};


Session.prototype.htmlScript = function( javascript, not_async ){
// Called while building an HTML page.
// "javascript" is either a Function object or a string.
// Returns HTML text for javascript code, either inlined or src referenced.
// src is for static code only, not variable code.

  // I support client without any javascript, sounds crazy these days...
  if( !this.can_script )return "";

  // The name of the "static" file is based on the name of the function
  var filename = javascript.name;

  // Convert Function object to string
  javascript = javascript.toString();

  // If code is a function, with a name, function gets called when file is
  // loaded. The function is called without any parameters, this may help
  // it figure out that it is called for the first time.
  // Commented out.
  // Why: it's better to load scripts dynamically, see loadfire
  if( filename ){
    javascript += "\n;" + filename + "();";
  }

  // Check if already in cache, if not do some basic minification & cache
  if( false && filename && !Sw.fileIsCached( filename + ".js") ){
    // Remove comments
    javascript = javascript.replace( /[^\\:]\/\/ .*(?=[\n\r])/g, '' );
    Sw.cacheFile( filename + ".js", "text/javascript", javascript );
  }else{
    // Remove comments
    javascript = javascript.replace( /[^\\:]\/\/ .*(?=[\n\r])/g, '' );
  }

  // And that's it for this case, unless tracing is enabled
  if( false & filename && !this.inline_de ){
    filename = filename + ".js";
    if( not_async ){
      return '\n<script src="' + filename + '"></script>\n';
    }
    javascript = 'loadfire( "' + filename + '")';
    // return '<script src="' + filename + '"></script>'
  }

  // When not including a Function or in "inline" trace mode, embed the script
  return [
    '\n<script>\n',
    javascript,  // ToDo: some encoding here?
    '\n</' + 'script>\n'
  ].join( "" );
};


var onloadScript = function onload(){
// Client side
// The code for this function is included by HTML pages.
// It does some init stuff for the page and register additional stuff to init
// once the page is "ready"

  var de = true;
  
  var bugC = function(){
    console.log.apply( console, arguments );
  };

  // Define a "magic loader" that loads pages at light's speed.
  // Works only with browsers that support history.pushState()
  window.sw_magic_loader = function sw_magic_loader( url, back ){
    //!When I looked at the numbers, I saw that when a page loads, at lot
    // of time is spent "parsing" jQuery. About 300ms on my machine. In an
    // attempt to avoid that, I experiment with an alternative page loader
    // that requests a page using ajax and rebuilt the body of the current page.
    // Because the new body reuse the old head, all the scripts that were
    // loaded before (and parsed) are still available for the new page.
    // The html page that I load defines sw_ctx where basically everything
    // about the current page is stored. As a result there is little to no
    // issue with global variables (that you would normally expect to be
    // undefined but that now remember whatever content they had when the
    // previous page was loaded).
    // See also https://github.com/defunkt/jquery-pjax
    
    de&&bugC( "magic loader " + url );
    // Home page has a different style, cannot magic load it
    if( !window.history.pushState
    ||  url.indexOf( "index" ) !== -1
    ){
      // Sorry, no magic
      window.location = url;
      return;
    }
    
    // First get the page's html content, using Ajax
    var time_started = (new Date()).getTime();
    $.ajax( url, {

       // I will handle script tags myself, hence "text" instead of "html"
       dataType: "text",
       cache: false,
       // Provide a "hint" in the query, not used so far
       data: {magic:true},
       beforeSend: function(xhr){ xhr.setRequestHeader( 'X-MAGICLOADER', 'true') },
       complete: function( response, status ){
         var time_received = (new Date()).getTime();
         if( status != "success" ){
           // Meh...
           alert( "" + url + " - " + status + " \n" + "Please refresh" );
           return;
         }
         // When I get the page, change the html body and do what I normally do
         // with $(document).ready(), simple!
         // ToDo: some kind of loadfire.reset() to deregister all callbacks and
         // clear goals.
         var html = response.responseText;
         // Remove itself from response, if present
         html = html.replace( /function onload[\s\S]*?<\/script>/, "<" + "/script>" );
         if( false ){
           // Clear the new body for the page, to avoid any flicker
           $('body').html( "" );
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
         }
         // Collect scripts that in the head and body, ran in new body
         var body = "";
         html = html.replace( /<script[\s\S]*?<\/script>/g, function( s ){
           // Avoid src="http://..." style, to benefit from what was already loaded
           if( s.indexOf( 'src="http' ) >= 0 )return "";
           // de&&bugC( "script:" + s.substring( 0, 100 ) );
           body += s;
           return "";
         });
         // Add what remains of the body (with all scripts moved to the end)
         html = html.replace( /(<body[\s\S]*)(<\/body>)/, function( _, b, eb ){
           body = b + body + eb;
         });
         // Remember where to go "back" (unless already going back)
         if( !back ){
           de&&bugC( "pushState", sw_ctx.url, sw_ctx.title );
           window.history.pushState( sw_ctx.url, sw_ctx.title, sw_ctx.url );
         }
         // Flag, just in case, when a page wants to know how it got loaded
         window.isMagicLoaded = true;
         // Set the new body for the page
         $('body').html( body );

         // Invoke what is normally bound to $('document').ready()
         sw_when_ready();
         de&&bugC(
           "total, "
           + ( (new Date()).getTime() - time_started)
           + " msec. "
           + "transmit, "
           + ( time_received - time_started)
           + " msec. "
           + "process, "
           + ( (new Date()).getTime() - time_received)
           + " msec."
         );
       }
    });
  };

  // Magic loader "back" button handling
  window.onpopstate = function( event ){
    de&&bugC( "onpopstate " + document.location.href + ", " + event.state);
    // Load, true => "back"
    event.state && sw_magic_loader( event.state, true);
  };

  // When the document is fully loaded, I can safely init stuff
  $(document).ready( window.sw_when_ready = function sw_when_ready(){

    // All links go thru magic loader
    $( "a" ).click( function( e ){
      // debugger;
      e = e || window.event;
      var target = e.target || e.srcElement;
      var $link  = $(target).closest( "a" );
      var href   = $link.attr( "href" );
      var label  = $link.text();
      if( window.sw_magic_loader && href.substr( 0, 1 ) == "?" ){
        // Avoid loading by browser
        e.preventDefault();
        // Let the magic operate
        sw_magic_loader( href );
        return;
      }
    } );
    
    window.scrollTo( 0, 0 );
    
    // Let's figure out what is the total height of the window, as we
    // will to make it so that cols x rows of characters fit in it
    var h =  window.innerHeight ? window.innerHeight : $(window).height()
    var w = $(window).width()

    // On iPhone I think that screen.width is more accurate
    if( sw_touch_device && screen && screen.width ){
      w = Math.min( screen.width, w)
    }

    // Remember that because I needed it somewhere else
    sw_width  = w
    sw_height = h

    // On touch devices I slightly change the design because of small screen
    // ToDo: a mobile app, one day... http://www.phonegap.com/about
    // See also http://tech.richardrodger.com/2010/09/30/debug-phonegap-mobile-apps-five-times-faster/
    if( sw_touch_device ){
      // Setting maxWidth helps to avoid auto zooming artifacts
      var w = sw_width = Math.min( screen.width, $(window).width())
      document.body.style.maxWidth = w + "px"
      // document.body.style.lineHeight = "1em;"
      var header = document.getElementById( "header").style
      header.maxWidth = sw_width + "px"
      header.position = "relative"
      header.fontSize = "140%"
      var container = document.getElementById( "container").style
      container.position = "relative"
      container.align    = "left"
      var footer = document.getElementById( "footer").style
      footer.maxWidth = sw_width + "px"	    
      footer.position = "relative"
      footer.fontSize = "120%"
      window.scrollTo( 0, 1 )
    }

    twttr.widgets.load()
  });
  
  return;
  
};


function page_style( title ){
  
  PageBuilder.current.session.needs_twitter = false;
  var buf = [];
  var kudocracy = "Kudocracy";
  if( Session.current.domain ){
    kudocracy += " " + Session.current.domain;
  }
  if( title ){
    buf.push(
      '\n<title>',
      kudocracy,
      ' - ',
      i18n( title ),
      '</title>\n'
    );
  }else{
    buf.push( "\n<title>", kudocracy, "</title>\n" );
  }
  Session.current.title = title || kudocracy;
  buf.push(
    '\n<link rel="stylesheet" href="', config.style, '" type="text/css">',
    '\n<script type="text/javascript" src="http://code.jquery.com/jquery-2.1.1.min.js"></script>',
    '\n<script type="text/javascript" src="http://platform.twitter.com/widgets.js"></script>',
    '\n<script type="text/javascript" src="https://www.google.com/jsapi"></script>',
    '\n<script type="text/javascript">google.load( "visualization", "1.0", { "packages": ["corechart"] } );</script>',
    // Reuse some stuff from simpliwiki
    '\n<script type="text/javascript"> Wiki = {}; </script>'
    //'\n<script src="http://simpliwiki.com/scrollcue.js"></script>',
    //'\n<script type="text/javascript"> Wiki.scrollcueScript( true ); </script>'
    //+ '<script type="text/javascript">' + scrollcue + '\nscrollcue( $ );',
    //+ '\n$.scrollCue( { fade:".fade" } );\n',
    //+ '</script>\n';,
  );
  buf.push(
    Session.current.configScript(),
    Session.current.htmlScript( onloadScript )
  );
  
  return buf.join( "" );
}


function page_header( left, center, right ){
  
  var builder = PageBuilder.current;
  
  left =  link_to_page( "index" )
  + " " + link_to_page( "propositions" )
  + ( left ? " " + left : "" );
  
  if( builder.session.visitor ){
    right = ( ( right && ( right + " " ) ) || "" )
    + link_to_page(
      "visitor",
      "",
      builder.session.visitor.label
    );
  }else{
    right = ( ( right && ( right + " " ) ) || "" )
      + link_to_page( "login" );
  }
  
  return [
    '<div class="header" id="header"><div id="header_content">',
      '<div class="top_left">',
        left || "",
      '</div>',
      '<div class="top_center" id="top_center">',
        center || "",
      '</div>',
      '<div class="top_right">',
        ( (right && ( right + " " ) ) || "" ) + link_to_page( "help" ),
      '</div>',
    '</div></div><br><br>',
    '<div id="container" style="margin:auto; max-width:62.5em;">', // *16=1000
    '<div id="content" ><div id="content_text">',
    ''
  ].join( "\n" );
}


function page_header_left( left, center, right ){
// Header with Kudocracy/propositions/tags/votes/ballot ... login help
  if( !Session.current.has_delegateable_filter()
  )return page_header( left, center, right );
  var m = left || "";
  return page_header(
    m      + link_to_page( "leaders", "all", "delegations" )
    + " "  + link_to_page( "votes" )
    + " "  + link_to_page( "ballot" ),
    center,
    right
  );
}


function page_header_right( left, center, right ){
// Header with Kudocracy/prositions ... delegations/publib/@name/help
  return page_header(
    left,
    center,
    right
  );
}


function page_footer(){
  var duration = l8.update_now() - PageBuilder.current.session.timestamp;
  var buf = [
    '\n</div></div></div><div class="" id="footer"><div id="footer_content">',
    //link_to_page( "propositions", "", "propositions" ), " ",
    //link_to_page( "leaders", "", "leaders" ),
    '<div id="powered"><a href="https://github.com/virteal/kudocracy">',
    config.icon,
    '<strong>kudo<em>c</em>racy</strong>',
    '</a> <dfn>' + duration + ' ms</dfn></div>',
    '</div></div>'
  ];
  if( PageBuilder.current.session.needs_twitter ){
    PageBuilder.current.session.needs_twitter = false;
    false && buf.push(
      '\n<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>'
    );
  }
  return buf.join( "" );
}


function vote_menu( persona, proposition, options ){
// Return a string that displays a menu to cast a vote
// options: with_twitter
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + ( i18n( l || v ) ) + '</option>';
  }
  
  var with_comment = true;
  var vote_id = persona.id + "." + proposition.id;
  var vote = proposition.get_vote_of( persona );
  var orientation = vote ? vote.orientation() : "";
  
  var comment = null;
  var size = 20;
  
  if( with_comment && vote ){
    with_comment = " " + i18n( "or" ) + '<br><input type="search" name="comment" ';
    if( options && !options.nofocus ){
      with_comment += " autofocus ";
    }
    comment = Comment.valid( vote.comment() );
    if( comment ){
      comment = comment.text;
      size = comment.length + 1;
      with_comment += 'placeholder="' + Wiki.htmlizeAttr( comment ) + '"';
    }else{
      with_comment += 'placeholder="' + i18n( "comment vote" ) + '"';
    }
    if( size !== 20 ){
      if( size > 100 ){ size = 100; }
      with_comment += ' size="' + size + '" ';
    }
    with_comment += '/> <input type="submit" value="' + i18n( "Comment" ) + '"/><br>';
  }else{
    with_comment = "";
  }
  
  var tags = proposition
  .tags_string( PageBuilder.current.session.visitor, PageBuilder.current.session.with_abuses )
  .replace( " #recent", "" )
  .replace( " #yesterday", "" )
  .replace( " #today", "" );
  
  var remain = 140 - " #kudcracy #vote".length;
  if( with_comment && comment ){
    comment = encodeURIComponent( 
      comment.substring( 0, remain ) // .replace( / /g, "/" ) 
    );
  }else{
    comment = "new%20democracy";
  }
  
  if( options && options.with_twitter ){
    PageBuilder.current.session.needs_twitter = true;
  }
  
  // Provide recommendations, from known agents and random important ones
  var recommendations = [];
  var agents_avoid_map = {};
  if( persona ){
    agents_avoid_map[ persona.label ] = true;
  }
  
  // From know agents
  var agents = persona && persona.agents( proposition );
  var by_agent = null;
  if( vote && vote.delegation() !== Vote.direct ){
    by_agent = vote.delegation().agent;
    agents_avoid_map[ by_agent.label ] = true;
  }
  if( agents ){
    Ephemeral.each( agents, function( agent ){
      // Filter out agent that the vote is using, if any
      if( agent === by_agent )return;
      var agent_orientation = agent.get_public_orientation_on( proposition );
      if( agent_orientation === Vote.neutral )return;
      agents_avoid_map[ agent.id ] = true;
      recommendations.push(
        link_to_persona_page( agent ) +  emoji( agent_orientation ) 
      );
    });
  }
  
  // From important agents
  var agent_votes = proposition.agent_vote_samples( 7, agents_avoid_map );
  agent_votes.forEach( function( vote ){
    recommendations.push(
      link_to_persona_page( vote.persona ) + emoji( vote.orientation() )
    );
  });
  
  // Keep 10 recommendations, random
  var len = recommendations.length;
  var recommentation_msg = "";
  if( len ){
    if( len > 10 ){
      var picked;
      var picked_recommendations = [];
      var picked_map = {};
      var ii;
      while( ii < 10 ){
        picked = recommendations[ Math.floor( Math.random() * len ) ];
        if( picked_map[ picked ] )continue;
        ii++;
        picked_map[ picked ] = true;
      }
      recommendations = picked_recommendations;
    }
    recommentation_msg = '<br>';
    if( vote ){
      recommentation_msg += i18n( "other" ) + " ";
    }
    recommentation_msg += recommendations.sort().join( " " );
    if( len > 10 ){
      recommentation_msg += "...";
    }
  }
  
  var buf = [
    ( len ? ' ' + recommentation_msg + '\n<br>' : "" ),
    '\n<form name="vote" url="/">',
    '<input type="hidden" name="i" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    link_to_page( "leaders", proposition.label, "Delegate" ), " ",
    i18n( "or" ), " ", i18n( 'Vote' ), '<h2>',
    ( orientation !== Vote.agree    ? " " + link_to_command( "change_vote " + vote_id + " agree",    emoji( "agree" ), "agree" ) : "" ),
    ( orientation !== Vote.disagree ? " " + link_to_command( "change_vote " + vote_id + " disagree", emoji( "disagree" ), "disagree" ) : "" ),
    ( orientation !== Vote.neutral
      && ( !vote || vote.delegation() === Vote.direct ) // neutral triggers delegations
      ? "  " + link_to_command( "change_vote " + vote_id + " neutral",  emoji( "neutral" ), "neutral" ) : ""
    ),
    "</h2> ",
    i18n( "or" ), "<br>",
    '<select name="orientation">',
    // ToDo: randomize option order?
    o( "", "orientation" ), o( "agree" ), o( "disagree" ),  o( "neutral" ), o( "blank" ), o( "protest" ), 
    '</select>',
    //'<select name="privacy">',
    //o( "", "privacy" ), o( "public" ), o( "secret" ), o( "private" ),
    //'</select>',
    '<select name="duration">',
    o( "", "duration" ), o( "one year" ), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour" ), o( "expire" ),
    '</select>',
    ' <input type="submit" value="', i18n( "Vote" ), '"/>',
    with_comment,
    '</form>\n'
  ];
  
    // Twitter tweet button
  if( options && options.with_twitter && orientation ){
    buf.push(
      '<a href="https://twitter.com/intent/tweet?button_hashtag=',
      proposition.is_tag() ? proposition.label.substring( 1 ) : proposition.label,
      '&hashtags=kudocracy,vote,',
      orientation, ",",
      tags.replace( / /g, "," ).replace( /#/g, "" ),
      '&text=', comment,
      '" class="twitter-hashtag-button" ',
      'data-related="Kudocracy,vote">Tweet ', proposition.label, '</a>'
    );
  }
  return buf.join( "" );
  
} // vote_menu()


function delegate_menu( delegation ){
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + i18n( v || l ) + '</option>';
  }
  
  PageBuilder.current.session.needs_twitter = true;
  
  return [
    '\n<form name="delegation" url="/">',
    '<input type="hidden" name="i" '
      + 'value="change_delegation &' + delegation.id + '"/>',
    //'<select name="privacy">',
    //o( "", "privacy" ), o( "public" ), o( "secret" ), o( "private" ),
    //'</select>',
    '<select name="duration">',
    o( "", "duration" ), o( "one year" ), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour" ), o( "expire" ),
    '</select>',
    ' <input type="submit" value="', i18n( "Delegate" ), '"/>',
    '</form>\n',
    // Twitter tweet button
    '\n<a href="https://twitter.com/intent/tweet?button_hashtag='
    + delegation.agent.label.substring( 1 )
    + '&hashtags=kudocracy,vote,'
    + delegation.tags_string().replace( / /g, "," ).replace( /#/g, "" )
    + '&text=new%20democracy%20%40' + delegation.agent.label.substring( 1 ) + '" '
    + 'class="twitter-hashtag-button" '
    + 'data-related="Kudocracy,vote">Tweet #'
    + delegation.agent.label.substring( 1 ) + '</a>'
  ].join( "" );
}

/*
 *  Collection of tags
 */

function TagSet(){
  this.session = null;
  this.tags    = set();
  this.sorted  = null;
  this.seen_propositions = set();
}

var ProtoTagSet = TagSet.prototype;

ProtoTagSet.add = function( label, no_inc ){
  if( !label )return;
  // Filter out persona labels until a delegateable filter exists
  if( this.session
  && !this.session.has_delegateable_filter()
  && Persona.find( "@" + label.substring( 1 ) )
  )return;
  this.sorted = null;
  var count = this.tags[ label ];
  if( typeof count === "undefined" ){
    this.tags[ label ] = no_inc ? 0 : 1;
  }else{
    if( !no_inc ){
      this.tags[ label ] = count + 1;
    }
  }
  return this;
};


ProtoTagSet.add_all = function( text, no_inc ){
  this.sorted = null;
  var that = this;
  text.split( " " ).forEach( function( label ){
    that.add( label, no_inc );
  });
  return this;
};


ProtoTagSet.add_array = function( list, no_inc ){
  this.sorted = null;
  var ii;
  var len = list.length;
  for( ii = 0 ; ii < len ; ii++ ){
    this.add( list[ ii ], true /* no inc */ );
  }
  return this;
};


ProtoTagSet.add_session = function( session ){
  this.session = session;
  this.add_array( session.filter_tag_labels, true /* no inc */ );
  if( this.session.filter_query ){
    this.add_array( this.session.filter_query.split( " " ), true /* no_inc */ );
  }
  session.tag_set = this;
  return this;
};


ProtoTagSet.add_proposition = function( proposition, functor, tag_page ){
  if( this.seen_propositions[ proposition.id ] )return;
  this.seen_propositions[ proposition.id ] = true;
  var that = this;
  proposition
  .tags_string( this.session.visitor, this.session.with_abuses )
  .split( " " ).forEach( function( tag ){
    if( !tag )return;
    var tag_entity = Topic.find( tag );
    // First tag is proposition name itself, skip it if unreferenced as tag
    var label = tag;
    if( tag_page ){
      if( tag === proposition.label ){
        label = _;
      }
    }else{
      if( tag.substring( 1 ) === proposition.label ){
        if( tag_entity && tag_entity.propositions().length ){
          label = '#';
        }else{
          label = _;
        }
      }
    }
    // Process tag, when useful
    if( label ){
      if( label !== "#" ){
        // Increment count for label
        that.add( label );
        label = label.substring( 1 );
      }
      if( functor ){
        functor.call( null, tag, label );
      }
    }
  });
};


ProtoTagSet.get_count = function( label ){
  return this.tags[ label ];
};


ProtoTagSet.array = function( sorted ){
  if( this.sorted )return this.sorted;
  var label;
  var list = [];
  var tags = this.tags;
  for( label in tags ){
    list.push( label );
  }
  if( !sorted )return list;
  return ( this.sorted = list.sort() );
};


ProtoTagSet.each = function( functor, not_sorted ){
  var list = this.array( !not_sorted );
  var ii;
  var len = list.length;
  for( ii = 0 ; ii  < len ; ii++ ){
    functor.call( null, list[ ii ] );
  }
  return this;
};


ProtoTagSet.sort = function( comparator ){
  return ( this.sorted = this.array( false ).sort( comparator ) );
};


ProtoTagSet.filter = function( predicate ){
  this.sorted = null;
  var tags = this.tags;
  var ok_tags = set();
  var label;
  for( label in tags ){
    if( predicate.call( null, label ) ){
      ok_tags[ label ] = tags[ label ];
    }
  }
  this.tags = ok_tags;
  return this;
};


ProtoTagSet.string = function(){
  return this.array().join( " " );
};


/*
 *  filter related
 */

function filter_label( filter, page ){
  if( !filter || !filter.trim() )return "";
  var buf = [];
  var found = false;
  buf.push( "<div>" );
  filter.split( " " ).forEach( function( tag ){
    found = true;
    var tag_entity = Topic.find( tag );
    var count = " ";
    if( tag_entity ){
      var c = tag_entity.propositions().length;
      if( c > 1 ){
        count = '<dfn>(' + c + ')</dfn> ';
      }
    }
    buf.push( link_to_page( page || "propositions", tag, tag ) + count );
  });
  buf.push( '</div>' );
  return found ? buf.join( "" ) : "";
}


function filter_and_sort_menu( can_propose, title ){
  
  var novice = PageBuilder.current.novice;
  var expert = PageBuilder.current.expert;
  
  var tag_page = title === "Tags";
  var leaders_page = title === "Leaders";
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + i18n( l || v ) + '</option>';
  }
  
  function o2( v, l, m ){
    var reversed = v[0] === "-";
    if( reversed ){
      v = v.substring( 1 );
    }
    var more = m;
    if( !l ){ l = v; }
    l = i18n( l );
    if( !more ){
      more = reversed ? "low first" : "high first";
      if( l.indexOf( "date" ) !== -1 ){
        more = reversed ? "recent first" : "old first";
      }else if( l.indexOf( "proportion" ) !== -1 ){
        more = reversed ? "small first" : "big first";
      }else if( l.indexOf( "activity" ) !== -1 ){
        more = reversed ? "less active first" : "more active first";
      }else if( l.indexOf( "name" ) !== -1 ){
        more = reversed ? "ordered" : "reversed";
      }
    }
    return o( ( reversed ? "-" : "+" ) + v, "by " + l ) 
    + o( ( reversed ? "+" : "-" ) + v, " --- " + more );
  }
  
  var tags_label = Session.current.filter_label();
  
  // Add one space to ease insertion of an additional tag by user
  if( tags_label ){
    tags_label += " ";
  }
  // Compute length of search input field
  if( tags_label.length >= 30 ){
    if( tags_label.length > 100 ){
      tags_label += '" size="100';
    }else{
      tags_label += '" size="' + ( tags_label.length + 1 );
    }
  }else{
    tags_label += '" size="30';
  }
  
  var propose_clause = "";
  if( can_propose
  && PageBuilder.current.session.visitor
  && ( PageBuilder.current.session.has_delegateable_filter()
  || title === "Propositions" )
  && PageBuilder.current.session.filter.indexOf( " #but " ) === -1
  ){
    propose_clause
    = '<br>' + i18n( "or" ) + " ";
    novice && ( propose_clause
    += i18n( ' create a new proposition: ' ) );
    propose_clause
    += '<input type="text" placeholder="' + i18n( "new proposition" ) + '" name="i3">'
    +  ' <input type="submit" name="i2" value="' + i18n( "Propose" ) + '"/>';
  }
  
  var delegate_clause = "";
  if( false && can_propose
  && PageBuilder.current.session.visitor
  && PageBuilder.current.session.has_filter()
  ){
    delegate_clause
    = ' <input type="submit" name="i2" value="' + i18n( "Delegate" ) + '"/>';
  }
  
  var r = [];
  if( novice ){
    r.push( "<br>", i18n( "Type #tags to find or plain text to look for: " ) );
  }
  r.push(
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="i" value="proposition_action"/>',
    '<input type="search" autosave="filter" autofocus name="i4" value="',
      tags_label,
    '"/> '
  );
  
  // Sort menu
  if( !leaders_page ){
    r.push(
      '<select name="i5" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'proposition_action Filter\';',
        'this.form.submit();',
      '}">',
      o( "", "Sort" ),
      o2( "-total_votes",   "total votes" ),
      o2( "age_modified",   "last activity date", "old first" ),
      o2( "age",            "creation date", "old first" ),
      o2( "-heat",          "relevance (heat)", "cold first" ),
      o2( "name",           "proposition name" ),
      o2( "-trust",         "trust level", "few agents or votes first" ),
      o2( "-activity",      "global activity" ),
      o2( "-changes",       "vote activity" ),
      o2( "-comments",      "number of comments" ),
      tag_page ? o2( "-propositions", "tagged propositions" ) : "",
      tag_page ? o2( "-delegations",  "tagged delegations" ) : "",
      o2( "author", "author", "reversed" ),
      o2( "-direct_votes",  "direct votes" ),
      o2( "-participation", "participation", "low first" ),
      o2( "-protestation",  "blank or protest votes", "accepted first" ),
      o2( "-success",       "success", "small successes first" ),
      o2( "orientation",   "orientation", "reversed" ),
      '</select>'
    );
  }
  
  r.push(
    ' <input type="submit" name="i2" value="', i18n( "Filter" ), '"/>',
    "", //' <input type="submit" name="i2" value="Search"/>',
    delegate_clause,
    propose_clause,
    '</form>\n'
  );
  return r.join( "" );
}


function filter_change_links( tag_set ){

  var buf2 = [ '<br>' ];
  var old_filter = " " + PageBuilder.current.session.query() + " ";

  // #tag... #tag(1) #persona... #persona(1)... #computed....
  function order( a ){
    var key;
    var entity = Topic.find( a );
    // not computed tags come first
    if( entity ){
      // tags that are the name of persona come last
      if( entity.get_persona() ){
        key = "zzzz" 
        + ( "000000" + ( 1000000 - tag_set.get_count( a ) ) ).slice( -6 )
        + entity.id;
      // Tags that are not the name of a person come first
      }else{
        key = "" 
        + ( "000000" + ( 1000000 - tag_set.get_count( a ) ) ).slice( -6 )
        + entity.id;
      }
    // Computed tags come last
    }else{
      key = "zzzzzzzz" 
      + ( "000000" + ( 1000000 - tag_set.get_count( a ) ) ).slice( -6 )
      + a;
    }
    return key;
  }

  tag_set.sort( function( a, b ){
    a = order( a );
    b = order( b );
    if( a > b )return  1;
    if( a < b )return -1;
    return 0;
  });

  var old_category = "";
  var new_category = "";
  var new_topic;

  tag_set.each( function( label ){
    new_topic = Topic.find( label );
    if( !new_topic ){
      new_category = "computed";
   }else if( Persona.find( "@" + label.substring( 1 ) ) ){
      new_category = "persona";
    }else{
      new_category = "tag";
    }
    if( new_category != old_category ){
      if( old_category ){
        buf2.push( "<br>" );
      }
      if( Session.current.novice ){
        buf2.push( i18n( new_category ), " " );
      }
      old_category = new_category;
    }
    // '+' link to add tag to filter, '-' to remove
    var filtered = old_filter.indexOf( " " + label + " " ) !== -1;
    if( !filtered ){
      // buf2.push( link_to_command( "filter_more " + label, "&#10062;" ) );
    }else{
      buf2.push( link_to_command( "filter_less " + label, emoji( "checked" ) ) );
    }
    var c = tag_set.get_count( label );
    var m = c > 0
    ? '<dfn>(' + c + ')</dfn>'
    : "";
    buf2.push( link_to_command(
      ( filtered ? "filter_less " : "filter_more " ) + label,
      i18n( label ) + m
    ) );
    buf2.push( " " );
  });

  if( buf2.length > 1 ){
    buf2.push( '<br>' );
  }

  return buf2.join( "" );

}


PageBuilder.prototype.push_title_and_search_form = function( title ){
  
  var buf = this;
  var novice = this.session.novice;
  
  if( title[0] === "@" ){
    title = link_to_page( "persona", title );
  } 
  
  buf.push( '<br><h3>' + i18n( title ) + '</h3>' );

  var filter_label = PageBuilder.current.session.filter_label();
  if( filter_label ){
    filter_label = filter_label.replace( /#[a-z0-9]+/gi, function( tag_name ){
      var topic = Topic.find( tag_name );
      if( !topic )return i18n( tag_name );
      return link_to_proposition_page( topic );
    });
    buf.push( '  <h1>'
      + filter_label
      + '</h1>'
    );
    var persona_tag = Persona.find( PageBuilder.current.session.filter.replace( "#", "@" ).trim() );
    if( persona_tag ){
      buf.push( ' <dfn>(', link_to_page( "persona", persona_tag.name ), ')</dfn>' );
    }
    buf.push( '<br>' );
    var tag_topic = Topic.find( PageBuilder.current.session.filter.trim() );
    var comment = Topic.reserved_comment( PageBuilder.current.session.filter.trim() );
    if( comment ){
      buf.push( '<dfn>' + comment + '</dfn><br><br>' );
    }else if( comment = tag_topic && Comment.valid( tag_topic.comment() ) ){
      buf.push( '' + format_comment( comment.text ) + '<br><br>' );
    }else{
      buf.push( '<br><br>' );
    }
  }else{
    buf.push( '<h1> </h1><br><br><br>' ); // Same height
  }

  // Twitter tweet button, to tweet about the filter
  if( false && PageBuilder.current.session.has_filter() ){
    PageBuilder.current.session.needs_twitter = true;
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + PageBuilder.current.session.filter_label( "," )
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for tags or create a proposition
  var can_propose = PageBuilder.current.session.visitor 
  && !PageBuilder.current.session.visitor.is_abuse()
  && title === "Propositions";
  buf.push( filter_and_sort_menu( can_propose, title ) );
  
  // Build a list of all seen tags
  var tag_set = new TagSet();
  tag_set.add_session( PageBuilder.current.session );
  
  // Place holder for clickable list of tags, to alter filter
  this.novice && this.push( "<br>", i18n( "or click to select/deselect desired tags: " ) );
  tag_set.insert_index = buf.length;
  buf.push( '', '<hr>' ); // ToDo: why ''? without it the hr is erased...???
  
  return tag_set;
  
};


PageBuilder.prototype.push_vote_menu = function( proposition, options ){
  
  var persona = this.session.visitor;

  if( !persona || persona.is_abuse() ){
    this.push( '<br>' );
    return;
  }
  
  var vote_entity = proposition.get_vote_of( persona );
  if( !vote_entity ){
    this.push(
      '<br><br>',
      vote_menu( persona, proposition, options ),
      '<br>' 
    );
    return;
  }
  
  this.push( 
    '\n',
    '<input type="button" value="', i18n( "Vote" ),
    '" onclick="',
    "this.style.display = 'none';",
    "this.nextElementSibling.style.display = 'block';",
    '" />',
    ' <span style="display:none"><br>',
    i18n( "you" ), " ",
    emojied( vote_entity.orientation() ),
    ( !vote_entity.is_public() ? " <dfn>(" + vote_entity.privacy() + ")</dfn>" : "" ),
    ( vote_entity.is_direct()
      ? ""
      : " <dfn>(via " + link_to_page( "persona", vote_entity.agent_label() ) + ")</dfn>" ),
    ( vote_entity.half_life() ? " " + i18n( "for" ) + " " 
    + duration_label( vote_entity.expire() - Kudo.now() ) : "" ),
    vote_menu( persona, proposition ),
    '</span>',
    '<br>'
  );

};


PageBuilder.prototype.push_delegations = function( persona ){ 
  
  var visitor;
  if( persona === this.session.visitor ){
    visitor = persona;
  }
  
  var delegations = persona.delegations();
  var list = [];
  var that = this;
  
  Ephemeral.each( delegations, function( delegation ){
    if( !delegation.filtered(
      that.session.filter,
      that.session.filter_query,
      that.session.visitor
    ) )return;
    list.push( delegation );
  });
  
  if( !list.length )return;
    
  this.push( '<div><h2>Delegations</h2>' );
  if( visitor ){
    this.push(
      ' - ',
      link_to_page( "delegations", "", "change" )
    );
  }
  this.push( '<br>' );
  
  list = list.sort( function( a, b ){
    if( a.id < b.id )return -1;
    if( a.id > b.id )return 1;
    return 0;
  });

  list.forEach( function( delegation ){

    that.push(
      '<br>',
      link_to_persona_page( delegation.agent ),
      " "
    );
    if( delegation.is_inactive() ){
      that.push( "<dfn>(inactive)</dfn> " );
    }
    var filter =  delegation.filter_string( persona );
    if( visitor ){
      that.push( 
        link_to_page(
          "propositions",
          filter
        )
      );
    }else{
      that.push(
        link_to_page(
          "persona",
          persona.label + " " + filter,
          filter
        )
      );
    }
  });
  
};


/*
 *  sparkline related
 */

var CachedSparklines = set();

function get_sparkline_data( proposition, start_time, limit_time, personas ){
  
  // Return cached data?
  var touched = proposition.time_touched;
  var r = CachedSparklines[ proposition.label ];
  if( r
  && r.touched === touched
  && ( r.end_time   === limit_time )
  && ( r.start_time === start_time )
  && ( r.personas === "" + personas ) // Not very effichient toString()
  )return r;
  
  var graph_serie = []; // Array of [ timestamp, balance ]
  
  // Use proposition's creation time as first data point or first valid vote
  if( !start_time ){
    graph_serie.push( [ proposition.timestamp, 0 ] );
  }
  var votes = proposition.votes_log() ;
  var balance = 0;
  var max = 0;
  var min = 0;
  var last_vote;
  var first_vote;
  
  var seen_personas = set();
  
  votes.every( function( vote_value, index ){
    
    if( !vote_value )return true;
    if( start_time && vote_value.snaptime < start_time )return true;
    if( limit_time && vote_value.snaptime > limit_time )return false;
    
    if( personas && !seen_personas[ vote_value.persona ] ){
      var entity = Vote.valid( vote_value.entity );
      if( !entity )return true;
      if( !personas.indexOf( entity.persona ) === -1 )return true;
    }
    
    if( !first_vote ){ first_vote = vote_value; }
    last_vote = vote_value;
    
    var was = vote_value.previous_orientation;
    var now = vote_value.orientation;
    
    // First previous vote of persona is considered neutral
    if( !seen_personas[ vote_value.persona ] ){
      seen_personas[ vote_value.persona ] = true;
      was = Vote.neutral;
    }
    
    if( now === was )return true;
    
    if( was === "agree" ){
      balance--;
    }else if( was === "disagree" || was === "protest" ){
      balance++;
    }
    if( now === "agree" ){
      balance++;
    }else if( now === "disagree" || now === "protest" ){
      balance--;
    }
    if( !graph_serie.length ){
      graph_serie.push( [ vote_value.snaptime, 0 ] );
    }
    graph_serie.push( [
      vote_value.snaptime,
      balance
    ] );
    if( balance > max ){ max = balance; }
    if( balance < min ){ min = balance; }
    return true;
  });
  
  // Add fake data for continuity
  var last_time;
  if( !limit_time ){
    last_time = touched;
  }else{
    if( touched < limit_time ){
      last_time = touched;
    }else{
      last_time = limit_time ;
    }
  }
  graph_serie.push( [ last_time, balance ] );
  
  var start = graph_serie[0][0];
  var end   = graph_serie[ graph_serie.length -1 ][0];
  var span  = first_vote && last_vote
  && ( last_vote.timestamp - first_vote.timestamp );
  
  var p_result = proposition.result.value();
  r = {
    label: proposition.label,
    result:     p_result,
    touched:    touched,
    start_time: start_time,
    end_time:   limit_time,
    personas:   "" + personas,
    start:      start,
    end:        end,
    duration:   end - start,
    first:      first_vote && first_vote.timestamp,
    last:       last_vote  && last_vote.timestamp,
    span:       span,
    max:        max,
    min:        min,
    serie:      graph_serie
  };
  
  CachedSparklines[ r.label ] = r;
  return r;
}


function Sparklines( page_builder ){
  this.page_builder = page_builder;
  this.list = [];
}


Sparklines.prototype.add = function( proposition, start_time, limit_time, personas ){
  var data = get_sparkline_data( proposition, start_time, limit_time, personas );
  if( !data.serie.length )return;
  this.page_builder.push(
    '<br><canvas id="spark_', data.label,
    '" width=256 height=32></canvas>'
  );
  this.list.push( data );  
};


function sparkline( data ){
  
  if( !window.HTMLCanvasElement )return;
  
	var canvas = document.getElementById( "spark_" + data.label );
	if( !canvas.getContext )return;
	
	var ctx    = canvas.getContext( "2d" );
	var ii;
	
	var top_margin = 4;
	var height  = canvas.height - top_margin;
	var width   = canvas.width - 1 - height;

	// Pie chart
	var center_x   = Math.floor( height / 2 );
	var center_y   = center_x + top_margin;
	var radius     = center_x;
	var range      = data.max_total - data.min_total;
	var is_linear  = ( range / data.min_total ) <= 10;
	var pie_factor = Math.log( data.result.total ) / Math.log( data.max_total );
  pie_factor = 1;
  if( is_linear ){
    pie_factor = ( 0.8 * data.result.total / data.max_total ) + 0.2;
  }else{
    // ToDo: log scale
  }
  // ctx.clearRect( 0, top_margin, height, height + top_margin );
  var total = data.result.total;
  var radian_factor = 2 * Math.PI / total;
  var pie_count_done = 0;
  var count = 0;
  var color;
  
  // Draw agree/gree, disagree/blue, protest/red, blank 
  for( ii = 0 ; ii < 4 ; ii++ ){
  
    if( ii === 0 ){
      count = data.result.agree; // green
      color = 'rgba(0,170,0,1)';
    }else if( ii === 1 ){
      count = data.result.disagree; // blue
      color = 'rgba(0,0,170,1)'; 
    }else if( ii === 2 ){
      count = data.result.protest; // red
      color = 'rgba(170,0,0,1)';
    }else if( ii === 3 ){
      count = data.result.blank; // white 
      color = 'rgba(255,255,255,1)';
    }
    if( !count )continue;
  
    var start_angle = pie_count_done * radian_factor - Math.PI / 2;
		var arc_angle   = count * radian_factor;
		var end_angle   = start_angle + arc_angle;

		ctx.beginPath();
		ctx.moveTo( center_x, center_y );
		ctx.arc( center_x, center_y, radius * pie_factor, start_angle, end_angle );
		ctx.fillStyle = color;
		ctx.fill();
  
    pie_count_done += count;
  }
  
  // Level of indirect votes
  if( data.result.direct !== total ){
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,0,1)'; // Yellow
    var flood_level = radius * ( 1 - pie_factor ) + height * pie_factor * data.result.direct / total; 
    ctx.moveTo( 0,      top_margin + height - flood_level );
    ctx.lineTo( height, top_margin + height - flood_level );
    ctx.stroke();
  }
	
	// Vote time serie
	var epoch   = data.start;
	var duration = data.end - epoch;
	var xfactor  = ( width - height - 2 ) / duration;
	var max      = data.max;
	var min      = data.min;
	var yfactor  = height / ( max - min );
	var delta_y  = ( - min ) * yfactor;
	
	// Draw horizontal axis
	ctx.beginPath();
	ctx.strokeStyle = 'rgba(170,170,170,1)'; // Ligth grey
	ctx.moveTo( width, height - delta_y + top_margin );
	ctx.lineTo( height + 2, height - delta_y + top_margin );
	ctx.stroke();
	
	ctx.beginPath();
	ctx.strokeStyle = 'rgba(30,30,30,1)'; // almost black

	var list = data.serie;
	var len  = list.length;
	var serie = data.serie;
	var x = ( serie[0][0] - epoch ) * xfactor ;
	var y = height - delta_y;
	ctx.moveTo( x + height + 2, y + top_margin );
	//console.log( "Start at (" + x + "," + y + ")" );

  // Draw each data point
	for( ii = 0 ; ii < len ; ii++ ){
	  x = ( serie[ii][0] - epoch ) * xfactor;
		ctx.lineTo( x + height + 2, y + top_margin );
		y = height - ( serie[ii][1] * yfactor + delta_y );
		//console.log( "Move to (" + x + "," + y + ")" );
		ctx.lineTo( x + height + 2, y + top_margin );
	}

	ctx.stroke();
	
}


Sparklines.prototype.push = function(){
  this.page_builder.push( '\n<script>\n' );
  this.page_builder.push( sparkline );
  var that = this;
  var start     = Kudo.now();
  var end       = start;
  var max_total = 0;
  var min_total = 1000000;
  this.list.forEach( function( data ){
    if( data.start < start ){ start = data.start; }
    if( data.result.total > max_total ){ max_total = data.result.total;}
    if( data.result.total < min_total ){ min_total = data.result.total;}
  } );
  this.list.forEach( function( data ){
    // All lines starts and ends at the same date, pie size depends on total
    data.max_total = max_total;
    data.min_total = min_total;
    var old_start  = data.start;
    var old_end    = data.end;
    var old_personas = data.personas;
    data.personas = _;
    data.start     = start;
    data.end       = end;
    that.page_builder.push( '\nsparkline( ', JSON.stringify( data ), ');\n' );
    // Revert side effect on data
    data.start     = old_start;
    data.end       = old_end;
    data.personas  = old_personas;
  } );
  this.page_builder.push( '\n</script>\n');
};


/* ---------------------------------------------------------------------------
 *  page visitor
 */

function page_visitor( page_name ){
// The private page of a persona

  var persona = this.session.visitor;
  if( !persona )return this.redirect( "propositions" );
  
  // Forget about whatever potential agent's page was visited recently
  this.session.agent = null;
  
  var that = this;
  
  // Remove #new filter, confusing
  this.session.remove_confusing_new_filter();
  
  // Don't display votes unless some good filter exists, else it's too much
  var display = this.session.has_enough_filter();

  // Header
  this.set(
    page_style( "you" ),
    page_header_right(
      _,
      link_to_twitter_user( persona.label ),
      _ // link_to_page( "delegations" )
    )
  );
  
  if( this.session.novice ){
    this.push( i18n( 
      "This page list informations avout you, your votes, your delegations, etc."
    ) );
  }

  // Kudocracy domain?
  if( persona.is_domain() ){
    this.push(
      '<br><a href="?domain=', persona.label.substring( 1 ),
      '&page=propositions',
      '">', i18n( "A direct democracy!" ),
      '</a>'
    );
  }

  var tag_set = this.push_title_and_search_form( persona.label );
  var votes = persona.votes();

  // Sort votes, recent first unless some other criteria about propositions
  if( display ){
    var sort_criterias =this.session.sort_criterias;
    votes = votes.sort( function( a, b ){
      if( !sort_criterias.length )return b.time_touched - a.time_touched;
      return Ephemeral.compare_measures(
        a.proposition,
        b.proposition,
        sort_criterias,
        persona
      );
    });
    this.push( '<br><div><h2>Votes</h2>' );
    this.push( " - " + link_to_page( "delegations" ) );
  }

  Ephemeral.each( votes, function( entity ){

    if( !entity.filtered(
      that.session.filter,
      that.session.filter_query,
      that.session.visitor
    ) )return;
    
    tag_set.add_proposition( entity.proposition );
    
    if( !display )return;

    that.push( '<br><br>',
      '<h2>', link_to_page( "proposition", entity.proposition.label ), '</h2>',
      //+ "<dfn>" + emojied( entity.proposition.result.orientation() ) + '</dfn>'
      '<br><em>' + emojied( entity.orientation() ) + "</em> ",
      ( !entity.is_public() ? '<dfn>(' + entity.privacy() + ')</dfn>' : "" ),
      ( entity.is_direct()
      ? ""
      : " <dfn>(via " + link_to_page( "persona", entity.agent_label() ) + ")</dfn>" ),
      " " + i18n( "for" ) + " " + duration_label( entity.expire() - Kudo.now() ),
      vote_menu( persona, entity.proposition, { with_twitter: true } )
    );

  });
  
  if( display ){
    this.push( "</div><br>" );
  }

  // Delegations
  that.push_delegations( persona );
  
  // Inject list of all seen tags, to alter filter when clicked
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push( "</div><br>", page_footer() );

} // page_visitor()


/* ---------------------------------------------------------------------------
 *  page persona
 */
 
function page_persona( page_name, name ){
// This is the "public" aspect of a persona

  var persona = Persona.find( name );
  if( !persona )return this.error( "Persona not found: ", name );

  var visitor;
  if( persona === this.session.visitor ){
    visitor = persona;
  }
  var that = this;
  
  if( visitor ){
    this.session.agent = null;
    // Remove #new filter, confusing
    this.session.remove_confusing_new_filter();
  }else{
    this.session.agent = persona;
  }

  // Header
  this.set(
    page_style( persona.label ),
    page_header_right(
      _,
      link_to_twitter_user( persona.label ),
      _ // link_to_page( "delegations" )
    )
  );

  if( this.session.novice ){
    this.push( i18n( 
      "This page lists informations about a person, her votes, her delegations (received and given), etc."
    ) );
  }

  // Kudocracy domain?
  if( persona.is_domain() ){
    this.push(
      '<br><a href="?domain=', persona.label.substring( 1 ),
      '&page=propositions',
      '">', i18n( "A direct democracy!" ),
      '</a>'
    );
  }

  var tag_set = this.push_title_and_search_form( persona.label );
  
  // Display each vote, not too much
  var display = this.session.has_enough_filter();

  // When not displaying votes, focus on persona instead
  if( true || !display ){
    
    // Is there a "topic" about that user?
    var persona_topic = persona.get_topic();
    if( persona_topic ){
      this.push(
        "<br><h2>Tag ",
        link_to_proposition_page( persona_topic ),
        "</h2><br>",
        proposition_summary( persona_topic ),
        ""//"<br><br>"
      );
      that.push_vote_menu( persona_topic );
    }
  
    // Twitter follow button
    this.session.needs_twitter = true;
    this.push(
      '<a href="https://twitter.com/', persona.label,
      '" class="twitter-follow-button" data-show-count="true">',
      'Follow ', persona.label, '</a><br>'
    );
    
  }

  var sort_criterias = this.session.sort_criterias;
  // Votes, recent first unless some other criteria about propositions
  var votes = persona.votes();
  votes = votes.sort( function( a, b ){
    if( !sort_criterias.length )return b.time_touched - a.time_touched;
    return Ephemeral.compare_measures(
      a.proposition,
      b.proposition,
      sort_criterias,
      persona
    );
  });
  
  // Expertizes as agent
  var expertizes = persona._delegation_expertizes;
  expertizes = expertizes.sort( function( a, b ){
    return b.count_votes - b.count_votes;
  });
  var elen = expertizes.length;
  if( elen ){
    that.push(
      "<br><br><h2>",
      i18n( "Trust" ),
      "</h2> - ",
      link_to_page( "leaders", "all", "delegations" ),
      "<br><br>"
    );
    var expertize;
    for( var eii = 0 ; eii < elen && eii < 10 ; eii++ ){
      expertize = expertizes[ eii ];
      var can_delegate = this.session.visitor
      && this.session.visitor !== expertize.agent;
      if( can_delegate ){
        that.push(
          '<form name="delegation" url="/">',
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + expertize.label.replace( /\./g, " ") + '"/>',
          '<input type="submit" value="', i18n( "Delegate" ), '"/> ',
          link_to_persona_page( expertize.agent )
        );
      }
      that.push(
        link_to_page(
          "persona",
          expertize.label.replace( /\./g, " "),
          expertize._delegation_filter.label.replace( /\./g, "+" )
        )
      );
      if( can_delegate ){
        this.push( '</form>' );
      }else{
        this.push( "<br>" );
      }
    } // end for
    this.push( "<br>" );
  }
  
  // Votes
  if( display ){
    this.push( '<br><div><h2>Votes</h2>' );
    if( persona && this.session.visitor ){
      this.push( " - " + link_to_page( "delegations" ) );
    }
    this.push( '<br>' );
    //buf.push( "<ol>" );
  }

  Ephemeral.each( votes, function( vote ){

    if( vote.orientation() === Vote.neutral )return;
    if( !vote.filtered(
      that.session.filter,
      that.session.filter_query,
      that.session.visitor
    ) )return;
    
    if( !display ){
      tag_set.add_proposition( vote.proposition );
      return;
    }

    that.push( '<br>' ); // "<li>" );
    if( vote.is_private() ){
      that.push( "private" );
    }else{
      tag_set.add_proposition( vote.proposition );
      that.push(
        ( vote.is_secret()
          ? "secret"
          : "<em>" + emojied( vote.orientation() ) + "</em> " ),
        link_to_page( "proposition", vote.proposition.label ), ' ',
        " <dfn>", time_label( vote.time_touched ), "</dfn> ",
        //+ " <dfn>" + emojied( entity.proposition.result.orientation() ) + "</dfn> "
        //+ time_label( entity.proposition.result.time_touched )
        //+ "<dfn>(" + entity.privacy() + ")</dfn>"
        ( vote.is_direct()
          ? ""
          : " <dfn>(via " + link_to_page( "persona", vote.agent_label() ) + ")</dfn> " )
        //+ " for " + duration_label( entity.expire() - Kudo.now() )
      );
    }
    //buf.push( "</li>" );
  });
  if( display ){
    this.push( "<br><br><br>" );
  }
  
  // Delegations
  that.push_delegations( persona );
  
  // Delegate button
  var delegateable_filter = this.session.delegateable_filter();
  if( this.session.visitor
  && persona
  && persona !== this.session.visitor
  && delegateable_filter
  ){
    that.push(
      '\n<br><br><form name="delegation" url="/">',
      '<input type="hidden" name="i" value="set_delegation"/>',
      '<input type="hidden" name="i2" value="' + persona.id + '"/>',
      '<input type="hidden" name="i3" value="' + delegateable_filter + '"/>',
      '<input type="submit" value="', i18n( "Delegate" ), '"/> ',
      link_to_persona_page( persona ), " ",
      link_to_page( "propositions", delegateable_filter, delegateable_filter.replace( / /g, "+" ) ),
      '</form>\n'
    );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  // buf.push( "</ol></div><br>" );
  this.push( '</div><br>', page_footer() );
  
} // page_persona()


/* ---------------------------------------------------------------------------
 *  page delegations
 */

function page_delegations( page_name ){
// The private page of a persona's delegations

  var persona = this.session.visitor;
  if( !persona )return this.redirect( "propositions" );
  
  var that = this;

  // Header
  this.set(
    page_style( "your delegations" ),
    page_header_right(
      _,
      link_to_twitter_user( persona.label )
      //+ " " + link_to_page( persona.label, "visitor", "votes" )
    )
  );

  if( this.session.novice ){
    this.push( i18n( 
      "This page lists your delegations to others who vote for you on propositions that match some specified tags."
    ) );
  }

  var title
  = link_to_persona_page( persona )
  + " " + link_to_wiki( persona.label );
  if( this.session.agent ){
    title
    += " " + link_to_persona_page( this.session.agent )
    +  " " + link_to_wiki( this.session.agent.label );
  }
  
  // Remove #new filter, confusing
  this.session.remove_confusing_new_filter();
  
  var tag_set = this.push_title_and_search_form( title );

  // Delegations
  var delegations = persona.delegations();
  var votes_by_delegation = {}; // map of arrays
  Ephemeral.each( delegations, function( delegation ){
    votes_by_delegation[ delegation.id ] = [];
  });
  
  // Collect all votes, by delegation
  var with_abuses = this.session.filter.indexOf( "#abuse " ) !== -1;
  var votes = persona.votes();
  var propositions_map = {};
  Ephemeral.each( votes, function( vote ){
    var proposition = Topic.valid( vote.proposition );
    if( !proposition )return;
    if( proposition.is_abuse() && !with_abuses )return;
    tag_set.add_proposition( proposition );
    propositions_map[ proposition.label ] = proposition;
    var delegation = Delegation.valid( vote.delegation() );
    if( !delegation )return;
    var list = votes_by_delegation[ delegation.id ];
    if( list ){
      list.push( vote );
    }
  });
  
  var proposition_names = [];
  var label;
  var candidate_proposition;
  for( label in propositions_map ){
    candidate_proposition = propositions_map[ label ];
    if( candidate_proposition.filtered( 
      this.session.filter,
      this.session.filter_query
    ) ){
      proposition_names.push( label );
    }
  }
  
  // Remove computed tags
  tag_set.filter( function( label ){
    var topic = Topic.find( label );
    return !!topic;
  });
  
  // Propositions
  if( proposition_names.length && this.session.has_delegateable_filter() ){
    this.push(
      "<br>",
      "<h2>Propositions</h2> - ",
      link_to_page( "propositions", "", "details" ),
      "<br><br>"
    );
    var sort_criterias = Session.current.sort_criterias;
    if( !sort_criterias.length ){
      sort_criterias = [ "+name" ];
    }
    proposition_names.sort( function( a, b ){
      return Ephemeral.compare_measures(
        Topic.find( a ),
        Topic.find( b ),
        sort_criterias,
        persona
      );
    }).forEach( function( label ){
      if( that.session.agent ){
        var orientation
        = that.session.agent.get_public_orientation_on( Topic.find( label ) );
        if( orientation !== Vote.neutral ){
          that.push( emoji( orientation ) );
        }
      }
      that.push( link_to_page( "proposition", label ), " " );
    });
    this.push( "<br>" );
  }
  
  // <h2> Delegations - leaders
  this.push(
    "\n<br>",
    "<div><h2>Delegations</h2>",
    " - " + link_to_page( "leaders", "all", "details" ),
    "<br>"
  );
  
  // Form to add/change a delegation
  var agent_value = "@";
  if( this.session.agent ){
    agent_value = this.session.agent.label;
  }
  var filter_value;
  var filter_values = [];
  Ephemeral.each( this.session.filter_tag_entities, function( tag ){
    filter_values.push( tag.label );
  } );
  filter_values = filter_values.sort();
  if( filter_values.length ){
    filter_value = filter_values.join( " " );
  }else{
    filter_value = "#";
  }
  this.push(
    '\n<br><form name="delegation" url="/">',
    '<input type="hidden" name="i" value="set_delegation"/>',
    'agent <input type="text" name="i2" value="', agent_value,
    '" placeholder="@someone"/>',
    ' tags <input type="text" name="i3" value="', filter_value,
    '" placeholder="#tag #tag2 #tag3..."/>',
    ' <input type="submit" value="', i18n( "Delegate" ), '"/>',
    '</form>\n'
  );

  // Display each delegation
  delegations.forEach( function( delegation ){

    if( !delegation.filtered(
      that.session.filter,
      that.session.filter_query,
      persona
    ) )return;
    
    var agent = delegation.agent;
    var votes = votes_by_delegation[ delegation.id ];
    var proposition_labels = [];
    votes.forEach( function( vote ){
      proposition_labels.push( vote.proposition.label );
    });
    proposition_labels = proposition_labels.sort();
    var str_proposition_labels = "";
    proposition_labels.forEach( function( proposition_label ){
      var orientation = agent.get_orientation_on( Topic.find( proposition_label ) );
      var emoji_text = emoji( orientation );
      str_proposition_labels += " "
      + emoji_text + link_to_page( "proposition", proposition_label );
    });

    that.push(
      '<br><br><h2>',
      link_to_persona_page( delegation.agent ),
      "</h2>",
      ( delegation.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " ),
      link_to_page( "propositions", delegation.filter_string( persona ) ),
      "<br><br>", str_proposition_labels ? str_proposition_labels + '<br>' : "",
      ( !delegation.is_public() ? "<dfn>(" + delegation.privacy() + ")</dfn>" : "" ),
      " " + i18n( "for" ) + " " + duration_label( delegation.expire() - Kudo.now() ),
      delegate_menu( delegation )
    );
  });

  // Inject list of all seen tags, to alter filter when clicked
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push( "</div><br>", page_footer() );

} // page_delegations()


/* ---------------------------------------------------------------------------
 *  page_groups()
 */
 
function page_groups( page_name, name ){
  this.set( page_style( "groups" ), page_header() );
  var persona = Persona.find( name );
  if( !persona ){
    this.push( "Persona not found: " + name );
    return;
  }
  this.push( pretty( persona.value() ) );
}


/* ---------------------------------------------------------------------------
 *  page propositions
 */
 
function page_propositions( page_name ){
// This is the main page of the application, either a list of tags or
// propositions, filtered.

  var persona = this.session.visitor;
  
  // Page for propositions is almost like page for tags
  var tag_page = page_name === "tags";
  
  var filter = this.session.filter;
  
  // Header, displays twitter links to hashtags from the filter
  this.set(
    page_style( "propositions" ),
    page_header_left( // Focus on propositions, not on logged in visitor
      _,
      this.session.has_filter() ? link_to_twitter_tags( filter ) : _,
      _
    )
  );
  
  if( this.session.novice ){
    this.push( i18n(
      "This page lists propositions. If logged in, you can vote."
    ) );
  }

  // Title + search form + list of tags 
  var tag_set
  = this.push_title_and_search_form( tag_page ? "Tags" : "Propositions" );

  // Will display list of matching propositions or tags, main content of page
  var propositions = Topic.all;
  var list = [];
  var count = 0;
  var attr;
  var entity;
  var visitor_tag = null;
  if( persona ){
    visitor_tag = "#" + persona.label.substring( 1 );
  }

  // Skip tags in "propositions" page, unless #tag is inside filter
  // or unless no delegateable filter
  var skip_tags = !tag_page;
  if( skip_tags
  && ( filter.indexOf( " #tag " ) !== -1
  // || !this.session.has_delegateable_filter()
  )
  ){
    skip_tags = false;
  }
  
  // Scan all propositions, could be a lot! Collect filtered ones
  for( attr in propositions ){
    
    entity = propositions[ attr ];
    
    // Apply filter, skip invalid and tags/not-tags depending on page name
    if( !Topic.valid( entity ) )continue;
    if( entity.is_tag() ){
      if( skip_tags )continue;
    }else{
      if( tag_page )continue;
    }
    if( !entity.filtered(
      this.session.filter,
      this.session.filter_query,
      persona
    ) )continue;

    // Filter out propositions without votes unless current user created it
    // or #orphan explicit filter. Not for tags, they have much less votes
    if( !tag_page
    && !entity.result.total()
    && ( !visitor_tag || !entity.has_tag( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    && filter.indexOf( " #orphan " ) === -1
    )continue;
    
    // Filter out personas tag, unless #persona filter
    if( tag_page
    && entity.get_persona()
    && filter.indexOf( " #persona " ) === -1
    )continue;

    // Avoid excessive output
    if( ++count >= 200 )break;

    list.push( entity );
  }
  // list[] contains propositions to display
  
  // Sort list of proposition according to user specified sort order
  var sort_criterias = this.session.sort_criterias;
  if( !sort_criterias.length ){
    // Default to "relevance", ie "heat" measure
    sort_criterias = [ "-heat" ];
  }
  list = list.sort( function( a, b ){
    // The last consulted proposition, if any, is before all the others
    // because this helps to avoid lost users
    if( a === PageBuilder.current.session.proposition )return -1;
    if( b === PageBuilder.current.session.proposition )return  1;
    return Ephemeral.compare_measures(
      a, b,
      sort_criterias,
      persona
    );
  });

  // Display sorted matching propositions
  var that = this; // The PageBuilder object
  var display = tag_page || this.session.has_enough_filter();
  var sparklines = display && new Sparklines( this );
  
  list.forEach( function( proposition ){
    
    if( !display ){
      tag_set.add_proposition( proposition );
      return;
    }

    var text = proposition.label;
    if( tag_page ){
      // Make it clear that agree is when tag is "appropriate", versus abusive
      text += i18n( " is a good tag" );
    }else{
      // text = "#" + text;
    }
    
    // <h2> link to proposition
    that.push(
      '\n\n<br><h2>',
      proposition.is_tag() ? "Tag " : "",
      link_to_page( "proposition", proposition.label, text ),
      '</h2> '
    );
    
    // List of tags
    // ToDo: what if this gets too long?
    //buf.push( '<br>' );
    tag_set.add_proposition( proposition, function( tag, label ){
      that.push(
        link_to_page( page_name, tag, label ),
        " "
      );
    }, tag_page );
    
    //buf.push( '<small>' + link_to_twitter_tags( proposition.tags_string() + '</small><br>' ) );
    
    // Summary for proposition: emoji, main orientation, other orientations, etc 
    that.push( '\n<br>', proposition_summary( proposition ) );
    sparklines && sparklines.add( proposition );

    // If tag, display link to tagged propositions, with count of propositions
    if( tag_page ){
      that.push(
        '<br>',
        "proposition " + proposition.propositions().length + " - ",
        link_to_page(
          "propositions",
          proposition.label,
          i18n( "details" )
        ),
        "<br>"
      );
    }

    // If some logged in user, collect votes from agents, whatever their filter
    // because that can help visitor to make a choice or delegate, for votes 
    // from people you trust matter.
    // Then display a "cast a vote" menu/form.
    that.push_vote_menu( proposition );
  });

  // Inject list of all seen tags, after filter/sort menu
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push(  "<br>", page_footer() );
  sparklines && sparklines.push();
  
} // page_propositions()


/* ---------------------------------------------------------------------------
 *  page ballot
 */
 
function page_ballot( pagename ){
// This page builds a query sent to page_ballot2() to show result of votes
// during a time period on a set of propositions by a set of people.

  var added_personas = set();
  
  if( !this.session.has_delegateable_filter() ){
    return this.redirect( "propositions" );
  }
  
  var tags = [];
  var personas = [];
  var topic_name;
  var topics = Topic.all;
  var topic;
  var min_time = Kudo.now();
  var max_time = 0;
  
  // Collect topics that match the filter && collect the voters
  for( topic_name in topics ){
    
    topic = topics[ topic_name ];
    
    if( !Topic.valid( topic ) )continue;
    
    // Skip propositions with less than 1 vote, ie orphan/errors/noise
    // ToDo: less than 2 votes?
    // ToDo: better scheme
    
    // if( topic.result.total() < 1 )continue;
    
    // Skip problematic/abusive propositions
    if( topic.is_abuse()
    && this.session.filter.indexOf( " #abuse " ) === -1
    )continue;
    
    // Skip "neutral" propositions, useless
    // if( topic.result.orientation() === Vote.neutral )continue;
    
    // Skip non matching propositions
    if( !topic.filtered(
      this.session.filter,
      this.session.filter_query
    ) )continue;
    
    tags.push( topic ); 
    
    // Collect all personas with a vote (unique ones)
    topic.votes_log().forEach( function( vote_value ){
      
      if( !vote_value )return;
      
      // Skip neutral voter
      if( vote_value.orientation === Vote.neutral )return;
      
      // Skip non public voters, to help protect privacy
      if( vote_value.privacy !== Vote.public )return;
      
      // Add persona if valid and not added yet
      if( !Vote.valid( vote_value.entity ) )return;
      var persona = Persona.valid( vote_value.entity.persona );
      if( !persona )return;
      var snaptime = vote_value.snaptime;
      if( snaptime < min_time ){ min_time = snaptime; }
      if( snaptime > max_time ){ max_time = snaptime; }
      if( !added_personas[ persona.name ] ){
        personas.push( persona );
        added_personas[ persona.name ] = true;
      }
      
    }); // end of all votes on that topic
    
  } // end of topics
  
  // Redirect to proposition page if no valid vote was found at all
  if( !max_time )return this.redirect( "propositions" );
  
  // Build query using selected tags and personas
  var valid_query = "";
  tags.forEach( function( tag ){
    valid_query += tag.label + " ";
  });
  personas.forEach( function( persona ){
    valid_query += persona.label + " ";
  });
  valid_query = "date"
  + " " + ( new Date( min_time ) ).toISOString()
  + " " + ( new Date( max_time ) ).toISOString()
  + valid_query;
  
  return this.redirect( "ballot2 " + valid_query ); 
}


/*
 *  Display ballot results
 */


function page_ballot2( /* pagename, ...query */ ){
  
  // This page let's visitor ask for results about propositions by specified
  // personas
  var query = slice1( arguments ).join( " " );

  this.set( page_style( "ballot" ), page_header_left() );

  if( this.session.novice ){
    this.push( i18n( 
      "This page lists results for specified voters on specified propositions, with a date limit."
    ) );
  }

  // Display Title + alloc space for list of tag filters
  this.session.set_current_page( [ "ballot" ] ); 
  var tag_set = this.push_title_and_search_form( "Ballot" );
  
  // Build a query for names and tags
  var valid_query = "";
  var tags     = [];
  var personas = [];
  var date     = null;
  var date2    = null;
  var tag_entity;
  var persona_entity;
  
  query
  // Extract date, full ISO or just 2014-06-23 style 
  .replace(
    /20[\d]{2}(\/|-)[\d]{2}(\/|-)[\d]{2}(\s|T)[\d]{2}:[\d]{2}:[\d]{2}/g,
    function( date_str ){
      date_str = date_str.replace( /\//g, "-" ).replace( / /g, "T" );
      try{
        if( !date ){
          date = new Date( date_str );
        }else{
          date2 = new Date( date_str );
        }
      }catch( err ){}
      return "";
    }
  ) 
  .replace( /20[\d]{2}(\/|-)[\d]{2}(\/|-)[\d]{2}/g, function( date_str ){
    // ToDo: issue with last second votes...
    date_str = date_str.replace( /\//g, "-" ) + "T23:59:59";
    try{
      if( date ){
        date_str = date_str.replace( /\//g, "-" ) + "T23:59:59";
        date = new Date( date_str );
      }else{
        date_str = date_str.replace( /\//g, "-" ) + "T00:00:00";
        date2 = new Date( date_str );
      }
    }catch( err ){}
    return "";
  })
  // Extract voter names
  .replace( /@[a-z0-9_]+/gi, function( name ){
    if( ( persona_entity = Persona.find( name ) )
    &&  personas.indexOf( persona_entity === -1 )
    ){
      personas.push( persona_entity );
    }
    return "";
  })
  // Extract tags and proposition names
  .replace( /[#a-z0-9_]+/gi, function( tag ){
    if( ( tag_entity = Topic.find( tag ) )
    // && query.indexOf( "@" + tag ) === -1
    && tags.indexOf( tag_entity ) === -1
    ){
      tags.push( tag_entity );
    }
    return "";
  });
  
  // If no date, use now
  if( !date ){ date = new Date(); }
  
  // If two dates, it's start and end
  if( date2 ){
    // Swap if necessary. Ignore issue about 00:00:00 and 23:59:59
    if( date2 < date ){
      var tmp = date;
      date = date2;
      date2 = tmp;
    }
  // If one date only, it's the end one
  }else{
    date2 = date;
    date  = null;
  }
  
  // if no personas, allow all voters
  if( !personas.length ){
    
    var added_personas = {};
    
    // Collect topics that match the filter && the voters
    Ephemeral.each( tags, function( topic ){
      
      // Collect all personas (unique ones)
      topic.votes_log().forEach( function( vote_value ){
        
        if( !vote_value )return;
        
        // Skip neutral voter
        if( vote_value.orientation === Vote.neutral )return;
        
        // Skip non public voters, to help protect privacy
        if( vote_value.privacy !== Vote.public )return;
        
        // Add persona if valid and not added yet
        if( !Vote.valid( vote_value.entity ) )return;
        var persona = Persona.valid( vote_value.entity.persona );
        if( !persona )return;
        if( !added_personas[ persona.name ] ){
          personas.push( persona );
          added_personas[ persona.name ] = true;
        }
        
      }); // end of all votes
    }); // end of topics
  }
  
  function cmp( a, b ){
    if( a.name < b.name )return -1;
    if( a.name > b.name )return 1;
    return 0;
  }
   
  tags     = tags.sort(     cmp );
  personas = personas.sort( cmp );
  
  valid_query = "date \n";
  if( date  ){ valid_query += "  " + date.toISOString()  + "\n"; }
  if( date2 ){ valid_query += "  " + date2.toISOString() + "\n"; }
  valid_query += "\n";
  valid_query = valid_query
  .replace( /T00:00:00/g, "" )
  .replace( /T/g, " " )
  .replace( /\..*/g, "" );
  
  valid_query += "proposition\n";
  tags.forEach( function( tag ){
    valid_query += "  " + tag.label + "\n";
  });
  
  valid_query += "\n" + i18n( "voter" ) + "\n";
  personas.forEach( function( persona ){
    valid_query += "  " + persona.label + "\n";
  });
  
  // Build a form, with the query in a textarea, big enough to avoid scrolling
  if( this.session.novice ){
    this.push( "<br>", i18n( 
      "You can change the limit dates, the propositions and the authorized voters: "
    ), "<br>" );
  }
  this.push(
    '\n<br><form name="ballot" method="POST" url="/">',
    '<input type="hidden" value="ballot2" name="page"/>',
    '<textarea name="i2" autofocus cols=40 rows="' + ( 6 + tags.length + personas.length )
    + '">\n',
    Wiki.htmlize( valid_query ),
    '\n</textarea>',
    '<br><input type="submit" value="', i18n( "Results" ), '"/>',
    '</form><br>\n'
  );
  
  var time_start = date  && date.getTime();
  var time_limit = date2 && date2.getTime();
  var sparklines = new Sparklines( this );
  
  // Collect votes and count orientations
  var that = this;
  var buf_votes = [];

  Ephemeral.each( tags, function( tag ){
    
    var total         = 0;
    var count_for     = 0;
    var count_against = 0;
    var count_blanks  = 0;
    var buf_proposition_votes = [];
    that.push(
      '<br><h3>',
      link_to_page( "proposition", tag.label, tag.label ),
      '</h3> '
    );
    tag_set.add_proposition( tag );
    
    buf_votes.push( '<br><h3>',
      link_to_page( "proposition", tag.label, tag.label ),
      '</h3> '
    );
    
    Ephemeral.each( personas, function( persona ){
      
      var vote = tag.get_vote_of( persona );
      if( !vote )return;
      
      var vote_value = vote.get_old_value( time_start, time_limit );
      if( !vote_value )return;
      
      var orientation = vote_value.orientation;
      
      if( orientation && orientation === Vote.neutral )return;
      
      // Don't count private/secret votes to protect privacy
      if( vote.privacy() === Vote.secret
      ||  vote_value.privacy === Vote.secret
      ){
      }else if( vote.privacy() === Vote.private
      || vote_value.privacy === Vote.private
      ){
        
      // Public votes
      }else{
        
        buf_proposition_votes.push( '\n<br>'
          + link_to_persona_page( persona )
          + ' '
        );
        var agent_label = vote_value.agent_label;
        if( agent_label ){
          buf_proposition_votes.push(
            ' <dfn>(via ',
            link_to_page( "persona", agent_label ),
            ')</dfn> '
          );
        }
        buf_proposition_votes.push( emojied( orientation ) );
        
        total++;
        if( orientation === Vote.agree ){
          count_for++;
        }else if( orientation === Vote.blank ){
          count_blanks++;
        }else{
          de&&mand( orientation === Vote.disagree || orientation === Vote.protest );
          count_against++;
        }
      }
    });
    
    // Display results
    that.push(
      "<em>",
      emojied( count_for > count_against ? Vote.agree : Vote.disagree ),
      '</em><br>',
      ""  , i18n( "agree"   ), " ", count_for,
      ". ", i18n( "against" ), " ", count_against,
      ". ", i18n( "blank"   ), " ", count_blanks,
      ". total ",   total,
      ". <br>"
    );
    
    // Display sparkline
    sparklines.add( tag, time_start, time_limit, personas );
    
    // Bufferize future display of votes
    buf_proposition_votes.push( "<br>" );
    buf_votes.push.apply( buf_votes, buf_proposition_votes );
    that.push( '<br><br>' );
  });
  
  // Display bufferized personal votes
  this.push( "<br><br><h2>Votes<br>" );
  this.concat( buf_votes );
  
  // Inject list of all seen tags
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  // Inject sparklines
  sparklines.push();
  
  this.push( "<br>", page_footer() );
  
} // page_ballot2()


/* ---------------------------------------------------------------------------
 *  page votes
 */

function page_votes( page_name ){
// This is the votes page of the application, filtered.

  var persona = this.session.visitor;
  
  if( !this.session.has_delegateable_filter() ){
    return this.redirect( "propositions" );
  }
  // Remove #new filter, confusing
  this.session.remove_confusing_new_filter();
    
  // Header
  var that = this;
  this.set(
    page_style( "votes" ),
    page_header_left(
      _,
      this.session.has_filter()
      ? link_to_twitter_tags( that.session.filter )
      : _,
      _
    )
  );

  if( this.session.novice ){
    this.push( i18n(
      "This page lists direct individual votes on propositions. Click on a proposition for details."
    ) );
  }

  var tag_set = this.push_title_and_search_form( "Votes" );

  // Display list of matching votes
  var votes = Vote.log; // All votes!
  var vote_value;
  var entity;
  var visitor_tag = null;
  if( persona ){
    visitor_tag = "#" + persona.label.substring( 1 );
  }
  var ii = votes.length;
  var count = 0;
  var propositions = [];
  var proposition;

  // Scan votes, last ones first
  var valid_votes = [];
  while( ii-- ){

    vote_value = votes[ ii ];
    entity = vote_value.entity;

    if( !entity
    || !entity.filtered( this.session.filter, this.session.filter_query, persona )
    )continue;

    // Filter out propositions without votes unless current user created it
    if( !entity.proposition.result.total()
    && ( !visitor_tag || !entity.proposition.has_tag( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    )continue;

    // Keep non neutral direct votes
    if( vote_value.delegation          === Vote.direct
    && vote_value.orientation          !== Vote.neutral
    && vote_value.entity.orientation() !== Vote.neutral
    ){
      count++;
      // Avoid excessive output
      if( count >= 200 )break;
      valid_votes.push( vote_value );
      if( propositions.indexOf( entity.proposition ) === -1 ){
        propositions.push( entity.proposition );
      }
    }
  }
  
  // Inject tags of all seen propositions
  propositions.forEach( function( proposition ){
    tag_set.add_proposition( proposition );
  });
  
  // Sort by name of proposition & time of comment (last is shown first)
  var sort_criterias = this.session.sort_criterias;
  if( !sort_criterias.length ){
    sort_criterias = [ "+name" ];
  }
  valid_votes = valid_votes.sort( function( a, b ){
    var name_a = a.proposition;
    var name_b = b.proposition;
    if( name_a === name_b )return b.snaptime - a.snaptime;
    var prop_a = Topic.find( name_a );
    var prop_b = Topic.find( name_b );
    if( prop_a && prop_b ){
      // The last consulted proposition is before all the others
      if( prop_a === PageBuilder.current.session.proposition )return 1;
      if( prop_b === PageBuilder.current.session.proposition )return -1;
      return Ephemeral.compare_measures(
        prop_a,
        prop_b,
        sort_criterias,
        persona
      );
    }
    return name_a > name_b ? 1 : -1;
  });
  
  // Display votes
  var seen_comments = {};
  var last_proposition;
  
  valid_votes.forEach( function( vote_value ){
    proposition = vote_value.entity.proposition;
    if( last_proposition && proposition !== last_proposition ){
      that.push( '<br>' );
    }
    
    if( proposition !== last_proposition ){
      that.push(
        "<br><h2>",
        ( proposition.is_tag() ? "tag " : "" ),
        link_to_page( "proposition", proposition.label ),
        "</h2><br>"
      );
    }else{
      that.push( "<br>" );
    }
    
    last_proposition = proposition;
    
    var orientation_text
    = vote_value.privacy !== Vote.public || vote_value.entity.privacy() !== Vote.public
    ? (  ( vote_value.privacy !== Vote.public && vote_value.privacy )
      || ( vote_value.entity.privacy() !== Vote.public && vote_value.entity.privacy() )
    )
    : vote_value.orientation;
    var persona_text
    = vote_value.privacy === Vote.private || vote_value.entity.privacy() === Vote.private
    ? "private"
    : link_to_page( "persona", vote_value.persona_label );
    var agent_label;
    if( vote_value.delegation !== Vote.direct ){
      if( entity && ( agent_label = entity.agent_label() ) ){
        persona_text += ' <dfn>(via ' + agent_label + ')</dfn> ';
      }else{
        persona_text += ' <dfn>(indirect)</dfn> ';
      }
    }else
    that.push(
      ' ' + emojied( orientation_text ) + " ",
      persona_text,
      " <small><dfn>", time_label( vote_value.snaptime ), "</dfn></small>"
    );
    var comment = vote_value.comment_text;
    if( comment ){
      if( !seen_comments[ comment ] ){
        seen_comments[ comment ] = true;
        that.push( ' ' + format_comment( comment ) );
      }
    }
    // buf.push( "</li>" );
  });

  // Inject list of all seen tags, to alter filter when clicked
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push(  "<br><br>", page_footer() );
  
} // page_votes()


/* ---------------------------------------------------------------------------
 *  page leaders
 */

function page_leaders( page_name, optional_proposition_name ){
  
  // Is there a proposition agent must have a vote about?
  var about_proposition
  = ( optional_proposition_name === "all" )
  ? null
  : Topic.find( optional_proposition_name );

  // Avoid too unspecific search, might be too expensive
  if( !this.session.has_delegateable_filter()
  && !about_proposition
  )return this.redirect( "propositions" );

  var that = this;
  var persona = this.session.visitor;
  
  this.set(
    page_style( "delegations" ),
    about_proposition
    ? page_header(
        link_to_page( "ballot2", about_proposition.label, "ballot" )
      )
    : page_header_left()
  );
  
  if( this.session.novice ){
    this.push( i18n( 
      "This page lists indirect votes via delegates and associated tags. If logged in, you can delegate."
    ) );
    if( optional_proposition_name !== "all" ){
      this.push( " ", i18n(
        "Results are about votes of whoever casted a vote on proposition"
      ), " ", optional_proposition_name, "." );
    }
  }

  var title = i18n( "Delegates" );
  if( about_proposition ){
    title += " <h2>" + link_to_proposition_page( about_proposition ) + "</h2>";
  }
  var tag_set = this.push_title_and_search_form( title );
  
  // Scan all votes
  var votes = Vote.get_log(); // All votes!
  
  var vote_value;
  var entity;
  var visitor_tag = null;
  if( persona ){
    visitor_tag = "#" + persona.label.substring( 1 );
  }
  var ii = votes.length;
  var seen_agents = {};
  var seen_personas = {};
  var seen_vote = {};
  var agent_ids = [];
  var count_agents = 0;
  var count_personas = 0;
  var seen_propositions = {};
  var propositions = [];
  var count_propositions = 0;
  var count_by_proposition = {};
  var count_delegations_by_agent = {};
  var delegation_counts_by_agent = {}; // counts dispatched by tag filters
  var delegations_by_agent = {};
  var tag_ids_by_delegation = {};
  var count_delegations_by_tags = {};
  var delegation_counts_by_tags = {}; // counts dispatched by agent
  var all_tag_ids = [];
  var delegation;

  // Scan votes, last ones first, looking for indirect votes
  var max_votes = 0;
  var count_direct_votes   = 0;
  var count_indirect_votes = 0;
  var last_vote;
  var proposition;
  var voter;
  var cache_filtered_out_propositions = {};
  var voter_to_skip = {};
  
  while( ii-- ){

    // Don't scan all votes, too long, set a limit when enough propositions
    if( max_votes ){
      if( max_votes > count_indirect_votes )break;
    }else{
      if( count_propositions > 200 ){
        max_votes = count_indirect_votes * 2;
      }
    }

    vote_value = votes[ ii ];
    entity = Vote.valid( vote_value.entity );

    if( !entity )continue;
    
    // Only the last vote of a persona on a proposition matters
    if( seen_vote[ entity.id ] )continue;
    seen_vote[ entity.id ] = true;
    
    proposition = Topic.valid( entity.proposition );
    
    if( !proposition )continue;
    if( cache_filtered_out_propositions[ proposition.id ] )continue;
    
    voter = Persona.valid( entity.persona );
    if( !voter )continue;
    
    // Skip votes from whoever never voted on optional focused proposition
    if( about_proposition ){
      if( voter_to_skip[ voter.id ] )continue;
      if( !about_proposition.get_non_neutral_vote_of( voter ) ){
        voter_to_skip[ voter.id ] = true;
        continue;
      }
    }
    
    if( !proposition.filtered( 
      this.session.filter,
      this.session.filter_query,
      persona
    ) ){
      cache_filtered_out_propositions[ proposition.id ] = true;      
      continue;
    }

    // Skip neutral votes
    if( vote_value.orientation        === Vote.neutral
    || vote_value.entity.orientation() === Vote.neutral
    )continue;
    
    // Skip direct votes
    if( vote_value.delegation === Vote.direct ){
      count_direct_votes++;
      continue;
    }
    
    count_indirect_votes++;
    last_vote = vote_value;
    
    // Remember new proposition's tags
    if( count_propositions < 200 && !seen_propositions[ proposition.id ] ){
      seen_propositions[ proposition.id ] = true;
      tag_set.add_proposition( proposition );
      count_propositions++;
      propositions.push( proposition );
      count_by_proposition[ proposition.id ] = 0;
    }
    count_by_proposition[ proposition.id ]++;
    
    if( count_agents >= 200 )continue;
    
    // Remember new persona
    var persona_id = vote_value.persona;
    if( !seen_personas[ persona_id ] ){
      seen_personas[ persona_id ] = true;
      count_personas++;
    }
    
    delegation = Delegation.find( vote_value.delegation );
    if( !delegation )continue;
    
    // Remember new agent
    var agent_id = delegation.agent.id;
    if( !seen_agents[ agent_id ] ){
      seen_agents[ agent_id ] = true;
      delegations_by_agent[ agent_id ] = [];
      count_delegations_by_agent[ agent_id ] = 0;
      delegation_counts_by_agent[ agent_id ] = {};
      agent_ids.push( agent_id );
      count_agents++;
    }
    
    delegations_by_agent[ agent_id ].push( delegation );
    count_delegations_by_agent[ agent_id ]++;
  }

  // Sort propositions, by decreasing number of indirect votes
  propositions = propositions.sort( function( a, b ){
    var count_a = count_by_proposition[ a.id ];
    var count_b = count_by_proposition[ b.id ];
    return count_b - count_a;
  });
  
  // Sort agent by number of delegated votes
  agent_ids = agent_ids.sort( function( a, b ){
    return count_delegations_by_agent[ b ] - count_delegations_by_agent[ a ];
  });
  
  // Delegates. Display each agent
  this.push( "<br><br><h2>", i18n( "Delegates" ), "</h2>" );
  if( persona ){
    this.push( " - ", link_to_page( "delegations" ) );
  }
  this.push( "<br>");
  
  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var delegates_graph_pie = [ [ "direct", count_direct_votes ] ];
  this.push( '<div id="delegates_chart_div" style="height:300px"></div>' );

  agent_ids.forEach( function( agent_id ){
    
    var agent = Persona.find( agent_id );
    if( !agent )return;
    
    var agent_delegations = delegations_by_agent[ agent_id ];
    var count_agent_delegations_by_tags = {};
    var tag_strings = [];
    var ratio = Math.round( 1000 * ( 
      count_delegations_by_agent[ agent_id ] / count_indirect_votes
    ) ) / 10;

    // Display name of agent
    that.push(
      "<br><h2>",
      link_to_persona_page( agent ),
      "</h2> <dfn>(",
        count_delegations_by_agent[ agent_id ], " ",
        ratio,
      "%)</dfn>"
    );
    
    // If focusing on a specific proposition, display agent's orientation
    if( about_proposition ){
      var agent_vote = about_proposition.get_non_neutral_vote_of( agent );
      if( agent_vote ){
        that.push(
          " ",
          emojied( agent_vote.orientation() )
        );
      }
    }
    that.push( "<br>" );
    
    delegates_graph_pie.push( [
      Persona.find( agent_id ).label,
      count_delegations_by_agent[ agent_id ]
    ] );
    
    // Collect delegations of agent, by tag strings
    Ephemeral.each( agent_delegations, function( delegation ){
      var tag_ids = tag_ids_by_delegation[ delegation.id ];
      // tags string is cached.
      if( !tag_ids ){
        var tag_label_list = [];
        Ephemeral.each( delegation.tags, function( tag ){
          tag_label_list.push( tag.label );
        } );
        // ToDo: should sort differently, alpha is not very relevant
        tag_label_list = tag_label_list.sort( function( a, b ){
          return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
        });
        tag_ids = tag_label_list.join( " " );
        tag_ids_by_delegation[ delegation.id ] = tag_ids;
      }
      // Count number of votes involved, for all agents
      var count = count_delegations_by_tags[ tag_ids ];
      if( !count ){
        count_delegations_by_tags[ tag_ids ] = 1;
        all_tag_ids.push( tag_ids );
      }else{
        count_delegations_by_tags[ tag_ids ] = count + 1;
      }
      // Count number of votes involved, for this agent
      count = count_agent_delegations_by_tags[ tag_ids ];
      if( !count ){
        count_agent_delegations_by_tags[ tag_ids ] = 1;
        tag_strings.push( tag_ids );
      }else{
        count_agent_delegations_by_tags[ tag_ids ] = count + 1;
      }
      // Same thing, by agent
      var counts = delegation_counts_by_agent[ delegation.agent.id ];
      count = counts[ tag_ids ];
      if( !count ){
        counts[ tag_ids ] = 1;
      }else{
        counts[ tag_ids ] = count + 1;
      }
      // Same thing, by tags
      counts = delegation_counts_by_tags[ tag_ids ];
      if( !counts ){
        counts = {};
        delegation_counts_by_tags[ tag_ids ] = counts;
        count = 0;
      }else{
        count = counts[ delegation.agent.id ];
      }
      if( !count ){
        counts[ delegation.agent.id ] = 1;
      }else{
        counts[ delegation.agent.id ] = count + 1;
      }
      
    });
    
    // Sort tag strings by number of delegated votes, most first
    tag_strings = tag_strings.sort( function( a, b ){
      var count_a = count_delegations_by_tags[ a ];
      var count_b = count_delegations_by_tags[ b ];
      return count_b - count_a;
    });
    
    // Display top 10 most seen tag sets
    var len = tag_strings.length;
    var tags;
    for( var ii = 0 ; ii < len && ii < 10 ; ii++ ){
      
      tags = tag_strings[ ii ];
      ratio = Math.round( 1000 * ( 
        delegation_counts_by_agent[ agent_id ][ tags ]
        / count_delegations_by_agent[ agent_id ]
      ) ) / 10;
      var can_delegate = persona && persona.id !== agent_id;
      if( can_delegate ){
        that.push(
          '\n<form name="delegation" url="/">',
          '<input type="submit" value="', i18n( "Delegate" ), '"/> '
        );
      }
      that.push(
        link_to_page( 
          "persona",
          agent_id + " " + tags,
          tags.replace( / /g, "+" )
        ),
        " <dfn>(",
          delegation_counts_by_agent[ agent_id ][ tags ], " ",
          ratio,
        "%)</dfn> "
      );

      // Delegate button
      if( can_delegate ){
        that.push(
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + agent_id + '"/>',
          '<input type="hidden" name="i3" value="' + tags + '"/>',
          '</form>\n'
        );
      }else{
        that.push( "<br>" );
      }
    }
    // that.push( "<br>" );
  });
  
  // Display filters
  this.push(
    "<br><br><h2>Tags</h2> - ",
    link_to_page( "tags", "+age", "all" ),
    "<br>"
  );
  
  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var tags_graph_pie = [ [ "direct", count_direct_votes ] ];
  this.push( '<div id="tags_chart_div" style="height:300px"></div>' );

  all_tag_ids = all_tag_ids.sort( function( a, b ){
    var count_a = count_delegations_by_tags[ a ];
    var count_b = count_delegations_by_tags[ b ];
    return count_b - count_a; // Most referenced first
  });
  
  all_tag_ids.forEach( function( tags ){
    
    var ratio = Math.round( 1000 * ( 
        count_delegations_by_tags[ tags ]
        / count_indirect_votes
      ) ) / 10;
      
    that.push(
      "<br><h2>",
      link_to_page(
        "leaders", 
        (about_proposition ? about_proposition.id : "all" ) + " " + tags, 
        tags.replace( / /g, "+" )
      ),
      "</h2> <dfn>(",
        count_delegations_by_tags[ tags ], " ",
        ratio,
      "%)</dfn><br>"
    );
    
    tags_graph_pie.push( [
      tags,
      count_delegations_by_tags[ tags ]
    ] );
    
    var counts = delegation_counts_by_tags[ tags ];
    var list = [];
    for( var agent_id in counts ){
      list.push( agent_id );
    }
    list = list.sort( function( agent_a, agent_b ){
      var count_a = counts[ agent_a ];
      var count_b = counts[ agent_b ];
      return count_b - count_a;
    });
    var len = list.length;
    // Display top 10  most important agents
    for( var ii = 0 ; ii < len && ii < 10 ; ii++ ){
      agent_id = list[ ii ];
      ratio = Math.round( 1000 * ( 
        counts[ agent_id ]
        / count_delegations_by_tags[ tags ]
      ) ) / 10;
      var can_delegate = persona && persona.id !== agent_id;
      if( can_delegate ){
        that.push(
          '\n<form name="delegation" url="/">',
          '<input type="submit" value="', i18n( "Delegate" ), '"/> '
        );
      }
      that.push(
        link_to_page(
          "persona", agent_id + " " + tags, agent_id
        ),
        "</h2> <dfn>(",
          counts[ agent_id ], " ",
          ratio,
        "%)</dfn>"
      );
      // If focusing on a specific proposition, display agent's orientation
      if( about_proposition ){
        var agent = Persona.find( agent_id );
        if( agent ){
          var agent_vote = agent.get_non_neutral_vote_on( about_proposition );
          if( agent_vote ){
            that.push(
              " ",
              emojied( agent_vote.orientation() )
            );
          }
        }
      }
      // Delegate button
      if( can_delegate ){
        that.push(
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + agent_id + '"/>',
          '<input type="hidden" name="i3" value="' + tags + '"/>',
          '</form>\n'
        );
      }else{
        that.push( "<br>" );
      }
    }
    // that.push( "<br>" );
  });
  
  // Display each proposition
  this.push(
    "<br><br><h2>Propositions</h2> -  ",
    link_to_page( "propositions", "", "details" ),
    '<br>'
  );
  
  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var propositions_graph_pie = [ [ "direct", count_direct_votes ] ];
  this.push( '<div id="propositions_chart_div" style="height:300px"></div>' );
  
  var other_count = count_indirect_votes;
  var shown_propositions = 0;
  
  Ephemeral.each( propositions, function( proposition ){
    that.push( "<br>", link_to_page( "leaders", proposition.label ) );
    shown_propositions++;
    if( shown_propositions > 10 )return;
    var c = count_by_proposition[ proposition.id ];
    other_count -= c;
    propositions_graph_pie.push( [
      proposition.label,
      c
    ] );
  });
  
  if( other_count ){
    if( other_count < 0 )debugger;
    propositions_graph_pie.push( [ i18n( "other"), other_count ] );
  }
  
  // Summary
  if( last_vote ){
    this.push(
      "<br><br><h2>", i18n( "Summary" ), "</h2><br>",
      "<br>proposition ",                   count_propositions,
      "<br>", i18n( "voter" ), " ",         count_personas,
      "<br>", i18n( "direct vote" ), " ",   count_direct_votes,
      "<br>", i18n( "indirect vote" ), " ", count_indirect_votes, 
      "<br>", i18n( "delegate" ), " ",      count_agents,
      "<br>tag ",                           all_tag_ids.length,
      "<br>", i18n( "since" ), " ",         time_label( last_vote.snaptime ),
      "<br><br>"
    );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push(  "<br><br>", page_footer() );

  // Add data for graphics  
  this.push(
    '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar delegates_graph_pie = '    + JSON.stringify( delegates_graph_pie )
    + '\nvar tags_graph_pie = '         + JSON.stringify( tags_graph_pie )
    + '\nvar propositions_graph_pie = ' + JSON.stringify( propositions_graph_pie )
    + '\nvar i18n = {};'
    + '\n' + leaders_graphics + '; leaders_graphics();'
    + '</script>'
  );
  
} // page_leaders()


/* ---------------------------------------------------------------------------
 *  page login
 */

function page_login( page_name ){

  this.set( page_style( "login" ), page_header() );

  // Query for name
  this.push(
    '\n<form name="login" url="/">',
    '<label>', i18n( "Your twitter @name" ), '</label> ',
    '<input type="hidden" name="i" value="login"/>',
    '<input type="text" autofocus name="i2"/>',
    ' <input type="submit" value="Login"/>',
    '</form>\n'
  );
  this.push( "<br>", page_footer() );

} // page_login()


/* ---------------------------------------------------------------------------
 *  page index
 */

function page_index(){
  
  // Domains menu
  var domains = Ephemeral.Machine.all;
  var valid_machines = [];
  Ephemeral.Machine.main.activate();
  domains.forEach( function( machine ){
    var persona = Persona.find( "@" + machine.owner );
    if( !persona )return;
    var persona_topic = persona.get_topic();
    if( !persona_topic )return;
    if( persona_topic.is_abuse() )return;
    valid_machines.push( machine.id );
  });
  valid_machines = valid_machines.sort( function( a, b ){
    return a > b ? -1 : 1;
  });
  var menu = "";
  if( valid_machines.length > 1 ){
    menu = [];
    menu.push(
      '\n<form name="domain" url="/">',
      '\n<select name="domain" onchange=',
      '"if( this.value !== 0 ){ ',
        //'this.form[0].value = this.value;',
        'this.form.submit();',
      '}">',
      '\n<option value="">Domain</options>'
    );
    valid_machines.forEach( function( label ){
      if( !label )return;
      menu.push( '\n<option value="', label, '">', label, '</options>' );
    });
    menu.push(
      '\n</select>',
      ' <input type="submit" value="Visit" ',
      '</form><br>or<br>\n'
    );
    menu = menu.join( "" );
  }
  
  this.set(
    '<link rel="stylesheet" href="' + config.index_style + '" type="text/css">',
    '<img src="http://simpliwiki.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;"></img>',
    '\n<div id="background" class="background"></div>',
    '\n<div id="header" class="sw_header">',
      '\n<div class="sw_header_content">',
        '\n<div style="float:left;" class="sw_logo sw_boxed">',
          '\n<div style="float:left;">',
          '<img src="http://simpliwiki.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
          '</div>',
          '\n<div id="slogan" style="min-height:64px; height:64px;">',
          '<strong>' + link_to_twitter_tags( "#kudocracy", "#kudo<em>c</em>racy" ) + '</strong>',
          '\n<br>', i18n( "new democracy" ),
          '\n</div>',
        '</div>',
        '\n<span id="tagline">',
        '<h3 id="tagline">',
          link_to_twitter_tags(
            "#democracy #vote #election #LiquidDemocracy #participation"
          ),
        '</h3>',
        //'<small><i>a tribute to <a href="http://wikipedia.org">Wikipedia</a></i></small>',
        '\n</span>',
      '\n</div>',
    '\n</div><br><br>',
    '\n<div id="footer" class="sw_footer sw_boxed">',
    menu,
    '\n <form name="proposition" url="/">\n',
    '<span style="font-size:1.5em">' + emoji( "agree" ) + ' </span>',
    '<input type="hidden" name="page" value="propositions"/>',
    '<input type="search" placeholder="all" name="i1" value="#new"/>',
    ' <input type="submit" value="propositions?"/>',
    '\n</form>\n',
    '</div>',
    '\n<br><br><a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy&text=new%20democracy, opensource. '
    + config.url + '&hashtags=kudocracy,democracy,opensource,vote" class="twitter-hashtag-button" data-related="Kudocracy,democracy,opensource">Tweet #kudocracy</a>',
    ' <a href="https://twitter.com/Kudocracy" class="twitter-follow-button" data-show-count="true">Follow @Kudocracy</a>',
    // Twitter buttons
    '\n<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>'
    //'<div><div><div>' + page_footer()
  );
  
  this.session.clear();
  this.session.needs_twitter = true;
  
} // page_index()


/* ---------------------------------------------------------------------------
 *  page help
 */

function page_help(){
  
  // Flip/flop expert/novice mode
  if( !this.novice ){
    this.session.novice_mode();
  }else{
    // ToDo: figure out a better scheme to escape novice mode
    // this.session.expert_mode();
  }
  
  var msg = [];
  msg.push( link_to_wiki( "HomePage", "wiki" ), "<br>" );
  
  // English version
  if( this.session.lang !== "fr" ){
    msg.push(
      
      'Version ', link_to_command( "lang fr", "fran&ccedil;aise" ), ". ",
      'English ', link_to_command( "lang en", "version" ),          ". ",
      '<br><br>',
      
      '<h2>How to..?</h2><br>',
      'See the wiki:' + Wiki.wikify( " HowTo." ),
      '<br><br>',
      
      '<h2>What is it?</h2><br>',
      'An experimental <em>Liquid Democracy</em> voting system where ',
      'each one of us can ', emoji( "agree" ), 'like or ',
      emoji( "disagree" ) + 'dislike propositions associated to hashtags, ',
      "or delegate.",
      
      '<br><br>',
      
      '<h2>Hashtags?</h2><br>',
      'Hashtags are keywords used to categorize topics in social networks. ',
      'See also ',
      '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
      '<br><br>',
      
      '<h2>Delegate?</h2><br>',
      'On propositions that match tags you specified, you tell who votes for you',
      ' unless you vote directly.',
      '<br><br>',
      
      '<h2>How is it different?</h2><br>',
      'Traditional voting systems with elections every so often capture ',
      'infrequent snapshots of the opinion. Because voting often on many matters ',
      'is inconvenient, ',
      'elections are either rare or participation suffers. Most decisions ',
      'are therefore concentrated in the hands of a few representatives ',
      'who may be pressured or subjected to corruption. Liquid Democracy promises ',
      'to solve these issues thanks to modern technologies.',
      '<br><br><ul>',
      
      '<li>With <strong>Kudo<em>c</em>racy</strong>:</li>',
      '<li>Votes are reversible, you can change your mind.</li>',
      '<li>Propositions are searchable using tags.</li>',
      '<li>Delegates you choose may vote for you on some propositions.</li>',
      '<li>You can follow their recommendations or vote directly.</li>',
      '<li>Votes and delegations are ephemeral and disappear unless renewed.</li>',
      '<li>Results are updated in realtime, trends are made visible.</li>',
//      '<li>You can share your votes or hide them.</li>',
      '<li>It is <a href="https://github.com/virteal/kudocracy">open source</a>.',
      ' Data are <a href="http://creativecommons.org/licenses/by/4.0/">open too (CC by 4.0)</a>',
      ', <a href="?api=open_data">here</a>.</li>',
      '</ul><br>',
      
      '<h2>Is it available?</h2><br>',
      'No, not yet. What is available is this prototype. Depending on ',
      'success (vote #kudocracy!), the prototype will hopefully expand into ',
      'a robust system able to handle billions of votes from millions of ',
      'persons. That is not trivial and requires help.',
      '<br><br>',
      
      '<h2>Who are you?</h2><br>',
      'My name is Jean-Hugues Robert, ',
      link_to_twitter_user( "@jhr" ),
      '. I am a 48 years old software developper ',
      'from Corsica (the island where Napoleon was born). When I discovered the',
      ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
      'Delegative democracy</a> concept, I liked it. I think that it would ',
      'be a good thing to apply it broadly, using modern technology, technology ',
      'that people now use all over the world.<br>',
      'I hope you agree. ',
      "<br><br> Jean-Hugues."
    );
  
  // French
  }else{
    msg.push(
      
      'English ', link_to_command( "lang en", "version" ),          ". ",
      'Version ', link_to_command( "lang fr", "fran&ccedil;aise" ), ". ",
      '<br><br>',
      
      '<h2>Comment faire..?</h2><br>',
      'Voir le wiki:' + Wiki.wikify( " HowTo." ),
      '<br><br>',
      
      '<h2>De quoi s\'agit-il ?</h2><br>',
      'Un syst&egrave;me de vote exp&eacute;rimental de type <em>D&eacutemocratie Liquide</em> dans lequel ',
      'chacun peut ', emoji( "agree" ) + 'approuver ou ', emoji( "disagree" ),
      'd&eacute;sapprouver des propositions associ&eacute;es &agrave; des hashtags',
      ', ou d&eacute;l&eacute;guer.',
      '<br><br>',
      
      '<h2>Hashtags ?</h2><br>',
      'Les hashtags sont des mots-clefs utilis&eacute;s pour classer les sujets dans les r&eacute;seaux sociaux. ',
      'Voir aussi ',
      '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
      '<br><br>',
      
      '<h2>D&eacute;l&eacute;guer ?</h2><br>',
      'Sur des propositions, associ&eacute;es &agrave; des hastags',
      ", vous d&eacute;signez qui vote pour vous, sauf &agrave; voter directement",
      '<br><br>',
      
      '<h2>En quoi est-ce diff&eacute;rent ?</h2><br>',
      "Les syst&egrave;mes de vote traditionnels enregistrent des images infr&eacute;quentes de l'opinion ",
      "car voter souvent sur beaucoup de sujets n'est pas pratique. ",
      "Les &eacute;lections sont rares sinon la participation s'effondre. ",
      "La plupart des d&eacute;cisions est donc concentr&eacute;e dans ",
      "les mains d'un petit nombre de repr&eacute;sentants. Ils sont souvent l'objet ",
      "de pressions voire de tentatives de corruption. ",
      'La "D&eacute;mocratie Liquide" permet d\'envisager r&eacute;soudre ',
      "ces probl&egrave;mes en utilisant des technologies modernes.",
      '<br><br><ul>',
      
      '<li>Avec <strong>Kudo<em>c</em>racy</strong> :</li>',
      '<li>Les votes sont modifiables, vous pouvez changer d\'avis.</li>',
      '<li>Chaque proposition est class&eacute;e par sujet selon des hashtags.</li>',
      '<li>Des d&eacute;l&eacute;gu&eacute;s que vous choisissez votent pour vous sur certains sujets.</li>',
      '<li>Vous pouvez suivre leurs recommendations ou voter directement.</li>',
      '<li>Les votes autant que les d&eacute;l&eacute;gations sont rendus &eacute;ph&eacute;m&egrave;res ',
      "pour tenir compte de l'&eacute;volution des opinions.</li>",
      '<li>Les r&eacute;sultats sont disponibles immédiatement, les tendances sont affich&eacute;es.</li>',
      '<li>Le logiciel est <a href="https://github.com/virteal/kudocracy">open source</a>.',
      ' Les données sont <a href="http://creativecommons.org/licenses/by/4.0/">libres aussi (CC by 4.0)</a>',
      ', <a href="?api=open_data">i&ccedil;i</a>.</li>',
      '</ul><br>',
      
      '<h2>Est-ce dispo ?</h2><br>',
      'Non, pas totalement. Ce qui est dispo est ce prototype. ',
      'Selon son succ&eacute;s (votez #kudocracy !), le prototype sera am&eacute;lior&eacute; ',
      'pour devenir une solution robuste capable de traiter les milliards de votes de millions ',
      'de personnes. Ce n\'est pas simple.',
      '<br><br>',
      
      '<h2>Qui ?</h2><br>',
      'Mon nom est Jean-Hugues Robert, ',
      link_to_twitter_user( "@jhr" ),
      '. Je suis un informaticien de 48 ans vivant en Corse. ',
      'Quand j\'ai d&eacute;couvert ce qu\'est la ',
      ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
      'D&eacute;mocratie d&eacute;l&eacute;gative</a>, j\'ai beaucoup aim&eacute;. ',
      'Je pense que ce serai une bonne chose de l\'appliquer largement, ',
      'en utilisant les technologies modernes, ',
      'disponibles maintenant partout dans le monde.<br> ',
      'J\'ai l\'espoir que vous serez d\'accord.',
      "<br><br> Jean-Hugues."
    );
  }
  
  msg = msg.join( "" );
  
  this.set(
    
    page_style( "help" ),
    
    page_header(
      _,
      link_to_twitter_tags( "#kudocracy" ),
      _
    ),
    
    '<div style="max-width:50em">', msg, '</div><br>',
    
    // Twitter tweet & follow buttons
    '\n<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy',
    '&hashtags=kudocracy,democracy,opensource,LiquidDemocracy',
    '&text=new%20democracy ' + config.url + '"',
    'class="twitter-hashtag-button" ',
    'data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    '\n<br><a href="https://twitter.com/Kudocracy',
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow @Kudocracy</a>',
    '\n<br><a href="https://twitter.com/jhr',
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow @jhr</a>',
    //'<br><br><h2>Misc</h2><br>',
    //'Debug console: ' + link_to_command( "help" ),
    '<br>'
  );
  
  this.session.needs_twitter = true;
  
  this.push(
    "<br>",
    "<br>", i18n( "persona"     ), " ", Persona.count,
    "<br>", i18n( "proposition" ), " ", Topic.count,
    "<br>", i18n( "vote"        ), " ", Vote.count,
    "<br>", i18n( "comment"     ), " ", Comment.count,
    "<br>", i18n( "delegation"  ), " ", Delegation.count,
    "<br><br>"
  );
  this.push( page_footer() );
  
} // page_help()


/*
 *  emoji
 *    Chrome requires the installation of an extension in order to display
 *  emojis correctly. Safari is special on some emojis.
 *
 *  I currently use thumb up, down for orientations and check box and cross
 *  for tag filtering.
 */


emoji.table = {
  checked:  "&#9989;",
  neutral:  "&#x1f450;== ",  // open hands, ==
  agree:    "&#x1f44d;+1 ",  // Thumb up, +1
  disagree: "&#x1F44e;-1 ",  // Thumb down, -1
  blank:    "&#x270b;?! ",   // raised hand, ?!
  protest:  "&#x270a;!!! ",  // raised fist, !!!
};


emoji.table_ascii = {
  checked:   "+ ",
  neutral:   "== ",
  agree:     "+1 ",
  disagree:  "-1 ",
  blank:     "?! ",
  protest:   "!!! "
};


function emoji( name, spacer ){
  var tmp;
  if( Session.current.is_safari
  ||  Session.current.is_chrome
  ){
    tmp = emoji.table_ascii[ name ];
  }else{
    tmp = emoji.table[ name ];
  }
  if( !tmp    )return "";
  if( !spacer )return tmp;
  return tmp + spacer;
}


function emojied( text ){
  return text ? emoji( text ) + i18n( text ) : "";
}


function proposition_summary( proposition, div ){
  
  var buf = new PageBuilder();
  
  function cond_push( label, n, style ){
    if( n ){
      if( style ){
        buf.push( '<' );
        buf.push( style );
        buf.push( '>' );
      }
      buf.push( i18n( label ) );
      buf.push( ' ' + n + '. ' );
      if( style ){
        buf.push( '</' );
        buf.push( style );
        buf.push( '>' );
      }
    }
  }
  
  var result = proposition.result;
  var orientation = result.orientation();
  if( !orientation ){ orientation = ""; }

  // When in page_proposition()
  var wiki = proposition.label;
  if( wiki[ 0 ] === "#" ){
    if( Persona.find( "@" + wiki.substring( 1 ) ) ){
      wiki = "@" + wiki.substring( 1 );
    }
  }
  if( div ){
    buf.push(
      '<div><h2>', i18n( "Summary" ),
      ' <em>', emojied( orientation ), '</em>',
      //+ ( comment ? '<br>' + format_comment( comment.text ) : "" )
      '</h2> ',
      link_to_wiki( wiki, "wiki" ),
      '<br>'
    );

  // Elsewhere
  }else{
    var comment = proposition.get_comment_text();
    var author  = proposition.get_comment_author();
    var full_comment = "";
    if( comment ){
      full_comment += format_comment( comment );
    }
    if( author ){
      full_comment += ' <dfn> - ' + link_to_persona_page( author ) + '</dfn>';
    }
    if( full_comment ){
      buf.push(
        '<h3>', full_comment, '</h3> ' ,
        link_to_wiki( wiki )
      );
    }else{
      buf.push( link_to_wiki( wiki, "wiki" ) );
    }
    buf.push( "<br><em>" + emojied( orientation ) + "</em>. " );
  }
  
  var agree   = result.agree();
  var against = result.against();
  var blank   = result.blank();
  var protest = result.protest();
  var total   = result.total();
  
  if( total > 1 ){
    cond_push( 'agree',   agree   );
    cond_push( 'against', against );
    cond_push( 'blank',   blank   );
    cond_push( '<br>' );
    cond_push( 'protest', protest, 'em' );
    if( total != agree && total != against && total != blank ){
      cond_push( 'total', result.total() );
    }
    if( result.total() && result.direct() != result.total() ){
      buf.push( '<dfn>(direct ' + result.direct() + ' ' );
      buf.push( 'indirect ' + (result.total() - result.direct()) + ')</dfn> ' );
    }
  }
  
  if( div ){
    buf.push(
      '<dfn>',
      i18n( "change" ), ' ', result.count(), ' ',
      time_label( result.time_touched ),
      '</dfn>'
    );
  }
  
  return buf;
  
}


// section: include.js
function $include( file, prepand, postpand ){
// Like C's #include to some extend. See also $include_json().
// The big difference with require() is that whatever is declared using
// "var" is visible, whereas with require() local variables are defined in
// some different scope.
// The big difference with #include is that #include can be used anywhere
// whereas $include() can be used only as a statement.
// Please use $include_json() to include an expression.
// file is searched like require() does (if require.resolve() exists).
// File's content is not cached, I trust the OS for doing some caching better
// than myself. As a result, it works great with self modifying code...
// Another big difference is the fact that $include() will fail silently if
// the file cannot be read.
  var data
  var fs      = require( 'fs')
  var ffile   = ""
  var rethrow = false
  try{
    ffile = require.resolve ? require.resolve( file) : file
  }catch( err ){}
  // Silent ignore if file not found
  if( !ffile ){
    console.log( "$include: no " + file)
    return
  }
  try{
    data = fs.readFileSync( ffile).toString()
    prepand  && ( data = prepand + data )
    postpand && ( data = data    + postpand )
    $include.result = undefined
    // trace( "$include() eval of:" + data)
    try{
      eval( data) // I wish I could get better error reporting
    }catch( err ){
      rethrow = true
      throw err
    }
    return $include.result
  }catch( err ){
    console.log( "$include: " + file)
    if( true || rethrow ) throw err
  }
}

function $include_json( file ){
// Like C's #include when #include is used on the right side of an assignment
  return $include( file, ";($include.result = (", "));")
}
// section: end include.js


// -------------------
// section: globals.js

// Some global constants
var SW = {
  // Needed at startup
  version:  "0.2",
  name:     "Kudocracy",	// Name of website
  debug:    true,		// Debug mode means lots of traces
  test:     false,		// Test mode
  dir:      "",		        // Local to cwd, where files are, must exist
  port:     1234,		// 80 default, something else if behind a proxy
  domain:   "",			// To build permalinks, empty => no virtual hosting
  static:   "",			// To serve static files, optionnal, ToDo: ?
  protocol: "http://",		// Idem, https requires a reverse proxy
  fbid:     "",                 // Facebook app ID
  twid:     "",			// Twitter app ID
  likey:    "",			// LinkedIn API key
  dbkey:    "",			// Dropbox key
  dbsecret: "",			// Dropbox secret
  shkey:    "",			// Shareaholic key
  scalable: false,		// ToDo: a multi-core/multi-host version
  style:    "",			// CSS string (or lesscss if "less" is found)

  // Patterns for valid page names, please change with great care only

  // ~= CamelCase, @#_[ are like uppercase, . - [ are like lowercase
  wikiwordCamelCasePattern:
    "[@#A-Z_\\[][a-z0-9_.\\[-]{1,62}[@#A-Z_\\[\\]]",
  // 3Code style
  wikiword3CodePattern:
    "3\\w\\w-\\w\\w\\w-\\w\\w\\w",
  // 4Codes
  wikiword4CodePattern:
    "4\\w\\w\\w-\\w\\w\\w\\w-\\w\\w\\w\\w-\\w\\w\\w\\w",
  // Twitter hash tag
  wikiwordHashTagPattern:
    "#[A-Za-z][a-z_0-9]{2,30}",
  // Twitter name
  wikiwordTwitterPattern:
    "@[A-Za-z][A-Za-z_0-9]{2,30}",
  // email address, very liberal but fast
  wikiwordEmailPattern:
    "[a-z][a-z_0-9.-]{1,62}@[a-z0-9.-]{5,62}",
  // Free links, anything long enough but without / & infamous <> HTML tags
  // ToDo: I also filter out .", = and ' but I should not, but that would break
  wikiwordFreeLinkPattern:
    "[A-Za-z_]*\\[[^.='\"/<>\\]]{3,62}\\]",
  // Suffix, can follow any of the previous pattern
  wikiwordSuffixPattern:
    "(([\\.][@#A-Z_a-z0-9-\\[\\]])|([@#A-Z_a-z0-9\\[\\]-]*))*",
  // Prefix, cannot precede a wikiword
  wikiwordPrefixPattern:
    "([^=@#A-Za-z0-9_~\\?&\\)\\/\\\">.:-]|^)",
  // ToDo: Postfix anti pattern, cannot succede a wikiword, non capturing
  wikiwordPostfixAntiPattern: "",

  // Valid chars in 3Codes, easy to read, easy to spell
  // 23 chars => 23^8 possibilities, ~= 80 000 000 000, 80 billions
  // 4codes: 23^15 ~= a billion of billions, enough
  // Don't change that. If you change it, all exiting "public" key get confused
  valid3: "acefghjkprstuvxyz234678",	// avoid confusion (ie O vs 0...)

  // Pattern for dates, ISO format, except I allow lowercase t & z
  datePattern: "20..-..-..[tT]..:..:..\\....[zZ]",

  // Delays:
  thereDelay:        30 * 1000,	// Help detect current visitors
  recentDelay:  30 * 60 * 1000,	// Recent vs less recent
  awayDelay:    10 * 60 * 1000,	// Help logout old guests
  logoutDelay: 2 * 3600 * 1000,	// Help logout inactive members
  saveDelay:         30 * 1000,	// Save context delay
  resetDelay: 12 * 3600 * 1000,	// Inactive wikis are unloaded
  hotDelay:  45 * 84600 * 1000,	// Short term memory extend

  // Hooks
  hookSetOption: null, // f( wiki, key, str_val, base) => null or {ok:x,val:y}
  hookStart:     null, // Called right before .listen()

  the: "end" // of the missing comma
}

// Compute the maximum numeric value of a 3Code (or 4Code)
// These are approximates because it does not fit in a javascript 53 bits
// integer
;(function compute_max_3Code(){
  var len = SW.valid3 * len
  // 8 chars for 3 codes, 15 for 4codes
  var nch = 8
  var max = 1
  while( nch-- ){ max = max * len }
  SW.max3code = max
  // 8 + 7 is 15
  nch = 7
  while( nch-- ){ max = max * len }
  SW.max4code = max
})()

// String pattern for all valid Wikiwords
SW.wikiwordPattern = "("
  + "("
  +       SW.wikiwordCamelCasePattern
  + "|" + SW.wikiword3CodePattern
  + "|" + SW.wikiword4CodePattern
  + "|" + SW.wikiwordHashTagPattern
  + "|" + SW.wikiwordTwitterPattern
  + "|" + SW.wikiwordEmailPattern
  + "|" + SW.wikiwordFreeLinkPattern
  + ")"
  // All previous followed by optionnal non space stuff, but not . ending
  + SW.wikiwordSuffixPattern
+ ")";

// String pattern for all ids
SW.wikiwordIdPattern = ""
  + "("
  +       SW.wikiwordTwitterPattern
  + "|" + SW.wikiwordEmailPattern
  + ")";

// From string patterns, let's build RegExps

// Pattern to isolate wiki words out of stuff
SW.wikiwords = new RegExp(
    SW.wikiwordPrefixPattern
  + SW.wikiwordPattern
  + SW.wikiwordPostfixAntiPattern
  , "gm"
);

// Pattern to check if a str is a wikiword
SW.wikiword
  = new RegExp( "^" + SW.wikiwordPattern              + "$");
// Pattern to check if a str in an id
SW.wikiwordId
  = new RegExp( "^" + SW.wikiwordIdPattern            + "$");
// Pattern for each type of wikiword
SW.wikiwordCamelCase
  = new RegExp( "^" + SW.wikiwordCamelCasePattern     + "$");
SW.wikiword3Code
  = new RegExp( "^" + SW.wikiword3CodePattern         + "$");
SW.wikiword4Code
  = new RegExp( "^" + SW.wikiword4CodePattern         + "$");
SW.wikiwordHashTag
  = new RegExp( "^" + SW.wikiwordHashTagPattern       + "$");
SW.wikiwordTwitter
  = new RegExp( "^" + SW.wikiwordTwitterPattern       + "$");
SW.wikiwordEmail
  = new RegExp( "^" + SW.wikiwordEmailPattern         + "$");
SW.wikiwordFreeLink
  = new RegExp( "^" + SW.wikiwordFreeLinkPattern      + "$");

// Some tests
if( true ){
  var De = true;
  if( !mand ){
    mand = function( flag, msg ){
      if( flag )return;
      console.trace( "Assert failed " + msg );
      debugger;
      throw new Error( "Assert failure, wikiwords" );
    }
  }
  // Smoke test
  if( !SW.wikiword.test( "WikiWord") ){
    De&&bug( "Pattern:", SW.wikiwordPattern)
    De&&mand( false, "Failed WikiWord smoke test")
  }
  // Some more tests, because things gets tricky some times
  var test_wikiwords = function (){
    function test( a, neg ){
      if( !De )return
      !neg && mand(  SW.wikiword.test( a), "false negative " + a)
      neg  && mand( !SW.wikiword.test( a), "false positive " + a)
      var match = SW.wikiwords.exec( " " + a + " ")
      if( !match ){
        mand( neg, "bad match " + a)
      }else{
        mand( match[1] == " ", "bad prefix for " + a)
        match = match[2]
        !neg && mand( match == a, "false negative match: " + a + ": " + match)
        neg  && mand( match != a, "false positive match: " + a + ": " + match)
        match = SW.wikiwords.exec( "~" + a + " ")
        if( match ){
          mand( neg, "bad ~match " + a)
        }
      }
    }
    function ok( a ){ test( a)       }
    function ko( a ){ test( a, true) }
    ok( "WikiWord")
    ok( "WiWi[jhr]")
    ok( "W_W_2")
    ok( "@jhr")
    ok( "@Jhr")
    ko( "@jhr.")
    ok( "@jhr@again")
    ko( "j-h.robert@")
    ko( "jhR@")
    ok( "#topic")
    ok( "#Topic")
    ok( "#long-topic5")
    ko( "Word")
    ko( "word")
    ko( " gar&badge ")
    ok( "UserMe@myaddress_com")
    ko( "aWiki")
    ko( "aWikiWord")
    ok( "_word_")
    ko( "_two words_")
    ok( "[free link]")
    ok( "User[free]")
    ok( "[free]Guest")
    ko( "[free/link]")
    ko( "linkedIn")
    ko( "shrtIn")
    ko( "badLinkIn")
    ok( "info@simpliwiki.com")
  }
  test_wikiwords()
}

// Each wiki has configuration options.
// Some of these can be overridden by wiki specific AboutWiki pages
// and also at session's level (or even at page level sometimes).
SW.config =
// section: config.json, import, optional, keep
// If file config.json exists, it's content is included, ToDo
{
  lang:           "en",	// Default language
  title:          "",	// User label of wiki, cool for 3xx-xxx-xxx ones
  cols: 50,		// IETF RFCs style is 72
  rows: 40,		// IETF RFCs style is 58
  twoPanes:       false,// Use right side to display previous page
  cssStyle:       "",	// CSS page or url, it patches default inlined CSS
  canScript:      true,	// To please Richard Stallman, say false
  open:           true,	// If true everybody can stamp
  premium:        false,// True to get lower Ys back
  noCache:        false,// True to always refetch fresh data
  backupWrites:   SW.debug,	// Log page changes in SW.dir/Backup
  mentorUser:     "",	// default mentor
  mentorCode:     "",	// hard coded default mentor's login code
  mentors:        "",	// Users that become mentor when they log in
  adminIps:       "",	// Mentors from these addresses are admins
  debugCode:      "",	// Remote debugging
  fbLike:         true,	// If true, Like button on some pages
  meeboBar:       "",   // Meebo bar name, "" if none, ToDo: retest
};
// section: end config.json

// Local hooks makes it possible to change (ie hack) things on a local install
// This is where one want to define secret constants, ids, etc...
$include( "./hooks.js" );
$include( "./local_hooks.js" );
if( SW.name != "Kudocracy" ){
  console.log( "Congratulations, Kudocracy is now " + SW.name );
  if( SW.dir ){
    console.log( "wiki's directory: " + SW.dir );
  }else{
    console.log( "wiki is expected to be in current directory" );
    console.log( "See the doc about 'hooks', SW.dir in 'hooks.js'" );
  }
  if( SW.port === "1234" ){
    console.log( "default 1234 port" );
    console.log( "see the doc about 'hooks', SW.port in 'hooks.js'" );
  }
}else{
  console.log( "Humm... you could customize the application's name" );
  console.log( "See the doc about 'hooks', SW.name in 'hooks.js'" );
}

// Let's compute "derived" constants

SW.idCodePrefix = "code" + "id";

// Global variables
var Sw = {
  interwikiMap: {},	// For interwiki links, actually defined below
  sessionId: 0,         // For debugging
  currentSession: null, // Idem
  requestId: 0,
  timeNow: 0,
  dateNow: 0,
  cachedDateTooltips: {},
  inspectedObject: null
};

// section: end globals.js


/* ---------------------------------------------------------------------------
 *  Extracted from SimpliWiki and adapted
 */

var Wiki = {};


Wiki.redize = function( str ){
  if( !str )return "";
  return "<em>" + str.substr( 0, 1 ) + "</em>" + str.substr( 1 );
};


Wiki.htmlizeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};


Wiki.htmlize = function( txt ){
// Per HTML syntax standard, &, < and > must be encoded in most cases, <script>
// CDATA and maybe <textarea> are the exceptions.
  // Protect pre-encoded i18n stuff, unless "HTML" in text tells differently
  if( txt.indexOf( "HTML" ) < 0 ){
    txt = txt.replace( /&([a-z]{2,7};)/, "\r$1" );
  }
  var map = Wiki.htmlizeMap;
  txt = txt.replace( /[&<>]/g, function( ch ){ return map[ch] } );
  // Restore pre-encoded i18n stuff
  txt = txt.replace( /\r([a-z]{2,7};)/, "&$1" );
  return txt;
};


Wiki.dehtmlizeMap = {
  "&amp;": "&",
  "&lt;":  "<",
  "&gt;":  ">"
};


Wiki.dehtmlize = function( txt ){
  var map = Wiki.dehtmlizeMap;
  return txt.replace( /(&.*;)/g, function( ch ){ return map[ch] } );
};


Wiki.htmlizeAttrMap = {
  "&": "&amp;",
  '"': "&quot;",
  "'": "&#39;"
};


Wiki.htmlizeAttr = function( txt ){
// HTML syntax dictactes that attribute cannot contain " and, that's a bit
// suprizing ' and &... they must be encoded.
// Google Chrome specially does not like ' in attributes... it freeezes in
// some cases.
  var map = Wiki.htmlizeAttrMap;
  return txt.replace( /[&"']/g, function( ch ){ return map[ch] } );
};


Wiki.dehtmlizeAttrMap = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'"
};


Wiki.dehtmlizeAttr = function( txt ){
// HTML syntax dictactes that attributes cannot contain " and, that's a bit
// suprizing ' and &... they must be encoded.
// Google Chrome specially does not like ' in attributes... it freeezes in
// some cases.
  var map = Wiki.dehtmlizeAttrMap;
  return txt.replace( /(&.*;)/g, function( ch ){ return map[ch] } );
};


Wiki.wikify = function( text ){
  text = Wiki.htmlize( text );
  var wiki_names = SW.wikiwords;
  // Soft urls, very soft, xyz.abc style
  // The pattern is tricky, took me hours to debug it
  // http://gskinner.com/RegExr/ may help
  var surl =
  /([\s>]|^)([^\s:=@#"([)\]>][a-z0-9.-]+\.[a-z]{2,4}[^\sA-Za-z0-9_!.;,<"]*[^\s:,<>"']*[^.@#\s:,<>'"]*)/g
  /*
   *  (([\s>]|^)             -- space or end of previous link or nothing
   *  [^\s:=@#"([)\]>]       -- anything but one of these
   *  [\w.-]+                -- words, maybe . or - separated/terminated
   *  \.[a-z]{2,4}           -- .com or .org or .xxx
   *  [^\sA-Za-z0-9_!.;,<"]* -- ? maybe
   *  [^\s:,<>"']*           -- not some separator, optional
   *  [^.@#\s:,<>'"]*        -- not . or @ or # terminated -- ToDo: broken
   *
   *  ToDo: must not match jh.robert@
   *  but should match simpliwiki.com/jh.robert@
   */
    text = text.replace( surl, function( m, p, u ){
      // u = u.replace( /&amp;/g, "&")
      // exclude some bad matches
      if( /[#.]$/.test( u) )return m
      if( u.indexOf( "..") >= 0 )return m
      return p
      + '<a href="' + Wiki.htmlizeAttr( "http://" + u) + '">'
      + u
      + '</a>'
    })

  // url are htmlized into links
  // The pattern is tricky, change with great care only
  var url = /([^>"\w]|^)([a-ik-z]\w{2,}:[^\s'",!<>)]{2,}[^.\s"',<>)]*)/g
    text = text
    .replace( url, function( m, p, u ){
      // exclude some matches
      //if( /[.]$/.test( u) )return m
      // Fix issue with terminating dot
      var dot = ""
      //if( ".".ends( u) ){
      if( u.indexOf( "." ) === u.length - 1 ){
        u = u.substr( 0, u.length - 1)
        dot = "."
      }
      u = u.replace( /&amp;/g, "&")
      return p + '<a href="' +  Wiki.htmlizeAttr( u) + '">' + u  + '</a>' + dot
    })

    // Change wiki words into links to simpliwiki
    var href = "http://simpliwiki.com/kudocracy/";
    text = text
    .replace( wiki_names, '$1<a class="wiki" href="' + href + '$2">$2</a>')

  // Fix some rare issue with nested links, remove them
  text = text.replace( /(<a [^>\n]+?)<a [^\n]+?>([^<\n]+?)<\/a>/g, '$1$2')
  
  return text;
}


// ---------------------------------------------------------------------------


function format_comment( text ){
// SimpliWiki style formating
  return Wiki.wikify( text );
}


function i18n( x ){
  return Session.current.i18n( x );
}


function duration_label( duration ){
// Returns a sensible text info about a duration
  // Slight increase to provide a better user feedback
  //duration += 5000;
  var delta = duration / 1000;
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "the future" );
  return (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && "" + Math.floor( delta )
        + i18n( " seconds")
        || delta < 120
        && i18n( "1 minute")
        || delta < 3600
        && "" + Math.floor( delta / 60 )
        + i18n( " minutes")
        || delta < 7200
        && i18n( "about an hour")
        || delta < 86400
        && "" + Math.floor( delta / 3600 )
        + i18n( " hours")
        )
      || day_delta == 1
      && i18n( "a day")
      || day_delta < 7
      && "" + day_delta
      + i18n( " days")
      || day_delta < 31
      && "" + Math.ceil( day_delta / 7 )
      + i18n( " weeks")
      || day_delta >= 31
      && "" + Math.ceil( day_delta / 30.5 )
      + i18n( " months")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function time_label( time, with_gmt ){
// Returns a sensible text info about time elapsed.
  //with_gmt || (with_gmt = this.isMentor)
  var delta = ((Kudo.now() + 10 - time) / 1000); // + 10 to avoid 0/xxx
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return i18n( "the future" );
  var gmt = !with_gmt ? "" : ((new Date( time)).toGMTString() + ", ");
  return gmt
    + (day_delta == 0
      && ( delta < 5
        && i18n( "just now")
        || delta < 60
        && i18n( "il y a ") + Math.floor( delta )
        + i18n( " seconds ago")
        || delta < 120
        && i18n( "1 minute ago")
        || delta < 3600
        && i18n( "il y a ") + Math.floor( delta / 60 )
        + i18n( " minutes ago")
        || delta < 7200
        && i18n( "about an hour ago")
        || delta < 86400
        && i18n( "il y a ") + Math.floor( delta / 3600 )
        + i18n( " hours ago")
        )
      || day_delta == 1
      && i18n( "yesterday")
      || day_delta < 7
      && i18n( "il y a ") + day_delta
      + i18n( " days ago")
      || day_delta < 31
      && i18n( "il y a ") + Math.ceil( day_delta / 7 )
      + i18n( " weeks ago")
      || day_delta >= 31
      && i18n( "il y a ") + Math.ceil( day_delta / 30.5 )
      + i18n( " months ago")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


function proposition_graphics(){
// Runs client side

  if( true )return drawChart();
  console.log( "Init Google charts" );
  google.load( 'visualization', '1.0', { 'packages': ['corechart'] } );
  google.setOnLoadCallback( drawChart );
  
  function drawChart(){

    var data;
    var options;

    // Create the data table
    data = new google.visualization.DataTable();
    data.addColumn( 'string', 'Orientation' );
    data.addColumn( 'number', 'Slices' );
    data.addRows([
      [ i18n.agree,    graph_pie.agree    ],
      [ i18n.disagree, graph_pie.disagree ],
      [ i18n.protest,  graph_pie.protest  ],
      [ i18n.blank,    graph_pie.blank    ]
    ]);

    // Set chart options
    // options = { 'title':'Orientations', 'width':400, 'height':300 };
    options = {
      'width':  400,
      'height': 300,
       colors: [ '#00AA00', '#0000AA', '#AA0000', '#f0f0f0' ]
    };

    // Instantiate and draw our chart, passing in some options
    var chart = new google.visualization.PieChart( document.getElementById( 'orientation_chart_div' ) );
    chart.draw( data, options );

    data = new google.visualization.DataTable();
    data.addColumn( 'datetime', 'date' );
    data.addColumn( 'number' ); // , 'balance' );
    // Adjust serie so that t1,b1 to t2,b2 becomes t1,b1 to t2,b1 to t2,b2
    var adjusted_serie = [];
    var old_time;
    var new_time;
    for( var ii = 0 ; ii < graph_serie.length ; ii++ ){
      new_time = graph_serie[ ii ][ 0 ];
      if( ii ){
        if( new_time !== old_time ){
          adjusted_serie.push( [ new Date( new_time ), graph_serie[ ii - 1 ][ 1 ] ] );
        }
      }
      old_time = new_time;
      adjusted_serie.push( [ new Date( new_time ),  graph_serie[ ii ][ 1 ] ] );
    }
    data.addRows( adjusted_serie );
    chart = new google.visualization.LineChart( document.getElementById( 'balance_chart_div' ) );
    //options.title = "History";
    options = { 'width': 400, 'height': 100 };
    options.explorer = {};
    options.hAxis = { format: 'dd/MM HH:mm' };
    chart.draw( data, options );

    if( delegates_pie.length > 1 ){
    
      // Create the data table
      data = new google.visualization.DataTable();
      data.addColumn( 'string', '@' );
      data.addColumn( 'number', 'Slices' );
      data.addRows( delegates_pie );
  
      // Set chart options
      // options = { 'title':'Orientations', 'width':400, 'height':300 };
      options = {
        'width':  400,
        'height': 300
      };
  
      // Instantiate and draw our chart, passing in some options
      chart = new google.visualization.PieChart( document.getElementById( 'delegates_chart_div' ) );
      chart.draw( data, options );
    
    }

  }
}


function leaders_graphics(){
// Runs client side

  if( true )return drawChart();
  console.log( "Init Google charts" );
  google.load( 'visualization', '1.0', { 'packages': ['corechart'] } );
  google.setOnLoadCallback( drawChart );
  
  function drawChart(){

    var chart;
    var data1;
    var data2;
    var data3;
    var options;

    // Create the data tables
    data1 = new google.visualization.DataTable();
    data1.addColumn( 'string', "@" );
    data1.addColumn( 'number', 'Slices' );
    data1.addRows( delegates_graph_pie );
    data2 = new google.visualization.DataTable();
    data2.addColumn( 'string', "#" );
    data2.addColumn( 'number', 'Slices' );
    data2.addRows( tags_graph_pie );
    data3 = new google.visualization.DataTable();
    data3.addColumn( 'string', "proposition" );
    data3.addColumn( 'number', 'Slices' );
    data3.addRows( propositions_graph_pie );
    
    // Set chart options
    // options = { 'title':'Orientations', 'width':400, 'height':300 };
    options = {
      'width':  400,
      'height': 300
    };

    // Instantiate and draw our chart, passing in some options
    chart = new google.visualization.PieChart(
      document.getElementById( 'delegates_chart_div' )
    );
    chart.draw( data1, options );
    
    // Instantiate and draw our chart, passing in some options
    chart = new google.visualization.PieChart(
      document.getElementById( 'tags_chart_div' )
    );
    chart.draw( data2, options );
    
    // Instantiate and draw our chart, passing in some options
    chart = new google.visualization.PieChart(
      document.getElementById( 'propositions_chart_div' )
    );
    chart.draw( data3, options );
  }
}


/* ---------------------------------------------------------------------------
 *  page proposition
 */
 
function page_proposition( page_name, proposition_name ){
// Focus on one proposition

  var proposition = Topic.find( proposition_name );
  if( !proposition )return this.redirect( "propositions" );
  proposition.check();
  
  var buf = this;
  this.session.proposition = proposition;
  var persona = this.session.visitor;
  var result  = proposition.result;

  var is_tag = proposition.is_tag();
  var tag_label;
  var label;
  if( is_tag ){
    tag_label = proposition.label;
    label = tag_label.substring( 1 );
  }else{
    label = proposition.label;
    tag_label = "#" + label;
  }

  this.set(
    page_style( proposition.label ),
    page_header(
      link_to_page( "leaders", proposition.label, "delegations" )
      + " " + link_to_page( "ballot2", proposition.label, "ballot" ),
      link_to_twitter_filter( tag_label ),
      _
    )
  );
  
  // Graph preparation
  var graph_pie = {};
  graph_pie.agree    = result.agree();
  graph_pie.disagree = result.disagree();
  graph_pie.protest  = result.protest();
  graph_pie.blank    = result.blank();
  var graph_serie = [ [ proposition.timestamp, 0 ] ];
  var balance = 0;
  var public_balance = 0;

  // Proposition's name
  buf.push(
    '<h1>', (is_tag ? "Tag " : "" ),
    proposition.label,
    '</h1><br><br>'
  );
  
  // Comment?
  var comment = proposition.get_comment_text();
  var author  = proposition.get_comment_author();
  if( comment ){
    buf.push(
      '<h3>',
      format_comment( comment ),
      '</h3>'
    );
  }
  if( author ){
    buf.push(
      ' <dfn> - ',
      link_to_persona_page( author ),
      '</dfn>'
    );
  }
  if( author || comment ){
    buf.push( "<br><br>" );
  }

  // Pie graph
  if( proposition.result.total() ){
    buf.push( '<div id="orientation_chart_div" style="height:300px"></div>' );
  }
  
  // Twitter tweet button, if proposition and no visitor (else use vote_menu())
  if( false && !is_tag && !this.session.visitor ){
    buf.push( '<a href="https://twitter.com/intent/tweet?button_hashtag='
      + label
      + '&hashtags=kudocracy,vote,'
      + proposition.tags_string( this.session.visitor, this.session.with_abuses )
      .replace( / /g, "," ).replace( /#/g, "" )
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + label + '</a>'
    );
  }

  // Summary
  buf.push( '<br><br>', proposition_summary( proposition, "div" ), '<br>' );

  if( is_tag ){
    buf.push( 
      "<br>proposition " + proposition.propositions().length + " - ",
      link_to_page(
        "propositions",
        tag_label,
        i18n( "details" )
      ),
      "<br>"
    );
  }

  // List of tags, with link to propositions
  var tmp = proposition.filter_string( persona, true /* only delegateable */ );
  if( tmp || this.session.visitor ){
    buf.push(
      '<br><h2>Tags</h2> - ',
      link_to_page( "tags", "+age", "all" )
    );
    buf.push( filter_label( tmp, "propositions" ) );
    
    // Add tagging form, not for banned users
    if( this.session.visitor && !this.session.visitor.is_abuse() ){
      var session = this.session;
      
      // Propose a tag that is logical if tags are hierachical somehow
      var tag_value = "";
      
      // Propose the most common not yet used tag
      var candidate_tags = [];
      var existing_tags = proposition.tags();
      Ephemeral.each( session.tag_entities, function( tag ){
        if( existing_tags.indexOf( tag ) !== -1 )return;
        // Avoid tags that are a persona's name
        if( Persona.find( "@" + tag.label.substring( 1 ) ) )return;
        candidate_tags.push( tag );
      } );
      candidate_tags = candidate_tags.sort( function( a, b ){
        var count_a = a.propositions().length;
        var count_b = b.propositions().length;
        return count_a - count_b;
      } );
      // If not found in delegateable tags from current filter, look otherwhere
      if( !candidate_tags.length ){
        // Pick the most common already set tag that belongs to the filter
        var most_common_tag = Ephemeral.max( proposition.tags, function( tag ){
          if( session.filter_tag_entities.indexOf( tag ) === -1 )return;
          // Avoid tags that are a persona's name
          if( Persona.find( "@" + tag.label.substring( 1 ) ) )return;
          return tag.propositions().length;
        });
        // If none, just pick the most common already set tag
        if( !most_common_tag ){
          most_common_tag = Ephemeral.max( proposition.tags, function( tag ){
            // Avoid tags that are a persona's name
            if( Persona.find( "@" + tag.label.substring( 1 ) ) )return;
           return tag.propositions().length;
          }); 
        }
        // Pick the most common new tag of propositions with that common tag
        if( most_common_tag ){
          var most_common_proposition_tag;
          var most_common_proposition_tag_val;
          Ephemeral.each( most_common_tag.propositions(), function( proposition ){
            var max_tag = Ephemeral.max( proposition.tags(), function( tag ){
              if( existing_tags.indexOf( tag ) !== -1 )return;
              // Avoid tags that are a persona's name
              if( Persona.find( "@" + tag.label.substring( 1 ) ) )return;
              return tag.propositions().length;
            });
            if( max_tag ){
              if( typeof most_common_proposition_tag === "undefined" ){
                most_common_proposition_tag = max_tag;
                most_common_proposition_tag_val = max_tag.propositions().length;
              }else{
                var val = max_tag.propositions().length;
                if( val > most_common_proposition_tag ){
                  most_common_proposition_tag = max_tag;
                  most_common_proposition_tag_val = val;
                }
              }
            }
          });
          if( most_common_proposition_tag ){
            candidate_tags = [ most_common_proposition_tag ];
          }
        }
      }
      if( candidate_tags.length ){
        tag_value = candidate_tags[ 0 ].label;
      }
      buf.push(
        '\n<form name="proposition" url="/">',
        '<input type="hidden" name="i" value="proposition_action"/>',
        '<input type="hidden" name="i3" value="' + proposition.label + '"/>',
        '<input type="search" placeholder="', i18n( "additional tag" ), '" ',
        tag_value ? ' value="' + tag_value + '"' : "",
        '" name="i4" />',
        ' <input type="submit" name="i2" value="Tag"/>',
        '</form>\n'
      );
    }
    // Add detagging form, only for the author
    if( this.session.visitor
    &&  this.session.visitor === author
    && !this.session.visitor.is_abuse()
    && tmp
    ){
      buf.push(
        '\n<form name="proposition" url="/">',
        '<input type="hidden" name="i" value="proposition_action Untag"/>',
        '<input type="hidden" name="i3" value="' + proposition.label + '"/>',
        '<select name="i4">'
      );
      // Less common tags first, ie most probable error
      // ToDo: tmp = tmp.sort( function( a, b ){ based on reversed x.propositions().length } );
      tmp.split( " " ).forEach( function( tag ){
        buf.push( "<option>", tag, "</option>" );
      });
      buf.push(
        '</select>',
        ' <input type="submit" value="Untag"/>',
        '</form>\n'
      );
    }
    buf.push( '<br>' );
  }
  
  // Info: source, since, age, last change...
  buf.push( '<br><h2>Info</h2><br>' );
  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source " + tmp  + " " );
  }
  if( tmp = proposition.persona() ){
    buf.push( i18n( "by"), " ", link_to_page( "persona", tmp.name, tmp.label ) );
  }
  buf.push( "<br>", i18n( "since" ), " ", time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  buf.push( "<br>", i18n( "change" ), " ", time_label( proposition.time_touched ) );
  
  // Last vote (if public) ToDo: should display secret or private otherwise
  var votes_log = proposition.votes_log();
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    buf.push( '<br>', i18n( "last vote" ), " ", time_label( last_vote_value.snaptime ) );
    var last_vote_entity = Vote.valid( last_vote_value.entity );
    var last_vote_persona = Vote.valid( last_vote_entity && last_vote_entity.persona );
    if( last_vote_entity
    &&  last_vote_persona
    &&  last_vote_entity.privacy() === Vote.public
    ){
      buf.push( ' <em>', emojied( last_vote_entity.orientation() ), '</em>' );
      buf.push( ' ', link_to_persona_page( last_vote_persona ) );
      if( last_vote_value.agent_label ){
        buf.push(
          ' <dfn>(via ',
          link_to_page( last_vote_value.agent_label, "persona" ),
          ')</dfn>'
        );
      }
    }
  }

  // End in...
  if( proposition.half_life() ){
    buf.push( "<br>",
      i18n( "end in" ), " ", duration_label( proposition.expire() - Kudo.now() )
    );
  }

  // Votes
  buf.push(
    '<br><br><h2>Votes</h2><br>'
  );

  // Vote menu
  buf.push_vote_menu( proposition, { with_twitter: true, nofocus: true } );

  // Balance time serie graph
  buf.push( '<div id="balance_chart_div" style="height:100px"></div>' );

  // Voters, actually inserted later
  var insert_index_voters = buf.length;
  buf.push( "" );

  // Top agents, actually inserted later
  var insert_index_leaders = buf.length;
  buf.push( "" );
  
  // Log
  var votes = proposition.votes_log();
  buf.push( '<br><br><div><h2>', i18n( "Log" ), '</h2><br>' );
  //buf.push( "<ol>" );
  var count = 0;
  var gap = false;
  var seen_comments = {};
  var count_indirect_votes = 0;
  var count_direct_votes   = 0;
  var count_by_agent = {};
  var all_agents = [];
  var seen_personas = set();
  var all_personas = [];
  var orientation_by_persona = {};
  
  votes.forEach( function( vote_value, index ){
    
    if( !vote_value )return;
    
    // Compute balance agree/against
    var was        = vote_value.previous_orientation;
    var now        = vote_value.orientation;
    var was_public = vote_value.previous_privacy;
    var is_public  = vote_value.privacy === Vote.public;
    
    var previous_orientation
    = orientation_by_persona[ vote_value.persona ] || Vote.neutral;
    if( previous_orientation != was ){
      trace(
        "Bad previous orientation for", vote_value.persona,
        "should be", previous_orientation,
        "but is", was,
        "new one is", now
      );
      was = previous_orientation;
      debugger;
    }
    
    orientation_by_persona[ vote_value.persona ] = now;
    
    var idem = now === was;
    // if( Vote.valid( vote_value.entity )
    // &&  vote_value.entity.updates.length > 1
    // ){
    //  was = vote_value.entity.updates[ vote_value.entity.updates.length - 1 ];
    //}
    //if( was ){ was = was.orientation; }
    if( !idem ){
      
      if( was === "agree" ){
        balance--;
        if( was_public ){ public_balance--; }
      }else if( was === "disagree" || was === "protest" ){
        balance++;
        if( was_public ){ public_balance++; }
      }
      
      if( now === "agree" ){
        balance++;
        if( is_public ){ public_balance++; }
      }else if( now === "disagree" || now === "protest" ){
        balance--;
        if( is_public ){ public_balance--; }
      }
      
      graph_serie.push( [ vote_value.snaptime, balance ] );
    
    }
    
    if( count >= 200 && !gap ){
      buf.push( "<br>...<br>" );
      gap = true;
    }
    
    if( !seen_personas[ vote_value.persona ] ){
      all_personas.push( vote_value.persona );
    }
    seen_personas[ vote_value.persona ] = vote_value;
    
    // Display vote
    var valid_vote = Vote.valid( vote_value.entity );
    
    if( idem && vote_value.comment_text ){
      idem = false;
    }
    if( !idem && ( !gap || index >= votes.length - 200 ) ){
      count++;
      buf.push( "<br>" );
      var orientation = emojied( now );
      if( vote_value.previous_orientation !== Vote.neutral
      && was !== now
      ){
        orientation
        = emojied( was )
        + " -> "
        + orientation;
      }
      if( vote_value.privacy                 === Vote.private
      || (valid_vote && valid_vote.privacy() === Vote.private )
      ){
        orientation += " <dfn>(private)</dfn>";
        if( valid_vote.persona === persona ){
          orientation += ' <dfn>(' + i18n( "you" ) + ')</dfn>';
        }
      }else if( vote_value.privacy            === Vote.secret
      || ( valid_vote && valid_vote.privacy() === Vote.secret )
      ){
        orientation += " <dfn>(secret)</dfn>";
        if( valid_vote.persona === persona ){
          orientation += '<dfn>(' + i18n( "you" ) + ')</dfn>';
        }
      }
      var persona_text = "";
      if( vote_value.privacy                   === Vote.public
      &&  ( valid_vote && valid_vote.privacy() === Vote.public )
      ){
        persona_text = link_to_page( "persona", vote_value.persona_label );
        if( vote_value.delegation !== Vote.direct ){
          persona_text += ' <dfn>(via '
          + link_to_page( "persona", vote_value.agent_label )
          + ')</dfn>';
        }
      }else{
        if( vote_value.delegation !== Vote.direct ){
          persona_text += " via " + link_to_page( "persona", vote_value.agent_label );
        }
      }
      
      if( balance ){
        if( balance > 0 ){
          buf.push( "<em>+" + balance + "</em>" );
        }else{
          buf.push( "" + balance );
        }
      }else{
        buf.push( "==" );
      }
      buf.push(
        ' ', orientation, ' ',
        persona_text,
        " <small><dfn>", time_label( vote_value.snaptime ), "</dfn></small>"
      );
      var comment = vote_value.comment_text;
      if( comment ){
        if( !seen_comments[ comment ] ){
          seen_comments[ comment ] = true;
          buf.push( ' ' + format_comment( comment ) );
        }
      }
      // buf.push( "</li>" );
    }
    
  });
  
  // Add fake data for continuity to "now"
  graph_serie.push( [ Kudo.now(), balance ] );
  
  if( de ){
    var agree   = proposition.result.agree();
    var against = proposition.result.against();
    if( agree - against !== balance ){
      trace(
        "Incorrect balance",
        "agree", agree, "minus against", against,
        "!== balance ", balance
      );
      debugger;
      proposition.check();
    }
  }
  
  // Insert voters
  all_personas = all_personas.sort();
  var buf_voters = [];
  buf_voters.push(
    "<br><br><h2>",
    i18n( "Voters" ),
    "</h2> - ",
    link_to_page( "ballot2", proposition.label, "ballot" ),
    "<br>"
  );

  all_personas.forEach( function( persona_id ){
    var persona = Persona.find( persona_id );
    if( !persona )return;
    var vote = Vote.find( persona_id + "." + proposition.id );
    if( !vote )return;
    if( vote.privacy() !== Vote.public )return;
    var orientation =  vote.orientation();
    if( orientation === Vote.neutral )return;
    buf_voters.push(
      "<br>",
      link_to_persona_page( persona ),
      " "
    );
    var delegation = vote.delegation();
    if( delegation === Vote.direct ){
      count_direct_votes++;
    }else{
      var agent = Persona.valid( delegation.agent );
      if( agent ){
        buf_voters.push(
          ' <dfn>(via ',
          link_to_persona_page( agent ),
          ')</dfn> '
        );
        count_indirect_votes++;
        if( count_by_agent[ agent.id ] ){
          count_by_agent[ agent.id ]++;
        }else{
          count_by_agent[ agent.id ] = 1;
          all_agents.push( agent.id );
        }
      }
    }
    buf_voters.push( emojied( orientation ) );
  });

  buf_voters.push( "<br>" );
  buf._body[ insert_index_voters ] = buf_voters.join( "" );
  
  // Signal public versus global balance, when not same sign
  if( ( balance > 0 && public_balance < 0 )
  ||  ( balance < 0 && public_balance > 0 )
  ){
    buf.push( "<em>public ", public_balance, "</em> versus ", balance );
  }

  // Insert list of top 10 major agents
  var delegates_pie = [ [ 'direct', count_direct_votes ] ];
  if( count_indirect_votes ){

    var abuf = [];
    abuf.push(
      "<br><br><h2>",
      i18n( "Delegates" ),
      "</h2>",
      " - ",
      link_to_page( "leaders", proposition.label, "details" ),
      "<br><br>"
    );

    // pie
    abuf.push( '<div id="delegates_chart_div" style="height:300px"></div>' );

    all_agents = all_agents.sort( function( a, b ){
      var count_a = count_by_agent[ a ];
      var count_b = count_by_agent[ b ];
      return count_b - count_a;
    });

    var len = all_agents.length;
    var ratio;
    var agent_id;
    var count_shown = 0;
    var other_count = count_indirect_votes;
    
    for( var ii = 0 ; ii < len ; ii++ ){
      agent_id = all_agents[ ii ];
      var vote = Vote.find( agent_id + "." + proposition.id );
      if( !vote )continue;
      var c = count_by_agent[ agent_id ];
      other_count -= c;
      if( count_shown < 10 ){
        count_shown++;
        ratio = Math.round( 1000 * ( 
          c / count_indirect_votes
        ) ) / 10;
        abuf.push(
          link_to_persona_page( agent_id ),
          " <dfn>(", c, " ", ratio, "%)</dfn> ",
          emojied( vote.orientation() ),
          "<br>"
        );
        delegates_pie.push( [ Persona.find( agent_id ).label, c ] );
      }
    }
    if( other_count ){
      if( other_count < 0 )debugger;
      delegates_pie.push( [ i18n( "other" ), other_count ] );
    }
    buf._body[ insert_index_leaders ] = abuf.join( "" );
  }
  
  buf.push( "</div><br>", page_footer() );

  // Add data for graphics
  buf.push(
    '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar graph_pie = '     + JSON.stringify( graph_pie )
    + '\nvar graph_serie = '   + JSON.stringify( graph_serie )
    + '\nvar delegates_pie = ' + JSON.stringify( delegates_pie )
    + '\nvar i18n = {};'
    + '\ni18n.agree    ="' + i18n( "agree" )    + '";'
    + '\ni18n.disagree ="' + i18n( "disagree" ) + '";'
    + '\ni18n.protest  ="' + i18n( "protest" )  + '";'
    + '\ni18n.blank    ="' + i18n( "blank" )    + '";'
    + '\n' + proposition_graphics + '; proposition_graphics();'
    + '</script>'
  );
  
} // page_proposition()


/* ---------------------------------------------------------------------------
 *  The REPL Read Eval Print Loop commands of this Test/Debug UI
 */

var http_repl_session; // Follows global Session.current

var http_repl_commands = {};

function print_entities( list ){
  // Chronological order
  var sorted_list = list.sort( function( a, b ){
    var time_a = a.time_touched || a.timestamp;
    var time_b = b.time_touched || b.timestamp;
    var order = time_a - time_b;
    return order ? order : a.id - b.id;
  });
  sorted_list.forEach( function( entity ){
    printnl( "&" + entity.id + " " + entity
    + " " + pretty( entity.value() ) );
  });
}

var last_http_repl_id = null;


http_repl_commands.cls = function(){
  cls();
};


http_repl_commands.noop = function(){
// No operation
};


http_repl_commands.help = function(){
  var tmp = [
    "<h2>Help, syntax</h2>command parameter1 p2 p3...",
    "In parameters, &nnn is entity with specified id",
    "  & alone is last specified entity",
    "  >key:val adds entry in a hash object",
    "  >something adds entry in an array",
    "  [] and {} are empty tables/objects",
    "  , (comma) asks for a new table/object",
    "  true, false, _, null work as expected",
    "!xxx cmd p1 p2 p3 -- register as macro",
    "!xxx -- run previously registered macro",
    "! -- repeat previous macro",
    "<h2>Examples</h2>",
    link_to_command( "page visitor @jhr" ),
    "tagging & [] , +#tagX +#tagY  -- tagging with two lists",
    "delegation &40 +#tagX &23 +inactive:true",
    "<h2>Commands</h2>",
    link_to_command( "cls" ) + " -- clear screen",
    link_to_command( "page" ) + " -- list available pages",
    "page name p1 p2 ... -- move to said page",
    link_to_command( "noop" ) + " -- no operation, but show traces",
    link_to_command( "version" ) + " -- display version",
    link_to_command( "debug" ) + " -- switch to debug mode",
    link_to_command( "ndebug" ) + " -- switch to no debug mode",
    link_to_command( "dump" ) + " -- dump all entities",
    "dump type -- dump entities of specified type",
    link_to_command( "dump &" ) + "id -- dump specified entity",
    link_to_command( "value &" ) + "id -- display value of entity",
    link_to_command( "debugger &" ) + "id -- inspect entity in native debugger",
    link_to_command( "log &" ) + "id -- dump history about entity",
    link_to_command( "effects &" ) + "id -- dump effects of involed change",
    "login -- create user if needed and set current session",
    "change_vote &id privacy orientation -- change existing vote",
    "proposition_action verb text #tag text #tag... -- Search, Propose, Tag...",
    "proposition_filter tags... sort_criterias... -- set session filter",
    "proposition_search keywords... sort_criterias... -- set session query",
    "filter_more tags... -- add tags to current filter",
    "filter_less tags... -- remove tags from current filter",
    "proposition_tagging proposition tags... -- add tags to proposition",
    "proposition_propose proposition tags... -- create/update proposition",
    "delegate &id privacy duration -- change delegation"
  ];
  for( var v in Kudo.replized_verbs ){
    tmp.push( v + " " + Kudo.replized_verbs_help[ v ] );
  }
  print( tmp.join( "\n" ) );
};


http_repl_commands.page = page;


http_repl_commands.debug = function(){
  de = true; 
  Kudo.debug_mode( true );
};


http_repl_commands.ndebug = function(){ 
  de = false;
  Kudo.debug_mode( false );
};


http_repl_commands.dump = function( entity ){
  if( arguments.length ){
    if( entity.is_entity ){
      Kudo.dump_entity( entity, 2 );
    }else{
      var type = " " + entity.toLowerCase();
      var names = " change expiration persona source topic tagging tweet"
      + " vote result transition delegation membership visitor action ";
      var idx = names.indexOf( type );
      if( idx === -1  ){
        printnl( "Valid types:" + names );
      }else{
        var sep = names.substring( idx + 1 ).indexOf( " " );
        var found = names.substring( idx + 1, idx + sep + 1 );
        found = found[ 0 ].toUpperCase() + found.substring( 1 );
        printnl( "dump " + found );
        var entities = Kudo[ found ].all;
        var list = [];
        for( var item in entities ){
          list.push( entities[ item ] );
        }
        if( !list.length ){
          Ephemeral.get_all_entities().forEach( function( item ){
            if( item && item.type === found ){
              list.push( item );
            }
          });
        }
        print_entities( list );
      }
    }
  }else{
    Kudo.dump_entities();
  }
};
  

http_repl_commands.log = function( entity ){
  if( entity.effect ){
    entity = entity.effect;
  }else if( entity.to ){
    entity = entity.to;
  }
  var all = Kudo.AllEntities;
  var list = [];
  all.forEach( function( e ){
    if( e === entity
    || (e && e.to === entity)
    || (e && e.effect === entity)
    ){
      list.push( e );
    }
  } );
  print( "Log " + entity );
  print_entities( list );
};


http_repl_commands.effects = function( entity ){
  var change = entity.change || entity;
  var list = [ change ];
  var cur = change.to;
  while( cur ){
    list.push( cur );
    cur = cur.next_effect;
  }
  print( "Effects " + entity );
  print_entities( list );
};


http_repl_commands.value = function( entity ){
  printnl( entity ? pretty( entity.value(), 3 ) : "no entity" );
};


http_repl_commands.change_vote = function( vote_entity, privacy, orientation, duration, comment ){

  // Figure out parameters, maybe from pending http query
  var proposition = null;
  var query = PendingResponse.query;

  // Find vote
  var vote_id = query.vote_id;
  if( !vote_entity ){
    if( !vote_id ){
      printnl( "Vote not found" );
      return;
    }
    vote_entity = Vote.find( vote_id );
  }
  
  // Special change_vote vote_id "agree" / "disagree" / "neutral" case
  if( privacy === "agree"
  ||  privacy === "disagree"
  ||  privacy === "neutral"
  ){
    vote_id = vote_entity;
    vote_entity = Vote.find( vote_id );
    orientation = privacy;
    privacy = _;
    duration = _;
    comment = _;
  
  // HTML From case, using HTTP query string
  // ToDo: avoid that somehow
  }else{

    // Parse privacy
    privacy = privacy || query.privacy;
    if( Array.isArray( privacy ) ){
      privacy = privacy[0];
    }
    if( !privacy
    ||   privacy === "idem"
    ||   privacy === "privacy"
    ||   privacy === ( vote_entity && vote_entity.privacy() )
    || " public secret private ".indexOf( " " + privacy + " " ) === -1
    ){
      privacy = _;
    }
  
    // Parse orientation
    orientation = orientation || query.orientation;
    if( Array.isArray( orientation ) ){
      orientation = orientation[0];
    }
    if( !orientation
    ||   orientation === "idem"
    ||   orientation === "orientation"
    ||   orientation === ( vote_entity && vote_entity.orientation() )
    || " agree disagree protest blank neutral ".indexOf( " " + orientation + " " ) === -1
    ){
      orientation = _;
    }
  
    // Parse duration
    duration = duration || query.duration;
    if( Array.isArray( duration ) ){
      duration = duration[0];
    }
    if( !duration
    ||   duration === "idem"
    ||   duration === "duration"
    ){
      duration = _;
    }else if( typeof duration === "string" ){
      duration = ({
        "one year":  Kudo.ONE_YEAR,
        "one month": Kudo.ONE_MONTH,
        "one week":  Kudo.ONE_WEEK,
        "24 hours":  Kudo.ONE_DAY,
        "one hour":  Kudo.ONE_HOUR,
        "expire":    Kudo.ONE_SECOND * 11 // Displayed as "10 seconds"
      })[ duration ];
    }
    if( !duration ){ duration = _; }
  
    // Parse comment
    comment = comment || query.comment;
    if( Array.isArray( comment ) ){
      comment = comment[0];
    }
    if( !comment
    ||   comment === "idem"
    ||   comment === "comment"
    ||   comment === ( vote_entity && vote_entity.comment() && vote_entity.comment().text )
    ){
      comment = _;
    }
  
  }

  // Something changed?
  if( !privacy && !orientation && !duration && !comment ){
    printnl( "No change" );
    return;
  }

  // Either a brand new vote
  if( !vote_entity ){
    var idx_dot = vote_id.indexOf( "." );
    var persona = Persona.find( vote_id.substring( 0, idx_dot ) );
    if( !persona || persona.type !== "Persona" ){
      printnl( "Persona not found" );
      return;
    }
    proposition = Topic.find( vote_id.substring( idx_dot + 1 ) );
    if( proposition && proposition.type !== "Topic" ){
      printnl( "Proposition not found" );
      return;
    }
    Session.current.proposition = proposition;
    Ephemeral.inject( "Vote", {
      persona:     persona,
      proposition: proposition,
      privacy:     ( privacy || _ ),
      orientation: ( orientation || _ ),
      duration:    duration
    });
    printnl( "New vote of " + persona + " on " + proposition );
    //redirect( "proposition%20" + proposition.label );

  // Or a change to an existing vote
  }else{
    if( privacy || duration || orientation ){
      // Adjust duration to make a renew
      if( duration ){
        duration += vote_entity.age();
      }
      Ephemeral.inject( "Vote", {
        id_key:      vote_entity.id,
        privacy:     ( privacy || _ ),
        orientation: ( orientation || _ ),
        duration:    duration
      });
      printnl( "Changed vote " + pretty( vote_entity ) );
    }
    // Abusers cannot spam with comments
    if( vote_entity.persona.is_abuse() ){
      comment = "";
    }
    if( comment ){
      Ephemeral.inject( "Comment", {
        vote: vote_entity,
        text: comment
      });
      printnl( "Comment changed " + pretty( vote_entity ) );
      // If change to comment only, go to page about proposition
      if( !privacy && !duration && !orientation ){
        PageBuilder.current.redirect( "proposition " + vote_entity.proposition.label );
      }
    }
  }
  return;
};


http_repl_commands.set_delegation = function( agent, main_tag ){
  
  var persona_entity = Session.current.visitor;
  if( !persona_entity ){
    printnl( "No login" );
    return;
  }
  
  // Sanitize agent
  agent = "@" + agent.replace( /[^A-Za-z0-9_]/g, "" );
  var agent_entity = Persona.find( agent );
  if( !agent_entity ){
    printnl( "Not found agent: " + agent );
    return;
  }
  
  // Sanitize main tag
  main_tag = "#" + main_tag.replace( /[^A-Za-z0-9_]/g, "" );
  var main_tag_entity = Topic.find( main_tag );
  if( !main_tag_entity ){
    printnl( "No found tag: " + main_tag );
  }
  
  // Sanitize additional tags
  var text = slice( arguments, 2 ).join( " " );
  var tags = [ main_tag_entity ];
  var error = false;
  text.replace( /[A-Za-z][A-Za-z0-9_]*/g, function( tag ){
    if( error )return;
    var tag_entity = Topic.find( "#" + tag );
    if( !tag_entity ){
      error = true;
      printnl( "Not found tag: #" + tag );
      return;
    }
    tags.push( tag_entity );
  });
  if( error )return;
  
  // ToDo: process update differently from create?
  Session.current.agent = agent_entity;
  Ephemeral.inject( "Delegation", {
    persona: persona_entity,
    agent:   agent_entity,
    tags:    tags
  } );
}


http_repl_commands.change_delegation = function( delegation_entity, agent, privacy, duration ){
  
  var query = PendingResponse.query;

  // Parse privacy
  privacy = privacy || query.privacy;
  if( privacy === "idem"
  ||  privacy === "privacy"
  ){
    privacy = null;
  }
  if( privacy
  && " public secret private ".indexOf( " " + privacy + " " ) === -1
  ){
    privacy = null;
  }
  if( !privacy ){ privacy = _; }

  // Parse duration
  duration = duration || query.duration;
  if( duration === "idem"
  || duration === "duration"
  ){
    duration = null;
  }
  if( duration ){
    if( typeof duration === "string" ){
      duration = ({
        "one year":  Kudo.ONE_YEAR,
        "one month": Kudo.ONE_MONTH,
        "one week":  Kudo.ONE_WEEK,
        "24 hours":  Kudo.ONE_DAY,
        "one hour":  Kudo.ONE_HOUR,
        "expire":    Kudo.ONE_SECOND * 10
      })[ duration ]
    }
  }
  if( !duration ){ duration = _; }

  // Something changed?
  if( !privacy && !duration ){
    printnl( "No change" );
    return;
  }

  // Adjust duration to make a renew
  if( duration ){
    duration += delegation_entity.age();
  }
  Ephemeral.inject( "Delegation", {
    id_key:      delegation_entity.id,
    privacy:     privacy,
    duration:    duration
  });
  printnl( "Changed delegation " + pretty( delegation_entity ) );

  return;
};


http_repl_commands.login = function( name ){
  
  // Sanitize name
  name = ( name || "" ).trim().replace( /[^A-Za-z0-9_]/g, "" );
  if( name[0] !== "@" ){ name = "@" + name };
  if( name.length < 4 )return;
  var lower_name = name.toLowerCase();
  
  // Create persona if first visit, respect user provided case
  if( !( Session.current.visitor = Persona.find( lower_name ) ) ){
    Ephemeral.inject( "Persona", { label: name } );
    Session.current.visitor = Persona.find( lower_name );
    if( !Session.current.visitor ){
      printnl( "Failed to inject new persona: " + name );
      return;
    }
  }
  
  de&&mand( Session.current.visitor );
  // Test users with predefined "lang"
  if( Session.current.visitor.id === "@marielouise" ){
    Session.current.set_lang( "fr" );
  }else if( Session.current.visitor.id === "@john" ){
    Session.current.set_lang( "en" );
  }
  
  // ToDo: set cookies for SimpliWiki
  
  // Show propositions without a vote, unless some other filter is active
  if( Session.current.filter === "" || Session.current.filter === " #hot " ){
    Session.current.set_filter( "#new" );
  };
  // Redirect to page before page_login()
  if( PageBuilder.current.session.current_page[0] === "login" ){
    PageBuilder.current.session.set_current_page(
      PageBuilder.current.session.previous_page
    );
    PageBuilder.current.redirect_back();
  }
};


http_repl_commands.lang = function( lang ){
  Session.current.set_lang( lang );
}


http_repl_commands.proposition_filter = function(){
  var text = as_array( arguments ).join( " " );
  text = Session.current.set_filter( text || "all" );
  Session.current.sort_criterias.forEach( function( criteria ){
    text += criteria + " ";
  })
  Session.current.proposition = null;
  PageBuilder.current.redirect_back( 1, Session.current.query() );
  return;  
};


http_repl_commands.proposition_search = function(){
  var text = as_array( arguments ).join( " " );
  Session.current.filter_query = text.trim().toLowerCase();
  text = Session.current.set_filter();
  Session.current.sort_criterias.forEach( function( criteria ){
    text += criteria + " ";
  })
  PageBuilder.current.redirect_back( 1, text.trim() );
  return;  
};


http_repl_commands.filter_more = function(){
  var text = as_array( arguments ).join( " " );
  text = text + " " + Session.current.query();
  return http_repl_commands.proposition_filter( text )
};

http_repl_commands.filter_less = function(){
  var less = as_array( arguments ).join( " " );
  var text = " " + Session.current.query() + " ";
  less.split( " " ).forEach( function( label ){
    text = text.replace( " " + label, "" );
  });
  return http_repl_commands.proposition_filter( text );
};


http_repl_commands.proposition_delegate = function(){
  
  var text = as_array( arguments ).join( " " );

  if( !Session.current.visitor ){
    return;
  }
  if( !Session.current.has_filter() ){
    return;
  }
  
  // Remove sort criterias, # hashtags and invalid characters
  var agent_name = text
  .replace( /[+\-][a-z_]*/, "" )
  .replace( /#[A-Za-z][_0-9A-Za-z]*/g, "" )
  .replace( /[^A-Za-z0-9_]/g, "" );
  
  if( agent_name ){
    agent_name = agent_name.split( " " )
  }
  
  // What remains should be a valid personna's name
  if( !agent_name ){
    return;
  }
  var agent = Persona.find( "@" + agent_name );
  if( !agent ){
    return;
  }
  
  text = text.replace( agent_name, "" ).trim();
  
  if( text.length ){
    Session.current.set_filter( text );
  }
  
  // Cannot delegate without valid tags
  if( !Session.current.filter_tag_entities.length ){
    return;
  }
  
  Ephemeral.inject( "Delegation", {
    persona: Session.current.visitor,
    agent:   agent,
    tags:    Session.current.filter_tag_entities
  });
}


http_repl_commands.proposition_tagging = function( proposition_name, text ){
  
  var visitor = Session.current.visitor;
  if( !visitor ){
    printnl( "No anonymous tagging" );
    return;
  }
  
  var proposition = Topic.find( proposition_name );
  if( !proposition ){
    printnl( "Tagging, invalid proposition: " + proposition_name );
    return;
  }
  
  // Remove all tags that look like something coming from the current filter
  // They will be restored later
  text = Session.current.without_filter_stuff( text );
  
  // Collect list of tags, ie those not part of the filter
  var tags = [];
  text = text.replace( /[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
    tags.push( "#" + tag );
    return ""
  } );
  
  // Tags were removed, nothing should remain
  text = text.replace( /#/g, "" ).trim();
  if( text ){
    printnl( "Tagging, invalid: " + text );
    return;
  }

  // Add all tags from the current filter, including those removed earlier
  Ephemeral.each( Session.current.filter_tag_entities, function( tag ){
    tags.push( tag.name );
  });

  // Collect a list of valid tags, filter out reserved tag, identify news
  var tag_entities = []; // Existing tags
  var changes = []; // Code to create not already existing tags
  tags.forEach( function( tag ){
    de&&mand( tag[0] === "#" );
    // Filter out reserved tag
    if( Topic.reserved( tag ) )return;
    var entity = Topic.find( tag );
    // Create tag if necessary
    if( entity ){
      // Filter out abusive tags
      if( entity.is_abuse() )return;
      if( tag_entities.indexOf( entity ) === -1 ){
        tag_entities.push( entity );
      }
    }else{
      if( changes.length >= 1 ){
        printnl( "Too many non existing tags" );
        return;
      }
      changes.push( function(){
        Ephemeral.inject( "Topic", {
          label:   tag,
          persona: Session.current.visitor
        } );
      });
      changes.push( function(){
        tag_entities.push( Topic.find( tag ) );
      })
    }
  });
  
  // Exit if no valid tags and no changes
  if( !tag_entities.length && !changes.length )return;

  // Update topic with new tags. Note: this adds tags, it doesn't remove any
  changes.push( function(){
    Ephemeral.inject( "Tagging", {
      proposition: proposition,
      tags:        tag_entities,
      persona:     Session.current.visitor
    } );
  });
  
  // Process changes. ToDo: async
  Ephemeral.inject( changes );

  // Set hint to display involved proposition at top of sorted lists
  Session.current.proposition = proposition;

  // Update filter to match topic, this provides feedback
  var new_filter = [];
  Ephemeral.each( function( tag_entity ){
    // Skip user names, including name of proposer, useless noise
    if( Persona.find( "@" + tag_entity.name.substring( 1 ) ) )return;
    new_filter.push( tag_entity.label );
  });
  Session.current.set_filter( new_filter.join( " " ) );
  
};


http_repl_commands.proposition_propose = function( text ){
  
  var visitor = Session.current.visitor;
  if( !Persona.valid( visitor ) ){
    printnl( "Invalid persona cannot propose" );
    return;
  }
  
  var original_text = text;
  
  // Remove all tags that look like something coming from the current filter
  // They will be restored later
  text = Session.current.without_filter_stuff( text );
  
  // Collect list of explicit #tags, ie those not part of the filter
  text = text.trim();
  var tags = [];
  var hash_found = false;
  var is_about_tag = ( text[0] === "#" );
  var count_new = 0;
  text = text.replace( /#[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
    tags.push( tag );
    if( !Topic.find( tag ) ){
      count_new++;
    }
    hash_found = false;
    return ""
  } );
  
  // Refuse to proceed if more than one new tag is beeing proposed
  if( count_new > 1 ){
    printnl( "Too many new tags" );
    return;
  }

  // Collect list of explicit existing tags spelled without a # prefix
  text = text.replace( /[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
    if( !Topic.find( "#" + tag ) ){
      if( Topic.reserved( tag ) )return "";
      return tag;
    }
    // Don't confuse an existing proposition with a tag
    if( Topic.find( tag ) )return tag;
    tags.push( "#" + tag );
    return ""
  } );

  // Add all tags from the current filter, including those removed earlier
  if( Session.current.has_delegateable_filter() ){
    Ephemeral.each( Session.current.filter_tag_entities, function( tag ){
      tags.push( tag.name );
    })
  }

  // Tags were removed, process invalid characters, to see what remains
  text = text
  .replace( /  /g, " " ).trim()  // extra spaces
  .replace( /#/g, "" )
  .replace( /[^A-Za-z0-9_]/g, "_" ) // _ where non alphanum
  .replace( /__/g, "_" ) // remove extra _
  .replace( /^_/, "" )
  .replace( /_$/, "" );
  
  // if nothing remains, use first tag to name the proposed proposition
  if( text.length < 2 && tags.length ){
    // Be prudent, don't do that if new tags are proposed too, too risky
    if( count_new || ( text = tags.shift() ).length < 2 ){
      printnl( "Not a valid proposition name" );
      return;
    }
    // Remove first #, ie assume proposition is not a tag, unless # first char
    if( !is_about_tag ){
      text = text.substring( 1 );
    }
  }
  
  // Cannot propose a reserved tag
  if( Topic.reserved( text ) ){
    printnl( "Propose, not a valid proposition, reserved: " + text );
    return;
  }
  
  var proposition_name = text;
  if( !proposition_name ){
    printnl( "No proposition name" );
    return;
  }
  var proposition = Topic.find( proposition_name );
  
  // Make sure the proposition's name is not too different from user input
  if( !proposition && original_text.indexOf( proposition_name ) === -1 ){
    printnl( "Misformed proposition name: " + proposition_name );
    return;
  }
  
  // inject user's name as first tag if new or somehow new topic
  if( !proposition || !proposition.get_comment_author() ){
    tags.push( "#" + visitor.label.substring( 1 ) );
  }
  
  // Collect a list of valid tags, filter out reserved tag, identify topics
  var tag_entities = []; // Existing tags
  var changes = []; // Code to create not already existing tags
  tags.forEach( function( tag ){
    de&&mand( tag[0] === "#" );
    // Filter out reserved tag
    if( Topic.reserved( tag ) )return;
    var entity = Topic.find( tag );
    // Create tag if necessary
    if( entity ){
      // Filter out abusive tags
      if( entity.is_abuse() )return;
      if( tag_entities.indexOf( entity ) === -1 ){
        tag_entities.push( entity );
      }
    }else{
      changes.push( function(){
        Ephemeral.inject( "Topic", {
          label:   tag,
          persona: Session.current.visitor
        } );
      });
      changes.push( function(){
        tag_entities.push( Topic.find( tag ) );
      })
    }
  });

  // Redirect visitor to proposition's page once done
  PageBuilder.current.redirect( "proposition " + proposition_name );
  
  // Creation of topic or update with addition of tags
  if( !proposition ){
    // Don't create proposition and tags at the same time, too risky
    if( count_new ){
      printnl( "Cannot create both proposition & tags at the same time" );
      return;
    }
    changes.push( function(){
      Ephemeral.inject( "Topic", {
        label:   text,
        tags:    tag_entities,
        persona: Session.current.visitor
      } );
    } );
  }else{
    // Exit if no valid tags
    if( !tag_entities.length ){
      return;
    }
    changes.push( function(){
      Ephemeral.inject( "Tagging", {
        proposition: proposition,
        tags:        tag_entities,
        persona:     Session.current.visitor
      } );
    });
  }

  // Process changes. ToDo: async
  Ephemeral.inject( changes );

  // Set hint to display involved proposition at top of sorted lists
  Session.current.proposition = proposition || Topic.find( proposition_name );

  // Update filter to match topic, this provides feedback
  var new_filter = [];
  tag_entities.forEach( function( tag_entity, index ){
    // Skip user names, including name of proposer, useless noise
    if( Persona.find( "@" + tag_entity.name.substring( 1 ) ) )return;
    new_filter.push( tag_entity.label );
  });
  Session.current.set_filter( new_filter.join( " " ) );
};


http_repl_commands.proposition_action = function( name, proposition_name ){
// This function is called from different contexts, including html forms
// Could be a search, a delegate or a propose coming from page_propositions
// or a tagging action from page_proposition when visitor add tags

  // tagging (from page_proposition for example) requires a proposition name
  var is_tagging   = ( name === "Tag" );
  var is_detagging = ( name === "Untag" );
  if( is_tagging || is_detagging ){
    if( !proposition_name ){
      printnl( "Tag, missing proposition" );
      return;
    }
  }
  
  // Collect params, " " is added to simplify further tests
  var text = slice( arguments, ( is_tagging || is_detagging ) ? 2 : 1 )
  .join( " " ) + " ";
  
  // In rare cases, 'Search' gets included by the browser twice.
  // This happens when the user clicks on a sort criteria and quickly click
  // on the submit button instead of waiting for the auto submit to occur
  if( text.indexOf( "Search " ) === 0 ){
    name = "Search";
    text = text.substring( "Search ".length );
  }
    
  // Filter, text is expected to be a space separated list of tags or criterias
  if( name === "Filter"
  ||  name === i18n( "Filter" )
  ){
    return http_repl_commands.proposition_filter( text );
  }

  // Search, text is expected to be a space separated list of tags or criterias
  if( name === "Search"
  ||  name === i18n( "Search" )
  ){
    return http_repl_commands.proposition_search( text );
  }

  // Remove sort criterias potential noise
  text = text.replace( /[+\-][a-z_]*/g, "" );

  // Delegate
  if( name === "Delegate"
  ||  name === i18n( "Delegate" )
  ){
    return http_repl_commands.proposition_delegate( text );
  }
  
  // Tagging
  if( is_tagging ){
    return http_repl_commands.proposition_tagging( proposition_name, text );
  }
  
  if( is_detagging ){
    return http_repl_commands.proposition_detagging( proposition_name, text );
  }
  
  // Propose, maybe a new proposition, or an update
  return http_repl_commands.proposition_propose( text );
  
};


http_repl_commands.debugger = function( e, e2, e3, e4 ){
  var p  = pretty( e , 2 );
  var p2 = pretty( e2, 2 );
  var p3 = pretty( e3, 2 );
  var p4 = pretty( e4, 2 );
  var v  = value( e , 100 );
  var v2 = value( e2, 100 );
  var v3 = value( e3, 100 );
  var v4 = value( e4, 100 );
  debugger;
};


http_repl_commands.version = function(){
  printnl( "Kudocracy Version: " + Kudo.version );
}


var http_repl_macros = {};
var last_http_repl_macro = "help";
var http_repl_history = [];

function process_kudo_imports( kudo_scope ){
  Kudo = kudo_scope;
  l8      = Kudo.l8;
  // My de&&bug() and de&&mand() darlings
  de      = true;
  trace   = Kudo.trace;
  bug     = trace;
  mand    = Kudo.assert;
  assert  = Kudo.assert;
  // More imports
  value   = Kudo.value;
  pretty  = Kudo.pretty;
  _       = Kudo._;
  // Ephemeral entities
  Ephemeral  = Kudo.Ephemeral;
  Topic      = Kudo.Topic;
  Persona    = Kudo.Persona;
  Vote       = Kudo.Vote;
  Delegation = Kudo.Delegation;
  Comment    = Kudo.Comment;
}


function start_http_repl( kudo_scope ){
  process_kudo_imports( kudo_scope );
  var port = process.env.PORT || "8080";
  var host = process.env.C9_HOSTNAME;
  if( host ){
    config.url = host;
  }
  basic_style_http_server( port, handle_repl_input );
}

function handle_repl_input( session, r ){
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
    var tokens = input.split( " " );
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
      if( val === "_"     ){ val = _; }
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
            obj.push( v )
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
      code.session = http_repl_session = session;
      if( cmd !== "page" && PageBuilder.current ){
        PageBuilder.current.redirect_back();
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


// Hack to get sync traces && http REPL outputs
if( true ){ // true || de ){
  var fs = require( 'fs' );
  var old = process.stderr.write;
  process.stderr.write = function( d ){
    fs.appendFileSync( "./trace.out", d );
    print( d );
    return old.apply( this, arguments );
  };
}


exports.start = start_http_repl;

