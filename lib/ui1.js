//  ui1.js
//    First UI for Kudocracy, test/debug UI, HTTP based
//
// Jun 11 2014 by @jhr, extracted from main.js

"use strict";

var Kudo = {}; // start_http_repl() actualy initializes it

var l8;        // = Kudo.l8;
var Ephemeral; // = Kudo.Ephemeral;
var Topic;     // ...
var Vote;
var Persona;
var Delegation;
var Comment;

// My de&&bug() and de&&mand() darlings
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
var array_slice = Array.prototype.slice;
function as_array( an_array_like ){
  return array_slice.call( an_array_like );
}
function slice( an_array_like, n ){
  return array_slice.call( an_array_like, n );
}
function slice1( an_array_like ){
  return array_slice.call( an_array_like, 1 );
}


/* ---------------------------------------------------------------------------
 *  Minimal HTTP session management
 *    Session is associated to source ip address.
 *    ToDo: use a cookie
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


Session.prototype.login = function( id ){
  if( id !== Session.current.id ){
    Session.current = new Session( id );
    return Session.current;
  }else{
    return this;
  }
};


Session.prototype.clear = function(){
  this.lang            = "en";
  this.page_builder    = null;
  this.auto_lang       = true;
  this.visitor         = null;
  this.expert          = true;
  this.novice          = false;
  this.current_page    = []; // tokens, input was space separated
  this.previous_page   = [];
  this.can_pushState   = true;
  this.pushState       = "";
  this.needs_twitter   = false;  // <script> include of twitter intent lib
  this.filter_query    = "";
  this.filter          = "";
  this.filter_tags     = [];
  this.filter_str_tags = []; // As strings, includes "computed" tags
  this.sort_criterias  = [];
  this.proposition     = null;
  this.agent           = null;
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
};


Session.prototype.expert_mode = function(){
  this.expert = true;
  this.novice = false;
};


Session.prototype.has_filter = function(){
  return !!this.filter.length;
};


Session.prototype.has_delegateable_filter = function(){
  return !!this.filter_tags.length;
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
  Ephemeral.each( this.filter_tags, function( tag ){
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
//   Collect detected tag entities into session.filter_tags array.
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
      this.filter.split( " " ).sort().forEach( function( tag ){

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
      this.filter_str_tags = tag_buf;
      this.filter_tags = tags;
      this.sort_criterias = sort_criterias;
      return this.filter;
    }
  }else{
    this.filter = "";
  }
  if( !this.filter ){
    this.filter = "";
    this.filter_query  = "";
    this.filter_str_tags = [];
    this.filter_tags = [];
    this.sort_criterias = [];
    this.with_abuses = false;
  }
  // When sort criterias change, don't disply current proposition first
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
    this.filter_tags.forEach( function( tag ){
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


// Defaults to local session
Session.current = new Session( "127.0.0.1" );


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
  PendingResponse.writeHead( 200, { 'Content-Type': 'text/html' } );
  
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
  PendingResponse.end( [
    '<!DOCTYPE html><html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="'
    + 'width=device-width, initial-scale=1, maximum-scale=1.0, '
    + 'user-scalable=no, minimal-ui">',
    '<title>Kudocracy test UI, liquid democracy meets twitter...</title>',
    '<link rel="shortcut icon" href="http://simpliwiki.com/yanugred16.png" type="image/png">',
    head || '<link rel="stylesheet" type="text/css" href="/simpliwiki.css">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join( '\n' ) );
  
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
  // If pushState style redirect
  var redir = res.redirect;
  if( redir ){
    Session.current = req.session;
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
  // Detect change in source ip address, when change, logout
  // ToDo: some session management
  var ip = req.headers[ "x-forwarded-for" ]
  || req.connection.remoteAddress
  || req.socket.remoteAddress
  || req.connection.socket.remoteAddress;
  // ToDo: detect simpliwiki login credentials
  var session = req.session = Session.current.login( ip );
  session.timestamp = l8.now;
  PendingResponse = session.response = res;
  PendingResponse.request = session.request = req;
  // Detect french language, unless language was set by visitor first
  if( session.auto_lang ){
      var langs = Session.current.request.headers[ "accept-language" ];
      if( langs && langs.indexOf( ",fr" ) !== -1 ){
        session.set_lang( "fr" );
      }
  }
  trace( "URL: " + req.url );
  var parsed_url = url.parse( req.url, true );
  var query = req.post_query_data || parsed_url.query;
  PendingResponse.query = query;
  // Either /?i= style "or /xxx/yyy/zzz style
  if( !query || !( query.i || query.page ) ){
    return decodeURIComponent( parsed_url.pathname.replace( /\//g, " " ).trim() )
    || "page index";
  }
  // Collect ?i=...&i2=...&i3... into space separated command + arg list
  var data = query.i;
  // ?page= is valid alternative for ?i=page&...
  if( !data && query.page ){
    data = "page " + query.page;
  }
  var more;
  if( data ){
    more = query.i2;
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
  // Default to page index if no command was provide at all
  return "page index";
}


function basic_style_http_server( port, input_handler ){
  http.createServer( HttpQueue.put.bind( HttpQueue ) ).listen( port );
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
  this.i18n = Session.prototype.i18n.bind( session );
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
  var langs = Session.current.request.headers[ "accept-language" ];
  if( langs)
  // Parse filter from extra parameters
  var params = as_array( arguments );
  if( f.length && params.length > f.length ){
    result.session.set_filter( params.slice( f.length ).join( " " ) );
    params = params.slice( 0, f.length );
  }
  result.session.previous_page = result.session.current_page;
  result.session.current_page  = as_array( arguments );
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
    }
  }
  if( redir ){
    result.push(
      '\n<script>history.replaceState( null, "", "' + redir + '" );</script>'
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
  var query_style = true;
  var r;
  if( query_style ){
    if( !page ){
      r = "?i=/";
    }else{
      // Note: / does not need encoding, and it's ugly when encoded
      r = "?page=" 
      + querystring.escape( page )
      .replace( /%2F/g, "/" )
      .replace( /%20/g, "/" );
    } 
  }else{
    if( !page ){
      r = "/";
    }else{
      r = "/page/" + encode_ref( page );
    }
  }
  this.session.response.redirect = r;
};


PageBuilder.prototype.redirect_back = function( n, text ){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  var page = this.session.current_page;
  if( !page || !page.length )return this.redirect( "propositions" );
  page = page.slice();
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


function link_to_page( page, value, title ){
  var url_code;
  if( page[0] === "@" ){
    url_code = querystring.escape( page );
    if( !value ){ value = page; }
    page = value;
  }else{
   url_code = querystring.escape( value || "" );
  }
  if( page === "index" ){
    value = '<strong>Kudo<em>c</em>racy</strong>';
  }
  if( !value ){
    value = page;
  }
  if( !title ){
    title = value;
  }
  if( title[0] === "#" ){
    title = title.replace( /#a-z/g, function( tag ){
      return Session.current.i18n( tag );
    });
  }else{
    title = Session.current.i18n( title );
  }
  page = encode_ref( page );
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


function link_to_twitter_user( user ){
  if( !user )return "";
  return '<a href="https://twitter.com/' + user + '">' + user + '</a>';
}


function link_to_twitter_tags( tags ){
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
  + '">' + tags + '</a>';
}


function link_to_twitter_filter( query ){
  return '<a href="https://twitter.com/search?f=realtime&q='
  + querystring.escape( query )
  + '">' + query + '</a>';
}


/*
 *  Page common elements/parts
 */

function page_style(){
  PageBuilder.current.session.needs_twitter = false;
  return '<link rel="stylesheet" href="http://simpliwiki.com/simpliwiki.css" type="text/css">'
  + '<script type="text/javascript" src="http://code.jquery.com/jquery-2.1.1.min.js"></script>'
  // Reuse some stuff from simpliwiki
  + '<script type="text/javascript"> Wiki = {}; </script>\n'
  + '<script src="http://simpliwiki.com/scrollcue.js"></script>'
  + '<script type="text/javascript"> Wiki.scrollcueScript( true ); </script>\n';
  //+ '<script type="text/javascript">' + scrollcue + '\nscrollcue( $ );'
  //+ '\n$.scrollCue( { fade:".fade" } );\n'
  //+ '</script>\n';
}


