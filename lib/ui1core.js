//  ui1core.js
//    First UI for Kudocracy, test/debug UI, core
//
// Jun 11 2014 by @jhr, extracted from main.js
// Sep 23 2014 by @jhr, extracted from ui1.js

"use strict";

var config = {
  
  domain: "kudocracy",
  
  // Default value for http "Host" header
  host: "kudocracy.com",
  
  // Firebase name, required for twitter authentication
  firebase: "kudocracy",

  src: "http://simpliwiki.com/",

  // The base url for wiki pages. WikiWord, on_tag or [word] are added
  wiki: "http://simpliwiki.com/kudocracy/",

  // Where to find the 'global' style sheet
  style: "/public/kudocracy.css", // from http://simpliwiki.com/simpliwiki.css

  // Where to find the style sheet for the index page
  index_style: "/public/style.css", // from http://simpliwiki.com/style.css

  // The icon that the browser shows to identify the kudocracy window
  shortcut_icon:  "http://simpliwiki.com/yanugred16.png",

  // The 'kudocracy' html img tag, it includes height/width attributes to avoid flicker
  icon: '<img src="http://simpliwiki.com/yanugred16.png" type="image/png" height="16" width="16"/>',

  // The UEB icon (Universal Edit Button, a 'standard')
  ueb_icon: '<img src="http://simpliwiki.com/ueb16.png" type="image/png" height="16" width="16"/>',
  
  // Unused yet
  twitter_icon: '<img src="http://simpliwiki.com/twitter_ico.png" type="image/png" height="16" width="16"/>',
  
  // false in "production" mode. Init at startup based on ENV vars
  dev_mode: false

};


function process_config(){
// Compute config values that are derived from configurable ones.
  config.icon.replace( /src="([^"]*)/, function( src ){
    config.icon_src = src;
  });
  config.ueb_icon.replace( /src="([^"]*)/, function( src ){
    config.ueb_icon_src = src;
  });
  config.twitter_icon.replace( /src="([^"]*)/, function( src ){
    config.twitter_icon_src = src;
  });
}

var set_config = function( new_config ){
  // ToDo: avoid global
  config = new_config;
  process_config();
};


var get_config = function(){
  return config;
};


var Kudo = {}; // start_http_repl() actualy initializes it

var l8;        // = Kudo.l8; after call to start_http_repl()
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

// Export (after start())
var Ui1Server;
var MonitoredPersona; // from ui1twit.js

// ToDo: implement client side version
var TwitterUser = {};  // from ui1twit.js
TwitterUser.lookup = function(){ return null; }; // default, also client side


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


// Better hashmap for sets. It avoid issues with x.__proto__ for example.

var obj_create = Object.create;

function set(){
  return obj_create.call( null, {} );
}


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


Session.all = set();
Session.count = 0;
Session.max_count = 0;


