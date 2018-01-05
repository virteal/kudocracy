//  ui1core.js
//    First UI for Kudocracy, test/debug UI, core
//
// Jun 11 2014 by @jhr, extracted from main.js
// Sep 23 2014 by @jhr, extracted from ui1.js
// May 19 2017 by @jhr, suvranu

"use strict";

var Config = {
  
  domain: "kudocracy",
  
  // Default value for http "Host" header
  host: "kudocracy.com",
  
  // Firebase name, required for twitter authentication
  firebase: "kudocracy",

  // ToDo: document this
  src: "http://virteal.com/",

  // The base url for wiki pages. WikiWord, tag_xxx or [word] are added
  wiki: "http://virteal.com/kudocracy/",

  // Where to find the 'global' style sheet
  style: "/public/kudocracy.css", // from http://virteal.com/simpliwiki.css

  // Where to find the style sheet for the index page
  index_style: "/public/style.css", // from http://virteal.com/style.css

  // The PNG icon that the browser shows to identify the kudocracy window
  // Should be 192x192 for Android
  icon: "http://virteal.com/yanugred16.png",

  // The 'kudocracy' html img tag, it includes height/width attributes to avoid flicker
  img_icon: '<img src="http://virteal.com/yanugred16.png" type="image/png" height="16" width="16"/>',

  // false in "production" mode. Init at startup based on ENV vars
  dev_mode: false

};


function process_config(){
// Compute config values that are derived from configurable ones.
  // ... none at this time ...
}


var set_config = function( new_config ){
  // ToDo: avoid global
  Config = new_config;
  process_config();
};


// Exported stuff for pages defined in other files
var ui = {};

var get_config = ui.get_config = function(){
  return Config;
};


// Better object for sets & maps. Avoid issues with x.__proto__ for example.

function raw_object_maker(){
  var obj_create = Object.create; // Not in IE8
  return obj_create
  ? function(){ return obj_create.call( null, null ); }
  : function(){ return {}; };
}

var map = ui.map = raw_object_maker();

// Imports

var Kudo = map(); // start_http_repl() actualy initializes it

var l8;        // = Kudo.l8; after call to start_http_repl()
var Ephemeral; // = Kudo.Ephemeral;
var Machine;
var Change;
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

// Export (after start())
var Ui1Server;


// Help debug timeout issues
if( false ){
  var original_setTimeout = setTimeout;
  /*global setTimeout*/
  setTimeout = function( f, d ){
    return original_setTimeout( function(){
      console.log( "tracing setTimeout", d, f.name );
      f();
    }, d );
  };
}


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


// ToDo: implement client side version
var TwitterUser = map();  // from ui1twit.js
TwitterUser.find = function(){ return null; }; // default, also client side


/* ---------------------------------------------------------------------------
 *  HTTP session management
 *    Session is associated to source ip address (Koa) or Express session id.
 *    ToDo: I use a secure cookie. ip addresses are shared behind proxies
 *    Note: that session cookie must be 'shared' with simpliwiki to enable
 *    a unified login whereby login in kudocracy means login in simpliwiki and
 *    vice-versa. This is yet to be done.
 */

function Session( id ){
// Constructor, called by .login() only

  // Return existing obj with same id if any
  var session = Session.all[ id ];
  if( session )return session;
  
  // Or init a new object
  
  // Count number of active sessions, and max of such count
  Session.count++;
  if( Session.count > Session.max_count ){
    Session.max_count = Session.count;
  }
  
  this.clear( true /* ctor */ ); 
  this.id = id;
  Session.all[ id ] = this;

  return this;
}


Session.all = map();
Session.count = 0;
Session.max_count = 0;

var ProtoSession = Session.prototype;


Session.find = function( id ){
  if( !id || id === "cleared" ){
    trace( "BUG? attempt to find session using a bad id", id );
    debugger;
    return null;
  }
  return Session.all[ id ];
};


Session.login = function( id ){
  
  // Return current session if not changed
  if( Session.current && id === Session.current.id
  )return Session.set_current( Session.current );
  
  // Look for existing session or new one
  return Session.set_current( new Session( id ) );
  
};


Session.discarder = function Session_discarder(){
// Called every minute to discard old inactive sessions

  // Schedule itself using setTimeout() if not scheduled yet
  if( !Session.discarder.scheduled ){
    setTimeout( Session.discarder, 1 * 60 * 1000 ); // Every minute
    Session.discarder.scheduled = true;
    return;
  }
  
  // When called by setTimeout()..., discarder will have to be rescheduled
  Session.discarder.scheduled = false;
  
  var now = Kudo.l8.update_now();
  // Sessions stay active for one hour
  var delay = 1 * 60 * 60 * 1000;
  // Allow for longer delay if few sessions exists
  if( Session.count < 1000 ){
    delay = 10 * 24 * 60 * 60 * 1000; // 10 days
  }
  
  // Scan all sessions, looking for inactive one
  var all = Session.all;
  var session;
  
  for( var id in all ){
    if( id === "cleared" || !id ){
      trace( "BUG? bad session in array if all sessions", id );
      debugger;
      continue;
    }
    session = all[ id ];
    if( !session ){
      trace( "BUG? missing session for id:", id );
      continue;
    }
    var age = now - session.time_touched;
    if( age < delay )continue;
    session.discard();
  }
  
  // Reschedule the session discarder
  Session.discarder();
  
}; // discarder()


// Schedule the discarder, ie start it
Session.discarder();


var ProtoSession = Session.prototype;


ProtoSession.clear = function( ctor ){
// Init/reinit all session attributes. Init when ctor called (via login()).
  if( ctor ){
    this.id                = "cleared";
    this.express_session   = null;
    // Client capabilities
    this.bot               = false;
    this.is_slim           = false;
    this.can_script        = l8.client ? true : "init";
    this.can_history       = true;
    this.can_local_storage = undefined;
    this.should_clear_local_storage = false;
    this.screen_width      = 0;
    this.screen_height     = 0;
    this.touch_device      = undefined;
    this.lang              = "en";
    this.auto_lang         = true;
  }else{
    if( this.id === "cleared" ){
      trace( "BUG? already cleared session" );
      debugger;
      return;
    }
  }
  this.time_touched     = Kudo.now();
  this.is_new           = true;
  this.is_safari        = false; // emoji handling, poor
  this.is_chrome        = false; // idem
  this.is_ie            = false;
  this.is_firefox       = false;
  this.is_old_browser   = true;
  this.magic_loader     = false;
  this.page_is_headless = false;
  this.page_builder     = null;
  this.boxon            = null;
  this.delayed_login    = null;
  this.domain           = "";
  this.machine          = Ephemeral.Machine.main;
  this.page_init_done   = false; // True after magic loader is loaded
  this.is_app           = false; // True when browserfied app runs client side
  this.app_init_done    = false; // True after browserified.js is loaded
  this.visitor          = null;
  this.authentic        = false;
  this.pending_alias    = null;       // Until authentic
  this.pending_twitter_page = null;  // Until twitter phase 2 is done
  this.pending_vote     = null;
  this.jhr_demo         = false;
  this.is_novice        = true;
  this.current_page     = []; // tokens, input was space separated
  this.previous_page    = [];
  this.host             = ""; // "Host" header from first http request
  this.url              = ""; // of current page
  this.previous_url     = ""; // of previous page, last different one
  this.page_id          = ""; // of current page, see ui.page_style()
  this.page_title       = ""; // of current page
  this.page_fragments   = map();
  this.pushState        = "";
  this.scroll_to        = 0;  // to ask browser to scroll to a position on screen
  this.needs_twitter    = false;  // <script> include of twitter intent lib
  this.filter           = "";  // Tags
  this.filter_query     = "";  // Keywords for fulltext
  this.time_filter_changed = 0;
  this.cached_count_propositions = _;
  this.filter_tag_entities = [];
  this.filter_tag_labels   = []; // As strings, includes "computed" tags
  this.sort_criterias   = [];
  this.proposition      = null;
  this.agent            = null;
  this.tag_set          = null;
  this.changes          = 0; // Count changes sent to client
  return this;
  
};


ProtoSession.toString = function(){
  return "#" + this.id;
};


ProtoSession.domain_label = function(){
  return this.domain || Config.domain;
};


Session.prototype.discard = function(){
// Called by Session.discarder() after some inactivity delay,
// when session is to be removed
  if( !this.id ){
    trace( "BUG? attempt to discard a discarded session" );
    debugger;
    return;
  }
  if( this.id === "cleared" ){
    trace( "BUG? attempt to discard a cleared session" );
    debugger;
  }
  delete Session.all[ this.id ];
  Session.count--;
  this.clear();
  this.id = undefined;
  if( this.express_session ){
    this.express_session = null;
  }
};


Session.prototype.set_visitor = function( visitor, authentic ){
  this.visitor = visitor;
  this.authentic = !!authentic;
};


Session.prototype.set_capabilities = function( options ){
  if( !options )return this;
  if( this.can_script === "init" ){
    this.can_script = true;
  }else if( this.can_script === false ){
    trace( "BUG? noscript client use magic loader" );
    this.can_script = true;
  }
  if( options.screen_width ){
    this.screen_width = options.screen_width;
  }
  if( options.screen_height ){
    this.screen_height = options.screen_height;
  }
  if( options.touch_device ){
    this.touch_device = true;
  }
  this.set_lang( options.lang );
  return this;
};


Session.prototype.set_lang = function( lang ){
// Called when visitor explicitely sets the lang.
// This overrides the "auto-detection" done when
// session is created.
  if( lang ){
    this.lang = lang;
    this.auto_lang = false;
  }
  return this;
};


Session.prototype.set_host = function( host ){
  // Sanitize to avoid injections
  if( host ){
    // Remove chars that are not ok in a host:port
    host = host.toLowerCase().replace( /[^a-z0-9\:\-\.]/, "" );
  }
  this.host = host || Config.host;
};


Session.prototype._set_domain = function( domain ){
// Kudocracy domains are like virtual hosts. A domain
// is typically some unit of organization. The "main"
// domain on kudocracy.com is a kind of sandbox for tests.

  // Use default main machine, until switch to another one, if any
  this.machine = Ephemeral.Machine.main;
  this.domain = this.machine.label;
  this.machine.activate();
  
  // If main machine required, it is already started
  if( !domain || domain === "main" ){
    return this;
  }
  
  // If required machine was started, switch to it and return
  var machine = Ephemeral.Machine.find( domain.toLowerCase() );
  if( machine ){
    // ToDo: deal with machine beeing initialized
    // Currently there is a bug where HTTP requests for a domain that
    // is beeing initialized are never answered. This is not very
    // serious because 1/ rare 2/ visitor can reload the page and
    // will probably do so after init is done.
    this.machine = machine;
    this.domain  = machine.label;
    machine.activate();
    return this;
  }
  
  // if a valid persona exists, with a #domain tag, start a new machine
  // Note: that does not happen for domains with a Twitter CLI from ui1twit.js
  // because those machines are started when the program (re)starts
  var main_domain_persona = Persona.find( "@" + domain );
  if( !main_domain_persona )return this;
  if( !main_domain_persona.is_domain() )return this;
  
  machine = new Ephemeral.Machine( {
    owner: domain
  } );
  
  // Signal caller that machine will be available later
  this.machine = machine;
  this.domain = machine.label;
  machine.activate();
  this.boxon = Kudo.boxon();
  
  // When machine init is done, some more work remains
  var that = this;
  Ephemeral.start( null /* bootstrap() */, function( err ){
    // Done
    var box = that.boxon;
    that.boxon = null;
    // ToDo: handle error?
    box( true );
  });
  
  return this;
  
};


Session.prototype.set_domain = function( domain ){
  var current = Ephemeral.Machine.current;
  this._set_domain( domain );
  if( Ephemeral.Machine.current === current )return this;
  // trace( "Changed domain", current.label, "to", domain );
  this.proposition = this.agent = this.tag_set = null;
  // When machine is ready, log current visitor if any
  if( this.visitor ){
    this.delayed_login = this.visitor.label;
  }
  this.set_visitor( null );
  return this;
};


var querystring; // from ui1http.js


Session.prototype.set_current_page = function( parts ){
  
  this.current_page = parts;

  var current_url = this.url;
  
  var url = "http://" + this.host 
  + "/?kudo=" + this.domain_label()
  + "&page="
  + querystring.escape( parts.join( " " ) ).replace( /%20/g, "/" );
  
  if( url[ url.length - 1 ] === "/" ){
    trace( "BUG? bad trailing / in url", url );
    debugger;
    url = url.substring( url, url.length - 1 );
  }
  
  // Add time= to defeat stupid offline manifest logic
  this.time_mark = l8.update_now();
  
  if( Config.offline_support ){
    url += "&time=" + this.time_mark;
  }
  
  var page_id = "page_" + parts[ 0 ];
  if( page_id != this.page_id ){
    this.page_id = "page_" + parts[ 0 ];
    this.page_fragments = map();
  }else if( !this.magic_loader ){
    this.page_fragments = map();
  }
  this.page_title = parts[ 0 ];
  this.url = url;
  if( url !== current_url ){
    this.previous_url = current_url;
  }
  
};


Session.prototype.page_name = function(){
  return this.current_page[0];
};


Session.prototype.get_cookie = function( name ){
  if( !this.request ){
    trace( "BUG? attempt to get cookie but no request" );
    debugger;
    return null;
  }
  name = "kudo_" + name + "=";
  if( l8.client ){
    // Offline mode uses global variables instead
    return window[ name ];
  }
  var cookies = this.request.headers.cookie;
  if( !cookies )return "";
  var idx = cookies.indexOf( name );
  if( idx === -1 )return "";
  cookies = cookies.substring( idx + name.length );
  idx = cookies.indexOf( ";" );
  if( idx === -1 )return cookies;
  return cookies.substring( 0, idx );
};


// Translation messages are in a different file
var i18n_table = require( "./ui1i18n.js" );

var i18n_cache = { _: {}, en: {} };
var i18n_cached = {};


Session.prototype.i18n = function( msg, no_cache ){
// Returns the i18n version of the msg.
// "msg" is usually the "en" version of the message, with the translated
// version in "per language" tables.
// Sometimes "msg" is a "fake" msg that is not needed in english but is
// needed in some other languages. "il y a" is an example of such messages.

  if( !msg )return "";
  
  // Don't translate names
  if( msg[ 0 ] === "@" )return msg;
  
  // Don't translate icons
  if( msg[ 0 ] === "<" )return msg;
  
  var lang = this.lang;
  
  // if( msg === "Search" )debugger;

  // if already the result of a previous translation, return as is
  if( i18n_cached[ msg ] === lang )return msg;

  if( !i18n_cache[ lang ] ){
    i18n_cache[ lang ] = {};
    if( !i18n_table[ lang ] ){
      console.warn( "i18n, new language:", lang );
      i18n_table[ lang ] = {};
    }
  }
  
  function cached( r ){
    if( r === "_" ){
      r = msg;
    }
    if( !no_cache ){
      i18n_cache[ lang ][ msg ] = r;
      i18n_cached[ r ] = lang;
      // console.log( "i18n cached", lang, msg );
    }
    return r;
  }
  
  // Cache lookup
  var r = i18n_cache[ lang ][ msg ];
  if( r )return cached( r );

  // Lang specific msg, use it if it exists
  r = i18n_table[ lang ][ msg ];
  if( r ){
    // Handle redirection to another lang
    if( r === "_" )return cached( msg ); // Source code is the solution
    if( i18n_table[ r ] ){
      r = i18n_table[ r ][ msg ];
      if( r )return cached( r );
    }else{
      return cached( r );
    }
  }

  // Try "international" version. Example: "login"
  r = i18n_table[ "_" ][ msg ];
  if( r ){
    // If that version is one of another language, use that lang
    if( r === "_" )return cached( msg ); // Source code is the solution
    if( i18n_table[ r ] ){
      r = i18n_table[ r ][ msg ];
    }
    if( r )return cached( r );
  }
  
  // Signal missing translations, when a translation exists in french
  var fr_msg = i18n_table[ "fr" ][ msg ];
  if( lang !== "en" ){
    if( fr_msg )return cached( msg + "(" + lang + ")" ); 
  }
  
  // Use the english version if everything else failed
  r = i18n_table[ "en" ][ msg ];
  if( r ){
    return cached( r );
  }
  
  // Use the message itself in the worst case
  if( fr_msg )return cached( msg );
  
  // Neither translatable nor cacheable, inefficient, bug?
  if( !no_cache ){
    // Don't cache lookup for icons
    if( msg.substring( 0, 2 ) === "i-" )return msg;
    if( msg.length < 30 )return cached( msg );
    console.warn( "i18n non cacheable?", lang, msg );
    debugger;
  }
  return msg;
  
};


Session.prototype.i18n_comment = function( text ){
// Translate comments. "i18n en bla bla i18n fr french bla bla i18n it ..."
  
  if( text.substring( 0, 5 ) !== "i18n " ){
    trace( "BUG? i18n_comment() call for " + text );
    debugger;
    return text;
  }
  
  var lang = this.lang;

  // Cached?
  var cache = i18n_cache[ lang ];
  if( !cache )return text;
  var cached = cache[ text ] || i18n_cache[ "en" ][ text ];
  if( cached )return cached;
  
  // trace( "DO format comment: " + text.substring( 0, 10 ), lang );
  
  // Add to i18n table. ToDo: some potential memory leak or abuse here
  var first_text = ""; // "key" for lookup
  text.split( "i18n ").forEach( function( l_t ){
    if( !l_t || l_t.length < 5 )return;
    var l = l_t.substring( 0, 2 );
    var t = l_t.substring( 3 );
    // trace( "i18_comment", "l: " + l, "t: " + t );
    var tbl = i18n_table[ l ];
    if( !tbl ){
      tbl = {};
      i18n_table[ l ] = tbl;
    }
    if( !first_text ){
      first_text = t;
      // International version is english version
      i18n_table[ "en" ][ t ] = "_";
      i18n_cache[ "en" ][ t ] = _;
    }
    tbl[ first_text ] = t;
    // Invalidate cache, to enable updates
    if( !i18n_cache[ l ] ){
      // trace( "i18n_comment, new lang: " + l );
      i18n_cache[ l ] = {};
    }
    i18n_cache[ l ][ first_text ] = _;
  });
  
  if( !first_text ){
    trace( "BUG, i18_comment issue with " + text );
    return "";
  }
  
  var r = this.i18n( first_text );
  i18n_cache[ lang ][ text ] = r || _;
  return r;
  
};


Session.prototype.novice_mode = function(){
  this.is_novice = true;
  return this;
};


Session.prototype.expert_mode = function(){
  this.is_novice = false;
  return this;
};


Session.prototype.has_filter = function(){
  return !!this.filter.length;
};


Session.prototype.has_delegateable_filter = function(){
// A delegateable filter is a list of tags that are ok to
// define a delegation. That does not include "computed" tags.
  return !!this.filter_tag_entities.length;
};


Session.prototype.too_much_propositions = function(){
// When there are too many propositions, visitor is expected to
// alter the filter. Idem when filter is too strict and excludes
// all propositions.
  var count = this.cached_count_propositions;
  // If count of matching proposition is unknown
  if( count === undefined ){
    // It's ok if there is a delegateable filter
    if( this.has_delegateable_filter() )return false;
    // Else, assume filter is too loose and there will be too much matches
    return false;
  }
  // It's never ok where there are more than xxx matching propositions
  if( count > 300 )return false;
  // 0 is "too much" is a special way to avoid meaningless pages
  if( count === 0 )return true;
  // If there are very few matching propositions, it's ok, whatever the filter
  if( count <= 50 )return false;
  // If too much propositions, it's ok only with a delegateable filter
  if( this.has_delegateable_filter() )return false;
  return true;
};


Session.prototype.has_enough_filter = function(){
// Predicates to command display of propositions in some cases.
  if( this.filter_query )return true;
  if( this.filter_tag_entities.length )return true;
  if( !this.filter )return !this.too_much_propositions();
  if( this.filter_tag_labels.indexOf( "#draft" ) !== -1 )return true;
  if( this.filter_tag_labels.indexOf( "#abuse" ) !== -1 )return true;
  if( this.filter_tag_labels.indexOf( "#tag"   ) !== -1 )return true;
  // Look for a persona tag
  var list = this.filter_tag_entities;
  var len  = list.len;
  var tag;
  for( var ii = 0 ; ii < len ; ii++ ){
    tag = list[ ii ];
    if( tag.is_persona() )return true;
  }
  return !this.too_much_propositions();
};


Session.prototype.filter_label = function( separator ){
// Return string with separated list of tags and keywords extracted from
// filter, trimmed.
// Return "" if no filter
  var text = this.filter + this.filter_query;
  if( !text )return "";
  // Trim & remove sort criterias
  text = text
  .trim()
  .replace( /[+\-][a-z_]*/g, "" );
  // Change spaces into specified separator
  if( separator ){
    text = text.replace( / /g, separator );
  }
  return text;
};


Session.prototype.delegateable_filter = function( sep ){
// Return string with separated list of delegateable tags extracted from
// filter, trimmed.
// Return "" if no delegeatable tags in filter.
  var buf = [];
  Ephemeral.each( this.filter_tag_entities, function( tag ){
    buf.push( tag.label );  
  } );
  return buf.join( sep || " " );
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
//   Collect full text keywords into session.filter_query

  this.time_touched = l8.update_now();

  // Filter out null, undefined, etc
  if( typeof text !== "string" )return "";
  
  text = text.trim();
  
  var old_criterias = this.proposition && this.sort_criterias.join( " " );
  
  // If filter changes, cached count is invalidated
  var old_filter = this.filter;
  var old_query  = this.filter_query;

  if( text ){

    var with_abuses = false;
    var tags = [];
    var tag_entity;
    var sort_criterias = [];
    var query = "";
    
    // Sanitize, filter out weird stuff
    text = dialess( text ).replace( /[^+\-#A-Za-z0-9_ ]/g, "" );
    
    // Handle "all" pseudo filter
    if( text === "all" ){
      this.filter = "";
      this.filter_query = "";
    
    // Handle normal stuff, if anything remains, ie space separated things
    }else if( text ){ 

      var buf = [];
      var tag_buf = [];
      text.split( " " ).forEach( function( tag ){

        // Remove too short stuff, or empty stuff, unless valid reserved tag
        if( tag.length <  2 && !Topic.reserved( tag ) )return;
        
        // Special all && #all erase all tags && keywords
        if( tag === "all" || tag === "#all" ){
          tags = [];
          buf  = [];
          tag_buf = [];

        // +xxx sort criterias
        }else if( tag[0] === "+" ){
          if( sort_criterias.indexOf( tag ) === -1 ){
            sort_criterias.push( tag );
          }
        
        // -xxx descending sort criterias
        }else if( tag[0] === "-" ){
          // Special -sort erases all criterias
          if( tag === "-sort" ){
            sort_criterias = [];
          }else if( sort_criterias.indexOf( tag ) === -1 ){
            sort_criterias.push( tag );
          }
          
        // Tags
        }else if( tag[0] === "#" ){
          
          // Existing tags
          tag_entity = Topic.find( tag );
          if( tag_entity ){
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
          // Keyword
          }else{
            var tag_lower = tag.toLowerCase();
            if( buf.indexOf( tag_lower ) === -1 ){
              buf.push( tag_lower );
              query += " " + tag_lower;
            }
          }
        // Keyword
        }else{
          var tag_lower = tag.toLowerCase();
          if( buf.indexOf( tag_lower ) === -1 ){
            buf.push( tag_lower );
            query += " " + tag_lower;
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
    }
  }else{
    this.filter = "";
    this.filter_query  = "";
  }
  if( !this.filter && !this.filter_query && !this.sort_criterias.length ){
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
  if( this.filter !== old_filter || this.filter_query !== old_query ){
    this.time_filter_changed = l8.now;
    this.cached_count_propositions = _;
  }
  var r = this.filter;
  if( this.filter_query ){
    if( r ){
      r += this.filter_query + " ";
    }else{
      r = " " + this.filter_query + " ";
    }
  }
  return r;
};


Session.prototype.filter_changed_recently = function( delay ){
  if( !delay ){
    delay = 10 * 1000; // 10 seconds
  }
  return ( l8.now - this.time_filter_changed ) <= delay; 
};


Session.prototype.full_query = function(){
  return ( 
    this.filter + " "
    + this.filter_query 
    + " " + this.sort_criterias.join( " " )
  )
  .replace( /  /g, " " )
  .trim(); 
};


Session.prototype.without_filter_stuff = function( text ){
// Remove all tags that look like something coming from the current filter.
// Note: remove both xxx and #xxx, # is optional
// Note: does not deal with +/- stuff or other weird stuff, only tags
// Result is trimmed.
  if( this.has_filter() ){
    this.filter_tag_labels.forEach( function( name ){
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
// In some pages, the #new filter makes no sense
  if( this.filter.indexOf( " #new " ) !== -1 ){
    this.set_filter( this.filter.replace( " #new ", "" ) );
  }
  return this;
};


Session.prototype.strict_new_filter_removed = function( count ){
// In some pages, #new, when alone, it too strict because nothing is new
  if( count )return false;
  if( this.filter.indexOf( " #new ") === -1 )return false;
  if( this.filter_tag_labels.length !== 1 )return false;
  this.remove_confusing_new_filter();
  return true;
};


Session.set_current = function( session ){
  if( session ){
    session.time_touched = Kudo.now();
    session.machine.activate();
    ui.Builder.current = session.page_builder;
  }else{
    Ephemeral.Machine.main.activate();
  }
  if( l8.client ){
    window.kudo_ctx.session = session;
  }
  Session.current = session;
  return session;
};


Session.prototype.pull_changes = function( stored ){
  if( !this.is_app || l8.client )return null;
  var all = Ephemeral.Machine.current.changes;
  var len = all.length;
  var pulled = this.changes;
  if( stored ){
    if( !pulled ){
      pulled = stored;
    }else if( pulled !== stored ){
      trace( "BUG? pulled !== stored", pulled, stored );
      this.should_clear_local_storage = true;
    }
  }
  this.changes = len;
  return all.slice( pulled );
};


Session.start_change_dispatcher = function(){

  // Start once only
  if( Session.start_change_dispatcher_done )return;
  Session.start_change_dispatcher_done = true;

  // On client, it's the receiver side that must be started
  if( l8.client ){
    console.log( "ToDo: start change receiver" );
    // Changes are currently received whenever a visitor initiated
    // change is sent to the server (they are in the server's response)
    return;
  }

  // On the server side, tap into the change fluid
  Ephemeral.Change.fluid.tap( function Session_change_dispatch( a_change ){
    if( Session.change_dispatch_scheduled )return;
    Session.change_dispatch_scheduled = true;
    function Session_dispatch_changes(){
      Session.change_dispatch_scheduled = false;
      var all = Session.all;
      var len = all.length;
      var session;
      for( var ii = 0 ; ii < len ; ii++ ){
        session = all[ ii ];
        session.dispatch_changes();
      }
      Session_change_dispatch();
    }
    setTimeout( Session_dispatch_changes, 10000 );
  });
  
  console.log( "ToDo: start some websocket server" );
  // Server should signal that new changes are available. Client
  // would then query the server for changes. This is a "trap oriented"
  // type of polling. It's a robust scheme because changes always
  // travel using a single mechanism and there is consequently no
  // risks of synchronisation issue.
  // Note: to query for change, an empty request to the server is ok,
  // changes will be included in the server's response.
  // ToDo: until this works (or when WebSockets are not available) I
  // could do some periodic polling.
};


Session.prototype.dispatch_changes = function(){
  // If session is somehow inactive, don't broadcast changes
  if( Kudo.now() - this.time_touched > 1 * 60 * 1000 )return this;
  // Check if new changes need to be sent
  var all = Ephemeral.Change.all;
  var len = all.length;
  var pulled = this.changes;
  if( len <= pulled )return this;
  // ToDo: signal client that changes are available, asap
};


Session.prototype.inject = function( change ){
// Inject changes in current Ephemeral machine, like Ephemeral.inject().
// The client side additionnaly send the change to the server, so that
// both the client and the server are in sync.
  Ephemeral.inject.apply( null, arguments );
  // The client side also ask the server to process with the change
  if( l8.client ){
    // Note: the server will respond with duplicate changes. That does not
    // matter most of the time. To avoid duplicate votes, a vote update is
    // skipped when there is no orientation/delegation change and when the
    // update occurs shortly after another one (ie when a server update
    // duplicates a client update).
    // This a very optimistic solution. It enables ultra fast feedback with a
    // small risk of desynchronisations without serious consequences.
    if( !window.ui1_server || !window.ui1_server.inject ){
      console.warn( "BUG? missing ui server" );
      debugger;
      return;
    }
    window.ui1_server.inject.apply( null, arguments );
    // ToDo: an "offline" mode where changes not sent are queued and sent later.
  }
};


Session.prototype.can_tag = function( proposition ){
// Return true if current visitor "owns" the proposition. In addition to
// the proposition "owner", the domain owner, the dns domain owner and me
// can change tags. Case sensitive.
  return this.visitor
  &&  ( proposition.author_is( this.visitor )
    || this.visitor.label === "@jhr" // For demos & during alpha/beta period
    || this.visitor.short_label() === Config.domain
    || this.visitor.short_label() === this.domain
  );
};


Session.prototype.can_untag = function( proposition ){
  return this.can_tag( proposition );
};


Session.prototype.fragment = function( id, content ){
// Returns "" if same fragment is already displayed by client. If not,
// content is returned and memorized for future reference.
  // console.log( "Fragment", id )
  var old_content = this.page_fragments[ id ];
  if( old_content === undefined ){
    // console.log( "Fragment new", id );
  }else{
    if( content === old_content ){
      // console.log( "Fragment no change", id )
      return "";
    }
  }
  return this.page_fragments[ id ] = content;
}


Session.prototype.get_fragment = function( id ){
  return this.page_fragments[ id ] || "";
}


Session.prototype.clear_fragment = function( id ){
console.log( "Fragment, clear", id )
  if( id === "all" ){
    this.page_fragments = map();
  }else{
    this.page_fragments[ id ] = undefined;
  }
  return this;
}


// Defaults to no session
Session.current = null; // new Session( "127.0.0.1" );


/*
 *  Builder, use fast concat of string items
 */

ui.Builder = function Builder(){
  // Optional session
  this.session = null;
  // Optional head
  this._head = [];
  // Init body, reserve one slot for fast unshift()
  this._body = [ "", "" ];
  this.length = 2;
  // Concat arguments to the second string inside _body
  if( arguments.length ){
    this.concat( arguments );
  }
}

var ProtoBuilder = ui.Builder.prototype;


ProtoBuilder.set_session = function( session ){
  this.session = session;
  if( !session.page_builder ){
    session.page_builder = this;
  }
  return this;
};


ProtoBuilder.toString = function(){
  return this.join();
};


ProtoBuilder.set_head = function( head ){
  this._head = head || [];
  return this;
};


ProtoBuilder.set_body = function(){
  this._body = [ "", "" ];
  this.length = 2;
  return this.concat( arguments );
};


ProtoBuilder.set = function( head /* , ...body */ ){
  this.set_head( head );
  this.set_body.apply( this, slice1( arguments ) );
  return this;
};


ProtoBuilder.push = function(){
  var idx_tail = this.length - 1;
  var str = this._body[ idx_tail ] || "";
  var len = arguments.length;
  var v;
  for( var ii = 0 ; ii < len ; ii++ ){
    v = arguments[ ii ];
    if( !v )continue;
    str += v;
  }
  this._body[ idx_tail ]= str;
  return this;
};


ProtoBuilder.concat = function( a ){
  var idx_tail = this.length - 1;
  var str = this._body[ idx_tail ] || "";
  var v;
  var len = a.length;
  for( var ii = 0 ; ii < len ; ii++ ){
    v = a[ ii ];
    if( !v )continue;
    str += v;
  }
  this._body[ idx_tail ]= str;
  return this;
};


ProtoBuilder.unshift = function( msg ){
  // Fast case, for headers insertions typically
  if( arguments.length === 1 && !this._body[ 0 ] ){
    if( !msg )return this;
    this._body[ 0 ] = msg;
    return this;
  }
  // General case
  this._body = this._body.unshift.apply( this._body, arguments );
  this.length = this._body.length;
  return this;
};


ProtoBuilder.join = function(){
  var body = this._body;
  var len  = this.length;
  // Faster cases
  if( len === 2 ){
    // Fastest case, when only push() or concat() were called 
    if( !body[ 0 ] )return body[ 1 ];
    // When unshift( x ) was called once
    return body[ 0 ] + body[ 1 ];
  }
  var buf = "";
  var str;
  for( var ii = 0 ; ii < len ; ii++ ){
    str = body[ ii ];
    if( !str )continue;
    buf += str;
  }
  this._body = [ "", buf ];
  this.length = 2;
  return buf;
};


ProtoBuilder.slot = function( v ){
  // Add an empty slot
  this._body.push( v || "" );
  // Add another once, where further push will accumulate
  this._body.push( "" );
  // There is an empty slot at previous .length
  var slot_index = this.length;
  this.length = this._body.length;
  return slot_index;
}


ProtoBuilder.fill_slot = function( index, msg ){
// Insert where a .slot() was previously allocated
  if( index > this.length ){
    trace( "BUG? Builder::fill_slot() past the end", index, this.length );
    index = this.length;
    debugger;
  }
  if( this._body[ index ] !== "" ){
    trace( "BUG? Builder::fill_slot() not empty", index );
    debugger;
  }
  // Fast case
  if( arguments.length === 2  ){
    if( !msg )return this;
    if( !this._body[ index ] ){
      this._body[ index ] = msg;
      return this;
    };
  }
  // General case
  var buf = "";
  var len = arguments.length;
  var v;
  for( var ii = 1 ; ii < len ; ii++ ){
    v = arguments[ ii ];
    if( !v )continue;
    buf += v;
  }
  // Insert buf at index
  this._body.splice( index, 0, buf );
  this.length = this._body.length;
  return this;
};


ProtoBuilder.head = function( set ){
  if( set ){ this._head = set; }
  return this._head;
};


ProtoBuilder.body = function( set ){
  if( set ){ 
    this._body = [ "", "" ];
    this.concat( arguments );
  }
  return this.join();
};


ProtoBuilder.error = function( /* ...body */ ){
  this.set( ui.page_style( "error" ) );
  return this.concat( arguments );
};


ProtoBuilder.open_div = function( id, attrs, hide ){
  if( id ){
    if( attrs ){
      this.push( '\n<div id="' + id + '" ' + attrs + '>\n' );
    }else{
      this.push( '\n<div id="' + id + '">\n' );
    }
  }else{
    this.push( '\n</div>\n' );
  }
  return hide ? this.hide_button() : this;
};


ProtoBuilder.close_div = function(){
  return this.push( '\n</div>\n' );
};


ProtoBuilder.hide_button = function(){
  return this.push( '<div class="hide_button"></div>' );
};


ProtoBuilder.br = function(){
  return this.push( '\n<br>\n' );
}


ProtoBuilder.h2 = function(){
  return this.push( '<h2>' ).concat( arguments ).push( '</h2>' );
};


ProtoBuilder.h3 = function(){
  return this.push( '<h3>' ).concat( arguments ).push( '</h3>' );
};


ProtoBuilder.em = function(){
  return this.push( '<em>' ).concat( arguments ).push( '</em>' );
};


ProtoBuilder.de_em = function(){
  return this.push( '<dfn>' ).concat( arguments ).push( '</dfn>' );
};


ProtoBuilder.script = function(){
  return this.push( '\n<script>' ).concat( arguments ).push( '</script>\n' );
};


ProtoBuilder.push_help = function( flag ){
  if( !flag ){
    // Hide any help message that may still exist on the page
    this.script( '$(".help").hide()' );
    return;
  }
  if( flag === true )return;
  if( !this.hide_help_was_pushed ){
    this.push( '<span id="help" class="help">' );
    this.push(
      " ", link_to_command( "help_toggle", icon( "hide" ) ), " "
    );
    this.hide_help_was_pushed = 1;
  }else{
    var nhelp = this.hide_help_was_pushed;
    this.push( '<span id="help_', nhelp, '" class="help">' );
    this.hide_help_was_pushed = nhelp + 1;    
  }
  this.concat( arguments );
  this.push( '</span>' );
  return this;
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

// Router for &page=xxxx type of requests
var http_repl_pages = {
  help:         page_help,
  login:        page_login,
  signout:      page_signout,
  twitter:      page_twitter,
  twitter2:     page_twitter,
  domain:       page_domain,
  visitor:      page_visitor,
  persona:      page_persona,
  delegations:  page_delegations,
  delegates:    page_delegates,
  groups:       page_groups,
  propositions: page_propositions,
  offline:      page_propositions,
  tags:         page_propositions,
  votes:        page_votes,
  ballot:       page_ballot,
  ballot2:      page_ballot2,
  propose:      page_propose,
  propose2:     page_propose2,
  badges:       page_badges,
  vote:         page_badge,
  badge:        page_badge,
  votebadge:    page_badge
};

ui.register_page = function( name, f ){
  http_repl_pages[ name ] = f;
}


var printnl; // from ui1http.js
var cls;
var pn;
var get_query;
var set_head;
var set_body;


function page( name ){
// this is the entry point for all html pages. It's a kind of router.

  var session = Session.current;

  // Check that Ephemeral current machine matches the session's one
  if( Ephemeral.Machine.current !== session.machine ){
    trace(
      "BUG? the current Ephemeral machine " + Ephemeral.Machine.current,
      "is not the session's one: " + session.machine
    );
    session.machine.activate();
  }

  // In some weird cases, there is a / at the end of the page name...
  // ToDo: investigate this issue
  if( name ){
    name = name.toLowerCase().replace( /[^a-z0-9]/g, "" );
  }else{
    name = "";
  }
  
  var f = name && http_repl_pages[ name ];
  
  // Will parse filter for extra parameters
  var args   = as_array( arguments );
  var params = as_array( arguments );
  
  // No valid name => domain
  // ToDo: that's not the good place to do this. Because it won't start the
  // domain if it is not started already. Whereas ?kudo= detected in
  // ui1http.js do starts the domain.
  // Nota: this is not an issue for domains bound to a Twitter application
  // because those domains are auto started at startup time.
  if( !f ){
    var is_domain = false;
    if( args.length === 1 ){
      // If this is a new domain, redirect to it
      // Don't do it if ?kudo= was in the query, it was done already
      if( !session.request.kudo_query.kudo ){
        var current_machine = Ephemeral.Machine.current;
        Ephemeral.Machine.main.activate();
        var persona = Persona.find( "@" + name );
        is_domain = persona && persona.is_domain();
        current_machine.activate();
      }
    }
    if( is_domain ){
      session.set_domain( name );
    }else{
      trace( "BUG? invalid page", name );
      // for( name in http_repl_pages ){
      //  printnl( name );
      // }
    }
    // Patch the args to pretend it is the index page that is required
    args[ 0 ] = params[ 0 ] = name = "index";
    f = http_repl_pages[ name ];
  }
  
  var result = new ui.Builder();
  ui.Builder.current = result;
  result.set_session( session );
  
  // If page does not handle all arguments itself, handle filter params
  if( f.length ){
    // Extra parameters are filter parameters (including sort options)
    if( params.length > f.length ){
      Session.current.set_filter( params.slice( f.length ).join( " " ) );
      params = params.slice( 0, f.length );
    // Lack of extra parameters means current filter remains identical
    // Note: dummy "all" parameter clears the filter
    }else{
      var full_query = result.session.full_query();
      if( full_query ){
        args.push( full_query );
      }
    }
  }
  
  session.previous_page = session.current_page;
  session.set_current_page( args );
  session.page_is_headless = false; // magic loader fragments related
  
  try{
    f.apply( result, params );
  }catch( err  ){
    console.error( err, err.stack );
    result.push( trace( "Page error", name, err, err.stack ) );
  }
  
  // Tell http server about the result
  set_head( result.head() );
  set_body( result.body() );
  
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


Session.prototype.redirect = function( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !this.response )return;
  if( page && page[ page.length - 1 ] === "/" ){
    trace( "BUG? bad trailing / in", page );
    debugger;
    page = page.substring( 0, page.length - 1 );
  }
  var r = "?kudo=" + this.domain_label();
  if( !page ){
    r += "&page=index";
  }else{
    // Note: / does not need encoding, and it's ugly when encoded
    if( page.substring( 0, "cmd ".length ) === "cmd " ){
      page = page.substring( "cmd ".length );
      r += "&i=";
    }else{
      r += "&page=";
    }
    r += querystring.escape( page )
    .replace( /%2F/g, "/" ).replace( /%20/g, "/" );
  }
  
  this.response.fast_redirect = r;
};


ProtoBuilder.redirect = function( page ){
// Go to the specified page. Keep current page's parameters.
  this.session.redirect( page );
};


Session.prototype.redirect_back = function( n, text ){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming, ie to stay on the same page.
// 'n' is number of parameters of the current page to copy into the target.
// Note: first parameter is name of target page. Copy all if 'n' unspecified.
// When 'n' is negative, it means to keep all parameters but the 'n' last ones.
// 'text' is some text to add to build the target url.

  var page = this.current_page;
  if( !page || !page.length )return this.redirect( "main" );
  
  // Get the string name of the current page
  var page_name = page[ 0 ];

  // Never go back to "login" or "twitter", to avoid some rare loops
  if( page_name === "login" || page_name === "twitter" )
  return this.redirect( "main" );
  
  // When going back to the index page, go to the "main" version of it
  if( !page_name ){
    page = page.slice();
    page[ 0 ] = "main";

  // When going back to page "delegates" keep the optional focused proposition
  }else if( page_name === "delegates" && n === 1 ){
    n = 2;

  // When going back to page "votes", keep the all/comments flag
  // ToDo: the page itself should tell about how many parameters to keep
  }else if( page_name === "votes" && n === 1 ){ 
    n = 2;

  // When going back...
  }else if( page_name === "visitor" && n === 1 ){
    n = 2;
  
  // When going back...
  }else if( page_name === "persona" && n === 1 ){ n = 3; }
  
  var target;
  
  // Adjust n when negative, to keep all but last 'n' parameters
  if( n && n < 0 ){
    n = page.length + n;
  }
  
  // Copy current into target. if 'n', copy the first 'n' parameters only. 
  if( n ){
    target = page.slice( 0, n );
  }else{
    target = page.slice();
  }
  
  if( text ){ target.push( text ); }
  
  this.redirect( target.join( "/" ) );
};


ProtoBuilder.redirect_back = function( n, text ){
  this.session.redirect_back( n, text );
};


/*
 * Diacritics management.
 *   Currently: convert to ASCII.
 *   npm diacritics
 */

var dialess = require('diacritics').remove;


function token( str ){
  var diafree = dialess( str );
  // Turn some chars into _
  var tmp = diafree.replace( / -/g, "_" ).replace( /__/g, "_" );
  if( !tmp )return tmp;
  // Keep only A-Z a-z 0-9 plus _ and special # and @ when in front position 
  var r1 = tmp[ 0 ].replace( /[^A-Za-z0-9_@#]/, "" );
  if( tmp.length === 1 )return r1;
  var r2 = tmp.substring( 1 ).replace( /[^A-Za-z0-9_]/g, "" );
  if( !r2 )return r1;
  if( !r1 )return r2;
  return r1 + r2;
}


/*
 *  Some icons
 */

var icon_cache = map();


var icon = ui.icon = function icon( msg, html_a ){
  
  var icon;
  
  if( msg[0] === "@" ){
    // debugger;
    return msg;
  }
  
  if( msg[0] === "<" ){
    // Already an icon
    icon = msg;
    
  }else{
    icon = icon_cache[ msg ];
    if( icon === undefined ){
      var msg2 = msg[ 0 ] === "#" ? msg.substring( 1 ) : msg;
      var key = "i-" + msg2;
      icon = l( key );
      if( icon[0] === "i" ){
        icon = emoji.table_ascii[ msg2 ];
        if( !icon || icon[ 0 ] !== "<" ){
          icon = l( msg );
        }
      }
      icon_cache[ msg ] = icon;
    }
  }
  
  if( html_a === undefined )return icon;
  
  if( icon !== msg ){

    // If icon is a true icon, not text
    if( icon[ 0 ] === "<" ){
      icon = '&nbsp;<a ' 
      + html_a + ' title="' + l( msg ) + '">' + icon 
      + '</a>&nbsp;';

    // If there is no icon, just text
    }else{
      // Don't duplicate text in tooltip, useless
      var imsg = l( msg );
      if( imsg !== icon ){
        icon 
        = '<a ' + html_a 
        + ' title="' + l( msg ) 
        + '">' + icon + '</a>';
      }else{
        icon 
        = '<a ' + html_a 
        + '>' + icon + '</a>';
      }
    }

  }else{

    var comment;
    if( icon[0] === "#" ){
      comment = Topic.reserved_comment( icon );
    }

    if( comment ){
      icon 
      = '<a ' + html_a + ' title="' + l( comment ) + '">' + icon + '</a>';
    }else{
      icon = '<a ' + html_a + '>' + icon + '</a>';
    }
  }

  return icon;
}


var avatar = ui.avatar 
= function avatar( label, sz ){
  if( label[ 0 ] === "@" ){
    label = label.substring( 1 );
  }
  if( !label )return icon( "help" );
  // Note: +2 is for css defined 1px border
  return sz
  ? '<img src="/avatar/'
    + label
    + '" height="' + ( sz + 2 ) + '" width="' + ( sz + 2 ) + '">'
  : '<img class="avatar" src="/avatar/'
    + label
    + '" height="26" width="26">';
}

var show_on_click = 'onclick="'
+ "$(this.nextElementSibling).removeClass( 'kudo_collapse' ).show();"
// Also render shown twitter widget, if any
+ "$(this.nextElementSibling).find( '.kudo-twitter-hashtag-button' ).addClass( 'twitter-hashtag-button' );"
+ "window.twttr && twttr.widgets.load( this.nextElementSibling );"
+ '"';

var show_next_on_click = 'onclick="'
+ "$(this.parentNode.nextElementSibling).removeClass( 'kudo_collapse' ).show();"
+ '"';


/*
 *  misc html related
 */
 
var item_divs = ui.item_divs 
= function item_divs( style, no_hide ){
  return no_hide
  ? [
    '<div class="even item_' + style + '">',
    '<div class="odd item_'  + style + '">'
  ]
  : [
    '<div class="even item_' + style + '"><div class="hide_button"></div>',
    '<div class="odd item_'  + style + '"><div class="hide_button"></div>'
  ];
}


/*
 *  <a href="...">links</a>
 */
 
var titled = ui.titled
= function titled( link, title ){
// Add a title="xxx" attribute to a <a xxxx link. no i18n.
  if( !title )return link;
  return link.replace(
    "<a ",
    '<a title="' + Wiki.htmlizeAttr( title ) + '" '
  );
}


var tag_comment = ui.tag_comment 
= function tag_comment( tag_name ){
// Return "" or comment associated to tag
  var comment = Topic.reserved_comment( tag_name );
  if( comment )return l( comment );
  var tag_topic = Topic.find( tag_name );
  if( !tag_topic )return "";
  comment = tag_topic.get_comment_text();
  if( !comment )return "";
  if( comment.substring( 0, 5 ) === "i18n " ){
    // Some comments deserve to be translated
    comment = i18n_comment( comment );
  }
  return comment;
}


var link_to_command = ui.link_to_command 
= function link_to_command( cmd, title, html_title ){
  var url_code = querystring.escape( cmd );
  var r = '<a href="?i=' + url_code;
  if( html_title ){
    r += '" title="' + Wiki.htmlizeAttr( html_title );
  }else{
    // Some link react faster on touch device (and prevent touch gesture...)
    var index_sp = cmd.indexOf( " " );
    if( index_sp !== -1 ){
      var verb = cmd.substring( 0, index_sp );
      if( verb === "filter_more" || verb === "filter_less" ){
        r += '" class="fast';
        var tag = cmd.substring( index_sp + 1 );
        var comment = tag_comment( tag );
        if( comment ){
          r += '" title="' + Wiki.htmlizeAttr( comment );
        }
      }
    }
  }
  // Most commands have side effect, they are "actions"
  if( cmd.indexOf( "filter_" ) === -1 ){
    r += '" class="action';
  }
  r += '">' + ( title || cmd ) + '</a>';
  return r;
}


var link_to_wiki = ui.link_to_wiki 
= function link_to_wiki( page, title, no_icon, no_twitter ){
  
  if( !Config.wiki )return "";
  
  var domain = Session.current.domain;
  var is_suvranu = false;
  
  if( domain ){
    // Special case for suvranu
    if( domain === "suvranu" ){
      domain = "";
      is_suvranu = true;
    }else{
      domain += "/";
    }
  }
  
  var img = icon( "wiki" );
  
  var encoded_page;
  var twitter_tag  = "";
  var twitter_user = "";
  
  // #tags are inside the domain local wiki, #xxx becomes tag_xxxx
  if( page[ 0 ] === "#" ){
    twitter_tag = page.substring( 1 );
    encoded_page = domain + "tag_" + twitter_tag;
    
  // @user are inside the global wiki
  }else if( page[ 0 ] === "@" ){
    twitter_user = page;
    encoded_page = page;
    
  // words are inside the domain local wiki
  }else{
    
    if( SW.wikiword.test( page ) ){
      // Kudoxxxx word are, however, inside the global wiki
      if( "Kudo" === page.substring( 0, 3 ) ){
        encoded_page = page;
        twitter_tag = page;
      }else{
        encoded_page = domain + page;
        twitter_tag = page;
      }
      
    // Not a wiki word? turn it into one, using #xxx syntax when possible
    }else{
      
      if( SW.wikiword.test( "#" + page ) ){
        twitter_tag = page;
        encoded_page = ( is_suvranu ? "" : "tag_" ) + page;
        
      }else{
        // Humm... should not happen
        trace( "BUG? cannot wikinamize", page );
        // Get rid of invalid characters, slightly brutal...
        encoded_page = dialess( page ).replace( /[^A-Za-z_0-9]/g, "" );
        // If nothing remain, use [x] where x is number of char in initial name
        if( !encoded_page ){
          encoded_page = "[" + page.length + "]";
        // Or else, use #xxx where xxx are non problematic chars
        }else{
          twitter_tag = encoded_page;
          encoded_page = "tag_" + encoded_page;
        }
      }
      encoded_page = domain + encoded_page;
    }
  }
  
  var href = Config.wiki + encodeURI( encoded_page );
  
  // ToDo: share authentication with simpliwiki
  // ToDo: encrypt somehow
  var visitor = Session.current.authentic && Session.current.visitor;
  href += "?kudocracy=" + Session.current.wiki_context();
  
  // Special case for suvranu
  if( is_suvranu ){
    href = "https://suvranu.frama.wiki/" + encodeURI( encoded_page );
  }
  
  var r;
  if( !title ){
    r = '<a class="wiki" title="Wiki" href="' + href + '">' + img + '</a>';
  }else{
    r = '<a class="wiki" title="Wiki" href="' + href + '">' 
      + title + ( no_icon ? "" : " " + img ) 
    + '</a>';
  }
  
  // Add a link to some twitter relevant stuff
  if( !no_twitter ){
    if( twitter_tag ){
      r += " " + link_to_twitter_tag( twitter_tag, " " );
    }
    if( twitter_user ){
      r += " " + link_to_twitter_user( twitter_user, " " );
    }
  }
  return r;
}


var link_to_wiki_icon = ui.link_to_wiki_icon 
= function link_to_wiki_icon( wiki_word ){
  return '<small>' + link_to_wiki( wiki_word, "", false, true ) + '</small>';
}


var persona_alias = ui.persona_alias 
= function persona_alias( persona, dflt ){
  if( arguments.length < 2 ){
    dflt = !persona ? "" : persona.short_label();
  }
  if( !persona )return dflt;
  var alias = persona.get_alias();
  if( alias === "@undefined" )debugger;
  if( alias )return alias.substring( 1 ); // No leading @
  var twitter_user = TwitterUser.find( persona.label );
  if( !twitter_user )return dflt;
  if( !twitter_user.twitter_user_data )return dflt;
  var twitter_alias = twitter_user.twitter_user_data.name;
  if( !twitter_alias )return dflt;
  persona.set_volatile_alias( "@" + twitter_alias );
  return twitter_alias;
}


var persona_long_label = ui.persona_long_label 
= function persona_long_label( persona ){
// Return either label without @ or alias + label with @.
// "" for void persona.
  if( !persona )return "";
  var alias = persona.get_alias();
  if( !alias )return persona.short_label();
  return alias.substring( 1 ) + " " + persona.label;
}


var persona_short_label = ui.persona_short_label 
= function persona_short_label( persona ){
// Return either label or alias, without @
// "" for void persona.
  if( !persona )return "";
  var alias = persona.get_alias();
  if( !alias )return persona.short_label();
  return alias.substring( 1 );
}


var link_to_page = ui.link_to_page 
= function link_to_page( page, value, title, anchor ){
  
  var session = Session.current;
  
  var url_code;
  var adjusted_title = title;
  
  var is_index = ( page || "index" ) === "index";
  if( is_index ){
    page = "";
    if( !adjusted_title ){
      adjusted_title = '<strong>Kudo<em>c</em>racy</strong>';
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
  
  if( !adjusted_title ){
    var value_sp_idx = value.indexOf( " " );
    if( value_sp_idx !== -1 ){
      adjusted_title = value.substring( 0, value_sp_idx );
    }else{
      adjusted_title = value;
    }
  }
  
  // Translate some hashtags
  if( adjusted_title[0] === "#" && adjusted_title.indexOf( " " ) !== -1 ){
    adjusted_title = adjusted_title.replace( /#[a-z_0-9]+/gi, function( tag ){
      return l( tag );
    });
  }
  
  if( url_code && url_code[0] !== "/" ){
    url_code = "/" + url_code;
  }
  
  page = encode_ref( page );
  
  if( Config.offline_support ){
    url_code += "&time=" + l8.update_now();
  }
  
  if( anchor ){
    url_code += "#" + anchor;
  }
  
  // For @name, inject link to twitter profile and potential alias
  if( ( page === "persona" || page === "visitor" )
  &&  adjusted_title[0] === "@"
  ){
    var user = adjusted_title;
    if( user.length <= 1 && value[0] === "@" ){
      user = value;
    }
    var idx_sp = user.indexOf( " " );
    if( idx_sp !== -1 ){
      user = user.substring( 0, idx_sp );
    }
    if( user.length <= 1 )debugger;
    var persona = Persona.find( user );
    var profile 
    = '<a href="http://twitter.com/intent/user?screen_name='
    + user.substring( 1 )
    + '" title="twitter '
    + persona_long_label( persona ) 
    + '">'
    + avatar( user )
    + '</a>';
    if( title === "@" )return profile; //  + " ";
    // Use optional alias, unless title was initially specified
    if( !title ){
      var alias = persona && persona_alias( persona );
      if( alias ){
        adjusted_title = adjusted_title.replace( user, function(){
          // profile += "&nbsp;";
          //alias + " <dfn>(" + user + ")</dfn>"
          //"<dfn>@" + user + "</dfn>" + 
          return alias;
        });
      }
    }
    return profile
    + '<a class="name" href="?kudo=' + session.domain_label()
    + '&page=' + page + url_code + '">'
      + adjusted_title
    + '</a>';
  }
  
  if( is_index )return '<a href="/">' + adjusted_title + '</a>';
  
  return '<a href="?kudo=' + session.domain_label() 
  + '&page=' + page + url_code + '">' + adjusted_title + '</a>';
  
}


var link_to_proposition_page = ui.link_to_proposition_page
= function link_to_proposition_page( proposition, title ){
  if( !proposition )return "";
  var name = typeof proposition === "string" ? proposition : proposition.label;
  return link_to_page( "proposition", name, title || l( name ) );
}


var link_to_persona_page = ui.link_to_persona_page 
= function link_to_persona_page( persona, title ){
  if( !persona )return "";
  if( typeof persona === "string" ){
    persona = Persona.find( persona );
    if( !persona )return "";
  }
  return link_to_page( 
    "persona",
    persona.label + " all",
    title
  );
}


var link_to_delegation_page = ui.link_to_delegation_page 
= function link_to_delegation_page( agent, tags ){
  
  if( !agent )return "";
  
  var proposition = "all";

  // If agent is not a string, then it is a delegation entity or a vote entity
  if( typeof agent !== "string" ){
    // Unless it is a vote
    var delegation = agent;
    var vote = Vote.valid( agent );
    if( vote ){
      delegation = vote.delegation();
      proposition = vote.proposition.label;
      if( delegation === Vote.direct )return "";
    }
    if( Delegation.valid( delegation ) ){
      agent = delegation.agent.label;
      tags  = delegation.tags_string();
    }else{
      agent = l( "delegation" );
      tags  = "";
    }
  }

  if( !tags ){
    tags = "";
  }

  var msg;
  var visitor = Session.current.visitor;

  if( true || !visitor ){
    msg = link_to_page( "delegates", proposition + " " + tags, l( tags ) );
  }else{
    msg = link_to_page( "delegations", tags, l( tags ) );
  }
  return '<nobr>' + l( "via" ) + '&nbsp;'
  + link_to_page( "persona", agent + " all " + tags )
  + "&nbsp;" + msg
  + '</nobr>';
}


var link_to_twitter_user = ui.link_to_twitter_user
= function link_to_twitter_user( user, title, no_icon ){
  if( !user )return "";
  var no_aro = user[ 0 ] === "@" ? user.substring( 1 ) : user;
  return '<a href="http://twitter.com/' + no_aro + '">' 
  + ( title ||  user )
  + ( no_icon ? "" : " " + icon( "twitter") ) +'</a>';
}


var link_to_tags = ui.link_to_tags
= function link_to_tags( tags, title ){
  if( tags.indexOf( " " ) !== -1 ){
    var buf = [];
    tags.split( " " ).forEach( function( tag ){
      if( !tag )return;
      buf.push( link_to_tags( tag ) );
    });
    return buf.join( " " );
  }
  // '<a href="http://twitter.com/search?f=realtime&q=%23'
  // + tags.substring( 1 )
  // + '">#</a>'
  return link_to_proposition_page( tags, ( title || tags ) );
}


var link_to_twitter_filter = ui.link_to_twitter_filter
= function link_to_twitter_filter( query, title, no_icon ){
  return '<a href="http://twitter.com/search?f=realtime&q='
  + querystring.escape( query )
  + '" title="twitter">'
  + ( title || query ) + ( no_icon ? "" : " " + icon( "twitter") ) + '</a>';
}


var link_to_twitter_tag = ui.link_to_twitter_tag 
= function link_to_twitter_tag( tag, title ){
  if( tag[0] === "#" ){
    tag = tag.substring( 1 );
  }
  var msg;
  if( title ){
    msg = title + " " + icon( "twitter" );
  }else{
    if( title === undefined ){
      msg = tag + " " + icon( "twitter" );
    }else{
      msg = icon( "twitter" );
    }
  }
  return '<a target="_blank" href="http://twitter.com/hashtag/' 
  + tag 
  + '">'
  + msg 
  + '</a>';
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


var kudo_signal_capabilities = ui.kudo_signal_capabilities
= function kudo_signal_capabilities( local, now ){
// Client side. Sends a dummy API request to the server so that it can detect
// that javascript is running on the client. If the server does not receive
// such a request, after some delay, it assumes that the client is a "noscript"
// client. Note: the request is not sent immediately because a cookie is
// configured and it will do an equivalent job if any request is issued by
// the client soon enough.
// Also check local storage capabilities, also saved in a cookie.
// If now flag then the request is done with no delay, immediately and it
// contains additional data, including the size of the screen, but only
// when there is a change. This happens when the function is called via
// setInterval().

  if( window.init_http_page_done && !now ){
    console.log( "signal capabilities, already done" );
    return;
  }
  // console.log( "signal capabilities" );

  function supports_local_storage(){
    var kudo_ctx = window.kudo_ctx;
    if( kudo_ctx.can_local_storage )return true;
    if( kudo_ctx.can_local_storage === false )return false;
    // undefine, check it
    var storage;
    try{ // a try is required to avoid a weird bug in some firefox versions
      storage = 'localStorage' in window && window[ 'localStorage' ];
    }catch( e ){}
    kudo_ctx.local_storage = storage;
    kudo_ctx.can_local_storage = !!storage;
    // Hack to update cookied counter asap. See .get_stored_changes() in ui1client.js
    if( storage ){
      var storage_version = storage.change_version;
      // Kill switch based on some version id
      if( storage_version !== "0.2" ){
        storage.clear();
        sessionStorage.clear();
        storage.change_version = "0.2";
      }
      var stored_count = storage.getItem( "change_count_" + kudo_ctx.domain );
      var count = stored_count ? parseInt( stored_count, 10 ) : 0;
      document.cookie = "kudo_change_count=" + count;
    }
    return !!storage;
  }
  
  var ctx = window.kudo_ctx;
  if( !ctx ){
    // This happens on the index page only
    console.info( "Welcome to Kudocracy" );
    window.kudo_ctx = ctx = {};
  }
  if( ctx.session ){
    ctx.session.is_offline = !!local;
  }else{
    ctx.session = { is_offline: !!local };
  }
  if( !!local ){
    console.info( "OFFLINE" );
  }
  
  // session cookies, no max-age

  // Is there some local storage?
  if( ctx.can_local_storage === undefined
  && supports_local_storage()
  ){
    document.cookie = "kudo_can_local_storage=true";
  }
  
  if( ctx.should_clear_local_storage ){
    if( ctx.local_storage ){
      ctx.local_storage.clear();
      document.cookie = "kudo_change_count=0";
      sessionStorage.clear();
      console.info( "Cleared local storage" );
    }
    ctx.should_clear_local_storage = false;
  }
  
  // Also send an ajax request before it's too late
  if( ctx.can_script === "init" || ctx.can_script === (void 0) ){
    if( window.kudo_signal_scheduled ){
      console.warn( "BUG? duplicate 'can script' signal schedule" );
      debugger;
    }
    ctx.can_script  = "init";
    document.cookie = "kudo_can_script=true";
    setTimeout( function(){
      // Unless not needed anymore
      if( window.kudo_ctx.can_script === true )return;
      if( window.kudo_ctx.can_script === false ){
        console.warn( "BUG? invalid script in noscript mode" );
        return;
      }
      // Don't do that twice (in the same page)
      window.kudo_ctx.can_script = true;
      if( window.kudo_signal_done ){
        console.warn( "BUG? duplicate 'can script' signal" );
        // debugger;
        return;
      }
      window.kudo_signal_done = true;
      !local && $.ajax({
        url: "/api/Session",
        cache: false,
        success: function( data ) { 
          console.log( "ajax signal can script done" );
        },
        error: function( data ){
          console.warn( "signal can script ajax error", data );
          debugger;
        }
      } );
    }, 30 * 1000 );
  }
  
  if( !now )return;
  
  // True when about to send a request
  var magic_embed = typeof now === "object";
  
  // Let's figure out what is the total height of the window, as we
  // will to make it so that cols x rows of characters fit in it
  var h =  window.innerHeight ? window.innerHeight : $(window).height();
  var w = $(window).width();

  // On iPhone I think that screen.width is more accurate
  if( ctx.touch_device && screen && screen.width ){
    w = Math.min( screen.width, w );
  }

  // Remember that because I needed it somewhere else
  ctx.screen_width  = w;
  ctx.screen_height = h;
  
  // Don't be noisy
  if( !ctx.can_local_storage && !magic_embed )return;
  
  // Restore value from storage, ie it survives a page (re)load
  if( !window.kudo_signaled_screen_width && !magic_embed ){
    window.kudo_signaled_screen_width
    = parseInt( sessionStorage.kudo_signaled_screen_width,  10 ) || 0;
    window.kudo_signaled_screen_height
    = parseInt( sessionStorage.kudo_signaled_screen_height, 10 ) || 0;
  }
  
  // First signal is embedded into a magic request, to avoid some traffic
  if( !window.ui1_server && !ctx.signaled_screen_width && !magic_embed )return;
  
  if( magic_embed ){
    // console.log( "Magic, capabilities check" );
  }

  // Don't signal to remote server if no change
  var time_now = (new Date()).getTime();;
  if( now !== "force" ){
    if( !window.ui1_server ){
      if( window.kudo_signaled_screen_width  === ctx.screen_width 
      &&  window.kudo_signaled_screen_height === ctx.screen_height
      )return;
      if( !magic_embed && ctx.time_last_capabilities ){
        var delta = time_now - ctx.time_last_capabilities;
        // Don't signal now if did signal less than 300 ms ago
        if( delta < 300 )return;
      }
    }
    console.log( 
      "Capabilities changes", ctx.screen_width, "x", ctx.screen_height
    );
  }
  
  // Don't signal until it stops changing for 100 ms (that's setInterval()'s)
  // ToDo: that 100 ms stuff does not work anymore, embed sends only right now
  if( !window.kudo_sampled_screen_width
  ||  ctx.screen_width  != window.kudo_sampled_screen_width
  ||  ctx.screen_height != window.kudo_sampled_screen_height
  ){
    window.kudo_sampled_screen_width  = ctx.screen_width;
    window.kudo_sampled_screen_height = ctx.screen_height;
    // Unless magic loader can embed the change
    if( !magic_embed )return;
  }
  
  var data = {
    screen_width:  ctx.screen_width,
    screen_height: ctx.screen_height,
    touch_device:  ctx.touch_device
  };
  
  console.log( "Signaling capabilities change" );
  ctx.time_last_capabilities = time_now;
  console.log( 
    "was", window.kudo_signaled_screen_width, "x", window.kudo_signaled_screen_height,
    "now", ctx.screen_width         , "x", ctx.screen_height
  );
  window.kudo_signaled_screen_width  = ctx.screen_width;
  window.kudo_signaled_screen_height = ctx.screen_height;
  
  // Save to storage, so that it survives a page load
  sessionStorage.kudo_signaled_screen_width  = ctx.screen_width;
  sessionStorage.kudo_signaled_screen_height = ctx.screen_height;
  
  // No need to signal "can_script" if not done yet
  window.kudo_signal_done = true;
  
  // Encode data to send, query style
  var json_data = JSON.stringify( data );
  var encoded_json_data = encodeURIComponent( json_data );
  
  // When called by magic loader, use the request to send new capabilities
  if( magic_embed ){
    console.log( "Embed capabilities" );
    now.capabilities = true;
    now.data         = data;
    now.uri_encoded  = encoded_json_data;
    return;
  }
  
  // Else, send a distinct /api/Session request, either to local app or ajax
  var url = "/api/Session?capabilities=" + encoded_json_data;
  if( window.ui1_server ){
    window.ui1_server(
      {
        method: "GET",
        url: url,
        query: { capabilities: encoded_json_data },
        headers: {
          "x-forwarded-for":  "127.0.0.1",
          "user-agent":       window.navigator.userAgent
        }
      },
      { writeHead: function(){}, end: function(){} }
    );
  }else{
    !local && $.ajax( { url: url, cache: false } );
  }
  
}


ProtoSession.context = function( wiki ){
// Some elements of the session context are shared between Kudocracy and
// SimpliWiki. Only Kudocracy needs the full context.

  var full = !wiki || undefined;
  
  var stored;
  if( full ){
    // When this code runs server side, client provides hints about changes
    stored = this.get_cookie( "change_count" );
    stored = parseInt( stored || "0", 10 ); // 0 when this runs client side
  }
  
  return {
    time: l8.update_now(),
    debug_mode:    full && de,
    // System level
    config:        full && Config,
    visitor:       ( this.visitor && this.visitor.label ), // A string
    authentic:     this.authentic,
    domain:        full && this.domain, // false for "main" domain
    filter:        full && this.full_query(),
    can_script:    this.can_script, // Can be "init", at first
    can_local_storage: full && this.can_local_storage,
    should_clear_local_storage: full && this.should_clear_local_storage,
    is_slim:       full && this.is_slim, // When "slim", no magic loader, pure http
    is_novice:     full && this.is_novice,
    lang:          this.lang,
    auto_lang:     full && this.auto_lang,
    // Page level
    page_id:       full && this.page_id,
    page_title:    full && this.page_title,
    host:          this.host,
    url:           full && this.url,
    current_page:  full && this.current_page,
    previous_page: full && this.previous_page,
    scroll_to:     full && this.scroll_to,
    // Ephemeral machine changes
    changes:       full && this.pull_changes( stored )
  };
};


ProtoSession.wiki_context = function(){
// Returns an URI encoded JSON context that SimpliWiki expects
  var ctx = this.context( true );
  var json_str_ctx = JSON.stringify( ctx );
  var uri_ctx = encodeURIComponent( json_str_ctx );
  return uri_ctx;
}


Session.prototype.configScript = function(){
// Client side setup, dynamic, different for each page

  // Build a context sent to the client (to the "consumer" that is)
  var ctx = this.context();
  
  // Some bug checking, defensive style
  if( this.is_app ){
    if( !ctx.changes ){
      if( l8.server ){
        trace( "BUG? is_app but no changes" );
        debugger;
        this.is_app = false;
      }
    }else if( ctx.changes === "offline" ){
      trace( "BUG? changes is 'offline" );
      debugger;
    }
  }
  
  if( this.url.indexOf( "offline" ) !== -1 ){
    console.info( '"offline" detected in page url' );
    // Hack to patch changes into constant "offline" for detection by client
    if( ctx.changes !== "offline" ){
      console.log( "Set offline flag about changes" );
    }
    ctx.changes = "offline";
  }
  
  // Assume client will clear as instructed (... in ctx object, see before)
  if( this.should_clear_local_storage ){
    this.should_clear_local_storage = false;
  }
  
  function kudo_init_ctx( ctx ){
    
    // This code runs in every page, including magic loaded ones.
    var now = (new Date()).getTime() + ( ctx.time_offset || 0 );
    
    // Get what configScript() inserted in the html content
    window.kudo_ctx = ctx;
    var url = ctx.url;
    console.log( "Init context for", url );
    
    // And now, complex logic to avoid caches.
    // This is mainly to avoid offline app logic where the browser prefers
    // to load from app cache EVEN when the network is available...
    var idx_time = url.indexOf( "time=" );
    var was_timeless = idx_time === -1;
    var timeless_url;
    if( was_timeless ){
      timeless_url = url;
    }else{
      timeless_url = url.substring( 0, idx_time - 1 );
    }
    ctx.url = timeless_url;
    ctx.time_offset = now - ctx.time;
    console.info( "Time offset (net delay, unless cached)", ctx.time_offset );
    // console.info( "url", url );
    // console.log( "timeless url", timeless_url );
    if( ctx.time_offset > 1 * 60 * 1000 ){
      console.warn( "anormal delay, probably cached somewhere, refresh" );
      if( ctx.time_offset > 24 * 3600 * 1000 ){
        // 24 hours old, don't ask, refresh
        window.kudo_new_location = timeless_url;
        return;
      }else{
        var delay_msg
        = ctx.time_offset > 3600 * 1000
        ? "(" + ( ctx.time_offset / ( 3600 * 1000 ) ) + " hours)"
        : "(" + ( ctx.time_offset / 1000 ) + " seconds)";
        var ok_old;
        try{ ok_old = window.sessionStorage.kudo_ok_old_pages; }catch(_){}
        if( !ok_old && window.confirm(
          "Old " + delay_msg + ". Refresh?"
        )){
          console.warn( "reload at timeless location" );
          window.kudo_new_location = timeless_url;
          return;
        }
        try{ window.sessionStorage.kudo_ok_old_pages = "true"; }catch(_){}
      }
    }
    
    // If local clock is late compared to server's one
    if( ctx.time_offset < -30 * 1000 ){
      var ok_clock;
      try{ ok_clock = window.sessionStorage.kudo_ok_clock_drift; }catch(_){}
      // Local clock say 8:23:40 when server's one says 8:23:51, ie it's late
      if( !ok_clock && window.confirm(
        "Clock"
        + " " + ( ctx.time_offset / 1000 ) + " sec. Refresh?"
      )){
        window.kudo_new_location = timeless_url;
        return;
      }
      // User is OK with clock offset
      try{ window.sessionStorage.kudo_ok_clock_drift = "true"; }catch(_){}
    }
    
    // Avoid cached pages. ToDo: quid clock desync between client & server?
    if( !window.kudo_time_last_page ){
      try{
        window.kudo_time_last_page
        = parseInt( localStorage.kudo_time_last_page || "0", 10 );
        window.kudo_last_page
        = localStorage.kudo_last_page;
      }catch(_){}
    }
    if( window.kudo_time_last_page && window.kudo_time_last_page > ctx.time ){
      // But does the time_offset correct this?
      var corrected_time_last_page
      = window.kudo_time_last_page + ctx.time_offset;
      var age = corrected_time_last_page - ctx.time;
      if( age > 10 * 1000 ){
        console.warn(
          "Out of order page, probably cached somewhere, refresh?. age ", age,
          "last page:", window.kudo_last_page,
          "url:", ctx.url
        );
        debugger;
        //window.kudo_new_location = timeless_url;
        //return;
      }
      console.warn( "Ignored potential older page case, age:", age );
    }
    var age_old = now - ctx.time;
    if( age_old > 1 * 60 * 1000 ){
      if( age_old > 24 * 3600 * 1000 ){
      console.warn( "1 day old page, probably cached somewhere, reload" );
        window.kudo_new_location = timeless_url;
        return;
      }
      console.warn( "1 minute old page, probably cached somewhere, refresh?" );
      if( window.confirm( "Old. Refresh?" ) ){
        window.kudo_new_location = timeless_url;
        return;
      }
    }
    
    // OK. Here we are. Let's remember the new time for the last handled page
    try{
      localStorage.kudo_time_last_page = window.kudo_time_last_page = ctx.time;
      localStorage.kudo_last_page = timeless_url;
    }catch(_){}
    
    // Let's the debug flag propagate from the server to the client
    window.de = true; // ctx.debug_mode;
    window.nde = false;
    
    // ToDo: define a bug() that logs on the server
    window.bugC = function(){ console.log.apply( console, arguments ); };
    
    // Manage url navigation using browser's history API, when available
    try{
      window.history.replaceState( ctx.url, ctx.page_title, ctx.url );
      // console.log( "Page " + ctx.page_title );
    }catch( err ){
      console.warn( "Kudocracy: can't use history.replaceState()", err, err.stack );
      ctx.can_history = false;
      // ToDo: signal to server that client cannot use history
    }
    
    if( ctx.can_local_storage ){
      ctx.local_storage = window.localStorage;
      if( ctx.should_clear_local_storage ){
        ctx.should_clear_local_storage = false;
        ctx.local_storage.clear();
        document.cookie = "kudo_change_count=0";
        sessionStorage.clear();
        console.info( "Clear local storage" );
      }
    }
    
    // If needed, tell server about what the client is capable of
    var offline = false;
    
    // Unless ctx was built by special ?page=offline served by app cache
    if( ctx.changes === "offline" ){
      // In that case, we are either offline or the server is down
      offline = true;
      console.info( '"offline" change detected in context' );
      // Set a global flag to remember that page comes from the local appcache
      window.kudo_offline_loader = true;
    }
    
    // Unless ctx comes from cached ?page=offline, do check connectivity
    if( !offline ){
      // If offline is detected, it probably means that the page was local
      try{ offline = !navigator.onLine; }catch(_){}
    }
    
    // Unless we're offline, let's contact server, unless done before
    kudo_signal_capabilities( offline );
    
    // The fun part starts
    window.kudo_ready = true;
  }
  
  // Encode ctx and ask client/consumer side to invoke kudo_init_ctx()
  return new ui.Builder(
    '\n<script type="text/javascript">',
     !this.magic_loader && kudo_signal_capabilities,
     "\n" + kudo_init_ctx,
     "\n kudo_init_ctx(", json_encode( ctx ), ');',
    '\n</' + 'script>\n'
  );
  
};


Session.prototype.htmlScript = function( javascript, not_async ){
// Called while building an HTML page.
// "javascript" is either a Function object or a string.
// Returns HTML text for javascript code, either inlined or src referenced.
// src is for static code only, not variable code.

  // I support client without any javascript, sounds crazy these days...
  if( !javascript || javascript === "" || !this.can_script )return "";

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
  return '\n<script>\n'
  + javascript  // ToDo: some encoding here?
  + '\n</' + 'script>\n';
};


var touchScript = function kudo_css_touch_device( flag ){
// client side. Patches css based on touch device detection
  if( flag === undefined ){
    flag = window.kudo_is_touch_device;
    if( flag === undefined ){
      flag = !!Modernizr.touch;
    }
  }
  window.kudo_is_touch_device = flag;
  document.documentElement.className 
  += ( flag ? " kudo_touch" : "kudo_no_touch" );
}


var hideScript = ui.kudo_hide = function kudo_hide(){
// client side

  function hide_it(){
    var $target = $(this).parent();
    $target.addClass( "was_hidden" ).hide();
    window.kudo_hidden.push( $target[0].id );
    $(".show_button").show();
  }
  
  function show_all(){
    $(".show_button").hide();
    $(".was_hidden" ).removeClass( "was_hidden" ).show();
    window.kudo_hidden = [];
    window.scrollTo( 0, 0 );
  }
  
  function add( selector, on_parent ){
    
    var $all = $(selector);
    if( on_parent ){
      $all = $all.parents();
    }
    // Manage touch 'swipe' to hide divs
    if( $all.flick && kudo_ctx.touch_device ){
      
      // console.log( "Install 'swipe' handler" );
      $all.drag( function( e ){
        if( "vertical" === e.orientation )return;
        // prevent default horizontal scrolling
        e.preventDefault();
        e.stopPropagation();
        var $this = $(this);
        // Freeze size and vertical position
        var width = $this.width();
        // Move content in proper direction
        $this
        .css( "position", "relative" )
        .css( "z-index", "1000" )
        .css( 'left', e.dx + 'px' );
        // When move stops
        if( e.end ){
          // If moved enough, hide
          if( e.adx > width / 4 ){
            if( e.dx < 0 ){
              width = -width;
            }
            $this.animate( 
              { "left": width },
              // { "margin-left": width },
              "fast",
              "linear",
              function(){
                $this
                .addClass( "was_hidden" )
                .hide()
                .css( 'left', '0px' )
                .css( "z-index", "0" )
                $(".show_button").show();
              }
            );
          // Not moved enough, restore initial position
          }else{
            $this.animate(
              { "left": 0 },
              "linear",
              function(){
                $this.css( "z-index", "0" );
              }
            );
          }
        }
      });
    }
  }
  
  add( ".hide_button", true /* on parent */ );
  add( ".even" );
  add( ".odd" );
  
  // New  page
  if( !window.kudo_hidden ){
    window.kudo_hidden = [];
  
  // Updated page, hide what user has hidden previously
  }else{
    window.kudo_hidden.forEach( function( it ){
      $( "#" + it ).addClass( "was_hidden" ).hide();
      $(".show_button").show();
    });
  }
  
  if( $.fn.fast_click ){
    $(".hide_button").fast_click( hide_it );
    $(".show_button").fast_click( show_all );
  }else{
    $(".hide_button").click( hide_it );
    $(".show_button").click( show_all );
  }
  
};


var magicScript = function kudo_magic(){
// Client side
// The code for this function is included by HTML pages.
// It does some init stuff for the page and register additional stuff to init
// once the page is "ready". One important thing that is installed is the
// magic loaded that intercepts all requests to new http page and transform
// such requests either in ajax calls or in calls to a local UI server
// defined in ui1client.js (ie browserified.js). When the request is processed
// locally this is called the "client mode" or the "app mode".

  /*global kudo_ctx, kudo_is_offline*/
  
  var done = window.kudo_init_page_done;
  if( !done ){
    console.log( "Init new HTTP page" );
    window.kudo_init_page_done = true;
  }else{
    console.warn( "BUG? useless double magic include" );
    return;
  }
  var de  = true;
  var nde = false;
  
  var bugC = function(){
    console.log.apply( console, arguments );
  };

  // Define a "magic loader" that loads pages at light's speed.
  window.kudo_magic_loader = function kudo_magic_loader( url, back ){
    // Works only with browsers that support history.pushState()
    // In 2011 I looked at the numbers and I saw that when a page loads, at lot
    // of time spent "parsing" jQuery & co. About 300ms on my machine. In an
    // attempt to avoid that, I experimented with an alternative page loader
    // that requests a page using ajax and rebuilt the body of the current page.
    // Because the new body reuse the old head, all the scripts that were
    // loaded before (and parsed) are still available for the new page.
    // The html page that I load defines kudo_ctx where basically everything
    // about the current page is stored. As a result there is little to no
    // issue with global variables (that you would normally expect to be
    // undefined but that now remember whatever content they had when the
    // previous page was loaded).
    // Note: that was 2011, in SimpliWiki, in 2015 browsers are smart enought
    // to avoid reparsing jQuery.
    // See also https://github.com/defunkt/jquery-pjax
    
    console.log( "Magic loader", url );
    if( !url )return true;
    
    var time_started = (new Date()).getTime();

    var query_idx = url.indexOf( "?" ); 
    
    // Look for capabilities changes, including screen size
    var target_url = url;
    var capa_change = {};
    kudo_signal_capabilities( false, capa_change );
    // Inject capabilities change, as determined by signal_capabilities()
    if( capa_change.capabilities ){
      if( query_idx !== -1 ){
        target_url += "&capabilities=" + capa_change.uri_encoded;
      }else{
        target_url +="?capabilities=" + capa_change.uri_encoded;
      }
    }

    var path = url;
    
    // Extract potential anchor. Will jump to it
    var anchor;
    path = path.replace( /#[a-z_0-9]+$/, function( match ){
      anchor = match.substring( 1 );
      return "";
    });

    // Extract query string
    var query_str = "";
    if( query_idx !== -1 ){
      query_str = path.substring( query_idx + 1 );
      if( query_idx > 0 ){
        path = path.substring( 0, query_idx );
      }else{
        path = "";
      }
    }
    
    // External links open in a new window
    var current_path = window.location.href;
    
    // Ignore ? query parameters for the comparison
    query_idx = current_path.indexOf( "?" );
    if( query_idx > 0 ){
      current_path = current_path.substring( 0, query_idx );
    }
    // Remove potential trailing /
    path = path.replace( /\/+$/, "" );
    current_path = current_path.replace( /\/+$/, "" );
    
    // If new url is in a different domain, open in new window, unless ...
    var external  = false;
    
    // If no http:// in new path, it is not external
    var idx_sep = path.indexOf( "://" );
    if( idx_sep !== -1 ){
      // Ignore :80 port
      path = path.replace( ":80/", "/" );
      current_path = current_path.replace( ":80/", "/" );
      // Extract host parts
      var host1, host2;
      path.replace( /(^https?:\/\/[^\/]*)/, function( m ){
        host1 = m;
      });
      current_path.replace( /(^https?:\/\/[^\/]*)/, function( m ){
        host2 = m;
      });
      // If same host then it is not an external link
      if( host1 !== host2 ){
        external = true;
      }
    } 
    
    if( external ){
      
      // Unless it is a twitter web intent
      if( path.indexOf( "twitter" ) !== -1
      &&  path.indexOf( "intent"  ) !== -1
      ){
        console.log( "No magic, load in Twitter popup", path );
        return false;
      }
      
      // ToDo: offline mode
      
      var $iframe_div;
      var is_wiki = url.indexOf( "kudocracy=" ) !== -1;
      var is_new_window = url.indexOf( "#" ) !== -1;
      
      // Let's put simpliwiki links into an iframe, if there is a large one
      if( is_wiki
      &&  !is_new_window
      && ( $iframe_div = $("#kudo_iframe_div") )
      && kudo_ctx.screen_width > 640
      ){
        
        // Set the handler to resize when embedded content asks, once
        if( !window.kudo_message_listener )
          
          window.kudo_message_listener = window.addEventListener( 'message', 
            
            function( e ){
          
              window.kudo_message_event = e;
              var event_name = e.data[0];
              var data = e.data[1];
              
              console.log( "iframe message", event_name );
              
              switch( event_name ){
                
                case "kudo_height":
                  var $iframe_div = $( "#kudo_iframe_div" );
                  var current_height = $iframe_div.height();
                  var candidate_height = Math.max( kudo_ctx.screen_height, data );
                  if( candidate_height > current_height ){
                    console.log( "Set height based on iframe content", data );
                    $iframe_div.height( candidate_height );
                  }
                  $iframe_div.show();
                break;
                
                case "kudo_scroll":
                  window.scrollTo( 0, 0 );
                break;
                
                case "kudo_load":
                  console.log( "Kudocracy. iframe controlled load", data );
                  window.kudo_magic_loader( data )
                break;
              
                case "kudo_script":
                  // Run arbitrary javascript code submitted by post message
                  eval( data, e )
                break;
              }
              
            },
            
            false
          );
        
        // Change href of link to open in new window and load frame content
        $("#kudo_iframe_div a").attr( "href", url + "#" ); // '#' new window
        $("#kudo_iframe").attr( "src", url + "&iframe=true" );
        window.scrollTo( 0, 0 );
        return true;
      }
      
      if( is_wiki && is_new_window ){
        $("#kudo_iframe_div").hide();
      }
      
      console.log(
        "Open in new window.", "current", current_path, "path", path
      );
      window.open( url, is_wiki ? "wiki" : "kudocracy" );
      return true;
    }
    
    $('#tooltip').fadeOut( 0 );
    
    // If resync with server
    if( kudo_ctx.back_online ){
      console.info( "Back to online server" );
      return false;
    }
    
    // Magic load requires history.pushState
    if( !window.history || !window.history.pushState ){
      console.log( "No magic, no window.history.pushState" );
      return false;
    }
    
    // Slim version optimizes the client side memory and I see some
    // memory leaks with the magic loader...
    if( kudo_ctx.is_slim ){
      console.log( "No magic, slim mode" );
      return false; // not loaded
    }
    
    // Home page has a different style, cannot magic load it
    // ToDo: should load it when in offline mode?
    if( !query_str
    ||  url === "/"
    ||  query_str.indexOf( "page=index" ) !== -1
    ){
      console.log( "No magic, home page", query_str );
      return false;
    }
    
    // Login page requires server cooperation, when possible
    if( query_str.indexOf( "page=login" ) !== -1 ){
      // Use a cookie to signal what page the login must get back to when done
      var ui1_server = window.ui1_server;
      if( ui1_server ){
        var cookie_id = "kudo_login_previous_page";
        var cookie_val = encodeURIComponent(
          ui1_server.Session.current.current_page.join( "," )
        );
        var cookie // 120 seconds, transient cookie
        = cookie_id + "=" + cookie_val + ";max-age=120";
        console.log( "set cookie", cookie );
        document.cookie = cookie;
        window[ cookie_id ] = cookie_val;
        cookie_id = "kudo_login_filter";
        cookie_val = encodeURIComponent(
          ui1_server.Session.current.full_query()
        );
        cookie
        = cookie_id + "=" + cookie_val + ";max-age=120";
        console.log( "set cookie", cookie );
        document.cookie = cookie;
        window[ cookie_id ] = cookie_val;
      }
      if( !window.kudo_is_offline || !kudo_is_offline() ){
        console.log( "No magic, back to server for login", kudo_ctx );
        return false;
      }else{
        console.info( "Offline. Login." );
      }
    }
    
    // console.log( "magic loader " + url );
    function jump_to_anchor(){
      if( anchor ){
        var element_to_scroll_to = document.getElementById( anchor );
        if( element_to_scroll_to ){
          var top = element_to_scroll_to.offsetTop;
          top -= $('#header').height() + 2;
          window.scrollTo( 0, top ); 
        }
      }
    }
    
    // Avoid multiple concurrent requests, ignore
    if( window.kudo_magic_busy ){
      console.warn( "Busy magic loader", window.kudo_magic_busy, url );
      return true;
    }
    window.kudo_magic_busy = url;
    
    // Provide more visual feedbacks when using ajax
    if( !window.ui1_server ){
      // Delay it a while to avoid flicker when response is fast enough
      if( window.kudo_progress_timeout ){
        clearTimeout( window.kudo_progress_timeout );
      }
      window.kudo_progress_timeout = setTimeout( function(){
        window.kudo_progress_timeout = null;
        $("#progress_bar").show();
      }, 500 );
    }
    
    // Save previous context, in case a script wants access to it
    window.kudo_previous_ctx = window.kudo_ctx;

    var process_magic_response = function( html, err ){
    // When I get the page, change the html body and do what I normally do
    // with $(document).ready(), simple!
    
      if( window.kudo_progress_timeout ){
        clearTimeout( window.kudo_progress_timeout );
        window.kudo_progress_timeout = null;
      }
      
      window.kudo_magic_busy = null;
      if( err ){
        
        return;
      }
      
      if( !html ){
        console.warn( "BUG? invalid empty response", url, query );
        debugger;
        html = "";
      }
      
      var time_received = (new Date()).getTime();
      
      // Remove itself from response, if present
      html = html.replace(
        /function kudo_magic[\s\S]*?<\/script>/,
        "<" + "/script>"
      );
      
      // Collect scripts that are in the head and body, will run in new body
      var body = "";
      var scripts = "";
      html = html.replace( /<script[\s\S]*?<\/script>/g, function( s ){
        scripts += s;
        return "";
      });
      
      // Add what remains of the body (with all scripts moved to the end)
      html = html.replace( /(<body[\s\S]*)(<\/body>)/, function( _, b, eb ){
        body = b + scripts + eb;
      });
      if( !body ){ body = scripts; }
        
      // Remember where to go "back" (unless already going back)
      if( !back ){
        nde&&bugC( "pushState", window.kudo_ctx.url, window.kudo_ctx.page_title );
        window.history.pushState(
          window.kudo_ctx.url,   // data. onpopstate uses it
          window.kudo_ctx.page_title,
          window.kudo_ctx.url
        );
      }
        
      // Figure out what needs to change, defaults to full body
      var $target;
      
      // If no <body>...</body>, insert fragments and run scripts
      if( body === scripts ){
        
        // First, extract potential fragments
        var dom_fragments = $.parseHTML( html );
        
        // Gather the parsed HTML's node names
        var $main_container = $("body");
        var done = false;
        
        var process_fragments = function( elements, $container ){
          
          if( !elements )return;
          
          var element;
          var new_main = false;
          var len = elements.length;
          
          // HTMLCollection are "live", collect elements before any change
          var fixed_elements = []
          for( var ii = 0 ; ii < len ; ii++ ){
            fixed_elements.push( elements[ ii ] );
          };
          
          for( ii = 0 ; ii < len ; ii++ ){
            element = fixed_elements[ ii ];
            
            if( done )break;
            if( !element )continue;
            
            // Skip plain text, useless
            if( element.nodeName === "#text"
            ||  element.nodeName === "#comment" 
            )continue;
            
            var fragment_id = element.id;
            
            var magic_directive 
            = element.getAttribute && element.getAttribute( "data-magic" );
            
            // Skip?
            if( magic_directive === "skip" )return;
            
            if( magic_directive === "main" ){
              new_main = true;
              magic_directive = "each";
            }
            
            // Recurse inside unamed fragments
            if( !fragment_id ){
              if( element.childElementCount ){
                process_fragments( element.children, $container );
              }
              continue;
            }
            
            de&&bugC( 
              "magic element",
              fragment_id || "anonymous",
              element.nodeName,
              magic_directive || "no directive" 
            );
            
            // Skip?
            if( magic_directive === "skip" )return;
            
            if( magic_directive === "main" ){
              new_main = true;
              magic_directive = "each";
            }
            
            var $fragment = $( "#" + fragment_id );
            
            // If existing fragment
            if( $fragment && $fragment.length ){
              
              if( new_main ){
                $main_container = $fragment;
              }
              
              // Recurse inside "each" magic type of existing fragment
              if( magic_directive === "each" ){
                if( element.childElementCount ){
                  process_fragments( element.children, $fragment );
                }
                continue;
              }
              
              // Ignore "once" fragment if already inserted
              if( magic_directive === "once" ){
                // console.log( "magic skip once", fragment_id );
                continue;
              }
              
              if( magic_directive === "upsert" ){
                $fragment.replaceWith( element );
                console.log( "magic upsert of existing", fragment_id );
                
              }else{
                $fragment.replaceWith( element );
                console.log( "magic replace of", fragment_id );
              }
              
              continue;
            }
            
            // If new fragment

            if( magic_directive === "once" ){
              $ontainer.append( element );
              if( new_main ){
                $main_container = $(fragment_id);
              }
              // console.log( "magic once, insert", fragment_id );
              continue;
            }
            
            if( magic_directive === "upsert" ){
              $container.append( element );
              if( new_main ){
                $main_container = $(fragment_id);
              }
              console.log( "magic upsert of new", fragment_id );
              continue;
            }
            
            if( magic_directive === "update" ){
              // console.log( "magic skip update, not present", fragment_id );
              
            }else{
              // Assume this is a totally different layout, reset all
              $main_container.empty();
              $main_container.append( dom_fragments );
              console.log( "magic reset, due to new", fragment_id );
              done = true;
            }
          };
        };
        
        process_fragments( dom_fragments, $main_container );
        
        // Then run the scripts
        $target = $("#magic_runner");
        // Create it when necessary
        if( $target.length === 0 ){
          $("body").append( '<div id="magic_runner" class="hide"></div>' );
          $target = $("#magic_runner");
        }
        
      }else{
        // Set the new body for the page. It shall reinit a new context
        window.kudo_ctx = null;
        $target = $("body");
      }
      
      try{
        $target.empty().html( body ); // not [0].innerHTML = body;
      }catch( err ){
        console.warn( "Magic loader error with setting target", err );
        debugger;
      }
      
      if( !window.kudo_ctx ){
        window.kudo_ctx = window.kudo_previous_ctx;
        console.warn( "BUG? Magic result could not init kudo context" );
      }else{
        // Get rid of previous context, free memory
        window.kudo_previous_context = null;
      }
      
      // Flag, just in case, when a page wants to know how it got loaded
      window.kudo_is_magic_loaded = true;
      
      // Invoke what is normally bound to $('document').ready()
      window.kudo_when_ready();
    
      // Jump to anchor, if any
      jump_to_anchor();
            
      de&&bugC(
        "total, "
        + ( (new Date()).getTime() - time_started )
        + " msec. "
        + "built&send, "
        + ( time_received - time_started)
        + " msec. "
        + "process, "
        + ( (new Date()).getTime() - time_received )
        + " msec."
      );
    };

    // If current content was "magic loaded", submit request to local UI server
    // Why? it makes the first page appears fast, ie it promotes sharing
    // and then the other requests are processed faster locally, after some
    // init cost is amortized.
    if( window.ui1_server ){
      
      // console.log( "Magic loader, local request" );
      var time_local_request = (new Date()).getTime();
      
      var query = {};
      
      // Parse url's querystring like the http server would do it
      ( "&" + query_str ).replace( 
        /&(.*)=([^&]*)/g,
        function( _, name, value ){
          query[ name ] = decodeURIComponent( value );
        }
      );
      
     if( window.kudo_is_offline && kudo_is_offline() ){
        console.log( "Offline magic, remove current_path", current_path, url );
        kudo_ctx.session.is_offline = true;
        current_path = "";
      }else{
        kudo_ctx.session.is_offline = false;
      }
      
      // Added setTimeout() so that progress bar is visible
      setTimeout( function(){
        
      window.ui1_server(
        {
          method:  "GET",
          url:     current_path + target_url,
          query:   query,
          headers: {
            "x-forwarded-for":  "127.0.0.1",
            "x-magic-loader":   "true",
            "user-agent":       window.navigator.userAgent
          }
        },
        { writeHead: function(){}, end: process_magic_response }
      );
      }, 10 ); // setTimeout()
      return true;
    }
    
    nde&&console.log( "Magic, no local UI server, must ask web server" );
    
    // The sign out page needs to be done both side, not using ajax because
    // it redirects to the index page, a true redirect, not a fast one
    if( url.indexOf( "&page=signout" ) !== -1 ){
      console.log( "No ajax magic, signout" );
      window.kudo_new_location = url;
      window.location.replace( url );
      return true;
    }
    
    // Else, get the page's html content, using Ajax
    console.log( "Magic ajax request", url );
    
    // Avoid &_ parameters in jQuery ajax requests
    $.ajaxSetup( { "cache": true } );
    // Also for queries done when $('body').html(xxx) loads scripts
    // Note: it must be re-installed after body is changed
    $.ajaxPrefilter( function( options, original_options, _ ){
      if( options.dataType === 'script'
      ||  original_options.dataType === 'script'
      ){
        options.cache = true;
      }
    });
    
    $.ajax( target_url, {
      
       // I will handle script tags myself, hence "text" instead of "html"
      dataType: "text",
      
      // ToDo: do I need this: 
      cache: true, // true to avoid &_=xxxxxx extra param, response expires
      
      // Provide a "hint" in the request so that server can detect magic
      beforeSend: function( xhr ){
        // console.log( "Ajax request, set x-magic-loader header" );
        xhr.setRequestHeader( 'x-magic-loader', 'true');
      },
      
      complete: function( response, status ){
        var err;
        if( status != "success" ){
         // Meh...
         alert( "" + url + " - " + status + " \n" + "Please refresh" );
         err = status;
         return;
        }
        process_magic_response( response.responseText, err );
      },
      
      error: function( data ){
        console.warn( "ajax error (url)", data, "url:", url );
        // Let's try to go offline
        if( window.kudo_is_offline ){
          kudo_is_offline( true );
        }
        process_magic_response( null, data );
        window.kudo_new_location = url;
        window.location.replace( url );
      }
    });
    return true;
  };

  // Magic loader "back" button handling
  window.onpopstate = function( event ){
    var url = event.state;
    console.log( "onpopstate " + window.location.href + ", " + url );
    // Get rid of problematic :80 port that would confuse the magic loader
    // Load, true => "back"
    url = url.replace( ":80/", "" );
    if( url
    && kudo_magic_loader
    && kudo_magic_loader( url, true )
    )return;
    console.warn( "BUG? cannot go back" );
  };

  // I need a global div to decode html encoded title strings, &eacute; etc...
  var html_decode_div = null;

  // When the document is fully loaded, I can safely init additional stuff
  // Note: kudo_when_ready() is also called when a page is magic loaded.
  window.kudo_when_ready = function kudo_when_ready( jquery_ready ){
      
    console.log(
      "Kudo document ready" + ( jquery_ready ? "(jquery)" : "" )
    );
    
    // Is there an instruction left by some code to get back to server?
    var new_location = window.kudo_new_location;
    window.kudo_new_location = null;
    if( new_location ){
      console.info( "Set new location, as instructed.", new_location );
      window.location.assign( new_location );
      return;
    }
    
    var ctx = window.kudo_ctx;
    if( !ctx ){
      console.warn( "BUG? Missing Kudo context" );
      debugger;
      if( window.confirm( "BUG. reload?" ) ){
        window.location.replace(
          window.location + "&ctx=" + (new Date()).getTime()
        );
      }
      return;
    }
    
    // To behave differently on touch based devices
    ctx.touch_device = window.kudo_is_touch_device;
    
    // Once per page
    if( jquery_ready ){
      
      if( ctx.touch_device ){
        // Hack. Patch jQuery .click() to speed it up using mousedown event
        $.fn.fast_click = function( onclick ){
          this.bind( "touchstart", function( e ){
            console.log( "Touchstart" );
            window.kudo_time_last_click = (new Date()).getTime();
            onclick.call( this, e );
            e.stopPropagation();
            e.preventDefault();
            return false;
          } );
          this.bind( "click", function( e ){
            var now = (new Date()).getTime();
            var delta = now - window.kudo_time_last_click;
            console.log( "Click, delta", delta );
             // Ignore click just after touchstart
            if( delta < 150 ){
              e.stopPropagation();
              e.preventDefault();
              return false;
            }
            window.kudo_time_last_click = now;
            return onclick.call( this, e );
          } );  
          return this;
        };
      }else{
        $.fn.fast_click = $.fn.click;
      }
      
    }

    // All new pages go back to scroll location 0 (ie top of page)
    // However, there can be #xxxx after the url, process_reponse() jumps to it
    window.scrollTo( 0, 0 );
    
    // Let's figure out what is the total height of the window, as we
    // will to make it so that cols x rows of characters fit in it
    var h =  window.innerHeight ? window.innerHeight : $(window).height();
    var w = $(window).width();

    // On iPhone I think that screen.width is more accurate
    if( ctx.touch_device && screen && screen.width ){
      w = Math.min( screen.width, w );
    }

    // Remember that because I needed it somewhere else
    ctx.screen_width  = w;
    ctx.screen_height = h;
    
    // During twitter login there are blank pages (with just scripts in them)
    if( document.getElementById( "header" ) ){
      // Make header fixed unless it spans multiple lines and is too big
      var header = document.getElementById( "header" ).style;
      var header_height = $("#header").outerHeight( true );
      // ToDo: hide header on scroll, see https://github.com/antris/sneakpeek
      if( header_height < 42 ){
        header.position = "fixed";
        document.getElementById( "two_panes" ).style.marginTop
        = header_height + "px";
      }
    }
    
    // On touch devices I slightly change the design because of small screen
    // and difficulties to touch small targets
    // ToDo: do this using CSS
    if( ctx.touch_device ){
      // Setting maxWidth helps to avoid auto zooming artifacts
      document.body.style.maxWidth = w + "px";
      // var container = document.getElementById( "container").style;
      // container.align = "left";
      var footer = document.getElementById( "footer").style;
      footer.maxWidth = ctx.screen_width + "px";
      // Fix a browser bug, see http://stackoverflow.com/questions/6063308/touch-css-pseudo-class-or-something-similar
      $(document).bind( "touchstart", function(){} );
    }
    
    // Add and manage a hide button to some divs
    window.kudo_hide && kudo_hide();

    // Set document title. It can contain &xxx; entity and is decoded first
    //if( !html_decode_div ){
    //  html_decode_div = document.createElement( "div" );
    //}
    //html_decode_div.innerHTML = ctx.title || "kudocracy";
    //document.title = html_decode_div.childNodes[0].nodeValue;
    document.title = ctx.page_title || "kudocracy";
    console.log( "Title", ctx.page_title );
    
    function anchor_click( e ){
      e = e || window.event;
      var target = e.target || e.srcElement;
      var $link  = $(target).closest( "a" );
      // Provide some visual feedback
      $link.addClass('active');
      var href   = $link.attr( "href" );
      if( !href )return true;
      // When a target is specified, I need to open in a different window
      var attr_target = $link.attr( "target" );
      if( attr_target ){
        // _top is special, it means the link is in an iframe
        if( attr_target !== "_top" )return true;
        if( window.top === window.self 
        || !window.parent 
        || !window.parent.postMessage
        )return true;
        // In that case, I ask the parent to load, it may forward upward.
        // This happens with badges included in pages inside the wiki iframe
        // Patch href to make it absolute, vs relative
        if( href[ 0 ] === "/" ){
          href = "http://" + window.kudo_ctx.host + href;
        }
        window.parent.postMessage( [ "kudo_load", href ], "*" );
        e.preventDefault();
        return false;
      }
      if( window.kudo_magic_loader && kudo_magic_loader( href ) ){
        // Avoid duplicate loading by browser
        e.preventDefault();
        return false;
      }else{
        return true;
      }
    }
    
    // All links go thru magic loader (when enabled)
    // Also: external links open in a new window
    var $all_anchors = $( "a" );
    if( !ctx.touch_device ){
      console.log( "Anchor click handler installed" );
      $all_anchors.click( anchor_click );
    }else{
      // On touch devices, some links reacts faster (and prevent touch gestures)
      $all_anchors.not( ".fast" ).click( anchor_click );
      if( !$all_anchors.fast_click ){
        console.log( "BUG? missing fast click" );
        $all_anchors.filter( ".fast" ).click( anchor_click );
      }else{
        $all_anchors.filter( ".fast" ).fast_click( anchor_click );
      }
      console.log( "Anchor fast click handler installed" );
    }
    
    // Nicer tooltip, unless touch device
    var $tooltip = !ctx.touch_device && $('#tooltip');
    
    // Signal change in screen size
    if( false && !window.kudo_signal_capabilities_scheduled ){
      console.log( "Schedule signal_capabilities()" );
      window.kudo_signal_capabilities_scheduled = setInterval( function(){
        kudo_signal_capabilities( false, true /* now */ );
      }, 100 ); // every 100 millisec
    };
      
    // Anything else is done async, to speed up rendering of page
    setTimeout( function(){
      
    var target_height = Math.min( header_height, 32 );
    
    var time_started = ( new Date() ).getTime();
    
    $tooltip && $all_anchors.each( function(){
      
      var $this = $(this);
      var title = $this.attr( "title" );
      if( !title )return;
      
      // Use twitter icon when required
      if( title.substring( 0, "twitter".length ) === "twitter" ){
        title = title.replace(
          /twitter/, '<i class="fa fa-twitter twitter_blue"></i>'
        );
      }
      
      // I will adjust the X position so that the tooltip stays in screen
      $this
      .hover(
        function( e ){
          $(this).attr( "title", "" );
          $tooltip.html( title );
          var tooltip_width = $tooltip.outerWidth();
          var x = e.pageX - tooltip_width / 2;
          if( x < 0 ){
            x = 0;
          }else if( e.pageX + tooltip_width > ctx.screen_width ){
            x = ctx.screen_width - tooltip_width;
          }
          $tooltip
          .css( "display", "none" )
          .css( "position", "absolute")
          // Set initial position, will follow mouse
          // ToDo: there is an issue with changing font sizes
          .css( "top",  ( e.pageY + 1 * target_height ) + "px" )
          .css( "left", x + "px" )
          .fadeIn( 0 );
        },
        function(){
          $tooltip.fadeOut( 0 );
          $(this).attr( "title", title )
        }
      )
      .mousemove( function( e ){
         $tooltip
        // ToDo: there is an issue when header gets big
        .css( "top",  ( e.pageY + 1 * target_height ) + "px" );
        // ToDo: compute X so that content stays inside window
        // .css( "left", (e.pageX - 4 * sw_wpx) + "px")
      });
      
    }); // each anchor
    
    // Some submits go thru magic loader too, or go to server side
    //$( 'input[type="submit"]' ).click( function( e ){
    if( !ctx.is_slim ){
      $( "form" ).submit( function( e  ){
        if( !window.kudo_magic_loader )return true;
        var dom_form  = $(e.target).closest( "form" )[0];
        var data = []; // $form.serialize() does not work for me
        var form_elem;
        function form_urlencode( str ){
          return encodeURIComponent( str )
          .replace( /%20/g, "+" )
          .replace( /[!'()*]/g, function( c ){
            return '%' + c.charCodeAt( 0 ).toString( 16 );
          });
        }
        for( var ii_input = 0 ; ii_input < 100 ; ii_input++ ){
          form_elem = dom_form[ ii_input ];
          if( !form_elem )continue;
          data.push(
            form_elem.name + "=" + form_urlencode( form_elem.value )
          );
        }
        var uri = "?" + data.join( "&" );
        console.log( "form submit, uri:", uri );
        // Local app server can do the job
        return !kudo_magic_loader( uri );
      });
    }
    // console.log( "Magic loader was successfully installed" );

    // Add and manage a hide button to some divs, async
    window.kudo_hide && kudo_hide();
    
    // Render twitter widgets, async
    if( window.twttr && window.twttr.widgets ){
      var twitter_buttons = document.getElementById( "twitter_buttons" );
      if( twitter_buttons ){
        window.twttr.widgets.load( twitter_buttons );
     }else{
        // console.log( "No twitter buttons to render" );
      }
      // Fix a bug where twitter sets a max-width for the whole body...
      // console.log( "Twitter bug: max-width, fixed" );
      document.body.style.maxWidth = "";
    }
    
    // Detect slow devices, helps to avoid non critical stuff next time
    var duration = ( new Date() ).getTime() - time_started;
    if( duration > 1000 ){
      window.kudo_slow_device = true;
    }
    
    // Process changes from ephemeral machine, async
    if( !ctx.changes )return;
    
    // When there are changes it also means that a "local" login is done

    if( ctx.changes === "offline" ){
      console.info( "offline mode with no changes" );
    }else{
      console.info( "app mode. Ephemeral changes: " + ctx.changes.length );
    }
    
    var retry_count = 1000;
    
    var process_changes = function(){
      
      var ctx = window.kudo_ctx;
      
      var ui1_server = window.ui1_server;
      if( !ui1_server ){
        // For whatever reason, internet explorer works differently
        if( retry_count-- ){
          setTimeout( process_changes, 1 );
          return;
        }
        console.warn( "BUG? Ephemeral changes but no ui1_server" );
        return;
      }
      
      if( retry_count !== 1000 ){
        console.log(
          "ui1_server started after "
          + ( ( 1000 - retry_count ) * 1 )
          + " ms"
        );
      }
      
      console.info( "UI server started" );
      
      if( !ui1_server.load ){
        console.warn( "BUG? ui1_server.load is undefined" );
        debugger;
      }
      
      // Set local config to match server's one
      ui1_server.set_config( ctx.config );
      
      // Database load. Can login user after that
      var restore_start_time = (new Date()).getTime();
      
      // The response may include changes to the data layer. Local replay.
      if( ctx.changes === null ){
        console.warn( "BUG? no changes, revert to safe server mode" );
        window.kudo_new_location = ctx.url;
        window.location.replace( ctx.url );
        return;
      }
      
      // The changes must be loaded into the ephemeral database
      var changes = ctx.changes;
      ctx.changes = null;
      if( changes === "offline" ){
        if( !window.kudo_offline_loader ){
          console.warn( "BUG? 'offline' change yet not kudo_offline_loader" );
          window.kudo_offline_loader = true;
          debugger;
        }
        changes = [];
      }
      ui1_server.load(
        changes,
        function(){
          console.info(
            "Restore: " + changes.length
            + " changes in " + ( (new Date()).getTime() - restore_start_time )
            + " ms"
          );
          // It is safe now to login the visitor, the database is loaded
          if( ctx.visitor ){
            console.info(
              "Client side login for " + ctx.visitor, "auth:", ctx.authentic
            );
            ui1_server.login( ctx.visitor, ctx.authentic );
          }
          // Ditto for tags
          console.debug( "Client side local filter", ctx.filter );
          session.set_filter( ctx.filter );
        }
      );
      
      // Also sync local client session with server's one
      console.log( "Create local session and sync it" );
      ui1_server.login(); // Cannot login actual visitor, not in database yet
      var session = ui1_server.Session.current;
      session.is_app         = true;
      session.app_init_done  = true;
      session.page_init_done = true;
      session.is_novice      = ctx.is_novice;
      session.domain         = ctx.domain;
      session.current_page   = ctx.current_page;
      session.previous_page  = ctx.previous_page;
      session.page_id        = ctx.page_id;
      session.page_title     = ctx.page_title;
      session.host           = ctx.host;
      session.url            = ctx.url;
     console.log( "Set lang to", ctx.lang );
      session.auto_lang      = ctx.auto_lang;
      session.lang           = ctx.lang;
      session.can_script     = true;
      console.log( "Local UI server & local anonymous session are ready" );
    };
    
    process_changes();
                                   
    }, 0 ); // setTimeout()
    
  }; // End of def of kudo_when_ready()
  
  $(document).ready( function(){
    // console.log( "jQuery document ready" );
    kudo_when_ready( true );
    // console.log( "jQuery ready cb done" );
  }); // end of when page is ready

  // console.log( "Init new HTTP page done" );
};


ui.page_style = function page_style( title ){
// This defined the HEAD of a page. Most pages calls this.
  
  var session = Session.current;
  
  session.needs_twitter = false;
  var needs_firebase = ( title === "twitter" );
  
  var kudocracy = "Kudocracy";
  if( session.domain ){
    kudocracy = session.domain + " " + kudocracy;
  }
  if( title ){
    var msg = l( title );
    // Avoid any weird symbols/icons
    if( msg.indexOf( "</") !== -1 ){
      title = kudocracy;
    }else{
      title = msg + " - " + kudocracy;
    }
  }else{
    title = kudocracy;
  }
  
  session.page_title = title;
  
  // "magic" means headless minimal content, because it was sent before
  if( session.magic_loader 
  && !needs_firebase
  && ( !session.is_app || session.app_init_done )
  ){
    session.page_is_headless = true;
    return "<!-- magic -->\n" + session.configScript();
  }
  
  var buf = new ui.Builder();

  buf.push( '\n<title>', title, '</title>\n' );
  buf.push( '\n<link rel="stylesheet" href="', Config.style, '">' );
  
  // The rest are scripts
  if( !session.can_script && !needs_firebase )return buf.join();
  
  // Some scripts are injected once per HTTP page only
  if( !session.page_init_done ){
    // The server side (only) asks the client to load some scripts
    if( true ){ // l8.server ){
      buf.push(
        '\n<script src="/public/modernizr.min.js"></script>',
        '\n<script type="text/javascript">',
        '\n(', touchScript, ')()',
        '\n</script>',
        '\n<script src="https://ajax.googleapis.com/ajax/libs/jquery/2.2.2/jquery.min.js"></script>',
        '\n<script src="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/js/bootstrap.min.js"></script>',
        '\n<script src="https://rawgit.com/ngryman/jquery.finger/master/dist/jquery.finger.min.js"></script>'
      );
      // Avoid most javascript in slim mode
      if( !session.is_slim ){
        buf.push(
          // Reuse some stuff from simpliwiki
          '\n<script type="text/javascript">',
          "\nWiki = {};",
          ui.kudo_hide,
          magicScript,
          "\nkudo_magic();",
          '\n</s','cript>'
        );
      // But keep the hide buttons
      }else{
        buf.push(
          '\n<script type="text/javascript">',
          ui.kudo_hide,
          "\nwindow.kudo_ctx = {};",
          "\n$(kudo_hide);",
          '\n</s','cript>'
        );
      }
      buf.push(
        //'\n<script src="http://virteal.com/scrollcue.js"></script>',
        //'\n<script type="text/javascript"> Wiki.scrollcueScript( true ); </script>'
        //+ '<script type="text/javascript">' + scrollcue + '\nscrollcue( $ );',
        //+ '\n$.scrollCue( { fade:".fade" } );\n',
        //+ '</script>\n';,
        '\n<script src="http://platform.twitter.com/widgets.js"></script>'
      );
      if( !session.is_slim
      || session.current_page[0] === "proposition"
      || session.current_page[0] === "delegates"
      ){
        buf.push(
          '\n<script>console.log( "loading google tool" );</script>',
          '\n<script type="text/javascript" src="http://www.google.com/jsapi"></script>',
          '\n<script type="text/javascript">try{',
          '\n google.load( "visualization", "1.0", { "packages": ["corechart"] } );',
          '\n}catch(_){console.warn( "No google chart, offline?" ); }',
          '\n</script>'
        );
      }
    }
    // This is done once only, unless some page is requested to the server
    // again, like the login page for example.
    session.page_init_done = true;
  }
  
  // In "fat" mode (opposite to "slim") the full ui engine is sent
  if( session.is_app && !session.app_init_done ){
    // Server side (only) asks the client to load the full ui engine
    if( l8.server ){
      trace( "Switching to client mode" );
      // This will run code from uiclient.js
      if( session.is_app === "offline" ){
        buf.push( "\n<script>window.kudo_offline_loader = true;</script>" );
      }
      buf.push(
        '\n<script>$("#progress_bar").show();console.info( "Loading local UI engine...");</script>',
        '\n<script type="text/javascript" src="/browserified.js"></script>'
      );
    }else{
      trace( "Client side, yet session.app_init_done is false" );
    }
    session.app_init_done = true;
  }

  if( needs_firebase ){
    buf.push(
      '<script src="https://cdn.firebase.com/js/client/2.4.2/firebase.js"></script>'
    );
  }

  // Some code is always included, in magic loaded pages and in local pages
  !session.is_slim && buf.push( session.configScript() );
  
  return buf.join();
  
} // page_style()


ui.page_header = function page_header( left, center, right, current_page ){
// This builds the content of the navigation bar at the top of the screen.
  
  var session = Session.current;
  var visitor = session.visitor;
  
  if( !current_page ){
    current_page = session.page_name();
  }
  
  var builder = ui.Builder.current;
  
  var built_left = ""; 
  
  if( current_page !== "propositions" ){
    built_left 
    += " " + titled(
      link_to_page( "propositions", "", icon( "propositions" ) ),
      l( "propositions" )
    )
  }
  
  if( left ){
    built_left += " " + left;
  }
  
  // Turns out than "center" is not so good for displaying tags...
  if( center ){
    built_left = center + " " + built_left;
  }
  
  // Add title of current page
  if( current_page !== "main" ){
    built_left
    = icon( current_page, 'title="' + l( current_page ) + '"' )
    + " " + built_left;
  }

  if( right ){
    right = right + "&nbsp;";
  }else{
    right = "";
  }
  
  if( visitor ){
    
    right
    += '<div class="visitor_image">'
    + titled( 
        link_to_page( "visitor", "", avatar( visitor.label, 26 ) ), 
        persona_long_label( builder.session.visitor )
      )
    + '</div>&nbsp;'
    + titled(
      link_to_page( "signout", "", icon( "signout") ),
      l( "sign out" )
    );
    
  }else{
    
    right += titled(
      link_to_page( "login", "", icon( "login") ),
      l( "login" )
    );
    
  }
  
  var container_id = "container";
  
  // Reduce it when recent events are not shown on the side
  if( !ui.recent_events_div( current_page, true ) ){
    container_id = "container_1000";
  }

  var body_style = "class=page_" + current_page;
  var background_color = "";
  
  // ToDo: use CSS instead
  if( current_page === "main" || current_page === "index" ){
    // background_color = '#505065';
  }else
  if( false && current_page === "delegates" ){
    background_color = "#ffffcc";
  }else
  if( current_page === "visitor" 
  ||  current_page === "delegations"
  ||  current_page === "login"
  ){
    // background_color = "#ffddff";
  }else
  if( false && current_page === "persona" ){
    background_color = "#ccffff";
  }else
  if( current_page === "votebadge" ){
    background_color = "transparent";
  }
  
  if( background_color ){
    body_style += " background-color:" + background_color + ';';
  }
  
  var home 
  = ( current_page === "main" 
  // ||  !visitor 
  ||  session.filter.indexOf( " #domain " ) !== -1 )
  ? "index"
  : "main";
  
  var domain_owner = "@" + session.domain_label();
  var owner_avatar = avatar( domain_owner, 26 );
  var owner_link = link_to_twitter_user( domain_owner, owner_avatar, true );
  var home_link = link_to_page( home, "", icon( "home" ) );
  if( home === "main" ){
     home_link = titled( home_link, domain_owner );
  }
  
  var buf = new ui.Builder(
    '\n\n<div id="', session.page_id, '" data-magic="each">',
    '\n<div id="tooltip" data-magic="once"></div>',
    '\n<div class="header" id="header"><div id="header_content">',
    '\n<div id="kudo_header_menu">',
    
      '\n<div id="top_left">',
        built_left,
      '</div>',
      
      '\n<div id="top_center">',
        '<div class="visitor_image">',
        owner_link,
        '</div>',
        '\n<span id="progress_bar">', // invisible by default
          '\n<progress id="progress"></progress>',
        '\n</span>',
      '</div>',
      
      '\n<div id="top_right"><nobr>',
        right,
        "&nbsp;", link_to_wiki_icon( "HomePage" ),
        "&nbsp;", link_to_page( "help", "", icon( "help" ) ),
        "&nbsp", home_link,
        "&nbsp", icon( "show" ), // Hidden show_button
      '</nobr></div>',
      
    '\n</div></div><div class="clear"></div></div>'
  );
  
  buf
  .push( '<table id="two_panes" data-magic="each"><tr><td>' )
  .open_div( "kudo_iframe_div", 'data-magic="once"' ).hide_button()
    .push( " ", icon( "wiki" ), " " ).h3( "Wiki" )
    .de_em( 
      '<div class="float_left">&ensp;<small><a href="',
        Config.wiki, '">', icon( "new-window" ),
      '</a></small>&ensp;</div>'
    )
    // No scrolling, because child frame post a message to set the height
    .push( '<iframe id="kudo_iframe" width="100%" scrolling="no" ></iframe>' )
  .close_div()
  .push( '</td><td>' )
  .push(
    '\n<div id="page_background" style="', body_style, '" data-magic="each">',
    '\n<div id="', container_id, '" data-magic="each">',
    '\n<div id="content" style="margin:0px 0.3em;" data-magic="each">',
    '\n<div id="content_text" data-magic="main">\n\n'
  );
    
  return buf;
  
} // page_header()


ui.page_header_left = function( left, center, right, current_page ){
// Header with 'propositions', 'delegates', 'votes', 'ballot' ... login help
  var m = ( left || "" );
  if( current_page !== "delegates" ){
    m += " " + titled( 
      link_to_page( "delegates", "all", icon( "delegates" ) ),
      l( "delegates" )
    );
  }
  if( !Session.current.too_much_propositions() ){
    if( current_page !== "votes" ){
      m += " " 
      + titled( link_to_page( "votes", "", icon( "votes") ), l( "votes" ) );
    }
    if( false && current_page !== "ballot" ){
      m += " " 
      + titled( 
        link_to_page( "ballot", "", icon( "ballot") ),
        l( "ballot" )
      );
    }
  }
  return ui.page_header( m, center, right, current_page );
}


ui.page_header_right = function( left, center, right, current_page ){
// Header with 'propositions', ...,  '@name', 'help'
  return ui.page_header(
    left,
    center,
    right
  );
}


ui.page_footer = function page_footer( framed ){
  
  var session = Session.current;
  
  // Compute time it took to process the page
  var duration = ( l8.update_now() - session.timestamp ) / 1000;
  
  var buf = new ui.Builder(
    '\n\n<div class="clear"></div>',
    '</div></div></div></div>', // end of context_text/content/container
    '</div>' // end of page_xxxxx
  );
  if( !framed ){
    buf.push(
      '\n<div class="" id="footer"><div id="footer_content">',
      '<div id="powered">',
        '<a href="http://github.com/virteal/kudocracy">',
        Config.img_icon,
        '</a> <a href="/">',
        '<strong>kudo<em>c</em>racy</strong>',
        '</a> ' + duration, ' sec.',
        ' ', session.is_offline ? " offline " : "",
        ' ', ( l8.client 
          ? "app" 
          : ( "" + Session.max_count + " " + l( "sessions" ) + "." ) ),
        session.can_script
        ? ( session.can_script === "init" && " init " )
        : " noscript ",
        session.is_slim && " slim ",
      '</div>',
      // Add room so that scrollTo() works nicely when target is near end of page
      '<div id="after_footer" data-magic="once">',
      '<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>',
      '<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>',
      '</div>\n\n'
    );
  }
  buf.push( 
    '</div>', // end of page background
    '</td></tr></table>'
  );
  
  if( session.can_script && session.needs_twitter ){
  }
  
  // buf.push( "</div>" );
  return buf;
}


ui.proposition_recommendations
= function proposition_recommendations( options ){
  
  var proposition = options.proposition;
  var persona     = options.persona;
  var vote        = options.vote;
  var n           = options.count || 10;
  var agents_map  = options.agents_map || map();
  
  var without_direct   = options.without_direct;
  var without_indirect = options.without_indirect;
  
  if( vote ){
    if( !persona ){
      persona = vote.persona;
    }
    if( !proposition ){
      proposition = vote.proposition;
    }
  }
  
  var recommendations = [];
  
  if( persona ){
    agents_map[ persona.label ] = true;
  }
  
  // If few votes, keep them all, else keep some samples
  var proposition_votes = proposition.votes();
  var non_neutral = [];
  Ephemeral.every( proposition_votes, function( a_vote, ii ){
    a_vote = proposition_votes[ ii ];
    if( a_vote.orientation() === Vote.neutral )return true;
    if( without_direct   && a_vote.is_direct()   )return true;
    if( without_indirect && a_vote.is_indirect() )return true;
    non_neutral.push( a_vote );
    // If too much non neutral vote, exit loop and pick at random after that
    if( non_neutral.length > n ){
      non_neutral = null;
      return false;
    }
    return true;
  });
  if( non_neutral )return non_neutral;

  // From know agents (ie "friends")
  var agents = persona && persona.agents( proposition );
  var by_agent = null;
  if( vote && vote.delegation() !== Vote.direct ){
    by_agent = vote.delegation().agent;
    if( by_agent ){
      agents_map[ by_agent.label ] = true;
    }else{
      trace( "BUG? invalid agent in indirect vote " + vote );
      debugger;
    }
  }
  if( agents && by_agent ){
    Ephemeral.each( agents, function( agent ){
      // Filter out agent that the vote is using, if any
      if( agent === by_agent )return;
      var vote = agent.get_vote_on( proposition );
      if( !vote )return;
      var agent_orientation = vote.orientation();
      if( agent_orientation === Vote.neutral )return;
      if( without_direct   && vote.is_direct()   )return true;
      if( without_indirect && vote.is_indirect() )return true;
      agents_map[ agent.id ] = true;
      recommendations.push( vote );
    });
  }
  
  // From important agents
  var agent_votes = proposition.agent_vote_samples( n, agents_map );
  agent_votes.forEach( function( vote ){
    if( without_direct   && vote.is_direct()   )return true;
    if( without_indirect && vote.is_indirect() )return true;
    recommendations.push( vote );
  });
  
  var len = recommendations.length;
  if( n && len > n ){
    var picked;
    var picked_recommendations = [];
    var picked_map = map();
    var ii;
    while( ii < n ){
      picked = recommendations[ Math.floor( Math.random() * len ) ];
      if( picked_map[ picked ] )continue;
      ii++;
      picked_map[ picked ] = true;
    }
    recommendations = picked_recommendations;
  }
  
  return recommendations;
}


function vote_menu( persona, proposition, options ){
// Return a string that displays a menu to cast a vote
// options: with_twitter, compact
  
  function o( v, label ){
    return '\n<option value="' + v + '">' + ( l( label || v ) ) + '</option>';
  }
  
  if( !options ){
    options = {};
  }
  var session = Session.current;
  var compact = options.compact;
  var with_comment = true;
  
  var vote_id = persona.id + "." + proposition.id;
  
  var vote = proposition.get_vote_of( persona );
  var orientation;
  var is_direct;
  var half_life;
  if( vote ){
    orientation = vote.orientation();
    is_direct   = vote.is_direct();
    half_life   = vote.half_life();
  }
  
  var comment = null;
  var size = 20;
  
  if( with_comment ){
    with_comment // = " " + l( "or" ) + 
    = '<br><input type="search" name="comment" '
    + ( compact ? ' size="29"' : ' size="40"' ), // twice the 20 default
    + ' autosave="comment"'
    + ' spellcheck="true" autocapitalize="on" autocorrect="on"';
    if( options && !options.nofocus ){
      with_comment += " autofocus ";
    }
    comment = vote && Comment.valid( vote.comment() );
    if( comment ){
      comment = comment.text;
      size = comment.length + 1;
      with_comment += ' placeholder="' + Wiki.htmlizeAttr( comment ) + '"';
    }else{
      with_comment += ' placeholder="' + l( "comment your vote" ) + '"';
    }
    if( size > 20 ){
      if( size > 100 ){ size = 100; }
      with_comment += ' size="' + size + '" ';
    }
    with_comment += '/><br>';
    if( false && vote ){
      with_comment
      += '<input type="submit" value="' + l( "Comment" ) + '"/><br>';
    }
  }else{
    with_comment = "";
  }

  var remain = 140 - " #kudocracy ".length;
  if( with_comment && comment ){
    comment = encodeURIComponent( 
      comment.substring( 0, remain ) // .replace( / /g, "/" ) 
    );
  }else{
    comment = "virtual%20democracy";
  }
  
  if( options && options.with_twitter ){
    Session.current.needs_twitter = true;
  }
  
  // Provide recommendations, from known agents and random important ones
  var recommendations = compact ? "" : ui.proposition_recommendations({
    proposition: proposition,
    persona: persona,
    vote: vote,
    count: 11
  });
  
  var recommendation_msg = new ui.Builder();
  
  if( vote ){
    recommendation_msg.push(
      session.is_novice && l( "currently" ) + " ",
      l( "you" ), " ",
      ui.emojied( orientation ),
      !is_direct 
      && "&nbsp;<dfn>(" + link_to_delegation_page( vote ) + ")</dfn>",
      half_life
      && " " + l( "for another" ) + " " 
        + duration_label( vote.expire() - Kudo.now() ),
      ".<br>"
    );
  }
  
  // Display 10 recommendations
  var len = recommendations.length;
  if( len ){
    if( vote && session.is_novice ){
      recommendation_msg.push( l( "recommendations:" ), " " );
    }
    Ephemeral.each( recommendations, function( vote, index ){
      if( index >= 10 ){
        recommendation_msg.push( " ..." );
        return;
      }
      recommendation_msg.push(
        "<nobr>",
        link_to_persona_page( vote.persona ),
        "&nbsp;", 
        emoji( vote.orientation() ),
        "</nobr> "
      );
    });
    recommendation_msg.br();
  }
  
  recommendation_msg = recommendation_msg.join();
  
  var buf = new ui.Builder();
  buf.push(
    
    !compact && '<div><div class="hide_button"></div>',
    '<div class="vote_menu_core">',
    
    !compact && ( 
      ( options.index 
        ? link_to_proposition_page( proposition )
        : ( 
            ( !options.no_twitter_link 
              && ( '#' + link_to_twitter_tag( proposition.label ) ) )
          ) || ""
      ) + "<br>" + recommendation_msg
    ),
    
    '\n<form name="vote" class="vote_form" url="/">',
    '<input type="hidden" name="i" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',

    !compact && link_to_page(
      "delegates",
      proposition.label,
      compact ? icon( "indirect" ) : l( "Delegate" )
    ),

    !compact && "&nbsp;" + l( "or" ) + '<h2>',

    ( orientation === Vote.agree ? ""
      : "&nbsp;" + link_to_command(
        "change_vote " + vote_id + " agree", 
        emoji( "agree" ),
        l( "Vote" ) + ' "'  + l( "agree" ) + '"'
      )
    ),

    ( ( orientation === Vote.disagree || orientation === Vote.protest ) ? "" 
      : "&nbsp;" + link_to_command(
        "change_vote " + vote_id + " disagree",
        emoji( "disagree" ),
        l( "Vote" ) + ' "' + l( "disagree" ) + '"'
      )
    ),

    ( orientation !== Vote.neutral
      && ( !vote || vote.delegation() === Vote.direct ) // neutral triggers delegations
      ? "&nbsp;"
        + ( vote ? "" : "<em>" )
        + link_to_command(
          "change_vote " + vote_id + " neutral",
          emoji( "neutral" ),
          l( "Vote" ) + ' "' + l( "neutral" ) + '"'
        )
        + ( vote ? "" : "</em>" )
      : ""
    ),

    !compact && "&nbsp;</h2>" + l( "or" )
  );

  if( Session.current.can_script ){
    buf.push(
      ' <span class="vote_ellipsis" ', show_on_click, '>...</span>',
      '<div class="kudo_collapse">',
      '<div class="hide_button"></div>',
      '<div class="vote_menu_more">'
    );
  }else{
    buf.push( "<div>" );
  }

  buf.push(
    " ",
    compact 
    && ( options.index 
      ? link_to_proposition_page( proposition )
      : '#' + link_to_twitter_tag( proposition.label )
      ) + "<br>" + recommendation_msg,
      
    // compact ? "" : "<br>",
    
    '<select name="orientation">',
    // ToDo: randomize option order?
    o( "", "orientation" ), o( "agree" ), o( "disagree" ),  o( "neutral" ), o( "blank" ), o( "protest" ), 
    '</select>',
    ' <select name="duration">',
    o( "", "duration" ), o( "one year" ), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour" ), o( "expire" ),
    '</select>',
    
    with_comment,
    
    ' <input type="submit" value="', l( "Vote" ), '"/>',
    '</form>',
    !compact && "<br>"
  );
  
    // Twitter tweet button
  if( options && options.with_twitter && orientation ){
    /*
    var tags = proposition
    .tags_string(
      Session.current.visitor,
      Session.current.with_abuses
    )
    .replace( " #recent", "" )
    .replace( " #yesterday", "" )
    .replace( " #today", "" );
    */
    var tags = "";
    var permalink = "http://" + Config.domain + "/";
    if( session.domain ){
      permalink += session.domain + "/";
    }
    permalink += "proposition/" + encodeURIComponent( proposition.label );
    permalink += "?kudo=" + session.domain_label();
    buf.push(
      ' <div class="vote_twitter"><a href="http://twitter.com/intent/tweet?button_hashtag=',
      proposition.short_label(),
      '&hashtags=kudocracy,',
      orientation, ",",
      tags.replace( / /g, "," ).replace( /#/g, "" ),
      '&text=', comment, " ", permalink,
      // On demand rendering, to avoid excessive overhead at page load time
      //'" class="twitter-hashtag-button ',
      '" class="kudo-twitter-hashtag-button',
      '" data-related="Kudocracy,vote">Tweet ', proposition.label, 
      '</a></div>'
    );
  }
  
  if( Session.current.can_script ){
    buf.push( "</div></div></div>" ); // vote_menu core
  }else{
    buf.push( "</div></div>" );
  }
  if( !compact ){
    buf.push( "</div>" ); // div around hide button & collapse
  }
  
  return buf.join();
  
} // vote_menu()


function delegate_menu( delegation, msg ){
  
  function o( v, label ){
    return '\n<option value="' + v + '">' + l( v || label ) + '</option>';
  }
  
  Session.current.needs_twitter = true;
  
  return new ui.Builder(
    '\n<form name="delegation" url="/">',
    msg || "",
    '<input type="hidden" name="i" '
      + 'value="change_delegation &' + delegation.id + '"/>',
    '<select name="duration">',
    o( "", "duration" ), o( "one year" ), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour" ), o( "expire" ),
    '</select>',
    ' <input type="submit" value="', l( "Delegate" ), '"/>',
    '</form>\n'
    // Twitter tweet button
    // '\n<br><a href="http://twitter.com/intent/tweet?button_hashtag='
    // + delegation.agent.short_label()
    // + '&hashtags=kudocracy,vote,'
    // + delegation.tags_string().replace( / /g, "," ).replace( /#/g, "" )
    // + '&text=virtual%20democracy%20%40' + delegation.agent.short_label() + '" '
    // + 'class="twitter-hashtag-button" '
    // + 'data-related="Kudocracy,vote">Tweet #'
    // + delegation.agent.short_label() + '</a>'
  );
}

/*
 *  Collection of tags
 */

function TagSet(){
  this.session = null;
  this.tags    = map();
  this.count   = 0;
  this.sorted  = null;
  this.seen_propositions = map();
}


var ProtoTagSet = TagSet.prototype;


ProtoTagSet.is_empty = function(){
  return !this.count;
}


ProtoTagSet.add = function( label, no_inc ){
  if( !label )return;
  this.sorted = null;
  var count = this.tags[ label ];
  if( count === undefined ){
    this.tags[ label ] = no_inc ? 0 : 1;
    this.count++;
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
    if( !label )return;
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
  .split( " " )
  .forEach( function( tag ){

    if( !tag )return;
    var tag_entity = Topic.find( tag );
    if( tag_entity && tag_entity.is_abuse() && !that.session.with_abuses
    )return;
    var proposition_entity = Topic.find( tag.substring( 1 ) );
    
    // First tag is proposition name itself, skip it if unreferenced as tag
    var label = tag;
    if( tag_page ){
      if( tag === proposition.label )return;
    }else{
      if( tag.substring( 1 ) === proposition.label ){
        if( tag_entity && tag_entity.propositions().length ){
          label = '#';
        }else return;
      }
    }

    // If tag is also a valid proposition, avoid it, too much noise
    if( proposition_entity && !proposition_entity.is_abuse() )return;

    // Process tag
    if( label !== "#" ){
      // Increment count for label
      that.add( label );
    }else{
      label = "##";
    }
    if( functor ){
      functor.call( null, tag, label.substring( 1 ) );
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
  var ok_tags = map();
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

ui.filter_label_div = function filter_label_div( filter, page ){
  
  if( !filter || !filter.trim() )return "";

  var buf = new ui.Builder();
  var found = false;
  buf.push( '\n<div id="filter_label">' );

  filter.split( " " ).forEach( function( tag ){
    if( !tag )return;
    found = true;
    var tag_entity = Topic.find( tag );
    var count = " ";
    if( tag_entity ){
      var c = tag_entity.propositions().length;
      if( c > 1 ){
        count = '<dfn>(' + c + ')</dfn> ';
      }
    }
    buf.push(
      link_to_page(
        page || "propositions",
        tag,
        l( tag )
      ),
      count
    );
  });

  buf.push( '\n</div>\n' );
  return found ? buf.join() : "";

  
}


var sort_labels = map();
var sort_label_options = map();

ui.sort_label = function( style, no_by ){
  var label = "";
  var lang =  Session.current.lang + " ";
  Session.current.sort_criterias.forEach( function( c ){
    if( !c )return;
    if( label ){
      label += ", ";
    }
    var i18n_label = sort_labels[ lang + c ];
    if( !i18n_label ){
      i18n_label = l( c );
    }
    if( i18n_label ){
      label += i18n_label;
    }
  });
  if( !label )return label;
  if( !no_by ){
    label = l( "by" ) + " " + label;
  }
  if( style ){
    return " <dfn>(" + label + ")</dfn>";
  }else{
    return " " + label;
  }
}


function filter_menu( can_propose, title ){
  return filter_and_sort_menu( { 
    can_propose: can_propose,
    title: title,
    with_filter: true
  });
}


ui.sort_menu = function( title, dont_hide ){
  var hide;
  if( dont_hide !== undefined ){
    hide = !dont_hide;
  }
  return filter_and_sort_menu( {
    title: title,
    with_sort: true,
    hide: hide
  }); 
}


function filter_and_sort_menu( options ){
// This is the top part of most page, where visitor can select what filter
// to use to show/hide some propositions.

  if( !options ){
    options = map();
  }
  
  var session = Session.current;
  
  var with_filter = options.with_filter;
  var with_sort   = options.with_sort;
  var hide = !!options.hide;

  if( with_filter && options.hide === undefined ){
    hide = true;
    // Hide if not changed recently, to reduce clutter
    // hide = !session.filter_changed_recently();
  }
  
  if( session.can_script !== true ){
    hide = false;
  }
 
  var title       = options.title;
  var novice      = session.is_novice;
  var tag_page    = ( title === "Tags" );
  var can_sort    = with_sort && ( title !== "Ballot"  );
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + ( l || v ) + '</option>';
  }
  
  function o2( v, label, m ){
    var lang = session.lang + " ";
    var reversed = ( v[0] === "-" );
    if( reversed ){
      v = v.substring( 1 );
    }
    var key = lang + v;
    var cached = sort_label_options[ key ];
    if( cached )return cached;
    var more = m;
    if( !label ){ label = v; }
    if( !more ){
      more = reversed ? "low first" : "high first";
      if( label.indexOf( "date" ) !== -1 ){
        more = reversed ? "recent first" : "old first";
      }else if( label.indexOf( "proportion" ) !== -1 ){
        more = reversed ? "small first" : "big first";
      }else if( label.indexOf( "activity" ) !== -1 ){
        more = reversed ? "less active first" : "more active first";
      }else if( label.indexOf( "name" ) !== -1 ){
        more = reversed ? "ordered" : "reversed";
      }
    }
    label = l( label );
    more = l( more );
    var k2 = ( reversed ? "-" : "+" ) + v;
    var k3 = ( reversed ? "+" : "-" ) + v;
    var label1 = o( k2, label ) + o( k3, " ______ " + more );
    sort_label_options[ key ] = label1;
    sort_labels[ lang + k2 ] = label;
    sort_labels[ lang + k3 ] = label + ", " + more;
    return label1;
  }
  
  var tags_label = session.filter_label();
    
  // Add one space to ease insertion of an additional tag by user
  var placeholder = tags_label;
  if( tags_label ){
    placeholder += " ";
  }
  
  // Compute length of search input field
  if( placeholder.length >= 50 ){
    if( placeholder.length > 100 ){
      placeholder += '" size="100';
    }else{
      placeholder += '" size="' + ( placeholder.length + 1 );
    }
  }else{
    placeholder += '" size="50';
  }
  
  var r = new ui.Builder();
  
  // If hidden, user has to click to show
  var all_hidden = hide 
  && ( !with_filter || session.has_filter() || hide === "force" )
  if( all_hidden ){
    r.push(
      options.float ? '<div style="float:right">' : '<div style="float:left">',
      icon(
        with_filter ? "Search" : "Sort",
        show_next_on_click
      ),
      ' </div>',
      ' <div class="kudo_collapse">'
    );
  }else{
    r.push( " <div>" );
  }
  
  if( with_filter ){
    r.push(
      '\n<form name="proposition" url="/">',
      '<input type="hidden" name="i" value="proposition_action"/>',
      '<input type="search" autosave="search" results="7" ',
      ' spellcheck="false" autocapitalize="none" autocorrect="off"',
      ' name="i4" value="',
        placeholder,
      '" placeholder="', l( "#tags to find or plain text to look for" ),
      '"/> '
    );
  }else if( with_sort ){    
    r.push(
      '\n<form name="proposition" url="/">',
      '<input type="hidden" name="i" value="proposition_action"/>',
      '<input type="hidden" name="i4" value="', placeholder, '"/> '
    );
  }
  
  // Search button
  if( !hide && options.float ){ r.br(); }
  if( with_filter ){
    r.push(
      '<input type="submit" name="i2" value="', l( "b-Search" ), '"/>'
    );
    if( !can_sort ){ r.br(); }
  }

  // Sort menu
  if( can_sort ){
    
    var sort_criteria = session.sort_criterias[ 0 ];
    var is_today      = ( sort_criteria === "-voters_today" );
    var is_this_week  = ( sort_criteria === "-voters_this_week" );
    var is_this_month = ( sort_criteria === "-voters_this_month" );
    var is_this_year  = ( sort_criteria === "-voters_this_year" );
    var is_all 
    = !( is_today || is_this_week || is_this_month || is_this_year );
    
    var hidden_sort = is_all && with_filter && session.can_script;
    if( hidden_sort ){
      r.push(
        icon( "Sort", show_on_click ),
        ' <div class="kudo_collapse">'
      );
    }
    
    var escaped = querystring.escape(
      " Search " + ( !tags_label ? "" : tags_label + " " )
    );
    
    var sort_span = function( flag, span, label ){
      return ( flag
      ? '<h3>' + l( label ) + '</h3>'
      : '<a href="?i=proposition_action'
        + escaped + "-voters_" + span
        + '">' + l( label ) + '</a>'
      ) + " "; 
    }
    
    r.push(
      '<div>',
      
      sort_span( is_today,      "today",      "24 hours" ),
      sort_span( is_this_week,  "this_week",  "7 days"   ),
      sort_span( is_this_month, "this_month", "a month"  ),
      sort_span( is_this_year,  "this_year",  "a year"   ),
      !is_all && '<a href="?i=proposition_action'
        + escaped + ( tags_label || "-sort" )
        + '">' + l( "all" ) + '</a> ',

      '<select name="i5" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'proposition_action Search\';',
        '$(this.form).submit();',
      '}">',
      o( "", l( "b-Sort" ) ),
      
      o2( "age_modified",        "last activity date", "old first" ),
      o2( "-voters_today",       "votes today" ) && false, // fills sort_labels
      o2( "-voters_this_week",   "votes this week" ) && false,
      o2( "-voters_this_month",  "votes this month" ) && false,
      o2( "-voters_this_year",   "votes this year" ) && false,
      o2( "name",                "proposition name" ),
      o2( "-total_votes",        "total votes" ),
      o2( "-comments",           "number of comments" ),
      o2( "author",              "author", "reversed" ),
      // Some criterias are for tags only
      tag_page ? o2( "-propositions", "tagged propositions" ) : "",
      tag_page ? o2( "-delegations",  "tagged delegations" ) : "",
      o2( "age",                 "creation date", "old first" ),
      o2( "-heat",               "relevance", "less first" ),
      o2( "-trust",              "trust level", "few delegations or votes first" ),
      o2( "-activity",           "global activity" ),
      o2( "-changes",            "vote activity" ),
      o2( "-direct_votes",       "direct votes" ),
      o2( "-indirect_votes",     "indirect votes" ),
      o2( "-participation",      "direct participation", "low first" ),
      o2( "-protestation",       "blank or protest votes", "accepted first" ),
      o2( "-success",            "success", "small successes first" ),
      o2( "orientation",         "orientation", "reversed" ),
      '</select></div>'
    );
    
    if( hidden_sort ){
      r.push( '</div>' );
    }
    
    if( !session.can_script ){
      r.push( " ", '<input type="submit">' );
    }
  }
  
  r.push( '</form></div>' );
  
  var str = r.join();
  var n_open_div = 0;
  var n_close_div = 0;
  str.replace( /<div/g,    function(){ n_open_div++; });
  str.replace( /<\/div>/g, function(){ n_close_div++;});
  if( n_close_div !== n_open_div ){
    trace( "BUG? unbalanced div in filter_and_sort_menu()" );
    debugger;
  }
  return str;
}


function filter_change_links( tag_set, dont_hide ){
  
  if( tag_set.is_empty() )return "";
  
  var session = Session.current;
  
  var hide = !dont_hide;
  
  if( session.filter_changed_recently() || !session.has_filter()  ){
    hide = false;
  }
  
  // Special "force" value forces hidding.
  if( dont_hide === "force" ){
    hide = true;
  }
  
  if( !session.can_script ){
    hide = false;
  }

  var buf2 = new ui.Builder();
  
  if( session.is_novice ){
    buf2.push(
      ' <span class="help"> ',
      l( "select desired tags: " ),
      '</span>'
    );
  }
  
  if( hide ){
    buf2.push(
      icon( "Tags", show_on_click ),
      ' <span class="kudo_collapse">'
    );
  }else{
    buf2.push( "<span>" );
  }
  
  if( !hide ){
    // buf2.br();
  }
  var old_filter = " " + Session.current.full_query() + " ";

  // #tag... #tag(1)...  #computed.... #persona... #persona(1)...
  function order( a ){
    
    var key;
    
    var entity = Topic.find( a );
    if( entity ){
      if( entity.is_persona() ){
        key = "zzzzzz" 
        + ( "000000" + ( 1000000 - tag_set.get_count( a ) ) ).slice( -6 )
        + entity.id;
      }else{
        key = "" 
        + ( "000000" + ( 1000000 - tag_set.get_count( a ) ) ).slice( -6 )
        + entity.id;
      }
    
    // Computed tags
    }else{
      
      // #new comes first
      if( a === "#new" ){
        key = "zz000000";

      // Quorums come after
      }else if( a.substring( 0, "#quorum".length ) === "#quorum" ){
        key = "zzzz" + {
          "#quorum":    "00",
          "#quorum1":   "99",
          "#quorum10":  "90",
          "#quorum20":  "80",
          "#quorum25":  "75",
          "#quorum33":  "67",
          "#quorum50":  "50",
          "#quorum66":  "33",
          "#quorum75":  "25",
          "#quorum80":  "20",
          "#quorum90":  "10"
        }[ a ] || a;
      
      }else{
        key = "zz"
        + ( "000000" + ( 1000000 - tag_set.get_count( a ) ) ).slice( -6 )
        + a;
      }
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
  
  var tags_by_category = {
    tag: [],
    persona: [],
    computed: []
  };
  var on_tags_by_category = {
    tag: [],
    persona: [],
    computed: []
  };
  var off_tags_by_category = {
    tag: [],
    persona: [],
    computed: [],
  };
  var buf_by_category = {
    tag: [],
    persona: [],
    computed: []
  };
  
  var count_tags = 0;
  var max  = 8;
  var max2 = 30;

  tag_set.each( function( label ){
    
    var filtered = old_filter.indexOf( " " + label + " " ) !== -1;
    if( filtered )return;
    
    count_tags++;
    
    var persona = Persona.find( "@" + label.substring( 1 ) );
    
    new_topic = Topic.find( label );
    if( !new_topic ){
      new_category = "computed";
    }else if( Persona.find( "@" + label.substring( 1 ) ) ){
      new_category = "persona";
    }else{
      new_category = "tag";
    }
    
    tags_by_category[ new_category ].push( label );
    
    var display = tags_by_category[ new_category ].length < max;
    
    // Allow more tags for "computed" category, icons are short
    if( !display 
    && new_category === "computed" 
    && tags_by_category.computed.length < max * 1.5
    ){
      display = true;
    }
    
    if( !display ){
      ( filtered ? on_tags_by_category : off_tags_by_category )[ new_category ]
      .push( label );
      return;
    }
    
    var buf = buf_by_category[ new_category ];
    if( new_category != old_category ){
      if( old_category ){
        // buf.br();
      }
      if( true || Session.current.is_novice ){
        buf.push(
          icon( new_category ),
          " </td><td>" );
      }
      old_category = new_category;
    }
    
    // '+' link to add tag to filter, '-' to remove
    var profile = "";
    var label2;
    if( persona ){
      profile = link_to_persona_page( persona, "@" ); // "@" => no label
      var alias = persona.get_alias();
      if( alias ){
        label2 = alias.substring( 1 );
      }else{
        label2 = label.substring( 1 ); // rmv #
      }
    }else{
      label2 = l( icon( label ) );
    }

    var c = tag_set.get_count( label );
    var c_msg = c > 1 ? '<span class="badge">' + c + '</span>' : "";
    if( filtered ){
      buf.push(
        "<nobr>",
        profile,
        link_to_command( 
          "filter_less " + label, 
          "<h3>" + label + "</h3>" + c_msg
        ), "</nobr> "
      );
    }else{
      buf.push(
        "<nobr>",
        profile,
        link_to_command(
          "filter_more " + label,
          label2 + c_msg
        ), "</nobr> "
      );
    }
    
  });

  // Add special #abuse and #but tags
  if( tags_by_category.computed.length ){
    [ "#tag", "#abuse", "#but" ].forEach( function( tag ){
      if( tags_by_category.computed.indexOf( tag  ) !== -1 )return;
      tags_by_category.computed.push( tag );
      if( false && tags_by_category.computed.length < max ){
        buf_by_category.computed.push(
          link_to_command( "filter_more " + tag, l( tag ) ), " "
        );
      }else{
        off_tags_by_category.computed.push( tag );
      }
    });
  }
  
  // When there are too much tags, add a select form
  
  var tags;
  var tag_buf;
  
  function o( v, l ){
    return '\n<option dir="ltr" value="' + v + '">' + ( l || v ) + '</option>';
  }
  
  function select( buf, more, tags ){
    // tags = slice( tags, max );
    if( !tags.length )return;
    buf.push(
      '\n <select dir="rtl" name="',
      ( more ? "i5" : "i6" ),
      '" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'filter_' + ( more ? "more" : "less" ) + ' \';',
        '$(this.form).submit();',
      '}">',
     '<option dir="rtl" value="">', l( more ? "more" : "less" ), '</option>'
    );
    tags.forEach( function( label ){
      var count = tag_set.get_count( label );
      if( count ){
        count = '(' + count + ')';
      }else{
        count = "";
      }
      // Use alias for persona
      if( buf === buf_by_category.persona ){
        var username =  "@" + label.substring( 1 );
        var persona = Persona.find( username );
        var alias = persona && persona.get_alias();
        if( alias ){
          buf.push( o( label, alias ) + count );
        }else{
          buf.push( o( label, username ) + count );
        }
      // Use translation when available
      }else{
        buf.push( o( label, l( label ) + count ) );
      }
    });
    buf.push(
      '\n</select>'
    );
  }
  
  var need_form = false;
  [ "tag", "computed", "persona" ].forEach( function( category ){
    var tags = off_tags_by_category[ category ]; // tags_by_category[ category ];
    if( !tags.length )return; // if( tags.length <= max )return;
    need_form = true;
    tag_buf = buf_by_category[ category ];
    select( tag_buf, true , off_tags_by_category[ category ] );
    // select( tag_buf, false , on_tags_by_category[ category ] );
  });
  
  buf2.push( '<div id="change_filter">' );
  if( need_form ){
    buf2.push(
      '\n<form url="/">',
      '<input type="hidden" name="i" value=""/>'
    );
  }
  buf2.push( "<table>" );
  [ "tag", "computed", "persona" ].forEach( function( category ){
    var list = buf_by_category[ category ];
    if( !list.length )return;
    buf2.push( '<tr><td>', list.join( "" ), '</td></tr>' );
  });
  buf2.push( "</table>" );
  if( need_form ){
    if( !session.can_script ){
      buf2.push( " ", '<input type="submit">' );
    }
    buf2.push(
      '\n</form>'
    );
  }
  buf2.push( '</div>' );

  if( !count_tags ){
    buf2.br();
  }
  
  buf2.push( "</span>" );

  return buf2.join();

}


ProtoBuilder.set_change_filter_links = function( tag_set, dont_hide ){
  this.fill_slot( tag_set.slot, filter_change_links( tag_set, dont_hide ) );
}


/*
 *  Misc page builder helpers
 */
 
ProtoBuilder.require_visitor = function(){
  var persona = this.session.visitor;
  if( persona )return persona;
  this.redirect( "main" );
  return null;
};


ProtoBuilder.push_title = function( title, not_compact ){
  
  var nuit_debout = true;
  
  var filter_label = Session.current.filter_label();
  var buf = this;

  if( title[0] === "@" ){
    buf.push(
      '<h3>',
      link_to_persona_page( title ),
      '</h3>'
    );
    nuit_debout && buf.push( ", une&nbsp;personne" );
  }else{ 
    if( !filter_label )return this;
    false && buf.push(
      '<h3>',
      title,
      '</h3>'
    );
  }

  if( filter_label ){
    filter_label = filter_label.replace( /#[a-z_0-9]+/gi, function( tag_name ){
      /*
        var topic = Topic.find( tag_name );
        if( !topic ){
          return l( tag_name );
        }
        var new_title;
        if( topic.is_persona() && topic.get_persona().label === title ){
          // Avoid duplicate display of persona
          new_title = " " + tag_name; // " " is hack to avoid #xxx expansion
        }
        return link_to_proposition_page( topic, new_title );
      */
      var r = link_to_command( 
        "filter_less " + tag_name, 
        "<h3>" + icon( tag_name ) 
        + "</h3><small>" 
        + icon( "Remove" )
        + '</small>'
      );
      return r;
    });
    buf.push( ' ', filter_label );
    var persona_tag = Persona.find(
      Session.current.filter.replace( "#", "@" ).trim()
    );
    if( persona_tag && title !== persona_tag.label ){
      buf.push(
        ' <dfn>',
        link_to_persona_page( persona_tag.label ),
        '</dfn>'
      );
    }
    buf.br();
    var tag_topic = null;
    var hashname = Session.current.filter;
    var comment = "";
    var idx = hashname.lastIndexOf( "#" );
    if( idx !== -1 ){
      hashname = hashname.substring( idx );
      idx = hashname.indexOf( " " );
      if( idx !== -1 ){
        hashname = hashname.substring( 0, idx );
      }
      tag_topic = Topic.find( hashname );
      comment = Topic.reserved_comment( hashname );
    }
    if( comment ){
      if( comment[0] === "@" ){
        comment = link_to_persona_page( comment );
      }else{
        comment = l( comment );
      }
      // buf.push( '<dfn>', comment, '</dfn><br>' );
      buf.push( 
        l( "Tag" ), " ",
        tag_topic ? link_to_proposition_page( tag_topic ) : l( hashname ),
        l( ":" ), " ",
        comment, 
        '<br>' 
      );
    }else if( tag_topic ){
      comment = Comment.valid( tag_topic.comment() );
      if( comment ){
        // buf.push( '<dfn>', wikify_comment( comment.text ), '</dfn><br>' );
        buf.push( 
          l( "Tag" ), " ",
          link_to_proposition_page( tag_topic ),
          // tag_topic.label,
          l( ":" ), " ",
          wikify_comment( comment.text )
        );
      }else{
        buf.push( 
          l( "Tag" ), 
          " ", 
          link_to_proposition_page( tag_topic ), 
          ". " 
        );
      }
      buf.push( 
        " ",
        nuit_debout && " wiki : ",
        link_to_wiki_icon( tag_topic.label ),
        "&nbsp;",
        nuit_debout && " d&eacute;tails : ",
        link_to_proposition_page( tag_topic, icon( "zoom-in" ) ),
        "&nbsp;",
        nuit_debout && " twitter : ",
        link_to_twitter_tag( tag_topic.label, false /* just icon */ )
      );
      buf.br();
    }else{
      buf.br();
    }
  }else{
    if( not_compact ){
      buf.push( '<h2>&nbsp;</h2><br><br>' ); // Same height
    }
  }
  
  return this;
};


ProtoBuilder.push_title_and_search_form = function( title, hide ){
  
  var novice = this.session.is_novice;
  // Hide all potential previous help messages, including magic loaded ones
  if( !novice ){
    this.push_help( false );
  }

  this.push( 
    '\n\n<div id="search_box">',
    '<div id="search">',
    '<div class="hide_button"></div>'
  );
  this.push_title( title, true /* not compact, same height if empty */ );

  // Query to search for tags
  this.push( filter_and_sort_menu( {
    title: title,
    with_filter: true,
    with_sort: true,
    hide: hide,
    float: true
  } ) );
  
  // Build a list of all seen tags
  var tag_set = new TagSet();
  tag_set.add_session( Session.current );
  
  // Allocate a slot for clickable list of tags, to alter filter
  // See ProtoBuilder.set_filter_change_links()
  tag_set.slot = this.slot();
  this.push( '</div></div>\n\n' );
  
  return tag_set;
  
};


ProtoBuilder.push_vote_menu = function( proposition, options ){
  
  var session = this.session;
  var visitor = session.visitor;
  
  if( !options ){
    options = map();
  }
  
  // When no visitor, link to login page in some cases
  if( !visitor || visitor.is_abuse() ){
    // Not in most cases. Do it on "proposition" page for example.
    if( options.float )return this;
    // this.push( '<div style="float:', options.float, '">' );
    // this.br();
    this.push( link_to_page(
      "login",
      "", 
      '<span class="vote_button label label-success">'
      + l( "Vote" )
      + '</span>'
    ));
    // if( options.float ){ this.push( '</div>' ); }
    return this;
  }
  
  this.push(
    '<div id="vote_menu_',
    proposition.label.replace( "#", "_" ),
    '" class="vote_menu" data-magic="upsert">'
  );
  
  if( options.float ){
    // Don't do it on extra small screens, content gets hidden
    if( session.screen_width <= 320 ){
      options.float = null;
    }else{
      this.push( '<div style="float:', options.float, '">' );
    }
  }

  var vote_entity = proposition.get_vote_of( visitor );
  var orientation = "new";
  var is_direct   = true;
  var half_life   = false;
  
  if( vote_entity ){
    orientation = vote_entity.orientation();
  }
  
  if( !options.compact && session.can_script ){
    this.push(
      '<span ',
      options.float ? show_next_on_click : show_on_click,
      '><nobr>',
      //'<em><h2>', icon( "vote" ), "</h2></em>&nbsp;'
      emoji( orientation ),
      '&nbsp;',
      '<span class="vote_button label label-success">',
      l( "Vote" ),
      '</span>',
      '</nobr></span>'
    );
    if( options.float ){
      this.push( '</div><div class="vote_menu_content kudo_collapse"><div>' );
    }else{
      this.push(
        ' <div class="vote_menu_content kudo_collapse">'
      );
    }
  }else{
    this.push( ' <div class="vote_menu_content">' );
  }
  this.push(
    vote_menu( visitor, proposition, options ),
    '</div>'
  );
  
  if( options.float ){
    this.push( '</div>' );
  }
  this.push( '</div>' );
  
  return this;

};


ProtoBuilder.push_delegations = function( persona, br, misc ){ 
  
  var visitor = this.session.visitor;
  
  var can_delegate = visitor && visitor !== persona;
  
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
  
  if( !list.length ){
    if( misc ){
      this.push( misc, br );
    }
    return;
  }
  
  if( br ){
    this.push( br );
  }
  
  this.push( '<div><a id="delegations"></a><h2>' ); 
  
  if( persona === visitor ){
    this.push(
      icon( "indirect" ), " ", l( "Your delegations" ), '</h2>',
      ' - ', link_to_page( "delegations", "", l( "change" ), "delegations" ),
      ". "
    );
    if( this.session.has_filter() ){
      this.push(
        link_to_page( 
          "visitor", "indirect all", l( "all(e)" ), "delegations"
        ),
        "."
      );
    }
  }else{
    this.push(
      icon( "indirect" ), " ", l( "Delegations" ),
      " ",
      !br && link_to_persona_page( persona ) + " "
    );
  }
  
  this.push( 
    '</h2>',
    misc || "",
    '<br>'
  );

  list = list.sort( function( a, b ){
    // more tags first
    var count_a = a.tags.length;
    var count_b = b.tags.length;
    if( count_a !== count_b )return count_b - count_a;
    // recent first when same number of tags
    count_a = a.time_touched;
    count_b = b.time_touched;
    return count_b - count_a;
  });
  
  var index = -1;
  var div = item_divs( "delegation" );

  Ephemeral.each( list, function( delegation ){
    
    index++;
    that.push( div[ index % 2 ] );

    var filter = delegation.filter_string( persona );

    if( can_delegate && delegation.agent !== that.session.visitor ){
      that.push(
        '<form name="delegation" url="/">',
        '<input type="hidden" name="i" value="set_delegation"/>',
        '<input type="hidden" name="i2" value="' + filter + '"/>',
        '<input type="submit" value="', l( "Delegate" ), '"/> '
      );
    }
    
   var filter_label = "";
    filter.split( " " ).forEach( function( label ){
      if( !label )return;
      filter_label += " " + l( label );
    });
    filter_label = filter_label.trim();
    
    that.push(
      link_to_page( "persona", delegation.agent.label + " all " + filter ),
      " "
    );
    
    if( delegation.is_inactive() ){
      that.push( "<dfn>(", l( "inactive" ), ")</dfn> " );
    }
    
    that.push(
      l( "about" ), " ",
      link_to_page(
        "propositions",
        filter,
        filter_label.replace( / /g, "&nbsp;+&nbsp;" )
      )
    );
    
    if( can_delegate ){
      that.push( "</form>" );
    }else{
      that.br();
    }
    
    that.push( "</div>" );
    
  });
  
  that.push( '</div>' );
  
};


/*
 *  sparkline related
 */

var CachedSparklines = map();

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
  
  var seen_personas = map();
  
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
  this.start_time = null;
  this.end_time   = null;
}


Sparklines.prototype.add = function( proposition, start_time, limit_time, personas ){
  var data = get_sparkline_data( proposition, start_time, limit_time, personas );
  if( !data.serie.length )return;
  if( !Session.current.can_script )return;
  this.page_builder.push(
    '<canvas id="spark_', data.label,
    '" width=256 height=32></canvas>'
  );
  this.list.push( data );  
};


function sparkline( data ){
  
  if( !window.HTMLCanvasElement )return;
  
	var canvas = document.getElementById( "spark_" + data.label );
	if( !canvas ){
	  console.warn( "sparkline, missing", data.label );
	  return;
	}
	if( !canvas.getContext ){
	  console.warn( "sparkline, missing canvas", data.label );
	  return;
	}
	
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
  var start     = Kudo.now();
  var end       = start;
  var max_total = 0;
  var min_total = 1000000;
  this.list.forEach( function( data ){
    if( data.start < start ){ start = data.start; }
    if( !data.result )return;
    if( data.result.total > max_total ){ max_total = data.result.total;}
    if( data.result.total < min_total ){ min_total = data.result.total;}
  } );
  this.start_time = start;
  this.end_time   = end;
  if( !Session.current.can_script )return this;
  this.page_builder.push( '\n<script>\n' );
  this.page_builder.push( sparkline );
  var that = this;
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
  return this;
};


/*
 *  Recent events related
 */

function RecentEventsCache(){
  this.clear();
}


var ProtoRecentEventCache = RecentEventsCache.prototype;

var RE_SIZE = 30;


ProtoRecentEventCache.clear = function(){
  this.events = [];
  this.seen_comments = map();
  this.size = RE_SIZE;
  this.last_change_index = -1;
  this.time_last_update = 0;
  this.visitor = null;
  this.filter = "";
  this.query = "";
  this.span = "";
  this.lang = "";
  this.machine = null;
}


var Rec = new RecentEventsCache();

var ReuseEvent = {
  array:      [],
  index:      -1000,
  persona:    null,
  timestamp:  0,
  time_label: "",
  vote_menus: map(),
  seen_comments: map()
};


function format_change( change, page_name, twitter_style, array, at_tail ){
  
  var type = change.t;
  if( type === "Version" )return "";
  
  // Display only delegations in "delegates" & "delegations" pages
  var only_delegations
  = page_name === "delegates" || page_name === "delegations";
  if( only_delegations && type !== "Delegation" )return "";
  
  var only_votes = page_name === "votes";
  if( only_votes && type !== "Vote" && type !== "Comment" )return "";
  
  var session = Session.current;
  var visitor = session.visitor;
  
  var params = change.p;
  
  var timestamp = params.ts;
  var time_str = time_label( timestamp );
  var time_msg = "";

  // Should the same entry be modified
  var index = at_tail ? array.length - 1 : 0;
  var reuse = false;
  
  if( ReuseEvent.array === array 
  &&  ReuseEvent.index === index
  &&  ( Math.abs( ReuseEvent.timestamp - timestamp ) < 5 * 60 * 1000
    || time_str === ReuseEvent.time_label )
  ){
    reuse = true;
  }
  
  function inject(){
    if( reuse ){
      array[ index ] = msg;
    }else{
      ReuseEvent.array = array;
      if( at_tail ){
        ReuseEvent.index = array.length;
        array.push( msg );
      }else{
        array.unshift( msg );
        ReuseEvent.index = 0;
      }
      ReuseEvent.persona = persona;
      ReuseEvent.timestamp = timestamp;
      ReuseEvent.vote_menus = map();
    }
    ReuseEvent.time_label = time_str;
    return msg;
  }
  
  var initial_msg = reuse ? array[ index ] : "";
  var unchanged = initial_msg;
  
  var vote;
  var delegation;
  
  var id_key = params.id_key;
  
  var persona = params.$persona;
  if( persona ){
    persona = Persona.find( persona );
    if( !persona || persona.is_abuse() )return unchanged;
  }
  
  var proposition = params.$proposition;
  var is_new_proposition = false;
  if( proposition ){
    proposition = Topic.find( proposition );
    if( !proposition )return unchanged;
  }
  
  if( type === "Vote" ){
    if( id_key ){
      vote = Vote.find( id_key );
    }else{
      if( !persona ){
        trace( "BUG? missing persona for Vote", pretty( change, 2 ) );
        return unchanged;
      }
      if( !proposition ){
        trace( "BUG? missing proposition for Vote", pretty( change, 2 ) );
        return unchanged;
      }
      vote = Vote.find( persona.id + "." + proposition.id );
    }
    if( !vote )return unchanged;
    proposition = Topic.valid( vote.proposition );
    if( !proposition )return unchanged;
    persona = Persona.valid( vote.persona );
    if( !persona )return unchanged;
    
  }else if( type === "Topic" ){
    // Don't display new topic, there will be a first vote next, it's enought
    return unchanged;
    proposition = Topic.find( params.label );
    
  }else if( type === "Comment" ){
    vote = Vote.find( params.$vote );
    if( !vote )return unchanged;
    persona = Persona.valid( vote.persona );
    if( !persona )return unchanged;
    proposition = Topic.valid( vote.proposition );
    if( !proposition )return unchanged;
    
  }else if( type === "Delegation" ){
    if( id_key ){
      delegation = Delegation.find( id_key );
    }else{
      // Find delegation, need to rebuild its id
      var agent = Persona.find( params.$agent );
      if( !agent )return unchanged;
      var delegation_id = persona.id + "." + agent.id;
      var all_good = params.tags.every( function( tag ){
        var tag_entity = Topic.find( tag.$ );
        if( !tag_entity )return false;
        if( tag_entity.is_abuse() )return false;
        // tags were sorted
        delegation_id += "." + tag_entity.id;
        return true;
      });
      if( !all_good )return unchanged;
      delegation = Delegation.find( delegation_id );
    }
    if( !delegation )return unchanged;
    persona = Persona.valid( delegation.persona );
    if( !persona )return unchanged;
    
  }else if( type === "Persona" ){
    // Filtered out, noisy, wait until that persona votes
    return unchanged;
  }
  
  if( persona ){
    if( persona.is_abuse() )return unchanged;
  }else{
    persona = null;
  }
  
  if( proposition ){
    if( proposition.is_abuse() )return unchanged;
    // Filter out based on filter, keep "current" proposition for UI feedback
    if( proposition !== session.proposition 
    && !proposition.filtered(
      session.filter,
      session.filter_query,
      session.visitor
    ) )return unchanged;
    if( visitor && !visitor.get_vote_on( proposition ) ){
      is_new_proposition = true;
    }
  }
  
  if( delegation ){
    if( !delegation.filtered(
      session.filter,
      session.filter_query,
      session.visitor
    ) )return unchanged;
  }

  var persona_msg = "";
  if( reuse && ReuseEvent.persona !== persona ){
    reuse = false;
  }
  if( !reuse && persona ){
    persona_msg = '<div class="event_persona">' 
    + link_to_persona_page( persona )
    + ' </div>';
  }

  if( time_str !== ReuseEvent.time_label || !persona ){
    time_msg = ' <div class="event_time">' + time_str + '</div>';
    reuse = false;
  }
  
  var msg_br = "";
  if( !reuse ){
    msg_br = "<br>";
  }
  
  var msg = "";
  
  function show_proposition(){
    var nuit_debout = true;
    var p = proposition;
    var persona = proposition.get_persona();
    if( nuit_debout ){
      msg += " sur ";
    }
    if( is_new_proposition ){
      msg += "<em>";
    }
    twitter_style = false;
    if( twitter_style ){
      msg 
      += " #" + link_to_twitter_tag( p.label )
      +  '&nbsp;<dfn>'  
      + ( persona 
        ? link_to_persona_page( persona )
          + ( nuit_debout ? "</em>, une&nbsp;personne" : "" )
        : link_to_proposition_page( p, icon( "zoom-in") )
          + ( nuit_debout ? p.is_tag() ? "</em>, un&nbsp;tag" : "</em>, une&nbsp;proposition" : "" )
      ) +  '</dfn>';
    }else{
      msg += persona 
      ? link_to_persona_page( persona )
        + ( nuit_debout ? "</em>, une&nbsp;personne" : "" )
      : link_to_proposition_page( p )
        + ( nuit_debout ? p.is_tag() ? "</em>, un&nbsp;tag" : "</em>, une&nbsp;proposition" : "" )
      ;
    }
    if( is_new_proposition ){
      msg += "</em>";
    }
    if( !nuit_debout ){
      msg += "&nbsp;<dfn>" 
      + link_to_wiki_icon( p.label ) 
      + "</dfn>";
    }
    if( !twitter_style ){
      msg += " " + link_to_twitter_tag( p.label, " " );
    }
    if( persona && persona.is_domain() ){
      msg += ' <a href="/' + persona.short_label() + '">'
      + Config.img_icon
      + '</a>'
    }
    
  }
  
  if( type === "Comment" ){
    msg += icon( "comment" ) + " " + l( "comment" ) + " ";
    show_proposition();
    msg += '<br><h3>' + wikify_comment( params.text ) + "</h3>";
    if( proposition.get_comment_author() === persona ){
      Rec.seen_comments[ proposition.id ] = true;
    }
    
  }else if( type === "Vote" ){
    msg += l( "vote" ) + " <nobr>";
    if( params.orientation ){
      // Avoid neutral vote if it is not a change and without comment
      if( params.orientation === Vote.neutral
      &&  !params.comment_text
      &&  vote.orientation() === Vote.neutral
      &&  vote.previous_orientation() === Vote.neutral
      &&  persona !== session.visitor
      )return unchanged;
      msg += ui.emojied( params.orientation );
    }else{
      if( persona !== session.visitor )return unchanged;
      msg += icon( "vote" );
    }
    msg += " ";
    show_proposition();
    msg += "</nobr>";
    if( params.comment_text ){
      msg += '<br><h3>' + wikify_comment( params.comment_text ) + "</h3>";
      if( proposition.get_comment_author() === persona ){
        Rec.seen_comments[ proposition.id ] = true;
      }
    }
    
  }else if( type === "Topic" ){
    msg += icon( "proposition" );
    show_proposition();
    
  }else if( type === "Tagging" ){
    // Display only when done by current visitor, as a feedback
    if( persona !== session.visitor )return unchanged;
    msg += "<nobr>" + icon( "tag" );
    show_proposition();
    var tags = params.tags;
    var detags = params.detags;
    if( tags && tags.length ){
      msg += "</nobr> <nobr>";
      tags.forEach( function( tag ){
        msg += " " + link_to_page( "propositions", tag.$ );
      });
    }
    if( detags && detags.length ){
      msg += " </nobr>" + l( "minus" ) + ' <nobr>';
      detags.forEach( function( tag ){
        msg += " " + link_to_page( "propositions", tag.$ );
      });
    }
    msg += "</nobr>";
  
  }else if( type === "Persona" ){
    persona = Persona.find( params.label );
    if( !persona )return unchanged;
    msg += icon( "persona" ) + " "
    + link_to_persona_page( persona );
  
  }else if( type === "Delegation" ){
    
    if( !delegation )return unchanged;
    
    var str_tags = "";
    Ephemeral.each( delegation.tags, function( tag_entity ){
      str_tags += " " + l( tag_entity.label );
    });
    str_tags = str_tags.substring( 1 ); // rmv extra front space
    str_tags = str_tags.replace( / /g, " + " );
    
    var sub_msg 
    = icon( "delegation" ) + " " + l( "delegation" )
    + " " + link_to_delegation_page( delegation )
    + " " + link_to_page( "propositions", str_tags, icon( "zoom-in" ) );
    
    if( session.visitor 
    && !ReuseEvent.vote_menus[ delegation.id ]
    &&  delegation.agent !== session.visitor
    ){
      ReuseEvent.vote_menus[ delegation.id ] = true;
      msg_br = "";
      msg += '<table><tr><td>'
      + sub_msg 
      + '</td><td class="timeline_vote delegate_too">'
      // + icon( "indirect" ) + " "
      // ToDo: inline delegation
      + link_to_persona_page( delegation.agent, l( "delegate too") )
      // + '</div>
      + '</td></tr></table>';
    }else{
      msg += sub_msg;
    }
  
  }else if( type === "Store" ){
    return unchanged;
    msg += l( "Store" );
    msg += "</nobr> - " + pretty( params ) + '<br>';
    
  }else if( type === "Membership" ){
    return unchanged;
    msg += l( "Membership" );
    msg += "</nobr> - " + pretty( params ) + '<br>';
    
  // Otherwise
  }else{
    msg += l( type );
    msg += "</nobr> - " + pretty( params ) + '<br>';
  }
  
  // Comment of proposition, if not shown so far
  if( proposition && !Rec.seen_comments[ proposition.id ] ){
    Rec.seen_comments[ proposition.id ] = true;
    var comment = proposition.get_comment_text( proposition );
    if( comment ){
      msg += '<br><h3>' + wikify_comment( comment ) + "</h3>";
    }
  }
  
  // Vote menu for logged in visitor
  if( proposition ){
    if( session.visitor ){
      if( !ReuseEvent.vote_menus[ proposition.id ] ){
        ReuseEvent.vote_menus[ proposition.id ] = true;
        msg = '<div class="timeline_vote">'
        + vote_menu(
          session.visitor,
          proposition,
          { 
            compact: true, 
            nofocus: true, 
            index: twitter_style,
            with_twitter: true
          }
        )
        + '</div><div>'
        + msg + '</div><div class="clear"></div>';
      }
    }
  }
  
  msg = ( reuse ? initial_msg : "" ) 
  + persona_msg 
  + time_msg
  + msg_br
  + '<div class="event_unit">' + msg + '</div>';
  inject();
  return msg;
}


function init_recent_events( page_name, twitter_style, span, time_limit ){
  Rec.clear();
  // From most recent change to older one
  var all_changes = Machine.current.changes;
  for( var ii =all_changes.length - 1 ; ii >= 0 ; ii-- ){
    var change = all_changes[ ii ];
    // Exit loop if reaching too old changes
    if( time_limit ){
      var age = l8.now - change.p.ts;
      if( change.p.ts < time_limit )break;
    }
    format_change( 
      change, page_name, twitter_style, Rec.events, true /* will push */
    );
    if( Rec.events.length >= Rec.size )break;
  }
  Rec.last_change_index = Machine.current.changes.length - 1;
  Rec.time_last_update = (new Date()).getTime();
  Rec.visitor = Session.current.visitor;
  Rec.machine = Machine.current;
  Rec.filter  = Session.current.filter;
  Rec.query   = Session.current.filter_query;
  Rec.lang    = Session.current.lang;
  Rec.span    = span;
}


function update_recent_events( page_name, twitter_style, span, time_limit ){
  
  // Invalidate cache if old or some criteria changed
  var now = l8.now;
  if( ( now - Rec.time_last_update ) > 60000 
  ||  Rec.visitor !== Session.current.visitor
  ||  Rec.filter  !== Session.current.filter
  ||  Rec.query   !== Session.current.filter_query
  ||  Rec.span    !== span
  ||  Rec.machine !== Machine.current
  ||  Rec.lang    !== Session.current.lang
  ){
    init_recent_events( page_name, twitter_style, span, time_limit );
    return true;
  }
  
  // Needs update?
  if( Rec.last_change_index === Machine.current.changes.length - 1
  )return false;
  
  // Update cache with new events
  var backlog = Machine.current.changes.length - 1 - Rec.last_change_index;
  if( backlog > Rec.size ){
    init_recent_events( page_name, twitter_style, span, time_limit );
    Rec.time_last_update = now;
    return true;
  }
  
  var  ii;
  
  // From next change to last change
  for( ii = Rec.last_change_index + 1 
  ;    ii < Machine.current.changes.length
  ;    ii++ 
  ){
    var change = Machine.current.changes[ ii ];
    // Skip changes that are too old
    if( time_limit && change.p.ts < time_limit )continue;
    // console.log( pretty( change ) );
    format_change( 
      change, page_name, twitter_style, Rec.events, false /* will unshift */
    );
  }
  
  Rec.last_change_index = Machine.current.changes.length - 1;
  Rec.time_last_update = now;
  Rec.span = span;
  
  return true; // was updated
}


ui.recent_events_div = function ( page_name, check_only ){
  
  var nuit_debout = true;
  
  var session = Session.current;
  var twitter_style = true;
  
  if( page_name !== "index"
  &&  page_name !== "offline"
  &&  page_name !== "kudocracy"
  &&  page_name !== "main"
  ){
  
    // When not displayed on the index page
    twitter_style = false;
    
    // For logged in users only
    // if( !session.visitor )return "";
    
    // Display that only on some pages
    if( page_name !== "main"
    &&  page_name !== "propositions"
    &&  page_name !== "votes"
    &&  page_name !== "delegates"
    &&  page_name !== "delegations"
    &&  page_name !== "visitor"
    )return "";
  
    if( page_name !== "main" ){
      // Avoid display if screen is too small, unless landscape mode
      if( session.screen_width < 800
      &&  session.screen_width < session.screen_height
      )return "";
    }
    
  }
  
  if( check_only )return true;
  
  var time_limit = 0;
  var now = l8.now;
  var sort_criteria = session.sort_criterias[ 0 ];
  var idx_voters = sort_criteria && sort_criteria.indexOf( "voters_" );
  var span = "all";
  if( sort_criteria && idx_voters !== -1 ){
    var span = sort_criteria.substring( idx_voters + "voters_".length );
    if( span === "today" ){
      time_limit = now - Kudo.ONE_DAY;
    }else if( span === "this_week" ){
      time_limit = now - Kudo.ONE_WEEK;
    }else if( span === "this_month" ){
      time_limit = now - Kudo.ONE_MONTH;
    }else if( span === "this_year" ){
      time_limit = now - Kudo.ONE_YEAR;
    }else{
      span = "all";
    }
  } 

  if( twitter_style ){
    Rec.size = 20;
  }else{
    Rec.size = RE_SIZE;
  }
  var updated
  = update_recent_events( page_name, twitter_style, span, time_limit );
  
  // If not updated and already sent recently, no need to update
  if( !updated && session.page_fragments[ "recent_events" ] )return "";

  var buf = new ui.Builder();
  buf.push( '\n\n<div id="recent_events"><div class="hide_button"></div>' );
  
  var span_option 
  = span === "all" ? "" : '<dfn>(' + l( span ) + ')</dfn>';
  
  if( span_option ){
    span_option 
    = ' <small><span ' + show_on_click + '>'
    + span_option 
    + '</span><div class="kudo_collapse">' + ui.sort_menu() 
    + '</div></small>';
  }
  
  if( twitter_style ){
    buf.push(
      '<div class="recent_events_header">',
      link_to_page( "votes", "direct", l( "Votes" ) ),
      span_option,
      !session.visitor
      && ' <span style="font-size:11px;">'
      + link_to_page( "login", "twitter_direct", l( "login to vote" ) )
      + "</span>",
      "</div>"
    );
  }else if( span !== "all" ){
    buf.push(
      '<div class="recent_events_header">',
      link_to_page( "votes", "direct", l( "Votes" ) ),
      span_option,
      !session.visitor
      && ' <span style="font-size:11px;">'
      +  link_to_page( "login", "twitter_direct", l( "login to vote" ) )
      +  "</span>",
      "</div>"
    );
  }
  
  for( var ii = 0 ; ii < Rec.events.length ; ii++ ){
    buf.push(
      '\n\n<div class="recent_event">',
      Rec.events[ ii ],
      '</div>'
    );
  }
  
  buf.push( "</div>\n\n" );  
  
  // Remember not to send this again if no update
  return session.fragment( "recent_events", buf.join() );

}


/* ---------------------------------------------------------------------------
 *  page visitor
 */

function page_visitor( page_name, content ){
// The private page of a persona

  var session = this.session;
  var persona = session.visitor;
  if( !persona )return this.redirect( "login" );
  if( !content )return this.redirect( "visitor direct" );
  
  // Forget about whatever potential agent's page was visited recently
  session.agent = null;
  
  // Remove #new filter, confusing
  session.remove_confusing_new_filter();
  
  // Don't display votes unless some good filter exists, else it's too much
  var display_votes = session.has_enough_filter();

  // Header
  this.set( ui.page_style( "you" ) );
  
  if( session.is_novice ){
    this.push_help(
      l( 
    "This page list informations about you, your votes, your delegations, etc."
      )
    );
  }

  var tag_set = this.push_title_and_search_form( persona.label );
  this.push( ui.recent_events_div( page_name ) );
  
  this.open_div( "persona_view" );
  
  // sign out & clear (to clear local storage)
  if( !session.authentic ){
    this.push(
      l( "Authentication required" ), ". "
      // link_to_page( "login" ), " ",
      // l( "or" ), " "
    );
  }
  this.push(
    icon( "signout" ), " ",
    link_to_page( "signout", "", l( "sign out" ) )
  );
  if( l8.client || session.magic_loader ){
    this.push(
      " ", link_to_page( "signout", "clear", l( "& clear" ) ), "."
    );
  }

  if( !session.is_novice ){
    this.push(
      " ", link_to_command( "help_toggle", l( "help" ) ), "."
    );
  }

  // Kudocracy domain?
  if( persona.is_domain() ){
    
    this.push(
      '<div id="domain"><br><br><h2>',
      icon( "proposition" ), " ",
      l( "Domain propositions" ), " ",
      '<a href="?kudo=', persona.short_label(),
      '&page=propositions">', persona.label, '</a></h2>'
    );
    
    if( session.authentic ){
      this.push(
        ' - ',
        link_to_page( "domain", "", l( "security") ),
        '<br>'
      );
    }
    this.push( "</div>" );
  }

  this.br();
  
  // Delegations
  this.push_delegations( persona );
  
  var index = -1;
  var div = item_divs( "vote" );

  var without_direct_votes   = ( content === "indirect" );
  var without_indirect_votes = ( content === "direct" );
  var all_votes = ( content === "all" );
  
  var votes = persona.votes();

  // Sort votes, recent first unless some other criteria about propositions
  if( display_votes ){
    
    var sort_criterias = session.sort_criterias;
    votes = votes.sort( function( a, b ){
      if( !sort_criterias.length )return b.time_touched - a.time_touched;
      return Ephemeral.compare_measures(
        a.proposition,
        b.proposition,
        sort_criterias,
        persona
      );
    });
    
    var filter = session.filter_label();
    this.open_div( "your_votes" ).push(
      
      '<br><a id="votes"></a><h2>',   // #votes anchor
      l( "Your votes" ),
      '</h2> <dfn>', filter, '</dfn>',
      filter 
      && " - " + link_to_page( "visitor", "all all", l( "all" ), "votes" ),
      "<br>",
      
      icon( "votes" ), " ",
      !all_votes
      ? link_to_page( "visitor", "all", l( "all(s)" ), "votes" )
      : "<h3>" + l( "all(s)" ) + "</h3>",
      
      " ", icon( "direct" ), " ",
      ( all_votes || without_direct_votes )
      ? link_to_page( "visitor", "direct", l( "direct(s)" ), "votes" )
      : "<h3>" + l( "direct(s)" ) + "</h3>",
      
      " ", icon( "indirect" ), " ", 
      ( all_votes || without_indirect_votes )
      ? link_to_page( "visitor", "indirect", l( "indirect(s)" ), "votes" )
      : "<h3>" + l( "indirect(s)" ) + "</h3>",
      
      "<br>"
    )
  }
  
  var that = this;
  Ephemeral.each( votes, function( entity ){

    var orientation = entity.orientation();
    if( orientation === Vote.neutral )return;

    if( !entity.filtered(
      session.filter,
      session.filter_query,
      persona
    ) )return;
    
    if( without_direct_votes   && entity.delegation() === Vote.direct
    )return;
    if( without_indirect_votes && entity.delegation() !== Vote.direct
    )return;
    
    tag_set.add_proposition( entity.proposition );
    
    if( !display_votes )return;

    index++;
    
    var indirect_msg = "";
    if( entity.is_indirect() ){
      indirect_msg 
      = " <dfn>(" + link_to_delegation_page( entity ) 
      + ")</dfn>";
    }
    
    var label = entity.proposition.label;
    var result = entity.proposition.result;
    var result_orientation = result.orientation();
    var emojied_text = emojied_result( result );
    
    that.push( div[ index % 2 ] );
    
    that.push_vote_menu(
      entity.proposition, { with_twitter: true, float: "right", compact: true }
    );
    
    that.push( '<h3>',
      icon( "zoom-in" ), " ",
      link_to_page( "proposition", label, label ),
      '</h3>',
      
      " <em>", emojied_text, '</em>',
      '. ',
      
      ( result_orientation === orientation
      ? l( "you too" )
      : l( "you" ) + " " + ui.emojied( orientation ) ),
      
      indirect_msg,
      ". "
      //" " + l( "for" ) + " " + duration_label( entity.expire() - Kudo.now() ),

    );
    
    that.push( '</div>' );

  });
  
  if( display_votes ){
    this.close_div();
  }
  
  this.br();
  
  this.close_div();

  // Inject list of all seen tags, to alter filter when clicked
  this.set_change_filter_links( tag_set );
  
  this.unshift(
    ui.page_header_right(
      _,
      link_to_twitter_user( persona.label ),
      _ // link_to_page( "delegations" )
    )
  );
  this.push( ui.page_footer() );

} // page_visitor()


/* ---------------------------------------------------------------------------
 *  page persona
 */
 
function page_persona( page_name, name, what ){
// This is the "public" aspect of a persona

  var nuit_debout = true;

  if( !what )return this.redirect( "persona " + name + " all" );
  
  var persona = Persona.find( name );
  if( !persona )return this.redirect( "main" );
  
  var p_label = persona.label;
  
  var session = this.session;
  var visitor = session.visitor;

  var that = this;
  
  if( visitor === persona ){
    // Visitor visits her/his own page
    session.agent = null;
    session.remove_confusing_new_filter();
  }else{
    // Prefill potential future delegation request
    session.agent = persona;
  }

  // Header
  this.set( ui.page_style( p_label ) );

  // Get some twitter provided stuff, image, banner, etc
  var twitter_user = TwitterUser.find( p_label );
  var twitter = twitter_user && twitter_user.twitter_user_data;
  if( twitter ){
    this.push(
      '<div style="background-color:white; padding:1em">',
      '<a href="', twitter.url, '">',
      '<img src="', twitter.profile_image_url, '" height="48" width="48" />',
      '</a> <h3>', twitter.name, '</h3>',
      // ToDo: get an official link to the badge icon
      twitter.verified && ' <img src="' + 'http://si0.twimg.com/help/1307051362_737' + '"/>',
      twitter.verified && " <dfn>(" + l( "verified" ) + ')<dfn>',
      // '<br>', twitter.description,
      '</div><br>'
    );
  }
  
  if( session.is_novice ){
    this.push_help(
      l( 
"This page lists informations about a person, her votes, her delegations (received and given), etc."
      )
    );
  }

  var tag_set = this.push_title_and_search_form( p_label );
  
  this.open_div( "persona_view" );
  
  // Kudocracy domain?
  if( persona.is_domain() ){
    this.push(
      '<h2>',
      icon( "proposition" ), " ", l( "Domain propositions" ), " ",
      '<a href="?kudo=', p_label.substring( 1 ),
      '&page=propositions">', p_label, '</a></h2><br>'
    );
  }

  // Twitter tweet & follow buttons
  this.session.needs_twitter = true;
  this.push(
    '<div id="twitter_buttons">',
    '<a href="http://twitter.com/intent/tweet?screen_name=',
    p_label.substring( 1),
    '" class="twitter-mention-button">',
    'Tweet to ', p_label, '</a> ',
    '<a href="http://twitter.com/', p_label,
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow ', p_label, '</a></div>'
  );

  // Will maybe display each vote, not too much
  var display = session.has_enough_filter();

  // Are there propositions tagged with the user? if so, link to them
  var persona_topic = persona.get_topic();
  if( persona_topic ){
    var count_propositions = persona_topic.propositions().length;
    if( count_propositions ){
      // Display info about that personal tag, including vote menu
      this.push(
        '<br><div class="odd">'
      );
      this.push_vote_menu( 
        persona_topic,
        { with_twitter: true, float: "right" } 
      );
      var count_propositions = persona_topic.propositions().length;
      this.push( 
        '<h2>',
        icon( "tag" ), " ", // l( "tag" ), " ",
        link_to_proposition_page( persona_topic ),
        "</h2>"
      );
      if( count_propositions ){
        this.push(
          " - ",
          link_to_page(
            "persona",
            p_label + " all",
            "propositions"
          ),
          nuit_debout && " dot&eacute;e de ce tag",
          ' <dfn>(', persona_topic.propositions().length, ')</dfn> - ',
          //'<br>',
          proposition_summary( persona_topic, "", { avoid_author: persona } ),
          ""//"<br><br>"
        );
      }
      this.push( '</div>' );
    }
  }

  // propositions - delegations
  var delegateable_filter = session.delegateable_filter();
  
  var delegateable_tags = [];
  var delegateable_filter_label;
  if( delegateable_filter ){
    delegateable_filter_label = "";
    delegateable_filter.split( " " )
    .forEach( function( label ){
      if( !label )return;
      delegateable_filter_label += " " + l( label );
      delegateable_tags.push( Topic.find( label ) );
    });
    delegateable_filter_label = delegateable_filter_label.trim();
  }
  
  var index = -1;
  var div = item_divs( "expertize", true /* no hide button */ );
  
  // Delegations, expertizes as agent
  var expertizes = persona._delegation_expertizes;
  expertizes = expertizes.sort( function( a, b ){
    return b.count_votes - a.count_votes;
  });
  var elen = expertizes.length;
  
  // Make sure a delegation about the current delegateable filter is shown
  var can_delegate = ( visitor && visitor !== persona );
  var not_done
  =  can_delegate
  && delegateable_filter
  && ( p_label + " " + delegateable_filter ).toLowerCase();
  
  // Display all delegations that the persona can be given
  if( elen || not_done ){
    that.push(
      '\n\n<br><a id="delegate"></a><div>',
      '<h2>',
      icon( "indirect" ), " ", l( "Delegate" ), 
      '</h2>'
    );
    if( delegateable_filter ){
      this.push( 
        " ",
        icon( "propositions" ), "&nbsp;",
        link_to_page(
          "propositions",
          delegateable_filter,
          delegateable_filter_label.replace( / /g, "&nbsp;+&nbsp;" )
        ),
        " - ", link_to_page( 
          "persona", p_label + " all all", l( "all" ), "delegate"
        )
      );
    }
    if( !can_delegate ){
      that.br();
    }
    index = 0;
    Ephemeral.each( expertizes, function( expertize, eii ){
      // Don't display if already done
      if( delegateable_filter
      && !expertize.delegation.is_tagged( delegateable_tags )
      )return;
      can_delegate = visitor && ( visitor !== expertize.agent );
      index++;
      that.push( div[ index % 2 ] );
      if( can_delegate ){
        var label = expertize.label.replace( /\./g, " ");
        if( not_done && label.toLowerCase() === not_done ){
          not_done = null;
        }
        that.push(
          '<form name="delegation" url="/">',
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + expertize.label.replace( /\./g, " ") + '"/>',
          '<input type="submit" value="', l( "Delegate" ), '"/> '
        );
      }
      that.push(
        link_to_delegation_page(
          expertize.agent.label,
          expertize.tags_string()
        ),
        " - ",
        link_to_page(
          "propositions",
          // expertize.label.replace( /\./g, " "),
          expertize._delegation_filter.label.replace( /\./g, "&nbsp;+&nbsp;" ),
          icon( "propositions" )
        )
      );
      if( can_delegate ){
        that.push( '</form>' );
      }
      that.push( '</div>' );
    }); // end of .each( expertizes ... )
    // his.br();
  }
  
  // Delegate button for delegation to this persona about current filter
  if( not_done ){
    delegateable_filter_label = "";
    delegateable_filter.split( " " ).forEach( function( label ){
      if( label )return;
      delegateable_filter_label += " " + l( label );
    });
    delegateable_filter_label = delegateable_filter_label.trim();
    that.push(
      '\n<br><br><form name="delegation" url="/">',
      '<input type="hidden" name="i" value="set_delegation"/>',
      '<input type="hidden" name="i2" value="' + persona.id + '"/>',
      '<input type="hidden" name="i3" value="' + delegateable_filter + '"/>',
      '<input type="submit" value="', l( "Delegate" ), '"/> via ',
      link_to_persona_page( persona ), " ", l( "about" ), " ",
      link_to_page(
        "propositions",
        delegateable_filter,
        delegateable_filter_label.replace( / /g, "&nbsp;+&nbsp;" )
      ),
      '</form>\n'
    );
  }
  
  if( elen || not_done ){
    that.push( '</div>' );
  }
  
  // Delegations, given by persona to some agents
  var misc = ""
  if( delegateable_filter ){
    misc = new ui.Builder( 
      " ",
      icon( "propositions" ), "&nbsp;",
      link_to_page(
        "propositions",
        delegateable_filter,
        delegateable_filter_label.replace( / /g, "&nbsp;+&nbsp;" )
      ),
      " - ", link_to_page( 
        "persona", p_label + " all all", l( "all" ), "delegations"
      )
    );
  }
  that.push_delegations( persona, "<br>", misc );
  
  // Votes
  if( display ){
    
    // What are the votes to display?
    var comments_only = ( what === "comments" );
    var indirect_votes_only = ( what === "indirect" );
    var direct_votes_only = ( what === "direct" );
    var filter = session.filter_label();
    this.open_div( "votes" ).push(
      '<br><a id="votes"></a><h2>',
      icon( "votes" ), " ", l( "Votes" ),
      // " ",
      // link_to_persona_page( persona ),
      '</h2>'
    );
    if( delegateable_filter ){
      this.push( 
        " ",
        icon( "propositions" ), "&nbsp;",
        link_to_page(
          "propositions",
          delegateable_filter,
          delegateable_filter_label.replace( / /g, "&nbsp;+&nbsp;" )
        ),
        " - ", link_to_page( 
          "persona", p_label + " all all", l( "all" ), "votes"
        )
      );
    }

    this.push( '<br>', icon( "votes" ), " " );
    if( !comments_only && !direct_votes_only && !indirect_votes_only ){
      this.push( "<h3>", l( "all(s)" ), "</h3>" );
    }else{
      this.push(
        link_to_page( "persona", p_label + " all", l( "all(s)" ), "votes" )
      );
    }
    
    this.push( " - ", icon( "votes" ), "! " );
    if( comments_only ){
      this.push( "<h3>", l( "comments" ), "</h3>" );
    }else{
      this.push(
        link_to_page( 
          "persona", p_label + " comments", l( "comments"), "votes"
        )
      );
    }
    
    this.push( " - ", icon( "direct" ), " " );
    if( direct_votes_only ){
      this.push( "<h3>", l( "direct(s)" ), "</h3>" );
    }else{
      this.push(
        link_to_page(
          "persona", p_label + " direct", l( "direct(s)" ), "votes"
        )
      );
    }
    
    this.push( " - ", icon( "indirect" ), " " );
    if( indirect_votes_only ){
      this.push( "<h3>", l( "indirect(s)" ), "</h3>" );
    }else{
      this.push(
        link_to_page( 
          "persona", p_label + " indirect", l( "indirect(s)" ), "votes"
        )
      );
    }
    
    this.br();
    //buf.push( "<ol>" );
  }

  // Display each vote
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
  
  div = item_divs( "vote", true /* no hide button */ );
  
  Ephemeral.each( votes, function( vote ){

    if( vote.orientation() === Vote.neutral )return;
    if( !vote.filtered(
      session.filter,
      session.filter_query,
      persona // Versus that.session.visitor, POV
    ) )return;

    var proposition = vote.proposition;    
    if( !display ){
      tag_set.add_proposition( proposition );
      return;
    }
    
    // Keep non neutral direct votes (unless required otherwise)
    var display_it = true;
    var comment;
    if( comments_only ){
      comment = vote.get_comment_text();
      if( !comment ){
        display_it = false;
      }
    }else if( vote.orientation() === Vote.neutral ){
      display_it = false;
    }else if( direct_votes_only ){
      if( vote.delegation() !== Vote.direct ){
        display_it = false;
      }
    }else if( indirect_votes_only ){
      if( vote.delegation() === Vote.direct ){
        display_it = false;
      }
    }
    if( !display_it )return;
    
    index++;
    that.push( div[ index % 2 ] ); // "<li>" );
  
    tag_set.add_proposition( proposition );
    
    that.push_vote_menu( proposition, { with_twitter: true, float: "right" } );

    var label = proposition.label;
    var orientation = vote.orientation();
    var emoji_text = ui.emojied( orientation );
    
    that.push(
      "<em>", emoji_text, "</em> ",
      link_to_page( "proposition", label, l( label ) ), ' ',
      " ", time_label( vote.time_touched ), " ",
      //+ " <dfn>" + ui.emojied( entity.proposition.result.orientation() ) + "</dfn> "
      //+ time_label( entity.proposition.result.time_touched )
      !vote.is_direct()
      && " <dfn>(" 
        +  link_to_delegation_page( vote )
        +  ")</dfn> "
      //+ " for " + duration_label( entity.expire() - Kudo.now() )
    );
    
    // Add visitor vote if there is one on the same proposition
    var visitor_vote
    = visitor && visitor !== persona && proposition.get_vote_of( visitor );
    if( visitor_vote ){
      var visitor_text = "";
      // Flag vote when visitor's vote has a different orientation
      var visitor_orientation = visitor_vote.orientation();
      var visitor_delegation = visitor_vote.delegation();
      if( visitor_orientation !== orientation ){
        visitor_text
        += " <dfn>(" + l( "you" )
        + " " + ui.emojied( visitor_orientation );
        if( visitor_delegation !== Vote.direct ){
          emoji_text
          += " <dfn>"
          + link_to_delegation_page( visitor_vote )
          + "</dfn>";
        }
        visitor_text += ")</dfn>";
      // If same orientation and direct
      }else if( visitor_delegation === Vote.direct ){
        visitor_text
        += " <dfn>(" 
        + l( "you too" ) + ", " + l( "direct" )
        + ")</dfn>";
      // If same orientation, indirect
      }else{
        // Flag vote when visitor use the persona via a delegation
        if( visitor_delegation.agent === persona ){
          visitor_text 
          += "<em>" + l( "you too" ) + "</em> <dfn>("
          + link_to_page(
            "delegations",
            visitor_delegation.tags_string(),
            "delegation"
          ) 
          + ")</dfn>";
        // When same orientation but different delegation
        }else{
          visitor_text
          += "<dfn>(" + l( "you too" )
          + " " + link_to_delegation_page( visitor_vote )
          + ")</dfn>";
        }
      }
      that.push( " ", visitor_text );
    }

    if( comment ){
      that.push(
        '<div class="comment">',
        wikify_comment( comment ),
        '</div>'
      );
    }

    that.push( '</div>' ); // "</li>"
  });
  
  if( display ){
    this.close_div().br();
  }else{
    // this.push( "" );
  }
  
  this.push( "</div>" );
  
  this.close_div();
  
  // Inject list of all seen tags, to alter filter when clicked
  this.set_change_filter_links( tag_set );
  
  // buf.push( "</ol></div><br>" );
  this.unshift(
    ui.page_header_left(
      _,
      ui.link_to_twitter_user( p_label ),
      _, // link_to_page( "delegations" ),
      page_name
    )
  );
  this.push( ui.page_footer() );
  
} // page_persona()


/* ---------------------------------------------------------------------------
 *  page delegations
 */

function page_delegations( page_name ){
// The private page of a persona's delegations

  var persona = this.session.visitor;
  if( !persona )return this.redirect( "main" );
  
  var that = this;

  // Header
  this.set( ui.page_style( "your delegations" ) );

  if( this.session.is_novice ){
    this.push_help(
      l( 
  "This page lists your delegations to others who vote for you on propositions that match some specified tags."
      )
    );
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
  this.push( ui.recent_events_div( page_name ) );
  
  this.open_div( "delegations_view" );

  // Delegations
  var delegations = persona.delegations().sort( function( a, b ){
      // more tags first
    var count_a = a.tags.length;
    var count_b = b.tags.length;
    if( count_a !== count_b )return count_b - count_a;
    // recent first when same number of tags
    count_a = a.time_touched;
    count_b = b.time_touched;
    return count_b - count_a;
  });
  var votes_by_delegation = map(); // map of arrays
  Ephemeral.each( delegations, function( delegation ){
    votes_by_delegation[ delegation.id ] = [];
  });
  
  // Collect all indirect votes, by delegation
  var with_abuses = this.session.filter.indexOf( "#abuse " ) !== -1;
  var votes = persona.votes();
  var propositions_map = map();
  Ephemeral.each( votes, function( vote ){
    var delegation = Delegation.valid( vote.delegation() );
    if( !delegation )return;
    var proposition = Topic.valid( vote.proposition );
    if( !proposition )return;
    if( proposition.is_abuse() && !with_abuses )return;
    tag_set.add_proposition( proposition );
    propositions_map[ proposition.label ] = proposition;
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
  
  var index = -1;
  var div = item_divs( "delegation", true /* no hide button */ );

  // <h2> Delegations - delegates
  this.open_div( "delegates", "", "hide" ).h2(
    l( "Your delegates" )
  ).push(
    " - " + link_to_page( "delegates", "all all", l( "all(s)" ) ),
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
    '\n<br><form name="delegation" class="delegation_form" url="/">',
    '<input type="hidden" name="i" value="set_delegation"/>',
    l( "delegate" ), ' <input type="text" name="i2" value="', agent_value,
    '" placeholder="@someone"/>',
    ' tags <input type="text" name="i3" value="', filter_value,
    '" placeholder="#tag #tag2 #tag3..."/>',
    ' <input type="submit" value="', l( "Delegate" ), '"/>',
    '<br><br></form><br>\n'
  );

  // Display each delegation
  index = -1;
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
      var proposition_entity = Topic.find( proposition_label );
      var orientation = agent.get_orientation_on( proposition_entity );
      var emoji_text = emoji( orientation );
      str_proposition_labels += " "
      + emoji_text
      + link_to_page(
        "proposition",
        proposition_label,
        l( proposition_label )
      ) + ".";
    });

    index++;
    var tags = delegation.filter_string( persona );
    that.push(
      div[ index % 2 ],
      '<h2>',
      link_to_page( "delegates", "all " + tags, l( "via" ) ),
      " ",
      link_to_persona_page( delegation.agent ),
      "</h2>",
      ( delegation.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " ),
      link_to_page(
        "persona",
        delegation.agent.label + " all " + tags,
        l( tags )
      ),
      "<br><br>", str_proposition_labels ? str_proposition_labels + '<br>' : "",
      delegate_menu(
        delegation,
        l( "for another" ) + " " 
        + duration_label( delegation.expire() - Kudo.now() ) + " "
      ),
      '</div>'
    );
  });
  
  this.close_div();

  // Propositions, display them
  if( proposition_names.length ){ // && this.session.has_delegateable_filter() ){
    this.open_div( "propositions" ).hide_button().push(
      '<br><h2>Propositions</h2> - ',
      link_to_page(
        "propositions", "", icon( "zoom-in" ) + " " + l( "details" ) 
      ),
      "<br><br>"
    );
    var sort_criterias = Session.current.sort_criterias;
    if( !sort_criterias.length ){
      sort_criterias = [ "+name" ];
    }
    index = -1;
    proposition_names.sort( function( a, b ){
      return Ephemeral.compare_measures(
        Topic.find( a ),
        Topic.find( b ),
        sort_criterias,
        persona
      );
    }).forEach( function( label ){
      index++;
      that.push(
        div[ index % 2 ],
        "<h3>",
        icon( "zoom-in" ), " ",
        link_to_page( "proposition", label, l( label ) ),
        "</h3> "
      );
      var orientation;
      if( that.session.agent ){
        orientation
        = that.session.agent.get_orientation_on( Topic.find( label ) );
        if( orientation !== Vote.neutral ){
          that.push(
            ui.emojied( orientation ),
            " ",
            link_to_persona_page( that.session.agent ),
            ". "
          );
        }
      }
      var vote_entity = Vote.find( persona.id + "." + label );
      if( vote_entity ){
        orientation = vote_entity.orientation();
        var delegation = Delegation.valid( vote_entity.delegation() );
        if( delegation ){
          var tags = delegation.tags_string().trim();
          if( orientation !== Vote.neutral ){
            that.push(
              " ", l( "you" ), " ",
              ui.emojied( orientation ),
              " ",
              link_to_delegation_page( vote_entity ),
              " ", l( "about" ), " ",
              link_to_page(
                "propositions",
                tags,
                tags.replace( / /, " + " )
              )
            );
          }
        }
      }
      that.push( "</div>" );
    });
    this.close_div().br();
  }
  
  this.close_div();
  
  // Inject list of all seen tags, to alter filter when clicked
  this.set_change_filter_links( tag_set );
  
  this.unshift(
    ui.page_header_right(
      _,
      link_to_twitter_user( persona.label )
      //+ " " + link_to_page( persona.label, "visitor", "votes" )
    )
  );
  this.close_div().push( "<br>", ui.page_footer() );

} // page_delegations()


/* ---------------------------------------------------------------------------
 *  page_groups()
 */
 
function page_groups( page_name, name ){
  this.set( ui.page_style( "groups" ), ui.page_header() );
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
// This is the "propositions" page, either a list of tags or
// propositions, filtered.

  var nuit_debout = true;
  
  var session = this.session;

  if( page_name === "offline" ){
    trace( "serving the offline version of 'propositions' page" );
    if( l8.client ){
      trace( "BUG? only the server is expected to serve the 'offline' page" );
      debugger;
      return this.redirect( "main" );
    }
    // Server side code
    if( session.is_app ){
      trace( "BUG? unexpected 'offline' page in app mode" );
      debugger;
      return this.redirect( "!main" );
    }
    if( session.app_init_done ){
      trace( "BUG? unexpected 'offline' page after app mode init" );
      debugger;
      return this.redirect( "!main" );
    }
    if( session.magic_loader ){
      trace( "BUG? unexpected magic loaded 'offline' page in magic mode" );
      debugger;
      return this.redirect( "!main" );
    }
    if( session.page_init_done ){
      trace( "BUG? unexpected page init was done for 'offline' page" );
      debugger;
      return this.redirect( "!main" );
    }
    // Ask ui.page_style() to include browserified.js (aka uiclient.js)
    session.is_app = "offline";
    session.app_init_done = false;
    // Ask ui.page_style() to include kudo_magic() definition
    session.page_init_done = false;
  }

  var visitor = session.visitor;
  
  // Page for propositions is almost like page for tags
  var tag_page = page_name === "tags";
  
  var filter = session.filter;
  var delegateable_filter = session.delegateable_filter();
  
  var with_votes = visitor 
  && ( filter.indexOf( " #vote "     ) !== -1 
    || filter.indexOf( " #direct "   ) !== -1
    || filter.indexOf( " #indirect " ) !== -1
  );
  
  var sort_criterias = session.sort_criterias;
  var sort_criteria = sort_criterias[0];
  if( sort_criteria ){
    sort_criteria = sort_criteria.substring( 1 ); // Remove +/-
  }
  
  var criterias_with_counters = {
    total_votes: true,
    trust: true,
    changes: true,
    activity: true,
    direct_votes: true,
    indirect_votes: true,
    participation: true,
    protestation: true,
    success: true,
    voters_today: true,
    voters_this_week: true,
    voters_this_month: true,
    voters_this_year: true
  };
  
  // Will display results, author, age?
  var with_counters 
  = !sort_criteria || criterias_with_counters[ sort_criteria ];
  
  var with_author = sort_criteria === " author ";
  
  var with_age = with_author;
  if( !with_age && sort_criteria ){
    with_age = " age_modified age heat ".indexOf( sort_criteria ) !== -1;
  }
  
  // Will display number of comments?
  var criterias_with_comments_counter = {
    total_votes: true,
    activity: true,
    direct_votes: true,
    comments: true
  }
  var with_comments_counter
  = !sort_criteria || criterias_with_comments_counter[ sort_criteria ];
  
  // Header, actually inserted when count of filtered propositions is computed
  this.set( ui.page_style( "propositions" ) );
  
  if( session.is_novice ){
    this.push_help(
      l( "This page lists propositions." )
    );
    if( ! visitor ){
      this.push_help(
        " ", l( "If logged in, you can vote." ),
        " ", link_to_page( "login", "twitter_direct", icon( "login" ) )
      );
    }
  }

  // Title + search form + list of tags 
  var tag_set 
  = this.push_title_and_search_form( tag_page ? "Tags" : "Propositions" );
  this.push( ui.recent_events_div( page_name ) );

  this.push( '\n\n<div id="propositions_list">' );
  
  var date_range_slot_index = this.slot();

  // Will display list of matching propositions or tags, main content of page
  var propositions = Topic.all;
  var list = [];
  var count = 0;
  var attr;
  var entity;
  var visitor_tag = null;
  if( visitor ){
    visitor_tag = "#" + visitor.short_label();
  }

  // Skip tags in "propositions" page, unless some tags are inside filter
  var skip_tags = !tag_page 
  && filter.indexOf( " #tag "       ) === -1
  && filter.indexOf( " #persona"    ) === -1
  && filter.indexOf( " #impersonal" ) === -1;
  
  var without_orphans   = filter.indexOf( " #orphan "  ) === -1;
  var without_personas  = filter.indexOf( " #persona " ) === -1;
  
  var searching_domains = filter.indexOf( " #domain "  ) !== -1;
  if( searching_domains ){
    skip_tags = without_orphans = without_personas = false;
  }

  // Scan all propositions, could be a lot! Collect filtered ones
  Ephemeral.every( propositions, function( proposition ){
    
    // Apply filter
    if( proposition.is_tag() ){
      if( skip_tags )return true;
    }else{
      if( tag_page )return true;
    }
    if( !proposition.filtered(
      filter,
      session.filter_query,
      visitor
    ) )return true;

    // Filter out propositions without votes unless current user created it
    // or #orphan explicit filter or by author sort criteria.
    // Not for tags, they have much less votes
    if( !tag_page
    && !proposition.result.total()
    && without_orphans
    && !with_author
    && ( !visitor_tag || !proposition.has_tag( visitor_tag ) ) 
    )return true;
    
    // Filter out personas tag, unless #persona filter or author sort criteria
    if( tag_page
    && proposition.is_persona()
    && without_personas
    && !with_author
    )return true;

    // Avoid excessive size, exit loop
    if( ++count >= 200000 )return false;

    list.push( proposition );
    
    return true;
  });
  // list[] contains propositions to display
  
  // Sort list of propositions according to user specified sort order
  if( !sort_criterias.length ){
    // Default to "relevance", ie "heat" measure
    sort_criterias = [ "-heat" ];
  }
  list = list.sort( function( a, b ){
    // The last consulted proposition, if any, is before all the others
    // because this helps users
    if( a === session.proposition )return -1;
    if( b === session.proposition )return  1;
    return Ephemeral.compare_measures(
      a, b,
      sort_criterias,
      visitor
    );
  });
  
  // Filter out propositions without a meaning full measure
  var invalid_count = count;
  var valid_list = [];
  var measure = sort_criterias[ 0 ].substring( 1 );
  Ephemeral.each( list, function( proposition ){
    if( proposition.last_measure( measure ) 
    ||  proposition === session.proposition
    ){
      valid_list.push( proposition );
    }
  });
  list = valid_list;
  session.cached_count_propositions = count = valid_list.length;
  invalid_count -= count;
  
  // Keep the 200 first propositions to avoid html page size explosion
  if( list.length > 200 ){
    list = list.slice( 0, 200 );
  }

  // Display sorted matching propositions
  var that = this; // The PageBuilder object
  var display = tag_page || session.has_enough_filter();
  var sparklines = display && new Sparklines( this );
  var div = item_divs( "proposition" );
  
  Ephemeral.each( list, function( proposition, index ){
    
    if( !display ){
      tag_set.add_proposition( proposition );
      return;
    }

    // proposition's comment and name
    var comment = proposition_comment( proposition );
    if( comment ){
      comment += "<br>";
    }
    var persona = proposition.get_persona();
    var wiki = persona ? persona.label : proposition.label; 
    var vote;
    // Display vote, but only if it is indirect.
    // Note: orientation is displayed by vote_menu()
    var has_vote = visitor && visitor.get_vote_on( proposition );
    if( with_votes ){
      vote = has_vote;
      if( vote.delegation() === Vote.direct ){
        vote = null;
      }
    }
    that.push(
      '\n\n', div[ index % 2 ], '<div>',
      comment,
      '<h3>',
        proposition.is_tag() ? l( "Tag" ) + " " : "", // was "#"
        !has_vote && visitor && '<em>',
        icon( "zoom-in" ), " ",
        link_to_page( "proposition", proposition.label ),
        !has_vote && visitor && '</em>',
        tag_page && l( " is a good tag" ),
        " ",  
        !nuit_debout && blink_to_wiki_icon( wiki ),
      '</h3> ',
      proposition.is_persona()
      && ( '<dfn>(' 
        + link_to_persona_page( proposition.get_persona() )
        + ")</dfn> "
      ),
      vote && l( "you" ) + " " 
        + ui.emojied( vote.orientation() )
        + " " + link_to_delegation_page( vote )
    );
    
    // List of tags
    // ToDo: what if this gets too long?
    // ToDo: should be a stylizeable CSS list
    that.push( ' <span><small><dfn>' ); // style="white-space:nowrap">' );
    var on_tags = session.filter_tag_labels;
    tag_set.add_proposition( proposition, function( tag, label ){
      // Filter out tags that are part of the current filter, to improve S/N
      if( on_tags.indexOf( tag ) !== -1 )return;
      var topic = Topic.find( tag );
      var persona = topic && topic.get_persona();
      if( persona ){
        var alias = persona.get_alias();
        if( alias ){
          alias = alias.substring( 1 );
        }
        var toggle = link_to_command( "filter_toggle " + tag, alias || label );
        if( alias ){
          // Show true name in title of link if there is an alias displayed
          toggle = titled( toggle, persona.label );
        }
        that.push(
          link_to_persona_page( persona, "@" ), // "@" => no label, only image
          toggle,
          " "
        );
      }else{
        that.push(
          link_to_command( "filter_toggle " + tag, icon( label ) ),
          " "
        );
      }
    }, tag_page );
    
    that.push( '</dfn></small></span></div><div><br>' );
    
    that.push_vote_menu(
      proposition,
      { float: "right", compact: true, with_twitter: true }
    );
    
    // Summary for proposition: emoji, main orientation, other orientations, etc 
    that.push(
      '<div>',
      proposition_summary( proposition, "nocomment", {
        no_counters: !with_counters,
        no_comments: !with_comments_counter,
        no_author:   !with_author,
        no_age:      !with_age
      }),
      '</div>'
    );
    
    that.push( "</div>" );

     // Picture of others who voted
    var recommendations = ui.proposition_recommendations({
      proposition: proposition,
      persona: session.visitor,
      count: 36 // 24 + 2 px each, fits in 960px
    });
    if( recommendations.length ){
      that.push( ' <div style="float:right;">' ); // white-space:nowrap"><br>' );
      Ephemeral.each( recommendations, function( vote ){
        // Link to persona, the image is the clickable (vs dflt name or alias)
        that.push(
          titled(
            link_to_persona_page(
              vote.persona,
              avatar( vote.persona.label )
            ),
            persona_long_label( vote.persona ) 
            + " " 
            + l( vote.orientation() )
          )
        );
      });
      that.push( "</div>" );
    }

    sparklines && sparklines.add( proposition );
    
   // If tag, display link to tagged propositions, with count of propositions
    if( proposition.propositions().length ){
      that.push(
        '<br>',
        "" + proposition.propositions().length,
        " ", icon( "propositions" ) + " - ",
        link_to_page(
          "propositions",
          proposition.label,
          icon( "zoom-in" ) + " " + l( "details" )
        ),
        "<br>"
      );
    }

    that.push( '</div>\n' );
  });

  // Inject list of all seen tags, after filter/sort menu
  this.set_change_filter_links( tag_set, !display ); // hide only if display
  
  var msg1 = "";
  nuit_debout && ( msg1 += "Propositions : " );
  
  // Inject sparklines and date range
  if( sparklines ){
    sparklines.push();
  }
  
  if( !count ){
    if( invalid_count ){
      msg1 += l( "empty" ) + " " + ui.sort_label( true, true ) + ". ";
      msg1 += invalid_count + " " + icon( "propositions" ) + " ";
      msg1 += ui.sort_menunu( "", true /* dont_hide */ );
    }
  }else{
    
    if( count > 1 ){
      msg1 += ui.sort_menunu();
      nuit_debout && ( msg1 += "<br>" );
    }
    
    if( count >= 200 ){
      msg1 += l( "among" ) + " ";
    }
    
    msg1 += count + " " + icon( "propositions" ) + " ";
  
    if( sparklines ){
      msg1 +=
        l( "between" )
      + " "
      + time_label( sparklines.start_time )
      + " "
      + l( "and" )
      + " "
      + time_label( sparklines.end_time )
    }
    
    if( count > 1 ){
      var sort_msg = ui.sort_label( true );
      if( sort_msg ){
        msg1 += sort_msg;
      }
    }
    
    msg1 += ". " 
    + link_to_page( "ballot", "", l( "other&nbsp;dates" ) ) + ". ";
    
  }
  
  // new proposition
  if( visitor ){
    msg1 += link_to_page(
      "propose",
      "",
      '<span class="label label-success">'
      + l( "new&nbsp;proposition" )
      + '</span>'
    ); // + ".";
  }

  msg1 += '<br><br>';
  this.fill_slot( date_range_slot_index, msg1 );
  
  this.push( '</div>' );
  
  // Inject header, late, it depends on the filtered propositions count
  this.unshift( ui.page_header_left(
    _,
    session.has_filter()
    ? ui.link_to_tags( delegateable_filter )
    : _,
    _,
    page_name
  ) );
  
  this.push(  "<br>", ui.page_footer() );
  
} // page_propositions()


/* ---------------------------------------------------------------------------
 *  page ballot
 */
 
function page_ballot( page_name ){
// This page builds a query sent to page_ballot2() to show result of votes
// during a time period on a set of propositions by a set of people.

  var added_personas = map();
  
  if( Session.current.too_much_propositions() ){
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
    // if( topic.id === "salaireavie" )debugger;
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
  var seen_persona = map();
  personas.forEach( function( persona ){
    if( seen_persona[ persona.id ] )return;
    seen_persona[ persona.id ] = true;
    valid_query += persona.label + " ";
  });
  valid_query = "date"
  + " " + ( new Date( min_time ) ).toISOString()
  + " " + ( new Date( max_time ) ).toISOString()
  + " "
  + valid_query;
  
  return this.redirect( "ballot2 " + valid_query ); 
}


/*
 *  Display ballot results
 */

// Safari cannot parse ISO dates...
// This code comes from: http://jsfiddle.net/mplungjan/QkasD/
// I patched it to always return a valid Date object xor null.
// It does not detect some badly formed dates (month 13 is OK...).
// ToDo: use Yahoo's moments npm module?
var _date_from_ISO = (function(){
    var testIso = '2011-11-24T09:00:27+0200';
    // Chrome
    var diso= Date.parse(testIso);
    if(diso===1322118027000) return function(s){
        return new Date(Date.parse(s));
    }
    // JS 1.8 gecko
    var noOffset = function(s) {
      var day= s.slice(0,-5).split(/\D/).map(function(itm){
        return parseInt(itm, 10) || 0;
      });
      day[1]-= 1;
      day= new Date(Date.UTC.apply(Date, day));  
      var offsetString = s.slice(-5)
      var offset = parseInt(offsetString,10)/100; 
      if (offsetString.slice(0,1)=="+") offset*=-1;
      day.setHours(day.getHours()+offset);
      return day;
    }
    if (noOffset(testIso)===1322118027000) {
       return noOffset;
    }  
    return function(s){ // kennebec@SO + QTax@SO
        var day, tz, 
//        rx = /^(\d{4}\-\d\d\-\d\d([tT][\d:\.]*)?)([zZ]|([+\-])(\d{4}))?$/,
        rx = /^(\d{4}\-\d\d\-\d\d([tT][\d:\.]*)?)([zZ]|([+\-])(\d\d):?(\d\d))?$/,
            
        p= rx.exec(s) || [];
        if(p[1]){
            day= p[1].split(/\D/).map(function(itm){
                return parseInt(itm, 10) || 0;
            });
            day[1]-= 1;
            day= new Date(Date.UTC.apply(Date, day));
            if(!day.getDate()) return null;
            if(p[5]){
                tz= parseInt(p[5], 10)/100*60;
                if(p[6]) tz += parseInt(p[6], 10);
                if(p[4]== "+") tz*= -1;
                if(tz) day.setUTCMinutes(day.getUTCMinutes()+ tz);
            }
            return day;
        }
        return null;
    }
})();


function date_from_ISO( str ){
  var date = _date_from_ISO( str );
  if( !date )return date;
  if( isNaN( date ) )return null;
  if( !date.getTime )return null;
  if( isNaN( date.getTime() ) )return null;
  return date;
}


function page_ballot2( /* page_name, ...query */ ){
  
  // This page let's visitor ask for results about propositions by specified
  // personas
  var query = slice1( arguments ).join( " " );

  this.set( ui.page_style( "ballot" ) );

  if( this.session.is_novice ){
    this.push_help(
      l( 
  "This page lists results for specified voters on specified propositions, with a date limit."
      )
    );
  }

  // Display Title + alloc space for list of tag filters
  this.session.set_current_page( [ "ballot" ] ); 
  var tag_set = this.push_title_and_search_form( l( "Ballot" ) );
  
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
          date = date_from_ISO( date_str );
        }else{
          date2 = date_from_ISO( date_str );
        }
      }catch( err ){
        that.push( " date ??? ", date_str, " " );
      }
      return "";
    }
  ) 
  .replace( /20[\d]{2}(\/|-)[\d]{2}(\/|-)[\d]{2}/g, function( date_str ){
    // ToDo: issue with last second votes...
    date_str = date_str.replace( /\//g, "-" ) + "T23:59:59";
    try{
      if( date ){
        date_str = date_str.replace( /\//g, "-" ) + "T23:59:59";
        date = date_from_ISO( date_str );
      }else{
        date_str = date_str.replace( /\//g, "-" ) + "T00:00:00";
        date2 = date_from_ISO( date_str );
      }
    }catch( err ){
      that.push( " date ??? ", date_str, " " );
    }
    return "";
  })
  // Extract voter names
  .replace( /@[a-z0-9_]+/gi, function( name ){
    if( ( persona_entity = Persona.find( name ) )
    &&  personas.indexOf( persona_entity === -1 )
    ){
      if( personas.indexOf( persona_entity ) === -1 ){
        personas.push( persona_entity );
      }
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
    
    var added_personas = map();
    
    // Collect topics that match the filter && the voters
    Ephemeral.each( tags, function( topic ){
      
      // Collect all personas (unique ones)
      topic.votes_log().forEach( function( vote_value ){
        
        if( !vote_value )return;
        
        // Skip neutral voter
        if( vote_value.orientation === Vote.neutral )return;
        
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
  var npersonas = personas.length;
  
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
  
  valid_query += "\n" + l( "voter" ) + "\n";
  personas.forEach( function( persona ){
    valid_query += "  " + persona.label + "\n";
  });
  
  // Build a form, with the query in a textarea, big enough to avoid scrolling
  this.push( '<br>' );
  this.open_div( "ballot_view" );
  if( this.session.is_novice ){
    this.push_help(
      l( 
    "You can change the limit dates, the propositions and the authorized voters: "
      ),
      "<br>"
    );
  }
  this.push(
    '<form name="ballot" class="ballot" method="POST" url="/">',
    '<input type="hidden" value="ballot2" name="page"/>',
    '<textarea class="ballot_text_area" name="i2" autofocus cols=40 rows="'
    + ( 6 + tags.length + personas.length )
    + '">\n',
    Wiki.htmlize( valid_query ),
    '\n</textarea>',
    '<br><input type="submit" value="', l( "Results" ), '"/>',
    '</form><br>\n'
  );
  
  var time_start = date  && date.getTime();
  var time_limit = date2 && date2.getTime();
  var sparklines = new Sparklines( this );
  
  // Display number of voters and number of propositions
  this.push( 
    icon( "votes" ),
    " ", l( "between" ), " ",
    time_label( time_start ),
    " ", l( "and" ), " ", time_label( time_limit ), ". ",
    npersonas, " ", icon( "personas" ), ". ",
    tags.length, " ", icon( "propositions" ), ".<br>"
  );
  
  // Collect votes and count orientations
  var that = this;
  var buf_votes = new ui.Builder();

  var div = item_divs( "tag" );
  
  var index = -1;
  Ephemeral.each( tags, function( tag ){
    
    var total          = 0;
    var count_for      = 0;
    var count_disagree = 0;
    var count_blanks   = 0;
    var buf_proposition_votes = new ui.Builder();
    index++;
    that.push(
      div[ index % 2 ],
      '<h3>',
      icon( "zoom-in" ), " ",
      link_to_page( "proposition", tag.label, l( tag.label ) ),
      '</h3> '
    );
    tag_set.add_proposition( tag );
    
    buf_votes.push(
      div[ index % 2 ],
      '<h3>',
      icon( "zoom-in" ), " ",
      link_to_page( "proposition", tag.label, l( tag.label ) ),
      '</h3> '
    );
    
    var seen_persona = map();
    Ephemeral.each( personas, function( persona ){
      
      if( seen_persona[ persona.id ] )return;
      seen_persona[ persona.id ] = true;
      
      var vote = tag.get_vote_of( persona );
      if( !vote )return;
      
      var vote_value = vote.get_old_value( time_start, time_limit );
      if( !vote_value )return;
      
      var orientation = vote_value.orientation;
      
      if( orientation && orientation === Vote.neutral )return;
      
      buf_proposition_votes.push( '\n<br>'
        + link_to_persona_page( persona, persona.label )
        + ' '
      );
      if( false ){
        var agent_label = vote_value.agent_label;
        if( agent_label ){
          buf_proposition_votes.push(
            ' <dfn>(',
            link_to_delegation_page( vote ),
            ')</dfn> '
          );
        }
      }
      buf_proposition_votes.push( ui.emojied( orientation ) );
      
      total++;
      if( orientation === Vote.agree ){
        count_for++;
      }else if( orientation === Vote.blank || orientation === Vote.protest ){
        count_blanks++;
      }else{
        de&&mand( orientation === Vote.disagree );
        count_disagree++;
      }
    });
    
    // Skip if no votes
    if( total ){
    
      // Display results
      
      var result_total = count_for + count_disagree;
      var result_percent = 0;
      var emojied_result;
      
      if( count_for > count_disagree ){
        result_percent 
        = Math.round( ( count_for / result_total ) * 1000 ) / 10;
        emojied_result = ui.emojied( "agree" )
      }else{
        result_percent 
        = Math.round( ( count_disagree / result_total ) * 1000 ) / 10;
        emojied_result = ui.emojied( "disagree" );
      }
      emojied_result += " " + result_percent + "%";

      var ratio_for      = Math.round( 1000 * ( count_for      / total) ) / 10;
      var ratio_disagree = Math.round( 1000 * ( count_disagree / total) ) / 10;
      var ratio_blanks   = Math.round( 1000 * ( count_blanks   / total) ) / 10;
      var participation  = Math.round( 1000 * ( total     / npersonas ) ) / 10;
      var sp = "&nbsp;";
      var percent = "&nbsp;<dfn>(";
      var end_percent = "%)</dfn>";
      
      that.push(
        '<em>', emojied_result, '</em><br>',
        
        icon( "agree" ), " ", l( "agree" ), sp, 
        "" + count_for, percent, "" + ratio_for, end_percent, ". ", 
        
        icon( "disagree" ), " ", l( "disagree" ), sp,
        "" + count_disagree, percent, "" + ratio_disagree, end_percent, ". ", 
        
        l( "blank" ), sp, 
        "" + count_blanks, percent, "" + ratio_blanks, end_percent, ". ", 
        
        l( "total" ), sp, 
        "" + total, percent, "" + participation, end_percent,
        
        ". <br>"
      );
      
      // Display sparkline
      sparklines.add( tag, time_start, time_limit, personas );
    
    }
    
    // Bufferize future display of votes
    buf_proposition_votes.push( "<br></div>" );
    buf_votes.push( buf_proposition_votes.join() );
    that.push( '<br></div>' );
  });
  
  // Display bufferized personal votes
  this.open_div( "votes" )
    .push( "<br><h2>", l( "Votes" ), "</h2><br>", buf_votes.join() )
  .close_div();
  
  // Inject list of all seen tags
  this.set_change_filter_links( tag_set );
  
  // Inject sparklines
  sparklines.push();
  
  this.unshift( ui.page_header_left( 
    _,
    this.session.has_filter()
    ? ui.link_to_tags( this.session.delegateable_filter() )
    : _,
    _,
    "ballot"
  ) );
  
  this.close_div();
  this.push( "<br>", ui.page_footer() );
  
} // page_ballot2()


/* ---------------------------------------------------------------------------
 *  page votes
 */

function page_votes( page_name, display_what ){
// This is the votes page of the application, filtered.

  var nuit_debout = true;

  var session = this.session;
  var persona = session.visitor;
  
  if( !display_what )return this.redirect( "votes comments" );
  
  if( session.too_much_propositions() ){
    return this.redirect( "propositions" );
  }
  
  // session.remove_confusing_new_filter();
  
  // What are the votes to display?
  var comments_only = ( display_what === "comments" );
  var indirect_votes_only = ( display_what === "indirect" );
  var direct_votes_only = ( display_what === "direct" );
    
  // Header
  var that = this;
  this.set( ui.page_style( "votes" ) );

  if( session.is_novice ){
    this.push_help(
      l( "This page lists direct individual votes on propositions." )
    );
  }

  var tag_set = this.push_title_and_search_form( l( "Votes" ) );
  this.push( ui.recent_events_div( page_name ) );
  
  this.push( '<div id="votes_view">' );
  
  // page votes - Display list of matching votes
  var votes = Vote.log; // All votes!
  var vote_value;
  var entity;
  var visitor_tag = null;
  if( persona ){
    visitor_tag = "#" + persona.short_label();
  }
  var count = 0;
  var propositions = [];
  var proposition;
  
  var time_limit = 0;
  var now = l8.now;
  var sort_criteria = session.sort_criterias[ 0 ];
  var idx_voters = sort_criteria && sort_criteria.indexOf( "voters_" );
  var span = "all";
  if( sort_criteria && idx_voters !== -1 ){
    var span = sort_criteria.substring( idx_voters + "voters_".length );
    if( span === "today" ){
      time_limit = now - Kudo.ONE_DAY;
    }else if( span === "this_week" ){
      time_limit = now - Kudo.ONE_WEEK;
    }else if( span === "this_month" ){
      time_limit = now - Kudo.ONE_MONTH;
    }else if( span === "this_year" ){
      time_limit = now - Kudo.ONE_YEAR;
    }else{
      span = "all";
    }
  } 

  // page votes - Scan votes, last ones first
  var ii = votes.length;
  var valid_votes = [];
  while( ii-- ){

    vote_value = votes[ ii ];
    
    if( time_limit && vote_value.snaptime < time_limit )break;
    
    entity = vote_value.entity;

    if( !entity
    || !entity.filtered( session.filter, session.filter_query, persona )
    )continue;

    // Filter out propositions without votes unless current user created it
    if( !entity.proposition.result.total()
    && ( !visitor_tag || !entity.proposition.has_tag( visitor_tag ) ) // ToDo: remove #jhr mention
    && ( !visitor_tag || visitor_tag !== "#jhr" )  // Enable clean up during alpha phase
    )continue;

    // Keep some votes
    var display = true;
    
    if( comments_only ){
      if( !vote_value.comment_text ){
        display = false;
      }
    
    // Filter out neutral vote when it is not a change, too noisy
    }else if( false && vote_value.orientation          === Vote.neutral
    &&        vote_value.previous_orientation === Vote.neutral
    ){
      display = false;
      
    }else if( direct_votes_only ){
      if( vote_value.delegation ){
        display = false;
      }
      
    }else if( indirect_votes_only ){
      if( !vote_value.delegation ){
        display = false;
      }
    }
    
    // if( vote_value.orientation === Vote.neutral )debugger;
    
    if( display ){
      count++;
      // Avoid excessive cpu
      if( count >= 200000 )break;
      valid_votes.push( vote_value );
      if( propositions.indexOf( entity.proposition ) === -1 ){
        propositions.push( entity.proposition );
      }
    }
  }
  
  // page votes - Inject tags of all seen propositions
  propositions.forEach( function( proposition ){
    tag_set.add_proposition( proposition );
  });
  
  // page votes - Sort
  var sort_criterias = this.session.sort_criterias;
  if( !sort_criterias.length ){
    sort_criterias = [ "-heat" ];
  }
  valid_votes = valid_votes.sort( function( a, b ){
    var name_a = a.proposition;
    var name_b = b.proposition;
    if( name_a === name_b )return b.snaptime - a.snaptime;
    var prop_a = Topic.find( name_a );
    var prop_b = Topic.find( name_b );
    // The last consulted proposition, if any, is before all the others
    // because this helps to avoid lost users
    if( prop_a === Session.current.proposition )return -1;
    if( prop_b === Session.current.proposition )return  1;
    if( prop_a && prop_b ){
      return Ephemeral.compare_measures(
        prop_a,
        prop_b,
        sort_criterias,
        persona
      );
    }
    return name_a > name_b ? 1 : -1;
  });
  
  // page votes - Filter out propositions without a meaning full measure
  var valid_list = [];
  var measure = sort_criterias[ 0 ].substring( 1 );
  valid_votes.forEach( function( vote ){
    var topic = Topic.find( vote.proposition );
    if( !topic 
    || topic.last_measure( measure ) 
    || topic === session.proposition
    ){
      valid_list.push( vote );
    }
  });
  valid_votes = valid_list;
  
  /// page votes - Reduce amount displayed
  if( valid_votes.length > 200 ){
    valid_votes = valid_votes.slice( 0, 200 );
  }
  
  // page votes - Show number of propositions and sort criteria
  var count_propositions = propositions.length;
  var msg1 = "";
  
  if( !valid_votes.length ){
    msg1 += l( "empty" ) + " " + ui.sort_label( true, true ) + ". ";
    if( count_propositions ){
      msg1 += count_propositions + " " + icon( "propositions" ) + " ";
    }
    msg1 += ui.sort_menunu( "", true /* dont_hide */ );
    msg1 += "<br>"
    
  }else{
    
    msg1 += valid_votes.length + " " + icon( "votes" );
    nuit_debout && ( msg1 += " votes" );
    msg1 += ". ";
    
    if( valid_votes.length >= 200 ){
      msg1 = l( "among" ) + " " + msg1;
    }
    
    msg1 += count_propositions + " " + icon( "propositions" );
    nuit_debout && ( msg1 += " propositions" );
    
    msg1 += ". ";
    
    if( count_propositions > 1 || span !== "all" ){
      msg1 += ui.sort_label( true ),
      msg1 += ui.sort_menunu();
    }
    
  }
  
  this.push( msg1 );
  
  if( count_propositions ){
    this.push(
      "<br>", 
      link_to_page( 
        "propositions", "", icon( "zoom-in" ) + " " + l( "details" ) 
      ), 
      nuit_debout && " des propositions",
      ". ",
      link_to_page(
        "delegates",
        "all",
        icon( "delegations" ) + " " + l( "delegations" )
      ),
      "."
    );
  }
  
  // page votes -
  if( true || valid_votes.length ){
    
    var filter = session.filter_label();    
    this.push(
      '<br><br><div><a id="votes"></a><h2>',
      l( "Votes" ), "</h2> <dfn>", filter, "</dfn>",
      filter 
      && " - " + link_to_page( "votes", "all all", l( "all" ), "votes" ),
      "<br>"
    );
  
    this.push( icon( "votes" ), " " );
    if( !comments_only && !direct_votes_only && !indirect_votes_only ){
      this.push( "<h3>", l( "all(s)" ), "</h3>" );
    }else{
      this.push(
        link_to_page( "votes", "all", l( "all(s)" ), "votes" )
      );
    }
    
    this.push( " - ", icon( "votes" ), "! " );
    if( comments_only ){
      this.push( 
        "<h3>",
        nuit_debout && "avec ",
        l( "comments" ), 
        "</h3>"
      );
    }else{
      this.push(
        link_to_page( 
          "votes", 
          "comments", 
          (nuit_debout ? "avec " : "" ) + l( "comments" ), 
          "votes"
        )
      );
    }
    
    this.push( " - ", icon( "direct" ), " " );
    if( direct_votes_only ){
      this.push( "<h3>", l( "direct(s)" ), "</h3>" );
    }else{
      this.push(
        link_to_page( "votes", "direct", l( "direct(s)" ), "votes" )
      );
    }
    
    this.push( " - ", icon( "indirect" ), " " );
    if( indirect_votes_only ){
      this.push( "<h3>", l( "indirect(s)" ), "</h3>" );
    }else{
      this.push(
        link_to_page( "votes", "indirect", l( "indirect(s)" ), "votes" )
      );
    }
    
    this.br();
  
  }

  // page votes - Display votes
  var seen_comments = map();
  var last_proposition;
  
  // Handle even/odd rows
  var div = item_divs( "vote" );
  
  var index = -1;
  var after_comment = false;
  
  valid_votes.forEach( function( vote_value ){
    
    proposition = vote_value.entity.proposition;
    var comment = vote_value.comment_text;
    if( comment ){
      if( !seen_comments[ comment ] ){
        seen_comments[ comment ] = true;
      }else{
        comment = "";
      }
    }
    if( comments_only && !comment )return;
    
    if( last_proposition && proposition !== last_proposition ){
      if( comments_only ){
        that.push( "</table>" );
      }
      that.push( '\n</div>' );
    }
    
    if( proposition !== last_proposition ){
      index++;
      that.push( div[ index % 2 ] );
      var label = proposition.label;
      that.push(
        "<h3>",
        icon( "zoom-in" ), " ",
        ( proposition.is_tag() ? "tag " : "" ),
        link_to_page( "proposition", label, l( label ) ),
        "</h3>"
      );
      that.push_vote_menu(
        proposition,
        { with_twitter: true, float: "right" }
      );
      that.br();
      if( comments_only ){
        that.push( "<table>" );
      }
    }else{
      if( !after_comment ){
        that.br();
      }
    }
    
    last_proposition = proposition;
    
    var orientation_text = vote_value.orientation;
    var persona_text = link_to_persona_page(
      vote_value.persona_label
    );
    var agent_label;
    var delegation_text = "";
    if( vote_value.delegation !== Vote.direct ){
      var delegation_entity = Delegation.find( vote_value.delegation );
      if( delegation_entity ){
        delegation_text = ' <dfn>('
        + link_to_delegation_page( delegation_entity )
        + ')</dfn> ';
      }else{
        delegation_text = ' <dfn>(' 
        + icon( "indirect" ) + " " + link_to_persona_page( vote_value.agent )
        + ')</dfn> ';
      }
    }
    var previous_orientation_text = "";
    previous_orientation_text = "<dfn>"
    + emoji( vote_value.previous_orientation )
    + " " + icon( "arrow right" ) + " </dfn>";
    
    var current_orientation;
    if( Vote.valid( vote_value.entity ) ){
      var orientation_now = vote_value.entity.orientation();
      if( orientation_now !== vote_value.orientation ){
        current_orientation = ' <dfn>(' 
        + l( "now" ) + " " + emoji( orientation_now );
        var delegation_now = vote_value.entity.delegation();
        if( delegation_now !== Vote.direct ){
          current_orientation += " " + link_to_delegation_page( delegation_now );
        }
        current_orientation += ")</dfn>";
      }
    }
    if( comments_only ){
      that.push( "<tr><td>" );
    }
    that.push(
      " ",
      persona_text,
      nuit_debout && " a vot&eacute; ",
      " ",
      previous_orientation_text,
      ui.emojied( orientation_text ),
      delegation_text,
      " <small>",
      time_label( vote_value.snaptime ),
      "</small>",
      current_orientation
    );
    if( comments_only ){
      that.push( "</td><td>" );
    }
    after_comment = false;
    if( comment ){
      that.push(
        '<div class="comment">',
        wikify_comment( comment, true /* no truncate */ ),
        '</div>'
      );
      after_comment = true;
    }
    if( comments_only ){
      that.push( "</td></tr>" );
    }
    // buf.push( "</li>" );
  });
  
  // Close last open even/odd div
  if( index !== -1 ){
    if( comments_only ){
      that.push( "</table>" );
    }
    that.push( '\n</div>\n' );
  }
  
  this.push( "\n</div></div>\n" );

  // Inject list of all seen tags, to alter filter when clicked
  this.set_change_filter_links( tag_set );
  
  // page votes - header & footer
  this.unshift(
    ui.page_header_left(
      _,
      this.session.has_filter()
      ? ui.link_to_tags( that.session.delegateable_filter() )
      : _,
      _,
      "votes"
    )
  );
  this.push(  "<br>", ui.page_footer() );
  
} // page_votes()


/* ---------------------------------------------------------------------------
 *  page delegates
 */

function page_delegates( page_name, optional_proposition_name ){
  
  var session = this.session;
  
  // Is there a proposition that agents must have a vote about?
  var about_proposition
  = ( optional_proposition_name === "all" )
  ? null
  : Topic.find( optional_proposition_name );

  var that = this;
  var persona = session.visitor;
  
  this.set( ui.page_style( "delegations" ) );
  
  if( session.is_novice ){
    this.push_help(
      l( 
  "This page lists indirect votes via delegates and associated tags."
      )
    );
    if( !persona ){
      this.push_help(
        " ", l( "If logged in, you can delegate." ),
        " ", link_to_page( "login", "twitter_direct", icon( "login" ) )
      );
    }
    if( about_proposition ){
      this.push_help( " ", l(
        "Results are about votes of whoever casted a vote on proposition"
      ), ' "', about_proposition.label, '".' );
    }
  }

  var title = icon( "Delegates" );
  if( about_proposition ){
    title += " <h2>" + link_to_proposition_page( about_proposition ) + "</h2>";
  }
  
  var tag_set = this.push_title_and_search_form( title );
  this.push( ui.recent_events_div( page_name ) );
  
  this.push( '<div id="delegates_view">' );
  
  // page delegates - Scan all votes
  var votes = Vote.get_log(); // All votes!
  
  var time_limit = 0;
  var now = l8.now;
  var sort_criteria = session.sort_criterias[ 0 ];
  var idx_voters = sort_criteria && sort_criteria.indexOf( "voters_" );
  var span = "all";
  if( sort_criteria && idx_voters !== -1 ){
    var span = sort_criteria.substring( idx_voters + "voters_".length );
    if( span === "today" ){
      time_limit = now - Kudo.ONE_DAY;
    }else if( span === "this_week" ){
      time_limit = now - Kudo.ONE_WEEK;
    }else if( span === "this_month" ){
      time_limit = now - Kudo.ONE_MONTH;
    }else if( span === "this_year" ){
      time_limit = now - Kudo.ONE_YEAR;
    }else{
      span = "all";
    }
  } 

  var vote_value;
  var entity;
  var visitor_tag = null;
  if( persona ){
    visitor_tag = "#" + persona.short_label();
  }
  var seen_agents = map();
  var seen_personas = map();
  var seen_vote = map();
  var agent_ids = [];
  var count_agents = 0;
  var count_personas = 0;
  var seen_propositions = map();
  var propositions = [];
  var count_propositions = 0;
  var indirect_count_by_proposition = map();
  var direct_count_by_proposition = map();
  var count_delegations_by_agent = map();
  var delegation_counts_by_agent = map(); // counts dispatched by tag filters
  var delegations_by_agent = map();
  var tag_ids_by_delegation = map();
  var count_delegations_by_tags = map();
  var delegation_counts_by_tags = map(); // counts dispatched by agent
  var all_tag_ids = [];
  var delegation;
  var max_votes = 0;
  var count_direct_votes   = 0;
  var count_indirect_votes = 0;
  var last_vote;
  var proposition;
  var voter;
  var cache_filtered_out_propositions = map();
  var voter_to_skip = map();
  var voter_to_include = map();
  
  // page delegates - Scan votes, last ones first, looking for indirect votes
  var ii = votes.length;
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
    if( time_limit && vote_value.snaptime < time_limit )break;
    
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
    
    if( voter_to_skip[ voter.label ] )continue;
    
    // Skip votes from whoever never voted on optional focused proposition
    if( about_proposition && !voter_to_include[ voter.label ] ){
      if( !about_proposition.get_non_neutral_vote_of( voter ) ){
        voter_to_skip[ voter.label ] = true;
        continue;
      }
      voter_to_include[ voter.label ] = true;
    }
    
    if( !proposition.filtered( 
      session.filter,
      session.filter_query,
      persona
    ) ){
      cache_filtered_out_propositions[ proposition.id ] = true;      
      continue;
    }

    // Skip neutral votes
    if( vote_value.orientation === Vote.neutral )continue;
    
    // Skip direct votes
    if( vote_value.delegation === Vote.direct ){
      count_direct_votes++;
      if( direct_count_by_proposition[ proposition.id ] ){
        direct_count_by_proposition[ proposition.id ]++;
      }else{
        direct_count_by_proposition[ proposition.id ] = 1;
      }
      continue;
    }
    
    if( voter_to_skip[ vote_value.agent_label ] )continue

    // Skip indirect vote if expired agent or no vote on optional proposition
    voter = Persona.find( vote_value.agent_label );
    if( !voter ){
      trace(
        "Skip indirect vote by voter " + vote_value.agent_label,
        "proposition", vote_value.proposition
      );
      voter_to_skip[ vote_value.agent_label ] = true;
      continue;
    }
    if( about_proposition && !voter_to_include[ voter.label ] ){
      if( voter_to_skip[ voter.label ] )continue;
      if( !about_proposition.get_non_neutral_vote_of( voter ) ){
        voter_to_skip[ voter.label ] = true;
        continue;
      }
      voter_to_include[ voter.label ] = true;
    }
    
    count_indirect_votes++;
    last_vote = vote_value;
    
    // Remember new proposition's tags
    if( count_propositions < 200 && !seen_propositions[ proposition.id ] ){
      seen_propositions[ proposition.id ] = true;
      tag_set.add_proposition( proposition );
      count_propositions++;
      propositions.push( proposition );
      indirect_count_by_proposition[ proposition.id ] = 0;
      direct_count_by_proposition[ proposition.id ] = 0;
    }
    if( seen_propositions[ proposition.id ] ){
      indirect_count_by_proposition[ proposition.id ]++;
    }
    
    if( count_agents >= 200 )continue;
    
    // Remember new persona
    var persona_id = vote_value.persona;
    if( !seen_personas[ persona_id ] ){
      seen_personas[ persona_id ] = true;
      count_personas++;
    }
    
    // Remember new agent
    var agent_id = vote_value.agent_label;
    if( !seen_agents[ agent_id ] ){
      seen_agents[ agent_id ] = true;
      delegations_by_agent[ agent_id ] = [];
      count_delegations_by_agent[ agent_id ] = 0;
      delegation_counts_by_agent[ agent_id ] = map();
      agent_ids.push( agent_id );
      count_agents++;
    }
    
    delegation = Delegation.find( vote_value.delegation );
    if( delegation ){
      delegations_by_agent[ agent_id ].push( delegation );
    }
    count_delegations_by_agent[ agent_id ]++;
  }

  // Sort propositions, by decreasing number of indirect votes
  // Sort list of proposition according to user specified sort order
  var sort_criterias = session.sort_criterias;
  if( !sort_criterias.length ){
    // Default to number of indirect votes measure
    sort_criterias = [ "-indirect_votes" ];
  }
  propositions = propositions.sort( function( a, b ){
    // The last consulted proposition, if any, is before all the others
    // because this helps to avoid lost users
    if( a === Session.current.proposition )return -1;
    if( b === Session.current.proposition )return  1;
    return Ephemeral.compare_measures(
      a, b,
      sort_criterias,
      persona
    );
  });
  
  // Sort agents by number of delegated votes
  agent_ids = agent_ids.sort( function( a, b ){
    return count_delegations_by_agent[ b ] - count_delegations_by_agent[ a ];
  });
  
  // page delegates - Will display propositions after the delegations
  var buf2 = new ui.Builder();
  buf2.set_session( session );
  var count_propositions = propositions.length;
  
  if( count_propositions ){
    
    buf2.push(
      '<div id="propositions">',
      '<div class="hide_button"></div>',
      '<br><h2>',
      icon( "Propositions" ), " ", l( "Propositions" ),
      '</h2><br>'
    );
    
    // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
    var propositions_graph_pie = [ [ "direct", count_direct_votes ] ];
    if( session.can_script && ( l8.server || window.google ) ){
      buf2.push(
        '<div><div class="hide_button"></div>',
        '<div id="propositions_chart_div" class="chart_pie"></div>',
        '</div>'
      );
    }else{
      buf2.push( "<br><br>" );
    }
  
    // Show number of voters, number of propositions and sort criteria
    // buf2.br();
    if( count_personas > 1 ){
      buf2.push(
        count_personas, " ",
        icon( "voters" )
      );
      if( about_proposition ){
        buf2.push(
          " <dfn>(",
          link_to_proposition_page( about_proposition ),
          ")</dfn>"
        );
      }
      buf2.push( ". " );
    }
  
    var msg1 = "";
    msg1 += ui.sort_menunu();
    msg1 += count_propositions + " " + icon( "propositions" );
    if( span !== "all" ){
      msg1 += " <dfn>(" + l( span ) + ")</dfn>";
    }
    if( count_propositions > 200 ){
      msg1 = l( "more than" ) + " " + msg1;
    }
    buf2.push(
      msg1,
      ". ", ui.sort_label( true ),
      " - ",
      link_to_page( 
        "propositions", "", icon( "zoom-in" ) + " " + l( "details" ) 
      ),
      "<br>"
    );
  
    var other_count = count_indirect_votes;
    var shown_propositions = 0;
    
    var index = -1;
    var div = item_divs( "proposition" );
    
    // page delegates - Display each proposition (top 10 in chart)
    Ephemeral.each( propositions, function( proposition ){
      index++;
      var count_direct_votes   = direct_count_by_proposition[ proposition.id ];
      var count_indirect_votes = indirect_count_by_proposition[ proposition.id ];
      var count_votes          = count_direct_votes + count_indirect_votes;
      var ratio_direct = Math.round( 1000 * ( 
        count_direct_votes / count_votes
      ) ) / 10;
      var ratio_indirect = Math.round( 1000 * ( 
        count_indirect_votes / count_votes
      ) ) / 10;
      var nbsp = "&nbsp;";
      buf2.push(
        div[ index % 2 ],
        '<h3>',
        link_to_page( "delegates", proposition.label, l( proposition.label ) ),
        '</h3>',
        ' ', 
        count_votes, " ", icon( "votes" ), ". ", 
        l( "direct" ), nbsp, count_direct_votes,
        nbsp, '<dfn>', ratio_direct,   "%</dfn>. ",
        l( "indirect" ), nbsp, count_indirect_votes,
        nbsp, '<dfn>', ratio_indirect, "%</dfn>. "
      );
      buf2.push_vote_menu( 
        proposition,
        { with_twitter: true, float: "right" }
      );
      buf2.push(
        filter_label_div( 
          proposition.filter_string( null, true /* only delegateable */ ),
          "delegates " + ( about_proposition ? about_proposition.label : "all" )
        ),
        '</div>'
      );
      shown_propositions++;
      if( shown_propositions > 10 )return;
      other_count -= count_indirect_votes;
      propositions_graph_pie.push( [
        l( proposition.label ),
        count_indirect_votes
      ] );
    });
    
    if( other_count ){
      de&&mand( other_count >= 0 );
      propositions_graph_pie.push( [ l( "other"), other_count ] );
    }
    
    buf2.push( '</div>' );
  }
  
  var count_votes = count_direct_votes + count_indirect_votes;
  var ratio_direct = Math.round( 1000 * ( 
    count_direct_votes / count_votes
  ) ) / 10;
  var ratio_indirect = Math.round( 1000 * ( 
    count_indirect_votes / count_votes
  ) ) / 10;
  var nbsp = "&nbsp;";
  
  if( !count_votes ){
    this.push( 
      l( "empty" ),
      span !== "all" && " <dfn>(" + l( span ) + ")</dfn>",
      "." 
    );
  }else{
    this.push(
      count_votes, nbsp, icon( "votes" ),
      span !== "all" && " <dfn>(" + l( span ) + ")</dfn>",
      ". ", 
      icon( "direct" ), " ", l( "direct(s)" ), nbsp, count_direct_votes,
      nbsp, '<dfn>(', ratio_direct, "%)</dfn>. ",
      icon( "indirect" ), " ", l( "indirect(s)" ), nbsp, count_indirect_votes,
      nbsp, '<dfn>(', ratio_indirect, "%)</dfn>. "
    );
  }
  this.push( ui.sort_menunu( "", !count_votes /* show */ ) );
  
  // page delegates - Delegates. Display agents
  
  if( agent_ids.length ){
    this.open_div( "delegates" ).hide_button().h2(
      icon( "indirect" ), " ", l( "Delegates" )
    );
    if( persona ){
      this.push( " - ", link_to_page( "delegations", "", "your delegations" ) );
    }
    this.push( "<br>");
  
    // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
    // There is such an array for each pie chart
    var delegates_graph_pies;
    if( session.can_script && ( l8.server || window.google ) ){
      delegates_graph_pies 
      = { all: [ [ l( "direct" ), count_direct_votes ] ] };
      this.push( 
        '<div><div class="hide_button"></div>',
        '<div id="delegates_chart_div" class="chart_pie"></div>',
        '</div>'
      );
    }else{
      this.push( "<br><br>" );
    }
  }

  index = -1;
  var about_proposition_reminder = true;
  
  // page delegates - Delegations, display each agent
  agent_ids.forEach( function( agent_id ){
    
    var agent = Persona.find( agent_id );
    if( !agent )return;
    
    var agent_delegations = delegations_by_agent[ agent_id ];
    var count_agent_delegations_by_tags = map();
    var tag_strings = [];
    var ratio = Math.round( 1000 * ( 
      count_delegations_by_agent[ agent_id ] / count_indirect_votes
    ) ) / 10;

    // Display name of agent
    index++;
    that.push(
      div[ index % 2 ],
      l( "via" ), "&nbsp;<h2>",
      link_to_persona_page( agent ),
      '</h2>'
      //link_to_page( "delegates", "#" + agent.short_label() )
    );
    if( ratio !== 100 ){
      that.push(
      " - ", icon( "votes" ), " ",
      count_delegations_by_agent[ agent_id ],
      "&nbsp;<dfn>(",
          ratio,
        "%)</dfn>."
      );
    }
    
    // If focusing on a specific proposition, display agent's orientation
    if( about_proposition ){
      var agent_vote = about_proposition.get_non_neutral_vote_of( agent );
      if( agent_vote ){
        that.push(
          " <dfn>",
          ui.emojied( agent_vote.orientation() ),
          '</dfn>'
        );
        // Show proposition once, as a reminder
        if( about_proposition_reminder ){
          about_proposition_reminder = false;
          that.push(
            " <dfn>(", l( "about" ), " ",
            link_to_proposition_page( about_proposition ),
            ")</dfn>"
          );
        }
      }
    }
    that.br();
    
    delegates_graph_pies && delegates_graph_pies.all.push( [
      persona_short_label( Persona.find( agent_id ) ),
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
        counts = map();
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
    
    // page delegates - Display top 10 most seen tag sets
    var len = tag_strings.length;
    
    var pie;
    var saner_agent_id = agent_id.substring( 1 );
    if( len > 1 && delegates_graph_pies ){
      pie = delegates_graph_pies[ saner_agent_id ] = [];
      that.push( 
        '<div><div class="hide_button"></div>',
        '<div id="delegates_chart_div_' 
        + saner_agent_id
        + '" class="chart_pie chart_pie_small"></div>',
        '</div>'
      );
    }
    var tags;
    
    for( var ii = 0 ; ii < len && ii < 10 ; ii++ ){
      
      tags = tag_strings[ ii ];
      ratio = Math.round( 1000 * ( 
        delegation_counts_by_agent[ agent_id ][ tags ]
        / count_delegations_by_agent[ agent_id ]
      ) ) / 10;
      
      if( pie ){
        pie.push( 
          [ 
            tags,
            delegation_counts_by_agent[ agent_id ][ tags ]
          ]
        );
      }
      
      var can_delegate = persona && persona.id !== agent_id;
      if( can_delegate ){
        that.push(
          '\n<form name="delegation" url="/">',
          '<input type="submit" value="', l( "Delegate" ), '"/> '
        );
      }else{
        if( ii ){
          that.br();
        }
      }
      that.push(
        l( "about" ), " ",
        link_to_page( 
          "persona",
          agent_id + " all " + tags,
          tags.replace( / /g, "&nbsp;+&nbsp;" )
        )
      );
      if( ratio !== 100 ){
        that.push(
          " - ", icon( "votes" ), " ",
          delegation_counts_by_agent[ agent_id ][ tags ],
          "&nbsp;<dfn>(",
            ratio,
          "%)</dfn>. "
        );
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
        // that.br();
      }
    } // end for
    
    // ToDo: "others"
    
    that.push( '</div>' );
  }); // end each agent
  
  this.push( '</div>' );
  
  // page delegates - Display filters
  
  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var tags_graph_pies;
  
  if( all_tag_ids.length ){
      
    this.push( 
      '<br><div id="tags">',
      '<div class="hide_button"></div>',
      '<h2>', icon( "Tags" ), " ", l( "Tags" ), '</h2><br>'
    );
    
    if( session.can_script && ( l8.server || window.google ) ){
      tags_graph_pies = { all: [ [ "direct", count_direct_votes ] ] };
      this.push(
        '<div><div class="hide_button"></div>',
        '<div id="tags_chart_div" class="chart_pie"></div>',
        '</div>'
      );
    }else{
      this.push( "<br><br>" );
    }
  }

  all_tag_ids = all_tag_ids.sort( function( a, b ){
    var count_a = count_delegations_by_tags[ a ];
    var count_b = count_delegations_by_tags[ b ];
    return count_b - count_a; // Most referenced first
  });
  
  index = -1;
  about_proposition_reminder = true;
  
  // page delegates - Display each filter
  all_tag_ids.forEach( function( tags ){
    
    var ratio = Math.round( 1000 * ( 
        count_delegations_by_tags[ tags ]
        / count_indirect_votes
      ) ) / 10;
    index++;  
    var tags_label = "";
    tags.split( " " ).forEach( function( tag ){
      if( !tag )return;
      tags_label += " " + tag;
    });
    tags_label = tags_label.trim();
    
    that.push(
      div[ index % 2 ], // odd/even style
      l( "about" ), " ",
      '<h3>',
      link_to_page(
        "delegates", 
        (about_proposition ? about_proposition.label : "all" ) + " " + tags, 
        tags_label.replace( / /g, "&nbsp;+&nbsp;" )
      ),
      '</h3>'
    );
    if( ratio !== 100 ){
      that.push(
        " - ", icon( "votes" ), " ",
        count_delegations_by_tags[ tags ],
        "&nbsp;<dfn>(",
          ratio,
        "%)</dfn>.<br>"
      );
    }
    
    tags_graph_pies && tags_graph_pies.all.push( [
      tags_label.replace( / /g, " + " ),
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
    
    // page delegates - Display top 10  most important agents
    var len = list.length;
    
    var pie;
    var saner_tags = tags.replace( /#/g, "" ).replace( / /g, "$" );
    if( len > 1 && session.can_script ){
      pie = tags_graph_pies[ saner_tags ] = [];
      that.push( 
        '<div><div class="hide_button"></div>',
        '<div id="tags_chart_div_' 
        + saner_tags
        + '" class="chart_pie chart_pie_small"></div>',
        '</div>'
      );
    }
    
    for( var ii = 0 ; ii < len && ii < 10 ; ii++ ){
    
      agent_id = list[ ii ];
      ratio = Math.round( 1000 * ( 
        counts[ agent_id ]
        / count_delegations_by_tags[ tags ]
      ) ) / 10;
    
      if( pie ){
        pie.push( 
          [
            persona_short_label( Persona.find( agent_id ) ),
            counts[ agent_id ] 
          ] 
        );
      }
      
      var can_delegate = persona && persona.id !== agent_id;
      if( can_delegate ){
        that.push(
          '\n<form name="delegation" url="/">',
          '<input type="submit" value="', l( "Delegate" ), '"/> '
        );
      }
      
      that.push( " ", link_to_delegation_page( agent_id, tags ) );
      
      if( ratio !== 100 ){
        that.push(
          " - ", icon( "votes" ), " ",
          counts[ agent_id ],
          "&nbsp;<dfn>(",
          ratio,
          "%)</dfn>."
        );
      }
      
      // If focusing on a specific proposition, display agent's orientation
      if( about_proposition ){
        var agent = Persona.find( agent_id );
        if( agent ){
          var agent_vote = agent.get_non_neutral_vote_on( about_proposition );
          if( agent_vote ){
            that.push(
              " <dfn>",
              ui.emojied( agent_vote.orientation() ),
              '</dfn>'
            );
            // Show proposition once, as a reminder
            if( about_proposition_reminder ){
              about_proposition_reminder = false;
              that.push(
                " <dfn>(", l( "about" ), " ",
                link_to_proposition_page( about_proposition ),
                ")</dfn>"
              );
            }
          }else{
            trace(
              "BUG? no vote for " + about_proposition.label, "by", agent_id
            );
          }
        }
      }
      
      // page delegates - Delegate button
      if( can_delegate ){
        that.push(
          '<input type="hidden" name="i" value="set_delegation"/>',
          '<input type="hidden" name="i2" value="' + agent_id + '"/>',
          '<input type="hidden" name="i3" value="' + tags + '"/>',
          '</form>\n'
        );
      }else{
        that.br();
      }
    }
    that.push( '</div>' );
  });
  
  that.push( '</div>' );
  
  // page delegates - Display propositions
  this.push( buf2.body() );
  
  // page delegates - Summary
  if( last_vote ){
    this.push(
      //"<br><h2>", l( "Summary" ), "</h2><br>",
      span !== "all" && "<br>" + l( span ) + ".",
      "<br>", icon( "propositions" ), " ",   count_propositions, ".",
      "<br>", icon( "voters" ), " ",         count_personas, ".",
      "<br>", icon( "votes" ), " ",          count_votes, ".",
      "<br>", icon( "votes" ), " ", icon( "direct" ), " ",
         l( "direct(s)" ), " ",           count_direct_votes,
      " ", ratio_direct, "%", ".",
      "<br>", icon( "votes" ), " ", icon( "indirect" ), " ",
        l( "indirect(s)" ), " ",          count_indirect_votes,
      " ", ratio_indirect, "%", ".",
      "<br>", icon( "indirect" ), " ",  
        l( "delegates" ), " ",            count_agents, ".",
      "<br>", icon( "tags"), " ",            all_tag_ids.length, ".",
      "<br>", l( "since" ), " ",          time_label( last_vote.snaptime ),
      ".<br><br>"
    );
  }
  
  this.push( '</div>' ); // end of #delegates_view
  
  // Inject list of all seen tags, to alter filter when clicked
  this.set_change_filter_links( tag_set );
  
  // page delegates - Header & footer
  this.unshift(
    about_proposition
    ? ui.page_header(
        link_to_page( "ballot2", about_proposition.label, icon( "ballot" ) ),
        this.session.has_filter()
        ? link_to_tags( this.session.delegateable_filter() )
        : _,
        _,
        "delegates"
      )
    : ui.page_header_left( 
      _,
      this.session.has_filter()
      ? link_to_tags( this.session.delegateable_filter() )
      : _,
      _,
      "delegates"
    )
  );
  this.push(  "<br><br>", ui.page_footer() );

  // Add data for graphics  
  if( count_propositions && session.can_script ){
    this.push(
      '<script type="text/javascript">'
      //+ '\nvar proposition = ' + proposition.json_value()
      + '\nvar delegates_graph_pies = '   
      + JSON.stringify( delegates_graph_pies )
      + '\nvar tags_graph_pies = '
      + JSON.stringify( tags_graph_pies )
      + '\nvar propositions_graph_pie = '
      + JSON.stringify( propositions_graph_pie )
      + '\nvar i18n = {};'
      + '\n' + delegates_graphics + '; delegates_graphics();'
      + '</script>'
    );
  }
  
} // page_delegates()


/* ---------------------------------------------------------------------------
 *  page login
 */


var LoginSecret = null;
var TimeLoginSecret = 0;

function set_login_secret( secret ){
// Called by ui1twit.js CLI login command handler
  TimeLoginSecret = l8.update_now();
  LoginSecret = secret;
}


function page_login( page_name, twitter_screen_name, alias ){

  var session = this.session;
  if( session.visitor )return this.redirect( "visitor" );
  
  // Skip asking questions in some case, from timeline on index page for ex.
  if( twitter_screen_name === "twitter_direct" ){
    return this.redirect( "cmd login twitter" );
  }
  
  // Sanitize input
  if( twitter_screen_name ){
    twitter_screen_name 
    = dialess( twitter_screen_name ).replace( /[^A-Za-z_0-9]/g, "" );
  }
  if( alias ){
    alias 
    = dialess( alias ).replace( /[^A-Za-z_0-9\-\']/g, "" )
    .trim().substring( 0, 32 );
  }
  
  // Handle Twitter CLI initiated logins (unless twitterbot is visiting)
  if( session.ua.indexOf( "Twitterbot" ) === -1 && twitter_screen_name ){
    var secret = LoginSecret;
    LoginSecret = null;
    // If there is a non expired secret (one minute window)
    if( secret && ( l8.update_now() - TimeLoginSecret ) <= 3600 * 1000 ){
      // Check ?secret=xxxxx in query, it should match to enable login
      var query_secret = session.request.query[ "secret" ];
      if( query_secret + twitter_screen_name === secret ){
        http_repl_commands.login( "@" + twitter_screen_name, "cli", alias );
        return session.redirect( "main" );
      }
    }
  }
  
  this.set( ui.page_style( "login" ), ui.page_header() );
  
  this.open_div( "login_view" );

  var cookied_previous_page
  = decodeURIComponent( session.get_cookie( "login_previous_page" ) )
  .replace( /[^A-Za-z0-9_ #+-,&@]/g, "" );
  if( cookied_previous_page ){
    var previous_page = cookied_previous_page.split( "," );
    if( previous_page.length ){
      this.session.previous_page = previous_page;
      var filter = this.session.get_cookie( "login_filter" );
      this.session.set_filter( decodeURIComponent( filter ) || "all" );
    }
  }else{
    if( session.is_app ){
      trace( "BUG? page_login but no cookie about previous page" );
      debugger;
    }
  }
  
  // page_login - Optional twitter login
  var auth = "";
  if( Config.firebase ){
    // Choice if offline, either no authentication or user requested twitter
    if( l8.client ){
      auth
      = '\n<br><label>' + l( "Twitter authentication" ) + '</label> '
      + '<input type="checkbox" id="checkbox" checked />'
      + '<input type="hidden" name="i3" id="twitter" value="twitter" >';
      // It makes no sense if client is running this "offline"
      // ToDo: fix that
      if( l8.client && window.kudo_is_offline && kudo_is_offline() ){
        auth = "";
      }
    // No choice if online
    }else{
      auth 
      = '<input type="hidden" name="i3" id="twitter" value="twitter" >';
    }
  // No twitter without firebase
  }else{
    auth = '<input type="hidden" name="i3" id="twitter" value="noauth" >';
  }
  
  // page_login -Form, when submitted, will invoke the .login() command
  this.push(
    '\n<div style="display:table; margin:auto;">', // centered. ToDo: css
    '<form name="login" url="/">',
    '<input type="hidden" name="i" value="login"/>',
    '\n<br><label>', l( "An alias" ), '</label><br>',
    '<input type="text" name="i4"',
    ' placeholder="', l( "optional" ), '"',
    ' autocorrect="off"',
    ' pattern="[A-Za-z0-9_]{1,32}"',
    alias && ' value="' + alias + '"',
    '/><br>',
    auth 
  );

  // When offline, ask for twitter name. ToDo: admin access
  // Note: offline votes are queued until twitter identity is authenticated
  if( l8.client ){
    this.push(
      '\n<br>', auth && l( "or" ) + '<br>',
      '<label>', l( "Your twitter name" ), '</label><br>',
      '<input type="text" name="i2"',
      ' autofocus',
      // ToDo: should change "required' based on checkbox
      // !auth ? ' required' : "",
      ' placeholder="', l( "@your_name" ), '"',
      ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
      ' pattern="@?[A-Za-z0-9_]{2,32}"',
      twitter_screen_name && ' value="@' + twitter_screen_name + '"',
      '/>'
    );
  }
  this.push(
    '<br><br><input type="submit" value="Login"/>',
    '</form></div>\n'
  );
  
  // Authentication check box requires a javascript handler to set hidden i3=
  if( auth ){
    this.push(
      '\n<script>$(function(){',
      '$("#checkbox").click( function(){',
      '$("#twitter").val( $("#checkbox").is( ":checked" ) ? "twitter" : "noauth" );',
      '})});</script>'
    );
  }
  
  this.close_div();
  
  this.push( "\n<br>", ui.page_footer() );

} // page_login()


function page_signout( page_name, with_clear_storage ){
  
  var session = this.session;
  session.clear();
  if( with_clear_storage ){
    session.should_clear_storage = true;
  }
  if( l8.client ){
    console.info( "Sign out" );
    if( session.should_clear_storage ){
      console.info( "Clearing storage" );
      document.cookie = "kudo_change_count=0";
      try{
        window.localStorage.clear();
      }catch(_){}
      console.info( "Cleared local storage" );
    }
    // Redirect to server side version of the page (! means that)
    this.redirect( "!signout" );
  }else{
    this.redirect( "index" );
  }
  
} // page_signout()


function page_twitter( page_name ){
// Visitor gets to this page during the twitter login, twice.
// It is the .login() command to redirects here.
  
  var session = this.session;
  
  // When first attempt is from an iframe, a new attempt occurs in a new tab
  var redo = page_name === "twitter2";
 
  // If redirected...
  var redirected = !!session.pending_twitter_page;
  if( !redirected ){
    session.pending_twitter_page = session.previous_page;
    if( !session.pending_twitter_page.length
    ||  session.pending_twitter_page[0] === "twitter"
    ){
      session.pending_twitter_page = [ "main" ];
    }
  }
  
  // If first "redo" in new window, that's not the true "redirect"
  if( redo ){
    if( !session.pending_twitter_page.redo ){
      session.pending_twitter_page.redo = true;
      redirected = false;
    // However, if is the second "redo", it is the true "redirect"
    }else{
      delete session.pending_twitter_page.redo
    }
  }
  
  // Manages where to go back after login
  var previous_page = session.pending_twitter_page;
  if( redirected ){
    session.pending_twitter_page = null;
    // When coming from client mode
    var cookied_previous_page = 
    decodeURIComponent( session.get_cookie( "login_previous_page" ) )
    .replace( /[^A-Za-z0-9_ #+-,&]/g, "" );
    if( cookied_previous_page ){
      previous_page = cookied_previous_page.split( "," );
      if( previous_page.length ){
        this.session.previous_page = previous_page;
        var filter = this.session.get_cookie( "login_filter" );
        this.session.set_filter( decodeURIComponent( filter ) || "all" );
      }
    }else{
      if( session.is_app ){
        trace( "BUG? missing cookie during twitter login" );
        debugger;
      }
    }
  }

  this.set( ui.page_style( "twitter" ) ); // , ui.page_header() );

  function twitter_redirect( firebase, redirected, previous_page ){
  // Client side
    
    console.log(
      "Firebase twitter redirection",
      redirected ? "second phase" : "first phase"
    );
    
    // Login does not work when from an iframe, twitter refuses that
    var iframe = top.location != self.location;
    if( iframe ){
      // Another attempt, from a new window/tab this time
      url = "/twitter2";
      window.open( url, "kudocracy" );
      return;
    }
    
    var Firebase = window.Firebase; // require( "firebase" );
    
    if( !Firebase ){
      var retry_count = window.kudo_firebase_retry_count || 0;
      window.kudo_firebase_retry_count = retry_count + 1;
      var retry_delay = 50; // ms
      if( retry_count > 10 * ( 1000 / retry_delay ) ){
        console.warn( "Oops ! cannot load Firebase?" );
        window.kudo_new_location = "&page=login";
        window.location.replace( "&page=login" );
        return;
      }
      ( retry_count % (1000 / retry_delay ) ) === 0
      && console.log( "Firebase loading.", retry_count, "..." );
      window.setTimeout( function(){
        twitter_redirect( firebase, redirected, previous_page );
      }, retry_delay );
      return;
    }
    
    var ref = new Firebase( "https://" + firebase + ".firebaseio.com");
    
    var needs_redirection = !redirected;
    var before_redirection_request_result = true;
    
    if( needs_redirection ){
      console.info( "Firebase. Signout" );
      ref.unauth();
    }
    
    function go_back( username ){
    // Get back to proper previous page
      if( !previous_page ){
        console.log( "Firebase auth, show propositions page", username );
        window.kudo_new_location = "?page=propositions";
        window.location.replace( "?page=propositions" );
      }else{
        console.log(
          "Firebase auth, show previous page", username, previous_page
        );
        if( previous_page.indexOf( "=offline" ) !== -1 ){
          console.warn( "BUG? previous page should not be 'offline'", previous_page );
          previous_page = "?page=propositions";
        }
        window.kudo_new_location = previous_page;
        window.location.replace( previous_page );
      }
    }
    
    function process_result( auth_data ){
    // Client side
      if( auth_data ) {
        // user was authenticated with Firebase
        needs_redirection = false;
        console.log(
          "FIREBASE auth",
          "User ID: " + auth_data.uid,
          "Provider: " + auth_data.provider
        );
        var username = "@" + auth_data.twitter.username;
        console.info( "Firebase authentic", username );
        // Signal server the authenticated user
        $.ajax( { url: "?i=authentic/" + username, cache: false } )
        .always( function(){
          go_back( username );
        });
      }else{
        // user is logged out
        console.log( "FIREBASE noauth" );
        if( before_redirection_request_result ){
          before_redirection_request_result = false;
        }else{
          console.log( "Firebase, no auth after redirection" );
          debugger;
          go_back( "failed" );
        }
      }
    }
    
    if( needs_redirection ){
      setTimeout( function(){
        console.log( "Firebase, set onAuth callback & redirect" );
        // It is called twice, once before login with twitter, once after
        before_redirection_request_result = true;
        ref.onAuth( process_result );
        try{
          ref.authWithOAuthPopup( 
            "twitter", 
            function( error, authData ){
              if (error) {
                if (error.code === "TRANSPORT_UNAVAILABLE") {
                  // fall-back to browser redirects, and pick up the session
                  // automatically when we come back to the origin page
                  ref.authWithOAuthRedirect(
                    "twitter",
                    function( err ){
                      // Tell server about that
                      console.warn( "Firebase result, auth error", err );
                      process_result( null );
                    }
                  );
                }else{
                  console.warn( "failed Firebase auth", error );
                  process_result( null );
                }
              }else{
                process_result( authData );
              }
            }
          );
        }catch( err ){
          console.warn( "Firebase issue with oauth & redirect", err );
          process_result( null );
          debugger;
        }
      }, 10 );
    }else{
      before_redirection_request_result = true;
      ref.onAuth( process_result );
    }
    
  } // Client side twitter_redirect()

  // If previous page, there will be a redirect to it, browser initiated
  if( previous_page ){
    previous_page = "?page=" + encode_ref( previous_page.join( " " ) );
  }
  
  // authenticate with Twitter
  var name_msg = Session.current.visitor ? Session.current.visitor.label : "";
  false && this.push(
    "<br><br><h2>", 
    l( "login"), " ", "twitter", " ", name_msg, 
    "</h2><br><br>",
    redirected ? "?" : "...",
    '<br><br>'
  );
  this.push(
    "<script>",
    twitter_redirect,
    '\ntwitter_redirect( ',
      '"', Config.firebase, '"', ',',
      redirected ? "true" : "false", ',',
      // '"', visitor.label, '"', ",",
      '"', previous_page, '"',
    ' );',
    "</script>"
  );
  
  false && this.push( "\n<br>", ui.page_footer() );
  
} // page_twitter()


/* ---------------------------------------------------------------------------
 *  page propose
 */

function page_propose( page_name ){
  
  var nuit_debout = true;
  
  var visitor = this.require_visitor();
  if( !visitor )return;

  this.set( ui.page_style( "new proposition" ), ui.page_header() );
  
  this.open_div( "propose_view" );
  
  var tags = Session.current.delegateable_filter();
  
  // Try to find some sensible unused name for the new proprosition
  var domain_name = Session.current.domain_label();
  var auto_ref = "";
  var ii = 0;
  while( ii < 1000 ){
    auto_ref = domain_name + "P" + ii;
    if( !Topic.find( auto_ref ) )break;
  }

  // page propose - form for name, tags and optional comment
  this.push(
    '\n<form name="propose" url="/">',
    '<input type="hidden" name="page" value="propose2"/>',
    '<br><label>', icon( "proposition" ),
    !nuit_debout && l( "new&nbsp;proposition" ), 
    nuit_debout && "&nbsp;R&eacute;f&eacute;rence unique de cette nouvelle proposition",
    '</label><br>',
    '<input type="text" autofocus name="i2"',
    ' pattern="[A-Za-z0-9_]{3,32}"',
    ' autocapitalize="none" autocorrect="off"',
    ' placeholder="', auto_ref, '"',
    ' required',
    '/>',
    '<br><br><label>', icon( "tags" ), 
    nuit_debout && "&nbsp;Tags dont elle est initialement dot&eacute;e",
    '</label><br>',
    '<input type="search" results="10" name="i3"',
    ' size="40"', // 20 default
    ' value="', tags, '"',
    ' pattern="(#?[A-Za-z0-9_]{3,24})( #?[A-Za-z0-9_]{3,24})*"',
    ' required',
    ' placeholder="#tag #tag2 #tag3..."',
    ' autosave="tags"',
    ' spellcheck="false" autocapitalize="none" autocorrect="off"',
    '"/>',
    '<br><br><label>', icon( "comment" ), 
    nuit_debout && "&nbsp;Intitul&eacute; initial de la proposition",
    '</label><br>',
    '<input type="search" name="comment"',
    ' size="80"', // 20 default
    ' placeholder="', l( "optional comment" ), '"',
    ' autocapitalize="none" autocorrect="off"',
    ' autosave="comment"',
    ' spellcheck="on" autocapitalize="on" autocorrect="on"',
    '"/>',
    '<br><br><button type="submit">' + l( "Propose" ) + "</button>",
    '</form>\n'
  );
  
  this.close_div();
  
  this.push( "<br>", ui.page_footer() );

} // page_propose()


function page_propose2( /* name, ...tags */ ){
  
  var visitor = this.require_visitor();
  if( !visitor )return;
  
  var name = arguments[1];
  if( !name )return this.redirect( "propose" );
  if( !arguments[2] )return this.redirect( "propose" );
  var text
  = name + " #" + slice( arguments, 2 ).join( " #" ).replace( /##/g, "#" );
  
  Session.current.proposition = null;
  http_repl_commands.proposition_propose( text );
  
  var new_proposition = Session.current.proposition;
  if( !new_proposition )return this.redirect( "propose" );

  this.redirect( "proposition " + new_proposition.label );
  
}
  

/* ---------------------------------------------------------------------------
 *  page domain
 */
 

function page_domain( page_name ){
  
  var visitor = this.require_visitor();
  if( !visitor )return;
  
  // Find the proposition associated to the visitor
  var visitor_proposition = visitor.get_topic();
  if( !visitor_proposition ){
    // Oops, there should be such a proposition, it was created when
    // user was first seen
    return this.error(
      l( "Missing associated proposition for")
      + " " + link_to_persona_page( visitor )
    );
  }
  
  // Check if this is defined as a domain already
  var is_domain = visitor.is_domain();
  if( !is_domain ){
    return this.error(
      l( 'Missing "#domain" tag for' )
      + " " + link_to_proposition_page( visitor_proposition )
    );
  }
  
  // If this is a domain, get user data about domain
  var domain_description = visitor_proposition.get_data( "domain" );
  
  // If first declaration ever, init
  var is_new = !domain_description;
  if( is_new ){
    domain_description = {
      twitter_consumer_key: "",
      twitter_consumer_secret: "",
      twitter_access_token: "",
      twitter_access_token_secret: "",
      is_public: true
    };
  }
  
  this.set( ui.page_style( "domain"), ui.page_header() );
  
  this.open_div( "domain_view" );
  
  if( visitor.short_label() !== Config.domain ){
    this.push(
      '<br>', l( "Domain propositions" ), " ",
      '<h2><a href="?kudo=', visitor.short_label(),
      '&page=propositions">', 
      visitor.label,
      '</a></h2>',
      '<br><br>'
    );
  }
  
  this.push( "<h3>", l( "Twitter domain" ), "</h3> - " );
  if( is_new ){
    this.push(
      '<a href="https://apps.twitter.com/app/new"',
      ' title="twitter"',
      '>application</a>'
    );
  }else{
    this.push(
      '<a href="https://apps.twitter.com"',
      ' title="twitter"',
      '>application</a>'
    );
  }

  this.push(
    
    '\n<form id="domain" url="/">',
    '<input type="hidden", name="i" value="describe_domain"/>',
    
    '<br><label>', l( "Consumer Key" ), '</label><br>',
    '<input type="text", name="i2" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_consumer_key, '" />',
    
    '<br><br><label>', l( "Consumer Secret" ), '</label><br>',
    '<input type="text", name="i3" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_consumer_secret, '" />',
    
    '<br><br><label>', l( "Access Token" ), '</label><br>',
    '<input type="text", name="i4" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_access_token, '" />',
    
    '<br><br><label>', l( "Access Token Secret" ), '</label><br>',
    '<input type="text", name="i5" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_access_token_secret, '" />',
    
    '<br><br><label>', l( "Public" ), '</label> ',
    '<input type="checkbox" id="checkbox" ',
    domain_description.is_public ? "checked" : "",
    '><input type="hidden" name="i6" id="twitter" value="public" >',
    
    '<br><br><input type="submit" value="', l( "Authorize" ), '"/>',
    '</form>\n',
    
    '\n<script>$(function(){',
    '$("#checkbox").click( function(){',
    '$("#twitter").val( $("#checkbox").is( ":checked" ) ? "public" : "private" );',
    '})});</script>'
  );
  
  this.close_div();
  this.push( "\n<br>", ui.page_footer() );
  
} // page_domain()


/* ---------------------------------------------------------------------------
 *  page badges
 */

var ui1badges = require( "./ui1badges.js" );

function page_badges(){
  
  var session = this.session;
  var visitor = session.visitor;
  var domain = session.domain_label();
  
  this.set( ui.page_style( "badges" ), ui.page_header() );
  
  this.open_div( "badges_view" );
  
  var source = "" + ui1badges.kudocracyScript;
  var lines = source.split( "\n" );
  
  // Remove function(){ and }
  lines[ 0 ] = null;
  lines[ lines.length - 1 ] = null;
  lines = lines.filter( function( x ){ return !!x; } );
  
  source = lines.join( "\n" );
  
  var href = "http://" + Config.host + "/vote"
  + "?kudo=" + session.domain_label();
  
  // Change references to kudocracy.com into proper domain
  source = source.replace( /\/kudocracy.com/g, "/" + Config.domain );
  
  // Change links to twitter doc into hyper links
  source = source.replace( /(https:\/\/[^\s]*)/, function( _, m ){
    return '<a href="' + m + '">' + m + '</a>';
  });
  
  function animate_page(){
    console.log( "Ready to animate page" );
    function update_code(){
      var host = $("#host").val().replace( /"/g, "''" );
      var domain = $("#domain").val().replace( /"/g, "''" );
      var proposition = $("#proposition").val().replace( /"/g, "''" );
      var title = $("#title").val().replace( /"/g, "''" );
      var compact = $("#compact").prop( "checked" );
      var count = $("#count").prop( "checked" );
      var twitter = $("#twitter").prop( "checked" );
      var twitter_count = $("#twitter_count").prop( "checked" );
      if( compact || title === "Kudo" ){
        compact = true;
        title = "Kudo";
      }
      if( twitter_count ){
        twitter = true;
      }
      var code 
      = '<a href="http://'
      + host 
      + "/vote/" 
      + proposition 
      + '?kudo=' + domain
      + '" class="kudocracy-vote-button"';
      if( title ){
        code += ' data-title="' + title + '"';
      }
      if( !count ){
        code += ' data-count="none"';
      }
      if( twitter ){
        code 
        += ' data-twitter=' 
        + ( twitter_count ? '"horizontal"' : '"none"' );
      };
      code 
      += '>Kudocracy</a>\n'
      +  decodeURIComponent( $("#loader").val() );
      var old_code = $("#code").val();
      if( code !== old_code ){
        $("#code").val( code );
        $("#render").html( code );
        kudocracy( $("#render").get() );
        return true;
      }
      return false;
    }
    function update_loop( delayed ){
      setTimeout( function(){
        update_loop( update_code() );
      }, delayed ? 1000 : 100 );
    }
    update_loop();
  }
  
  var proposition
  = ( session.proposition && session.proposition.label ) || "";
  
  var widget_js 
  = require( "./ui1badges.js" ).minimizedKudocracyScript
  .replace( "kudocracy.com", Config.host );

  this
  
  .open_div( "badges_generator" )
    .h3( l( 
    "Add buttons to your website to help your visitors vote using Kudo<em>c</em>racy."
    ) )
    .push(
      '<br><br>',
      '<input id="loader" type="hidden" value="', 
      encodeURIComponent( widget_js ),
      '" />',
      
      '<br><label>', l( "web site" ), '</label>',
      '<br><input id="host" type="text" value="', 
        Config.host, '" />',
        
      '<br><br><label>', l( "domain" ), '</label>',
      '<br><input id="domain" type="text" value="', 
        domain, '" />',
        
      '<br><label>', l( "proposition" ), '</label>',
      '<br><input id="proposition" type="text" value="', 
        proposition, '" />',
        
      '<br><br><label>', l( "title" ), '</label>',
      '<br><input id="title" type="text" value=""/>',
        
      '<br><br>',
      ' <label>', l( "compact" ), '</label>',
      ' <input id="compact" type="checkbox" />',
      ' <label>', l( "counters" ), '</label>',
      ' <input id="count" type="checkbox" checked />',
      ' - <label>twitter</label>',
      ' <input id="twitter" type="checkbox" />',
      ' <label>', "& ", l( "counter" ), '</label>',
      ' <input id="twitter_count" type="checkbox"/>',
      
      '<br><br><label>HTML</label><br>',
      l( "Try out your button, then copy and paste the code below into the HTML for your site." ),
      
      '<br><br><div id="render">',
      '<a href="', href, '" class="kudocracy-vote-button"',
      ' data-count="horizontal"',
      ' data-twitter="horizontal"',
      '>',
      l( "Vote" ),
      '</a></div>',
      
      '<br>',
      '<textarea id="code" cols="50" rows="2"',
      ' spellcheck=false onclick="this.select()"',
      ' readonly="readonly"',
      '>...</textarea>'
    ).br()
    .script( animate_page, ';$(animate_page);' )
    .push( '<script src="/widgets.js"></script>' )
  .close_div()
  
  .br()
  
  .open_div( "badges_javascript" )
    .h2( 
      l( "javascript"),
      ' <a href="http://dev.twitter.com/web/javascript/loading">',
      icon( "help"),
      '</a>'
    )
    .br()
    .open_div( "widget" )
      .push( '<pre><code>' )
      .push( source )
      .push( '</code></pre>' )
    .close_div()
  .close_div();
  
  this.close_div();
  
  this.push( ui.page_footer( true /* framed */ ) );
  
}


/* ---------------------------------------------------------------------------
 *  page badge
 */

function page_badge( /* page_name, etc */ ){
  
  var session = this.session;
  
  var pending_vote = session.pending_vote;
  session.pending_vote = null;
  if( pending_vote ){
    if( session.authentic ){
      session.set_current_page( [ "proposition", pending_vote[ 0 ] ] );
      return this.redirect( 
        "cmd badge_vote "
        + pending_vote[ 0 ]
        + " " + pending_vote[ 1 ]
        + " back"
      );
    }else{
      return this.redirect( "proposition" + pending_vote[ 0 ] );
    }
  }
  var page_name = arguments[ 0 ];
  var proposition_name = arguments[ 1 ] || "";
  
  proposition_name = proposition_name.replace( /[^#A-Za-z0-9_]/g, "" );
  if( !proposition_name ){
    proposition_name = "kudocracy";
  }
  
  // For convenience _xxxxx is #xxxxx
  if( proposition_name[ 0 ] === "_" ){
    proposition_name = "#" + proposition_name.substring( 1 );
  }
  
  proposition_name = proposition_name.substring( 0, 32 );
  var proposition = Topic.find( proposition_name );
  
  // If not found, try with/without #
  if( !proposition ){
    var alternative;
    if( proposition_name[ 0 ] !== "#" ){
      alternative = "#" + proposition_name;
    }else{
      alternative = proposition_name.substring( 1 );
    }  
    proposition = Topic.find( alternative );
    if( proposition ){
      proposition_name = alternative;
    }
  }
  
  var query = session.request.kudo_query;
  var count = ( query && query.count ) || "horizontal";
  var title = ( query && query.title );
  var title2;
  var tooltip;
  var no_icon = false;
  if( title ){
    // Special "Kudo" title means "compact"
    if( title === "Kudo" ){
      tooltip = proposition_name;
      no_icon = true;
      title2 = icon( "zoom-in" );
    }else{
      title2 = l( decodeURIComponent( title ) );
      title2 = title2.substring( 0, 24 );
    }
  }else{
    title2 = l( proposition_name );
    title2 = title2.substring( 0, 24 );
  }
  
  
  var iframe = ( page_name.indexOf( "badge" ) !== -1 );
  
  if( !iframe )return this.redirect( "proposition/" + proposition_name );
  
  this.set( ui.page_style( page_name ) );
  var cmd = "badge_vote " + proposition_name + " ";
  var domain = session.domain_label();
  
  this.open_div( "badge_view" );
  
  this.open_div( "badge" );
  
  if( !no_icon ){
    this.push(
      '<a target="_top" id="badge-domain" href="/main?kudo=', domain,
      '" title="', Config.host, " ", domain, ' data-kudocracy-badge">',
      Config.img_icon, 
      "</a> "
    );
  }
  this.push(
    '<a target="_top" href="/proposition/',
    Wiki.htmlizeAttr( l( proposition_name ) ).replace( "#", "%23" ),
    "?kudo=", domain,
    tooltip && '" title="' + tooltip,
    '" data-kudocracy-badge>',
    title2,
    "</a>"
  );
  
  if( proposition ){
    var vote;
    var is_direct;
    if( session.visitor ){
      vote = proposition.get_vote_of( session.visitor );
    }
    if( !vote ){
      this.push(
        " ", link_to_command( cmd + "agree",    icon( "agree") ),
        " ", link_to_command( cmd + "disagree", icon( "disagree" ) )
      )
    }else{
      var orientation = vote.orientation();
      is_direct = vote.is_direct();
      if( orientation !== Vote.agree ){
        this.push( 
          " ", link_to_command( cmd + "agree", icon( "agree") )
        );
      }
      if( orientation !== Vote.disagree && orientation !== Vote.protest ){
        this.push(
          " ", link_to_command( cmd + "disagree", icon( "disagree" ) )
        );
      }
    }
    if( orientation !== Vote.neutral
    && ( !vote || is_direct )
    ){
      this.push(
        " ",
        !vote && "<em>",
        link_to_command( 
          cmd + "neutral",
          icon( "neutral" ),
          l( "Vote" ) + ' "' + l( "neutral" ) + '"'
        ),
        !vote && "</em>"
      );
    }
  }else{
    this.push( " <dfn>", l( "expired" ), "</dfn>" );
  }
  
  this.close_div();
  
  if( proposition ){
    if( count === "horizontal" ){
      var total = proposition.result.total();
      var agree = proposition.result.agree();
      this.open_div( "badge_count" )
        .push( agree + "/" + total )
      .close_div();
    }
  }
  
  if( query.twitter ){
    var is_tag = proposition_name[ 0 ] === "#";
    var tag_label;
    var label;
    if( is_tag ){
      tag_label = proposition_name;
      label = tag_label.substring( 1 );
    }else{
      label = proposition_name;
      tag_label = "#" + label;
    }
    // Share tweet button
    this.push(
      '<div id="twitter_buttons" style="display:inline-block">',
      '<a href="http://twitter.com/share" class="twitter-share-button"',
      ' data-url="http://',
      session.host,
      "/proposition/",
      proposition_name.replace( "#", "%23" ),
      "?kudo=", session.domain_label(),
      '" data-text="#kudocracy ' + tag_label,
      '" data-count="', query.twitter, '"',
      '">tweet</a>',
      '</div>'
    );
  }
  
  this.close_div();
  
  this.push( ui.page_footer( iframe ) );
  
}



/* ---------------------------------------------------------------------------
 *  page help
 */

function page_help(){
  
  var session = this.session;
  
  // Flip/flop expert/novice mode
  if( !session.is_novice ){
    session.novice_mode();
  }else{
    // ToDo: figure out a better scheme to escape novice mode
    // this.session.expert_mode();
  }
  
  var versions = {
    en: "English version",
    fr: "Version fran&ccedil;aise",
    es: "Versi&oacute;n espag&ntilde;ol",
    pt: "Protuguese version",
    de: "German version",
    it: "Italian version"
  };
  
  var version_msg = '\n<div id="languages">';
  if( session.can_script === true ){
    version_msg 
    = '<div class="action" ' + show_on_click + '>' 
    + icon( "help" ) + " " + l( "Language" )
    + '</div><div id="languages" class="kudo_collapse">';
  }
  for( var lang in versions ){
    version_msg += link_to_command(
      "lang " + lang,
      versions[ lang ]
    ) + ".<br>";
  }
  version_msg // Remove extra trailing <br> 
  = version_msg.substring( 0, version_msg.length - "<br>".length ) + "</div>";
  
  var msg = new ui.Builder();
  
  msg.push(
    "<br>", icon( "home" ), " ",
    link_to_page( "index" )
  );
  if( session.domain ){
    msg.push( " ", session.domain );
  }
  msg.push( " ", link_to_wiki_icon( "HomePage" ) );
  
  msg.push(
    "<br><br>",
    version_msg,
    "<br>"
  );
  
  // English version (also the international version at this point)
  if( session.lang !== "fr" ){
    msg.push(

      '<h2>How to..?</h2><br>',
      'See the ',
      '<a href="http://github.com/virteal/kudocracy/wiki">wiki</a>',
      ': ',
      '<a href="http://github.com/virteal/kudocracy/wiki/HowTo">HowTo</a>',
      '<br><br>',
      
      '<h2>What is it?</h2><br>',
      'A voting system where ',
      'people can either directly ', emoji( "agree" ), ' approve or ',
      emoji( "disagree" ) + ' disapprove ',
      ' propositions associated to tags ',
      "or delegate that decision.",
      
      '<br><br>',
      
      '<h2>', icon( "tags" ), ' Tags?</h2><br>',
      'Tags are keywords used to categorize topics in social networks. ',
      '<br><br>',
      
      '<h2>', icon( "indirect" ), ' Delegate?</h2><br>',
      'On matters identified by ',
      'tags you specify, you can tell who ',
      "votes for you when you decide not to vote directly yourself.",
      '<br><br>',
      
      '<h2>How is it different?</h2><br>',
      'Traditional voting systems with polls every so often capture ',
      'infrequent snapshots of the opinion. Because voting often on many matters ',
      'is inconvenient, ',
      'polls are either rare or participation suffers. Most decisions ',
      'are therefore concentrated in the hands of a few representatives ',
      'who may be pressured or subjected to corruption. Delegative Democracy ',
      'fixes these problems thanks to modern technologies.',
      '<br><br><ul>',
      
      '<li>With <strong>Kudo<em>c</em>racy</strong>:</li>',
      '<li>Votes are about propositions, not about candidates.</li>',
      '<li>Propositions are classified and searchable using tags.</li>',
      '<li>Delegates you choose may vote for you on subjets you choose.</li>',
      '<li>You can either follow their recommendations or vote directly.</li>',
      '<li>Votes are reversible, you can change your mind at any time.</li>',
      '<li>They are public to avoid fraud and promote transparency and open discussions.</li>',
      '<li>Results are updated in realtime, trends are visible.</li>',
      '<li>It is <a href="http://github.com/virteal/kudocracy">open source</a>.',
      ' Data are open too <a href="http://creativecommons.org/licenses/by/4.0/">(CC by 4.0)</a>',
      ', <a href="/csv">here</a>.</li>',
      '</ul><br>',
      
      '<h2>Is it available?</h2><br>',
      'What is available is this prototype. Depending on ',
      'success ',
      '(<a href="http://kudocracy.com/proposition/kudocracy?kudo=kudocracy">',
      'vote</a> #kudocracy !), ',
      'the prototype will hopefully expand into ',
      'a robust system able to handle billions of votes from millions of ',
      'persons. That is not trivial and requires help.',
      '<br><br>',
      
      '<h2>Who are you?</h2><br>',
      'My name is Jean-Hugues Robert, ',
      link_to_twitter_user( "@jhr" ),
      '. I am a 49 years old software developper ',
      'from Corsica (the island where Napoleon was born). When I found out about ',
      ' <a href="http://en.wikipedia.org/wiki/Delegative_democracy">',
      'Delegative democracy</a>, I liked that. I think that it would ',
      'be a good thing to apply it broadly using modern technologies that ',
      'people now use all over the world.',
      "<br><br> Jean-Hugues, March 2015."
    );
  
  // French
  }else{
    msg.push(
      
      '<h2>Comment faire..?</h2><br>',
      'Voir le ',
      '<a href="http://github.com/virteal/kudocracy/wiki">wiki</a>',
      ': ',
      '<a href="http://github.com/virteal/kudocracy/wiki/CommentFaire">CommentFaire</a>',
      '<br><br>',
      
      '<h2>De quoi s\'agit-il ?</h2><br>',
      'Un syst&egrave;me de vote dans lequel ',
      'chacun peut soit directement ', emoji( "agree" ) + ' approuver ou ', emoji( "disagree" ),
      ' d&eacute;sapprouver des propositions',
      ' associ&eacute;es &agrave; des tags',
      ' soit d&eacute;l&eacute;guer ce choix.',
      '<br><br>',
      
      '<h2>', icon( "tags" ), ' Tags ?</h2><br>',
      'Les tags sont des mots-clefs utilis&eacute;s pour classer les sujets dans les r&eacute;seaux sociaux. ',
      '<br><br>',
      
      '<h2>', icon( "delegation"), ' D&eacute;l&eacute;guer ?</h2><br>',
      'Sur des sujets, ',
      'associ&eacute;es &agrave; des tags',
      ', vous pouvez d&eacute;signer qui votent pour vous ',
      'quand vous choisissez de ne pas voter directement vous-même.',
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
      '<li>Les votes portent sur des propositions, pas sur des candidats.</li>',
      '<li>Les propositions sont class&eacute;es par sujet selon des tags.</li>',
      '<li>Des d&eacute;l&eacute;gu&eacute;s que vous choisissez votent sur certains sujets.</li>',
      '<li>Vous pouvez soit suivre leurs recommendations soit voter directement.</li>',
      '<li>Les votes sont modifiables, vous pouvez changer d\'avis à tout instant.</li>',
      '<li>Ils sont publics pour éviter la fraude et promouvoir la transparence et le dialogue.</li>',
      '<li>Les r&eacute;sultats sont disponibles immédiatement, les tendances sont affich&eacute;es.</li>',
      '<li>Le logiciel est <a href="http://github.com/virteal/kudocracy">open source</a>.',
      ' Les données sont libres aussi <a href="http://creativecommons.org/licenses/by/4.0/">(CC by 4.0)</a>',
      ', <a href="/csv">i&ccedil;i</a>.</li>',
      '</ul><br>',
      
      '<h2>Est-ce dispo ?</h2><br>',
      'Ce qui est disponible est ce prototype. ',
      'Selon son succ&eacute;s ',
      '(', icon( "vote"),
      ' <a href="http://kudocracy.com/proposition/kudocracy?kudo=kudocracy">',
      'votez</a> #kudocracy !), ',
      'le prototype sera am&eacute;lior&eacute; ',
      'pour devenir une solution robuste capable de traiter les milliards de votes de millions ',
      'de personnes. Ce n\'est pas simple.',
      '<br><br>',
      
      '<h2>Qui ?</h2><br>',
      'Mon nom est Jean-Hugues Robert, ',
      link_to_twitter_user( "@jhr" ),
      '. Je suis un informaticien de 49 ans vivant en Corse. ',
      'Quand j\'ai d&eacute;couvert la ',
      ' <a href="http://fr.wikipedia.org/wiki/D%C3%A9mocratie_liquide">',
      'D&eacute;mocratie Liquide</a>, j\'ai aim&eacute;. ',
      'Je pense que ce serait une bonne chose de l\'appliquer largement ',
      'en utilisant les technologies modernes ',
      'disponibles maintenant partout dans le monde.',
      "<br><br> Jean-Hugues, Mars 2015."
    );
  }
  
  msg = msg.join();
  
  this.set(
    ui.page_style( "help" ),
    ui.page_header(
      _,
      link_to_twitter_filter( "#kudocracy", "", true /* no_icon */ ),
      _
    )
  );
  
  this.open_div( "help_view" )
  
  .push(
    
    '<div id="help_message" style="max-width:50em">', msg, '</div><br>',
    
    // Twitter tweet & follow buttons
    '\n<div id="twitter_buttons">',
    '<a href="http://twitter.com/intent/tweet?button_hashtag=kudocracy',
    '&hashtags=kudocracy,democracy,opensource,LiquidDemocracy',
    '&text=virtual%20democracy http://' + session.host + '"',
    'class="twitter-hashtag-button" ',
    'data-related="Kudocracy,vote">Tweet #kudocracy</a>',
    '\n<br><a href="http://twitter.com/Kudocracy',
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow @Kudocracy</a>',
    '\n<br><a href="http://twitter.com/jhr',
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow @jhr</a>',
    //'<br><br><h2>Misc</h2><br>',
    //'Debug console: ' + link_to_command( "help" ),
    '</div>'
  );
  
  this.session.needs_twitter = true;
  
  this.open_div( "site_summary" ).push(
    "<br>", icon( "personas"     ), " ",  Persona.count,
    "<br>", icon( "propositions" ), " ", 
    " ",    l( "propositions" ), " ",  Topic.count,
    "<br>", icon( "votes"        ), " ", 
    " ",    l( "votes"        ), " ",  Vote.count,
    "<br>", icon( "votes"        ), "! ",
    " ",    l( "comments"     ), " ",  Comment.count,
    "<br>", icon( "indirect"     ), 
    " ",    l( "delegations"  ), " ",  Delegation.count,
    "<br>"
  ).close_div();
  
  this.push( link_to_page( "badges" , "", l( "badges" ) ) );
  
  this.close_div();
  
  this.br().push( ui.page_footer() );
  
} // page_help()


/*
 *  emoji
 *    Chrome requires the installation of an extension in order to display
 *  emojis correctly. Safari is special on some emojis.
 *
 *  I currently use thumb up, down for orientations and check box and cross
 *  for tag filtering.
 */


var emoji = ui.emoji = function emoji( name, spacer ){
  var tmp;
  if( Session.current.is_safari
  ||  Session.current.is_chrome
  ){
    tmp = emoji.table_ascii[ name ];
  }else{
    tmp = emoji.table[ name ] || emoji.table_ascii[ name ];
  }
  if( !tmp    )return "";
  if( !spacer )return tmp;
  return tmp + spacer;
}


ui.emoji.table = {
  new:      "<em><strong>?</strong></em>&nbsp;",
  checked:  "&#9989;",
  neutral:  "&#x1f450;==&nbsp;",  // open hands, ==
  // agree:    "&#x1f44d;+1&nbsp;",  // Thumb up, +1
  win:      "&#x1f44d;+",
  // disagree: "&#x1F44e;-1&nbsp;",  // Thumb down, -1
  fail:     "&#x1F44e;-",
  blank:    "&#x270b;?!&nbsp;",   // raised hand, ?!
  protest:  "&#x270a;!!!&nbsp;",  // raised fist, !!!
};


ui.emoji.table_ascii = {
  new:       '<em><span class="glyphicon glyphicon-question-sign"></span></em>',
  checked:   "<i><strong>+</strong></i>",
  neutral:   '<span class="glyphicon glyphicon-remove-sign"></span>',
  agree:     '<span class="glyphicon glyphicon-thumbs-up"></span>',
  win:       '<span class="glyphicon glyphicon-plus-sign"></span>',
  disagree:  '<span class="glyphicon glyphicon-thumbs-down"></span>',
  fail:      '<span class="glyphicon glyphicon-minus-sign"></span>',
  blank:     "<i><strong>?!</strong></i>",
  protest:   '<span class="glyphicon glyphicon-exclamation-sign"></span>',
  total:     '<span class="glyphicon glyphicon-comment"></span>',
  eof:""
};


ui.emoji.table_better_signal_noise_ratio = {
  // agree: "+1",
  agree:    '<span class="glyphicon glyphicon-thumbs-up"></span>',
  // disagree: "-1",
  disagree: '<span class="glyphicon glyphicon-thumbs-down"></span>',
  win: "<i>+</i>",
  fail: "<i>-</i>"
};


ui.emojied = function emojied( text ){
  if( !text )return "";
  // +1 and -1 are better than emoji + "agree" and "disagree", better S/N
  var short = emoji.table_better_signal_noise_ratio[ text ];
  if( short )return short;
  return emoji( text ) + "&nbsp;" + l( text );
}


function emojied_result( result ){

  var emojied_text;
  var result_orientation = result.orientation();
  
  if( result_orientation === Vote.agree
  ||  result_orientation === Vote.disagree
  ){
    var total = result.agree() + result.disagree();
    var percent = 0;
    if( result.agree() > result.disagree() ){
      percent = Math.round( ( result.agree() / total ) * 1000 ) / 10;
      emojied_text = ui.emojied( "agree" )
    }else{
      percent = Math.round( ( result.disagree() / total ) * 1000 ) / 10;
      emojied_text = ui.emojied( "disagree" );
    }
    emojied_text += " " + percent + "%";
  }else{
    emojied_text = ui.emojied( result_orientation ); 
  }
  
  return emojied_text;
}


function proposition_comment( proposition ){
  
  var comment = proposition.get_comment_text();
  var author  = proposition.get_comment_author();
  var full_comment = "";
  if( comment ){
    full_comment += '<h3>' + wikify_comment( comment ) + '</h3>';
  }
  // Add author, unless it will appear in displayed list of tags
  if( false && author && !proposition.has_tag( "#" + author.id.substring( 1 ) ) ){
    full_comment
    += '<dfn>&nbsp;' + link_to_persona_page( author ) + '</dfn>';
  }
  if( false && full_comment ){
    var wiki = proposition.label;
    if( wiki[ 0 ] === "#" ){
      if( Persona.find( "@" + wiki.substring( 1 ) ) ){
        wiki = "@" + wiki.substring( 1 );
      }
    }
    full_comment += ' ' + link_to_wiki( wiki );
  }
  
  return full_comment;
  
}


function proposition_summary( proposition, div, options ){
  
  var nuit_debout = true;
  
  if( !options ){
    options = map();
  }
  
  var avoid_author = options.avoid_author;
  var no_counters = options.no_counters;
  var no_comments = options.no_comments;
  var no_age = options.no_age;
  
  var buf = new ui.Builder();
  
  var result   = proposition.result;
  var agree    = result.agree();
  var disagree = result.disagree();
  var blank    = result.blank();
  var protest  = result.protest();
  var total    = result.total();
  
  function cond_push( label, n, style ){
    if( n ){
      if( style ){
        buf.push( '<' );
        buf.push( style );
        buf.push( '>' );
      }
      buf.push( '<span class="nobr">' ),
      buf.push( icon( label ), "&nbsp;", l( label ) );
      buf.push( '&nbsp;', n );
      if( n !== total ){
        var ratio = Math.round( 1000 * ( n / total ) ) / 10;
        if( style ){
          buf.push( "&nbsp;(", ratio, "%)" );
        }else{
          buf.push( "&nbsp;<dfn>(", ratio, "%)</dfn>" );
        }
      }
      buf.push( ".</span> " );
      if( style ){
        buf.push( '</' );
        buf.push( style );
        buf.push( '>' );
      }
    }
  }
  
  //var orientation = result.orientation();
  //if( !orientation ){ orientation = ""; }

  // When in page_proposition()
  var wiki = proposition.label;
  if( wiki[ 0 ] === "#" ){
    if( Persona.find( "@" + wiki.substring( 1 ) ) ){
      wiki = "@" + wiki.substring( 1 );
    }
  }
  if( div && div !== "nocomment" ){
    buf.push(
      '<div class="odd"><h2>'
    );
    nuit_debout && buf.push( "Résultats, en r&eacute;sum&eacute; : " );
    buf.push( 
      // l( "Summary" ),
      '<em>', emojied_result( result ), '</em>',
      //+ ( comment ? '<br>' + wikify_comment( comment.text ) : "" )
      '</h2> '
    );
    nuit_debout && buf.push( "- page wiki : ")
    buf.push(
      link_to_wiki( wiki ), // , "wiki" ),
      '<br>'
    );

  // Elsewhere
  }else{
    if( div !== "nocomment" ){
      var comment = proposition.get_comment_text();
      var author  = proposition.get_comment_author();
      if( author === avoid_author ){
        author = null;
      }
      var full_comment = "";
      if( comment ){
        full_comment += '<br><h3>' + wikify_comment( comment ) + '</h3>';
      }
      if( author ){
        full_comment
        += '<dfn>&nbsp;-&nbsp;' + link_to_persona_page( author ) + '</dfn>';
      }
      if( full_comment ){
        buf.push( full_comment );
      }
      buf.push( " ", link_to_wiki( wiki ), "<br>" );
    }
    if( !no_counters ){
      buf.push( "<em>" + emojied_result( result ) + "</em>. " );
    }
  }
  
  if( !no_counters ){
    if( total ){
      cond_push( 'agree',    agree   );
      cond_push( 'disagree', disagree );
      cond_push( 'protest',  protest, 'em' );
      cond_push( 'blank',    blank   );
      if( result.total() && result.direct() != result.total() ){
        var ratio_direct
        = Math.round( 1000 * ( result.direct() / total ) ) / 10;
        var ratio_indirect
        = Math.round( 1000 * ( ( total - result.direct() ) / total ) ) / 10;
        buf.push(
          ' <span class="nobr">',
          icon( "votes" ), "&nbsp;", l( "total" ), "&nbsp;", result.total(),
          '.',
          '</span> <dfn class="nobr">', 
          icon( "direct" ), "&nbsp;", l( "direct" ), '&nbsp;',
          result.direct(),
          "&nbsp;(",
          ratio_direct,
          '%) ',
          icon( "indirect"), "&nbsp;", l( "indirect"), '&nbsp;',
          result.total() - result.direct(),
          "&nbsp;(",
          ratio_indirect,
          '%).</dfn> '
        );
      }else if( total != agree && total != disagree && total != blank ){
        cond_push( 'total', result.total() );
      }
      
    }
    var ncomments = proposition.measure_comments();
    if( ncomments ){
      buf.push( 
        icon( "comments" ), "&nbsp;", l( "comments"), "&nbsp;",
        proposition.measure_comments(), ". "
      );
    }
  }
  
  if( div && !no_age ){
    buf.push(
      '<br><dfn>',
      l( "change" ), '&nbsp;', result.count(), ' ',
      time_label( result.time_touched ),
      '</dfn>'
    );
  }
  
  if( div && div !== "nocomment" ){
    buf.push( "</div>" );
  }
  
  return buf;
  
}


// section: include.js

var $include;
var $include_json;

if( typeof window === "undefined" ){
  

$include = function( file, prepand, postpand ){
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

$include_json = function( file ){
// Like C's #include when #include is used on the right side of an assignment
  return $include( file, ";($include.result = (", "));")
}

} // end if server-side
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
    "#[A-Za-z_0-9]{3,30}",
  // Twitter name
  wikiwordTwitterPattern:
    "@[A-Za-z_0-9]{3,30}",
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
    ok( "info@virteal.com")
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
if( typeof window === "undefined" ){
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
}

// Let's compute "derived" constants

SW.idCodePrefix = "code" + "id";

// Global variables
var Sw = {
  interwikiMap: map(),	// For interwiki links, actually defined below
  sessionId: 0,         // For debugging
  currentSession: null, // Idem
  requestId: 0,
  timeNow: 0,
  dateNow: 0,
  cachedDateTooltips: map(),
  inspectedObject: null
};

// section: end globals.js


/* ---------------------------------------------------------------------------
 *  Extracted from SimpliWiki and adapted
 */

var Wiki = map();


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
   *  but should match virteal.com/jh.robert@
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

  // ToDo: DRY, this is almost duplicated from simpliwiki wiki.js
  if( true )
    text = text.replace( 
      /(\W)Kudo ([#A-Za-z0-9_]+) @([A-Za-z0-9_]+)/gm,
      function( m, pre, name, domain ){
        var pname = name.replace( "#", "" );
        return pre 
        + '<a href="'
        + '/vote/'
        + pname
        + '?kudo='
        + domain
        + '" class="kudocracy-vote-button" data-title="Kudo">'
        + 'Kudo</a> ' + name + ' @' + domain;
      }
    );
    // Kudo xxxx become vote buttons
    text = text.replace( 
      /(\W)Kudo ([#A-Za-z0-9_]+)/gm,
      function( m, pre, name ){
        var pname = name.replace( "#", "" );
        return pre 
        + '<a href="'
        + '/vote/'
        + pname
        + '?kudo='
        + Session.current.domain_label()
        + '" class="kudocracy-vote-button" data-title="Kudo">'
        + 'Kudo</a> ' + name;
      }
    );

  // Change wiki words into links to simpliwiki
  text = text
  .replace( wiki_names, function( _, $1, $2 ){
    return $1 + link_to_wiki( $2, $2, true /* no icon */ ) 
  });

  // Fix some rare issue with nested links, remove them
  text = text.replace( /(<a [^>\n]+?)<a [^\n]+?>([^<\n]+?)<\/a>/g, '$1$2')
  
  return text;
}


// ---------------------------------------------------------------------------


function i18n_short_comment( comment, no_truncate ){
  
  if( !comment )return "";
  if( comment.substring( 0, 5 ) === "i18n " ){
    // Some comments deserve to be translated
    comment = i18n_comment( comment );
  }
  
  // Truncat after first "...", full content is displayed in page_proposition()
  if( !no_truncate ){
    var etc_index = comment.indexOf( "..." );
    if( etc_index !== -1 ){
      comment = comment.substring( 0, etc_index + 3 );
    }
  }

  return comment  
}


var wikify_comment = ui.wikify_comment
= function wikify_comment( comment, no_truncate ){
// SimpliWiki style formating + i18n
  return Wiki.wikify( i18n_short_comment( comment, no_truncate ) );
}


var l = ui.l
= function l( x ){
  return Session.current.i18n( x );
}


var i18n_comment = ui.i18n_comment
= function i18n_comment( x ){
  return Session.current.i18n_comment( x );
}


var duration_label = ui.duration_label
= function duration_label( duration ){
// Returns a sensible text info about a duration
  // Slight increase to provide a better user feedback
  //duration += 5000;
  var delta = duration / 1000;
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return l( "the future" );
  if( day_delta > 555 * 30 )return l( "some time ago" );
  return (day_delta == 0
      && ( delta < 5
        && l( "just now")
        || delta < 60
        && "" + Math.floor( delta )
        + l( " seconds")
        || delta < 120
        && l( "1 minute")
        || delta < 3600
        && "" + Math.floor( delta / 60 )
        + l( " minutes")
        || delta < 7200
        && l( "about an hour")
        || delta < 86400
        && "" + Math.floor( delta / 3600 )
        + l( " hours")
        )
      || day_delta == 1
      && l( "a day")
      || day_delta < 7
      && "" + day_delta
      + l( " days")
      || day_delta < 31
      && "" + Math.ceil( day_delta / 7 )
      + l( " weeks")
      || day_delta >= 31
      && "" + Math.ceil( day_delta / 30.5 )
      + l( " months")
      ).replace( /^ /, ""); // Fix double space issue with "il y a "
}


var time_label = ui.time_label
= function time_label( time, with_gmt ){
// Returns a sensible text info about time elapsed.
  //with_gmt || (with_gmt = this.isMentor)
  var delta = ((Kudo.now() + 10 - time) / 1000); // + 10 to avoid 0/xxx
  var day_delta = Math.floor( delta / 86400);
  if( isNaN( day_delta) )return "";
  if( day_delta < 0 ) return l( "the future" );
  if( day_delta > 555 * 30 )return l( "some time ago" );
  var gmt = !with_gmt ? "" : ((new Date( time)).toGMTString() + ", ");
  return '<nobr>'
    + gmt
    + (day_delta == 0
      && ( delta < 5
        && l( "just now")
        || delta < 60
        && l( "il y a ") + Math.floor( delta )
        + l( " seconds ago")
        || delta < 120
        && l( "1 minute ago")
        || delta < 3600
        && l( "il y a ") + Math.floor( delta / 60 )
        + l( " minutes ago")
        || delta < 7200
        && l( "about an hour ago")
        || delta < 86400
        && l( "il y a ") + Math.floor( delta / 3600 )
        + l( " hours ago")
        )
      || day_delta == 1
      && l( "yesterday")
      || day_delta < 7
      && l( "il y a ") + day_delta
      + l( " days ago")
      || day_delta < 31
      && l( "il y a ") + Math.ceil( day_delta / 7 )
      + l( " weeks ago")
      || day_delta >= 31
      && l( "il y a ") + Math.ceil( day_delta / 30.5 )
      + l( " months ago")
      ).replace( /^ /, "") // Fix double space issue with "il y a "
  + '</nobr>';
}


var proposition_graphics = ui.proposition_graphics
= function proposition_graphics(){
// Runs client side

  if( true )return drawChart();
  console.info( "Init Google charts" );
  if( window.google ){
    google.load( 'visualization', '1.0', { 'packages': ['corechart'] } );
    google.setOnLoadCallback( drawChart );
  }
  
  function drawChart(){

    var data;
    var options;
    
    if( !window.google )return;

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
       colors: [ '#00AA00', '#0000AA', '#AA0000', '#f0f0f0' ],
       'chartArea': {'width': '100%', 'height': '100%'},
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
    options = { 
      width: 400,
      height: 100,
      chartArea: { width: '100%', height: '100%' }
    };
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
        width:  400,
        height: 300,
        chartArea: { width: '100%', height: '100%' },
      };
  
      // Instantiate and draw our chart, passing in some options
      chart = new google.visualization.PieChart( document.getElementById( 'delegates_chart_div' ) );
      chart.draw( data, options );
    
    }

  }
}


function delegates_graphics(){
// Runs client side

  if( true )return drawChart();
  if( window.google ){
    console.info( "Init Google charts" );
    google.load( 'visualization', '1.0', { 'packages': ['corechart'] } );
    google.setOnLoadCallback( drawChart );
  }
  
  function drawChart(){
    
    if( !window.google )return;

    var chart;
    var data1;
    var data2;
    var data3;
    var options;

    // Create the data tables
    
    data1 = new google.visualization.DataTable();
    data1.addColumn( 'string', "@" );
    data1.addColumn( 'number', 'Slices' );
    data1.addRows( delegates_graph_pies.all );
    
    data2 = new google.visualization.DataTable();
    data2.addColumn( 'string', "#" );
    data2.addColumn( 'number', 'Slices' );
    data2.addRows( tags_graph_pies.all );
    
    data3 = new google.visualization.DataTable();
    data3.addColumn( 'string', "proposition" );
    data3.addColumn( 'number', 'Slices' );
    data3.addRows( propositions_graph_pie );
    
    // Set chart options
    // options = { 'title':'Orientations', 'width':400, 'height':300 };
    options = {
      'width':  400,
      'height': 300,
       'chartArea': {'width': '95%', 'height': '95%'},
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
    
    // Draw the other smaller pies
    options = {
      'width':  300,
      'height': 150,
      'chartArea': {'width': '100%', 'height': '95%'},
    };
    
    var name;
    var data;
    
    for( name in delegates_graph_pies ){
      if( name === "all" )continue;
      data = new google.visualization.DataTable();
      data.addColumn( 'string', "@" );
      data.addColumn( 'number', 'Slices' );
      data.addRows( delegates_graph_pies[ name ] );
      chart = new google.visualization.PieChart(
        document.getElementById( 'delegates_chart_div_' + name )
      );
      chart.draw( data, options );
    }
    
    for( name in tags_graph_pies ){
      if( name === "all" )continue;
      data = new google.visualization.DataTable();
      data.addColumn( 'string', "@" );
      data.addColumn( 'number', 'Slices' );
      data.addRows( tags_graph_pies[ name ] );
      chart = new google.visualization.PieChart(
        document.getElementById( 'tags_chart_div_' + name )
      );
      chart.draw( data, options );
    }
  }
}





/* ---------------------------------------------------------------------------
 *  The REPL Read Eval Print Loop commands of this Test/Debug UI
 */

// List of commands. A kind of router. The basic http server knows how to
// to invoke these commands. See ui1http.js
var http_repl_commands = map();


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
    link_to_command( "signout" ) + " -- clear current session",
    "change_vote &id orientation -- change existing vote",
    "proposition_action verb text #tag text #tag... -- Search, Propose, Tag...",
    "proposition_filter tags... sort_criterias... -- set session filter",
    "proposition_query keywords... sort_criterias... -- set session query",
    "filter_more tags... -- add tags to current filter",
    "filter_less tags... -- remove tags from current filter",
    "filter_toggle tags... -- toggle tags from current filter",
    "proposition_tagging proposition tags... -- add tags to proposition",
    "proposition_propose proposition tags... -- create/update proposition",
    "delegate &id duration -- change delegation",
    link_to_command( "page" ) + " -- list available html pages",
    "page name p1 p2 ... -- move to said page"
  ];
  for( var v in Kudo.replized_verbs ){
    tmp.push( v + " " + Kudo.replized_verbs_help[ v ] );
  }
  pn( tmp.join( "\n" ) );
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
    if( entity.entity_type ){
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
            if( item && item.entity_type === found ){
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
  printnl( "Log " + entity );
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
  printnl( "Effects " + entity );
  print_entities( list );
};


http_repl_commands.value = function( entity ){
  printnl( entity ? pretty( entity.value(), 3 ) : "no entity" );
};


http_repl_commands.change_vote = function( vote_entity, orientation, duration, comment ){

  // Figure out parameters, maybe from pending http query 
  var proposition = null;
  var query = get_query();

  // Find vote, or at least an id for it (when vote does not exists yet)
  var vote_id = query.vote_id;
  if( ! vote_entity ){
    if( ! vote_id ){
      printnl( "Vote not found" );
      return;
    }
    vote_entity = Vote.find( vote_id );
    if( ! vote_entity ){
      trace( "BUG? Cannot change_vote(), invalid vote_id", vote_id );
      printnl( "Vote not found" );
      return;
    }
  }else if( typeof vote_entity === "string" ){
    vote_id = vote_entity;
    vote_entity = Vote.find( vote_entity );
  }else if( vote_entity && ! Vote.valid( vote_entity ) ){
    trace( "BUG? Cannot change_vote(), invalid vote_entity", vote_entity );
    printnl( "Bad vote" );
    return;
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
  || " agree disagree protest blank neutral "
    .indexOf( " " + orientation + " " ) === -1
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
    comment = undefined;
  }
  
  // Something changed?
  if( !orientation && !duration && !comment ){
    printnl( "No change" );
    return;
  }

  // Either a brand new vote
  if( !vote_entity ){
    De&&mand( vote_id );
    var idx_dot = vote_id.indexOf( "." );
    var persona = Persona.find( vote_id.substring( 0, idx_dot ) );
    if( !persona || persona.entity_type !== "Persona" ){
      printnl( "Persona not found" );
      return;
    }
    // Abusers cannot spam with comments
    if( persona.is_abuse() ){
      comment = undefined;
    }
    proposition = Topic.find( vote_id.substring( idx_dot + 1 ) );
    if( proposition && proposition.entity_type !== "Topic" ){
      printnl( "Proposition not found" );
      return;
    }
    Session.current.proposition = proposition;
    Session.current.inject( "Vote", {
      persona:      persona,
      proposition:  proposition,
      orientation:  ( orientation || _ ),
      duration:     duration,
      comment_text: comment
    });
    printnl( "New vote of " + persona + " on " + proposition );
    //redirect( "proposition%20" + proposition.label );

  // Or a change to an existing vote
  }else{
    persona = vote_entity.persona;
    // Abusers cannot spam with comments
    if( persona.is_abuse() ){
      comment = undefined;
    }
    if( duration || orientation ){
      // Adjust duration to make a renew
      if( duration ){
        duration += vote_entity.age();
      }
      Session.current.proposition = vote_entity.proposition;
      Session.current.inject( "Vote", {
        id_key:       vote_entity.id,
        orientation:  ( orientation || _ ),
        duration:     duration,
        comment_text: comment
      });
      printnl( "Changed vote " + pretty( vote_entity ) );
    }
    if( comment && !duration && !orientation ){
      Session.current.inject( "Comment", {
        vote: vote_entity,
        text: comment
      });
      printnl( "Comment changed " + pretty( vote_entity ) );
      // Change to comment only, go to page about proposition
      Session.current.redirect( "proposition " + vote_entity.proposition.label );
    }
  }
  return;
};


http_repl_commands.set_delegation = function( agent, main_tag ){
  
  var visitor = Session.current.visitor;
  
  if( !visitor ){
    printnl( "No login" );
    return;
  }
  
  // Sanitize agent
  agent = "@" + dialess( agent ).replace( /[^A-Za-z0-9_]/g, "" );
  var agent_entity = Persona.find( agent );
  if( !agent_entity ){
    printnl( "Not found agent: " + agent );
    return;
  }
  
  // Sanitize main tag
  main_tag = "#" + dialess( main_tag ).replace( /[^A-Za-z0-9_]/g, "" );
  var main_tag_entity = Topic.find( main_tag );
  if( !main_tag_entity ){
    printnl( "No found tag: " + main_tag );
  }
  
  // Sanitize additional tags
  var text = slice( arguments, 2 ).join( " " );
  var tags = [ main_tag_entity ];
  var error = false;
  dialess( text ).replace( /[A-Za-z][A-Za-z0-9_]*/g, function( tag ){
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
  Session.current.inject( "Delegation", {
    persona: visitor,
    agent:   agent_entity,
    tags:    tags
  } );
}


http_repl_commands.change_delegation = function( delegation_entity, agent, duration ){
  
  var query = get_query();

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
  if( !duration ){
    printnl( "No change" );
    return;
  }

  // Adjust duration to make a renew
  if( duration ){
    duration += delegation_entity.age();
  }
  Session.current.inject( "Delegation", {
    id_key:      delegation_entity.id,
    duration:    duration
  });
  printnl( "Changed delegation " + pretty( delegation_entity ) );

  return;
};


http_repl_commands.login = function( /* name, authentication, alias, more */ ){
  
  var session = Session.current;
  if( session.visitor ){
    session.redirect( "visitor" );
    return;
  }
  
  var args = as_array( arguments );
  
  // Shift arguments when name is not there
  if( args[0] === "twitter" ){
    // This will turn into @twitter pseudo name
    args.unshift( "twitter" );
  }
  
  // Sanitize name
  var name = args[0];
  name = dialess( name || "" ).trim().replace( /[^A-Za-z0-9_]/g, "" );
  if( name[0] !== "@" ){ name = "@" + name };
  if( name.length < 3 )return;

  var authentication = args[1];
  
  // Collect & sanitize alias, turn spaces into _
  var alias = slice( args, 2 ).join( "_" );
  if( !alias && session.pending_alias ){
    alias = session.pending_alias;
    session.pending_alias = "";
  }
  alias = dialess( alias || "" )
  .trim().replace( /[^A-Za-z0-9\-\'_]/g, "" ).substring( 0, 32 );

  if( l8.client )console.warn( "Login", name, authentication, alias );
  
  // If twitter login, redirect to page_twitter()
  if( authentication === "twitter" ){
    // Set where visitor should land after login is done
    if( session.current_page[0] === "login" ){
      // They should go to the page before the "login" page
      session.set_current_page( session.previous_page );
    }
    // Remember alias to set after authentication is done
    if( !alias && name !== "@twitter" ){
      alias = name.substring( 1 );
    }
    session.pending_alias = alias;
    session.redirect( "twitter" );
    return;
  }
  
  var lower_name = name.toLowerCase();
  var persona = Persona.find( lower_name );
  session.set_visitor( persona );
  
  // Done. Unless persona does not exits (ie first visit) or authentication
  if( !persona && authentication !== "cli" )return;
  
  // Special "new_xxx" alias is an admin command when issued by domain owner
  var is_new = alias.substring( 0, "new_".length ) === "new_";
  var new_persona_name;
  if( is_new ){
    new_persona_name = alias.substring( "new_".length );
    if( new_persona_name.length <= 2 ){
      new_persona_name = "";
    }
    alias = "";    
  }
  
  // Only domain owner can create a new persona
  if( is_new ){
    if( !new_persona_name
    ||  !persona
    ||  !persona.is_domain_owner()
    ){
      printnl( "Cannot create new persona" );
      return;
    }
    name = "@" + new_persona_name;
    lower_name = name.toLowerCase();
    persona = Persona.find( lower_name );
  }
  
  // Create persona when first authentic visit, respect user provided case
  if( !persona ){
    // Only when CLI & .authentic()
    if( authentication !== "cli" )return;
    session.inject( "Persona", { label: name } );
    persona = Persona.find( lower_name );
    if( !persona ){
      printnl( "Failed to inject new persona: " + name );
      return;
    }
  }

  // ToDo: set cookies for SimpliWiki
  
  // Create persona's topic if necessary. It will tag propositions created
  // by the persona
  var persona_topic_id = "#" + persona.short_label();
  var persona_topic = Topic.find( persona_topic_id );
  if( !persona_topic ){
    session.inject( "Topic", {
      label: persona_topic_id,
      persona: persona
    });
    persona_topic = Topic.find( persona_topic_id );
  }
  
  // Create first vote if none so far, in favor of persona
  // If the result ever becomes "protest" the persona is "abuse", ie "banned"
  var vote_id = persona.label + ".#" + persona.short_label();
  var vote_entity = Vote.find( vote_id );
  if( !vote_entity ){
    session.inject( "Vote", {
      persona: persona,
      proposition: persona_topic,
      orientation: Vote.agree
    });
  }
    
  // Set new comment for persona, ie the alias. Also handle 'admin' stuff
  if( alias ){
    
    alias = "@" + alias;
    
    // Don't allow misleading alias that match a twitter name, unless 'admin'
    var impersonate = Persona.find( alias );
    if( impersonate ){
      // Special admin case for the domain owner, to impersonate someone
      if( persona.is_domain_owner() ){
        persona = impersonate;
      }
    }
    
    if( !impersonate ){
      var old_text = persona.get_comment_text();
      var text;
      var old_alias = persona.get_alias().replace( / /g, "_" );
      if( old_alias ){
        // Hack to clear alias: use _ alone or alias eq to name
        if( alias === "@_"
        ||  alias.toLowerCase() === name.toLowerCase()
        ){
          alias = "";
        }
        text = old_text.replace( "@" + old_alias, alias );
      }else{
        text = alias + " " + ( old_text || l( "alias" ) );
      }
      if( text && text !== old_text ){
        session.inject( "Comment", {
          vote: vote_entity,
          text: text
        });
      }
    }
  }
  
  // Show propositions without a vote, unless some other filter is active
  if( session.filter === "" || session.filter === " #hot " ){
    session.set_filter( "#new" );
  };
  
  // Authenticate
  session.set_visitor( persona, true /* authentic */ );
  
  // Redirect to page before page_login()
  if( session.current_page[0] === "login" ){
    session.redirect_back();
  }
  
};


http_repl_commands.authentic = function( auth_name ){
// Called when firebase authentication succeeds, ajax called
  
  // Cancel default redirect, it is done otherwise
  var session = Session.current;
  session.response.fast_redirect = "";
  
  trace( "Authentic() called, auth_name", auth_name );
  auth_name = ( "@" + auth_name ).replace( /@@/g, "@" );
  
  // Do as if authentic login from the Twitter CLI
  http_repl_commands.login( auth_name, "cli" );
  
  var visitor = session.visitor;
  if( !visitor )return;
  
  trace( "Twitter authentic", auth_name );
  
} // .authentic()


http_repl_commands.describe_domain
= function( key, secret, token, token_secret, privacy ){
  
  trace(
    "domain description:",
    "key", key,
    "secret", secret,
    "token", token,
    "token_secret", token_secret,
    "privacy", privacy
  );
  
  var session = Session.current;
  var visitor = session.visitor;
  
  if( !visitor ){
    printnl( "Must login first" );
    return;
  }
  if( !session.authentic ){
    printnl( "Twitter authentication required for ", visitor.label );
    return;
  }
  var proposition = visitor.get_topic();
  if( !proposition ){
    printnl( "Missing proposition for ", visitor.label );
    return;
  }
  if( !visitor.is_domain() ){
    printnl( 'Missing "#domain" tag for', visitor.label );
    return;
  }
  
  var data = proposition.get_data( "domain" ) || map();
  var old_data_signature = JSON.stringify( data );
  data.twitter_consumer_key = key;
  data.twitter_consumer_secret = secret;
  data.twitter_access_token = token;
  data.twitter_access_token_secret = token_secret;
  data.is_public = ( privacy === "public" );
  if( JSON.stringify( data ) !== old_data_signature ){
    session.inject( "Store", {
      proposition: proposition,
      key: "domain",
      value: data,
      persona: visitor
    });
  }

  // Redirect to page before page_domain()
  if( session.current_page[0] === "domain" ){
    var previous_page = session.previous_page;
    session.set_current_page( previous_page );
    session.redirect_back();
  }
};


http_repl_commands.lang = function( lang ){
  Session.current.set_lang( lang );
};


http_repl_commands.help_toggle = function(){
  if( Session.current.is_novice ){
    Session.current.expert_mode();
  }else{
    Session.current.novice_mode();
  }
  Session.current.clear_fragment( "all" ); // Session.current.page_id );
};


http_repl_commands.proposition_filter = function(){
  var text = as_array( arguments ).join( " " );
  Session.current.set_filter( text );
  Session.current.proposition = null;
  Session.current.redirect_back( 1, Session.current.full_query() );
  return;  
};


http_repl_commands.proposition_query = function(){
  var text = as_array( arguments ).join( " " );
  Session.current.filter_query = text.trim().toLowerCase();
  text = Session.current.set_filter();
  Session.current.sort_criterias.forEach( function( criteria ){
    text += criteria + " ";
  });
  Session.current.redirect_back( 1, text.trim() );
  return;  
};


http_repl_commands.filter_more = function(){
  var text = as_array( arguments ).join( " " );
  text = Session.current.full_query() + " " + text;
  return http_repl_commands.proposition_filter( text )
};


http_repl_commands.filter_less = function(){
  var less = as_array( arguments ).join( " " );
  var text = " " + Session.current.full_query() + " ";
  less.split( " " ).forEach( function( label ){
    if( !label )return;
    text = text.replace( " " + label, "" );
  });
  return http_repl_commands.proposition_filter( text );
};


http_repl_commands.filter_toggle = function(){
  var tags = as_array( arguments ).join( " " );
  var text = " " + Session.current.full_query() + " ";
  var old = text.trim();
  tags.split( " " ).forEach( function( label ){
    if( !label )return;
    if( text.indexOf( " " + label + " ") !== -1 ){
      text = text.replace( " " + label + " ", "" );
    }else{
      text += " " + label + " ";
    }
  });
  // Don't clear the whole filter, leave the last tag intact
  if( !text.trim() ){
    text = old;
  }
  return http_repl_commands.proposition_filter( text );
};


http_repl_commands.proposition_delegate = function(){
// Delegation to agent. Optional filter.
  var text = as_array( arguments ).join( " " );
  
  var visitor = Session.current.visitor;

  if( visitor ){
    printnl( "No login" );
    return;
  }
  
  if( !Session.current.has_filter() ){
    printnl( "No filter" );
    return;
  }
  
  // Remove sort criterias, # hashtags and invalid characters
  var agent_name = dialess( text )
  .replace( /[+\-][a-z_]*/, "" )
  .replace( /#[A-Za-z][_0-9A-Za-z]*/g, "" )
  .replace( /[^A-Za-z0-9_]/g, "" );
  
  // First token is agent name
  if( agent_name ){
    agent_name = agent_name.split( " " )[0];
  }
  
  // What remains should be a valid personna's name
  if( !agent_name ){
    printnl( "No agent" );
    return;
  }
  
  var agent = Persona.find( "@" + agent_name );
  if( !agent ){
    printnl( "Invalid agent")
    return;
  }
  
  // There can be a filter too
  text = text.replace( agent_name, "" ).trim();
  
  if( text.length ){
    Session.current.set_filter( text );
  }
  
  // Cannot delegate without valid tags
  if( !Session.current.filter_tag_entities.length ){
    printnl( "No valid filter" );
    return;
  }
  
  Session.current.inject( "Delegation", {
    persona: visitor,
    agent:   agent,
    tags:    Session.current.filter_tag_entities
  });
  
}


http_repl_commands.proposition_detagging = function( proposition_name, text ){
  
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
  
  // Check access rights
  if( ! Session.current.can_detag( proposition ) ){
    printnl( "Only author can detag" );
    return;
  }
  
  // Collect list of tags
  var tags = [];
  text = text.replace( /[A-Za-z][_0-9A-Za-z]*/g, function( tag ){
    tags.push( "#" + tag );
    return ""
  } );
  
  // Tags were removed, nothing should remain
  text = text.replace( /#/g, "" ).trim();
  if( text ){
    printnl( "Detagging, invalid: " + text );
    return;
  }

  // Collect a list of valid tags, filter out reserved tag, identify news
  var tag_entities = []; // Existing tags
  tags.forEach( function( tag ){
    de&&mand( tag[0] === "#" );
    // Filter out reserved tag
    if( Topic.reserved( tag ) )return;
    var entity = Topic.find( tag );
    if( entity ){
      if( tag_entities.indexOf( entity ) === -1 ){
        tag_entities.push( entity );
      }
    }
  });
  
  // Exit if no valid tags and no changes
  if( !tag_entities.length )return;

  // Update topic with new tags. Note: this removes tags, it doesn't add any
  Session.current.inject( "Tagging", {
    proposition: proposition,
    detags:      tag_entities,
    persona:     Session.current.visitor
  } );

  // Set hint to display involved proposition at top of sorted lists
  Session.current.proposition = proposition;

};


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
  
  // Check access rights
  if( ! Session.current.can_tag( proposition ) ){
    printnl( "Only author can tag" );
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
        changes = [];
        // return;
      }else{
        changes.push( function(){
          Session.current.inject( "Topic", {
            label:   tag,
            persona: Session.current.visitor
          } );
        });
        changes.push( function(){
          tag_entities.push( Topic.find( tag ) );
        })
      }
    }
  });
  
  // Exit if no valid tags and no changes
  if( !tag_entities.length && !changes.length )return;

  // Update topic with new tags. Note: this adds tags, it doesn't remove any
  changes.push( function(){
    Session.current.inject( "Tagging", {
      proposition: proposition,
      tags:        tag_entities,
      persona:     Session.current.visitor
    } );
  });
  
  // Process changes. ToDo: async
  Session.current.inject( changes );

  // Set hint to display involved proposition at top of sorted lists
  Session.current.proposition = proposition;

  // Update filter to match topic, this provides feedback
  var new_filter = [];
  Ephemeral.each( tag_entities, function( tag_entity ){
    // Skip user names, including name of proposer, useless noise
    if( Persona.find( "@" + tag_entity.name.substring( 1 ) ) )return;
    new_filter.push( tag_entity.label );
  });
  Session.current.set_filter( new_filter.join( " " ) );
  
};


http_repl_commands.proposition_propose = function( text ){
  
  var visitor = Session.current.visitor;
  if( !visitor ){
    printnl( "Invalid persona cannot propose" );
    return;
  }
  
  var original_text = text;
  
  // Remove extra #
  text = text.replace( /##/, "#" );
  
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
  text = dialess( text )
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
  
  // Refuse to create a proposition when a tag of the same name exits already
  if( !proposition && Topic.find( "#" + proposition_name ) ){
    printnl(
      "Cannot create proposition, tag with same name already exists: "
      + proposition_name
    );
    return;
  }
  
  // Refuse to create a proposition when a persona with the same name exists
  if( !proposition && Persona.find( "@" + proposition_name ) ){
    printnl(
      "Cannot create proposition, persona with same name already exists: "
      + proposition_name
    );
    return;
  }
  
  // inject user's name as first tag if new or somehow new topic
  if( !proposition || !proposition.get_comment_author() ){
    tags.push( "#" + visitor.short_label() );
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
        Session.current.inject( "Topic", {
          label:   tag,
          persona: visitor
        } );
      });
      changes.push( function(){
        var new_tag_entity = Topic.find( tag );
        if( !new_tag_entity ){
          debugger;
          de&&mand( new_tag_entity );
        }
        tag_entities.push( Topic.find( tag ) );
      })
    }
  });

  // Redirect visitor to proposition's page once done
  Session.current.redirect( "proposition " + proposition_name );
  
  // Optional comment handling
  var query = get_query();
  var comment = query.comment || undefined;
  
  // Creation of topic or update with addition of tags
  if( !proposition ){
    // Don't create proposition and tags at the same time, too risky
    if( count_new > 1 ){
      printnl( "Cannot create both proposition & many tags at the same time" );
      // return;
    }else{
      changes.push( function(){
        Session.current.inject( "Topic", {
          label:        text,
          tags:         tag_entities,
          persona:      visitor,
          comment_text: comment 
        } );
      } );
    }
  }else{
    // Exit if no valid tags
    if( !tag_entities.length ){
      return;
    }
    changes.push( function(){
      Session.current.inject( "Tagging", {
        proposition:  proposition,
        tags:         tag_entities,
        persona:      visitor,
        comment_text: comment
      } );
    });
  }

  // Process changes. ToDo: async
  Session.current.inject( changes );

  // Set hint to display involved proposition at top of sorted lists
  Session.current.proposition = proposition || Topic.find( proposition_name );

  // Update filter to match topic, this provides feedback
  var new_filter = [];
  tag_entities.forEach( function( tag_entity, index ){
    if( !tag_entity ){
      de&&bug( "Missng tag_entity in propose()" );
      debugger;
      return;
    }
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
  var is_tagging   = ( name === "Tag"      || name === l( "b-Tag"      ) );
  var is_detagging = ( name === "Untag"    || name === l( "b-Untag"    ) );
  var is_search    = ( name === "Search"   || name === l( "b-Search"   ) );
  var is_query     = ( name === "Query"    || name === l( "b-Query"    ) );
  var is_delegate  = ( name === "Delegate" || name === l( "b-Delegate" ) );
  
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
  if( is_search ){
    if( text.indexOf( "Search " ) === 0 ){
      name = "Search";
      text = text.substring( "Search ".length );
    }else{
      var i18 = l( "b-Search" ) + " ";
      if( text.indexOf( i18 ) === 0 ){
        name = "Search";
        text = text.substring( i18.length );
      }
    }
  }
    
  // Search, text is expected to be a space separated list of tags or criterias
  if( is_search )return http_repl_commands.proposition_filter( text );

  // Query, text is expected to be a space separated list of tags or criterias
  if( is_query )return http_repl_commands.proposition_query( text );

  // Remove sort criterias potential noise
  text = text.replace( /[+\-][a-z_]*/g, "" );

  // Delegate
  if( is_delegate )return http_repl_commands.proposition_delegate( text );
  
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


http_repl_commands.badge_vote = function( /* p_name, orient, next_redir */ ){
  
  var session = Session.current;
  var args = session.pending_vote || arguments;
  session.pending_vote = null;
  var proposition_name = args[ 0 ];
  var orientation      = args[ 1 ];
  var next_redir       = args[ 2 ];
  if( !proposition_name ){
    proposition_name = "kudocracy";
  }
  if( !orientation ){
    orientation = "agree";
  }
  var valid_orientations = {
    "agree":    true,
    "disagree": true,
    "blank":    true,
    "protest":  true,
    "neutral":  true
  }
  if( !valid_orientations[ orientation ] ){
    session.redirect( "votebadge/" + proposition_name );
    return;
  }
  var proposition = Topic.find( proposition_name );
  if( !proposition ){
    session.redirect( "votebadge/kudocracy" );
    return;
  }
  
  // Simple case, visitor is already logged in
  if( session.authentic ){
    session.inject( "Vote", {
      persona: session.visitor,
      proposition: proposition,
      orientation: orientation
    });
    cls();
    printnl( 
      ":) " + ui.emojied( orientation )
      + " " + link_to_proposition_page( proposition )
    );
    if( next_redir === "back" ){
      session.redirect_back();
    }
    return;
  }
  
  // Complex case, need to login first
  session.pending_vote = [ proposition.id, orientation ];
  session.redirect( "cmd login twitter" );
  
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

function str_starts_with( a_str, something ){
  if( !something )return false;
  if( something.length > a_str )return false;
  return ( a_str.substring( 0, something.length ) === something );
}


http_repl_commands.api = function( req, res ){
// Process http requests that starts with /api/
// This is not a normal command, it is called by the http server directly.
// See also ldfp (Liquid Democracy Federation Protocol)
//   https://lqdbxl.piratenpad.de/ldfp?

  var session = req.kudo_session;
  
  // Handle POST request, to inject changes in ephemeral machine
  if( req.method === "POST" ){
    
    if( !req.post_data_collected ){
      req.post_data = "";
      req.on( "data", function( data ) {
        req.post_data += data;
        if( req.post_data.length > 100000 ) {
          req.post_data = "";
          res.writeHead( 413, { "Content-Type": "text/plain" } );
          res.end();
          req.connection.destroy();
        }
      });
      req.on( "end", function() {
        req.post_data_collected = true;
        try{
          req.post_data_json = JSON.parse( req.post_data );
        }catch( err ){
          trace( "API json", err, err.stack );
          res.writeHead( 413, { "Content-Type": "text/plain" } );
          res.end();
          return;
        }
        // Requeue request, now ready for further processing
        http_repl_commands.api( req, res );
      });
      return false;
    }
    
    if( !session.can_script || session.can_script === "init" ){
      trace( "BUG? api call from noscript client" );
      session.can_script = true;
    }
    
    var json_data = req.post_data_json;
    if( json_data.inject ){
      if( session.authentic ){
        // Is it about a different domain?
        var domain = json_data.parameters.domain;
        if( domain !== undefined && domain !== session.domain ){
          debugger;
          var machine = Ephemeral.Machine.find( domain.toLowerCase() );
          if( machine ){
            machine.activate( domain );
            Ephemeral.inject( json_data.inject, json_data.parameters );
            session.machine.activate();
          }else{
            trace( "BUG? invalid domain, no machine", domain );
          }
        }else{
          Ephemeral.inject( json_data.inject, json_data.parameters );
        }
      }else{
        trace( "Ignored change from not authentic visitor", session.visitor );
      }
    }
    
    // Send pulled changes as result
    var changes = session.pull_changes();
    res.writeHead( 200, { 
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate' 
    } );
    res.end( JSON.stringify( changes ) );
    return;
    
  }
  
  // Handle GET api/type requests
  
  var url = req.url;
  
  // Extract ? query parameters
  var idx_query = url.indexOf( "?" );
  var query = "";
  if( idx_query !== -1 ){
    query = url.substring( idx_query + 1 );
    url   = url.substring( 0, idx_query );
  }
  
  var current_machine = Ephemeral.Machine.current;
  
  // Look for some query parameters. json for example
  function get_query_parameter( p ){
    var idx_p = query.indexOf( p + "=" );
    if( idx_p === -1 )return "";
    var buf = query.substring( idx_p + p.length + 1 );
    var idx_end = buf.indexOf( ";" );
    var idx_and = buf.indexOf( "&" );
    if( idx_and !== -1 ){
      if( idx_end === -1 ){
        idx_end = idx_and;
      }else if( idx_and < idx_end ){
        idx_end = idx_and;
      }
    }
    if( idx_end === -1 )return buf;
    buf = buf.substring( 0, idx_end );
    return decodeURIComponent( buf );
  }
  
  var jsonp = get_query_parameter( "jsonp" );
  
  var domain_param = get_query_parameter( "domain" );
  if( domain_param ){
    var machine = Ephemeral.Machine.find( domain_param );
    if( machine ){
      machine.activate();
    }
  }
  
  // Optional time limit to reduce amount of output.
  // This ok for trap directed polling.
  var now = l8.update_now();
  
  var effective_time_limit = 0;
  
  var time_limit = 0;
  var time_limit_param = get_query_parameter( "time_limit" );
  if( time_limit_param ){
    time_limit = parseInt( time_limit_para, 10 );
    if( time_limit ){
      effective_time_limit = time_limit;
    }else{
      effective_time_limit = l8.now - Kudo.ONE_HOUR;
    }
  }
  
  var max_age = 0;
  var max_age_param = get_query_parameter( "max_age" );
  if( max_age_param ){
    max_age = parseInt( max_age_param, 10 );
    if( max_age ){
      time_limit = 0;
      effective_time_limit = now - max_age;
    }else{
      if( !time_limit ){
        effective_time_limit = now - Kudo.ONE_HOUR;
        max_age = Kudo.ONE_HOUR;
      }
    }
  }
  
  var effective_max_age 
  = !effective_time_limit ? 0 : now - effective_time_limit;
  
  var max_entities = 200;
  var max_entities_param = get_query_parameter( "max_entities" );
  var max_entities_param_value = parseInt( max_entities_param, 10 );
  if( max_entities_param_value && max_entities_param_values <= 200 ){
    max_entities = max_entities_param_values;
  }
  
  var start_index = 0;
  var start_index_param = get_query_parameter( "start_index" );
  if( start_index_param ){
    start_index = parseInt( start_index );
    if( !start_index ){
      start_index = 0;
    }
  }
  
  var sort_criteria = "";
  var sort_criteria_param = get_query_parameter( "sort" );
  if( sort_criteria_param ){
    // ToDo:
    sort_criteria = sort_criteria_param;
  }
  
  var persona;
  var persona_param = get_query_parameter( "persona" );
  if( persona_param ){
    persona = Persona.find( persona_param );
  }
  
  var filter = get_query_parameter( "filter" );
  if( filter ){
    session.set_filter( filter );
  }
  filter = session.full_query();
  
  var client_data_param = get_query_parameter( "client_data" );

  // Extract entities of specified type
  var more = false;
  var entities = [];
  var type = "";
  var path = "";
  
  function test( a_type ){
    if( str_starts_with( url, "/api/" + a_type ) ){
      type = a_type;
      path = url.substring( "/api/".length + type.length + 1 );
    }
    return type;
  }
  
  test( "Session" ) ||
  test( "Change" ) ||
  test( "Topic" ) ||
  test( "Proposition") ||
  test( "Persona" ) ||
  test( "Vote") ||
  test( "Comment" ) ||
  test( "Delegation") ||
  test( "Result");
  
  if( type ){
    
    if( type === "Session" ){
      // It's alive!
      if( session.can_script !== true ){
        session.can_script = true;
      }
      var json_data = get_query_parameter( "capabilities" );
      if( json_data ){
        var data;
        try{
          data = JSON.parse( decodeURIComponent( json_data ) );
        }catch( err ){
          trace( "BUG? invalid ?capalibilities", err );
        }
        session.set_capabilities( data );
      }
      if( session.visitor ){
        entities.push( session.visitor.json_value() );
      }
      
    }else{
      
      var is_about_changes = false;
      
      if( type === "Proposition" ){
        type = "Topic";
      }else if( type === "Change" ){
        is_about_changes = true;
      }
      
      // Single entity
      if( path ){
        // console.log( "API find", type, path );
        var entity = Kudo[ type ].find( path );
        if( entity ){
          entities.push( entity.json_value() );
        }
      
      // Multiple entities
      }else{
        
        var all_entities = [];
        
        if( is_about_changes ){
          all_entities = Machine.current.changes;
          
        }else{
          Ephemeral.each( Kudo[ type ].all, function( entity ){
            if( entity.filtered && !entity.filtered(
              session.filter,
              session.filter_query,
              persona
            ) )return;
            all_entities.push( entity );
          });
          
          if( !sort_criteria ){
            sort_criteria = session.sort_criterias[ 0 ];
          }
          if( sort_criteria ){
            all_entities = all_entities.sort( function( a, b ){
              return Ephemeral.compare_measure( a, b, sort_criteria, persona )
            });
          }
        }
        
        var index = -1;
        var count = 0;
        var reversed = false;
        if( start_index < 0 ){
          start_index = -start_index - 1;
          reversed = true;
          all_entities.reverse();
        }
        var collector = function( entity ){
          if( effective_time_limit ){
            var t = is_about_changes 
            ? entity.p.ts
            : entity.time_touched || entity.timestamp;
            if( t < effective_time_limit )return;
          }
          index++;
          if( start_index && index < start_index )return;
          count++;
          if( count > max_entities ){
            more = true;
            return;
          }
          entities.push( is_about_changes ? entity : entity.json_value() );
        }
        if( reversed ){
          start_index = -start_index - 1;
        }
        
        if( is_about_changes ){
          all_entities.forEach( collector );
        }else{
          Ephemeral.each( all_entities, collector );
        }
      }
    }
  }
  
  // Sanitize
  entities.forEach( function( value ){
    // Remove twitter app/API keys
    if( value.data && value.data.domain ){
      delete value.data.domain;
    }else if( value.value && value.key === "domain" ){
      value.value = { is_public: !!value.value.is_public };
    }
  } );
  
  var response = {
    client_data: client_data_param,
    domain: Ephemeral.Machine.current.id || Config.domain,
    timestamp: now,
    duration: l8.update_now() - now,
    type: type,
    path: path,
    filter: filter,
    persona: persona,
    time_limit: effective_time_limit,
    max_age: effective_max_age,
    max_entities: max_entities,
    start_index: start_index,
    count: entities.length,
    more: more,
    sort: sort_criteria,
    entities: entities
  }
  
  // Response is json
  var json_result = JSON.stringify( response );
  
  // Wrap with jsonp if provided
  if( jsonp ){
    json_result = jsonp + "(" + json_result + ");"
  }
  
  current_machine.activate();
  
  res.writeHead( 200, { 
    'Content-Type':  'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate' 
  } );
  res.end( json_result );
  
};


http_repl_commands.csv = function csv( persona_label ){
// Produce a cvs file with all votes on all topics by all personas.
// Response to /csv HTTP request.
// This is not a normal command, it is called by the http server directly
  var buf = new ui.Builder(
    "user,",
    "proposition,",
    "orientation,",
    "tags,",
    "delegation",
    "\r\n"
  );
  var personas = [];
  for( var key in Persona.all ){
    personas.push( key );
  }
  if( persona_label ){
    var focus = Persona.find( persona_label );
    if( focus ){
      personas = [ focus.id ];
    }else{
      personas = [];
    }
  }
  for( var ii = 0 ; ii < personas.length ; ii++ ){
    var persona = Persona.find( personas[ ii ] );
    if( !persona )continue;
    var votes = persona.votes();
    for( var jj = 0 ; jj < votes.length ; jj++ ){
      var vote = Vote.valid( votes[ jj ] );
      if( !vote )continue;
      var orientation = vote.orientation();
      if( orientation === Vote.neutral )continue;
      var delegation = vote.delegation();
      buf.push(
        '"', persona.label, '"',
        ",",
        '"', vote.proposition.label, '"',
        ",",
        '"', orientation, '"',
        ",",
        // ToDo: implement 'options' parameter in .tags_string()
        '"', vote.proposition.tags_string( null, false, true ), '"',
        ",",
        '"', ( delegation && delegation.label || "" ), '"',
        "\r\n"
      );
    }
  }
  return buf.join();
}


http_repl_commands.version = function(){
  printnl( "Kudocracy Version: " + Kudo.version );
}


function process_kudo_imports( kudo_scope ){
// This function fill the global Kudo map and init global variables with
// stuff imported from elsewhere.
  Kudo    = kudo_scope;
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
  Machine    = Kudo.Ephemeral.Machine;
  Change     = Kudo.Change;
  Topic      = Kudo.Topic;
  Persona    = Kudo.Persona;
  Vote       = Kudo.Vote;
  Delegation = Kudo.Delegation;
  Comment    = Kudo.Comment;
  // Exports
  Kudo.Session = Session;
}


/*
 *  Export stuff when core runs client side as a UI server
 */

function local_login( label, is_authentic ){
  var session = Session.login( "127.0.0.1" );
  session.set_visitor( null );
  if( label ){
    var visitor = Persona.find( label );
    if( visitor ){
      session.set_visitor( visitor, !!is_authentic );
    }else{
      console.warn( "BUG? unexpected failed login for", label );
      debugger;
    }
  }
};


exports.get_config = get_config;


function get_kudo_scope(){
  return Kudo;
}

exports.get_kudo_scope = get_kudo_scope; 


exports.start = function( kudo_scope, port, host ){
// Starts the ui server. It behaves like an http requests processor.
// Note: port/host are "local"/document.domain on the client side.

  process_kudo_imports( kudo_scope );
  Kudo = kudo_scope;
  Kudo.ui = ui;
  
  Kudo.Ephemeral.Machine.current.add_alias( Config.domain );

  var http_server = require( "./ui1http.js" );
  // The basic http server understands commands, see http_repl_commands.
  Ui1Server = http_server.start(
    kudo_scope,
    Config,
    http_repl_commands,
    port,
    host
  );
  if( !Ui1Server ){
    console.warn( "Could not start Ui1Server" );
    return null;
  }
  Ui1Server.get_kudo_scope   = get_kudo_scope;
  Ui1Server.set_config       = set_config;
  Ui1Server.get_config       = get_config;
  Ui1Server.login            = local_login;
  Ui1Server.set_login_secret = set_login_secret;
  
  Ui1Server.ui1twit = function( p, t ){
    // Called from ui1twit.js at startup
    kudo_scope.MonitoredPersona = p;
    TwitterUser = kudo_scope.TwitterUser = t;
  }
  Ui1Server.twittrust = function( trust_actor ){
    // Called from twittrust.js at startup
    kudo_scope.TrustActor = trust_actor;
  }
  
  // Some pages are defined in other files
  var page_names = [
    "index",
    "proposition",
    "twittrust"
  ];
  page_names.forEach( function( name ){
    require( "./page" + name + ".js" ).start( kudo_scope );
  } );

  // Some rather global imports
  // ToDo: avoid this somehow
  querystring = kudo_scope.querystring;
  printnl     = kudo_scope.printnl;
  get_query   = kudo_scope.get_query;
  set_head    = kudo_scope.set_head;
  set_body    = kudo_scope.set_body;
  cls         = kudo_scope.cls;
  printnl     = kudo_scope.printnl;
  pn          = kudo_scope.pn;

  if( l8.client ){
    window.kudo_signal_capabilities = kudo_signal_capabilities;
    window.kudo_is_offline = function( assert ){
      if( arguments.length ){
        console.info( "Offline assert:", assert );
        window.kudo_was_offline = assert;
        return assert;
      }
      var was_offline = window.kudo_was_offline;
      var is_offline = false;
      if( 'onLine' in navigator ){
        is_offline = !navigator.onLine;
      };
      // User can decide the stay offline (for current browser session)
      if( !is_offline && was_offline && !window.kudo_offline_confirmed ){
        if( window.confirm(
          "Kudocracy - "
          + l( "Back online" ) + ". " + l( "Stay offline?" )
        ) ){
          console.info( "Offline confirmed" );
          window.kudo_offline_confirmed = true;
          return true;
        }else{
          window.kudo_was_offline = false;
        }
      }
      return is_offline;
    }
  }

  // r is a f( req, res ) type of function.
  return Ui1Server;
};