function page_header( left, center, right ){
  var builder = PageBuilder.current;
  var i18n = builder.i18n;
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
    '<div id="container" style="margin:0.5em;"><div id="content" ><div id="content_text">',
    ''
  ].join( "\n" );
}


function page_header_left( left, center, right ){
// Header with Kudocracy/propositions/tags/votes/ballot ... login help
  if( !Session.current.has_delegateable_filter()
  )return page_header( left, center, right );
  var m = left || "";
  return page_header(
    m      + link_to_page( "leaders" )
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
    '<img src="http://simpliwiki.com/yanugred16.png"/>',
    '<strong>kudo<em>c</em>racy</strong>',
    '</a> <dfn>' + duration + ' ms</dfn></div>',
    '</div></div>'
  ];
  if( PageBuilder.current.session.needs_twitter ){
    PageBuilder.current.session.needs_twitter = false;
    buf.push(
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
  var vote = proposition.vote_of( persona );
  var orientation = vote ? vote.orientation() : "";
  
  var comment = null;
  var size = 20;
  
  if( with_comment && vote ){
    with_comment = '<input type="search" name="comment" ';
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
  
  // Keep 7 recommendations, random
  var len = recommendations.length;
  if( len ){
    if( len > 7 ){
      var picked;
      var picked_recommendations = [];
      var picked_map = {};
      var ii;
      while( ii < 7 ){
        picked = recommendations[ Math.floor( Math.random() * len ) ];
        if( picked_map[ picked ] )continue;
        ii++;
        picked_map[ picked ] = true;
      }
      recommendations = picked_recommendations;
    }
    recommendations = i18n( "other" ) + " " + recommendations.sort().join( " " );
    if( len > 7 ){
      recommendations += "...";
    }
  }
  
  var buf = [
    ( len ? ' ' + recommendations + '\n<br>' : "" ),
    '\n<form name="vote" url="/">',
    '<input type="hidden" name="i" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    with_comment,
    i18n( 'Vote' ), '<h2>',
    ( orientation !== Vote.agree    ? link_to_command( "change_vote " + vote_id + " agree",    emoji( "agree" ), "agree" ) : "" ),
    ( orientation !== Vote.disagree ? link_to_command( "change_vote " + vote_id + " disagree", emoji( "disagree" ), "disagree" ) : "" ),
    ( orientation !== Vote.neutral
      && ( !vote || vote.delegation() === Vote.direct ) // neutral triggers delegations
      ? link_to_command( "change_vote " + vote_id + " neutral",  emoji( "neutral" ), "neutral" ) : ""
    ),
    "</h2> ", i18n( "or" ), "<br>",
    '<select name="orientation">',
    // ToDo: randomize option order?
    o( "", "orientation" ), o( "agree" ), o( "disagree" ), o( "protest" ), o( "blank" ), o( "neutral" ),
    '</select>',
    '<select name="privacy">',
    o( "", "privacy" ), o( "public" ), o( "secret" ), o( "private" ),
    '</select>',
    '<select name="duration">',
    o( "", "duration" ), o( "one year" ), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour" ), o( "expire" ),
    '</select>',
    ' <input type="submit" value="', i18n( "Vote" ), '"/>',
    '</form>\n',
    // Twitter tweet button
    ( !( options && options.with_twitter ) ? "" :
      '<a href="https://twitter.com/intent/tweet?button_hashtag='
      + (proposition.is_tag()
        ? proposition.label.substring( 1 )
        : proposition.label )
      + '&hashtags=kudocracy,vote,'
      + (vote.type !== "Vote"
        ? (orientation && orientation + "," || "" )
        : vote.orientation() + ","
        )
      + tags.replace( / /g, "," ).replace( /#/g, "" )
      + '&text=' + comment
      + '" class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + proposition.label + '</a>'
    )
  ];
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
    '<select name="privacy">',
    o( "", "privacy" ), o( "public" ), o( "secret" ), o( "private" ),
    '</select>',
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
  this.tags    = Object.create( {} );
  this.sorted  = null;
  this.seen_propositions = {};
}

var ProtoTagSet = TagSet.prototype;

ProtoTagSet.add = function( label ){
  if( !label )return;
  this.sorted = null;
  this.tags[ label ] = true;
};


ProtoTagSet.add_all = function( text ){
  this.sorted = null;
  var that = this;
  text.split( " " ).forEach( function( label ){
    that.add( label );
  });
  return this;
};


ProtoTagSet.add_array = function( list ){
  this.sorted = null;
  var ii;
  var len = list.length;
  for( ii = 0 ; ii < len ; ii++ ){
    this.add( list[ ii ] );
  }
  return this;
};


ProtoTagSet.add_session = function( session ){
  this.session = session;
  this.add_array( session.filter_str_tags );
  if( this.session.filter_query ){
    this.add_array( this.session.filter_query.split( " " ) );
  }
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
      that.add( label );
      if( label !== "#" ){
        label = label.substring( 1 );
      }
      if( functor ){
        functor.call( null, tag, label );
      }
    }
  });
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
  var ok_tags = Object.create( {} );
  var label;
  for( label in tags ){
    if( predicate.call( null, label ) ){
      ok_tags[ label ] = true;
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
  
  var tags_label = PageBuilder.current.session.filter_label();
  
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
  && PageBuilder.current.session.has_delegateable_filter()
  && PageBuilder.current.session.filter.indexOf( " #but " ) === -1
  ){
    propose_clause
    = '<br>or ';
    novice && ( propose_clause
    += ' create a new proposition: ');
    propose_clause
    += '<input type="text" placeholder="new proposition" name="i3">'
    +  ' <input type="submit" name="i2" value="Propose"/>';
  }
  
  var delegate_clause = "";
  if( false && can_propose
  && PageBuilder.current.session.visitor
  && PageBuilder.current.session.has_filter()
  ){
    delegate_clause
    = ' <input type="submit" name="i2" value="' + i18n( "Delegate" ) + '"/>';
  }
  
  var r = [
    '\n<form name="proposition" url="/">',
    '<input type="hidden" name="i" value="proposition_action"/>',
    '<input type="search" autosave="filter" autofocus name="i4" value="',
      tags_label,
    '"/> ',
  ];
  
  // Sort menu
  if( !leaders_page ){
    r.push(
      '<select name="i5" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'proposition_action Filter\';',
        'this.form.submit();',
      '}">',
      o( "", "Sort" ),
      o2( "age_modified",   "last activity date", "old first" ),
      o2( "name",           "proposition name" ),
      o2( "age",            "creation date", "old first" ),
      o2( "-heat",          "relevance (heat)", "cold first" ),
      o2( "-trust",         "trust level", "few agents or votes first" ),
      o2( "-activity",      "global activity" ),
      o2( "-changes",       "vote activity" ),
      o2( "-comments",      "number of comments" ),
      tag_page ? o2( "-propositions", "tagged propositions" ) : "",
      tag_page ? o2( "-delegations",  "tagged delegations" ) : "",
      o2( "author", "author", "reversed" ),
      o2( "-total_votes",   "total votes" ),
      o2( "-direct_votes",  "direct votes" ),
      o2( "-participation", "participation", "low first" ),
      o2( "-protestation",  "blank or protest votes", "accepted first" ),
      o2( "-success",       "success", "small successes first" ),
      o2( "orientation",   "orientation", "reversed" ),
      '</select>'
    );
  }
  
  r.push(
    ' <input type="submit" name="i2" value="Filter"/>',
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
  tag_set.sort( function( a, b ){
    var entity_a = Topic.find( a );
    var entity_b = Topic.find( b );
    // not computed tags come next
    if( entity_a ){
      // tags that are the name of persona come next
      if( Persona.find( "@" + entity_a.name.substring( 1 ) ) ){
        a = "zzzz" + a;
      }
      // tags with single proposition come last
      if( entity_a.propositions().length <= 1 ){
        a = "zz" + a;
      }
    }else{
      a = "zzzzzzzz" + a;
    }
    if( entity_b ){
      if( Persona.find( "@" + entity_b.name.substring( 1 ) ) ){
        b = "zzzz" + b;
      }
      if( entity_b.propositions().length <= 1 ){
        b = "zz" + b;
      }
    }else{
      b = "zzzzzzzz" + b;
    }
    
    // Each 3 categories are then alphabetically sorted
    a = a.toLowerCase();
    b = b.toLowerCase();
    if( a > b )return 1;
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
      old_category = new_category;
    }
    // '+' link to add tag to filter, '-' to remove
    var filtered = old_filter.indexOf( " " + label + " " ) !== -1;
    if( !filtered ){
      // buf2.push( link_to_command( "filter_more " + label, "&#10062;" ) );
    }else{
      buf2.push( link_to_command( "filter_less " + label, "&#9989;" ) );
    }
    var tag_entity = Topic.find( label );
    if( tag_entity ){
      var c = tag_entity.propositions().length;
      var m = c > 1
      ? '<dfn>(' + c + ')</dfn>'
      : "";
      buf2.push( link_to_command(
        ( filtered ? "filter_less " : "filter_more " ) + label,
        i18n( label ) + m
      ) );
    }else{
      buf2.push( link_to_command(
        ( filtered ? "filter_less " : "filter_more " ) + label,
        i18n( label )
      ) );
    }
    buf2.push( " " );
  });
  if( buf2.length > 1 ){
    buf2.push( '<br>' );
  }
  return buf2.join( "" );
}


PageBuilder.prototype.push_title_and_search_form = function( title ){
  
  var buf = this;
  
  if( title[0] === "@" ){
    title = link_to_page( "persona", title );
  } 
  
  buf.push( '<br><h3>' + title + '</h3>' );

  var filter_label = PageBuilder.current.session.filter_label();
  if( filter_label ){
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
  this.novice && this.push( "<br>Click to select/deselect desired tags:" );
  tag_set.insert_index = buf.length;
  buf.push( '', '<hr>' ); // ToDo: why ''? without it the hr is erased...???
  
  return tag_set;
  
};


/* ---------------------------------------------------------------------------
 *  page visitor
 */

function page_visitor( page_name ){
// The private page of a persona

  var persona = this.session.visitor;
  if( !persona )return this.set( page_style(), "No Persona" );
  this.session.agent = null;
  
  var display = this.session.has_delegateable_filter();

  // Header
  var that = this;
  this.set(
    page_style(),
    page_header_right(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "delegations" )
    )
  );
  
  var tag_set = this.push_title_and_search_form( persona.label );

  // Sort votes, recent first unless some other criteria about propositions
  var sort_criterias =this.session.sort_criterias;
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
  this.push( '<br><div><h2>Votes</h2>' );
  this.push( " - " + link_to_page( "delegations" ) );

  Ephemeral.each( votes, function( entity ){

    if( !entity.filtered(
      that.session.filter,
      that.session.filter_query,
      that.session.visitor
    ) )return;
    
    tag_set.add_proposition( entity.proposition );
    
    if( !display )return;

    that.push( '<br><br>',
      ' ' + link_to_page( "proposition", entity.proposition.label ) + ' ',
      //+ "<dfn>" + emojied( entity.proposition.result.orientation() ) + '</dfn>'
      '<br><em>' + emojied( entity.orientation() ) + "</em> ",
      ( !entity.is_public() ? '<dfn>(' + entity.privacy() + ')</dfn>' : "" ),
      ( entity.is_direct()
      ? ""
      :  "<dfn>(via " + link_to_page( "persona", entity.agent_label() ) + ")</dfn>" ),
      " " + i18n( "for" ) + " " + duration_label( entity.expire() - Kudo.now() ),
      vote_menu( persona, entity.proposition, { with_twitter: true } )
    );

  });
  this.push( "</div><br>" );

  // Delegations
  var delegations = persona.delegations();
  var list = [];
  Ephemeral.each( delegations, function( entity ){
    if( !entity.filtered(
      that.session.filter,
      that.session.filter_query,
      that.session.visitor
    ) )return;
    list.push( entity );
  });
  
  if( list.length ){
    
    that.push( '<div><h2>Delegations</h2> - ',
      link_to_page( "delegations", "", "change" ),
      '<br>'
    );
    //buf.push( "<ol>" );
  
    list.forEach( function( delegation ){
  
      if( !delegation.filtered(
        that.session.filter,
        that.session.filter_query,
        that.session.visitor
      ) )return;
  
      that.push( '<br>', // "<li>"
        link_to_persona_page( delegation.agent ),
        //+ ' <small>' + link_to_twitter_user( entity.agent.label ) + '</small> '
        ( delegation.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " ),
        link_to_page( "propositions", delegation.filter_string( persona ) ),
        //+ ' <small>' + link_to_twitter_filter( entity.filter_string( persona ) ) + '</small>'
        "</li>"
      );
    });
  
  }

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
  if( !persona ){
    this.set( page_style(), "Persona not found: ", name );
    return;
  }

  if( persona === this.session.visitor ){
    this.session.agent = null;
  }else{
    this.session.agent = persona;
  }

  // Header
  this.set(
    page_style(),
    page_header_right(
      _,
      link_to_twitter_user( persona.label ),
      link_to_page( "delegations" )
    )
  );

  var tag_set = this.push_title_and_search_form( persona.label );
  
  // Is there a "topic" about that user?
  var persona_topic = Topic.find( "#" + persona.id.substring( 1 ) );
  if( persona_topic ){
    this.push(
      "<br><h2>",
      link_to_proposition_page( persona_topic ),
      "</h2><br>",
      proposition_summary( persona_topic ),
      "<br>"
    );
  }

  // Twitter follow button
  this.session.needs_twitter = true;
  this.push(
    '<a href="https://twitter.com/', persona.label,
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow ', persona.label, '</a>'
  );

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
  
  // Votes
  this.push( '<br><br><div><h2>Votes</h2>' );
  if( persona && this.session.visitor ){
    this.push( " - " + link_to_page( "delegations" ) );
  }
  this.push( '<br>' );
  //buf.push( "<ol>" );

  var delegateable_filter = this.session.delegateable_filter();
  
  // Display each vote
  var that = this;
  var display = !!delegateable_filter;

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
          :  "<dfn>(via " + link_to_page( "persona", vote.agent_label() ) + ")</dfn> " )
        //+ " for " + duration_label( entity.expire() - Kudo.now() )
      );
    }
    //buf.push( "</li>" );
  });
  
  // Delegate button
  if( this.session.visitor && persona && delegateable_filter ){
    that.push(
      '\n<br><br><form name="delegation" url="/">',
      '<input type="hidden" name="i" value="set_delegation"/>',
      '<input type="hidden" name="i2" value="' + persona.id + '"/>',
      '<input type="hidden" name="i3" value="' + delegateable_filter + '"/>',
      '<input type="submit" value="', i18n( "Delegate" ), '"/> ',
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
  if( !persona )return this.set( page_style(), "No persona" );
  var that = this;

  // Header
  this.set(
    page_style(),
    page_header_right(
      _,
      link_to_twitter_user( persona.label )
      //+ " " + link_to_page( persona.label, "visitor", "votes" )
    )
  );

  var title = "Delegations";
  if( this.session.agent ){
    title += " " + link_to_persona_page( this.session.agent );
  }
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
    " - " + link_to_page( "leaders" ),
    "<br>"
  );
  
  // Form to add/change a delegation
  var agent_value = "@";
  if( this.session.agent ){
    agent_value = this.session.agent.label;
  }
  var filter_value;
  var filter_values = [];
  this.session.filter_tags.forEach( function( tag ){
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
  this.set( page_style(), page_header() );
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
    page_style(),
    page_header_left( // Focus on propositions, not logged in user
      _,
      this.session.has_filter() ? link_to_twitter_tags( filter ) : _,
      _
    )
  );

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
  var skip_tags = !tag_page;
  if( skip_tags && filter.indexOf( " #tag " ) !== -1 ){
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
    && ( !visitor_tag || !entity.is_tagged( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    && filter.indexOf( " #orphan " ) === -1
    )continue;
    
    // Filter out personas tag, unless #persona filter
    if( tag_page && Persona.find( "@" + entity.name.substring( 1 ) )
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
  var display
  = tag_page
  || !!( this.session.has_delegateable_filter() || this.session.filter_query );
  
  list.forEach( function( proposition ){
    
    if( !display ){
      tag_set.add_proposition( proposition );
      return;
    }

    var text = proposition.label;
    if( tag_page ){
      // Make it clear that agree is when tag is "appropriate", versus abusive
      text += " is a good tag";
    }else{
      text = "#" + text;
    }
    
    // <h2> link to proposition
    that.push(
      '\n\n<br><h2>',
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
    that.push( 
      '\n<br>',
      emoji( proposition.result.orientation() ),
      proposition_summary( proposition )
    );

    // If tag, display link to tagged propositions, with count of propositions
    if( tag_page ){
      that.push(
        '<br>',
        proposition.propositions().length, " ",
        link_to_page( "propositions", proposition.label, "propositions" ),
        "<br>"
      );
    }

    // If some logged in user, collect votes from agents, whatever their filter
    // because that can help visitor to make a choice or delegate, for votes 
    // from people you trust matter.
    // Then display a "cast a vote" menu/form.
    if( persona ){
      var vote_entity = proposition.vote_of( persona );
      if( vote_entity ){
        that.push( '\n<br><br>', that.i18n( "you" ), " ",
          emojied( vote_entity.orientation() ),
          ( !vote_entity.is_public() ? " <dfn>(" + vote_entity.privacy() + ")</dfn>" : "" ),
          ( vote_entity.is_direct()
            ? ""
            :  "<dfn>(via " + link_to_page( "persona", vote_entity.agent_label() ) + ")</dfn>" ),
          ( vote_entity.half_life() ? " " + i18n( "for" ) + " " 
          + duration_label( vote_entity.expire() - Kudo.now() ) : "" ),
          vote_menu( persona, proposition ),
          '<br>'
        );
      }else{
        that.push( vote_menu( persona, proposition ), '<br>' );
      }
    }else{
      that.push( '<br>' );
    }
  });

  // Inject list of all seen tags, after filter/sort menu
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push(  "<br>", page_footer() );
  
} // page_propositions()


/* ---------------------------------------------------------------------------
 *  page ballot
 */
 
function page_ballot( pagename ){

  var added_personas = {};
  
  if( !this.session.has_delegateable_filter() ){
    return this.redirect( "propositions" );
  }
  
  var tags = [];
  var personas = [];
  var topic_name;
  var topics = Topic.all;
  var topic;
  
  // Collect topics that match the filter && the voters
  for( topic_name in topics ){
    
    topic = topics[ topic_name ];
    
    if( !Topic.valid( topic ) )continue;
    
    // Skip propositions with less than 1 vote, ie orphan/errors/noise
    // ToDo: less than 2 votes?
    
    if( topic.result.total() < 1 )continue;
    
    // Skip problematic/abusive propositions
    if( topic.result.orientation() === Vote.protest )continue;
    
    // Skip "neutral" propositions, useless
    if( topic.result.orientation() === Vote.neutral )continue;
    
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
      if( !added_personas[ persona.name ] ){
        personas.push( persona );
        added_personas[ persona.name ] = true;
      }
      
    }); // end of all votes
    
  } // end of topics
  
  // Build query using selected tags and personas
  var valid_query = "";
  tags.forEach( function( tag ){
    valid_query += tag.label + " ";
  });
  personas.forEach( function( persona ){
    valid_query += persona.label + " ";
  });
  valid_query = "date " + ( new Date() ).toISOString() + " " + valid_query;
  
  return this.redirect( "ballot2 " + valid_query ); 
}


function page_ballot2( /* pagename, ...query */ ){
  
  // This page let's visitor ask for results about tags by specified personas
  var query = slice1( arguments ).join( " " );

  this.set( page_style(), page_header_left() );

  // Display Title + alloc space for list of tag filters
  this.session.current_page = [ "ballot" ]; 
  var tag_set = this.push_title_and_search_form( "Ballot" );
  
  // Build a query for names and tags
  var valid_query = "";
  var tags     = [];
  var personas = [];
  var date     = null;
  var tag_entity;
  var persona_entity;
  
  query
  // Extract date, full ISO or just 2014-06-23 style 
  .replace(
    /20[\d]{2}(\/|-)[\d]{2}(\/|-)[\d]{2}(\s|T)[\d]{2}:[\d]{2}:[\d]{2}/,
    function( date_str ){
      date_str = date_str.replace( /\//g, "-" ).replace( / /g, "T" );
      try{
        date = new Date( date_str );
      }catch( err ){}
      return "";
    }
  ) 
  .replace( /20[\d]{2}(\/|-)[\d]{2}(\/|-)[\d]{2}/, function( date_str ){
    // ToDo: issue with last second votes...
    date_str = date_str.replace( /\//g, "-" ) + "T23:59:59";
    try{
      date = new Date( date_str );
    }catch( err ){}
    return "";
  })
  // Extract voter names
  .replace( /@[A-Za-z0-9_]+/g, function( name ){
    if( ( persona_entity = Persona.find( name ) )
    &&  personas.indexOf( persona_entity === -1 )
    ){
      personas.push( persona_entity );
    }
    return "";
  })
  // Extract tags and proposition names
  .replace( /[#A-Za-z0-9_]+/g, function( tag ){
    if( ( tag_entity = Topic.find( tag ) )
    && query.indexOf( "@" + tag ) === -1
    && tags.indexOf( tag_entity ) === -1
    ){
      tags.push( tag_entity );
    }
    return "";
  });
  
  // If no date, use now
  if( !date ){
    date = new Date();
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
  
  valid_query = "date " + date.toISOString() + "\n\n";
  valid_query = valid_query
  .replace( "T00:00:00", "" )
  .replace( "T", " " )
  .replace( /\..*/g, "" );
  
  valid_query += "proposition\n";
  tags.forEach( function( tag ){
    valid_query += "  " + tag.label + "\n";
  });
  
  valid_query += "\nvoter\n";
  personas.forEach( function( persona ){
    valid_query += "  " + persona.label + "\n";
  });
  
  // Build a form, with the query in a textarea, big enough to avoid scrolling
  this.push(
    '\n<br><form name="ballot" method="POST" url="/">',
    '<input type="hidden" value="ballot2" name="page"/>',
    '<textarea name="i2" autofocus cols=40 rows="' + ( 6 + tags.length + personas.length )
    + '">\n',
    Wiki.htmlize( valid_query ),
    '\n</textarea>',
    '<br><input type="submit" value="Results"/>',
    '</form><br>\n'
  );
  
  var time_limit = date.getTime();
  
  // Collect votes and count orientations
  var that = this;
  tags.forEach( function( tag ){
    var total         = 0;
    var count_for     = 0;
    var count_against = 0;
    var count_blanks  = 0;
    var buf2 = [];
    that.push(
      '<h3>',
      link_to_page( "proposition", tag.label, tag.label ),
      '</h3> '
    );
    tag_set.add_proposition( tag );
    personas.forEach( function( persona ){
      var vote = tag.vote_of( persona );
      if( !vote )return;
      var vote_value = vote.get_old_value( time_limit );
      if( !vote_value )return;
      var orientation = vote_value.orientation;
      if( orientation && orientation !== Vote.neutral ){
        // Don't count private/secret votes to protect privacy
        if( vote.privacy() === Vote.secret
        ||  vote_value.privacy === Vote.secret
        ){
        }else if( vote.privacy() === Vote.private
        || vote_value.privacy === Vote.private
        ){
        }else{
          total++;
          buf2.push( '\n<br>'
            + link_to_persona_page( persona )
            + ' '
          );
          var agent_label = vote_value.agent_label;
          if( agent_label ){
            buf2.push( '<dfn>(via ' + link_to_page( "persona", agent_label )
            + ')</dfn> ');
          }
          buf2.push( emojied( orientation ) );
          if( orientation === Vote.agree ){
            count_for++;
          }else if( orientation === Vote.blank ){
            count_blanks++;
          }else{
            count_against++;
          }
        }
      }
    });
    
    // Display results and collected votes
    that.push(
      emojied( count_for > count_against ? Vote.agree : Vote.disagree ),
      '<br>',
      " ", that.i18n( "for"     ), " ", count_for,
      " ", that.i18n( "against" ), " ", count_against,
      " ", that.i18n( "blank"   ), " ", count_blanks,
      " total ",   total,
      "<br>"
    );
    that.concat( buf2 );
    that.push( '<br><br>' );
  });
  
  // Inject list of all seen tags
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push( "<br>", page_footer() );
  
} // page_ballot()


/* ---------------------------------------------------------------------------
 *  page votes
 */

function page_votes( page_name ){
// This is the votes page of the application, filtered.

  var persona = this.session.visitor;
  
  if( !this.session.has_delegateable_filter() ){
    return this.redirect( "propositions" );
  }
  
    
  // Header
  var that = this;
  this.set(
    page_style(),
    page_header_left(
      _,
      this.session.has_filter()
      ? link_to_twitter_tags( that.session.filter )
      : _,
      _
    )
  );

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
    && ( !visitor_tag || !entity.proposition.is_tagged( visitor_tag ) ) // ToDo: remove #jhr mention
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
      that.push( "<br>", ( proposition.is_tag() ? "tag " : "" ) );
      that.push( link_to_page( "proposition", proposition.label ), "<br>" );
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
        persona_text += ' <dfn> (via ' + agent_label + ')</dfn> ';
      }else{
        persona_text += ' <dfn> (indirect)</dfn> ';
      }
    }else
    that.push(
      ' <em>' + emojied( orientation_text ) + "</em> ",
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
  
} // page_vote()


/* ---------------------------------------------------------------------------
 *  page leaders
 */

function page_leaders( page_name ){
  
  if( !this.session.has_delegateable_filter() ){
    return this.redirect( "propositions" );
  }
  

  var that = this;
  var persona = this.session.visitor;
  
  this.set( page_style(), page_header_left() );
  
  var tag_set = this.push_title_and_search_form( "Leaders" );

  // Display list of matching votes
  var votes = Vote.log; // All votes!
  var vote_value;
  var entity;
  var visitor_tag = null;
  if( persona ){
    visitor_tag = "#" + persona.label.substring( 1 );
  }
  var ii = votes.length;
  var seen_agents = {};
  var agent_ids = [];
  var count_agents = 0;
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

  // Scan votes, last ones first, looking for agents
  var max_votes = 0;
  var count_direct_votes = 0;
  var count_votes = 0;
  var last_vote;
  var proposition;
  var cache_filtered_out_propositions = {};
  while( ii-- ){

    // Don't scan all votes, too long, set a limit when enough propositions
    if( max_votes ){
      if( max_votes > count_votes )break;
    }else{
      if( count_propositions > 200 ){
        max_votes = count_votes * 2;
      }
    }

    vote_value = votes[ ii ];
    entity = Vote.valid( vote_value.entity );

    if( !entity )continue;
    proposition = Topic.valid( entity.proposition );
    
    if( !proposition )continue;
    if( cache_filtered_out_propositions[ proposition.id ] )continue;
    
    if( !proposition.filtered( this.session.filter, this.session.filter_query, persona )
    ){
      cache_filtered_out_propositions[ proposition.id ] = true;      
      continue;
    }

    // Skip neutral or direct votes
    if( vote_value.delegation          === Vote.direct
    || vote_value.orientation          === Vote.neutral
    || vote_value.entity.orientation() === Vote.neutral
    ){
      if( vote_value.delegation === Vote.direct ){
        count_direct_votes++;
      }
      continue;
    }
    
    count_votes++;
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

  // Sort propositions, by descreasing number of indirect votes
  propositions = propositions.sort( function( a, b ){
    var count_a = count_by_proposition[ a.id ];
    var count_b = count_by_proposition[ b.id ];
    return count_b - count_a;
  });
  
  // Sort agent for number of delegated votes
  agent_ids = agent_ids.sort( function( a, b ){
    return count_delegations_by_agent[ b ] - count_delegations_by_agent[ a ];
  });
  
  // Display each agent
  this.push(
    "<br><br><h2>Agents</h2> - ",
    link_to_page( "delegations" )
  );
  agent_ids.forEach( function( agent_id ){
    
    var agent_delegations = delegations_by_agent[ agent_id ];
    var count_agent_delegations_by_tags = {};
    var tag_strings = [];
    var ratio = Math.round( 1000 * ( 
      count_delegations_by_agent[ agent_id ] / count_votes
    ) ) / 10;

    // Display name of agent
    that.push(
      "<br><h2>",
      link_to_persona_page( agent_id ),
      "</h2><dfn>(",
        ratio,
      "%)</dfn><br>"
    );
    
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
      if( persona ){
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
        "<dfn>(",
          ratio,
        "%)</dfn> "
      );
      // Delegate button
      if( persona ){
        that.push(
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + agent_id + '"/>',
          '<input type="hidden" name="i3" value="' + tags + '"/>',
          '</form>\n'
        );
      }else{
        that.push( " " );
      }
    }
    // that.push( "<br>" );
  });
  
  // Display filters
  this.push(
    "<br><br><h2>Tags</h2> - ",
    link_to_page( "tags", "+age", "all" )
  );
  all_tag_ids = all_tag_ids.sort( function( a, b ){
    var count_a = count_delegations_by_tags[ a ];
    var count_b = count_delegations_by_tags[ b ];
    return count_b - count_a; // Most referenced first
  });
  
  all_tag_ids.forEach( function( tags ){
    var ratio = Math.round( 1000 * ( 
        count_delegations_by_tags[ tags ]
        / count_votes
      ) ) / 10;
    that.push(
      "<br><h2>",
      link_to_page( "propositions", tags, tags.replace( / /g, "+" ) ),
      "</h2><dfn>(",
        ratio,
      "%)</dfn><br>"
    );
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
      if( persona ){
        that.push(
          '\n<form name="delegation" url="/">',
          '<input type="submit" value="', i18n( "Delegate" ), '"/> '
        );
      }
      that.push(
        link_to_page(
          "persona", agent_id + " " + tags, agent_id
        ),
        "</h2><dfn>(",
          ratio,
        "%)</dfn>"
      );
      // Delegate button
      if( persona ){
        that.push(
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + agent_id + '"/>',
          '<input type="hidden" name="i3" value="' + tags + '"/>',
          '</form>\n'
        );
      }else{
        that.push( " " );
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
  Ephemeral.each( propositions, function( proposition ){
    that.push( "<br>", link_to_page( "proposition", proposition.label ) );
  });
  
  // Summary
  if( last_vote ){
    this.push(
      "<br><br><h2>", this.i18n( "Summary" ), "</h2><br>",
      "<br>proposition ", count_propositions,
      "<br>agent ", agent_ids.length,
      "<br>tag ", all_tag_ids.length,
      "<br>", this.i18n( "direct vote" ), " ", count_direct_votes,
      "<br>", this.i18n( "indirect vote" ), " ",count_votes, 
      "<br>", this.i18n( "since" ), " ", time_label( last_vote.snaptime ),
      "<br><br>"
    );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this._body[ tag_set.insert_index ] = filter_change_links( tag_set );
  
  this.push(  "<br><br>", page_footer() );
  
} // page_leaders()


/* ---------------------------------------------------------------------------
 *  page login
 */

function page_login( page_name ){

  this.set( page_style(), page_header() );

  // Query for name
  this.push(
    '\n<form name="login" url="/">',
    '<label>', this.i18n( "Your twitter @name" ), '</label> ',
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
  this.session.clear();
  this.session.needs_twitter = true;
  this.set(
    '<link rel="stylesheet" href="http://simpliwiki.com/style.css" type="text/css">',
    '<img src="http://simpliwiki.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;"></img>',
    '<div id="background" class="background"></div>',
    '<div id="header" class="sw_header">',
      '<div class="sw_header_content">',
        '<div style="float:left;" class="sw_logo sw_boxed">',
          '<div style="float:left;">',
          '<img src="http://simpliwiki.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
          '</div>',
          '<div id="slogan" style="min-height:64px; height:64px;">',
          '<strong>' + link_to_twitter_tags( "#kudocracy" ) + '</strong>',
          '<br>new democracy',
          '</div>',
        '</div>',
        '<span id="tagline">',
        '<h3 id="tagline">',
          link_to_twitter_tags(
            "#democracy #vote #election #LiquidDemocracy #participation"
          ),
        '</h3>',
        //'<small><i>a tribute to <a href="http://wikipedia.org">Wikipedia</a></i></small>',
        '</span>',
      '</div>',
    '</div><br><br>',
    '<div id="footer" class="sw_footer sw_boxed">',
    '\n <form name="proposition" url="/">',
    '<span style="font-size:1.5em">' + emoji( "agree" ) + ' </span>',
    '<input type="hidden" name="page" value="propositions"/>',
    '<input type="search" placeholder="all" name="i1" value="#new"/>',
    ' <input type="submit" value="propositions?"/>',
    '</form>\n',
    '</div>',
    '<br><a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy&hashtags=vote&text=new%20democracy" class="twitter-hashtag-button" data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    ' <a href="https://twitter.com/Kudocracy" class="twitter-follow-button" data-show-count="true">Follow @Kudocracy</a>',
    // Twitter buttons
    '<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>'
    //'<div><div><div>' + page_footer()
  );
  
} // page_index()


/* ---------------------------------------------------------------------------
 *  page help
 */

function page_help(){
  
  // Flip/flop expert/novice mode
  if( !this.novice ){
    this.session.novice_mode();
  }else{
    this.session.expert_mode();
  }
  
  var msg;
  if( this.session.lang !== "fr" ){
    msg = [
      'French ', link_to_command( "lang fr", "version"), ". ",
      'English ', link_to_command( "lang en", "version"), ". ",
      '<br><br>',
      '<h2>How to..?</h2><br>',
      'See the wiki:' + Wiki.wikify( " HowTo." ),
      '<br>',
      '<br><h2>What is it?</h2><br>',
      'An experimental Liquid Democracy voting system where ',
      'people can ' + emoji( "agree" ) + 'like or '
      + emoji( "disagree" ) + 'dislike hashtags associated to propositions.',
      '<br><br><h2>hashtags?</h2><br>',
      'Hashtags are keywords used to categorize topics in social networks. ',
      'See also ',
      '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
      '<br>',
      '<br><h2>How is it different?</h2><br>',
      'Traditional voting systems with elections every so often capture ',
      'infrequent snapshots of the opinion. Because voting often is inconvenient, ',
      'elections are either rare or participation suffers. Most decisions ',
      'are therefore concentrated in the hands of a few representatives ',
      'who are subject to corruption temptations. Liquid Democracy promises ',
      'to solve these issues thanks to modern technologies.',
      '<br><br><ul>',
      '<li>With <strong>Kudo<em>c</em>racy</strong>:</li>',
      '<li>Votes are reversible, you can change your mind.</li>',
      '<li>Propositions are searchable using tags.</li>',
      '<li>Delegates may vote for you on some propositions.</li>',
      '<li>You can follow their recommendations or vote directly.</li>',
      '<li>Votes and delegations are ephemeral and disappear unless renewed.</li>',
      '<li>Results are updated in realtime, trends are made visible.</li>',
      '<li>You can share your votes or hide them.</li>',
      '<li>It is <a href="https://github.com/virteal/kudocracy">open source</a>.</li>',
      '</ul>',
      '<br><h2>Is it available?</h2><br>',
      'No, not yet. What is available is this prototype. Depending on ',
      'success (vote #kudocracy!), the prototype will hopefully expand into ',
      'a robust system able to handle billions of votes from millions of ',
      'persons. That is not trivial and requires help.',
      '<br>',
      '<br><h2>Who are you?</h2><br>',
      'My name is Jean Hugues Robert, ',
      link_to_twitter_user( "@jhr" ),
      '. I am a 48 years old software developper ',
      'from Corsica (the island where Napoleon was born). When I discovered the',
      ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
      'Delegative democracy</a> concept, I liked it. I think that it would ',
      'be a good thing to apply it broadly, using modern technology, technology ',
      'that people now use all over the world.<br>',
      'I hope you agree. '
    ].join( "" );
  
  // French
  }else{
    msg = [
      'Version ', link_to_command( "lang en", "anglaise" ),        ". ",
      'Version ', link_to_command( "lang fr", "Fran&ccedil;aise"), ". ",
      '<br><br>',
      '<h2>Comment faire..?</h2><br>',
      'Voir le wiki:' + Wiki.wikify( " HowTo." ),
      '<br>',
      '<br><h2>De quoi s\'agit-il ?</h2><br>',
      'Un syst&egrave;me de vote exp&eacute;rimental de type Liquid Democracy dans lequel ',
      'les gens peuvent ' + emoji( "agree" ) + 'approuver ou '
      + emoji( "disagree" ) + 'd&eacute;sapprouver des hashtags associ&eacute;s &agrave; des propositions.',
      '<br><br><h2>hashtags?</h2><br>',
      'Les Hashtags sont des mots-clefs utilis&eacute; pour classer les sujets dans les r&eacute;seaux sociaux. ',
      'Voir aussi ',
      '#<a href="http://www.hashtags.org/quick-start/">hashtags.org</a>.',
      '<br>',
      '<br><h2>En quoi est-il diff&eacute;rent ?</h2><br>',
      "Les syst&egrave;me de vote traditionnels enregistrent des images infr&eacute;quentes de l'option ",
      "car voter souvent n'est pas pratique. ",
      "Les &eacute;lections sont rares sinon la participation s'effondre. ",
      "La plus part des d&eacute;cisions sont donc concentr&eacute;es dans ",
      "les mains d'un petit nombre de repr&eacute;sentants qui font l'objet ",
      "de pressions et de tentatives de corruption. ",
      'La "D&eacute;mocratie Liquide" permet d\'envisager r&eacute;soudre ',
      "ces probl&egrave;s en utilisant des technologies modernes.",
      '<br><br><ul>',
      '<li>Avec <strong>Kudo<em>c</em>racy</strong>:</li>',
      '<li>Les votes sont modifiables, vous pouvez changer d\'avis.</li>',
      '<li>Chaque proposition est class&eacute;e par sujet selon des hashtags.</li>',
      '<li>Des "D&eacute;l&eacute;gu&eacute;s" peuvent voter pour vous sur certains sujets.</li>',
      '<li>Vous pouvez soit suivre leurs recommendations, soit voter directement.</li>',
      '<li>Les votes autant que les d&eacute;l&eacute;gations sont rendus &eacute;ph&eacute;m&egrave;res ',
      "pour tenir compte de l'&eacute;volution des opinions.</li>",
      '<li>Les r&eacute;sultats sont disponibles immédiatement, les tendances sont affich&eacute;es.</li>',
      '<li>Vous pouvez publier vos choix ou les garder secrets.</li>',
      '<li>Le logiciel est <a href="https://github.com/virteal/kudocracy">open source</a>.</li>',
      '</ul>',
      '<br><h2>Est-ce dispo ?</h2><br>',
      'Non, pas totalement. Ce qui est dispo est ce prototype. ',
      'Selon son succ&eacute;s (votez #kudocracy !), le prototype sera am&eacute;lior&eacute; ',
      'pour devenir une solution robuste capable de traiter les milliards de votes de millions ',
      'de personnes. Ce n\'est pas simple.',
      '<br>',
      '<br><h2>Qui ?</h2><br>',
      'Mon nom Jean Hugues Robert, ',
      link_to_twitter_user( "@jhr" ),
      '. Je suis un informaticien 48 ans vivant en Corse. ',
      'Quand j\'ai d&eacute;couvert ce qu\'est la ',
      ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
      'D&eacute;mocratie d&eacute;l&eacute;gative</a>, j\'ai beaucoup aim&eacute;. ',
      'Je pense que ce serai une bonne chose de l\'appliquer largement, ',
      'en utilisant les technologies modernes, ',
      'disponibles maintenant partout dans le monde.<br> ',
      'J\'ai l\'espoir que vous serez d\'accord.'
    ].join( "" );
  }
  
  this.set(
    page_style(),
    page_header(
      _,
      link_to_twitter_tags( "#kudocracy" ),
      _
    ),
    '<div style="max-width:50em">', msg, '</div>',
    // Twitter tweet & follow buttons
    (   '<a href="https://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=agree,kudocracy,democracy,vote,participation,LiquidDemocracy'
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    ),(
      ' <a href="https://twitter.com/Kudocracy'
      + '" class="twitter-follow-button" data-show-count="true">'
      + 'Follow @Kudocracy</a>'
    ),
    //'<br><br><h2>Misc</h2><br>',
    //'Debug console: ' + link_to_command( "help" ),
    '<br><br>'
  );
  
  this.session.needs_twitter = true;
  this.push( page_footer() );
  
} // page_help()


/*
 *  emoji
 *    Chrome requires the installation of an extension in order to display
 *  emojis correctly.
 *
 *  I currently use thumb up, down for orientations and check box and cross
 *  for tag filtering.
 */


function emoji( name, spacer ){
  var tmp = emoji.table[ name ];
  if( !tmp )return "";
  if( !spacer )return tmp;
  return tmp + spacer;
}

emoji.table = {
  neutral:  "&#x1f450;",   // open hands
  agree:    "&#xe00e;",    // Thumb up
  disagree: "&#xe421;",    // Thumb down
  blank:    "&#xe012;",    // raised hand
  protest:  "&#x270a;",    // raised fist
};


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
      buf.push( ' ' + n + ' ' );
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

  if( div ){
    buf.push( '<div><h2>', i18n( "Summary" ) + ' <em>' + emojied( orientation ) + '</em>'
    //+ ( comment ? '<br>' + format_comment( comment.text ) : "" )
    + '</h2><br>' );

  }else{
    var comment = proposition.get_comment_text();
    var author  = proposition.get_comment_author();
    var full_comment = "";
    if( comment ){
      full_comment += format_comment( comment );
    }
    if( author ){
      full_comment += ' <dfn>(' + link_to_persona_page( author ) + ')</dfn>';
    }
    if( full_comment ){
      buf.push( '<h3>' + full_comment + '</h3><br>' );
    }
    buf.push( "<em>" + i18n( orientation ) + "</em>. " );
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
    cond_push( 'protest', protest, 'dfn' );
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

  console.log( "Google pie" );
  google.load( 'visualization', '1.0', { 'packages': ['corechart'] } );
  google.setOnLoadCallback(drawChart);
  
  function drawChart(){

    var data;
    var options;

    // Create the data table.
    data = new google.visualization.DataTable();
    data.addColumn( 'string', 'Orientation' );
    data.addColumn( 'number', 'Slices' );
    data.addRows([
      ['agree',    graph_pie.agree],
      ['disagree', graph_pie.disagree],
      ['protest',  graph_pie.protest],
      ['blank',    graph_pie.blank]
    ]);

    // Set chart options
   // options = { 'title':'Orientations', 'width':400, 'height':300 };
    options = { 'width': 400, 'height': 300 };

    // Instantiate and draw our chart, passing in some options.
    var chart = new google.visualization.PieChart( document.getElementById( 'orientation_chart_div' ) );
    chart.draw( data, options );

    data = new google.visualization.DataTable();
    data.addColumn( 'datetime', 'date' );
    data.addColumn( 'number' ) // , 'balance' );
    for( var ii = 0 ; ii < graph_serie.length ; ii++ ){
      graph_serie[ ii ][ 0 ] = new Date( graph_serie[ ii ][ 0 ] );
    }
    data.addRows( graph_serie );
    chart = new google.visualization.LineChart( document.getElementById( 'balance_chart_div' ) );
    //options.title = "History";
    options.explorer = {};
    options.hAxis = { format: 'dd/MM HH:mm' };
    chart.draw( data, options );
  }
}


/* ---------------------------------------------------------------------------
 *  page proposition
 */
 
function page_proposition( page_name, proposition_name ){
// Focus on one proposition

  var proposition = Topic.find( proposition_name );
  if( !proposition ){
    this.set( page_style(), "Proposition not found: ", proposition_name );
    return;
  }
  
  var buf = [];
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

  // Graph preparation
  var graph_pie = {
    agree:    result.agree(),
    disagree: result.disagree(),
    protest:  result.protest(),
    blank:    result.blank()
  };
  var graph_serie = [ [ proposition.timestamp, 0 ] ];
  var balance = 0;
  var public_balance = 0;

  buf.push(
    '<h1>', (is_tag ? "Tag " : "" ),
    emoji( proposition.result.orientation() ), proposition.label,
    '</h1><br><br>'
  );
  
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
      ' <dfn>(',
      link_to_persona_page( author ),
      ')</dfn>'
    );
  }
  if( author || comment ){
    buf.push( "<br><br>" );
  }

  // Pie graph
  buf.push( '<div id="orientation_chart_div" style="height:300px"></div>' );
  
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
    buf.push( "<br>", proposition.propositions().length, " ",
      link_to_page( "propositions", tag_label, "propositions" ), "<br>"
    );
  }

  // List of tags, with link to propositions
  buf.push( '<br><h2>Tags</h2><br>' );
  var tmp = proposition.filter_string( persona, true /* only delegateable */ );
  buf.push( filter_label( tmp, "propositions" ) );
  
  // Add tagging form, not for banned users
  if( this.session.visitor && !this.session.visitor.is_abuse() ){
    buf.push(
      '\n<form name="proposition" url="/">',
      '<input type="hidden" name="i" value="proposition_action"/>',
      '<input type="hidden" name="i3" value="' + proposition.label + '"/>',
      '<input type="text" placeholder="additional tag" name="i4" />',
      ' <input type="submit" name="i2" value="Tag"/>',
      '</form>\n'
    );
  }
  buf.push( '<br>' );
  
  // Info: source, since, age, last change...
  buf.push( '<br><h2>Info</h2><br>' );
  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source " + tmp  + " " );
  }
  if( tmp = proposition.persona() ){
    buf.push( "by ", link_to_page( "persona", tmp.name, tmp.label ) );
  }
  buf.push( "<br>since ", time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  buf.push( "<br>last change ", time_label( proposition.time_touched ) );
  
  // Last vote (if public) ToDo: should display secret or private otherwise
  var votes_log = proposition.votes_log() || [];
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    buf.push( '<br>last vote ', time_label( last_vote_value.snaptime ) );
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
  buf.push( "<br>end in ", duration_label( proposition.expire() - Kudo.now() ) );

  // Votes
  buf.push(
    '<br><br><h2>Votes</h2> - ',
    link_to_page( "ballot", proposition.label, "ballot" ),
    '<br>'
  );

  // Vote menu
  if( persona ){
    var vote_entity = proposition.vote_of( persona );
    if( vote_entity ){
      buf.push(
        '<br>', i18n( 'you' ), " ",
        '<em>', emojied( vote_entity.orientation() ), "</em> ",
        ( ! vote_entity.is_public() ? "<dfn>(" + vote_entity.privacy() + ")</dfn>" : "" ),
        ( vote_entity.is_direct()
          ? ""
          :  "<dfn>(via " + link_to_page( "persona", vote_entity.agent_label() ) + ")</dfn>" ),
        " ", i18n( "for" ), " ", duration_label( vote_entity.expire() - Kudo.now() ),
        vote_menu( persona, proposition, { with_twitter: true, nofocus: true } )
      );
    }else{
      buf.push( vote_menu( persona, proposition ) );
    }
    buf.push( "<br>" );
  }

  // Balance time serie graph
  buf.push( '<div id="balance_chart_div" style="height:300px"></div>' );

  // Votes
  var votes = proposition.votes_log() || [];
  var insert_index_leaders = buf.length;
  buf.push( "" );
  buf.push( "<br><div><h2>Log</h2><br>" );
  //buf.push( "<ol>" );
  var count = 0;
  var gap = false;
  var seen_comments = {};
  var count_indirect_votes = 0;
  var count_by_agent = {};
  var all_agents = [];
  
  var that = this;
  votes.forEach( function( vote_value, index ){
    
    if( !vote_value )return;
    
    // Compute balance agree/against
    var was = vote_value.previous_orientation;
    var was_public = vote_value.previous_privacy;
    var now = vote_value.orientation;
    var is_public = vote_value.privacy === Vote.public;
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
        if( was_public ){
          public_balance--;
        }
      }else if( was === "disagree" || was === "protest" ){
        balance++;
        if( was_public ){
          public_balance++;
        }
      }
      if( now === "agree" ){
        balance++;
        if( is_public ){
          public_balance++;
        }
      }else if( now === "disagree" || now === "protest" ){
        balance--;
        if( is_public ){
          public_balance--;
        }
      }
    }
    graph_serie.push( [
      vote_value.snaptime,
      balance
    ] );
    
    if( count >= 200 && !gap ){
      buf.push( "<br>...<br>" );
      gap = true;
    }
    
    // Display vote
    var valid_vote = Vote.valid( vote_value.entity );
    if( idem && vote_value.comment_text ){
      idem = false;
    }
    if( !idem && ( !gap || index >= votes.length - 200 ) ){
      count++;
      buf.push( "<br>" );
      var orientation = emojied( now );
      if( vote_value.previous_orientation !== Vote.neutral ){
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
          orientation += ' <dfn>(' + that.i18n( "you" ) + ')</dfn>';
        }
      }else if( vote_value.privacy            === Vote.secret
      || ( valid_vote && valid_vote.privacy() === Vote.secret )
      ){
        orientation += " <dfn>(secret)</dfn>";
        if( valid_vote.persona === persona ){
          orientation += '<dfn>(' + that.i18n( "you" ) + ')</dfn>';
        }
      }
      var persona_text = "";
      if( vote_value.privacy                   === Vote.public
      &&  ( valid_vote && valid_vote.privacy() === Vote.public )
      ){
        persona_text = link_to_page( "persona", vote_value.persona_label );
        if( vote_value.delegation !== Vote.direct ){
          count_indirect_votes++;
          if( count_by_agent[ vote_value.agent_label ] ){
            count_by_agent[ vote_value.agent_label ]++;
          }else{
            count_by_agent[ vote_value.agent_label ] = 1;
            all_agents.push( vote_value.agent_label );
          }
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
  
  // Insert list of top 10 major agents
  if( count_indirect_votes ){
    var abuf = [];
    abuf.push( "<br><br><h2>Agents</h2><br><br>" );
    all_agents = all_agents.sort( function( a, b ){
      var count_a = count_by_agent[ a ];
      var count_b = count_by_agent[ b ];
      return count_b - count_a;
    });
    var len = all_agents.length;
    var ratio;
    var agent_id;
    for( var ii = 0 ; ii < len && ii < 10 ; ii++ ){
      agent_id = all_agents[ ii ];
      ratio = Math.round( 1000 * ( 
        count_by_agent[ agent_id ] / count_indirect_votes
      ) ) / 10;
      abuf.push(
        link_to_persona_page( agent_id ),
        "<dfn>(",
          ratio,
        "%)</dfn><br>"
      ); 
    }
    buf[ insert_index_leaders ] = abuf.join( "" );
  }
  
  // Signal public versus global balance, when not same sign
  if( ( balance > 0 && public_balance < 0 )
  ||  ( balance < 0 && public_balance > 0 )
  ){
    buf.push( "<em>public ", public_balance, "</em> versus ", balance );
  }

  buf.push( "</div><br>", page_footer() );

  // Header, built last because it contains data in head of html page
  this.set(
    page_style()
    + '<script type="text/javascript" src="https://www.google.com/jsapi"></script>'
    + '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar graph_pie = '   + JSON.stringify( graph_pie )
    + '\nvar graph_serie = ' + JSON.stringify( graph_serie )
    + '\n' + proposition_graphics + '; proposition_graphics();'
    + '</script>',
    page_header(
      link_to_page( "ballot2", proposition.label, "ballot" ),
      link_to_twitter_filter( tag_label ),
      _
    )
  );
  this.concat( buf );
  
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
          Kudo.AllEntities.forEach( function( item ){
            if( item && item.type === found ){
              list.push( item );
            }
          })
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
  }
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
    PageBuilder.current.session.current_page = PageBuilder.current.session.previous_page;
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
  if( !Session.current.filter_tags.length ){
    return;
  }
  
  Ephemeral.inject( "Delegation", {
    persona: Session.current.visitor,
    agent:   agent,
    tags:    Session.current.filter_tags
  });
}


http_repl_commands.proposition_tagging = function( proposition_name, text ){
  
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
  Session.current.filter_tags.forEach( function( tag ){
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
  
  // Exit if no valid tags
  if( !tag_entities.length ){
    return;
  }

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
  tag_entities.forEach( function( tag_entity, index ){
    // Skip user names, including name of proposer, useless noise
    if( Persona.find( tag_entity.name ) )return;
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
    Session.current.filter_tags.forEach( function( tag ){
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
  var is_tagging = ( name === "Tag" );
  if( is_tagging ){
    if( !proposition_name ){
      printnl( "Tag, missing proposition" );
      return;
    }
  }
  
  // Collect params, " " is added to simplify further tests
  var text = slice( arguments, is_tagging ? 2 : 1 )
  .join( " " ) + " ";
  
  // In rare cases, 'Search' gets included by the browser twice.
  // This happens when the user clicks on a sort criteria and quickly click
  // on the submit button instead of waiting for the auto submit to occur
  if( text.indexOf( "Search " ) === 0 ){
    name = "Search";
    text = text.substring( "Search ".length );
  }
    
  // Filter, text is expected to be a space separated list of tags or criterias
  if( name === "Filter" ){
    return http_repl_commands.proposition_filter( text );
  }

  // Search, text is expected to be a space separated list of tags or criterias
  if( name === "Search" ){
    return http_repl_commands.proposition_search( text );
  }

  // Remove sort criterias potential noise
  text = text.replace( /[+\-][a-z_]*/g, "" );

  // Delegate
  if( name === "Delegate" ){
    return http_repl_commands.proposition_delegate( text );
  }
  
  // Tagging
  if( is_tagging ){
    return http_repl_commands.proposition_tagging( proposition_name, text );
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
        v = Kudo.AllEntities[ id ];
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
if( true || de ){
  var fs = require( 'fs' );
  var old = process.stdout.write;
  process.stdout.write = function( d ){
    fs.appendFileSync( "./trace.out", d );
    print( d );
    return old.apply( this, arguments );
  };
}


exports.start = start_http_repl;