Session.find_by_id = function( id ){
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


Session.prototype.clear = function( ctor ){
// Init/reinit all session attributes. Init when ctor called (via login()).
  if( ctor ){
    this.id              = "cleared";
    this.express_session = null;
    // Client capabilities
    this.is_slim         = false;
    this.can_script        = l8.client ? true : "init";
    this.can_history       = true;
    this.can_local_storage = undefined;
    this.should_clear_local_storage = false;
  }else{
    if( this.id === "cleared" ){
      trace( "BUG? already cleared session" );
      debugger;
      return;
    }
  }
  this.time_touched    = Kudo.now();
  this.lang            = "en";
  this.is_new          = true;
  this.auto_lang       = true;
  this.is_safari       = false; // emoji handling, poor
  this.is_chrome       = false; // idem
  this.magic_loader    = false;
  this.page_builder    = null;
  this.boxon           = null;
  this.delayed_login   = null;
  this.domain          = "";
  this.machine         = Ephemeral.Machine.main;
  this.page_init_done  = false; // True after magic loader is loaded
  this.is_app          = false; // True when browserfied app runs client side
  this.app_init_done   = false; // True after browserified.js is loaded
  this.visitor         = null;
  this.authentic       = false;
  this.pending_alias   = null;       // Until authentic
  this.pending_twitter_page = null;  // Until twitter phase 2 is done
  this.jhr_demo        = false;
  this.is_novice       = true;
  this.current_page    = []; // tokens, input was space separated
  this.previous_page   = [];
  this.host            = ""; // "Host" header from first http request
  this.url             = ""; // of current page
  this.previous_url    = ""; // of previous page
  this.title           = ""; // of current page
  this.pushState       = "";
  this.needs_twitter   = false;  // <script> include of twitter intent lib
  this.filter          = "";  // Tags
  this.filter_query    = "";  // Keywords for fulltext
  this.time_filter_changed = 0;
  this.cached_count_propositions = _;
  this.filter_tag_entities = [];
  this.filter_tag_labels   = []; // As strings, includes "computed" tags
  this.sort_criterias  = [];
  this.proposition     = null;
  this.agent           = null;
  this.tag_set         = null;
  this.changes         = 0; // Count changes sent to client
  return this;
  
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
  Session.all[ this.id ] = undefined;
  Session.count--;
  this.clear();
  this.id = undefined;
  if( this.express_session ){
    this.express_session = null;
  }
};


// Translation messages are in a different file
var i18n_table = require( "./ui1i18n.js" );


Session.prototype.set_visitor = function( visitor, authentic ){
  this.visitor = visitor;
  this.authentic = !!authentic;
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
  this.host = host || config.host;
};


Session.prototype._set_domain = function( domain ){
// Kudocracy domains are like virtual hosts. A domain
// is typically some unit of organization. The "main"
// domain on kudocracy.com is a kind of sandbox for tests.

  // On the client side, there is only one domain (so far)
  if( l8.client ){
    // However the name of that domain mimic the server's one
    if( domain ){ this.domain = domain; }
    return this;
  }
  
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
  trace( "Changed domain", current.label, "to", domain );
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
  this.previous_url = this.url;
  var url = "http://" + this.host + "/?page="
  + querystring.escape( parts.join( " " ) ).replace( /%20/g, "/" );
  if( url[ url.length - 1 ] === "/" ){
    trace( "BUG? bad trailing / in url", url );
    debugger;
    url = url.substring( url, url.length - 1 );
  }
  if( this.domain ){
    url += "&domain=" + this.domain;
  }
  // Add time= to defeat stupid offline manifest logic
  this.time_mark = l8.update_now();
  url += "&time=" + this.time_mark;
  this.title = parts[ 0 ];
  this.url = url;
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


var i18n_cache = { _: {}, en: {} };
var i18n_cached = {};


Session.prototype.i18n = function( msg, no_cache ){
// Returns the i18n version of the msg.
// "msg" is usually the "en" version of the message, with the translated
// version in "per language" tables.
// Sometimes "msg" is a "fake" msg that is not needed in english but is
// needed in some other languages. "il y a" is an example of such messages.

  // if already the result of a previous translation, return as is
  if( i18n_cached[ msg ] )return msg;

  var lang = this.lang;

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
      i18n_cached[ r ] = true;
      // console.log( "i18n cached", lang, msg );
    }
    return r;
  }
  
  // Cache lookup
  var r = i18n_cache[ lang ][ msg ];
  if( r )return r;

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
    if( msg.length < 30 )return cached( msg );
    console.warn( "i18n non cacheable", lang, msg );
    // debugger;
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
  if( typeof count === "undefined" ){
    // It's ok if there is a delegateable filter
    if( this.has_delegateable_filter() )return false;
    // Else, assume filter is too loose and there will be too much matches
    return false;
  }
  // It's never ok where there are more than 200 matching propositions
  if( count > 200 )return false;
  // 0 is "too much" is a special way to avoid meaningless pages
  if( count === 0 )return true;
  // If there are very few matching propositions, it's ok, whatever the filter
  if( count <= 30 )return false;
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
// Return separated list of tags and keywords extracted from filter, trimmed
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
    text = text.replace( /[^+\-#A-Za-z0-9_ ]/g, "" );
    
    // Handle "all" pseudo filter
    if( text === "all" ){
      this.filter = "";
    
    // Handle normal stuff, if anything remains, ie space separated things
    }else if( text ){ 

      var buf = [];
      var tag_buf = [];
      text.split( " " ).forEach( function( tag ){

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
  if( !this.filter && !this.filter_query ){
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
    PageBuilder.current = session.page_builder;
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


// Defaults to no session
Session.current = null; // new Session( "127.0.0.1" );


/*
 *  Page builder, use fast concat of array items
 */

function PageBuilder(){
  this.session = null;
  this._head = [];
  // Init body, reserve one slot for fast unshift()
  this._body = arguments.length ? as_array( arguments ) : [ "" ];
  this.length = this._body.length;
}


PageBuilder.prototype.set_session = function( session ){
  this.session = session;
  session.page_builder = this;
  return this;
};


PageBuilder.prototype.toString = function(){
  return this.body();
};


PageBuilder.prototype.set = function( head /* , ...body */ ){
  this._head = head || [];
  // Set body, if none, reserve one slot to inject header fast, see .unshift()
  this._body = arguments.length > 1 ? slice1( arguments ) : [ "" ];
  this.length = this._body.length;
  return this;
};


PageBuilder.prototype.error = function( /* ...body */ ){
  this._head = page_style( "error" );
  this._body = as_array( arguments );
  this.length = this._body.length;
  return this;
};


PageBuilder.prototype.push = function(){
  Array.prototype.push.apply( this._body, arguments );
  this.length = this._body.length;
  return this;
};


PageBuilder.prototype.concat = function( a ){
  Array.prototype.push.apply( this._body, a );
  this.length = this._body.length;
  return this;
};


PageBuilder.prototype.unshift = function( msg ){
  // Fast case, for headers insertions typically
  if( arguments.length === 1 && !this._body[ 0 ] ){
    this._body[ 0 ] = msg;
    return this;
  }
  // General case
  this._body = this._body.unshift.apply( this._body, arguments );
  this.length = this._body.length;
  return this;
};


PageBuilder.prototype.join = function( sep ){
  var body = sep ? this._body.join( sep ) : this._body.join( "" );
  this._body = [ "", body ];
  this.length = this._body.length;
  return body;
};


PageBuilder.prototype.at_insert = function( index, msg ){
  // Fast case, when there is an empty slot
  if( arguments.length === 2  && !this._body[ index ] ){
    this._body[ index ] = msg;
    return this;
  }
  // General case
  var msgs = as_array( arguments );
  msgs.splice( 0, 0, [ index, 0 ] );
  this._body.splice.apply( this._body, msgs );
  this.length = this._body.length;
  return this;
};


PageBuilder.prototype.head = function( set ){
  if( set ){ this._head = set; }
  return this._head;
};


PageBuilder.prototype.body = function( set ){
  if( set ){ this._body = as_array( arguments ); }
  var body = this._body;
  if( body.length === 1 )return body[0].toString();
  this._body = [ "", body = body.join( "" ) ];
  this.length = this._body.length;
  return body;
};


PageBuilder.prototype.push_help = function(){
  this.push( '<span class="help">' );
  this.concat( arguments );
  if( !this.hide_help_was_pushed ){
    this.push(
      " ", link_to_command( "help_toggle", i18n( "hide" ) ), "."
    );
    this.hide_help_was_pushed = true;
  }
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

// Router for ?page=xxxx type of requests
var http_repl_pages = {
  index:        page_index,
  kudocracy:    page_index,
  help:         page_help,
  login:        page_login,
  signout:      page_signout,
  twitter:      page_twitter,
  domain:       page_domain,
  visitor:      page_visitor,
  persona:      page_persona,
  delegations:  page_delegations,
  delegates:    page_delegates,
  groups:       page_groups,
  proposition:  page_proposition,
  propositions: page_propositions,
  offline:      page_propositions,
  tags:         page_propositions,
  votes:        page_votes,
  ballot:       page_ballot,
  ballot2:      page_ballot2,
  propose:      page_propose,
  propose2:     page_propose2
};


var printnl; // from ui1http.js
var cls;
var pn;
var get_query;
var set_head;
var set_body;


function page( name ){
// this is the entry point for all html pages. It's a kind of router.

  // Check that Ephemeral current machine matches the session's one
  if( Ephemeral.Machine.current !== Session.current.machine ){
    trace(
      "BUG? the current Ephemeral machine " + Ephemeral.Machine.current,
      "is not the session's one: " + Session.current.machine
    );
    Session.current.machine.activate();
  }

  // In some weird cases, there is a / at the end of the page name...
  // ToDo: investigate this issue
  name = name.toLowerCase().replace( /[^a-z0-9]/g, "" );
  
  var f = name && http_repl_pages[ name ];
  
  // No name => list names
  if( !f ){
    // for( name in http_repl_pages ){
    //  printnl( name );
    // }
    // return;
    trace( "BUG? invalid page", name );
    debugger;
    name = "index";
    f = page_index;
  }
  
  var result = new PageBuilder();
  PageBuilder.current = result;
  result.set_session( Session.current );
  
  // Parse filter for extra parameters
  var args   = as_array( arguments );
  var params = as_array( arguments );
  
  // If function does not handle all arguments itself, handle filter params
  if( f.length ){
    // Extra parameters are filter parameters
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
  
  result.session.previous_page = result.session.current_page;
  result.session.set_current_page( args );
  
  try{
    f.apply( result, params );
  }catch( err  ){
    console.error( err, err.stack );
    result.push( trace( "Page error", name, err, err.stack ) );
  }
  
  set_head( result.head() );
  
  // Handle history.pushState() style of redirect
  var redir = result.session.pushState;
  if( !redir && result.session.can_script && result.session.can_history ){
    var state = result.session.full_query();
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
    // de&&bug( "Redir", redir, "Session's url", Session.current.url );
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


Session.prototype.redirect = function( page ){
// Set HTTP response to 302 redirect, to redirect to specified page
  if( !this.response )return;
  if( page && page[ page.length - 1 ] === "/" ){
    trace( "BUG? bad trailing / in", page );
    debugger;
    page = page.substring( 0, page.length - 1 );
  }
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
  if( this.domain ){
    r += "&domain=" + this.domain;
  }
  this.response.fast_redirect = r;
};


PageBuilder.prototype.redirect = function( page ){
  this.session.redirect( page );
};


Session.prototype.redirect_back = function( n, text ){
// Set HTTP response to 302 redirect, to redirect to the page from where the
// current HTTP request is coming.
  var page = this.current_page;
  if( !page || !page.length )return this.redirect( "propositions" );
  page = page.slice();
  // When going back to page "delegates" keep the optional focused proposition
  if( page[0] === "delegates" && n === 1 ){ n = 2; }
  // When going back to page "votes", keep the all/comments flag
  // ToDo: the page itself should tell about how many parameters to keep
  if( page[0] === "votes" && n === 1 ){ n = 2; }
  if( page[0] === "visitor" && n === 1 ){ n = 2; }
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
    target.splice( 1, 0, this.current_page[1] );
  }
  if( text ){ target.push( text ); }
  this.redirect( target.join( "/" ) );
};


PageBuilder.prototype.redirect_back = function( n, text ){
  this.session.redirect_back( n, text );
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
  var visitor = Session.current.authentic && Session.current.visitor;
  if( visitor ){
    href += "?kudocracy=" + visitor.label.substring( 1 );
  }
  if( !title ){
    return '<a href="' + href + '">' + img + '</a>';
  }else{
    return '<a href="' + href + '">' + title + img + '</a>';
  }
}


function persona_alias( persona ){
  var alias = persona.get_alias();
  if( alias )return alias;
  var twitter_user = TwitterUser.lookup( persona.label );
  if( !twitter_user )return "";
  return twitter_user.twitter_user_data.name;
}


function link_to_page( page, value, title ){
  
  var url_code;
  
  var is_index = ( page || "index" ) === "index";
  if( is_index ){
    page = "";
    if( !title ){
      title = '<strong>Kudo<em>c</em>racy</strong>';
      if( Session.current.domain ){
        title
        += " <em>"
        + link_to_wiki( "HomePage", Session.current.domain )
        + "</em>"; 
      }
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
    if( !is_index && title[0] !== "@" && title[0] !== "<" ){
      title = i18n( title );
    }
  }
  
  if( url_code && url_code[0] !== "/" ){
    url_code = "/" + url_code;
  }
  
  page = encode_ref( page );
  
  if( Session.current.domain && !is_index ){
    url_code += "&domain=" + Session.current.domain;
  }
  url_code += "&time=" + l8.update_now();
  
  // For @name, inject link to twitter profile and potential alias
  var profile = "";
  if( ( page === "persona" || page === "visitor" )
  &&  title[0] === "@"
  ){
    var user = title.substring( 1 );
    var idx_sp = user.indexOf( " " );
    if( idx_sp !== -1 ){
      user = user.substring( 0, idx_sp );
    }
    if( !user ){
      user = value.substring( 1 );
    }
    profile 
    = '<a href="http://twitter.com/intent/user?screen_name=' + user + '">'
    //+ ( '<img src="http://img.tweetimag.es/i/' + user + "_m" + '" height="24" width="24">' )
    + ( '<img src="http://avatars.io/twitter/' + user + '" height="24" width="24">' )
    + '</a>';
    // Use optional alias
    var persona = Persona.find( "@" + user );
    var alias = persona && persona_alias( persona );
    if( alias ){
      title = title.replace( "@" + user, function(){
        profile += " ";
        //alias + " <dfn>(" + user + ")</dfn>"
        //"<dfn>@" + user + "</dfn>" + 
        return alias.substring( 1 );
      });
    }
  }
  
  return profile
  + ( is_index ? '<a href="/">'
    : '<a href="?page=' + page + url_code + '">' )
  + title
  + '</a>';
  
}


function link_to_proposition_page( proposition, title ){
  if( !proposition )return "";
  var name = typeof proposition === "string" ? proposition : proposition.label;
  return link_to_page( "proposition", name, title || i18n( name ) );
}


function link_to_persona_page( persona, title ){
  if( !persona )return "";
  var persona_label = typeof persona === "string" ? persona : persona.label;
  return link_to_page( "persona", persona_label, title || persona_label );
}


function link_to_delegation_page( agent, tags ){
  
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
      agent = i18n( "delegation" );
      tags  = "";
    }
  }

  if( !tags ){
    tags = "";
  }

  var msg;
  var visitor = Session.current.visitor;

  if( true || !visitor ){
    msg = link_to_page( "delegates", proposition + " " + tags, "via" );
  }else{
    msg = link_to_page( "delegations", tags, "via" );
  }
  return msg + "&nbsp;"
  + link_to_page( "persona", agent + " " + tags, agent );
}


function link_to_twitter_user( user, title ){
  if( !user )return "";
  return '<a href="http://twitter.com/' + user + '">' 
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
  return '<a href="http://twitter.com/search?f=realtime&q=%23'
  + tags.substring( 1 )
  + '">' + ( title || tags ) + '</a>';
}


function link_to_twitter_filter( query, title ){
  return '<a href="http://twitter.com/search?f=realtime&q='
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


function kudo_signal_capabilities( local ){
// Client side. Sends a dummy API request to the server so that it can detect
// that javascript is running on the client. If the server does not receive
// such a request, after some delay, it assumes that the client is a "noscript"
// client. Note: the request is not sent immediately because a cookie is
// configured and it will do an equivalent job if any request is issued by
// the client soon enough.
// Also check local storage capabilities, also saved in a cookie.

  if( window.init_http_page_done ){
    console.log( "signal capabilities, already done" );
    return;
  }
  console.log( "signal capabilities" );

  function supports_local_storage(){
    var kudo_ctx = window.kudo_ctx;
    if( kudo_ctx.can_local_storage )return true;
    if( kudo_ctx.can_local_storage === false )return true;
    // undefine, check it
    var storage;
    try{ // a try is required to avoid a weird bug in some firefox versions
      storage = 'localStorage' in window && window[ 'localStorage' ];
    }catch( e ){}
    kudo_ctx.local_storage = storage;
    kudo_ctx.can_local_storage = !!storage;
    // Hack to update cookied counter asap. See .get_stored_changes() in ui1client.js
    if( storage ){
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
  if( typeof ctx.can_log_storage === "undefined"
  && supports_local_storage()
  ){
    document.cookie = "kudo_can_local_storage=true";
  }
  
  if( ctx.should_clear_local_storage ){
    if( ctx.local_storage ){
      ctx.local_storage.clear();
      document.cookie = "kudo_change_count=0";
      console.info( "Cleared local storage" );
    }
  }
  ctx.should_clear_local_storage = false;
  
  if( window.kudo_ctx.can_script === true )return;
  document.cookie = "kudo_can_script=true";
  
  // Also send an ajax request before it's too late
  if( ctx.can_script === "init" || ctx.can_script === (void 0) ){
    if( window.kudo_signal_scheduled ){
      console.warn( "BUG? duplicate 'can script' signal schedule" );
      debugger;
    }
    ctx.can_script = "init";
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
        console.wrn( "BUG? duplicate 'can script' signal" );
        debugger;
        return;
      }
      window.kudo_signal_done = true;
      !local && $.ajax({
        url: "/api/Session",
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
}


Session.prototype.configScript = function(){
// Client side setup, dynamic, different for each page

  // When this code runs server side, client provides hints about changes
  var stored = this.get_cookie( "change_count" );
  stored = parseInt( stored || "0", 10 ); // 0 when this runs client side

  // Build a context sent to the client (to the "consumer" that is)
  var ctx = {
    time: l8.update_now(),
    debug_mode: de,
    // System level
    config:        config,
    visitor:       ( this.visitor && this.visitor.label ), // A string
    authentic:     this.authentic,
    domain:        this.domain, // false for "main" domain
    filter:        this.full_query(),
    can_script:    this.can_script, // Can be "init", at first
    can_local_storage: this.can_local_storage,
    should_clear_local_storage: this.should_clear_local_storage,
    is_slim:       this.is_slim, // When "slim", no magic loader, pure http
    is_novice:     this.is_novice,
    lang:          this.lang,
    auto_lang:     this.auto_lang,
    // Page level
    title:         this.title,
    host:          this.host,
    url:           this.url,
    current_page:  this.current_page,
    previous_page: this.previous_page,
    // Ephemeral machine changes
    changes:       this.pull_changes( stored )
  };
  
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
    }else if( !ctx.changes.length && !stored ){
      trace( "BUG? empty database?" );
      debugger;
      this.is_app = false;
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
      timeless_url
      = url + ( url.indexOf( "?" ) === -1 ? "?" : "&" ) + "time=" + now;
    }else{
      timeless_url = url.substring( 0, idx_time - 1 );
    }
    ctx.url = timeless_url;
    ctx.time_offset = now - ctx.time;
    console.info( "Time offset (net delay, unless cached)", ctx.time_offset );
    console.info( "url", url );
    console.log( "timeless url", timeless_url );
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
      if( !ok && window.confirm(
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
      console.warn( "1 minute old page, probably cached somewhere, reload" );
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
    
    // One day, I may have to behave differently on touch based devices
    ctx.touch_device = !!( "createTouch" in document );
    
    // Let's the debug flag propagate from the server to the client
    window.de = ctx.debug_mode;
    window.nde = false;
    
    // ToDo: define a bug() that logs on the server
    window.bugC = function(){ console.log.apply( console, arguments ); };
    
    // Manage url navigation using browser's history API, when available
    try{
      window.history.replaceState( ctx.url, ctx.title, ctx.url );
      console.log( "Page " + ctx.title );
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
  return [
    '\n<script type="text/javascript">',
     "\n" + kudo_signal_capabilities,
     "\n" + kudo_init_ctx,
     "\n kudo_init_ctx(", json_encode( ctx ), ');',
    '\n</' + 'script>\n'
  ].join( "" );
  
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
  return [
    '\n<script>\n',
    javascript,  // ToDo: some encoding here?
    '\n</' + 'script>\n'
  ].join( "" );
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
    // See also https://github.com/defunkt/jquery-pjax
    
    console.log( "Magic loader", url );
    
    var time_started = (new Date()).getTime();

    var query_idx = url.indexOf( "?" );
    var query_str = "";
    var path = url;
    if( query_idx !== -1 ){
      query_str = url.substring( query_idx + 1 );
      if( query_idx > 0 ){
        path = url.substring( 0, query_idx - 1);
      }else{
        path = "";
      }
    }
    
    // External links open in a new window
    var current_path = window.location.href;
    query_idx = current_path.indexOf( "?" );
    if( query_idx > 0 ){
      current_path = current_path.substring( 0, query_idx );
    }
    // Remove potential trailing /
    path = path.replace( /\/+$/, "" );
    current_path = current_path.replace( /\/+$/, "" );
    
    // If new url is in a different domain, open in new window
    if( path && path !== current_path ){
      // Unless it is a twitter web intent
      if( path.indexOf( "twitter" ) !== -1
      &&  path.indexOf( "intent"  ) !== -1
      ){
        console.log( "No magic, load in Twitter popup", path );
        return false;
      }
      // ToDo: offline mode
      console.log(
        "Open in new window.", "current", current_path, "path", path
      );
      window.open( url );
      return true;
    }
    
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
    if( !query_str
    || query_str.indexOf( "page=index" ) !== -1
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
      if( !kudo_is_offline() ){
        console.log( "No magic, back to server for login", kudo_ctx );
        return false;
      }else{
        console.info( "Offline. Login." );
      }
    }
    
    // console.log( "magic loader " + url );
    
    // If current content was "magic loaded", submit request to local UI server
    // Why? it makes the first page appears fast, ie it promotes sharing
    // and then the other requests are processed faster locally, after some
    // init cost is amortized.
    if( window.ui1_server ){
      console.log( "Magic loader, local request" );
      var time_local_request = (new Date()).getTime();
      var query = {};
      // Parse url's querystring like the http server would do it
      ( "&" + query_str ).replace( /&(.*)=([^&]*)/g, function( _, name, value ){
        query[ name ] = decodeURIComponent( value );
      });
      var html = "";
      if( kudo_is_offline() ){
        console.log( "Offline magic, remove current_path", current_path, url );
        kudo_ctx.session.is_offline = true;
        current_path = "";
      }else{
        kudo_ctx.session.is_offline = false;
      }
      window.ui1_server(
        {
          method: "GET",
          url:   current_path + url,
          query: query,
          headers: {
            "x-forwarded-for":  "127.0.0.1",
            "x-magic-loader":   "true",
            "user-agent":       window.navigator.userAgent
          }
        },
        {
          writeHead: function(){},
          end: function( r ){
            if( !r ){
              console.warn( "BUG? invalid empty response", url, query );
              debugger;
              r = "";
            }
            var duration = (new Date()).getTime() - time_local_request;
         console.info( "local request processed in", duration, "ms" );
         html = r;
         var time_received = (new Date()).getTime();
         // Remove itself from response, if present
         html = html.replace( /function kudo_magic[\s\S]*?<\/script>/, "<" + "/script>" );
         // Collect scripts that in the head and body, ran in new body
         var body = "";
         var scripts = "";
         html = html.replace( /<script[\s\S]*?<\/script>/g, function( s ){
           // Avoid src="http://...", to benefit from what was already loaded
           //if( s.indexOf( 'src="http' ) >= 0 )return "";
           // de&&bugC( "script:" + s.substring( 0, 100 ) );
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
           nde&&bugC(
             "pushState",
             window.kudo_ctx.url,
             "[" + window.kudo_ctx.title + "]"
           );
           window.history.pushState(
             window.kudo_ctx.url,   // data. onpopstate uses it
             window.kudo_ctx.title,
             window.kudo_ctx.url
           );
         }
         // Flag, just in case, when a page wants to know how it got loaded
         window.kudo_is_magic_loaded = true;
         // Set the new body for the page. It shall reinit a new context
         window.kudo_ctx = null;
         $('body').empty().html( body ); // not [0].innerHTML = body;

         // Invoke what is normally bound to $('document').ready()
         kudo_when_ready();
         de&&bugC(
           "total, "
           + ( (new Date()).getTime() - time_started)
           + " msec. "
           + "built, "
           + ( time_received - time_started)
           + " msec. "
           + "process, "
           + ( (new Date()).getTime() - time_received)
           + " msec."
         );
          }
        }
      );
      return true;
    }
    
    console.log( "Magic, no local UI server, must ask web server" );
    
    // The sign out page needs to be done both side, not using ajax because
    // it redirects to the index page, a true redirect, not a fast one
    if( url.indexOf( "?page=signout" ) !== -1 ){
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
    
    $.ajax( url, {
      
       // I will handle script tags myself, hence "text" instead of "html"
       dataType: "text",
       
       // ToDo: do I need this: 
       cache: true, // ToDo: or false? true to avoid &_=xxxxxx extra param
       
       // Provide a "hint" in the request so that server can detect magic
       beforeSend: function( xhr ){
         console.log( "Ajax request, set x-magic-loader header" );
         xhr.setRequestHeader( 'x-magic-loader', 'true');
       },
       
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
         html = html.replace( /function kudo_magic[\s\S]*?<\/script>/, "<" + "/script>" );
         
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
         
         // Collect scripts that in the head and body, wiil run in new body
         var body = "";
         var scripts = "";
         html = html.replace( /<script[\s\S]*?<\/script>/g, function( s ){
           // Avoid src="http://...", to benefit from what was already loaded
           // if( s.indexOf( 'src="http' ) >= 0 )return "";
           // de&&bugC( "script:" + s.substring( 0, 100 ) );
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
           de&&bugC(
             "pushState",
             window.kudo_ctx.url,
             window.kudo_ctx.title
           );
           window.history.pushState(
             window.kudo_ctx.url,   // data. onpopstate uses it
             window.kudo_ctx.title,
             window.kudo_ctx.url
           );
         }
         
         // Flag, just in case, when a page wants to know how it got loaded
         window.kudo_is_magic_loaded = true;
         // Set the new body for the page. It shall reinit a new context
         window.kudo_ctx = null;
         try{
           $('body').empty().html( body ); // not [0].innerHTML = body;
         }catch( err ){
           console.warn( "Magic loader error with setting body", err );
           debugger;
         }
         if( !window.kudo_ctx ){
           console.warn( "BUG? Magic ajax result could not init kudo context" );
         }

         // Invoke what is normally bound to $('document').ready()
         window.kudo_when_ready();
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
       },
       error: function( data ){
         console.warn( "ajax error (url)", data, "url:", url );
         // Let's try to go offline
         if( window.kudo_is_offline ){
           kudo_is_offline( true );
         }
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

    // On touch devices I slightly change the design because of small screen
    // ToDo: a mobile app, one day... http://www.phonegap.com/about
    // See also http://tech.richardrodger.com/2010/09/30/debug-phonegap-mobile-apps-five-times-faster/
    if( true || ctx.touch_device ){
      // Setting maxWidth helps to avoid auto zooming artifacts
      w = ctx.screen_width = Math.min( screen.width, $(window).width() );
      document.body.style.maxWidth = w + "px";
      // document.body.style.lineHeight = "1em;"
      var header = document.getElementById( "header").style;
      header.maxWidth = ctx.screen_width + "px";
      // header.position = "relative";
      // header.fontSize = "140%";
      var container = document.getElementById( "container").style;
      container.position = "relative";
      container.align    = "left";
      var footer = document.getElementById( "footer").style;
      footer.maxWidth = ctx.screen_width + "px";
      footer.position = "relative";
      // footer.fontSize = "120%";
      window.scrollTo( 0, 1 );
    }
    
    // Set document title. It can contain &xxx; entity and is decoded first
    if( !html_decode_div ){
      html_decode_div = document.createElement( "div" );
    }
    html_decode_div.innerHTML = ctx.title || "kudocracy";
    document.title = html_decode_div.childNodes[0].nodeValue;

    // All links go thru magic loader (when enabled)
    // Also: external links open in a new window
    $( "a" ).click( function( e ){
      e = e || window.event;
      var target = e.target || e.srcElement;
      var $link  = $(target).closest( "a" );
      var href   = $link.attr( "href" );
      if( window.kudo_magic_loader && kudo_magic_loader( href ) ){
        // Avoid duplicate loading by browser
        e.preventDefault();
        return false;
      }else{
        return true;
      }
    } );
    
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
    console.log( "Magic loader was successfully installed" );
    
    // All new pages go back to scroll location 0 (ie top of page)
    window.scrollTo( 0, 0 );
    
    // Render twitter widgets
    if( window.twttr && window.twttr.widgets ){
      window.twttr.widgets.load();
    }
    
    // Process changes from ephemeral machine, async
    if( ctx.changes ){
      if( ctx.changes === "offline" ){
        console.info( "offline mode with no changes" );
      }else{
        console.info( "app mode. Ephemeral changes: " + ctx.changes.length );
      }
      var retry_count = 1000;
      var process_changes = function(){
        var ctx    = window.kudo_ctx;
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
        session.is_app = true;
        session.app_init_done = true;
        session.page_init_done = true;
        session.is_novice = ctx.is_novice;
        // session.is_new = false;
        session.domain = ctx.domain;
        session.title  = ctx.title;
        session.host   = ctx.host;
        session.url    = ctx.url;
        session.current_page = ctx.current_page;
        session.previous_page = ctx.previous_page;
        session.auto_lang = ctx.auto_lang;
        session.lang = ctx.lang;
        session.can_script = true;
        console.log( "Local UI server & local anonymous session are ready" );
      };
    
      // Leave some time for the event loop  
      setTimeout( process_changes, 10 );
    }
    
  };
  
  $(document).ready( function(){
    console.log( "jQuery document ready" );
    kudo_when_ready( true );
    console.log( "jQuery ready cb done" );
  }); // end of when page is ready

  console.log( "Init new HTTP page done" );
};


function page_style( title ){
// This defined the HEAD of a page. Most pages calls this.
  
  var session = Session.current;
  
  session.needs_twitter = false;
  var needs_firebase = ( title === "twitter" );
  
  var buf = [];
  
  var kudocracy = "Kudocracy";
  if( session.domain ){
    kudocracy += " " + session.domain;
  }
  if( title ){
    var msg = i18n( title );
    // Avoid any weird symbols/icons
    if( msg.indexOf( "</") !== -1 ){
      title = kudocracy;
    }else{
      title = kudocracy + " - " + msg;
    }
  }else{
    title = kudocracy;
  }
  buf.push( '\n<title>', title, '</title>\n' );
  session.title = title;

  buf.push(
    '\n<link rel="stylesheet" href="', config.style, '" type="text/css">'
    //'\n< style media="screen" type="text/css">\n',
    // '#search{ background:#fee; padding: 0.5em; }\n',
    // '#footer{ min-height:0px; }\n',
    // '.help{ color:#884; }\n',
    // '.even{ background:#eef; padding: 0.5em; }\n',
    // '.odd{  background:#eff; padding: 0.5em; }\n',
    // '.vote{  background:#fef; padding: 0.5em; }\n',
    // '.ballot{  background:#eee; padding: 0.5em; }\n',
    // '.comment{  background:#efe; padding: 0.5em; max-width: 72em }\n',
    // "dfn a:link, dfn a:visited { color:#bbb; }\n",
    // "dfn a:hover { color:blue; }\n",
    //'</style>'
  );
  
  // The rest are scripts
  if( !session.can_script )return buf.join( "" );
  
  // Some scripts are injected once per HTTP page only
  if( !session.page_init_done ){
    // The server side (only) asks the client to load some scripts
    if( true ){ // l8.server ){
      buf.push(
        '\n<script type="text/javascript" src="http://code.jquery.com/jquery-2.1.1.min.js"></script>',
        '\n<script src="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.1/js/bootstrap.min.js"></script>'
      );
      !session.is_slim && buf.push(
        // Reuse some stuff from simpliwiki
        '\n<script type="text/javascript">',
        "\nWiki = {};",
        magicScript,
        "\nkudo_magic();",
        '\n</s','cript>'
      );
      buf.push(
        //'\n<script src="http://simpliwiki.com/scrollcue.js"></script>',
        //'\n<script type="text/javascript"> Wiki.scrollcueScript( true ); </script>'
        //+ '<script type="text/javascript">' + scrollcue + '\nscrollcue( $ );',
        //+ '\n$.scrollCue( { fade:".fade" } );\n',
        //+ '</script>\n';,
        '\n<script type="text/javascript" src="http://platform.twitter.com/widgets.js"></script>'
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
      '<script src="http://cdn.firebase.com/js/client/2.0.4/firebase.js"></script>'
    );
  }

  // Some code is always included, in magic loaded pages and in local pages
  !session.is_slim && buf.push( session.configScript() );
  
  return buf.join( "" );
} // page_style()


function page_header( left, center, right, current_page ){
  
  if( !current_page ){
    current_page = Session.current.page_name();
  }
  
  var builder = PageBuilder.current;
  
  var built_left = ""; 
  
  if( current_page !== "propositions" ){
    built_left += " " + link_to_page( "propositions" );
  }
  
  if( left ){
    built_left += " " + left;
  }
  
  // Turns out than "center" is not so good for displaying tags...
  if( center ){
    built_left = center + " " + built_left;
    center = _;
  }
  
  // Add title of current page
  built_left = i18n( current_page ) + " " + built_left;

  if( builder.session.visitor ){
    right = ( ( right && ( right + " " ) ) || "" )
    + link_to_page(
      "visitor",
      "",
      i18n( "you" ) // builder.session.visitor.label
    );
  }else{
    right = ( ( right && ( right + " " ) ) || "" )
      + link_to_page( "login" );
  }
  
  var container_style = "margin:auto; max-width:62.5em; font-family:inherit;"; // *16=1000
  var body_style = "";
  var background_color = "";
  if( current_page === "delegates" ){
    background_color = "#ffffcc";
  }else if( current_page === "visitor" 
  || current_page === "delegations"
  || current_page === "login"
  ){
    background_color = "#ffddff";
  }else if( current_page === "persona" ){
    background_color = "#ccffff";
  }
  if( background_color ){
    body_style += " background-color:" + background_color + ';';
  }
  
  return [
    '\n<div class="header" id="header"><div id="header_content">',
      '\n<div class="top_left">',
        built_left,
      '</div>',
      '\n<div class="top_center" id="top_center">',
        center || "",
      '</div>',
      '\n<div class="top_right">',
        ( (right && ( right + " " ) ) || "" ) + link_to_page( "help" ),
      '</div>',
    '\n</div></div>',
    '\n<div id="page_background" style="', body_style, '">',
    '\n<div id="container" style="', container_style, '">\n',
    '\n<br><br><br><br><br>\n',
    '\n<div id="content" style="margin:0px 0.3em;">',
    '\n<div id="progress_bar" style="display:none">', // hidden by default
      '\n<progress id="progress">',
    '\n</div>',
    '\n<div id="content_text">\n',
    '\n'
  ].join( "" );
} // page_header()


function page_header_left( left, center, right, current_page ){
// Header with 'propositions', 'delegates', 'votes', 'ballot' ... login help
  var m = left || "";
  if( true || Session.current.has_delegateable_filter() ){
    if( current_page !== "delegates" ){
      m += " " + link_to_page( "delegates", "all", "delegates" );
    }
  }
  if( !Session.current.too_much_propositions() ){
    if( current_page !== "votes" ){
      m += " " + link_to_page( "votes" );
    }
    if( current_page !== "ballot" ){
      m += " " + link_to_page( "ballot" );
    }
  }
  return page_header( m, center, right, current_page );
}


function page_header_right( left, center, right, current_page ){
// Header with 'propositions', ...,  '@name', 'help'
  return page_header(
    left,
    center,
    right
  );
}


function page_footer(){
  
  var session = Session.current;
  
  // Compute time it took to process the page
  var duration = ( l8.update_now() - session.timestamp ) / 1000;
  
  var buf = [
    '\n</div></div></div></div>',
    '\n<div class="" id="footer"><div id="footer_content">',
    //link_to_page( "propositions", "", "propositions" ), " ",
    //link_to_page( "delegates", "", "delegates" ),
    '<div id="powered">',
      '<a href="http://github.com/virteal/kudocracy">',
      config.icon,
      '</a> <a href="/">',
      '<strong>kudo<em>c</em>racy</strong>',
      '</a> <dfn>' + duration, ' sec.',
      ' ', session.is_offline ? " offline " : "",
      ' ', ( l8.client ? "client" : ( "" + Session.max_count + " sess." ) ),
      session.can_script
      ? ( session.can_script !== "init" ? "" : " init " )
      : " noscript ",
      session.is_slim ? " slim " : "",
      '</dfn>',
    '</div>'
  ];
  
  if( session.can_script && session.needs_twitter ){
    session.needs_twitter = false;
    false && buf.push(
      '\n<script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?"http":"https";if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+"://platform.twitter.com/widgets.js";fjs.parentNode.insertBefore(js,fjs);}}(document, "script", "twitter-wjs");</script>'
    );
  }
  
  // buf.push( "</div>" );
  return buf.join( "" );
}


function proposition_recommendations( options ){
  
  var proposition = options.proposition;
  var persona     = options.persona;
  var vote        = options.vote;
  var n           = options.count || 10;
  var agents_map  = options.agents_map || {};
  
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
  if( proposition_votes.length <= n )return slice( proposition_votes );

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
      agents_map[ agent.id ] = true;
      recommendations.push( vote );
    });
  }
  
  // From important agents
  var agent_votes = proposition.agent_vote_samples( n, agents_map );
  agent_votes.forEach( function( vote ){
    recommendations.push( vote );
  });
  
  var len = recommendations.length;
  if( n && len > n ){
    var picked;
    var picked_recommendations = [];
    var picked_map = {};
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
      with_comment += 'placeholder="' + i18n( "comment your vote" ) + '"';
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
  .tags_string(
    Session.current.visitor,
    Session.current.with_abuses
  )
  .replace( " #recent", "" )
  .replace( " #yesterday", "" )
  .replace( " #today", "" );
  
  var remain = 140 - " #kudcracy #vote".length;
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
  var recommendations = proposition_recommendations({
    proposition: proposition,
    persona: persona,
    vote: vote,
    count: 11
  });
  
  // Display 10 recommendations
  var len = recommendations.length;
  var recommentation_msg = "";
  if( len ){
    recommentation_msg = '<br>';
    if( vote ){
      recommentation_msg += i18n( "other" ) + " ";
    }
    Ephemeral.each( recommendations, function( vote, index ){
      if( index >= 10 ){
        recommentation_msg += " ...";
        return;
      }
      recommentation_msg
      += link_to_persona_page( vote.persona ) + " " 
      + emoji( vote.orientation() ) + " ";
    });
  }
  
  var buf = [
    ( len ? ' ' + recommentation_msg + '\n<br>' : "" ),
    '\n<form name="vote" class="vote" url="/">',
    '<input type="hidden" name="i" value="change_vote"/>',
    '<input type="hidden" name="vote_id" value="' + vote_id + '"/>',
    link_to_page( "delegates", proposition.label, "Delegate" ), " ",
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
      '<br><a href="http://twitter.com/intent/tweet?button_hashtag=',
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


function delegate_menu( delegation, msg ){
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + i18n( v || l ) + '</option>';
  }
  
  Session.current.needs_twitter = true;
  
  return [
    '\n<form name="delegation" url="/">',
    msg || "",
    '<input type="hidden" name="i" '
      + 'value="change_delegation &' + delegation.id + '"/>',
    '<select name="duration">',
    o( "", "duration" ), o( "one year" ), o( "one month" ), o( "one week" ),
    o( "24 hours" ), o( "one hour" ), o( "expire" ),
    '</select>',
    ' <input type="submit" value="', i18n( "Delegate" ), '"/>',
    '</form>\n'
    // Twitter tweet button
    // '\n<br><a href="http://twitter.com/intent/tweet?button_hashtag='
    // + delegation.agent.label.substring( 1 )
    // + '&hashtags=kudocracy,vote,'
    // + delegation.tags_string().replace( / /g, "," ).replace( /#/g, "" )
    // + '&text=new%20democracy%20%40' + delegation.agent.label.substring( 1 ) + '" '
    // + 'class="twitter-hashtag-button" '
    // + 'data-related="Kudocracy,vote">Tweet #'
    // + delegation.agent.label.substring( 1 ) + '</a>'
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
  if( false && this.session
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

function filter_label_div( filter, page ){
  
  if( !filter || !filter.trim() )return "";

  var buf = [];
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
        i18n( tag )
      ),
      count
    );
  });

  buf.push( '\n</div>\n' );
  return found ? buf.join( "" ) : "";

  
}


var sort_labels = {};
var sort_label_options = {};

function sort_label( style ){
  var label = "";
  Session.current.sort_criterias.forEach( function( c ){
    if( label ){
      label += ", ";
    }
    label += sort_labels[ Session.current.lang + " " + c ];
  });
  if( !label )return label;
  label = i18n( "by" ) + " " + label;
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
    with_menu: true
  });
}

function sort_menu( title ){
  return filter_and_sort_menu( {
    title: title,
    with_sort: true
  }); 
}


function filter_and_sort_menu( options ){
// This is the top part of most page, where visitor can select what filter
// to use to show/hide some propositions.

  if( !options ){
    options = {};
  }
  
  var session = Session.current;
  
  if( typeof options.hide === "undefined" ){
    // Hide the list of tags if not changed recently, to reduce clutter
    options.hide = !session.filter_changed_recently();
  }
 
  var can_propose = options.can_propose;
  var title       = options.title;
  var with_filter = options.with_filter;
  var with_sort   = options.with_sort;
  var hide        = options.hide && session.can_script;
  var novice      = session.is_novice;
  var tag_page    = ( title === "Tags"    );
  var can_sort    = with_sort && ( title !== "Ballot"  );
  
  // Don't show Sort options when there is no filter
  if( with_filter && !session.full_query() ){
    can_sort = false;
    if( !with_filter )return "";
  }
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + ( l || v ) + '</option>';
  }
  
  function o2( v, l, m ){
    var lang = session.lang + " ";
    var reversed = ( v[0] === "-" );
    if( reversed ){
      v = v.substring( 1 );
    }
    var key = lang + v;
    var cached = sort_label_options[ key ];
    if( cached )return cached;
    var more = m;
    if( !l ){ l = v; }
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
    l = i18n( l );
    more = i18n( more );
    var k2 = ( reversed ? "-" : "+" ) + v;
    var k3 = ( reversed ? "+" : "-" ) + v;
    var label1 = o( k2, i18n( "by" ) + " " + l ) + o( k3, " --- " + more );
    sort_label_options[ key ] = label1;
    sort_labels[ lang + k2 ] = l;
    sort_labels[ lang + k3 ] = l + ", " + more;
    return label1;
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
  
  // ToDo: remove this, there is a page_propose() now
  var propose_clause = "";
  if( false && can_propose
  && session.visitor
  && ( session.has_delegateable_filter()
  || title === "Propositions" )
  && session.filter.indexOf( " #but " ) === -1
  ){
    propose_clause
    = '<br>' + i18n( "or" ) + " ";
    if( novice ){
      propose_clause
      += '<span class="help">'
      + i18n( ' create a new proposition: ' )
      + '</span>';
    }
    propose_clause
    += '<input type="text" placeholder="' + i18n( "new proposition" ) + '" name="i3">'
    +  ' <input type="submit" name="i2" value="' + i18n( "Propose" ) + '"/>';
  }
  
  var delegate_clause = "";
  if( false && can_propose
  && session.visitor
  && session.has_filter()
  ){
    delegate_clause
    = ' <input type="submit" name="i2" value="' + i18n( "Delegate" ) + '"/>';
  }
  
  var r = [];
  
  if( hide ){ 
    r.push(
      '\n<a ',
      'onclick="',
      "this.style.display = 'none';",
      "this.nextElementSibling.style.display = 'block';",
      '">',
      i18n( with_filter ? "Search" : "Sort" ),
      '</a>',
      ' <span style="display:none">'
    );
  }else{
    r.push( " <span>" );
  }
  
  if( with_filter ){
    if( novice ){
      r.push(
        // "<br>",
        '<div class="help">',
        i18n( "Type #tags to find or plain text to look for: " ),
        '</div>'
      );
    }
    r.push(
      '\n<form name="proposition" url="/">',
      '<input type="hidden" name="i" value="proposition_action"/>',
      '<input type="search" autosave="filter" autofocus name="i4" value="',
        tags_label,
      '"/> '
    );
  }else if( with_sort ){
    r.push(
      '\n<form name="proposition" url="/">',
      '<input type="hidden" name="i" value="proposition_action"/>',
      '<input type="hidden" name="i4" value="', tags_label, '"/> '
    );
  }
  
  // Search button
  if( can_sort && !hide ){
    r.push( "<br>" );
  }
  
  if( with_filter ){
    r.push(
      '<input type="submit" name="i2" value="', i18n( "b-Search" ), '"/>'
    );
    if( !can_sort ){
      r.push( "<br><br>" );
    }
  }

  // Sort menu
  if( can_sort ){
    r.push(
      ' <select name="i5" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'proposition_action Search\';',
        '$(this.form).submit();',
      '}">',
      o( "", i18n( "b-Sort" ) ),
      o2( "-total_votes",    "total votes" ),
      // Some criterias are for tags only
      tag_page ? o2( "-propositions", "tagged propositions" ) : "",
      tag_page ? o2( "-delegations",  "tagged delegations" ) : "",
      o2( "age_modified",    "last activity date", "old first" ),
      o2( "age",             "creation date", "old first" ),
      o2( "-heat",           "relevance (heat)", "cold first" ),
      o2( "name",            "proposition name" ),
      o2( "-trust",          "trust level", "few delegations or votes first" ),
      o2( "-activity",       "global activity" ),
      o2( "-changes",        "vote activity" ),
      o2( "-comments",       "number of comments" ),
      o2( "author",          "author", "reversed" ),
      o2( "-direct_votes",   "direct votes" ),
      o2( "-indirect_votes", "indirect votes" ),
      o2( "-participation",  "direct participation", "low first" ),
      o2( "-protestation",   "blank or protest votes", "accepted first" ),
      o2( "-success",        "success", "small successes first" ),
      o2( "orientation",     "orientation", "reversed" ),
      '</select>'
    );
    if( !session.can_script ){
      r.push( " ", '<input type="submit">' );
    }
  }
  
  // Optional Delegate & Propose buttons
  r.push(
    delegate_clause,
    propose_clause,
    '</form></span>\n'
  );
  
  return r.join( "" );
}


function filter_change_links( tag_set, dont_hide ){
  
  var session = Session.current;
  
  var hide = !dont_hide;
  
  if( session.filter_changed_recently() ){
    hide = false;
  }
  
  if( !session.can_script ){
    hide = false;
  }

  var buf2 = [];
  
  if( hide ){
    buf2.push(
      '\n<a ',
      'onclick="',
      "this.style.display = 'none';",
      "this.nextElementSibling.style.display = 'block';",
      '">',
      i18n( "Tags" ),
      '</a>',
      ' <span style="display:none">'
    );
  }else{
    buf2.push( "<span>" );
  }
  
  if( !hide ){
    // buf2.push( '<br>' );
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
    }else{
      // Quorums come after
      if( a.substring( 0, "#quorum".length ) === "#quorum" ){
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
  var max  = 5;
  var max2 = 30;

  tag_set.each( function( label ){
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
    var buf = buf_by_category[ new_category ];
    if( new_category != old_category ){
      if( old_category ){
        buf.push( "<br>" );
      }
      if( true || Session.current.is_novice ){
        buf.push( i18n( new_category ), " " );
      }
      old_category = new_category;
    }
    // '+' link to add tag to filter, '-' to remove
    var filtered = old_filter.indexOf( " " + label + " " ) !== -1;
    var profile = "";
    var label2;
    if( persona ){
      profile = link_to_persona_page( persona, "@" );
      label2 = label.substring( 1 ); // rmv #
    }else{
      label2 = label;
    }
    var display = tags_by_category[ new_category ].length < max;

    if( display ){
      var c = tag_set.get_count( label );
      var c_msg = c ? '<span class="badge">' + c + '</span>' : "";
      if( filtered ){
        buf.push(
          profile,
          link_to_command( 
            "filter_less " + label, 
            "<h3>" + i18n( label2 ) + "</h3>" + c_msg
          ), " "
        );
      }else{
        buf.push(
          profile,
          link_to_command(
            "filter_more " + label,
            i18n( label2 ) + c_msg
          ), " "
        );
      }
    }else{
      ( filtered ? on_tags_by_category : off_tags_by_category )[ new_category ]
      .push( label );
    }
    
    tags_by_category[ new_category ].push( label );
    
  });
  
  // Add special #abuse and #but tags
  [ "#tag", "#abuse", "#but" ].forEach( function( tag ){
    if( tags_by_category.computed.indexOf( tag  ) !== -1 )return;
    tags_by_category.computed.push( tag );
    if( tags_by_category.computed.length < max ){
      buf_by_category.computed.push(
        link_to_command( "filter_more " + tag, i18n( tag ) ), " "
      );
    }else{
      off_tags_by_category.computed.push( tag );
    }
  });
  
  // When there are too much tags, add a select form
  
  var tags;
  var tag_buf;
  
  function o( v, l ){
    return '\n<option value="' + v + '">' + ( l || v ) + '</option>';
  }
  
  function select( buf, title, tags ){
    // tags = slice( tags, max );
    if( !tags.length )return;
    buf.push(
      '\n <select name="i5" onchange=',
      '"if( this.value !== 0 ){ ',
        'this.form[0].value = \'filter_' + title + ' \';',
        '$(this.form).submit();',
      '}">',
      o( "", i18n( title ) )
    );
    tags.forEach( function( label ){
      var count = tag_set.get_count( label );
      if( count ){
        count = '(' + count + ')';
      }else{
        count = "";
      }
      buf.push( o( label, i18n( label ) + count ) );
    });
    buf.push(
      '\n</select>'
    );
  }
  
  var need_form = false;
  [ "tag", "computed", "persona" ].forEach( function( category ){
    var tags = tags_by_category[ category ];
    if( tags.length <= max )return;
    need_form = true;
    tag_buf = buf_by_category[ category ];
    select( tag_buf, "more" , off_tags_by_category[ category ] );
    select( tag_buf, "less" , on_tags_by_category[ category ] );
  });
  
  buf2.push( '<div id="change_filter">' );
  if( need_form ){
    buf2.push(
      '\n<form url="/">',
      '<input type="hidden" name="i" value=""/>'
    );
  }
  buf2.push(
    buf_by_category.tag.join( "" ),
    buf_by_category.computed.join( "" ),
    buf_by_category.persona.join( "" )
  );
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
    buf2.push( '<br>' );
  }
  
  buf2.push( "</span>" );

  return buf2.join( "" );

}


/*
 *  Misc page builder helpers
 */
 
PageBuilder.prototype.require_visitor = function(){
  var persona = this.session.visitor;
  if( persona )return persona;
  this.redirect( "propositions" );
  return null;
};


PageBuilder.prototype.push_title = function( title, not_compact ){
  
  var buf = this;

  if( title[0] === "@" ){
    buf.push(
      '<h3>',
      link_to_page( "persona", title ),
      '</h3>'
    );
  }else{ 
    buf.push(
      '<h3>',
      title,
      '</h3>'
    );
  }

  var filter_label = Session.current.filter_label();
  if( filter_label ){
    filter_label = filter_label.replace( /#[a-z0-9]+/gi, function( tag_name ){
      var topic = Topic.find( tag_name );
      if( !topic )return i18n( tag_name );
      var new_title;
      if( topic.is_persona() && topic.get_persona().label === title ){
        // Avoid duplicate display of persona
        new_title = " " + tag_name; // " " is hack to avoid #xxx expansion
      }
      var r = link_to_proposition_page( topic, new_title );
      return r;
    });
    buf.push( '  <h2>'
      + filter_label
      + '</h2>'
    );
    var persona_tag = Persona.find(
      Session.current.filter.replace( "#", "@" ).trim()
    );
    if( persona_tag && title !== persona_tag.label ){
      buf.push(
        ' <dfn>',
        link_to_page( "persona", persona_tag.label ),
        '</dfn>'
      );
    }
    buf.push( '<br>' );
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
        comment = link_to_page( "persona", comment );
      }else{
        comment = i18n( comment );
      }
      buf.push( '<dfn>' + comment + '</dfn><br><br>' );
    }else if( comment 
      = ( tag_topic && Comment.valid( tag_topic.comment() ) )
    ){
      buf.push( '' + format_comment( comment.text ) + '<br><br>' );
    }else{
      buf.push( '<br><br>' );
    }
  }else{
    if( not_compact ){
      buf.push( '<h2> </h2><br><br><br>' ); // Same height
    }
  }
  
  return this;
};


PageBuilder.prototype.push_title_and_search_form = function( title, hide ){
  
  var buf = this;
  var novice = this.session.is_novice;
  
  this.push( '<div id="search">' );
  this.push_title( title, true /* not compact, same height if empty */ );

  // Twitter tweet button, to tweet about the filter
  if( false && Session.current.has_filter() ){
    Session.current.needs_twitter = true;
    buf.push( '<a href="http://twitter.com/intent/tweet?button_hashtag=kudocracy'
      + '&hashtags=vote,'
      + Session.current.filter_label( "," )
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet #kudocracy</a>'
    );
  }

  // Query to search for tags or create a proposition
  var can_propose
  = ( title === "Propositions" )
  && Session.current.visitor 
  && !Session.current.visitor.is_abuse()
  && Session.current.has_delegateable_filter();
  buf.push( filter_and_sort_menu( {
    can_propose: can_propose,
    title: title,
    with_filter: true,
    with_sort: title !== "Propositions",
    hide: hide
  } ) );
  
  // Build a list of all seen tags
  var tag_set = new TagSet();
  tag_set.add_session( Session.current );
  
  if( novice ){
    this.push(
      ' <span class="help"> ',
      i18n( "or click to select/deselect desired tags: " ),
      '</span>'
    );
  }
  // Place holder for clickable list of tags, to alter filter
  tag_set.insert_index = buf.length;
  buf.push( '', '</div>' ); // ToDo: why ''? without it the <div> is erased...???
  
  return tag_set;
  
};


PageBuilder.prototype.push_vote_menu = function( proposition, options ){
  
  var visitor = this.session.visitor;

  if( !visitor || visitor.is_abuse() ){
    // this.push( '<br>' );
    this.push( 
      '<h2>',
      link_to_page( "login", "", i18n( "vote" ) + " " + i18n( "Vote" ) ),
      "</h2> "
    );
    return;
  }
  
  var vote_entity = proposition.get_vote_of( visitor );
  if( !vote_entity ){
    this.push(
      // '<br><br>',
      vote_menu( visitor, proposition, options )
    );
    return;
  }
  
  this.push( 
  );
  if( this.session.can_script ){
    this.push(
      '\n<a ',
      'onclick="',
      "this.style.display = 'none';",
      "this.nextElementSibling.style.display = 'block';",
      '"><h2>',
      i18n( "vote" ) + " " + i18n( "Vote" ),
      '</h2></a>',
      ' <span style="display:none">'
    );
  }else{
    this.push( " <span>" );
  }
  this.push(
    i18n( "you" ), " ",
    emojied( vote_entity.orientation() ),
    ( vote_entity.is_direct()
      ? ""
      : " <dfn>(" + link_to_delegation_page( vote_entity ) + ")</dfn>" ),
    ( vote_entity.half_life() ? " " + i18n( "for" ) + " " 
    + duration_label( vote_entity.expire() - Kudo.now() ) : "" ),
    vote_menu( visitor, proposition ),
    '</span>'
  );

};


PageBuilder.prototype.push_delegations = function( persona, br ){ 
  
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
  
  if( !list.length )return;
  
  if( br ){
    this.push( br ); // class="odd">' );
  }
  
  if( persona === visitor ){
    this.push(
      '<div><h2>', i18n( "Your delegations" ), '</h2>',
      ' - ', link_to_page( "delegations", "", "change" ),
      ". ", link_to_page( "visitor", "indirect all", i18n( "all(e)" ) ), "."
    );
  }else{
    this.push(
      '<div><h2>',
      i18n( "Delegations" ),
      " ",
      br ? "" : link_to_persona_page( persona ),
      '</h2>'
    );
  }
  this.push( '<br><br>' );
  
  if( false && !list.length ){
    this.push(
      i18n( "none(e)" ), " ",
      i18n( "about" ), " "
    );
    this.push_title( persona.label );
    this.push( "</div>" );
    return;
  }
    
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
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];

  Ephemeral.each( list, function( delegation ){
    
    index++;
    that.push( div[ index % 2 ] );

    var filter = delegation.filter_string( persona );

    if( can_delegate && delegation.agent !== that.session.visitor ){
      that.push(
        '<form name="delegation" url="/">',
        '<input type="hidden" name="i" value="set_delegation"/>',
        '<input type="hidden" name="i2" value="' + filter + '"/>',
        '<input type="submit" value="', i18n( "Delegate" ), '"/> '
      );
    }
    
    that.push(
      link_to_delegation_page( delegation ),
      " "
    );
    if( delegation.is_inactive() ){
      that.push( "<dfn>(inactive)</dfn> " );
    }
    
    var filter_label = "";
    filter.split( " " ).forEach( function( label ){
      if( !label )return;
      filter_label += " " + i18n( label );
    });
    filter_label = filter_label.trim();
    
    if( true || persona === visitor ){
      that.push(
        i18n( "about" ), " ",
        link_to_page(
          "propositions",
          filter,
          filter_label.replace( / /g, "&nbsp;+&nbsp;" )
        )
      );
    }else{
      that.push(
        i18n( "about" ), " ",
        link_to_page(
          "persona",
          delegation.agent.label + " " + filter,
          filter_label.replace( / /g, "&nbsp;+&nbsp;" )
        )
      );
    }
    
    if( can_delegate ){
      that.push( "</form>" );
    }else{
      that.push( "<br>" );
    }
    
    that.push( "</div>" );
    
  });
  
  that.push( '</div>' );
  
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
  this.start_time = null;
  this.end_time   = null;
}


Sparklines.prototype.add = function( proposition, start_time, limit_time, personas ){
  var data = get_sparkline_data( proposition, start_time, limit_time, personas );
  if( !data.serie.length )return;
  if( !Session.current.can_script )return;
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
  var start     = Kudo.now();
  var end       = start;
  var max_total = 0;
  var min_total = 1000000;
  this.list.forEach( function( data ){
    if( data.start < start ){ start = data.start; }
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


/* ---------------------------------------------------------------------------
 *  page visitor
 */

function page_visitor( page_name, content ){
// The private page of a persona

  var that = this;
  var persona = this.session.visitor;
  if( !persona )return this.redirect( "login" );
  if( !content )return this.redirect( "visitor direct" );
  
  // Forget about whatever potential agent's page was visited recently
  this.session.agent = null;
  
  // Remove #new filter, confusing
  this.session.remove_confusing_new_filter();
  
  // Don't display votes unless some good filter exists, else it's too much
  var display_votes = this.session.has_enough_filter();

  // Header
  this.set( page_style( "you" ) );
  
  if( this.session.is_novice ){
    this.push_help(
      i18n( 
    "This page list informations about you, your votes, your delegations, etc."
      )
    );
  }

  var tag_set = this.push_title_and_search_form( persona.label );
  
  // sign out & clear (to clear local storage)
  if( !this.session.authentic ){
    this.push(
      i18n( "Authentication required" ), ". "
      //link_to_page( "login"), " ",
      //i18n( "or" ), " "
    );
  }
  this.push( "<br>", link_to_page( "signout", "", i18n( "sign out" ) ) );
  if( l8.client || this.session.magic_loader ){
    this.push(
      " ", link_to_page( "signout", "clear", i18n( "& clear" ) ), "."
    );
  }

  if( !this.session.is_novice ){
    this.push(
      " ",
      link_to_command(
        "help_toggle",
        i18n( "help" )
      ),
      "."
    );
  }

  // Kudocracy domain?
  if( persona.is_domain() ){
    this.push(
      '<br><br>',
      i18n( "Domain propositions" ), " ",
      '<a href="?page=propositions'
    );
    if( persona.label.substring( 1 ) !== config.domain ){
      this.push( '&domain=', persona.label.substring( 1 ) );
    }
    this.push( '">', persona.label, '</a>' );
    if( this.session.authentic ){
      this.push(
        ' - ',
        link_to_page( "domain", "", i18n( "security") ),
        '<br>'
      );
    }
  }

  this.push( "<br><br>" );
  
  // Delegations
  that.push_delegations( persona );
  
  var index = -1;
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];

  var without_direct_votes   = ( content === "indirect" );
  var without_indirect_votes = ( content === "direct" );
  var all_votes = ( content === "all" );
  
  var votes = persona.votes();

  // Sort votes, recent first unless some other criteria about propositions
  if( display_votes ){
    var sort_criterias = this.session.sort_criterias;
    votes = votes.sort( function( a, b ){
      if( !sort_criterias.length )return b.time_touched - a.time_touched;
      return Ephemeral.compare_measures(
        a.proposition,
        b.proposition,
        sort_criterias,
        persona
      );
    });
    this.push(
      '<br><div><h2>',
      i18n( "Your votes" ),
      '</h2>',
      // " - ",
      // link_to_page( "delegations", "", "your delegations" ),
      "<br><br>"
    );
    this.push(
      !all_votes
      ? link_to_page( "visitor", "all", "all(s)" )
      : "<h3>" + i18n( "all(s)" ) + "</h3>",
      " ",
      ( all_votes || without_direct_votes )
      ? link_to_page( "visitor", "direct", "direct(s)" )
      : "<h3>" + i18n( "direct(s)" ) + "</h3>",
      " ",
      ( all_votes || without_indirect_votes )
      ? link_to_page( "visitor", "indirect", "indirect(s)" )
      : "<h3>" + i18n( "indirect(s)" ) + "</h3>"
    );
    this.push( "<br><br>" );
  }
  
  Ephemeral.each( votes, function( entity ){

    var orientation = entity.orientation();
    if( orientation === Vote.neutral )return;

    if( !entity.filtered(
      that.session.filter,
      that.session.filter_query,
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
    that.push(
      div[ index % 2 ],
      '<h3>',
      link_to_page( "proposition", label, i18n( label ) ),
      '</h3>',
      " <em>", emojied_text, '</em>',
      ' ',
      ( result_orientation === orientation
      ? i18n( "you too" )
      : i18n( "you" ) + " " + emojied( orientation ) ),
      indirect_msg
      //" " + i18n( "for" ) + " " + duration_label( entity.expire() - Kudo.now() ),
      //vote_menu( persona, entity.proposition, { with_twitter: true } ),
    );
    that.push_vote_menu( entity.proposition, { with_twitter: true } );
    
    that.push( '</div>' );

  });
  
  if( display_votes ){
    this.push( "</div><br>" );
  }else{
    this.push( "<br>" );
  }

  // Inject list of all seen tags, to alter filter when clicked
  this.at_insert( tag_set.insert_index, filter_change_links( tag_set ) );
  
  this.unshift(
    page_header_right(
      _,
      link_to_twitter_user( persona.label ),
      _ // link_to_page( "delegations" )
    )
  );
  this.push( "</div><br>", page_footer() );

} // page_visitor()


/* ---------------------------------------------------------------------------
 *  page persona
 */
 
function page_persona( page_name, name ){
// This is the "public" aspect of a persona

  var persona = Persona.find( name );
  if( !persona )return this.error( "Persona not found: ", name );

  var visitor = this.session.visitor;

  var that = this;
  
  // If visitor visits her/his own page
  if( visitor === persona ){
    this.session.agent = null;
    // Remove #new filter, confusing
    this.session.remove_confusing_new_filter();
  }else{
    this.session.agent = persona;
  }

  // Header
  this.set( page_style( persona.label ) );

  // Get some twitter provided stuff, image, banner, etc
  var twitter_user = TwitterUser.lookup( persona.label );
  var twitter = twitter_user && twitter_user.twitter_user_data;
  if( twitter ){
    // debugger;
  }
  if( twitter ){
    this.push(
      '<div style="background-color:white; padding:1em">',
      '<a href="', twitter.url, '">',
      '<img src="', twitter.profile_image_url, '" height="48" width="48" />',
      '</a> <h3>', twitter.name, '</h3>',
      // ToDo: get an official link to the badge icon
      !twitter.verified ? "" : ' <img src="' + 'http://si0.twimg.com/help/1307051362_737' + '"/>',
      !twitter.verified ? "" : " <dfn>(" + i18n( "verified" ) + ')<dfn>',
      // '<br>', twitter.description,
      '</div><br>'
    );
  }
  
  if( this.session.is_novice ){
    this.push_help(
      i18n( 
"This page lists informations about a person, her votes, her delegations (received and given), etc."
      )
    );
  }

  var tag_set = this.push_title_and_search_form( persona.label );
  
  // Will maybe display each vote, not too much
  var display = this.session.has_enough_filter();
  var delegateable_filter_label;

  // propositions - delegations
  var delegateable_filter = this.session.delegateable_filter();
  if( delegateable_filter ){
    delegateable_filter_label = "";
    delegateable_filter.split( " " ).forEach( function( label ){
      if( !label )return;
      delegateable_filter_label += " " + i18n( label );
    });
    delegateable_filter_label = delegateable_filter_label.trim();
    that.push(
      "<br>", i18n( "propositions" ), "&nbsp;",
      link_to_page(
        "propositions",
        delegateable_filter,
        delegateable_filter_label.replace( / /g, "&nbsp;+&nbsp;" )
      ),
      " - ", i18n( "delegations" ), "&nbsp;",
      link_to_page(
        "delegates", "all " + delegateable_filter,
        delegateable_filter_label.replace( / /g, "&nbsp;+&nbsp;" )
      ),
      '<br>'
    );
  }
  
  // Is there a "topic" about that user?
  var persona_topic = persona.get_topic();
  if( persona_topic ){
    this.push(
      "<br><h2>", i18n( "Personal tag" ), " ",
      link_to_proposition_page( persona_topic ),
      "</h2>",
      " - ",
      link_to_page(
        "persona",
        persona.label + " " + persona_topic.label,
        "propositions"
      ),
      '<dfn>(', persona_topic.propositions().length, ')</dfn> ',
      //'<br>',
      proposition_summary( persona_topic, "", persona /* avoid author */ ),
      ""//"<br><br>"
    );
    that.push_vote_menu( persona_topic );
  }else{
    this.push( "<br><br>" );
  }

  // Twitter follow & tweet buttons
  this.session.needs_twitter = true;
  this.push(
    '<br><br><a href="http://twitter.com/', persona.label,
    '" class="twitter-follow-button" data-show-count="true">',
    'Follow ', persona.label, '</a> ',
    '<a href="http://twitter.com/intent/tweet?screen_name=',
    persona.label.substring( 1),
    '" class="twitter-mention-button">',
    'Tweet to ', persona.label, '</a><br>'
  );

  // Kudocracy domain?
  if( persona.is_domain() ){
    this.push(
      '<br>',
      i18n( "Domain propositions" ), " ",
      '<a href="?page=propositions'
    );
    if( persona.label.substring( 1 ) !== config.domain ){
      this.push( '&domain=', persona.label.substring( 1 ) );
    }
    this.push( '">', persona.label, '</a><br>' );
  }
    
  var index = -1;
  var div = [
    '\n\n<div class="even">',
    '\n\n<div class="odd">'
  ];
  
  // Delegations, given by persona to some agents
  that.push_delegations( persona, "<br>" );
  
  // Delegations, expertizes as agent
  var expertizes = persona._delegation_expertizes;
  expertizes = expertizes.sort( function( a, b ){
    return b.count_votes - a.count_votes;
  });
  var elen = expertizes.length;
  
  // Make sure a delegation about the current delegateable filter is shown
  var can_delegate = visitor && visitor !== persona;
  var not_done
  =  this.session.visitor
  && persona
  && persona !== visitor
  && delegateable_filter
  && ( persona.label + " " + delegateable_filter ).toLowerCase();
  
  // Display all delegations that the persona can be given
  if( elen || not_done ){
    that.push(
      '\n\n<br><div>', // class="even">
      '<h2>',
      i18n( "Delegate" ), " ",
      link_to_delegation_page( persona.label, delegateable_filter ),
      '</h2><br>'
    );
    if( !can_delegate ){
      that.push( '<br>' );
    }
    index = 0;
    var expertize;
    for( var eii = 0 ; eii < elen && eii < 10 ; eii++ ){
      expertize = expertizes[ eii ];
      can_delegate = visitor && visitor !== expertize.agent;
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
          '<input type="submit" value="', i18n( "Delegate" ), '"/> '
        );
      }
      that.push(
        link_to_delegation_page(
          expertize.agent.label,
          expertize.tags_string()
        ),
        " ", i18n( "about" ), " ",
        link_to_page(
          "propositions",
          // expertize.label.replace( /\./g, " "),
          expertize._delegation_filter.label.replace( /\./g, "&nbsp;+&nbsp;" )
        )
      );
      if( can_delegate ){
        this.push( '</form>' );
      }
      this.push( '</div>' );
    } // end for
    // his.push( "<br>" );
  }
  
  // Delegate button for delegation to this persona about current filter
  if( not_done ){
    delegateable_filter_label = "";
    delegateable_filter.split( " " ).forEach( function( label ){
      if( label )return;
      delegateable_filter_label += " " + i18n( label );
    });
    delegateable_filter_label = delegateable_filter_label.trim();
    that.push(
      '\n<br><br><form name="delegation" url="/">',
      '<input type="hidden" name="i" value="set_delegation"/>',
      '<input type="hidden" name="i2" value="' + persona.id + '"/>',
      '<input type="hidden" name="i3" value="' + delegateable_filter + '"/>',
      '<input type="submit" value="', i18n( "Delegate" ), '"/> via ',
      link_to_persona_page( persona ), " ", i18n( "about" ), " ",
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
  
  // Votes
  if( display ){
    this.push(
      '<br><h2>',
      i18n( "Votes" ),
      // " ",
      // link_to_persona_page( persona ),
      '</h2>'
    );
    if( persona === visitor ){
      this.push(
        " - " + link_to_page( "delegations", "", "your delegations" )
      );
    }
    this.push( '<br><br>' );
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
  
  Ephemeral.each( votes, function( vote ){

    if( vote.orientation() === Vote.neutral )return;
    if( !vote.filtered(
      that.session.filter,
      that.session.filter_query,
      persona // Versus that.session.visitor, POV
    ) )return;

    var proposition = vote.proposition;    
    if( !display ){
      tag_set.add_proposition( proposition );
      return;
    }

    index++;
    that.push( div[ index % 2 ] ); // "<li>" );
  
    tag_set.add_proposition( proposition );
    var label = proposition.label;
    var orientation = vote.orientation();
    var emoji_text = emojied( orientation );
    that.push(
      "<em>", emoji_text, "</em> ",
      link_to_page( "proposition", label, i18n( label ) ), ' ',
      " <dfn>", time_label( vote.time_touched ), "</dfn> ",
      //+ " <dfn>" + emojied( entity.proposition.result.orientation() ) + "</dfn> "
      //+ time_label( entity.proposition.result.time_touched )
      ( vote.is_direct()
        ? ""
        : " <dfn>(" 
        + link_to_delegation_page( vote )
        + ")</dfn> " )
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
        += " <dfn>(" + i18n( "you" )
        + " " + emojied( visitor_orientation );
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
        + i18n( "you too" ) + ", " + i18n( "direct" )
        + ")</dfn>";
      // If same orientation, indirect
      }else{
        // Flag vote when visitor use the persona via a delegation
        if( visitor_delegation.agent === persona ){
          visitor_text 
          += "<em>" + i18n( "you too" ) + "</em> <dfn>("
          + link_to_page(
            "delegations",
            visitor_delegation.tags_string(),
            i18n( "delegation" )
          ) 
          + ")</dfn>";
        // When same orientation but different delegation
        }else{
          visitor_text
          += "<dfn>(" + i18n( "you too" )
          + " " + link_to_delegation_page( visitor_vote )
          + ")</dfn>";
        }
      }
      that.push( " ", visitor_text );
    }
    that.push( '</div>' ); // "</li>"
  });
  if( display ){
    this.push( "<br>" );
  }else{
    // this.push( "" );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this.at_insert( tag_set.insert_index, filter_change_links( tag_set ) );
  
  // buf.push( "</ol></div><br>" );
  this.unshift(
    page_header_left(
      _,
      link_to_twitter_user( persona.label ),
      _, // link_to_page( "delegations" ),
      page_name
    )
  );
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
  this.set( page_style( "your delegations" ) );

  if( this.session.is_novice ){
    this.push_help(
      i18n( 
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
  var votes_by_delegation = {}; // map of arrays
  Ephemeral.each( delegations, function( delegation ){
    votes_by_delegation[ delegation.id ] = [];
  });
  
  // Collect all indirect votes, by delegation
  var with_abuses = this.session.filter.indexOf( "#abuse " ) !== -1;
  var votes = persona.votes();
  var propositions_map = {};
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
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];

  // <h2> Delegations - delegates
  this.push(
    "\n<br>",
    "<div><h2>", i18n( "Your delegates" ), "</h2>",
    " - " + link_to_page( "delegates", "all all", "all(s)" ),
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
    '\n<br><form name="delegation" class="vote" url="/">',
    '<input type="hidden" name="i" value="set_delegation"/>',
    i18n( "delegate" ), ' <input type="text" name="i2" value="', agent_value,
    '" placeholder="@someone"/>',
    ' tags <input type="text" name="i3" value="', filter_value,
    '" placeholder="#tag #tag2 #tag3..."/>',
    ' <input type="submit" value="', i18n( "Delegate" ), '"/>',
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
        i18n( proposition_label )
      ) + ".";
    });

    index++;
    var tags = delegation.filter_string( persona );
    that.push(
      div[ index % 2 ],
      '<h2>',
      link_to_page( "delegates", "all " + tags, i18n( "via" ) ),
      " ",
      link_to_persona_page( delegation.agent ),
      "</h2>",
      ( delegation.is_inactive() ? " <dfn>(inactive)</dfn> " :  " " ),
      link_to_page(
        "persona",
        delegation.agent.label + " " + tags,
        tags
      ),
      "<br><br>", str_proposition_labels ? str_proposition_labels + '<br>' : "",
      delegate_menu(
        delegation,
        i18n( "for" ) + " " 
        + duration_label( delegation.expire() - Kudo.now() ) + " "
      ),
      '</div>'
    );
  });

  // Propositions, display them
  if( proposition_names.length ){ // && this.session.has_delegateable_filter() ){
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
        link_to_page( "proposition", label, i18n( label ) ),
        "</h3> "
      );
      var orientation;
      if( that.session.agent ){
        orientation
        = that.session.agent.get_orientation_on( Topic.find( label ) );
        if( orientation !== Vote.neutral ){
          that.push(
            emojied( orientation ),
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
              " ", i18n( "you" ), " ",
              emojied( orientation ),
              " ",
              link_to_delegation_page( vote_entity ),
              " ", i18n( "about" ), " ",
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
    this.push( "<br>" );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this.at_insert( tag_set.insert_index, filter_change_links( tag_set ) );
  
  this.unshift(
    page_header_right(
      _,
      link_to_twitter_user( persona.label )
      //+ " " + link_to_page( persona.label, "visitor", "votes" )
    )
  );
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

  if( page_name === "offline" ){
    trace( "serving the offline version of 'propositions' page" );
    if( l8.client ){
      trace( "BUG? only the server is expected to serve the 'offline' page" );
      debugger;
      return this.redirect( "propositions" );
    }
    // Server side code
    if( this.session.is_app ){
      trace( "BUG? unexpected 'offline' page in app mode" );
      debugger;
      return this.redirect( "!propositions" );
    }
    if( this.session.app_init_done ){
      trace( "BUG? unexpected 'offline' page after app mode init" );
      debugger;
      return this.redirect( "!propositions" );
    }
    if( this.session.magic_loader ){
      trace( "BUG? unexpected magic loaded 'offline' page in magic mode" );
      debugger;
      return this.redirect( "!propositions" );
    }
    if( this.session.page_init_done ){
      trace( "BUG? unexpected page init was done for 'offline' page" );
      debugger;
      return this.redirect( "!propositions" );
    }
    // Ask page_style() to include browserified.js (aka uiclient.js)
    this.session.is_app = "offline";
    this.session.app_init_done = false;
    // Ask page_style() to include kudo_magic() definition
    this.session.page_init_done = false;
  }

  var visitor = this.session.visitor;
  
  // Page for propositions is almost like page for tags
  var tag_page = page_name === "tags";
  
  var filter = this.session.filter;
  var delegateable_filter = this.session.delegateable_filter();
  var with_votes = visitor 
  && ( filter.indexOf( " #vote "     ) !== -1 
    || filter.indexOf( " #direct "   ) !== -1
    || filter.indexOf( " #indirect " ) !== -1
  );
  
  // Header, actually inserted when count of filtered propositions is computed
  this.set( page_style( "propositions" ) );
  
  if( this.session.is_novice ){
    this.push_help(
      i18n( "This page lists propositions." )
    );
    if( !visitor ){
      this.push_help(
        " ", i18n( "If logged in, you can vote." ),
        " ", link_to_page( "login" ), "."
      );
    }
  }

  // Title + search form + list of tags 
  var tag_set = this.push_title_and_search_form(
    i18n( tag_page ? "Tags" : "Propositions" )
  );
  
  this.push( "<br>" );
  var date_range_insert_index = this.length;
  this.push( "" );

  // Will display list of matching propositions or tags, main content of page
  var propositions = Topic.all;
  var list = [];
  var count = 0;
  var attr;
  var entity;
  var visitor_tag = null;
  if( visitor ){
    visitor_tag = "#" + visitor.label.substring( 1 );
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
      visitor
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
    && entity.is_persona()
    && filter.indexOf( " #persona " ) === -1
    )continue;

    // Avoid excessive output
    if( ++count >= 200 )break;

    list.push( entity );
  }
  // list[] contains propositions to display
  
  Session.current.cached_count_propositions = count;
  
  // Sort list of proposition according to user specified sort order
  var sort_criterias = this.session.sort_criterias;
  if( !sort_criterias.length ){
    // Default to "relevance", ie "heat" measure
    sort_criterias = [ "-heat" ];
  }
  list = list.sort( function( a, b ){
    // The last consulted proposition, if any, is before all the others
    // because this helps to avoid lost users
    if( a === Session.current.proposition )return -1;
    if( b === Session.current.proposition )return  1;
    return Ephemeral.compare_measures(
      a, b,
      sort_criterias,
      visitor
    );
  });

  // Display sorted matching propositions
  var that = this; // The PageBuilder object
  var display = tag_page || this.session.has_enough_filter();
  var sparklines = display && new Sparklines( this );
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];
  
  list.forEach( function( proposition, index ){
    
    if( !display ){
      tag_set.add_proposition( proposition );
      return;
    }

    var text = i18n( proposition.label );
    if( tag_page ){
      // Make it clear that agree is when tag is "appropriate", versus abusive
      text += i18n( " is a good tag" );
    }else{
      // text = "#" + text;
    }
    
    // proposition's comment and name + ?
    var comment = proposition_comment( proposition );
    if( comment ){
      comment += "<br>";
    }
    that.push(
      '\n\n', div[ index % 2 ],
      comment,
      '<h2>',
      proposition.is_tag() ? "Tag " : "#",
      link_to_page( "proposition", proposition.label, text ),
      // i18n( "?" ),
      '</h2> ',
      // '<h3> <em>', emojied_result( proposition.result ), '</em></h3>',
      !proposition.is_persona()
      ? ""
      : ( '<dfn>(' 
        + link_to_persona_page( proposition.get_persona() )
        + ")</dfn> "
      ),
      !with_votes ? "" 
      : i18n( "you" ) + " " 
        + emojied( visitor.get_orientation_on( proposition ) )
        + " " + link_to_delegation_page( visitor.get_vote_on( proposition ) ), 
      '<br>'
    );
    
    // List of tags
    // ToDo: what if this gets too long?
    //buf.push( '<br>' );
    tag_set.add_proposition( proposition, function( tag, label ){
      var topic = Topic.find( tag );
      var persona = topic && topic.get_persona();
      if( persona ){
        that.push(
          link_to_persona_page( persona, "@" ),
          link_to_command( "filter_toggle " + tag, label ),
          " "
        );
      }else{
        that.push(
          link_to_command( "filter_toggle " + tag, i18n( label ) ),
          " "
        );
      }
    }, tag_page );
    
    //buf.push( '<small>' + link_to_twitter_tags( proposition.tags_string() + '</small><br>' ) );
    
    // Summary for proposition: emoji, main orientation, other orientations, etc 
    that.push( '\n<br>', proposition_summary( proposition, "nocomment" ) );
    sparklines && sparklines.add( proposition );

    // If some logged in user, collect votes from agents, whatever their filter
    // because that can help visitor to make a choice or delegate, for votes 
    // from people you trust matter.
    // Then display a "cast a vote" menu/form.
    that.push_vote_menu( proposition );
    
     // Picture of other who voted
    var recommendations = proposition_recommendations({
      proposition: proposition,
      persona: that.session.visitor,
      count: 40
    });
    if( recommendations.length ){
      that.push( "<div>" );
      Ephemeral.each( recommendations, function( vote ){
        that.push( link_to_persona_page( 
          vote.persona,
          '<img src="http://avatars.io/twitter/'
          + vote.persona.label.substring( 1 )
          + '" height="24" width="24">'
        ));
      });
      that.push( "</div>" );
    }

   // If tag, display link to tagged propositions, with count of propositions
    if( tag_page ){
      that.push(
        '<br>',
        i18n( "propositions" ) + " " + proposition.propositions().length + " - ",
        link_to_page(
          "propositions",
          proposition.label,
          i18n( "details" )
        ),
        "<br>"
      );
    }

    that.push( '</div>\n' );
  });

  // Inject list of all seen tags, after filter/sort menu
  this.at_insert(
    tag_set.insert_index,
    filter_change_links( tag_set, !display /* don't hide in some cases */ )
  );
  
  // Inject sparklines and date range
  var msg1 = "";
  if( sparklines ){
    sparklines.push();
    if( count > 1 ){
      msg1 += sort_menu();
    }
    if( count > 200 ){
      msg1 += i18n( "more than" ) + " ";
    }
    if( count > 1 ){
      msg1 += count + " " + i18n( "propositions" ) + " ";
      msg1 += ""
      + i18n( "between" )
      + " "
      + time_label( sparklines.start_time )
      + " "
      + i18n( "and" )
      + " "
      + time_label( sparklines.end_time )
      + sort_label( true )
      + ". "
      + link_to_page( "ballot", "", i18n( "other dates" ) )
      + '.';
    }
  }
  msg1 += " " 
  + link_to_page(
    visitor ? "propose" : "login",
    "",
    i18n( "new proposition" )
  ) + ".";

  msg1 += '<br><br>';
  this.at_insert( date_range_insert_index, msg1 );
  
  // Inject header, late, it depends on the filter propositions
  this.unshift( page_header_left(
    _,
    this.session.has_filter()
    ? link_to_twitter_tags( delegateable_filter )
    : _,
    _,
    page_name
  ) );
  
  this.push(  "<br>", page_footer() );
  
} // page_propositions()


/* ---------------------------------------------------------------------------
 *  page ballot
 */
 
function page_ballot( page_name ){
// This page builds a query sent to page_ballot2() to show result of votes
// during a time period on a set of propositions by a set of people.

  var added_personas = set();
  
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
  personas.forEach( function( persona ){
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


function page_ballot2( /* pagename, ...query */ ){
  
  // This page let's visitor ask for results about propositions by specified
  // personas
  var query = slice1( arguments ).join( " " );

  this.set( page_style( "ballot" ) );

  if( this.session.is_novice ){
    this.push_help(
      i18n( 
  "This page lists results for specified voters on specified propositions, with a date limit."
      )
    );
  }

  // Display Title + alloc space for list of tag filters
  this.session.set_current_page( [ "ballot" ] ); 
  var tag_set = this.push_title_and_search_form( i18n( "Ballot" ) );
  
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
  if( this.session.is_novice ){
    this.push_help(
      "<br>",
      i18n( 
    "You can change the limit dates, the propositions and the authorized voters: "
      ),
      "<br>"
    );
  }
  this.push(
    '\n<br><form name="ballot" class="ballot" method="POST" url="/">',
    '<input type="hidden" value="ballot2" name="page"/>',
    '<textarea class="ballot_text_area" name="i2" autofocus cols=40 rows="'
    + ( 6 + tags.length + personas.length )
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

  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];
  
  var index = -1;
  Ephemeral.each( tags, function( tag ){
    
    var total         = 0;
    var count_for     = 0;
    var count_against = 0;
    var count_blanks  = 0;
    var buf_proposition_votes = [];
    index++;
    that.push(
      div[ index % 2 ],
      '<h3>',
      link_to_page( "proposition", tag.label, i18n( tag.label ) ),
      '</h3> '
    );
    tag_set.add_proposition( tag );
    
    buf_votes.push(
      div[ index % 2 ],
      '<h3>',
      link_to_page( "proposition", tag.label, i18n( tag.label ) ),
      '</h3> '
    );
    
    Ephemeral.each( personas, function( persona ){
      
      var vote = tag.get_vote_of( persona );
      if( !vote )return;
      
      var vote_value = vote.get_old_value( time_start, time_limit );
      if( !vote_value )return;
      
      var orientation = vote_value.orientation;
      
      if( orientation && orientation === Vote.neutral )return;
      
      buf_proposition_votes.push( '\n<br>'
        + link_to_persona_page( persona )
        + ' '
      );
      var agent_label = vote_value.agent_label;
      if( agent_label ){
        buf_proposition_votes.push(
          ' <dfn>(',
          link_to_delegation_page( vote ),
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
    });
    
    // Skip if no votes
    if( total ){
    
      // Display results
      var ratio_for     = Math.round( 1000 * ( count_for     / total) ) / 10;
      var ratio_against = Math.round( 1000 * ( count_against / total) ) / 10;
      var ratio_blanks  = Math.round( 1000 * ( count_blanks  / total) ) / 10;
      var sp = "&nbsp;";
      var bp = "&nbsp;<dfn>";
      var ep = "%</dfn>";
      that.push(
        "<em>",
        emojied( count_for > count_against ? "win" : "fail" ),
        '</em><br>',
        ""  , i18n( "agree"   ), sp, count_for,     bp, ratio_for,     ep,
        ". ", i18n( "against" ), sp, count_against, bp, ratio_against, ep,
        ". ", i18n( "blank"   ), sp, count_blanks,  bp, ratio_blanks,  ep,
        ". total", sp, total,
        ". <br>"
      );
      
      // Display sparkline
      sparklines.add( tag, time_start, time_limit, personas );
    
    }
    
    // Bufferize future display of votes
    buf_proposition_votes.push( "<br></div>" );
    buf_votes.push.apply( buf_votes, buf_proposition_votes );
    that.push( '<br></div>' );
  });
  
  // Display bufferized personal votes
  this.push( "<br><h2>", i18n( "Votes" ), "</h2><br>" );
  this.concat( buf_votes );
  
  // Inject list of all seen tags
  this.at_insert( tag_set.insert_index, filter_change_links( tag_set ) );
  
  // Inject sparklines
  sparklines.push();
  
  this.unshift( page_header_left( 
    _,
    this.session.has_filter()
    ? link_to_twitter_tags( this.session.delegateable_filter() )
    : _,
    _,
    "ballot"
  ) );
  this.push( "<br>", page_footer() );
  
} // page_ballot2()


/* ---------------------------------------------------------------------------
 *  page votes
 */

function page_votes( page_name, display_what ){
// This is the votes page of the application, filtered.

  var persona = this.session.visitor;
  
  if( !display_what )return this.redirect( "votes comments" );
  
  if( this.session.too_much_propositions() ){
    return this.redirect( "propositions" );
  }
  // Remove #new filter, confusing
  this.session.remove_confusing_new_filter();
  
  // Comments only?
  var comments_only = display_what === "comments";
    
  // Header
  var that = this;
  this.set( page_style( "votes" ) );

  if( this.session.is_novice ){
    this.push_help(
      i18n( "This page lists direct individual votes on propositions." )
    );
  }

  var tag_set = this.push_title_and_search_form( i18n( "Votes" ) );
  this.push( "<br>" );
  
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
    if( ( vote_value.delegation          === Vote.direct
      && vote_value.orientation          !== Vote.neutral
      && vote_value.entity.orientation() !== Vote.neutral )
    || ( comments_only && vote_value.comment_text )
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
  
  // Sort
  var sort_criterias = this.session.sort_criterias;
  if( !sort_criterias.length ){
    sort_criterias = [ "+heat" ];
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
  
  // Show number of propositions and sort criteria
  var count_propositions = propositions.length;
  var msg1 = "";
  if( count_propositions ){
    msg1 += count_propositions + " " + i18n( "propositions" );
  }
  if( count_propositions > 200 ){
    msg1 = i18n( "more than" ) + " " + msg1;
  }
  this.push(
    msg1,
    sort_label( true ),
    ". "
  );
  
  if( count_propositions ){
    that.push(
      " ", link_to_page( "propositions", "", "details" ), ".",
      " ", link_to_page( "delegates", "all", "delegations" ), "."
    );
  }
      
  that.push( "<br><br>" );

  if( !comments_only ){
    this.push(
      link_to_page( "votes", "comments", i18n( "comments") ),
      " - <h3>", i18n( "direct votes" ), "</h3> ",
      '<br>'
    );
  }else{
    this.push(
      "<h3>", i18n( "comments" ), "</h3> - ",
      link_to_page( "votes", "all", i18n( "direct votes") ),
      '<br>'
    );
  }
  this.push( "<br>" );

  // Display votes
  var seen_comments = {};
  var last_proposition;
  
  // Handle even/odd rows
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];
  
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
      that.push( '\n</div>' );
    }
    
    if( proposition !== last_proposition ){
      index++;
      that.push( div[ index % 2 ] );
      var label = proposition.label;
      that.push(
        "<h3>",
        ( proposition.is_tag() ? "tag " : "" ),
        link_to_page( "proposition", label, i18n( label ) ),
        "</h3><br>"
      );
    }else{
      if( !after_comment ){
        that.push( "<br>" );
      }
    }
    
    last_proposition = proposition;
    
    var orientation_text = vote_value.orientation;
    var persona_text = link_to_page( "persona", vote_value.persona_label );
    var agent_label;
    if( vote_value.delegation !== Vote.direct ){
      if( vote_value.entity
      && ( agent_label = vote_value.entity.agent_label() )
      ){
        persona_text
        += ' <dfn>('
        + link_to_delegation_page( vote_value.entity )
        + ')</dfn> ';
      }else{
        persona_text += ' <dfn>(indirect)</dfn> ';
      }
    }
    that.push(
      " ",
      persona_text,
      " ",
      emojied( orientation_text ),
      " <small><dfn>",
      time_label( vote_value.snaptime ),
      "</dfn></small>"
    );
    after_comment = false;
    if( comment ){
      that.push(
        '<div class="comment">',
        format_comment( comment, true /* no truncate */ ),
        '</div>'
      );
      after_comment = true;
    }
    // buf.push( "</li>" );
  });
  
  // Close last open even/odd div
  if( index !== -1 ){ that.push( '\n</div>\n' ); }

  // Inject list of all seen tags, to alter filter when clicked
  this.at_insert( tag_set.insert_index, filter_change_links( tag_set ) );
  
  // Header & footer
  this.unshift(
    page_header_left(
      _,
      this.session.has_filter()
      ? link_to_twitter_tags( that.session.delegateable_filter() )
      : _,
      _,
      "votes"
    )
  );
  this.push(  "<br><br>", page_footer() );
  
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
  
  this.set( page_style( "delegations" ) );
  
  if( session.is_novice ){
    this.push_help(
      i18n( 
  "This page lists indirect votes via delegates and associated tags."
      )
    );
    if( !persona ){
      this.push_help(
        " ", i18n( "If logged in, you can delegate." ),
        " ", link_to_page( "login" ), "."
      );
    }
    if( about_proposition ){
      this.push_help( " ", i18n(
        "Results are about votes of whoever casted a vote on proposition"
      ), ' "', about_proposition.label, '".' );
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
  var seen_agents = {};
  var seen_personas = {};
  var seen_vote = {};
  var agent_ids = [];
  var count_agents = 0;
  var count_personas = 0;
  var seen_propositions = {};
  var propositions = [];
  var count_propositions = 0;
  var indirect_count_by_proposition = {};
  var direct_count_by_proposition = {};
  var count_delegations_by_agent = {};
  var delegation_counts_by_agent = {}; // counts dispatched by tag filters
  var delegations_by_agent = {};
  var tag_ids_by_delegation = {};
  var count_delegations_by_tags = {};
  var delegation_counts_by_tags = {}; // counts dispatched by agent
  var all_tag_ids = [];
  var delegation;
  var max_votes = 0;
  var count_direct_votes   = 0;
  var count_indirect_votes = 0;
  var last_vote;
  var proposition;
  var voter;
  var cache_filtered_out_propositions = {};
  var voter_to_skip = {};
  var voter_to_include = {};
  
  // Scan votes, last ones first, looking for indirect votes
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
      delegation_counts_by_agent[ agent_id ] = {};
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
  
  // Will display propositions after the delegations
  var buf2 = [];
  var count = propositions.length;
  buf2.push(
    "<br><br><h2>", i18n( "Propositions" ), "</h2> -  ",
    link_to_page( "propositions", "", "details" ),
    '<br>'
  );
  
  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var propositions_graph_pie = [ [ "direct", count_direct_votes ] ];
  if( session.can_script && ( l8.server || window.google ) ){
    buf2.push(
      '<div id="propositions_chart_div" style="height:300px"></div>'
    );
  }else{
    this.push( "<br><br>" );
  }
  
  // Show number of voters, number of propositions and sort criteria
  if( count_personas > 1 ){
    buf2.push(
      count_personas,
      " ",
      i18n( "voters" )
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
  if( count ){
    msg1 += count + " " + i18n( "propositions" );
  }
  if( count > 200 ){
    msg1 = i18n( "more than" ) + " " + msg1;
  }
  buf2.push(
    msg1,
    sort_label( true ),
    ".<br><br>"
  );
  
  var other_count = count_indirect_votes;
  var shown_propositions = 0;
  
  var index = -1;
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];
  
  // Display each proposition (top 10 in chart)
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
      link_to_page( "delegates", proposition.label, i18n( proposition.label ) ),
      '</h3>',
      ' ', 
      count_votes, ". ", 
      i18n( "direct" ), nbsp, count_direct_votes,
      nbsp, '<dfn>', ratio_direct,   "%</dfn>. ",
      i18n( "indirect" ), nbsp, count_indirect_votes,
      nbsp, '<dfn>', ratio_indirect, "%</dfn>. ",
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
      i18n( proposition.label ),
      count_indirect_votes
    ] );
  });
  
  if( other_count ){
    de&&mand( other_count >= 0 );
    propositions_graph_pie.push( [ i18n( "other"), other_count ] );
  }
  
  var count_votes = count_direct_votes + count_indirect_votes;
  var ratio_direct = Math.round( 1000 * ( 
    count_direct_votes / count_votes
  ) ) / 10;
  var ratio_indirect = Math.round( 1000 * ( 
    count_indirect_votes / count_votes
  ) ) / 10;
  var nbsp = "&nbsp;";
  this.push(
    '<br>',
    i18n( "votes" ), nbsp, count_votes, ". ", 
    i18n( "direct(s)" ), nbsp, count_direct_votes,
    nbsp, '<dfn>(', ratio_direct, "%)</dfn>. ",
    i18n( "indirect(s)" ), nbsp, count_indirect_votes,
    nbsp, '<dfn>(', ratio_indirect, "%)</dfn>. "
  );
  
  // Delegates. Display agents
  this.push( "<br><br><h2>", i18n( "Delegates" ), "</h2>" );
  if( persona ){
    this.push( " - ", link_to_page( "delegations", "", "your delegations" ) );
  }
  this.push( "<br>");

  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var delegates_graph_pie = [ [ i18n( "direct" ), count_direct_votes ] ];
  if( session.can_script && ( l8.server || window.google ) ){
    this.push( '<div id="delegates_chart_div" style="height:300px"></div>' );
  }else{
    this.push( "<br><br>" );
  }

  index = -1;
  var about_proposition_reminder = true;
  
  // Delegations, display each agent
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
    index++;
    that.push(
      div[ index % 2 ],
      i18n( "via" ), "&nbsp;<h2>",
      link_to_persona_page( agent ),
      '</h2>'
      //link_to_page( "delegates", "#" + agent.label.substring( 1 ) )
    );
    if( ratio !== 100 ){
      that.push(
      " <dfn>(",
          count_delegations_by_agent[ agent_id ], "&nbsp;",
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
          emojied( agent_vote.orientation() ),
          '</dfn>'
        );
        // Show proposition once, as a reminder
        if( about_proposition_reminder ){
          about_proposition_reminder = false;
          that.push(
            " <dfn>(", i18n( "about" ), " ",
            link_to_proposition_page( about_proposition ),
            ")</dfn>"
          );
        }
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
      }else{
        if( ii ){
          that.push( "<br>" );
        }
      }
      that.push(
        i18n( "about" ), " ",
        link_to_page( 
          "persona",
          agent_id + " " + tags,
          tags.replace( / /g, "&nbsp;+&nbsp;" )
        )
      );
      if( ratio !== 100 ){
        that.push(
          " <dfn>(",
            delegation_counts_by_agent[ agent_id ][ tags ], "&nbsp;",
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
        // that.push( "<br>" );
      }
    }
    that.push( '</div>' );
  });
  
  // Display filters
  this.push(
    "<br><br><h2>", i18n( "Tags" ), "</h2> - ",
    link_to_page( "tags", "+age", "all(s)" ),
    "<br>"
  );
  
  // Also build a pie chart. An array of [ [@name1, number1], [@2,n2]... ]
  var tags_graph_pie = [ [ "direct", count_direct_votes ] ];
  if( session.can_script && ( l8.server || window.google ) ){
    this.push( '<div id="tags_chart_div" style="height:300px"></div>' );
  }else{
    this.push( "<br><br>" );
  }

  all_tag_ids = all_tag_ids.sort( function( a, b ){
    var count_a = count_delegations_by_tags[ a ];
    var count_b = count_delegations_by_tags[ b ];
    return count_b - count_a; // Most referenced first
  });
  
  index = -1;
  about_proposition_reminder = true;
  
  // Display each filter
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
      i18n( "about" ), " ",
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
        " <dfn>(",
          count_delegations_by_tags[ tags ], "&nbsp;",
          ratio,
        "%)</dfn>.<br>"
      );
    }
    
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
        " ",
        link_to_delegation_page( agent_id, tags )
      );
      if( ratio !== 100 ){
        that.push(
          " <dfn>(",
            counts[ agent_id ], "&nbsp;",
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
              emojied( agent_vote.orientation() ),
              '</dfn>'
            );
            // Show proposition once, as a reminder
            if( about_proposition_reminder ){
              about_proposition_reminder = false;
              that.push(
                " <dfn>(", i18n( "about" ), " ",
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
    that.push( '</div>' );
  });
  
  // Display propositions
  this.push.apply( this, buf2 );
  
  // Summary
  if( last_vote ){
    this.push(
      "<br><br><h2>", i18n( "Summary" ), "</h2><br>",
      "<br>", i18n( "propositions" ), " ",   count_propositions, ".",
      "<br>", i18n( "voters" ), " ",         count_personas, ".",
      "<br>", i18n( "votes" ), " ",          count_votes, ".",
      "<br>", i18n( "direct votes" ), " ",   count_direct_votes,
      " ", ratio_direct, "%", ".",
      "<br>", i18n( "indirect votes" ), " ", count_indirect_votes,
      " ", ratio_indirect, "%", ".",
      "<br>", i18n( "delegates" ), " ",      count_agents, ".",
      "<br>", i18n( "tags"), " ",            all_tag_ids.length, ".",
      "<br>", i18n( "since" ), " ",          time_label( last_vote.snaptime ),
      ".<br><br>"
    );
  }
  
  // Inject list of all seen tags, to alter filter when clicked
  this.at_insert( tag_set.insert_index, filter_change_links( tag_set ) );
  
  // Header & footer
  this.unshift(
    about_proposition
    ? page_header(
        link_to_page( "ballot2", about_proposition.label, "ballot" ),
        this.session.has_filter()
        ? link_to_twitter_tags( this.session.delegateable_filter() )
        : _,
        _,
        "delegates"
      )
    : page_header_left( 
      _,
      this.session.has_filter()
      ? link_to_twitter_tags( this.session.delegateable_filter() )
      : _,
      _,
      "delegates"
    )
  );
  this.push(  "<br><br>", page_footer() );

  // Add data for graphics  
  session.can_script && this.push(
    '<script type="text/javascript">'
    //+ '\nvar proposition = ' + proposition.json_value()
    + '\nvar delegates_graph_pie = '    + JSON.stringify( delegates_graph_pie )
    + '\nvar tags_graph_pie = '         + JSON.stringify( tags_graph_pie )
    + '\nvar propositions_graph_pie = ' + JSON.stringify( propositions_graph_pie )
    + '\nvar i18n = {};'
    + '\n' + delegates_graphics + '; delegates_graphics();'
    + '</script>'
  );
  
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
  
  // Sanitize input
  if( twitter_screen_name ){
    twitter_screen_name = twitter_screen_name.replace( /[^A-Za-z_0-9]/g, "" );
  }
  if( alias ){
    alias = alias.replace( /[^A-Za-z_0-9\-\']/g, "" ).trim.substring( 0, 32 );
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
        return session.redirect( "propositions" );
      }
    }
  }
  
  this.set( page_style( "login" ), page_header() );

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
  }
  
  // Query for name
  var auth = "";
  if( session.can_script && config.firebase ){
    auth
    = '\n<br><label>' + i18n( "Twitter authentication" ) + '</label> '
    + '<input type="checkbox" id="checkbox" checked />'
    + '<input type="hidden" name="i3" id="twitter" value="twitter" >';
    // It makes no sense if client is running this "offline"
    if( l8.client && kudo_is_offline() ){
      auth = "";
    }
  }
  this.push(
    
    '\n<form name="login" url="/">',
    '<input type="hidden" name="i" value="login"/>',
    auth,
    '\n<br><br>',
    !auth ? "" : i18n( "or" ) + '<br><br>',
    '<label>', i18n( "Your twitter name" ), '</label><br>',
    '<input type="text" name="i2"',
    ' autofocus',
    // ToDo: should change "required' based on checkbox
    // !auth ? ' required' : "",
    ' placeholder="', i18n( "@your_name" ), '"',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="@?[A-Za-z0-9_]{2,32}"',
    !twitter_screen_name ? "" : ' value="@' + twitter_screen_name + '"',
    '/>',
    '\n<br><br><br><label>', i18n( "An alias" ), '</label><br>',
    '<input type="text" name="i4"',
    ' placeholder="', i18n( "optional" ), '"',
    ' autocorrect="off"',
    ' pattern="[A-Za-z0-9_]{1,32}"',
    !alias ? "" : ' value="' + alias + '"',
    '/>',
    '<br><br><input type="submit" value="Login"/>',
    '</form>\n'
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
  this.push( "\n<br>", page_footer() );

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
// Visitor gets to this page during the twitter login, twice
  
  var session = this.session;
 
  // If redirected...
  var redirected = !!session.pending_twitter_page;
  if( !redirected ){
    session.pending_twitter_page = session.previous_page;
    if( !session.pending_twitter_page.length ){
      session.pending_twitter_page = [ "propositions" ];
    }
  }
  
  // Manages where to go back after login
  var previous_page = session.pending_twitter_page;
  if( redirected ){
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
    }
  }

  this.set( page_style( "twitter" ), page_header() );

  function twitter_redirect( firebase, redirected, previous_page ){
  // Client side
    
    var Firebase = window.Firebase; // require( "firebase" );
    
    if( !Firebase ){
      var retry_count = window.kudo_firebase_retry_count || 0;
      window.kudo_firebase_retry_count = retry_count + 1;
      var retry_delay = 50; // ms
      if( retry_count > 10 * ( 1000 / retry_delay ) ){
        console.warn( "Oops ! cannot load Firebase?" );
        window.kudo_new_location = "?page=login";
        window.location.replace( "?page=login" );
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
    
    if( needs_redirection ){
      console.info( "Firebase. Signout" );
      ref.unauth();
    }
    
    function process_result( auth_data ){
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
        $.ajax({
          url: "?i=authentic/" + username
        });
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
      }else{
        // user is logged out
        console.log( "FIREBASE noauth" );
        if( redirected ){
          console.log( "Firebase, no auth after redirection" );
          if( !before_redirection_result ){
            console.info( "Firebase, no auth, show login" );
            window.kudo_new_location = "?page=login";
            window.location.replace( "?page=login" );
          }  
        }
      }
    }
    
    var before_redirection_result = true;
    ref.onAuth( process_result );
    
    needs_redirection && setTimeout( function(){
      console.log( "Invoke Firebase redirection");
      before_redirection_result = false;
      ref.authWithOAuthRedirect(
        "twitter",
        function( err, auth_data ){
          debugger;
          // Tell server about that
          if( err ){
            console.warn( "Firebase result, auth error", err );
            process_result( null );
          }else{
            console.warn( "Unexpected Firebase result, auth", auth_data );
            process_result( auth_data );
          }
        }
      );
    }, 10 );
    
  } // Client side twitter_redirect()

  // If previous page, there will be a redirect to it, browser initiated
  if( previous_page ){
    previous_page = "?page=" + encode_ref( previous_page.join( " " ) );
  }
  
  // authenticate with Twitter
  var name_msg = Session.current.visitor ? Session.current.visitor.label : "";
  this.push(
    "<br><br><br><h2>", 
    i18n( "login"), " ", "twitter", " ", name_msg, 
    "</h2><br><br>",
    i18n( "Step" ), " ", redirected ? "3 / 4" : "1 / 4", " ...",
    '<br><br>',
    "<script>",
    'console.log( "Firebase twitter redirection, ',
    redirected ? "second phase" : "first phase",
    '" );',
    twitter_redirect,
    '\ntwitter_redirect( ',
      '"', config.firebase, '"', ',',
      redirected, ',',
      // '"', visitor.label, '"', ",",
      '"', previous_page, '"',
    ' );',
    "</script>"
  );
  
  this.push( "\n<br>", page_footer() );
  
} // page_twitter()


/* ---------------------------------------------------------------------------
 *  page propose
 */

function page_propose( page_name ){
  
  var visitor = this.require_visitor();
  if( !visitor )return;

  this.set( page_style( "new proposition" ), page_header() );
  
  var tags = Session.current.delegateable_filter();

  // Query for name and tags
  this.push(
    '\n<form name="prooose" url="/">',
    '<input type="hidden" name="page" value="propose2"/>',
    '<br><label>', i18n( "new proposition" ), '</label><br>',
    '<input type="text" autofocus name="i2"',
    ' pattern="[A-Za-z0-9_]{3,32}"',
    ' autocapitalize="none" autocorrect="off"',
    ' required',
    '/>',
    '<br><br><label>', i18n( "tags" ), '</label><br>',
    '<input type="search" name="i3"',
    ' value="', tags, '"',
    ' pattern="(#?[A-Za-z0-9_]{3,32})( #?[A-Za-z0-9_]{3,32})*"',
    ' required',
    ' title="#tag #tag2 #tag3..."',
    ' autocapitalize="none" autocorrect="off"',
    '"/>',
    '<br><br><button type="submit">' + i18n( "Propose" ) + "</button>",
    '</form>\n'
  );
  
  this.push( "<br>", page_footer() );

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
 

function page_domain( pagename ){
  
  var visitor = this.require_visitor();
  if( !visitor )return;
  
  // Find the proposition associated to the visitor
  var visitor_proposition = visitor.get_topic();
  if( !visitor_proposition ){
    // Oops, there should be such a proposition, it was created when
    // user was first seen
    return this.error(
      i18n( "Missing associated proposition for")
      + " " + link_to_persona_page( visitor )
    );
  }
  
  // Check if this is defined as a domain already
  var is_domain = visitor_proposition.is_tagged( "#domain" );
  if( !is_domain ){
    return this.error(
      i18n( 'Missing "#domain" tag for' )
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
  
  this.set( page_style( "domain"), page_header() );
  
  if( visitor.label.substring( 1 ) !== config.domain ){
    this.push(
      '<br>', i18n( "Domain propositions" ), " ",
      '<h2><a href="?domain=', visitor.label.substring( 1 ),
      '&page=propositions">', 
      visitor.label,
      '</a></h2>',
      '<br><br>'
    );
  }
  
  this.push( "<h3>", i18n( "Twitter domain" ), "</h3> - " );
  if( is_new ){
    this.push(
      '<a href="https://apps.twitter.com/app/new">application</a>'
    );
  }else{
    this.push(
      '<a href="https://apps.twitter.com">application</a>'
    );
  }

  this.push(
    
    '\n<form name="domain" url="/">',
    '<input type="hidden", name="i" value="describe_domain"/>',
    
    '<br><label>', i18n( "Consumer Key" ), '</label><br>',
    '<input type="text", name="i2" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_consumer_key, '" />',
    
    '<br><br><label>', i18n( "Consumer Secret" ), '</label><br>',
    '<input type="text", name="i3" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_consumer_secret, '" />',
    
    '<br><br><label>', i18n( "Access Token" ), '</label><br>',
    '<input type="text", name="i4" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_access_token, '" />',
    
    '<br><br><label>', i18n( "Access Token Secret" ), '</label><br>',
    '<input type="text", name="i5" ',
    ' required',
    ' autocapitalize="none" autocorrect="off" inputmode="verbatim"',
    ' pattern="[A-Za-z0-9_\\-]{10,50}"',
    'value="', domain_description.twitter_access_token_secret, '" />',
    
    '<br><br><label>', i18n( "Public" ), '</label> ',
    '<input type="checkbox" id="checkbox" ',
    domain_description.is_public ? "checked" : "",
    '><input type="hidden" name="i6" id="twitter" value="public" >',
    
    '<br><br><input type="submit" value="', i18n( "Authorize" ), '"/>',
    '</form>\n',
    
    '\n<script>$(function(){',
    '$("#checkbox").click( function(){',
    '$("#twitter").val( $("#checkbox").is( ":checked" ) ? "public" : "private" );',
    '})});</script>'
  );
  
  this.push( "\n<br>", page_footer() );
  
} // page_domain()


/* ---------------------------------------------------------------------------
 *  page index
 */
 
function page_index( pagename ){
  
  var session = this.session;
  var domain  = session.domain;
  
  // Restore some default session value for session configuration
  session.set_visitor( null );
  session.is_slim = false;
  session.set_filter( "all" );
  //session.can_script = "init";
  session.is_app = false;
  session.app_init_done = false;
  session.page_init_done = false;
  session.is_novice = true;
  session.proposition = null;
  session.agent = null;
  session.set_current_page( [""] ); // aka /
  session.set_domain();
  
  // Domains menu
  var domains = Ephemeral.Machine.all;
  var valid_machines = [];
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
  // valid_machines.push( "jhr" );
  if( valid_machines.length > 1 ){
    menu = [];
    menu.push(
      '\n<form name="domain" url="/">',
      '\n<select name="domain" onchange=',
      '"if( this.value !== 0 ){ ',
        //'this.form[0].value = this.value;',
        '$(this.form).submit();',
      '}">'
    );
    if( domain ){
      menu.push(
        '\n<option value="">', domain, '</options>',
        '<option value="main">', i18n( "main" ), '</options>' 
      );
    }else{
      menu.push( '\n<option value="">', i18n( "domain" ), '</options>' );
    }
    valid_machines.forEach( function( label ){
      if( !label )return;
      menu.push( '\n<option value="', label, '">@', label, '</options>' );
    });
    menu.push( '\n</select>' );
    // Provide a submit button unless client was explicit about noscript
    if( session.can_script !== true ){
      menu.push( ' <input type="submit" value="', i18n( "Visit" ), '">' );
    }
    menu.push( '</form>\n' );
    menu = menu.join( "" );
  }
  
  // This is to refresh the index page that manifest.appcache stores
  function reload_if_cached( time_cached ){
    var now = (new Date()).getTime();
    var age = now - time_cached;
    console.log( "Cached. age:", age / 1000, "sec.", age / ( 3600 * 1000), "hours." );
    if( age > 1 * 60 * 1000 ){
      console.info( "Cached, reload" );
      var new_location = "/?page=kudocracy";
      this.kudo_new_location = new_location;
      window.location.replace( new_location );
    }
  }
  
  // The index page has to be stored by the offline manifest.appcache stuff
  var is_manifest_index = false;
  console.log( "url:", session.request.url );
  if( session.request.url === "/" ){
    is_manifest_index = true;
  }
  
  function link_to( page, slim ){
    var r = '<a href="';
    if( domain ){
      r += page + "?domain=" + domain;
      if( slim ){
        r += "&slim=true";
      }
    }else{
      r += page;
      if( slim ){
        r += "?slim=true";
      }
    }
    r += '">' + i18n( slim || page ) + "</a>";
    return r;
  }
  
  var twitter_name = domain || config.firebase || "kudocracy";
  
  this.set(
    '\n<link rel="stylesheet" href="' + config.index_style + '" type="text/css">'
    + '\n<title>'
      + ( is_manifest_index ? "@Kudocracy" : "Kudocracy" ) // manifest.appcache
    + '</title>',
    '\n<script>',reload_if_cached,";reload_if_cached(", l8.now, ');</script>',
    '<img src="http://simpliwiki.com/alpha.gif" type="img/gif" style="position:absolute; top:0; right:0;">',
    '\n<div id="background" class="background"></dziv>',
    '\n<div id="header" class="sw_header">',
      '\n<div class="sw_header_content">',
        '\n<div style="float:left;" class="sw_logo sw_boxed">',
          '\n<div style="float:left;">',
          '<img src="http://simpliwiki.com/yanugred64.png" width="64" height="64" type="image/png" alt="YanUg"/>',
          '</div>',
          '\n<div id="slogan" style="min-height:64px; height:64px;">',
          '<strong>' + link_to_twitter_tags( "#kudocracy", "#kudo<em>c</em>racy" ) + '</strong>',
          '\n<br>', i18n( "virtual democracy" ),
          '\n</div>',
        '</div>',
        '\n<p id="tagline">',
        '<small>',
        '"One of the things our grandchildren will find quaintest about us is that we distinguish the digital from the real, the virtual from the real. In the future, that will become literally impossible." -- William Gibson, nov 4th 2007.',
        '</small>',
        // '<h3>', link_to_twitter_tags( "#democracy #vote #election #LiquidDemocracy #participation" ), '</h3>',
        //'<small><i>a tribute to <a href="http://wikipedia.org">Wikipedia</a></i></small>',
        '\n</span>',
      '\n</div>',
    '\n</div><br><br>',
    '\n<div id="footer" class="sw_footer sw_boxed">',
    menu,
    //'\n <form name="proposition" url="/">\n',
    //'<span style="font-size:1.5em">' + emoji( "agree" ) + ' </span>',
    //'<input type="hidden" name="slim" value="true"/>',
    //'<input type="hidden" name="page" value="propositions"/>',
    //'<input type="search" placeholder="all" name="i1" value="#new"/>',
    //' <input type="submit" value="propositions?"/>',
    //'\n</form>\n',
    '   ', link_to( "propositions" ),
    ' - ', link_to( "login" ),
    l8.client ? "" : ' - ' + link_to( "propositions", "light version" ),
    ' - ', link_to( "help" ),
    '</div>',
    /*
    '\n<br>',
    // Tweet
    '\n<a href="http://twitter.com/intent/tweet?button_hashtag=',
      twitter_name,
      '&text=virteal%20democracy, opensource. ',
      "http://", this.session.host,
      '&hashtags=kudocracy,democracy,opensource,vote" ',
      'class="twitter-hashtag-button" ',
      'data-related="Kudocracy,democracy,opensource" ',
      'lang="', session.lang, '" ',
      '>',
      'Tweet #', twitter_name,
    '</a>',
    // Follow
    '\n <a href="http://twitter.com/', twitter_name, '" ',
      'class="twitter-follow-button" ',
      'data-show-count="true" ',
      'lang="', session.lang, '" ',
      '>',
      'Follow @', twitter_name,
    '</a>',
    */
    '<br><br>',
    // Timeline
    '\n <a class="twitter-timeline" ',
      // 'data-dnt="true"', 
      'href="https://twitter.com/', twitter_name, '" ',
      'data-screen-name="', twitter_name, '" ',
      'data-widget-id="299354291817287681" ',
      'data-show-replies="true" ',
      'data-tweet-limit="20" ',
      'lang="', session.lang, '" ',
      '>',
      'Tweets by @', twitter_name,
    '</a>',
    '\n<script>window.applicationCache.addEventListener( "updateready", ',
      'function(){ ',
        'try{  window.applicationCache.swapCache(); ',
        'console.info( "swap cache has been called" );',
        '}catch(_){};',
      '}, false );',
      l8.client ? "" : '\nif( !navigator.onLine ){ window.location="/offline"; }',
    '\n</script>',
    '\n<script type="text/javascript" src="http://code.jquery.com/jquery-2.1.1.min.js"></script>',
    "\n<script>",
      // Index page renames itself so that 1/ nice url 2/ appcache update on reload
      '\ntry{ ',
      '\n  var kudo_index_url = window.location.href.replace( /\\?.*/g, "" );',
      '\n  history.replaceState( kudo_index_url, "Kudocracy", kudo_index_url );',
      '\n}catch(_){}\n',
      kudo_signal_capabilities,
      "\n$(function(){",
        "window.kudo_ctx = { should_clear_local_storage:",
        session.should_clear_local_storage,
      "};",
      "\nkudo_signal_capabilities();",
    "\n});</script>",
    // Twitter buttons
    l8.client || session.is_offline ? "" :  
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
  if( !this.session.is_novice ){
    this.session.novice_mode();
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
  
  var version_msg = "";
  for( var lang in versions ){
    version_msg += link_to_command(
      "lang " + lang,
      versions[ lang ]
    ) + ".<br>";
  }
  
  var msg = [];
  msg.push(
    "<br>",
    link_to_page( "index" )
  );
  if( this.session.visitor ){
    msg.push(
      " - ",
      link_to_page( "signout", "", i18n( "sign out" ) ),
      " ",
      link_to_page( "signout", "clear", i18n( "& clear" ) ),
      "."
    );
  }
  msg.push(
    "<br><br>",
    version_msg,
    "<br>"
  );
  
  // English version (also the international version at this point)
  if( this.session.lang !== "fr" ){
    msg.push(

      '<h2>How to..?</h2><br>',
      'See the ',
      '<a href="http://github.com/virteal/kudocracy/wiki">wiki</a>',
      ': ',
      '<a href="http://github.com/virteal/kudocracy/wiki/HowTo">HowTo</a>',
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
      '<li>It is <a href="http://github.com/virteal/kudocracy">open source</a>.',
      ' Data are <a href="http://creativecommons.org/licenses/by/4.0/">open too (CC by 4.0)</a>',
      ', <a href="/csv">here</a>.</li>',
      '</ul><br>',
      
      '<h2>Is it available?</h2><br>',
      'Not yet. What is available is this prototype. Depending on ',
      'success ',
      '(<a href="proposition/kudocracy">vote</a> #kudocracy !), ',
      'the prototype will hopefully expand into ',
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
      
      '<h2>Comment faire..?</h2><br>',
      'Voir le ',
      '<a href="http://github.com/virteal/kudocracy/wiki">wiki</a>',
      ': ',
      '<a href="http://github.com/virteal/kudocracy/wiki/CommentFaire">CommentFaire</a>',
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
      ", vous d&eacute;signez qui vote pour vous, sauf &agrave; voter directement.",
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
      '<li>Le logiciel est <a href="http://github.com/virteal/kudocracy">open source</a>.',
      ' Les données sont <a href="http://creativecommons.org/licenses/by/4.0/">libres aussi (CC by 4.0)</a>',
      ', <a href="/csv">i&ccedil;i</a>.</li>',
      '</ul><br>',
      
      '<h2>Est-ce dispo ?</h2><br>',
      'Pas totalement. Ce qui est disponible est ce prototype. ',
      'Selon son succ&eacute;s ',
      '(<a href="proposition/kudocracy">votez</a> #kudocracy !), ',
      'le prototype sera am&eacute;lior&eacute; ',
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
    '\n<a href="http://twitter.com/intent/tweet?button_hashtag=kudocracy',
    '&hashtags=kudocracy,democracy,opensource,LiquidDemocracy',
    '&text=new%20democracy http://' + this.session.host + '"',
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
    '<br>'
  );
  
  this.session.needs_twitter = true;
  
  this.push(
    "<br>",
    "<br>", i18n( "personas"     ), " ", Persona.all._count,
    "<br>", i18n( "propositions" ), " ", Topic.all._count,
    "<br>", i18n( "votes"        ), " ", Vote.all._count,
    "<br>", i18n( "comments"     ), " ", Comment.all._count,
    "<br>", i18n( "delegations"  ), " ", Delegation.all._count,
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
  neutral:  "&#x1f450;==&nbsp;",  // open hands, ==
  // agree:    "&#x1f44d;+1&nbsp;",  // Thumb up, +1
  win:      "&#x1f44d;+",
  // disagree: "&#x1F44e;-1&nbsp;",  // Thumb down, -1
  fail:     "&#x1F44e;-",
  blank:    "&#x270b;?!&nbsp;",   // raised hand, ?!
  protest:  "&#x270a;!!!&nbsp;",  // raised fist, !!!
};


emoji.table_ascii = {
  checked:   "+&nbsp;",
  neutral:   "==&nbsp;",
  // agree:     "+1&nbsp;",
  agree:    '<span class="glyphicon glyphicon-thumbs-up" aria-hidden="true"></span>&nbsp',
  win:       "+",
  // disagree:  "-1&nbsp;",
  disagree: '<span class="glyphicon glyphicon-thumbs-down" aria-hidden="true"></span>&nbsp',
  fail:      "-",
  blank:     "?!&nbsp;",
  protest:   "!!!&nbsp;"
};


function emoji( name, spacer ){
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


emoji.table_better_signal_noise_ratio = {
  // agree: "+1",
  agree:    '<span class="glyphicon glyphicon-thumbs-up" aria-hidden="true"></span>',
  // disagree: "-1",
  disagree: '<span class="glyphicon glyphicon-thumbs-down" aria-hidden="true"></span>',
  win: "+",
  fail: "-"
};


function emojied( text ){
  if( !text )return "";
  // +1 and -1 are better than emoji + "agree" and "disagree", better S/N
  var short = emoji.table_better_signal_noise_ratio[ text ];
  if( short )return short;
  return emoji( text ) + i18n( text );
}


function emojied_result( result ){

  var emojied_text;
  var result_orientation = result.orientation();
  
  if( result_orientation === Vote.agree
  ||  result_orientation === Vote.disagree
  ){
    var total = result.agree() + result.against();
    var percent = 0;
    if( result.win() ){
      percent = Math.round( ( result.agree() / total ) * 100 );
    }else{
      percent = Math.round( ( result.against() / total ) * 100 );
    }
    emojied_text = emojied( result.win() ? "win" : "fail" ) + percent + "%";
  }else{
    emojied_text = emojied( result_orientation ); 
  }
  
  return emojied_text;
}


function proposition_comment( proposition ){
  
  var comment = proposition.get_comment_text();
  var author  = proposition.get_comment_author();
  var full_comment = "";
  if( comment ){
    full_comment += '<h3>' + format_comment( comment ) + '</h3>';
  }
  // Add author, unless it will appear in displayed list of tags
  if( false && author && !proposition.has_tag( "#" + author.id.substring( 1 ) ) ){
    full_comment
    += '<dfn>&nbsp;' + link_to_persona_page( author ) + '</dfn>';
  }
  if( full_comment ){
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


function proposition_summary( proposition, div, avoid_author ){
  
  var buf = new PageBuilder();
  
  var result = proposition.result;
  var agree   = result.agree();
  var against = result.against();
  var blank   = result.blank();
  var protest = result.protest();
  var total   = result.total();
  
  function cond_push( label, n, style ){
    if( n ){
      if( style ){
        buf.push( '<' );
        buf.push( style );
        buf.push( '>' );
      }
      buf.push( i18n( label ) );
      buf.push( '&nbsp;', n );
      if( n !== total ){
        var ratio = Math.round( 1000 * ( n / total ) ) / 10;
        if( style ){
          buf.push( "&nbsp;", ratio, "%" );
        }else{
          buf.push( "&nbsp;<dfn>", ratio, "%</dfn>" );
        }
      }
      buf.push( ". " );
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
      '<div><h2>', i18n( "Summary" ),
      ' <em>', emojied_result( result ), '</em>',
      //+ ( comment ? '<br>' + format_comment( comment.text ) : "" )
      '</h2> ',
      link_to_wiki( wiki, "wiki" ),
      '<br><br>'
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
        full_comment += '<br><h3>' + format_comment( comment ) + '</h3>';
      }
      if( author ){
        full_comment
        += '<dfn>&nbsp;-&nbsp;' + link_to_persona_page( author ) + '</dfn>';
      }
      if( full_comment ){
        buf.push(
          full_comment, ' ' ,
          link_to_wiki( wiki )
        );
      }else{
        buf.push( link_to_wiki( wiki, "wiki" ) );
      }
    }
    buf.push( "<br><em>" + emojied_result( result ) + "</em>. " );
  }
  
  if( total > 1 ){
    cond_push( 'agree',   agree   );
    cond_push( 'against', against );
    cond_push( 'blank',   blank   );
    cond_push( '<br>' );
    cond_push( 'protest', protest, 'em' );
    if( result.total() && result.direct() != result.total() ){
      var ratio_direct
      = Math.round( 1000 * ( result.direct() / total ) ) / 10;
      var ratio_indirect
      = Math.round( 1000 * ( ( total - result.direct() ) / total ) ) / 10;
      buf.push(
        "<br>total ", result.total(),
        ' <dfn>(direct&nbsp;',
        result.direct(),
        "&nbsp;",
        ratio_direct,
        '%&nbsp;',
        'indirect&nbsp;',
        result.total() - result.direct(),
        "&nbsp;",
        ratio_indirect,
        '%)</dfn>. '
      );
    }else if( total != agree && total != against && total != blank ){
      cond_push( 'total', result.total() );
    }
    
  }
  
  if( div ){
    buf.push(
      '<br><dfn>',
      i18n( "change" ), '&nbsp;', result.count(), ' ',
      time_label( result.time_touched ),
      '</dfn>'
    );
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
    var href = "http://simpliwiki.com/kudocracy/"; // ToDo: configure this
    text = text
    .replace( wiki_names, '$1<a class="wiki" href="' + href + '$2">$2</a>')

  // Fix some rare issue with nested links, remove them
  text = text.replace( /(<a [^>\n]+?)<a [^\n]+?>([^<\n]+?)<\/a>/g, '$1$2')
  
  return text;
}


// ---------------------------------------------------------------------------


function format_comment( comment, no_truncate ){
// SimpliWiki style formating + i18n

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
  
  return Wiki.wikify( comment );
  
}


function i18n( x ){
  return Session.current.i18n( x );
}


function i18n_comment( x ){
  return Session.current.i18n_comment( x );
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

  var session = this.session;
  var proposition = Topic.find( proposition_name );
  if( !proposition )return this.redirect( "propositions" );
  proposition.check();
  
  var buf = this;
  session.proposition = proposition;
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
  if( !is_tag && Topic.find( tag_label ) ){
    is_tag = true;
  }
  
  this.set(
    page_style( proposition.label ),
    page_header(
      link_to_page( "delegates", proposition.label, "delegates" )
      + " " + link_to_page( "ballot2", proposition.label, "ballot" ),
      link_to_twitter_filter( tag_label ),
      _,
      "proposition"
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

  // Proposition's name & twitter tweet button
  buf.push(
    '<h2>', (is_tag ? "Tag " : "#" ),
    i18n( proposition.label ),
    '</h2>',
    !proposition.is_persona()
    ? ""
    : ( ' <dfn>'
      + link_to_persona_page( proposition.get_persona() )
      + "</dfn>"
    ),
    ' <a href="http://twitter.com/share" class="twitter-share-button"',
    ' data-url="http://',
    session.host,
    "/proposition/",
    proposition.label.replace( "#", "%23" ),
    '" data-count="horizontal',
    '">tweet</a>',
    '<br>'
  );
  
  // Comment?
  var comment = proposition.get_comment_text();
  var author  = proposition.get_comment_author();
  // Don't display author twice
  if( author === proposition.get_persona() ){
    author = null;
  }
  if( comment ){
    buf.push(
      '<h3>',
      format_comment( comment ),
      '</h3>'
    );
  }
  if( author ){
    buf.push(
      ' <dfn>&nbsp;-&nbsp;',
      link_to_persona_page( author ),
      '</dfn>'
    );
  }
  if( author || comment ){
    // buf.push( "<br>" );
  }

  // Pie graph
  if( session.can_script && proposition.result.total() ){
    buf.push( '<div id="orientation_chart_div" style="height:300px"></div>' );
  }
  
  // Twitter tweet button, if proposition and no visitor (else use vote_menu())
  if( false && !is_tag && !session.visitor ){
    buf.push( '<a href="http://twitter.com/intent/tweet?button_hashtag='
      + label
      + '&hashtags=kudocracy,vote,'
      + proposition.tags_string( this.session.visitor, this.session.with_abuses )
      .replace( / /g, "," ).replace( /#/g, "" )
      + '&text=new%20democracy" '
      + 'class="twitter-hashtag-button" '
      + 'data-related="Kudocracy,vote">Tweet ' + label + '</a>'
    );
  }

  // Votes
  // buf.push( '<br><h2>Votes</h2><br>' );

  // Vote menu
  buf.push_vote_menu( proposition, { with_twitter: true, nofocus: true } );

  // Balance time serie graph
  if( session.can_script ){
    buf.push( '<div id="balance_chart_div" style="height:100px"></div>' );
  }
  
  // Picture of other who voted
  var recommendations = proposition_recommendations({
    proposition: proposition,
    persona: session.visitor,
    count: 30 // 960px
  });
  if( recommendations.length ){
    buf.push( "<div>" );
    Ephemeral.each( recommendations, function( vote ){
      buf.push( link_to_persona_page( 
        vote.persona,
        '<img src="http://avatars.io/twitter/'
        + vote.persona.label.substring( 1 )
        + '" height="32" width="32">'
      ));
    });
    buf.push( "</div>" );
  }

  // Summary
  buf.push( '<br>', proposition_summary( proposition, "div" ), '<br>' );

  // Last vote (last direct one preferably)
  var votes_log = proposition.votes_log();
  if( votes_log.length ){
    var last_vote_value = votes_log[ votes_log.length -1 ];
    var last_direct_vote = null;
    var ii = votes_log.length;
    while( ii-- > 0 ){
      if( !votes_log[ ii ].agent_label ){
        last_direct_vote = votes_log[ ii ];
        break;
      }
    }
    if( last_direct_vote
    // && last_vote_value.agent_label === last_direct_vote.persona
    ){
      last_vote_value = last_direct_vote;
    }
    buf.push( i18n( "last vote" ), " ", time_label( last_vote_value.snaptime ) );
    var last_vote_entity = Vote.valid( last_vote_value.entity );
    var last_vote_persona = Persona.valid( last_vote_entity && last_vote_entity.persona );
    if( last_vote_entity
    &&  last_vote_persona
    ){
      buf.push( ' <em>', emojied( last_vote_entity.orientation() ), '</em>' );
      buf.push( ' ', link_to_persona_page( last_vote_persona ) );
      if( last_vote_value.agent_label ){
        buf.push(
          ' <dfn>(',
          link_to_delegation_page( last_vote_entity ),
          ')</dfn>'
        );
      }
    }
  }

  if( tmp = proposition.source() ){
    if( tmp.indexOf( "://" ) !== -1 ){
      tmp = '<a href="' + tmp + '">' + tmp + '</a>';
    }
    buf.push( "<br>source ", tmp, " " );
    if( tmp = proposition.persona() ){
      buf.push( i18n( "by"), " ", link_to_page( "persona", tmp.name, tmp.label ) );
    }
  }
  // Display link to tagged propositions
  if( proposition.propositions().length ){
    if( is_tag ){
      buf.push( 
        "<br>", i18n( "propositions" ), " ",
        proposition.propositions().length,
        " - ",
        link_to_page(
          "propositions",
          tag_label,
          i18n( "details" )
        ),
        "<br>"
      );
    // Some proposition are tags too, when a "#" prefix is added
    }else if( Topic.find( tag_label ) ){
      buf.push( 
        "<br>", i18n( "proposition" ), " ",
        Topic.find( tag_label ).propositions().length,
        " - ",
        link_to_page(
          "propositions",
          tag_label,
          i18n( "details" )
        ),
        "<br>"
      );
    }
  }

  // buf.push( "<br>", i18n( "since" ), " ", time_label( proposition.timestamp ) );
  //buf.push( "<br>age " + duration_label( proposition.age() ) );
  //buf.push( "<br>", i18n( "change" ), " ", time_label( proposition.time_touched ) );
  
  // End in...
  if( proposition.half_life() ){
    buf.push( "<br>",
      i18n( "end in" ), " ", duration_label( proposition.expire() - Kudo.now() )
    );
  }
  
  if( comment.indexOf( "..." ) !== -1 ){
    buf.push(
      '<div class="comment">',
      format_comment( comment, true /* no trunctate */ ),
      '</div>'
    )
  }
  
  buf.push( "<br>")

  // Tags, List of tags, with link to propositions
  var tmp = proposition.filter_string( persona, true /* only delegateable */ );
  // trace( "Tags: " + tmp );
  if( true || tmp || this.session.visitor ){
    buf.push(
      '<br><h2>', i18n( "Tags"), '</h2> - ',
      link_to_page( "tags", "+age", "all(s)" )
    );
    buf.push( filter_label_div( tmp, "propositions" ) );
    
    // Add tagging form, not for banned users
    if( this.session.visitor
    && !this.session.visitor.is_abuse()
    && proposition.author_is( this.session.visitor )
    ){
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
    &&  proposition.author_is( this.session.visitor )
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
  
  // Add list of comments for all tags, including computed ones
  tmp = proposition.filter_string( persona, false /* all tags, not just delegateable tags */ );
  buf.push( '\n<div id="filter_label">' );
  tmp.split( " " ).forEach( function( tag ){
    if( !tag )return;
    var tag_topic = Topic.find( tag );
    var count = " ";
    if( tag_topic ){
      var c = tag_topic.propositions().length;
      if( c > 1 ){
        count = '<dfn>(' + c + ')</dfn> ';
      }
    }
    buf.push(
      link_to_page( "propositions", tag, i18n( tag ) ),
      count
    );
    var persona = tag_topic && tag_topic.get_persona();
    if( persona ){
      buf.push( link_to_persona_page( persona ), " " );
    }
    var comment = Topic.reserved_comment( tag );
    if( comment ){
      if( comment[0] === "@" ){
        comment = link_to_page( "persona", comment );
      }else{
        comment = i18n( comment );
      }
      buf.push( " - ", comment + '<br>' );
    }else if( comment 
      = ( tag_topic && Comment.valid( tag_topic.comment() ) )
    ){
      buf.push( ' - ' + format_comment( comment.text ) + '<br>' );
    }else{
      buf.push( '<br>' );
    }
  });
  buf.push( '\n</div>\n' );

  // Top agents, actually inserted later
  var insert_index_delegates = buf.length;
  buf.push( "" );
  
  // Voters, actually inserted later
  var insert_index_voters = buf.length;
  buf.push( "" );

  // Log
  var votes = proposition.votes_log();
  buf.push( '<br><div><h2>', i18n( "Log" ), '</h2><br>' );
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
  
  var div = [
    '<div class="even">',
    '<div class="odd">'
  ];
  
  var div_index = -1;
  votes.forEach( function( vote_value, index ){
    
    if( !vote_value )return;
    
    // Compute balance agree/against
    var was        = vote_value.previous_orientation;
    var now        = vote_value.orientation;
    
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
      }else if( was === "disagree" || was === "protest" ){
        balance++;
      }
      
      if( now === "agree" ){
        balance++;
      }else if( now === "disagree" || now === "protest" ){
        balance--;
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
      div_index++;
      buf.push( div[ div_index % 2 ] );
      var orientation = emojied( now );
      if( vote_value.previous_orientation !== Vote.neutral
      && was !== now
      ){
        orientation = emojied( was ) + " -> " + orientation;
      }
      var persona_text = "";
      persona_text = link_to_page( "persona", vote_value.persona_label );
      if( vote_value.delegation !== Vote.direct ){
        persona_text += ' <dfn>('
        + link_to_delegation_page( valid_vote || vote_value.agent_label )
        + ')</dfn>';
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
        ' ',
        persona_text,
        ' ', orientation,
        " <small><dfn>",
        time_label( vote_value.snaptime ).replace( / /g, "&nbsp;" ),
        "</dfn></small>"
      );
      var comment = vote_value.comment_text;
      if( comment ){
        if( !seen_comments[ comment ] ){
          seen_comments[ comment ] = true;
          buf.push(
            '<br><div class="comment">',
              format_comment( comment, true /* no truncate */ ),
            '</div>'
          );
        }
      }
      buf.push( "</div>" );
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

  div_index = -1;
  all_personas.forEach( function( persona_id ){
    var persona = Persona.find( persona_id );
    if( !persona )return;
    var vote = Vote.find( persona_id + "." + proposition.id );
    if( !vote )return;
    var orientation =  vote.orientation();
    if( orientation === Vote.neutral )return;
    div_index++;
    buf_voters.push(
      div[ div_index % 2 ],
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
          ' <dfn>(',
          link_to_delegation_page( vote ),
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
    buf_voters.push( "</div>" );
  });

  buf_voters.push( "<br>" );
  buf.at_insert( insert_index_voters, buf_voters.join( "" ) );
  
  // Insert list of top 10 major agents
  var delegates_pie = [ [ 'direct', count_direct_votes ] ];
  if( count_indirect_votes ){

    var abuf = [];
    abuf.push(
      "<br><br><h2>",
      i18n( "Delegates" ),
      "</h2>",
      " - ",
      link_to_page( "delegates", proposition.label, "details" ),
      "<br><br>"
    );

    // pie
    if( Session.current.can_script ){
      abuf.push( '<div id="delegates_chart_div" style="height:300px"></div>' );
    }
    
    // Delegates sections
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
    var index = -1;

    for( var ii = 0 ; ii < len ; ii++ ){
      agent_id = all_agents[ ii ];
      var vote = Vote.find( agent_id + "." + proposition.id );
      if( !vote )continue;
      var c = count_by_agent[ agent_id ];
      other_count -= c;
      index++;
      if( count_shown < 10 ){
        count_shown++;
        abuf.push(
          div[ index % 2 ],
          i18n( "via" ), " ",
          '<h3>', link_to_persona_page( agent_id ), '</h3>'
        );
        ratio = Math.round( 1000 * ( 
          c / count_indirect_votes
        ) ) / 10;
        if( ratio !== 100 ){
          abuf.push(
            " <dfn>(",
            c,
            "&nbsp;",
            ratio,
            "%)</dfn>."
          );
        }
        abuf.push(
          " ",
          emojied( vote.orientation() ),
          "</div>"
        );
        delegates_pie.push( [ Persona.find( agent_id ).label, c ] );
      }
    }
    if( other_count ){
      if( other_count < 0 )debugger;
      delegates_pie.push( [ i18n( "other" ), other_count ] );
    }
    buf.at_insert( insert_index_delegates, abuf.join( "" ) );
  }
  
  buf.push( "</div><br>", page_footer() );

  // Add data for graphics
  Session.current.can_script && buf.push(
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

// List of commands. A kind of router. The basic http server knows how to
// to invoke these commands. See ui1http.js
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
  if( !vote_entity ){
    if( !vote_id ){
      printnl( "Vote not found" );
      return;
    }
    vote_entity = Vote.find( vote_id );
  }else if( typeof vote_entity === "string" ){
    vote_id = vote_entity;
    vote_entity = Vote.find( vote_entity );
    if( !vote_entity && !vote_id ){
      printnl( "No vote" );
      return;
    }
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
    Session.current.inject( "Vote", {
      persona:     persona,
      proposition: proposition,
      orientation: ( orientation || _ ),
      duration:    duration
    });
    printnl( "New vote of " + persona + " on " + proposition );
    //redirect( "proposition%20" + proposition.label );

  // Or a change to an existing vote
  }else{
    if( duration || orientation ){
      // Adjust duration to make a renew
      if( duration ){
        duration += vote_entity.age();
      }
      Session.current.inject( "Vote", {
        id_key:      vote_entity.id,
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
      Session.current.inject( "Comment", {
        vote: vote_entity,
        text: comment
      });
      printnl( "Comment changed " + pretty( vote_entity ) );
      // If change to comment only, go to page about proposition
      if( !duration && !orientation ){
        Session.current.redirect( "proposition " + vote_entity.proposition.label );
      }
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
    // This will turn into @name pseudo name
    args.unshift( "twitter" );
  }
  
  // Sanitize name
  var name = args[0];
  name = ( name || "" ).trim().replace( /[^A-Za-z0-9_]/g, "" );
  if( name[0] !== "@" ){ name = "@" + name };
  if( name.length < 3 )return;

  var authentication = args[1];
  
  // Collect & sanitize name, turn spaces into _
  var alias = slice( args, 2 ).join( "_" );
  alias = ( alias || "" )
  .trim().replace( /[^A-Za-z0-9\-\'_]/g, "" ).substring( 0, 32 );

  if( l8.client )console.warn( "Login", name, authentication, alias );
  
  // If twitter login, redirect to page_twitter()
  if( authentication === "twitter" ){
    // Set where visitor should lang after login is done
    if( session.current_page[0] === "login" ){
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
  var persona_topic_id = "#" + persona.label.substring( 1 );
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
  var vote_id = persona.label + ".#" + persona.label.substring( 1 );
  var vote_entity = Vote.find( vote_id );
  if( !vote_entity ){
    session.inject( "Vote", {
      persona: persona,
      proposition: persona_topic,
      orientation: Vote.agree
    });
  }
    
  // Change alias if needed
  if( !alias ){
    alias = session.pending_alias;
  }
  session.pending_alias = "";
  
  // Set new comment for persona, ie the alias
  if( alias ){
    alias = "@" + alias.replace( / /g, "_" );
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
      text = alias + " " + ( old_text || i18n( "alias" ) );
    }
    if( text && text !== old_text ){
      session.inject( "Comment", {
        vote: vote_entity,
        text: text
      });
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
  
  trace( "Twitter authentication:", auth_name );
  session.set_visitor( visitor, "authentic" );
  
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
  if( !proposition.is_tagged( "#domain" ) ){
    printnl( 'Missing "#domain" tag for', visitor.label );
    return;
  }
  
  var data = proposition.get_data( "domain" ) || set();
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
  })
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
  var agent_name = text
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
  
  // Only author can tag. ToDo: improve on that
  if( !proposition.author_is( visitor ) ){
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
  
  // Only author can tag. ToDo: improve on that
  if( !proposition.author_is( visitor ) ){
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
        return;
      }
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
        Session.current.inject( "Topic", {
          label:   tag,
          persona: visitor
        } );
      });
      changes.push( function(){
        tag_entities.push( Topic.find( tag ) );
      })
    }
  });

  // Redirect visitor to proposition's page once done
  Session.current.redirect( "proposition " + proposition_name );
  
  // Creation of topic or update with addition of tags
  if( !proposition ){
    // Don't create proposition and tags at the same time, too risky
    if( count_new > 1 ){
      printnl( "Cannot create both proposition & tags at the same time" );
      return;
    }
    changes.push( function(){
      Session.current.inject( "Topic", {
        label:   text,
        tags:    tag_entities,
        persona: visitor
      } );
    } );
  }else{
    // Exit if no valid tags
    if( !tag_entities.length ){
      return;
    }
    changes.push( function(){
      Session.current.inject( "Tagging", {
        proposition: proposition,
        tags:        tag_entities,
        persona:     visitor
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
  var is_tagging   = ( name === "Tag"      || name === i18n( "b-Tag"      ) );
  var is_detagging = ( name === "Untag"    || name === i18n( "b-Untag"    ) );
  var is_search    = ( name === "Search"   || name === i18n( "b-Search"   ) );
  var is_query     = ( name === "Query"    || name === i18n( "b-Query"    ) );
  var is_delegate  = ( name === "Delegate" || name === i18n( "b-Delegate" ) );
  
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
      var i18 = i18n( "b-Search" ) + " ";
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
        if( domain !== "undefined" && domain !== session.domain ){
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
  
  // Look for some query parameters. json for example
  function get_query_parameter( p ){
    var idx_p = query.indexOf( p + "=" );
    if( idx_p === -1 )return "";
    var buf = query.substring( idx_p + p.length + 1 );
    var idx_end = buf.indexOf( ";" );
    if( idx_end === -1 )return buf;
    return buf.substring( 0, idx_end );
  }
  var jsonp = get_query_parameter( "jsonp" );

  // Extract entities of specified type
  var entities = [];
  var type = "";
  function test( a_type ){
    if( str_starts_with( url, "/api/" + a_type ) ){
      type = a_type;
    }
    return type;
  }
  test( "Session") ||
  test( "Topic" ) ||
  test( "Proposition") ||
  test( "Persona" ) ||
  test( "Vote") ||
  test( "Comment" ) ||
  test( "Delegation");
  if( type ){
    if( type === "Session" ){
      // It's alive!
      if( session.can_script !== true ){
        session.can_script = true;
      }
      if( session.visitor ){
        entities.push( session.visitor.json_value() );
      }
    }else{
      var type_name = type;
      Ephemeral.each( Kudo[ type_name ].all, function( entity ){
        entities.push( entity.json_value() );
      });
    }
  }
  
  // Response is json
  var json_result = JSON.stringify( entities );
  
  // Wrap with jsonp if provided
  if( jsonp ){
    json_result = jsonp + "(" + json_result + ");"
  }
  
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
  var buf = [
    "user,",
    "proposition,",
    "orientation,",
    "tags,",
    "delegation",
    "\r\n"
  ];
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
  return buf.join( "" );
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
  var http_server = require( "./ui1http.js" );
  // The basic http server understands commands, see http_repl_commands.
  Ui1Server = http_server.start(
    kudo_scope,
    config,
    http_repl_commands,
    port,
    host
  );
  Ui1Server.get_kudo_scope   = get_kudo_scope;
  Ui1Server.set_config       = set_config;
  Ui1Server.get_config       = get_config;
  Ui1Server.login            = local_login;
  Ui1Server.set_login_secret = set_login_secret;
  Ui1Server.ui1twit = function( p, t ){
    MonitoredPersona = kudo_scope.MonitoredPersona = p;
    TwitterUser      = kudo_scope.TwitterUser = t;
  }
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
          + i18n( "Back online" ) + ". " + i18n( "Stay offline?" )
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